import React, { useEffect, useMemo, useState } from "react";
import { historicalStore } from "../db/historicalDb";
import type {
  HistoricalMission,
  TelemetryRecord,
  FaultRecord,
  HealthRecord,
  DegradationRecord,
} from "../db/historicalStore";

type HistoryTab =
  | "missions"
  | "telemetry"
  | "faults"
  | "health";

function formatDate(timestamp?: number): string {
  if (
    timestamp === undefined ||
    timestamp === null ||
    !Number.isFinite(timestamp)
  ) {
    return "--";
  }

  return new Date(timestamp).toLocaleString();
}

function formatNumber(
  value: number | undefined,
  digits = 1
): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "--";
  }

  return value.toFixed(digits);
}

function missionName(mission: HistoricalMission): string {
  const item = mission as HistoricalMission & {
    name?: string;
    profileName?: string;
  };

  return item.name || item.profileName || mission.id;
}

function telemetryTime(record: TelemetryRecord): number {
  return (
    record.recordedAt ||
    record.timestamp ||
    (record as TelemetryRecord & {
      missionTimestamp?: number;
    }).missionTimestamp ||
    0
  );
}

/**
 * FaultRecord.fault is the fault-type enum/string.
 *
 * Example:
 *   "HIGH_TEMP"
 *   "LOW_OIL"
 *   "HIGH_VIBRATION"
 *
 * Severity, message and active are properties of the
 * FaultRecord itself, not properties of record.fault.
 */
function faultName(record: FaultRecord): string {
  return record.fault || "UNKNOWN";
}

function healthScore(
  record: HealthRecord
): number | undefined {
  const health = record as HealthRecord & {
    score?: number;
    healthScore?: number;
  };

  return health.healthScore ?? health.score;
}

function degradationScore(
  record: DegradationRecord
): number | undefined {
  const item = record as DegradationRecord & {
    score?: number;
    degradationScore?: number;
  };

  return item.degradationScore ?? item.score;
}

const HistoryPanel: React.FC = () => {
  const [tab, setTab] =
    useState<HistoryTab>("missions");

  const [missions, setMissions] =
    useState<HistoricalMission[]>([]);

  const [telemetry, setTelemetry] =
    useState<TelemetryRecord[]>([]);

  const [faults, setFaults] =
    useState<FaultRecord[]>([]);

  const [health, setHealth] =
    useState<HealthRecord[]>([]);

  const [degradation, setDegradation] =
    useState<DegradationRecord[]>([]);

  const [selectedMissionId, setSelectedMissionId] =
    useState<string>("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  /*
   * Load historical missions.
   */
  const loadMissions = async () => {
    setLoading(true);
    setError("");

    try {
      const result =
        await historicalStore.getMissions();

      const sorted = [...result].sort(
        (a, b) =>
          (b.startTime || 0) -
          (a.startTime || 0)
      );

      setMissions(sorted);

      if (
        sorted.length > 0 &&
        !selectedMissionId
      ) {
        setSelectedMissionId(sorted[0].id);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load mission history."
      );
    } finally {
      setLoading(false);
    }
  };

  /*
   * Load all historical information belonging
   * to the selected mission.
   */
  const loadMissionData = async (
    missionId: string
  ) => {
    if (!missionId) {
      setTelemetry([]);
      setFaults([]);
      setHealth([]);
      setDegradation([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [
        telemetryData,
        faultData,
        healthData,
        degradationData,
      ] = await Promise.all([
        historicalStore.getTelemetry(
          missionId
        ),
        historicalStore.getFaults(
          missionId
        ),
        historicalStore.getHealth(
          missionId
        ),
        historicalStore.getDegradation(
          missionId
        ),
      ]);

      setTelemetry(
        [...telemetryData].sort(
          (a, b) =>
            telemetryTime(a) -
            telemetryTime(b)
        )
      );

      setFaults(
        [...faultData].sort(
          (a, b) =>
            (b.timestamp || 0) -
            (a.timestamp || 0)
        )
      );

      setHealth(
        [...healthData].sort(
          (a, b) =>
            (a.timestamp || 0) -
            (b.timestamp || 0)
        )
      );

      setDegradation(
        [...degradationData].sort(
          (a, b) =>
            (a.timestamp || 0) -
            (b.timestamp || 0)
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load historical mission data."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMissions();
  }, []);

  useEffect(() => {
    void loadMissionData(
      selectedMissionId
    );
  }, [selectedMissionId]);

  /*
   * Mission search.
   */
  const filteredMissions = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    if (!query) {
      return missions;
    }

    return missions.filter(
      (mission) => {
        return (
          mission.id
            .toLowerCase()
            .includes(query) ||
          missionName(mission)
            .toLowerCase()
            .includes(query) ||
          (mission.status || "")
            .toLowerCase()
            .includes(query)
        );
      }
    );
  }, [missions, search]);

  const selectedMission = useMemo(() => {
    return missions.find(
      (mission) =>
        mission.id ===
        selectedMissionId
    );
  }, [
    missions,
    selectedMissionId,
  ]);

  /*
   * Mission statistics.
   */
  const statistics = useMemo(() => {
    const rpmValues = telemetry
      .map((record) => record.rpm)
      .filter(
        (value): value is number =>
          Number.isFinite(value)
      );

    const chtValues = telemetry
      .map((record) => record.cht)
      .filter(
        (value): value is number =>
          Number.isFinite(value)
      );

    const egtValues = telemetry
      .map((record) => record.egt)
      .filter(
        (value): value is number =>
          Number.isFinite(value)
      );

    const powerValues = telemetry
      .map(
        (record) =>
          record.brakePower
      )
      .filter(
        (value): value is number =>
          value !== undefined &&
          Number.isFinite(value)
      );

    const max = (
      values: number[]
    ) =>
      values.length
        ? Math.max(...values)
        : undefined;

    const avg = (
      values: number[]
    ) =>
      values.length
        ? values.reduce(
            (sum, value) =>
              sum + value,
            0
          ) / values.length
        : undefined;

    return {
      samples: telemetry.length,

      faults: faults.length,

      maxRPM: max(rpmValues),

      avgRPM: avg(rpmValues),

      maxCHT: max(chtValues),

      maxEGT: max(egtValues),

      maxPower: max(powerValues),

      health:
        health.length > 0
          ? healthScore(
              health[
                health.length - 1
              ]
            )
          : undefined,

      degradation:
        degradation.length > 0
          ? degradationScore(
              degradation[
                degradation.length - 1
              ]
            )
          : undefined,
    };
  }, [
    telemetry,
    faults,
    health,
    degradation,
  ]);

  const handleRefresh =
    async () => {
      await loadMissions();

      if (selectedMissionId) {
        await loadMissionData(
          selectedMissionId
        );
      }
    };

  return (
    <section className="history-panel">
      <div className="panel-header">
        <div>
          <h2>Historical Data</h2>

          <p>
            Review recorded missions,
            telemetry, faults, health
            and degradation history.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={handleRefresh}
          disabled={loading}
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div className="status-message error">
          {error}
        </div>
      )}

      {loading && (
        <div className="status-message">
          Loading historical data...
        </div>
      )}

      <div className="history-toolbar">
        <label>
          Mission

          <select
            value={
              selectedMissionId
            }
            onChange={(event) =>
              setSelectedMissionId(
                event.target.value
              )
            }
          >
            {missions.length === 0 && (
              <option value="">
                No missions available
              </option>
            )}

            {missions.map(
              (mission) => (
                <option
                  key={mission.id}
                  value={mission.id}
                >
                  {missionName(
                    mission
                  )}
                </option>
              )
            )}
          </select>
        </label>

        <label>
          Search

          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search missions..."
          />
        </label>
      </div>

      <div className="history-tabs">
        <button
          type="button"
          className={
            tab === "missions"
              ? "history-tab active"
              : "history-tab"
          }
          onClick={() =>
            setTab("missions")
          }
        >
          Missions
        </button>

        <button
          type="button"
          className={
            tab === "telemetry"
              ? "history-tab active"
              : "history-tab"
          }
          onClick={() =>
            setTab("telemetry")
          }
        >
          Telemetry
        </button>

        <button
          type="button"
          className={
            tab === "faults"
              ? "history-tab active"
              : "history-tab"
          }
          onClick={() =>
            setTab("faults")
          }
        >
          Faults

          {faults.length > 0 && (
            <span className="history-count">
              {faults.length}
            </span>
          )}
        </button>

        <button
          type="button"
          className={
            tab === "health"
              ? "history-tab active"
              : "history-tab"
          }
          onClick={() =>
            setTab("health")
          }
        >
          Health
        </button>
      </div>

      {tab === "missions" && (
        <div className="history-content">
          <div className="history-summary-grid">
            <div className="metric-card">
              <span>
                Total Missions
              </span>

              <strong>
                {missions.length}
              </strong>
            </div>

            <div className="metric-card">
              <span>
                Telemetry Samples
              </span>

              <strong>
                {statistics.samples}
              </strong>
            </div>

            <div className="metric-card">
              <span>
                Fault Events
              </span>

              <strong>
                {statistics.faults}
              </strong>
            </div>

            <div className="metric-card">
              <span>
                Health Score
              </span>

              <strong>
                {formatNumber(
                  statistics.health,
                  1
                )}
              </strong>
            </div>
          </div>

          <div className="history-table-wrapper">
            <table className="history-table">
              <thead>
                <tr>
                  <th>
                    Mission
                  </th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Status</th>
                  <th>Samples</th>
                  <th>Faults</th>
                </tr>
              </thead>

              <tbody>
                {filteredMissions.map(
                  (mission) => (
                    <tr
                      key={mission.id}
                      className={
                        mission.id ===
                        selectedMissionId
                          ? "selected"
                          : ""
                      }
                      onClick={() =>
                        setSelectedMissionId(
                          mission.id
                        )
                      }
                    >
                      <td>
                        <strong>
                          {missionName(
                            mission
                          )}
                        </strong>

                        <small>
                          {mission.id}
                        </small>
                      </td>

                      <td>
                        {formatDate(
                          mission.startTime
                        )}
                      </td>

                      <td>
                        {formatDate(
                          mission.endTime
                        )}
                      </td>

                      <td>
                        <span
                          className={`status-badge ${
                            mission.status ||
                            "unknown"
                          }`}
                        >
                          {mission.status ||
                            "UNKNOWN"}
                        </span>
                      </td>

                      <td>
                        {mission.id ===
                        selectedMissionId
                          ? telemetry.length
                          : "--"}
                      </td>

                      <td>
                        {mission.id ===
                        selectedMissionId
                          ? faults.length
                          : "--"}
                      </td>
                    </tr>
                  )
                )}

                {filteredMissions.length ===
                  0 && (
                  <tr>
                    <td colSpan={6}>
                      No historical
                      missions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "telemetry" && (
        <div className="history-content">
          <div className="history-summary-grid">
            <div className="metric-card">
              <span>Samples</span>

              <strong>
                {statistics.samples}
              </strong>
            </div>

            <div className="metric-card">
              <span>
                Average RPM
              </span>

              <strong>
                {formatNumber(
                  statistics.avgRPM,
                  0
                )}
              </strong>
            </div>

            <div className="metric-card">
              <span>
                Maximum CHT
              </span>

              <strong>
                {formatNumber(
                  statistics.maxCHT,
                  1
                )}{" "}
                °C
              </strong>
            </div>

            <div className="metric-card">
              <span>
                Maximum EGT
              </span>

              <strong>
                {formatNumber(
                  statistics.maxEGT,
                  1
                )}{" "}
                °C
              </strong>
            </div>

            <div className="metric-card">
              <span>
                Maximum Power
              </span>

              <strong>
                {formatNumber(
                  statistics.maxPower,
                  2
                )}{" "}
                kW
              </strong>
            </div>
          </div>

          <div className="history-table-wrapper">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Stage</th>
                  <th>RPM</th>
                  <th>
                    Throttle
                  </th>
                  <th>
                    Altitude
                  </th>
                  <th>CHT</th>
                  <th>EGT</th>
                  <th>
                    Oil Temp
                  </th>
                  <th>Power</th>
                </tr>
              </thead>

              <tbody>
                {telemetry
                  .slice()
                  .reverse()
                  .slice(0, 500)
                  .map(
                    (record) => (
                      <tr
                        key={
                          record.id
                        }
                      >
                        <td>
                          {formatDate(
                            telemetryTime(
                              record
                            )
                          )}
                        </td>

                        <td>
                          {record.stageName ||
                            "--"}
                        </td>

                        <td>
                          {formatNumber(
                            record.rpm,
                            0
                          )}
                        </td>

                        <td>
                          {formatNumber(
                            record.throttle *
                              100,
                            1
                          )}
                          %
                        </td>

                        <td>
                          {formatNumber(
                            record.altitude,
                            0
                          )}{" "}
                          m
                        </td>

                        <td>
                          {formatNumber(
                            record.cht,
                            1
                          )}{" "}
                          °C
                        </td>

                        <td>
                          {formatNumber(
                            record.egt,
                            1
                          )}{" "}
                          °C
                        </td>

                        <td>
                          {formatNumber(
                            record.oilTemperature,
                            1
                          )}{" "}
                          °C
                        </td>

                        <td>
                          {formatNumber(
                            record.brakePower,
                            2
                          )}{" "}
                          kW
                        </td>
                      </tr>
                    )
                  )}

                {telemetry.length ===
                  0 && (
                  <tr>
                    <td colSpan={9}>
                      No telemetry
                      available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {telemetry.length >
            500 && (
            <p className="history-note">
              Showing the latest 500
              telemetry samples.
              Mission Replay can be
              used for complete
              timeline playback.
            </p>
          )}
        </div>
      )}

      {tab === "faults" && (
        <div className="history-content">
          <div className="history-summary-grid">
            <div className="metric-card">
              <span>
                Total Fault Events
              </span>

              <strong>
                {faults.length}
              </strong>
            </div>

            <div className="metric-card">
              <span>Mission</span>

              <strong>
                {selectedMission
                  ? missionName(
                      selectedMission
                    )
                  : "--"}
              </strong>
            </div>
          </div>

          <div className="history-table-wrapper">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Fault</th>
                  <th>
                    Severity
                  </th>
                  <th>
                    Message
                  </th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {faults.map(
                  (record) => (
                    <tr
                      key={
                        record.id
                      }
                    >
                      <td>
                        {formatDate(
                          record.timestamp
                        )}
                      </td>

                      <td>
                        <strong>
                          {faultName(
                            record
                          )}
                        </strong>
                      </td>

                      <td>
                        {record.severity ||
                          "--"}
                      </td>

                      <td>
                        {record.message ||
                          "--"}
                      </td>

                      <td>
                        {record.active
                          ? "ACTIVE"
                          : "CLEARED"}
                      </td>
                    </tr>
                  )
                )}

                {faults.length ===
                  0 && (
                  <tr>
                    <td colSpan={5}>
                      No fault events
                      recorded for this
                      mission.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "health" && (
        <div className="history-content">
          <div className="history-summary-grid">
            <div className="metric-card">
              <span>
                Health Score
              </span>

              <strong>
                {formatNumber(
                  statistics.health,
                  1
                )}
              </strong>
            </div>

            <div className="metric-card">
              <span>
                Degradation
              </span>

              <strong>
                {formatNumber(
                  statistics.degradation,
                  1
                )}
              </strong>
            </div>

            <div className="metric-card">
              <span>
                Health Records
              </span>

              <strong>
                {health.length}
              </strong>
            </div>

            <div className="metric-card">
              <span>
                Degradation Records
              </span>

              <strong>
                {degradation.length}
              </strong>
            </div>
          </div>

          <h3>
            Health History
          </h3>

          <div className="history-table-wrapper">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>
                    Health Score
                  </th>
                  <th>Status</th>
                  <th>
                    Confidence
                  </th>
                </tr>
              </thead>

              <tbody>
                {health
                  .slice()
                  .reverse()
                  .map(
                    (record) => {
                      const item =
                        record as HealthRecord & {
                          status?: string;
                          confidence?: number;
                        };

                      return (
                        <tr
                          key={
                            record.id
                          }
                        >
                          <td>
                            {formatDate(
                              record.timestamp
                            )}
                          </td>

                          <td>
                            {formatNumber(
                              healthScore(
                                record
                              ),
                              1
                            )}
                          </td>

                          <td>
                            {item.status ||
                              "--"}
                          </td>

                          <td>
                            {item.confidence !==
                            undefined
                              ? `${formatNumber(
                                  item.confidence *
                                    100,
                                  1
                                )}%`
                              : "--"}
                          </td>
                        </tr>
                      );
                    }
                  )}

                {health.length ===
                  0 && (
                  <tr>
                    <td colSpan={4}>
                      No health records
                      available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h3>
            Degradation History
          </h3>

          <div className="history-table-wrapper">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>
                    Degradation
                    Score
                  </th>
                  <th>
                    Overall Factor
                  </th>
                </tr>
              </thead>

              <tbody>
                {degradation
                  .slice()
                  .reverse()
                  .map(
                    (record) => {
                      const item =
                        record as DegradationRecord & {
                          overallFactor?: number;
                        };

                      return (
                        <tr
                          key={
                            record.id
                          }
                        >
                          <td>
                            {formatDate(
                              record.timestamp
                            )}
                          </td>

                          <td>
                            {formatNumber(
                              degradationScore(
                                record
                              ),
                              2
                            )}
                          </td>

                          <td>
                            {formatNumber(
                              item.overallFactor,
                              3
                            )}
                          </td>
                        </tr>
                      );
                    }
                  )}

                {degradation.length ===
                  0 && (
                  <tr>
                    <td colSpan={3}>
                      No degradation
                      records
                      available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

export default HistoryPanel;