
import {
  Telemetry,
  Health,
  DegradationState,
  FaultRecord as AppFaultRecord,
  MaintenanceRecord as AppMaintenanceRecord,
} from "../types";

import {
  TelemetryRecord as HistoricalTelemetryRecord,
  HealthRecord as HistoricalHealthRecord,
  DegradationRecord as HistoricalDegradationRecord,
  FaultRecord as HistoricalFaultRecord,
  MaintenanceRecord as HistoricalMaintenanceRecord,
  SyncQueueRecord,
  SyncQueueItemType,
} from "./historicalStore";

import { historicalDb } from "./historicalDb";
import { syncManager } from "./syncManager";

/* ============================================================
 * CONFIGURATION
 * ========================================================== */

export interface RecorderConfig {
  bufferSize?: number;
  flushIntervalMs?: number;
  enableCloudSync?: boolean;
  cloudSyncIntervalMs?: number;
}

/* ============================================================
 * INTERNAL TYPES
 * ========================================================== */

interface BufferedTelemetry {
  record: HistoricalTelemetryRecord;
}

/* ============================================================
 * RECORDER
 * ========================================================== */

export class Recorder {
  private buffer: BufferedTelemetry[] = [];

  private flushTimer:
    ReturnType<typeof setInterval> | null = null;

  private running = false;

  private config: Required<RecorderConfig>;

  private currentMissionId:
    string | null = null;

  private currentMissionStage:
    string | null = null;

  private latestHealth:
    Health | null = null;

  private latestDegradation:
    DegradationState | null = null;

  private totalRecorded = 0;

  private totalFlushes = 0;

  private totalErrors = 0;

  constructor(
    config: RecorderConfig = {}
  ) {
    this.config = {
      bufferSize: Math.max(
        1,
        config.bufferSize ?? 50
      ),

      flushIntervalMs: Math.max(
        250,
        config.flushIntervalMs ?? 5000
      ),

      enableCloudSync:
        config.enableCloudSync ?? true,

      cloudSyncIntervalMs: Math.max(
        1000,
        config.cloudSyncIntervalMs ?? 30000
      ),
    };
  }

  /* ==========================================================
   * LIFECYCLE
   * ======================================================== */

  start(
    missionId?: string
  ): void {
    if (this.running) {
      if (missionId) {
        this.currentMissionId =
          missionId;
      }

      return;
    }

    this.running = true;

    if (missionId) {
      this.currentMissionId =
        missionId;
    }

    this.flushTimer =
      setInterval(
        () => {
          void this.flush();
        },
        this.config.flushIntervalMs
      );

    if (
      this.config.enableCloudSync
    ) {
      try {
        /*
         * Current SyncManager API does not
         * require the interval argument.
         */
        syncManager.start();
      } catch (error) {
        this.totalErrors++;

        console.error(
          "Failed to start sync manager:",
          error
        );
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.flushTimer) {
      clearInterval(
        this.flushTimer
      );

      this.flushTimer = null;
    }

    await this.flush();

    await this.flushSnapshot();

    if (
      this.config.enableCloudSync
    ) {
      try {
        await syncManager.syncNow();
      } catch (error) {
        this.totalErrors++;

        console.error(
          "Final cloud synchronization failed:",
          error
        );
      }

      try {
        syncManager.stop();
      } catch (error) {
        console.error(
          "Failed to stop sync manager:",
          error
        );
      }
    }
  }

  isRecording(): boolean {
    return this.running;
  }

  /* ==========================================================
   * MISSION
   * ======================================================== */

  setMission(
    missionId: string
  ): void {
    this.currentMissionId =
      missionId;
  }

  getMissionId():
    string | null {
    return this.currentMissionId;
  }

  setMissionStage(
    stage: string | null
  ): void {
    this.currentMissionStage =
      stage;
  }

  getMissionStage():
    string | null {
    return this.currentMissionStage;
  }

  /* ==========================================================
   * TELEMETRY
   * ======================================================== */

  recordTelemetry(
    telemetry: Telemetry,
    missionId?: string
  ): void {

    const resolvedMissionId =
      missionId ??
      this.currentMissionId ??
      "live-session";

    const record =
      this.createTelemetryRecord(
        telemetry,
        resolvedMissionId
      );

    this.buffer.push({
      record,
    });

    this.totalRecorded++;

    if (
      this.buffer.length >=
      this.config.bufferSize
    ) {
      void this.flush();
    }
  }

  recordTelemetryRecord(
    record: HistoricalTelemetryRecord
  ): void {

    const normalized =
      this.normalizeTelemetryRecord(
        record
      );

    this.buffer.push({
      record: normalized,
    });

    this.totalRecorded++;

    if (
      this.buffer.length >=
      this.config.bufferSize
    ) {
      void this.flush();
    }
  }

  private createTelemetryRecord(
    telemetry: Telemetry,
    missionId: string
  ): HistoricalTelemetryRecord {

    const raw =
      telemetry as unknown as Record<
        string,
        unknown
      >;

    const timestamp =
      this.getTelemetryTimestamp(
        raw
      );

    const record: HistoricalTelemetryRecord =
      {
        ...raw,

        id: this.createId(
          "telemetry",
          timestamp
        ),

        missionId,

        stageName:
          this.currentMissionStage ??
          undefined,

        recordedAt:
          timestamp,

        timestamp,
      } as unknown as HistoricalTelemetryRecord;

    return record;
  }

  private normalizeTelemetryRecord(
    record: HistoricalTelemetryRecord
  ): HistoricalTelemetryRecord {

    const raw =
      record as unknown as Record<
        string,
        unknown
      >;

    const timestamp =
      this.getTelemetryTimestamp(
        raw
      );

    const id =
      this.normalizeId(
        raw.id,
        "telemetry"
      );

    const missionId =
      this.getMissionIdFromRecord(
        raw
      );

    return {
      ...record,

      id,

      missionId,

      stageName:
        record.stageName ??
        this.currentMissionStage ??
        undefined,

      recordedAt:
        Number.isFinite(
          record.recordedAt
        )
          ? record.recordedAt
          : timestamp,

      timestamp,
    };
  }

  private getTelemetryTimestamp(
    record: Record<string, unknown>
  ): number {

    const recordedAt =
      record.recordedAt;

    if (
      typeof recordedAt ===
      "number" &&
      Number.isFinite(
        recordedAt
      )
    ) {
      return recordedAt;
    }

    const timestamp =
      record.timestamp;

    if (
      typeof timestamp ===
      "number" &&
      Number.isFinite(
        timestamp
      )
    ) {
      return timestamp;
    }

    return Date.now();
  }

  /* ==========================================================
   * HEALTH
   * ======================================================== */

  updateHealth(
    health: Health
  ): void {
    this.latestHealth =
      health;
  }

  getLatestHealth():
    Health | null {
    return this.latestHealth;
  }

  /* ==========================================================
   * DEGRADATION
   * ======================================================== */

  updateDegradation(
    degradation: DegradationState
  ): void {
    this.latestDegradation =
      degradation;
  }

  getLatestDegradation():
    DegradationState | null {
    return this.latestDegradation;
  }

  /* ==========================================================
   * FAULTS
   * ======================================================== */

  async recordFault(
    fault: AppFaultRecord
  ): Promise<void> {

    const resolved =
      this.normalizeFault(
        fault
      );

    try {

      await historicalDb.saveFault(
        resolved
      );

      await this.enqueueSync(
        "fault",
        String(resolved.id),
        resolved.missionId
      );

    } catch (error) {

      this.totalErrors++;

      console.error(
        "Failed to record fault:",
        error
      );

      throw error;
    }
  }

  private normalizeFault(
    fault: AppFaultRecord
  ): HistoricalFaultRecord {

    const raw =
      fault as unknown as Record<
        string,
        unknown
      >;

    const id =
      this.normalizeId(
        raw.id,
        "fault"
      );

    const missionId =
      this.getMissionIdFromRecord(
        raw
      );

    const timestamp =
      this.normalizeTimestamp(
        raw.timestamp
      );

    /*
     * FaultRecord in historicalStore.ts
     * expects:
     *
     * fault: FaultType | null
     */
    const faultType =
      (
        raw.fault ??
        raw.type ??
        null
      ) as HistoricalFaultRecord["fault"];

    return {
      ...raw,

      id,

      missionId,

      timestamp,

      fault:
        faultType,
    } as HistoricalFaultRecord;
  }

  /* ==========================================================
   * MAINTENANCE
   * ======================================================== */

  async recordMaintenance(
    maintenance: AppMaintenanceRecord
  ): Promise<void> {

    const resolved =
      this.normalizeMaintenance(
        maintenance
      );

    try {

      await historicalDb.saveMaintenance(
        resolved
      );

      await this.enqueueSync(
        "maintenance",
        String(resolved.id),
        resolved.missionId
      );

    } catch (error) {

      this.totalErrors++;

      console.error(
        "Failed to record maintenance:",
        error
      );

      throw error;
    }
  }

  /**
   * Convert the application MaintenanceRecord into the
   * exact MaintenanceRecord expected by historicalStore.ts.
   *
   * The historical type requires at least:
   *
   *   id
   *   missionId
   *   timestamp
   *   action
   *
   * Therefore we explicitly create all required fields.
   */
  private normalizeMaintenance(
    maintenance: AppMaintenanceRecord
  ): HistoricalMaintenanceRecord {

    const raw =
      maintenance as unknown as Record<
        string,
        unknown
      >;

    const id =
      this.normalizeId(
        raw.id,
        "maintenance"
      );

    const missionId =
      this.getMissionIdFromRecord(
        raw
      );

    const timestamp =
      this.normalizeTimestamp(
        raw.timestamp
      );

    /*
     * `action` is required by the project's
     * MaintenanceRecord type.
     *
     * Prefer the existing action value.
     * If the application record uses another
     * property, fall back to a meaningful value.
     */
    const actionValue =
      raw.action ??
      raw.type ??
      raw.description ??
      "maintenance";

    const action =
      String(actionValue);

    /*
     * Build the object first as a generic record,
     * then convert through unknown.
     *
     * This is intentional because types.ts and
     * historicalStore.ts currently expose different
     * structural definitions for MaintenanceRecord.
     */
    const normalized = {
      ...raw,

      id,

      missionId,

      timestamp,

      action,
    };

    return normalized as unknown as HistoricalMaintenanceRecord;
  }

  /* ==========================================================
   * TELEMETRY FLUSH
   * ======================================================== */

  async flush(): Promise<void> {

    if (
      this.buffer.length === 0
    ) {
      return;
    }

    const items =
      this.buffer.splice(
        0,
        this.buffer.length
      );

    const records =
      items.map(
        item => item.record
      );

    try {

      /*
       * IndexedDB is the authoritative local store.
       */
      await historicalDb.saveTelemetryBatch(
        records
      );

      this.totalFlushes++;

      /*
       * Queue only after local persistence succeeds.
       */
      const queueItems =
        records.map(
          record =>
            this.createSyncQueueItem(
              "telemetry",
              String(record.id),
              record.missionId
            )
        );

      await historicalDb.enqueueSyncBatch(
        queueItems
      );

    } catch (error) {

      this.totalErrors++;

      /*
       * Prevent data loss on temporary IndexedDB errors.
       */
      this.buffer.unshift(
        ...records.map(
          record => ({
            record,
          })
        )
      );

      console.error(
        "Failed to flush telemetry:",
        error
      );
    }
  }

  /* ==========================================================
   * SNAPSHOT
   * ======================================================== */

  async flushSnapshot(): Promise<void> {

    const missionId =
      this.currentMissionId ??
      "live-session";

    const timestamp =
      Date.now();

    try {

      /*
       * HEALTH
       */
      if (
        this.latestHealth !== null
      ) {

        const healthId =
          this.createId(
            "health",
            timestamp
          );

        const healthRecord:
          HistoricalHealthRecord =
          {
            id: healthId,

            missionId,

            timestamp,

            health:
              this.latestHealth,
          };

        await historicalDb.saveHealth(
          healthRecord
        );

        await this.enqueueSync(
          "health",
          healthId,
          missionId
        );
      }

      /*
       * DEGRADATION
       */
      if (
        this.latestDegradation !== null
      ) {

        const degradationId =
          this.createId(
            "degradation",
            timestamp
          );

        const degradationRecord:
          HistoricalDegradationRecord =
          {
            id: degradationId,

            missionId,

            timestamp,

            degradation:
              this.latestDegradation,
          };

        await historicalDb.saveDegradation(
          degradationRecord
        );

        await this.enqueueSync(
          "degradation",
          degradationId,
          missionId
        );
      }

    } catch (error) {

      this.totalErrors++;

      console.error(
        "Failed to save snapshot:",
        error
      );
    }
  }

  async flushAll(): Promise<void> {
    await this.flush();

    await this.flushSnapshot();
  }

  /* ==========================================================
   * SYNC QUEUE
   * ======================================================== */

  private async enqueueSync(
    type: SyncQueueItemType,
    recordId: string,
    missionId?: string
  ): Promise<void> {

    /*
     * Explicit String() here guarantees that the
     * SyncQueueRecord contract receives a string.
     */
    const normalizedRecordId =
      String(recordId);

    const item =
      this.createSyncQueueItem(
        type,
        normalizedRecordId,
        missionId
      );

    await historicalDb.enqueueSync(
      item
    );
  }

  private createSyncQueueItem(
    type: SyncQueueItemType,
    recordId: string,
    missionId?: string
  ): SyncQueueRecord {

    return {
      id:
        `${type}:${String(recordId)}`,

      type,

      recordId:
        String(recordId),

      missionId:
        missionId !== undefined
          ? String(missionId)
          : undefined,

      createdAt:
        Date.now(),

      attempts:
        0,

      status:
        "pending",
    };
  }

  /* ==========================================================
   * STATISTICS
   * ======================================================== */

  getStats() {

    return {
      running:
        this.running,

      missionId:
        this.currentMissionId,

      missionStage:
        this.currentMissionStage,

      bufferedSamples:
        this.buffer.length,

      totalRecorded:
        this.totalRecorded,

      totalFlushes:
        this.totalFlushes,

      totalErrors:
        this.totalErrors,

      cloudSync:
        this.getSyncStatusSafely(),
    };
  }

  /* ==========================================================
   * SYNC STATUS
   * ======================================================== */

  private getSyncStatusSafely():
    unknown {

    try {

      const manager =
        syncManager as unknown as {
          getStatus?: () => unknown;
        };

      if (
        typeof manager.getStatus ===
        "function"
      ) {
        return manager.getStatus();
      }

    } catch (error) {

      console.error(
        "Unable to read sync status:",
        error
      );
    }

    return {
      online:
        typeof navigator !==
        "undefined"
          ? navigator.onLine
          : true,

      syncing:
        false,

      pendingCount:
        0,
    };
  }

  /* ==========================================================
   * HELPERS
   * ======================================================== */

  private normalizeId(
    value: unknown,
    prefix: string
  ): string {

    if (
      typeof value ===
      "string" &&
      value.trim().length > 0
    ) {
      return value;
    }

    if (
      typeof value ===
      "number" &&
      Number.isFinite(value)
    ) {
      return String(value);
    }

    return this.createId(
      prefix,
      Date.now()
    );
  }

  private createId(
    prefix: string,
    timestamp: number
  ): string {

    return (
      `${prefix}-${timestamp}-` +
      `${Math.random()
        .toString(36)
        .slice(2, 10)}`
    );
  }

  private normalizeTimestamp(
    value: unknown
  ): number {

    if (
      typeof value ===
      "number" &&
      Number.isFinite(value)
    ) {
      return value;
    }

    if (
      value instanceof Date
    ) {
      return value.getTime();
    }

    if (
      typeof value ===
      "string"
    ) {

      const parsed =
        Date.parse(value);

      if (
        !Number.isNaN(parsed)
      ) {
        return parsed;
      }
    }

    return Date.now();
  }

  private getMissionIdFromRecord(
    record: Record<string, unknown>
  ): string {

    const missionId =
      record.missionId;

    if (
      typeof missionId ===
      "string" &&
      missionId.trim().length > 0
    ) {
      return missionId;
    }

    if (
      typeof missionId ===
      "number" &&
      Number.isFinite(missionId)
    ) {
      return String(missionId);
    }

    return (
      this.currentMissionId ??
      "live-session"
    );
  }
}

/* ============================================================
 * SINGLETON
 * ========================================================== */

export const recorder =
  new Recorder({
    bufferSize: 50,

    flushIntervalMs:
      5000,

    enableCloudSync:
      true,

    cloudSyncIntervalMs:
      30000,
  });

export default recorder;
