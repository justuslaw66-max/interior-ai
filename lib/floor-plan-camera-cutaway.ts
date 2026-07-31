import type {
  CanonicalFloorPlanFloorRenderModel,
  CanonicalFloorPlanRenderModel,
  CanonicalFloorPlanWallRenderModel,
} from "@/lib/floor-plan-render-model";
import { isPointInPlanarRing } from "@/lib/floor-plan-planar-union";
import { buildCanonicalFloorSlabPolygons } from "@/lib/floor-plan-watertight-geometry";

const CANONICAL_CUTAWAY_OUTSIDE_BUFFER_MM = 120;
const CANONICAL_CUTAWAY_EXTERIOR_SAMPLE_MM = 40;

export type CanonicalCutawayTarget = {
  x: number;
  z: number;
  width: number;
  depth: number;
};

export type CanonicalWallBoundaryRole =
  | "exterior"
  | "interior"
  | "void_boundary";

const boundaryRoleCache = new WeakMap<
  CanonicalFloorPlanFloorRenderModel,
  ReadonlyMap<string, CanonicalWallBoundaryRole>
>();

export function canonicalWallCutawayKey(floorId: string, wallId: string) {
  return `${floorId}:${wallId}`;
}

/**
 * Imported schema-v2 documents created before extraction V2.4 classified
 * every wall as interior, while newer importers can only infer adjacency from
 * the reconstructed faces. Derive the physical boundary role from the complete
 * floor union so saved designs receive the renderer repair without rewriting
 * their immutable canonical document, and so internal void boundaries cannot
 * be cut away merely because they were classified as exterior.
 */
export function deriveCanonicalWallBoundaryRoles(
  floor: CanonicalFloorPlanFloorRenderModel
) {
  const cached = boundaryRoleCache.get(floor);
  if (cached) return cached;

  const slabPolygons = buildCanonicalFloorSlabPolygons(floor);
  const roles = new Map<string, CanonicalWallBoundaryRole>();
  for (const wall of floor.walls) {
    if (
      wall.adjacentRoomIds.length > 1 ||
      wall.roomSides.length > 1
    ) {
      roles.set(wall.id, "interior");
      continue;
    }
    if (
      wall.classification === "party" ||
      wall.classification === "structural"
    ) {
      roles.set(wall.id, "interior");
      continue;
    }

    const roomSide = wall.roomSides[0]?.side;
    const sampleOffsetMm =
      wall.thicknessMm / 2 + CANONICAL_CUTAWAY_EXTERIOR_SAMPLE_MM;
    const reachesOutsideOuterRing =
      roomSide !== undefined &&
      wall.centerlineSegments.some((segment) => {
        const dx = segment.end.xMm - segment.start.xMm;
        const dz = segment.end.zMm - segment.start.zMm;
        const lengthMm = Math.hypot(dx, dz);
        if (lengthMm <= 0.001) return false;
        const leftNormalX = -dz / lengthMm;
        const leftNormalZ = dx / lengthMm;
        const exteriorSide = -roomSide;
        const sample = {
          xMm:
            (segment.start.xMm + segment.end.xMm) / 2 +
            leftNormalX * exteriorSide * sampleOffsetMm,
          zMm:
            (segment.start.zMm + segment.end.zMm) / 2 +
            leftNormalZ * exteriorSide * sampleOffsetMm,
        };
        return !slabPolygons.some((polygon) =>
          isPointInPlanarRing(sample, polygon.outer)
        );
      });
    roles.set(
      wall.id,
      reachesOutsideOuterRing ? "exterior" : "void_boundary"
    );
  }
  boundaryRoleCache.set(floor, roles);
  return roles;
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
  target?: CanonicalCutawayTarget | null,
  options: {
    viewDirection?: { x: number; z: number } | null;
    pinnedWallIds?: ReadonlySet<string>;
  } = {}
) {
  const planPoints = model.floors.flatMap((floor) =>
    floor.walls.flatMap((wall) =>
      wall.centerlineSegments.flatMap((segment) => [
        segment.start,
        segment.end,
      ])
    )
  );
  const planBounds = planPoints.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.xMm / 1000),
      maxX: Math.max(bounds.maxX, point.xMm / 1000),
      minZ: Math.min(bounds.minZ, point.zMm / 1000),
      maxZ: Math.max(bounds.maxZ, point.zMm / 1000),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    }
  );
  const hasBounds =
    Number.isFinite(planBounds.minX) &&
    Number.isFinite(planBounds.maxX) &&
    Number.isFinite(planBounds.minZ) &&
    Number.isFinite(planBounds.maxZ);
  const targetX = target?.x ?? (hasBounds ? (planBounds.minX + planBounds.maxX) / 2 : 0);
  const targetZ = target?.z ?? (hasBounds ? (planBounds.minZ + planBounds.maxZ) / 2 : 0);
  const suppliedDirectionMagnitude = Math.hypot(
    options.viewDirection?.x ?? 0,
    options.viewDirection?.z ?? 0
  );
  const sourceDirectionX =
    suppliedDirectionMagnitude > 0.001
      ? -(options.viewDirection?.x ?? 0) / suppliedDirectionMagnitude
      : camera.x - targetX;
  const sourceDirectionZ =
    suppliedDirectionMagnitude > 0.001
      ? -(options.viewDirection?.z ?? 0) / suppliedDirectionMagnitude
      : camera.z - targetZ;
  const sourceMagnitude = Math.hypot(sourceDirectionX, sourceDirectionZ);
  const normalizedSourceX =
    sourceMagnitude > 0.001 ? sourceDirectionX / sourceMagnitude : 1 / Math.sqrt(2);
  const normalizedSourceZ =
    sourceMagnitude > 0.001 ? sourceDirectionZ / sourceMagnitude : 1 / Math.sqrt(2);
  const virtualCameraDistance =
    (hasBounds
      ? Math.hypot(
          planBounds.maxX - planBounds.minX,
          planBounds.maxZ - planBounds.minZ
        )
      : 1) *
      4 +
    4;
  const stableCamera = {
    x: targetX + normalizedSourceX * virtualCameraDistance,
    z: targetZ + normalizedSourceZ * virtualCameraDistance,
  };

  return new Set(
    model.floors.flatMap((floor) =>
      {
        const boundaryRoles = deriveCanonicalWallBoundaryRoles(floor);
        return floor.walls.flatMap((wall) => {
          if (
            options.pinnedWallIds?.has(wall.id) ||
            boundaryRoles.get(wall.id) !== "exterior" ||
            wall.roomSides.length !== 1 ||
            wall.adjacentRoomIds.length !== 1
          ) {
            return [];
          }
          return isCanonicalWallFacingCamera(
            wall,
            stableCamera.x,
            stableCamera.z
          ) ||
            (target &&
              isCanonicalWallBetweenCameraAndTarget(
                wall,
                stableCamera.x,
                stableCamera.z,
                target
              ))
            ? [canonicalWallCutawayKey(floor.id, wall.id)]
            : [];
        });
      }
    )
  );
}
