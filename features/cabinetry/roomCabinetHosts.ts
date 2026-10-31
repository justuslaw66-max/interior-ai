import { ROOM_DIMENSION_DEFAULTS } from "@/lib/design-page-house-plan";
import type { RoomOpening2D } from "@/lib/editorScene";
import {
  clampBuiltInToRoom,
  getRoomBuiltInFaces,
  usesFurnitureRuleForBuiltIns,
  type BuiltInPlanRooms,
} from "@/lib/room-built-in-faces";
import { getBuiltInFaceObstaclesAlong, type BuiltInFaceHost } from "@/lib/room-built-in-region";
import { getRoomOutlineInsideFinishes, getRoomPlanOutlinePoints } from "@/lib/room-finished-outline";
import { getRoomWallFaceIds, getRoomWallFinishDepths } from "@/lib/room-wall-finish-depths";
import type { RoomSnapshot } from "@/lib/room-types";

import {
  createCabinetPolygonWallSpaces,
  createCabinetRoomWallSpaces,
  getCabinetFitPlacement,
  mapCabinetCardinalOpeningsToPolygonWalls,
} from "./fitToSpace";
import { findMirroredEdges, getDrawnOutlineOpenings, getRoomHostOpenings, getSharedOpenings } from "./roomCabinetHostOpenings";
import type { CabinetDefinition, CabinetHostSpace } from "./types";

/**
 * A room's walls as Fit to Space hosts (J, 29 Oct 2026: "Face, back flush"). Each host is its wall's exposed finished face
 * (lib/room-built-in-region.ts): the bare wall half its thickness in from the outline, or its laminate panel's face, where
 * nothing stands in front of it. A fitted run stops the default 10 mm installation allowance short of the face's ends, and
 * keeps it from every other wall, panel and column (the host's obstacles), measured from whatever its nearest point meets;
 * a run on the floor keeps a recorded baseboard's depth more. The walls of the rooms around it stand as the 3D view draws them
 * (`planRooms`, the plan's rooms), and a door or window of theirs on a wall it shares cuts the host as its own do. Its back
 * stands against the face (a run on the floor against the baseboard): the host's segment is the face, which
 * getCabinetFitPlacement puts the back on. A room on furniture's rule for built-ins (an imported plan's, or one with no exposed
 * face) keeps the hosts it had on the line: its outline, a whole wall plus 10 mm off each end.
 */

/** Fit to Space's allowance at each end of a run, from the finished face of the wall there (or its baseboard). */
export const CABINET_RUN_END_ALLOWANCE_MM = 10;

export type CabinetryAvailableSpacesInput = {
  activeRoom: RoomSnapshot | null;
  activePlanRoom: { w: number; d: number } | null;
  planRoomCount: number;
  planOpenings: RoomOpening2D[];
  planRooms?: BuiltInPlanRooms;
};

export function buildCabinetryAvailableSpaces(input: CabinetryAvailableSpacesInput): CabinetHostSpace[] {
  const { activeRoom } = input;
  if (!activeRoom) return [];
  const key = getHostsKey(activeRoom, input), known = hostsByGeometry.get(activeRoom.geometry);
  if (known && isSameHostsKey(known.key, key)) return known.spaces;
  const spaces = buildHosts(activeRoom, input);
  hostsByGeometry.set(activeRoom.geometry, { key, spaces });
  return spaces;
}

// Fit's hosts per room, kept while all but its items stay: a group drag gives the room and the plan's rooms new snapshots on
// every frame of a 3D drag (a single item's drag previews without one), but keeps their outlines, walls and doors.
type HostsKey = {
  room: Record<string, unknown>; geometry: Record<string, unknown>; size: unknown[]; planRoomCount: number; planOpenings: readonly RoomOpening2D[];
  planRooms: Record<string, unknown>[] | null;
};
const hostsByGeometry = new WeakMap<RoomSnapshot["geometry"], { key: HostsKey; spaces: CabinetHostSpace[] }>();

function getHostsKey(room: RoomSnapshot, input: CabinetryAvailableSpacesInput): HostsKey {
  return {
    room: { ...room, items: undefined }, geometry: { ...room.geometry },
    size: [input.activePlanRoom?.w, input.activePlanRoom?.d], planRoomCount: input.planRoomCount, planOpenings: [...input.planOpenings],
    // Fit reads no plan room's surfaces (its own come from the room), which the plan rebuilds with every snapshot.
    planRooms: input.planRooms ? [...input.planRooms.values()].map((other) => ({ ...other, surfaces: undefined, surfaceFinishes: undefined })) : null,
  };
}

function isSameFields(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]));
}

function isSameHostsKey(a: HostsKey, b: HostsKey): boolean {
  const sameList = <T>(x: readonly T[], y: readonly T[], same: (p: T, q: T) => boolean) => x.length === y.length && x.every((p, i) => same(p, y[i]));
  return isSameFields(a.room, b.room) && isSameFields(a.geometry, b.geometry) && sameList(a.size, b.size, Object.is) &&
    a.planRoomCount === b.planRoomCount && sameList(a.planOpenings, b.planOpenings, Object.is) &&
    (a.planRooms === null || b.planRooms === null ? a.planRooms === b.planRooms : sameList(a.planRooms, b.planRooms, isSameFields));
}

function buildHosts(activeRoom: RoomSnapshot, { activePlanRoom, planRoomCount, planOpenings, planRooms }: CabinetryAvailableSpacesInput) {
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
  if (usesFurnitureRuleForBuiltIns(activeRoom, isRectangle ? size : undefined, planRooms)) {
    return buildLineHosts(activeRoom, size, sharedSpaceInput, openings);
  }
  const shared = getSharedOpenings(activeRoom, planRooms, planOpenings);

  if (isRectangle) return buildRectangleHosts(activeRoom, size, sharedSpaceInput, openings, shared, planRooms);

  // The L-shape's or drawn shape's walls along their outline (the wall centre line), where their openings are drawn; each
  // then moves onto its exposed face, and a wall with none (inside another wall) isn't offered. A run on the floor stands off
  // the face by the baseboard and keeps the allowance from the end walls' baseboards too (the baseboard clearances).
  const outline = getRoomPlanOutlinePoints({
    shape: activeRoom.planShape ?? "rectangle", polygon: activeRoom.planPolygon, w: activeRoom.geometry.width, d: activeRoom.geometry.depth,
  });
  const sharedOnOutline = shared.flatMap(({ opening, center, tangent }) => findMirroredEdges(outline, center, tangent, opening.widthMm / 1000)
    .map((edge) => ({ ...opening, wallId: `wall-${edge.index}`, offsetMm: Number(((edge.along - edge.length / 2) * 1000).toFixed(3)) })));
  const outlineSpaces = createCabinetPolygonWallSpaces({
    ...sharedSpaceInput,
    polygon: outline,
    openings: [...getDrawnOutlineOpenings(activeRoom, outline, planOpenings, openings, planRooms), ...sharedOnOutline],
    installationClearanceSideMm: CABINET_RUN_END_ALLOWANCE_MM,
  });
  return placeOnFaces(outlineSpaces, getRoomBuiltInFaces(activeRoom, undefined, planRooms).exposed, baseboardOffsetMm);
}

type Point = { x: number; z: number };

type SharedSpaceInput = Omit<Parameters<typeof createCabinetRoomWallSpaces>[0], "widthMm" | "depthMm" | "openings">;

/**
 * A drawn rectangle's hosts, each wall's face between the faces' corners: half the wall and its panel in from the outline
 * (north, east, south, west). With rooms next door, each is its wall's exposed face (a thicker wall next door may move a
 * face, or end the next one short of the corner), and a wall with none isn't offered. A door of the room next door on a wall
 * they share is at the rectangle's middle plus its offset, as the room's own are.
 */
function buildRectangleHosts(
  room: RoomSnapshot, size: { w: number; d: number }, shared: SharedSpaceInput, openings: ReturnType<typeof getRoomHostOpenings>,
  sharedOpenings: ReturnType<typeof getSharedOpenings>, planRooms: BuiltInPlanRooms | undefined
): CabinetHostSpace[] {
  const faces = getRoomBuiltInFaces(room, size, planRooms), [inNorth, inEast, inSouth, inWest] = faces.insets;
  const northWest = { x: faces.outline[0].x + inWest, z: faces.outline[0].z + inNorth };
  const southEast = { x: faces.outline[2].x - inEast, z: faces.outline[2].z - inSouth };
  // A column in the room stands in front of the faces: the hosts keep clear of it (and of the walls and the faces' ends).
  const corners = [northWest, { x: southEast.x, z: northWest.z }, southEast, { x: northWest.x, z: southEast.z }];
  const obstaclesAlong = (index: number) => room.planHoles?.length
    ? getBuiltInFaceObstaclesAlong(faces, index, corners[index], corners[(index + 1) % 4]) : undefined;
  const onWalls = sharedOpenings.flatMap(({ opening, center, tangent }) => findMirroredEdges(faces.outline, center, tangent, opening.widthMm / 1000)
    .map((edge) => RECTANGLE_WALLS[edge.index])
    .map((wall) => ({ ...opening, wall, offsetMm: Number(((wall === "north" || wall === "south" ? center.x : center.z) * 1000).toFixed(3)) })));
  const baseboardMm = shared.baseboardOffsetMm ?? 0, nextDoor = faces.neighbourCores.length > 0;
  return createCabinetRoomWallSpaces({
    ...shared,
    widthMm: Math.max(1, Math.round((southEast.x - northWest.x) * 1000)),
    depthMm: Math.max(1, Math.round((southEast.z - northWest.z) * 1000)),
    openings: [...openings, ...onWalls],
  }).flatMap((space) => {
    const index = RECTANGLE_WALLS.indexOf(space.wall ?? "north"), face = faces.exposed[index];
    if (!nextDoor) return [withRectangleFaceSegment(space, northWest, southEast, baseboardMm, obstaclesAlong(index))];
    if (!face) return [];
    const along = index % 2 === 0 ? [face.start.x, face.end.x] : [face.start.z, face.end.z];
    return [withRectangleFaceSegment(space, northWest, southEast, baseboardMm, face.obstacles, [Math.min(...along), Math.max(...along)])];
  });
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
  room: RoomSnapshot, size: { w: number; d: number }, shared: SharedSpaceInput,
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

/**
 * A rectangle's host on its finished face. The segment runs along +x or +z, so its offsets keep the room's direction, measured
 * from the face's middle; its openings (measured from the room's centre) move by that middle.
 */
const RECTANGLE_WALLS: ReadonlyArray<"north" | "east" | "south" | "west"> = ["north", "east", "south", "west"];

function withRectangleFaceSegment(
  space: CabinetHostSpace, northWest: { x: number; z: number }, southEast: { x: number; z: number }, baseboardMm: number,
  faceObstacles?: Array<Array<[number, number]>>, extent?: [number, number]
): CabinetHostSpace {
  const alongX = space.wall === "north" || space.wall === "south";
  const line = space.wall === "north" ? northWest.z : space.wall === "south" ? southEast.z : space.wall === "west" ? northWest.x : southEast.x;
  // Its face between the faces' corners, or `extent` (along x or z) where rooms next door end it elsewhere.
  const [start, end] = extent ?? (alongX ? [northWest.x, southEast.x] : [northWest.z, southEast.z]);
  const middleMm = ((start + end) / 2) * 1000;
  const inward = space.wall === "north" || space.wall === "west" ? 1 : -1;
  // The face's frame runs along its outline edge (west along the south wall, north along the west); the host east or south.
  const flip = space.wall === "south" || space.wall === "west" ? -1 : 1;
  const obstacles = faceObstacles?.map((points) => points.map(([along, into]): [number, number] => [along * flip, into]));
  const baseboards = { startBaseboardClearanceMm: baseboardMm, endBaseboardClearanceMm: baseboardMm, ...(obstacles?.length ? { obstacles } : {}) };
  return {
    ...space,
    ...(extent ? { availableWidthMm: (end - start) * 1000 } : {}),
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
 * The host a wall of `room` is fitted on: its own, or the one whose face runs over it (a straight wall's later piece, listed
 * as its first, or a nib's tip its neighbours' face covers): parallel to it, over its middle, within a wall's thickness of
 * where its face would stand, and as much more as that host's face stands deeper than its own wall's (a thicker wall next
 * door's). None for a wall no host runs over (a spike's sides).
 */
export function findCabinetHostForWall(room: RoomSnapshot, spaces: readonly CabinetHostSpace[], wallId: string): CabinetHostSpace | null {
  const own = spaces.find((space) => space.wallId === wallId);
  if (own || (room.planShape ?? "rectangle") === "rectangle") return own ?? null;
  const outline = getRoomPlanOutlinePoints({ shape: room.planShape ?? "rectangle", polygon: room.planPolygon, w: room.geometry.width, d: room.geometry.depth });
  const index = wallIndex(wallId), start = outline[index], end = outline[(index + 1) % outline.length];
  const length = start && end ? Math.hypot(end.x - start.x, end.z - start.z) : 0;
  if (!start || !end || !(length > 0)) return null;
  const area = outline.reduce((sum, point, at) => sum + point.x * outline[(at + 1) % outline.length].z - outline[(at + 1) % outline.length].x * point.z, 0);
  const [dx, dz] = [(end.x - start.x) / length, (end.z - start.z) / length], inward = area >= 0 ? 1 : -1;
  const thickness = room.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness;
  const face = { x: (start.x + end.x) / 2 - dz * inward * thickness / 2, z: (start.z + end.z) / 2 + dx * inward * thickness / 2 };
  const deeper = getFaceDeepening(room, outline);
  const distance = (space: CabinetHostSpace) => {
    const segment = space.wallSegment;
    if (!segment) return Number.POSITIVE_INFINITY;
    const [ax, az, bx, bz] = [segment.startXmm, segment.startZmm, segment.endXmm, segment.endZmm].map((value) => value / 1000);
    const span = Math.hypot(bx - ax, bz - az), [ux, uz] = [(bx - ax) / (span || 1), (bz - az) / (span || 1)];
    const along = (face.x - ax) * ux + (face.z - az) * uz, across = Math.abs((face.x - ax) * uz - (face.z - az) * ux);
    const within = thickness + deeper(space, { x: ax, z: az }) + 1e-6;
    return Math.abs(ux * dx + uz * dz) > 1 - 1e-6 && along >= 0 && along <= span && across <= within ? across : Number.POSITIVE_INFINITY;
  };
  const nearest = spaces.reduce<CabinetHostSpace | null>((best, space) => (best === null || distance(space) < distance(best) ? space : best), null);
  return nearest && Number.isFinite(distance(nearest)) ? nearest : null;
}

/**
 * How much deeper a host's face (through `start`, a point on it) stands than its own wall's would, half the wall and its panel
 * in from its outline edge: by a thicker wall next door.
 */
function getFaceDeepening(room: RoomSnapshot, outline: readonly Point[]) {
  const thickness = room.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness, depths = getRoomWallFinishDepths(room);
  const faceIds = getRoomWallFaceIds({ shape: room.planShape ?? "rectangle", polygon: room.planPolygon });
  return (space: CabinetHostSpace, start: Point) => {
    const at = wallIndex(space.wallId ?? ""), from = outline[at], to = outline[(at + 1) % outline.length];
    const length = from && to ? Math.hypot(to.x - from.x, to.z - from.z) : 0;
    if (!from || !to || !(length > 0)) return 0;
    const inset = Math.abs((start.x - from.x) * (to.z - from.z) - (start.z - from.z) * (to.x - from.x)) / length;
    return Math.max(0, inset - thickness / 2 - (depths[faceIds[at]] ?? 0));
  };
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
  const pieces = spaces.filter(({ wallSegment: piece }) => piece && isUnderFace(piece, outlineSegment, face, dx, dz));
  const openings = pieces.flatMap((piece) => {
    const segment = piece.wallSegment;
    if (!segment) return [];
    const shiftMm = ((segment.startXmm + segment.endXmm) / 2 - (face.start.x + face.end.x) * 500) * dx +
      ((segment.startZmm + segment.endZmm) / 2 - (face.start.z + face.end.z) * 500) * dz;
    return piece.openings.map((opening) => ({ ...opening, offsetMm: Number((opening.offsetMm + shiftMm).toFixed(3)) }))
      .filter((opening) => Math.abs(opening.offsetMm) < widthMm / 2 + opening.widthMm / 2);
  }).filter((opening, index, all) => all.findIndex((other) => other.id === opening.id // a door over a joint, once
    && Math.abs(other.offsetMm - opening.offsetMm) < 1) === index);
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

/**
 * True when the outline piece runs the same way as the segment and the face stands in front of its line, no further than
 * twice as far as it stands in front of the segment's: a straight wall drawn in pieces, or a jogged wall whose pieces a
 * thicker wall next door gives one face.
 */
function isUnderFace(
  piece: NonNullable<CabinetHostSpace["wallSegment"]>, segment: NonNullable<CabinetHostSpace["wallSegment"]>, face: BuiltInFaceHost, dx: number, dz: number
): boolean {
  const length = Math.hypot(piece.endXmm - piece.startXmm, piece.endZmm - piece.startZmm) || 1;
  const parallel = ((piece.endXmm - piece.startXmm) * dx + (piece.endZmm - piece.startZmm) * dz) / length > 1 - 1e-9;
  const normal = Math.hypot(segment.inwardNormalX, segment.inwardNormalZ) || 1;
  const behind = (line: NonNullable<CabinetHostSpace["wallSegment"]>) =>
    ((face.start.x * 1000 - line.startXmm) * segment.inwardNormalX + (face.start.z * 1000 - line.startZmm) * segment.inwardNormalZ) / normal;
  const own = behind(segment), its = behind(piece);
  return parallel && its > -0.001 && its <= 2 * own + 0.001;
}

/**
 * Where Place as copy puts a copy of a fitted run in `room`: 15 cm along its wall. A run fitted nowhere, or in a room on
 * furniture's rule (which keeps the line's), moves 15 cm along x for a north or south wall, z for an east or west one, or both.
 */
export function getCabinetCopyOffset(host: CabinetHostSpace | undefined, room: RoomSnapshot, planRooms?: BuiltInPlanRooms): [number, number] {
  const segment = host?.wallSegment;
  if (segment && !usesFurnitureRuleForBuiltIns(room, undefined, planRooms)) {
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
  definition: CabinetDefinition, room: RoomSnapshot, placeAsCopy = false, planRooms?: BuiltInPlanRooms
): { position: [number, number, number]; rotationY: number } {
  const fitted = getCabinetFitPlacement(definition, room.geometry.width, room.geometry.depth);
  const rotationY = fitted?.rotationY ?? 0;
  const at: [number, number] = [fitted?.position[0] ?? 0, fitted?.position[2] ?? 0];
  const [offsetX, offsetZ] = placeAsCopy ? getCabinetCopyOffset(definition.fitState?.host, room, planRooms) : [0, 0];
  const [x, z] = clampBuiltInToRoom(room, at[0] + offsetX, at[1] + offsetZ, definition.totalWidth / 1000, definition.depth / 1000,
    rotationY, { from: at, planRooms, bottom: fitted?.position[1] });
  return { position: [x, fitted?.position[1] ?? 0, z], rotationY };
}
