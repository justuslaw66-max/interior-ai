"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";

export interface ScenePerformanceBridgeProps {
  enabled: boolean;
  onFpsSample: (fps: number) => void;
  onSustainedLowFps: (fps: number) => void;
}

export function ScenePerformanceBridge({
  enabled,
  onFpsSample,
  onSustainedLowFps,
}: ScenePerformanceBridgeProps) {
  const frameCountRef = useRef(0);
  const lastSampleAtRef = useRef<number | null>(null);
  const lowFpsStartedAtRef = useRef<number | null>(null);
  const degradedRef = useRef(false);

  useEffect(() => {
    frameCountRef.current = 0;
    lastSampleAtRef.current = null;
    lowFpsStartedAtRef.current = null;
    degradedRef.current = false;
  }, [enabled]);

  useFrame(() => {
    if (!enabled) return;
    const now = performance.now();
    frameCountRef.current += 1;

    if (lastSampleAtRef.current === null) {
      lastSampleAtRef.current = now;
      return;
    }

    const elapsedMs = now - lastSampleAtRef.current;
    if (elapsedMs < 1000) return;

    const fps = Math.round((frameCountRef.current * 1000) / elapsedMs);
    frameCountRef.current = 0;
    lastSampleAtRef.current = now;
    onFpsSample(fps);

    if (fps >= 28) {
      lowFpsStartedAtRef.current = null;
      return;
    }

    if (lowFpsStartedAtRef.current === null) {
      lowFpsStartedAtRef.current = now;
      return;
    }

    if (!degradedRef.current && now - lowFpsStartedAtRef.current >= 4000) {
      degradedRef.current = true;
      onSustainedLowFps(fps);
    }
  });

  return null;
}
