"use client";

import { addAfterEffect, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";

import type { SceneRendererMetrics } from "@/lib/scene-performance-metrics";
import { SceneActiveFpsSampler } from "@/lib/scene-active-fps-sampler";

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
  const samplerRef = useRef(new SceneActiveFpsSampler());
  const get = useThree((state) => state.get);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const sampler = samplerRef.current;
    const reset = () => {
      sampler.reset();
      gl.domElement.removeAttribute("data-measured-fps");
    };
    reset();
    // R3F decrements this root's pending frame count after rendering. Looking
    // here includes invalidations from every frame subscriber and the renderer.
    const unsubscribe = addAfterEffect(() => {
      const state = get();
      if (state.frameloop === "demand" && state.internal.frames === 0) {
        reset();
      }
    });
    document.addEventListener("visibilitychange", reset);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", reset);
      reset();
    };
  }, [enabled, get, gl, scene]);

  useFrame(({ gl }) => {
    const sampler = samplerRef.current;
    const fps = sampler.recordFrame(performance.now());
    if (fps === null) return;
    gl.domElement.dataset.measuredFps = String(fps);
    gl.domElement.dataset.rendererDrawCalls = String(gl.info.render.calls);
    gl.domElement.dataset.rendererTriangles = String(gl.info.render.triangles);
    gl.domElement.dataset.rendererGeometries = String(gl.info.memory.geometries);
    gl.domElement.dataset.rendererTextures = String(gl.info.memory.textures);

    if (!enabled) {
      return;
    }
    onFpsSample(fps);
    onRendererSample({
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    });

    if (sampler.degraded) onSustainedLowFps(fps);
  });

  return null;
}
