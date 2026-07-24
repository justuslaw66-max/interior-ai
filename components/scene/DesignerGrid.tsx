"use client";

import { Grid } from "@react-three/drei";

export type DesignerGridCoverage = "local" | "workspace";

const LOCAL_GRID_FADE_DISTANCE_METERS = 12;
const WORKSPACE_GRID_FADE_DISTANCE_METERS = 200;

export function DesignerGrid({
  visible,
  pulse,
  coverage = "local",
}: {
  visible: boolean;
  pulse?: boolean;
  coverage?: DesignerGridCoverage;
}) {
  if (!visible) return null;

  const cellThickness = pulse ? 0.9 : 0.6;
  const sectionThickness = pulse ? 1.3 : 1.1;
  const fadeStrength = pulse ? 1.35 : 1.0;
  const fadeDistance =
    coverage === "workspace"
      ? WORKSPACE_GRID_FADE_DISTANCE_METERS
      : LOCAL_GRID_FADE_DISTANCE_METERS;

  return (
    <Grid
      infiniteGrid
      fadeDistance={fadeDistance}
      fadeStrength={fadeStrength}
      cellSize={0.5}
      cellThickness={cellThickness}
      sectionSize={2.5}
      sectionThickness={sectionThickness}
      position={[0, 0.001, 0]}
      cellColor="#2f3442"
      sectionColor="#3b4252"
    />
  );
}
