import React, { useEffect, useState } from "react";
import {
  FleetAirframeSummary,
  getFleetSummaries,
  getFleetRoster,
  addToFleetRoster,
  removeFromFleetRoster,
  subscribeFleetSummaries
} from "../db/fleetStore";
import { useAuth } from "../auth/AuthContext";

function healthColor(state: string): string {
  switch (state) {
    case "NORMAL": return "#2ecc71";
    case "WARNING": return "#f1c40f";
    case "DEGRADED": return "#e67e22";
    case "CRITICAL": return "#e74c3c";
    default: return "#7f8c9a";
  }
}

export default function FleetView() {
  const { can } = useAuth();
  const [summaries, setSummaries] = useState<FleetAirframeSummary[]>([]);
  const [roster, setRoster] = useState<string[]>([]);
  const [newTail, setNewTail] = useState("");

  useEffect(() => {
    const refresh = () => {
      setSummaries(getFleetSummaries());
      setRoster(getFleetRoster());
    };
    refresh();
    const unsubscribe = subscribeFleetSummaries(refresh);
    const interval = setInterval(refresh, 5000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const reporting = new Set(summaries.map((s) => s.tailNumber));
  const awaitingFirstReport = roster.filter((t) => !reporting.has(t));

  const handleAdd = () => {
    if (!newTail.trim()) return;
    addToFleetRoster(newTail);
    setNewTail("");
  };

  return (
    <div className="fleet-view">
      <div className="fleet-header-row">
        <h2>Fleet Health Overview</h2>

        {can("MAINTENANCE") && (
          <div className="fleet-add-row">
            <input
              type="text"
              placeholder="New tail number, e.g. UAV-04"
              value={newTail}
              onChange={(e) => setNewTail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <button className="secondary-button" onClick={handleAdd}>+ Add Airframe</button>
          </div>
        )}
      </div>

      {summaries.length === 0 && awaitingFirstReport.length === 0 && (
        <p className="fleet-empty">
          No airframes registered yet. Add one above, select it in the header, and let telemetry run a few seconds.
        </p>
      )}

      <div className="fleet-grid">
        {summaries.map((s) => (
          <div key={s.tailNumber} className="fleet-card" style={{ borderLeftColor: healthColor(s.healthState) }}>
            <div className="fleet-card-header">
              <strong>{s.tailNumber}</strong>
              <span className="fleet-state-badge" style={{ background: healthColor(s.healthState) }}>
                {s.healthState}
              </span>
            </div>

            <div className="fleet-card-body">
              <div>Engine Health Index: <b>{s.ehi.toFixed(1)}</b></div>
              <div>Estimated RUL: <b>{s.rulHours.toFixed(0)} hrs</b></div>
              <div>Degradation: <b>{s.degradationPct.toFixed(1)}%</b></div>
              <div>Engine state: {s.engineState} / {s.mode}</div>
              <div>Active fault: {s.activeFault ?? "None"}</div>
              <div>Mission: {s.missionId ?? "—"}</div>
              <div className="fleet-updated">Updated {new Date(s.updatedAt).toLocaleTimeString()}</div>
            </div>

            {can("ADMIN") && (
              <button className="fleet-remove-btn" onClick={() => removeFromFleetRoster(s.tailNumber)}>
                Remove from fleet
              </button>
            )}
          </div>
        ))}

        {awaitingFirstReport.map((tail) => (
          <div key={tail} className="fleet-card fleet-card-pending">
            <div className="fleet-card-header">
              <strong>{tail}</strong>
              <span className="fleet-state-badge" style={{ background: "#7f8c9a" }}>PENDING</span>
            </div>
            <div className="fleet-card-body">
              <div>Awaiting first telemetry report.</div>
              <div>Select this tail number in the header to begin reporting.</div>
            </div>
            {can("ADMIN") && (
              <button className="fleet-remove-btn" onClick={() => removeFromFleetRoster(tail)}>
                Remove from fleet
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}