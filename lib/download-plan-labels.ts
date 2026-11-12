import type { FloorPlanPointMmV2 as Point } from "@/lib/floor-plan-document-v2";
import type { PlacedFurniture } from "@/lib/floor-plan-vector-furniture";

/**
 * Where a room's name goes on the furnished plan: the free spot nearest the room's middle,
 * clear of every item's footprint, so a coffee table's tag never sits under the name. The
 * name's size is taken at 1:50, the largest it prints; where no spot is free, the middle.
 */

export type PlanBox = { minX: number; maxX: number; minZ: number; maxZ: number };

const TEXT_MM = 2.6;
const LARGEST_SCALE = 50;
/** Liberation Sans' average advance, as a share of the type size, with room to spare. */
const ADVANCE_SHARE = 0.56;
const GRID_MM = 150;
const MARGIN_MM = 120;

/** Each item's footprint, turned, as the box around it. */
export function furnitureBox({ placement }: PlacedFurniture): PlanBox {
  const cos = Math.abs(Math.cos(placement.rotationY)), sin = Math.abs(Math.sin(placement.rotationY));
  const halfX = (placement.widthMm * cos + placement.depthMm * sin) / 2;
  const halfZ = (placement.widthMm * sin + placement.depthMm * cos) / 2;
  return { minX: placement.centre.xMm - halfX, maxX: placement.centre.xMm + halfX, minZ: placement.centre.zMm - halfZ, maxZ: placement.centre.zMm + halfZ };
}

const overlaps = (a: PlanBox, b: PlanBox) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;

/** The label's box at 1:50, its text centred on `point` with the baseline there. */
function labelBox(text: string, point: Point): PlanBox {
  const size = TEXT_MM * LARGEST_SCALE, half = (text.length * ADVANCE_SHARE * size) / 2;
  return { minX: point.xMm - half, maxX: point.xMm + half, minZ: point.zMm - size, maxZ: point.zMm + size * 0.3 };
}

export function clearLabelPoint(text: string, middle: Point, room: PlanBox, obstacles: readonly PlanBox[]): Point {
  const free = (point: Point) => {
    const box = labelBox(text, point);
    return box.minX >= room.minX + MARGIN_MM && box.maxX <= room.maxX - MARGIN_MM && box.minZ >= room.minZ + MARGIN_MM
      && box.maxZ <= room.maxZ - MARGIN_MM && !obstacles.some((obstacle) => overlaps(box, obstacle));
  };
  if (free(middle)) return middle;
  const candidates: Point[] = [];
  for (let x = room.minX; x <= room.maxX; x += GRID_MM) {
    for (let z = room.minZ; z <= room.maxZ; z += GRID_MM) candidates.push({ xMm: x, zMm: z });
  }
  const distance = (point: Point) => Math.hypot(point.xMm - middle.xMm, point.zMm - middle.zMm);
  return candidates.filter(free).sort((first, second) => distance(first) - distance(second))[0] ?? middle;
}
