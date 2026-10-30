import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import { resolveDesignPageOpeningHosts } from "@/lib/design-page-opening-host";
import type { RoomOpening2D } from "@/lib/editorScene";
import { getOutlineInwardSign, getRoomPlanOutlinePoints } from "@/lib/room-finished-outline";
import type { RoomPlanPolygonPoint, RoomSnapshot } from "@/lib/room-types";
import { getRoomWallFaceIds } from "@/lib/room-wall-finish-depths";

/**
 * Where an L-shaped, drawn or imported room's doors are, in its own plan, for the walkway map's start and placement scoring's
 * door distance. A rectangle keeps finding them on its four sides by their wall and offset, as before. Another shape's
 * wall names repeat (an L's notch walls are named "east" and "south" too), so each door is found on the wall the plan and
 * the 3D view put it on (resolveDesignPageOpeningHosts). One no wall takes (the plan marks it as not attached) is put on
 * the room's wall nearest to where it asked to be (by the bounding rectangle, where every door used to be put).
 */

/** A door's middle on its wall's centre line, and the way into the room from there. */
export type RoomDoorPoint = { center: RoomPlanPolygonPoint; inward: RoomPlanPolygonPoint };

function toPlanRoom(room: RoomSnapshot): HousePlanRoom2D {
  return {
    id: room.id, name: room.name, roomType: room.roomType, floorLevel: room.floorLevel ?? 1,
    shape: room.planShape ?? "rectangle", polygon: room.planPolygon, holes: room.planHoles,
    wallThickness: room.geometry.wallThickness, x: room.planPosition?.x ?? 0, z: room.planPosition?.z ?? 0,
    w: room.geometry.width, d: room.geometry.depth,
  };
}

/** The point on the room's walls nearest `point` (its outline's or a courtyard's), and that wall's way into the room. */
function nearestOnOutline(room: HousePlanRoom2D, point: RoomPlanPolygonPoint): RoomDoorPoint {
  const outline = getRoomPlanOutlinePoints({ shape: room.shape, polygon: room.polygon, w: room.w, d: room.d });
  // A courtyard's walls face out of it, into the room.
  const loops = [{ points: outline, sign: getOutlineInwardSign(outline) }, ...(room.holes ?? [])
    .filter((hole) => hole.length >= 3).map((hole) => ({ points: hole, sign: -getOutlineInwardSign(hole) }))];
  let best: RoomDoorPoint & { distance: number } = { center: point, inward: { x: 0, z: 0 }, distance: Infinity };
  for (const { points, sign } of loops) {
    points.forEach((a, index) => {
      const b = points[(index + 1) % points.length];
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      if (length === 0) return;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (length * length)));
      const center = { x: a.x + dx * t, z: a.z + dz * t };
      const distance = Math.hypot(point.x - center.x, point.z - center.z);
      if (distance < best.distance) best = { center, inward: { x: (-dz / length) * sign, z: (dx / length) * sign }, distance };
    });
  }
  return { center: best.center, inward: best.inward };
}

// Kept per drawn outline (or room, for a built-in L) and the doors' own values: placement scores dozens of candidate spots
// against the same doors, and a room snapshot is copied whenever an item in it moves.
const doorPointsByOutline = new WeakMap<object, Map<string, RoomDoorPoint[]>>();

function doorsKey(planRoom: HousePlanRoom2D, doors: readonly RoomOpening2D[]): string {
  return JSON.stringify([
    planRoom.x, planRoom.z, planRoom.w, planRoom.d, planRoom.shape, planRoom.floorLevel, planRoom.wallThickness, planRoom.holes,
    doors.map(({ id, roomId, wall, offsetMm, widthMm, canonicalWallId, canonicalHost, requestedWorldCenterMm }) =>
      [id, roomId, wall, offsetMm, widthMm, canonicalWallId, canonicalHost, requestedWorldCenterMm]),
  ]);
}

/** The room's doors (its own and those with no room), or null for a rectangle. */
export function getShapedRoomDoorPoints(room: RoomSnapshot, openings: readonly RoomOpening2D[]): RoomDoorPoint[] | null {
  if (getRoomWallFaceIds(room)[0] === "north") return null;
  const planRoom = toPlanRoom(room);
  const doors = openings.filter((opening) => opening.kind === "door" && (!opening.roomId || opening.roomId === room.id));
  const outlineKey: object = room.planPolygon ?? room;
  const key = doorsKey(planRoom, doors);
  const known = doorPointsByOutline.get(outlineKey)?.get(key);
  if (known) return known;
  const points = resolveDesignPageOpeningHosts(doors, [planRoom]).flatMap(({ resolution }): RoomDoorPoint[] => {
    // The host's way in is told by the direction to the room's centre, which a notch's walls can face away from, so the way
    // in is the outline's own, by its winding, as the 3D view tells a wall's inside.
    const at = resolution.status === "resolved" ? resolution.host.worldCenter : resolution.requestedWorldCenter;
    return at ? [nearestOnOutline(planRoom, { x: at.x - planRoom.x, z: at.z - planRoom.z })] : [];
  });
  const byKey = doorPointsByOutline.get(outlineKey) ?? new Map<string, RoomDoorPoint[]>();
  if (byKey.size > 16) byKey.clear();
  doorPointsByOutline.set(outlineKey, byKey.set(key, points));
  return points;
}
