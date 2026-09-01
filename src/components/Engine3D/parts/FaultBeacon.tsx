import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FaultType } from "../../../types";

type Props = {
  fault: FaultType;
};

const FAULT_COLORS: Record<string, string> = {
  HIGH_TEMP: "#ff3b30",
  LOW_OIL: "#ffb020",
  HIGH_VIBRATION: "#ff8a00",
  ELECTRICAL: "#4fc3ff",
  FUEL_SYSTEM: "#ffd23f",
  ABNORMAL_RPM: "#ff8a00",
  COOLING_FAULT: "#ff5a1f",
  INJECTOR_FAULT: "#ff6b3d",
  SENSOR_FAULT: "#9d5cff"
};

export default function FaultBeacon({ fault }: Props) {
  const lightRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (lightRef.current) {
      const material = lightRef.current.material as THREE.MeshStandardMaterial;
      if (fault) {
        const pulse = 0.5 + 0.5 * Math.sin(t.current * 10);
        material.emissiveIntensity = 1.5 + pulse * 2;
      } else {
        material.emissiveIntensity = 0;
      }
    }
  });

  if (!fault) return null;

  const color = FAULT_COLORS[fault] ?? "#ff3b30";

  return (
    <mesh ref={lightRef} position={[0, 3.6, 0]}>
      <sphereGeometry args={[0.18, 16, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
    </mesh>
  );
}