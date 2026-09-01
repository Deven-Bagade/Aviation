import { useEffect, useMemo, useRef, useState } from "react";

import Engine3D from "./components/Engine3D";
import Gauge from "./components/Gauge";
import TrendChart from "./components/TrendChart";
import SimulationControlPanel from "./components/Simulation/SimulationControlPanel";

import { calculateHealth } from "./health";
import { createInitialDegradationState, updateDegradation } from "./simulation/degradation";
import {
  createInitialTelemetry,
  dispatch,
  subscribe,
  subscribeConnection
} from "./simulation/telemetryEngine";

import { EngineMode, FaultType, Health, ManualField, Telemetry } from "./types";

const MAX_HISTORY = 180;

type Tab = "DASHBOARD" | "SIMULATION";

function getQueryParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

export default function App() {
  const lastTsRef = useRef<number>(Date.now());

  const [tab, setTab] = useState<Tab>(() =>
    getQueryParam("tab") === "SIMULATION" ? "SIMULATION" : "DASHBOARD"
  );
  const isFocusedPopout = useMemo(() => getQueryParam("focus") === "1", []);

  const [telemetry, setTelemetry] = useState<Telemetry>(() => createInitialTelemetry());
  const [history, setHistory] = useState<Telemetry[]>([]);
  const [ready, setReady] = useState(false);
  const [isPrimary, setIsPrimary] = useState(false);
  const [health, setHealth] = useState<Health>(() => calculateHealth(createInitialTelemetry()));
  const [degradation, setDegradation] = useState(() => createInitialDegradationState());
  const [throttleCommand, setThrottleCommand] = useState(0.62);

  /* ===================== TELEMETRY ENGINE SUBSCRIPTION ===================== */

  useEffect(() => {
    const unsubTelemetry = subscribe((data) => {
      const now = data.timestamp || Date.now();
      const dtSeconds = (now - lastTsRef.current) / 1000;
      lastTsRef.current = now;

      setTelemetry(data);
      setHealth(calculateHealth(data));
      setDegradation((prev) => updateDegradation(prev, data, dtSeconds));
      setHistory((old) => [...old, data].slice(-MAX_HISTORY));
    });

    const unsubConnection = subscribeConnection((isReady, primary) => {
      setReady(isReady);
      setIsPrimary(primary);
    });

    return () => {
      unsubTelemetry();
      unsubConnection();
    };
  }, []);

  /* ===================== COMMANDS ===================== */

  const startEngine = () => dispatch({ type: "START" });
  const stopEngine = () => dispatch({ type: "STOP" });

  const changeThrottle = (value: number) => {
    setThrottleCommand(value);
    dispatch({ type: "SET_THROTTLE", value });
  };

  const changeMode = (value: EngineMode) => dispatch({ type: "SET_MODE", value });

  const injectFault = (fault: Exclude<FaultType, null>) => dispatch({ type: "INJECT_FAULT", fault });

  const clearFault = () => dispatch({ type: "CLEAR_FAULT" });

  const setOverride = (field: ManualField, enabled: boolean, value: number) =>
    dispatch({ type: "SET_MANUAL_OVERRIDE", field, enabled, value });

  const clearAllOverrides = () => dispatch({ type: "CLEAR_ALL_OVERRIDES" });

  const openPopout = (target: Tab) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", target);
    url.searchParams.set("focus", "1");

    const features =
      target === "SIMULATION"
        ? "width=520,height=940,left=120,top=80"
        : "width=1280,height=920,left=120,top=80";

    window.open(url.toString(), `aero-twin-${target.toLowerCase()}`, features);
  };

  /* ===================== DISPLAY VALUES ===================== */

  const lastUpdate = useMemo(() => {
    if (!telemetry.timestamp) return "--";
    return new Date(telemetry.timestamp).toLocaleTimeString();
  }, [telemetry.timestamp]);

  const operatingState = useMemo(() => {
    switch (telemetry.engineState) {
      case "OFF":
        return "ENGINE OFF";
      case "STARTING":
        return "STARTING";
      case "STOPPING":
        return "STOPPING";
      case "RUNNING":
        if (telemetry.throttle >= 0.8) return "HIGH LOAD";
        if (telemetry.throttle >= 0.35) return "CRUISE";
        return "IDLE";
      default:
        return "UNKNOWN";
    }
  }, [telemetry.engineState, telemetry.throttle]);

  const connectionLabel = !ready
    ? "INITIALIZING…"
    : isPrimary
    ? "LIVE TELEMETRY · PRIMARY"
    : "LIVE TELEMETRY · SYNCED";

  /* ===================== RENDER ===================== */

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <div className="eyebrow">SIH26054 · DRDO · Robotics & Drones</div>
          <h1>Aero Piston Engine Digital Twin</h1>
        </div>

        <div className="connection">
          <span className={`status-dot ${ready ? "online" : "offline"}`} />
          {connectionLabel}
          <span className="last">Updated {lastUpdate}</span>
        </div>
      </header>

      <nav className="tab-bar">
        {!isFocusedPopout && (
          <>
            <button
              className={`tab-button ${tab === "DASHBOARD" ? "active" : ""}`}
              onClick={() => setTab("DASHBOARD")}
            >
              DASHBOARD
            </button>
            <button
              className={`tab-button ${tab === "SIMULATION" ? "active" : ""}`}
              onClick={() => setTab("SIMULATION")}
            >
              SIMULATION / MANUAL CONTROL
            </button>
          </>
        )}

        <button
          className="popout-button"
          onClick={() => openPopout(tab === "SIMULATION" ? "DASHBOARD" : "SIMULATION")}
        >
          {tab === "SIMULATION" ? "OPEN DASHBOARD IN NEW WINDOW ↗" : "OPEN CONTROL PANEL IN NEW WINDOW ↗"}
        </button>
      </nav>

      {tab === "SIMULATION" && (
        <SimulationControlPanel
          telemetry={telemetry}
          connected={ready}
          throttleCommand={throttleCommand}
          onThrottleChange={changeThrottle}
          onModeChange={changeMode}
          onStart={startEngine}
          onStop={stopEngine}
          onInjectFault={injectFault}
          onClearFault={clearFault}
          onSetOverride={setOverride}
          onClearAllOverrides={clearAllOverrides}
        />
      )}

      {tab === "DASHBOARD" && (
        <>
          <section className="hero-grid">
            <div className="panel engine-panel">
              <div className="panel-title">
                <span>3D ENGINE TWIN</span>
                <span className={`health-pill ${health.state.toLowerCase()}`}>{health.state}</span>
              </div>

              <Engine3D telemetry={telemetry} />

              <div className="engine-overlay">
                <div>
                  <span>Operating state</span>
                  <strong>{operatingState}</strong>
                </div>
                <div>
                  <span>Engine mode</span>
                  <strong>{telemetry.mode}</strong>
                </div>
                <div>
                  <span>RPM</span>
                  <strong>{telemetry.rpm.toFixed(0)}</strong>
                </div>
                <div>
                  <span>Altitude</span>
                  <strong>{telemetry.altitude.toFixed(0)} m</strong>
                </div>
                <div>
                  <span>Ambient</span>
                  <strong>{telemetry.ambientTemperature.toFixed(1)} °C</strong>
                </div>
                <div>
                  <span>Throttle</span>
                  <strong>{(telemetry.throttle * 100).toFixed(0)}%</strong>
                </div>
              </div>
            </div>

            <div className="panel health-panel">
              <div className="panel-title">
                <span>ENGINE HEALTH</span>
                <span>EHI</span>
              </div>

              <div className="ehi">
                {health.ehi.toFixed(0)}
                <small>/100</small>
              </div>

              <div className="health-bar">
                <div style={{ width: `${health.ehi}%` }} />
              </div>

              <div className="health-row">
                <span>Engine state</span>
                <b>{telemetry.engineState}</b>
              </div>
              <div className="health-row">
                <span>Operating mode</span>
                <b>{telemetry.mode}</b>
              </div>
              <div className="health-row">
                <span>Degradation (session)</span>
                <b>{degradation.overallDegradation.toFixed(1)}%</b>
              </div>
              <div className="health-row">
                <span>Estimated RUL</span>
                <b>{health.rulHours.toFixed(0)} h</b>
              </div>
              <div className="health-row">
                <span>Running hours (session)</span>
                <b>{degradation.runningHours.toFixed(2)} h</b>
              </div>
              <div className="health-row">
                <span>Fault indicators</span>
                <b>{health.faults.length}</b>
              </div>
            </div>
          </section>

          <section className="gauges-grid">
            <Gauge label="RPM" value={telemetry.rpm} unit="rpm" min={0} max={4000} warning={3300} critical={3800} />
            <Gauge label="Cylinder Head Temp" value={telemetry.cht} unit="°C" min={50} max={240} warning={190} critical={215} />
            <Gauge label="Exhaust Gas Temp" value={telemetry.egt} unit="°C" min={300} max={950} warning={790} critical={880} />
            <Gauge label="Oil Pressure" value={telemetry.oilPressure} unit="bar" min={0} max={7} warning={5.8} critical={6.4} />
            <Gauge label="Oil Temperature" value={telemetry.oilTemperature} unit="°C" min={30} max={140} warning={115} critical={125} />
            <Gauge label="Fuel Flow" value={telemetry.fuelFlow} unit="L/h" min={0} max={40} warning={30} critical={36} />
            <Gauge label="Vibration" value={telemetry.vibration} unit="g" min={0} max={6} warning={3.5} critical={5} />
            <Gauge label="Battery" value={telemetry.batteryVoltage} unit="V" min={20} max={32} warning={30} critical={31} />
          </section>

          <section className="panel subsystem-panel">
            <div className="panel-title">
              <span>SUBSYSTEM STATUS</span>
              <span>DEGRADATION TRACKING</span>
            </div>

            <div className="subsystem-status-grid">
              {degradation.subsystems.map((s) => (
                <div className={`subsystem-card status-${s.status.toLowerCase()}`} key={s.key}>
                  <div className="subsystem-card-header">
                    <span>{s.label}</span>
                    <span className={`status-pill ${s.status.toLowerCase()}`}>{s.status}</span>
                  </div>
                  <div className="subsystem-bar">
                    <div style={{ width: `${s.degradation}%` }} />
                  </div>
                  <div className="subsystem-meta">
                    <span>Health {s.score.toFixed(0)}%</span>
                    <span>Wear {s.degradation.toFixed(1)}%</span>
                    <span>~{s.estimatedHoursRemaining.toFixed(0)} h left</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="lower-grid">
            <div className="panel">
              <div className="panel-title">
                <span>LIVE TRENDS</span>
                <span>{history.length} / {MAX_HISTORY} samples</span>
              </div>
              <TrendChart data={history} />
            </div>

            <div className="panel advisory">
              <div className="panel-title">
                <span>ALERTS / ANALYTICS LAYER</span>
                <span>Prototype (rule-based)</span>
              </div>

              {health.faults.length === 0 && !telemetry.fault ? (
                <div className="all-good">No current fault indicators detected.</div>
              ) : (
                <div className="alerts">
                  {health.faults.map((fault, i) => (
                    <div className="alert" key={fault}>
                      <b>{fault}</b>
                      <span>{health.explanations[i]}</span>
                    </div>
                  ))}
                  {telemetry.fault && (
                    <div className="alert">
                      <b>Injected fault</b>
                      <span>{telemetry.fault}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="recommendation">
                <b>Maintenance advisory</b>
                <p>
                  {health.state === "NORMAL"
                    ? "Continue monitoring. Maintain mission telemetry capture for degradation trending."
                    : health.state === "WARNING"
                    ? "Monitor the highlighted parameters closely and correlate abnormal readings with operating conditions."
                    : health.state === "DEGRADED"
                    ? "Investigate the affected subsystem and review recent telemetry history before continued operation."
                    : "Critical engine condition detected. Review telemetry and investigate the affected subsystem before operation continues."}
                </p>
              </div>
            </div>

            <div className="panel predicted-panel">
              <div className="panel-title">
                <span>PREDICTED FAILURES</span>
                <span>{degradation.predictedFailures.length} active</span>
              </div>

              {degradation.predictedFailures.length === 0 ? (
                <div className="all-good">No subsystem currently shows an accelerated wear trend.</div>
              ) : (
                <div className="predicted-list">
                  {degradation.predictedFailures.map((p) => (
                    <div className={`predicted-card severity-${p.severity.toLowerCase()}`} key={p.subsystem}>
                      <div className="predicted-header">
                        <b>{p.label}</b>
                        <span className={`status-pill ${p.severity.toLowerCase()}`}>{p.severity}</span>
                      </div>
                      <p>{p.description}</p>
                      <div className="predicted-meta">
                        <span>ETA to failure: ~{p.estimatedHoursRemaining.toFixed(0)} h</span>
                      </div>
                      <div className="predicted-recommendation">{p.recommendation}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      <footer>
        Digital twin demonstrator · Synthetic real-time telemetry + physics-based engine model ·
        rule-based health/degradation analytics · Prototype thresholds are illustrative and must be
        validated against engine-specific data. AI/ML layer not yet implemented.
      </footer>
    </main>
  );
}