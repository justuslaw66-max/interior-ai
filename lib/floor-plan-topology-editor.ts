import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import type {
  FloorPlanDocumentV2,
  FloorPlanOpeningV2,
  FloorPlanPointMmV2,
} from "@/lib/floor-plan-document-v2";
import type {
  FloorPlanOpeningChangesV2,
  FloorPlanTopologyMutationResultV2,
  FloorPlanTopologyMutationV2,
} from "@/lib/floor-plan-topology-mutations";
import type { FixedElement2D, RoomOpening2D } from "@/lib/editorScene";
import type {
  DesignSnapshot,
  PersistedPlanOpening,
  RoomSnapshot,
} from "@/lib/room-types";

export const CANONICAL_ROOM_GEOMETRY_LOCK_REASON =
  "Imported room boundaries remain source-locked. Doors and windows can be moved or resized along their verified wall.";

export class CanonicalOpeningProjectionErrorV2 extends Error {
  readonly code:
    | "UNKNOWN_OPENING"
    | "UNKNOWN_WALL"
    | "UNKNOWN_ROOM"
    | "MISSING_CANONICAL_WALL"
    | "ARC_EDIT_UNSUPPORTED"
    | "INVALID_INTEGER_METRICS"
    | "POINT_OFF_WALL"
    | "OPENING_OUT_OF_BOUNDS";

  constructor(code: CanonicalOpeningProjectionErrorV2["code"], message: string) {
    super(message);
    this.name = "CanonicalOpeningProjectionErrorV2";
    this.code = code;
  }
}

export type CanonicalOpeningWallProjectionV2 = {
  floorId: string;
  openingId: string;
  wallId: string;
  offsetMm: number;
  widthMm: number;
  projectedCenterMm: FloorPlanPointMmV2;
  distanceFromWallMm: number;
};

export type CanonicalTopologySnapshotCommitV2 = {
  snapshot: DesignSnapshot;
  openings: RoomOpening2D[];
  fixedElements: FixedElement2D[];
};

function findCanonicalOpening(document: FloorPlanDocumentV2, openingId: string) {
  for (const floor of document.floors) {
    const opening = floor.openings.find((candidate) => candidate.id === openingId);
    if (opening) return { floor, opening };
  }
  throw new CanonicalOpeningProjectionErrorV2(
    "UNKNOWN_OPENING",
    `Canonical opening ${openingId} was not found.`
  );
}

function assertIntegerPoint(point: FloorPlanPointMmV2, widthMm: number) {
  if (
    !Number.isSafeInteger(point.xMm) ||
    !Number.isSafeInteger(point.zMm) ||
    !Number.isSafeInteger(widthMm) ||
    widthMm <= 0
  ) {
    throw new CanonicalOpeningProjectionErrorV2(
      "INVALID_INTEGER_METRICS",
      "Opening edits require positive integer-millimetre coordinates and width."
    );
  }
}

export function projectCanonicalOpeningToStraightWallV2({
  document,
  openingId,
  centerMm,
  widthMm,
  maxDistanceMm,
}: {
  document: FloorPlanDocumentV2;
  openingId: string;
  centerMm: FloorPlanPointMmV2;
  widthMm: number;
  maxDistanceMm?: number;
}): CanonicalOpeningWallProjectionV2 {
  assertIntegerPoint(centerMm, widthMm);
  const { floor, opening } = findCanonicalOpening(document, openingId);
  const wall = floor.walls.find((candidate) => candidate.id === opening.wallId);
  if (!wall) {
    throw new CanonicalOpeningProjectionErrorV2(
      "UNKNOWN_WALL",
      `Opening ${openingId} references missing wall ${opening.wallId}.`
    );
  }
  if (wall.path.kind !== "line") {
    throw new CanonicalOpeningProjectionErrorV2(
      "ARC_EDIT_UNSUPPORTED",
      `Opening ${openingId} is hosted by an arc and remains review-only.`
    );
  }
  const start = floor.vertices.find((vertex) => vertex.id === wall.path.startVertexId)!;
  const end = floor.vertices.find((vertex) => vertex.id === wall.path.endVertexId)!;
  const dx = end.xMm - start.xMm;
  const dz = end.zMm - start.zMm;
  const length = Math.hypot(dx, dz);
  const lengthSquared = dx * dx + dz * dz;
  const ratio =
    ((centerMm.xMm - start.xMm) * dx + (centerMm.zMm - start.zMm) * dz) /
    lengthSquared;
  const projectedCenterDistanceMm = Math.round(ratio * length);
  const projectedCenterMm = {
    xMm: Math.round(start.xMm + (dx * projectedCenterDistanceMm) / length),
    zMm: Math.round(start.zMm + (dz * projectedCenterDistanceMm) / length),
  };
  const distanceFromWallMm = Math.hypot(
    centerMm.xMm - projectedCenterMm.xMm,
    centerMm.zMm - projectedCenterMm.zMm
  );
  const toleranceMm = maxDistanceMm ?? Math.max(2, Math.ceil(wall.thicknessMm / 2));
  if (distanceFromWallMm > toleranceMm) {
    throw new CanonicalOpeningProjectionErrorV2(
      "POINT_OFF_WALL",
      `Dragged opening centre is ${Math.round(distanceFromWallMm)} mm away from wall ${wall.id}.`
    );
  }
  const offsetMm = Math.round(projectedCenterDistanceMm - widthMm / 2);
  if (offsetMm < 0 || offsetMm + widthMm > length + 0.5) {
    throw new CanonicalOpeningProjectionErrorV2(
      "OPENING_OUT_OF_BOUNDS",
      `Opening ${openingId} must remain completely inside wall ${wall.id}.`
    );
  }
  return {
    floorId: floor.id,
    openingId,
    wallId: wall.id,
    offsetMm,
    widthMm,
    projectedCenterMm,
    distanceFromWallMm,
  };
}

function legacyOpeningCenterMm(
  room: RoomSnapshot,
  opening: PersistedPlanOpening,
  centerOffsetMm: number
): FloorPlanPointMmV2 {
  const centerX = Math.round((room.planPosition?.x ?? 0) * 1000);
  const centerZ = Math.round((room.planPosition?.z ?? 0) * 1000);
  const halfWidth = Math.round(room.geometry.width * 500);
  const halfDepth = Math.round(room.geometry.depth * 500);
  if (opening.wall === "north") return { xMm: centerX + centerOffsetMm, zMm: centerZ - halfDepth };
  if (opening.wall === "south") return { xMm: centerX + centerOffsetMm, zMm: centerZ + halfDepth };
  if (opening.wall === "west") return { xMm: centerX - halfWidth, zMm: centerZ + centerOffsetMm };
  return { xMm: centerX + halfWidth, zMm: centerZ + centerOffsetMm };
}

export function projectLegacyOpeningGestureToCanonicalWallV2({
  snapshot,
  opening,
  centerOffsetMm,
  widthMm,
}: {
  snapshot: DesignSnapshot;
  opening: PersistedPlanOpening;
  centerOffsetMm: number;
  widthMm: number;
}): CanonicalOpeningWallProjectionV2 {
  const document = snapshot.floorPlan?.canonicalDocument;
  if (!document || !opening.canonicalWallId) {
    throw new CanonicalOpeningProjectionErrorV2(
      "MISSING_CANONICAL_WALL",
      `Opening ${opening.id} has no canonical wall binding.`
    );
  }
  const room = snapshot.rooms.find((candidate) => candidate.id === opening.roomId);
  if (!room) {
    throw new CanonicalOpeningProjectionErrorV2(
      "UNKNOWN_ROOM",
      `Opening ${opening.id} has no compatible projected room.`
    );
  }
  const { opening: canonicalOpening } = findCanonicalOpening(document, opening.id);
  if (canonicalOpening.wallId !== opening.canonicalWallId) {
    throw new CanonicalOpeningProjectionErrorV2(
      "MISSING_CANONICAL_WALL",
      `Opening ${opening.id} no longer matches canonical wall ${opening.canonicalWallId}.`
    );
  }
  return projectCanonicalOpeningToStraightWallV2({
    document,
    openingId: opening.id,
    centerMm: legacyOpeningCenterMm(room, opening, centerOffsetMm),
    widthMm,
  });
}

export function buildCanonicalOpeningUpdateMutationV2({
  snapshot,
  opening,
  centerOffsetMm,
  widthMm,
  changes = {},
}: {
  snapshot: DesignSnapshot;
  opening: PersistedPlanOpening;
  centerOffsetMm: number;
  widthMm: number;
  changes?: FloorPlanOpeningChangesV2;
}): FloorPlanTopologyMutationV2 {
  const projection = projectLegacyOpeningGestureToCanonicalWallV2({
    snapshot,
    opening,
    centerOffsetMm,
    widthMm,
  });
  return {
    kind: "update_opening",
    floorId: projection.floorId,
    openingId: projection.openingId,
    changes: {
      ...changes,
      offsetMm: projection.offsetMm,
      widthMm: projection.widthMm,
    },
  };
}

export function commitCanonicalTopologyMutationToSnapshotV2(
  baseSnapshot: DesignSnapshot,
  result: FloorPlanTopologyMutationResultV2
): CanonicalTopologySnapshotCommitV2 {
  const currentFloorPlan = baseSnapshot.floorPlan;
  if (!currentFloorPlan?.canonicalDocument) {
    throw new Error("Cannot commit canonical topology without an existing canonical document.");
  }
  const projection = canonicalFloorPlanToDesignSnapshot(result.document, {
    baseSnapshot,
    addressTransform: "normal",
  });
  if (projection.scene.geometryHash !== result.scene.geometryHash) {
    throw new Error("Canonical mutation projection changed the compiled geometry hash.");
  }
  const committedDocument: FloorPlanDocumentV2 = {
    ...result.document,
    // Pointer gestures may produce several transient editor revisions, but only
    // the final snapshot is durable. Keep lineage anchored to the immutable
    // source/library revision instead of a transient intermediate child.
    parentRevisionId:
      currentFloorPlan.revisionId ?? result.document.parentRevisionId,
  };
  const projectedFloorPlan = projection.snapshot.floorPlan!;
  const snapshot: DesignSnapshot = {
    ...projection.snapshot,
    floorPlan: {
      ...currentFloorPlan,
      canonicalDocument: committedDocument,
      canonicalGeometryHash: result.scene.geometryHash,
      // This remains the immutable catalog/source revision used by update discovery.
      // The locally edited child revision lives on canonicalDocument.revisionId.
      revisionId: currentFloorPlan.revisionId,
      verificationTier: "needs_review",
      openings: projection.openings,
      fixedElements: projection.fixedElements,
      surfaceMigrationReviewIssues:
        projectedFloorPlan.surfaceMigrationReviewIssues ??
        currentFloorPlan.surfaceMigrationReviewIssues,
      addressTransform: currentFloorPlan.addressTransform,
      addressBinding: currentFloorPlan.addressBinding,
      sourceRevisionGeometryHash: currentFloorPlan.sourceRevisionGeometryHash,
      sourceJobId: currentFloorPlan.sourceJobId,
      sourceAssetSha256: currentFloorPlan.sourceAssetSha256,
      orientationConfirmed: currentFloorPlan.orientationConfirmed,
    },
  };
  return {
    snapshot,
    openings: projection.openings,
    fixedElements: projection.fixedElements,
  };
}

export function getCanonicalOpeningByIdV2(
  document: FloorPlanDocumentV2,
  openingId: string
): FloorPlanOpeningV2 {
  return findCanonicalOpening(document, openingId).opening;
}
