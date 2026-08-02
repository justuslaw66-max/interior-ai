import { projectPublicFloorPlanDocumentV2 } from "@/lib/floor-plan-imports/public-document";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import {
  sanitizeStoredDesign,
  type StoredDesign,
} from "@/lib/room-persistence";
import type {
  DesignSnapshot,
  PersistedFloorPlanState,
} from "@/lib/room-types";

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function projectSharedCanonicalDocument(
  floorPlan: PersistedFloorPlanState
) {
  if (!floorPlan.canonicalDocument) return undefined;
  const publicDocument = projectPublicFloorPlanDocumentV2(
    floorPlan.canonicalDocument,
    floorPlan.canonicalGeometryHash
  );
  const geometryHash =
    floorPlan.canonicalGeometryHash ??
    compileFloorPlanDocumentV2(publicDocument).geometryHash;
  const sharedDocumentId = `shared-floor-plan-${geometryHash}`;
  const {
    parentRevisionId: _privateParentRevisionId,
    ...documentWithoutPrivateLineage
  } = publicDocument;

  return {
    ...documentWithoutPrivateLineage,
    id: sharedDocumentId,
    revisionId: sharedDocumentId,
    verification: {
      ...publicDocument.verification,
      criticalIssueIds: [],
    },
  };
}

function projectSharedFloorPlanState(
  floorPlan: PersistedFloorPlanState | undefined
): PersistedFloorPlanState | undefined {
  if (!floorPlan) return undefined;

  const canonicalDocument = projectSharedCanonicalDocument(floorPlan);
  const publicStructureById = new Map(
    canonicalDocument?.floors.flatMap((floor) =>
      floor.structures.map((structure) => [structure.id, structure] as const)
    ) ?? []
  );

  const projected: PersistedFloorPlanState = {
    ...(floorPlan.annotations
      ? { annotations: cloneJson(floorPlan.annotations) }
      : {}),
    ...(floorPlan.openings
      ? {
          openings: cloneJson(floorPlan.openings).map((opening) => {
            const { evidence: _privateEvidence, ...safeOpening } = opening;
            return safeOpening;
          }),
        }
      : {}),
    ...(floorPlan.fixedElements
      ? {
          fixedElements: cloneJson(floorPlan.fixedElements).map((element) => {
            const canonicalStructure = publicStructureById.get(element.id);
            const { label: _privateLabel, canonicalKind: _privateKind, ...safeElement } =
              element;
            return {
              ...safeElement,
              label: canonicalStructure?.name ?? "Plan Element",
              ...(canonicalStructure
                ? { canonicalKind: canonicalStructure.kind }
                : {}),
            };
          }),
        }
      : {}),
    ...(canonicalDocument ? { canonicalDocument } : {}),
    ...(floorPlan.canonicalGeometryHash
      ? { canonicalGeometryHash: floorPlan.canonicalGeometryHash }
      : {}),
    ...(floorPlan.verificationTier
      ? { verificationTier: floorPlan.verificationTier }
      : {}),
    ...(floorPlan.orientationConfirmed === undefined
      ? {}
      : { orientationConfirmed: floorPlan.orientationConfirmed }),
  };

  // Deliberately omit the private underlay, import/address/review provenance,
  // and all original source or revision linkage. None is needed to render,
  // export, or duplicate a shared design.
  return projected;
}

type SharedRoom = StoredDesign["rooms"][number];

function projectSharedRooms(
  rooms: SharedRoom[],
  floorPlan: PersistedFloorPlanState | undefined
): SharedRoom[] {
  const canonicalRooms = new Map(
    floorPlan?.canonicalDocument?.floors.flatMap((floor) =>
      floor.rooms.map((room) => [room.id, { room, floor }] as const)
    ) ?? []
  );
  const publicRoomTypes = new Set([
    "living",
    "bedroom",
    "dining",
    "kitchen",
    "toilet",
    "custom",
  ]);

  return rooms.map((room) => {
    const canonical = canonicalRooms.get(room.id);
    return {
      ...room,
      name: canonical?.room.name ?? room.name,
      roomType: publicRoomTypes.has(room.roomType) ? room.roomType : "custom",
      ...(canonical ? { floorLabel: canonical.floor.name } : {}),
    };
  });
}

/**
 * Returns the snapshot shape allowed to cross a non-owner share-token boundary.
 * Furniture, finishes, room geometry and saved views are cloned unchanged.
 */
export function projectSharedDesignSnapshot(
  snapshot: DesignSnapshot
): DesignSnapshot {
  const cloned = cloneJson(snapshot);
  const floorPlan = projectSharedFloorPlanState(cloned.floorPlan);
  cloned.rooms = projectSharedRooms(cloned.rooms as SharedRoom[], floorPlan) as DesignSnapshot["rooms"];
  if (floorPlan) cloned.floorPlan = floorPlan;
  else delete cloned.floorPlan;
  return cloned;
}

/** Stored-design equivalent used before a share recipient creates a copy. */
export function projectSharedStoredDesign(value: unknown): StoredDesign | null {
  const stored = sanitizeStoredDesign(value);
  if (!stored) return null;
  const floorPlan = projectSharedFloorPlanState(stored.floorPlan);
  stored.rooms = projectSharedRooms(stored.rooms, floorPlan);
  if (floorPlan) stored.floorPlan = floorPlan;
  else delete stored.floorPlan;
  return stored;
}
