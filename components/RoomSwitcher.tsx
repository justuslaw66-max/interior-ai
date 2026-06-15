/**
 * Room Switcher UI Component
 * 
 * Minimal, calm room switcher for switching between rooms.
 * Shows as tabs at the top of the editor.
 */

"use client";

import React, { useState } from "react";
import { getAllRoomNames } from "@/lib/room-hooks";
import type { DesignSnapshot } from "@/lib/room-types";

interface RoomSwitcherProps {
  snapshot: DesignSnapshot;
  onSwitchRoom: (roomId: string) => void;
  onAddRoom?: () => void;
  onRenameRoom?: (roomId: string, nextName: string) => void;
  disabled?: boolean;
}

const ROOM_TYPE_LABELS: Record<string, string> = {
  living: "Living",
  bedroom: "Bedroom",
  dining: "Dining",
  kitchen: "Kitchen",
  toilet: "Bathroom",
  custom: "Custom",
};

export const RoomSwitcher: React.FC<RoomSwitcherProps> = ({
  snapshot,
  onSwitchRoom,
  onAddRoom,
  onRenameRoom,
  disabled = false,
}) => {
  const rooms = getAllRoomNames(snapshot);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  if (!rooms || rooms.length === 0) {
    return null;
  }

  const startRenaming = (roomId: string, roomName: string) => {
    if (disabled || !onRenameRoom) return;
    setEditingRoomId(roomId);
    setDraftName(roomName);
  };

  const finishRenaming = () => {
    if (!editingRoomId) return;
    const nextName = draftName.trim();
    if (nextName) {
      onRenameRoom?.(editingRoomId, nextName);
    }
    setEditingRoomId(null);
    setDraftName("");
  };

  return (
    <div
      className="flex max-w-[40rem] items-center gap-1 overflow-x-auto rounded-xl border border-neutral-200 bg-white/95 p-1 shadow-sm backdrop-blur"
      aria-label="House rooms"
    >
      <span className="shrink-0 px-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        House Plan
      </span>
      {rooms.map((room) => (
        <div
          key={room.id}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            room.isActive
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:text-neutral-900"
          } disabled:opacity-50`}
        >
          {editingRoomId === room.id ? (
            <input
              autoFocus
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={finishRenaming}
              onKeyDown={(event) => {
                if (event.key === "Enter") finishRenaming();
                if (event.key === "Escape") {
                  setEditingRoomId(null);
                  setDraftName("");
                }
              }}
              className="w-28 rounded bg-white px-2 py-1 text-sm text-neutral-900 outline-none ring-1 ring-neutral-300"
            />
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSwitchRoom(room.id)}
                disabled={disabled}
                className="text-left disabled:opacity-50"
                title={`Switch to ${room.name}`}
              >
                <span className="block leading-tight">{room.name}</span>
                <span className={`block text-[10px] font-semibold uppercase leading-tight ${room.isActive ? "text-neutral-300" : "text-neutral-400"}`}>
                  {ROOM_TYPE_LABELS[room.roomType] ?? "Room"}
                </span>
              </button>
              {onRenameRoom && room.isActive && (
                <button
                  type="button"
                  onClick={() => startRenaming(room.id, room.name)}
                  disabled={disabled}
                  className={room.isActive ? "text-xs text-neutral-300 hover:text-white" : "text-xs text-neutral-400 hover:text-neutral-900"}
                  title={`Rename ${room.name}`}
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {onAddRoom && (
        <button
          type="button"
          data-testid="add-house-room"
          onClick={onAddRoom}
          disabled={disabled}
          className="ml-1 shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50"
          title="Add another room to this design"
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
  onRenameRoom,
  disabled = false,
}) => {
  const rooms = getAllRoomNames(snapshot);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  if (!rooms || rooms.length === 0) {
    return null;
  }

  const startRenaming = (roomId: string, roomName: string) => {
    if (disabled || !onRenameRoom) return;
    setEditingRoomId(roomId);
    setDraftName(roomName);
  };

  const finishRenaming = () => {
    if (!editingRoomId) return;
    const nextName = draftName.trim();
    if (nextName) {
      onRenameRoom?.(editingRoomId, nextName);
    }
    setEditingRoomId(null);
    setDraftName("");
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-white p-2 shadow" aria-label="House rooms">
      <div className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        House Plan
      </div>
      {rooms.map((room) => (
        <div
          key={room.id}
          className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
            room.isActive
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:text-neutral-900"
          } disabled:opacity-50`}
        >
          {editingRoomId === room.id ? (
            <input
              autoFocus
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={finishRenaming}
              onKeyDown={(event) => {
                if (event.key === "Enter") finishRenaming();
                if (event.key === "Escape") {
                  setEditingRoomId(null);
                  setDraftName("");
                }
              }}
              className="w-full rounded bg-white px-2 py-1 text-sm text-neutral-900 outline-none ring-1 ring-neutral-300"
            />
          ) : (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onSwitchRoom(room.id)}
                disabled={disabled}
                className="text-left disabled:opacity-50"
                title={`Switch to ${room.name}`}
              >
                <span className="block leading-tight">{room.name}</span>
                <span className={`block text-[10px] font-semibold uppercase leading-tight ${room.isActive ? "text-neutral-300" : "text-neutral-400"}`}>
                  {ROOM_TYPE_LABELS[room.roomType] ?? "Room"}
                </span>
              </button>
              {onRenameRoom && room.isActive && (
                <button
                  type="button"
                  onClick={() => startRenaming(room.id, room.name)}
                  disabled={disabled}
                  className={room.isActive ? "text-xs text-neutral-300 hover:text-white" : "text-xs text-neutral-400 hover:text-neutral-900"}
                  title={`Rename ${room.name}`}
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {onAddRoom && (
        <button
          type="button"
          data-testid="add-house-room"
          onClick={onAddRoom}
          disabled={disabled}
          className="rounded px-3 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 disabled:opacity-50"
          title="Add another room to this design"
        >
          + Add Room
        </button>
      )}
    </div>
  );
};
