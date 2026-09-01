import { forwardRef } from "react";
import * as THREE from "three";

type Props = {
  thermal: number; // 0..1, driven by CHT
};

/**
 * Detailed piston: crown, compression/oil ring belt, skirt, gudgeon pin boss.
 * Ref is applied to the outer group and is moved every frame by CylinderAssembly
 * using the slider-crank kinematics.
 */
const Piston = forwardRef<THREE.Group, Props>(function Piston(
  { thermal },
  ref
) {
  const cool = new THREE.Color("#c3ccd2");
  const hot = new THREE.Color("#ffb14a");
  const crownColor = cool.clone().lerp(hot, thermal);

  return (
    <group ref={ref}>
      {/* Crown */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.82, 0.82, 0.12, 32]} />
        <meshStandardMaterial
          color={crownColor}
          emissive={hot}
          emissiveIntensity={thermal * 0.5}
          metalness={0.85}
          roughness={0.25}
        />
      </mesh>

      {/* Ring belt (3 compression/oil rings) */}
      {[0.1, 0.02, -0.06].map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <cylinderGeometry args={[0.83, 0.83, 0.02, 32]} />
          <meshStandardMaterial color="#e8ecef" metalness={1} roughness={0.15} />
        </mesh>
      ))}

      {/* Skirt */}
      <mesh position={[0, -0.2, 0]}>
        <cylinderGeometry args={[0.78, 0.8, 0.3, 32]} />
        <meshStandardMaterial color="#9aa4ab" metalness={0.9} roughness={0.3} />
      </mesh>

      {/* Gudgeon (wrist) pin boss */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.15, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 1.05, 16]} />
        <meshStandardMaterial color="#7d8992" metalness={0.95} roughness={0.2} />
      </mesh>
    </group>
  );
});

export default Piston;