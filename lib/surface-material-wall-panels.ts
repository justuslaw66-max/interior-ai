import type { PersistedPlanOpening, RoomSnapshot, RoomSurfaceAssignments } from "./room-types";
import { clampFloorPatternScale, normalizeFloorRotationDeg } from "./floor-materials";
import { getWallFaceLabel, getWallPanelSurfaceSettings } from "./surface-settings";
import { buildHousePlan2D, type HousePlanRoom2D } from "./design-page-house-plan";
import { mapPlanOpeningsToRoomRenderer } from "./design-page-plan-overlays";
import { buildOpeningWallSurfacePanels } from "@/components/editor/renderers/house-plan-3d/openingWallSurfacePanels";
import { getContinuousWallPanelId } from "@/components/editor/renderers/house-plan-3d/continuousWallSelection";
import {
  buildWallSurfacePanels,
  getWallOpenings,
  getWallSegments,
} from "@/components/editor/renderers/house-plan-3d/geometry";

export type BomWallPanel = {
  panelId: string;
  faceId: string;
  areaSqm: number;
  legacyPanelIds: readonly string[];
};

export type AssignedWallPanel = BomWallPanel & {
  surfaceLabel: string;
  settings: ReturnType<typeof getWallPanelSurfaceSettings>;
};

/** Solid wall quantities per finish scope; every area excludes door and window apertures. */
export type RoomWallFinishQuantities = {
  /** Area left on the room's default wall finish after finished faces and panels. */
  remainingWallAreaSqm: number;
  /** Area of each face listed in `walls.faces`, minus the panels that override it. */
  faceAreaSqmById: ReadonlyMap<string, number>;
  /** Panels carrying their own finish, combined by resolved assignment. */
  assignedPanels: AssignedWallPanel[];
};

function getRoomWallHeight(room: RoomSnapshot): number {
  return Math.max(0.2, room.geometry.height ?? 2.6);
}

function getRoomWallAreaSqm(room: RoomSnapshot): number {
  const polygon = room.planShape === "custom_polygon" ? room.planPolygon : null;
  if (polygon && polygon.length >= 2) {
    const loopPerimeter = (loop: NonNullable<RoomSnapshot["planPolygon"]>) => loop.reduce((sum, point, index) => {
      const next = loop[(index + 1) % loop.length];
      return sum + Math.hypot(next.x - point.x, next.z - point.z);
    }, 0);
    const perimeter = loopPerimeter(polygon) +
      (room.planHoles ?? []).reduce(
        (sum, hole) => sum + (hole.length >= 2 ? loopPerimeter(hole) : 0),
        0
      );
    return perimeter * getRoomWallHeight(room);
  }
  return Math.max(0, (room.geometry.width + room.geometry.depth) * 2 * getRoomWallHeight(room));
}

function getRoomWallFaceAreaSqm(room: RoomSnapshot, faceId: string): number {
  const height = Math.max(
    0.2,
    room.geometry.wallHeights?.[faceId] ?? getRoomWallHeight(room)
  );
  if (faceId === "north" || faceId === "south") return Math.max(0, room.geometry.width * height);
  if (faceId === "east" || faceId === "west") return Math.max(0, room.geometry.depth * height);
  return Math.max(0, Math.max(room.geometry.width, room.geometry.depth) * height);
}

function buildRoomWallPanels(
  room: RoomSnapshot,
  topologyRoom: HousePlanRoom2D | undefined,
  topologyRooms: readonly HousePlanRoom2D[],
  openings: ReturnType<typeof mapPlanOpeningsToRoomRenderer>
): BomWallPanel[] {
  if (!topologyRoom) return [];
  return getWallSegments(topologyRoom).flatMap((segment) => {
    const faceId = segment.wall ?? segment.key;
    const height = Math.max(0.2, topologyRoom.wallHeights?.[faceId] ?? topologyRoom.height ?? getRoomWallHeight(room));
    const wallOpenings = getWallOpenings(topologyRoom, segment, topologyRooms, openings);
    return [
      ...buildWallSurfacePanels(topologyRoom, segment, wallOpenings),
      ...buildOpeningWallSurfacePanels(topologyRoom, topologyRooms, segment, wallOpenings, height).filter((panel) => panel.role === "interior"),
    ].map((panel) => ({
      panelId: getContinuousWallPanelId(topologyRoom, segment, wallOpenings, panel.role) ?? panel.panelId,
      faceId: panel.faceId,
      areaSqm: panel.part.length * (panel.part.height ?? height),
      legacyPanelIds: [panel.panelId, ...panel.legacyPanelIds],
    }));
  });
}

/** Resolve saved fragment finishes and combine quantities when a whole wall overrides them. */
export function resolveAssignedWallPanels(
  panels: BomWallPanel[], surfaces: RoomSurfaceAssignments | undefined
): AssignedWallPanel[] {
  const assignments = surfaces?.walls?.panels ?? {};
  const grouped = new Map<string, AssignedWallPanel>();
  for (const panel of panels) {
    const assignmentId = [panel.panelId, ...panel.legacyPanelIds].find((id) =>
      Object.prototype.hasOwnProperty.call(assignments, id));
    if (!assignmentId) continue;
    const settings = getWallPanelSurfaceSettings(surfaces, panel.faceId, panel.panelId,
      normalizeFloorRotationDeg, clampFloorPatternScale, panel.legacyPanelIds);
    const key = `${panel.faceId}:${assignmentId}`;
    grouped.set(key, { ...panel, panelId: assignmentId, settings,
      surfaceLabel: `${getWallFaceLabel(panel.faceId)} panel`,
      areaSqm: panel.areaSqm + (grouped.get(key)?.areaSqm ?? 0) });
  }
  return [...grouped.values()];
}

function sumAreaByFace(panels: readonly BomWallPanel[]): Map<string, number> {
  const areaByFace = new Map<string, number>();
  panels.forEach((panel) => {
    areaByFace.set(panel.faceId, (areaByFace.get(panel.faceId) ?? 0) + panel.areaSqm);
  });
  return areaByFace;
}

function resolveRoomWallFinishQuantities(
  room: RoomSnapshot,
  panels: BomWallPanel[]
): RoomWallFinishQuantities {
  const surfaces = room.surfaces ?? room.surfaceFinishes;
  const solidAreaByFace = sumAreaByFace(panels);
  const wallAreaSqm = solidAreaByFace.size > 0
    ? [...solidAreaByFace.values()].reduce((sum, areaSqm) => sum + areaSqm, 0)
    : getRoomWallAreaSqm(room);
  const assignedPanels = resolveAssignedWallPanels(panels, surfaces);
  const panelAreaByFace = sumAreaByFace(assignedPanels);
  const faceIds = Object.keys(surfaces?.walls?.faces ?? {});
  const getFaceAreaSqm = (faceId: string) =>
    solidAreaByFace.get(faceId) ?? getRoomWallFaceAreaSqm(room, faceId);
  const faceAreaTotal = faceIds.reduce((sum, faceId) => sum + getFaceAreaSqm(faceId), 0);
  const panelAreaOnDefaultFaces = assignedPanels.reduce(
    (sum, panel) => (faceIds.includes(panel.faceId) ? sum : sum + panel.areaSqm),
    0
  );
  return {
    remainingWallAreaSqm: Math.max(
      0,
      wallAreaSqm - Math.min(wallAreaSqm, faceAreaTotal) - panelAreaOnDefaultFaces
    ),
    faceAreaSqmById: new Map(faceIds.map((faceId) => [
      faceId,
      Math.max(0, getFaceAreaSqm(faceId) - (panelAreaByFace.get(faceId) ?? 0)),
    ])),
    assignedPanels,
  };
}

/**
 * Wall finish quantities for each room, in input order. This is the single
 * source for the export bill of materials and the editor Surface Summary.
 */
export function buildRoomWallFinishQuantities(
  rooms: RoomSnapshot[],
  planOpenings: readonly PersistedPlanOpening[] = []
): RoomWallFinishQuantities[] {
  const fallbackRoom = rooms[0];
  const housePlan = buildHousePlan2D(
    rooms,
    fallbackRoom?.geometry.width ?? 4,
    fallbackRoom?.geometry.depth ?? 5
  );
  const topologyRoomById = new Map(housePlan.rooms.map((room) => [room.id, room]));
  const openings = mapPlanOpeningsToRoomRenderer([...planOpenings]);
  return rooms.map((room) =>
    resolveRoomWallFinishQuantities(
      room,
      buildRoomWallPanels(room, topologyRoomById.get(room.id), housePlan.rooms, openings)
    )
  );
}
