
import React, {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  ErrorInfo,
  ReactNode
} from "react";

import {
  EngineCommand,
  EngineMode,
  FaultType,
  ManualField,
  Telemetry
} from "./types";

import {
  telemetryEngine
} from "./simulation/telemetryEngine";

import {
  missionEngine
} from "./simulation/missionEngine";

import {
  recorder
} from "./db/recorder";

import MissionPlanner
  from "./components/MissionPlanner";

import MissionReplay
  from "./components/MissionReplay";

import HistoryPanel
  from "./components/HistoryPanel";

import PerformanceMapsPanel
  from "./components/PerformanceMapsPanel";

import Engine3D
  from "./components/Engine3D";

import Gauge
  from "./components/Gauge";

import TrendChart
  from "./components/TrendChart";

import AIInsightPanel
  from "./components/AI/AIInsightPanel";

import SimulationControlPanel
  from "./components/Simulation/SimulationControlPanel";

import { useAIInsight }
  from "./ai/useAIInsight";

import FleetView
  from "./components/FleetView";

import {
  FleetAirframeSummary,
  upsertFleetSummary,
  getFleetRoster,
  addToFleetRoster,
  subscribeFleetSummaries
} from "./db/fleetStore";

import { useAuth }
  from "./auth/AuthContext";

// @ts-expect-error CSS side-effect import
import "./styles.css";


/* ============================================================
 * TYPES
 * ========================================================== */

type AppTab =
  | "dashboard"
  | "mission"
  | "replay"
  | "history"
  | "maps"
  | "fleet";

type DashboardView =
  | "overview"
  | "telemetry"
  | "simulation";


const TELEMETRY_HISTORY_LIMIT = 300;


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


function formatNumber(
  value: number | undefined,
  decimals = 1
): string {

  if (
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "--";
  }

  return value.toFixed(decimals);
}


function getHealthStatus(
  telemetry: Telemetry
): {
  label: string;
  className: string;
} {

  if (
    telemetry.cht >= 200 ||
    telemetry.egt >= 900 ||
    telemetry.oilPressure < 1.5 ||
    telemetry.vibration >= 1
  ) {
    return {
      label: "CRITICAL",
      className: "critical"
    };
  }

  if (
    telemetry.cht >= 185 ||
    telemetry.egt >= 820 ||
    telemetry.oilPressure < 2
  ) {
    return {
      label: "WARNING",
      className: "warning"
    };
  }

  return {
    label: "HEALTHY",
    className: "healthy"
  };
}


/* ============================================================
 * 3D ERROR BOUNDARY
 * ========================================================== */

interface Engine3DBoundaryState {
  hasError: boolean;
}

class Engine3DBoundary extends Component<
  { children: ReactNode },
  Engine3DBoundaryState
> {

  state: Engine3DBoundaryState = {
    hasError: false
  };


  static getDerivedStateFromError() {
    return {
      hasError: true
    };
  }


  componentDidCatch(
    error: Error,
    info: ErrorInfo
  ) {

    console.error(
      "Engine3D render error:",
      error,
      info
    );
  }


  componentDidUpdate(
    _: unknown,
    previousState: Engine3DBoundaryState
  ) {

    if (
      previousState.hasError
    ) {

      this.setState({
        hasError: false
      });

    }
  }


  render() {

    if (
      this.state.hasError
    ) {

      return (
        <div className="engine3d-fallback">
          Reconnecting 3D view…
        </div>
      );
    }

    return this.props.children;
  }
}


/* ============================================================
 * APP
 * ========================================================== */

export default function App() {

  const [
    activeTab,
    setActiveTab
  ] = useState<AppTab>(
    "dashboard"
  );


  const [
    dashboardView,
    setDashboardView
  ] = useState<DashboardView>(
    "overview"
  );


  const [
    telemetry,
    setTelemetry
  ] = useState<Telemetry>(
    telemetryEngine.getTelemetry()
  );


  const [
    telemetryHistory,
    setTelemetryHistory
  ] = useState<Telemetry[]>(
    () => [
      telemetryEngine.getTelemetry()
    ]
  );


  const [
    missionState,
    setMissionState
  ] = useState(
    missionEngine.getState()
  );


  const [
    connected,
    setConnected
  ] = useState(true);

  const [
    recording,
    setRecording
  ] = useState(false);


  const { user, logout, can } = useAuth();


  const [tailNumber, setTailNumber] = useState("UAV-01");
  const [roster, setRoster] = useState<string[]>(() => getFleetRoster());
  const [addingTail, setAddingTail] = useState(false);
  const [newTailInput, setNewTailInput] = useState("");

  useEffect(() => {
    const refreshRoster = () => setRoster(getFleetRoster());
    return subscribeFleetSummaries(refreshRoster);
  }, []);

  const handleAddTail = () => {
    const trimmed = newTailInput.trim().toUpperCase();
    if (!trimmed) return;
    addToFleetRoster(trimmed);
    setTailNumber(trimmed);
    setNewTailInput("");
    setAddingTail(false);
  };


  /* ==========================================================
   * TELEMETRY
   * ======================================================== */
  useEffect(() => {

    telemetryEngine.start();

    const unsubscribe =
      telemetryEngine.subscribe(
        (nextTelemetry) => {

          setTelemetry(
            nextTelemetry
          );

          setTelemetryHistory(
            previous => {

              const next = [
                ...previous,
                nextTelemetry
              ];

              if (
                next.length >
                TELEMETRY_HISTORY_LIMIT
              ) {

                next.splice(
                  0,
                  next.length -
                    TELEMETRY_HISTORY_LIMIT
                );
              }

              return next;
            }
          );
        }
      );


    return () => {

      unsubscribe();

      telemetryEngine.stop();
    };

  }, []);


  /* ==========================================================
   * MISSION
   * ======================================================== */

  useEffect(() => {

    return missionEngine.subscribe(
      () => {

        setMissionState(
          missionEngine.getState()
        );
      }
    );

  }, []);


  /* ==========================================================
   * RECORDER
   * ======================================================== */

  useEffect(() => {

    recorder.start();

    return () => {

      recorder.stop();

    };

  }, []);


  useEffect(() => {

    const unsubscribe =
      telemetryEngine.subscribe(
        async nextTelemetry => {

          if (!recording) {
            return;
          }

          try {

            recorder.recordTelemetry(
              nextTelemetry
            );

          } catch (error) {

            console.error(
              "Telemetry recording error:",
              error
            );
          }

        }
      );

    return unsubscribe;

  }, [recording]);


  /* ==========================================================
   * CONNECTION
   * ======================================================== */

  useEffect(() => {

    const updateConnection = () => {

      setConnected(
        navigator.onLine
      );

    };

    updateConnection();

    window.addEventListener(
      "online",
      updateConnection
    );

    window.addEventListener(
      "offline",
      updateConnection
    );

    return () => {

      window.removeEventListener(
        "online",
        updateConnection
      );

      window.removeEventListener(
        "offline",
        updateConnection
      );

    };

  }, []);


  /* ==========================================================
   * COMMANDS
   * ======================================================== */

  const sendCommand = (
    command: EngineCommand
  ) => {

    telemetryEngine.executeCommand(
      command
    );

  };


  const startEngine = () => {

    sendCommand({
      type: "START"
    });

  };


  const stopEngine = () => {

    sendCommand({
      type: "STOP"
    });

  };


  const emergencyStop = () => {

    sendCommand({
      type: "SET_THROTTLE",
      value: 0
    });

    sendCommand({
      type: "STOP"
    });

  };


  const handleThrottleChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {

    sendCommand({
      type: "SET_THROTTLE",
      value: clamp(
        Number(event.target.value),
        0,
        1
      )
    });

  };


  const injectFault = (
    fault: Exclude<FaultType, null> =
      "HIGH_TEMP"
  ) => {

    sendCommand({
      type: "INJECT_FAULT",
      fault
    });

  };


  const clearFault = () => {

    sendCommand({
      type: "CLEAR_FAULT"
    });

  };


  const handleModeChange = (
    value: EngineMode
  ) => {

    sendCommand({
      type: "SET_MODE",
      value
    });

  };


  const handleSetOverride = (
    field: ManualField,
    enabled: boolean,
    value: number
  ) => {

    sendCommand({
      type: "SET_MANUAL_OVERRIDE",
      field,
      enabled,
      value
    });

  };


  const handleClearAllOverrides = () => {

    sendCommand({
      type: "CLEAR_ALL_OVERRIDES"
    });

  };


  /* ==========================================================
   * RECORDING
   * ======================================================== */

  const toggleRecording = async () => {

    if (recording) {

      await recorder.flush();

      setRecording(false);

      return;
    }


    if (
      missionState.missionId
    ) {

      recorder.setMission(
        missionState.missionId
      );

    }

    setRecording(true);

  };


  useEffect(() => {

    if (
      missionState.missionId
    ) {

      recorder.setMission(
        missionState.missionId
      );

    }

  }, [
    missionState.missionId
  ]);


  /* ==========================================================
   * DERIVED STATE
   * ======================================================== */

  const healthStatus =
    useMemo(
      () =>
        getHealthStatus(
          telemetry
        ),
      [telemetry]
    );


  const loadPercentage =
    clamp(
      (telemetry.loadFraction ?? 0) * 100,
      0,
      100
    );


  const aiInsight =
    useAIInsight(
      telemetry,
      telemetryHistory
    );


  const fleetSnapshotRef = useRef({ telemetry, healthStatus, aiInsight });
  fleetSnapshotRef.current = { telemetry, healthStatus, aiInsight };

  useEffect(() => {
    const pushFleetSummary = () => {
      const snap = fleetSnapshotRef.current;

      const score =
        snap.healthStatus.label === "HEALTHY" ? 98 :
        snap.healthStatus.label === "WARNING" ? 72 : 38;

      const healthState: FleetAirframeSummary["healthState"] =
        snap.healthStatus.label === "HEALTHY" ? "NORMAL" :
        snap.healthStatus.label === "WARNING" ? "WARNING" : "CRITICAL";

      upsertFleetSummary({
        tailNumber,
        updatedAt: Date.now(),
        engineState: snap.telemetry.engineState,
        mode: snap.telemetry.mode,
        ehi: score,
        healthState,
        rulHours: snap.aiInsight.rul?.blendedHours ?? 0,
        degradationPct: 100 - score,
        activeFault: snap.telemetry.fault,
        missionId: missionState.missionId ?? null
      });
    };

    pushFleetSummary();
    const interval = setInterval(pushFleetSummary, 3000);
    return () => clearInterval(interval);
  }, [tailNumber, missionState.missionId]);


  /* ==========================================================
   * NAVIGATION
   * ======================================================== */
  const navigate = (
    tab: AppTab
  ) => {

    setActiveTab(tab);

  };


  /* ==========================================================
   * RENDER
   * ======================================================== */

  return (
    <div className="app-shell">

      {/* ======================================================
       * FIXED TOP HEADER
       * ==================================================== */}

      <header className="app-header">

        <div className="app-brand">

          <div className="app-brand-mark">
            DT
          </div>

          <div>
            <h1>
              UAV Engine Digital Twin
            </h1>

            <span>
              Real-Time Health &
              Mission Reliability
            </span>
          </div>

        </div>


        <div className="header-status">

          <div className="tail-selector">
            <span>Airframe:</span>
            <select
              value={tailNumber}
              onChange={(e) => setTailNumber(e.target.value)}
            >
              <option value="UAV-01">UAV-01</option>
              <option value="UAV-02">UAV-02</option>
              <option value="UAV-03">UAV-03</option>
            </select>
          </div>

          <div
            className={
              `connection-status ${
                connected
                  ? "online"
                  : "offline"
              }`
            }
          >

            <span className="status-dot" />

            {connected
              ? "SYSTEM ONLINE"
              : "OFFLINE"}

          </div>


          <div
            className={
              `engine-state ${
                telemetry.engineState
                  .toLowerCase()
              }`
            }
          >
            {telemetry.engineState}
          </div>

        </div>

      </header>


      {/* ======================================================
       * MAIN TOP NAVIGATION
       * ==================================================== */}

      <nav className="main-navigation">

        <button
          className={
            activeTab === "dashboard"
              ? "active"
              : ""
          }
          onClick={() =>
            navigate("dashboard")
          }
        >
          <span>01</span>
          Dashboard
        </button>


        <button
          className={
            activeTab === "mission"
              ? "active"
              : ""
          }
          onClick={() =>
            navigate("mission")
          }
        >
          <span>02</span>
          Mission Planner
        </button>


        <button
          className={
            activeTab === "replay"
              ? "active"
              : ""
          }
          onClick={() =>
            navigate("replay")
          }
        >
          <span>03</span>
          Mission Replay
        </button>


        <button
          className={
            activeTab === "history"
              ? "active"
              : ""
          }
          onClick={() =>
            navigate("history")
          }
        >
          <span>04</span>
          History
        </button>


        <button
          className={
            activeTab === "maps"
              ? "active"
              : ""
          }
          onClick={() =>
            navigate("maps")
          }
        >
          <span>05</span>
          Performance Maps
        </button>


        <button
          className={
            activeTab === "fleet"
              ? "active"
              : ""
          }
          onClick={() =>
            navigate("fleet")
          }
        >
          <span>06</span>
          Fleet
        </button>

      </nav>


      {/* ======================================================
       * CONTENT
       * ==================================================== */}

      <main className="app-content">


        {/* ====================================================
         * DASHBOARD
         * ================================================== */}

        {activeTab === "dashboard" && (

          <div className="dashboard-workspace">


            {/* -----------------------------------------------
             * DASHBOARD SUB NAV
             * --------------------------------------------- */}

            <div className="dashboard-subnav">

              <div className="dashboard-subnav-left">

                <button
                  className={
                    dashboardView === "overview"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setDashboardView(
                      "overview"
                    )
                  }
                >
                  Overview
                </button>


                <button
                  className={
                    dashboardView === "telemetry"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setDashboardView(
                      "telemetry"
                    )
                  }
                >
                  Telemetry
                </button>


                <button
                  className={
                    dashboardView === "simulation"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setDashboardView(
                      "simulation"
                    )
                  }
                >
                  Simulation
                </button>

              </div>


              <div className="dashboard-live">

                <span className="live-dot" />

                LIVE

                <span className="live-divider" />

                {formatNumber(
                  telemetry.rpm,
                  0
                )} RPM

              </div>

            </div>


            {/* ==================================================
             * OVERVIEW
             * ================================================= */}

            {dashboardView === "overview" && (

              <div className="overview-layout">


                {/* ---------------------------------------------
                 * TOP STATUS STRIP
                 * ------------------------------------------- */}

                <section className="status-strip">

                  <StatusMetric
                    label="ENGINE"
                    value={
                      telemetry.engineState
                    }
                    sub={
                      telemetry.mode
                    }
                  />

                  <StatusMetric
                    label="HEALTH"
                    value={
                      healthStatus.label
                    }
                    sub={
                      telemetry.fault ??
                      "No active fault"
                    }
                    className={
                      healthStatus.className
                    }
                  />

                  <StatusMetric
                    label="LOAD"
                    value={
                      `${formatNumber(
                        loadPercentage,
                        0
                      )}%`
                    }
                    sub="Current engine load"
                  />

                  <StatusMetric
                    label="MISSION"
                    value={
                      missionState.missionId
                        ? `STAGE ${
                            missionState.stageIndex + 1
                          }`
                        : "IDLE"
                    }
                    sub={
                      missionState.missionId
                        ? "Mission active"
                        : "No active mission"
                    }
                  />

                </section>


                {/* ---------------------------------------------
                 * MAIN WORKSPACE
                 * ------------------------------------------- */}

                <div className="workspace-grid">


                  {/* 3D ENGINE */}

                  <section className="panel engine-workspace">

                    <div className="panel-heading">

                      <div>
                        <span className="panel-kicker">
                          DIGITAL TWIN
                        </span>

                        <h2>
                          Engine — Live 3D
                        </h2>
                      </div>


                      <div
                        className={
                          `engine3d-state ${
                            telemetry.engineState
                              .toLowerCase()
                          }`
                        }
                      >
                        {telemetry.engineState}
                      </div>

                    </div>


                    <Engine3DBoundary>

                      <Engine3D
                        telemetry={
                          telemetry
                        }
                      />

                    </Engine3DBoundary>


                    <div className="engine-data-strip">

                      <MiniMetric
                        label="RPM"
                        value={formatNumber(
                          telemetry.rpm,
                          0
                        )}
                      />

                      <MiniMetric
                        label="CHT"
                        value={`${formatNumber(
                          telemetry.cht,
                          0
                        )}°`}
                      />

                      <MiniMetric
                        label="EGT"
                        value={`${formatNumber(
                          telemetry.egt,
                          0
                        )}°`}
                      />

                      <MiniMetric
                        label="VIB"
                        value={formatNumber(
                          telemetry.vibration,
                          2
                        )}
                      />

                      <MiniMetric
                        label="OIL"
                        value={`${formatNumber(
                          telemetry.oilPressure,
                          1
                        )} bar`}
                      />

                      <MiniMetric
                        label="LOAD"
                        value={`${formatNumber(
                          loadPercentage,
                          0
                        )}%`}
                      />

                    </div>

                  </section>


                  {/* RIGHT COLUMN */}

                  <div className="overview-side">


                    {/* HEALTH */}

                    <section className="panel health-card">

                      <div className="panel-heading">

                        <div>
                          <span className="panel-kicker">
                            CONDITION
                          </span>

                          <h2>
                            Engine Health
                          </h2>
                        </div>

                        <span
                          className={
                            `health-pill ${
                              healthStatus.className
                            }`
                          }
                        >
                          {healthStatus.label}
                        </span>

                      </div>


                      <div className="health-score">

                        <strong>
                          {healthStatus.label ===
                            "HEALTHY"
                            ? "98"
                            : healthStatus.label ===
                              "WARNING"
                            ? "72"
                            : "38"}
                        </strong>

                        <span>
                          /100
                        </span>

                      </div>


                      <div className="health-progress">

                        <div
                          className={
                            `health-progress-fill ${
                              healthStatus.className
                            }`
                          }
                          style={{
                            width:
                              healthStatus.label ===
                              "HEALTHY"
                                ? "98%"
                                : healthStatus.label ===
                                  "WARNING"
                                ? "72%"
                                : "38%"
                          }}
                        />

                      </div>


                      <div className="health-details">

                        <div>
                          <span>
                            CHT
                          </span>
                          <b>
                            {formatNumber(
                              telemetry.cht,
                              1
                            )} °C
                          </b>
                        </div>

                        <div>
                          <span>
                            EGT
                          </span>
                          <b>
                            {formatNumber(
                              telemetry.egt,
                              1
                            )} °C
                          </b>
                        </div>

                        <div>
                          <span>
                            OIL
                          </span>
                          <b>
                            {formatNumber(
                              telemetry.oilPressure,
                              2
                            )} bar
                          </b>
                        </div>

                        <div>
                          <span>
                            VIBRATION
                          </span>
                          <b>
                            {formatNumber(
                              telemetry.vibration,
                              2
                            )} g
                          </b>
                        </div>

                      </div>

                    </section>


                    {/* AI */}

                    <AIInsightPanel
                      insight={aiInsight}
                    />

                  </div>

                </div>


                {/* ---------------------------------------------
                 * GAUGE MATRIX
                 * ------------------------------------------- */}

                <section className="panel compact-section">

                  <div className="panel-heading">

                    <div>
                      <span className="panel-kicker">
                        INSTRUMENTATION
                      </span>

                      <h2>
                        Key Parameters
                      </h2>
                    </div>

                  </div>


                  <div className="compact-gauge-grid">

                    <Gauge
                      label="RPM"
                      value={telemetry.rpm}
                      unit="rpm"
                      min={0}
                      max={4000}
                    />

                    <Gauge
                      label="Cylinder Head"
                      value={telemetry.cht}
                      unit="°C"
                      min={50}
                      max={260}
                      warning={185}
                      critical={200}
                    />

                    <Gauge
                      label="Exhaust Gas"
                      value={telemetry.egt}
                      unit="°C"
                      min={300}
                      max={950}
                      warning={820}
                      critical={900}
                    />

                    <Gauge
                      label="Vibration"
                      value={telemetry.vibration}
                      unit="g"
                      min={0}
                      max={8}
                      warning={0.7}
                      critical={1}
                    />

                    <Gauge
                      label="Oil Pressure"
                      value={telemetry.oilPressure}
                      unit="bar"
                      min={0}
                      max={7}
                    />

                    <Gauge
                      label="Oil Temp"
                      value={telemetry.oilTemperature}
                      unit="°C"
                      min={30}
                      max={150}
                    />

                    <Gauge
                      label="Battery"
                      value={telemetry.batteryVoltage}
                      unit="V"
                      min={18}
                      max={32}
                    />

                    <Gauge
                      label="Alternator"
                      value={telemetry.alternatorCurrent}
                      unit="A"
                      min={-20}
                      max={60}
                    />

                  </div>

                </section>


                {/* ---------------------------------------------
                 * CONTROL STRIP
                 * ------------------------------------------- */}

                <section className="control-strip panel">

                  <div className="control-main">

                    <span className="panel-kicker">
                      ENGINE CONTROL
                    </span>


                    <div className="control-buttons">

                      <button
                        className="primary-button"
                        onClick={startEngine}
                        disabled={
                          telemetry.engineState !==
                          "OFF"
                        }
                      >
                        START
                      </button>


                      <button
                        className="secondary-button"
                        onClick={stopEngine}
                        disabled={
                          telemetry.engineState ===
                          "OFF"
                        }
                      >
                        STOP
                      </button>


                      <button
                        className="danger-button"
                        onClick={emergencyStop}
                        disabled={
                          telemetry.engineState ===
                          "OFF"
                        }
                      >
                        EMERGENCY
                      </button>

                    </div>

                  </div>


                  <div className="throttle-block">

                    <div className="throttle-header">

                      <span>
                        THROTTLE
                      </span>

                      <strong>
                        {formatNumber(
                          telemetry.throttle * 100,
                          0
                        )}%
                      </strong>

                    </div>


                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={
                        telemetry.throttle
                      }
                      onChange={
                        handleThrottleChange
                      }
                    />

                  </div>


                  <div className="control-actions">

                    {can("ADMIN") && (
                      <button
                        className="warning-button"
                        onClick={() =>
                          injectFault(
                            "HIGH_TEMP"
                          )
                        }
                      >
                        INJECT FAULT
                      </button>
                    )}


                    {can("ADMIN") && (
                      <button
                        className="secondary-button"
                        onClick={
                          clearFault
                        }
                        disabled={
                          telemetry.fault ===
                          null
                        }
                      >
                        CLEAR
                      </button>
                    )}


                    <button
                      className={
                        recording
                          ? "recording-button active"
                          : "recording-button"
                      }
                      onClick={
                        toggleRecording
                      }
                    >
                      <span className="record-dot" />
                      {recording
                        ? "RECORDING"
                        : "RECORD"}
                    </button>

                  </div>

                </section>


                {/* ---------------------------------------------
                 * TREND
                 * ------------------------------------------- */}

                <section className="overview-bottom">

                  <div className="panel trend-panel">

                    <div className="panel-heading">

                      <div>
                        <span className="panel-kicker">
                          LIVE DATA
                        </span>

                        <h2>
                          Performance Trend
                        </h2>
                      </div>

                    </div>

                    <TrendChart
                      data={
                        telemetryHistory
                      }
                    />

                  </div>

                </section>

              </div>

            )}


            {/* ==================================================
             * TELEMETRY VIEW
             * ================================================= */}

            {dashboardView === "telemetry" && (

              <div className="telemetry-workspace">


                <section className="panel">

                  <div className="panel-heading">

                    <div>
                      <span className="panel-kicker">
                        REAL-TIME DATA
                      </span>

                      <h2>
                        Engine Telemetry
                      </h2>
                    </div>

                    <span className="live-badge">
                      LIVE
                    </span>

                  </div>


                  <div className="telemetry-dense-grid">

                    <TelemetryCard
                      label="RPM"
                      value={formatNumber(
                        telemetry.rpm,
                        0
                      )}
                      unit="rpm"
                    />

                    <TelemetryCard
                      label="Brake Power"
                      value={formatNumber(
                        telemetry.brakePower,
                        2
                      )}
                      unit="kW"
                    />

                    <TelemetryCard
                      label="Torque"
                      value={formatNumber(
                        telemetry.brakeTorque,
                        1
                      )}
                      unit="Nm"
                    />

                    <TelemetryCard
                      label="Fuel Flow"
                      value={formatNumber(
                        telemetry.fuelFlow,
                        2
                      )}
                      unit="L/h"
                    />

                    <TelemetryCard
                      label="BSFC"
                      value={formatNumber(
                        telemetry.bsfc,
                        0
                      )}
                      unit="g/kWh"
                    />

                    <TelemetryCard
                      label="Air Density"
                      value={formatNumber(
                        telemetry.airDensity,
                        3
                      )}
                      unit="kg/m³"
                    />

                    <TelemetryCard
                      label="Air Mass Flow"
                      value={formatNumber(
                        telemetry.airMassFlow,
                        4
                      )}
                      unit="kg/s"
                    />

                    <TelemetryCard
                      label="Load"
                      value={formatNumber(
                        loadPercentage,
                        0
                      )}
                      unit="%"
                    />

                    <TelemetryCard
                      label="Cylinder Head Temp"
                      value={formatNumber(
                        telemetry.cht,
                        1
                      )}
                      unit="°C"
                      alert={
                        telemetry.cht >= 185
                      }
                    />

                    <TelemetryCard
                      label="Exhaust Gas Temp"
                      value={formatNumber(
                        telemetry.egt,
                        1
                      )}
                      unit="°C"
                      alert={
                        telemetry.egt >= 820
                      }
                    />

                    <TelemetryCard
                      label="Oil Temperature"
                      value={formatNumber(
                        telemetry.oilTemperature,
                        1
                      )}
                      unit="°C"
                    />

                    <TelemetryCard
                      label="Oil Pressure"
                      value={formatNumber(
                        telemetry.oilPressure,
                        2
                      )}
                      unit="bar"
                      alert={
                        telemetry.oilPressure < 2
                      }
                    />

                    <TelemetryCard
                      label="Vibration"
                      value={formatNumber(
                        telemetry.vibration,
                        2
                      )}
                      unit="g"
                      alert={
                        telemetry.vibration >= 1
                      }
                    />

                    <TelemetryCard
                      label="Battery"
                      value={formatNumber(
                        telemetry.batteryVoltage,
                        1
                      )}
                      unit="V"
                    />

                    <TelemetryCard
                      label="Alternator"
                      value={formatNumber(
                        telemetry.alternatorCurrent,
                        1
                      )}
                      unit="A"
                    />

                    <TelemetryCard
                      label="Injection Timing"
                      value={formatNumber(
                        telemetry.injectionTiming,
                        1
                      )}
                      unit="°"
                    />

                  </div>

                </section>


                <div className="two-column-grid">

                  <section className="panel">

                    <div className="panel-heading">

                      <div>
                        <span className="panel-kicker">
                          FLIGHT
                        </span>

                        <h2>
                          Environment
                        </h2>
                      </div>

                    </div>


                    <div className="telemetry-dense-grid">

                      <TelemetryCard
                        label="Altitude"
                        value={formatNumber(
                          telemetry.altitude,
                          0
                        )}
                        unit="m"
                      />

                      <TelemetryCard
                        label="Ambient Temp"
                        value={formatNumber(
                          telemetry.ambientTemperature,
                          1
                        )}
                        unit="°C"
                      />

                      <TelemetryCard
                        label="Engine State"
                        value={
                          telemetry.engineState
                        }
                        unit=""
                      />

                      <TelemetryCard
                        label="Operating Mode"
                        value={
                          telemetry.mode
                        }
                        unit=""
                      />

                    </div>

                  </section>


                  <section className="panel trend-panel">

                    <div className="panel-heading">

                      <div>
                        <span className="panel-kicker">
                          HISTORY WINDOW
                        </span>

                        <h2>
                          Live Trend
                        </h2>
                      </div>

                    </div>

                    <TrendChart
                      data={
                        telemetryHistory
                      }
                    />

                  </section>

                </div>

              </div>

            )}


            {/* ==================================================
             * SIMULATION VIEW
             * ================================================= */}

            {dashboardView === "simulation" && !can("ADMIN") && (
              <div className="simulation-workspace">
                <div className="locked-notice">
                  Manual overrides and simulation controls are restricted to Admin accounts.
                  Sign in as an Admin to access this view.
                </div>
              </div>
            )}

            {dashboardView === "simulation" && can("ADMIN") && (

              <div className="simulation-workspace">

                <SimulationControlPanel
                  telemetry={telemetry}
                  connected={connected}
                  throttleCommand={
                    telemetry.throttle
                  }
                  onThrottleChange={
                    value =>
                      sendCommand({
                        type:
                          "SET_THROTTLE",
                        value:
                          clamp(
                            value,
                            0,
                            1
                          )
                      })
                  }
                  onModeChange={
                    handleModeChange
                  }
                  onStart={
                    startEngine
                  }
                  onStop={
                    stopEngine
                  }
                  onInjectFault={
                    injectFault
                  }
                  onClearFault={
                    clearFault
                  }
                  onSetOverride={
                    handleSetOverride
                  }
                  onClearAllOverrides={
                    handleClearAllOverrides
                  }
                />

              </div>

            )}

          </div>
        )}


        {/* ====================================================
         * OTHER TOP LEVEL TABS
         * ================================================== */}

        {activeTab === "mission" && (
          <MissionPlanner />
        )}


        {activeTab === "replay" && (
          <MissionReplay />
        )}


        {activeTab === "history" && (
          <HistoryPanel />
        )}


        {activeTab === "maps" && (
          <PerformanceMapsPanel />
        )}


        {activeTab === "fleet" && (
          <FleetView />
        )}

      </main>


      {/* ======================================================
       * FIXED STATUS BAR
       * ==================================================== */}

      <footer className="app-footer">

        <div>
          <span className="footer-dot online" />
          Physics Engine
          <b>ONLINE</b>
        </div>

        <div>
          Storage
          <b>IndexedDB</b>
        </div>

        <div>
          Cloud Sync
          <b>
            {connected
              ? "AVAILABLE"
              : "OFFLINE QUEUE"}
          </b>
        </div>

        <div className="footer-right">
          UAV ENGINE DIGITAL TWIN
        </div>

      </footer>

    </div>
  );
}


/* ============================================================
 * STATUS METRIC
 * ========================================================== */

interface StatusMetricProps {
  label: string;
  value: string;
  sub: string;
  className?: string;
}


function StatusMetric({
  label,
  value,
  sub,
  className = ""
}: StatusMetricProps) {

  return (
    <div className="status-metric">

      <span className="metric-label">
        {label}
      </span>

      <strong
        className={
          className
        }
      >
        {value}
      </strong>

      <small>
        {sub}
      </small>

    </div>
  );
}


/* ============================================================
 * MINI ENGINE METRIC
 * ========================================================== */

function MiniMetric({
  label,
  value
}: {
  label: string;
  value: string;
}) {

  return (
    <div className="mini-metric">

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </div>
  );
}


/* ============================================================
 * TELEMETRY CARD
 * ========================================================== */

interface TelemetryCardProps {
  label: string;
  value: string;
  unit: string;
  alert?: boolean;
}


function TelemetryCard({
  label,
  value,
  unit,
  alert = false
}: TelemetryCardProps) {

  return (
    <div
      className={
        alert
          ? "telemetry-card alert"
          : "telemetry-card"
      }
    >

      <div className="telemetry-label">
        {label}
      </div>

      <div className="telemetry-value">

        {value}

        {unit && (
          <span>
            {unit}
          </span>
        )}

      </div>

    </div>
  );
}
