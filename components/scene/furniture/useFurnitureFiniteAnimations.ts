"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

import {
  cancelSceneFiniteAnimations,
  recordSceneFiniteAnimationFrame,
  requestSceneDemandFrame,
  setSceneFiniteAnimationActive,
  type SceneFiniteAnimationKind,
} from "../sceneDemandDiagnostics";

type FurnitureFiniteAnimationOptions = {
  instanceId: string;
  interactive: boolean;
  dragging: boolean;
  cartPreviewed: boolean;
  clampedPosition: [number, number, number];
  height: number;
};

type AnimationController = {
  groupRef: MutableRefObject<THREE.Group | null>;
  shakeUntilRef: MutableRefObject<number>;
  placementStartRef: MutableRefObject<number | null>;
  snapBumpUntilRef: MutableRefObject<number>;
  generationRef: MutableRefObject<number>;
  tokensRef: MutableRefObject<{ placement: object; snap: object; shake: object }>;
  requestFiniteFrame: (generation?: number) => boolean;
  startLockedShake: () => void;
  startSnapBump: () => void;
};

const PLACEMENT_DURATION_MS = 160;
const SNAP_BUMP_DURATION_MS = 160;
const LOCKED_SHAKE_DURATION_MS = 220;

function useFurnitureAnimationController(): AnimationController {
  const groupRef = useRef<THREE.Group>(null);
  const invalidate = useThree((state) => state.invalidate);
  const shakeUntilRef = useRef(0);
  const placementStartRef = useRef<number | null>(null);
  const snapBumpUntilRef = useRef(0);
  const generationRef = useRef(0);
  const tokensRef = useRef({ placement: {}, snap: {}, shake: {} });
  const requestFiniteFrame = useCallback(
    (generation = generationRef.current) => {
      if (generation !== generationRef.current) return false;
      return requestSceneDemandFrame(invalidate);
    },
    [invalidate],
  );
  const begin = useCallback(
    (token: object, kind: SceneFiniteAnimationKind) => {
      setSceneFiniteAnimationActive(token, kind, true);
      requestFiniteFrame();
    },
    [requestFiniteFrame],
  );
  const startLockedShake = useCallback(() => {
    shakeUntilRef.current = performance.now() + LOCKED_SHAKE_DURATION_MS;
    begin(tokensRef.current.shake, "locked-shake");
  }, [begin]);
  const startSnapBump = useCallback(() => {
    snapBumpUntilRef.current = performance.now() + SNAP_BUMP_DURATION_MS;
    begin(tokensRef.current.snap, "snap-bump");
  }, [begin]);
  return {
    groupRef,
    shakeUntilRef,
    placementStartRef,
    snapBumpUntilRef,
    generationRef,
    tokensRef,
    requestFiniteFrame,
    startLockedShake,
    startSnapBump,
  };
}

function usePlacementAnimationLifecycle(
  controller: AnimationController,
  instanceId: string,
  interactive: boolean,
) {
  const { generationRef, placementStartRef, requestFiniteFrame, tokensRef } =
    controller;
  const { shakeUntilRef, snapBumpUntilRef } = controller;
  useEffect(() => {
    const generation = generationRef.current + 1;
    const tokens = Object.values(tokensRef.current);
    generationRef.current = generation;
    cancelSceneFiniteAnimations(tokens);
    if (!interactive) {
      placementStartRef.current = null;
      shakeUntilRef.current = 0;
      snapBumpUntilRef.current = 0;
      return;
    }
    placementStartRef.current = performance.now();
    setSceneFiniteAnimationActive(
      tokensRef.current.placement,
      "placement-scale",
      true,
    );
    requestFiniteFrame(generation);
    return () => {
      if (generationRef.current === generation) generationRef.current += 1;
      cancelSceneFiniteAnimations(tokens);
    };
  }, [
    generationRef,
    instanceId,
    interactive,
    placementStartRef,
    requestFiniteFrame,
    shakeUntilRef,
    snapBumpUntilRef,
    tokensRef,
  ]);
}

function useVisibleAnimationResume(
  controller: AnimationController,
  interactive: boolean,
) {
  const {
    placementStartRef,
    requestFiniteFrame,
    shakeUntilRef,
    snapBumpUntilRef,
  } = controller;
  useEffect(() => {
    const resume = () => {
      if (
        interactive &&
        document.visibilityState === "visible" &&
        (placementStartRef.current !== null ||
          snapBumpUntilRef.current > 0 ||
          shakeUntilRef.current > 0)
      ) {
        requestFiniteFrame();
      }
    };
    document.addEventListener("visibilitychange", resume);
    return () => document.removeEventListener("visibilitychange", resume);
  }, [
    interactive,
    placementStartRef,
    requestFiniteFrame,
    shakeUntilRef,
    snapBumpUntilRef,
  ]);
}

function updateFurniturePositionFrame(
  controller: AnimationController,
  now: number,
  clampedPosition: [number, number, number],
  height: number,
  interactive: boolean,
) {
  const { groupRef, shakeUntilRef, snapBumpUntilRef, tokensRef } = controller;
  const group = groupRef.current;
  if (!group) return { shakeActive: false, bumpActive: false };
  const [baseX, positionY, baseZ] = clampedPosition;
  const bumpRemaining = snapBumpUntilRef.current - now;
  const bumpWasRunning = snapBumpUntilRef.current > 0;
  const bumpActive = interactive && bumpRemaining > 0;
  const bump = bumpActive
    ? Math.sin((bumpRemaining / SNAP_BUMP_DURATION_MS) * Math.PI) * 0.02
    : 0;
  const shakeActive = interactive && shakeUntilRef.current > now;
  const shakeWasRunning = shakeUntilRef.current > 0;
  const shake = shakeActive
    ? Math.sin(
        ((shakeUntilRef.current - now) / LOCKED_SHAKE_DURATION_MS) *
          Math.PI *
          10,
      ) * 0.02
    : 0;
  group.position.set(baseX + shake + bump, (positionY ?? 0) + height / 2, baseZ);
  if (shakeActive) recordSceneFiniteAnimationFrame("locked-shake", shake);
  if (bumpActive) recordSceneFiniteAnimationFrame("snap-bump", bump);
  if (!shakeActive) {
    if (shakeWasRunning) recordSceneFiniteAnimationFrame("locked-shake", 0);
    shakeUntilRef.current = 0;
    setSceneFiniteAnimationActive(tokensRef.current.shake, "locked-shake", false);
  }
  if (!bumpActive) {
    if (bumpWasRunning) recordSceneFiniteAnimationFrame("snap-bump", 0);
    snapBumpUntilRef.current = 0;
    setSceneFiniteAnimationActive(tokensRef.current.snap, "snap-bump", false);
  }
  return { shakeActive, bumpActive };
}

function updateFurnitureScaleFrame(
  controller: AnimationController,
  now: number,
  options: Pick<
    FurnitureFiniteAnimationOptions,
    "dragging" | "interactive" | "cartPreviewed"
  >,
) {
  const { groupRef, placementStartRef, tokensRef } = controller;
  const group = groupRef.current;
  if (!group) return false;
  if (options.dragging || !options.interactive || options.cartPreviewed) {
    placementStartRef.current = null;
    setSceneFiniteAnimationActive(
      tokensRef.current.placement,
      "placement-scale",
      false,
    );
    const scale = options.cartPreviewed ? 1.02 : 1;
    group.scale.set(scale, scale, scale);
    return false;
  }
  if (placementStartRef.current === null) {
    group.scale.set(1, 1, 1);
    return false;
  }
  const progress = Math.min(
    1,
    (now - placementStartRef.current) / PLACEMENT_DURATION_MS,
  );
  const scale = 0.98 + 0.02 * progress;
  group.scale.set(scale, scale, scale);
  recordSceneFiniteAnimationFrame("placement-scale", scale);
  if (progress < 1) return true;
  placementStartRef.current = null;
  setSceneFiniteAnimationActive(
    tokensRef.current.placement,
    "placement-scale",
    false,
  );
  return false;
}

function useFurnitureAnimationFrames(
  controller: AnimationController,
  options: FurnitureFiniteAnimationOptions,
) {
  useFrame(() => {
    if (!controller.groupRef.current) {
      cancelSceneFiniteAnimations(Object.values(controller.tokensRef.current));
      return;
    }
    const now = performance.now();
    const { shakeActive, bumpActive } = updateFurniturePositionFrame(
      controller,
      now,
      options.clampedPosition,
      options.height,
      options.interactive,
    );
    const placementActive = updateFurnitureScaleFrame(controller, now, options);
    if (shakeActive || bumpActive || placementActive) {
      controller.requestFiniteFrame();
    }
  });
}

export function useFurnitureFiniteAnimations(
  options: FurnitureFiniteAnimationOptions,
) {
  const controller = useFurnitureAnimationController();
  usePlacementAnimationLifecycle(
    controller,
    options.instanceId,
    options.interactive,
  );
  useVisibleAnimationResume(controller, options.interactive);
  useFurnitureAnimationFrames(controller, options);
  const {
    startLockedShake: startLockedShakeAnimation,
    startSnapBump: startSnapBumpAnimation,
  } = controller;
  const startLockedShake = useCallback(() => {
    if (!options.interactive) return;
    startLockedShakeAnimation();
  }, [options.interactive, startLockedShakeAnimation]);
  const startSnapBump = useCallback(() => {
    if (!options.interactive) return;
    startSnapBumpAnimation();
  }, [options.interactive, startSnapBumpAnimation]);
  return {
    groupRef: controller.groupRef,
    startLockedShake,
    startSnapBump,
  };
}
