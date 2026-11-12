import { isCeilingOnlyCatalogItem } from "@/lib/catalog-placement";
import { resolveDesignItemVisualProduct } from "@/lib/design-item-product-snapshot";
import { aabbIntersects } from "@/lib/design-page-geometry";
import { getRotatedFootprint } from "@/lib/design-page-utils";
import type { DesignItem, RoomSnapshot } from "@/lib/room-types";
import { computeAABB, type AABB } from "@/lib/snapGuides";

/**
 * Where a new layout block goes: the clear spot nearest the room's middle. It must stand wholly
 * inside the room and clear of every item it would bump into: one on the floor against the
 * floor items, one fixed high (an aircon, wall cabinets) against the other high ones. Rugs never
 * block. Positions are the room's own, from its centre, in metres.
 */

const STEP_METRES = 0.25;

export type FindLayoutBlockSpotInput = {
  room: RoomSnapshot;
  sizeMm: { w: number; d: number; h: number };
  overhead: boolean;
  baseY: number;
  getItemAABB: (item: DesignItem) => AABB | null;
  isContained: (room: RoomSnapshot, position: [number, number, number], rotationY: number, dimsMm: { w: number; d: number; h: number }) => boolean;
};

/** The room's points on a 25 cm grid, nearest its middle first. */
function candidatePoints(room: RoomSnapshot): Array<[number, number]> {
  const halfWidth = room.geometry.width / 2, halfDepth = room.geometry.depth / 2;
  const points: Array<[number, number]> = [];
  for (let x = -halfWidth; x <= halfWidth + 1e-9; x += STEP_METRES) {
    for (let z = -halfDepth; z <= halfDepth + 1e-9; z += STEP_METRES) points.push([x, z]);
  }
  points.push([0, 0]);
  return points.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
}

/** The items a block at this height would bump into. */
function blockersFor(room: RoomSnapshot, overhead: boolean, getItemAABB: FindLayoutBlockSpotInput["getItemAABB"]): AABB[] {
  return room.items.flatMap((item) => {
    const product = resolveDesignItemVisualProduct(item);
    if (product?.category === "rug" || isCeilingOnlyCatalogItem(product) !== overhead) return [];
    const box = getItemAABB(item);
    return box ? [box] : [];
  });
}

export function findLayoutBlockSpot({ room, sizeMm, overhead, baseY, getItemAABB, isContained }: FindLayoutBlockSpotInput): [number, number, number] | null {
  const blockers = blockersFor(room, overhead, getItemAABB);
  const [width, depth] = getRotatedFootprint(sizeMm.w / 1000, sizeMm.d / 1000, 0);
  for (const [x, z] of candidatePoints(room)) {
    const position: [number, number, number] = [x, baseY, z];
    if (!isContained(room, position, 0, sizeMm)) continue;
    const box = computeAABB(position, width, depth);
    if (!blockers.some((blocker) => aabbIntersects(box, blocker))) return position;
  }
  return null;
}
