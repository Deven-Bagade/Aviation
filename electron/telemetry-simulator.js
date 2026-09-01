let t = 0;

let engineState = "OFF";
let mode = "IDLE";

let throttleCommand = 0;
let throttle = 0;

let rpm = 0;

let activeFault = null;

// Manual overrides: { [field]: { enabled: boolean, value: number } }
let overrides = {};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function noise(scale) {
  return (Math.random() - 0.5) * scale;
}

function applyOverride(field, computed) {
  const o = overrides[field];
  if (o && o.enabled && Number.isFinite(o.value)) {
    return o.value;
  }
  return computed;
}

function setCommand(command) {
  if (!command || !command.type) {
    return;
  }

  switch (command.type) {
    case "START":
      if (engineState === "OFF") {
        engineState = "STARTING";
      }
      break;

    case "STOP":
      if (engineState === "RUNNING" || engineState === "STARTING") {
        engineState = "STOPPING";
      }
      break;

    case "SET_THROTTLE":
      throttleCommand = clamp(Number(command.value) || 0, 0, 1);
      break;

    case "SET_MODE":
      if (command.value === "IDLE" || command.value === "CRUISE" || command.value === "HIGH LOAD") {
        mode = command.value;
      }
      break;

    case "INJECT_FAULT":
      activeFault = command.fault;
      break;

    case "CLEAR_FAULT":
      activeFault = null;
      break;

    case "SET_MANUAL_OVERRIDE":
      if (command.field) {
        overrides[command.field] = {
          enabled: !!command.enabled,
          value: Number(command.value)
        };
      }
      break;

    case "CLEAR_ALL_OVERRIDES":
      overrides = {};
      break;

    default:
      break;
  }
}

function updateEngineState() {
  if (engineState === "STARTING") {
    rpm += 450 * 0.2;

    if (rpm >= 900) {
      rpm = 900;
      engineState = "RUNNING";
    }
  } else if (engineState === "RUNNING") {
    const targetRPM = 1100 + throttle * 2100;
    rpm += (targetRPM - rpm) * 0.12;
  } else if (engineState === "STOPPING") {
    rpm *= 0.9;

    if (rpm < 30) {
      rpm = 0;
      engineState = "OFF";
      throttle = 0;
    }
  } else {
    rpm *= 0.85;

    if (rpm < 1) {
      rpm = 0;
    }
  }
}

function updateThrottle() {
  if (engineState === "OFF") {
    throttle += (0 - throttle) * 0.15;
    return;
  }

  if (engineState === "STARTING") {
    throttle += (0.15 - throttle) * 0.08;
    return;
  }

  throttle += (throttleCommand - throttle) * 0.08;
}

function calculateMode() {
  if (engineState !== "RUNNING") {
    return "IDLE";
  }

  if (throttle >= 0.8) {
    return "HIGH LOAD";
  }

  if (throttle >= 0.35) {
    return "CRUISE";
  }

  return "IDLE";
}

function nextTelemetry() {
  t += 0.2;

  updateThrottle();
  updateEngineState();

  // Manual RPM override bypasses the physics model directly (test-rig style)
  rpm = applyOverride("rpm", rpm);

  mode = calculateMode();

  /*
   * BASE ENGINE VALUES
   */

  let cht = 88 + throttle * 115 + 5 * Math.sin(t / 10) + noise(2);
  let egt = 420 + throttle * 400 + 15 * Math.sin(t / 6) + noise(5);
  let oilTemperature = 58 + throttle * 55 + 3 * Math.sin(t / 12) + noise(1.5);
  let oilPressure = 2.0 + throttle * 3.0 + noise(0.12);
  let vibration = 0.8 + throttle * 1.1 + Math.abs(noise(0.25));
  let fuelFlow = 6 + throttle * 20 + noise(0.5);
  let batteryVoltage = 26.5 + 1.8 * throttle + noise(0.12);
  let alternatorCurrent =
    engineState === "RUNNING" ? 18 + 25 * throttle + noise(1.2) : 2 + noise(0.5);
  let injectionTiming = 23.5 + 1.2 * Math.sin(t / 9) + noise(0.2);

  /*
   * FAULT INJECTION
   * Nine categories: overheating, oil, fuel, abnormal RPM, EGT/CHT,
   * excessive vibration, cooling, electrical, injector/combustion, sensor.
   */

  if (activeFault === "HIGH_TEMP") {
    cht += 35;
    egt += 90;
    oilTemperature += 20;
  }

  if (activeFault === "LOW_OIL") {
    oilPressure -= 1.7;
    oilTemperature += 8;
  }

  if (activeFault === "HIGH_VIBRATION") {
    vibration += 3.2;
  }

  if (activeFault === "ELECTRICAL") {
    batteryVoltage -= 4.5;
    alternatorCurrent -= 15;
  }

  if (activeFault === "FUEL_SYSTEM") {
    fuelFlow += 12 + noise(2);
    egt += 30 * Math.sin(t / 2);
  }

  if (activeFault === "ABNORMAL_RPM") {
    rpm += 350 * Math.sin(t * 3);
  }

  if (activeFault === "COOLING_FAULT") {
    cht += 45 + 10 * Math.sin(t / 5);
  }

  if (activeFault === "INJECTOR_FAULT") {
    vibration += 1.4 + Math.abs(noise(0.6));
    egt += 60 * Math.sin(t * 4);
    fuelFlow -= 3;
  }

  if (activeFault === "SENSOR_FAULT") {
    // Simulate an unreliable channel: large erratic noise, not a real physical trend
    vibration += noise(1.5);
    cht += noise(8);
  }

  /*
   * ENVIRONMENT
   */

  let ambientTemperature = 30 + 5 * Math.sin(t / 30);
  let altitude = 2500 + 500 * Math.sin(t / 40);

  /*
   * MANUAL OVERRIDES (applied last, after physics + faults)
   */

  cht = applyOverride("cht", cht);
  egt = applyOverride("egt", egt);
  oilPressure = applyOverride("oilPressure", oilPressure);
  oilTemperature = applyOverride("oilTemperature", oilTemperature);
  fuelFlow = applyOverride("fuelFlow", fuelFlow);
  vibration = applyOverride("vibration", vibration);
  ambientTemperature = applyOverride("ambientTemperature", ambientTemperature);
  altitude = applyOverride("altitude", altitude);

  return {
    timestamp: Date.now(),

    rpm,

    cht,
    egt,

    oilPressure,
    oilTemperature,

    fuelFlow,
    vibration,

    batteryVoltage,
    alternatorCurrent,

    injectionTiming,

    ambientTemperature,
    altitude,

    throttle,

    engineState,
    mode,

    fault: activeFault
  };
}

module.exports = {
  nextTelemetry,
  setCommand
};