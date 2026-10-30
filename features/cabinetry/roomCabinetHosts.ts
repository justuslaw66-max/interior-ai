import { PLAN_OPENING_DEFAULT_HEIGHT_METERS } from "@/lib/design-page-plan-overlays";
import { ROOM_DIMENSION_DEFAULTS } from "@/lib/design-page-house-plan";
import type { RoomOpening2D } from "@/lib/editorScene";
import {
  clampBuiltInToRoom,
  getRoomBuiltInFaces,
  isBuiltInFaceInRoom,
  isImportedPlanRoom,
  type AcuteCorner,
  type BuiltInFaceEdge,
} from "@/lib/room-built-in-faces";
import { getRoomPlanOutlinePoints } from "@/lib/room-finished-outline";
import type { RoomSnapshot } from "@/lib/room-types";

import {
  createCabinetPolygonWallSpaces,
  createCabinetRoomWallSpaces,
  getCabinetFitPlacement,
  mapCabinetCardinalOpeningsToPolygonWalls,
} from "./fitToSpace";
import type { CabinetDefinition, CabinetHostSpace } from "./types";

/**
 * A room's walls as Fit to Space hosts (J, 29 Oct 2026: "Face, back flush"). Each host is its wall's finished face
 * (lib/room-built-in-faces.ts): the bare wall half its thickness in from the outline, or its laminate panel's face. It runs
 * between the faces either side, and a fitted run stops the default 10 mm installation allowance short of each, more by a
 * recorded baseboard, and further from an acute corner by its depth (the host's setbacks). Its back stands against the face, or
 * the baseboard: the host's segment is the face, which getCabinetFitPlacement puts the back on. A room from an imported plan
 * keeps the hosts it had (its outline, a whole average wall plus 10 mm off each end), as furniture's rule there does.
 */

/** Fit to Space's allowance at each end of a run, from the finished face of the wall there (or its baseboard). */
export const CABINET_RUN_END_ALLOWANCE_MM = 10;

export type CabinetryAvailableSpacesInput = {
  activeRoom: RoomSnapshot | null;
  activePlanRoom: { w: number; d: number } | null;
  planRoomCount: number;
  planOpenings: RoomOpening2D[];
};

export function buildCabinetryAvailableSpaces({
  activeRoom,
  activePlanRoom,
  planRoomCount,
  planOpenings,
}: CabinetryAvailableSpacesInput): CabinetHostSpace[] {
  if (!activeRoom) return [];
  const imported = isImportedPlanRoom(activeRoom);
  const wallMm = Math.round((activeRoom.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness) * 1000);
  const baseboardOffsetMm = Math.max(0, Math.round((activeRoom.geometry.baseboardDepth ?? 0) * 1000));
  const sharedSpaceInput = {
    roomId: activeRoom.id,
    roomName: activeRoom.name,
    roomType: activeRoom.roomType === "balcony" ? "custom" : activeRoom.roomType,
    heightMm: Math.round((activeRoom.geometry.height ?? ROOM_DIMENSION_DEFAULTS.roomHeight) * 1000),
    baseboardOffsetMm,
    // The back stands off the face by the baseboard; a run on the floor keeps the allowance from the end walls' baseboards too
    // (the host's baseboard clearances, read by getCabinetAvailableSegments).
    installationClearanceSideMm: imported ? wallMm + CABINET_RUN_END_ALLOWANCE_MM : CABINET_RUN_END_ALLOWANCE_MM,
  };
  const openings = getRoomHostOpenings(activeRoom.id, planRoomCount, planOpenings);

  if ((activeRoom.planShape ?? "rectangle") === "rectangle") {
    const size = { w: activePlanRoom?.w ?? activeRoom.geometry.width, d: activePlanRoom?.d ?? activeRoom.geometry.depth };
    if (imported) {
      const [widthMm, depthMm] = [size.w, size.d].map((value) => Math.max(1, Math.round(value * 1000) - wallMm * 2));
      return createCabinetRoomWallSpaces({ ...sharedSpaceInput, installationClearanceSideMm: CABINET_RUN_END_ALLOWANCE_MM, widthMm, depthMm, openings });
    }
    const [northWest, , southEast] = getRoomBuiltInFaces(activeRoom, size).polygon;
    return createCabinetRoomWallSpaces({
      ...sharedSpaceInput,
      widthMm: Math.max(1, Math.round((southEast.x - northWest.x) * 1000)),
      depthMm: Math.max(1, Math.round((southEast.z - northWest.z) * 1000)),
      openings,
    }).map((space) => withRectangleFaceSegment(space, northWest, southEast, baseboardOffsetMm));
  }

  // The L-shape's or drawn shape's walls along their outline (the wall centre line), where their openings are drawn.
  const outline = getRoomPlanOutlinePoints({
    shape: activeRoom.planShape ?? "rectangle", polygon: activeRoom.planPolygon, w: activeRoom.geometry.width, d: activeRoom.geometry.depth,
  });
  const outlineSpaces = createCabinetPolygonWallSpaces({
    ...sharedSpaceInput,
    polygon: outline,
    openings: mapCabinetCardinalOpeningsToPolygonWalls({ polygon: outline, openings }),
  });
  if (imported) return outlineSpaces;
  // Each then moves onto its own face; a wall whose face lies inside another wall isn't offered.
  const faces = getRoomBuiltInFaces(activeRoom);
  return outlineSpaces
    .filter((space) => isBuiltInFaceInRoom(faces, wallIndex(space.wallId ?? "")))
    .map((space) => withFaceSegment(space, faces.edges[wallIndex(space.wallId ?? "")], baseboardOffsetMm));
}

/** The room's openings as Fit sees them; a roomless one (from an older design) belongs to the only room. */
function getRoomHostOpenings(roomId: string, planRoomCount: number, planOpenings: RoomOpening2D[]) {
  return planOpenings
    .filter((opening) => opening.roomId === roomId || (planRoomCount <= 1 && !opening.roomId))
    .map((opening) => ({
      id: opening.id,
      wall: opening.wall,
      kind: opening.kind,
      offsetMm: opening.offsetMm,
      widthMm: opening.widthMm,
      heightMm: opening.heightMm ?? Math.round(PLAN_OPENING_DEFAULT_HEIGHT_METERS * 1000),
      bottomMm: opening.kind === "window" ? opening.bottomMm ?? 900 : 0,
      label: opening.kind === "door" ? "Door" : "Window",
    }));
}

/**
 * A rectangle's host on its finished face. The segment runs along +x or +z, so its offsets keep the room's direction, measured
 * from the face's middle; its openings (measured from the room's centre) move by that middle.
 */
function withRectangleFaceSegment(
  space: CabinetHostSpace, northWest: { x: number; z: number }, southEast: { x: number; z: number }, baseboardMm: number
): CabinetHostSpace {
  const alongX = space.wall === "north" || space.wall === "south";
  const line = space.wall === "north" ? northWest.z : space.wall === "south" ? southEast.z : space.wall === "west" ? northWest.x : southEast.x;
  const [start, end] = alongX ? [northWest.x, southEast.x] : [northWest.z, southEast.z];
  const middleMm = ((start + end) / 2) * 1000;
  const inward = space.wall === "north" || space.wall === "west" ? 1 : -1;
  const baseboards = { startBaseboardClearanceMm: baseboardMm, endBaseboardClearanceMm: baseboardMm };
  return {
    ...space,
    wallSegment: alongX
      ? { startXmm: start * 1000, startZmm: line * 1000, endXmm: end * 1000, endZmm: line * 1000, inwardNormalX: 0, inwardNormalZ: inward, ...baseboards }
      : { startXmm: line * 1000, startZmm: start * 1000, endXmm: line * 1000, endZmm: end * 1000, inwardNormalX: inward, inwardNormalZ: 0, ...baseboards },
    openings: space.openings.map((opening) => ({ ...opening, offsetMm: Number((opening.offsetMm - middleMm).toFixed(3)) })),
  };
}

function wallIndex(wallId: string): number {
  return Number(wallId.replace("wall-", ""));
}

/**
 * An outline host moved onto its face: the face's own length and ends, with its openings, measured from the outline edge's
 * middle, re-measured from the face's middle. At a corner under 90° a run's end stands back so that its nearest point, its
 * front corner, keeps the allowance (and the baseboard) from the next face, measured from that face: the allowance over the
 * angle's sine, the baseboard's own share, and the run's depth times its cotangent (`getCabinetAvailableSegments`).
 */
function withFaceSegment(space: CabinetHostSpace, face: BuiltInFaceEdge, baseboardMm: number): CabinetHostSpace {
  const outlineSegment = space.wallSegment;
  if (!outlineSegment) return space;
  const sideMm = space.installationClearanceLeftMm ?? CABINET_RUN_END_ALLOWANCE_MM;
  // The back stands the baseboard off the face, so at an acute corner that share stands back too (baseboardMm × cot).
  const endClearanceMm = (corner: AcuteCorner | null) => (corner ? sideMm / corner.sin + baseboardMm * corner.cot : sideMm);
  const baseboardClearanceMm = (corner: AcuteCorner | null) => (corner ? baseboardMm / corner.sin : baseboardMm);
  const length = space.availableWidthMm || 1;
  const dx = (outlineSegment.endXmm - outlineSegment.startXmm) / length, dz = (outlineSegment.endZmm - outlineSegment.startZmm) / length;
  const shiftMm = ((outlineSegment.startXmm + outlineSegment.endXmm) / 2 - (face.start.x + face.end.x) * 500) * dx +
    ((outlineSegment.startZmm + outlineSegment.endZmm) / 2 - (face.start.z + face.end.z) * 500) * dz;
  return {
    ...space,
    availableWidthMm: Math.hypot(face.end.x - face.start.x, face.end.z - face.start.z) * 1000,
    installationClearanceLeftMm: endClearanceMm(face.startAcute),
    installationClearanceRightMm: endClearanceMm(face.endAcute),
    wallSegment: {
      ...outlineSegment,
      startXmm: face.start.x * 1000, startZmm: face.start.z * 1000, endXmm: face.end.x * 1000, endZmm: face.end.z * 1000,
      startSetbackPerDepth: face.startAcute?.cot ?? 0, endSetbackPerDepth: face.endAcute?.cot ?? 0,
      startBaseboardClearanceMm: baseboardClearanceMm(face.startAcute), endBaseboardClearanceMm: baseboardClearanceMm(face.endAcute),
    },
    openings: space.openings.map((opening) => ({ ...opening, offsetMm: Number((opening.offsetMm + shiftMm).toFixed(3)) })),
  };
}

/**
 * Where Place as copy puts a copy of a fitted run in `room`: 15 cm along its wall. A run fitted nowhere, or in an imported plan's
 * room (which keeps the line's rule), moves 15 cm along x for a north or south wall, z for an east or west one, or both.
 */
export function getCabinetCopyOffset(host: CabinetHostSpace | undefined, room: RoomSnapshot): [number, number] {
  const segment = host?.wallSegment;
  if (segment && !isImportedPlanRoom(room)) {
    const length = Math.hypot(segment.endXmm - segment.startXmm, segment.endZmm - segment.startZmm) || 1;
    return [(0.15 * (segment.endXmm - segment.startXmm)) / length, (0.15 * (segment.endZmm - segment.startZmm)) / length];
  }
  const wall = host?.wall;
  return [!wall || wall === "north" || wall === "south" ? 0.15 : 0, !wall || wall === "east" || wall === "west" ? 0.15 : 0];
}

/**
 * Where a built-in is placed in `room`: where Fit to Space put it, or the room's middle, kept inside the room
 * (clampBuiltInToRoom). A copy moves from there along its wall as far as it still fits.
 */
export function getCabinetPlacement(
  definition: CabinetDefinition, room: RoomSnapshot, placeAsCopy = false
): { position: [number, number, number]; rotationY: number } {
  const fitted = getCabinetFitPlacement(definition, room.geometry.width, room.geometry.depth);
  const rotationY = fitted?.rotationY ?? 0;
  const at: [number, number] = [fitted?.position[0] ?? 0, fitted?.position[2] ?? 0];
  const [offsetX, offsetZ] = placeAsCopy ? getCabinetCopyOffset(definition.fitState?.host, room) : [0, 0];
  const [x, z] = clampBuiltInToRoom(room, at[0] + offsetX, at[1] + offsetZ, definition.totalWidth / 1000, definition.depth / 1000,
    rotationY, { from: at });
  return { position: [x, fitted?.position[1] ?? 0, z], rotationY };
}
