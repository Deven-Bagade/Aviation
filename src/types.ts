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

  /* Physics-model outputs */
  airDensity?: number;
  airMassFlow?: number;
  fuelMassFlow?: number;
  brakePower?: number;
  brakeTorque?: number;
  loadFraction?: number;
  bsfc?: number;
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
  | {
      type: "SET_MANUAL_OVERRIDE";
      field: ManualField;
      enabled: boolean;
      value: number;
    }
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
  score: number;
  degradation: number;
  wearRatePerHour: number;
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

/*
 * ==========================================================
 * PHYSICS MODEL
 * ==========================================================
 */

export type AtmosphereState = {
  altitude: number;
  temperatureK: number;
  pressurePa: number;
  densityKgM3: number;
};

export type ThermodynamicInput = {
  rpm: number;
  throttle: number;
  altitude: number;
  ambientTemperature: number;

  engineRunning?: boolean;

  degradationFactor?: number;

  coolingEfficiency?: number;
  injectorEfficiency?: number;
  ignitionEfficiency?: number;
};

export type ThermodynamicState = {
  atmosphere: AtmosphereState;

  volumetricEfficiency: number;

  airMassFlowKgS: number;
  fuelMassFlowKgS: number;

  combustionPowerKW: number;
  brakePowerKW: number;
  brakeTorqueNm: number;

  loadFraction: number;

  chtC: number;
  egtC: number;
  oilTemperatureC: number;
  oilPressureBar: number;

  fuelFlowLph: number;
  bsfcGPerKWh: number;

  injectionTimingDeg: number;
};

/*
 * ==========================================================
 * PERFORMANCE MAPS
 * ==========================================================
 */

export type PerformancePoint = {
  rpm: number;
  value: number;
};

export type PerformanceCurve = {
  name: string;
  unit: string;
  points: PerformancePoint[];
};

export type AltitudePowerPoint = {
  altitude: number;
  powerKW: number;
};

export type LoadTemperaturePoint = {
  loadFraction: number;
  egtC: number;
};

export type PerformanceMaps = {
  rpmPower: PerformanceCurve;
  rpmTorque: PerformanceCurve;
  rpmFuelFlow: PerformanceCurve;
  altitudePower: AltitudePowerPoint[];
  loadEgt: LoadTemperaturePoint[];
  bsfc: PerformanceCurve;
};

/*
 * ==========================================================
 * MISSIONS
 * ==========================================================
 */

export type MissionStageName =
  | "TAKEOFF"
  | "CLIMB"
  | "CRUISE"
  | "LOITER"
  | "HIGH_LOAD"
  | "DESCENT"
  | "LANDING";

export type MissionStage = {
  id: string;
  name: MissionStageName;
  label: string;

  durationSeconds: number;

  throttle: number;

  altitudeStartM: number;
  altitudeEndM: number;

  targetRpm?: number;

  description: string;
};

export type MissionProfile = {
  id: string;
  name: string;
  description: string;

  stages: MissionStage[];

  totalDurationSeconds: number;
};

export type MissionRuntimeState = {
  missionId: string | null;
  running: boolean;
  paused: boolean;

  elapsedSeconds: number;

  stageIndex: number;
  stageElapsedSeconds: number;

  completed: boolean;

  startedAt: number | null;
};

export type MissionEvent = {
  timestamp: number;
  missionId: string;
  stageId: string;
  stageName: MissionStageName;

  elapsedSeconds: number;

  type:
    | "MISSION_STARTED"
    | "STAGE_STARTED"
    | "STAGE_COMPLETED"
    | "MISSION_COMPLETED"
    | "MISSION_PAUSED"
    | "MISSION_RESUMED"
    | "MISSION_STOPPED";
};

/*
 * ==========================================================
 * HISTORICAL DATABASE
 * ==========================================================
 */

export type TelemetryRecord = Telemetry & {
  missionId?: string | null;
  missionStage?: MissionStageName | null;
};

export type FaultRecord = {
  id?: number;

  timestamp: number;

  fault: Exclude<FaultType, null>;

  severity: "WARNING" | "CRITICAL";

  source: "SIMULATION" | "MODEL" | "RULE";

  missionId?: string | null;

  acknowledged?: boolean;
};

export type MaintenanceRecord = {
  id?: number;

  timestamp: number;

  action: string;

  subsystem?: SubsystemKey;

  notes?: string;

  missionId?: string | null;
};

export type HistoricalMission = {
  id: string;

  name: string;

  startedAt: number;

  endedAt?: number;

  durationSeconds?: number;

  status:
    | "RUNNING"
    | "COMPLETED"
    | "ABORTED";

  profileId?: string;
};

export type HistoricalSnapshot = {
  timestamp: number;

  telemetryCount: number;

  faultCount: number;

  maintenanceCount: number;
};

/*
 * ==========================================================
 * POST-FLIGHT ANALYSIS
 * ==========================================================
 */

export type MissionStatistics = {
  durationSeconds: number;

  averageRpm: number;
  maxRpm: number;

  averageCht: number;
  maxCht: number;

  averageEgt: number;
  maxEgt: number;

  averageOilTemperature: number;
  maxOilTemperature: number;

  averageOilPressure: number;
  minimumOilPressure: number;

  averageFuelFlow: number;
  totalFuelLiters: number;

  averageVibration: number;
  maxVibration: number;

  averageAltitude: number;
  maximumAltitude: number;

  averageThrottle: number;

  averagePowerKW: number;
  maximumPowerKW: number;

  averageLoadFraction: number;

  averageBsfc: number;
};

export type MissionStageStatistics = {
  stageId: string;
  stageName: MissionStageName;

  durationSeconds: number;

  averageRpm: number;
  maxRpm: number;

  averageCht: number;
  maxCht: number;

  averageEgt: number;
  maxEgt: number;

  averageFuelFlow: number;

  averagePowerKW: number;
};

export type PostFlightReport = {
  mission: HistoricalMission;

  statistics: MissionStatistics;

  stageStatistics: MissionStageStatistics[];

  faults: FaultRecord[];

  maintenance: MaintenanceRecord[];

  finalHealth: Health | null;

  finalDegradation: DegradationState | null;

  findings: string[];

  recommendations: string[];

  generatedAt: number;
};