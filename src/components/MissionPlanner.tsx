import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  missionEngine,
} from "../simulation/missionEngine";

import {
  MISSION_PROFILES,
  getDefaultMissionProfile,
} from "../simulation/missionProfiles";

import type {
  MissionProfile,
  MissionRuntimeState,
  MissionStage,
} from "../types";

interface MissionPlannerProps {
  onMissionStart?: (
    missionId: string
  ) => void;

  onMissionStop?: () => void;

  compact?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatDuration(
  seconds: number
): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const minutes = Math.floor(
    seconds / 60
  );

  const remaining =
    Math.round(seconds % 60);

  if (minutes < 60) {
    return `${minutes}m ${remaining}s`;
  }

  const hours = Math.floor(
    minutes / 60
  );

  return `${hours}h ${minutes % 60}m`;
}

function formatAltitude(
  altitude: number
): string {
  return `${Math.round(
    altitude
  ).toLocaleString()} m`;
}

function formatThrottle(
  throttle: number
): string {
  /*
   * Mission profiles normally use 0–1.
   * This also handles an existing profile
   * represented as 0–100.
   */
  const percentage =
    throttle <= 1
      ? throttle * 100
      : throttle;

  return `${Math.round(
    percentage
  )}%`;
}

function stageLabel(
  stage: MissionStage
): string {
  return stage.name
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function getStageThrottle(
  stage: MissionStage
): number {
  const raw =
    stage as unknown as Record<
      string,
      unknown
    >;

  const throttle =
    typeof raw.throttle === "number"
      ? raw.throttle
      : typeof raw.throttleFraction ===
          "number"
        ? raw.throttleFraction
        : 0;

  return throttle;
}

function getStageAltitudeStart(
  stage: MissionStage
): number {
  const raw =
    stage as unknown as Record<
      string,
      unknown
    >;

  return typeof raw.altitudeStart ===
    "number"
    ? raw.altitudeStart
    : typeof raw.startAltitude ===
        "number"
      ? raw.startAltitude
      : typeof raw.altitude === "number"
        ? raw.altitude
        : 0;
}

function getStageAltitudeEnd(
  stage: MissionStage
): number {
  const raw =
    stage as unknown as Record<
      string,
      unknown
    >;

  return typeof raw.altitudeEnd ===
    "number"
    ? raw.altitudeEnd
    : typeof raw.endAltitude ===
        "number"
      ? raw.endAltitude
      : getStageAltitudeStart(stage);
}

function getStageRpm(
  stage: MissionStage
): number {
  const raw =
    stage as unknown as Record<
      string,
      unknown
    >;

  return typeof raw.targetRpm ===
    "number"
    ? raw.targetRpm
    : typeof raw.rpm === "number"
      ? raw.rpm
      : 0;
}

function getStageDuration(
  stage: MissionStage
): number {
  const raw =
    stage as unknown as Record<
      string,
      unknown
    >;

  return typeof raw.durationSeconds ===
    "number"
    ? raw.durationSeconds
    : typeof raw.duration ===
        "number"
      ? raw.duration
      : 0;
}

function getProfileId(
  profile: MissionProfile
): string {
  const raw =
    profile as unknown as Record<
      string,
      unknown
    >;

  return String(
    raw.id ??
      raw.profileId ??
      raw.name ??
      "mission"
  );
}

function getProfileName(
  profile: MissionProfile
): string {
  const raw =
    profile as unknown as Record<
      string,
      unknown
    >;

  return String(
    raw.name ??
      raw.title ??
      raw.id ??
      "Mission"
  );
}

function getProfileDescription(
  profile: MissionProfile
): string {
  const raw =
    profile as unknown as Record<
      string,
      unknown
    >;

  return String(
    raw.description ??
      "Predefined UAV engine mission profile."
  );
}

function getRuntimeStageIndex(
  runtime: MissionRuntimeState
): number {
  const raw =
    runtime as unknown as Record<
      string,
      unknown
    >;

  if (
    typeof raw.currentStageIndex ===
    "number"
  ) {
    return raw.currentStageIndex;
  }

  if (
    typeof raw.stageIndex === "number"
  ) {
    return raw.stageIndex;
  }

  return 0;
}

function getRuntimeProgress(
  runtime: MissionRuntimeState
): number {
  const raw =
    runtime as unknown as Record<
      string,
      unknown
    >;

  const progress =
    typeof raw.stageProgress ===
    "number"
      ? raw.stageProgress
      : typeof raw.progress === "number"
        ? raw.progress
        : 0;

  if (progress <= 1) {
    return progress * 100;
  }

  return Math.max(
    0,
    Math.min(100, progress)
  );
}

function getRuntimeElapsed(
  runtime: MissionRuntimeState
): number {
  const raw =
    runtime as unknown as Record<
      string,
      unknown
    >;

  return typeof raw.elapsedSeconds ===
    "number"
    ? raw.elapsedSeconds
    : typeof raw.elapsed ===
        "number"
      ? raw.elapsed
      : 0;
}

function getRuntimeStatus(
  runtime: MissionRuntimeState
): string {
  const raw =
    runtime as unknown as Record<
      string,
      unknown
    >;

  return String(
    raw.status ??
      raw.state ??
      "idle"
  ).toLowerCase();
}

function getRuntimeMissionId(
  runtime: MissionRuntimeState
): string {
  const raw =
    runtime as unknown as Record<
      string,
      unknown
    >;

  return String(
    raw.missionId ??
      raw.id ??
      ""
  );
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export const MissionPlanner: React.FC<
  MissionPlannerProps
> = ({
  onMissionStart,
  onMissionStop,
  compact = false,
}) => {
  const defaultProfile =
    getDefaultMissionProfile();

  const [selectedProfileId, setSelectedProfileId] =
    useState(
      getProfileId(defaultProfile)
    );

  const [runtime, setRuntime] =
    useState<MissionRuntimeState>(
      missionEngine.getState()
    );

  const [error, setError] =
    useState<string | null>(null);

  const [showDetails, setShowDetails] =
    useState(!compact);

  /* ------------------------------------------------------------------------ */
  /* Selected mission                                                        */
  /* ------------------------------------------------------------------------ */

  const selectedProfile =
    useMemo(() => {
      return (
        MISSION_PROFILES.find(
          (profile) =>
            getProfileId(profile) ===
            selectedProfileId
        ) ?? defaultProfile
      );
    }, [
      selectedProfileId,
      defaultProfile,
    ]);

  const stages =
    selectedProfile.stages ?? [];

  const currentStageIndex =
    getRuntimeStageIndex(runtime);

  const currentStage =
    stages[currentStageIndex] ??
    null;

  const runtimeStatus =
    getRuntimeStatus(runtime);

  const isRunning =
    runtimeStatus === "running" ||
    runtimeStatus === "active";

  const isPaused =
    runtimeStatus === "paused";

  const isCompleted =
    runtimeStatus === "completed" ||
    runtimeStatus === "complete";

  const isStopped =
    runtimeStatus === "stopped" ||
    runtimeStatus === "idle";

  /* ------------------------------------------------------------------------ */
  /* Mission subscription                                                    */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const unsubscribe =
      missionEngine.subscribe(
        (nextState) => {
          // The subscription emits MissionEvent values; read the current
          // runtime state from the engine before updating the view.
          setRuntime(missionEngine.getState());
        }
      );

    return unsubscribe;
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Profile loading                                                          */
  /* ------------------------------------------------------------------------ */

  const handleProfileChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const profileId =
      event.target.value;

    setSelectedProfileId(
      profileId
    );

    setError(null);

    /*
     * Never replace a currently executing mission.
     * The user must stop/reset before loading
     * another mission profile.
     */
    if (
      isRunning ||
      isPaused
    ) {
      setError(
        "Stop the current mission before selecting another profile."
      );

      return;
    }

    try {
      const profile =
        MISSION_PROFILES.find(
          (item) =>
            getProfileId(item) ===
            profileId
        );

      if (profile) {
        missionEngine.loadMission(
          profile
        );

        setRuntime(
          missionEngine.getState()
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load mission profile."
      );
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Controls                                                                 */
  /* ------------------------------------------------------------------------ */

  const handleStart = () => {
    setError(null);

    try {
      /*
       * Ensure the selected profile is loaded.
       */
      const currentProfile =
        missionEngine.getProfile();

      if (
        !currentProfile ||
        getProfileId(
          currentProfile
        ) !== selectedProfileId
      ) {
        missionEngine.loadMission(
          selectedProfile
        );
      }

      missionEngine.start();

      const state =
        missionEngine.getState();

      setRuntime(state);

      const missionId =
        getRuntimeMissionId(state);

      if (onMissionStart) {
        onMissionStart(
          missionId ||
            getProfileId(
              selectedProfile
            )
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to start mission."
      );
    }
  };

  const handlePause = () => {
    setError(null);

    try {
      missionEngine.pause();

      setRuntime(
        missionEngine.getState()
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to pause mission."
      );
    }
  };

  const handleResume = () => {
    setError(null);

    try {
      missionEngine.resume();

      setRuntime(
        missionEngine.getState()
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to resume mission."
      );
    }
  };

  const handleStop = () => {
    setError(null);

    try {
      missionEngine.stop();

      setRuntime(
        missionEngine.getState()
      );

      if (onMissionStop) {
        onMissionStop();
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to stop mission."
      );
    }
  };

  const handleReset = () => {
    setError(null);

    try {
      missionEngine.reset();

      missionEngine.loadMission(
        selectedProfile
      );

      setRuntime(
        missionEngine.getState()
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to reset mission."
      );
    }
  };

  const handleSkipStage = () => {
    setError(null);

    try {
      const nextIndex =
        currentStageIndex + 1;

      if (
        nextIndex >=
        stages.length
      ) {
        return;
      }

      missionEngine.skipToStage(
        nextIndex
      );

      setRuntime(
        missionEngine.getState()
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to skip mission stage."
      );
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Calculated values                                                        */
  /* ------------------------------------------------------------------------ */

  const progress =
    getRuntimeProgress(runtime);

  const elapsed =
    getRuntimeElapsed(runtime);

  const totalDuration =
    stages.reduce(
      (
        total,
        stage
      ) =>
        total +
        getStageDuration(stage),
      0
    );

  const selectedProfileDuration =
    totalDuration;

  const missionProgress =
    selectedProfileDuration > 0
      ? Math.min(
          100,
          (elapsed /
            selectedProfileDuration) *
            100
        )
      : 0;

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <section
      className={`mission-planner${
        compact
          ? " mission-planner--compact"
          : ""
      }`}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}

      <div className="mission-planner__header">
        <div>
          <div className="mission-planner__eyebrow">
            MISSION CONTROL
          </div>

          <h2>
            Mission Planner
          </h2>

          <p>
            Configure and execute a predefined
            MALE UAV engine mission profile.
          </p>
        </div>

        <div
          className={`mission-planner__status mission-planner__status--${runtimeStatus}`}
        >
          <span className="mission-planner__status-dot" />

          <span>
            {runtimeStatus
              .replace(/_/g, " ")
              .toUpperCase()}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Profile selector                                                   */}
      {/* ------------------------------------------------------------------ */}

      <div className="mission-planner__configuration">
        <div className="mission-planner__profile-selector">
          <label htmlFor="mission-profile">
            Mission Profile
          </label>

          <select
            id="mission-profile"
            value={selectedProfileId}
            onChange={
              handleProfileChange
            }
            disabled={
              isRunning ||
              isPaused
            }
          >
            {MISSION_PROFILES.map(
              (profile) => (
                <option
                  key={getProfileId(
                    profile
                  )}
                  value={getProfileId(
                    profile
                  )}
                >
                  {getProfileName(
                    profile
                  )}
                </option>
              )
            )}
          </select>
        </div>

        <div className="mission-planner__profile-description">
          <span>
            {getProfileDescription(
              selectedProfile
            )}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Mission overview                                                   */}
      {/* ------------------------------------------------------------------ */}

      <div className="mission-planner__overview">
        <div className="mission-planner__overview-card">
          <span>
            STAGES
          </span>

          <strong>
            {stages.length}
          </strong>
        </div>

        <div className="mission-planner__overview-card">
          <span>
            TOTAL DURATION
          </span>

          <strong>
            {formatDuration(
              selectedProfileDuration
            )}
          </strong>
        </div>

        <div className="mission-planner__overview-card">
          <span>
            CURRENT STAGE
          </span>

          <strong>
            {currentStage
              ? `${currentStageIndex + 1}/${stages.length}`
              : "—"}
          </strong>
        </div>

        <div className="mission-planner__overview-card">
          <span>
            MISSION PROGRESS
          </span>

          <strong>
            {Math.round(
              missionProgress
            )}
            %
          </strong>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Current stage                                                      */}
      {/* ------------------------------------------------------------------ */}

      {currentStage && (
        <div className="mission-planner__current">
          <div className="mission-planner__current-header">
            <div>
              <span>
                CURRENT STAGE
              </span>

              <h3>
                {stageLabel(
                  currentStage
                )}
              </h3>
            </div>

            <strong>
              Stage{" "}
              {currentStageIndex + 1}
              {" / "}
              {stages.length}
            </strong>
          </div>

          <div className="mission-planner__stage-progress">
            <div
              style={{
                width: `${Math.min(
                  100,
                  Math.max(
                    0,
                    progress
                  )
                )}%`,
              }}
            />
          </div>

          <div className="mission-planner__stage-values">
            <div>
              <span>
                THROTTLE
              </span>

              <strong>
                {formatThrottle(
                  getStageThrottle(
                    currentStage
                  )
                )}
              </strong>
            </div>

            <div>
              <span>
                TARGET RPM
              </span>

              <strong>
                {getStageRpm(
                  currentStage
                ).toLocaleString()}
              </strong>
            </div>

            <div>
              <span>
                ALTITUDE
              </span>

              <strong>
                {formatAltitude(
                  getStageAltitudeStart(
                    currentStage
                  )
                )}
              </strong>
            </div>

            <div>
              <span>
                TARGET ALTITUDE
              </span>

              <strong>
                {formatAltitude(
                  getStageAltitudeEnd(
                    currentStage
                  )
                )}
              </strong>
            </div>

            <div>
              <span>
                STAGE DURATION
              </span>

              <strong>
                {formatDuration(
                  getStageDuration(
                    currentStage
                  )
                )}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Controls                                                           */}
      {/* ------------------------------------------------------------------ */}

      <div className="mission-planner__controls">
        {!isRunning &&
          !isPaused &&
          !isCompleted && (
            <button
              type="button"
              className="mission-planner__button mission-planner__button--primary"
              onClick={
                handleStart
              }
            >
              ▶ Start Mission
            </button>
          )}

        {isRunning && (
          <button
            type="button"
            className="mission-planner__button"
            onClick={
              handlePause
            }
          >
            ⏸ Pause
          </button>
        )}

        {isPaused && (
          <button
            type="button"
            className="mission-planner__button mission-planner__button--primary"
            onClick={
              handleResume
            }
          >
            ▶ Resume
          </button>
        )}

        {(isRunning ||
          isPaused) && (
          <button
            type="button"
            className="mission-planner__button mission-planner__button--danger"
            onClick={
              handleStop
            }
          >
            ■ Stop
          </button>
        )}

        {(isRunning ||
          isPaused) &&
          currentStageIndex <
            stages.length - 1 && (
            <button
              type="button"
              className="mission-planner__button"
              onClick={
                handleSkipStage
              }
            >
              ⏭ Skip Stage
            </button>
          )}

        {(isCompleted ||
          isStopped) && (
          <button
            type="button"
            className="mission-planner__button"
            onClick={
              handleReset
            }
          >
            ↻ Reset
          </button>
        )}

        <button
          type="button"
          className="mission-planner__button mission-planner__button--secondary"
          onClick={() =>
            setShowDetails(
              (visible) =>
                !visible
            )
          }
        >
          {showDetails
            ? "Hide Stages"
            : "View Stages"}
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Error                                                              */}
      {/* ------------------------------------------------------------------ */}

      {error && (
        <div className="mission-planner__error">
          <strong>
            Mission Control Error
          </strong>

          <span>
            {error}
          </span>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Mission progress                                                   */}
      {/* ------------------------------------------------------------------ */}

      <div className="mission-planner__mission-progress">
        <div className="mission-planner__mission-progress-header">
          <span>
            OVERALL MISSION PROGRESS
          </span>

          <strong>
            {Math.round(
              missionProgress
            )}
            %
          </strong>
        </div>

        <div className="mission-planner__mission-progress-track">
          <div
            style={{
              width: `${Math.min(
                100,
                Math.max(
                  0,
                  missionProgress
                )
              )}%`,
            }}
          />
        </div>

        <div className="mission-planner__mission-time">
          <span>
            Elapsed:{" "}
            {formatDuration(
              elapsed
            )}
          </span>

          <span>
            Planned:{" "}
            {formatDuration(
              selectedProfileDuration
            )}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Stage list                                                         */}
      {/* ------------------------------------------------------------------ */}

      {showDetails && (
        <div className="mission-planner__stages">
          <div className="mission-planner__stages-header">
            <div>
              <span>
                MISSION SEQUENCE
              </span>

              <h3>
                Flight Stages
              </h3>
            </div>

            <span>
              {stages.length} stages
            </span>
          </div>

          <div className="mission-planner__stage-list">
            {stages.map(
              (
                stage,
                index
              ) => {
                const isCurrent =
                  index ===
                  currentStageIndex;

                const isPast =
                  index <
                  currentStageIndex;

                return (
                  <div
                    key={`${getProfileId(
                      selectedProfile
                    )}-${index}-${stage.name}`}
                    className={`mission-planner__stage ${
                      isCurrent
                        ? "mission-planner__stage--current"
                        : ""
                    } ${
                      isPast
                        ? "mission-planner__stage--complete"
                        : ""
                    }`}
                  >
                    <div className="mission-planner__stage-index">
                      {isPast
                        ? "✓"
                        : index + 1}
                    </div>

                    <div className="mission-planner__stage-content">
                      <div className="mission-planner__stage-title">
                        <strong>
                          {stageLabel(
                            stage
                          )}
                        </strong>

                        <span>
                          {formatDuration(
                            getStageDuration(
                              stage
                            )
                          )}
                        </span>
                      </div>

                      <div className="mission-planner__stage-description">
                        {stage.description ??
                          "Engine operating stage"}
                      </div>

                      <div className="mission-planner__stage-meta">
                        <span>
                          Throttle{" "}
                          <strong>
                            {formatThrottle(
                              getStageThrottle(
                                stage
                              )
                            )}
                          </strong>
                        </span>

                        <span>
                          RPM{" "}
                          <strong>
                            {getStageRpm(
                              stage
                            ).toLocaleString()}
                          </strong>
                        </span>

                        <span>
                          Altitude{" "}
                          <strong>
                            {formatAltitude(
                              getStageAltitudeStart(
                                stage
                              )
                            )}
                            {" → "}
                            {formatAltitude(
                              getStageAltitudeEnd(
                                stage
                              )
                            )}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <div className="mission-planner__stage-status">
                      {isCurrent
                        ? "ACTIVE"
                        : isPast
                          ? "DONE"
                          : "QUEUED"}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default MissionPlanner;