import * as THREE from "three";
import type { RoomPlanPolygonPoint, RoomPlanShape } from "@/lib/room-types";
import { getRoomPlanOutlinePoints, insetPolygonEdges } from "@/lib/room-finished-outline";
import {
  getRoomWallFaceIds,
  getRoomWallFinishDepths,
  hasWallFinishDepths,
  type RoomWallFinishDepths,
  type WallFinishRoom,
} from "@/lib/room-wall-finish-depths";

/** A plan room, as the 2D plan draws it: centre-line outline in room coordinates, placed at x, z. */
export type PanelFaceRoom2D = WallFinishRoom & {
  shape: RoomPlanShape;
  polygon?: RoomPlanPolygonPoint[];
  x: number;
  z: number;
  w: number;
  d: number;
  wallThickness?: number;
};

export type PanelStrip2D = {
  key: string;
  faceId: string;
  shape: THREE.Shape;
  /** The panel's face, the line the room is measured to. */
  faceLine: Array<[number, number, number]>;
};

const NO_STRIPS: { strips: PanelStrip2D[] } = { strips: [] };

// One list per room's depths while its outline is the same, so the plan keeps its shapes and lines across re-renders, and
// across the copy of the room it draws on every frame of a room drag (only x and z change).
const stripsByDepths = new WeakMap<RoomWallFinishDepths, { room: PanelFaceRoom2D; strips: { strips: PanelStrip2D[] } }>();

function isSameRoomOutline(a: PanelFaceRoom2D, b: PanelFaceRoom2D): boolean {
  return a.id === b.id && a.shape === b.shape && a.polygon === b.polygon && a.w === b.w && a.d === b.d &&
    a.wallThickness === b.wallThickness;
}

/**
 * Each laminate wall's panel strip, in room coordinates: from the bare wall face (half the wall in from the centre line) to
 * the panel's face, mitred where it meets the next wall.
 */
export function getRoomPanelStrips2D(room: PanelFaceRoom2D): { strips: PanelStrip2D[] } {
  const depths = getRoomWallFinishDepths(room);
  if (!hasWallFinishDepths(depths)) return NO_STRIPS;
  const known = stripsByDepths.get(depths);
  if (known && isSameRoomOutline(known.room, room)) return known.strips;
  const strips = buildRoomPanelStrips2D(room, depths);
  stripsByDepths.set(depths, { room, strips });
  return strips;
}

function buildRoomPanelStrips2D(room: PanelFaceRoom2D, depths: RoomWallFinishDepths): { strips: PanelStrip2D[] } {
  const outline = { shape: room.shape, polygon: room.polygon, w: room.w, d: room.d };
  const faceIds = getRoomWallFaceIds(outline);
  if (!faceIds.some((faceId) => (depths[faceId] ?? 0) > 0)) return { strips: [] };
  const points = getRoomPlanOutlinePoints(outline);
  const halfWall = (room.wallThickness ?? 0.12) / 2;
  const bare = insetPolygonEdges(points, faceIds.map(() => halfWall));
  const panel = insetPolygonEdges(points, faceIds.map((faceId) => halfWall + (depths[faceId] ?? 0)));
  const strips = faceIds.flatMap((faceId, index): PanelStrip2D[] => {
    if ((depths[faceId] ?? 0) <= 0) return [];
    const next = (index + 1) % points.length;
    // The plan is drawn looking down: a shape's y is the plan's -z, as the room shapes are (lib/room-plan-shape.ts).
    const corners = [bare[index], bare[next], panel[next], panel[index]];
    const shape = new THREE.Shape(corners.map((point) => new THREE.Vector2(point.x, -point.z)));
    return [{
      key: `${room.id}:${faceId}`,
      faceId,
      shape,
      faceLine: [panel[index], panel[next]].map((point): [number, number, number] => [point.x, 0, point.z]),
    }];
  });
  return { strips };
}
