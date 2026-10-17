// src/ai/rulXgb.ts
//
// Runs the XGBoost RUL model (converted to ONNX) client-side, the same way
// models.ts loads the TF.js anomaly/classifier/rul models. Drop this file
// into src/ai/, then wire it in per the integration notes.

import * as ort from "onnxruntime-web";
import { buildFeatureVector } from "./features";
import { RulEstimate } from "./types";
import { DegradationState, Telemetry } from "../types";

const MODEL_URL = "/models/ai/rul_xgb/model.onnx";
const META_URL = "/models/ai/rul_xgb/meta.json";

let session: ort.InferenceSession | null = null;
let ioNames: { input: string; output: string } | null = null;
let loadPromise: Promise<boolean> | null = null;
ort.env.wasm.wasmPaths = "/ort/";
ort.env.wasm.numThreads = 1;
export function loadRulXgbModel(): Promise<boolean> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const [sess, meta] = await Promise.all([
        ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"] }),
        fetch(META_URL, { cache: "no-store" }).then((r) => r.json())
      ]);
      session = sess;
      ioNames = { input: meta.input_name, output: meta.output_name };
      return true;
    } catch (err) {
      console.warn("RUL XGBoost (ONNX) model failed to load:", err);
      return false;
    }
  })();

  return loadPromise;
}

export async function runRulEstimationXgb(
  t: Telemetry,
  degradation: DegradationState
): Promise<RulEstimate | null> {
  if (!session || !ioNames) return null;

  const features = buildFeatureVector(t); // 16 normalized values, featureConfig.json order
  if (features.some((v) => !Number.isFinite(v)) || !Number.isFinite(degradation.overallDegradation)) {
    return null;
  }

  // CAUTION - unverified: the Python training script's exact preprocessing
  // for "degradation" wasn't included in the uploaded results, so we don't
  // know for certain whether it was fed in as raw 0-100 or divided by 100
  // like the existing TF.js model (see src/ai/models.ts runRulEstimation).
  // This defaults to raw 0-100. Validate against a few known samples
  // (see integration notes) and flip to `/ 100` if predictions look off by
  // ~100x or are saturated.
  const degradationValue = degradation.overallDegradation;

  const inputData = Float32Array.from([...features, degradationValue]);
  const tensor = new ort.Tensor("float32", inputData, [1, inputData.length]);

  const results = await session.run({ [ioNames.input]: tensor });
  const rawOutput = results[ioNames.output].data as Float32Array;

  // XGBoost was trained to predict RUL hours directly - no *scale needed
  // (unlike the TF.js model, which outputs a 0-1 value multiplied by 5000).
  const mlHours = Math.max(0, rawOutput[0]);

  const physicsHours = Math.min(
    5000,
    Math.min(...degradation.subsystems.map((s) => s.estimatedHoursRemaining))
  );

  return { mlHours, physicsHours, blendedHours: (mlHours + physicsHours) / 2 };
}