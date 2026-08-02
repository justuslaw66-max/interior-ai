import type {
  DesignItem,
  LayoutVersion,
  LayoutVersionSource,
  RoomSnapshot,
  ZoneMin,
} from "@/lib/room-types";

export const MAX_ROOM_LAYOUT_VERSIONS = 8;

export interface LayoutVersionComparison {
  currentItemCount: number;
  savedItemCount: number;
  itemDelta: number;
  addedCount: number;
  removedCount: number;
  movedCount: number;
  rotatedCount: number;
  zoneDelta: number;
}

export interface LayoutVersionComparisonSummary {
  itemDeltaLabel: string;
  movementLabel: string;
  zoneDeltaLabel: string;
  restoreLabel: string;
}

function cloneDesignItems(items: DesignItem[]): DesignItem[] {
  return items.map((item) => ({
    ...item,
    position: [...item.position],
    ...(item.materialOverrides ? { materialOverrides: { ...item.materialOverrides } } : {}),
  }));
}

function cloneZones(zones: ZoneMin[]): ZoneMin[] {
  return zones.map((zone) => ({
    ...zone,
    itemIds: [...zone.itemIds],
    ...(zone.anchor ? { anchor: [...zone.anchor] as [number, number, number] } : {}),
  }));
}

export function createLayoutVersion(
  room: RoomSnapshot,
  options: {
    name: string;
    source?: LayoutVersionSource;
    timestamp?: number;
  }
): LayoutVersion {
  const timestamp = options.timestamp ?? Date.now();
  const items = cloneDesignItems(room.items ?? []);
  const zones = cloneZones(room.zones ?? []);

  return {
    id: `layout-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    name: options.name.trim() || `Layout ${(room.layoutVersions?.length ?? 0) + 1}`,
    source: options.source ?? "manual",
    timestamp,
    items,
    zones,
    summary: {
      itemCount: items.length,
      zoneCount: zones.length,
    },
  };
}

export function appendLayoutVersion(
  room: RoomSnapshot,
  version: LayoutVersion,
  maxVersions: number = MAX_ROOM_LAYOUT_VERSIONS
): RoomSnapshot {
  const existingVersions = room.layoutVersions ?? [];

  return {
    ...room,
    layoutVersions: [version, ...existingVersions.filter((entry) => entry.id !== version.id)].slice(0, maxVersions),
  };
}

export function compareLayoutVersion(
  currentRoom: RoomSnapshot,
  version: LayoutVersion
): LayoutVersionComparison {
  const currentById = new Map((currentRoom.items ?? []).map((item) => [item.instanceId, item]));
  const savedById = new Map((version.items ?? []).map((item) => [item.instanceId, item]));
  let movedCount = 0;
  let rotatedCount = 0;

  for (const [instanceId, currentItem] of currentById) {
    const savedItem = savedById.get(instanceId);
    if (!savedItem) continue;
    const moved =
      Math.abs((currentItem.position?.[0] ?? 0) - (savedItem.position?.[0] ?? 0)) > 0.02 ||
      Math.abs((currentItem.position?.[2] ?? 0) - (savedItem.position?.[2] ?? 0)) > 0.02;
    const rotated = Math.abs((currentItem.rotationY ?? 0) - (savedItem.rotationY ?? 0)) > 0.02;
    if (moved) movedCount += 1;
    if (rotated) rotatedCount += 1;
  }

  const currentItemCount = currentById.size;
  const savedItemCount = savedById.size;

  return {
    currentItemCount,
    savedItemCount,
    itemDelta: currentItemCount - savedItemCount,
    addedCount: [...currentById.keys()].filter((instanceId) => !savedById.has(instanceId)).length,
    removedCount: [...savedById.keys()].filter((instanceId) => !currentById.has(instanceId)).length,
    movedCount,
    rotatedCount,
    zoneDelta: (currentRoom.zones?.length ?? 0) - (version.zones?.length ?? 0),
  };
}

export function summarizeLayoutVersionComparison(
  comparison: LayoutVersionComparison
): LayoutVersionComparisonSummary {
  const itemDeltaLabel =
    comparison.itemDelta === 0
      ? "same item count"
      : comparison.itemDelta > 0
        ? `current has ${comparison.itemDelta} more item${comparison.itemDelta === 1 ? "" : "s"}`
        : `saved has ${Math.abs(comparison.itemDelta)} more item${comparison.itemDelta === -1 ? "" : "s"}`;
  const movementParts = [
    comparison.movedCount > 0
      ? `${comparison.movedCount} moved`
      : null,
    comparison.rotatedCount > 0
      ? `${comparison.rotatedCount} rotated`
      : null,
    comparison.addedCount > 0
      ? `${comparison.addedCount} added`
      : null,
    comparison.removedCount > 0
      ? `${comparison.removedCount} removed`
      : null,
  ].filter(Boolean);
  const zoneDeltaLabel =
    comparison.zoneDelta === 0
      ? "same zones"
      : comparison.zoneDelta > 0
        ? `current has ${comparison.zoneDelta} more zone${comparison.zoneDelta === 1 ? "" : "s"}`
        : `saved has ${Math.abs(comparison.zoneDelta)} more zone${comparison.zoneDelta === -1 ? "" : "s"}`;

  return {
    itemDeltaLabel,
    movementLabel: movementParts.length > 0 ? movementParts.join(" · ") : "positions match",
    zoneDeltaLabel,
    restoreLabel: `Restore ${comparison.savedItemCount} item${comparison.savedItemCount === 1 ? "" : "s"}`,
  };
}

export function restoreLayoutVersion(room: RoomSnapshot, version: LayoutVersion): RoomSnapshot {
  return {
    ...room,
    items: cloneDesignItems(version.items ?? []),
    zones: cloneZones(version.zones ?? []),
  };
}
