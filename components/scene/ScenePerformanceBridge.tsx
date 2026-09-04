"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";

import type { SceneRendererMetrics } from "@/lib/scene-performance-metrics";

export interface ScenePerformanceBridgeProps {
  enabled: boolean;
  onFpsSample: (fps: number) => void;
  onRendererSample: (metrics: SceneRendererMetrics) => void;
  onSustainedLowFps: (fps: number) => void;
}

export function ScenePerformanceBridge({
  enabled,
  onFpsSample,
  onRendererSample,
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

  useFrame(({ gl }) => {
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
    gl.domElement.dataset.measuredFps = String(fps);
    gl.domElement.dataset.rendererDrawCalls = String(gl.info.render.calls);
    gl.domElement.dataset.rendererTriangles = String(gl.info.render.triangles);
    gl.domElement.dataset.rendererGeometries = String(gl.info.memory.geometries);
    gl.domElement.dataset.rendererTextures = String(gl.info.memory.textures);

    if (!enabled) {
      lowFpsStartedAtRef.current = null;
      return;
    }
    onFpsSample(fps);
    onRendererSample({
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    });

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
