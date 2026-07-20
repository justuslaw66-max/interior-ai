"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { track } from "@/lib/analytics";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import {
  EMPTY_SCENE_RENDERER_METRICS,
  type SceneRendererMetrics,
} from "@/lib/scene-performance-metrics";

export type ScenePerformanceMode = "auto" | "quality" | "lite";
export type SceneRenderQuality = "standard" | "lite";

export function useDesignPageScenePerformance({
  state,
  actions,
}: {
  state: { itemCount: number; viewMode: EditorViewMode };
  actions: { showToast: (message: string) => void };
}) {
  const [mode, setMode] = useState<ScenePerformanceMode>("auto");
  const [modeLoaded, setModeLoaded] = useState(false);
  const [autoLite, setAutoLite] = useState(false);
  const [sample, setSample] = useState<{ lastFps: number | null; samples: number }>({
    lastFps: null,
    samples: 0,
  });
  const [rendererMetrics, setRendererMetrics] = useState<SceneRendererMetrics>(
    EMPTY_SCENE_RENDERER_METRICS
  );
  const userChangedRef = useRef(false);
  const { itemCount, viewMode } = state;
  const { showToast } = actions;

  useEffect(() => {
    try {
      const storedMode = window.localStorage.getItem("scene_performance_mode");
      if (
        storedMode === "auto" ||
        storedMode === "quality" ||
        storedMode === "lite"
      ) {
        if (!userChangedRef.current) setMode(storedMode);
      }
    } catch {
      // Ignore unavailable storage.
    } finally {
      setModeLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!modeLoaded) return;
    try {
      window.localStorage.setItem("scene_performance_mode", mode);
    } catch {
      // Ignore unavailable storage.
    }
  }, [mode, modeLoaded]);

  const changeMode = useCallback(
    (nextMode: ScenePerformanceMode) => {
      userChangedRef.current = true;
      setMode(nextMode);
      setAutoLite(false);
      try {
        window.localStorage.setItem("scene_performance_mode", nextMode);
      } catch {
        // Ignore unavailable storage.
      }
      showToast(
        nextMode === "lite"
          ? "Lite scene mode enabled"
          : nextMode === "quality"
            ? "Quality scene mode enabled"
            : "Auto scene performance enabled"
      );
    },
    [showToast]
  );

  const recordSample = useCallback((fps: number) => {
    setSample((current) => ({ lastFps: fps, samples: current.samples + 1 }));
  }, []);

  const recordRendererSample = useCallback((metrics: SceneRendererMetrics) => {
    setRendererMetrics((current) =>
      current.drawCalls === metrics.drawCalls &&
      current.triangles === metrics.triangles &&
      current.geometries === metrics.geometries &&
      current.textures === metrics.textures
        ? current
        : metrics
    );
  }, []);

  const handleSustainedLowFps = useCallback(
    (fps: number) => {
      setAutoLite((current) => {
        if (current || mode !== "auto") return current;
        track("scene_performance_auto_lite_enabled", {
          fps,
          item_count: itemCount,
          view_mode: viewMode,
        });
        showToast("Lite scene mode enabled for smoother editing");
        return true;
      });
    },
    [itemCount, mode, showToast, viewMode]
  );

  const liteEnabled = mode === "lite" || (mode === "auto" && autoLite);
  const renderQuality: SceneRenderQuality = liteEnabled ? "lite" : "standard";

  return {
    state: { mode, autoLite, sample, rendererMetrics, liteEnabled, renderQuality },
    actions: {
      changeMode,
      recordSample,
      recordRendererSample,
      handleSustainedLowFps,
    },
  };
}
