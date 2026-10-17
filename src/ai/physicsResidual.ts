import { Telemetry } from "../types";

/**
 * PHYSICS-INFORMED RESIDUAL FEATURES
 * ============================================================
 * residual = actual_sensor_value - physics_expected_value
 * ============================================================
 */

export type PhysicsResiduals = {
  chtResidual: number;
  egtResidual: number;
  oilPressureResidual: number;
  oilTemperatureResidual: number;
  vibrationResidual: number;
  fuelFlowResidual: number;
};

export const nominalCht = (throttle: number) => 88 + 115 * throttle;
export const nominalEgt = (throttle: number) => 420 + 400 * throttle;
export const nominalOilTemperature = (throttle: number) => 58 + 55 * throttle;
export const nominalOilPressure = (throttle: number) => 2.0 + 3.0 * throttle;
export const nominalVibration = (throttle: number) => 0.8 + 1.1 * throttle;
export const nominalFuelFlow = (throttle: number) => 6 + 20 * throttle;

const ZERO: PhysicsResiduals = {
  chtResidual: 0, egtResidual: 0, oilPressureResidual: 0,
  oilTemperatureResidual: 0, vibrationResidual: 0, fuelFlowResidual: 0
};

export function computePhysicsResiduals(t: Telemetry): PhysicsResiduals {
  if (t.engineState !== "RUNNING") return ZERO;

  const throttle = Math.max(0, Math.min(1, t.throttle));

  return {
    chtResidual: t.cht - nominalCht(throttle),
    egtResidual: t.egt - nominalEgt(throttle),
    oilPressureResidual: t.oilPressure - nominalOilPressure(throttle),
    oilTemperatureResidual: t.oilTemperature - nominalOilTemperature(throttle),
    vibrationResidual: t.vibration - nominalVibration(throttle),
    fuelFlowResidual: t.fuelFlow - nominalFuelFlow(throttle)
  };
}