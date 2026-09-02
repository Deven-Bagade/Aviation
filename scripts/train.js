const fs = require("fs");
const path = require("path");
const tf = require("@tensorflow/tfjs");

const featureConfig = require("../src/ai/featureConfig.json");
const faultLabels = require("../src/ai/faultLabels.json");

const DATA_PATH = path.join(__dirname, "..", "datasets", "telemetry_train.json");
const OUT_DIR = path.join(__dirname, "..", "public", "models", "ai");

const NUM_FEATURES = featureConfig.features.length;
const NUM_CLASSES = faultLabels.length;

/**
 * Manually writes a tfjs Layers-model directory (model.json + weights.bin)
 * without depending on @tensorflow/tfjs-node's tf.io.fileSystem, which
 * requires native bindings.
 */
async function saveModelToDisk(model, dir) {
  fs.mkdirSync(dir, { recursive: true });

  let savedArtifacts;
  await model.save(
    tf.io.withSaveHandler(async (artifacts) => {
      savedArtifacts = artifacts;
      return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: "JSON" } };
    })
  );

  const modelJson = {
    modelTopology: savedArtifacts.modelTopology,
    format: savedArtifacts.format || "layers-model",
    generatedBy: savedArtifacts.generatedBy || "TensorFlow.js",
    convertedBy: null,
    weightsManifest: [{ paths: ["weights.bin"], weights: savedArtifacts.weightSpecs }]
  };

  fs.writeFileSync(path.join(dir, "model.json"), JSON.stringify(modelJson));
  fs.writeFileSync(path.join(dir, "weights.bin"), Buffer.from(savedArtifacts.weightData));
}

async function main() {
  await tf.setBackend("cpu");
  await tf.ready();
  console.log("Backend:", tf.getBackend());

  const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  console.log(`Loaded ${raw.length} samples`);

  for (let i = raw.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [raw[i], raw[j]] = [raw[j], raw[i]];
  }

  const splitAt = Math.floor(raw.length * 0.85);
  const trainSet = raw.slice(0, splitAt);
  const valSet = raw.slice(splitAt);

  /* ===== ANOMALY DETECTOR (autoencoder, nominal-only) ===== */

  const nominalTrain = trainSet.filter((s) => s.isNominal);
  const xTrainAE = tf.tensor2d(nominalTrain.map((s) => s.features));

  const autoencoder = tf.sequential({
    layers: [
      tf.layers.dense({ inputShape: [NUM_FEATURES], units: 16, activation: "relu" }),
      tf.layers.dense({ units: 6, activation: "relu" }),
      tf.layers.dense({ units: 16, activation: "relu" }),
      tf.layers.dense({ units: NUM_FEATURES, activation: "sigmoid" })
    ]
  });
  autoencoder.compile({ optimizer: tf.train.adam(0.001), loss: "meanSquaredError" });

  console.log("Training anomaly detector...");
  await autoencoder.fit(xTrainAE, xTrainAE, {
    epochs: 25, batchSize: 64, validationSplit: 0.1, verbose: 0,
    callbacks: { onEpochEnd: (e, l) => console.log(`  AE epoch ${e + 1}: loss=${l.loss.toFixed(5)}`) }
  });

  const reconTrain = autoencoder.predict(xTrainAE);
  const errTensor = tf.mean(tf.square(tf.sub(xTrainAE, reconTrain)), 1);
  const errArray = Array.from(await errTensor.data()).sort((a, b) => a - b);
  const threshold = errArray[Math.floor(errArray.length * 0.95)];
  console.log(`Anomaly threshold: ${threshold}`);

  await saveModelToDisk(autoencoder, path.join(OUT_DIR, "anomaly"));
  fs.writeFileSync(
    path.join(OUT_DIR, "anomaly", "meta.json"),
    JSON.stringify({ threshold, features: featureConfig.features.map((f) => f.key) })
  );

  /* ===== FAULT CLASSIFIER ===== */

  const xTrain = tf.tensor2d(trainSet.map((s) => s.features));
  const yTrain = tf.oneHot(tf.tensor1d(trainSet.map((s) => s.faultIndex), "int32"), NUM_CLASSES);
  const xVal = tf.tensor2d(valSet.map((s) => s.features));
  const yVal = tf.oneHot(tf.tensor1d(valSet.map((s) => s.faultIndex), "int32"), NUM_CLASSES);

  const classifier = tf.sequential({
    layers: [
      tf.layers.dense({ inputShape: [NUM_FEATURES], units: 24, activation: "relu" }),
      tf.layers.dense({ units: 16, activation: "relu" }),
      tf.layers.dense({ units: NUM_CLASSES, activation: "softmax" })
    ]
  });
  classifier.compile({ optimizer: tf.train.adam(0.001), loss: "categoricalCrossentropy", metrics: ["accuracy"] });

  console.log("Training fault classifier...");
  await classifier.fit(xTrain, yTrain, {
    epochs: 30, batchSize: 64, validationData: [xVal, yVal], verbose: 0,
    callbacks: { onEpochEnd: (e, l) => console.log(`  CLF epoch ${e + 1}: acc=${l.acc?.toFixed(3)} val_acc=${l.val_acc?.toFixed(3)}`) }
  });

  await saveModelToDisk(classifier, path.join(OUT_DIR, "classifier"));
  fs.writeFileSync(
    path.join(OUT_DIR, "classifier", "meta.json"),
    JSON.stringify({ labels: faultLabels, features: featureConfig.features.map((f) => f.key) })
  );

  /* ===== RUL REGRESSOR ===== */

  const RUL_SCALE = 5000;
  const xTrainRul = tf.tensor2d(trainSet.map((s) => [...s.features, s.degradation / 100]));
  const yTrainRul = tf.tensor2d(trainSet.map((s) => [s.rulHours / RUL_SCALE]));
  const xValRul = tf.tensor2d(valSet.map((s) => [...s.features, s.degradation / 100]));
  const yValRul = tf.tensor2d(valSet.map((s) => [s.rulHours / RUL_SCALE]));

  const rulModel = tf.sequential({
    layers: [
      tf.layers.dense({ inputShape: [NUM_FEATURES + 1], units: 24, activation: "relu" }),
      tf.layers.dense({ units: 12, activation: "relu" }),
      tf.layers.dense({ units: 1, activation: "sigmoid" })
    ]
  });
  rulModel.compile({ optimizer: tf.train.adam(0.001), loss: "meanSquaredError" });

  console.log("Training RUL estimator...");
  await rulModel.fit(xTrainRul, yTrainRul, {
    epochs: 30, batchSize: 64, validationData: [xValRul, yValRul], verbose: 0,
    callbacks: { onEpochEnd: (e, l) => console.log(`  RUL epoch ${e + 1}: loss=${l.loss.toFixed(5)}`) }
  });

  await saveModelToDisk(rulModel, path.join(OUT_DIR, "rul"));
  fs.writeFileSync(
    path.join(OUT_DIR, "rul", "meta.json"),
    JSON.stringify({ scale: RUL_SCALE, features: [...featureConfig.features.map((f) => f.key), "degradation"] })
  );

  console.log("All models trained and saved to", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});