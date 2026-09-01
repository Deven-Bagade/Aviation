import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Telemetry } from "../../../types";

type Props = {
  telemetry: Telemetry;
  cylinderXs: number[];
};

export default function AccessorySystems({ telemetry, cylinderXs }: Props) {
  const alternatorPulleyRef = useRef<THREE.Mesh>(null);
  const fanRef = useRef<THREE.Group>(null);
  const railRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    const rpm = Math.max(0, telemetry.rpm);
    const spin = ((rpm * 2.6) * Math.PI * 2) / 60;

    if (alternatorPulleyRef.current) {
      alternatorPulleyRef.current.rotation.x += spin * delta;
    }
    if (fanRef.current) {
      fanRef.current.rotation.z += spin * 0.6 * delta;
    }
    if (railRef.current) {
      const flowN = THREE.MathUtils.clamp(telemetry.fuelFlow / 20, 0, 1);
      const material = railRef.current.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = 0.15 + flowN * 0.6;
    }
  });

  const alternatorOk = telemetry.alternatorCurrent > 0.5;

  return (
    <group>
      {/* Alternator, front-lower-right, belt-driven off crank nose */}
      <group position={[-2.7, -1.0, 1.3]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.32, 0.32, 0.7, 20]} />
          <meshStandardMaterial
            color="#2c3439"
            emissive={alternatorOk ? "#2fbf71" : "#000000"}
            emissiveIntensity={alternatorOk ? 0.4 : 0}
            metalness={0.7}
            roughness={0.35}
          />
        </mesh>
        <mesh ref={alternatorPulleyRef} rotation={[0, 0, Math.PI / 2]} position={[0.4, 0, 0]}>
          <cylinderGeometry args={[0.14, 0.14, 0.1, 16]} />
          <meshStandardMaterial color="#151b20" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>

      {/* Starter motor, rear-lower */}
      <mesh position={[2.6, -1.2, -1.1]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.3, 0.3, 0.8, 18]} />
        <meshStandardMaterial color="#242c31" metalness={0.7} roughness={0.4} />
      </mesh>

      {/* CDI / ignition module, top rear */}
      <mesh position={[2.3, 1.0, -1.4]}>
        <boxGeometry args={[0.7, 0.4, 0.3]} />
        <meshStandardMaterial color="#161d22" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* HT leads from ignition module to each spark plug (approximate straight run) */}
      {cylinderXs.map((x) => {
        const from = new THREE.Vector3(2.3, 1.0, -1.4);
        const to = new THREE.Vector3(x, 3.05, -0.3);
        const mid = from.clone().add(to).multiplyScalar(0.5);
        const dir = to.clone().sub(from);
        const len = dir.length();
        const quatFromDir = () => {
          const axis = new THREE.Vector3(0, 1, 0);
          const q = new THREE.Quaternion().setFromUnitVectors(axis, dir.clone().normalize());
          return q;
        };
        return (
          <mesh key={x} position={mid} quaternion={quatFromDir()}>
            <cylinderGeometry args={[0.02, 0.02, len, 6]} />
            <meshStandardMaterial color="#1a1d1f" roughness={0.7} />
          </mesh>
        );
      })}

      {/* Fuel rail on top of engine, glow intensity ~ fuel flow */}
      <mesh ref={railRef} position={[0, 3.1, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, 4.6, 12]} />
        <meshStandardMaterial
          color="#3a4a52"
          emissive="#4fc3ff"
          emissiveIntensity={0.15}
          metalness={0.8}
          roughness={0.3}
        />
      </mesh>
      {cylinderXs.map((x) => (
        <mesh key={`inj-${x}`} position={[x, 2.95, -0.6]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.25, 10]} />
          <meshStandardMaterial color="#8b969e" metalness={0.85} roughness={0.25} />
        </mesh>
      ))}

      {/* Oil cooler radiator + fan, front face */}
      <group position={[0, -0.8, -2.4]}>
        <mesh>
          <boxGeometry args={[1.6, 1.0, 0.15]} />
          <meshStandardMaterial
            color={
              telemetry.oilTemperature > 120
                ? "#c94b2e"
                : telemetry.oilTemperature > 100
                ? "#d99a2b"
                : "#3a444c"
            }
            metalness={0.5}
            roughness={0.5}
          />
        </mesh>
        <group ref={fanRef} position={[0, 0, 0.2]}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
              <boxGeometry args={[0.08, 0.7, 0.03]} />
              <meshStandardMaterial color="#151b20" />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}