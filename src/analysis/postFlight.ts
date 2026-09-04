import type {
  HistoricalMission,
  TelemetryRecord,
  FaultRecord,
  HealthRecord,
  DegradationRecord,
} from "../db/historicalStore";

export interface StageStatistics {
  stageName: string;
  sampleCount: number;
  durationSeconds: number;

  averageRPM?: number;
  maximumRPM?: number;

  averageThrottle?: number;
  maximumThrottle?: number;

  averageAltitude?: number;
  maximumAltitude?: number;

  averageCHT?: number;
  maximumCHT?: number;

  averageEGT?: number;
  maximumEGT?: number;

  averageOilTemperature?: number;
  maximumOilTemperature?: number;

  averageOilPressure?: number;
  minimumOilPressure?: number;

  averageVibration?: number;
  maximumVibration?: number;

  averagePowerKW?: number;
  maximumPowerKW?: number;

  averageTorqueNm?: number;

  averageFuelFlowLph?: number;
  fuelConsumedLiters?: number;

  averageBSFC?: number;
}

export interface PostFlightStatistics {
  missionId: string;

  startTime?: number;
  endTime?: number;

  durationSeconds: number;

  sampleCount: number;

  averageRPM?: number;
  maximumRPM?: number;
  minimumRPM?: number;

  averageThrottle?: number;
  maximumThrottle?: number;

  averageAltitude?: number;
  maximumAltitude?: number;

  averageCHT?: number;
  maximumCHT?: number;

  averageEGT?: number;
  maximumEGT?: number;

  averageOilTemperature?: number;
  maximumOilTemperature?: number;

  averageOilPressure?: number;
  minimumOilPressure?: number;

  averageVibration?: number;
  maximumVibration?: number;

  averagePowerKW?: number;
  maximumPowerKW?: number;

  averageTorqueNm?: number;
  maximumTorqueNm?: number;

  averageFuelFlowLph?: number;
  totalFuelConsumedLiters?: number;

  averageBSFC?: number;

  faultCount: number;
  activeFaultCount: number;

  healthStart?: number;
  healthEnd?: number;
  healthMinimum?: number;
  healthTrend?: number;

  degradationStart?: number;
  degradationEnd?: number;
  degradationTrend?: number;

  stageStatistics: StageStatistics[];
}

export interface PostFlightAnalysis {
  mission: HistoricalMission;
  statistics: PostFlightStatistics;

  telemetry: TelemetryRecord[];
  faults: FaultRecord[];
  health: HealthRecord[];
  degradation: DegradationRecord[];

  warnings: string[];
  recommendations: string[];

  generatedAt: number;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function finiteValues(
  values: Array<number | undefined>
): number[] {
  return values.filter(
    (value): value is number =>
      value !== undefined && Number.isFinite(value)
  );
}

function average(
  values: Array<number | undefined>
): number | undefined {
  const valid = finiteValues(values);

  if (valid.length === 0) {
    return undefined;
  }

  return (
    valid.reduce((sum, value) => sum + value, 0) /
    valid.length
  );
}

function minimum(
  values: Array<number | undefined>
): number | undefined {
  const valid = finiteValues(values);

  return valid.length > 0
    ? Math.min(...valid)
    : undefined;
}

function maximum(
  values: Array<number | undefined>
): number | undefined {
  const valid = finiteValues(values);

  return valid.length > 0
    ? Math.max(...valid)
    : undefined;
}

function firstDefined(
  values: Array<number | undefined>
): number | undefined {
  return values.find(
    (value) =>
      value !== undefined && Number.isFinite(value)
  );
}

function telemetryTimestamp(
  record: TelemetryRecord
): number {
  return (
    record.recordedAt ||
    record.timestamp ||
    (record as TelemetryRecord & {
      missionTimestamp?: number;
    }).missionTimestamp ||
    0
  );
}

function getHealthScore(
  record: HealthRecord
): number | undefined {
  const item = record as HealthRecord & {
    score?: number;
    healthScore?: number;
    overallScore?: number;
  };

  return (
    item.healthScore ??
    item.score ??
    item.overallScore
  );
}

function getDegradationScore(
  record: DegradationRecord
): number | undefined {
  const item = record as DegradationRecord & {
    score?: number;
    degradationScore?: number;
    overallFactor?: number;
  };

  return (
    item.degradationScore ??
    item.score ??
    item.overallFactor
  );
}

function getFaultActive(
  record: FaultRecord
): boolean {
  const fault = record.fault;

  if (!fault) {
    return false;
  }

  return typeof fault === "object" &&
    fault !== null &&
    "active" in fault
    ? Boolean(
        (fault as { active?: unknown }).active
      )
    : false;
}

/*
 * Integrate a telemetry signal using the trapezoidal rule.
 *
 * This is useful for fuel consumption because fuel-flow is
 * normally expressed in L/h while telemetry is time-based.
 */
function integrateRate(
  records: TelemetryRecord[],
  getRate: (record: TelemetryRecord) => number | undefined
): number | undefined {
  if (records.length < 2) {
    return undefined;
  }

  let total = 0;
  let hasValidInterval = false;

  for (let i = 1; i < records.length; i += 1) {
    const previous = records[i - 1];
    const current = records[i];

    const previousRate = getRate(previous);
    const currentRate = getRate(current);

    if (
      previousRate === undefined ||
      currentRate === undefined
    ) {
      continue;
    }

    const previousTime = telemetryTimestamp(previous);
    const currentTime = telemetryTimestamp(current);

    const dtHours =
      (currentTime - previousTime) / 3_600_000;

    if (
      !Number.isFinite(dtHours) ||
      dtHours <= 0 ||
      dtHours > 1
    ) {
      continue;
    }

    total +=
      ((previousRate + currentRate) / 2) * dtHours;

    hasValidInterval = true;
  }

  return hasValidInterval ? total : undefined;
}

function calculateDuration(
  records: TelemetryRecord[]
): number {
  if (records.length < 2) {
    return 0;
  }

  const start = telemetryTimestamp(records[0]);
  const end = telemetryTimestamp(
    records[records.length - 1]
  );

  if (!start || !end || end <= start) {
    return 0;
  }

  return (end - start) / 1000;
}

/* -------------------------------------------------------------------------- */
/* Stage analysis                                                             */
/* -------------------------------------------------------------------------- */

function calculateStageStatistics(
  records: TelemetryRecord[]
): StageStatistics[] {
  const groups = new Map<string, TelemetryRecord[]>();

  for (const record of records) {
    const stage =
      record.stageName || "UNKNOWN";

    const existing = groups.get(stage) || [];

    existing.push(record);

    groups.set(stage, existing);
  }

  return [...groups.entries()].map(
    ([stageName, stageRecords]) => {
      const sorted = [...stageRecords].sort(
        (a, b) =>
          telemetryTimestamp(a) -
          telemetryTimestamp(b)
      );

      const fuelConsumed = integrateRate(
        sorted,
        (record) => record.fuelFlow
      );

      return {
        stageName,

        sampleCount: sorted.length,

        durationSeconds:
          calculateDuration(sorted),

        averageRPM: average(
          sorted.map((record) => record.rpm)
        ),

        maximumRPM: maximum(
          sorted.map((record) => record.rpm)
        ),

        averageThrottle: average(
          sorted.map((record) => record.throttle)
        ),

        maximumThrottle: maximum(
          sorted.map((record) => record.throttle)
        ),

        averageAltitude: average(
          sorted.map((record) => record.altitude)
        ),

        maximumAltitude: maximum(
          sorted.map((record) => record.altitude)
        ),

        averageCHT: average(
          sorted.map((record) => record.cht)
        ),

        maximumCHT: maximum(
          sorted.map((record) => record.cht)
        ),

        averageEGT: average(
          sorted.map((record) => record.egt)
        ),

        maximumEGT: maximum(
          sorted.map((record) => record.egt)
        ),

        averageOilTemperature: average(
          sorted.map((record) => record.oilTemperature)
        ),

        maximumOilTemperature: maximum(
          sorted.map((record) => record.oilTemperature)
        ),

        averageOilPressure: average(
          sorted.map((record) => record.oilPressure)
        ),

        minimumOilPressure: minimum(
          sorted.map((record) => record.oilPressure)
        ),

        averageVibration: average(
          sorted.map((record) => record.vibration)
        ),

        maximumVibration: maximum(
          sorted.map((record) => record.vibration)
        ),

        averagePowerKW: average(
          sorted.map((record) => record.brakePower)
        ),

        maximumPowerKW: maximum(
          sorted.map((record) => record.brakePower)
        ),

        averageTorqueNm: average(
          sorted.map((record) => record.brakeTorque)
        ),

        averageFuelFlowLph: average(
          sorted.map((record) => record.fuelFlow)
        ),

        fuelConsumedLiters: fuelConsumed,

        averageBSFC: average(
          sorted.map((record) => record.bsfc)
        ),
      };
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Overall analysis                                                           */
/* -------------------------------------------------------------------------- */

function calculateStatistics(
  mission: HistoricalMission,
  telemetry: TelemetryRecord[],
  faults: FaultRecord[],
  health: HealthRecord[],
  degradation: DegradationRecord[]
): PostFlightStatistics {
  const sortedTelemetry = [...telemetry].sort(
    (a, b) =>
      telemetryTimestamp(a) -
      telemetryTimestamp(b)
  );

  const startTime =
    sortedTelemetry.length > 0
      ? telemetryTimestamp(sortedTelemetry[0])
      : mission.startTime;

  const endTime =
    sortedTelemetry.length > 0
      ? telemetryTimestamp(
          sortedTelemetry[sortedTelemetry.length - 1]
        )
      : mission.endTime;

  const totalFuelConsumed =
    integrateRate(
      sortedTelemetry,
      (record) => record.fuelFlow
    );

  const healthScores = health
    .map(getHealthScore)
    .filter(
      (value): value is number =>
        value !== undefined
    );

  const degradationScores = degradation
    .map(getDegradationScore)
    .filter(
      (value): value is number =>
        value !== undefined
    );

  const healthStart =
    healthScores.length > 0
      ? healthScores[0]
      : undefined;

  const healthEnd =
    healthScores.length > 0
      ? healthScores[healthScores.length - 1]
      : undefined;

  const degradationStart =
    degradationScores.length > 0
      ? degradationScores[0]
      : undefined;

  const degradationEnd =
    degradationScores.length > 0
      ? degradationScores[
          degradationScores.length - 1
        ]
      : undefined;

  return {
    missionId: mission.id,

    startTime,
    endTime,

    durationSeconds:
      calculateDuration(sortedTelemetry),

    sampleCount: sortedTelemetry.length,

    averageRPM: average(
      sortedTelemetry.map((record) => record.rpm)
    ),

    maximumRPM: maximum(
      sortedTelemetry.map((record) => record.rpm)
    ),

    minimumRPM: minimum(
      sortedTelemetry.map((record) => record.rpm)
    ),

    averageThrottle: average(
      sortedTelemetry.map(
        (record) => record.throttle
      )
    ),

    maximumThrottle: maximum(
      sortedTelemetry.map(
        (record) => record.throttle
      )
    ),

    averageAltitude: average(
      sortedTelemetry.map(
        (record) => record.altitude
      )
    ),

    maximumAltitude: maximum(
      sortedTelemetry.map(
        (record) => record.altitude
      )
    ),

    averageCHT: average(
      sortedTelemetry.map((record) => record.cht)
    ),

    maximumCHT: maximum(
      sortedTelemetry.map((record) => record.cht)
    ),

    averageEGT: average(
      sortedTelemetry.map((record) => record.egt)
    ),

    maximumEGT: maximum(
      sortedTelemetry.map((record) => record.egt)
    ),

    averageOilTemperature: average(
      sortedTelemetry.map(
        (record) => record.oilTemperature
      )
    ),

    maximumOilTemperature: maximum(
      sortedTelemetry.map(
        (record) => record.oilTemperature
      )
    ),

    averageOilPressure: average(
      sortedTelemetry.map(
        (record) => record.oilPressure
      )
    ),

    minimumOilPressure: minimum(
      sortedTelemetry.map(
        (record) => record.oilPressure
      )
    ),

    averageVibration: average(
      sortedTelemetry.map(
        (record) => record.vibration
      )
    ),

    maximumVibration: maximum(
      sortedTelemetry.map(
        (record) => record.vibration
      )
    ),

    averagePowerKW: average(
      sortedTelemetry.map(
        (record) => record.brakePower
      )
    ),

    maximumPowerKW: maximum(
      sortedTelemetry.map(
        (record) => record.brakePower
      )
    ),

    averageTorqueNm: average(
      sortedTelemetry.map(
        (record) => record.brakeTorque
      )
    ),

    maximumTorqueNm: maximum(
      sortedTelemetry.map(
        (record) => record.brakeTorque
      )
    ),

    averageFuelFlowLph: average(
      sortedTelemetry.map(
        (record) => record.fuelFlow
      )
    ),

    totalFuelConsumedLiters:
      totalFuelConsumed,

    averageBSFC: average(
      sortedTelemetry.map(
        (record) => record.bsfc
      )
    ),

    faultCount: faults.length,

    activeFaultCount: faults.filter(
      getFaultActive
    ).length,

    healthStart,
    healthEnd,

    healthMinimum:
      healthScores.length > 0
        ? Math.min(...healthScores)
        : undefined,

    healthTrend:
      healthStart !== undefined &&
      healthEnd !== undefined
        ? healthEnd - healthStart
        : undefined,

    degradationStart,
    degradationEnd,

    degradationTrend:
      degradationStart !== undefined &&
      degradationEnd !== undefined
        ? degradationEnd - degradationStart
        : undefined,

    stageStatistics:
      calculateStageStatistics(
        sortedTelemetry
      ),
  };
}

/* -------------------------------------------------------------------------- */
/* Warnings                                                                   */
/* -------------------------------------------------------------------------- */

function generateWarnings(
  statistics: PostFlightStatistics,
  faults: FaultRecord[]
): string[] {
  const warnings: string[] = [];

  if (
    statistics.maximumCHT !== undefined &&
    statistics.maximumCHT >= 200
  ) {
    warnings.push(
      "Cylinder head temperature reached a critical thermal range."
    );
  } else if (
    statistics.maximumCHT !== undefined &&
    statistics.maximumCHT >= 185
  ) {
    warnings.push(
      "Cylinder head temperature reached an elevated range."
    );
  }

  if (
    statistics.maximumEGT !== undefined &&
    statistics.maximumEGT >= 900
  ) {
    warnings.push(
      "Exhaust gas temperature reached a critical range."
    );
  } else if (
    statistics.maximumEGT !== undefined &&
    statistics.maximumEGT >= 820
  ) {
    warnings.push(
      "Exhaust gas temperature reached an elevated range."
    );
  }

  if (
    statistics.minimumOilPressure !== undefined &&
    statistics.minimumOilPressure < 1.5
  ) {
    warnings.push(
      "Oil pressure dropped below the recommended operating range."
    );
  }

  if (
    statistics.maximumVibration !== undefined &&
    statistics.maximumVibration >= 1
  ) {
    warnings.push(
      "Elevated vibration was detected during the mission."
    );
  }

  if (statistics.faultCount > 0) {
    warnings.push(
      `${statistics.faultCount} fault event(s) were recorded during the mission.`
    );
  }

  if (statistics.activeFaultCount > 0) {
    warnings.push(
      `${statistics.activeFaultCount} fault event(s) remained active in the recorded fault history.`
    );
  }

  if (
    statistics.healthEnd !== undefined &&
    statistics.healthEnd < 60
  ) {
    warnings.push(
      "Final engine health score indicates degraded operating condition."
    );
  }

  if (
    statistics.degradationEnd !== undefined &&
    statistics.degradationEnd > 0.3
  ) {
    warnings.push(
      "Engine degradation exceeded the normal monitoring threshold."
    );
  }

  /*
   * Check for abnormal RPM excursions.
   */
  if (
    statistics.maximumRPM !== undefined &&
    statistics.maximumRPM > 3600
  ) {
    warnings.push(
      "Recorded RPM exceeded the configured engine maximum."
    );
  }

  /*
   * Include unique fault types in the warning summary.
   */
  const faultTypes = new Set<string>();

  for (const record of faults) {
    if (record.fault) {
      faultTypes.add(record.fault);
    }
  }

  if (faultTypes.size > 0) {
    warnings.push(
      `Fault types observed: ${[
        ...faultTypes,
      ].join(", ")}.`
    );
  }

  return warnings;
}

/* -------------------------------------------------------------------------- */
/* Recommendations                                                            */
/* -------------------------------------------------------------------------- */

function generateRecommendations(
  statistics: PostFlightStatistics
): string[] {
  const recommendations: string[] = [];

  if (
    statistics.maximumCHT !== undefined &&
    statistics.maximumCHT >= 185
  ) {
    recommendations.push(
      "Inspect cooling-system performance and review high-load operating periods."
    );
  }

  if (
    statistics.maximumEGT !== undefined &&
    statistics.maximumEGT >= 820
  ) {
    recommendations.push(
      "Review mixture, injector performance and combustion conditions during high-load stages."
    );
  }

  if (
    statistics.minimumOilPressure !== undefined &&
    statistics.minimumOilPressure < 1.5
  ) {
    recommendations.push(
      "Inspect the lubrication system and verify oil pressure sensor accuracy."
    );
  }

  if (
    statistics.maximumVibration !== undefined &&
    statistics.maximumVibration >= 1
  ) {
    recommendations.push(
      "Inspect propeller balance, engine mounts and rotating components for abnormal vibration."
    );
  }

  if (
    statistics.healthTrend !== undefined &&
    statistics.healthTrend < -5
  ) {
    recommendations.push(
      "Schedule a health review because the recorded health score declined during the mission."
    );
  }

  if (
    statistics.degradationEnd !== undefined &&
    statistics.degradationEnd > 0.3
  ) {
    recommendations.push(
      "Consider preventive maintenance inspection based on the measured degradation level."
    );
  }

  if (
    statistics.averageBSFC !== undefined &&
    statistics.averageBSFC > 450
  ) {
    recommendations.push(
      "Review fuel-system efficiency and operating-point selection because BSFC was relatively high."
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "No immediate maintenance action was identified from the recorded mission data."
    );
  }

  return recommendations;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Analyze a completed mission using already-recorded local data.
 *
 * This function intentionally does not query the simulation engine.
 * Post-flight analysis must operate on historical evidence.
 */
export function analyzePostFlight(
  mission: HistoricalMission,
  telemetry: TelemetryRecord[],
  faults: FaultRecord[] = [],
  health: HealthRecord[] = [],
  degradation: DegradationRecord[] = []
): PostFlightAnalysis {
  const sortedTelemetry = [...telemetry].sort(
    (a, b) =>
      telemetryTimestamp(a) -
      telemetryTimestamp(b)
  );

  const sortedFaults = [...faults].sort(
    (a, b) =>
      (a.timestamp || 0) -
      (b.timestamp || 0)
  );

  const sortedHealth = [...health].sort(
    (a, b) =>
      (a.timestamp || 0) -
      (b.timestamp || 0)
  );

  const sortedDegradation = [
    ...degradation,
  ].sort(
    (a, b) =>
      (a.timestamp || 0) -
      (b.timestamp || 0)
  );

  const statistics = calculateStatistics(
    mission,
    sortedTelemetry,
    sortedFaults,
    sortedHealth,
    sortedDegradation
  );

  return {
    mission,

    statistics,

    telemetry: sortedTelemetry,

    faults: sortedFaults,

    health: sortedHealth,

    degradation: sortedDegradation,

    warnings: generateWarnings(
      statistics,
      sortedFaults
    ),

    recommendations:
      generateRecommendations(statistics),

    generatedAt: Date.now(),
  };
}

/**
 * Convenience helper for calculating statistics only.
 */
export function calculatePostFlightStatistics(
  mission: HistoricalMission,
  telemetry: TelemetryRecord[],
  faults: FaultRecord[] = [],
  health: HealthRecord[] = [],
  degradation: DegradationRecord[] = []
): PostFlightStatistics {
  return analyzePostFlight(
    mission,
    telemetry,
    faults,
    health,
    degradation
  ).statistics;
}

/**
 * Generate a compact human-readable summary.
 */
export function createPostFlightSummary(
  analysis: PostFlightAnalysis
): string {
  const stats = analysis.statistics;

  const durationMinutes =
    stats.durationSeconds / 60;

  const lines: string[] = [
    `Mission: ${stats.missionId}`,
    `Duration: ${durationMinutes.toFixed(1)} min`,
    `Telemetry samples: ${stats.sampleCount}`,
  ];

  if (stats.averageRPM !== undefined) {
    lines.push(
      `Average RPM: ${stats.averageRPM.toFixed(0)}`
    );
  }

  if (stats.maximumRPM !== undefined) {
    lines.push(
      `Maximum RPM: ${stats.maximumRPM.toFixed(0)}`
    );
  }

  if (stats.maximumCHT !== undefined) {
    lines.push(
      `Maximum CHT: ${stats.maximumCHT.toFixed(1)} °C`
    );
  }

  if (stats.maximumEGT !== undefined) {
    lines.push(
      `Maximum EGT: ${stats.maximumEGT.toFixed(1)} °C`
    );
  }

  if (
    stats.totalFuelConsumedLiters !== undefined
  ) {
    lines.push(
      `Fuel consumed: ${stats.totalFuelConsumedLiters.toFixed(
        2
      )} L`
    );
  }

  if (stats.maximumPowerKW !== undefined) {
    lines.push(
      `Maximum power: ${stats.maximumPowerKW.toFixed(
        2
      )} kW`
    );
  }

  if (stats.averageBSFC !== undefined) {
    lines.push(
      `Average BSFC: ${stats.averageBSFC.toFixed(
        1
      )} g/kWh`
    );
  }

  lines.push(`Fault events: ${stats.faultCount}`);

  if (stats.healthEnd !== undefined) {
    lines.push(
      `Final health score: ${stats.healthEnd.toFixed(
        1
      )}`
    );
  }

  if (
    analysis.warnings.length > 0
  ) {
    lines.push(
      `Warnings: ${analysis.warnings.length}`
    );
  }

  return lines.join("\n");
}

export default analyzePostFlight;