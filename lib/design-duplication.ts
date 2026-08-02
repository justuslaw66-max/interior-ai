import type { Prisma } from "@prisma/client";
import { sanitizeStoredDesign, type StoredDesign } from "./room-persistence";

export type DuplicateDesignSource = {
  title: string;
  roomWidth: number;
  roomDepth: number;
  items: unknown;
  snapshot?: unknown;
  zones: unknown;
  savedViews: unknown;
  style: string | null;
  budget: string | null;
  mode: string | null;
  notes: string | null;
};

function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getStoredActiveRoom(snapshot: StoredDesign) {
  return snapshot.rooms.find((room) => room.id === snapshot.activeRoomId) ?? snapshot.rooms[0];
}

export function buildDuplicateTitle(title: string) {
  const trimmed = title.trim();
  return `${trimmed.length > 0 ? trimmed : "Untitled Living Room"} (copy)`;
}

export function buildDuplicatedDesignData(
  source: DuplicateDesignSource,
  userId: string
) {
  const safeSnapshot = sanitizeStoredDesign(source.snapshot);
  const activeRoom = safeSnapshot ? getStoredActiveRoom(safeSnapshot) : null;
  const safeItems = activeRoom
    ? deepCloneJson(activeRoom.items)
    : Array.isArray(source.items)
      ? deepCloneJson(source.items)
      : [];
  const safeZones = activeRoom
    ? deepCloneJson(activeRoom.zones)
    : Array.isArray(source.zones)
      ? deepCloneJson(source.zones)
      : [];
  const safeSavedViews = activeRoom
    ? deepCloneJson(activeRoom.savedViews)
    : Array.isArray(source.savedViews)
      ? deepCloneJson(source.savedViews)
      : [];

  return {
    user: { connect: { id: userId } },
    title: buildDuplicateTitle(source.title),
    roomWidth: activeRoom?.geometry.width ?? Number(source.roomWidth),
    roomDepth: activeRoom?.geometry.depth ?? Number(source.roomDepth),
    items: safeItems as Prisma.InputJsonValue,
    ...(safeSnapshot ? { snapshot: safeSnapshot as unknown as Prisma.InputJsonValue } : {}),
    zones: safeZones as Prisma.InputJsonValue,
    savedViews: safeSavedViews as Prisma.InputJsonValue,
    style: source.style,
    budget: source.budget,
    mode: source.mode ?? "homeowner",
    notes: source.notes,
    shareEnabled: false,
    shareToken: null,
  };
}
