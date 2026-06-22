import { CATALOG_ITEMS } from "@/lib/catalog";
import type { DimensionsMm } from "@/lib/catalog-schema";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { mapToTopCategory, type CatalogTopCategory } from "@/lib/catalog/view-builders";
import { aabbIntersects, type AABB } from "@/lib/design-page-geometry";
import { getRotatedFootprint } from "@/lib/design-page-utils";
import type { DesignItem } from "@/lib/room-types";
import { computeAABB } from "@/lib/snapGuides";

export type CatalogPlacementPlanRoom = {
  id: string;
  name: string;
  shape?: "rectangle" | "l_shape" | "custom_polygon";
  polygon?: Array<{ x: number; z: number }>;
  x: number;
  z: number;
  w: number;
  d: number;
};

export type PendingCatalogPlacement = {
  productId: string;
  variantId: string;
  roomId?: string;
  purchaseOptionId?: string;
  position: [number, number, number];
  rotationY: number;
  reason: string;
};

export type PendingCatalogPlacementScene = {
  productTitle: string;
  variantLabel: string;
  reason: string;
  roomOffset: { x: number; z: number };
  position: [number, number, number];
  rotationY: number;
  width: number;
  depth: number;
  outlinePoints: [number, number, number][];
};

export type CatalogPlacementRoomClamp = (
  x: number,
  z: number,
  widthMeters: number,
  depthMeters: number,
  roomWidth: number,
  roomDepth: number,
  wallThickness: number,
  rotationY?: number
) => [number, number];

type CatalogPlacementCollisionArgs = {
  productId: string;
  position: [number, number, number];
  rotationY: number;
  dimsMm: Pick<DimensionsMm, "w" | "d">;
  items: DesignItem[];
  getItemAABB: (item: DesignItem) => AABB | null;
  excludedInstanceId?: string;
};

type CatalogPlacementRoomArgs = {
  roomWidth: number;
  roomDepth: number;
  wallThickness: number;
  clampToActiveRoom: CatalogPlacementRoomClamp;
};

export function isPointInsideCatalogPlacementPolygon(
  x: number,
  z: number,
  polygon: Array<{ x: number; z: number }>
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses =
      a.z > z !== b.z > z &&
      x < ((b.x - a.x) * (z - a.z)) / ((b.z - a.z) || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function isWorldPointInsideCatalogPlacementRoom(
  room: CatalogPlacementPlanRoom,
  x: number,
  z: number
): boolean {
  const localX = x - room.x;
  const localZ = z - room.z;
  const insideBounds =
    localX >= -room.w / 2 &&
    localX <= room.w / 2 &&
    localZ >= -room.d / 2 &&
    localZ <= room.d / 2;
  if (!insideBounds) return false;

  if (room.shape === "custom_polygon" && room.polygon?.length) {
    return isPointInsideCatalogPlacementPolygon(localX, localZ, room.polygon);
  }

  if (room.shape === "l_shape") {
    const notchW = room.w * 0.42;
    const notchD = room.d * 0.42;
    return !(localX > room.w / 2 - notchW && localZ > room.d / 2 - notchD);
  }

  return true;
}

export function findCatalogPlacementPlanRoomAtWorldPoint(
  rooms: CatalogPlacementPlanRoom[],
  x: number,
  z: number
): CatalogPlacementPlanRoom | null {
  return rooms.find((room) => isWorldPointInsideCatalogPlacementRoom(room, x, z)) ?? null;
}

export function doesCatalogPlacementCollide({
  productId,
  position,
  rotationY,
  dimsMm,
  items,
  getItemAABB,
  excludedInstanceId,
}: CatalogPlacementCollisionArgs): boolean {
  const product = CATALOG_ITEMS[productId];
  if (!product || product.category === "rug") return false;

  const [widthMeters, depthMeters] = getRotatedFootprint(
    dimsMm.w / 1000,
    dimsMm.d / 1000,
    rotationY
  );
  const candidateAABB = computeAABB(position, widthMeters, depthMeters);

  for (const blocker of items) {
    if (blocker.instanceId === excludedInstanceId) continue;
    const blockerProduct = CATALOG_ITEMS[blocker.productId];
    if (!blockerProduct || blockerProduct.category === "rug") continue;

    const blockerAABB = getItemAABB(blocker);
    if (!blockerAABB) continue;
    if (aabbIntersects(candidateAABB, blockerAABB)) {
      return true;
    }
  }

  return false;
}

export function findCatalogPlacementCollision({
  productId,
  position,
  rotationY,
  dimsMm,
  items,
  getItemAABB,
  excludedInstanceId,
}: CatalogPlacementCollisionArgs): DesignItem | null {
  const product = CATALOG_ITEMS[productId];
  if (!product || product.category === "rug") return null;

  const [widthMeters, depthMeters] = getRotatedFootprint(
    dimsMm.w / 1000,
    dimsMm.d / 1000,
    rotationY
  );
  const candidateAABB = computeAABB(position, widthMeters, depthMeters);

  for (const blocker of items) {
    if (blocker.instanceId === excludedInstanceId) continue;
    const blockerProduct = CATALOG_ITEMS[blocker.productId];
    if (!blockerProduct || blockerProduct.category === "rug") continue;

    const blockerAABB = getItemAABB(blocker);
    if (!blockerAABB) continue;
    if (aabbIntersects(candidateAABB, blockerAABB)) {
      return blocker;
    }
  }

  return null;
}

export function updatePendingCatalogPlacementDraft({
  placement,
  rawPosition,
  rotationY,
  fallbackReason,
  roomWidth,
  roomDepth,
  wallThickness,
  clampToActiveRoom,
}: CatalogPlacementRoomArgs & {
  placement: PendingCatalogPlacement;
  rawPosition: [number, number, number];
  rotationY: number;
  fallbackReason: string;
}): PendingCatalogPlacement | null {
  const product = CATALOG_ITEMS[placement.productId];
  if (!product) return null;

  const resolved = resolveCatalogVariant(product, placement.variantId);
  const widthMeters = resolved.dimsMm.w / 1000;
  const depthMeters = resolved.dimsMm.d / 1000;
  const [safeX, safeZ] = clampToActiveRoom(
    rawPosition[0],
    rawPosition[2],
    widthMeters,
    depthMeters,
    roomWidth,
    roomDepth,
    wallThickness,
    rotationY
  );

  let nextX = safeX;
  let nextZ = safeZ;
  let reason = fallbackReason;
  const [effectiveWidth, effectiveDepth] = getRotatedFootprint(
    widthMeters,
    depthMeters,
    rotationY
  );
  const inset = Math.max(0.2, wallThickness + 0.15);
  const wallX = Math.max(0, roomWidth / 2 - effectiveWidth / 2 - inset);
  const wallZ = Math.max(0, roomDepth / 2 - effectiveDepth / 2 - inset);
  const snapTolerance = 0.28;

  const snapToTarget = (
    value: number,
    targets: Array<{ value: number; label: string }>
  ) => {
    let best: { value: number; label: string; distance: number } | null = null;
    for (const target of targets) {
      const distance = Math.abs(value - target.value);
      if (distance > snapTolerance) continue;
      if (!best || distance < best.distance) {
        best = { ...target, distance };
      }
    }
    return best;
  };

  const xSnap = snapToTarget(nextX, [
    { value: 0, label: "Aligned to room center" },
    ...(wallX > 0
      ? [
          { value: -wallX, label: "Snapped near left wall" },
          { value: wallX, label: "Snapped near right wall" },
        ]
      : []),
  ]);
  if (xSnap) {
    nextX = xSnap.value;
    reason = xSnap.label;
  }

  const zSnap = snapToTarget(nextZ, [
    { value: 0, label: "Aligned to room center" },
    ...(wallZ > 0
      ? [
          { value: -wallZ, label: "Snapped near back wall" },
          { value: wallZ, label: "Snapped near front wall" },
        ]
      : []),
  ]);
  if (zSnap) {
    nextZ = zSnap.value;
    reason = xSnap && zSnap ? "Aligned to room center" : zSnap.label;
  }

  const [clampedX, clampedZ] = clampToActiveRoom(
    nextX,
    nextZ,
    widthMeters,
    depthMeters,
    roomWidth,
    roomDepth,
    wallThickness,
    rotationY
  );

  return {
    ...placement,
    position: [clampedX, 0, clampedZ],
    rotationY,
    reason,
  };
}

export function buildCatalogPlacementPreview({
  productId,
  variantId,
  purchaseOptionId,
  canPlace,
  roomWidth,
  roomDepth,
  wallThickness,
  clampToActiveRoom,
  collides,
}: CatalogPlacementRoomArgs & {
  productId: string;
  variantId?: string;
  purchaseOptionId?: string;
  canPlace: boolean;
  collides: (
    productId: string,
    position: [number, number, number],
    rotationY: number,
    dimsMm: DimensionsMm
  ) => boolean;
}): PendingCatalogPlacement | null {
  const product = CATALOG_ITEMS[productId];
  if (!product || !canPlace) return null;

  const resolved = resolveCatalogVariant(product, variantId ?? product.defaultVariantId);
  const widthMeters = resolved.dimsMm.w / 1000;
  const depthMeters = resolved.dimsMm.d / 1000;
  const inset = Math.max(0.2, wallThickness + 0.15);
  const maxX = Math.max(0, roomWidth / 2 - widthMeters / 2 - inset);
  const maxZ = Math.max(0, roomDepth / 2 - depthMeters / 2 - inset);
  const topCategory = mapToTopCategory(product.category, product);
  const wallFirstCategories = new Set<CatalogTopCategory>([
    "sofa",
    "tv_console",
    "sideboard",
    "floor_lamp",
    "dining_bench",
  ]);
  const candidates: Array<{
    x: number;
    z: number;
    rotationY: number;
    reason: string;
  }> = [
    { x: 0, z: 0, rotationY: 0, reason: "Centered in the room" },
    { x: 0, z: -maxZ, rotationY: 0, reason: "Near the back wall" },
    { x: 0, z: maxZ, rotationY: Math.PI, reason: "Near the front wall" },
    { x: -maxX, z: 0, rotationY: Math.PI / 2, reason: "Near the left wall" },
    { x: maxX, z: 0, rotationY: -Math.PI / 2, reason: "Near the right wall" },
    { x: -maxX * 0.5, z: -maxZ * 0.5, rotationY: 0, reason: "Open corner placement" },
    { x: maxX * 0.5, z: -maxZ * 0.5, rotationY: 0, reason: "Open corner placement" },
    { x: -maxX * 0.5, z: maxZ * 0.5, rotationY: Math.PI, reason: "Open corner placement" },
    { x: maxX * 0.5, z: maxZ * 0.5, rotationY: Math.PI, reason: "Open corner placement" },
  ];
  const orderedCandidates = wallFirstCategories.has(topCategory)
    ? [...candidates.slice(1, 5), candidates[0], ...candidates.slice(5)]
    : candidates;

  for (const candidate of orderedCandidates) {
    const [safeX, safeZ] = clampToActiveRoom(
      candidate.x,
      candidate.z,
      widthMeters,
      depthMeters,
      roomWidth,
      roomDepth,
      wallThickness,
      candidate.rotationY
    );
    const position: [number, number, number] = [safeX, 0, safeZ];
    if (collides(productId, position, candidate.rotationY, resolved.dimsMm)) {
      continue;
    }
    return {
      productId,
      variantId: resolved.variantId,
      purchaseOptionId,
      position,
      rotationY: candidate.rotationY,
      reason: candidate.reason,
    };
  }

  return null;
}

export function buildCatalogFallbackPlacement({
  productId,
  variantId,
  purchaseOptionId,
  itemCount,
  roomWidth,
  roomDepth,
  wallThickness,
  clampToActiveRoom,
  collides,
}: CatalogPlacementRoomArgs & {
  productId: string;
  variantId?: string;
  purchaseOptionId?: string;
  itemCount: number;
  collides: (
    productId: string,
    position: [number, number, number],
    rotationY: number,
    dimsMm: DimensionsMm
  ) => boolean;
}): PendingCatalogPlacement | null {
  const product = CATALOG_ITEMS[productId];
  if (!product) return null;

  const resolved = resolveCatalogVariant(product, variantId ?? product.defaultVariantId);
  const column = itemCount % 3;
  const row = Math.floor(itemCount / 3);
  const fallbackPosition: [number, number, number] =
    itemCount === 0
      ? [0, 0, 0]
      : [(column - 1) * 0.9, 0, Math.min(1.6, -0.4 + row * 0.9)];
  const [safeX, safeZ] = clampToActiveRoom(
    fallbackPosition[0],
    fallbackPosition[2],
    resolved.dimsMm.w / 1000,
    resolved.dimsMm.d / 1000,
    roomWidth,
    roomDepth,
    wallThickness,
    0
  );
  const safeFallback: [number, number, number] = [safeX, fallbackPosition[1], safeZ];
  if (collides(productId, safeFallback, 0, resolved.dimsMm)) {
    return null;
  }

  return {
    productId,
    variantId: resolved.variantId,
    purchaseOptionId,
    position: safeFallback,
    rotationY: 0,
    reason: "Fallback placement",
  };
}

export function buildPendingCatalogPlacementScene({
  placement,
  roomOffset = { x: 0, z: 0 },
}: {
  placement: PendingCatalogPlacement | null;
  roomOffset?: { x: number; z: number };
}): PendingCatalogPlacementScene | null {
  if (!placement) return null;
  const product = CATALOG_ITEMS[placement.productId];
  if (!product) return null;

  const resolved = resolveCatalogVariant(product, placement.variantId);
  const width = resolved.dimsMm.w / 1000;
  const depth = resolved.dimsMm.d / 1000;
  const position: [number, number, number] = [
    placement.position[0] + roomOffset.x,
    0.07,
    placement.position[2] + roomOffset.z,
  ];

  return {
    productTitle: product.title,
    variantLabel: resolved.variant.label,
    reason: placement.reason,
    roomOffset,
    position,
    rotationY: placement.rotationY,
    width,
    depth,
    outlinePoints: [
      [-width / 2, 0.09, -depth / 2],
      [width / 2, 0.09, -depth / 2],
      [width / 2, 0.09, depth / 2],
      [-width / 2, 0.09, depth / 2],
      [-width / 2, 0.09, -depth / 2],
    ],
  };
}
