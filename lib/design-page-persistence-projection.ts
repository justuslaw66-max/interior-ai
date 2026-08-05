import { CATALOG_ITEMS } from "@/lib/catalog";
import { enrichDesignSnapshotProductSnapshots } from "@/lib/design-item-product-snapshot";
import type { LoadedDesignTransport } from "@/lib/design-api-client";
import { migrateDesignDocument } from "@/lib/design-document-migrations";
import {
  reconcileZonesForItems,
  updateActiveRoomZones,
} from "@/lib/design-page-zone-orchestration";
import {
  legacyApiToSnapshot,
  isPersistableFloorPlanAssetUrl,
  snapshotToStored,
  storedToSnapshot,
  type StoredDesign,
} from "@/lib/room-persistence";
import type {
  DesignSnapshot,
  PersistedFloorPlanState,
} from "@/lib/room-types";
import { fingerprintDesignSnapshot } from "@/lib/snapshot-fingerprint";

export class DesignPageCloudNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DesignPageCloudNormalizationError";
  }
}

function normalizePersistedFloorPlan(
  source: PersistedFloorPlanState | undefined
): PersistedFloorPlanState | undefined {
  if (!source) return undefined;
  const underlay = source.underlay &&
    isPersistableFloorPlanAssetUrl(source.underlay.assetUrl)
    ? {
        ...source.underlay,
        opacity:
          typeof source.underlay.opacity === "number"
            ? source.underlay.opacity
            : 0.45,
        visible: source.underlay.visible ?? true,
        locked: source.underlay.locked ?? true,
      }
    : null;
  const annotations = Array.isArray(source.annotations) ? source.annotations : [];
  const openings = Array.isArray(source.openings) ? source.openings : [];
  const fixedElements = Array.isArray(source.fixedElements)
    ? source.fixedElements
    : [];

  if (
    !underlay &&
    annotations.length === 0 &&
    openings.length === 0 &&
    fixedElements.length === 0 &&
    !source.canonicalDocument
  ) {
    return undefined;
  }
  return { ...source, underlay, annotations, openings, fixedElements };
}

function normalizeActiveRoomZones(snapshot: DesignSnapshot): DesignSnapshot {
  const activeRoom = snapshot.rooms.find(
    (room) => room.id === snapshot.activeRoomId
  );
  if (!activeRoom) return snapshot;
  return updateActiveRoomZones(
    snapshot,
    reconcileZonesForItems({
      zones: activeRoom.zones,
      allItems: activeRoom.items,
      catalogItems: CATALOG_ITEMS,
    })
  );
}

export function projectCanonicalDesignPersistence(
  snapshot: DesignSnapshot,
  options: {
    floorPlan?: PersistedFloorPlanState;
    enrichProducts?: boolean;
  } = {}
): { snapshot: DesignSnapshot; stored: StoredDesign; fingerprint: string } {
  const floorPlan = Object.prototype.hasOwnProperty.call(options, "floorPlan")
    ? options.floorPlan
    : normalizePersistedFloorPlan(snapshot.floorPlan);
  const nextSnapshot: DesignSnapshot = { ...snapshot };
  if (floorPlan) nextSnapshot.floorPlan = floorPlan;
  else delete nextSnapshot.floorPlan;

  const enriched = options.enrichProducts === false
    ? nextSnapshot
    : enrichDesignSnapshotProductSnapshots(nextSnapshot, CATALOG_ITEMS);
  const normalized = normalizeActiveRoomZones(enriched);
  const migrated = migrateDesignDocument(snapshotToStored(normalized));
  if (!migrated.ok) {
    throw new DesignPageCloudNormalizationError(migrated.error.message);
  }
  const canonicalSnapshot = storedToSnapshot(migrated.document);
  return {
    snapshot: canonicalSnapshot,
    stored: migrated.document,
    fingerprint: fingerprintDesignSnapshot(canonicalSnapshot),
  };
}

export function normalizeLoadedCloudDesign(
  data: LoadedDesignTransport,
  expectedDesignId: string = data.id
): {
  snapshot: DesignSnapshot;
  stored: StoredDesign;
  fingerprint: string;
  revision: string;
} {
  if (data.id !== expectedDesignId) {
    throw new DesignPageCloudNormalizationError(
      "Cloud design normalization received a mismatched design identity."
    );
  }
  const revision = typeof data.updatedAt === "string"
    ? data.updatedAt.trim()
    : "";
  if (!revision || !Number.isFinite(Date.parse(revision))) {
    throw new DesignPageCloudNormalizationError(
      "Cloud design normalization requires a valid loaded revision."
    );
  }

  let snapshot: DesignSnapshot;
  if (data.snapshot !== undefined && data.snapshot !== null) {
    const migrated = migrateDesignDocument(data.snapshot);
    if (!migrated.ok) {
      throw new DesignPageCloudNormalizationError(migrated.error.message);
    }
    snapshot = storedToSnapshot(migrated.document);
  } else {
    snapshot = legacyApiToSnapshot({ ...data, snapshot: undefined });
  }
  return { ...projectCanonicalDesignPersistence(snapshot), revision };
}
