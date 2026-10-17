import featureConfig from "./featureConfig.json";
import { Telemetry } from "../types";
import { computePhysicsResiduals } from "./physicsResidual";

export const FEATURE_KEYS = featureConfig.features.map((f) => f.key);

export function buildFeatureVector(t: Telemetry): number[] {
  const enriched = { ...t, ...computePhysicsResiduals(t) };

  return featureConfig.features.map(({ key, min, max }) => {
    const v = (enriched as any)[key] as number;
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
  throttle: "Throttle",
  chtResidual: "CHT vs Physics Model",
  egtResidual: "EGT vs Physics Model",
  oilPressureResidual: "Oil Pressure vs Physics Model",
  oilTemperatureResidual: "Oil Temp vs Physics Model",
  vibrationResidual: "Vibration vs Physics Model",
  fuelFlowResidual: "Fuel Flow vs Physics Model"
};

export function featureLabel(key: string): string {
  return LABELS[key] || key;
}