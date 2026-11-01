import type { RoomPlanPolygonPoint } from "@/lib/room-types";

/**
 * What the furniture clamp (lib/furniture-room-fit.ts) knows of a room outline beyond its points, kept by the outline's own
 * array: the clamp is handed only the outline (clampToRoom), and a room's outline is the same array while the room is (the
 * 3D view, the plan and placement all hand it on as it is). An outline nothing was noted for keeps the outline's own faces.
 *
 * - A room's outline (its walls' centre line, lib/room-wall-finish-depths.ts): whether it is an imported plan's, the plan wall
 *   each edge lies on (an arc's slices share one), and each edge's laminate depth.
 * - The outline inside its finishes (getRoomOutlineInsideFinishes, lib/room-finished-outline.ts): the outline it was moved in
 *   from and how far each edge was moved.
 */

type Point = RoomPlanPolygonPoint;

export type OutlineEdges = {
  /** True for an imported plan's room, whose 3D view draws a painted face as a 1.5 mm skin (CanonicalWallSurfaceMesh). */
  imported: boolean;
  /** An imported room's plan wall for each edge, when they are named. */
  wallIds?: readonly string[];
  /** Each edge's laminate depth, metres (0 for paint). */
  panels: readonly number[];
  /** An imported room's: each edge's own wall thickness, metres, when saved with its walls (and the saved millimetres). */
  thicknesses?: readonly number[];
  thicknessesMm?: readonly number[];
  /** What the panels were read from, so a note is made again only when they change. */
  source: object;
};

export type MovedOutline = { from: readonly Point[]; by: readonly number[] };

const edgesByOutline = new WeakMap<readonly Point[], OutlineEdges>();
const movedOutlines = new WeakMap<readonly Point[], MovedOutline>();

export function noteOutlineEdges(outline: readonly Point[], edges: OutlineEdges): void {
  edgesByOutline.set(outline, edges);
}

export function readOutlineEdges(outline: readonly Point[]): OutlineEdges | undefined {
  return edgesByOutline.get(outline);
}

/** Notes that `moved` is `from` with edge i moved in by `by[i]`. */
export function noteMovedOutline(moved: readonly Point[], from: readonly Point[], by: readonly number[]): void {
  movedOutlines.set(moved, { from, by });
}

/** The outline `polygon` was moved in from, or itself, moved by nothing. */
export function readMovedOutline(polygon: readonly Point[]): MovedOutline {
  return movedOutlines.get(polygon) ?? { from: polygon, by: polygon.map(() => 0) };
}
