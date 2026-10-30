import { PLAN_OPENING_DEFAULT_HEIGHT_METERS } from "@/lib/design-page-plan-overlays";
import { ROOM_DIMENSION_DEFAULTS } from "@/lib/design-page-house-plan";
import type { RoomOpening2D } from "@/lib/editorScene";
import {
  clampToRoomInsideFinishes,
  getBuiltInWallInset,
  getRoomPlanOutlinePoints,
  insetPolygonEdges,
} from "@/lib/room-finished-outline";
import { getRoomWallFaceIds, getRoomWallFinishDepths, type RoomWallFinishDepths } from "@/lib/room-wall-finish-depths";
import type { RoomPlanPolygonPoint, RoomSnapshot } from "@/lib/room-types";

import {
  createCabinetPolygonWallSpaces,
  createCabinetRoomWallSpaces,
  mapCabinetCardinalOpeningsToPolygonWalls,
  type CabinetPolygonWallOpeningInput,
} from "./fitToSpace";
import type { CabinetHostSpace } from "./types";

/**
 * A room's walls as Fit to Space hosts (J, 29 Oct 2026: "Face, back flush"). Each host is its wall's finished face: the bare
 * wall half its thickness in from the outline, or the face of its laminate panel (lib/room-wall-finish-depths.ts). It runs
 * between the finished faces of the walls either side, and a fitted run stops the default 10 mm installation allowance short
 * of each. Its back stands against the face: the host's segment is the face, which getCabinetFitPlacement puts the back on.
 */

/** Fit to Space's allowance at each end of a run, from the finished face of the wall there. */
export const CABINET_RUN_END_ALLOWANCE_MM = 10;

type Point = RoomPlanPolygonPoint;

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
  const halfWall = getBuiltInWallInset(activeRoom.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness);
  const depths = getRoomWallFinishDepths(activeRoom);
  const sharedSpaceInput = {
    roomId: activeRoom.id,
    roomName: activeRoom.name,
    roomType: activeRoom.roomType === "balcony" ? "custom" : activeRoom.roomType,
    heightMm: Math.round((activeRoom.geometry.height ?? ROOM_DIMENSION_DEFAULTS.roomHeight) * 1000),
    baseboardOffsetMm: Math.max(0, Math.round((activeRoom.geometry.baseboardDepth ?? 0) * 1000)),
    installationClearanceSideMm: CABINET_RUN_END_ALLOWANCE_MM,
  };
  const includeRoomlessOpenings = planRoomCount <= 1;
  const openings = planOpenings
    .filter((opening) => opening.roomId === activeRoom.id || (includeRoomlessOpenings && !opening.roomId))
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

  const planShape = activeRoom.planShape ?? "rectangle";
  if (planShape === "rectangle") {
    const faces = getRectangleFinishedFaces(activePlanRoom?.w ?? activeRoom.geometry.width, activePlanRoom?.d ?? activeRoom.geometry.depth, halfWall, depths);
    return createCabinetRoomWallSpaces({
      ...sharedSpaceInput,
      widthMm: Math.max(1, Math.round((faces.east - faces.west) * 1000)),
      depthMm: Math.max(1, Math.round((faces.south - faces.north) * 1000)),
      openings,
    }).map((space) => withRectangleFaceSegment(space, faces));
  }

  // The L-shape's or drawn shape's outline (the wall centre line), each edge moved in by half its wall and its panel.
  const outline = getRoomPlanOutlinePoints({
    shape: planShape, polygon: activeRoom.planPolygon, w: activeRoom.geometry.width, d: activeRoom.geometry.depth,
  });
  const faceIds = getRoomWallFaceIds({ shape: planShape, polygon: activeRoom.planPolygon });
  const faces = insetPolygonEdges(outline, faceIds.map((faceId) => halfWall + (depths[faceId] ?? 0)));
  // Openings are drawn on the centre line, so they are found on it, then measured along the face.
  const centreLineOpenings = mapCabinetCardinalOpeningsToPolygonWalls({ polygon: outline, openings });
  return createCabinetPolygonWallSpaces({
    ...sharedSpaceInput,
    polygon: faces,
    openings: centreLineOpenings.map((opening) => measureAlongFace(opening, outline, faces)),
  }).filter((space) => !isTurnedOver(space, outline));
}

type RectangleFaces = { west: number; east: number; north: number; south: number };

/** Where a rectangle's four finished faces stand, in metres from its centre (north is -z). */
function getRectangleFinishedFaces(width: number, depth: number, halfWall: number, depths: RoomWallFinishDepths): RectangleFaces {
  return {
    west: -width / 2 + halfWall + (depths.west ?? 0),
    east: width / 2 - halfWall - (depths.east ?? 0),
    north: -depth / 2 + halfWall + (depths.north ?? 0),
    south: depth / 2 - halfWall - (depths.south ?? 0),
  };
}

/**
 * A rectangle's host on its finished face. The segment runs along +x or +z, so its offsets keep the room's direction, measured
 * from the face's middle; its openings (measured from the room's centre) move by that middle.
 */
function withRectangleFaceSegment(space: CabinetHostSpace, faces: RectangleFaces): CabinetHostSpace {
  const alongX = space.wall === "north" || space.wall === "south";
  const line = space.wall === "north" ? faces.north : space.wall === "south" ? faces.south : space.wall === "west" ? faces.west : faces.east;
  const [start, end] = alongX ? [faces.west, faces.east] : [faces.north, faces.south];
  const middleMm = ((start + end) / 2) * 1000;
  const inward = space.wall === "north" || space.wall === "west" ? 1 : -1;
  return {
    ...space,
    wallSegment: alongX
      ? { startXmm: start * 1000, startZmm: line * 1000, endXmm: end * 1000, endZmm: line * 1000, inwardNormalX: 0, inwardNormalZ: inward }
      : { startXmm: line * 1000, startZmm: start * 1000, endXmm: line * 1000, endZmm: end * 1000, inwardNormalX: inward, inwardNormalZ: 0 },
    openings: space.openings.map((opening) => ({ ...opening, offsetMm: Number((opening.offsetMm - middleMm).toFixed(3)) })),
  };
}

function wallIndex(wallId: string): number {
  return Number(wallId.replace("wall-", ""));
}

function edgeOf(points: readonly Point[], index: number) {
  const start = points[index], end = points[(index + 1) % points.length];
  const length = Math.hypot(end.x - start.x, end.z - start.z) || 1;
  return { mid: { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 }, dx: (end.x - start.x) / length, dz: (end.z - start.z) / length };
}

/** An opening measured from its centre-line edge's middle, re-measured from the middle of that edge's face. */
function measureAlongFace(opening: CabinetPolygonWallOpeningInput, outline: readonly Point[], faces: readonly Point[]): CabinetPolygonWallOpeningInput {
  const index = wallIndex(opening.wallId);
  const centre = edgeOf(outline, index), face = edgeOf(faces, index);
  const shiftMm = ((centre.mid.x - face.mid.x) * centre.dx + (centre.mid.z - face.mid.z) * centre.dz) * 1000;
  return { ...opening, offsetMm: Number((opening.offsetMm + shiftMm).toFixed(3)) };
}

/** A wall shorter than the walls either side are thick has no face of its own: its moved edge runs backwards. */
function isTurnedOver(space: CabinetHostSpace, outline: readonly Point[]): boolean {
  const segment = space.wallSegment;
  if (!segment || !space.wallId) return false;
  const centre = edgeOf(outline, wallIndex(space.wallId));
  return (segment.endXmm - segment.startXmm) * centre.dx + (segment.endZmm - segment.startZmm) * centre.dz <= 0;
}

/**
 * A built-in cabinet clamped into its room: as furniture is (clampToRoomInsideFinishes, inside each wall's panel), but with
 * its back allowed against the finished face, with no 2 cm gap (getBuiltInWallInset).
 */
export function clampBuiltInToRoom(
  room: RoomSnapshot,
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  rotationY = 0
): [number, number] {
  return clampToRoomInsideFinishes(
    x, z, itemWidth, itemDepth, room.geometry.width, room.geometry.depth,
    getBuiltInWallInset(room.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness),
    rotationY, room.planShape ?? "rectangle", room.planPolygon, room.planHoles, getRoomWallFinishDepths(room)
  );
}
