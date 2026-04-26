/**
 * Multi-Room Foundation Types v3
 * 
 * Defines the data model for multi-room designs.
 * Each design contains multiple rooms, each with its own items, zones, and saved views.
 */

export type RoomType = "living" | "bedroom" | "dining" | "custom";

export interface RoomGeometry {
  width: number;
  depth: number;
  wallThickness?: number;
  height?: number;
}

export interface SavedView {
  id: string;
  name: string;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  timestamp?: number;
}

export interface DesignItem {
  instanceId: string;
  productId: string;
  variantId: string;
  configurationCode?: string;
  position: [number, number, number];
  rotationY?: number;
  qty?: number;
  includeInCheckout?: boolean;
  locked?: boolean;
  materialPreset?: string;
  materialOverrides?: {
    roughness?: number;
    metalness?: number;
    colorHex?: string;
  };
  // NO roomId field - items are stored inside room.items[]
}

export interface ZoneMin {
  id: string;
  type: "seating" | "reading" | "tv" | "dining";
  itemIds: string[];
  anchor?: [number, number, number];
  source?: "auto" | "manual";
  // NO roomId field - zones are stored inside room.zones[]
}

export interface RoomSnapshot {
  id: string;
  name: string;
  roomType: RoomType;
  geometry: RoomGeometry;
  items: DesignItem[];
  zones: ZoneMin[];
  savedViews: SavedView[];
}

/**
 * Design snapshot v3 - multi-room aware
 * Clean room-scoped architecture
 */
export interface DesignSnapshot {
  version: 3;
  rooms: RoomSnapshot[];
  activeRoomId: string;
  // Design-level metadata
  title?: string;
  style?: string;
  budget?: "budget" | "mid" | "luxury";
  lightingPreset?: string;
  notes?: string;
  // Legacy fields for migration (v1/v2)
  items?: DesignItem[];
  zones?: ZoneMin[];
  savedViews?: SavedView[];
  roomBounds?: RoomGeometry;
}

/**
 * Create a new room with default values
 */
export function createRoom(
  id: string,
  name: string,
  roomType: RoomType = "living",
  geometry: RoomGeometry = { width: 4, depth: 5, wallThickness: 0.2 }
): RoomSnapshot {
  return {
    id,
    name,
    roomType,
    geometry,
    items: [],
    zones: [],
    savedViews: [],
  };
}

/**
 * Migrate legacy single-room snapshot (v1/v2) to v3 multi-room format
 * Wraps existing items/zones/savedViews into a single "Living Room"
 */
export function migrateToV3(snapshot: DesignSnapshot): DesignSnapshot {
  // If already v3, return as-is
  if (snapshot.version === 3 && snapshot.rooms && snapshot.rooms.length > 0) {
    return snapshot;
  }

  // Create a single room from legacy data
  const geometry: RoomGeometry = snapshot.roomBounds ?? { width: 5, depth: 4, wallThickness: 0.12 };
  const room: RoomSnapshot = {
    id: "room_living",
    name: "Living Room",
    roomType: "living",
    geometry,
    items: snapshot.items ?? [],
    zones: snapshot.zones ?? [],
    savedViews: snapshot.savedViews ?? [],
  };

  return {
    version: 3,
    rooms: [room],
    activeRoomId: room.id,
    title: snapshot.title,
    style: snapshot.style,
    budget: snapshot.budget,
    lightingPreset: snapshot.lightingPreset,
    notes: snapshot.notes,
  };
}

/**
 * Get the currently active room
 */
export function getActiveRoom(snapshot: DesignSnapshot): RoomSnapshot | null {
  const migrated = migrateToV3(snapshot);
  return migrated.rooms.find((r) => r.id === migrated.activeRoomId) ?? migrated.rooms[0] ?? null;
}

/**
 * Update a room in the snapshot
 */
export function updateRoom(snapshot: DesignSnapshot, updatedRoom: RoomSnapshot): DesignSnapshot {
  const migrated = migrateToV3(snapshot);
  return {
    ...migrated,
    rooms: migrated.rooms.map((r) => (r.id === updatedRoom.id ? updatedRoom : r)),
  };
}

/**
 * Switch to a different room
 * Clears selection and resets UI state (handled by caller)
 */
export function switchRoom(snapshot: DesignSnapshot, roomId: string): DesignSnapshot {
  const migrated = migrateToV3(snapshot);
  if (!migrated.rooms.find((r) => r.id === roomId)) {
    console.warn(`Room ${roomId} not found`);
    return migrated;
  }
  return {
    ...migrated,
    activeRoomId: roomId,
  };
}

/**
 * Add a new room to the design
 */
export function addRoom(snapshot: DesignSnapshot, room: RoomSnapshot): DesignSnapshot {
  const migrated = migrateToV3(snapshot);
  return {
    ...migrated,
    rooms: [...migrated.rooms, room],
  };
}

/**
 * Delete a room from the design (if not the only room)
 */
export function deleteRoom(snapshot: DesignSnapshot, roomId: string): DesignSnapshot {
  const migrated = migrateToV3(snapshot);
  const remaining = migrated.rooms.filter((r) => r.id !== roomId);
  
  if (remaining.length === 0) {
    console.warn("Cannot delete the last room");
    return migrated;
  }

  const nextActiveId =
    migrated.activeRoomId === roomId ? remaining[0].id : migrated.activeRoomId;

  return {
    ...migrated,
    rooms: remaining,
    activeRoomId: nextActiveId,
  };
}
