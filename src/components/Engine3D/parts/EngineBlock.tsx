export default function EngineBlock() {
  const ribXs = [-2.6, -1.5, -0.2, 0.9, 2.0];

  return (
    <group>
      {/* Upper crankcase half */}
      <mesh position={[0, -1.5, 0]}>
        <boxGeometry args={[5.8, 3.2, 3.2]} />
        <meshStandardMaterial color="#26313a" metalness={0.8} roughness={0.32} />
      </mesh>

      {/* Case split line */}
      <mesh position={[0, -1.5, 0]}>
        <boxGeometry args={[5.85, 0.05, 3.25]} />
        <meshStandardMaterial color="#0d1216" metalness={0.5} roughness={0.6} />
      </mesh>

      {/* Crankcase ribbing */}
      {ribXs.map((x) => (
        <mesh key={x} position={[x, -1.5, 1.62]}>
          <boxGeometry args={[0.18, 3.0, 0.08]} />
          <meshStandardMaterial color="#1e262c" metalness={0.75} roughness={0.4} />
        </mesh>
      ))}

      {/* Lower crankcase */}
      <mesh position={[0, -3.0, 0]}>
        <boxGeometry args={[5.2, 1.0, 2.8]} />
        <meshStandardMaterial color="#1b242b" metalness={0.75} roughness={0.38} />
      </mesh>

      {/* Oil sump */}
      <mesh position={[0, -3.75, 0]}>
        <boxGeometry args={[3.2, 0.5, 2.2]} />
        <meshStandardMaterial color="#161d22" metalness={0.7} roughness={0.4} />
      </mesh>

      {/* Sump drain plug */}
      <mesh position={[0, -4.02, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 12]} />
        <meshStandardMaterial color="#8b969e" metalness={0.9} roughness={0.25} />
      </mesh>

      {/* Mounting plate */}
      <mesh position={[0, -4.15, 0]}>
        <boxGeometry args={[7.0, 0.35, 4.0]} />
        <meshStandardMaterial color="#151c21" metalness={0.8} roughness={0.4} />
      </mesh>

      {/* Engine mount lugs (4 corners) */}
      {[
        [-3.1, -0.2, 1.5],
        [3.1, -0.2, 1.5],
        [-3.1, -0.2, -1.5],
        [3.1, -0.2, -1.5],
      ].map((p, i) => (
        <group key={i} position={p as [number, number, number]}>
          <mesh>
            <boxGeometry args={[0.4, 0.9, 0.4]} />
            <meshStandardMaterial color="#20282e" metalness={0.75} roughness={0.4} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.14, 0.03, 8, 16]} />
            <meshStandardMaterial color="#8b969e" metalness={0.9} roughness={0.25} />
          </mesh>
        </group>
      ))}

      {/* Oil filter canister (right side) */}
      <mesh position={[3.15, -1.9, 0.9]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.3, 0.3, 0.9, 20]} />
        <meshStandardMaterial color="#7a3b2a" metalness={0.6} roughness={0.35} />
      </mesh>
    </group>
  );
}