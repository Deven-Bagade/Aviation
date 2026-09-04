import {
  AtmosphereState,
  ThermodynamicInput,
  ThermodynamicState
} from "../types";

/*
 * ==========================================================
 * ENGINE CALIBRATION
 * ==========================================================
 *
 * These values represent a generic aero piston engine model.
 * They are intentionally configurable rather than pretending
 * to be certification data for a particular engine.
 */

const ENGINE = {
  displacementM3: 4.0e-3,

  cylinders: 4,

  compressionRatio: 8.5,

  maxRpm: 3600,
  idleRpm: 900,

  stoichAfr: 14.7,

  richAfr: 12.5,

  lowerHeatingValueMJPerKg: 43.0,

  baseVolumetricEfficiency: 0.82,

  peakBrakeEfficiency: 0.30,

  mechanicalEfficiency: 0.88,

  generatorLoadKW: 1.5,

  idleFuelFlowLph: 5.5,

  fuelDensityKgL: 0.745,

  baseChtC: 82,

  baseOilTemperatureC: 55,

  baseOilPressureBar: 2.0
};

function clamp(
  value: number,
  min: number,
  max: number
): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * ISA troposphere model up to 11 km.
 *
 * For this digital twin the atmosphere is deliberately
 * deterministic and smooth so the same input always gives
 * approximately the same engine operating point.
 */
export function calculateISA(
  altitudeM: number,
  ambientTemperatureOverrideC?: number
): AtmosphereState {
  const altitude = clamp(altitudeM, 0, 11000);

  const seaLevelTemperatureK = 288.15;
  const seaLevelPressurePa = 101325;
  const lapseRate = 0.0065;
  const gasConstant = 287.058;
  const gravity = 9.80665;

  const isaTemperatureK =
    seaLevelTemperatureK -
    lapseRate * altitude;

  const pressure =
    seaLevelPressurePa *
    Math.pow(
      isaTemperatureK / seaLevelTemperatureK,
      gravity /
        (gasConstant * lapseRate)
    );

  const temperatureK =
    Number.isFinite(
      ambientTemperatureOverrideC
    )
      ? ambientTemperatureOverrideC! + 273.15
      : isaTemperatureK;

  const density =
    pressure /
    (gasConstant * temperatureK);

  return {
    altitude,
    temperatureK,
    pressurePa: pressure,
    densityKgM3: density
  };
}

function calculateVolumetricEfficiency(
  rpm: number,
  throttle: number,
  pressureRatio: number
): number {
  const rpmRatio =
    clamp(rpm / ENGINE.maxRpm, 0, 1.2);

  /*
   * VE rises from idle, peaks around mid-range,
   * then drops near maximum rpm.
   */
  const rpmShape =
    0.76 +
    0.15 *
      Math.exp(
        -Math.pow(
          (rpmRatio - 0.55) / 0.30,
          2
        )
      ) -
    0.08 *
      Math.max(
        0,
        rpmRatio - 0.8
      );

  const throttleEffect =
    0.68 + 0.32 * throttle;

  const altitudeEffect =
    0.82 +
    0.18 *
      clamp(pressureRatio, 0.2, 1);

  return clamp(
    ENGINE.baseVolumetricEfficiency *
      rpmShape *
      throttleEffect *
      altitudeEffect,
    0.35,
    0.95
  );
}

function calculateFuelAirRatio(
  throttle: number
): number {
  /*
   * Slightly rich at high load, closer to stoichiometric
   * during low-load operation.
   */
  const afr =
    ENGINE.stoichAfr -
    throttle * 2.1;

  return 1 / clamp(afr, 11.5, 15.0);
}

function calculateCombustionEfficiency(
  throttle: number,
  ignitionEfficiency: number
): number {
  const mixtureEfficiency =
    0.86 +
    0.08 * throttle;

  const loadEfficiency =
    0.82 +
    0.12 *
      Math.min(
        1,
        throttle * 1.4
      );

  return clamp(
    mixtureEfficiency *
      loadEfficiency *
      ignitionEfficiency,
    0.55,
    0.98
  );
}

function calculateBrakeEfficiency(
  throttle: number,
  mechanicalEfficiency: number,
  degradationFactor: number
): number {
  const loadFactor =
    0.55 +
    0.45 *
      Math.min(1, throttle);

  return clamp(
    ENGINE.peakBrakeEfficiency *
      loadFactor *
      mechanicalEfficiency *
      degradationFactor,
    0.08,
    0.34
  );
}

function calculateThermalState(
  input: ThermodynamicInput,
  loadFraction: number,
  combustionPowerKW: number,
  coolingEfficiency: number,
  degradationFactor: number
) {
  const ambient =
    input.ambientTemperature;

  /*
   * CHT is primarily driven by:
   * - ambient temperature
   * - load
   * - combustion heat
   * - cooling efficiency
   */
  const heatRise =
    30 +
    92 * loadFraction +
    0.025 * combustionPowerKW;

  const coolingFactor =
    clamp(
      coolingEfficiency,
      0.45,
      1.15
    );

  const cht =
    ambient +
    heatRise /
      coolingFactor *
      (1 +
        (1 -
          degradationFactor) *
          0.45);

  /*
   * EGT is strongly linked to combustion load.
   */
  const egt =
    350 +
    420 * loadFraction +
    0.018 *
      combustionPowerKW +
    ambient * 0.15;

  /*
   * Oil temperature has significantly more thermal mass,
   * but this function represents the steady-state target.
   * telemetryEngine applies the actual lag.
   */
  const oilTemperature =
    ambient +
    38 +
    50 * loadFraction;

  const oilPressure =
    1.9 +
    2.8 *
      loadFraction +
    0.00015 *
      Math.max(
        0,
        input.rpm - ENGINE.idleRpm
      );

  return {
    chtC: clamp(cht, 40, 240),
    egtC: clamp(egt, 250, 1000),
    oilTemperatureC: clamp(
      oilTemperature,
      35,
      145
    ),
    oilPressureBar: clamp(
      oilPressure,
      0.8,
      7
    )
  };
}

export function simulateThermodynamics(
  input: ThermodynamicInput
): ThermodynamicState {
  const rpm = clamp(
    input.rpm,
    0,
    ENGINE.maxRpm * 1.1
  );

  const throttle = clamp(
    input.throttle,
    0,
    1
  );

  const degradationFactor = clamp(
    input.degradationFactor ?? 1,
    0.65,
    1
  );

  const coolingEfficiency = clamp(
    input.coolingEfficiency ?? 1,
    0.45,
    1.15
  );

  const injectorEfficiency = clamp(
    input.injectorEfficiency ?? 1,
    0.70,
    1.05
  );

  const ignitionEfficiency = clamp(
    input.ignitionEfficiency ?? 1,
    0.70,
    1.05
  );

  const atmosphere = calculateISA(
    input.altitude,
    input.ambientTemperature
  );

  const seaLevelDensity = 1.225;

  const pressureRatio =
    atmosphere.pressurePa /
    101325;

  const densityRatio =
    atmosphere.densityKgM3 /
    seaLevelDensity;

  if (
    !input.engineRunning ||
    rpm < 100 ||
    throttle <= 0
  ) {
    return {
      atmosphere,

      volumetricEfficiency: 0,

      airMassFlowKgS: 0,
      fuelMassFlowKgS: 0,

      combustionPowerKW: 0,
      brakePowerKW: 0,
      brakeTorqueNm: 0,

      loadFraction: 0,

      chtC:
        input.ambientTemperature + 10,

      egtC:
        input.ambientTemperature + 100,

      oilTemperatureC:
        ENGINE.baseOilTemperatureC,

      oilPressureBar: 0,

      fuelFlowLph: 0,

      bsfcGPerKWh: 0,

      injectionTimingDeg: 22
    };
  }

  const volumetricEfficiency =
    calculateVolumetricEfficiency(
      rpm,
      throttle,
      pressureRatio
    );

  /*
   * Four-stroke engine:
   *
   * intake volume/sec =
   * displacement * rpm / 120
   */
  const intakeVolumeFlowM3S =
    ENGINE.displacementM3 *
    rpm /
    120;

  const airMassFlowKgS =
    intakeVolumeFlowM3S *
    atmosphere.densityKgM3 *
    volumetricEfficiency *
    throttle;

  const fuelAirRatio =
    calculateFuelAirRatio(throttle);

  const fuelMassFlowKgS =
    airMassFlowKgS *
    fuelAirRatio *
    injectorEfficiency;

  const combustionEfficiency =
    calculateCombustionEfficiency(
      throttle,
      ignitionEfficiency
    );

  const combustionPowerKW =
    fuelMassFlowKgS *
    ENGINE.lowerHeatingValueMJPerKg *
    1000 *
    combustionEfficiency;

  const brakeEfficiency =
    calculateBrakeEfficiency(
      throttle,
      ENGINE.mechanicalEfficiency,
      degradationFactor
    );

  const brakePowerKW =
    combustionPowerKW *
    brakeEfficiency;

  const torque =
    brakePowerKW > 0 && rpm > 0
      ? (brakePowerKW * 1000) /
        (2 * Math.PI * rpm / 60)
      : 0;

  /*
   * Nominal engine power is approximately 65 kW.
   * This is a demonstrator calibration rather than
   * certification data.
   */
  const nominalPowerKW = 65;

  const loadFraction =
    clamp(
      brakePowerKW /
        nominalPowerKW,
      0,
      1.15
    );

  const thermal =
    calculateThermalState(
      input,
      loadFraction,
      combustionPowerKW,
      coolingEfficiency,
      degradationFactor
    );

  const fuelFlowLph =
    fuelMassFlowKgS /
    ENGINE.fuelDensityKgL *
    3600;

  const bsfc =
    brakePowerKW > 0.1
      ? (fuelMassFlowKgS * 3600 * 1000) /
        brakePowerKW
      : 0;

  const injectionTimingDeg =
    22 +
    3 *
      throttle +
    0.7 *
      (rpm / ENGINE.maxRpm);

  return {
    atmosphere,

    volumetricEfficiency,

    airMassFlowKgS,
    fuelMassFlowKgS,

    combustionPowerKW,
    brakePowerKW,
    brakeTorqueNm: torque,

    loadFraction,

    ...thermal,

    fuelFlowLph,

    bsfcGPerKWh: bsfc,

    injectionTimingDeg
  };
}

export const ENGINE_CALIBRATION = ENGINE;