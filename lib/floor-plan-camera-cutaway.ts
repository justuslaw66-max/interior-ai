import type {
  CanonicalFloorPlanRenderModel,
  CanonicalFloorPlanWallRenderModel,
} from "@/lib/floor-plan-render-model";

const CANONICAL_CUTAWAY_OUTSIDE_BUFFER_MM = 120;

export type CanonicalCutawayTarget = {
  x: number;
  z: number;
  width: number;
  depth: number;
};

export function canonicalWallCutawayKey(floorId: string, wallId: string) {
  return `${floorId}:${wallId}`;
}

function isCanonicalWallFacingCamera(
  wall: CanonicalFloorPlanWallRenderModel,
  cameraX: number,
  cameraZ: number
) {
  if (wall.roomSides.length !== 1 || wall.adjacentRoomIds.length !== 1) {
    return false;
  }
  const roomSide = wall.roomSides[0].side;
  const cameraXmm = cameraX * 1000;
  const cameraZmm = cameraZ * 1000;
  const outsideBufferMm = Math.max(
    CANONICAL_CUTAWAY_OUTSIDE_BUFFER_MM,
    wall.thicknessMm / 2 + 40
  );
  return wall.centerlineSegments.some((segment) => {
    const dx = segment.end.xMm - segment.start.xMm;
    const dz = segment.end.zMm - segment.start.zMm;
    const lengthMm = Math.hypot(dx, dz);
    if (lengthMm <= 0.001) return false;
    const signedDistanceMm =
      (dx * (cameraZmm - segment.start.zMm) -
        dz * (cameraXmm - segment.start.xMm)) /
      lengthMm;
    return roomSide * signedDistanceMm < -outsideBufferMm;
  });
}

function isCanonicalWallBetweenCameraAndTarget(
  wall: CanonicalFloorPlanWallRenderModel,
  cameraX: number,
  cameraZ: number,
  target: CanonicalCutawayTarget
) {
  const cameraXmm = cameraX * 1000;
  const cameraZmm = cameraZ * 1000;
  const targetXmm = target.x * 1000;
  const targetZmm = target.z * 1000;
  const targetWidthMm = Math.max(0, target.width * 1000);
  const targetDepthMm = Math.max(0, target.depth * 1000);
  const outsideBufferMm = Math.max(
    CANONICAL_CUTAWAY_OUTSIDE_BUFFER_MM,
    wall.thicknessMm / 2 + 40
  );

  return wall.centerlineSegments.some((segment) => {
    const dx = segment.end.xMm - segment.start.xMm;
    const dz = segment.end.zMm - segment.start.zMm;
    const lengthMm = Math.hypot(dx, dz);
    if (lengthMm <= 0.001) return false;
    const directionX = dx / lengthMm;
    const directionZ = dz / lengthMm;
    const signedCameraDistanceMm =
      directionX * (cameraZmm - segment.start.zMm) -
      directionZ * (cameraXmm - segment.start.xMm);
    const signedTargetDistanceMm =
      directionX * (targetZmm - segment.start.zMm) -
      directionZ * (targetXmm - segment.start.xMm);
    if (
      Math.abs(signedCameraDistanceMm) <= outsideBufferMm ||
      signedCameraDistanceMm * signedTargetDistanceMm >= 0
    ) {
      return false;
    }

    const targetOffsetMm =
      (targetXmm - segment.start.xMm) * directionX +
      (targetZmm - segment.start.zMm) * directionZ;
    const projectedTargetHalfSpanMm =
      (Math.abs(directionX) * targetWidthMm +
        Math.abs(directionZ) * targetDepthMm) /
        2 +
      750;
    return (
      targetOffsetMm + projectedTargetHalfSpanMm >= 0 &&
      targetOffsetMm - projectedTargetHalfSpanMm <= lengthMm
    );
  });
}

/**
 * Resolve only true exterior walls on the camera side of the authored room
 * loop. Shared partitions stay visible so the dollhouse view remains legible.
 */
export function resolveCanonicalCameraCutawayWallKeys(
  model: CanonicalFloorPlanRenderModel,
  camera: { x: number; z: number },
  target?: CanonicalCutawayTarget | null
) {
  return new Set(
    model.floors.flatMap((floor) =>
      floor.walls.flatMap((wall) =>
        isCanonicalWallFacingCamera(wall, camera.x, camera.z) ||
        (target &&
          isCanonicalWallBetweenCameraAndTarget(
            wall,
            camera.x,
            camera.z,
            target
          ))
          ? [canonicalWallCutawayKey(floor.id, wall.id)]
          : []
      )
    )
  );
}
