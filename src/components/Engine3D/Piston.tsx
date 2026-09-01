import React from "react";
import Piston from "./Piston";

export default function Cylinder({ position, pistonY }) {
  return (
    <group position={position}>
      {/* Cylinder */}
      <mesh>
        <cylinderGeometry args={[0.52, 0.52, 1.9, 32, 1, true]} />
        <meshStandardMaterial
          color="#374151"
          metalness={0.75}
          roughness={0.3}
          side={2}
        />
      </mesh>

      {/* Cylinder head */}
      <mesh position={[0, 1.02, 0]}>
        <cylinderGeometry args={[0.56, 0.56, 0.18, 32]} />
        <meshStandardMaterial
          color="#9ca3af"
          metalness={0.8}
          roughness={0.25}
        />
      </mesh>

      <Piston position={[0, pistonY, 0]} />
    </group>
  );
}