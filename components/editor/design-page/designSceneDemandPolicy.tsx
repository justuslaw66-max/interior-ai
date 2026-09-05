"use client";

import { useFrame, useThree, type RootState } from "@react-three/fiber";
import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { instrumentGLBMainThreadRenderer } from "@/components/scene/glb-scaled-model/glbMainThreadTelemetryFacade";
import {
  recordSceneDemandMutation,
  requestSceneDemandFrame,
  setSceneFiniteAnimationActive,
} from "@/components/scene/sceneDemandDiagnostics";

// Product state, controls, loading, and finite animations explicitly invalidate
// this canvas. A settled design therefore yields the browser main thread.
export const DESIGN_SCENE_FRAMELOOP = "demand" as const;
export const DESIGN_SCENE_CONTROL_DAMPING_FACTOR = 0.08;
const DESIGN_SCENE_MAX_DAMPING_FRAME_SECONDS = 0.125;

export function initializeDesignSceneDemandRenderer({ gl }: RootState) {
  instrumentGLBMainThreadRenderer(gl);
}

export const DESIGN_SCENE_DEMAND_PROPS = Object.freeze({
  frameloop: DESIGN_SCENE_FRAMELOOP,
  gl: Object.freeze({ antialias: true }),
  onCreated: initializeDesignSceneDemandRenderer,
});

export type CameraMotion = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  target: [number, number, number] | null;
  zoom: number;
};

function readCameraMotion(
  state: RootState,
  controls: OrbitControlsImpl | null,
): CameraMotion {
  const { camera } = state;
  return {
    position: camera.position.toArray(),
    quaternion: camera.quaternion.toArray(),
    target: controls?.target.toArray() ?? null,
    zoom: "zoom" in camera ? camera.zoom : 1,
  };
}

function squaredDelta(a: readonly number[], b: readonly number[]) {
  return a.reduce((total, value, index) => {
    const delta = value - (b[index] ?? value);
    return total + delta * delta;
  }, 0);
}

export function designSceneCameraMotionChanged(
  previous: CameraMotion,
  current: CameraMotion,
) {
  return (
    squaredDelta(previous.position, current.position) > 1e-12 ||
    squaredDelta(previous.quaternion, current.quaternion) > 1e-12 ||
    Math.abs(previous.zoom - current.zoom) > 1e-7 ||
    (previous.target !== null &&
      current.target !== null &&
      squaredDelta(previous.target, current.target) > 1e-12)
  );
}

export function resolveDesignSceneControlDampingFactor(deltaSeconds: number) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return DESIGN_SCENE_CONTROL_DAMPING_FACTOR;
  }
  const normalizedFrameCount =
    Math.min(deltaSeconds, DESIGN_SCENE_MAX_DAMPING_FRAME_SECONDS) * 60;
  return (
    1 -
    Math.pow(
      1 - DESIGN_SCENE_CONTROL_DAMPING_FACTOR,
      normalizedFrameCount,
    )
  );
}

function useDemandResizeInvalidation() {
  const invalidate = useThree((state) => state.invalidate);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);
  useEffect(() => {
    recordSceneDemandMutation("resize", width * height);
    requestSceneDemandFrame(invalidate);
  }, [height, invalidate, width]);
}

function useControlDampingFactor(
  controlsRef: MutableRefObject<OrbitControlsImpl | null>,
  enabled: boolean,
) {
  useFrame((_state, deltaSeconds) => {
    const controls = controlsRef.current;
    if (!enabled || !controls) return;
    controls.dampingFactor =
      resolveDesignSceneControlDampingFactor(deltaSeconds);
  }, -2);
}

function settleControlDamping(
  controls: OrbitControlsImpl | null,
  activeRef: MutableRefObject<boolean>,
  token: object,
) {
  if (controls) controls.dampingFactor = DESIGN_SCENE_CONTROL_DAMPING_FACTOR;
  if (!activeRef.current) return;
  activeRef.current = false;
  setSceneFiniteAnimationActive(token, "control-damping", false);
}

export function DesignSceneDemandControls({
  controlsRef,
  enabled,
}: {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  enabled: boolean;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const tokenRef = useRef({});
  const previousRef = useRef<CameraMotion | null>(null);
  const activeRef = useRef(false);
  useDemandResizeInvalidation();
  useControlDampingFactor(controlsRef, enabled);
  const settle = useCallback(
    () => settleControlDamping(controlsRef.current, activeRef, tokenRef.current),
    [controlsRef],
  );

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === "visible" && activeRef.current) {
        requestSceneDemandFrame(invalidate);
      }
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      settle();
    };
  }, [invalidate, settle]);

  useFrame((state) => {
    const current = readCameraMotion(state, controlsRef.current);
    const previous = previousRef.current;
    previousRef.current = current;
    if (
      !enabled ||
      !previous ||
      !designSceneCameraMotionChanged(previous, current)
    ) {
      settle();
      return;
    }
    if (!activeRef.current) {
      activeRef.current = true;
      setSceneFiniteAnimationActive(
        tokenRef.current,
        "control-damping",
        true,
      );
    }
    requestSceneDemandFrame(invalidate);
  }, -0.5);

  return null;
}
