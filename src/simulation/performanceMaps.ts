import {
  PerformanceCurve,
  PerformanceMaps
} from "../types";

import {
  ENGINE_CALIBRATION,
  simulateThermodynamics
} from "./thermodynamics";

function linspace(
  start: number,
  end: number,
  count: number
): number[] {
  if (count <= 1) return [start];

  return Array.from(
    { length: count },
    (_, index) =>
      start +
      ((end - start) * index) /
        (count - 1)
  );
}

function curve(
  name: string,
  unit: string,
  points: {
    rpm: number;
    value: number;
  }[]
): PerformanceCurve {
  return {
    name,
    unit,
    points
  };
}

export function generatePerformanceMaps(
  altitudeM = 2500,
  ambientTemperatureC = 20
): PerformanceMaps {
  const rpmValues = linspace(
    900,
    ENGINE_CALIBRATION.maxRpm,
    24
  );

  const rpmPower = rpmValues.map(
    (rpm) => {
      const state =
        simulateThermodynamics({
          rpm,
          throttle: 1,
          altitude: altitudeM,
          ambientTemperature:
            ambientTemperatureC,
          engineRunning: true
        });

      return {
        rpm,
        value: Number(
          state.brakePowerKW.toFixed(2)
        )
      };
    }
  );

  const rpmTorque = rpmValues.map(
    (rpm) => {
      const state =
        simulateThermodynamics({
          rpm,
          throttle: 1,
          altitude: altitudeM,
          ambientTemperature:
            ambientTemperatureC,
          engineRunning: true
        });

      return {
        rpm,
        value: Number(
          state.brakeTorqueNm.toFixed(2)
        )
      };
    }
  );

  const rpmFuelFlow =
    rpmValues.map((rpm) => {
      const state =
        simulateThermodynamics({
          rpm,
          throttle: 1,
          altitude: altitudeM,
          ambientTemperature:
            ambientTemperatureC,
          engineRunning: true
        });

      return {
        rpm,
        value: Number(
          state.fuelFlowLph.toFixed(2)
        )
      };
    });

  const bsfc = rpmValues.map(
    (rpm) => {
      const state =
        simulateThermodynamics({
          rpm,
          throttle: 1,
          altitude: altitudeM,
          ambientTemperature:
            ambientTemperatureC,
          engineRunning: true
        });

      return {
        rpm,
        value: Number(
          state.bsfcGPerKWh.toFixed(2)
        )
      };
    }
  );

  const altitudePower = linspace(
    0,
    6000,
    13
  ).map((altitude) => {
    const state =
      simulateThermodynamics({
        rpm: 3000,
        throttle: 1,
        altitude,
        ambientTemperature:
          ambientTemperatureC,
        engineRunning: true
      });

    return {
      altitude,
      powerKW: Number(
        state.brakePowerKW.toFixed(2)
      )
    };
  });

  const loadEgt = linspace(
    0.1,
    1,
    10
  ).map((loadFraction) => {
    const state =
      simulateThermodynamics({
        rpm: 2800,
        throttle: loadFraction,
        altitude: altitudeM,
        ambientTemperature:
          ambientTemperatureC,
        engineRunning: true
      });

    return {
      loadFraction,
      egtC: Number(
        state.egtC.toFixed(2)
      )
    };
  });

  return {
    rpmPower: curve(
      "RPM / Brake Power",
      "kW",
      rpmPower
    ),

    rpmTorque: curve(
      "RPM / Torque",
      "Nm",
      rpmTorque
    ),

    rpmFuelFlow: curve(
      "RPM / Fuel Flow",
      "L/h",
      rpmFuelFlow
    ),

    altitudePower,

    loadEgt,

    bsfc: curve(
      "RPM / BSFC",
      "g/kWh",
      bsfc
    )
  };
}

export function getPerformanceMapSummary(
  maps: PerformanceMaps
) {
  const peakPower =
    maps.rpmPower.points.reduce(
      (best, point) =>
        point.value > best.value
          ? point
          : best,
      maps.rpmPower.points[0]
    );

  const peakTorque =
    maps.rpmTorque.points.reduce(
      (best, point) =>
        point.value > best.value
          ? point
          : best,
      maps.rpmTorque.points[0]
    );

  const bestBsfc =
    maps.bsfc.points.reduce(
      (best, point) =>
        point.value < best.value
          ? point
          : best,
      maps.bsfc.points[0]
    );

  return {
    peakPower,
    peakTorque,
    bestBsfc
  };
}