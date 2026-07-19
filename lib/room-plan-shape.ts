import { Path, Shape } from "three";

export type RoomPlanShapePoint = readonly [x: number, z: number];

function openLoop(points: readonly RoomPlanShapePoint[]): RoomPlanShapePoint[] {
  if (points.length < 2) return [...points];
  const first = points[0];
  const last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1]
    ? points.slice(0, -1)
    : [...points];
}

function drawLoop(path: Path, points: readonly RoomPlanShapePoint[]) {
  const loop = openLoop(points);
  if (loop.length < 3) return false;
  path.moveTo(loop[0][0], -loop[0][1]);
  for (const [x, z] of loop.slice(1)) path.lineTo(x, -z);
  path.closePath();
  return true;
}

/**
 * Builds the one horizontal surface shape shared by the 2D floor and 3D
 * floor/ceiling renderers. Coordinates are local X/Z metres; Three.js shapes
 * are X/Y, hence the Z sign flip used consistently for outer and hole loops.
 */
export function buildRoomPlanShape(
  outer: readonly RoomPlanShapePoint[],
  holes: readonly (readonly RoomPlanShapePoint[])[] = []
): Shape {
  const shape = new Shape();
  drawLoop(shape, outer);
  for (const points of holes) {
    const hole = new Path();
    if (drawLoop(hole, points)) shape.holes.push(hole);
  }
  return shape;
}
