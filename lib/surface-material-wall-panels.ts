import type { PersistedPlanOpening, RoomSnapshot, RoomSurfaceAssignments } from "./room-types";
import { clampFloorPatternScale, normalizeFloorRotationDeg } from "./floor-materials";
import { getWallFaceLabel, getWallPanelSurfaceSettings } from "./surface-settings";
import { getWholeWallPanelId, isWholeWallFinishShown } from "./wall-panel-ids";
import { buildHousePlan2D, type HousePlanRoom2D } from "./design-page-house-plan";
import { mapPlanOpeningsToRoomRenderer } from "./design-page-plan-overlays";
import { buildOpeningWallSurfacePanels } from "@/components/editor/renderers/house-plan-3d/openingWallSurfacePanels";
import { getContinuousWallPanelId } from "@/components/editor/renderers/house-plan-3d/continuousWallSelection";
import {
  buildWallSurfacePanels,
  getWallOpenings,
  getWallSegments,
  getWallSurfaceFaceId,
  STRUCTURE_THICKNESS_METERS,
  type WallSegment3D,
  type WallSurfacePanelDescriptor,
} from "@/components/editor/renderers/house-plan-3d/geometry";
import { getWallSurfacePartAlongFace } from "@/components/editor/renderers/house-plan-3d/wallSurfaceLayout";
import type { WallFinishPiece } from "./surface-material-sheets";

export type BomWallPanel = {
  panelId: string;
  faceId: string;
  areaSqm: number;
  legacyPanelIds: readonly string[];
  /** False for a piece above a door that no longer shows its wall's whole-wall finish (isWholeWallFinishShown). */
  inheritsWholeWall?: boolean;
  /** Where the panel is on its wall face, for counting sheets (surface-material-sheets.ts). */
  piece: WallFinishPiece;
};

export type AssignedWallPanel = Omit<BomWallPanel, "piece"> & {
  surfaceLabel: string;
  settings: ReturnType<typeof getWallPanelSurfaceSettings>;
  /** The panels combined into this assignment. */
  pieces: WallFinishPiece[];
};

/**
 * Solid wall quantities per finish scope; every area excludes door and window apertures. Each scope also has its pieces
 * on the wall faces, for finishes sold by the sheet; null when the plan doesn't lay that scope out (the area then
 * stands alone).
 */
export type RoomWallFinishQuantities = {
  /** Area left on the room's default wall finish after finished faces and panels. */
  remainingWallAreaSqm: number;
  remainingWallPieces: WallFinishPiece[] | null;
  /** Area of each face listed in `walls.faces`, minus the panels that override it. */
  faceAreaSqmById: ReadonlyMap<string, number>;
  facePiecesById: ReadonlyMap<string, WallFinishPiece[] | null>;
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

/**
 * A panel's rectangle on its wall face as the 3D view draws it (house-plan-3d/wallSurfaceLayout.ts): along the drawn
 * face, joined at the corners, from the corner its sheets start at (the face's start on side 1, its end on side -1, where
 * the finish is turned a half turn), and up from the floor. The corners are joined as when no wall is cut away for the
 * camera. The areas stay on the wall line, so a drawn face can be up to half a wall's thickness shorter at each corner.
 */
function wallFinishPiece(
  room: HousePlanRoom2D, segment: WallSegment3D, panel: WallSurfacePanelDescriptor, height: number
): WallFinishPiece {
  const partHeight = panel.part.height ?? height;
  const bottom = (panel.part.centerY ?? partHeight / 2) - partHeight / 2;
  const { start, end } = getWallSurfacePartAlongFace({
    room, segment, part: panel.part, side: panel.side, squareStart: false, squareEnd: false,
    wallThickness: Math.max(0.01, room.wallThickness ?? STRUCTURE_THICKNESS_METERS),
  });
  return { faceKey: segment.key, start, end, bottom, top: bottom + partHeight };
}

function buildRoomWallPanels(
  room: RoomSnapshot,
  topologyRoom: HousePlanRoom2D | undefined,
  topologyRooms: readonly HousePlanRoom2D[],
  openings: ReturnType<typeof mapPlanOpeningsToRoomRenderer>
): BomWallPanel[] {
  if (!topologyRoom) return [];
  return getWallSegments(topologyRoom).flatMap((segment) => {
    // A wall's own height is saved under its face id, as the 3D view reads it ("north", or "wall-0" on a drawn polygon).
    const faceId = getWallSurfaceFaceId(topologyRoom, segment);
    const height = Math.max(0.2, topologyRoom.wallHeights?.[faceId] ?? topologyRoom.height ?? getRoomWallHeight(room));
    const wallOpenings = getWallOpenings(topologyRoom, segment, topologyRooms, openings);
    const pieces = [
      ...buildWallSurfacePanels(topologyRoom, segment, wallOpenings),
      ...buildOpeningWallSurfacePanels(topologyRoom, topologyRooms, segment, wallOpenings, height).filter((panel) => panel.role === "interior"),
    ];
    // All interior: a window's wall is one target, and on a door's the piece above it follows its sides, as the 3D view draws.
    const windowWallId = getContinuousWallPanelId(topologyRoom, segment, wallOpenings, "interior");
    const wholeWallShown = isWholeWallFinishShown((room.surfaces ?? room.surfaceFinishes)?.walls?.panels, pieces);
    return pieces.map((panel) => ({
      panelId: windowWallId ?? panel.panelId,
      faceId: panel.faceId,
      areaSqm: panel.part.length * (panel.part.height ?? height),
      legacyPanelIds: [panel.panelId, ...panel.legacyPanelIds],
      inheritsWholeWall: Boolean(windowWallId) || panel.part.height === undefined || wholeWallShown,
      piece: wallFinishPiece(topologyRoom, segment, panel, height),
    }));
  });
}

/**
 * The saved panel finish a measured panel takes, by its own id, an older one or its whole wall's (a finish saved before a
 * door split the wall); undefined when it has none.
 */
function panelAssignmentId(
  panel: Pick<BomWallPanel, "panelId" | "legacyPanelIds" | "inheritsWholeWall">, surfaces: RoomSurfaceAssignments | undefined
): string | undefined {
  const assignments = surfaces?.walls?.panels ?? {};
  const wholeWallId = panel.inheritsWholeWall === false ? null : getWholeWallPanelId([panel.panelId, ...panel.legacyPanelIds]);
  return [panel.panelId, ...panel.legacyPanelIds, ...(wholeWallId ? [wholeWallId] : [])]
    .find((id) => Object.prototype.hasOwnProperty.call(assignments, id));
}

/** Resolve saved fragment finishes and combine quantities when a whole wall overrides them. */
export function resolveAssignedWallPanels(
  panels: BomWallPanel[], surfaces: RoomSurfaceAssignments | undefined
): AssignedWallPanel[] {
  const grouped = new Map<string, AssignedWallPanel>();
  for (const { piece, ...panel } of panels) {
    const assignmentId = panelAssignmentId(panel, surfaces);
    if (!assignmentId) continue;
    const settings = getWallPanelSurfaceSettings(surfaces, panel.faceId, panel.panelId,
      normalizeFloorRotationDeg, clampFloorPatternScale, panel.legacyPanelIds, panel.inheritsWholeWall !== false);
    const key = `${panel.faceId}:${assignmentId}`;
    const previous = grouped.get(key);
    grouped.set(key, { ...panel, panelId: assignmentId, settings,
      surfaceLabel: `${getWallFaceLabel(panel.faceId)} panel`,
      areaSqm: panel.areaSqm + (previous?.areaSqm ?? 0),
      pieces: [...(previous?.pieces ?? []), piece] });
  }
  return [...grouped.values()];
}

function sumAreaByFace(panels: readonly Pick<BomWallPanel, "faceId" | "areaSqm">[]): Map<string, number> {
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
    ...scopePieces(panels, surfaces, faceIds),
  };
}

/**
 * The pieces of the default finish and of each finished face: their measured panels, less the ones with a finish of
 * their own. A face the plan doesn't lay out has none, and then neither do the remaining walls, whose area it reduces.
 */
function scopePieces(
  panels: readonly BomWallPanel[], surfaces: RoomSurfaceAssignments | undefined, faceIds: readonly string[]
): Pick<RoomWallFinishQuantities, "remainingWallPieces" | "facePiecesById"> {
  const inheriting = panels.filter((panel) => !panelAssignmentId(panel, surfaces));
  const facePiecesById = new Map(faceIds.map((faceId) => {
    const laidOut = panels.some((panel) => panel.faceId === faceId);
    return [faceId, laidOut ? inheriting.filter((panel) => panel.faceId === faceId).map((panel) => panel.piece) : null];
  }));
  const everyFaceLaidOut = panels.length > 0 && [...facePiecesById.values()].every((pieces) => pieces !== null);
  return {
    remainingWallPieces: everyFaceLaidOut
      ? inheriting.filter((panel) => !faceIds.includes(panel.faceId)).map((panel) => panel.piece)
      : null,
    facePiecesById,
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
  const openings = mapPlanOpeningsToRoomRenderer([...planOpenings], housePlan.rooms);
  return rooms.map((room) =>
    resolveRoomWallFinishQuantities(
      room,
      buildRoomWallPanels(room, topologyRoomById.get(room.id), housePlan.rooms, openings)
    )
  );
}
