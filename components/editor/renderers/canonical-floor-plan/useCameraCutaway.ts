import { useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";

import {
  resolveCanonicalCameraCutawayWallKeys,
  type CanonicalCutawayTarget,
} from "@/lib/floor-plan-camera-cutaway";
import type { CanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";

function wallKeySignature(keys: ReadonlySet<string>) {
  return [...keys].sort().join("|");
}

export function useCanonicalCameraCutawayWallKeys(
  model: CanonicalFloorPlanRenderModel,
  target: CanonicalCutawayTarget | null,
  pinnedWallIds: ReadonlySet<string>
) {
  const { camera } = useThree();
  const viewDirectionRef = useRef(new Vector3());
  const [cutawayWallKeys, setCutawayWallKeys] = useState(() =>
    {
      const viewDirection = camera.getWorldDirection(new Vector3());
      return resolveCanonicalCameraCutawayWallKeys(
        model,
        camera.position,
        target,
        {
          viewDirection: {
            x: viewDirection.x,
            z: viewDirection.z,
          },
          pinnedWallIds,
        }
      );
    }
  );
  const signatureRef = useRef(wallKeySignature(cutawayWallKeys));

  useFrame(() => {
    const viewDirection = camera.getWorldDirection(viewDirectionRef.current);
    const next = resolveCanonicalCameraCutawayWallKeys(
      model,
      camera.position,
      target,
      {
        viewDirection: {
          x: viewDirection.x,
          z: viewDirection.z,
        },
        pinnedWallIds,
      }
    );
    const signature = wallKeySignature(next);
    if (signature === signatureRef.current) return;
    signatureRef.current = signature;
    setCutawayWallKeys(next);
  });

  return cutawayWallKeys;
}
