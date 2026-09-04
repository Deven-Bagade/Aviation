import {
  openDB,
  IDBPDatabase,
  DBSchema
} from "idb";

import {
  TelemetryRecord,
  HealthRecord,
  DegradationRecord,
  FaultRecord,
  HistoricalMission,
  SyncQueueRecord,
  MaintenanceRecord,
  HistoricalStore
} from "./historicalStore";

/* ============================================================
 * DATABASE CONFIGURATION
 * ========================================================== */

const DB_NAME = "uav-engine-digital-twin";

const DB_VERSION = 3;

/* ============================================================
 * INDEXED DB SCHEMA
 * ========================================================== */

interface UAVEngineDB extends DBSchema {

  telemetry: {
    key: string;
    value: TelemetryRecord;
    indexes: {
      missionId: string;
      recordedAt: number;
      timestamp: number;
      rpm: number;
    };
  };

  health: {
    key: string;
    value: HealthRecord;
    indexes: {
      missionId: string;
      timestamp: number;
    };
  };

  degradation: {
    key: string;
    value: DegradationRecord;
    indexes: {
      missionId: string;
      timestamp: number;
    };
  };

  faults: {
    key: string;
    value: FaultRecord;
    indexes: {
      missionId: string;
      timestamp: number;
      faultType: string;
    };
  };

  maintenance: {
    key: string;
    value: MaintenanceRecord;
    indexes: {
      missionId: string;
    };
  };

  missions: {
    key: string;
    value: HistoricalMission;
    indexes: {
      startTime: number;
      status: string;
    };
  };

  syncQueue: {
    key: string;
    value: SyncQueueRecord;
    indexes: {
      status: string;
      createdAt: number;
      type: string;
      missionId: string;
    };
  };
}

/* ============================================================
 * HELPERS
 * ========================================================== */

/**
 * Converts IDs to strings because the historical DB uses
 * string-based identifiers consistently.
 */
function normalizeId(
  value: unknown,
  fallbackPrefix: string
): string {
  if (
    typeof value === "string" &&
    value.trim().length > 0
  ) {
    return value;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return String(value);
  }

  return `${fallbackPrefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

/**
 * Safely converts a timestamp-like value to milliseconds.
 */
function normalizeTimestamp(
  value: unknown,
  fallback = Date.now()
): number {

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : fallback;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);

    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

/* ============================================================
 * DATABASE OPEN
 * ========================================================== */

let dbPromise:
  Promise<IDBPDatabase<UAVEngineDB>> | null = null;

function getDatabase():
  Promise<IDBPDatabase<UAVEngineDB>> {

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = openDB<UAVEngineDB>(
    DB_NAME,
    DB_VERSION,
    {
      upgrade(db) {

        /* ------------------------------------------------------
         * TELEMETRY
         * ---------------------------------------------------- */

        if (!db.objectStoreNames.contains("telemetry")) {

          const store =
            db.createObjectStore(
              "telemetry",
              {
                keyPath: "id"
              }
            );

          store.createIndex(
            "missionId",
            "missionId"
          );

          store.createIndex(
            "recordedAt",
            "recordedAt"
          );

          store.createIndex(
            "timestamp",
            "timestamp"
          );

          store.createIndex(
            "rpm",
            "rpm"
          );
        }

        /* ------------------------------------------------------
         * HEALTH
         * ---------------------------------------------------- */

        if (!db.objectStoreNames.contains("health")) {

          const store =
            db.createObjectStore(
              "health",
              {
                keyPath: "id"
              }
            );

          store.createIndex(
            "missionId",
            "missionId"
          );

          store.createIndex(
            "timestamp",
            "timestamp"
          );
        }

        /* ------------------------------------------------------
         * DEGRADATION
         * ---------------------------------------------------- */

        if (!db.objectStoreNames.contains("degradation")) {

          const store =
            db.createObjectStore(
              "degradation",
              {
                keyPath: "id"
              }
            );

          store.createIndex(
            "missionId",
            "missionId"
          );

          store.createIndex(
            "timestamp",
            "timestamp"
          );
        }

        /* ------------------------------------------------------
         * FAULTS
         * ---------------------------------------------------- */

        if (!db.objectStoreNames.contains("faults")) {

          const store =
            db.createObjectStore(
              "faults",
              {
                keyPath: "id"
              }
            );

          store.createIndex(
            "missionId",
            "missionId"
          );

          store.createIndex(
            "timestamp",
            "timestamp"
          );

          /*
           * IMPORTANT:
           *
           * Do not use "fault.type" here.
           * Fault is represented directly as a FaultType value
           * in the historicalStore interface.
           */
          store.createIndex(
            "faultType",
            "fault"
          );
        }

        /* ------------------------------------------------------
         * MAINTENANCE
         * ---------------------------------------------------- */

        if (!db.objectStoreNames.contains("maintenance")) {

          const store =
            db.createObjectStore(
              "maintenance",
              {
                keyPath: "id"
              }
            );

          store.createIndex(
            "missionId",
            "missionId"
          );
        }

        /* ------------------------------------------------------
         * MISSIONS
         * ---------------------------------------------------- */

        if (!db.objectStoreNames.contains("missions")) {

          const store =
            db.createObjectStore(
              "missions",
              {
                keyPath: "id"
              }
            );

          store.createIndex(
            "startTime",
            "startTime"
          );

          store.createIndex(
            "status",
            "status"
          );
        }

        /* ------------------------------------------------------
         * SYNC QUEUE
         * ---------------------------------------------------- */

        if (!db.objectStoreNames.contains("syncQueue")) {

          const store =
            db.createObjectStore(
              "syncQueue",
              {
                keyPath: "id"
              }
            );

          store.createIndex(
            "status",
            "status"
          );

          store.createIndex(
            "createdAt",
            "createdAt"
          );

          store.createIndex(
            "type",
            "type"
          );

          store.createIndex(
            "missionId",
            "missionId"
          );
        }
      }
    }
  );

  return dbPromise;
}

/* ============================================================
 * TELEMETRY
 * ========================================================== */

const telemetryStore = {

  async saveTelemetry(
    record: TelemetryRecord
  ): Promise<void> {

    const db = await getDatabase();

    const normalized: TelemetryRecord = {
      ...record,

      id: normalizeId(
        record.id,
        "telemetry"
      ),

      recordedAt:
        normalizeTimestamp(
          record.recordedAt,
          normalizeTimestamp(
            record.timestamp,
            Date.now()
          )
        )
    };

    await db.put(
      "telemetry",
      normalized
    );
  },

  async saveTelemetryBatch(
    records: TelemetryRecord[]
  ): Promise<void> {

    if (!records.length) {
      return;
    }

    const db = await getDatabase();

    const tx = db.transaction(
      "telemetry",
      "readwrite"
    );

    for (const record of records) {

      const normalized: TelemetryRecord = {
        ...record,

        id: normalizeId(
          record.id,
          "telemetry"
        ),

        recordedAt:
          normalizeTimestamp(
            record.recordedAt,
            normalizeTimestamp(
              record.timestamp,
              Date.now()
            )
          )
      };

      await tx.store.put(normalized);
    }

    await tx.done;
  },

  async getTelemetry(
    missionId: string,
    startTime?: number,
    endTime?: number
  ): Promise<TelemetryRecord[]> {

    const db = await getDatabase();

    const records =
      await db.getAllFromIndex(
        "telemetry",
        "missionId",
        missionId
      );

    return records
      .filter(record => {

        const timestamp =
          normalizeTimestamp(
            record.recordedAt,
            normalizeTimestamp(
              record.timestamp
            )
          );

        if (
          startTime !== undefined &&
          timestamp < startTime
        ) {
          return false;
        }

        if (
          endTime !== undefined &&
          timestamp > endTime
        ) {
          return false;
        }

        return true;
      })
      .sort(
        (a, b) =>
          normalizeTimestamp(a.recordedAt) -
          normalizeTimestamp(b.recordedAt)
      );
  },

  async getTelemetryById(
    id: string
  ): Promise<TelemetryRecord | undefined> {

    const db = await getDatabase();

    return db.get(
      "telemetry",
      id
    );
  }
};

/* ============================================================
 * HEALTH
 * ========================================================== */

const healthStore = {

  async saveHealth(
    record: HealthRecord
  ): Promise<void> {

    const db = await getDatabase();

    const normalized: HealthRecord = {
      ...record,

      id: normalizeId(
        record.id,
        "health"
      ),

      timestamp:
        normalizeTimestamp(
          record.timestamp
        )
    };

    await db.put(
      "health",
      normalized
    );
  },

  async getHealth(
    missionId: string,
    startTime?: number,
    endTime?: number
  ): Promise<HealthRecord[]> {

    const db = await getDatabase();

    const records =
      await db.getAllFromIndex(
        "health",
        "missionId",
        missionId
      );

    return records
      .filter(record => {

        if (
          startTime !== undefined &&
          record.timestamp < startTime
        ) {
          return false;
        }

        if (
          endTime !== undefined &&
          record.timestamp > endTime
        ) {
          return false;
        }

        return true;
      })
      .sort(
        (a, b) =>
          a.timestamp - b.timestamp
      );
  },

  async getHealthById(
    id: string
  ): Promise<HealthRecord | undefined> {

    const db = await getDatabase();

    return db.get(
      "health",
      id
    );
  }
};

/* ============================================================
 * DEGRADATION
 * ========================================================== */

const degradationStore = {

  async saveDegradation(
    record: DegradationRecord
  ): Promise<void> {

    const db = await getDatabase();

    const normalized: DegradationRecord = {
      ...record,

      id: normalizeId(
        record.id,
        "degradation"
      ),

      timestamp:
        normalizeTimestamp(
          record.timestamp
        )
    };

    await db.put(
      "degradation",
      normalized
    );
  },

  async getDegradation(
    missionId: string,
    startTime?: number,
    endTime?: number
  ): Promise<DegradationRecord[]> {

    const db = await getDatabase();

    const records =
      await db.getAllFromIndex(
        "degradation",
        "missionId",
        missionId
      );

    return records
      .filter(record => {

        if (
          startTime !== undefined &&
          record.timestamp < startTime
        ) {
          return false;
        }

        if (
          endTime !== undefined &&
          record.timestamp > endTime
        ) {
          return false;
        }

        return true;
      })
      .sort(
        (a, b) =>
          a.timestamp - b.timestamp
      );
  },

  async getDegradationById(
    id: string
  ): Promise<
    DegradationRecord | undefined
  > {

    const db = await getDatabase();

    return db.get(
      "degradation",
      id
    );
  }
};

/* ============================================================
 * FAULTS
 * ========================================================== */

const faultStore = {

  async saveFault(
    record: FaultRecord
  ): Promise<void> {

    const db = await getDatabase();

    const normalized: FaultRecord = {
      ...record,

      id: normalizeId(
        record.id,
        "fault"
      ),

      timestamp:
        normalizeTimestamp(
          record.timestamp
        )
    };

    await db.put(
      "faults",
      normalized
    );
  },

  async getFaults(
    missionId?: string,
    startTime?: number,
    endTime?: number
  ): Promise<FaultRecord[]> {

    const db = await getDatabase();

    let records: FaultRecord[];

    if (missionId) {

      records =
        await db.getAllFromIndex(
          "faults",
          "missionId",
          missionId
        );

    } else {

      records =
        await db.getAll(
          "faults"
        );
    }

    return records
      .filter(record => {

        if (
          startTime !== undefined &&
          record.timestamp < startTime
        ) {
          return false;
        }

        if (
          endTime !== undefined &&
          record.timestamp > endTime
        ) {
          return false;
        }

        return true;
      })
      .sort(
        (a, b) =>
          a.timestamp - b.timestamp
      );
  },

  async getFaultById(
    id: string
  ): Promise<FaultRecord | undefined> {

    const db = await getDatabase();

    return db.get(
      "faults",
      id
    );
  }
};

/* ============================================================
 * MAINTENANCE
 * ========================================================== */

const maintenanceStore = {

  async saveMaintenance(
    record: MaintenanceRecord
  ): Promise<void> {

    const db = await getDatabase();

    const normalized: MaintenanceRecord = {
      ...record,

      id: normalizeId(record.id, "maintenance")
    };

    await db.put(
      "maintenance",
      normalized
    );
  },

  async getMaintenance(
    missionId?: string
  ): Promise<MaintenanceRecord[]> {

    const db = await getDatabase();

    if (missionId) {

      return db.getAllFromIndex(
        "maintenance",
        "missionId",
        missionId
      );
    }

    return db.getAll(
      "maintenance"
    );
  },

  async getMaintenanceById(
    id: string
  ): Promise<
    MaintenanceRecord | undefined
  > {

    const db = await getDatabase();

    return db.get(
      "maintenance",
      id
    );
  }
};

/* ============================================================
 * MISSIONS
 * ========================================================== */

const missionStore = {

  async saveMission(
    mission: HistoricalMission
  ): Promise<void> {

    const db = await getDatabase();

    const normalized: HistoricalMission = {
      ...mission,

      id: normalizeId(
        mission.id,
        "mission"
      ),

      startTime:
        normalizeTimestamp(
          mission.startTime
        ),

      endTime:
        mission.endTime !== undefined
          ? normalizeTimestamp(
              mission.endTime
            )
          : undefined
    };

    await db.put(
      "missions",
      normalized
    );
  },

  async getMission(
    id: string
  ): Promise<
    HistoricalMission | undefined
  > {

    const db = await getDatabase();

    return db.get(
      "missions",
      id
    );
  },

  async getMissions(): Promise<
    HistoricalMission[]
  > {

    const db = await getDatabase();

    const missions =
      await db.getAll(
        "missions"
      );

    return missions.sort(
      (a, b) =>
        b.startTime - a.startTime
    );
  }
};

/* ============================================================
 * SYNC QUEUE
 * ========================================================== */

const syncStore = {

  async enqueueSync(
    record: SyncQueueRecord
  ): Promise<void> {

    const db = await getDatabase();

    const normalized: SyncQueueRecord = {
      ...record,

      id: normalizeId(
        record.id,
        "sync"
      ),

      recordId: normalizeId(
        record.recordId,
        "record"
      ),

      createdAt:
        normalizeTimestamp(
          record.createdAt
        ),

      attempts:
        Number.isFinite(record.attempts)
          ? record.attempts
          : 0,

      status:
        record.status
    };

    await db.put(
      "syncQueue",
      normalized
    );
  },

  async enqueueSyncBatch(
    records: SyncQueueRecord[]
  ): Promise<void> {

    if (!records.length) {
      return;
    }

    const db = await getDatabase();

    const tx = db.transaction(
      "syncQueue",
      "readwrite"
    );

    for (const record of records) {

      const normalized: SyncQueueRecord = {
        ...record,

        id: normalizeId(
          record.id,
          "sync"
        ),

        recordId: normalizeId(
          record.recordId,
          "record"
        ),

        createdAt:
          normalizeTimestamp(
            record.createdAt
          ),

        attempts:
          Number.isFinite(record.attempts)
            ? record.attempts
            : 0
      };

      await tx.store.put(
        normalized
      );
    }

    await tx.done;
  },

  async getPendingSync(
    limit = 100
  ): Promise<SyncQueueRecord[]> {

    const db = await getDatabase();

    const records =
      await db.getAllFromIndex(
        "syncQueue",
        "status",
        "pending"
      );

    return records
      .sort(
        (a, b) =>
          a.createdAt - b.createdAt
      )
      .slice(
        0,
        Math.max(0, limit)
      );
  },

  async markSyncProcessing(
    id: string
  ): Promise<void> {

    const db = await getDatabase();

    const record =
      await db.get(
        "syncQueue",
        id
      );

    if (!record) {
      return;
    }

    const updated: SyncQueueRecord = {
      ...record,

      status: "processing",

      attempts:
        record.attempts + 1,

      lastAttemptAt:
        Date.now(),

      lastError:
        undefined
    };

    await db.put(
      "syncQueue",
      updated
    );
  },

  async markSyncFailed(
    id: string,
    error: string
  ): Promise<void> {

    const db = await getDatabase();

    const record =
      await db.get(
        "syncQueue",
        id
      );

    if (!record) {
      return;
    }

    const updated: SyncQueueRecord = {
      ...record,

      status: "failed",

      lastAttemptAt:
        Date.now(),

      lastError:
        error
    };

    await db.put(
      "syncQueue",
      updated
    );
  },

  async removeSyncItem(
    id: string
  ): Promise<void> {

    const db = await getDatabase();

    await db.delete(
      "syncQueue",
      id
    );
  },

  async resetProcessingSyncItems():
    Promise<void> {

    const db = await getDatabase();

    const processing =
      await db.getAllFromIndex(
        "syncQueue",
        "status",
        "processing"
      );

    if (!processing.length) {
      return;
    }

    const tx = db.transaction(
      "syncQueue",
      "readwrite"
    );

    for (const record of processing) {

      await tx.store.put({
        ...record,
        status: "pending"
      });
    }

    await tx.done;
  },

  async getSyncQueueCount():
    Promise<number> {

    const db = await getDatabase();

    const records =
      await db.getAll(
        "syncQueue"
      );

    return records.length;
  },

  /** Backward-compatible alias for older callers. */
  async queueSyncItem(record: SyncQueueRecord): Promise<void> {
    return this.enqueueSync(record);
  },

  /** Mark an uploaded queue item as completed.
   * Completed items are removed because the queue stores pending work only.
   */
  async markSyncCompleted(id: string): Promise<void> {
    return this.removeSyncItem(id);
  },

  async requeueSyncItem(id: string, attempts: number, error?: string): Promise<void> {
    const db = await getDatabase();
    const record = await db.get("syncQueue", id);
    if (!record) return;
    await db.put("syncQueue", { ...record, status: "pending", attempts, lastError: error, lastAttemptAt: Date.now() });
  },

  async retryFailedSyncItems(): Promise<void> {
    const db = await getDatabase();
    const records = await db.getAllFromIndex("syncQueue", "status", "failed");
    if (!records.length) return;
    const tx = db.transaction("syncQueue", "readwrite");
    for (const record of records) {
      await tx.store.put({ ...record, status: "pending", lastError: undefined });
    }
    await tx.done;
  },

  async clearSyncQueue():
    Promise<void> {

    const db = await getDatabase();

    await db.clear(
      "syncQueue"
    );
  }
};

/* ============================================================
 * DATABASE MANAGEMENT
 * ========================================================== */

const databaseManagement = {

  async clearTelemetry():
    Promise<void> {

    const db = await getDatabase();

    await db.clear(
      "telemetry"
    );
  },

  async clearAll():
    Promise<void> {

    const db = await getDatabase();

    const tx = db.transaction(
      [
        "telemetry",
        "health",
        "degradation",
        "faults",
        "maintenance",
        "missions",
        "syncQueue"
      ],
      "readwrite"
    );

    await Promise.all([
      tx.objectStore("telemetry").clear(),
      tx.objectStore("health").clear(),
      tx.objectStore("degradation").clear(),
      tx.objectStore("faults").clear(),
      tx.objectStore("maintenance").clear(),
      tx.objectStore("missions").clear(),
      tx.objectStore("syncQueue").clear()
    ]);

    await tx.done;
  }
};

/* ============================================================
 * HISTORICAL STORE IMPLEMENTATION
 * ========================================================== */

export const historicalDb: HistoricalStore = {

  /* Telemetry */
  saveTelemetry:
    telemetryStore.saveTelemetry,

  saveTelemetryBatch:
    telemetryStore.saveTelemetryBatch,

  getTelemetry:
    telemetryStore.getTelemetry,

  getTelemetryById:
    telemetryStore.getTelemetryById,

  /* Health */
  saveHealth:
    healthStore.saveHealth,

  getHealth:
    healthStore.getHealth,

  getHealthById:
    healthStore.getHealthById,

  /* Degradation */
  saveDegradation:
    degradationStore.saveDegradation,

  getDegradation:
    degradationStore.getDegradation,

  getDegradationById:
    degradationStore.getDegradationById,

  /* Faults */
  saveFault:
    faultStore.saveFault,

  getFaults:
    faultStore.getFaults,

  getFaultById:
    faultStore.getFaultById,

  /* Maintenance */
  saveMaintenance:
    maintenanceStore.saveMaintenance,

  getMaintenance:
    maintenanceStore.getMaintenance,

  getMaintenanceById:
    maintenanceStore.getMaintenanceById,

  /* Missions */
  saveMission:
    missionStore.saveMission,

  getMission:
    missionStore.getMission,

  getMissions:
    missionStore.getMissions,

  /* Sync */
  enqueueSync:
    syncStore.enqueueSync,

  queueSyncItem:
    syncStore.queueSyncItem,

  enqueueSyncBatch:
    syncStore.enqueueSyncBatch,

  getPendingSync:
    syncStore.getPendingSync,

  markSyncProcessing:
    syncStore.markSyncProcessing,

  markSyncCompleted:
    syncStore.markSyncCompleted,

  markSyncFailed:
    syncStore.markSyncFailed,

  removeSyncItem:
    syncStore.removeSyncItem,

  resetProcessingSyncItems:
    syncStore.resetProcessingSyncItems,

  getSyncQueueCount:
    syncStore.getSyncQueueCount,

  clearSyncQueue:
    syncStore.clearSyncQueue,

  requeueSyncItem:
    syncStore.requeueSyncItem,

  retryFailedSyncItems:
    syncStore.retryFailedSyncItems,

  /* Management */
  clearTelemetry:
    databaseManagement.clearTelemetry,

  clearAll:
    databaseManagement.clearAll
};

/* ============================================================
 * ALIASES
 * ========================================================== */

/**
 * Alias retained for code that imports `historicalStore`
 * instead of `historicalDb`.
 */
export const historicalStore =
  historicalDb;

/* ============================================================
 * DEFAULT EXPORT
 * ========================================================== */

export default historicalDb;