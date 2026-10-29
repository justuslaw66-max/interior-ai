import * as THREE from "three";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { RoomRendererOpening } from "@/lib/design-page-plan-overlays";
import type { RoomPlanPolygonPoint } from "@/lib/room-types";
import { getRoomPlanOutlinePoints, insetPolygonEdges } from "@/lib/room-finished-outline";
import {
  getRoomWallFaceIds,
  getRoomWallFinishDepths,
  hasWallFinishDepths,
  type RoomWallFinishDepths,
  type WallFinishRoom,
} from "@/lib/room-wall-finish-depths";
import { getWallSegments, getWallSurfaceFaceId, legacyWallDirection } from "./house-plan-3d/geometry";
import { getWallOpenings } from "./house-plan-3d/legacyWallOpenings";

/** A plan room, as the 2D plan draws it: centre-line outline in room coordinates, placed at x, z. */
export type PanelFaceRoom2D = WallFinishRoom &
  Pick<HousePlanRoom2D, "id" | "name" | "roomType" | "shape" | "polygon" | "x" | "z" | "w" | "d" | "wallThickness">;

/** The plan's rooms where they are saved (not a dragged copy) and its doors and windows, for the strips' doorways. */
export type PanelStripOpenings2D = {
  rooms: readonly PanelFaceRoom2D[];
  openings: readonly RoomRendererOpening[];
};

export type PanelStrip2D = {
  key: string;
  faceId: string;
  shape: THREE.Shape;
  /** The panel's face, the line the room is measured to. */
  faceLine: Array<[number, number, number]>;
};

type Point = RoomPlanPolygonPoint;
type Strips = { strips: PanelStrip2D[] };

const NO_STRIPS: Strips = { strips: [] };
const NO_OPENINGS: PanelStripOpenings2D = { rooms: [], openings: [] };
const DOORWAY_TOLERANCE = 0.002;

// One list per room's depths while its outline and the plan's openings are the same, so the plan keeps its shapes and lines
// across re-renders, and across the copy of the room it draws on every frame of a room drag (only x and z change).
const stripsByDepths = new WeakMap<RoomWallFinishDepths, { room: PanelFaceRoom2D; context: PanelStripOpenings2D; strips: Strips }>();

function isSameRoomOutline(a: PanelFaceRoom2D, b: PanelFaceRoom2D): boolean {
  return a.id === b.id && a.shape === b.shape && a.polygon === b.polygon && a.w === b.w && a.d === b.d &&
    a.wallThickness === b.wallThickness;
}

/**
 * Each laminate wall's panel strip, in room coordinates: from the bare wall face (half the wall in from the centre line) to
 * the panel's face, mitred where it meets the next wall, and stopped at each doorway, where the 3D view's panel stops too.
 * A window keeps the strip: its panel runs on under the sill.
 */
export function getRoomPanelStrips2D(room: PanelFaceRoom2D, openings?: PanelStripOpenings2D): Strips {
  const depths = getRoomWallFinishDepths(room);
  if (!hasWallFinishDepths(depths)) return NO_STRIPS;
  const context = openings?.openings.length ? openings : NO_OPENINGS;
  const known = stripsByDepths.get(depths);
  if (known && isSameRoomOutline(known.room, room) && known.context.rooms === context.rooms &&
    known.context.openings === context.openings) return known.strips;
  const strips = buildRoomPanelStrips2D(room, depths, context);
  stripsByDepths.set(depths, { room, context, strips });
  return strips;
}

function buildRoomPanelStrips2D(room: PanelFaceRoom2D, depths: RoomWallFinishDepths, context: PanelStripOpenings2D): Strips {
  const outline = { shape: room.shape, polygon: room.polygon, w: room.w, d: room.d };
  const faceIds = getRoomWallFaceIds(outline);
  if (!faceIds.some((faceId) => (depths[faceId] ?? 0) > 0)) return { strips: [] };
  const points = getRoomPlanOutlinePoints(outline);
  const halfWall = (room.wallThickness ?? 0.12) / 2;
  const bare = insetPolygonEdges(points, faceIds.map(() => halfWall));
  const panel = insetPolygonEdges(points, faceIds.map((faceId) => halfWall + (depths[faceId] ?? 0)));
  const doorways = getFaceDoorways(room, context, points, faceIds);
  const strips = faceIds.flatMap((faceId, index): PanelStrip2D[] => {
    if ((depths[faceId] ?? 0) <= 0) return [];
    const next = (index + 1) % points.length;
    const edge = { start: points[index], end: points[next] };
    return cutStripAtDoorways(edge, [bare[index], bare[next]], [panel[index], panel[next]], doorways[index])
      .map(({ bareLine, panelLine }, piece) => ({
        key: piece === 0 ? `${room.id}:${faceId}` : `${room.id}:${faceId}:${piece}`,
        faceId,
        // The plan is drawn looking down: a shape's y is the plan's -z, as the room shapes are (lib/room-plan-shape.ts).
        shape: new THREE.Shape([bareLine[0], bareLine[1], panelLine[1], panelLine[0]].map((point) => new THREE.Vector2(point.x, -point.z))),
        faceLine: panelLine.map((point): [number, number, number] => [point.x, 0, point.z]),
      }));
  });
  return { strips };
}

/** How far along an edge, from its start corner on the centre line, a point is. */
function alongEdge(edge: { start: Point; end: Point }, point: Point): number {
  const length = Math.hypot(edge.end.x - edge.start.x, edge.end.z - edge.start.z) || 1;
  return ((point.x - edge.start.x) * (edge.end.x - edge.start.x) + (point.z - edge.start.z) * (edge.end.z - edge.start.z)) / length;
}

/**
 * Each face's doorways, from its start corner along the centre line: the doors (and openings down to the floor) the 3D
 * view leaves in its panels (getWallOpenings: the room's own and a neighbour's on a shared wall), merged where they meet.
 */
function getFaceDoorways(
  room: PanelFaceRoom2D, context: PanelStripOpenings2D, points: readonly Point[], faceIds: readonly string[]
): Array<Array<[number, number]>> {
  if (!context.openings.length) return faceIds.map(() => []);
  // Openings are placed against the saved room, so a dragged copy is measured where the room was.
  const placed = context.rooms.find((candidate) => candidate.id === room.id) ?? room;
  const segments = getWallSegments(placed);
  return faceIds.map((faceId, index) => {
    const segment = segments.find((candidate) => getWallSurfaceFaceId(placed, candidate) === faceId);
    if (!segment) return [];
    const edge = { start: points[index], end: points[(index + 1) % points.length] };
    const [dx, dz] = legacyWallDirection(segment);
    const at = (offset: number) => alongEdge(edge, { x: segment.x + dx * offset, z: segment.z + dz * offset });
    const ranges = getWallOpenings(placed, segment, context.rooms, context.openings)
      .filter((opening) => opening.kind === "door" || (opening.bottom ?? 1) <= DOORWAY_TOLERANCE)
      .map((opening): [number, number] => {
        const [from, to] = [at(opening.offset - opening.width / 2), at(opening.offset + opening.width / 2)].sort((a, b) => a - b);
        return [from, to];
      })
      .sort((a, b) => a[0] - b[0]);
    return ranges.reduce<Array<[number, number]>>((merged, range) => {
      const last = merged[merged.length - 1];
      if (last && range[0] <= last[1] + DOORWAY_TOLERANCE) last[1] = Math.max(last[1], range[1]);
      else merged.push([...range]);
      return merged;
    }, []);
  });
}

/**
 * The strip's pieces between its doorways: each a bare-face line and a panel-face line, cut square across the edge at a
 * doorway. A piece left with no length on either line (a doorway at the corner) is dropped.
 */
function cutStripAtDoorways(
  edge: { start: Point; end: Point }, bare: [Point, Point], panel: [Point, Point], doorways: ReadonlyArray<[number, number]>
): Array<{ bareLine: [Point, Point]; panelLine: [Point, Point] }> {
  const length = Math.hypot(edge.end.x - edge.start.x, edge.end.z - edge.start.z) || 1;
  const direction = { x: (edge.end.x - edge.start.x) / length, z: (edge.end.z - edge.start.z) / length };
  const cut = (line: [Point, Point], distance: number): Point => {
    const shift = distance - alongEdge(edge, line[0]);
    return { x: line[0].x + direction.x * shift, z: line[0].z + direction.z * shift };
  };
  const bounds = [
    { bare: bare[0], panel: panel[0] },
    ...doorways.flatMap(([from, to]) => [{ bare: cut(bare, from), panel: cut(panel, from) }, { bare: cut(bare, to), panel: cut(panel, to) }]),
    { bare: bare[1], panel: panel[1] },
  ];
  const pieces: Array<{ bareLine: [Point, Point]; panelLine: [Point, Point] }> = [];
  for (let index = 0; index < bounds.length; index += 2) {
    const [from, to] = [bounds[index], bounds[index + 1]];
    const bareLength = alongEdge(edge, to.bare) - alongEdge(edge, from.bare);
    const panelLength = alongEdge(edge, to.panel) - alongEdge(edge, from.panel);
    if (bareLength > DOORWAY_TOLERANCE && panelLength > DOORWAY_TOLERANCE) {
      pieces.push({ bareLine: [from.bare, to.bare], panelLine: [from.panel, to.panel] });
    }
  }
  return pieces;
}
