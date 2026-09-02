import { AnomalyResult, FaultPrediction, RulEstimate, TrendPoint } from "./types";

export function buildRecommendation(
  anomaly: AnomalyResult | null,
  faultPrediction: FaultPrediction | null,
  rul: RulEstimate | null,
  trends: TrendPoint[]
): string {
  if (!anomaly && !faultPrediction) {
    return "AI models not loaded — showing rule-based analytics only.";
  }

  if (faultPrediction && faultPrediction.label !== "NONE" && faultPrediction.confidence > 0.5) {
    const eta = rul ? ` Estimated ${rul.blendedHours.toFixed(0)} hours to potential failure if the trend continues.` : "";
    return `AI recommends inspecting the subsystem associated with ${faultPrediction.label} (confidence ${(faultPrediction.confidence * 100).toFixed(0)}%).${eta}`;
  }

  if (anomaly?.isAnomalous) {
    return "AI detected a telemetry pattern outside learned nominal behaviour but could not confidently classify a specific fault — recommend closer monitoring and manual review.";
  }

  if (trends.filter((t) => t.direction === "RISING").length >= 3) {
    return "Multiple parameters trending upward simultaneously — monitor for early-stage degradation even though no fault is currently flagged.";
  }

  return "AI analytics show nominal operation with no anomaly or fault pattern detected.";
}