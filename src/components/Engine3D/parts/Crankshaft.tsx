import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Telemetry } from "../../../types";

type Props = {
  telemetry: Telemetry;
};

export default function Crankshaft({ telemetry }: Props) {
  const ref = useRef<THREE.Group>(null);
  const angle = useRef(0);

  useFrame((_, delta) => {
    const rpm = Math.max(0, telemetry.rpm);
    angle.current += ((rpm * Math.PI * 2) / 60) * delta;

    if (ref.current) {
      ref.current.rotation.z = angle.current;
    }
  });

  const crankPositions = [-2.1, -0.7, 0.7, 2.1];

  return (
    <group ref={ref}>
      {/* Main shaft */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 6.4, 24]} />
        <meshStandardMaterial color="#7d8992" metalness={0.95} roughness={0.2} />
      </mesh>

      {/* Main bearing journals */}
      {[-2.8, -1.4, 0, 1.4, 2.8].map((x) => (
        <mesh key={x} rotation={[Math.PI / 2, 0, 0]} position={[x, 0, 0]}>
          <cylinderGeometry args={[0.26, 0.26, 0.3, 20]} />
          <meshStandardMaterial color="#5f6a71" metalness={0.95} roughness={0.18} />
        </mesh>
      ))}

      {/* Crank throws: web + counterweight + pin, per cylinder */}
      {crankPositions.map((x) => (
        <group key={x} position={[x, 0, 0]}>
          {/* Webs */}
          <mesh>
            <boxGeometry args={[0.3, 1.5, 0.35]} />
            <meshStandardMaterial color="#9da8ae" metalness={0.95} roughness={0.22} />
          </mesh>
          {/* Counterweight (opposite the pin) */}
          <mesh position={[0, -0.55, 0]}>
            <cylinderGeometry args={[0.55, 0.55, 0.32, 16, 1, false, 0, Math.PI]} />
            <meshStandardMaterial color="#8b969e" metalness={0.95} roughness={0.22} />
          </mesh>
          {/* Crank pin (offset journal the con-rod big end rides on) */}
          <mesh position={[0, 0.8, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.24, 0.24, 0.35, 16]} />
            <meshStandardMaterial color="#c3ccd2" metalness={0.95} roughness={0.15} />
          </mesh>
        </group>
      ))}

      {/* Front nose (drives PSRU input gear) */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[-3.35, 0, 0]}>
        <cylinderGeometry args={[0.34, 0.34, 0.3, 24]} />
        <meshStandardMaterial color="#c3ccd2" metalness={0.95} roughness={0.15} />
      </mesh>

      {/* Rear flywheel / starter ring gear */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[3.35, 0, 0]}>
        <cylinderGeometry args={[0.75, 0.75, 0.22, 32]} />
        <meshStandardMaterial color="#3f474d" metalness={0.85} roughness={0.35} />
      </mesh>
    </group>
  );
}