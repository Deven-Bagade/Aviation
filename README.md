# UAV Aero Piston Engine Digital Twin — Windows MVP

A Windows-first desktop prototype for SIH26054:
- Real-time engine telemetry
- 3D engine digital-twin visualization
- Live gauges and trends
- Engine Health Index (EHI)
- Rule-based fault/anomaly indicators
- Simulated telemetry for demonstration
- WebSocket architecture ready for real ECU/CAN/telemetry adapters

## Architecture

Electron + React + TypeScript
        |
        +-- Three.js 3D digital twin
        |
        +-- Telemetry WebSocket client
                    |
                    +-- Node telemetry server
                          |
                          +-- Simulator (current MVP)
                          +-- Future CAN/ECU/FADEC adapter

## Requirements

- Windows 10/11
- Node.js 20+
- npm 10+

## Run

```powershell
npm install
npm run dev
```

The app opens as a Windows desktop application.

## Production build

```powershell
npm run build
npm run dist
```

The installer is generated under `release/`.

## Real engine data

The MVP intentionally starts with simulated telemetry so it can run without an engine.

Replace `electron/telemetry-simulator.js` with an adapter that receives your actual telemetry and sends the same JSON schema over WebSocket.

Important: SocketCAN is primarily a Linux interface. On Windows, use the CAN vendor/USB interface SDK (for example PEAK PCAN, Kvaser, Vector, or another approved interface) and translate frames into the application's normalized telemetry schema.

## 3D model

Put a real engine model exported as glTF/GLB at:

`public/models/engine.glb`

If it is absent, the app renders a procedural engine placeholder so the application still runs.

For a serious digital-twin demonstration, export the CAD assembly to `.glb` and use named components such as:
- Engine
- Cylinder_01 ... Cylinder_04
- Crankshaft
- Propeller
- Oil_System
- Fuel_System

The current viewer rotates/animates the engine based on RPM and changes component status from live telemetry.

## Telemetry schema

Example:

```json
{
  "timestamp": 1756650000000,
  "rpm": 2450,
  "cht": 168,
  "egt": 690,
  "oilPressure": 4.2,
  "oilTemperature": 94,
  "fuelFlow": 18.5,
  "vibration": 1.8,
  "batteryVoltage": 27.8,
  "alternatorCurrent": 31,
  "injectionTiming": 24,
  "ambientTemperature": 32,
  "altitude": 2500,
  "throttle": 0.72
}
```

This is a software demonstrator, not a flight-certified monitoring system. Thresholds in the prototype are illustrative and must be replaced by validated engine-specific limits and maps before operational use.
