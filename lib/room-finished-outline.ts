import { clampToRoom } from "@/lib/design-page-geometry";
import { L_SHAPE_NOTCH_RATIO } from "@/lib/room-floor-area";
import type { RoomPlanPolygonPoint, RoomPlanShape } from "@/lib/room-types";
import {
  getRectangleWallClearances,
  getRoomWallFaceIds,
  getRoomWallFinishDepths,
  hasWallFinishDepths,
  NO_WALL_FINISH_DEPTHS,
  type RoomWallFinishDepths,
  type WallFinishRoom,
} from "@/lib/room-wall-finish-depths";

/**
 * A drawn room's plan outline inside its laminate panels (J, 29 Oct 2026: the room measured to the panel face). Placement
 * keeps its own inset from the bare wall (half the wall plus 2 cm, getFurnitureWallInset); each wall's panel depth
 * (lib/room-wall-finish-depths.ts) moves that wall's edge of the outline in, so the same clamps and containment checks stop
 * furniture at the panel. A room with no panels keeps its outline exactly.
 */

/** The outline fields placement reads, in a room snapshot's or a plan room's terms. */
export type RoomPlanOutline = {
  shape: RoomPlanShape;
  polygon?: RoomPlanPolygonPoint[];
  holes?: RoomPlanPolygonPoint[][];
  w: number;
  d: number;
};

/** The outline's corners, in face order (getRoomWallFaceIds): the wall centre line, as drawn. */
export function getRoomPlanOutlinePoints({ shape, polygon, w, d }: RoomPlanOutline): RoomPlanPolygonPoint[] {
  if (shape === "custom_polygon" && polygon && polygon.length >= 3) return polygon.map(({ x, z }) => ({ x, z }));
  const left = -w / 2, right = w / 2, top = -d / 2, bottom = d / 2;
  if (shape === "l_shape") {
    const notchW = w * L_SHAPE_NOTCH_RATIO;
    const notchD = d * L_SHAPE_NOTCH_RATIO;
    return [
      { x: left, z: top }, { x: right, z: top }, { x: right, z: bottom - notchD },
      { x: right - notchW, z: bottom - notchD }, { x: right - notchW, z: bottom }, { x: left, z: bottom },
    ];
  }
  return [{ x: left, z: top }, { x: right, z: top }, { x: right, z: bottom }, { x: left, z: bottom }];
}

function signedArea(points: readonly RoomPlanPolygonPoint[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.z - next.x * point.z;
  }, 0) / 2;
}

type OffsetLine = { x: number; z: number; dx: number; dz: number; nx: number; nz: number };

/** Edge `index` moved `inset` towards the inside: a point on it, its direction and its inward normal. */
function offsetEdge(points: readonly RoomPlanPolygonPoint[], index: number, inset: number, inwardSign: number): OffsetLine {
  const start = points[index];
  const end = points[(index + 1) % points.length];
  const length = Math.hypot(end.x - start.x, end.z - start.z) || 1;
  const dx = (end.x - start.x) / length;
  const dz = (end.z - start.z) / length;
  const nx = -dz * inwardSign;
  const nz = dx * inwardSign;
  return { x: start.x + nx * inset, z: start.z + nz * inset, dx, dz, nx, nz };
}

/**
 * The polygon with each edge moved in by its own distance (`insets[i]` for the edge from point i to point i + 1). Each corner
 * is where its two moved edges meet; where they run straight on, the corner moves in by the deeper of the two.
 */
export function insetPolygonEdges(points: readonly RoomPlanPolygonPoint[], insets: readonly number[]): RoomPlanPolygonPoint[] {
  const inwardSign = signedArea(points) >= 0 ? 1 : -1;
  const lines = points.map((_, index) => offsetEdge(points, index, Math.max(0, insets[index] ?? 0), inwardSign));
  return points.map((point, index) => {
    const before = lines[(index - 1 + points.length) % points.length];
    const after = lines[index];
    const cross = before.dx * after.dz - before.dz * after.dx;
    if (Math.abs(cross) < 1e-9) {
      const inset = Math.max(insets[(index - 1 + points.length) % points.length] ?? 0, insets[index] ?? 0, 0);
      return { x: point.x + after.nx * inset, z: point.z + after.nz * inset };
    }
    const t = ((after.x - before.x) * after.dz - (after.z - before.z) * after.dx) / cross;
    return { x: before.x + before.dx * t, z: before.z + before.dz * t };
  });
}

// One inset outline per room's depths while its outline is the same: an item's clamp runs on every drag frame, and the 3D view
// hands each item the polygon, whose identity its re-clamp effect depends on.
const insideOutlineByDepths = new WeakMap<RoomWallFinishDepths, { outline: RoomPlanOutline; inside: RoomPlanOutline }>();

function isSameOutline(a: RoomPlanOutline, b: RoomPlanOutline): boolean {
  return a.shape === b.shape && a.polygon === b.polygon && a.holes === b.holes && a.w === b.w && a.d === b.d;
}

/**
 * The outline inside the panels: the same outline when no wall has one, otherwise a drawn shape whose edges stand in by their
 * walls' panel depths. Its holes and its bounding size are unchanged.
 */
export function getRoomOutlineInsideFinishes(outline: RoomPlanOutline, depths: RoomWallFinishDepths): RoomPlanOutline {
  if (!hasWallFinishDepths(depths)) return outline;
  const known = insideOutlineByDepths.get(depths);
  if (known && isSameOutline(known.outline, outline)) return known.inside;
  const faceIds = getRoomWallFaceIds({ shape: outline.shape, polygon: outline.polygon });
  const points = getRoomPlanOutlinePoints(outline);
  const inside: RoomPlanOutline = {
    ...outline,
    shape: "custom_polygon",
    polygon: insetPolygonEdges(points, faceIds.map((faceId) => depths[faceId] ?? 0)),
  };
  insideOutlineByDepths.set(depths, { outline, inside });
  return inside;
}

/**
 * The panels on the room's bounding rectangle, as `north`, `east`, `south` and `west`: for a rectangle its walls' own, and
 * for an L-shape or a drawn shape the deepest panel among the walls along each side. The checks that measure a room by its
 * bounding rectangle (lib/constraints/evaluate.ts, the walkway map, placement scoring, plan review) stop at these, so every
 * shape's checks measure from the panel on its outer walls (J, 29 Oct 2026: "Fix it, all from the face").
 */
export function getRoomSideFinishDepths(room: WallFinishRoom | null | undefined, size: { w: number; d: number }): RoomWallFinishDepths {
  const depths = getRoomWallFinishDepths(room);
  if (!room || !hasWallFinishDepths(depths)) return depths;
  const faceIds = getRoomWallFaceIds(room);
  if (faceIds[0] === "north") return depths; // A rectangle's walls are its sides.
  const shape = room.planShape ?? room.shape ?? "rectangle";
  const points = getRoomPlanOutlinePoints({ shape, polygon: [...(room.planPolygon ?? room.polygon ?? [])], w: size.w, d: size.d });
  const xs = points.map(({ x }) => x), zs = points.map(({ z }) => z);
  const bounds = { west: Math.min(...xs), east: Math.max(...xs), north: Math.min(...zs), south: Math.max(...zs) };
  const sides: Record<string, number> = {};
  faceIds.forEach((faceId, index) => {
    const start = points[index], end = points[(index + 1) % points.length];
    const along = (value: number, axis: "x" | "z") => Math.abs(start[axis] - value) < 1e-6 && Math.abs(end[axis] - value) < 1e-6;
    const side = along(bounds.west, "x") ? "west" : along(bounds.east, "x") ? "east"
      : along(bounds.north, "z") ? "north" : along(bounds.south, "z") ? "south" : null;
    if (side && (depths[faceId] ?? 0) > (sides[side] ?? 0)) sides[side] = depths[faceId];
  });
  return sides;
}

/**
 * `clampToRoom` (lib/design-page-geometry.ts) inside the room's panels: the same arguments, then the room's panel depths.
 * `wallInset` is still placement's inset from the bare wall.
 */
export function clampToRoomInsideFinishes(
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  roomW: number,
  roomD: number,
  wallInset: number,
  rotationY: number,
  planShape: RoomPlanShape | undefined,
  planPolygon: RoomPlanPolygonPoint[] | undefined,
  planHoles: RoomPlanPolygonPoint[][] | undefined,
  depths: RoomWallFinishDepths
): [number, number] {
  const outline = getRoomOutlineInsideFinishes(
    { shape: planShape ?? "rectangle", polygon: planPolygon, holes: planHoles, w: roomW, d: roomD },
    depths
  );
  return clampToRoom(x, z, itemWidth, itemDepth, roomW, roomD, wallInset, rotationY, outline.shape, outline.polygon, outline.holes);
}

/** The room fields an item in the 3D view is placed with (components/scene/FurnitureItem.tsx). */
export type FurnitureRoomFrame = {
  roomWidth: number;
  roomDepth: number;
  roomOriginX: number;
  roomOriginZ: number;
  roomPlanShape: RoomPlanShape;
  roomPlanPolygon?: RoomPlanPolygonPoint[];
  roomPlanHoles?: RoomPlanPolygonPoint[][];
};

/**
 * The frame an item in the 3D view is placed in, inside the room's panels. A rectangle shrinks and shifts by its walls'
 * depths, so the item's wall snap (rectangular bounds) stops at each panel as well as its clamp; another shape takes the
 * inset outline, as its clamp already did with the bare one.
 */
export function getFurnitureRoomFrameInsideFinishes(
  room: {
    roomWidth: number;
    roomDepth: number;
    roomPlanShape: RoomPlanShape;
    roomPlanPolygon?: RoomPlanPolygonPoint[];
    roomPlanHoles?: RoomPlanPolygonPoint[][];
    roomWallFinishDepths?: RoomWallFinishDepths;
  },
  origin: { x: number; z: number }
): FurnitureRoomFrame {
  const { roomWidth, roomDepth, roomPlanShape, roomPlanPolygon, roomPlanHoles } = room;
  const depths = room.roomWallFinishDepths ?? NO_WALL_FINISH_DEPTHS;
  const frame = { roomWidth, roomDepth, roomOriginX: origin.x, roomOriginZ: origin.z, roomPlanShape, roomPlanPolygon, roomPlanHoles };
  if (!hasWallFinishDepths(depths)) return frame;
  if (roomPlanShape === "rectangle") {
    const west = depths.west ?? 0, east = depths.east ?? 0, north = depths.north ?? 0, south = depths.south ?? 0;
    return {
      ...frame,
      roomWidth: Math.max(0, roomWidth - west - east),
      roomDepth: Math.max(0, roomDepth - north - south),
      roomOriginX: origin.x + (west - east) / 2,
      roomOriginZ: origin.z + (north - south) / 2,
    };
  }
  const outline = getRoomOutlineInsideFinishes(
    { shape: roomPlanShape, polygon: roomPlanPolygon, holes: roomPlanHoles, w: roomWidth, d: roomDepth },
    depths
  );
  return { ...frame, roomPlanShape: outline.shape, roomPlanPolygon: outline.polygon };
}

/**
 * The room's clear size inside its walls and their laminate panels, as metrics for the room inspector, for example
 * "Clear inside 3.86 m × 2.86 m"; none when no wall has a panel (J, 29 Oct 2026: "Add a clear size"). It is the bounding size
 * of the outline with each edge moved in by half its wall and its panel; the room keeps its drawn size and floor area.
 */
export function getRoomClearInsideMetrics(
  room: WallFinishRoom & { shape: RoomPlanShape; w: number; d: number; wallThickness?: number },
  formatLengthMm: (valueMm: number) => string
): string[] {
  const depths = getRoomWallFinishDepths(room);
  if (!hasWallFinishDepths(depths)) return [];
  const halfWall = (room.wallThickness ?? 0.12) / 2;
  const outline = { shape: room.shape, polygon: room.polygon ? [...room.polygon] : undefined, w: room.w, d: room.d };
  const faceIds = getRoomWallFaceIds(outline);
  const inside = insetPolygonEdges(getRoomPlanOutlinePoints(outline), faceIds.map((faceId) => halfWall + (depths[faceId] ?? 0)));
  const xs = inside.map((point) => point.x);
  const zs = inside.map((point) => point.z);
  const widthMm = Math.max(0, Math.max(...xs) - Math.min(...xs)) * 1000;
  const depthMm = Math.max(0, Math.max(...zs) - Math.min(...zs)) * 1000;
  return [`Clear inside ${formatLengthMm(widthMm)} × ${formatLengthMm(depthMm)}`];
}

/** `getRectangleWallClearances` for a room snapshot: its drawn size, its wall (12 cm when not set) and its sides' panels. */
export function getRoomWallClearances(
  room: WallFinishRoom & { geometry: { width: number; depth: number; wallThickness?: number } },
  center: { x: number; z: number },
  footprint: { w: number; d: number }
): { x: number; z: number } {
  const { width, depth, wallThickness = 0.12 } = room.geometry;
  const depths = getRoomSideFinishDepths(room, { w: width, d: depth });
  return getRectangleWallClearances({ width, depth, wallThickness, depths, center, footprint });
}
