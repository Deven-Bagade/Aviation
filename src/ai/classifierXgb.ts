// src/ai/classifierXgb.ts
//
// Runs the XGBoost fault classifier (converted to ONNX) client-side, the
// same way rulXgb.ts runs the XGBoost RUL model — see that file for the
// original pattern this is copied from. Drop this file into src/ai/, then
// wire it in per the integration notes (useAIInsight.ts).

import * as ort from "onnxruntime-web";
import { buildFeatureVector } from "./features";
import { FaultPrediction } from "./types";
import { Telemetry } from "../types";

const MODEL_URL = "/models/ai/classifier_xgb/model.onnx";
const META_URL = "/models/ai/classifier_xgb/meta.json";

let session: ort.InferenceSession | null = null;
let ioNames: { input: string; probabilities: string } | null = null;
let labels: string[] | null = null;
let loadPromise: Promise<boolean> | null = null;

ort.env.wasm.wasmPaths = "/ort/";
ort.env.wasm.numThreads = 1;

export function loadClassifierXgbModel(): Promise<boolean> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const [sess, meta] = await Promise.all([
        ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"] }),
        fetch(META_URL, { cache: "no-store" }).then((r) => r.json())
      ]);
      session = sess;
      ioNames = { input: meta.input_name, probabilities: meta.probability_output_name };
      labels = meta.labels;
      return true;
    } catch (err) {
      console.warn("Fault classifier XGBoost (ONNX) model failed to load:", err);
      return false;
    }
  })();

  return loadPromise;
}

export async function runFaultClassificationXgb(t: Telemetry): Promise<FaultPrediction | null> {
  if (!session || !ioNames || !labels) return null;

  const features = buildFeatureVector(t); // 16 normalized values, featureConfig.json order
  if (features.some((v) => !Number.isFinite(v))) return null;

  const inputData = Float32Array.from(features);
  const tensor = new ort.Tensor("float32", inputData, [1, inputData.length]);

  const results = await session.run({ [ioNames.input]: tensor });
  const probs = Array.from(results[ioNames.probabilities].data as Float32Array);

  if (probs.some((v) => !Number.isFinite(v))) {
    console.warn("[AI] XGBoost fault classification skipped: model produced non-finite output.");
    return null;
  }

  const distribution = labels
    .map((label, i) => ({ label, probability: probs[i] }))
    .sort((a, b) => b.probability - a.probability);

  return { label: distribution[0].label, confidence: distribution[0].probability, distribution };
}