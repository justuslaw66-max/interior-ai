import type { RoomSurfaceAssignments } from "./room-types";
import { clampFloorPatternScale, normalizeFloorRotationDeg } from "./floor-materials";
import { getWallPanelSurfaceSettings } from "./surface-settings";

export type BomWallPanel = {
  panelId: string;
  faceId: string;
  areaSqm: number;
  legacyPanelIds: readonly string[];
};

/** Resolve saved fragment finishes and combine quantities when a whole wall overrides them. */
export function resolveAssignedWallPanels(
  panels: BomWallPanel[], surfaces: RoomSurfaceAssignments | undefined
) {
  const assignments = surfaces?.walls?.panels ?? {};
  const grouped = new Map<string, BomWallPanel & { settings: ReturnType<typeof getWallPanelSurfaceSettings> }>();
  for (const panel of panels) {
    const assignmentId = [panel.panelId, ...panel.legacyPanelIds].find((id) =>
      Object.prototype.hasOwnProperty.call(assignments, id));
    if (!assignmentId) continue;
    const settings = getWallPanelSurfaceSettings(surfaces, panel.faceId, panel.panelId,
      normalizeFloorRotationDeg, clampFloorPatternScale, panel.legacyPanelIds);
    const key = `${panel.faceId}:${assignmentId}`;
    grouped.set(key, { ...panel, panelId: assignmentId, settings,
      areaSqm: panel.areaSqm + (grouped.get(key)?.areaSqm ?? 0) });
  }
  return [...grouped.values()];
}
