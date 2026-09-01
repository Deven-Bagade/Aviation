import React from "react";

export default function Propeller({ rotation }) {
  return (
    <group position={[3.0, 0, 0]} rotation={[rotation, 0, 0]}>
      <mesh>
        <boxGeometry args={[0.18, 4.5, 0.28]} />
        <meshStandardMaterial
          color="#111827"
          metalness={0.65}
          roughness={0.25}
        />
      </mesh>

      <mesh rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.18, 4.5, 0.28]} />
        <meshStandardMaterial
          color="#111827"
          metalness={0.65}
          roughness={0.25}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[0.35, 32, 32]} />
        <meshStandardMaterial
          color="#d1d5db"
          metalness={0.9}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
}