export type AnomalyResult = {
  score: number;
  normalizedScore: number;
  isAnomalous: boolean;
  perFeatureError: { key: string; error: number }[];
};

export type FaultPrediction = {
  label: string;
  confidence: number;
  distribution: { label: string; probability: number }[];
};

export type TrendPoint = {
  key: string;
  label: string;
  slopePerMinute: number;
  direction: "RISING" | "FALLING" | "STABLE";
  volatility: number;
};

export type RulEstimate = {
  mlHours: number;
  physicsHours: number;
  blendedHours: number;
};

export type Explanation = {
  summary: string;
  topFactors: { key: string; label: string; contribution: number }[];
};

export type AIInsight = {
  modelsLoaded: boolean;
  anomaly: AnomalyResult | null;
  faultPrediction: FaultPrediction | null;
  trends: TrendPoint[];
  rul: RulEstimate | null;
  explanation: Explanation | null;
  recommendation: string | null;
};