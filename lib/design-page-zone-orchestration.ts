import {
  getActiveRoom,
  updateRoom,
  type DesignItem,
  type DesignSnapshot,
  type ZoneMin,
} from "@/lib/room-types";
import type { CATALOG_ITEMS } from "@/lib/catalog";
import {
  buildAutoZones,
  computeZoneAnchor,
  normalizeZones,
} from "@/lib/design-page-zone-layout";

type BuildManualZoneFromSelectionParams = {
  selectedSet: Set<string>;
  selectedItems: DesignItem[];
  pendingZoneType: ZoneMin["type"];
  existingZones: ZoneMin[];
};

export function buildManualZoneFromSelection(
  params: BuildManualZoneFromSelectionParams
): { zoneId: string; manualZones: ZoneMin[] } | null {
  const { selectedSet, selectedItems, pendingZoneType, existingZones } = params;
  if (!selectedSet.size || !selectedItems.length) return null;

  const zoneId = `zone-${Date.now().toString(36)}`;
  const itemIds = selectedItems.map((item) => item.instanceId);
  const anchor = computeZoneAnchor(selectedItems);
  const newZone: ZoneMin = {
    id: zoneId,
    type: pendingZoneType,
    itemIds,
    anchor,
    source: "manual",
  };

  const manualZones = existingZones
    .filter((zone) => zone.source === "manual")
    .map((zone) => ({
      ...zone,
      itemIds: zone.itemIds.filter((id) => !selectedSet.has(id)),
    }))
    .filter((zone) => zone.itemIds.length > 0);

  return {
    zoneId,
    manualZones: [...manualZones, newZone],
  };
}

type BuildAutoSeatingZoneParams = {
  sofaItem: DesignItem;
  existingZones: ZoneMin[];
};

export function buildAutoSeatingZone(
  params: BuildAutoSeatingZoneParams
): { zoneId: string; manualZones: ZoneMin[] } | null {
  const { sofaItem, existingZones } = params;
  if (existingZones.some((zone) => zone.type === "seating")) return null;

  const zoneId = `zone-${Date.now().toString(36)}`;
  const newZone: ZoneMin = {
    id: zoneId,
    type: "seating",
    itemIds: [sofaItem.instanceId],
    anchor: computeZoneAnchor([sofaItem]),
    source: "manual",
  };

  return {
    zoneId,
    manualZones: [
      ...existingZones.filter((zone) => zone.source === "manual"),
      newZone,
    ],
  };
}

type ReconcileZonesParams = {
  zones: ZoneMin[];
  allItems: DesignItem[];
  catalogItems: typeof CATALOG_ITEMS;
};

export function reconcileZonesForItems({
  zones,
  allItems,
  catalogItems,
}: ReconcileZonesParams): ZoneMin[] {
  const normalizedZones = normalizeZones(zones, allItems);
  const manualZones = normalizedZones.filter(
    (zone) => zone.source === "manual"
  );
  const autoZones = buildAutoZones({
    allItems,
    manualZones,
    catalogItems,
  });

  return [...manualZones, ...autoZones];
}

export function updateActiveRoomZones(
  snapshot: DesignSnapshot,
  zones: ZoneMin[]
): DesignSnapshot {
  const activeRoom = getActiveRoom(snapshot);
  if (!activeRoom) return snapshot;

  return updateRoom(snapshot, {
    ...activeRoom,
    zones,
  });
}
