import { Telemetry } from "../../../types";

type Props = {
  telemetry: Telemetry;
  selected: string | null;
};

export default function SensorPanel({
  telemetry,
  selected
}: Props) {
  if (!selected) {
    return (
      <div className="sensor-panel">
        <div className="sensor-panel-title">
          ENGINE SENSOR
        </div>

        <div className="sensor-empty">
          Select a sensor on the 3D engine
        </div>
      </div>
    );
  }

  const sensors: Record<
    string,
    {
      title: string;
      value: number;
      unit: string;
      description: string;
    }
  > = {
    CHT: {
      title: "Cylinder Head Temperature",
      value: telemetry.cht,
      unit: "°C",
      description:
        "Cylinder thermal condition"
    },

    EGT: {
      title: "Exhaust Gas Temperature",
      value: telemetry.egt,
      unit: "°C",
      description:
        "Combustion and exhaust thermal condition"
    },

    VIB: {
      title: "Engine Vibration",
      value: telemetry.vibration,
      unit: "g",
      description:
        "Mechanical vibration level"
    },

    OIL: {
      title: "Oil Pressure",
      value: telemetry.oilPressure,
      unit: "bar",
      description:
        "Lubrication system pressure"
    },

    OILTEMP: {
      title: "Oil Temperature",
      value: telemetry.oilTemperature,
      unit: "°C",
      description:
        "Lubricant thermal condition"
    }
  };

  const sensor = sensors[selected];

  if (!sensor) {
    return null;
  }

  let status = "NORMAL";

  if (
    selected === "CHT" &&
    sensor.value >= 215
  ) {
    status = "CRITICAL";
  } else if (
    selected === "CHT" &&
    sensor.value >= 190
  ) {
    status = "WARNING";
  }

  if (
    selected === "EGT" &&
    sensor.value >= 880
  ) {
    status = "CRITICAL";
  } else if (
    selected === "EGT" &&
    sensor.value >= 790
  ) {
    status = "WARNING";
  }

  if (
    selected === "VIB" &&
    sensor.value >= 5
  ) {
    status = "CRITICAL";
  } else if (
    selected === "VIB" &&
    sensor.value >= 3.5
  ) {
    status = "WARNING";
  }

  if (
    selected === "OIL" &&
    sensor.value < 2.2
  ) {
    status = "CRITICAL";
  }

  if (
    selected === "OILTEMP" &&
    sensor.value >= 125
  ) {
    status = "CRITICAL";
  } else if (
    selected === "OILTEMP" &&
    sensor.value >= 115
  ) {
    status = "WARNING";
  }

  return (
    <div className="sensor-panel">
      <div className="sensor-panel-title">
        {sensor.title}
      </div>

      <div className="sensor-description">
        {sensor.description}
      </div>

      <div className="sensor-reading">
        {sensor.value.toFixed(1)}
        <small>{sensor.unit}</small>
      </div>

      <div
        className={`sensor-status ${status.toLowerCase()}`}
      >
        {status}
      </div>

      <div className="sensor-meta">
        <span>RPM</span>
        <b>{telemetry.rpm.toFixed(0)}</b>
      </div>

      <div className="sensor-meta">
        <span>Throttle</span>
        <b>
          {(telemetry.throttle * 100).toFixed(0)}%
        </b>
      </div>

      <div className="sensor-meta">
        <span>Altitude</span>
        <b>
          {telemetry.altitude.toFixed(0)} m
        </b>
      </div>
    </div>
  );
}