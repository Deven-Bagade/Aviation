import { useState } from "react";
import {
  EngineMode,
  FaultType,
  ManualField,
  Telemetry
} from "../../types";

type OverrideState = Record<ManualField, { enabled: boolean; value: number }>;

const MANUAL_FIELDS: {
  key: ManualField;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}[] = [
  { key: "rpm", label: "RPM", unit: "rpm", min: 0, max: 4000, step: 10, defaultValue: 1800 },
  { key: "cht", label: "Cylinder Head Temp", unit: "°C", min: 50, max: 260, step: 1, defaultValue: 140 },
  { key: "egt", label: "Exhaust Gas Temp", unit: "°C", min: 300, max: 950, step: 1, defaultValue: 650 },
  { key: "oilPressure", label: "Oil Pressure", unit: "bar", min: 0, max: 7, step: 0.1, defaultValue: 3.5 },
  { key: "oilTemperature", label: "Oil Temperature", unit: "°C", min: 30, max: 150, step: 1, defaultValue: 85 },
  { key: "fuelFlow", label: "Fuel Flow", unit: "L/h", min: 0, max: 40, step: 0.5, defaultValue: 15 },
  { key: "vibration", label: "Vibration", unit: "g", min: 0, max: 8, step: 0.1, defaultValue: 1.5 },
  { key: "altitude", label: "Altitude", unit: "m", min: 0, max: 9000, step: 50, defaultValue: 3000 },
  { key: "ambientTemperature", label: "Ambient Temp", unit: "°C", min: -20, max: 55, step: 1, defaultValue: 25 }
];

const FAULT_OPTIONS: { key: Exclude<FaultType, null>; label: string }[] = [
  { key: "HIGH_TEMP", label: "Overheating (CHT/EGT)" },
  { key: "LOW_OIL", label: "Low Oil Pressure" },
  { key: "FUEL_SYSTEM", label: "Fuel System Problem" },
  { key: "ABNORMAL_RPM", label: "Abnormal RPM" },
  { key: "HIGH_VIBRATION", label: "Excessive Vibration" },
  { key: "COOLING_FAULT", label: "Cooling System Fault" },
  { key: "ELECTRICAL", label: "Electrical Fault" },
  { key: "INJECTOR_FAULT", label: "Injector / Combustion Fault" },
  { key: "SENSOR_FAULT", label: "Sensor Fault" }
];

type Props = {
  telemetry: Telemetry;
  connected: boolean;
  throttleCommand: number;
  onThrottleChange: (value: number) => void;
  onModeChange: (value: EngineMode) => void;
  onStart: () => void;
  onStop: () => void;
  onInjectFault: (fault: Exclude<FaultType, null>) => void;
  onClearFault: () => void;
  onSetOverride: (field: ManualField, enabled: boolean, value: number) => void;
  onClearAllOverrides: () => void;
};

export default function SimulationControlPanel({
  telemetry,
  connected,
  throttleCommand,
  onThrottleChange,
  onModeChange,
  onStart,
  onStop,
  onInjectFault,
  onClearFault,
  onSetOverride,
  onClearAllOverrides
}: Props) {
  const [overrides, setOverrides] = useState<OverrideState>(() => {
    const initial = {} as OverrideState;
    for (const f of MANUAL_FIELDS) {
      initial[f.key] = { enabled: false, value: f.defaultValue };
    }
    return initial;
  });

  const setField = (field: ManualField, patch: Partial<{ enabled: boolean; value: number }>) => {
    setOverrides((prev) => {
      const next = { ...prev, [field]: { ...prev[field], ...patch } };
      onSetOverride(field, next[field].enabled, next[field].value);
      return next;
    });
  };

  return (
    <div className="simulation-panel">
      <section className="panel control-panel">
        <div className="control-section">
          <div className="control-label">ENGINE CONTROL</div>
          <div className="control-buttons">
            <button
              className="control-button start"
              onClick={onStart}
              disabled={!connected || telemetry.engineState !== "OFF"}
            >
              START ENGINE
            </button>
            <button
              className="control-button stop"
              onClick={onStop}
              disabled={!connected || telemetry.engineState === "OFF"}
            >
              STOP ENGINE
            </button>
          </div>
        </div>

        <div className="control-section">
          <div className="control-label">THROTTLE</div>
          <div className="throttle-control">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={throttleCommand}
              onChange={(e) => onThrottleChange(Number(e.target.value))}
            />
            <strong>{(throttleCommand * 100).toFixed(0)}%</strong>
          </div>
        </div>

        <div className="control-section">
          <div className="control-label">MODE</div>
          <div className="mode-buttons">
            {(["IDLE", "CRUISE", "HIGH LOAD"] as EngineMode[]).map((modeOption) => (
              <button
                key={modeOption}
                className={`mode-button ${telemetry.mode === modeOption ? "active" : ""}`}
                onClick={() => onModeChange(modeOption)}
              >
                {modeOption}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel manual-override-panel">
        <div className="panel-title">
          <span>MANUAL PARAMETER OVERRIDE</span>
          <button className="clear-fault" onClick={onClearAllOverrides}>
            DISABLE ALL
          </button>
        </div>

        <div className="manual-override-grid">
          {MANUAL_FIELDS.map((f) => {
            const state = overrides[f.key];
            return (
              <div className={`override-row ${state.enabled ? "enabled" : ""}`} key={f.key}>
                <div className="override-header">
                  <label className="override-toggle">
                    <input
                      type="checkbox"
                      checked={state.enabled}
                      onChange={(e) => setField(f.key, { enabled: e.target.checked })}
                    />
                    {f.label}
                  </label>
                  <span className="override-value">
                    {state.value.toFixed(f.step < 1 ? 1 : 0)} {f.unit}
                  </span>
                </div>
                <input
                  type="range"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={state.value}
                  disabled={!state.enabled}
                  onChange={(e) => setField(f.key, { value: Number(e.target.value) })}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel fault-panel">
        <div className="panel-title">
          <span>FAULT INJECTION / TESTING</span>
          <span>SIMULATION</span>
        </div>

        <div className="fault-controls">
          {FAULT_OPTIONS.map((f) => (
            <button key={f.key} onClick={() => onInjectFault(f.key)}>
              {f.label.toUpperCase()}
            </button>
          ))}
          <button className="clear-fault" onClick={onClearFault}>
            CLEAR FAULT
          </button>
        </div>

        <div className="active-fault">
          Active fault: <strong>{telemetry.fault || "NONE"}</strong>
        </div>
      </section>
    </div>
  );
}