/**
 * Room Switcher UI Component
 * 
 * Minimal, calm room switcher for switching between rooms.
 * Shows as tabs at the top of the editor.
 */

"use client";

import React from "react";
import { getAllRoomNames } from "@/lib/room-hooks";
import type { DesignSnapshot } from "@/lib/room-types";

interface RoomSwitcherProps {
  snapshot: DesignSnapshot;
  onSwitchRoom: (roomId: string) => void;
  onAddRoom?: () => void;
  disabled?: boolean;
}

export const RoomSwitcher: React.FC<RoomSwitcherProps> = ({
  snapshot,
  onSwitchRoom,
  onAddRoom,
  disabled = false,
}) => {
  const rooms = getAllRoomNames(snapshot);

  if (!rooms || rooms.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 rounded-lg bg-white p-1 shadow">
      {rooms.map((room) => (
        <button
          key={room.id}
          onClick={() => onSwitchRoom(room.id)}
          disabled={disabled}
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            room.isActive
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:text-neutral-900"
          } disabled:opacity-50`}
          title={`Switch to ${room.name}`}
        >
          {room.name}
        </button>
      ))}

      {onAddRoom && (
        <button
          onClick={onAddRoom}
          disabled={disabled}
          className="ml-2 rounded px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 disabled:opacity-50"
          title="Add a new room (Pro feature)"
        >
          + Room
        </button>
      )}
    </div>
  );
};

/**
 * Vertical room switcher for left sidebar
 */
export const RoomSwitcherVertical: React.FC<RoomSwitcherProps> = ({
  snapshot,
  onSwitchRoom,
  onAddRoom,
  disabled = false,
}) => {
  const rooms = getAllRoomNames(snapshot);

  if (!rooms || rooms.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-white p-2 shadow">
      {rooms.map((room) => (
        <button
          key={room.id}
          onClick={() => onSwitchRoom(room.id)}
          disabled={disabled}
          className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
            room.isActive
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:text-neutral-900"
          } disabled:opacity-50`}
          title={`Switch to ${room.name}`}
        >
          {room.name}
        </button>
      ))}

      {onAddRoom && (
        <button
          onClick={onAddRoom}
          disabled={disabled}
          className="rounded px-3 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 disabled:opacity-50"
          title="Add a new room (Pro feature)"
        >
          + Add Room
        </button>
      )}
    </div>
  );
};
