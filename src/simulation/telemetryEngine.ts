import {
  EngineCommand,
  EngineMode,
  FaultType,
  ManualField,
  Telemetry
} from "../types";

/*
 * ==========================================================
 * SHARED, CROSS-WINDOW SYNTHETIC TELEMETRY ENGINE
 * ==========================================================
 * Runs entirely in the browser — no external process required.
 * Exactly one browser window/tab per origin becomes the "primary"
 * (it runs the physics tick loop); every other open window/tab
 * becomes a "follower" that just listens for broadcast telemetry
 * and forwards its own commands back to the primary. This lets
 * you open a Simulation-control window and a Dashboard window
 * side by side and see them stay perfectly in sync.
 *
 * Later, real CAN/ECU/FADEC data can be piped in via
 * ingestExternal() instead of the synthetic tick() function,
 * without touching anything downstream (health, degradation,
 * dashboard, 3D twin).
 */

const CHANNEL_NAME = "aero-engine-digital-twin";
const HEARTBEAT_KEY = "aeroTwinLeaderHeartbeat";
const HEARTBEAT_INTERVAL_MS = 400;
const HEARTBEAT_TIMEOUT_MS = 1200;
const TICK_INTERVAL_MS = 200;

const instanceId = Math.random().toString(36).slice(2);

type TelemetryListener = (t: Telemetry) => void;
type ConnectionListener = (ready: boolean, isPrimary: boolean) => void;

const listeners = new Set<TelemetryListener>();
const connectionListeners = new Set<ConnectionListener>();

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function noise(scale: number) {
  return (Math.random() - 0.5) * scale;
}

export function createInitialTelemetry(): Telemetry {
  return {
    timestamp: Date.now(),
    rpm: 0,
    cht: 0,
    egt: 0,
    oilPressure: 0,
    oilTemperature: 0,
    fuelFlow: 0,
    vibration: 0,
    batteryVoltage: 0,
    alternatorCurrent: 0,
    injectionTiming: 0,
    ambientTemperature: 0,
    altitude: 0,
    throttle: 0,
    engineState: "OFF",
    mode: "IDLE",
    fault: null
  };
}

/* ===================== PHYSICS STATE ===================== */

let t = 0;
let engineState: Telemetry["engineState"] = "OFF";
let mode: EngineMode = "IDLE";
let throttleCommand = 0;
let throttle = 0;
let rpm = 0;
let activeFault: FaultType = null;
let overrides: Partial<Record<ManualField, { enabled: boolean; value: number }>> = {};

let lastTelemetry: Telemetry = createInitialTelemetry();
let isPrimary = false;
let ready = false;

let channel: BroadcastChannel | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let electionTimer: ReturnType<typeof setTimeout> | null = null;

function applyOverride(field: ManualField, computed: number): number {
  const o = overrides[field];
  return o && o.enabled && Number.isFinite(o.value) ? o.value : computed;
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
    if (rpm < 1) rpm = 0;
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

function calculateMode(): EngineMode {
  if (engineState !== "RUNNING") return "IDLE";
  if (throttle >= 0.8) return "HIGH LOAD";
  if (throttle >= 0.35) return "CRUISE";
  return "IDLE";
}

function tick(): Telemetry {
  t += 0.2;

  updateThrottle();
  updateEngineState();
  rpm = applyOverride("rpm", rpm);
  mode = calculateMode();

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
    vibration += noise(1.5);
    cht += noise(8);
  }

  let ambientTemperature = 30 + 5 * Math.sin(t / 30);
  let altitude = 2500 + 500 * Math.sin(t / 40);

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

/* ===================== COMMAND HANDLING ===================== */

function applyCommand(command: EngineCommand) {
  switch (command.type) {
    case "START":
      if (engineState === "OFF") engineState = "STARTING";
      break;
    case "STOP":
      if (engineState === "RUNNING" || engineState === "STARTING") engineState = "STOPPING";
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
      overrides[command.field] = { enabled: command.enabled, value: command.value };
      break;
    case "CLEAR_ALL_OVERRIDES":
      overrides = {};
      break;
    default:
      break;
  }
}

/* ===================== LEADER ELECTION / SYNC ===================== */

function emit(data: Telemetry) {
  lastTelemetry = data;
  listeners.forEach((l) => l(data));
}

function notifyConnection() {
  connectionListeners.forEach((l) => l(ready, isPrimary));
}

function startTickLoop() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    const data = tick();
    emit(data);
    channel?.postMessage({ type: "telemetry", payload: data });
  }, TICK_INTERVAL_MS);
}

function stopTickLoop() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}

function writeHeartbeat() {
  try {
    localStorage.setItem(HEARTBEAT_KEY, JSON.stringify({ id: instanceId, ts: Date.now() }));
  } catch {
    /* ignore (private browsing, storage disabled, etc.) */
  }
}

function readHeartbeat(): { id: string; ts: number } | null {
  try {
    const raw = localStorage.getItem(HEARTBEAT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function becomePrimary() {
  isPrimary = true;
  ready = true;
  writeHeartbeat();
  heartbeatTimer = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);
  startTickLoop();
  notifyConnection();
}

function becomeFollower() {
  isPrimary = false;
  ready = true;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  stopTickLoop();
  notifyConnection();
}

function scheduleElectionCheck() {
  electionTimer = setTimeout(() => {
    if (!isPrimary) {
      const hb = readHeartbeat();
      const stale = !hb || Date.now() - hb.ts > HEARTBEAT_TIMEOUT_MS;
      if (stale) becomePrimary();
    }
    scheduleElectionCheck();
  }, HEARTBEAT_TIMEOUT_MS / 2 + Math.random() * 200);
}

function init() {
  if (typeof window === "undefined") return;

  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event) => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === "telemetry" && !isPrimary) {
        emit(msg.payload);
      }

      if (msg.type === "command" && isPrimary) {
        applyCommand(msg.payload);
      }
    };
  }

  const hb = readHeartbeat();
  const stale = !hb || Date.now() - hb.ts > HEARTBEAT_TIMEOUT_MS;

  if (stale || !channel) {
    becomePrimary();
  } else {
    becomeFollower();
  }

  if (channel) scheduleElectionCheck();

  window.addEventListener("beforeunload", () => {
    if (isPrimary) {
      try {
        localStorage.removeItem(HEARTBEAT_KEY);
      } catch {
        /* ignore */
      }
    }
  });
}

init();

/* ===================== PUBLIC API ===================== */

export function dispatch(command: EngineCommand) {
  if (isPrimary || !channel) {
    applyCommand(command);
  } else {
    channel.postMessage({ type: "command", payload: command });
  }
}

export function subscribe(listener: TelemetryListener): () => void {
  listeners.add(listener);
  listener(lastTelemetry);
  return () => listeners.delete(listener);
}

export function subscribeConnection(listener: ConnectionListener): () => void {
  connectionListeners.add(listener);
  listener(ready, isPrimary);
  return () => connectionListeners.delete(listener);
}

export function getSnapshot(): Telemetry {
  return lastTelemetry;
}

/**
 * Hook for a future real-sensor bridge (CAN/ECU/FADEC): call this
 * from a WebSocket/IPC handler instead of relying on tick() and the
 * downstream dashboard, health, and degradation layers keep working
 * unchanged.
 */
export function ingestExternal(data: Telemetry) {
  emit(data);
  channel?.postMessage({ type: "telemetry", payload: data });
}