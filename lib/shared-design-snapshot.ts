import { projectPublicFloorPlanDocumentV2 } from "@/lib/floor-plan-imports/public-document";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import {
  legacyApiToSnapshot,
  sanitizeStoredDesign,
  snapshotToStored,
  type StoredDesign,
} from "@/lib/room-persistence";
import type {
  DesignItem,
  DesignSnapshot,
  PersistedFloorPlanState,
  SavedView,
  ZoneMin,
} from "@/lib/room-types";
import {
  assertSharedDesignInput,
  assertSharedDesignSnapshotPublic,
  removeLegacySharedDesignRootFields,
  resolveSharedDesignPresentation,
} from "@/lib/shared-design-projection-schema";

export { assertSharedDesignSnapshotPublic } from "@/lib/shared-design-projection-schema";

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
  assertSharedDesignInput(snapshot);
  const cloned = cloneJson(snapshot);
  const floorPlan = projectSharedFloorPlanState(cloned.floorPlan);
  cloned.rooms = projectSharedRooms(cloned.rooms as SharedRoom[], floorPlan) as DesignSnapshot["rooms"];
  if (floorPlan) cloned.floorPlan = floorPlan;
  else delete cloned.floorPlan;
  removeLegacySharedDesignRootFields(cloned);
  assertSharedDesignSnapshotPublic(cloned);
  return cloned;
}

/** Stored-design equivalent used before a share recipient creates a copy. */
export function projectSharedStoredDesign(value: unknown): StoredDesign | null {
  const stored = sanitizeStoredDesign(value);
  if (!stored) return null;
  assertSharedDesignInput(stored);
  const floorPlan = projectSharedFloorPlanState(stored.floorPlan);
  stored.rooms = projectSharedRooms(stored.rooms, floorPlan);
  if (floorPlan) stored.floorPlan = floorPlan;
  else delete stored.floorPlan;
  removeLegacySharedDesignRootFields(stored);
  assertSharedDesignSnapshotPublic(stored);
  return stored;
}

export type SharedDesignTransportProjection = {
  snapshot: StoredDesign;
  title: string;
  roomWidth: number;
  roomDepth: number;
  items: DesignItem[];
  zones: ZoneMin[];
  savedViews: SavedView[];
  style: string | null;
  budget: string | null;
  mode: "homeowner" | "designer";
  notes: string | null;
};

export type SharedDesignTransportInput = {
  id: string;
  title?: string | null;
  roomWidth: number;
  roomDepth: number;
  items: unknown;
  zones?: unknown;
  savedViews?: unknown;
  snapshot?: unknown;
  style?: string | null;
  budget?: string | null;
  mode?: string | null;
  notes?: string | null;
};

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function legacyPublicItems(value: unknown): DesignItem[] {
  return (Array.isArray(value) ? value : []).map((entry, index) => {
    const item = recordValue(entry);
    const instanceId =
      typeof item.instanceId === "string"
        ? item.instanceId
        : typeof item.id === "string"
          ? item.id
          : `legacy-item-${index + 1}`;
    return {
      ...item,
      instanceId,
      productId:
        typeof item.productId === "string"
          ? item.productId
          : typeof item.type === "string"
            ? item.type
            : "legacy-item",
      variantId: typeof item.variantId === "string" ? item.variantId : "legacy",
      position: Array.isArray(item.position) && item.position.length === 3
        ? item.position as [number, number, number]
        : [
            finiteNumber(item.x, 0),
            0,
            finiteNumber(item.z, finiteNumber(item.y, 0)),
          ],
      rotationY: finiteNumber(item.rotationY, 0),
    } as DesignItem;
  });
}

function legacyPublicZones(value: unknown): ZoneMin[] {
  return (Array.isArray(value) ? value : []).map((entry, index) => {
    const zone = recordValue(entry);
    const type = ["seating", "reading", "tv", "dining"].includes(String(zone.type))
      ? zone.type as ZoneMin["type"]
      : "seating";
    return {
      ...zone,
      id: typeof zone.id === "string" ? zone.id : `legacy-zone-${index + 1}`,
      type,
      itemIds: Array.isArray(zone.itemIds)
        ? zone.itemIds.filter((itemId): itemId is string => typeof itemId === "string")
        : [],
    } as ZoneMin;
  });
}

function legacyPublicSavedViews(value: unknown): SavedView[] {
  return (Array.isArray(value) ? value : []).map((entry, index) => {
    const view = recordValue(entry);
    return {
      ...view,
      id: typeof view.id === "string" ? view.id : `legacy-view-${index + 1}`,
      name: typeof view.name === "string" ? view.name : `View ${index + 1}`,
      cameraPosition: Array.isArray(view.cameraPosition) && view.cameraPosition.length === 3
        ? view.cameraPosition as [number, number, number]
        : [0, 2, 4],
      cameraTarget: Array.isArray(view.cameraTarget) && view.cameraTarget.length === 3
        ? view.cameraTarget as [number, number, number]
        : [0, 0, 0],
    } as SavedView;
  });
}

function projectLegacyDesignTransport(data: SharedDesignTransportInput) {
  return snapshotToStored(projectSharedDesignSnapshot(legacyApiToSnapshot({
    id: data.id,
    title: data.title ?? undefined,
    roomWidth: data.roomWidth,
    roomDepth: data.roomDepth,
    items: legacyPublicItems(data.items),
    zones: legacyPublicZones(data.zones),
    savedViews: legacyPublicSavedViews(data.savedViews),
    style: data.style ?? undefined,
    budget: data.budget ?? undefined,
    mode: data.mode ?? undefined,
    notes: data.notes ?? undefined,
  })));
}

/** Canonical adapter for public reads and copies of legacy or v3 API designs. */
export function projectSharedDesignTransport(
  data: SharedDesignTransportInput
): SharedDesignTransportProjection {
  const projectedStored =
    projectSharedStoredDesign(data.snapshot) ??
    projectLegacyDesignTransport(data);

  // Older v3 rows may keep presentation metadata only in the legacy columns.
  // Resolve those fields through the same constrained read model used by
  // owner/client preview, then make the snapshot the sole public source.
  const presentation = resolveSharedDesignPresentation(projectedStored, data);
  projectedStored.title = presentation.title;
  if (presentation.style === null) delete projectedStored.style;
  else projectedStored.style = presentation.style;
  if (presentation.budget === null) delete projectedStored.budget;
  else projectedStored.budget = presentation.budget;
  if (presentation.notes === null) delete projectedStored.notes;
  else projectedStored.notes = presentation.notes;
  assertSharedDesignSnapshotPublic(projectedStored);

  const activeRoom =
    projectedStored.rooms.find((room) => room.id === projectedStored.activeRoomId) ??
    projectedStored.rooms[0];
  if (!activeRoom) {
    throw new Error("Shared design projection requires an active public room");
  }

  return {
    snapshot: projectedStored,
    title: projectedStored.title,
    roomWidth: activeRoom.geometry.width,
    roomDepth: activeRoom.geometry.depth,
    items: activeRoom.items,
    zones: activeRoom.zones,
    savedViews: activeRoom.savedViews,
    style: projectedStored.style ?? null,
    budget: projectedStored.budget ?? null,
    mode: data.mode === "designer" ? "designer" : "homeowner",
    notes: projectedStored.notes ?? null,
  };
}
