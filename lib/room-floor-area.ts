import type { RoomPlanPolygonPoint, RoomPlanShape, RoomSnapshot } from "./room-types";

/** The plan outline fields that decide a room's floor area, in metres. */
export type RoomFloorOutline = {
  shape?: RoomPlanShape;
  width: number;
  depth: number;
  polygon?: readonly RoomPlanPolygonPoint[] | null;
  holes?: readonly (readonly RoomPlanPolygonPoint[])[] | null;
};

function getLoopAreaSqm(loop: readonly RoomPlanPolygonPoint[]): number {
  let twiceArea = 0;
  for (let index = 0; index < loop.length; index += 1) {
    const current = loop[index];
    const next = loop[(index + 1) % loop.length];
    twiceArea += current.x * next.z - next.x * current.z;
  }
  return Math.abs(twiceArea) / 2;
}

/**
 * Floor (and ceiling) area of one room. Only a custom polygon with at least
 * three points replaces the width × depth footprint; holes with at least three
 * points are subtracted and the result never drops below zero.
 */
export function getRoomFloorAreaSqm(outline: RoomFloorOutline): number {
  const polygon = outline.shape === "custom_polygon" ? outline.polygon : null;
  const outerAreaSqm =
    polygon && polygon.length >= 3
      ? getLoopAreaSqm(polygon)
      : Math.max(0, outline.width * outline.depth);
  const holesAreaSqm = (outline.holes ?? []).reduce(
    (sum, hole) => sum + (hole.length >= 3 ? getLoopAreaSqm(hole) : 0),
    0
  );
  return Math.max(0, outerAreaSqm - holesAreaSqm);
}

export function getRoomSnapshotFloorAreaSqm(room: RoomSnapshot): number {
  return getRoomFloorAreaSqm({
    shape: room.planShape,
    width: room.geometry.width,
    depth: room.geometry.depth,
    polygon: room.planPolygon,
    holes: room.planHoles,
  });
}
