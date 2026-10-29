import type { CanvasPalette } from "@/lib/canvas-colours";
import { clampFloorPatternScale, normalizeFloorRotationDeg } from "@/lib/floor-materials";
import type { RoomSurfaceAssignments } from "@/lib/room-types";
import { getRuntimeSurfaceMaterialById } from "@/lib/surface-material-runtime";
import { getWallFaceSurfaceSettings } from "@/lib/surface-settings";

/** The room fields a wall's 2D plan colour is read from. */
export type WallPlanColourRoom2D = {
  surfaces?: RoomSurfaceAssignments;
  surfaceFinishes?: RoomSurfaceAssignments;
};

/** A finish's tone on the 2D plan, by the first of its colour family's words that matches, so the plan reads at a glance. */
const PLAN_TONE_BY_COLOUR_FAMILY: ReadonlyArray<readonly [readonly string[], string]> = [
  [["grey", "gray"], "#b9b8b3"],
  [["walnut", "brown"], "#9b7659"],
  [["oak", "maple", "wood"], "#c6a77b"],
  [["white", "ivory"], "#eeeae0"],
  [["beige", "cream"], "#d8ccb8"],
  [["black", "anthracite"], "#6f6f70"],
];

function getSurfaceMaterialPlanColor(materialId: string | null | undefined, fallback: string): string {
  const material = getRuntimeSurfaceMaterialById(materialId);
  if (!material) return fallback;
  const colorFamily = material.classification?.color_family ?? "";
  const tone = PLAN_TONE_BY_COLOUR_FAMILY.find(([words]) => words.some((word) => colorFamily.includes(word)));
  return tone?.[1] ?? "#c5beb0";
}

/**
 * A wall face's colour on the 2D plan (the wall band and its laminate panel strip): its paint, else its finish's tone. The
 * finish draws as it is in dark too; only Pro's plain grey follows the palette.
 */
export function getHouseRoomWallPlanColor(room: WallPlanColourRoom2D, wall: string, isPro: boolean, palette: CanvasPalette): string {
  const fallback = isPro ? palette.colour("#d4d4d8") : "#c9c2b4";
  const surfaces = room.surfaces ?? room.surfaceFinishes;
  const settings = getWallFaceSurfaceSettings(
    surfaces,
    wall,
    normalizeFloorRotationDeg,
    clampFloorPatternScale
  );
  if (settings.paintColorHex) return settings.paintColorHex;
  return getSurfaceMaterialPlanColor(settings.materialId, fallback);
}
