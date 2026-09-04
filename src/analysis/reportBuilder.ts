import type {
  HistoricalMission,
} from "../db/historicalStore";

import type {
  PostFlightAnalysis,
  StageStatistics,
} from "./postFlight";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface MissionReportOptions {
  title?: string;
  includeTelemetryTable?: boolean;
  maxTelemetryRows?: number;
}

export interface MissionReport {
  fileName: string;
  title: string;
  generatedAt: number;
  html: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function number(
  value: number | undefined,
  digits = 1,
  suffix = ""
): string {
  if (
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "--";
  }

  return `${value.toFixed(digits)}${suffix}`;
}

function percentage(
  value: number | undefined,
  digits = 1
): string {
  if (
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "--";
  }

  return `${(value * 100).toFixed(digits)}%`;
}

function dateTime(
  timestamp?: number
): string {
  if (
    timestamp === undefined ||
    !Number.isFinite(timestamp)
  ) {
    return "--";
  }

  return new Date(timestamp).toLocaleString();
}

function duration(seconds: number): string {
  if (
    !Number.isFinite(seconds) ||
    seconds < 0
  ) {
    return "--";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(
    (seconds % 3600) / 60
  );
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }

  return `${minutes}m ${secs}s`;
}

function safeFileName(value: string): string {
  return value
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function statusClass(
  value: string
): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

/* -------------------------------------------------------------------------- */
/* HTML components                                                            */
/* -------------------------------------------------------------------------- */

function metricCard(
  label: string,
  value: string
): string {
  return `
    <div class="metric">
      <div class="metric-label">${escapeHtml(
        label
      )}</div>
      <div class="metric-value">${escapeHtml(
        value
      )}</div>
    </div>
  `;
}

function sectionTitle(
  title: string,
  description?: string
): string {
  return `
    <div class="section-heading">
      <h2>${escapeHtml(title)}</h2>
      ${
        description
          ? `<p>${escapeHtml(
              description
            )}</p>`
          : ""
      }
    </div>
  `;
}

function renderWarnings(
  warnings: string[]
): string {
  if (warnings.length === 0) {
    return `
      <div class="empty-box success">
        No significant warnings were identified from
        the recorded mission data.
      </div>
    `;
  }

  return `
    <div class="warning-list">
      ${warnings
        .map(
          (warning) => `
            <div class="warning-item">
              <span class="warning-icon">!</span>
              <span>${escapeHtml(
                warning
              )}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderRecommendations(
  recommendations: string[]
): string {
  if (recommendations.length === 0) {
    return `
      <div class="empty-box">
        No additional recommendations were generated.
      </div>
    `;
  }

  return `
    <div class="recommendation-list">
      ${recommendations
        .map(
          (recommendation, index) => `
            <div class="recommendation-item">
              <span class="recommendation-number">
                ${index + 1}
              </span>
              <span>${escapeHtml(
                recommendation
              )}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Mission overview                                                           */
/* -------------------------------------------------------------------------- */

function renderMissionOverview(
  mission: HistoricalMission,
  analysis: PostFlightAnalysis
): string {
  const stats = analysis.statistics;

  return `
    ${sectionTitle(
      "Mission Overview",
      "Recorded mission information and overall execution statistics."
    )}

    <div class="metrics-grid">
      ${metricCard(
        "Mission ID",
        mission.id
      )}

      ${metricCard(
        "Status",
        String(mission.status || "--")
      )}

      ${metricCard(
        "Start Time",
        dateTime(stats.startTime)
      )}

      ${metricCard(
        "End Time",
        dateTime(stats.endTime)
      )}

      ${metricCard(
        "Duration",
        duration(stats.durationSeconds)
      )}

      ${metricCard(
        "Telemetry Samples",
        String(stats.sampleCount)
      )}

      ${metricCard(
        "Fault Events",
        String(stats.faultCount)
      )}

      ${metricCard(
        "Active Faults",
        String(stats.activeFaultCount)
      )}
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Engine performance                                                         */
/* -------------------------------------------------------------------------- */

function renderPerformance(
  analysis: PostFlightAnalysis
): string {
  const stats = analysis.statistics;

  return `
    ${sectionTitle(
      "Engine Performance",
      "Performance statistics calculated from recorded engine telemetry."
    )}

    <div class="metrics-grid">
      ${metricCard(
        "Average RPM",
        number(stats.averageRPM, 0)
      )}

      ${metricCard(
        "Maximum RPM",
        number(stats.maximumRPM, 0)
      )}

      ${metricCard(
        "Minimum RPM",
        number(stats.minimumRPM, 0)
      )}

      ${metricCard(
        "Average Throttle",
        percentage(stats.averageThrottle)
      )}

      ${metricCard(
        "Maximum Throttle",
        percentage(stats.maximumThrottle)
      )}

      ${metricCard(
        "Average Power",
        number(
          stats.averagePowerKW,
          2,
          " kW"
        )
      )}

      ${metricCard(
        "Maximum Power",
        number(
          stats.maximumPowerKW,
          2,
          " kW"
        )
      )}

      ${metricCard(
        "Average Torque",
        number(
          stats.averageTorqueNm,
          2,
          " N·m"
        )
      )}

      ${metricCard(
        "Maximum Torque",
        number(
          stats.maximumTorqueNm,
          2,
          " N·m"
        )
      )}
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Thermal and lubrication analysis                                            */
/* -------------------------------------------------------------------------- */

function renderThermalAnalysis(
  analysis: PostFlightAnalysis
): string {
  const stats = analysis.statistics;

  return `
    ${sectionTitle(
      "Thermal & Lubrication Analysis",
      "Engine thermal and lubrication behavior throughout the mission."
    )}

    <div class="metrics-grid">
      ${metricCard(
        "Average CHT",
        number(
          stats.averageCHT,
          1,
          " °C"
        )
      )}

      ${metricCard(
        "Maximum CHT",
        number(
          stats.maximumCHT,
          1,
          " °C"
        )
      )}

      ${metricCard(
        "Average EGT",
        number(
          stats.averageEGT,
          1,
          " °C"
        )
      )}

      ${metricCard(
        "Maximum EGT",
        number(
          stats.maximumEGT,
          1,
          " °C"
        )
      )}

      ${metricCard(
        "Average Oil Temperature",
        number(
          stats.averageOilTemperature,
          1,
          " °C"
        )
      )}

      ${metricCard(
        "Maximum Oil Temperature",
        number(
          stats.maximumOilTemperature,
          1,
          " °C"
        )
      )}

      ${metricCard(
        "Average Oil Pressure",
        number(
          stats.averageOilPressure,
          2,
          " bar"
        )
      )}

      ${metricCard(
        "Minimum Oil Pressure",
        number(
          stats.minimumOilPressure,
          2,
          " bar"
        )
      )}

      ${metricCard(
        "Average Vibration",
        number(
          stats.averageVibration,
          3,
          " g"
        )
      )}

      ${metricCard(
        "Maximum Vibration",
        number(
          stats.maximumVibration,
          3,
          " g"
        )
      )}
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Fuel analysis                                                              */
/* -------------------------------------------------------------------------- */

function renderFuelAnalysis(
  analysis: PostFlightAnalysis
): string {
  const stats = analysis.statistics;

  return `
    ${sectionTitle(
      "Fuel & Efficiency",
      "Fuel-flow integration and brake-specific fuel-consumption analysis."
    )}

    <div class="metrics-grid">
      ${metricCard(
        "Average Fuel Flow",
        number(
          stats.averageFuelFlowLph,
          2,
          " L/h"
        )
      )}

      ${metricCard(
        "Fuel Consumed",
        number(
          stats.totalFuelConsumedLiters,
          2,
          " L"
        )
      )}

      ${metricCard(
        "Average BSFC",
        number(
          stats.averageBSFC,
          1,
          " g/kWh"
        )
      )}
    </div>

    <div class="info-box">
      Fuel consumed is calculated by integrating the
      recorded fuel-flow signal over the mission
      timeline using time between telemetry samples.
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Health and degradation                                                     */
/* -------------------------------------------------------------------------- */

function renderHealthAnalysis(
  analysis: PostFlightAnalysis
): string {
  const stats = analysis.statistics;

  return `
    ${sectionTitle(
      "Health & Degradation",
      "Recorded engine health and degradation progression."
    )}

    <div class="metrics-grid">
      ${metricCard(
        "Initial Health",
        number(
          stats.healthStart,
          1
        )
      )}

      ${metricCard(
        "Final Health",
        number(
          stats.healthEnd,
          1
        )
      )}

      ${metricCard(
        "Minimum Health",
        number(
          stats.healthMinimum,
          1
        )
      )}

      ${metricCard(
        "Health Trend",
        number(
          stats.healthTrend,
          2
        )
      )}

      ${metricCard(
        "Initial Degradation",
        number(
          stats.degradationStart,
          3
        )
      )}

      ${metricCard(
        "Final Degradation",
        number(
          stats.degradationEnd,
          3
        )
      )}

      ${metricCard(
        "Degradation Trend",
        number(
          stats.degradationTrend,
          3
        )
      )}
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Stage table                                                                */
/* -------------------------------------------------------------------------- */

function renderStageTable(
  stages: StageStatistics[]
): string {
  if (stages.length === 0) {
    return `
      <div class="empty-box">
        No stage-level telemetry is available.
      </div>
    `;
  }

  return `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Stage</th>
            <th>Duration</th>
            <th>Avg RPM</th>
            <th>Max RPM</th>
            <th>Avg Throttle</th>
            <th>Avg Altitude</th>
            <th>Max CHT</th>
            <th>Max EGT</th>
            <th>Avg Power</th>
            <th>Fuel</th>
          </tr>
        </thead>

        <tbody>
          ${stages
            .map(
              (stage) => `
                <tr>
                  <td>
                    <strong>
                      ${escapeHtml(
                        stage.stageName
                      )}
                    </strong>
                  </td>

                  <td>
                    ${escapeHtml(
                      duration(
                        stage.durationSeconds
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      number(
                        stage.averageRPM,
                        0
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      number(
                        stage.maximumRPM,
                        0
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      percentage(
                        stage.averageThrottle
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      number(
                        stage.averageAltitude,
                        0,
                        " m"
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      number(
                        stage.maximumCHT,
                        1,
                        " °C"
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      number(
                        stage.maximumEGT,
                        1,
                        " °C"
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      number(
                        stage.averagePowerKW,
                        2,
                        " kW"
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      number(
                        stage.fuelConsumedLiters,
                        2,
                        " L"
                      )
                    )}
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Fault table                                                                */
/* -------------------------------------------------------------------------- */

function renderFaultTable(
  analysis: PostFlightAnalysis
): string {
  const faults = analysis.faults;

  if (faults.length === 0) {
    return `
      <div class="empty-box success">
        No fault events were recorded during this mission.
      </div>
    `;
  }

  return `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Fault Type</th>
            <th>Severity</th>
            <th>Message</th>
            <th>State</th>
          </tr>
        </thead>

        <tbody>
          ${faults
            .map((record) => {
              const fault = record.fault;

              return `
                <tr>
                  <td>
                    ${escapeHtml(
                      dateTime(
                        record.timestamp
                      )
                    )}
                  </td>

                  <td>
                    <strong>
                      ${escapeHtml(
                        typeof fault === "object" &&
                        fault !== null &&
                        "type" in fault
                          ? (fault as Record<string, unknown>).type ||
                            "UNKNOWN"
                          : fault || "UNKNOWN"
                      )}
                    </strong>
                  </td>

                  <td>
                    ${escapeHtml(
                      typeof fault === "object" &&
                      fault !== null &&
                      "severity" in fault
                        ? (fault as Record<string, unknown>).severity || "--"
                        : "--"
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      typeof fault === "object" &&
                      fault !== null &&
                      "message" in fault
                        ? (fault as Record<string, unknown>).message || "--"
                        : "--"
                    )}
                  </td>

                  <td>
                    <span class="status ${statusClass(
                      typeof fault === "object" &&
                      fault !== null &&
                      "active" in fault &&
                      (fault as Record<string, unknown>).active
                        ? "ACTIVE"
                        : "CLEARED"
                    )}">
                      ${
                        typeof fault === "object" &&
                        fault !== null &&
                        "active" in fault &&
                        (fault as Record<string, unknown>).active
                          ? "ACTIVE"
                          : "CLEARED"
                      }
                    </span>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* Optional telemetry table                                                   */
/* -------------------------------------------------------------------------- */

function renderTelemetryTable(
  analysis: PostFlightAnalysis,
  maxRows: number
): string {
  const records = analysis.telemetry
    .slice(-maxRows)
    .reverse();

  if (records.length === 0) {
    return `
      <div class="empty-box">
        No telemetry records available.
      </div>
    `;
  }

  return `
    <div class="table-wrapper telemetry-table">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Stage</th>
            <th>RPM</th>
            <th>Throttle</th>
            <th>Altitude</th>
            <th>CHT</th>
            <th>EGT</th>
            <th>Oil Temp</th>
            <th>Oil Pressure</th>
            <th>Power</th>
            <th>Fuel Flow</th>
          </tr>
        </thead>

        <tbody>
          ${records
            .map(
              (record) => `
                <tr>
                  <td>
                    ${escapeHtml(
                      dateTime(
                        record.recordedAt ||
                          record.timestamp
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      record.stageName ||
                        "--"
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      number(
                        record.rpm,
                        0
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      percentage(
                        record.throttle
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      number(
                        record.altitude,
                        0,
                        " m"
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      number(
                        record.cht,
                        1,
                        " °C"
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      number(
                        record.egt,
                        1,
                        " °C"
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      number(
                        record.oilTemperature,
                        1,
                        " °C"
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      number(
                        record.oilPressure,
                        2,
                        " bar"
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      number(
                        record.brakePower,
                        2,
                        " kW"
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      number(
                        record.fuelFlow,
                        2,
                        " L/h"
                      )
                    )}
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>

    ${
      analysis.telemetry.length >
      maxRows
        ? `
          <div class="info-box">
            Showing the latest ${maxRows}
            telemetry samples out of
            ${analysis.telemetry.length}.
            Use Mission Replay for complete
            timeline playback.
          </div>
        `
        : ""
    }
  `;
}

/* -------------------------------------------------------------------------- */
/* Main HTML builder                                                          */
/* -------------------------------------------------------------------------- */

export function buildMissionReportHTML(
  analysis: PostFlightAnalysis,
  options: MissionReportOptions = {}
): string {
  const mission = analysis.mission;

  const title =
    options.title ||
    `UAV Engine Mission Report — ${mission.id}`;

  const includeTelemetry =
    options.includeTelemetryTable ?? false;

  const maxTelemetryRows =
    options.maxTelemetryRows ?? 250;

  const stats = analysis.statistics;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <title>${escapeHtml(title)}</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      font-family:
        Inter,
        Arial,
        Helvetica,
        sans-serif;
      background: #f4f6f8;
      color: #1f2933;
      line-height: 1.5;
    }

    .report {
      max-width: 1200px;
      margin: 0 auto;
      background: #ffffff;
      min-height: 100vh;
    }

    .header {
      padding: 40px;
      background: #17202a;
      color: white;
    }

    .header h1 {
      margin: 0 0 8px;
      font-size: 30px;
      letter-spacing: 0.3px;
    }

    .header p {
      margin: 4px 0;
      opacity: 0.82;
    }

    .header-meta {
      margin-top: 20px;
      display: grid;
      grid-template-columns:
        repeat(3, 1fr);
      gap: 16px;
    }

    .header-meta-item {
      padding: 14px;
      border: 1px solid
        rgba(255,255,255,0.18);
      border-radius: 8px;
    }

    .header-meta-label {
      display: block;
      font-size: 11px;
      text-transform: uppercase;
      opacity: 0.65;
      margin-bottom: 4px;
    }

    .header-meta-value {
      font-weight: 600;
    }

    .content {
      padding: 32px 40px 50px;
    }

    .section {
      margin-bottom: 42px;
      page-break-inside: avoid;
    }

    .section-heading {
      margin-bottom: 18px;
      border-bottom: 1px solid #d9dee3;
      padding-bottom: 10px;
    }

    .section-heading h2 {
      margin: 0;
      font-size: 21px;
    }

    .section-heading p {
      margin: 4px 0 0;
      color: #66737f;
      font-size: 13px;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns:
        repeat(4, 1fr);
      gap: 12px;
    }

    .metric {
      padding: 17px;
      background: #f7f9fa;
      border: 1px solid #e1e6ea;
      border-radius: 8px;
    }

    .metric-label {
      font-size: 11px;
      color: #687580;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .metric-value {
      margin-top: 5px;
      font-size: 18px;
      font-weight: 700;
      word-break: break-word;
    }

    .warning-list,
    .recommendation-list {
      display: flex;
      flex-direction: column;
      gap: 9px;
    }

    .warning-item,
    .recommendation-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 7px;
      background: #fafafa;
      border: 1px solid #e3e6e8;
    }

    .warning-icon,
    .recommendation-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      height: 22px;
      border-radius: 50%;
      font-size: 11px;
      font-weight: 700;
    }

    .warning-icon {
      background: #f0ad4e;
      color: white;
    }

    .recommendation-number {
      background: #e0e5e9;
      color: #26323d;
    }

    .empty-box,
    .info-box {
      padding: 15px;
      border-radius: 7px;
      background: #f7f9fa;
      border: 1px solid #e1e6ea;
      color: #5f6c77;
      font-size: 13px;
    }

    .empty-box.success {
      border-left: 4px solid #4d9b70;
    }

    .info-box {
      margin-top: 15px;
    }

    .table-wrapper {
      overflow-x: auto;
      border: 1px solid #dfe4e8;
      border-radius: 8px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    th {
      background: #f1f4f6;
      color: #53616d;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 10px;
      white-space: nowrap;
    }

    td {
      padding: 10px;
      border-top: 1px solid #e8ecef;
      vertical-align: top;
    }

    tbody tr:nth-child(even) {
      background: #fafbfc;
    }

    .status {
      display: inline-block;
      padding: 3px 7px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
    }

    .status.active {
      background: #f6d6d6;
    }

    .status.cleared {
      background: #dcefe4;
    }

    .footer {
      margin-top: 40px;
      padding-top: 15px;
      border-top: 1px solid #d9dee3;
      color: #7a858e;
      font-size: 11px;
      display: flex;
      justify-content: space-between;
      gap: 20px;
    }

    @media (max-width: 850px) {
      .content,
      .header {
        padding-left: 20px;
        padding-right: 20px;
      }

      .metrics-grid {
        grid-template-columns:
          repeat(2, 1fr);
      }

      .header-meta {
        grid-template-columns: 1fr;
      }
    }

    @media print {
      body {
        background: white;
      }

      .report {
        max-width: none;
      }

      .header {
        color-adjust: exact;
        print-color-adjust: exact;
      }

      .section {
        page-break-inside: avoid;
      }

      table {
        page-break-inside: auto;
      }

      tr {
        page-break-inside: avoid;
      }
    }
  </style>
</head>

<body>
  <main class="report">

    <header class="header">
      <h1>${escapeHtml(title)}</h1>

      <p>
        AI-Enabled Real-Time Digital Twin System
        for UAV Aero Piston Engine Health,
        Fault Prediction and Mission Reliability
      </p>

      <div class="header-meta">
        <div class="header-meta-item">
          <span class="header-meta-label">
            Mission
          </span>

          <span class="header-meta-value">
            ${escapeHtml(mission.id)}
          </span>
        </div>

        <div class="header-meta-item">
          <span class="header-meta-label">
            Generated
          </span>

          <span class="header-meta-value">
            ${escapeHtml(
              dateTime(analysis.generatedAt)
            )}
          </span>
        </div>

        <div class="header-meta-item">
          <span class="header-meta-label">
            Duration
          </span>

          <span class="header-meta-value">
            ${escapeHtml(
              duration(
                stats.durationSeconds
              )
            )}
          </span>
        </div>
      </div>
    </header>

    <div class="content">

      <section class="section">
        ${renderMissionOverview(
          mission,
          analysis
        )}
      </section>

      <section class="section">
        ${renderPerformance(analysis)}
      </section>

      <section class="section">
        ${renderThermalAnalysis(
          analysis
        )}
      </section>

      <section class="section">
        ${renderFuelAnalysis(analysis)}
      </section>

      <section class="section">
        ${renderHealthAnalysis(
          analysis
        )}
      </section>

      <section class="section">
        ${sectionTitle(
          "Mission Stage Analysis",
          "Performance broken down by the mission profile stages."
        )}

        ${renderStageTable(
          stats.stageStatistics
        )}
      </section>

      <section class="section">
        ${sectionTitle(
          "Fault Analysis",
          "Fault events captured during the mission."
        )}

        ${renderFaultTable(analysis)}
      </section>

      <section class="section">
        ${sectionTitle(
          "Warnings",
          "Automatically generated from recorded operating conditions."
        )}

        ${renderWarnings(
          analysis.warnings
        )}
      </section>

      <section class="section">
        ${sectionTitle(
          "Maintenance Recommendations",
          "Recommended follow-up actions based on mission evidence."
        )}

        ${renderRecommendations(
          analysis.recommendations
        )}
      </section>

      ${
        includeTelemetry
          ? `
            <section class="section">
              ${sectionTitle(
                "Telemetry Sample",
                "Recent recorded telemetry values."
              )}

              ${renderTelemetryTable(
                analysis,
                maxTelemetryRows
              )}
            </section>
          `
          : ""
      }

      <footer class="footer">
        <span>
          UAV Engine Digital Twin
        </span>

        <span>
          Generated ${escapeHtml(
            dateTime(analysis.generatedAt)
          )}
        </span>
      </footer>

    </div>
  </main>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* Report object                                                              */
/* -------------------------------------------------------------------------- */

export function buildMissionReport(
  analysis: PostFlightAnalysis,
  options: MissionReportOptions = {}
): MissionReport {
  const title =
    options.title ||
    `UAV Engine Mission Report — ${
      analysis.mission.id
    }`;

  const html = buildMissionReportHTML(
    analysis,
    {
      ...options,
      title,
    }
  );

  const fileName =
    `${safeFileName(
      analysis.mission.id
    ) || "mission"}-engine-report.html`;

  return {
    fileName,
    title,
    generatedAt: Date.now(),
    html,
  };
}

/* -------------------------------------------------------------------------- */
/* Browser export                                                             */
/* -------------------------------------------------------------------------- */

export function downloadMissionReport(
  analysis: PostFlightAnalysis,
  options: MissionReportOptions = {}
): void {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    throw new Error(
      "Mission report download requires a browser environment."
    );
  }

  const report = buildMissionReport(
    analysis,
    options
  );

  const blob = new Blob(
    [report.html],
    {
      type: "text/html;charset=utf-8",
    }
  );

  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  anchor.href = url;
  anchor.download = report.fileName;

  document.body.appendChild(anchor);

  anchor.click();

  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}

/* -------------------------------------------------------------------------- */
/* Print helper                                                               */
/* -------------------------------------------------------------------------- */

export function printMissionReport(
  analysis: PostFlightAnalysis,
  options: MissionReportOptions = {}
): void {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    throw new Error(
      "Mission report printing requires a browser environment."
    );
  }

  const report = buildMissionReportHTML(
    analysis,
    options
  );

  const printWindow =
    window.open(
      "",
      "_blank",
      "noopener,noreferrer"
    );

  if (!printWindow) {
    throw new Error(
      "Unable to open the print window. Please allow pop-ups."
    );
  }

  printWindow.document.open();
  printWindow.document.write(report);
  printWindow.document.close();

  printWindow.focus();

  /*
   * Give the browser a moment to finish rendering
   * tables and CSS before opening the print dialog.
   */
  window.setTimeout(() => {
    printWindow.print();
  }, 300);
}

export default buildMissionReport;