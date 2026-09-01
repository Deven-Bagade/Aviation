type Props = {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  warning?: number;
  critical?: number;
};

export default function Gauge({ label, value, unit, min, max, warning, critical }: Props) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const status = critical !== undefined && value >= critical
    ? "critical"
    : warning !== undefined && value >= warning
      ? "warning"
      : "normal";

  return (
    <div className="gauge">
      <div className="gauge-head">
        <span>{label}</span>
        <span className={`dot ${status}`} />
      </div>
      <div className="gauge-value">{value.toFixed(1)} <small>{unit}</small></div>
      <div className="bar"><div className={`fill ${status}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
