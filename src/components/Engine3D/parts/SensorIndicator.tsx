import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type Props = {
  position: [number, number, number];
  value: number;
  label: string;
  warning: number;
  critical: number;
  onClick?: () => void;
};

export default function SensorIndicator({
  position,
  value,
  label,
  warning,
  critical,
  onClick,
}: Props) {
  const meshRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  let color = "#36d399";
  let state: "ok" | "warn" | "crit" = "ok";

  if (value >= critical) {
    color = "#ff3b30";
    state = "crit";
  } else if (value >= warning) {
    color = "#ffb020";
    state = "warn";
  }

  useFrame((_, delta) => {
    t.current += delta;
    if (meshRef.current && state !== "ok") {
      const speed = state === "crit" ? 8 : 4;
      const pulse = 1 + 0.15 * Math.sin(t.current * speed);
      meshRef.current.scale.setScalar(pulse);
    } else if (meshRef.current) {
      meshRef.current.scale.setScalar(1);
    }
  });

  return (
    <group
      position={position}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.22, 20, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={new THREE.Color(color)}
          emissiveIntensity={1}
          metalness={0.5}
          roughness={0.2}
        />
      </mesh>

      <mesh position={[0, -0.28, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.4, 12]} />
        <meshStandardMaterial color="#8b969e" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}