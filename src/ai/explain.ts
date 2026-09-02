import { AnomalyResult, Explanation, FaultPrediction } from "./types";
import { featureLabel } from "./features";

export function explainAnomaly(anomaly: AnomalyResult): Explanation {
  const top = anomaly.perFeatureError.slice(0, 3);
  const total = anomaly.perFeatureError.reduce((s, f) => s + f.error, 0) || 1;
  const topFactors = top.map((f) => ({ key: f.key, label: featureLabel(f.key), contribution: f.error / total }));

  const summary = anomaly.isAnomalous
    ? `Anomaly score ${anomaly.normalizedScore.toFixed(2)}x the learned-normal threshold — driven mainly by ${topFactors
        .map((f) => `${f.label} (${(f.contribution * 100).toFixed(0)}%)`)
        .join(", ")} deviating from the pattern learned on nominal operation.`
    : "Current telemetry pattern is consistent with learned nominal operation.";

  return { summary, topFactors };
}

export function explainFault(
  prediction: FaultPrediction,
  attribution: { key: string; contribution: number }[] | null
): Explanation {
  const secondBest = prediction.distribution[1];

  const summary =
    prediction.label === "NONE"
      ? "No fault pattern currently recognized above confidence threshold."
      : `Classified as ${prediction.label} with ${(prediction.confidence * 100).toFixed(0)}% confidence` +
        (secondBest && secondBest.probability > 0.15
          ? `, next most likely ${secondBest.label} (${(secondBest.probability * 100).toFixed(0)}%).`
          : ".") +
        (attribution && attribution.length
          ? ` Most influential readings: ${attribution.slice(0, 3).map((a) => featureLabel(a.key)).join(", ")}.`
          : "");

  const topFactors =
    attribution && attribution.length
      ? attribution.slice(0, 3).map((a) => ({ key: a.key, label: featureLabel(a.key), contribution: a.contribution }))
      : prediction.distribution.slice(0, 3).map((d) => ({ key: d.label, label: d.label, contribution: d.probability }));

  return { summary, topFactors };
}