"use client";

import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import { keepCaptureLightBackground } from "@/lib/canvas-capture";
import { useCanvasPalette } from "@/lib/canvas-colours";

/**
 * The scene's background: `light` in light, its dark colour on a dark device (dark mode PR 4).
 * The scene keeps the light one for exports, which stay light.
 */
export function CanvasBackground({ light }: { light: string }) {
  const { colour } = useCanvasPalette();
  const scene = useThree((state) => state.scene);
  useLayoutEffect(() => keepCaptureLightBackground(scene, light), [light, scene]);
  return <color attach="background" args={[colour(light)]} />;
}
