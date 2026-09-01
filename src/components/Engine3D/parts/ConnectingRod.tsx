import { forwardRef } from "react";
import * as THREE from "three";

/**
 * I-beam connecting rod: big end (crank journal), shank, small end (wrist pin).
 * Ref is the outer group; CylinderAssembly sets position/rotation/scale.y
 * every frame to stretch the shank between piston and crank pin.
 */
const ConnectingRod = forwardRef<THREE.Group>(function ConnectingRod(_, ref) {
  return (
    <group ref={ref}>
      {/* Small end (wrist pin bore) */}
      <mesh position={[0, 0.48, 0]}>
        <torusGeometry args={[0.16, 0.05, 8, 16]} />
        <meshStandardMaterial color="#b7c0c6" metalness={0.9} roughness={0.25} />
      </mesh>

      {/* Shank (I-beam approximated) */}
      <mesh>
        <boxGeometry args={[0.16, 1, 0.28]} />
        <meshStandardMaterial color="#9ca7ae" metalness={0.9} roughness={0.25} />
      </mesh>

      {/* Big end (crank journal bore + cap bolts) */}
      <mesh position={[0, -0.48, 0]}>
        <torusGeometry args={[0.24, 0.07, 8, 16]} />
        <meshStandardMaterial color="#b7c0c6" metalness={0.9} roughness={0.25} />
      </mesh>
      {[-0.14, 0.14].map((x) => (
        <mesh key={x} position={[x, -0.48, 0.18]}>
          <cylinderGeometry args={[0.03, 0.03, 0.14, 8]} />
          <meshStandardMaterial color="#4a5157" metalness={0.9} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
});

export default ConnectingRod;