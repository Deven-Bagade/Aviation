import {
  MissionProfile,
  MissionStage,
} from "../types";

function calculateDuration(
  stages: MissionStage[]
): number {
  return stages.reduce(
    (total, stage) =>
      total + stage.durationSeconds,
    0
  );
}

/*
 * ==========================================================
 * STANDARD ISR MISSION
 * ==========================================================
 */

const STANDARD_ISR_STAGES: MissionStage[] = [
  {
    id: "takeoff",
    name: "TAKEOFF",
    label: "Takeoff",
    durationSeconds: 120,

    throttle: 0.95,

    altitudeStartM: 0,
    altitudeEndM: 800,

    targetRpm: 3200,

    description:
      "High-power takeoff and initial acceleration.",
  },

  {
    id: "climb",
    name: "CLIMB",
    label: "Climb",
    durationSeconds: 600,

    throttle: 0.82,

    altitudeStartM: 800,
    altitudeEndM: 3500,

    targetRpm: 3100,

    description:
      "Sustained climb toward mission altitude.",
  },

  {
    id: "cruise",
    name: "CRUISE",
    label: "Cruise",
    durationSeconds: 1200,

    throttle: 0.55,

    altitudeStartM: 3500,
    altitudeEndM: 4500,

    targetRpm: 2750,

    description:
      "Efficient cruise operation.",
  },

  {
    id: "loiter",
    name: "LOITER",
    label: "Loiter",
    durationSeconds: 1800,

    throttle: 0.45,

    altitudeStartM: 4500,
    altitudeEndM: 4500,

    targetRpm: 2550,

    description:
      "Long-duration ISR loiter segment.",
  },

  {
    id: "high-load",
    name: "HIGH_LOAD",
    label: "High Load",
    durationSeconds: 300,

    throttle: 0.92,

    altitudeStartM: 4500,
    altitudeEndM: 4000,

    targetRpm: 3200,

    description:
      "High-load propulsion stress segment.",
  },

  {
    id: "descent",
    name: "DESCENT",
    label: "Descent",
    durationSeconds: 600,

    throttle: 0.35,

    altitudeStartM: 4000,
    altitudeEndM: 1000,

    targetRpm: 2200,

    description:
      "Controlled descent with reduced power.",
  },

  {
    id: "landing",
    name: "LANDING",
    label: "Landing",
    durationSeconds: 180,

    throttle: 0.18,

    altitudeStartM: 1000,
    altitudeEndM: 0,

    targetRpm: 1200,

    description:
      "Approach and landing power segment.",
  },
];

/*
 * ==========================================================
 * LONG ENDURANCE MISSION
 * ==========================================================
 */

const LONG_ENDURANCE_STAGES: MissionStage[] = [
  {
    id: "takeoff",
    name: "TAKEOFF",
    label: "Takeoff",
    durationSeconds: 150,

    throttle: 0.96,

    altitudeStartM: 0,
    altitudeEndM: 900,

    targetRpm: 3250,

    description:
      "Maximum-power departure.",
  },

  {
    id: "climb",
    name: "CLIMB",
    label: "Climb",
    durationSeconds: 900,

    throttle: 0.78,

    altitudeStartM: 900,
    altitudeEndM: 5000,

    targetRpm: 3050,

    description:
      "Efficient climb to endurance altitude.",
  },

  {
    id: "cruise",
    name: "CRUISE",
    label: "Cruise",
    durationSeconds: 1800,

    throttle: 0.48,

    altitudeStartM: 5000,
    altitudeEndM: 5500,

    targetRpm: 2500,

    description:
      "Low-consumption endurance cruise.",
  },

  {
    id: "loiter",
    name: "LOITER",
    label: "Loiter",
    durationSeconds: 3600,

    throttle: 0.40,

    altitudeStartM: 5500,
    altitudeEndM: 5500,

    targetRpm: 2350,

    description:
      "Extended ISR surveillance loiter.",
  },

  {
    id: "high-load",
    name: "HIGH_LOAD",
    label: "High Load",
    durationSeconds: 360,

    throttle: 0.88,

    altitudeStartM: 5500,
    altitudeEndM: 5000,

    targetRpm: 3100,

    description:
      "Short high-load system validation.",
  },

  {
    id: "descent",
    name: "DESCENT",
    label: "Descent",
    durationSeconds: 900,

    throttle: 0.30,

    altitudeStartM: 5000,
    altitudeEndM: 1000,

    targetRpm: 2100,

    description:
      "Controlled return descent.",
  },

  {
    id: "landing",
    name: "LANDING",
    label: "Landing",
    durationSeconds: 240,

    throttle: 0.16,

    altitudeStartM: 1000,
    altitudeEndM: 0,

    targetRpm: 1150,

    description:
      "Final approach and landing.",
  },
];

/*
 * ==========================================================
 * RAPID STRESS / RELIABILITY MISSION
 * ==========================================================
 */

const RELIABILITY_STAGES: MissionStage[] = [
  {
    id: "takeoff",
    name: "TAKEOFF",
    label: "Takeoff",
    durationSeconds: 60,

    throttle: 1.0,

    altitudeStartM: 0,
    altitudeEndM: 500,

    targetRpm: 3350,

    description:
      "Rapid high-power takeoff.",
  },

  {
    id: "climb",
    name: "CLIMB",
    label: "Climb",
    durationSeconds: 180,

    throttle: 0.90,

    altitudeStartM: 500,
    altitudeEndM: 3000,

    targetRpm: 3250,

    description:
      "Aggressive climb.",
  },

  {
    id: "cruise",
    name: "CRUISE",
    label: "Cruise",
    durationSeconds: 300,

    throttle: 0.65,

    altitudeStartM: 3000,
    altitudeEndM: 3500,

    targetRpm: 2850,

    description:
      "Moderate cruise segment.",
  },

  {
    id: "loiter",
    name: "LOITER",
    label: "Loiter",
    durationSeconds: 300,

    throttle: 0.50,

    altitudeStartM: 3500,
    altitudeEndM: 3500,

    targetRpm: 2600,

    description:
      "Short stabilization period.",
  },

  {
    id: "high-load",
    name: "HIGH_LOAD",
    label: "High Load",
    durationSeconds: 900,

    throttle: 0.98,

    altitudeStartM: 3500,
    altitudeEndM: 3000,

    targetRpm: 3350,

    description:
      "Extended high-load reliability test.",
  },

  {
    id: "descent",
    name: "DESCENT",
    label: "Descent",
    durationSeconds: 240,

    throttle: 0.30,

    altitudeStartM: 3000,
    altitudeEndM: 800,

    targetRpm: 2100,

    description:
      "Power reduction and thermal recovery.",
  },

  {
    id: "landing",
    name: "LANDING",
    label: "Landing",
    durationSeconds: 120,

    throttle: 0.15,

    altitudeStartM: 800,
    altitudeEndM: 0,

    targetRpm: 1100,

    description:
      "Final landing segment.",
  },
];

function createProfile(
  id: string,
  name: string,
  description: string,
  stages: MissionStage[]
): MissionProfile {
  return {
    id,
    name,
    description,
    stages,
    totalDurationSeconds:
      calculateDuration(stages),
  };
}

export const MISSION_PROFILES: MissionProfile[] = [
  createProfile(
    "standard-isr",
    "Standard ISR Mission",
    "Representative MALE UAV intelligence, surveillance and reconnaissance mission.",
    STANDARD_ISR_STAGES
  ),

  createProfile(
    "long-endurance",
    "Long Endurance Mission",
    "Extended endurance mission emphasizing cruise and loiter efficiency.",
    LONG_ENDURANCE_STAGES
  ),

  createProfile(
    "reliability-stress",
    "Reliability Stress Mission",
    "Aggressive mission profile designed to expose thermal, mechanical and fuel-system weaknesses.",
    RELIABILITY_STAGES
  ),
];

export function getMissionProfile(
  id: string
): MissionProfile | undefined {
  return MISSION_PROFILES.find(
    (profile) =>
      profile.id === id
  );
}

export function getDefaultMissionProfile():
  MissionProfile {
  return MISSION_PROFILES[0];
}