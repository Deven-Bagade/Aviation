import {
  initializeApp,
} from "firebase/app";

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
} from "firebase/firestore";

import type {
  FaultRecord,
  MaintenanceRecord,
  HistoricalMission,
  TelemetryRecord,
  HealthRecord,
  DegradationRecord,
} from "./historicalStore";

import type {
  CloudSyncStore,
} from "./historicalStore";

/**
 * Firebase configuration.
 *
 * IMPORTANT:
 * Do not hard-code production Firebase credentials here.
 *
 * Vite exposes variables prefixed with VITE_ to the renderer.
 */
const viteEnv = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env;

const firebaseConfig = {
  apiKey: viteEnv?.VITE_FIREBASE_API_KEY,
  authDomain: viteEnv?.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: viteEnv?.VITE_FIREBASE_PROJECT_ID,
  storageBucket: viteEnv?.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: viteEnv?.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: viteEnv?.VITE_FIREBASE_APP_ID,
};

function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId
  );
}

/**
 * Firebase collections.
 *
 * Every document contains missionId where applicable,
 * making fleet/mission filtering possible later.
 */
const COLLECTIONS = {
  TELEMETRY: "telemetry",
  HEALTH: "health",
  DEGRADATION: "degradation",
  FAULTS: "faults",
  MAINTENANCE: "maintenance",
  MISSIONS: "missions",
} as const;

/**
 * Initialize Firebase only when configuration exists.
 */
let firebaseApp: ReturnType<typeof initializeApp> | null = null;
let firestore: ReturnType<typeof getFirestore> | null = null;

function getFirestoreInstance(): ReturnType<typeof getFirestore> {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase is not configured. Add VITE_FIREBASE_* variables to your .env file."
    );
  }

  if (firestore) {
    return firestore;
  }

  firebaseApp = initializeApp(firebaseConfig);
  firestore = getFirestore(firebaseApp);

  return firestore;
}

/**
 * Convert Firestore document data back to a typed object.
 */
function cleanDocument<T>(
  data: Record<string, unknown>
): T {
  const cleaned = { ...data };

  delete cleaned.id;

  return cleaned as T;
}

/**
 * Firebase implementation of CloudSyncStore.
 *
 * This class is intentionally independent from IndexedDB.
 *
 * IndexedDB:
 *   - local
 *   - fast
 *   - offline
 *   - owns the sync queue (see historicalDb.ts)
 *
 * Firebase:
 *   - cloud
 *   - shared
 *   - multi-desktop
 *
 * Note: this class only implements CloudSyncStore, not the
 * full HistoricalStore contract. The sync-queue management
 * (enqueueSync, getPendingSync, markSyncCompleted, etc.) and
 * the *ById lookups only make sense against the local queue
 * that historicalDb owns — syncManager.ts always calls those
 * on historicalDb, never on firebaseStore. Declaring this
 * class as a HistoricalStore was aspirational and never
 * actually implemented or used that way.
 */
export class FirebaseHistoricalStore
  implements CloudSyncStore
{
  private db(): ReturnType<typeof getFirestore> {
    return getFirestoreInstance();
  }

  /**
   * Whether Firebase credentials are present.
   *
   * syncManager checks this before attempting any
   * upload/download so it can skip cloud sync
   * cleanly instead of repeatedly failing (and
   * spamming the console) when VITE_FIREBASE_*
   * variables are absent.
   */
  isConfigured(): boolean {
    return isFirebaseConfigured();
  }

  // =========================================================
  // TELEMETRY
  // =========================================================

  async saveTelemetry(
    record: TelemetryRecord
  ): Promise<void> {
    const db = this.db();

    const id =
      this.telemetryDocumentId(record);

    await setDoc(
      doc(db, COLLECTIONS.TELEMETRY, id),
      {
        ...record,
        cloudUploadedAt: Date.now(),
      },
      { merge: true }
    );
  }

  async saveTelemetryBatch(
    records: TelemetryRecord[]
  ): Promise<void> {
    if (records.length === 0) {
      return;
    }

    /*
     * Firestore batches have a maximum operation count.
     *
     * Chunking also makes this safer for large telemetry
     * uploads.
     */
    const CHUNK_SIZE = 400;

    for (
      let i = 0;
      i < records.length;
      i += CHUNK_SIZE
    ) {
      const chunk = records.slice(
        i,
        i + CHUNK_SIZE
      );

      await Promise.all(
        chunk.map((record) =>
          this.saveTelemetry(record)
        )
      );
    }
  }

  async getTelemetry(
    missionId: string,
    startTime?: number,
    endTime?: number
  ): Promise<TelemetryRecord[]> {
    const db = this.db();

    const constraints: any[] = [];

    if (missionId) {
      constraints.push(
        where(
          "missionId",
          "==",
          missionId
        )
      );
    }

    if (startTime !== undefined) {
      constraints.push(
        where(
          "timestamp",
          ">=",
          startTime
        )
      );
    }

    if (endTime !== undefined) {
      constraints.push(
        where(
          "timestamp",
          "<=",
          endTime
        )
      );
    }

    constraints.push(
      orderBy("timestamp", "asc")
    );

    const telemetryQuery = query(
      collection(
        db,
        COLLECTIONS.TELEMETRY
      ),
      ...constraints
    );

    const snapshot =
      await getDocs(telemetryQuery);

    return snapshot.docs.map((item) => {
      const data = item.data();

      return {
        ...cleanDocument<TelemetryRecord>(data),
        id: item.id,
        recordedAt: data.timestamp,
      };
    });
  }

  // =========================================================
  // HEALTH
  // =========================================================

  async saveHealth(
    record: HealthRecord
  ): Promise<void> {
    const db = this.db();

    const id =
      record.id || `${record.missionId}_${record.timestamp}`;

    await setDoc(
      doc(
        db,
        COLLECTIONS.HEALTH,
        id
      ),
      {
        missionId: record.missionId,
        timestamp: record.timestamp,
        health: record.health,
      },
      { merge: true }
    );
  }

  async getHealth(
    missionId: string,
    startTime?: number,
    endTime?: number
  ): Promise<HealthRecord[]> {
    const db = this.db();

    const constraints: any[] = [];

    constraints.push(
      where(
        "missionId",
        "==",
        missionId
      )
    );

    if (startTime !== undefined) {
      constraints.push(
        where(
          "timestamp",
          ">=",
          startTime
        )
      );
    }

    if (endTime !== undefined) {
      constraints.push(
        where(
          "timestamp",
          "<=",
          endTime
        )
      );
    }

    constraints.push(
      orderBy("timestamp", "asc")
    );

    const snapshot =
      await getDocs(
        query(
          collection(
            db,
            COLLECTIONS.HEALTH
          ),
          ...constraints
        )
      );

    return snapshot.docs.map((item, index) => {
      const data = cleanDocument<HealthRecord>(item.data());
      return {
        id: item.id,
        missionId: data.missionId,
        timestamp: data.timestamp,
        health: data.health,
      } as HealthRecord;
    });
  }

  // =========================================================
  // DEGRADATION
  // =========================================================

async saveDegradation(
  record: DegradationRecord
): Promise<void> {
  const db = this.db();

  const id = `${record.missionId}_${record.timestamp}`;

  await setDoc(
    doc(db, COLLECTIONS.DEGRADATION, id),
    {
      missionId: record.missionId,
      timestamp: record.timestamp,
      degradation: record.degradation,
    },
    { merge: true }
  );
}

  async getDegradation(
    missionId: string,
    startTime?: number,
    endTime?: number
  ): Promise<DegradationRecord[]> {
    const db = this.db();

    const constraints: any[] = [];

    constraints.push(
      where(
        "missionId",
        "==",
        missionId
      )
    );

    if (startTime !== undefined) {
      constraints.push(
        where(
          "timestamp",
          ">=",
          startTime
        )
      );
    }

    if (endTime !== undefined) {
      constraints.push(
        where(
          "timestamp",
          "<=",
          endTime
        )
      );
    }

    constraints.push(
      orderBy("timestamp", "asc")
    );

    const snapshot =
      await getDocs(
        query(
          collection(
            db,
            COLLECTIONS.DEGRADATION
          ),
          ...constraints
        )
      );

    return snapshot.docs.map((item) => {
      const data = cleanDocument<DegradationRecord>(item.data());
      return {
        ...data,
        id: item.id,
      } as DegradationRecord;
    });
  }

  // =========================================================
  // FAULTS
  // =========================================================

  async saveFault(
    record: FaultRecord
  ): Promise<void> {
    const db = this.db();

    const id =
      this.faultDocumentId(record);

    await setDoc(
      doc(
        db,
        COLLECTIONS.FAULTS,
        id
      ),
      {
        ...record,
        cloudUploadedAt: Date.now(),
      },
      { merge: true }
    );
  }

  async getFaults(
    missionId?: string,
    startTime?: number,
    endTime?: number
  ): Promise<FaultRecord[]> {
    const db = this.db();

    const constraints: any[] = [];

    if (missionId) {
      constraints.push(
        where(
          "missionId",
          "==",
          missionId
        )
      );
    }

    if (startTime !== undefined) {
      constraints.push(
        where(
          "timestamp",
          ">=",
          startTime
        )
      );
    }

    if (endTime !== undefined) {
      constraints.push(
        where(
          "timestamp",
          "<=",
          endTime
        )
      );
    }

    constraints.push(
      orderBy("timestamp", "asc")
    );

    const snapshot =
      await getDocs(
        query(
          collection(
            db,
            COLLECTIONS.FAULTS
          ),
          ...constraints
        )
      );

    return snapshot.docs.map((item) =>
      cleanDocument<FaultRecord>(
        item.data()
      )
    );
  }

  // =========================================================
  // MAINTENANCE
  // =========================================================

  async saveMaintenance(
    record: MaintenanceRecord
  ): Promise<void> {
    const db = this.db();

    const id =
      this.maintenanceDocumentId(record);

    await setDoc(
      doc(
        db,
        COLLECTIONS.MAINTENANCE,
        id
      ),
      {
        ...record,
        cloudUploadedAt: Date.now(),
      },
      { merge: true }
    );
  }

  async getMaintenance(
    missionId?: string
  ): Promise<MaintenanceRecord[]> {
    const db = this.db();

    const constraints: any[] = [];

    if (missionId) {
      constraints.push(
        where(
          "missionId",
          "==",
          missionId
        )
      );
    }

    constraints.push(
      orderBy("timestamp", "desc")
    );

    const snapshot =
      await getDocs(
        query(
          collection(
            db,
            COLLECTIONS.MAINTENANCE
          ),
          ...constraints
        )
      );

    return snapshot.docs.map((item) =>
      cleanDocument<MaintenanceRecord>(
        item.data()
      )
    );
  }

  // =========================================================
  // MISSIONS
  // =========================================================

  async saveMission(
    mission: HistoricalMission
  ): Promise<void> {
    const db = this.db();

    await setDoc(
      doc(
        db,
        COLLECTIONS.MISSIONS,
        mission.id
      ),
      {
        ...mission,
        cloudUploadedAt: Date.now(),
      },
      { merge: true }
    );
  }

  async getMission(
    missionId: string
  ): Promise<HistoricalMission | undefined> {
    const db = this.db();

    const snapshot =
      await getDoc(
        doc(
          db,
          COLLECTIONS.MISSIONS,
          missionId
        )
      );

    if (!snapshot.exists()) {
      return undefined;
    }

    return {
      ...cleanDocument<HistoricalMission>(snapshot.data()),
      id: snapshot.id,
    };
  }

  async getMissions(): Promise<
    HistoricalMission[]
  > {
    const db = this.db();

    const snapshot =
      await getDocs(
        query(
          collection(
            db,
            COLLECTIONS.MISSIONS
          ),
          orderBy("startTime", "desc")
        )
      );

    return snapshot.docs.map((item) =>
      cleanDocument<HistoricalMission>(
        item.data()
      )
    );
  }

  async downloadHealth(missionId: string, startTime?: number, endTime?: number): Promise<HealthRecord[]> {
    return this.getHealth(missionId, startTime, endTime);
  }

  async downloadDegradation(missionId: string, startTime?: number, endTime?: number): Promise<DegradationRecord[]> {
    return this.getDegradation(missionId, startTime, endTime);
  }

  // =========================================================
  // CLEAR
  // =========================================================

  async clearTelemetry(
    missionId?: string
  ): Promise<void> {
    const records =
      await this.getTelemetry(
        missionId ?? "",
      );

    /*
     * Delete operations are deliberately not implemented
     * automatically for cloud data.
     *
     * Cloud historical data should not be accidentally
     * deleted from a desktop application.
     */
    console.warn(
      `Cloud telemetry deletion requested for ${records.length} records.`
    );
  }

  async clearAll(): Promise<void> {
    throw new Error(
      "Cloud database cannot be cleared from the desktop application."
    );
  }

  // =========================================================
  // CLOUD SYNC METHODS
  // =========================================================

  async uploadHealth(
    records: HealthRecord[]
  ): Promise<number> {
    if (records.length === 0) return 0;
    for (const record of records) {
      await this.saveHealth(record);
    }
    return records.length;
  }

  async uploadDegradation(
    records: DegradationRecord[]
  ): Promise<number> {
    if (records.length === 0) return 0;
    for (const record of records) {
      await this.saveDegradation(record);
    }
    return records.length;
  }

  async uploadTelemetry(
    records: TelemetryRecord[]
  ): Promise<number> {
    await this.saveTelemetryBatch(records);
    return records.length;
  }

  async uploadFaults(
    records: FaultRecord[]
  ): Promise<number> {
    for (const record of records) await this.saveFault(record);
    return records.length;
  }

  async uploadMissions(
    missions: HistoricalMission[]
  ): Promise<number> {
    for (const mission of missions) await this.saveMission(mission);
    return missions.length;
  }

  async uploadMaintenance(
    records: MaintenanceRecord[]
  ): Promise<number> {
    for (const record of records) await this.saveMaintenance(record);
    return records.length;
  }

  async downloadTelemetry(
    missionId: string,
    startTime?: number,
    endTime?: number
  ): Promise<TelemetryRecord[]> {
    return this.getTelemetry(missionId, startTime, endTime);
  }

  async downloadFaults(
    missionId?: string
  ): Promise<FaultRecord[]> {
    return this.getFaults(missionId);
  }

  async downloadMissions(): Promise<
    HistoricalMission[]
  > {
    return this.getMissions();
  }

  async downloadMaintenance(
    missionId?: string
  ): Promise<MaintenanceRecord[]> {
    return this.getMaintenance(missionId);
  }

  async uploadFault(record: FaultRecord): Promise<number> { return this.uploadFaults([record]); }
  async uploadMission(mission: HistoricalMission): Promise<number> { return this.uploadMissions([mission]); }

  // =========================================================
  // DOCUMENT ID GENERATORS
  // =========================================================

  private telemetryDocumentId(
    record: TelemetryRecord
  ): string {
    /*
     * A deterministic ID prevents the same telemetry
     * sample from being uploaded multiple times.
     */
    const mission =
      this.safeIdPart(
        String(
          (record as unknown as {
            missionId?: string;
          }).missionId ?? "unknown"
        )
      );

    const timestamp =
      String(record.timestamp);

    const sequence =
      this.safeIdPart(
        String(
          (record as unknown as {
            id?: string | number;
          }).id ?? "sample"
        )
      );

    return `${mission}_${timestamp}_${sequence}`;
  }

  private faultDocumentId(
    record: FaultRecord
  ): string {
    const mission =
      this.safeIdPart(
        String(
          (record as unknown as {
            missionId?: string;
          }).missionId ?? "unknown"
        )
      );

    const timestamp =
      String(record.timestamp);

    const type =
      this.safeIdPart(
        String(
          (record as unknown as {
            faultType?: string;
          }).faultType ?? "fault"
        )
      );

    return `${mission}_${timestamp}_${type}`;
  }

  private maintenanceDocumentId(
    record: MaintenanceRecord
  ): string {
    const mission =
      this.safeIdPart(
        String(
          (record as unknown as {
            missionId?: string;
          }).missionId ?? "unknown"
        )
      );

    const timestamp =
      String(record.timestamp);

    return `${mission}_${timestamp}`;
  }

  private safeIdPart(
    value: string
  ): string {
    return value
      .replace(/\//g, "_")
      .replace(/#/g, "_")
      .replace(/\?/g, "_")
      .replace(/\[/g, "_")
      .replace(/\]/g, "_");
  }
}

/**
 * Singleton Firebase store.
 *
 * Firebase is NOT initialized until a method actually
 * accesses the store.
 */
export const firebaseStore =
  new FirebaseHistoricalStore();