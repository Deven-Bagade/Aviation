import { Telemetry } from "../types";
import { FEATURE_KEYS, featureLabel } from "./features";
import { TrendPoint } from "./types";

const WINDOW = 40;

function linregSlope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const xs = ys.map((_, i) => i);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function stdev(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const mean = ys.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(ys.reduce((s, y) => s + (y - mean) ** 2, 0) / n);
}

export function analyzeTrends(history: Telemetry[]): TrendPoint[] {
  const recent = history.slice(-WINDOW);
  if (recent.length < 5) return [];

  const samplesPerMinute =
    recent.length > 1
      ? 60000 / ((recent[recent.length - 1].timestamp - recent[0].timestamp) / (recent.length - 1) || 200)
      : 1;

  return FEATURE_KEYS.map((key) => {
    const values = recent.map((t) => (t as any)[key] as number);
    const slopePerMinute = linregSlope(values) * samplesPerMinute;
    const volatility = stdev(values);
    const threshold = Math.max(0.5, volatility * 0.1);

    let direction: TrendPoint["direction"] = "STABLE";
    if (slopePerMinute > threshold) direction = "RISING";
    else if (slopePerMinute < -threshold) direction = "FALLING";

    return { key, label: featureLabel(key), slopePerMinute, direction, volatility };
  });
}