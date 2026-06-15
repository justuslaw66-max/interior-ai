/**
 * Multi-Room Persistence Helpers v3
 * 
 * Utilities for saving and loading multi-room designs.
 * Handles migration from single-room (v1/v2) to multi-room (v3) format.
 */

import type {
  DesignItem,
  DesignSnapshot,
  RoomSnapshot,
  SavedView,
  PersistedFloorPlanState,
  ZoneMin,
} from "./room-types";
import { migrateToV3 } from "./room-types";

/**
 * Format for storage (database or localStorage)
 * Stores the v3 snapshot directly
 */
export interface StoredDesign {
  version: 3;
  rooms: Array<{
    id: string;
    name: string;
    roomType: string;
    geometry: { width: number; depth: number; wallThickness?: number; height?: number };
    planPosition?: { x: number; z: number };
    planShape?: string;
    planPolygon?: Array<{ x: number; z: number }>;
    items: DesignItem[];
    zones: ZoneMin[];
    savedViews: SavedView[];
  }>;
  activeRoomId: string;
  // Design-level metadata
  title?: string;
  style?: string;
  budget?: string;
  lightingPreset?: string;
  notes?: string;
  floorPlan?: PersistedFloorPlanState;
}

/**
 * Convert DesignSnapshot to StoredDesign format
 */
export function snapshotToStored(snapshot: DesignSnapshot): StoredDesign {
  const v3 = migrateToV3(snapshot);
  
  return {
    version: 3,
    rooms: v3.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      roomType: room.roomType,
      geometry: room.geometry,
      planPosition: room.planPosition,
      planShape: room.planShape,
      planPolygon: room.planPolygon,
      items: room.items,
      zones: room.zones,
      savedViews: room.savedViews,
    })),
    activeRoomId: v3.activeRoomId,
    title: v3.title,
    style: v3.style,
    budget: v3.budget,
    lightingPreset: v3.lightingPreset,
    notes: v3.notes,
    floorPlan: v3.floorPlan,
  };
}

/**
 * Convert StoredDesign back to DesignSnapshot
 */
export function storedToSnapshot(stored: StoredDesign): DesignSnapshot {
  // If it has the v3 multi-room format, use it directly
  if (stored.version === 3 && stored.rooms && stored.rooms.length > 0) {
    return {
      version: 3,
      rooms: stored.rooms as RoomSnapshot[],
      activeRoomId: stored.activeRoomId,
      title: stored.title,
      style: stored.style,
      budget: stored.budget as DesignSnapshot["budget"],
      lightingPreset: stored.lightingPreset,
      notes: stored.notes,
      floorPlan: stored.floorPlan,
    };
  }

  // Otherwise migrate from legacy format
  // Otherwise migrate from legacy format
  return migrateToV3(stored as unknown as DesignSnapshot);
}

/**
 * Save design snapshot to localStorage (for guest mode)
 */
export function saveToLocalStorage(snapshot: DesignSnapshot, key: string = "design-snapshot") {
  try {
    const stored = snapshotToStored(snapshot);
    localStorage.setItem(key, JSON.stringify(stored));
    return true;
  } catch (err) {
    console.error("Failed to save to localStorage:", err);
    return false;
  }
}

/**
 * Load design snapshot from localStorage
 */
export function loadFromLocalStorage(key: string = "design-snapshot"): DesignSnapshot | null {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;
    const stored = JSON.parse(item) as StoredDesign;
    return storedToSnapshot(stored);
  } catch (err) {
    console.error("Failed to load from localStorage:", err);
    return null;
  }
}

/**
 * Convert v3 multi-room format to legacy single-room API format
 * for backward compatibility with existing endpoints
 * Returns the active room's data flattened
 */
export function snapshotToLegacyApi(snapshot: DesignSnapshot): {
  title?: string;
  roomWidth: number;
  roomDepth: number;
  items: DesignItem[];
  zones: ZoneMin[];
  savedViews: SavedView[];
  snapshot: StoredDesign;
  style?: string;
  budget?: string;
  mode?: string;
  notes?: string;
} {
  const v3 = migrateToV3(snapshot);
  const stored = snapshotToStored(v3);
  // Get the active room
  const activeRoom = v3.rooms.find((r: RoomSnapshot) => r.id === v3.activeRoomId);
  
  if (!activeRoom) {
    return {
      title: v3.title,
      roomWidth: 4,
      roomDepth: 5,
      items: [],
      zones: [],
      savedViews: [],
      snapshot: stored,
    };
  }

  return {
    title: v3.title,
    roomWidth: activeRoom.geometry.width,
    roomDepth: activeRoom.geometry.depth,
    items: activeRoom.items,
    zones: activeRoom.zones,
    savedViews: activeRoom.savedViews,
    snapshot: stored,
  };
}

/**
 * Convert legacy API response to new multi-room snapshot
 */
export function legacyApiToSnapshot(data: {
  id: string;
  title?: string;
  roomWidth: number;
  roomDepth: number;
  items: DesignItem[];
  zones?: ZoneMin[];
  savedViews?: SavedView[];
  snapshot?: StoredDesign | null;
  style?: string;
  budget?: string;
  mode?: string;
  notes?: string;
}): DesignSnapshot {
  if (data.snapshot?.version === 3 && Array.isArray(data.snapshot.rooms)) {
    return storedToSnapshot(data.snapshot);
  }

  return migrateToV3({
    items: data.items ?? [],
    zones: data.zones ?? [],
    savedViews: data.savedViews ?? [],
    roomBounds: {
      width: data.roomWidth ?? 5,
      depth: data.roomDepth ?? 4,
      wallThickness: 0.2,
    },
    title: data.title,
    style: data.style,
    budget: data.budget as DesignSnapshot["budget"],
    notes: data.notes,
    floorPlan: (data.snapshot as StoredDesign | null | undefined)?.floorPlan,
  } as DesignSnapshot);
}
