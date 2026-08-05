import type { RoomSnapshot, SavedView } from "@/lib/room-types";

export type PublicShareCameraView = {
  id: string;
  name: string;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  fov?: number;
};

function isVector3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

export function normalizePublicShareSavedView(
  view: SavedView | unknown
): PublicShareCameraView | null {
  if (!view || typeof view !== "object") return null;
  const candidate = view as Partial<SavedView> & {
    id?: unknown;
    name?: unknown;
    view?: { pos?: unknown; target?: unknown; fov?: unknown };
  };
  if (typeof candidate.id !== "string" || !candidate.id) return null;
  const cameraPosition = isVector3(candidate.cameraPosition)
    ? candidate.cameraPosition
    : isVector3(candidate.view?.pos)
      ? candidate.view.pos
      : null;
  const cameraTarget = isVector3(candidate.cameraTarget)
    ? candidate.cameraTarget
    : isVector3(candidate.view?.target)
      ? candidate.view.target
      : null;
  if (!cameraPosition || !cameraTarget) return null;
  return {
    id: candidate.id,
    name: typeof candidate.name === "string" && candidate.name ? candidate.name : "Saved view",
    cameraPosition,
    cameraTarget,
    fov:
      typeof candidate.view?.fov === "number" && Number.isFinite(candidate.view.fov)
        ? candidate.view.fov
        : undefined,
  };
}

export function resolvePublicShareSavedViews(room: RoomSnapshot | null) {
  return (room?.savedViews ?? [])
    .map(normalizePublicShareSavedView)
    .filter((view): view is PublicShareCameraView => Boolean(view));
}
