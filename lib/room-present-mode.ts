/**
 * Multi-Room Present Mode Support
 * 
 * Extends presentation mode to support navigating between rooms
 * and viewing room-specific saved views.
 */

import type { DesignSnapshot, RoomSnapshot, SavedView } from "./room-types";
import { getActiveRoom, migrateToV3 } from "./room-types";

export interface PresentModeState {
  currentRoomId: string;
  currentViewIndex: number; // index into the room's saved views
}

export function createPresentModeState(
  snapshot: DesignSnapshot,
  initialRoomId?: string
): PresentModeState {
  const migrated = migrateToV3(snapshot);
  const roomId = initialRoomId ?? migrated.activeRoomId;

  return {
    currentRoomId: roomId,
    currentViewIndex: 0,
  };
}

/**
 * Get the current room in present mode
 */
export function getPresentModeRoom(
  snapshot: DesignSnapshot,
  state: PresentModeState
): RoomSnapshot | null {
  const migrated = migrateToV3(snapshot);
  return migrated.rooms.find((r: RoomSnapshot) => r.id === state.currentRoomId) ?? null;
}

/**
 * Get the current saved view in present mode
 */
export function getPresentModeSavedView(
  snapshot: DesignSnapshot,
  state: PresentModeState
): SavedView | null {
  const room = getPresentModeRoom(snapshot, state);
  if (!room) return null;

  const view = room.savedViews[state.currentViewIndex];
  return view ?? null;
}

/**
 * Get all rooms for present mode navigation
 */
export function getPresentModeRooms(snapshot: DesignSnapshot): RoomSnapshot[] {
  const migrated = migrateToV3(snapshot);
  return migrated.rooms;
}

/**
 * Switch to a different room in present mode
 */
export function switchPresentModeRoom(
  state: PresentModeState,
  roomId: string
): PresentModeState {
  return {
    ...state,
    currentRoomId: roomId,
    currentViewIndex: 0, // Reset to first view when switching rooms
  };
}

/**
 * Move to next saved view in the current room
 */
export function nextPresentModeView(
  snapshot: DesignSnapshot,
  state: PresentModeState
): PresentModeState {
  const room = getPresentModeRoom(snapshot, state);
  if (!room || room.savedViews.length === 0) return state;

  const nextIndex = (state.currentViewIndex + 1) % room.savedViews.length;
  return {
    ...state,
    currentViewIndex: nextIndex,
  };
}

/**
 * Move to previous saved view in the current room
 */
export function previousPresentModeView(
  snapshot: DesignSnapshot,
  state: PresentModeState
): PresentModeState {
  const room = getPresentModeRoom(snapshot, state);
  if (!room || room.savedViews.length === 0) return state;

  const nextIndex =
    state.currentViewIndex === 0
      ? room.savedViews.length - 1
      : state.currentViewIndex - 1;

  return {
    ...state,
    currentViewIndex: nextIndex,
  };
}

/**
 * Get navigation info for present mode UI
 */
export function getPresentModeNavigation(
  snapshot: DesignSnapshot,
  state: PresentModeState
): {
  rooms: Array<{ id: string; name: string; isActive: boolean }>;
  currentRoom: RoomSnapshot | null;
  currentView: SavedView | null;
  viewCount: number;
  currentViewNumber: number;
} {
  const migrated = migrateToV3(snapshot);
  const room = getPresentModeRoom(snapshot, state);
  const view = getPresentModeSavedView(snapshot, state);

  return {
    rooms: migrated.rooms.map((r: RoomSnapshot) => ({
      id: r.id,
      name: r.name,
      isActive: r.id === state.currentRoomId,
    })),
    currentRoom: room,
    currentView: view,
    viewCount: room?.savedViews.length ?? 0,
    currentViewNumber: state.currentViewIndex + 1,
  };
}

/**
 * Keyboard shortcuts helper for present mode
 */
export function handlePresentModeKeyPress(
  key: string,
  snapshot: DesignSnapshot,
  state: PresentModeState,
  onStateChange: (newState: PresentModeState) => void
): boolean {
  switch (key) {
    case "ArrowRight":
    case " ": // Space to advance
      onStateChange(nextPresentModeView(snapshot, state));
      return true;

    case "ArrowLeft":
      onStateChange(previousPresentModeView(snapshot, state));
      return true;

    // TODO: Add room switching via number keys or other shortcuts
    // case "1":
    //   onStateChange(switchPresentModeRoom(state, rooms[0]?.id));
    //   return true;

    default:
      return false;
  }
}
