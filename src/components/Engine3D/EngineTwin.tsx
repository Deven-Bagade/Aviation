import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Telemetry } from "../../types";

import EngineBlock from "./parts/EngineBlock";
import CylinderAssembly from "./parts/CylinderAssembly";
import Crankshaft from "./parts/Crankshaft";
import Propeller from "./parts/Propeller";
import IntakeExhaust from "./parts/IntakeExhaust";
import AccessorySystems from "./parts/AccessorySystems";
import SensorIndicator from "./parts/SensorIndicator";
import FaultBeacon from "./parts/FaultBeacon";

interface EngineTwinProps {
  telemetry: Telemetry;
  onSensorSelect?: (sensor: string) => void;
}

export default function EngineTwin({ telemetry, onSensorSelect }: EngineTwinProps) {
  const rootRef = useRef<THREE.Group>(null);

  /*
   * Four-cylinder layout. Phase offsets give correct
   * firing-order piston positions across the bank.
   */
  const cylinders = [
    { x: -2.1, phase: 0 },
    { x: -0.7, phase: Math.PI },
    { x: 0.7, phase: Math.PI },
    { x: 2.1, phase: 0 },
  ];
  const cylinderXs = cylinders.map((c) => c.x);

  // Vibration telemetry -> subtle engine shake on the whole assembly
  useFrame(() => {
    if (!rootRef.current) return;
    const vib = Math.max(0, telemetry.vibration);
    const amp = THREE.MathUtils.clamp(vib / 12, 0, 0.06);
    rootRef.current.position.set(
      (Math.random() - 0.5) * amp,
      (Math.random() - 0.5) * amp,
      (Math.random() - 0.5) * amp
    );
  });

  return (
    <group ref={rootRef}>
      {/* ENGINE BLOCK (crankcase, sump, mounts, oil filter) */}
      <EngineBlock />

      {/* CYLINDER BANK */}
      {cylinders.map((cylinder, index) => (
        <CylinderAssembly
          key={index}
          telemetry={telemetry}
          x={cylinder.x}
          phase={cylinder.phase}
          index={index}
        />
      ))}

      {/* CRANKSHAFT */}
      <Crankshaft telemetry={telemetry} />

      {/* PSRU + PROPELLER */}
      <Propeller telemetry={telemetry} />

      {/* INTAKE + EXHAUST */}
      <IntakeExhaust telemetry={telemetry} cylinderXs={cylinderXs} />

      {/* IGNITION, CHARGING, FUEL, COOLING ACCESSORIES */}
      <AccessorySystems telemetry={telemetry} cylinderXs={cylinderXs} />

      {/* FAULT WARNING BEACON */}
      <FaultBeacon fault={telemetry.fault} />

      {/* SENSOR TAP POINTS */}
      <SensorIndicator
        position={[-2.1, 2.8, 1.05]}
        value={telemetry.cht}
        label="CHT"
        warning={190}
        critical={215}
        onClick={() => onSensorSelect?.("CHT")}
      />

      <SensorIndicator
        position={[2.1, 2.8, 1.05]}
        value={telemetry.egt}
        label="EGT"
        warning={790}
        critical={880}
        onClick={() => onSensorSelect?.("EGT")}
      />

      <SensorIndicator
        position={[0, -2.5, 1.7]}
        value={telemetry.vibration}
        label="VIB"
        warning={3.5}
        critical={5}
        onClick={() => onSensorSelect?.("VIB")}
      />

      <SensorIndicator
        position={[0, -3.3, -1.9]}
        value={telemetry.oilPressure}
        label="OIL"
        warning={35}
        critical={20}
        onClick={() => onSensorSelect?.("OIL_PRESSURE")}
      />
    </group>
  );
}