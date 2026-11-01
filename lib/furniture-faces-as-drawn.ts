import type { RoomPlanPolygonPoint } from "@/lib/room-types";
import { buildBuiltInRegion, type BuiltInNeighbourWalls } from "@/lib/room-built-in-region";
import { insetPolygonEdgesWithSteps, isInsetStep } from "@/lib/polygon-edge-inset";
import type { OutlineEdges } from "@/lib/room-outline-edges";
import { sliceImportedArcs, type SlicedOutline } from "@/lib/imported-arc-slices";

/**
 * A room's walls and panels as its 3D view draws them, for furniture to keep 2 cm off (lib/furniture-room-fit.ts). Each is read
 * from the room's outline (its walls' centre line) and edges (lib/room-outline-edges.ts): its walls' thicknesses and each
 * edge's laminate.
 *
 * - A drawn room (components/editor/renderers/house-plan-3d/geometry.ts): each wall's core, its thickness wide and run on half
 *   of it past each end, each panel a box ended where the 3D view joins it to the next wall, and the cores of the rooms next
 *   door: #245's region's solids (lib/room-built-in-region.ts), reused as they are.
 * - An imported plan's room (canonical-floor-plan/): each face at its own depth (a laminate's front, else the bare wall),
 *   meeting the next on the mitre, or in a step within 10° of straight on. Where the plan leaves two walls unjoined (their
 *   mitre past four times the thicker wall, or 250 mm, lib/floor-plan-wall-footprints.ts), each ends square at the corner, so
 *   a thin spike's tip is blunt and a thicker wall's end stands out past the thinner one's face. A painted face is drawn as a
 *   1.5 mm skin, and a laminate's end is cut from the bare walls' crossing to where its front meets that skin, so at an outside
 *   corner between a laminate and paint its tip stands past the painted face. An arc is drawn in slices of π/32
 *   (lib/imported-arc-slices.ts), not the outline's chords.
 */

type Point = RoomPlanPolygonPoint;

/** The skin an imported plan's 3D view draws a painted face as (WALL_FINISH_SKIN_MM, canonical-floor-plan/geometry.ts). */
export const IMPORTED_PAINT_SKIN_METERS = 0.0015;
/** Turns under this (10°) meet in a step, not a mitre (lib/polygon-edge-inset.ts): no tip stands past them. */
const NEAR_STRAIGHT_SIN = Math.sin((10 * Math.PI) / 180);
/** How far a joint's mitre may stand off it for an imported plan's walls to be joined (isSafeWallJoinPoint): metres. */
const joinReach = (thickness: number) => Math.max(0.25, 4 * thickness);

type Line = { x: number; z: number; dx: number; dz: number };

function edgeLine(outline: readonly Point[], index: number, inset: number, side: number): Line | null {
  const a = outline[index], b = outline[(index + 1) % outline.length], length = Math.hypot(b.x - a.x, b.z - a.z);
  if (!(length > 1e-6)) return null;
  const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
  return { x: a.x - dz * side * inset, z: a.z + dx * side * inset, dx, dz };
}

function meet(first: Line, second: Line): Point | null {
  const cross = first.dx * second.dz - first.dz * second.dx;
  if (Math.abs(cross) < 1e-9) return null;
  const t = ((second.x - first.x) * second.dz - (second.z - first.z) * second.dx) / cross;
  return { x: first.x + first.dx * t, z: first.z + first.dz * t };
}

/** A drawn room's walls' cores and panels' boxes, and the cores of the rooms next door, as its 3D view draws them (#245). */
export function getDrawnWallSolids(edges: OutlineEdges, neighbours: BuiltInNeighbourWalls = []): Point[][] {
  const outline = [...edges.outline];
  return buildBuiltInRegion(outline, outline.map((_, index) => `wall-${index}`), edges.panels, edges.wallThickness, [], neighbours).solids;
}

/** An imported room as its 3D view draws it: its faces' outline, laminate tips past paint and walls' unjoined square ends. */
export type ImportedFloor = { outline: Point[]; tips: Point[][]; wallEnds: Point[][] };

export function getImportedFloor(edges: OutlineEdges, side: 1 | -1): ImportedFloor | null {
  const sliced = sliceImportedArcs(edges);
  if (!sliced) return null;
  const corners = insetPolygonEdgesWithSteps(sliced.points, sliced.faces, side);
  const outline = corners.flatMap((corner, index) => {
    const ends = squareEndsAt(sliced, index, side);
    return ends ?? (isInsetStep(corner) ? [...corner] : [corner]);
  });
  return { outline, tips: laminateTips(sliced, side), wallEnds: unjoinedWallEnds(sliced, side) };
}

/** The two edges at corner `corner`: before and after it, and whether it turns away from the room (an outside corner). */
function cornerAt(sliced: SlicedOutline, corner: number, side: 1 | -1) {
  const count = sliced.points.length, before = (corner - 1 + count) % count;
  const [incoming, outgoing] = [edgeLine(sliced.points, before, 0, side), edgeLine(sliced.points, corner, 0, side)];
  const turn = incoming && outgoing ? incoming.dx * outgoing.dz - incoming.dz * outgoing.dx : 0;
  return { before, after: corner, outside: turn * side < 0 && Math.abs(turn) >= NEAR_STRAIGHT_SIN };
}

/** True when the plan leaves the walls either side of `corner` unjoined on side `towards` (+1 the room's, -1 the other). */
function isUnjoined(sliced: SlicedOutline, before: number, after: number, side: 1 | -1, towards: 1 | -1): boolean {
  const [thickBefore, thickAfter] = [sliced.thicknesses[before], sliced.thicknesses[after]];
  const first = edgeLine(sliced.points, before, (towards * thickBefore) / 2, side);
  const second = edgeLine(sliced.points, after, (towards * thickAfter) / 2, side);
  if (!first || !second) return false;
  const joint = sliced.points[after], mitre = meet(first, second);
  return !mitre || Math.hypot(mitre.x - joint.x, mitre.z - joint.z) > joinReach(Math.max(thickBefore, thickAfter));
}

/** At an outside corner the plan leaves unjoined, each face ends square at the corner: its end, the corner, the other's end. */
function squareEndsAt(sliced: SlicedOutline, corner: number, side: 1 | -1): Point[] | null {
  const { before, after, outside } = cornerAt(sliced, corner, side);
  if (!outside || !isUnjoined(sliced, before, after, side, 1)) return null;
  const joint = sliced.points[corner];
  const end = (index: number) => {
    const line = edgeLine(sliced.points, index, sliced.faces[index], side)!;
    return { x: joint.x - line.dz * side * sliced.faces[index], z: joint.z + line.dx * side * sliced.faces[index] };
  };
  return [end(before), joint, end(after)];
}

/**
 * A laminate's tip past a painted face: at each joined outside corner between a laminate and paint, the tip's two edges in
 * front of the painted face (from the faces' corner along the laminate's front to its end, then back along its cut to the
 * bare walls' crossing).
 */
function laminateTips(sliced: SlicedOutline, side: 1 | -1): Point[][] {
  const face = (index: number, extra = 0) => edgeLine(sliced.points, index, sliced.faces[index] + extra, side);
  return sliced.points.flatMap((_, corner) => {
    const { before, after, outside } = cornerAt(sliced, corner, side);
    const [panelBefore, panelAfter] = [sliced.panels[before], sliced.panels[after]];
    if (!outside || panelBefore > 0 === panelAfter > 0 || isUnjoined(sliced, before, after, side, 1)) return [];
    const [laminate, paint] = panelBefore > 0 ? [before, after] : [after, before];
    const [front, painted, skin, bare] = [face(laminate), face(paint), face(paint, IMPORTED_PAINT_SKIN_METERS), face(laminate, -sliced.panels[laminate])];
    const tip = front && painted && meet(front, painted), end = front && skin && meet(front, skin), crossing = bare && painted && meet(bare, painted);
    return tip && end && crossing ? [[tip, end, crossing]] : [];
  });
}

/**
 * Where the plan leaves two walls unjoined on the side away from the room, each wall's footprint from halfway along its edge
 * to the corner, square there: at a thin spike a thicker wall's end stands out past the thinner one's face.
 */
function unjoinedWallEnds(sliced: SlicedOutline, side: 1 | -1): Point[][] {
  return sliced.points.flatMap((_, corner) => {
    const count = sliced.points.length, before = (corner - 1 + count) % count;
    if (!isUnjoined(sliced, before, corner, side, -1)) return [];
    return [wallEnd(sliced.points, before, sliced.thicknesses[before], side, 1), wallEnd(sliced.points, corner, sliced.thicknesses[corner], side, 0)];
  });
}

/** Edge `index`'s wall footprint from its middle to its start (`end` 0) or its end (1), `thickness` wide. */
function wallEnd(outline: readonly Point[], index: number, thickness: number, side: 1 | -1, end: 0 | 1): Point[] {
  const a = outline[index], b = outline[(index + 1) % outline.length], length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length, nx = -dz * side, nz = dx * side;
  const [from, to] = end ? [length / 2, length] : [0, length / 2];
  const at = (along: number, across: number) => ({ x: a.x + dx * along + nx * across, z: a.z + dz * along + nz * across });
  return [at(from, -thickness / 2), at(to, -thickness / 2), at(to, thickness / 2), at(from, thickness / 2)];
}
