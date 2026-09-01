import React from "react";

export default function Crankshaft({ rotation }) {
  return (
    <group rotation={[0, rotation, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.18, 0.18, 4.8, 32]} />
        <meshStandardMaterial
          color="#71717a"
          metalness={0.95}
          roughness={0.18}
        />
      </mesh>

      {[-1.8, -0.9, 0, 0.9, 1.8].map((x, i) => (
        <mesh key={i} position={[x, 0, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.22, 32]} />
          <meshStandardMaterial
            color="#52525b"
            metalness={0.9}
            roughness={0.2}
          />
        </mesh>
      ))}
    </group>
  );
}