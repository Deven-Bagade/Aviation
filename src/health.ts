import {
  Health,
  Telemetry
} from "./types";

function scoreRange(
  value: number,
  normalMin: number,
  normalMax: number,
  hardMin: number,
  hardMax: number
) {

  if (
    value >= normalMin &&
    value <= normalMax
  ) {
    return 100;
  }

  if (
    value <= hardMin ||
    value >= hardMax
  ) {
    return 0;
  }

  if (value < normalMin) {

    return (
      100 *
      (value - hardMin) /
      (normalMin - hardMin)
    );

  }

  return (
    100 *
    (hardMax - value) /
    (hardMax - normalMax)
  );
}

export function calculateHealth(
  x: Telemetry
): Health {

  /*
   * ENGINE OFF
   */

  if (x.engineState === "OFF") {

    return {

      ehi: 100,

      state: "NORMAL",

      faults: [],

      explanations: [],

      rulHours: 1200,

      degradation: 0

    };

  }

  /*
   * SUBSYSTEM SCORES
   */

  const thermal = Math.min(

    scoreRange(
      x.cht,
      90,
      190,
      60,
      230
    ),

    scoreRange(
      x.egt,
      450,
      790,
      350,
      900
    )

  );

  const lubrication = Math.min(

    scoreRange(
      x.oilPressure,
      2.5,
      5.5,
      1.2,
      6.5
    ),

    scoreRange(
      x.oilTemperature,
      60,
      115,
      40,
      135
    )

  );

  const vibration =
    scoreRange(
      x.vibration,
      0.5,
      3.0,
      0,
      6
    );

  const fuel =
    scoreRange(
      x.fuelFlow,
      7,
      28,
      3,
      38
    );

  const electrical = Math.min(

    scoreRange(
      x.batteryVoltage,
      25,
      29,
      22,
      31
    ),

    scoreRange(
      x.alternatorCurrent,
      10,
      50,
      0,
      65
    )

  );

  /*
   * EHI
   */

  let ehi =

    thermal * 0.28 +

    lubrication * 0.24 +

    vibration * 0.18 +

    fuel * 0.14 +

    electrical * 0.16;

  /*
   * FAULTS
   */

  const faults: string[] = [];

  const explanations: string[] = [];

  if (
    x.egt > 800 ||
    x.cht > 205
  ) {

    faults.push(
      "Thermal stress"
    );

    explanations.push(
      "High EGT/CHT indicates possible overheating or combustion abnormality."
    );

  }

  if (
    x.oilPressure < 2.2
  ) {

    faults.push(
      "Low oil pressure"
    );

    explanations.push(
      "Low oil pressure may indicate lubrication-system degradation."
    );

  }

  if (
    x.oilTemperature > 120
  ) {

    faults.push(
      "High oil temperature"
    );

    explanations.push(
      "Increasing oil temperature may indicate excessive thermal load or cooling degradation."
    );

  }

  if (
    x.vibration > 3.5
  ) {

    faults.push(
      "Abnormal vibration"
    );

    explanations.push(
      "Elevated vibration may indicate mechanical imbalance, bearing issues, or combustion irregularity."
    );

  }

  if (
    x.fuelFlow > 30 &&
    x.rpm < 2500
  ) {

    faults.push(
      "Fuel-flow abnormality"
    );

    explanations.push(
      "High fuel flow relative to RPM may indicate inefficient combustion or injector/fuel-system abnormality."
    );

  }

  if (
    Math.abs(
      x.batteryVoltage - 27.5
    ) > 2.2
  ) {

    faults.push(
      "Electrical anomaly"
    );

    explanations.push(
      "Battery voltage is outside the prototype operating envelope."
    );

  }

  /*
   * Explicit simulator fault
   */

  if (x.fault) {

    ehi -= 10;

  }

  ehi = Math.max(
    0,
    Math.min(
      100,
      ehi
    )
  );

  /*
   * ENGINE STATE
   */

  let state:
    Health["state"] =
      "NORMAL";

  if (
    ehi < 55 ||
    x.fault === "HIGH_TEMP"
  ) {

    state = "CRITICAL";

  } else if (
    ehi < 70
  ) {

    state = "DEGRADED";

  } else if (
    ehi < 85 ||
    faults.length > 0
  ) {

    state = "WARNING";

  }

  /*
   * DEMONSTRATION RUL
   *
   * This is still a prototype
   * heuristic, not a predictive
   * maintenance model.
   */

  const degradation =
    Math.max(
      0,
      100 - ehi
    );

  const rulHours =
    Math.max(
      2,
      1200 -
        degradation * 9
    );

  return {

    ehi,

    state,

    faults,

    explanations,

    rulHours,

    degradation

  };
}