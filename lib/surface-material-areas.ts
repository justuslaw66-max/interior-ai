import { clampFloorPatternScale, normalizeFloorRotationDeg } from "./floor-materials";
import { getRoomSnapshotFloorAreaSqm } from "./room-floor-area";
import type {
  PersistedPlanOpening,
  RoomFloorPattern,
  RoomSnapshot,
  RoomSurfaceAssignments,
} from "./room-types";
import {
  getDefaultWallSurfaceSettings,
  getWallFaceLabel,
  getWallFaceSurfaceSettings,
  normalizeFloorSurfaceSettings,
} from "./surface-settings";
import { buildRoomWallFinishQuantities, type RoomWallFinishQuantities } from "./surface-material-wall-panels";

/** How a finish is laid on its surface, as the room assigns it. */
export type SurfaceAreaSettings = {
  pattern: RoomFloorPattern;
  rotationDeg: number;
  scale: number;
  offset: { x: number; y: number };
  jointSizeMm: number;
  jointColor: string;
};

/**
 * One finish on one surface of a room: which material, how big the surface is and how much to
 * order. No catalogue lookup, so the editor (in the browser) and the share export (on the server)
 * measure surfaces the same way; `surface-material-bom.ts` adds the material's catalogue record.
 */
export type SurfaceAreaRow = {
  roomId: string;
  roomName: string;
  floorLabel?: string;
  surface: "floor" | "walls" | "selected_wall";
  surfaceLabel: string;
  surfaceAreaSqm: number;
  roomAreaSqm: number;
  orderAreaSqm: number;
  wasteFactor: number;
  wallFaceId: string | null;
  wallPanelId: string | null;
  /** The material id (or slug) the room assigns. */
  materialId: string;
  settings: SurfaceAreaSettings;
};

export const FLOORING_WASTE_FACTOR = 0.1;

export function roundSquareMeters(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getRoomSurfaceAssignments(room: RoomSnapshot): RoomSurfaceAssignments | undefined {
  return room.surfaces ?? room.surfaceFinishes;
}

type RoomAreaRows = { room: RoomSnapshot; roomAreaSqm: number; rows: SurfaceAreaRow[] };
type AreaRowInput = Pick<SurfaceAreaRow, "surface" | "surfaceLabel" | "surfaceAreaSqm" | "settings"> & {
  materialId: string | null | undefined;
  wallFaceId?: string | null;
  wallPanelId?: string | null;
};

function pushAreaRow(target: RoomAreaRows, input: AreaRowInput) {
  const materialId = String(input.materialId ?? "").trim();
  if (!materialId) return;
  const surfaceAreaSqm = roundSquareMeters(input.surfaceAreaSqm);
  target.rows.push({
    roomId: target.room.id,
    roomName: target.room.name,
    floorLabel: target.room.floorLabel,
    surface: input.surface,
    surfaceLabel: input.surfaceLabel,
    surfaceAreaSqm,
    roomAreaSqm: target.roomAreaSqm,
    orderAreaSqm: roundSquareMeters(surfaceAreaSqm * (1 + FLOORING_WASTE_FACTOR)),
    wasteFactor: FLOORING_WASTE_FACTOR,
    wallFaceId: input.wallFaceId ?? null,
    wallPanelId: input.wallPanelId ?? null,
    materialId,
    settings: input.settings,
  });
}

function wallSettings(settings: SurfaceAreaSettings): SurfaceAreaSettings {
  const { pattern, rotationDeg, scale, offset, jointSizeMm, jointColor } = settings;
  return { pattern, rotationDeg, scale, offset, jointSizeMm, jointColor };
}

function pushFloorRow(target: RoomAreaRows, surfaces: RoomSurfaceAssignments | undefined) {
  const floor = normalizeFloorSurfaceSettings(surfaces, normalizeFloorRotationDeg, clampFloorPatternScale);
  pushAreaRow(target, {
    materialId: surfaces?.floorMaterialId ?? surfaces?.floor?.materialId,
    surface: "floor",
    surfaceLabel: "Floor",
    surfaceAreaSqm: getRoomSnapshotFloorAreaSqm(target.room),
    settings: {
      pattern: floor.floorPattern,
      rotationDeg: floor.floorRotationDeg,
      scale: floor.floorScale,
      offset: floor.floorPatternOffset,
      jointSizeMm: floor.floorJointSizeMm,
      jointColor: floor.floorJointColor,
    },
  });
}

function pushWallRows(target: RoomAreaRows, surfaces: RoomSurfaceAssignments | undefined, walls: RoomWallFinishQuantities) {
  const defaults = getDefaultWallSurfaceSettings(surfaces, normalizeFloorRotationDeg, clampFloorPatternScale);
  const faceIds = [...walls.faceAreaSqmById.keys()];
  pushAreaRow(target, {
    materialId: defaults.materialId,
    surface: "walls",
    surfaceLabel: faceIds.length > 0 ? "Remaining walls" : "All walls",
    surfaceAreaSqm: walls.remainingWallAreaSqm,
    settings: wallSettings(defaults),
  });
  for (const faceId of faceIds) {
    const face = getWallFaceSurfaceSettings(surfaces, faceId, normalizeFloorRotationDeg, clampFloorPatternScale);
    pushAreaRow(target, {
      materialId: face.materialId,
      surface: "selected_wall",
      surfaceLabel: getWallFaceLabel(faceId),
      surfaceAreaSqm: walls.faceAreaSqmById.get(faceId) ?? 0,
      wallFaceId: faceId,
      settings: wallSettings(face),
    });
  }
  for (const panel of walls.assignedPanels) {
    pushAreaRow(target, {
      materialId: panel.settings.materialId,
      surface: "selected_wall",
      surfaceLabel: panel.surfaceLabel,
      surfaceAreaSqm: panel.areaSqm,
      wallFaceId: panel.faceId,
      wallPanelId: panel.panelId,
      settings: wallSettings(panel.settings),
    });
  }
}

/** Each room's floor, then its walls (the default finish, finished faces, then panels). */
export function buildRoomSurfaceAreaRows(
  rooms: RoomSnapshot[],
  planOpenings: readonly PersistedPlanOpening[] = []
): SurfaceAreaRow[] {
  const wallFinishQuantities = buildRoomWallFinishQuantities(rooms, planOpenings);
  return rooms.flatMap((room, roomIndex) => {
    const target: RoomAreaRows = { room, roomAreaSqm: roundSquareMeters(getRoomSnapshotFloorAreaSqm(room)), rows: [] };
    const surfaces = getRoomSurfaceAssignments(room);
    pushFloorRow(target, surfaces);
    pushWallRows(target, surfaces, wallFinishQuantities[roomIndex]);
    return target.rows;
  });
}
