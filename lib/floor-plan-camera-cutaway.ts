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

type CanonicalPlanBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

const planBoundsCache = new WeakMap<CanonicalFloorPlanRenderModel, CanonicalPlanBounds | null>();

/** The plan's wall extent in metres, or null for a plan without walls. Kept per model. */
function canonicalPlanBounds(model: CanonicalFloorPlanRenderModel): CanonicalPlanBounds | null {
  if (planBoundsCache.has(model)) return planBoundsCache.get(model) ?? null;
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const floor of model.floors) {
    for (const wall of floor.walls) {
      for (const segment of wall.centerlineSegments) {
        for (const point of [segment.start, segment.end]) {
          bounds.minX = Math.min(bounds.minX, point.xMm / 1000);
          bounds.maxX = Math.max(bounds.maxX, point.xMm / 1000);
          bounds.minZ = Math.min(bounds.minZ, point.zMm / 1000);
          bounds.maxZ = Math.max(bounds.maxZ, point.zMm / 1000);
        }
      }
    }
  }
  const result = Number.isFinite(bounds.minX) && Number.isFinite(bounds.minZ) ? bounds : null;
  planBoundsCache.set(model, result);
  return result;
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
  const planBounds = canonicalPlanBounds(model);
  const targetX = target?.x ?? (planBounds ? (planBounds.minX + planBounds.maxX) / 2 : 0);
  const targetZ = target?.z ?? (planBounds ? (planBounds.minZ + planBounds.maxZ) / 2 : 0);
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
    (planBounds
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

  // A loop, not flatMap: this runs on every frame while the camera turns.
  const keys = new Set<string>();
  for (const floor of model.floors) {
    const boundaryRoles = deriveCanonicalWallBoundaryRoles(floor);
    for (const wall of floor.walls) {
      if (isCanonicalWallCutAway(wall, boundaryRoles, stableCamera, target, options.pinnedWallIds)) {
        keys.add(canonicalWallCutawayKey(floor.id, wall.id));
      }
    }
  }
  return keys;
}

function isCanonicalWallCutAway(
  wall: CanonicalFloorPlanWallRenderModel,
  boundaryRoles: ReadonlyMap<string, CanonicalWallBoundaryRole>,
  camera: { x: number; z: number },
  target: CanonicalCutawayTarget | null | undefined,
  pinnedWallIds: ReadonlySet<string> | undefined
) {
  if (
    pinnedWallIds?.has(wall.id) ||
    boundaryRoles.get(wall.id) !== "exterior" ||
    wall.roomSides.length !== 1 ||
    wall.adjacentRoomIds.length !== 1
  ) {
    return false;
  }
  return (
    isCanonicalWallFacingCamera(wall, camera.x, camera.z) ||
    Boolean(target && isCanonicalWallBetweenCameraAndTarget(wall, camera.x, camera.z, target))
  );
}

/**
 * The cutaway follows the view's compass direction in whole degrees, so an
 * orbit meets at most this many directions and every cut set it can show can
 * be prepared ahead (`canonicalCutawayTurn`). A degree is far below what the
 * eye notices as a wall comes and goes.
 */
export const CANONICAL_CUTAWAY_DIRECTIONS = 360;

/** The view direction's compass step, 0 to 359, or null when looking straight down. */
export function canonicalCutawayDirectionStep(viewDirection: { x: number; z: number }): number | null {
  if (Math.hypot(viewDirection.x, viewDirection.z) <= 0.001) return null;
  const turns = Math.atan2(viewDirection.x, viewDirection.z) / (2 * Math.PI);
  const step = Math.round(turns * CANONICAL_CUTAWAY_DIRECTIONS);
  return ((step % CANONICAL_CUTAWAY_DIRECTIONS) + CANONICAL_CUTAWAY_DIRECTIONS) % CANONICAL_CUTAWAY_DIRECTIONS;
}

/** The unit view direction of a compass step. */
export function canonicalCutawayStepDirection(step: number) {
  const angle = (step * 2 * Math.PI) / CANONICAL_CUTAWAY_DIRECTIONS;
  return { x: Math.sin(angle), z: Math.cos(angle) };
}

/**
 * Walks every compass step around the target, nearest to `startStep` first,
 * yielding each cut set the first time it appears and `undefined` for a step
 * whose set was already seen, so a caller can pause between steps. These are
 * all the sets an orbit around the target can show.
 */
export function* canonicalCutawayTurn(
  model: CanonicalFloorPlanRenderModel,
  target: CanonicalCutawayTarget | null,
  pinnedWallIds: ReadonlySet<string>,
  startStep: number
): Generator<ReadonlySet<string> | undefined, void, void> {
  const seen = new Set<string>();
  for (let index = 0; index < CANONICAL_CUTAWAY_DIRECTIONS; index += 1) {
    const turn = index % 2 === 0 ? index / 2 : -(index + 1) / 2;
    const step = (startStep + turn + CANONICAL_CUTAWAY_DIRECTIONS) % CANONICAL_CUTAWAY_DIRECTIONS;
    const keys = resolveCanonicalCameraCutawayWallKeys(model, { x: 0, z: 0 }, target, {
      viewDirection: canonicalCutawayStepDirection(step),
      pinnedWallIds,
    });
    const signature = [...keys].sort().join("|");
    if (seen.has(signature)) {
      yield undefined;
      continue;
    }
    seen.add(signature);
    yield keys;
  }
}
