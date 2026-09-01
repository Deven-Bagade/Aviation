export type EngineState =
  | "OFF"
  | "STARTING"
  | "RUNNING"
  | "STOPPING";

export type EngineMode =
  | "IDLE"
  | "CRUISE"
  | "HIGH LOAD";

export type FaultType =
  | "HIGH_TEMP"
  | "LOW_OIL"
  | "HIGH_VIBRATION"
  | "ELECTRICAL"
  | "FUEL_SYSTEM"
  | "ABNORMAL_RPM"
  | "COOLING_FAULT"
  | "INJECTOR_FAULT"
  | "SENSOR_FAULT"
  | null;

export type Telemetry = {
  timestamp: number;

  rpm: number;

  cht: number;
  egt: number;

  oilPressure: number;
  oilTemperature: number;

  fuelFlow: number;
  vibration: number;

  batteryVoltage: number;
  alternatorCurrent: number;

  injectionTiming: number;

  ambientTemperature: number;
  altitude: number;

  throttle: number;

  engineState: EngineState;
  mode: EngineMode;

  fault: FaultType;
};

export type Health = {
  ehi: number;

  state:
    | "NORMAL"
    | "WARNING"
    | "DEGRADED"
    | "CRITICAL";

  faults: string[];
  explanations: string[];

  rulHours: number;
  degradation: number;
};

/*
 * ==========================================================
 * MANUAL / SIMULATION CONTROL
 * ==========================================================
 */

export type ManualField =
  | "rpm"
  | "cht"
  | "egt"
  | "oilPressure"
  | "oilTemperature"
  | "fuelFlow"
  | "vibration"
  | "altitude"
  | "ambientTemperature";

export type EngineCommand =
  | { type: "START" }
  | { type: "STOP" }
  | { type: "SET_THROTTLE"; value: number }
  | { type: "SET_MODE"; value: EngineMode }
  | { type: "INJECT_FAULT"; fault: Exclude<FaultType, null> }
  | { type: "CLEAR_FAULT" }
  | { type: "SET_MANUAL_OVERRIDE"; field: ManualField; enabled: boolean; value: number }
  | { type: "CLEAR_ALL_OVERRIDES" };

/*
 * ==========================================================
 * DEGRADATION / PREDICTED FAILURE
 * ==========================================================
 */

export type SubsystemKey =
  | "THERMAL_COOLING"
  | "LUBRICATION"
  | "MECHANICAL_VIBRATION"
  | "FUEL_INJECTION"
  | "ELECTRICAL_IGNITION"
  | "SENSORS";

export type SubsystemStatusLevel =
  | "NORMAL"
  | "WATCH"
  | "WARNING"
  | "CRITICAL";

export type SubsystemStatus = {
  key: SubsystemKey;
  label: string;
  score: number;                 // 0-100, instantaneous health from current telemetry
  degradation: number;           // 0-100, accumulated wear over the session
  wearRatePerHour: number;       // smoothed current wear rate, %/hour
  estimatedHoursRemaining: number;
  status: SubsystemStatusLevel;
};

export type PredictedFailure = {
  subsystem: SubsystemKey;
  label: string;
  severity: Exclude<SubsystemStatusLevel, "NORMAL">;
  description: string;
  recommendation: string;
  estimatedHoursRemaining: number;
};

export type DegradationState = {
  runningHours: number;
  overallDegradation: number;
  subsystems: SubsystemStatus[];
  predictedFailures: PredictedFailure[];
};