export type FleetAirframeSummary = {
  tailNumber: string;
  updatedAt: number;
  engineState: string;
  mode: string;
  ehi: number;
  healthState: "NORMAL" | "WARNING" | "DEGRADED" | "CRITICAL";
  rulHours: number;
  degradationPct: number;
  activeFault: string | null;
  missionId: string | null;
};

const STORAGE_KEY = "uav_fleet_summaries_v1";
const ROSTER_KEY = "uav_fleet_roster_v1";
const UPDATE_EVENT = "fleet-summary-updated";
const DEFAULT_ROSTER = ["UAV-01"];

function readAll(): Record<string, FleetAirframeSummary> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, FleetAirframeSummary>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("[fleetStore] Could not persist fleet summary:", err);
  }
}

export function upsertFleetSummary(summary: FleetAirframeSummary): void {
  const all = readAll();
  all[summary.tailNumber] = summary;
  writeAll(all);
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

export function getFleetSummaries(): FleetAirframeSummary[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function removeFleetSummary(tailNumber: string): void {
  const all = readAll();
  delete all[tailNumber];
  writeAll(all);
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

export function subscribeFleetSummaries(cb: () => void): () => void {
  window.addEventListener(UPDATE_EVENT, cb);
  return () => window.removeEventListener(UPDATE_EVENT, cb);
}

/* -------------------- Fleet roster (dynamic UAV list) -------------------- */

export function getFleetRoster(): string[] {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    return list.length ? list : DEFAULT_ROSTER;
  } catch {
    return DEFAULT_ROSTER;
  }
}

function writeRoster(list: string[]): void {
  localStorage.setItem(ROSTER_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

export function addToFleetRoster(tailNumber: string): void {
  const trimmed = tailNumber.trim().toUpperCase();
  if (!trimmed) return;
  const roster = getFleetRoster();
  if (!roster.includes(trimmed)) {
    writeRoster([...roster, trimmed]);
  }
}

export function removeFromFleetRoster(tailNumber: string): void {
  writeRoster(getFleetRoster().filter((t) => t !== tailNumber));
  removeFleetSummary(tailNumber);
}