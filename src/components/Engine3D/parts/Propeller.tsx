import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Telemetry } from "../../../types";

type Props = {
  telemetry: Telemetry;
};

function Blade({ rotation }: { rotation: number }) {
  // Tapered, twisted blade approximated with 4 segments
  const segments = [
    { y: 0.4, w: 0.55, twist: 0.05 },
    { y: 1.4, w: 0.42, twist: 0.15 },
    { y: 2.4, w: 0.3, twist: 0.28 },
    { y: 3.3, w: 0.16, twist: 0.42 },
  ];

  return (
    <group rotation={[0, 0, rotation]}>
      {segments.map((s, i) => (
        <mesh key={i} position={[0, s.y, 0]} rotation={[s.twist, 0, 0]}>
          <boxGeometry args={[0.14, 1.05, s.w]} />
          <meshStandardMaterial color="#151b20" metalness={0.75} roughness={0.28} />
        </mesh>
      ))}
    </group>
  );
}

export default function Propeller({ telemetry }: Props) {
  const ref = useRef<THREE.Group>(null);
  const discRef = useRef<THREE.Mesh>(null);
  const angle = useRef(0);

  useFrame((_, delta) => {
    const rpm = Math.max(0, telemetry.rpm);
    angle.current += ((rpm * Math.PI * 2) / 60) * delta;

    if (ref.current) {
      ref.current.rotation.z = angle.current;
    }

    if (discRef.current) {
      const material = discRef.current.material as THREE.MeshBasicMaterial;
      // Motion-blur disc fades in above ~2500 rpm
      material.opacity = THREE.MathUtils.clamp((rpm - 2500) / 3000, 0, 0.22);
    }
  });

  return (
    <group>
      {/* PSRU (gearbox) housing — fixed, does not rotate */}
      <mesh position={[-3.6, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.7, 0.85, 1.1, 24]} />
        <meshStandardMaterial color="#20282e" metalness={0.8} roughness={0.32} />
      </mesh>

      {/* Rotating assembly: spinner + blades */}
      <group ref={ref} position={[-4.2, 0, 0]} rotation={[0, 0, 0]}>
        <group rotation={[0, Math.PI / 2, 0]}>
          {/* Spinner cone */}
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.35]}>
            <coneGeometry args={[0.4, 0.6, 24]} />
            <meshStandardMaterial color="#c5ccd1" metalness={1} roughness={0.15} />
          </mesh>

          {/* Hub */}
          <mesh>
            <cylinderGeometry args={[0.35, 0.35, 0.3, 24]} />
            <meshStandardMaterial color="#8b969e" metalness={0.95} roughness={0.2} />
          </mesh>

          <Blade rotation={0} />
          <Blade rotation={Math.PI} />
        </group>

        {/* Motion-blur disc for high-RPM readability */}
        <mesh ref={discRef} rotation={[0, Math.PI / 2, 0]}>
          <circleGeometry args={[3.5, 32]} />
          <meshBasicMaterial color="#111417" transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}