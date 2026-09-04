import {
  MissionEvent,
  MissionProfile,
  MissionRuntimeState,
  MissionStage,
} from "../types";

import telemetryEngine from "./telemetryEngine";

type MissionEventListener = (
  event: MissionEvent
) => void;

export class MissionEngine {
  private profile:
    | MissionProfile
    | null = null;

  private state:
    MissionRuntimeState = {
      missionId: null,

      running: false,

      paused: false,

      elapsedSeconds: 0,

      stageIndex: 0,

      stageElapsedSeconds: 0,

      completed: false,

      startedAt: null,
    };

  private timer:
    | ReturnType<typeof setInterval>
    | null = null;

  private listeners =
    new Set<MissionEventListener>();

  private lastTick = 0;

  public loadMission(
    profile: MissionProfile
  ): void {
    this.stop();

    this.profile = profile;

    this.state = {
      missionId: profile.id,

      running: false,

      paused: false,

      elapsedSeconds: 0,

      stageIndex: 0,

      stageElapsedSeconds: 0,

      completed: false,

      startedAt: null,
    };
  }

  public subscribe(
    listener: MissionEventListener
  ): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public getProfile():
    MissionProfile | null {
    return this.profile;
  }

  public getState():
    MissionRuntimeState {
    return {
      ...this.state,
    };
  }

  public start(): void {
    if (!this.profile) {
      return;
    }

    if (this.state.running) {
      return;
    }

    /*
     * If the mission was previously completed,
     * start from the beginning.
     */
    if (this.state.completed) {
      this.state = {
        missionId:
          this.profile.id,

        running: false,

        paused: false,

        elapsedSeconds: 0,

        stageIndex: 0,

        stageElapsedSeconds: 0,

        completed: false,

        startedAt: null,
      };
    }

    this.state.running = true;

    this.state.paused = false;

    this.state.startedAt =
      Date.now();

    this.applyCurrentStage();

    this.emit({
      timestamp: Date.now(),

      missionId:
        this.profile.id,

      stageId:
        this.currentStage()?.id ?? "",

      stageName:
        this.currentStage()?.name ??
        "TAKEOFF",

      elapsedSeconds:
        this.state.elapsedSeconds,

      type:
        "MISSION_STARTED",
    });

    this.startTimer();

    this.emitStageStarted();
  }

  public pause(): void {
    if (
      !this.state.running ||
      this.state.paused
    ) {
      return;
    }

    this.state.paused = true;

    this.emitCurrent(
      "MISSION_PAUSED"
    );
  }

  public resume(): void {
    if (
      !this.state.running ||
      !this.state.paused
    ) {
      return;
    }

    this.state.paused = false;

    this.lastTick =
      performance.now();

    this.emitCurrent(
      "MISSION_RESUMED"
    );
  }

  public stop(): void {
    if (
      this.state.running
    ) {
      this.emitCurrent(
        "MISSION_STOPPED"
      );
    }

    this.stopTimer();

    this.state.running = false;

    this.state.paused = false;
  }

  public reset(): void {
    this.stop();

    if (!this.profile) {
      return;
    }

    this.state = {
      missionId:
        this.profile.id,

      running: false,

      paused: false,

      elapsedSeconds: 0,

      stageIndex: 0,

      stageElapsedSeconds: 0,

      completed: false,

      startedAt: null,
    };
  }

  public skipToStage(
    index: number
  ): void {
    if (!this.profile) {
      return;
    }

    if (
      index < 0 ||
      index >=
        this.profile.stages.length
    ) {
      return;
    }

    this.state.stageIndex =
      index;

    this.state.stageElapsedSeconds =
      0;

    this.applyCurrentStage();

    this.emitStageStarted();
  }

  private startTimer(): void {
    this.stopTimer();

    this.lastTick =
      performance.now();

    this.timer = setInterval(
      () => this.tick(),
      100
    );
  }

  private stopTimer(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);

    this.timer = null;
  }

  private tick(): void {
    if (
      !this.state.running ||
      this.state.paused ||
      !this.profile
    ) {
      return;
    }

    const now =
      performance.now();

    let dt =
      (now - this.lastTick) /
      1000;

    this.lastTick = now;

    dt = Math.max(
      0.01,
      Math.min(dt, 0.5)
    );

    this.state.elapsedSeconds +=
      dt;

    this.state.stageElapsedSeconds +=
      dt;

    const stage =
      this.currentStage();

    if (!stage) {
      this.completeMission();
      return;
    }

    /*
     * Continuously update altitude interpolation
     * during the current stage.
     */
    this.applyStageProgress(stage);

    if (
      this.state.stageElapsedSeconds >=
      stage.durationSeconds
    ) {
      this.completeStage();
    }
  }

  private currentStage():
    MissionStage | null {
    if (!this.profile) {
      return null;
    }

    return (
      this.profile.stages[
        this.state.stageIndex
      ] ?? null
    );
  }

  private applyCurrentStage(): void {
    const stage =
      this.currentStage();

    if (!stage) {
      return;
    }

    telemetryEngine.executeCommand({
      type: "START",
    });

    telemetryEngine.executeCommand({
      type: "SET_THROTTLE",
      value: stage.throttle,
    });

    if (
      stage.name === "HIGH_LOAD"
    ) {
      telemetryEngine.executeCommand({
        type: "SET_MODE",
        value: "HIGH LOAD",
      });
    } else if (
      stage.name === "CRUISE" ||
      stage.name === "LOITER"
    ) {
      telemetryEngine.executeCommand({
        type: "SET_MODE",
        value: "CRUISE",
      });
    } else {
      telemetryEngine.executeCommand({
        type: "SET_MODE",
        value: "IDLE",
      });
    }

    /*
     * Altitude is handled through the existing manual
     * override system. It remains a normal telemetry
     * variable and therefore the thermodynamic model sees
     * mission altitude directly.
     */
    telemetryEngine.executeCommand({
      type: "SET_MANUAL_OVERRIDE",
      field: "altitude",
      enabled: true,
      value: stage.altitudeStartM,
    });
  }

  private applyStageProgress(
    stage: MissionStage
  ): void {
    const duration =
      Math.max(
        stage.durationSeconds,
        0.001
      );

    const progress =
      Math.max(
        0,
        Math.min(
          1,
          this.state.stageElapsedSeconds /
            duration
        )
      );

    const altitude =
      stage.altitudeStartM +
      (stage.altitudeEndM -
        stage.altitudeStartM) *
        progress;

    telemetryEngine.executeCommand({
      type: "SET_MANUAL_OVERRIDE",
      field: "altitude",
      enabled: true,
      value: altitude,
    });

    /*
     * Keep stage throttle under mission control.
     */
    telemetryEngine.executeCommand({
      type: "SET_THROTTLE",
      value: stage.throttle,
    });
  }

  private completeStage(): void {
    const stage =
      this.currentStage();

    if (!stage || !this.profile) {
      return;
    }

    this.emit({
      timestamp: Date.now(),

      missionId:
        this.profile.id,

      stageId:
        stage.id,

      stageName:
        stage.name,

      elapsedSeconds:
        this.state.elapsedSeconds,

      type:
        "STAGE_COMPLETED",
    });

    const nextIndex =
      this.state.stageIndex + 1;

    if (
      nextIndex >=
      this.profile.stages.length
    ) {
      this.completeMission();
      return;
    }

    this.state.stageIndex =
      nextIndex;

    this.state.stageElapsedSeconds =
      0;

    this.applyCurrentStage();

    this.emitStageStarted();
  }

  private completeMission(): void {
    if (!this.profile) {
      return;
    }

    this.state.completed = true;

    this.state.running = false;

    this.state.paused = false;

    this.stopTimer();

    const stage =
      this.currentStage();

    this.emit({
      timestamp: Date.now(),

      missionId:
        this.profile.id,

      stageId:
        stage?.id ?? "",

      stageName:
        stage?.name ?? "LANDING",

      elapsedSeconds:
        this.state.elapsedSeconds,

      type:
        "MISSION_COMPLETED",
    });

    telemetryEngine.executeCommand({
      type: "SET_MANUAL_OVERRIDE",
      field: "altitude",
      enabled: false,
      value: 0,
    });

    telemetryEngine.executeCommand({
      type: "SET_THROTTLE",
      value: 0,
    });
  }

  private emitStageStarted(): void {
    if (!this.profile) {
      return;
    }

    const stage =
      this.currentStage();

    if (!stage) {
      return;
    }

    this.emit({
      timestamp: Date.now(),

      missionId:
        this.profile.id,

      stageId:
        stage.id,

      stageName:
        stage.name,

      elapsedSeconds:
        this.state.elapsedSeconds,

      type:
        "STAGE_STARTED",
    });
  }

  private emitCurrent(
    type: MissionEvent["type"]
  ): void {
    if (!this.profile) {
      return;
    }

    const stage =
      this.currentStage();

    this.emit({
      timestamp: Date.now(),

      missionId:
        this.profile.id,

      stageId:
        stage?.id ?? "",

      stageName:
        stage?.name ?? "TAKEOFF",

      elapsedSeconds:
        this.state.elapsedSeconds,

      type,
    });
  }

  private emit(
    event: MissionEvent
  ): void {
    this.listeners.forEach(
      (listener) => {
        try {
          listener(event);
        } catch {
          /*
           * Listener failures must never stop
           * mission execution.
           */
        }
      }
    );
  }
}

export const missionEngine =
  new MissionEngine();

export default missionEngine;