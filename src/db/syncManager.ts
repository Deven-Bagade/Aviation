import type {
  TelemetryRecord as AppTelemetryRecord,
  FaultRecord as AppFaultRecord,
  MaintenanceRecord as AppMaintenanceRecord,
  Health,
  DegradationState,
} from "../types";

import type {
  TelemetryRecord as HistoricalTelemetryRecord,
  FaultRecord as HistoricalFaultRecord,
  MaintenanceRecord as HistoricalMaintenanceRecord,
  SyncQueueRecord,
} from "./historicalStore";

import { historicalDb } from "./historicalDb";
import { firebaseStore } from "./firebaseStore";

/**
 * Types of records that can be synchronized.
 */
export type SyncRecordType =
  | "telemetry"
  | "health"
  | "degradation"
  | "fault"
  | "maintenance"
  | "mission";

/**
 * Synchronization configuration.
 */
export interface SyncManagerConfig {
  enabled?: boolean;
  intervalMs?: number;
  batchSize?: number;
  maxRetryAttempts?: number;
}

/**
 * Synchronization status exposed to the UI.
 */
export interface SyncStatus {
  running: boolean;
  online: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  lastSyncAt: number | null;
  lastError: string | null;
}

/**
 * Result returned by syncNow().
 */
export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  failed: number;
  skipped: number;
  error?: string;
}

/**
 * Default synchronization settings.
 */
const DEFAULT_CONFIG: Required<SyncManagerConfig> = {
  enabled: true,
  intervalMs: 30_000,
  batchSize: 100,
  maxRetryAttempts: 8,
};

/**
 * Cloud synchronization manager.
 *
 * Architecture:
 *
 * Application
 *     ↓
 * SyncManager
 *     ↓
 * IndexedDB Sync Queue
 *     ↓
 * Firebase
 *
 * IndexedDB remains the local source of truth.
 * Firebase is an asynchronous cloud replica.
 */
export class SyncManager {
  private config: Required<SyncManagerConfig>;

  private timer:
    ReturnType<typeof setInterval> | null = null;

  private running = false;

  private syncing = false;

  private online =
    typeof navigator === "undefined"
      ? true
      : navigator.onLine;

  private lastSyncAt:
    number | null = null;

  private lastError:
    string | null = null;

  private listeners =
    new Set<(status: SyncStatus) => void>();

  private onlineHandler = () => {
    this.online = true;
    this.emitStatus();

    /*
     * Try synchronization shortly after
     * the connection returns.
     */
    if (this.running) {
      void this.syncNow();
    }
  };

  private offlineHandler = () => {
    this.online = false;
    this.emitStatus();
  };

  constructor(
    config: SyncManagerConfig = {}
  ) {
    this.config = {
      enabled:
        config.enabled ??
        DEFAULT_CONFIG.enabled,

      intervalMs:
        config.intervalMs ??
        DEFAULT_CONFIG.intervalMs,

      batchSize:
        config.batchSize ??
        DEFAULT_CONFIG.batchSize,

      maxRetryAttempts:
        config.maxRetryAttempts ??
        DEFAULT_CONFIG.maxRetryAttempts,
    };

    if (
      typeof window !== "undefined"
    ) {
      window.addEventListener(
        "online",
        this.onlineHandler
      );

      window.addEventListener(
        "offline",
        this.offlineHandler
      );
    }
  }

  // =========================================================
  // LIFECYCLE
  // =========================================================

  /**
   * Start synchronization.
   *
   * intervalMs is optional so existing calls such as:
   *
   * syncManager.start()
   *
   * continue to work.
   *
   * Recorder can also provide:
   *
   * syncManager.start(30000)
   */
  start(
    intervalMs?: number
  ): void {
    if (!this.config.enabled) {
      return;
    }

    if (!firebaseStore.isConfigured()) {
      console.info(
        "[SyncManager] Firebase is not configured " +
          "(missing VITE_FIREBASE_* variables) — " +
          "cloud sync will stay off."
      );

      return;
    }

    /*
     * If already running, update the interval if
     * a new value was supplied.
     */
    if (this.running) {
      if (
        intervalMs !== undefined &&
        intervalMs > 0
      ) {
        this.restartTimer(
          intervalMs
        );
      }

      return;
    }

    this.running = true;

    if (
      intervalMs !== undefined &&
      intervalMs > 0
    ) {
      this.config.intervalMs =
        intervalMs;
    }

    this.startTimer();

    /*
     * Perform an initial synchronization.
     */
    void this.syncNow();

    this.emitStatus();
  }

  /**
   * Stop synchronization.
   */
  stop(): void {
    this.running = false;

    this.clearTimer();

    this.emitStatus();
  }

  /**
   * Start/restart periodic timer.
   */
  private startTimer(): void {
    this.clearTimer();

    this.timer =
      setInterval(
        () => {
          void this.syncNow();
        },
        this.config.intervalMs
      );
  }

  /**
   * Restart timer using a new interval.
   */
  private restartTimer(
    intervalMs: number
  ): void {
    this.config.intervalMs =
      intervalMs;

    if (this.running) {
      this.startTimer();
    }
  }

  /**
   * Clear timer.
   */
  private clearTimer(): void {
    if (this.timer) {
      clearInterval(
        this.timer
      );

      this.timer = null;
    }
  }

  // =========================================================
  // STATUS
  // =========================================================

  /**
   * Get current synchronization status.
   */
  getStatus(): SyncStatus {
    return {
      running:
        this.running,

      online:
        this.online,

      syncing:
        this.syncing,

      pending: 0,

      failed: 0,

      lastSyncAt:
        this.lastSyncAt,

      lastError:
        this.lastError,
    };
  }

  /**
   * Subscribe to status updates.
   */
  subscribe(
    listener: (
      status: SyncStatus
    ) => void
  ): () => void {
    this.listeners.add(
      listener
    );

    listener(
      this.getStatus()
    );

    return () => {
      this.listeners.delete(
        listener
      );
    };
  }

  /**
   * Emit status.
   */
  private emitStatus(): void {
    const status =
      this.getStatus();

    for (
      const listener of this.listeners
    ) {
      try {
        listener(status);
      } catch (error) {
        console.error(
          "Sync status listener error:",
          error
        );
      }
    }
  }

  // =========================================================
  // QUEUE HELPERS
  // =========================================================

  /**
   * Add an item to the synchronization queue.
   */
  private queue(
    type: SyncRecordType,
    recordId: string,
    missionId?: string
  ): void {
    const item: SyncQueueRecord = {
      id: `${type}:${recordId}`,
      type,
      recordId,
      missionId,
      status: "pending",
      attempts: 0,
      createdAt: Date.now(),
    };

    void historicalDb
      .queueSyncItem(item)
      .catch((error) => {
        console.error(
          `Failed to queue ${type}:`,
          error
        );
      });
  }

  // =========================================================
  // TELEMETRY QUEUE
  // =========================================================

  /**
   * Queue telemetry for cloud synchronization.
   */
  queueTelemetry(
    record: AppTelemetryRecord
  ): void {
    const recordId =
      this.getRecordId(
        record
      );

    this.queue(
      "telemetry",
      recordId,
      this.getMissionId(
        record
      )
    );
  }

  // =========================================================
  // FAULT QUEUE
  // =========================================================

  /**
   * Queue a fault for cloud synchronization.
   */
  queueFault(
    record: AppFaultRecord
  ): void {
    const recordId =
      this.getRecordId(
        record
      );

    this.queue(
      "fault",
      recordId,
      this.getMissionId(
        record
      )
    );
  }

  // =========================================================
  // MAINTENANCE QUEUE
  // =========================================================

  /**
   * Queue a maintenance record for cloud synchronization.
   *
   * This method was missing from the previous implementation.
   */
  queueMaintenance(
    record: AppMaintenanceRecord
  ): void {
    const recordId =
      this.getRecordId(
        record
      );

    this.queue(
      "maintenance",
      recordId,
      this.getMissionId(
        record
      )
    );
  }

  // =========================================================
  // HEALTH QUEUE
  // =========================================================

  /**
   * Queue health data.
   */
  queueHealth(
    missionId: string,
    timestamp: number
  ): void {
    this.queue(
      "health",
      `${missionId}:${timestamp}`,
      missionId
    );
  }

  // =========================================================
  // DEGRADATION QUEUE
  // =========================================================

  /**
   * Queue degradation data.
   */
  queueDegradation(
    missionId: string,
    timestamp: number
  ): void {
    this.queue(
      "degradation",
      `${missionId}:${timestamp}`,
      missionId
    );
  }

  // =========================================================
  // MISSION QUEUE
  // =========================================================

  /**
   * Queue mission metadata.
   */
  queueMission(
    missionId: string
  ): void {
    this.queue(
      "mission",
      missionId,
      missionId
    );
  }

  // =========================================================
  // SYNCHRONIZATION
  // =========================================================

  /**
   * Synchronize local data with Firebase.
   *
   * Upload:
   *   IndexedDB queue → Firebase
   *
   * Download:
   *   Firebase → IndexedDB
   */
  async syncNow(): Promise<SyncResult> {
    if (this.syncing) {
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        failed: 0,
        skipped: 1,
        error:
          "Synchronization already in progress.",
      };
    }

    if (!this.config.enabled) {
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        failed: 0,
        skipped: 1,
        error:
          "Cloud synchronization is disabled.",
      };
    }

    if (!firebaseStore.isConfigured()) {
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        failed: 0,
        skipped: 1,
        error:
          "Firebase is not configured. Add VITE_FIREBASE_* variables to your .env file.",
      };
    }

    if (!this.online) {
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        failed: 0,
        skipped: 1,
        error:
          "Device is offline.",
      };
    }

    this.syncing = true;

    this.lastError = null;

    this.emitStatus();

    let uploaded = 0;
    let downloaded = 0;
    let failed = 0;

    try {
      /*
       * Upload local pending records first.
       */
      const uploadResult =
        await this.processUploadQueue();

      uploaded =
        uploadResult.uploaded;

      failed =
        uploadResult.failed;

      /*
       * Then download cloud data.
       */
      const downloadResult =
        await this.downloadCloudData();

      downloaded =
        downloadResult.downloaded;

      this.lastSyncAt =
        Date.now();

      return {
        success:
          failed === 0,

        uploaded,

        downloaded,

        failed,

        skipped: 0,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      this.lastError =
        message;

      return {
        success: false,
        uploaded,
        downloaded,
        failed: failed + 1,
        skipped: 0,
        error: message,
      };
    } finally {
      this.syncing = false;

      this.emitStatus();
    }
  }

  // =========================================================
  // UPLOAD
  // =========================================================

  /**
   * Process pending synchronization queue.
   */
  private async processUploadQueue(): Promise<{
    uploaded: number;
    failed: number;
  }> {
    let uploaded = 0;
    let failed = 0;

    const queue =
      await historicalDb.getPendingSync(
        this.config.batchSize
      );

    for (
      const item of queue
    ) {
      try {
        await historicalDb.markSyncProcessing(
          item.id
        );

        await this.uploadQueueItem(
          item
        );

        await historicalDb.markSyncCompleted(
          item.id
        );

        uploaded++;
      } catch (error) {
        failed++;

        await this.handleQueueFailure(
          item,
          error
        );
      }
    }

    return {
      uploaded,
      failed,
    };
  }

  /**
   * Upload one queue item.
   */
  private async uploadQueueItem(
    item: SyncQueueRecord
  ): Promise<void> {
    switch (item.type) {
      case "telemetry":
        await this.uploadTelemetry(
          item.recordId
        );
        break;

      case "fault":
        await this.uploadFault(
          item.recordId
        );
        break;

      case "maintenance":
        await this.uploadMaintenance(
          item.recordId
        );
        break;

      case "health":
        await this.uploadHealth(
          item
        );
        break;

      case "degradation":
        await this.uploadDegradation(
          item
        );
        break;

      case "mission":
        await this.uploadMission(
          item.recordId
        );
        break;

      default:
        throw new Error(
          `Unsupported sync type: ${String(
            item.type
          )}`
        );
    }
  }

  // =========================================================
  // UPLOAD TELEMETRY
  // =========================================================

  private async uploadTelemetry(
    recordId: string
  ): Promise<void> {
    const record =
      await historicalDb.getTelemetryById(
        recordId
      );

    if (!record) {
      throw new Error(
        `Telemetry record not found: ${recordId}`
      );
    }

    await firebaseStore.uploadTelemetry([
      record
    ]);
  }

  // =========================================================
  // UPLOAD FAULT
  // =========================================================

  private async uploadFault(
    recordId: string
  ): Promise<void> {
    const record =
      await historicalDb.getFaultById(
        recordId
      );

    if (!record) {
      throw new Error(
        `Fault record not found: ${recordId}`
      );
    }

    await firebaseStore.uploadFaults([record]);
  }

  // =========================================================
  // UPLOAD MAINTENANCE
  // =========================================================

  private async uploadMaintenance(
    recordId: string
  ): Promise<void> {
    const record =
      await historicalDb.getMaintenanceById(
        recordId
      );

    if (!record) {
      throw new Error(
        `Maintenance record not found: ${recordId}`
      );
    }

    await firebaseStore.uploadMaintenance([record]);
  }

  // =========================================================
  // UPLOAD HEALTH
  // =========================================================

  private async uploadHealth(
    item: SyncQueueRecord
  ): Promise<void> {
    if (!item.missionId) {
      throw new Error(
        "Health synchronization item has no missionId."
      );
    }

    const timestamp =
      this.extractTimestamp(
        item.recordId
      );

    const records =
      await historicalDb.getHealth(
        item.missionId,
        timestamp,
        timestamp
      );
    const record = records[0];

    if (!record) {
      throw new Error(
        `Health record not found: ${item.recordId}`
      );
    }

    await firebaseStore.uploadHealth([record]);
  }

  // =========================================================
  // UPLOAD DEGRADATION
  // =========================================================

  private async uploadDegradation(
    item: SyncQueueRecord
  ): Promise<void> {
    if (!item.missionId) {
      throw new Error(
        "Degradation synchronization item has no missionId."
      );
    }

    const timestamp =
      this.extractTimestamp(
        item.recordId
      );

    const records =
      await historicalDb.getDegradation(
        item.missionId,
        timestamp,
        timestamp
      );
    const record = records[0];

    if (!record) {
      throw new Error(
        `Degradation record not found: ${item.recordId}`
      );
    }

    await firebaseStore.uploadDegradation([record]);
  }

  // =========================================================
  // UPLOAD MISSION
  // =========================================================

  private async uploadMission(
    missionId: string
  ): Promise<void> {
    const mission =
      await historicalDb.getMission(
        missionId
      );

    if (!mission) {
      throw new Error(
        `Mission not found: ${missionId}`
      );
    }

    await firebaseStore.uploadMissions([mission]);
  }

  // =========================================================
  // DOWNLOAD
  // =========================================================

  /**
   * Download cloud data.
   *
   * Only known missions are downloaded to avoid
   * blindly pulling an entire Firebase database.
   */
  private async downloadCloudData(): Promise<{
    downloaded: number;
  }> {
    let downloaded = 0;

    try {
      const missions =
        await firebaseStore.downloadMissions();

      for (
        const mission of missions
      ) {
        await historicalDb.saveMission(
          mission
        );

        downloaded++;

        const missionId =
          this.getMissionId(
            mission
          );

        if (!missionId) {
          continue;
        }

        /*
         * Download mission telemetry.
         */
        const telemetry =
          await firebaseStore.downloadTelemetry(
            missionId
          );

        if (
          telemetry.length > 0
        ) {
          await historicalDb.saveTelemetryBatch(
            telemetry
          );

          downloaded +=
            telemetry.length;
        }

        /*
         * Download mission faults.
         */
        const faults =
          await firebaseStore.downloadFaults(
            missionId
          );

        for (
          const fault of faults
        ) {
          await historicalDb.saveFault(
            fault
          );

          downloaded++;
        }

        /*
         * Download maintenance records.
         */
        const maintenance =
          await firebaseStore.downloadMaintenance(
            missionId
          );

        for (
          const record of maintenance
        ) {
          await historicalDb.saveMaintenance(
            record
          );

          downloaded++;
        }
      }
    } catch (error) {
      /*
       * Firebase configuration may intentionally
       * be absent during offline/local development.
       *
       * Do not destroy local recording because of that.
       */
      console.warn(
        "Cloud download skipped:",
        error
      );
    }

    return {
      downloaded,
    };
  }

  // =========================================================
  // FAILURE / RETRY
  // =========================================================

  /**
   * Handle a failed queue item.
   */
  private async handleQueueFailure(
    item: SyncQueueRecord,
    error: unknown
  ): Promise<void> {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      `Sync failed for ${item.type}:${item.recordId}`,
      error
    );

    const attempts =
      (item.attempts ?? 0) + 1;

    if (
      attempts >=
      this.config.maxRetryAttempts
    ) {
      await historicalDb.markSyncFailed(
        item.id,
        message
      );

      return;
    }

    /*
     * Put the item back into the pending queue.
     */
    await historicalDb.requeueSyncItem(
      item.id,
      attempts,
      message
    );
  }

  /**
   * Retry failed synchronization items.
   */
  async retryFailed(): Promise<void> {
    await historicalDb.retryFailedSyncItems();

    this.lastError = null;

    this.emitStatus();

    if (this.online) {
      await this.syncNow();
    }
  }

  // =========================================================
  // HELPERS
  // =========================================================

  /**
   * Extract a stable record ID.
   *
   * Application telemetry/fault records can use numeric,
   * string or optional IDs. IndexedDB synchronization
   * requires a string ID.
   */
  private getRecordId(
    record: unknown
  ): string {
    const value =
      record as {
        id?: string | number;
        timestamp?: number;
      };

    if (
      value.id !== undefined &&
      value.id !== null
    ) {
      return String(
        value.id
      );
    }

    if (
      value.timestamp !== undefined
    ) {
      return String(
        value.timestamp
      );
    }

    /*
     * Last-resort deterministic-ish ID for
     * records that have neither id nor timestamp.
     */
    return `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  /**
   * Extract mission ID from arbitrary record.
   */
  private getMissionId(
    record: unknown
  ): string | undefined {
    const value =
      record as {
        missionId?: string;
      };

    return value.missionId;
  }

  /**
   * Extract timestamp from IDs formatted as:
   *
   * missionId:timestamp
   */
  private extractTimestamp(
    id: string
  ): number {
    const parts =
      id.split(":");

    const timestamp =
      Number(
        parts[parts.length - 1]
      );

    if (
      !Number.isFinite(timestamp)
    ) {
      throw new Error(
        `Invalid timestamp in sync ID: ${id}`
      );
    }

    return timestamp;
  }

  /**
   * Cleanup event listeners.
   */
  destroy(): void {
    this.stop();

    if (
      typeof window !== "undefined"
    ) {
      window.removeEventListener(
        "online",
        this.onlineHandler
      );

      window.removeEventListener(
        "offline",
        this.offlineHandler
      );
    }

    this.listeners.clear();
  }
}

/**
 * Global synchronization manager.
 */
export const syncManager =
  new SyncManager();

export default syncManager;