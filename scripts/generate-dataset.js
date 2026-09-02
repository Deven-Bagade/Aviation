const fs = require("fs");
const path = require("path");

const simulator = require("../electron/telemetry-simulator");
const featureConfig = require("../src/ai/featureConfig.json");
const faultLabels = require("../src/ai/faultLabels.json");

const TOTAL_TICKS = 300000;
const OUTPUT_PATH = path.join(__dirname, "..", "datasets", "telemetry_train.json");

function normalize(t) {
  return featureConfig.features.map(({ key, min, max }) => {
    const v = t[key];
    return Math.max(0, Math.min(1, (v - min) / (max - min)));
  });
}

const FAULTS = faultLabels.filter((f) => f !== "NONE");

// Simplified single-scalar degradation tracker mirroring src/simulation/degradation.ts,
// used only to generate a physics-consistent RUL label for supervised training.
let degradation = 0;
let wearRate = 0;

const FAULT_STRESS = {
  HIGH_TEMP: 3.0, LOW_OIL: 3.0, HIGH_VIBRATION: 3.0, ELECTRICAL: 2.5,
  FUEL_SYSTEM: 2.5, ABNORMAL_RPM: 1.8, COOLING_FAULT: 3.2,
  INJECTOR_FAULT: 3.0, SENSOR_FAULT: 2.0
};

function stepDegradation(t, dtHours) {
  if (t.engineState !== "RUNNING") return;
  const stress = t.fault ? FAULT_STRESS[t.fault] || 1.5 : 0;
  const instant = 1.5 + stress * 55;
  wearRate += (instant - wearRate) * 0.08;
  degradation = Math.min(100, degradation + wearRate * dtHours);
}

function rulLabel() {
  if (wearRate <= 0.05) return 5000;
  return Math.max(0, Math.min(5000, (100 - degradation) / wearRate));
}

const samples = [];
let sinceEvent = 0;
let nextEventAt = 40 + Math.floor(Math.random() * 200);

for (let i = 0; i < TOTAL_TICKS; i++) {
  sinceEvent++;

  if (sinceEvent >= nextEventAt) {
    sinceEvent = 0;
    nextEventAt = 40 + Math.floor(Math.random() * 200);

    const roll = Math.random();
    if (roll < 0.15) simulator.setCommand({ type: "START" });
    else if (roll < 0.2) simulator.setCommand({ type: "STOP" });
    else if (roll < 0.55) simulator.setCommand({ type: "SET_THROTTLE", value: Math.random() });
    else if (roll < 0.75) {
      const fault = FAULTS[Math.floor(Math.random() * FAULTS.length)];
      simulator.setCommand({ type: "INJECT_FAULT", fault });
    } else if (roll < 0.85) simulator.setCommand({ type: "CLEAR_FAULT" });
  }

  const telemetry = simulator.nextTelemetry();
  stepDegradation(telemetry, 0.2 / 3600);

  if (telemetry.engineState === "RUNNING") {
    samples.push({
      features: normalize(telemetry),
      faultIndex: faultLabels.indexOf(telemetry.fault || "NONE"),
      isNominal: telemetry.fault === null,
      degradation,
      rulHours: rulLabel()
    });
  }
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(samples));
console.log(`Generated ${samples.length} labeled samples -> ${OUTPUT_PATH}`);