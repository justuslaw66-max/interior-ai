"use client";

import { Grid } from "@react-three/drei";

export function DesignerGrid({
  visible,
  pulse,
}: {
  visible: boolean;
  pulse?: boolean;
}) {
  if (!visible) return null;

  const cellThickness = pulse ? 0.9 : 0.6;
  const sectionThickness = pulse ? 1.3 : 1.1;
  const fadeStrength = pulse ? 1.35 : 1.0;

  return (
    <Grid
      infiniteGrid
      fadeDistance={12}
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
