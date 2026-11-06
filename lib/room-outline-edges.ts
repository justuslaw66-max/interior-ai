import type { RoomPlanPolygonPoint } from "@/lib/room-types";

/**
 * What the furniture clamp (lib/furniture-room-fit.ts) knows of a room outline beyond its points.
 *
 * - A room's outline and edges (its walls' centre line, getRoomOutlineEdges in lib/room-wall-finish-depths.ts), read from the
 *   room itself and handed to the clamp with the furniture's context (lib/furniture-room-context.ts): whether it is an imported
 *   plan's (whose walls are read from the compiled plan), its walls' thickness and each edge's laminate depth.
 * - The outline inside its finishes (getRoomOutlineInsideFinishes, lib/room-finished-outline.ts), kept by its own array, which
 *   that call makes once per room's depths: the outline it was moved in from and how far each edge was moved. The clamp is
 *   handed only that outline (clampToRoom), and checks it is the room's.
 */

type Point = RoomPlanPolygonPoint;

export type OutlineEdges = {
  /** The room's outline (its walls' centre line) these are the edges of. */
  outline: readonly Point[];
  /** The room's one wall thickness, metres, as a drawn room's 3D view draws its walls. */
  wallThickness: number;
  /** True for an imported plan's room, whose 3D view draws the compiled plan's walls (lib/furniture-canonical-walls.ts). */
  imported: boolean;
  /** Each edge's laminate depth, metres (0 for paint). */
  panels: readonly number[];
  /** What the panels were read from, so the edges are made again only when they change. */
  source: object;
};

export type MovedOutline = { from: readonly Point[]; by: readonly number[] };

const movedOutlines = new WeakMap<readonly Point[], MovedOutline>();

/** Notes that `moved` is `from` with edge i moved in by `by[i]`. */
export function noteMovedOutline(moved: readonly Point[], from: readonly Point[], by: readonly number[]): void {
  movedOutlines.set(moved, { from, by });
}

/** The outline `polygon` was moved in from, or itself, moved by nothing. */
export function readMovedOutline(polygon: readonly Point[]): MovedOutline {
  return movedOutlines.get(polygon) ?? { from: polygon, by: polygon.map(() => 0) };
}

/** True when `polygon` is the room's outline `edges` are of, or that outline moved in (by array, else point for point). */
export function isOutlineOf(polygon: readonly Point[], edges: OutlineEdges): boolean {
  const { from } = readMovedOutline(polygon), outline = edges.outline;
  return from === outline || (from.length === outline.length && from.every((point, index) =>
    point.x === outline[index].x && point.z === outline[index].z));
}
