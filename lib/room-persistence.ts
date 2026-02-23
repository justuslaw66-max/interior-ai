/**
 * Multi-Room Persistence Helpers v3
 * 
 * Utilities for saving and loading multi-room designs.
 * Handles migration from single-room (v1/v2) to multi-room (v3) format.
 */

import type { DesignSnapshot, RoomSnapshot } from "./room-types";
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
    items: any[];
    zones: any[];
    savedViews: any[];
  }>;
  activeRoomId: string;
  // Design-level metadata
  title?: string;
  style?: string;
  budget?: string;
  lightingPreset?: string;
  notes?: string;
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
      budget: stored.budget as any,
      lightingPreset: stored.lightingPreset,
      notes: stored.notes,
    };
  }

  // Otherwise migrate from legacy format
  // Otherwise migrate from legacy format
  return migrateToV3(stored as any);
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
  items: any[];
  zones: any[];
  savedViews: any[];
  style?: string;
  budget?: string;
  mode?: string;
  notes?: string;
} {
  const v3 = migrateToV3(snapshot);
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
    };
  }

  return {
    title: v3.title,
    roomWidth: activeRoom.geometry.width,
    roomDepth: activeRoom.geometry.depth,
    items: activeRoom.items,
    zones: activeRoom.zones,
    savedViews: activeRoom.savedViews,
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
  items: any[];
  zones?: any[];
  savedViews?: any[];
  style?: string;
  budget?: string;
  mode?: string;
  notes?: string;
}): DesignSnapshot {
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
    budget: data.budget as any,
    notes: data.notes,
  } as DesignSnapshot);
}
