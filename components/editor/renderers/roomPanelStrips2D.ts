import * as THREE from "three";
import { memoizeByObject } from "./memoizeByObject";
import type { RoomPlanPolygonPoint, RoomPlanShape } from "@/lib/room-types";
import { getRoomPlanOutlinePoints, insetPolygonEdges } from "@/lib/room-finished-outline";
import { getRoomWallFaceIds, getRoomWallFinishDepths, type WallFinishRoom } from "@/lib/room-wall-finish-depths";

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

/**
 * Each laminate wall's panel strip: from the bare wall face (half the wall in from the centre line) to the panel's face,
 * mitred where it meets the next wall. One list per room object, so the plan keeps its shapes and lines across re-renders.
 */
export const getRoomPanelStrips2D = memoizeByObject((room: PanelFaceRoom2D): { strips: PanelStrip2D[] } => {
  const depths = getRoomWallFinishDepths(room);
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
});
