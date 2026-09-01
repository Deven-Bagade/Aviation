import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Telemetry } from "../../../types";
import Piston from "./Piston";
import ConnectingRod from "./ConnectingRod";

type Props = {
  telemetry: Telemetry;
  x: number;
  phase: number;
  index: number;
};

const CRANK_RADIUS = 0.8;
const ROD_LENGTH = 2.5;

export default function CylinderAssembly({ telemetry, x, phase, index }: Props) {
  const pistonRef = useRef<THREE.Group>(null);
  const rodRef = useRef<THREE.Group>(null);
  const barrelRef = useRef<THREE.Mesh>(null);
  const exhaustPortRef = useRef<THREE.Mesh>(null);
  const sparkRef = useRef<THREE.Mesh>(null);

  const angle = useRef(phase);
  const thermalRef = useRef(0);

  useFrame((_, delta) => {
    const rpm = Math.max(0, telemetry.rpm);
    const angularVelocity = (rpm * Math.PI * 2) / 60;
    angle.current += angularVelocity * delta;

    const theta = angle.current;
    const crankX = CRANK_RADIUS * Math.cos(theta);
    const crankY = CRANK_RADIUS * Math.sin(theta);
    const pistonY =
      crankY + Math.sqrt(Math.max(0, ROD_LENGTH ** 2 - crankX ** 2)) - 2.7;

    if (pistonRef.current) {
      pistonRef.current.position.set(x, pistonY, 0);
    }

    if (rodRef.current) {
      const piston = new THREE.Vector3(x, pistonY, 0);
      const crank = new THREE.Vector3(x + crankX, crankY - 1.8, 0);
      const midpoint = new THREE.Vector3().addVectors(piston, crank).multiplyScalar(0.5);
      const direction = new THREE.Vector3().subVectors(piston, crank);
      const length = direction.length();
      direction.normalize();

      rodRef.current.position.copy(midpoint);
      rodRef.current.scale.set(1, length, 1);
      rodRef.current.rotation.z = Math.atan2(direction.x, direction.y);
    }

    // CHT -> barrel/head thermal tint
    const thermal = THREE.MathUtils.clamp((telemetry.cht - 80) / 150, 0, 1);
    thermalRef.current = thermal;

    if (barrelRef.current) {
      const material = barrelRef.current.material as THREE.MeshStandardMaterial;
      const cool = new THREE.Color("#59636c");
      const hot = new THREE.Color("#d94a21");
      material.color.copy(cool).lerp(hot, thermal);
      material.emissive.copy(hot);
      material.emissiveIntensity = thermal * 0.3;
    }

    // EGT -> exhaust port glow
    if (exhaustPortRef.current) {
      const egtN = THREE.MathUtils.clamp((telemetry.egt - 300) / 650, 0, 1);
      const material = exhaustPortRef.current.material as THREE.MeshStandardMaterial;
      material.emissive.set("#ff5a1f");
      material.emissiveIntensity = egtN * 1.4;
    }

    // Spark plug flash synced to crank phase (approximate firing event, once per rev)
    if (sparkRef.current) {
      const firing = Math.sin(theta) > 0.985 && telemetry.engineState === "RUNNING";
      const material = sparkRef.current.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = firing ? 3 : 0.1;
    }
  });

  // Cooling fins along the barrel (air-cooled aero engine signature look)
  const fins = Array.from({ length: 7 }, (_, i) => -0.35 + i * 0.24);

  return (
    <group>
      {/* Barrel core */}
      <mesh ref={barrelRef} position={[x, 0.9, 0]}>
        <cylinderGeometry args={[0.9, 0.9, 2.6, 32]} />
        <meshStandardMaterial color="#59636c" metalness={0.85} roughness={0.3} />
      </mesh>

      {/* Cooling fins */}
      {fins.map((y, i) => (
        <mesh key={i} position={[x, 0.9 + y, 0]}>
          <cylinderGeometry args={[1.18, 1.18, 0.05, 32]} />
          <meshStandardMaterial color="#3c454c" metalness={0.6} roughness={0.5} />
        </mesh>
      ))}

      {/* Cylinder head */}
      <mesh position={[x, 2.45, 0]}>
        <cylinderGeometry args={[1.02, 1.02, 0.5, 32]} />
        <meshStandardMaterial color="#303a43" metalness={0.85} roughness={0.28} />
      </mesh>

      {/* Valve cover (rocker box) */}
      <mesh position={[x, 2.85, 0]}>
        <boxGeometry args={[1.0, 0.35, 1.0]} />
        <meshStandardMaterial color="#26313a" metalness={0.7} roughness={0.35} />
      </mesh>

      {/* Pushrod tubes (OHV valvetrain, both sides) */}
      {[-0.55, 0.55].map((dz) => (
        <mesh key={dz} position={[x, 1.9, dz]}>
          <cylinderGeometry args={[0.06, 0.06, 1.7, 12]} />
          <meshStandardMaterial color="#8b969e" metalness={0.85} roughness={0.3} />
        </mesh>
      ))}

      {/* Spark plug */}
      <mesh ref={sparkRef} position={[x, 3.05, -0.3]} rotation={[0.3, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.3, 10]} />
        <meshStandardMaterial
          color="#d8dde0"
          emissive="#7fd8ff"
          emissiveIntensity={0.1}
          metalness={0.6}
          roughness={0.2}
        />
      </mesh>

      {/* Intake port stub (faces engine centerline) */}
      <mesh
        position={[x, 2.45, x < 0 ? -1.25 : -1.25]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.22, 0.26, 0.6, 16]} />
        <meshStandardMaterial color="#4a555e" metalness={0.7} roughness={0.4} />
      </mesh>

      {/* Exhaust port stub (faces outward/down) */}
      <mesh ref={exhaustPortRef} position={[x, 1.9, 1.25]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.24, 0.6, 16]} />
        <meshStandardMaterial color="#4a3126" metalness={0.6} roughness={0.5} />
      </mesh>

      {/* Piston */}
      <Piston ref={pistonRef} thermal={thermalRef.current} />

      {/* Connecting rod */}
      <ConnectingRod ref={rodRef} />
    </group>
  );
}