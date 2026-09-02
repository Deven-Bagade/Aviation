import * as tf from "@tensorflow/tfjs";
import faultLabels from "./faultLabels.json";
import { buildFeatureVector, FEATURE_KEYS } from "./features";
import { AnomalyResult, FaultPrediction, RulEstimate } from "./types";
import { DegradationState, Telemetry } from "../types";

const MODEL_BASE = "/models/ai";

let anomalyModel: tf.LayersModel | null = null;
let anomalyMeta: { threshold: number } | null = null;
let classifierModel: tf.LayersModel | null = null;
let rulModel: tf.LayersModel | null = null;
let rulMeta: { scale: number } | null = null;

let loaded = false;
let loadAttempted = false;

export async function loadAIModels(): Promise<boolean> {
  if (loadAttempted) return loaded;
  loadAttempted = true;

  try {
    const [ae, aeMeta, clf, rul, rulM] = await Promise.all([
      tf.loadLayersModel(`${MODEL_BASE}/anomaly/model.json`),
      fetch(`${MODEL_BASE}/anomaly/meta.json`).then((r) => r.json()),
      tf.loadLayersModel(`${MODEL_BASE}/classifier/model.json`),
      tf.loadLayersModel(`${MODEL_BASE}/rul/model.json`),
      fetch(`${MODEL_BASE}/rul/meta.json`).then((r) => r.json())
    ]);

    anomalyModel = ae;
    anomalyMeta = aeMeta;
    classifierModel = clf;
    rulModel = rul;
    rulMeta = rulM;
    loaded = true;
    return true;
  } catch (err) {
    console.warn("AI models not available, falling back to rule-based analytics:", err);
    loaded = false;
    return false;
  }
}

export function runAnomalyDetection(t: Telemetry): AnomalyResult | null {
  if (!anomalyModel || !anomalyMeta) return null;

  const features = buildFeatureVector(t);
  const input = tf.tensor2d([features]);
  const recon = anomalyModel.predict(input) as tf.Tensor;

  const reconArr = Array.from(recon.dataSync());
  const perFeatureError = FEATURE_KEYS.map((key, i) => ({
    key,
    error: Math.pow(features[i] - reconArr[i], 2)
  }));

  const score = perFeatureError.reduce((s, f) => s + f.error, 0) / perFeatureError.length;
  const normalizedScore = Math.min(2, score / (anomalyMeta.threshold || 1e-6));

  input.dispose();
  recon.dispose();

  return {
    score,
    normalizedScore,
    isAnomalous: score > anomalyMeta.threshold,
    perFeatureError: perFeatureError.sort((a, b) => b.error - a.error)
  };
}

export function runFaultClassification(t: Telemetry): FaultPrediction | null {
  if (!classifierModel) return null;

  const features = buildFeatureVector(t);
  const input = tf.tensor2d([features]);
  const output = classifierModel.predict(input) as tf.Tensor;
  const probs = Array.from(output.dataSync());

  input.dispose();
  output.dispose();

  const distribution = faultLabels
    .map((label, i) => ({ label, probability: probs[i] }))
    .sort((a, b) => b.probability - a.probability);

  return { label: distribution[0].label, confidence: distribution[0].probability, distribution };
}

// Occlusion-based feature attribution for the classifier: how much does clamping
// each feature to a neutral value drop the predicted class's probability.
export function runFaultAttribution(t: Telemetry): { key: string; contribution: number }[] | null {
  if (!classifierModel) return null;

  const base = buildFeatureVector(t);
  const baseInput = tf.tensor2d([base]);
  const baseOut = classifierModel.predict(baseInput) as tf.Tensor;
  const baseProbs = Array.from(baseOut.dataSync());
  const predictedClass = baseProbs.indexOf(Math.max(...baseProbs));
  baseInput.dispose();
  baseOut.dispose();

  const contributions = FEATURE_KEYS.map((key, i) => {
    const occluded = [...base];
    occluded[i] = 0.5;
    const occInput = tf.tensor2d([occluded]);
    const occOut = classifierModel!.predict(occInput) as tf.Tensor;
    const occProbs = Array.from(occOut.dataSync());
    occInput.dispose();
    occOut.dispose();

    return { key, contribution: Math.max(0, baseProbs[predictedClass] - occProbs[predictedClass]) };
  });

  const total = contributions.reduce((s, c) => s + c.contribution, 0) || 1;
  return contributions
    .map((c) => ({ ...c, contribution: c.contribution / total }))
    .sort((a, b) => b.contribution - a.contribution);
}

export function runRulEstimation(t: Telemetry, degradation: DegradationState): RulEstimate | null {
  if (!rulModel || !rulMeta) return null;

  const features = buildFeatureVector(t);
  const input = tf.tensor2d([[...features, degradation.overallDegradation / 100]]);
  const output = rulModel.predict(input) as tf.Tensor;
  const normalized = output.dataSync()[0];

  input.dispose();
  output.dispose();

  const mlHours = Math.max(0, normalized * rulMeta.scale);
  const physicsHours = Math.min(5000, Math.min(...degradation.subsystems.map((s) => s.estimatedHoursRemaining)));

  return { mlHours, physicsHours, blendedHours: (mlHours + physicsHours) / 2 };
}