
import {
  DegradationState,
  FaultType,
  SubsystemKey,
  SubsystemStatus,
  SubsystemStatusLevel,
  Telemetry
} from "../types";

const SUBSYSTEM_LABELS: Record<SubsystemKey, string> = {
  THERMAL_COOLING: "Thermal / Cooling",
  LUBRICATION: "Lubrication",
  MECHANICAL_VIBRATION: "Mechanical / Vibration",
  FUEL_INJECTION: "Fuel / Injection",
  ELECTRICAL_IGNITION: "Electrical / Ignition",
  SENSORS: "Sensors"
};

const SUBSYSTEM_KEYS: SubsystemKey[] = [
  "THERMAL_COOLING",
  "LUBRICATION",
  "MECHANICAL_VIBRATION",
  "FUEL_INJECTION",
  "ELECTRICAL_IGNITION",
  "SENSORS"
];

// Prototype heuristic constants.
// These are simulation values, not real engine certification data.
const BASE_WEAR_PER_HOUR = 1.5;
const STRESS_WEAR_PER_HOUR = 55;
const RATE_SMOOTHING = 0.08;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function faultStressBonus(
  subsystem: SubsystemKey,
  fault: FaultType
): number {
  if (!fault) return 0;

  const map: Partial<
    Record<
      Exclude<FaultType, null>,
      Partial<Record<SubsystemKey, number>>
    >
  > = {
    HIGH_TEMP: {
      THERMAL_COOLING: 3.0
    },

    LOW_OIL: {
      LUBRICATION: 3.0
    },

    HIGH_VIBRATION: {
      MECHANICAL_VIBRATION: 3.0
    },

    ELECTRICAL: {
      ELECTRICAL_IGNITION: 3.0
    },

    FUEL_SYSTEM: {
      FUEL_INJECTION: 2.5
    },

    ABNORMAL_RPM: {
      MECHANICAL_VIBRATION: 1.8,
      FUEL_INJECTION: 1.0
    },

    COOLING_FAULT: {
      THERMAL_COOLING: 3.2
    },

    INJECTOR_FAULT: {
      FUEL_INJECTION: 3.0,
      THERMAL_COOLING: 0.5
    },

    SENSOR_FAULT: {
      SENSORS: 3.5
    }
  };

  return (
    map[fault as Exclude<FaultType, null>]?.[subsystem] ?? 0
  );
}

function instantaneousScore(
  subsystem: SubsystemKey,
  t: Telemetry
): number {
  switch (subsystem) {
    case "THERMAL_COOLING": {
      const chtScore =
        100 - clamp((t.cht - 160) * 2.2, 0, 100);

      const egtScore =
        100 - clamp((t.egt - 750) * 0.7, 0, 100);

      return Math.min(chtScore, egtScore);
    }

    case "LUBRICATION": {
      const pressureScore =
        100 - clamp(
          (3.0 - t.oilPressure) * 40,
          0,
          100
        );

      const tempScore =
        100 - clamp(
          (t.oilTemperature - 110) * 3.5,
          0,
          100
        );

      return Math.min(pressureScore, tempScore);
    }

    case "MECHANICAL_VIBRATION":
      return (
        100 -
        clamp(
          (t.vibration - 2.0) * 30,
          0,
          100
        )
      );

    case "FUEL_INJECTION": {
      const expectedFuelFlow =
        6 + t.throttle * 20;

      const deviation =
        Math.abs(
          t.fuelFlow - expectedFuelFlow
        );

      return (
        100 -
        clamp(
          deviation * 6,
          0,
          100
        )
      );
    }

    case "ELECTRICAL_IGNITION": {
      const voltageScore =
        100 -
        clamp(
          Math.abs(
            t.batteryVoltage - 27.5
          ) * 18,
          0,
          100
        );

      const alternatorScore =
        t.engineState === "RUNNING"
          ? 100 -
            clamp(
              (15 - t.alternatorCurrent) * 5,
              0,
              100
            )
          : 100;

      return Math.min(
        voltageScore,
        alternatorScore
      );
    }

    case "SENSORS":
      return t.fault === "SENSOR_FAULT"
        ? 35
        : 98;

    default:
      return 100;
  }
}

function stressFromScore(
  score: number
): number {
  return (
    clamp(
      (100 - score) / 100,
      0,
      3
    ) * 1.2
  );
}

function severityFor(
  degradation: number
): SubsystemStatusLevel {
  if (degradation >= 60) {
    return "CRITICAL";
  }

  if (degradation >= 35) {
    return "WARNING";
  }

  if (degradation >= 15) {
    return "WATCH";
  }

  return "NORMAL";
}

// FIXED: Record<...> syntax
const NARRATIVE: Record<
  SubsystemKey,
  Partial<
    Record<
      SubsystemStatusLevel,
      {
        description: string;
        recommendation: string;
      }
    >
  >
> = {
  THERMAL_COOLING: {
    WATCH: {
      description:
        "Cylinder head / exhaust gas temperatures trending above the nominal band.",
      recommendation:
        "Monitor cooling airflow and CHT/EGT trend; verify baffle and fin condition at next inspection."
    },

    WARNING: {
      description:
        "Sustained thermal stress detected; cooling fin efficiency or mixture may be degrading.",
      recommendation:
        "Reduce sustained high-load operation; inspect cooling fins, baffles, and mixture setting."
    },

    CRITICAL: {
      description:
        "Cooling-system degradation is projected to precede cylinder head or piston thermal damage.",
      recommendation:
        "Ground the airframe and inspect the cooling system, CHT sensor, and mixture control before further flight."
    }
  },

  LUBRICATION: {
    WATCH: {
      description:
        "Oil pressure/temperature drifting outside the nominal envelope.",
      recommendation:
        "Check oil level and cooler airflow; trend oil pressure over the next flights."
    },

    WARNING: {
      description:
        "Lubrication-system wear accelerating; bearing wear risk is increasing.",
      recommendation:
        "Schedule an oil and filter inspection; verify oil pump and pressure relief valve."
    },

    CRITICAL: {
      description:
        "Lubrication degradation is projected to precede bearing or journal surface damage.",
      recommendation:
        "Ground the airframe; inspect oil pump, filter, and main/rod bearings before next flight."
    }
  },

  MECHANICAL_VIBRATION: {
    WATCH: {
      description:
        "Vibration levels above nominal — possible early imbalance.",
      recommendation:
        "Inspect propeller balance, engine mounts, and crankshaft counterweights."
    },

    WARNING: {
      description:
        "Elevated vibration trend consistent with mechanical wear or imbalance.",
      recommendation:
        "Inspect propeller, PSRU gearbox, and engine mount bushings; rebalance if required."
    },

    CRITICAL: {
      description:
        "Vibration degradation is projected to precede bearing, mount, or structural fatigue failure.",
      recommendation:
        "Ground the airframe; inspect crankshaft, bearings, mounts, and propeller before further flight."
    }
  },

  FUEL_INJECTION: {
    WATCH: {
      description:
        "Fuel flow deviating from the expected value for the current throttle setting.",
      recommendation:
        "Verify injector calibration and fuel pressure regulator."
    },

    WARNING: {
      description:
        "Fuel/injection degradation trend consistent with partial injector blockage or wear.",
      recommendation:
        "Inspect injectors, fuel filter, and fuel pump pressure."
    },

    CRITICAL: {
      description:
        "Fuel/injection degradation is projected to precede misfire or combustion failure.",
      recommendation:
        "Ground the airframe; inspect injectors, fuel delivery system, and the fuel-control unit."
    }
  },

  ELECTRICAL_IGNITION: {
    WATCH: {
      description:
        "Battery/alternator readings drifting outside the nominal band.",
      recommendation:
        "Check charging system wiring and alternator output."
    },

    WARNING: {
      description:
        "Electrical/ignition system degradation trend detected.",
      recommendation:
        "Inspect alternator, voltage regulator, and ignition module connections."
    },

    CRITICAL: {
      description:
        "Electrical degradation is projected to precede ignition or charging system failure.",
      recommendation:
        "Ground the airframe; inspect alternator, battery, regulator, and ignition module before flight."
    }
  },

  SENSORS: {
    WATCH: {
      description:
        "A sensor channel is showing intermittent or noisy readings.",
      recommendation:
        "Cross-check the affected channel against redundant sensors if available."
    },

    WARNING: {
      description:
        "Sensor degradation trend detected; readings may become unreliable.",
      recommendation:
        "Schedule sensor/wiring harness inspection for the affected channel."
    },

    CRITICAL: {
      description:
        "Sensor degradation is projected to precede loss of reliable telemetry on this channel.",
      recommendation:
        "Ground the airframe; inspect and recalibrate or replace the affected sensor before flight."
    }
  }
};

export function createInitialDegradationState(): DegradationState {
  return {
    runningHours: 0,

    overallDegradation: 0,

    subsystems: SUBSYSTEM_KEYS.map(
      (key) => ({
        key,
        label: SUBSYSTEM_LABELS[key],
        score: 100,
        degradation: 0,
        wearRatePerHour: 0,
        estimatedHoursRemaining: 5000,
        status:
          "NORMAL" as SubsystemStatusLevel
      })
    ),

    predictedFailures: []
  };
}

export function updateDegradation(
  prev: DegradationState,
  telemetry: Telemetry,
  dtSeconds: number
): DegradationState {
  const dtHours =
    clamp(dtSeconds, 0, 2) / 3600;

  const running =
    telemetry.engineState === "RUNNING";

  const subsystems: SubsystemStatus[] =
    prev.subsystems.map((s) => {
      if (!running) {
        return {
          ...s,
          wearRatePerHour:
            s.wearRatePerHour *
            (1 - RATE_SMOOTHING)
        };
      }

      const score =
        instantaneousScore(
          s.key,
          telemetry
        );

      const stress =
        stressFromScore(score) +
        faultStressBonus(
          s.key,
          telemetry.fault
        );

      const instantaneousWearRate =
        BASE_WEAR_PER_HOUR +
        stress *
          STRESS_WEAR_PER_HOUR;

      const wearRatePerHour =
        s.wearRatePerHour +
        (
          instantaneousWearRate -
          s.wearRatePerHour
        ) *
          RATE_SMOOTHING;

      const degradation =
        clamp(
          s.degradation +
            wearRatePerHour *
              dtHours,
          0,
          100
        );

      const estimatedHoursRemaining =
        wearRatePerHour > 0.05
          ? clamp(
              (100 - degradation) /
                wearRatePerHour,
              0,
              5000
            )
          : 5000;

      return {
        ...s,
        score,
        degradation,
        wearRatePerHour,
        estimatedHoursRemaining,
        status:
          severityFor(degradation)
      };
    });

  const predictedFailures =
    subsystems
      .filter(
        (s) =>
          s.status !== "NORMAL"
      )
      .sort(
        (a, b) =>
          b.degradation -
          a.degradation
      )
      .map((s) => {
        const text =
          NARRATIVE[s.key][
            s.status as Exclude<
              SubsystemStatusLevel,
              "NORMAL"
            >
          ] ?? {
            description:
              "Degradation trend detected.",

            recommendation:
              "Investigate at next inspection."
          };

        return {
          subsystem: s.key,
          label: s.label,

          severity:
            s.status as Exclude<
              SubsystemStatusLevel,
              "NORMAL"
            >,

          description:
            text.description,

          recommendation:
            text.recommendation,

          estimatedHoursRemaining:
            s.estimatedHoursRemaining
        };
      });

  const overallDegradation =
    subsystems.reduce(
      (sum, s) =>
        sum + s.degradation,
      0
    ) / subsystems.length;

  return {
    runningHours:
      prev.runningHours +
      (running ? dtHours : 0),

    overallDegradation,

    subsystems,

    predictedFailures
  };
}
