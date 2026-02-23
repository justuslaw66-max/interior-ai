/**
 * Active Room State Management v3
 * 
 * Provides hooks and utilities for managing the active room context.
 * All room-scoped operations (items, zones, saved views) filter by activeRoomId.
 */

import { useMemo } from "react";
import type { DesignSnapshot, RoomSnapshot, DesignItem, ZoneMin, SavedView } from "./room-types";
import { getActiveRoom, migrateToV3 } from "./room-types";

/**
 * Hooks for accessing active room data
 * These automatically filter by activeRoomId
 */

export function useActiveRoom(snapshot: DesignSnapshot): RoomSnapshot | null {
  return useMemo(() => getActiveRoom(snapshot), [snapshot]);
}

export function useActiveRoomId(snapshot: DesignSnapshot): string | null {
  const migrated = useMemo(() => {
    const v3 = migrateToV3(snapshot);
    return v3.activeRoomId ?? null;
  }, [snapshot]);
  return migrated;
}

/**
 * Get items only from the active room
 */
export function useActiveRoomItems(snapshot: DesignSnapshot): DesignItem[] {
  return useMemo(() => {
    const room = getActiveRoom(snapshot);
    return room?.items ?? [];
  }, [snapshot]);
}

/**
 * Get zones only from the active room
 */
export function useActiveRoomZones(snapshot: DesignSnapshot): ZoneMin[] {
  return useMemo(() => {
    const room = getActiveRoom(snapshot);
    return room?.zones ?? [];
  }, [snapshot]);
}

/**
 * Get saved views only from the active room
 */
export function useActiveRoomSavedViews(snapshot: DesignSnapshot): SavedView[] {
  return useMemo(() => {
    const room = getActiveRoom(snapshot);
    return room?.savedViews ?? [];
  }, [snapshot]);
}

/**
 * Get all room names for display in switcher
 */
export function getAllRoomNames(snapshot: DesignSnapshot): Array<{
  id: string;
  name: string;
  roomType: string;
  isActive: boolean;
}> {
  const v3 = migrateToV3(snapshot);
  if (!v3.rooms) return [];
  
  return v3.rooms.map((room) => ({
    id: room.id,
    name: room.name,
    roomType: room.roomType,
    isActive: room.id === v3.activeRoomId,
  }));
}
