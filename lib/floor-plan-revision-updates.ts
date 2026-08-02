import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import type {
  DesignSnapshot,
  PersistedFloorPlanAddressBinding,
} from "@/lib/room-types";

export type FloorPlanRevisionUpdateCounts = {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
};

export type FloorPlanRevisionUpdateDiff = {
  geometryChanged: boolean;
  rooms: FloorPlanRevisionUpdateCounts;
  walls: FloorPlanRevisionUpdateCounts;
  openings: FloorPlanRevisionUpdateCounts;
  structures: FloorPlanRevisionUpdateCounts;
  summary: string;
};

export type FloorPlanRevisionUpdateCandidate = {
  id: string;
  geometryHash: string;
  verificationTier: FloorPlanDocumentV2["verification"]["tier"];
  createdAt: Date | string;
  publishedAt: Date | string | null;
  addressBindings: PersistedFloorPlanAddressBinding[];
};

export type MatchingFloorPlanRevisionUpdate = {
  revision: FloorPlanRevisionUpdateCandidate;
  addressBinding: PersistedFloorPlanAddressBinding;
};

export type FloorPlanRevisionCopyPreservation = {
  mappedRoomCount: number;
  unmappedRoomCount: number;
  preservedItemCount: number;
  skippedItemCount: number;
  preservedFinishRoomCount: number;
  preservedSavedViewCount: number;
};

function normalized(value: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Binding IDs are revision-owned and therefore change on correction. Match the
 * immutable address/stack/orientation tuple instead. Floor ranges are exact,
 * so a revision for another vertical zone is never suggested as an update.
 */
export function isSameFloorPlanAddressBinding(
  current: PersistedFloorPlanAddressBinding,
  candidate: PersistedFloorPlanAddressBinding
) {
  return (
    normalized(current.countryCode) === normalized(candidate.countryCode) &&
    normalized(current.addressNormalized) === normalized(candidate.addressNormalized) &&
    normalized(current.block) === normalized(candidate.block) &&
    normalized(current.street) === normalized(candidate.street) &&
    normalized(current.postalCode) === normalized(candidate.postalCode) &&
    normalized(current.stack) === normalized(candidate.stack) &&
    current.transform === candidate.transform &&
    current.floorMin === candidate.floorMin &&
    current.floorMax === candidate.floorMax
  );
}

/**
 * Selects the one replacement binding that serves the saved consumer unit.
 * Atomic supersede may split one old floor range into several new bindings, so
 * the exact searched floor/stack is preferred when it was captured at apply.
 * Older snapshots without unit context retain the conservative exact-range
 * behavior and never guess between split ranges.
 */
export function floorPlanBindingCoversSavedUnit(
  current: PersistedFloorPlanAddressBinding,
  candidate: PersistedFloorPlanAddressBinding,
  options: {
    allowTransformChange?: boolean;
    allowPostalEvidenceChange?: boolean;
  } = {}
) {
  const postalMatches =
    normalized(current.postalCode) === normalized(candidate.postalCode) ||
    (options.allowPostalEvidenceChange === true &&
      (!normalized(current.postalCode) || !normalized(candidate.postalCode)));
  const sameAddress =
    normalized(current.countryCode) === normalized(candidate.countryCode) &&
    normalized(current.addressNormalized) === normalized(candidate.addressNormalized) &&
    normalized(current.block) === normalized(candidate.block) &&
    normalized(current.street) === normalized(candidate.street) &&
    postalMatches;
  if (!sameAddress) return false;

  const selectedStack = normalized(current.unitStack ?? current.stack);
  const candidateStack = normalized(candidate.stack);
  if (selectedStack) {
    if (candidateStack && candidateStack !== selectedStack) return false;
  } else if (candidateStack) {
    // An older all-stack snapshot has no evidence for choosing one finite stack.
    return false;
  }

  if (Number.isInteger(current.unitFloor)) {
    const floor = current.unitFloor as number;
    if (candidate.floorMin !== null && floor < candidate.floorMin) return false;
    if (candidate.floorMax !== null && floor > candidate.floorMax) return false;
  } else if (
    current.floorMin !== candidate.floorMin ||
    current.floorMax !== candidate.floorMax
  ) {
    return false;
  }

  return options.allowTransformChange === true || current.transform === candidate.transform;
}

function time(value: Date | string | null) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export function findLatestFloorPlanRevisionUpdate(
  input: {
    currentRevisionId: string;
    currentPublishedAt: Date | string | null;
    addressBinding: PersistedFloorPlanAddressBinding;
    candidates: FloorPlanRevisionUpdateCandidate[];
  }
): MatchingFloorPlanRevisionUpdate | null {
  const currentPublishedAt = time(input.currentPublishedAt);
  const matches = input.candidates.flatMap((revision) => {
    if (
      revision.id === input.currentRevisionId ||
      time(revision.publishedAt) <= currentPublishedAt
    ) {
      return [];
    }
    const binding = revision.addressBindings.find((candidate) =>
      floorPlanBindingCoversSavedUnit(input.addressBinding, candidate)
    );
    return binding ? [{ revision, addressBinding: binding }] : [];
  });

  matches.sort((left, right) => {
    const publishedDifference =
      time(right.revision.publishedAt) - time(left.revision.publishedAt);
    if (publishedDifference !== 0) return publishedDifference;
    const createdDifference = time(right.revision.createdAt) - time(left.revision.createdAt);
    if (createdDifference !== 0) return createdDifference;
    return right.revision.id.localeCompare(left.revision.id);
  });
  return matches[0] ?? null;
}

function compareEntityMaps<T>(
  current: Map<string, T>,
  next: Map<string, T>,
  fingerprint: (entity: T) => string
): FloorPlanRevisionUpdateCounts {
  const counts: FloorPlanRevisionUpdateCounts = {
    added: 0,
    removed: 0,
    changed: 0,
    unchanged: 0,
  };
  for (const [id, entity] of current) {
    const candidate = next.get(id);
    if (!candidate) counts.removed += 1;
    else if (fingerprint(entity) === fingerprint(candidate)) counts.unchanged += 1;
    else counts.changed += 1;
  }
  for (const id of next.keys()) {
    if (!current.has(id)) counts.added += 1;
  }
  return counts;
}

function collectEntities<T extends { id: string }>(
  document: FloorPlanDocumentV2,
  select: (floor: FloorPlanDocumentV2["floors"][number]) => T[]
) {
  return new Map(
    document.floors.flatMap((floor) =>
      select(floor).map((entity) => [`${floor.id}:${entity.id}`, entity] as const)
    )
  );
}

function collectWallComparisons(document: FloorPlanDocumentV2) {
  return new Map(
    document.floors.flatMap((floor) => {
      const vertexById = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
      return floor.walls.map((wall) => {
        const vertexIds = wall.path.kind === "arc"
          ? [wall.path.startVertexId, wall.path.centerVertexId, wall.path.endVertexId]
          : [wall.path.startVertexId, wall.path.endVertexId];
        return [`${floor.id}:${wall.id}`, {
          ...wall,
          resolvedVertices: vertexIds.map((id) => {
            const vertex = vertexById.get(id);
            return vertex ? { id, xMm: vertex.xMm, zMm: vertex.zMm } : { id };
          }),
        }] as const;
      });
    })
  );
}

function collectStructureComparisons(document: FloorPlanDocumentV2) {
  return new Map(
    document.floors.flatMap((floor) => {
      const vertexById = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
      return floor.structures.map((structure) => [
        `${floor.id}:${structure.id}`,
        {
          ...structure,
          resolvedVertices: structure.vertexIds.map((id) => {
            const vertex = vertexById.get(id);
            return vertex ? { id, xMm: vertex.xMm, zMm: vertex.zMm } : { id };
          }),
        },
      ] as const);
    })
  );
}

function jsonFingerprint(value: unknown) {
  return JSON.stringify(value);
}

function describeCounts(label: string, counts: FloorPlanRevisionUpdateCounts) {
  const changed = counts.added + counts.removed + counts.changed;
  return changed > 0 ? `${changed} ${label}${changed === 1 ? "" : "s"}` : null;
}

export function compareFloorPlanRevisions(
  current: FloorPlanDocumentV2,
  next: FloorPlanDocumentV2
): FloorPlanRevisionUpdateDiff {
  const currentDocument = current;
  const nextDocument = next;

  const rooms = compareEntityMaps(
    collectEntities(currentDocument, (floor) => floor.rooms),
    collectEntities(nextDocument, (floor) => floor.rooms),
    (room) => jsonFingerprint({
      name: room.name,
      roomType: room.roomType,
      wallLoops: room.wallLoops,
    })
  );
  const walls = compareEntityMaps(
    collectWallComparisons(currentDocument),
    collectWallComparisons(nextDocument),
    (wall) => jsonFingerprint({
      path: wall.path,
      resolvedVertices: wall.resolvedVertices,
      thicknessMm: wall.thicknessMm,
      heightMm: wall.heightMm,
      baseOffsetMm: wall.baseOffsetMm,
      classification: wall.classification,
      adjacentRoomIds: wall.adjacentRoomIds,
    })
  );
  const openings = compareEntityMaps(
    collectEntities(currentDocument, (floor) => floor.openings),
    collectEntities(nextDocument, (floor) => floor.openings),
    (opening) => jsonFingerprint({
      wallId: opening.wallId,
      kind: opening.kind,
      operation: opening.operation,
      offsetMm: opening.offsetMm,
      widthMm: opening.widthMm,
      heightMm: opening.heightMm,
      sillHeightMm: opening.sillHeightMm,
      hinge: opening.hinge,
      handing: opening.handing,
    })
  );
  const structures = compareEntityMaps(
    collectStructureComparisons(currentDocument),
    collectStructureComparisons(nextDocument),
    (structure) => jsonFingerprint({
      name: structure.name,
      kind: structure.kind,
      vertexIds: structure.vertexIds,
      resolvedVertices: structure.resolvedVertices,
      baseOffsetMm: structure.baseOffsetMm,
      heightMm: structure.heightMm,
      locked: structure.locked,
    })
  );
  const differences = [
    describeCounts("room", rooms),
    describeCounts("wall", walls),
    describeCounts("opening", openings),
    describeCounts("structure", structures),
  ].filter((entry): entry is string => Boolean(entry));

  return {
    geometryChanged: differences.length > 0,
    rooms,
    walls,
    openings,
    structures,
    summary: differences.length > 0 ? differences.join(" · ") : "Metadata-only revision",
  };
}

export function buildUpdatedFloorPlanDesignCopy(input: {
  currentSnapshot: DesignSnapshot;
  nextDocument: FloorPlanDocumentV2;
  nextGeometryHash: string;
  addressBinding: PersistedFloorPlanAddressBinding;
  title: string;
}) {
  const currentRoomIdCounts = new Map<string, number>();
  for (const room of input.currentSnapshot.rooms) {
    currentRoomIdCounts.set(room.id, (currentRoomIdCounts.get(room.id) ?? 0) + 1);
  }
  const nextRoomIdCounts = new Map<string, number>();
  for (const floor of input.nextDocument.floors) {
    for (const room of floor.rooms) {
      nextRoomIdCounts.set(room.id, (nextRoomIdCounts.get(room.id) ?? 0) + 1);
    }
  }
  const duplicateNextIds = Array.from(nextRoomIdCounts)
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
  if (duplicateNextIds.length > 0) {
    throw new Error(
      `The newer revision has ambiguous room IDs: ${duplicateNextIds.join(", ")}. It must be corrected before creating a consumer copy.`
    );
  }
  const mappedRooms = input.currentSnapshot.rooms.filter(
    (room) =>
      currentRoomIdCounts.get(room.id) === 1 && nextRoomIdCounts.get(room.id) === 1
  );
  const mappedRoomIds = new Set(mappedRooms.map((room) => room.id));
  const unmappedRooms = input.currentSnapshot.rooms.filter(
    (room) => !mappedRoomIds.has(room.id)
  );
  const safeBaseSnapshot: DesignSnapshot = {
    ...input.currentSnapshot,
    rooms: mappedRooms,
    floorPlan: input.currentSnapshot.floorPlan
      ? {
          ...input.currentSnapshot.floorPlan,
          orientationConfirmed:
            input.currentSnapshot.floorPlan.addressTransform ===
            input.addressBinding.transform
              ? input.currentSnapshot.floorPlan.orientationConfirmed
              : false,
        }
      : undefined,
  };
  const result = canonicalFloorPlanToDesignSnapshot(input.nextDocument, {
    baseSnapshot: safeBaseSnapshot,
    title: input.title,
    addressTransform: input.addressBinding.transform,
    addressBinding: input.addressBinding,
    sourceRevisionGeometryHash: input.nextGeometryHash,
    sourceAssetSha256: input.nextDocument.sources[0]?.sha256,
  });

  const preservation: FloorPlanRevisionCopyPreservation = {
    mappedRoomCount: mappedRooms.length,
    unmappedRoomCount: unmappedRooms.length,
    preservedItemCount: mappedRooms.reduce((count, room) => count + room.items.length, 0),
    skippedItemCount: unmappedRooms.reduce((count, room) => count + room.items.length, 0),
    preservedFinishRoomCount: mappedRooms.filter((room) =>
      Boolean(room.surfaces ?? room.surfaceFinishes)
    ).length,
    preservedSavedViewCount: mappedRooms.reduce(
      (count, room) => count + room.savedViews.length,
      0
    ),
  };

  const currentRoomById = new Map(mappedRooms.map((room) => [room.id, room]));
  // Defensive assertion: only a unique stable canonical ID may carry content.
  for (const room of result.snapshot.rooms) {
    if (!currentRoomById.has(room.id)) continue;
    const previous = currentRoomById.get(room.id)!;
    if (room.items !== previous.items || room.savedViews !== previous.savedViews) {
      throw new Error(`Room-scoped content was not preserved for stable room ${room.id}`);
    }
  }

  return { ...result, preservation };
}
