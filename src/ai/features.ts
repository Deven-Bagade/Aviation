import featureConfig from "./featureConfig.json";
import { Telemetry } from "../types";

export const FEATURE_KEYS = featureConfig.features.map((f) => f.key);

export function buildFeatureVector(t: Telemetry): number[] {
  return featureConfig.features.map(({ key, min, max }) => {
    const v = (t as any)[key] as number;
    return Math.max(0, Math.min(1, (v - min) / (max - min)));
  });
}

const LABELS: Record<string, string> = {
  rpm: "RPM",
  cht: "Cylinder Head Temp",
  egt: "Exhaust Gas Temp",
  oilPressure: "Oil Pressure",
  oilTemperature: "Oil Temperature",
  fuelFlow: "Fuel Flow",
  vibration: "Vibration",
  batteryVoltage: "Battery Voltage",
  alternatorCurrent: "Alternator Current",
  throttle: "Throttle"
};

export function featureLabel(key: string): string {
  return LABELS[key] || key;
}