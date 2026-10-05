"use client";

import { useState, type ComponentProps } from "react";
import { Line } from "@react-three/drei/core/Line";
import { sameLinePoints } from "./sameLinePoints";

type LineProps = ComponentProps<typeof Line>;

/**
 * drei's `Line`, keeping its geometry while the points stay the same. drei
 * rebuilds a Line's geometry whenever `points` is a new array, and plan lines
 * are mostly built inline, so every re-render (a click, a selection) rebuilt
 * and re-uploaded them.
 */
export function StableLine(props: LineProps) {
  const [points, setPoints] = useState(props.points);
  const unchanged = sameLinePoints(points, props.points);
  // Adopting new points during render, React's pattern for state that follows a prop.
  if (!unchanged) setPoints(props.points);
  return <Line {...props} points={unchanged ? points : props.points} />;
}
