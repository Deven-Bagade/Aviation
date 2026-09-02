import { AIInsight } from "../../ai/types";

type Props = { insight: AIInsight };

export default function AIInsightPanel({ insight }: Props) {
  if (!insight.modelsLoaded) {
    return (
      <div className="panel ai-panel">
        <div className="panel-title">
          <span>AI / ML ANALYTICS</span>
          <span>MODELS NOT LOADED</span>
        </div>
        <div className="all-good">
          Trained models not found under <code>public/models/ai</code>. Run{" "}
          <code>npm run ai:dataset && npm run ai:train</code>, then reload.
        </div>
      </div>
    );
  }

  return (
    <div className="panel ai-panel">
      <div className="panel-title">
        <span>AI / ML ANALYTICS</span>
        <span className={insight.anomaly?.isAnomalous ? "health-pill critical" : "health-pill normal"}>
          {insight.anomaly?.isAnomalous ? "ANOMALY" : "NOMINAL"}
        </span>
      </div>

      <div className="ai-grid">
        <div className="ai-card">
          <div className="ai-card-title">Anomaly Detection</div>
          <div className="ai-metric">
            {insight.anomaly ? insight.anomaly.normalizedScore.toFixed(2) : "--"}
            <small> x threshold</small>
          </div>
        </div>

        <div className="ai-card">
          <div className="ai-card-title">Fault Classification</div>
          <div className="ai-metric">
            {insight.faultPrediction ? insight.faultPrediction.label : "--"}
            <small>{insight.faultPrediction ? ` ${(insight.faultPrediction.confidence * 100).toFixed(0)}%` : ""}</small>
          </div>
        </div>

        <div className="ai-card">
          <div className="ai-card-title">RUL Estimate (ML)</div>
          <div className="ai-metric">
            {insight.rul ? insight.rul.blendedHours.toFixed(0) : "--"}
            <small> h</small>
          </div>
        </div>
      </div>

      <div className="ai-trends">
        {insight.trends.filter((t) => t.direction !== "STABLE").slice(0, 4).map((t) => (
          <div className="ai-trend-row" key={t.key}>
            <span>{t.label}</span>
            <span className={`trend-arrow ${t.direction.toLowerCase()}`}>
              {t.direction === "RISING" ? "↑" : "↓"} {Math.abs(t.slopePerMinute).toFixed(1)}/min
            </span>
          </div>
        ))}
        {insight.trends.every((t) => t.direction === "STABLE") && (
          <div className="all-good">All monitored parameters stable.</div>
        )}
      </div>

      {insight.explanation && (
        <div className="ai-explanation">
          <b>Why:</b> {insight.explanation.summary}
        </div>
      )}

      {insight.recommendation && (
        <div className="recommendation">
          <b>AI maintenance recommendation</b>
          <p>{insight.recommendation}</p>
        </div>
      )}
    </div>
  );
}