import type { Telemetry, Health, FaultType, SubsystemKey } from "../types";

export type DegradationState = import("../types").DegradationState;

export type MaintenanceRecord = {
  id: string;
  timestamp: number;
  action: string;
  subsystem?: SubsystemKey;
  notes?: string;
  missionId?: string;
};

export type SyncQueueItemType =
  | "telemetry" | "health" | "degradation" | "fault" | "maintenance" | "mission";

export interface SyncQueueRecord {
  id: string;
  type: SyncQueueItemType;
  recordId: string;
  missionId?: string;
  createdAt: number;
  attempts: number;
  lastAttemptAt?: number;
  lastError?: string;
  status: "pending" | "processing" | "failed";
}

export interface TelemetryRecord extends Telemetry {
  id: string;
  missionId?: string;
  missionStage?: Telemetry["mode"] | string | null;
  stageName?: string;
  recordedAt: number;
}

export interface HealthRecord {
  id: string;
  missionId?: string;
  timestamp: number;
  health: Health;
}

export interface DegradationRecord {
  id: string;
  missionId?: string;
  timestamp: number;
  degradation: DegradationState;
}

export interface FaultRecord {
  id: string;
  missionId?: string;
  timestamp: number;
  fault: Exclude<FaultType, null>;
  severity: "INFO" | "WARNING" | "CRITICAL";
  source: "SIMULATION" | "MODEL" | "RULE";
  message?: string;
  active?: boolean;
  acknowledged?: boolean;
}

export interface HistoricalMission {
  id: string;
  name: string;
  profileId?: string;
  startTime: number;
  endTime?: number;
  status: "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED" | "STOPPED" | "FAILED";
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface HistoricalStore {
  saveTelemetry(record: TelemetryRecord): Promise<void>;
  saveTelemetryBatch(records: TelemetryRecord[]): Promise<void>;
  getTelemetry(missionId: string, startTime?: number, endTime?: number): Promise<TelemetryRecord[]>;
  getTelemetryById(id: string): Promise<TelemetryRecord | undefined>;

  saveHealth(record: HealthRecord): Promise<void>;
  getHealth(missionId: string, startTime?: number, endTime?: number): Promise<HealthRecord[]>;
  getHealthById(id: string): Promise<HealthRecord | undefined>;

  saveDegradation(record: DegradationRecord): Promise<void>;
  getDegradation(missionId: string, startTime?: number, endTime?: number): Promise<DegradationRecord[]>;
  getDegradationById(id: string): Promise<DegradationRecord | undefined>;

  saveFault(record: FaultRecord): Promise<void>;
  getFaults(missionId?: string, startTime?: number, endTime?: number): Promise<FaultRecord[]>;
  getFaultById(id: string): Promise<FaultRecord | undefined>;

  saveMaintenance(record: MaintenanceRecord): Promise<void>;
  getMaintenance(missionId?: string): Promise<MaintenanceRecord[]>;
  getMaintenanceById(id: string): Promise<MaintenanceRecord | undefined>;

  saveMission(mission: HistoricalMission): Promise<void>;
  getMission(id: string): Promise<HistoricalMission | undefined>;
  getMissions(): Promise<HistoricalMission[]>;

  enqueueSync(record: SyncQueueRecord): Promise<void>;
  /** Backward-compatible alias used by SyncManager. */
  queueSyncItem(record: SyncQueueRecord): Promise<void>;
  enqueueSyncBatch(records: SyncQueueRecord[]): Promise<void>;
  getPendingSync(limit?: number): Promise<SyncQueueRecord[]>;
  markSyncProcessing(id: string): Promise<void>;
  /** Marks a successfully uploaded item as completed/removes it from the queue. */
  markSyncCompleted(id: string): Promise<void>;
  markSyncFailed(id: string, error: string): Promise<void>;
  removeSyncItem(id: string): Promise<void>;
  resetProcessingSyncItems(): Promise<void>;
  requeueSyncItem(id: string, attempts: number, error?: string): Promise<void>;
  retryFailedSyncItems(): Promise<void>;
  getSyncQueueCount(): Promise<number>;
  clearSyncQueue(): Promise<void>;
  clearTelemetry(): Promise<void>;
  clearAll(): Promise<void>;
}

export interface CloudSyncStore {
  uploadTelemetry(records: TelemetryRecord[]): Promise<number>;
  uploadFaults(records: FaultRecord[]): Promise<number>;
  uploadMissions(missions: HistoricalMission[]): Promise<number>;
  uploadMaintenance(records: MaintenanceRecord[]): Promise<number>;
  uploadHealth(records: HealthRecord[]): Promise<number>;
  uploadDegradation(records: DegradationRecord[]): Promise<number>;
  downloadTelemetry(missionId: string, startTime?: number, endTime?: number): Promise<TelemetryRecord[]>;
  downloadFaults(missionId?: string, startTime?: number, endTime?: number): Promise<FaultRecord[]>;
  downloadMissions(): Promise<HistoricalMission[]>;
  downloadMaintenance(missionId?: string): Promise<MaintenanceRecord[]>;
  downloadHealth(missionId: string, startTime?: number, endTime?: number): Promise<HealthRecord[]>;
  downloadDegradation(missionId: string, startTime?: number, endTime?: number): Promise<DegradationRecord[]>;
  isConfigured(): boolean;
}
