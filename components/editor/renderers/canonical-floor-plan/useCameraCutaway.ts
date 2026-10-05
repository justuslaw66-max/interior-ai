import { useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Camera } from "three";

import {
  canonicalCutawayDirectionStep,
  canonicalCutawayStepDirection,
  resolveCanonicalCameraCutawayWallKeys,
  type CanonicalCutawayTarget,
} from "@/lib/floor-plan-camera-cutaway";
import type { CanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";

function sameKeys(first: ReadonlySet<string>, second: ReadonlySet<string>) {
  if (first.size !== second.size) return false;
  for (const key of first) if (!second.has(key)) return false;
  return true;
}

/** The cut set for the view's compass step; looking straight down, the resolver uses the camera position. */
function resolveCutaway(
  model: CanonicalFloorPlanRenderModel,
  camera: Camera,
  viewDirection: Vector3,
  step: number | null,
  target: CanonicalCutawayTarget | null,
  pinnedWallIds: ReadonlySet<string>
) {
  return resolveCanonicalCameraCutawayWallKeys(model, camera.position, target, {
    viewDirection: step === null ? viewDirection : canonicalCutawayStepDirection(step),
    pinnedWallIds,
  });
}

/**
 * The walls cut away for the current camera. The cut set follows the view's
 * compass direction in whole degrees, not the camera's distance or height, so
 * frames that only zoom, pan or redraw skip the resolver; and a new set is
 * compared key by key, so a turning camera allocates no signature strings.
 */
export function useCanonicalCameraCutawayWallKeys(
  model: CanonicalFloorPlanRenderModel,
  target: CanonicalCutawayTarget | null,
  pinnedWallIds: ReadonlySet<string>
) {
  const { camera } = useThree();
  const viewDirectionRef = useRef(new Vector3());
  const [cutawayWallKeys, setCutawayWallKeys] = useState(() => {
    const viewDirection = camera.getWorldDirection(new Vector3());
    const step = canonicalCutawayDirectionStep(viewDirection);
    return resolveCutaway(model, camera, viewDirection, step, target, pinnedWallIds);
  });
  const resolvedRef = useRef({
    model, target, pinnedWallIds, keys: cutawayWallKeys,
    step: -1 as number | null, cameraX: Number.NaN, cameraZ: Number.NaN,
  });

  useFrame(() => {
    const viewDirection = camera.getWorldDirection(viewDirectionRef.current);
    const step = canonicalCutawayDirectionStep(viewDirection);
    const resolved = resolvedRef.current;
    if (
      resolved.model === model &&
      resolved.target === target &&
      resolved.pinnedWallIds === pinnedWallIds &&
      resolved.step === step &&
      (step !== null || (camera.position.x === resolved.cameraX && camera.position.z === resolved.cameraZ))
    ) {
      return;
    }
    resolved.model = model;
    resolved.target = target;
    resolved.pinnedWallIds = pinnedWallIds;
    resolved.step = step;
    resolved.cameraX = camera.position.x;
    resolved.cameraZ = camera.position.z;
    const next = resolveCutaway(model, camera, viewDirection, step, target, pinnedWallIds);
    if (sameKeys(next, resolved.keys)) return;
    resolved.keys = next;
    setCutawayWallKeys(next);
  });

  return cutawayWallKeys;
}
