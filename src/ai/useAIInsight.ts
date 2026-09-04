import { useEffect, useMemo, useRef, useState } from "react";

import { Telemetry, DegradationState } from "../types";
import { AIInsight } from "./types";

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
 *
 * This hook is the missing piece connecting the AI pipeline
 * (ai/models.ts, ai/trend.ts, ai/explain.ts, ai/maintenance.ts)
 * to the rest of the app. None of those modules were previously
 * invoked anywhere, so AIInsightPanel had no data source.
 *
 * Responsibilities:
 * 1. Load the TF.js models once (falls back gracefully to
 *    rule-based/trend-only analytics if they aren't present).
 * 2. Advance a local DegradationState in lockstep with telemetry
 *    so the RUL model has the "hours run" context it needs.
 * 3. Recompute anomaly detection, fault classification/
 *    attribution, trend analysis, RUL estimation, an
 *    explanation, and a maintenance recommendation whenever new
 *    telemetry arrives.
 * ========================================================== */

export function useAIInsight(
  telemetry: Telemetry,
  history: Telemetry[]
): AIInsight {
  const [modelsLoaded, setModelsLoaded] = useState(false);

  const degradationRef = useRef<DegradationState>(
    createInitialDegradationState()
  );

  const lastTimestampRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadAIModels().then((ok) => {
      if (!cancelled) {
        setModelsLoaded(ok);
      }
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

  return useMemo<AIInsight>(() => {
    const trends = analyzeTrends(history);

    if (!modelsLoaded) {
      return {
        modelsLoaded: false,
        anomaly: null,
        faultPrediction: null,
        trends,
        rul: null,
        explanation: null,
        recommendation: buildRecommendation(null, null, null, trends)
      };
    }

    const anomaly = runAnomalyDetection(telemetry);
    const faultPrediction = runFaultClassification(telemetry);
    const attribution = runFaultAttribution(telemetry);
    const rul = runRulEstimation(telemetry, degradationRef.current);

    const explanation =
      faultPrediction && faultPrediction.label !== "NONE"
        ? explainFault(faultPrediction, attribution)
        : anomaly
          ? explainAnomaly(anomaly)
          : null;

    const recommendation = buildRecommendation(
      anomaly,
      faultPrediction,
      rul,
      trends
    );

    return {
      modelsLoaded: true,
      anomaly,
      faultPrediction,
      trends,
      rul,
      explanation,
      recommendation
    };
  }, [modelsLoaded, telemetry, history]);
}