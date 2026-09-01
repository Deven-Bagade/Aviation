export type EnginePhysicsState = {
  crankAngle: number;
  angularVelocity: number;

  pistonPosition: {
    x: number;
    y: number;
  };

  pistonVelocity: number;

  engineCycle: number;
};

export function rpmToRadPerSecond(
  rpm: number
): number {
  return (
    Math.max(0, rpm) *
    2 *
    Math.PI /
    60
  );
}

export function calculatePistonPosition(
  crankAngle: number,
  crankRadius: number,
  rodLength: number
) {
  const crankX =
    crankRadius *
    Math.cos(crankAngle);

  const crankY =
    crankRadius *
    Math.sin(crankAngle);

  const rodVertical = Math.sqrt(
    Math.max(
      0,
      rodLength * rodLength -
        crankX * crankX
    )
  );

  return {
    x: crankX,
    y: crankY + rodVertical
  };
}

export function calculatePistonVelocity(
  crankAngle: number,
  rpm: number,
  crankRadius: number,
  rodLength: number
): number {
  const omega =
    rpmToRadPerSecond(rpm);

  const sinTheta =
    Math.sin(crankAngle);

  const cosTheta =
    Math.cos(crankAngle);

  const denominator =
    Math.sqrt(
      Math.max(
        0.000001,
        rodLength * rodLength -
          crankRadius *
            crankRadius *
            cosTheta *
            cosTheta
      )
    );

  return (
    crankRadius *
      omega *
      cosTheta -
    (
      crankRadius *
      crankRadius *
      omega *
      sinTheta *
      cosTheta
    ) /
      denominator
  );
}

export function updateEnginePhysics({
  rpm,
  crankAngle,
  delta,
  crankRadius = 0.8,
  rodLength = 2.5
}: {
  rpm: number;
  crankAngle: number;
  delta: number;
  crankRadius?: number;
  rodLength?: number;
}): EnginePhysicsState {

  const safeRpm =
    Math.max(0, rpm);

  const angularVelocity =
    rpmToRadPerSecond(safeRpm);

  const newAngle =
    (
      crankAngle +
      angularVelocity * delta
    ) %
    (Math.PI * 2);

  const pistonPosition =
    calculatePistonPosition(
      newAngle,
      crankRadius,
      rodLength
    );

  const pistonVelocity =
    calculatePistonVelocity(
      newAngle,
      safeRpm,
      crankRadius,
      rodLength
    );

  return {
    crankAngle: newAngle,

    angularVelocity,

    pistonPosition,

    pistonVelocity,

    engineCycle:
      newAngle /
      (Math.PI * 2)
  };
}