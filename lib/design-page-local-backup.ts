import type { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { enrichDesignItemProductSnapshot } from "@/lib/design-item-product-snapshot";
import {
  assertLocalBackupWithinSizeLimit,
  DesignPageLocalBackupError,
  getLocalBackupSourceVersion,
} from "@/lib/design-page-local-backup-recovery";
import { migrateDesignDocument } from "@/lib/design-document-migrations";
import {
  ROOM_DIMENSION_DEFAULTS,
  resolveHouseRoomDimension,
} from "@/lib/design-page-house-plan";
import { normalizeItemsToRoom } from "@/lib/design-page-zone-layout";
import {
  storedToSnapshot,
  type StoredDesign,
} from "@/lib/room-persistence";
import {
  migrateToV3,
  type DesignItem,
  type DesignSnapshot,
  type ZoneMin,
} from "@/lib/room-types";
import type { NamedCameraView } from "@/lib/design-page-types";
import { sanitizeDesignPageSavedViews } from "@/lib/useDesignPagePersistence";
import {
  isParametricCabinetItem,
  normalizeCabinetDesignItem,
} from "@/features/cabinetry/designItemAdapters";

type ResolveConfiguredPlanningDimsMm = (
  item: DesignItem,
  fallbackProduct: CatalogItemSchema
) => { w: number; d: number; h: number };

type ParsedLocalBackup = {
  items?: DesignItem[];
  zones?: ZoneMin[];
  savedViews?: NamedCameraView[];
  roomWidth?: number;
  roomDepth?: number;
  rooms?: StoredDesign["rooms"];
  activeRoomId?: string;
  designId?: string | null;
  version?: number;
};

export type NormalizeDesignPageLocalBackupInput = {
  rawBackup: string;
  state: {
    activeRoomId: string;
    roomWidth: number;
    roomDepth: number;
    wallThickness: number;
  };
  configuration: {
    catalogItems: typeof CATALOG_ITEMS;
    resolveConfiguredPlanningDimsMm: ResolveConfiguredPlanningDimsMm;
  };
};

export type NormalizedDesignPageLocalBackup = {
  format: "v3" | "legacy";
  snapshot: DesignSnapshot | null;
  savedViews: NamedCameraView[];
  cloudDesignId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePersistedItem({
  item,
  roomId,
  catalogItems,
}: {
  item: DesignItem;
  roomId: string;
  catalogItems: typeof CATALOG_ITEMS;
}): DesignItem {
  if (isParametricCabinetItem(item)) {
    return normalizeCabinetDesignItem(item, {
      dropTemporaryGlbUrls: true,
      roomId,
    }) as DesignItem;
  }

  const product = catalogItems[item.productId];
  const hasSavedVisualIdentity =
    item.productSnapshot?.productId === item.productId &&
    item.productSnapshot.variantId === item.variantId;
  const validVariant = hasSavedVisualIdentity
    ? item.variantId
    : product
      ? product.variants.some((variant) => variant.id === item.variantId)
        ? item.variantId
        : product.defaultVariantId
      : item.variantId;

  return enrichDesignItemProductSnapshot({
    ...item,
    variantId: validVariant,
    position: item.position ?? [0, 0, 0],
    qty: typeof item.qty === "number" && item.qty > 0 ? item.qty : 1,
    includeInCheckout: item.includeInCheckout ?? true,
    locked: Boolean(item.locked),
  }, catalogItems);
}
function normalizePersistedItems({
  items,
  roomId,
  width,
  depth,
  wallThickness,
  catalogItems,
  resolveConfiguredPlanningDimsMm,
}: {
  items: DesignItem[];
  roomId: string;
  width: number;
  depth: number;
  wallThickness: number;
  catalogItems: typeof CATALOG_ITEMS;
  resolveConfiguredPlanningDimsMm: ResolveConfiguredPlanningDimsMm;
}) {
  const cleanedItems = items
    .map((item) => normalizePersistedItem({ item, roomId, catalogItems }));

  return normalizeItemsToRoom({
    items: cleanedItems,
    width,
    depth,
    wall: wallThickness,
    catalogItems,
    resolveConfiguredPlanningDimsMm,
  });
}

export function normalizeDesignPageLocalBackup({
  rawBackup,
  state: { activeRoomId, roomWidth, roomDepth, wallThickness },
  configuration: { catalogItems, resolveConfiguredPlanningDimsMm },
}: NormalizeDesignPageLocalBackupInput): NormalizedDesignPageLocalBackup {
  assertLocalBackupWithinSizeLimit(rawBackup);
  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(rawBackup);
  } catch {
    throw new DesignPageLocalBackupError(
      "INVALID_JSON",
      "Local design backup is not valid JSON.",
      "unparseable"
    );
  }
  if (!isRecord(parsedValue)) {
    throw new DesignPageLocalBackupError(
      "INVALID_DOCUMENT",
      "Local design backup must be a document object.",
      "unversioned"
    );
  }
  const parsed = parsedValue as ParsedLocalBackup;
  const savedViews = sanitizeDesignPageSavedViews(parsed.savedViews);

  if (
    parsed.version === 1 ||
    parsed.version === 2 ||
    parsed.version === 3
  ) {
    const migrated = migrateDesignDocument(parsed);
    if (!migrated.ok) {
      throw new DesignPageLocalBackupError(
        migrated.error.code,
        migrated.error.message,
        migrated.error.sourceVersion
      );
    }
    const restored = storedToSnapshot(migrated.document);
    const restoredRooms = restored.rooms.map((room) => {
      const nextWidth = resolveHouseRoomDimension(
        room.geometry.width,
        ROOM_DIMENSION_DEFAULTS.width
      );
      const nextDepth = resolveHouseRoomDimension(
        room.geometry.depth,
        ROOM_DIMENSION_DEFAULTS.depth
      );
      const nextWallThickness =
        typeof room.geometry.wallThickness === "number" &&
        Number.isFinite(room.geometry.wallThickness)
          ? room.geometry.wallThickness
          : ROOM_DIMENSION_DEFAULTS.wallThickness;

      return {
        ...room,
        geometry: {
          ...room.geometry,
          width: nextWidth,
          depth: nextDepth,
          wallThickness: nextWallThickness,
        },
        items: normalizePersistedItems({
          items: room.items || [],
          roomId: room.id,
          width: nextWidth,
          depth: nextDepth,
          wallThickness: nextWallThickness,
          catalogItems,
          resolveConfiguredPlanningDimsMm,
        }),
        zones: Array.isArray(room.zones) ? room.zones : [],
        savedViews: Array.isArray(room.savedViews) ? room.savedViews : [],
      };
    });

    if (restoredRooms.length === 0) {
      return {
        format: parsed.version === 3 ? "v3" : "legacy",
        snapshot: null,
        savedViews,
        cloudDesignId: null,
      };
    }

    const activeRoomExists = restoredRooms.some(
      (room) => room.id === restored.activeRoomId
    );
    const snapshot: DesignSnapshot = {
      ...restored,
      rooms: restoredRooms,
      activeRoomId: activeRoomExists
        ? restored.activeRoomId
        : restoredRooms[0].id,
    };

    return {
      format: parsed.version === 3 ? "v3" : "legacy",
      snapshot,
      savedViews,
      cloudDesignId:
        typeof parsed.designId === "string" && parsed.designId.trim()
          ? parsed.designId
          : null,
    };
  }

  if (parsed.version !== undefined) {
    throw new DesignPageLocalBackupError(
      "UNSUPPORTED_VERSION",
      "Unsupported local design backup version.",
      getLocalBackupSourceVersion(rawBackup)
    );
  }

  if (
    !Array.isArray(parsed.items) ||
    (parsed.zones !== undefined && !Array.isArray(parsed.zones)) ||
    (parsed.savedViews !== undefined && !Array.isArray(parsed.savedViews)) ||
    (parsed.roomWidth !== undefined &&
      (typeof parsed.roomWidth !== "number" ||
        !Number.isFinite(parsed.roomWidth) ||
        parsed.roomWidth <= 0)) ||
    (parsed.roomDepth !== undefined &&
      (typeof parsed.roomDepth !== "number" ||
        !Number.isFinite(parsed.roomDepth) ||
        parsed.roomDepth <= 0))
  ) {
    throw new DesignPageLocalBackupError(
      "INVALID_DOCUMENT",
      "Unversioned local backup does not match the supported legacy format.",
      "unversioned"
    );
  }

  const persistedRoomWidth = resolveHouseRoomDimension(
    parsed.roomWidth,
    roomWidth
  );
  const persistedRoomDepth = resolveHouseRoomDimension(
    parsed.roomDepth,
    roomDepth
  );
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const normalizedItems = normalizePersistedItems({
    items,
    roomId: activeRoomId,
    width: persistedRoomWidth,
    depth: persistedRoomDepth,
    wallThickness,
    catalogItems,
    resolveConfiguredPlanningDimsMm,
  });

  const snapshot =
    normalizedItems.length > 0
      ? migrateToV3({
          items: normalizedItems,
          zones: parsed.zones ?? [],
          roomBounds: {
            width: persistedRoomWidth,
            depth: persistedRoomDepth,
            wallThickness,
          },
        } as unknown as DesignSnapshot)
      : null;

  return {
    format: "legacy",
    snapshot,
    savedViews,
    cloudDesignId: null,
  };
}
