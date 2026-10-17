import { useEffect, useMemo, useRef, useState } from "react";

import { Telemetry, DegradationState } from "../types";
import { AIInsight, RulEstimate, FaultPrediction } from "./types";

import { loadRulXgbModel, runRulEstimationXgb } from "./rulXgb";
import { loadClassifierXgbModel, runFaultClassificationXgb } from "./classifierXgb";

import {
  loadAIModels,
  runAnomalyDetection,
  runFaultClassification,
  runFaultAttribution,
  runRulEstimation
} from "./models";

import { analyzeTrends } from "./trend";
import { explainAnomaly, explainFault } from "./explain";
import { buildRecommendation } from "./maintenance";

import {
  createInitialDegradationState,
  updateDegradation
} from "../simulation/degradation";

/*
 * ============================================================
 * useAIInsight
 * ...
 * ========================================================== */

export function useAIInsight(
  telemetry: Telemetry,
  history: Telemetry[]
): AIInsight {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [rulXgbLoaded, setRulXgbLoaded] = useState(false);
  const [xgbRul, setXgbRul] = useState<RulEstimate | null>(null);

  // XGBoost fault classifier (ONNX) — same async-load, prefer-once-ready
  // pattern used above for the XGBoost RUL model.
  const [classifierXgbLoaded, setClassifierXgbLoaded] = useState(false);
  const [xgbFault, setXgbFault] = useState<FaultPrediction | null>(null);

  const degradationRef = useRef<DegradationState>(
    createInitialDegradationState()
  );

  const lastTimestampRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadAIModels().then((ok) => {
      if (!cancelled) setModelsLoaded(ok);
    });

    loadRulXgbModel().then((ok) => {
      if (!cancelled) setRulXgbLoaded(ok);
    });

    loadClassifierXgbModel().then((ok) => {
      if (!cancelled) setClassifierXgbLoaded(ok);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const dtSeconds =
      lastTimestampRef.current !== null
        ? (telemetry.timestamp - lastTimestampRef.current) / 1000
        : 0;

    lastTimestampRef.current = telemetry.timestamp;

    degradationRef.current = updateDegradation(
      degradationRef.current,
      telemetry,
      dtSeconds
    );
  }, [telemetry]);

  // The XGBoost/ONNX RUL model runs async (onnxruntime-web's session.run
  // returns a Promise), so its result can't be computed inside the useMemo
  // below like the TF.js models are. Run it here and stash the result in
  // state; the memo just reads whatever's latest.
  useEffect(() => {
    if (!rulXgbLoaded) return;

    let cancelled = false;

    runRulEstimationXgb(telemetry, degradationRef.current).then((estimate) => {
      if (!cancelled) setXgbRul(estimate);
    });

    return () => {
      cancelled = true;
    };
  }, [rulXgbLoaded, telemetry]);

  // Same async pattern for the XGBoost fault classifier.
  useEffect(() => {
    if (!classifierXgbLoaded) return;

    let cancelled = false;

    runFaultClassificationXgb(telemetry).then((prediction) => {
      if (!cancelled) setXgbFault(prediction);
    });

    return () => {
      cancelled = true;
    };
  }, [classifierXgbLoaded, telemetry]);

  return useMemo<AIInsight>(() => {
    const trends = analyzeTrends(history);

    if (!modelsLoaded) {
      return {
        modelsLoaded: false,
        aiDegraded: false,
        anomaly: null,
        faultPrediction: null,
        trends,
        rul: null,
        explanation: null,
        recommendation: buildRecommendation(null, null, null, trends, false)
      };
    }

    const anomaly = runAnomalyDetection(telemetry);

    // Prefer the XGBoost classifier once it's loaded and has produced a
    // result for this telemetry reading; fall back to the TF.js classifier
    // otherwise (e.g. still loading, or ONNX load/inference failed).
    const faultPrediction =
      classifierXgbLoaded && xgbFault
        ? xgbFault
        : runFaultClassification(telemetry);

    // Feature attribution still runs against the TF.js classifier — it's a
    // synchronous occlusion analysis over classifierModel's own predict()
    // calls, so it stays paired with the TF.js model regardless of which
    // classifier's prediction is displayed.
    const attribution = runFaultAttribution(telemetry);

    // Prefer the XGBoost RUL estimate once it's loaded and has produced a
    // result for this telemetry reading; fall back to the TF.js model
    // otherwise (e.g. still loading, or ONNX load/inference failed).
    const rul =
      rulXgbLoaded && xgbRul
        ? xgbRul
        : runRulEstimation(telemetry, degradationRef.current);

    const aiDegraded = anomaly === null && faultPrediction === null;

    const explanation =
      faultPrediction && faultPrediction.label !== "NONE"
        ? explainFault(faultPrediction, attribution)
        : anomaly
          ? explainAnomaly(anomaly)
          : null;

    const recommendation = buildRecommendation(anomaly, faultPrediction, rul, trends, aiDegraded);

    return {
      modelsLoaded: true,
      aiDegraded,
      anomaly,
      faultPrediction,
      trends,
      rul,
      explanation,
      recommendation
    };
  }, [
    modelsLoaded,
    rulXgbLoaded,
    xgbRul,
    classifierXgbLoaded,
    xgbFault,
    telemetry,
    history
  ]);
}