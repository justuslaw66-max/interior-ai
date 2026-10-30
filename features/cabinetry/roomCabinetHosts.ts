import { PLAN_OPENING_DEFAULT_HEIGHT_METERS } from "@/lib/design-page-plan-overlays";
import { ROOM_DIMENSION_DEFAULTS } from "@/lib/design-page-house-plan";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  builtInFootprintFits,
  getCanonicalPlanModel,
  getRoomBuiltInFaces,
  isBuiltInFaceInRoom,
  type BuiltInRoomFaces,
} from "@/lib/room-built-in-faces";
import { clampToRoomInsideFinishes, getBuiltInWallInset } from "@/lib/room-finished-outline";
import { getRoomWallFinishDepths } from "@/lib/room-wall-finish-depths";
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
 * wall half its own thickness in from the outline, or the face of its laminate panel (lib/room-built-in-faces.ts). It runs
 * between the finished faces of the walls either side, and a fitted run stops the default 10 mm installation allowance short
 * of each, more by a recorded baseboard. Its back stands against the face, or the baseboard: the host's segment is the face,
 * which getCabinetFitPlacement puts the back on.
 */

/** Fit to Space's allowance at each end of a run, from the finished face of the wall there (or its baseboard). */
export const CABINET_RUN_END_ALLOWANCE_MM = 10;

type Point = RoomPlanPolygonPoint;

export type CabinetryAvailableSpacesInput = {
  activeRoom: RoomSnapshot | null;
  activePlanRoom: { w: number; d: number } | null;
  planRoomCount: number;
  planOpenings: RoomOpening2D[];
  /** The design's imported plan, whose walls give an imported room's faces. */
  canonicalDocument?: FloorPlanDocumentV2 | null;
};

export function buildCabinetryAvailableSpaces({
  activeRoom,
  activePlanRoom,
  planRoomCount,
  planOpenings,
  canonicalDocument,
}: CabinetryAvailableSpacesInput): CabinetHostSpace[] {
  if (!activeRoom) return [];
  const baseboardOffsetMm = Math.max(0, Math.round((activeRoom.geometry.baseboardDepth ?? 0) * 1000));
  const sharedSpaceInput = {
    roomId: activeRoom.id,
    roomName: activeRoom.name,
    roomType: activeRoom.roomType === "balcony" ? "custom" : activeRoom.roomType,
    heightMm: Math.round((activeRoom.geometry.height ?? ROOM_DIMENSION_DEFAULTS.roomHeight) * 1000),
    baseboardOffsetMm,
    // The back stands off the face by the baseboard; the ends keep the allowance from the end walls' baseboards too.
    installationClearanceSideMm: CABINET_RUN_END_ALLOWANCE_MM + baseboardOffsetMm,
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

  if ((activeRoom.planShape ?? "rectangle") === "rectangle") {
    const faces = getRectangleFinishedFaces(activeRoom, activePlanRoom?.w ?? activeRoom.geometry.width, activePlanRoom?.d ?? activeRoom.geometry.depth);
    return createCabinetRoomWallSpaces({
      ...sharedSpaceInput,
      widthMm: Math.max(1, Math.round((faces.east - faces.west) * 1000)),
      depthMm: Math.max(1, Math.round((faces.south - faces.north) * 1000)),
      openings,
    }).map((space) => withRectangleFaceSegment(space, faces));
  }

  // The L-shape's or drawn shape's outline (the wall centre line), each edge moved in to its finished face.
  const faces = getRoomBuiltInFaces(activeRoom, getCanonicalPlanModel(canonicalDocument));
  // Openings are drawn on the centre line, so they are found on it, then measured along the face.
  const centreLineOpenings = mapCabinetCardinalOpeningsToPolygonWalls({ polygon: faces.outline, openings });
  return createCabinetPolygonWallSpaces({
    ...sharedSpaceInput,
    polygon: faces.faces,
    openings: centreLineOpenings.map((opening) => measureAlongFace(opening, faces)),
  }).filter((space) => isBuiltInFaceInRoom(faces, wallIndex(space.wallId ?? "")));
}

type RectangleFaces = { west: number; east: number; north: number; south: number };

/** Where a rectangle's four finished faces stand, in metres from its centre (north is -z). */
function getRectangleFinishedFaces(room: RoomSnapshot, width: number, depth: number): RectangleFaces {
  const halfWall = getBuiltInWallInset(room.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness);
  const depths = getRoomWallFinishDepths(room);
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
function measureAlongFace(opening: CabinetPolygonWallOpeningInput, faces: BuiltInRoomFaces): CabinetPolygonWallOpeningInput {
  const index = wallIndex(opening.wallId);
  const centre = edgeOf(faces.outline, index), face = edgeOf(faces.faces, index);
  const shiftMm = ((centre.mid.x - face.mid.x) * centre.dx + (centre.mid.z - face.mid.z) * centre.dz) * 1000;
  return { ...opening, offsetMm: Number((opening.offsetMm + shiftMm).toFixed(3)) };
}

export type BuiltInClampOptions = {
  /** Where the built-in stands now: a move that would leave the faces goes from here as far as it can. */
  from?: readonly [number, number];
  /** The design's imported plan, whose walls give an imported room's faces. */
  canonicalDocument?: FloorPlanDocumentV2 | null;
};

/**
 * A built-in cabinet kept inside its room's finished faces (lib/room-built-in-faces.ts), with its back allowed against a face
 * and no 2 cm gap. Where its real (turned) footprint already fits, it stays put, as Fit to Space places it. A move that would
 * leave the faces stops where it still fits, going from `from`. Otherwise it is clamped as furniture is, with half the wall.
 */
export function clampBuiltInToRoom(
  room: RoomSnapshot,
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  rotationY = 0,
  options: BuiltInClampOptions = {}
): [number, number] {
  const faces = getRoomBuiltInFaces(room, getCanonicalPlanModel(options.canonicalDocument));
  const fits = (atX: number, atZ: number) => builtInFootprintFits(faces, atX, atZ, itemWidth, itemDepth, rotationY);
  if (fits(x, z)) return [x, z];
  const from = options.from;
  if (from && fits(from[0], from[1])) {
    let reach = 0, beyond = 1;
    for (let step = 0; step < 24; step += 1) {
      const middle = (reach + beyond) / 2;
      if (fits(from[0] + (x - from[0]) * middle, from[1] + (z - from[1]) * middle)) reach = middle;
      else beyond = middle;
    }
    return [from[0] + (x - from[0]) * reach, from[1] + (z - from[1]) * reach];
  }
  return clampToRoomInsideFinishes(
    x, z, itemWidth, itemDepth, room.geometry.width, room.geometry.depth,
    getBuiltInWallInset(room.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness),
    rotationY, room.planShape ?? "rectangle", room.planPolygon, room.planHoles, getRoomWallFinishDepths(room)
  );
}
