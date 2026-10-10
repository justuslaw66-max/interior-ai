import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3 } from "three";

import {
  canonicalCutawayDirectionStep,
  canonicalCutawayTurn,
  type CanonicalCutawayTarget,
} from "@/lib/floor-plan-camera-cutaway";
import type { CanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import {
  CANONICAL_WALL_BAND_CACHE_LIMIT,
  canonicalWallBands,
  hasCanonicalWallBands,
} from "./useCanonicalWallBands";

/** Compass steps resolved between pauses (about 20 µs each). */
const STEPS_PER_PAUSE = 60;
/** A pause's work (one floor's bands, about 30 ms on "h1") runs only in an idle period at least this long. */
const MINIMUM_IDLE_MS = 25;

type IdleDeadline = { timeRemaining: () => number };

/**
 * Walks every compass step around the target, nearest to the current view
 * first, and builds each floor's bands for every new cut set, pausing before
 * each build. Sets already kept are only touched, so a restart (a new target,
 * an edited plan) skips straight to the sets still missing.
 */
export function* prebuildCanonicalWallBandSteps(
  model: CanonicalFloorPlanRenderModel,
  target: CanonicalCutawayTarget | null,
  pinnedWallIds: ReadonlySet<string>,
  startStep: number
): Generator<void, void, void> {
  let resolved = 0;
  let sets = 0;
  for (const keys of canonicalCutawayTurn(model, target, pinnedWallIds, startStep)) {
    resolved += 1;
    if (resolved % STEPS_PER_PAUSE === 0) yield;
    if (!keys) continue;
    for (const floor of model.floors) {
      if (!hasCanonicalWallBands(floor, keys)) yield;
      canonicalWallBands(floor, keys);
    }
    sets += 1;
    if (sets >= CANONICAL_WALL_BAND_CACHE_LIMIT) return;
  }
}

/** Runs the steps in idle periods long enough for one, until done or cancelled. */
function runStepsWhenIdle(steps: Iterator<void>) {
  let cancel = () => {};
  const run = (deadline: IdleDeadline) => {
    if (deadline.timeRemaining() >= MINIMUM_IDLE_MS && steps.next().done) return;
    cancel = scheduleIdle(run);
  };
  cancel = scheduleIdle(run);
  return () => cancel();
}

function scheduleIdle(callback: (deadline: IdleDeadline) => void) {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback);
    return () => window.cancelIdleCallback(id);
  }
  // Safari has no requestIdleCallback: a quiet timer stands in.
  const id = window.setTimeout(() => callback({ timeRemaining: () => MINIMUM_IDLE_MS }), 250);
  return () => window.clearTimeout(id);
}

/**
 * Builds, in idle time, the wall bands for every cut set an orbit around the
 * current target can show, so the first pass over a set does not build its
 * union mid-orbit. Off where the band cache cannot help: a focused room
 * renders a new floor object on every render.
 */
export function usePrebuiltCanonicalWallBands(
  model: CanonicalFloorPlanRenderModel,
  target: CanonicalCutawayTarget | null,
  pinnedWallIds: ReadonlySet<string>,
  enabled: boolean
) {
  const { camera } = useThree();
  useEffect(() => {
    if (!enabled) return;
    const startStep = canonicalCutawayDirectionStep(camera.getWorldDirection(new Vector3())) ?? 0;
    return runStepsWhenIdle(prebuildCanonicalWallBandSteps(model, target, pinnedWallIds, startStep));
  }, [camera, enabled, model, pinnedWallIds, target]);
}
