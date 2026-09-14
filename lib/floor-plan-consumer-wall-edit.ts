import type { FloorPlanWallSplitLineageV2 } from "@/lib/floor-plan-topology-mutation-types";
import type {
  FloorPlanWallClassificationV2,
  FloorPlanDocumentV2,
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
import { reconcileProposedRoomContent } from "@/lib/floor-plan-proposal-content";
import { forkOpeningEvidenceForProposal } from "@/lib/floor-plan-proposal-opening";
import { buildCanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import { reviewProposedPlacements } from "@/lib/floor-plan-placement-review";

export const CONSUMER_WALL_EDIT_CONFIRMATION_COPY =
  "This creates a local editable copy for this design. The imported source plan remains unchanged. Accepted wall changes are marked Needs review and may affect connected rooms and openings.";

export function selectConsumerWallGeometry(document: FloorPlanDocumentV2 | null, floorId: string, wallId: string) {
  const floor = document?.floors.find((candidate) => candidate.id === floorId) ?? document?.floors[0] ?? null;
  const wall = floor?.walls.find((candidate) => candidate.id === wallId) ?? floor?.walls[0] ?? null;
  const start = floor?.vertices.find(({ id }) => id === wall?.path.startVertexId);
  const end = floor?.vertices.find(({ id }) => id === wall?.path.endVertexId);
  const wallLengthMm = start && end && wall?.path.kind === "line"
    ? Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm) : null;
  return { floor, wall, wallLengthMm };
}

export type ConsumerWallTopologyMutationV2 = Extract<
  FloorPlanTopologyMutationV2,
  {
    kind: "join_wall_endpoint" | "move_vertex" | "move_wall" | "update_wall" | "split_wall" | "add_wall" | "remove_wall" | "add_opening" | "update_opening" | "remove_opening";
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
  snapshot: DesignSnapshot, splits: readonly FloorPlanWallSplitLineageV2[] = []
): DesignSnapshot {
  let rooms = snapshot.rooms;
  for (const split of splits) {
    const wall = snapshot.floorPlan?.canonicalDocument?.floors.find(({ id }) => id === split.floorId)?.walls.find(({ id }) => id === split.newWallId);
    rooms = rooms.map((room) => wall?.adjacentRoomIds.includes(room.id) ? {
      ...room,
      surfaces: copySplitFinish(room.surfaces, split.sourceWallId, split.newWallId),
      surfaceFinishes: copySplitFinish(room.surfaceFinishes, split.sourceWallId, split.newWallId),
    } : room);
  }
  return rooms === snapshot.rooms ? snapshot : { ...snapshot, rooms };
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
  const result = applyFloorPlanTopologyMutationV2(forkOpeningEvidenceForProposal(document, operation, context), operation, context);
  const committed = commitCanonicalTopologyMutationToSnapshotV2(anchoredSnapshot, result);
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
  const reconciled = preserveSplitWallFinishes(reconcileProposedRoomContent(snapshot, committed.snapshot, operation, result.roomSplits), result.wallSplits);
  const issues = reviewProposedPlacements(reconciled, buildCanonicalFloorPlanRenderModel(result.scene));
  reconciled.floorPlan!.proposal!.reviewIssues = [...new Set([...reconciled.floorPlan!.proposal!.reviewIssues, ...issues])];
  return { ...committed, snapshot: reconciled };
}
