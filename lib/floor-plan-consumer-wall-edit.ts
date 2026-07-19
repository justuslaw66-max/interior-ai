import type {
  FloorPlanWallClassificationV2,
} from "@/lib/floor-plan-document-v2";
import {
  commitCanonicalTopologyMutationToSnapshotV2,
  type CanonicalTopologySnapshotCommitV2,
} from "@/lib/floor-plan-topology-editor";
import {
  applyFloorPlanTopologyMutationV2,
  type FloorPlanTopologyMutationContextV2,
  type FloorPlanTopologyMutationV2,
} from "@/lib/floor-plan-topology-mutations";
import type { DesignSnapshot, RoomSurfaceAssignments } from "@/lib/room-types";

export const CONSUMER_WALL_EDIT_CONFIRMATION_COPY =
  "This creates a local editable copy for this design. The imported source plan remains unchanged. Accepted wall changes are marked Needs review and may affect connected rooms and openings.";

export type ConsumerWallTopologyMutationV2 = Extract<
  FloorPlanTopologyMutationV2,
  {
    kind: "move_vertex" | "move_wall" | "update_wall" | "split_wall";
  }
>;

export type ConsumerWallUpdateV2 = {
  thicknessMm: number;
  classification: FloorPlanWallClassificationV2;
};

export class ConsumerWallEditErrorV2 extends Error {
  readonly code:
    | "CONFIRMATION_REQUIRED"
    | "MISSING_CANONICAL_DOCUMENT"
    | "INVALID_SOURCE_LINEAGE";

  constructor(code: ConsumerWallEditErrorV2["code"], message: string) {
    super(message);
    this.name = "ConsumerWallEditErrorV2";
    this.code = code;
  }
}

function sourceRevisionId(snapshot: DesignSnapshot): string {
  const floorPlan = snapshot.floorPlan;
  const document = floorPlan?.canonicalDocument;
  if (!floorPlan || !document) {
    throw new ConsumerWallEditErrorV2(
      "MISSING_CANONICAL_DOCUMENT",
      "This design does not contain an imported canonical floor plan."
    );
  }
  return floorPlan.revisionId ?? document.parentRevisionId ?? document.revisionId;
}

function withSourceRevisionAnchor(
  snapshot: DesignSnapshot,
  revisionId: string
): DesignSnapshot {
  if (snapshot.floorPlan?.revisionId) return snapshot;
  return {
    ...snapshot,
    floorPlan: {
      ...snapshot.floorPlan!,
      revisionId,
    },
  };
}

function copySplitFinish(
  assignments: RoomSurfaceAssignments | undefined,
  sourceWallId: string,
  newWallId: string
): RoomSurfaceAssignments | undefined {
  const source = assignments?.walls?.faces?.[sourceWallId];
  if (!assignments || !source || assignments.walls?.faces?.[newWallId]) {
    return assignments;
  }
  return {
    ...assignments,
    walls: {
      ...assignments.walls,
      faces: {
        ...assignments.walls?.faces,
        [newWallId]: { ...source },
      },
    },
  };
}

function preserveSplitWallFinishes(
  commit: CanonicalTopologySnapshotCommitV2,
  operation: ConsumerWallTopologyMutationV2
): CanonicalTopologySnapshotCommitV2 {
  if (operation.kind !== "split_wall") return commit;
  const rooms = commit.snapshot.rooms.map((room) => ({
    ...room,
    surfaces: copySplitFinish(room.surfaces, operation.wallId, operation.newWallId),
    surfaceFinishes: copySplitFinish(
      room.surfaceFinishes,
      operation.wallId,
      operation.newWallId
    ),
  }));
  return {
    ...commit,
    snapshot: { ...commit.snapshot, rooms },
  };
}

function assertConsumerContentPreserved(
  before: DesignSnapshot,
  after: DesignSnapshot
): void {
  const afterById = new Map(after.rooms.map((room) => [room.id, room]));
  for (const room of before.rooms) {
    const next = afterById.get(room.id);
    if (!next) {
      throw new Error(`Wall editing unexpectedly removed room ${room.id}.`);
    }
    const preserved = [
      ["items", room.items, next.items],
      ["zones", room.zones, next.zones],
      ["saved views", room.savedViews, next.savedViews],
      ["layout versions", room.layoutVersions, next.layoutVersions],
    ] as const;
    for (const [label, previousValue, nextValue] of preserved) {
      if (JSON.stringify(previousValue) !== JSON.stringify(nextValue)) {
        throw new Error(`Wall editing unexpectedly changed ${label} in room ${room.id}.`);
      }
    }
  }
}

export function isConsumerWallEditLocalForkV2(snapshot: DesignSnapshot): boolean {
  const document = snapshot.floorPlan?.canonicalDocument;
  if (!document) return false;
  const sourceRevision =
    snapshot.floorPlan?.revisionId ?? document.parentRevisionId ?? document.revisionId;
  return (
    document.revisionId !== sourceRevision &&
    document.parentRevisionId === sourceRevision
  );
}

/**
 * Applies an explicitly confirmed consumer wall edit to a local child revision.
 * The immutable catalog/source revision remains the snapshot revision reference.
 */
export function applyConfirmedConsumerWallEditV2({
  snapshot,
  operation,
  context,
  sourceEditConfirmed,
}: {
  snapshot: DesignSnapshot;
  operation: ConsumerWallTopologyMutationV2;
  context: FloorPlanTopologyMutationContextV2;
  sourceEditConfirmed: boolean;
}): CanonicalTopologySnapshotCommitV2 {
  if (!sourceEditConfirmed) {
    throw new ConsumerWallEditErrorV2(
      "CONFIRMATION_REQUIRED",
      "Confirm Edit local copy before changing imported walls."
    );
  }
  const sourceRevision = sourceRevisionId(snapshot);
  const document = snapshot.floorPlan!.canonicalDocument!;
  if (
    document.revisionId !== sourceRevision &&
    document.parentRevisionId !== sourceRevision
  ) {
    throw new ConsumerWallEditErrorV2(
      "INVALID_SOURCE_LINEAGE",
      "The local floor-plan revision is no longer linked to its imported source revision."
    );
  }

  const anchoredSnapshot = withSourceRevisionAnchor(snapshot, sourceRevision);
  const result = applyFloorPlanTopologyMutationV2(document, operation, context);
  const committed = preserveSplitWallFinishes(
    commitCanonicalTopologyMutationToSnapshotV2(anchoredSnapshot, result),
    operation
  );
  const committedDocument = committed.snapshot.floorPlan?.canonicalDocument;
  if (
    !committedDocument ||
    committedDocument.parentRevisionId !== sourceRevision ||
    committed.snapshot.floorPlan?.revisionId !== sourceRevision
  ) {
    throw new ConsumerWallEditErrorV2(
      "INVALID_SOURCE_LINEAGE",
      "The local floor-plan edit did not preserve its immutable source revision."
    );
  }
  assertConsumerContentPreserved(snapshot, committed.snapshot);
  return committed;
}
