import {
  EngineCommand,
  EngineMode,
  EngineState,
  FaultType,
  ManualField,
  Telemetry
} from "../types";

import {
  ENGINE_CALIBRATION,
  simulateThermodynamics
} from "./thermodynamics";

/*
 * ============================================================
 * TELEMETRY ENGINE
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Maintain engine operating state
 * 2. Process engine commands
 * 3. Generate physics-based telemetry
 * 4. Apply thermal / mechanical lag
 * 5. Apply controlled fault effects
 * 6. Support manual environmental overrides
 * 7. Notify subscribers of telemetry updates
 *
 * Architecture:
 *
 * Command
 *    ↓
 * Engine State
 *    ↓
 * Physics Model
 *    ↓
 * Thermal / Dynamic Response
 *    ↓
 * Telemetry
 *
 * MissionEngine uses executeCommand()
 * rather than directly modifying engine state.
 */

/* ============================================================
 * TYPES
 * ========================================================== */

type TelemetryListener =
  (telemetry: Telemetry) => void;

type Overrides = Partial<Record<ManualField, number>>;

/* ============================================================
 * CONSTANTS
 * ========================================================== */

const UPDATE_INTERVAL_MS = 100;

const DEFAULT_ALTITUDE_M = 2500;

const DEFAULT_AMBIENT_TEMPERATURE_C = 30;

const START_RPM = 850;

const IDLE_RPM = 950;

const MAX_RPM =
  ENGINE_CALIBRATION.maxRpm ?? 3600;

/*
 * Thermal time constants.
 *
 * These intentionally make temperatures respond slower
 * than RPM/throttle, which is much closer to a real engine.
 */

const CHT_TIME_CONSTANT_S = 18;

const EGT_TIME_CONSTANT_S = 4;

const OIL_TEMP_TIME_CONSTANT_S = 25;

const OIL_PRESSURE_TIME_CONSTANT_S = 2;

/* ============================================================
 * HELPERS
 * ========================================================== */

function clamp(
  value: number,
  min: number,
  max: number
): number {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function finite(
  value: unknown,
  fallback = 0
): number {
  return Number.isFinite(
    Number(value)
  )
    ? Number(value)
    : fallback;
}

function approach(
  current: number,
  target: number,
  timeConstantSeconds: number,
  dtSeconds: number
): number {

  if (timeConstantSeconds <= 0) {
    return target;
  }

  const alpha =
    1 -
    Math.exp(
      -dtSeconds /
      timeConstantSeconds
    );

  return (
    current +
    (target - current) * alpha
  );
}

function randomNoise(
  amplitude: number
): number {

  return (
    Math.random() - 0.5
  ) * amplitude;
}

/* ============================================================
 * DEFAULT TELEMETRY
 * ========================================================== */

function createInitialTelemetry(): Telemetry {

  return {
    timestamp: Date.now(),

    rpm: 0,

    cht: DEFAULT_AMBIENT_TEMPERATURE_C,

    egt: DEFAULT_AMBIENT_TEMPERATURE_C,

    oilPressure: 0,

    oilTemperature:
      DEFAULT_AMBIENT_TEMPERATURE_C,

    fuelFlow: 0,

    vibration: 0,

    batteryVoltage: 26.5,

    alternatorCurrent: 0,

    injectionTiming: 0,

    ambientTemperature:
      DEFAULT_AMBIENT_TEMPERATURE_C,

    altitude:
      DEFAULT_ALTITUDE_M,

    throttle: 0,

    engineState: "OFF",

    mode: "IDLE",

    fault: null,

    airDensity: undefined,

    airMassFlow: undefined,

    fuelMassFlow: undefined,

    brakePower: undefined,

    brakeTorque: undefined,

    loadFraction: undefined,

    bsfc: undefined
  };
}

/* ============================================================
 * TELEMETRY ENGINE CLASS
 * ========================================================== */

export class TelemetryEngine {

  private engineState: EngineState =
    "OFF";

  private mode: EngineMode =
    "IDLE";

  private throttleCommand = 0;

  private throttle = 0;

  private rpm = 0;

  private altitude =
    DEFAULT_ALTITUDE_M;

  private ambientTemperature =
    DEFAULT_AMBIENT_TEMPERATURE_C;

  private activeFault: FaultType | null =
    null;

  private overrides: Overrides = {};

  private listeners =
    new Set<TelemetryListener>();

  private timer:
    ReturnType<typeof setInterval> | null =
    null;

  private lastUpdateTime =
    Date.now();

  private simulationTime = 0;

  /*
   * Dynamic thermal state.
   *
   * The physics model gives the target values.
   * These values move toward the target using
   * first-order thermal / pressure lag.
   */

  private cht =
    DEFAULT_AMBIENT_TEMPERATURE_C;

  private egt =
    DEFAULT_AMBIENT_TEMPERATURE_C;

  private oilTemperature =
    DEFAULT_AMBIENT_TEMPERATURE_C;

  private oilPressure = 0;

  private latestTelemetry =
    createInitialTelemetry();

  /* ==========================================================
   * LIFECYCLE
   * ======================================================== */

  start(): void {

    if (this.timer !== null) {
      return;
    }

    this.lastUpdateTime =
      Date.now();

    this.timer =
      setInterval(
        () => this.tick(),
        UPDATE_INTERVAL_MS
      );
  }

  stop(): void {

    if (this.timer !== null) {

      clearInterval(this.timer);

      this.timer = null;
    }
  }

  isRunning(): boolean {

    return this.timer !== null;
  }

  /* ==========================================================
   * SUBSCRIPTIONS
   * ======================================================== */

  subscribe(
    listener: TelemetryListener
  ): () => void {

    this.listeners.add(listener);

    /*
     * Immediately provide current state.
     */
    listener(
      this.latestTelemetry
    );

    return () => {

      this.listeners.delete(
        listener
      );
    };
  }

  getTelemetry(): Telemetry {

    return {
      ...this.latestTelemetry
    };
  }

  /* ==========================================================
   * COMMAND SYSTEM
   * ======================================================== */

  executeCommand(
    command: EngineCommand
  ): void {

    if (!command) {
      return;
    }

    switch (command.type) {

      case "START":
        this.startEngine();
        break;

      case "STOP":
        this.stopEngine();
        break;

      case "SET_THROTTLE":

        this.setThrottle(
          command.value
        );

        break;

      case "SET_MODE":

        this.setMode(
          command.value
        );

        break;

      case "INJECT_FAULT":

        this.injectFault(
          command.fault
        );

        break;

      case "CLEAR_FAULT":

        this.clearFault();

        break;

      case "SET_MANUAL_OVERRIDE":

        this.setManualOverride(
          command.field,
          command.enabled,
          command.value
        );

        break;

      case "CLEAR_ALL_OVERRIDES":

        this.clearAllOverrides();

        break;

      default:
        break;
    }
  }

  /* ==========================================================
   * ENGINE COMMANDS
   * ======================================================== */

  private startEngine(): void {

    if (
      this.engineState !== "OFF"
    ) {
      return;
    }

    this.engineState =
      "STARTING";

    this.throttleCommand = 0;

    /*
     * Starter motor begins rotating the crankshaft.
     */
    this.rpm = START_RPM;
  }

  private stopEngine(): void {

    if (
      this.engineState === "OFF"
    ) {
      return;
    }

    this.engineState =
      "STOPPING";

    this.throttleCommand = 0;
  }

  private setThrottle(
    value: number
  ): void {

    this.throttleCommand =
      clamp(
        finite(value),
        0,
        1
      );
  }

  private setMode(
    mode: EngineMode
  ): void {

    this.mode = mode;

    /*
     * Mode provides a convenient operating-point
     * command while throttle remains the final control.
     */

    switch (mode) {

      case "IDLE":

        this.throttleCommand =
          Math.min(
            this.throttleCommand,
            0.18
          );

        break;

      case "CRUISE":

        this.throttleCommand =
          clamp(
            Math.max(
              this.throttleCommand,
              0.45
            ),
            0,
            1
          );

        break;

      case "HIGH LOAD":

        this.throttleCommand =
          clamp(
            Math.max(
              this.throttleCommand,
              0.82
            ),
            0,
            1
          );

        break;

      default:
        break;
    }
  }

  private injectFault(
    fault: FaultType
  ): void {

    this.activeFault = fault;
  }

  private clearFault(): void {

    this.activeFault = null;
  }

  /* ==========================================================
   * MANUAL OVERRIDES
   * ======================================================== */

  private setManualOverride(
    field: ManualField,
    enabled: boolean,
    value: number
  ): void {

    if (!enabled) {
      delete this.overrides[field];
      return;
    }

    if (!Number.isFinite(Number(value))) {
      return;
    }

    this.overrides[field] = finite(value);
  }

  private clearAllOverrides(): void {

    this.overrides = {};
  }

  /* ==========================================================
   * MAIN SIMULATION LOOP
   * ======================================================== */

  private tick(): void {

    const now = Date.now();

    const dtSeconds =
      clamp(
        (now - this.lastUpdateTime) /
          1000,
        0.01,
        0.5
      );

    this.lastUpdateTime = now;

    this.simulationTime +=
      dtSeconds;

    this.updateEngineState(
      dtSeconds
    );

    this.updateThrottle(
      dtSeconds
    );

    this.updateOperatingMode();

    const telemetry =
      this.calculateTelemetry(
        dtSeconds
      );

    this.latestTelemetry =
      telemetry;

    for (
      const listener of this.listeners
    ) {

      try {

        listener(
          telemetry
        );

      } catch (error) {

        console.error(
          "Telemetry listener error:",
          error
        );
      }
    }
  }

  /* ==========================================================
   * ENGINE STATE DYNAMICS
   * ======================================================== */

  private updateEngineState(
    dtSeconds: number
  ): void {

    switch (this.engineState) {

      case "OFF":

        this.rpm =
          approach(
            this.rpm,
            0,
            0.5,
            dtSeconds
          );

        break;

      case "STARTING":

        /*
         * Starter acceleration.
         */
        this.rpm =
          approach(
            this.rpm,
            IDLE_RPM,
            1.5,
            dtSeconds
          );

        if (
          this.rpm >=
          IDLE_RPM - 15
        ) {

          this.rpm =
            IDLE_RPM;

          this.engineState =
            "RUNNING";
        }

        break;

      case "RUNNING": {

        /*
         * Target RPM comes primarily from throttle.
         *
         * Idle: ~950 RPM
         * Full load: ~3600 RPM
         */

        const targetRPM =
          IDLE_RPM +
          this.throttle *
            (MAX_RPM - IDLE_RPM);

        this.rpm =
          approach(
            this.rpm,
            targetRPM,
            1.8,
            dtSeconds
          );

        break;
      }

      case "STOPPING":

        this.rpm =
          approach(
            this.rpm,
            0,
            1.4,
            dtSeconds
          );

        if (
          this.rpm < 25
        ) {

          this.rpm = 0;

          this.engineState =
            "OFF";
        }

        break;

      default:
        break;
    }

    this.rpm =
      clamp(
        this.rpm,
        0,
        MAX_RPM
      );
  }

  /* ==========================================================
   * THROTTLE DYNAMICS
   * ======================================================== */

  private updateThrottle(
    dtSeconds: number
  ): void {

    let target =
      this.throttleCommand;

    if (
      this.engineState === "OFF" ||
      this.engineState === "STOPPING"
    ) {

      target = 0;
    }

    if (
      this.engineState === "STARTING"
    ) {

      target =
        Math.min(
          target,
          0.12
        );
    }

    /*
     * Mechanical throttle response.
     */
    this.throttle =
      approach(
        this.throttle,
        target,
        0.8,
        dtSeconds
      );

    this.throttle =
      clamp(
        this.throttle,
        0,
        1
      );
  }

  /* ==========================================================
   * OPERATING MODE
   * ======================================================== */

  private updateOperatingMode(): void {

    if (
      this.engineState !== "RUNNING"
    ) {

      this.mode = "IDLE";

      return;
    }

    if (
      this.throttle >= 0.8
    ) {

      this.mode =
        "HIGH LOAD";

    } else if (
      this.throttle >= 0.35
    ) {

      this.mode =
        "CRUISE";

    } else {

      this.mode =
        "IDLE";
    }
  }

  /* ==========================================================
   * PHYSICS → TELEMETRY
   * ======================================================== */

  private calculateTelemetry(
    dtSeconds: number
  ): Telemetry {

    const altitude =
      clamp(
        this.overrides.altitude ?? this.altitude,
        0,
        12000
      );

    const ambientTemperature =
      clamp(
        this.overrides.ambientTemperature ?? this.ambientTemperature,
        -60,
        60
      );

    const effectiveRPM =
      clamp(
        this.overrides.rpm ?? this.rpm,
        0,
        MAX_RPM
      );

    /*
     * Engine is not producing combustion power
     * while completely OFF.
     */
    const effectiveThrottle =
      this.engineState === "OFF"
        ? 0
        : this.throttle;

    /*
     * Degradation is initially represented by
     * active fault stress. Later this can be connected
     * directly to the degradation engine.
     */
    const degradationFactor =
      this.calculateDegradationFactor();

    const physics =
      simulateThermodynamics({

        rpm: effectiveRPM,

        throttle:
          effectiveThrottle,

        altitude,

        ambientTemperature,

        engineRunning:
          this.engineState === "RUNNING" ||
          this.engineState === "STARTING",

        degradationFactor
      });

    /*
     * ========================================================
     * TARGET THERMAL VALUES
     * ========================================================
     */

    let targetCHT =
      physics.chtC;

    let targetEGT =
      physics.egtC;

    let targetOilTemperature =
      physics.oilTemperatureC;

    let targetOilPressure =
      physics.oilPressureBar;

    /*
     * ========================================================
     * FAULT EFFECTS
     * ========================================================
     */

    switch (
      this.activeFault
    ) {

      case "HIGH_TEMP":

        targetCHT += 35;

        targetEGT += 90;

        targetOilTemperature += 20;

        break;

      case "LOW_OIL":

        targetOilPressure -= 1.7;

        break;

      case "HIGH_VIBRATION":

        /*
         * Vibration is applied below.
         */
        break;

      case "ELECTRICAL":

        /*
         * Electrical effects are applied below.
         */
        break;

      case "FUEL_SYSTEM":

        /*
         * Fuel-system faults reduce effective
         * combustion quality and increase fuel demand.
         */
        targetEGT += 45;

        targetCHT += 15;

        break;

      case "ABNORMAL_RPM":

        /*
         * RPM disturbance is represented as
         * a dynamic oscillation.
         */
        break;

      case "COOLING_FAULT":

        targetCHT += 30;

        targetEGT += 35;

        targetOilTemperature += 12;

        break;

      case "INJECTOR_FAULT":

        targetEGT += 55;

        targetCHT += 20;

        break;

      case "SENSOR_FAULT":

        /*
         * Sensor fault is handled as measurement
         * disturbance rather than actual engine damage.
         */
        break;

      default:
        break;
    }

    /*
     * ========================================================
     * THERMAL MASS / LAG
     * ========================================================
     */

    this.cht =
      approach(
        this.cht,
        targetCHT,
        CHT_TIME_CONSTANT_S,
        dtSeconds
      );

    this.egt =
      approach(
        this.egt,
        targetEGT,
        EGT_TIME_CONSTANT_S,
        dtSeconds
      );

    this.oilTemperature =
      approach(
        this.oilTemperature,
        targetOilTemperature,
        OIL_TEMP_TIME_CONSTANT_S,
        dtSeconds
      );

    this.oilPressure =
      approach(
        this.oilPressure,
        Math.max(
          0,
          targetOilPressure
        ),
        OIL_PRESSURE_TIME_CONSTANT_S,
        dtSeconds
      );

    /*
     * ========================================================
     * NON-THERMAL SENSOR VALUES
     * ========================================================
     */

    let vibration =
      this.engineState === "OFF"
        ? 0
        : 0.35 +
          1.6 * physics.loadFraction;

    let batteryVoltage =
      this.engineState === "OFF"
        ? 26.5
        : 27.2 -
          0.8 * physics.loadFraction;

    let alternatorCurrent =
      this.engineState === "OFF"
        ? 0
        : 8 +
          22 * physics.loadFraction;

    let fuelFlow =
      physics.fuelFlowLph;

    let injectionTiming =
      physics.injectionTimingDeg;

    /*
     * Vibration disturbance.
     */
    if (
      this.activeFault ===
      "HIGH_VIBRATION"
    ) {

      vibration += 3.2;
    }

    if (
      this.activeFault ===
      "ABNORMAL_RPM"
    ) {

      vibration +=
        1.2 +
        Math.abs(
          Math.sin(
            this.simulationTime * 12
          )
        ) * 1.4;
    }

    /*
     * Electrical disturbance.
     */
    if (
      this.activeFault ===
      "ELECTRICAL"
    ) {

      batteryVoltage -= 4.5;

      alternatorCurrent -= 15;
    }

    /*
     * Fuel-system disturbance.
     */
    if (
      this.activeFault ===
      "FUEL_SYSTEM"
    ) {

      fuelFlow *= 1.18;

      injectionTiming += 2.5;
    }

    if (
      this.activeFault ===
      "INJECTOR_FAULT"
    ) {

      fuelFlow *= 1.12;

      injectionTiming +=
        1.5 +
        Math.sin(
          this.simulationTime * 8
        );
    }

    /*
     * Sensor fault = measurement noise/drift.
     */
    if (
      this.activeFault ===
      "SENSOR_FAULT"
    ) {

      batteryVoltage +=
        randomNoise(1.0);

      injectionTiming +=
        randomNoise(4);

      vibration +=
        randomNoise(0.8);
    }

    /*
     * Small realistic measurement noise.
     */
    if (
      this.engineState !== "OFF"
    ) {

      vibration +=
        Math.abs(
          randomNoise(0.12)
        );

      batteryVoltage +=
        randomNoise(0.05);

      injectionTiming +=
        randomNoise(0.08);
    }

    /*
     * ========================================================
     * ENGINE OFF OVERRIDES
     * ========================================================
     */

    if (
      this.engineState === "OFF"
    ) {

      this.cht =
        ambientTemperature;

      this.egt =
        ambientTemperature;

      this.oilTemperature =
        ambientTemperature;

      this.oilPressure = 0;

      vibration = 0;

      fuelFlow = 0;

      alternatorCurrent = 0;

      injectionTiming = 0;
    }

    /*
     * Starting state.
     */
    if (
      this.engineState === "STARTING"
    ) {

      fuelFlow *= 0.35;

      this.oilPressure =
        Math.max(
          0.4,
          this.oilPressure
        );

      vibration += 0.4;
    }

    /*
     * ========================================================
     * LIMIT SENSOR OUTPUTS
     * ========================================================
     */

    const finalRPM =
      clamp(
        this.rpm,
        0,
        MAX_RPM
      );

    const finalOilPressure =
      clamp(
        this.oilPressure,
        0,
        8
      );

    const finalBatteryVoltage =
      clamp(
        batteryVoltage,
        0,
        32
      );

    const finalAlternatorCurrent =
      clamp(
        alternatorCurrent,
        0,
        80
      );

    /*
     * ========================================================
     * RETURN TELEMETRY
     * ========================================================
     */

    return {

      timestamp: Date.now(),

      rpm: finalRPM,

      cht:
        this.overrides.cht !== undefined
          ? clamp(this.overrides.cht, -60, 250)
          : Math.max(ambientTemperature, this.cht),

      egt:
        this.overrides.egt !== undefined
          ? clamp(this.overrides.egt, -60, 1200)
          : Math.max(ambientTemperature, this.egt),

      oilPressure:
        this.overrides.oilPressure !== undefined
          ? clamp(this.overrides.oilPressure, 0, 8)
          : finalOilPressure,

      oilTemperature:
        this.overrides.oilTemperature !== undefined
          ? clamp(this.overrides.oilTemperature, -60, 180)
          : Math.max(ambientTemperature, this.oilTemperature),

      fuelFlow:
        this.overrides.fuelFlow !== undefined
          ? Math.max(0, this.overrides.fuelFlow)
          : Math.max(0, fuelFlow),

      vibration:
        this.overrides.vibration !== undefined
          ? Math.max(0, this.overrides.vibration)
          : Math.max(0, vibration),

      batteryVoltage:
        finalBatteryVoltage,

      alternatorCurrent:
        finalAlternatorCurrent,

      injectionTiming:
        this.overrides.rpm !== undefined
          ? Math.max(0, injectionTiming)
          : Math.max(0, injectionTiming),

      ambientTemperature,

      altitude,

      throttle:
        effectiveThrottle,

      engineState:
        this.engineState,

      mode:
        this.mode,

      fault:
        this.activeFault,

      /*
       * Physics outputs.
       */
      airDensity:
        physics.atmosphere.densityKgM3,

      airMassFlow:
        physics.airMassFlowKgS,

      fuelMassFlow:
        physics.fuelMassFlowKgS,

      brakePower:
        physics.brakePowerKW,

      brakeTorque:
        physics.brakeTorqueNm,

      loadFraction:
        physics.loadFraction,

      bsfc:
        physics.bsfcGPerKWh
    };
  }

  /* ==========================================================
   * DEGRADATION FACTOR
   * ======================================================== */

  private calculateDegradationFactor(): number {

    /*
     * Faults temporarily increase engine stress.
     *
     * This is intentionally separate from the persistent
     * degradation engine. Later, the degradation model can
     * feed its actual value into this function.
     */

    switch (
      this.activeFault
    ) {

      case "HIGH_TEMP":
        return 0.12;

      case "LOW_OIL":
        return 0.10;

      case "HIGH_VIBRATION":
        return 0.08;

      case "ELECTRICAL":
        return 0.05;

      case "FUEL_SYSTEM":
        return 0.10;

      case "ABNORMAL_RPM":
        return 0.12;

      case "COOLING_FAULT":
        return 0.15;

      case "INJECTOR_FAULT":
        return 0.13;

      case "SENSOR_FAULT":
        return 0;

      default:
        return 0;
    }
  }

  /* ==========================================================
   * ENVIRONMENT CONTROL
   * ======================================================== */

  setAltitude(
    altitudeM: number
  ): void {

    this.altitude =
      clamp(
        finite(altitudeM),
        0,
        12000
      );
  }

  setAmbientTemperature(
    temperatureC: number
  ): void {

    this.ambientTemperature =
      clamp(
        finite(temperatureC),
        -60,
        60
      );
  }

  getAltitude(): number {

    return (
      this.overrides.altitude ??
      this.altitude
    );
  }

  getAmbientTemperature(): number {

    return (
      this.overrides
        .ambientTemperature ??
      this.ambientTemperature
    );
  }

  /* ==========================================================
   * RESET
   * ======================================================== */

  reset(): void {

    this.engineState =
      "OFF";

    this.mode =
      "IDLE";

    this.throttleCommand = 0;

    this.throttle = 0;

    this.rpm = 0;

    this.activeFault = null;

    this.overrides = {};

    this.altitude =
      DEFAULT_ALTITUDE_M;

    this.ambientTemperature =
      DEFAULT_AMBIENT_TEMPERATURE_C;

    this.cht =
      DEFAULT_AMBIENT_TEMPERATURE_C;

    this.egt =
      DEFAULT_AMBIENT_TEMPERATURE_C;

    this.oilTemperature =
      DEFAULT_AMBIENT_TEMPERATURE_C;

    this.oilPressure = 0;

    this.simulationTime = 0;

    this.latestTelemetry =
      createInitialTelemetry();

    this.lastUpdateTime =
      Date.now();

    this.emit();
  }

  /* ==========================================================
   * MANUAL EMIT
   * ======================================================== */

  private emit(): void {

    for (
      const listener of this.listeners
    ) {

      try {

        listener(
          this.latestTelemetry
        );

      } catch (error) {

        console.error(
          "Telemetry listener error:",
          error
        );
      }
    }
  }
}

/* ============================================================
 * SINGLETON
 * ========================================================== */

export const telemetryEngine =
  new TelemetryEngine();

export default telemetryEngine;