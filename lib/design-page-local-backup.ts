import type { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
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
  const validVariant = product
    ? product.variants.some((variant) => variant.id === item.variantId)
      ? item.variantId
      : product.defaultVariantId
    : item.variantId;

  return {
    ...item,
    variantId: validVariant,
    position: item.position ?? [0, 0, 0],
    qty: typeof item.qty === "number" && item.qty > 0 ? item.qty : 1,
    includeInCheckout: item.includeInCheckout ?? true,
    locked: Boolean(item.locked),
  };
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
  const parsed = JSON.parse(rawBackup) as ParsedLocalBackup;
  const savedViews = sanitizeDesignPageSavedViews(parsed.savedViews);

  if (parsed.version === 3 && Array.isArray(parsed.rooms)) {
    const restored = storedToSnapshot(parsed as StoredDesign);
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
        format: "v3",
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
      format: "v3",
      snapshot,
      savedViews,
      cloudDesignId:
        typeof parsed.designId === "string" && parsed.designId.trim()
          ? parsed.designId
          : null,
    };
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
