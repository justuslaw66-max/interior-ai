import type { RoomSnapshot } from "@/lib/room-types";

export type PublicShareLayoutMode = "mobile" | "tablet" | "desktop";

export function resolvePublicShareLayoutMode(width: number): PublicShareLayoutMode {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function resolvePublicShareSelectedRoomId(
  rooms: readonly RoomSnapshot[],
  requestedRoomId: string | null | undefined
) {
  if (requestedRoomId && rooms.some((room) => room.id === requestedRoomId)) {
    return requestedRoomId;
  }
  return rooms[0]?.id ?? null;
}

export function buildPublicShareLayoutKey(
  projectionIdentity: string,
  mode: PublicShareLayoutMode,
  selectedRoomId: string
) {
  return `${projectionIdentity}:${mode}:${selectedRoomId}`;
}

export function buildPublicShareLayoutGeneration(layoutKey: string) {
  let hash = 2166136261;
  for (let index = 0; index < layoutKey.length; index += 1) {
    hash ^= layoutKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

export type PublicShareSurfaceEvidence = {
  layoutKey: string;
  generation: number;
  width: number;
  height: number;
} | null;

export function isPublicShareLayoutReady(input: {
  hasSelectedRoom: boolean;
  layoutMode: PublicShareLayoutMode | null;
  layoutGeneration: number;
  layoutKey: string | null;
  canvasLayoutKey: string | null;
  surface: PublicShareSurfaceEvidence;
}) {
  return Boolean(
    input.hasSelectedRoom &&
      input.layoutMode &&
      input.layoutGeneration > 0 &&
      input.layoutKey &&
      input.canvasLayoutKey === input.layoutKey &&
      input.surface?.layoutKey === input.layoutKey &&
      input.surface.generation === input.layoutGeneration &&
      Number.isFinite(input.surface.width) &&
      Number.isFinite(input.surface.height) &&
      input.surface.width > 0 &&
      input.surface.height > 0
  );
}

export function publicShareRoomActionTestId(roomId: string) {
  return `share-room-action-${roomId}`;
}

export function publicShareSavedViewActionTestId(savedViewId: string) {
  return `share-saved-view-action-${savedViewId}`;
}
