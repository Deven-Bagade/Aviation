import React, { useEffect, useMemo, useState } from "react";
import { historicalStore } from "../db/historicalDb";
import type { HistoricalMission, TelemetryRecord } from "../db/historicalStore";

type ReplaySpeed = 0.25 | 0.5 | 1 | 2 | 4;

const SPEEDS: ReplaySpeed[] = [0.25, 0.5, 1, 2, 4];
function formatNumber(value: number | undefined, digits = 0): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "--";
  }

  return value.toFixed(digits);
}

function formatTime(timestamp: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return "--:--:--";
  }

  return new Date(timestamp).toLocaleTimeString();
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "00:00";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function getMissionName(mission: HistoricalMission): string {
  return (
    (mission as HistoricalMission & { name?: string }).name ||
    (mission as HistoricalMission & { profileName?: string }).profileName ||
    mission.id
  );
}

function getMissionStage(record: TelemetryRecord): string {
  const stage = record.stageName;

  if (!stage) {
    return "UNKNOWN";
  }

  return stage.replace(/_/g, " ");
}

function getTelemetryTimestamp(record: TelemetryRecord): number {
  return (
    record.recordedAt ||
    record.timestamp ||
    (record as TelemetryRecord & { missionTimestamp?: number })
      .missionTimestamp ||
    0
  );
}

const MissionReplay: React.FC = () => {
  const [missions, setMissions] = useState<HistoricalMission[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string>("");
  const [telemetry, setTelemetry] = useState<TelemetryRecord[]>([]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);

  const [loadingMissions, setLoadingMissions] = useState(false);
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);
  const [error, setError] = useState<string>("");

  /*
   * Load historical missions.
   */
  useEffect(() => {
    let cancelled = false;

    const loadMissions = async () => {
      setLoadingMissions(true);
      setError("");

      try {
        const result = await historicalStore.getMissions();

        if (cancelled) {
          return;
        }

        const sorted = [...result].sort((a, b) => {
          return (b.startTime || 0) - (a.startTime || 0);
        });

        setMissions(sorted);

        if (sorted.length > 0) {
          setSelectedMissionId((previous) => previous || sorted[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load historical missions."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingMissions(false);
        }
      }
    };

    void loadMissions();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Load telemetry whenever the selected mission changes.
   */
  useEffect(() => {
    let cancelled = false;

    const loadTelemetry = async () => {
      if (!selectedMissionId) {
        setTelemetry([]);
        setCurrentIndex(0);
        return;
      }

      setLoadingTelemetry(true);
      setPlaying(false);
      setError("");

      try {
        const result = await historicalStore.getTelemetry(selectedMissionId);

        if (cancelled) {
          return;
        }

        const sorted = [...result].sort(
          (a, b) =>
            getTelemetryTimestamp(a) - getTelemetryTimestamp(b)
        );

        setTelemetry(sorted);
        setCurrentIndex(0);
      } catch (err) {
        if (!cancelled) {
          setTelemetry([]);
          setCurrentIndex(0);

          setError(
            err instanceof Error
              ? err.message
              : "Unable to load mission telemetry."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingTelemetry(false);
        }
      }
    };

    void loadTelemetry();

    return () => {
      cancelled = true;
    };
  }, [selectedMissionId]);

  /*
   * Replay clock.
   *
   * We intentionally advance by telemetry samples rather than attempting
   * to recreate the entire simulation. This makes historical replay
   * deterministic.
   */
  useEffect(() => {
    if (!playing || telemetry.length <= 1) {
      return;
    }

    const current = telemetry[currentIndex];
    const next = telemetry[currentIndex + 1];

    if (!current || !next) {
      setPlaying(false);
      return;
    }

    const currentTime = getTelemetryTimestamp(current);
    const nextTime = getTelemetryTimestamp(next);

    const recordedInterval = Math.max(
      50,
      Math.min(5000, nextTime - currentTime)
    );

    const interval = Math.max(
      25,
      recordedInterval / speed
    );

    const timer = window.setTimeout(() => {
      setCurrentIndex((index) => {
        if (index >= telemetry.length - 1) {
          setPlaying(false);
          return index;
        }

        return index + 1;
      });
    }, interval);

    return () => {
      window.clearTimeout(timer);
    };
  }, [playing, currentIndex, telemetry, speed]);

  const selectedMission = useMemo(() => {
    return missions.find((mission) => mission.id === selectedMissionId);
  }, [missions, selectedMissionId]);

  const currentTelemetry = telemetry[currentIndex];

  const replayStart = telemetry.length
    ? getTelemetryTimestamp(telemetry[0])
    : 0;

  const replayEnd = telemetry.length
    ? getTelemetryTimestamp(telemetry[telemetry.length - 1])
    : 0;

  const replayDuration = Math.max(0, replayEnd - replayStart);

  const currentReplayTime = currentTelemetry
    ? Math.max(0, getTelemetryTimestamp(currentTelemetry) - replayStart)
    : 0;

  const progress =
    telemetry.length > 1
      ? (currentIndex / (telemetry.length - 1)) * 100
      : 0;

  const currentStage = currentTelemetry
    ? getMissionStage(currentTelemetry)
    : "--";

  const handleSliderChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = Number(event.target.value);

    if (!Number.isFinite(value)) {
      return;
    }

    setPlaying(false);
    setCurrentIndex(
      Math.max(
        0,
        Math.min(telemetry.length - 1, Math.round(value))
      )
    );
  };

  const handleRestart = () => {
    setPlaying(false);
    setCurrentIndex(0);
  };

  const handleEnd = () => {
    setPlaying(false);
    setCurrentIndex(Math.max(0, telemetry.length - 1));
  };

  const handlePlayPause = () => {
    if (telemetry.length <= 1) {
      return;
    }

    if (currentIndex >= telemetry.length - 1) {
      setCurrentIndex(0);
      setPlaying(true);
      return;
    }

    setPlaying((value) => !value);
  };

  return (
    <section className="mission-replay">
      <div className="panel-header">
        <div>
          <h2>Mission Replay</h2>
          <p>
            Replay recorded digital-twin telemetry from a completed
            mission.
          </p>
        </div>

        <div className="mission-replay-controls">
          <label>
            Mission
            <select
              value={selectedMissionId}
              onChange={(event) =>
                setSelectedMissionId(event.target.value)
              }
              disabled={loadingMissions}
            >
              {missions.length === 0 && (
                <option value="">No missions available</option>
              )}

              {missions.map((mission) => (
                <option key={mission.id} value={mission.id}>
                  {getMissionName(mission)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error && (
        <div className="status-message error">
          {error}
        </div>
      )}

      {loadingMissions && (
        <div className="status-message">
          Loading historical missions...
        </div>
      )}

      {loadingTelemetry && (
        <div className="status-message">
          Loading mission telemetry...
        </div>
      )}

      {!loadingTelemetry &&
        selectedMissionId &&
        telemetry.length === 0 && (
          <div className="status-message">
            No telemetry has been recorded for this mission.
          </div>
        )}

      {telemetry.length > 0 && (
        <>
          <div className="replay-summary-grid">
            <div className="metric-card">
              <span>Mission</span>
              <strong>
                {selectedMission
                  ? getMissionName(selectedMission)
                  : selectedMissionId}
              </strong>
            </div>

            <div className="metric-card">
              <span>Samples</span>
              <strong>{telemetry.length}</strong>
            </div>

            <div className="metric-card">
              <span>Recorded Duration</span>
              <strong>
                {formatDuration(replayDuration)}
              </strong>
            </div>

            <div className="metric-card">
              <span>Current Stage</span>
              <strong>{currentStage}</strong>
            </div>
          </div>

          <div className="replay-viewport">
            <div className="replay-viewport-header">
              <div>
                <span>Replay Time</span>
                <strong>
                  {formatDuration(currentReplayTime)}
                </strong>
              </div>

              <div>
                <span>Timestamp</span>
                <strong>
                  {currentTelemetry
                    ? formatTime(
                        getTelemetryTimestamp(currentTelemetry)
                      )
                    : "--:--:--"}
                </strong>
              </div>

              <div>
                <span>Stage</span>
                <strong>{currentStage}</strong>
              </div>
            </div>

            <div className="replay-timeline">
              <input
                type="range"
                min={0}
                max={Math.max(0, telemetry.length - 1)}
                value={currentIndex}
                onChange={handleSliderChange}
                className="replay-slider"
              />

              <div className="replay-timeline-labels">
                <span>
                  {formatDuration(0)}
                </span>

                <span>
                  {formatDuration(replayDuration)}
                </span>
              </div>
            </div>

            <div className="replay-controls">
              <button
                type="button"
                onClick={handleRestart}
                className="secondary-button"
              >
                ⏮ Restart
              </button>

              <button
                type="button"
                onClick={handlePlayPause}
                className="primary-button"
                disabled={telemetry.length <= 1}
              >
                {playing ? "⏸ Pause" : "▶ Play"}
              </button>

              <button
                type="button"
                onClick={handleEnd}
                className="secondary-button"
              >
                ⏭ End
              </button>

              <label className="speed-control">
                Speed
                <select
                  value={speed}
                  onChange={(event) =>
                    setSpeed(
                      Number(event.target.value) as ReplaySpeed
                    )
                  }
                >
                  {SPEEDS.map((value) => (
                    <option key={value} value={value}>
                      {value}×
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="replay-progress">
              <div
                className="replay-progress-bar"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {currentTelemetry && (
            <div className="replay-telemetry-grid">
              <div className="telemetry-card">
                <span>RPM</span>
                <strong>
                  {formatNumber(currentTelemetry.rpm)}
                </strong>
                <small>rev/min</small>
              </div>

              <div className="telemetry-card">
                <span>Throttle</span>
                <strong>
                  {formatNumber(
                    currentTelemetry.throttle * 100,
                    1
                  )}
                </strong>
                <small>%</small>
              </div>

              <div className="telemetry-card">
                <span>Altitude</span>
                <strong>
                  {formatNumber(currentTelemetry.altitude)}
                </strong>
                <small>m</small>
              </div>

              <div className="telemetry-card">
                <span>CHT</span>
                <strong>
                  {formatNumber(currentTelemetry.cht)}
                </strong>
                <small>°C</small>
              </div>

              <div className="telemetry-card">
                <span>EGT</span>
                <strong>
                  {formatNumber(currentTelemetry.egt)}
                </strong>
                <small>°C</small>
              </div>

              <div className="telemetry-card">
                <span>Oil Temperature</span>
                <strong>
                  {formatNumber(currentTelemetry.oilTemperature)}
                </strong>
                <small>°C</small>
              </div>

              <div className="telemetry-card">
                <span>Oil Pressure</span>
                <strong>
                  {formatNumber(currentTelemetry.oilPressure, 1)}
                </strong>
                <small>bar</small>
              </div>

              <div className="telemetry-card">
                <span>Vibration</span>
                <strong>
                  {formatNumber(currentTelemetry.vibration, 2)}
                </strong>
                <small>g</small>
              </div>

              <div className="telemetry-card">
                <span>Fuel Flow</span>
                <strong>
                  {formatNumber(currentTelemetry.fuelFlow, 2)}
                </strong>
                <small>L/h</small>
              </div>

              <div className="telemetry-card">
                <span>Brake Power</span>
                <strong>
                  {formatNumber(currentTelemetry.brakePower, 2)}
                </strong>
                <small>kW</small>
              </div>

              <div className="telemetry-card">
                <span>Torque</span>
                <strong>
                  {formatNumber(currentTelemetry.brakeTorque, 2)}
                </strong>
                <small>N·m</small>
              </div>

              <div className="telemetry-card">
                <span>BSFC</span>
                <strong>
                  {formatNumber(currentTelemetry.bsfc, 1)}
                </strong>
                <small>g/kWh</small>
              </div>
            </div>
          )}

          <div className="replay-footer">
            <span>
              Sample {currentIndex + 1} of {telemetry.length}
            </span>

            <span>
              {Math.round(progress)}% complete
            </span>
          </div>
        </>
      )}
    </section>
  );
};

export default MissionReplay;