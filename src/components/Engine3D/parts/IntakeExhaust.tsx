import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Telemetry } from "../../../types";

type Props = {
  telemetry: Telemetry;
  cylinderXs: number[];
};

export default function IntakeExhaust({ telemetry, cylinderXs }: Props) {
  const throttlePlateRef = useRef<THREE.Mesh>(null);
  const muffTipRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (throttlePlateRef.current) {
      const throttleN = THREE.MathUtils.clamp(telemetry.throttle, 0, 1);
      throttlePlateRef.current.rotation.x = THREE.MathUtils.degToRad(throttleN * 65);
    }
    if (muffTipRef.current) {
      const egtN = THREE.MathUtils.clamp((telemetry.egt - 300) / 650, 0, 1);
      const material = muffTipRef.current.material as THREE.MeshStandardMaterial;
      material.emissive.set("#ff5a1f");
      material.emissiveIntensity = egtN * 0.9;
    }
  });

  return (
    <group>
      {/* Intake plenum */}
      <mesh position={[0, 0.6, -1.9]}>
        <boxGeometry args={[3.0, 0.5, 0.7]} />
        <meshStandardMaterial color="#3a444c" metalness={0.7} roughness={0.35} />
      </mesh>

      {/* Throttle body */}
      <group position={[0, 0.6, -2.6]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.35, 0.35, 0.7, 20]} />
          <meshStandardMaterial color="#4a555e" metalness={0.75} roughness={0.3} />
        </mesh>
        {/* Throttle butterfly plate, driven by telemetry.throttle */}
        <mesh ref={throttlePlateRef}>
          <boxGeometry args={[0.6, 0.05, 0.6]} />
          <meshStandardMaterial color="#c3ccd2" metalness={0.9} roughness={0.2} />
        </mesh>
      </group>

      {/* Intake runners to each cylinder */}
      {cylinderXs.map((x) => (
        <mesh
          key={`in-${x}`}
          position={[x * 0.55, 1.5, -1.6]}
          rotation={[1.0, 0, (x < 0 ? 1 : -1) * 0.25]}
        >
          <cylinderGeometry args={[0.16, 0.16, 1.4, 12]} />
          <meshStandardMaterial color="#4a555e" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}

      {/* Exhaust headers from each cylinder, sweeping down/back */}
      {cylinderXs.map((x) => (
        <mesh
          key={`ex-${x}`}
          position={[x * 0.8, 0.3, 1.9]}
          rotation={[1.1, 0, (x < 0 ? -1 : 1) * 0.3]}
        >
          <cylinderGeometry args={[0.14, 0.14, 1.8, 12]} />
          <meshStandardMaterial color="#5a3a2c" metalness={0.65} roughness={0.45} />
        </mesh>
      ))}

      {/* Exhaust collector */}
      <mesh position={[0, -0.6, 2.6]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.3, 0.4, 3.6, 20]} />
        <meshStandardMaterial color="#3a2c22" metalness={0.6} roughness={0.5} />
      </mesh>

      {/* Muffler / tailpipe */}
      <mesh ref={muffTipRef} position={[0, -0.6, 3.9]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.32, 0.32, 0.7, 20]} />
        <meshStandardMaterial color="#2a2e33" emissive="#ff5a1f" emissiveIntensity={0} metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}