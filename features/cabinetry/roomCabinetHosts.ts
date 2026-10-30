import { PLAN_OPENING_DEFAULT_HEIGHT_METERS } from "@/lib/design-page-plan-overlays";
import { ROOM_DIMENSION_DEFAULTS } from "@/lib/design-page-house-plan";
import type { RoomOpening2D } from "@/lib/editorScene";
import { clampBuiltInToRoom, getRoomBuiltInFaces, usesFurnitureRuleForBuiltIns } from "@/lib/room-built-in-faces";
import { getBuiltInFaceObstaclesAlong, type BuiltInFaceHost } from "@/lib/room-built-in-region";
import { getRoomOutlineInsideFinishes, getRoomPlanOutlinePoints } from "@/lib/room-finished-outline";
import { getRoomWallFinishDepths } from "@/lib/room-wall-finish-depths";
import type { RoomSnapshot } from "@/lib/room-types";

import {
  createCabinetPolygonWallSpaces,
  createCabinetRoomWallSpaces,
  getCabinetFitPlacement,
  mapCabinetCardinalOpeningsToPolygonWalls,
} from "./fitToSpace";
import type { CabinetDefinition, CabinetHostSpace } from "./types";

/**
 * A room's walls as Fit to Space hosts (J, 29 Oct 2026: "Face, back flush"). Each host is its wall's exposed finished face
 * (lib/room-built-in-region.ts): the bare wall half its thickness in from the outline, or its laminate panel's face, where
 * nothing stands in front of it. A fitted run stops the default 10 mm installation allowance short of the face's ends, and
 * keeps it from every other wall, panel and column (the host's obstacles), measured from whatever its nearest point meets;
 * a run on the floor keeps a recorded baseboard's depth more. Its back stands against the face, or the baseboard: the host's
 * segment is the face, which getCabinetFitPlacement puts the back on. A room on furniture's rule for built-ins (an imported
 * plan's, or one with no exposed face) keeps the hosts it had on the line: its outline, a whole wall plus 10 mm off each end.
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
  const isRectangle = (activeRoom.planShape ?? "rectangle") === "rectangle";
  const size = { w: activePlanRoom?.w ?? activeRoom.geometry.width, d: activePlanRoom?.d ?? activeRoom.geometry.depth };
  const baseboardOffsetMm = Math.max(0, Math.round((activeRoom.geometry.baseboardDepth ?? 0) * 1000));
  const sharedSpaceInput = {
    roomId: activeRoom.id,
    roomName: activeRoom.name,
    roomType: activeRoom.roomType === "balcony" ? "custom" : activeRoom.roomType,
    heightMm: Math.round((activeRoom.geometry.height ?? ROOM_DIMENSION_DEFAULTS.roomHeight) * 1000),
    baseboardOffsetMm,
  };
  const openings = getRoomHostOpenings(activeRoom.id, planRoomCount, planOpenings);
  if (usesFurnitureRuleForBuiltIns(activeRoom, isRectangle ? size : undefined)) {
    return buildLineHosts(activeRoom, size, sharedSpaceInput, openings);
  }

  if (isRectangle) {
    // The faces' corners: each wall's face half the wall and its panel in from the outline (north, east, south, west).
    const faces = getRoomBuiltInFaces(activeRoom, size), [inNorth, inEast, inSouth, inWest] = faces.insets;
    const northWest = { x: faces.outline[0].x + inWest, z: faces.outline[0].z + inNorth };
    const southEast = { x: faces.outline[2].x - inEast, z: faces.outline[2].z - inSouth };
    // A column in the room stands in front of the faces: the hosts keep clear of it (and of the walls and the faces' ends).
    const corners = [northWest, { x: southEast.x, z: northWest.z }, southEast, { x: northWest.x, z: southEast.z }];
    const obstaclesAlong = (index: number) => activeRoom.planHoles?.length
      ? getBuiltInFaceObstaclesAlong(faces, index, corners[index], corners[(index + 1) % 4]) : undefined;
    return createCabinetRoomWallSpaces({
      ...sharedSpaceInput,
      widthMm: Math.max(1, Math.round((southEast.x - northWest.x) * 1000)),
      depthMm: Math.max(1, Math.round((southEast.z - northWest.z) * 1000)),
      openings,
    }).map((space) => withRectangleFaceSegment(space, northWest, southEast, baseboardOffsetMm, obstaclesAlong(RECTANGLE_WALLS.indexOf(space.wall ?? "north"))));
  }

  // The L-shape's or drawn shape's walls along their outline (the wall centre line), where their openings are drawn; each
  // then moves onto its exposed face, and a wall with none (inside another wall) isn't offered. The back stands off the face
  // by the baseboard; a run on the floor keeps the allowance from the end walls' baseboards too (the baseboard clearances).
  const outline = getRoomPlanOutlinePoints({
    shape: activeRoom.planShape ?? "rectangle", polygon: activeRoom.planPolygon, w: activeRoom.geometry.width, d: activeRoom.geometry.depth,
  });
  const outlineSpaces = createCabinetPolygonWallSpaces({
    ...sharedSpaceInput,
    polygon: outline,
    openings: mapCabinetCardinalOpeningsToPolygonWalls({ polygon: outline, openings }),
    installationClearanceSideMm: CABINET_RUN_END_ALLOWANCE_MM,
  });
  return placeOnFaces(outlineSpaces, getRoomBuiltInFaces(activeRoom).exposed, baseboardOffsetMm);
}

/**
 * Each outline host on its wall's exposed face. A straight wall drawn in pieces has one face over them all: it is listed once,
 * as its first piece, with every piece's doors and windows.
 */
function placeOnFaces(spaces: CabinetHostSpace[], exposed: ReadonlyArray<BuiltInFaceHost | null>, baseboardMm: number): CabinetHostSpace[] {
  const listed = new Set<string>();
  return spaces.flatMap((space) => {
    const face = exposed[wallIndex(space.wallId ?? "")];
    const key = face && [face.start.x, face.start.z, face.end.x, face.end.z].map((value) => value.toFixed(6)).join();
    if (!face || !key || listed.has(key)) return [];
    listed.add(key);
    return [withFaceSegment(space, face, baseboardMm, spaces)];
  });
}

/**
 * The hosts Fit to Space had on the line (0197c5c4), for a room on furniture's rule: a rectangle's walls less its walls'
 * thickness and panels; a drawn shape's outline moved in by its panels, a whole wall plus 10 mm off each end.
 */
function buildLineHosts(
  room: RoomSnapshot, size: { w: number; d: number }, shared: Omit<Parameters<typeof createCabinetRoomWallSpaces>[0], "widthMm" | "depthMm" | "openings">,
  openings: ReturnType<typeof getRoomHostOpenings>
): CabinetHostSpace[] {
  const wallMm = Math.round((room.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness) * 1000);
  const depths = getRoomWallFinishDepths(room);
  const panelMm = (faceId: string) => Math.round((depths[faceId] ?? 0) * 1000);
  const shape = room.planShape ?? "rectangle";
  if (shape !== "rectangle") {
    const polygon = getRoomPlanOutlinePoints(getRoomOutlineInsideFinishes({
      shape, polygon: room.planPolygon, w: room.geometry.width, d: room.geometry.depth,
    }, depths));
    return createCabinetPolygonWallSpaces({
      ...shared, polygon, openings: mapCabinetCardinalOpeningsToPolygonWalls({ polygon, openings }), installationClearanceSideMm: wallMm + 10,
    });
  }
  return createCabinetRoomWallSpaces({
    ...shared,
    widthMm: Math.max(1, Math.round(size.w * 1000) - wallMm * 2 - panelMm("west") - panelMm("east")),
    depthMm: Math.max(1, Math.round(size.d * 1000) - wallMm * 2 - panelMm("north") - panelMm("south")),
    openings,
  });
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
const RECTANGLE_WALLS = ["north", "east", "south", "west"];

function withRectangleFaceSegment(
  space: CabinetHostSpace, northWest: { x: number; z: number }, southEast: { x: number; z: number }, baseboardMm: number,
  faceObstacles?: Array<Array<[number, number]>>
): CabinetHostSpace {
  const alongX = space.wall === "north" || space.wall === "south";
  const line = space.wall === "north" ? northWest.z : space.wall === "south" ? southEast.z : space.wall === "west" ? northWest.x : southEast.x;
  const [start, end] = alongX ? [northWest.x, southEast.x] : [northWest.z, southEast.z];
  const middleMm = ((start + end) / 2) * 1000;
  const inward = space.wall === "north" || space.wall === "west" ? 1 : -1;
  // The face's frame runs along its outline edge (west along the south wall, north along the west); the host east or south.
  const flip = space.wall === "south" || space.wall === "west" ? -1 : 1;
  const obstacles = faceObstacles?.map((points) => points.map(([along, into]): [number, number] => [along * flip, into]));
  const baseboards = { startBaseboardClearanceMm: baseboardMm, endBaseboardClearanceMm: baseboardMm, ...(obstacles?.length ? { obstacles } : {}) };
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
 * An outline host moved onto its exposed face: the face's own length and ends, the walls and columns in front of it to keep
 * clear of, and the doors and windows of every piece of the outline along it, measured from the face's middle.
 */
function withFaceSegment(space: CabinetHostSpace, face: BuiltInFaceHost, baseboardMm: number, spaces: CabinetHostSpace[]): CabinetHostSpace {
  const outlineSegment = space.wallSegment;
  if (!outlineSegment) return space;
  const widthMm = Math.hypot(face.end.x - face.start.x, face.end.z - face.start.z) * 1000;
  const length = space.availableWidthMm || 1;
  const dx = (outlineSegment.endXmm - outlineSegment.startXmm) / length, dz = (outlineSegment.endZmm - outlineSegment.startZmm) / length;
  const pieces = spaces.filter(({ wallSegment: piece }) => piece && isOnLine(piece, outlineSegment, dx, dz));
  const openings = pieces.flatMap((piece) => {
    const segment = piece.wallSegment;
    if (!segment) return [];
    const shiftMm = ((segment.startXmm + segment.endXmm) / 2 - (face.start.x + face.end.x) * 500) * dx +
      ((segment.startZmm + segment.endZmm) / 2 - (face.start.z + face.end.z) * 500) * dz;
    return piece.openings.map((opening) => ({ ...opening, offsetMm: Number((opening.offsetMm + shiftMm).toFixed(3)) }))
      .filter((opening) => Math.abs(opening.offsetMm) < widthMm / 2 + opening.widthMm / 2);
  });
  return {
    ...space,
    availableWidthMm: widthMm,
    wallSegment: {
      ...outlineSegment,
      startXmm: face.start.x * 1000, startZmm: face.start.z * 1000, endXmm: face.end.x * 1000, endZmm: face.end.z * 1000,
      startBaseboardClearanceMm: baseboardMm, endBaseboardClearanceMm: baseboardMm,
      ...(face.obstacles.length ? { obstacles: face.obstacles } : {}),
    },
    openings,
  };
}

/** True when the outline piece runs the same way along the same line as the segment (a straight wall drawn in pieces). */
function isOnLine(piece: NonNullable<CabinetHostSpace["wallSegment"]>, segment: NonNullable<CabinetHostSpace["wallSegment"]>, dx: number, dz: number): boolean {
  const length = Math.hypot(piece.endXmm - piece.startXmm, piece.endZmm - piece.startZmm) || 1;
  const parallel = ((piece.endXmm - piece.startXmm) * dx + (piece.endZmm - piece.startZmm) * dz) / length > 1 - 1e-9;
  return parallel && Math.abs((piece.startXmm - segment.startXmm) * dz - (piece.startZmm - segment.startZmm) * dx) < 0.001;
}

/**
 * Where Place as copy puts a copy of a fitted run in `room`: 15 cm along its wall. A run fitted nowhere, or in a room on
 * furniture's rule (which keeps the line's), moves 15 cm along x for a north or south wall, z for an east or west one, or both.
 */
export function getCabinetCopyOffset(host: CabinetHostSpace | undefined, room: RoomSnapshot): [number, number] {
  const segment = host?.wallSegment;
  if (segment && !usesFurnitureRuleForBuiltIns(room)) {
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
