import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Grid, ContactShadows } from "@react-three/drei";

import EngineTwin from "./EngineTwin";
import { Telemetry } from "../../types";

interface Engine3DProps {
  telemetry: Telemetry;
  onSensorSelect?: (sensor: string) => void;
}

export default function Engine3D({ telemetry, onSensorSelect }: Engine3DProps) {
  return (
    <div className="engine3d-container">
      <Canvas camera={{ position: [10, 6, 13], fov: 42 }} gl={{ antialias: true }}>
        <color attach="background" args={["#071018"]} />

        <ambientLight intensity={1.0} />
        <directionalLight position={[6, 8, 10]} intensity={2.4} castShadow />
        <directionalLight position={[-6, 3, -5]} intensity={1.1} />

        <Environment preset="studio" />

        <EngineTwin telemetry={telemetry} onSensorSelect={onSensorSelect} />

        <ContactShadows position={[0, -4.24, 0]} opacity={0.5} scale={16} blur={2} far={5} />

        <Grid
          args={[20, 20]}
          position={[0, -4.25, 0]}
          cellSize={1}
          cellThickness={0.5}
          sectionSize={5}
          sectionThickness={1}
          fadeDistance={28}
          fadeStrength={1}
        />

        <OrbitControls enableDamping minDistance={7} maxDistance={24} enablePan={false} />
      </Canvas>
    </div>
  );
}