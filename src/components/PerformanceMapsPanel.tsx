import React, { useMemo, useState } from "react";
import {
  generatePerformanceMaps,
  getPerformanceMapSummary,
} from "../simulation/performanceMaps";

type MapType =
  | "power"
  | "torque"
  | "fuel"
  | "bsfc"
  | "altitude"
  | "egt";

interface MapPoint {
  x: number;
  y: number;
}

interface ChartMap {
  name?: string;
  title?: string;
  xLabel?: string;
  yLabel?: string;
  unit?: string;
  points: MapPoint[];
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null
  );
}

function numberFrom(
  value: unknown,
  keys: string[]
): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of keys) {
    const candidate = Number(value[key]);

    if (Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Converts the project's PerformancePoint into the small
 * chart representation used by this component.
 *
 * We deliberately do this at the boundary instead of casting
 * PerformancePoint to an unrelated {x, y} type.
 */
function toChartPoint(
  point: unknown,
  index: number
): MapPoint | null {
  const x = numberFrom(point, [
    "x",
    "rpm",
    "altitude",
    "altitudeM",
    "load",
    "loadFraction",
    "throttle",
  ]);

  const y = numberFrom(point, [
    "y",
    "value",
    "powerKW",
    "brakePowerKW",
    "power",
    "torqueNm",
    "torque",
    "fuelFlowLph",
    "fuelFlow",
    "bsfc",
    "egtC",
    "egt",
    "temperatureC",
    "temperature",
  ]);

  if (
    x === undefined ||
    y === undefined
  ) {
    console.warn(
      `Performance map point ${index} could not be converted.`,
      point
    );

    return null;
  }

  return { x, y };
}

function toChartMap(
  value: unknown
): ChartMap | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const rawPoints =
    Array.isArray(value.points)
      ? value.points
      : Array.isArray(value.data)
        ? value.data
        : Array.isArray(value.series)
          ? value.series
          : [];

  const points = rawPoints
    .map(toChartPoint)
    .filter(
      (point): point is MapPoint =>
        point !== null
    );

  return {
    name:
      typeof value.name === "string"
        ? value.name
        : undefined,

    title:
      typeof value.title === "string"
        ? value.title
        : undefined,

    xLabel:
      typeof value.xLabel === "string"
        ? value.xLabel
        : undefined,

    yLabel:
      typeof value.yLabel === "string"
        ? value.yLabel
        : undefined,

    unit:
      typeof value.unit === "string"
        ? value.unit
        : undefined,

    points,
  };
}

function getMap(
  maps: unknown,
  keys: string[]
): ChartMap | undefined {
  if (!isRecord(maps)) {
    return undefined;
  }

  for (const key of keys) {
    const map = toChartMap(maps[key]);

    if (map) {
      return map;
    }
  }

  return undefined;
}

function getSummaryPoint(
  summary: unknown,
  key: string
): unknown {
  if (!isRecord(summary)) {
    return undefined;
  }

  return summary[key];
}

function formatSummaryPoint(
  point: unknown
): string {
  if (!isRecord(point)) {
    return "--";
  }

  const value = numberFrom(point, [
    "value",
    "y",
    "powerKW",
    "power",
    "torqueNm",
    "torque",
    "bsfc",
  ]);

  const rpm = numberFrom(point, [
    "rpm",
    "x",
  ]);

  if (
    value !== undefined &&
    rpm !== undefined
  ) {
    return `${value.toFixed(1)} @ ${rpm.toFixed(0)}`;
  }

  if (value !== undefined) {
    return value.toFixed(1);
  }

  if (rpm !== undefined) {
    return rpm.toFixed(0);
  }

  return "--";
}

function formatValue(
  value: number,
  digits = 1
): string {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return value.toFixed(digits);
}

function getMapTitle(
  map: ChartMap | undefined,
  fallback: string
): string {
  return (
    map?.title ||
    map?.name ||
    fallback
  );
}

function getMapXLabel(
  map: ChartMap | undefined,
  fallback: string
): string {
  return map?.xLabel || fallback;
}

function getMapYLabel(
  map: ChartMap | undefined,
  fallback: string
): string {
  return map?.yLabel || fallback;
}

function getMapUnit(
  map: ChartMap | undefined,
  fallback: string
): string {
  return map?.unit || fallback;
}

function getBounds(points: MapPoint[]) {
  if (points.length === 0) {
    return {
      minX: 0,
      maxX: 1,
      minY: 0,
      maxY: 1,
    };
  }

  const xs = points.map(
    (point) => point.x
  );

  const ys = points.map(
    (point) => point.y
  );

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function buildPath(
  points: MapPoint[],
  width: number,
  height: number,
  padding: number
): string {
  if (points.length === 0) {
    return "";
  }

  const bounds =
    getBounds(points);

  const rangeX = Math.max(
    bounds.maxX - bounds.minX,
    1
  );

  const rangeY = Math.max(
    bounds.maxY - bounds.minY,
    1
  );

  return points
    .map((point, index) => {
      const x =
        padding +
        ((point.x - bounds.minX) /
          rangeX) *
          (width - padding * 2);

      const y =
        height -
        padding -
        ((point.y - bounds.minY) /
          rangeY) *
          (height - padding * 2);

      return `${
        index === 0 ? "M" : "L"
      } ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

const PerformanceMapsPanel: React.FC =
  () => {
    const [activeMap, setActiveMap] =
      useState<MapType>("power");

    const maps = useMemo(
      () => generatePerformanceMaps(),
      []
    );

    const summary = useMemo(
      () => getPerformanceMapSummary(maps),
      [maps]
    );

    const mapDefinitions: Record<
      MapType,
      {
        label: string;
        description: string;
        map?: ChartMap;
        xFallback: string;
        yFallback: string;
        unitFallback: string;
      }
    > = {
      power: {
        label: "RPM / Power",
        description:
          "Brake power available across the operating RPM range.",
        map: getMap(maps, [
          "rpmPower",
          "power",
        ]),
        xFallback: "RPM",
        yFallback: "Brake Power",
        unitFallback: "kW",
      },

      torque: {
        label: "RPM / Torque",
        description:
          "Engine brake torque generated across RPM.",
        map: getMap(maps, [
          "rpmTorque",
          "torque",
        ]),
        xFallback: "RPM",
        yFallback: "Torque",
        unitFallback: "N·m",
      },

      fuel: {
        label: "RPM / Fuel Flow",
        description:
          "Predicted fuel consumption across the RPM range.",
        map: getMap(maps, [
          "rpmFuelFlow",
          "fuelFlow",
        ]),
        xFallback: "RPM",
        yFallback: "Fuel Flow",
        unitFallback: "L/h",
      },

      bsfc: {
        label: "RPM / BSFC",
        description:
          "Brake-specific fuel consumption across RPM.",
        /*
         * Do not use maps.rpmBSFC here.
         * The current PerformanceMaps type does not expose
         * that property. Resolve the runtime map through the
         * supported keys instead.
         */
        map: getMap(maps, [
          "rpmBsfc",
          "rpmBSFC",
          "bsfc",
          "rpmFuelEfficiency",
        ]),
        xFallback: "RPM",
        yFallback: "BSFC",
        unitFallback: "g/kWh",
      },

      altitude: {
        label: "Altitude / Power",
        description:
          "Power availability as atmospheric density decreases with altitude.",
        map: getMap(maps, [
          "altitudePower",
          "altitude",
        ]),
        xFallback: "Altitude",
        yFallback: "Brake Power",
        unitFallback: "kW",
      },

      egt: {
        label: "Load / EGT",
        description:
          "Exhaust-gas temperature response to engine load.",
        map: getMap(maps, [
          "loadEGT",
          "egt",
        ]),
        xFallback: "Load",
        yFallback: "EGT",
        unitFallback: "°C",
      },
    };

    const definition =
      mapDefinitions[activeMap];

    const points =
      definition.map?.points ?? [];

    const bounds =
      getBounds(points);

    const width = 720;
    const height = 330;
    const padding = 48;

    const path = buildPath(
      points,
      width,
      height,
      padding
    );

    const minValue =
      points.length > 0
        ? Math.min(
            ...points.map(
              (point) => point.y
            )
          )
        : undefined;

    const maxValue =
      points.length > 0
        ? Math.max(
            ...points.map(
              (point) => point.y
            )
          )
        : undefined;

    return (
      <section className="performance-maps-panel">
        <div className="panel-header">
          <div>
            <h2>
              Engine Performance Maps
            </h2>

            <p>
              Physics-derived engine
              performance across RPM, load,
              fuel consumption and altitude.
            </p>
          </div>
        </div>

        <div className="performance-map-tabs">
          {(
            Object.keys(
              mapDefinitions
            ) as MapType[]
          ).map((type) => (
            <button
              key={type}
              type="button"
              className={
                activeMap === type
                  ? "performance-map-tab active"
                  : "performance-map-tab"
              }
              onClick={() =>
                setActiveMap(type)
              }
            >
              {mapDefinitions[type].label}
            </button>
          ))}
        </div>

        <div className="performance-map-layout">
          <div className="performance-chart-card">
            <div className="performance-chart-header">
              <div>
                <h3>
                  {getMapTitle(
                    definition.map,
                    definition.label
                  )}
                </h3>

                <p>
                  {definition.description}
                </p>
              </div>

              <div className="performance-chart-stat">
                <span>Range</span>

                <strong>
                  {formatValue(
                    minValue ?? 0
                  )}{" "}
                  –{" "}
                  {formatValue(
                    maxValue ?? 0
                  )}
                </strong>
              </div>
            </div>

            <div className="performance-chart">
              {points.length > 0 ? (
                <svg
                  viewBox={`0 0 ${width} ${height}`}
                  role="img"
                  aria-label={
                    definition.label
                  }
                  className="performance-svg"
                >
                  {[0, 1, 2, 3, 4].map(
                    (index) => {
                      const y =
                        padding +
                        (index / 4) *
                          (height -
                            padding * 2);

                      return (
                        <line
                          key={`h-${index}`}
                          x1={padding}
                          x2={
                            width - padding
                          }
                          y1={y}
                          y2={y}
                          className="chart-grid-line"
                        />
                      );
                    }
                  )}

                  {[0, 1, 2, 3, 4].map(
                    (index) => {
                      const x =
                        padding +
                        (index / 4) *
                          (width -
                            padding * 2);

                      return (
                        <line
                          key={`v-${index}`}
                          x1={x}
                          x2={x}
                          y1={padding}
                          y2={
                            height - padding
                          }
                          className="chart-grid-line"
                        />
                      );
                    }
                  )}

                  <line
                    x1={padding}
                    x2={padding}
                    y1={padding}
                    y2={
                      height - padding
                    }
                    className="chart-axis"
                  />

                  <line
                    x1={padding}
                    x2={
                      width - padding
                    }
                    y1={
                      height - padding
                    }
                    y2={
                      height - padding
                    }
                    className="chart-axis"
                  />

                  <path
                    d={path}
                    fill="none"
                    className="performance-curve"
                  />

                  {points.map(
                    (point, index) => {
                      const rangeX =
                        Math.max(
                          bounds.maxX -
                            bounds.minX,
                          1
                        );

                      const rangeY =
                        Math.max(
                          bounds.maxY -
                            bounds.minY,
                          1
                        );

                      const x =
                        padding +
                        ((point.x -
                          bounds.minX) /
                          rangeX) *
                          (width -
                            padding * 2);

                      const y =
                        height -
                        padding -
                        ((point.y -
                          bounds.minY) /
                          rangeY) *
                          (height -
                            padding * 2);

                      return (
                        <circle
                          key={`${point.x}-${point.y}-${index}`}
                          cx={x}
                          cy={y}
                          r={2.5}
                          className="performance-point"
                        />
                      );
                    }
                  )}

                  <text
                    x={padding}
                    y={height - 14}
                    className="chart-label"
                  >
                    {formatValue(
                      bounds.minX,
                      0
                    )}
                  </text>

                  <text
                    x={width - padding}
                    y={height - 14}
                    textAnchor="end"
                    className="chart-label"
                  >
                    {formatValue(
                      bounds.maxX,
                      0
                    )}
                  </text>

                  <text
                    x={padding - 8}
                    y={
                      height -
                      padding +
                      4
                    }
                    textAnchor="end"
                    className="chart-label"
                  >
                    {formatValue(
                      bounds.minY
                    )}
                  </text>

                  <text
                    x={padding - 8}
                    y={padding + 4}
                    textAnchor="end"
                    className="chart-label"
                  >
                    {formatValue(
                      bounds.maxY
                    )}
                  </text>

                  <text
                    x={width / 2}
                    y={height - 2}
                    textAnchor="middle"
                    className="chart-axis-title"
                  >
                    {getMapXLabel(
                      definition.map,
                      definition.xFallback
                    )}
                  </text>

                  <text
                    x={16}
                    y={height / 2}
                    textAnchor="middle"
                    transform={`rotate(-90 16 ${
                      height / 2
                    })`}
                    className="chart-axis-title"
                  >
                    {getMapYLabel(
                      definition.map,
                      definition.yFallback
                    )}
                  </text>
                </svg>
              ) : (
                <div className="empty-state">
                  No performance-map data
                  available.
                </div>
              )}
            </div>

            <div className="performance-chart-footer">
              <span>
                X:{" "}
                {getMapXLabel(
                  definition.map,
                  definition.xFallback
                )}
              </span>

              <span>
                Y:{" "}
                {getMapYLabel(
                  definition.map,
                  definition.yFallback
                )}
              </span>

              <span>
                Unit:{" "}
                {getMapUnit(
                  definition.map,
                  definition.unitFallback
                )}
              </span>

              <span>
                Points: {points.length}
              </span>
            </div>
          </div>

          <aside className="performance-summary-card">
            <h3>Model Summary</h3>

            <div className="performance-summary-list">
              <div>
                <span>Peak Power</span>

                <strong>
                  {formatSummaryPoint(
                    getSummaryPoint(
                      summary,
                      "peakPower"
                    )
                  )}
                </strong>
              </div>

              <div>
                <span>Peak Torque</span>

                <strong>
                  {formatSummaryPoint(
                    getSummaryPoint(
                      summary,
                      "peakTorque"
                    )
                  )}
                </strong>
              </div>

              <div>
                <span>Best BSFC</span>

                <strong>
                  {formatSummaryPoint(
                    getSummaryPoint(
                      summary,
                      "bestBsfc"
                    )
                  )}
                </strong>
              </div>
            </div>

            <div className="performance-model-note">
              <strong>
                Physics consistency
              </strong>

              <p>
                Performance maps are
                generated from the same
                engine performance model used
                by the digital twin simulation.
              </p>
            </div>
          </aside>
        </div>
      </section>
    );
  };

export default PerformanceMapsPanel;
