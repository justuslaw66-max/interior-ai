import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { RoomSurfaceAssignments } from "@/lib/room-types";
import { getRuntimeSurfaceMaterialById } from "@/lib/surface-material-runtime";

/** An imported plan's unfinished wall face, and the low neutral fill its walls take so their faces keep their shading. */
export const CANONICAL_ACTIVE_WALL_COLOR = "#fbfbf7";
export const CANONICAL_WALL_INDIRECT_FILL_INTENSITY = 0.08;

export const WALL_SURFACE_TEXTURE_RESOLUTION = {
  maxSize: 4096,
  minSize: 768,
  pixelsPerMeter: 560,
} as const;

export function surfaceMaterialFallbackColor(
  material: ReturnType<typeof getRuntimeSurfaceMaterialById>
) {
  const family = material?.classification?.color_family;
  if (family === "grey") return "#b7b7b2";
  if (family === "charcoal") return "#5b5d5a";
  if (family === "brown" || family === "walnut") return "#8b755c";
  if (family === "cream" || family === "beige") return "#d8ccbb";
  if (family === "white") return "#ece9e1";
  return material ? "#c9c2b4" : null;
}

export function resolveRoomSurfaceAssignments(
  room: Pick<HousePlanRoom2D, "surfaces" | "surfaceFinishes">
): RoomSurfaceAssignments | undefined {
  const compatibility = room.surfaceFinishes;
  const current = room.surfaces;
  if (!compatibility) return current;
  if (!current) return compatibility;
  return {
    ...compatibility,
    ...current,
    walls:
      compatibility.walls || current.walls
        ? {
            ...compatibility.walls,
            ...current.walls,
            default: {
              ...compatibility.walls?.default,
              ...current.walls?.default,
            },
            faces: {
              ...compatibility.walls?.faces,
              ...current.walls?.faces,
            },
          }
        : undefined,
  };
}
