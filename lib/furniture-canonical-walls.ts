import {
  getCanonicalFaceTrimsMm,
  getCanonicalRoomWallFinish,
  type CanonicalFinishRoom,
} from "@/components/editor/renderers/canonical-floor-plan/canonicalWallPanels";
import { trimmedFaceEdge, WALL_FINISH_SKIN_MM } from "@/components/editor/renderers/canonical-floor-plan/geometry";
import type {
  CanonicalFloorPlanFloorRenderModel, CanonicalFloorPlanLineSegment, CanonicalFloorPlanWallRenderModel,
} from "@/lib/floor-plan-render-model";
import type { RoomPlanPolygonPoint } from "@/lib/room-types";

/**
 * An imported plan's room as its 3D view draws it (components/editor/renderers/canonical-floor-plan/), for its furniture to
 * keep 2 cm off (lib/furniture-room-fit.ts): the footprints of the plan's walls near it, each slice as drawn (mitred, run on
 * square or ended square where the plan leaves it so, an arc in its slices), and the room's laminate strips on them, cut to its
 * corners as drawn (getCanonicalFaceTrimsMm). Furniture never stands in a wall's thickness (J, 2 Nov 2026), so a door's or a
 * window's reveal counts as wall, as it does for built-ins (#245): each opening's stretch of its wall, the wall's thickness
 * wide, and every slice above or below it, whatever its height. A painted or tiled face is drawn as a 1.5 mm skin, which isn't
 * measured: the room stops at the bare wall there (J: what is drawn is what is measured). In the room's own coordinates (its
 * plan position subtracted).
 */

type Point = RoomPlanPolygonPoint;

export type CanonicalRoomWalls = { walls: Point[][]; panels: Point[][] };
type Room = CanonicalFinishRoom & { id: string; planPolygon?: readonly Point[] };

/** Walls this far past the room's outline (metres) can't be within 2 cm of furniture in it. */
const NEAR_METERS = 0.5;

const kept = new WeakMap<object, WeakMap<object, CanonicalRoomWalls | null>>();

const onFloor = (wall: CanonicalFloorPlanWallRenderModel) => wall.solids.filter((solid) => solid.bottomMm <= wall.baseOffsetMm + 0.5);

/** The room's walls and laminates as drawn, from the plan's floors (a compiled plan's); none where the plan doesn't hold it. */
export function getCanonicalRoomWalls(floors: readonly CanonicalFloorPlanFloorRenderModel[], room: Room): CanonicalRoomWalls | null {
  const byRoom = kept.get(floors) ?? new WeakMap<object, CanonicalRoomWalls | null>();
  kept.set(floors, byRoom);
  if (byRoom.has(room)) return byRoom.get(room)!;
  const floor = floors.find((entry) => entry.rooms.some(({ id }) => id === room.id));
  const walls = floor && room.planPolygon?.length ? buildRoomWalls(floor, room) : null;
  byRoom.set(room, walls);
  return walls;
}

function buildRoomWalls(floor: CanonicalFloorPlanFloorRenderModel, room: Room): CanonicalRoomWalls {
  const origin = room.planPosition ?? { x: room.x ?? 0, z: room.z ?? 0 };
  const local = ({ x, z }: Point) => ({ x: x - origin.x, z: z - origin.z });
  const fromMm = ({ xMm, zMm }: { xMm: number; zMm: number }) => local({ x: xMm / 1000, z: zMm / 1000 });
  const xs = room.planPolygon!.map(({ x }) => x), zs = room.planPolygon!.map(({ z }) => z);
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs) - NEAR_METERS, Math.max(...xs) + NEAR_METERS, Math.min(...zs) - NEAR_METERS, Math.max(...zs) + NEAR_METERS];
  const near = (quad: Point[]) => quad.some(({ x }) => x >= minX) && quad.some(({ x }) => x <= maxX) && quad.some(({ z }) => z >= minZ) && quad.some(({ z }) => z <= maxZ);
  const footprintOf = ({ footprint: { startLeft, endLeft, endRight, startRight } }: CanonicalFloorPlanWallRenderModel["solids"][number]) =>
    [startLeft, endLeft, endRight, startRight].map(fromMm);
  // Every slice of every wall, and each opening's reveal: its stretch of the wall, the wall's thickness wide.
  const reveal = (wall: CanonicalFloorPlanWallRenderModel, { start, end }: CanonicalFloorPlanLineSegment) => {
    const length = Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm), half = wall.thicknessMm / 2;
    if (!(length > 0)) return [];
    const [nx, nz] = [(-(end.zMm - start.zMm) / length) * half, ((end.xMm - start.xMm) / length) * half];
    return [[{ xMm: start.xMm + nx, zMm: start.zMm + nz }, { xMm: end.xMm + nx, zMm: end.zMm + nz }, { xMm: end.xMm - nx, zMm: end.zMm - nz },
      { xMm: start.xMm - nx, zMm: start.zMm - nz }].map(fromMm)];
  };
  const walls = floor.walls.flatMap((wall) => [...wall.solids.map(footprintOf),
    ...wall.openingPaths.flatMap(({ segments }) => segments.flatMap((part) => reveal(wall, part)))]).filter(near);
  const panels = floor.walls.flatMap((wall) => wall.roomSides.filter(({ roomId }) => roomId === room.id).flatMap(({ side }) => {
    const { depthMm } = getCanonicalRoomWallFinish(room, wall.id);
    if (!(depthMm > WALL_FINISH_SKIN_MM + 1e-6)) return [];
    return onFloor(wall).flatMap((solid) => {
      const trims = getCanonicalFaceTrimsMm(room, floor.walls, wall, solid, side);
      if (trims.hidden) return [];
      const [bare, front] = [trimmedFaceEdge(solid, side, 0, trims), trimmedFaceEdge(solid, side, depthMm, trims)];
      return [[bare.start, bare.end, front.end, front.start].map(local)];
    });
  }));
  return { walls, panels };
}
