import { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema, DimensionsMm, ProductCategory } from "@/lib/catalog-schema";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { mapToTopCategory, type CatalogTopCategory } from "@/lib/catalog/view-builders";
import {
  aabbIntersects,
  isFootprintInsideRoomPolygon,
  isPointInsideRoomPolygonWithHoles,
  type AABB,
} from "@/lib/design-page-geometry";
import { clamp, getRotatedFootprint } from "@/lib/design-page-utils";
import { isWithinEditorBoundary } from "@/lib/editor-geometry-tolerances";
import type { DesignItem } from "@/lib/room-types";
import { computeAABB } from "@/lib/snapGuides";

export type CatalogPlacementPlanRoom = {
  id: string;
  name: string;
  shape?: "rectangle" | "l_shape" | "custom_polygon";
  polygon?: Array<{ x: number; z: number }>;
  holes?: Array<Array<{ x: number; z: number }>>;
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
  supportInstanceId?: string;
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

export type CatalogSupportSurfaceHighlight = {
  supportInstanceId: string;
  supportTitle: string;
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
  excludedInstanceIds?: string[];
};

type CatalogPlacementRoomArgs = {
  roomWidth: number;
  roomDepth: number;
  roomHeight?: number;
  wallThickness: number;
  clampToActiveRoom: CatalogPlacementRoomClamp;
};

type CatalogSurfacePlacementArgs = {
  productId: string;
  variantId?: string;
  purchaseOptionId?: string;
  roomId?: string;
  items: DesignItem[];
  nearPosition?: [number, number, number];
};

const DEFAULT_SURFACE_SUPPORT_CATEGORIES: ProductCategory[] = [
  "side_table",
  "coffee_table",
  "dining_table",
  "tv_console",
];

export function isSurfaceOnlyCatalogItem(product: Pick<CatalogItemSchema, "placementRules"> | null | undefined) {
  return product?.placementRules.surfaceOnly === true;
}

export function isCeilingOnlyCatalogItem(product: Pick<CatalogItemSchema, "placementRules"> | null | undefined) {
  return product?.placementRules.ceilingOnly === true;
}

export function getCeilingMountedItemBaseY({
  product,
  dimsMm,
  roomHeight,
}: {
  product: Pick<CatalogItemSchema, "placementRules"> | null | undefined;
  dimsMm: Pick<DimensionsMm, "h">;
  roomHeight: number;
}): number {
  if (!isCeilingOnlyCatalogItem(product)) return 0;
  return Math.max(0, roomHeight - dimsMm.h / 1000);
}

function getRequiredSurfaceCategories(product: CatalogItemSchema): ProductCategory[] {
  const categories = product.placementRules.requiredSurfaceCategories;
  return categories?.length ? categories : DEFAULT_SURFACE_SUPPORT_CATEGORIES;
}

function getPlanningDimsMm(item: DesignItem, product: CatalogItemSchema): DimensionsMm {
  const variant = product.variants.find((entry) => entry.id === item.variantId);
  return variant?.dimensionsMm ?? product.dimsMm;
}

function canSupportSurfacePlacement({
  product,
  support,
  supportItem,
  supportedItemDims,
}: {
  product: CatalogItemSchema;
  support: CatalogItemSchema;
  supportItem: DesignItem;
  supportedItemDims: DimensionsMm;
}): boolean {
  const allowedCategories = getRequiredSurfaceCategories(product);
  if (!allowedCategories.includes(support.category)) return false;

  const supportDims = getPlanningDimsMm(supportItem, support);
  const insetMm = product.placementRules.surfaceInsetMm ?? 80;
  const availableW = Math.max(0, supportDims.w - insetMm * 2);
  const availableD = Math.max(0, supportDims.d - insetMm * 2);
  const fitsNormal = supportedItemDims.w <= availableW && supportedItemDims.d <= availableD;
  const fitsRotated = supportedItemDims.d <= availableW && supportedItemDims.w <= availableD;
  return fitsNormal || fitsRotated;
}

function clampToSupportSurface({
  supportItem,
  supportDims,
  supportedItemDims,
  surfaceInsetMm,
  nearPosition,
}: {
  supportItem: DesignItem;
  supportDims: DimensionsMm;
  supportedItemDims: DimensionsMm;
  surfaceInsetMm: number;
  nearPosition?: [number, number, number];
}): [number, number, number] {
  const supportX = supportItem.position[0];
  const supportZ = supportItem.position[2];
  const supportTopY = (supportItem.position[1] ?? 0) + supportDims.h / 1000;
  if (!nearPosition) return [supportX, supportTopY, supportZ];

  const rotationY = supportItem.rotationY ?? 0;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const dx = nearPosition[0] - supportX;
  const dz = nearPosition[2] - supportZ;
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const insetMeters = surfaceInsetMm / 1000;
  const maxLocalX = Math.max(
    0,
    supportDims.w / 2000 - insetMeters - supportedItemDims.w / 2000
  );
  const maxLocalZ = Math.max(
    0,
    supportDims.d / 2000 - insetMeters - supportedItemDims.d / 2000
  );
  const clampedLocalX = clamp(localX, -maxLocalX, maxLocalX);
  const clampedLocalZ = clamp(localZ, -maxLocalZ, maxLocalZ);

  return [
    supportX + clampedLocalX * cos + clampedLocalZ * sin,
    supportTopY,
    supportZ - clampedLocalX * sin + clampedLocalZ * cos,
  ];
}

export function findCatalogSurfacePlacement({
  productId,
  variantId,
  purchaseOptionId,
  roomId,
  items,
  nearPosition,
}: CatalogSurfacePlacementArgs): PendingCatalogPlacement | null {
  const product = CATALOG_ITEMS[productId];
  if (!product || !isSurfaceOnlyCatalogItem(product)) return null;

  const resolved = resolveCatalogVariant(product, variantId ?? product.defaultVariantId);
  const supports = items
    .map((item) => {
      const support = CATALOG_ITEMS[item.productId];
      if (!support) return null;
      if (
        !canSupportSurfacePlacement({
          product,
          support,
          supportItem: item,
          supportedItemDims: resolved.dimsMm,
        })
      ) {
        return null;
      }
      const supportDims = getPlanningDimsMm(item, support);
      const position = clampToSupportSurface({
        supportItem: item,
        supportDims,
        supportedItemDims: resolved.dimsMm,
        surfaceInsetMm: product.placementRules.surfaceInsetMm ?? 80,
        nearPosition,
      });
      const distance = nearPosition
        ? Math.hypot(position[0] - nearPosition[0], position[2] - nearPosition[2])
        : 0;
      return { item, support, position, distance };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => a.distance - b.distance);

  const best = supports[0];
  if (!best) return null;

  return {
    productId,
    variantId: resolved.variantId,
    purchaseOptionId,
    roomId,
    supportInstanceId: best.item.instanceId,
    position: best.position,
    rotationY: best.item.rotationY ?? 0,
    reason: `On ${best.support.title} surface`,
  };
}

export function buildCatalogSupportSurfaceHighlight({
  placement,
  items,
  roomOffset = { x: 0, z: 0 },
}: {
  placement: PendingCatalogPlacement | null;
  items: DesignItem[];
  roomOffset?: { x: number; z: number };
}): CatalogSupportSurfaceHighlight | null {
  if (!placement?.supportInstanceId) return null;
  const product = CATALOG_ITEMS[placement.productId];
  if (!product || !isSurfaceOnlyCatalogItem(product)) return null;

  const supportItem = items.find(
    (item) => item.instanceId === placement.supportInstanceId
  );
  if (!supportItem) return null;
  const supportProduct = CATALOG_ITEMS[supportItem.productId];
  if (!supportProduct) return null;

  const supportDims = getPlanningDimsMm(supportItem, supportProduct);
  const width = supportDims.w / 1000;
  const depth = supportDims.d / 1000;
  const surfaceY = (supportItem.position[1] ?? 0) + supportDims.h / 1000;

  return {
    supportInstanceId: supportItem.instanceId,
    supportTitle: supportProduct.title,
    position: [
      supportItem.position[0] + roomOffset.x,
      surfaceY + 0.015,
      supportItem.position[2] + roomOffset.z,
    ],
    rotationY: supportItem.rotationY ?? 0,
    width,
    depth,
    outlinePoints: [
      [-width / 2, 0.008, -depth / 2],
      [width / 2, 0.008, -depth / 2],
      [width / 2, 0.008, depth / 2],
      [-width / 2, 0.008, depth / 2],
      [-width / 2, 0.008, -depth / 2],
    ],
  };
}

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
    return isPointInsideRoomPolygonWithHoles(
      { x: localX, z: localZ },
      room.polygon,
      room.holes
    );
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

export function isCatalogPlacementFootprintInsideRoom({
  room,
  position,
  rotationY,
  dimsMm,
  wallThickness = 0,
}: {
  room: CatalogPlacementPlanRoom;
  position: [number, number, number];
  rotationY: number;
  dimsMm: Pick<DimensionsMm, "w" | "d">;
  wallThickness?: number;
}): boolean {
  const [widthMeters, depthMeters] = getRotatedFootprint(
    dimsMm.w / 1000,
    dimsMm.d / 1000,
    rotationY
  );
  const halfWidth = widthMeters / 2;
  const halfDepth = depthMeters / 2;
  const wall = Number.isFinite(wallThickness) ? Math.max(0, wallThickness) : 0;
  const samplePoints = [
    [position[0] - halfWidth, position[2] - halfDepth],
    [position[0] + halfWidth, position[2] - halfDepth],
    [position[0] + halfWidth, position[2] + halfDepth],
    [position[0] - halfWidth, position[2] + halfDepth],
    [position[0], position[2]],
  ] as const;

  return samplePoints.every(([x, z]) => {
    const localX = x - room.x;
    const localZ = z - room.z;
    const insideBounds =
      isWithinEditorBoundary(localX, -room.w / 2 + wall, room.w / 2 - wall) &&
      isWithinEditorBoundary(localZ, -room.d / 2 + wall, room.d / 2 - wall);
    if (!insideBounds) return false;

    if (room.shape === "custom_polygon" && room.polygon?.length) {
      return isFootprintInsideRoomPolygon(
        localX,
        localZ,
        halfWidth + wall,
        halfDepth + wall,
        room.polygon,
        room.holes
      );
    }

    if (room.shape === "l_shape") {
      const notchW = room.w * 0.42;
      const notchD = room.d * 0.42;
      return !(localX > room.w / 2 - notchW - wall && localZ > room.d / 2 - notchD - wall);
    }

    return true;
  });
}

export function isCatalogPlacementLocalFootprintInsideRoom({
  room,
  position,
  rotationY,
  dimsMm,
  wallThickness = 0,
}: {
  room: CatalogPlacementPlanRoom;
  position: [number, number, number];
  rotationY: number;
  dimsMm: Pick<DimensionsMm, "w" | "d">;
  wallThickness?: number;
}): boolean {
  return isCatalogPlacementFootprintInsideRoom({
    room: { ...room, x: 0, z: 0 },
    position,
    rotationY,
    dimsMm,
    wallThickness,
  });
}

export function doesCatalogPlacementCollide({
  productId,
  position,
  rotationY,
  dimsMm,
  items,
  getItemAABB,
  excludedInstanceId,
  excludedInstanceIds,
}: CatalogPlacementCollisionArgs): boolean {
  const product = CATALOG_ITEMS[productId];
  if (!product || product.category === "rug") return false;
  const ceilingOnly = isCeilingOnlyCatalogItem(product);
  const excluded = new Set([
    ...(excludedInstanceId ? [excludedInstanceId] : []),
    ...(excludedInstanceIds ?? []),
  ]);

  const [widthMeters, depthMeters] = getRotatedFootprint(
    dimsMm.w / 1000,
    dimsMm.d / 1000,
    rotationY
  );
  const candidateAABB = computeAABB(position, widthMeters, depthMeters);

  for (const blocker of items) {
    if (excluded.has(blocker.instanceId)) continue;
    const blockerProduct = CATALOG_ITEMS[blocker.productId];
    if (!blockerProduct || blockerProduct.category === "rug") continue;
    if (ceilingOnly !== isCeilingOnlyCatalogItem(blockerProduct)) continue;

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
  excludedInstanceIds,
}: CatalogPlacementCollisionArgs): DesignItem | null {
  const product = CATALOG_ITEMS[productId];
  if (!product || product.category === "rug") return null;
  const ceilingOnly = isCeilingOnlyCatalogItem(product);
  const excluded = new Set([
    ...(excludedInstanceId ? [excludedInstanceId] : []),
    ...(excludedInstanceIds ?? []),
  ]);

  const [widthMeters, depthMeters] = getRotatedFootprint(
    dimsMm.w / 1000,
    dimsMm.d / 1000,
    rotationY
  );
  const candidateAABB = computeAABB(position, widthMeters, depthMeters);

  for (const blocker of items) {
    if (excluded.has(blocker.instanceId)) continue;
    const blockerProduct = CATALOG_ITEMS[blocker.productId];
    if (!blockerProduct || blockerProduct.category === "rug") continue;
    if (ceilingOnly !== isCeilingOnlyCatalogItem(blockerProduct)) continue;

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
  roomHeight = 2.7,
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
    position: [
      clampedX,
      getCeilingMountedItemBaseY({ product, dimsMm: resolved.dimsMm, roomHeight }),
      clampedZ,
    ],
    rotationY,
    reason,
  };
}

export function buildCatalogPlacementPreview({
  productId,
  variantId,
  purchaseOptionId,
  canPlace,
  surfaceItems,
  roomId,
  roomWidth,
  roomDepth,
  roomHeight = 2.7,
  wallThickness,
  clampToActiveRoom,
  collides,
}: CatalogPlacementRoomArgs & {
  productId: string;
  variantId?: string;
  purchaseOptionId?: string;
  canPlace: boolean;
  surfaceItems?: DesignItem[];
  roomId?: string;
  collides: (
    productId: string,
    position: [number, number, number],
    rotationY: number,
    dimsMm: DimensionsMm,
    excludedInstanceId?: string
  ) => boolean;
}): PendingCatalogPlacement | null {
  const product = CATALOG_ITEMS[productId];
  if (!product || !canPlace) return null;

  if (isSurfaceOnlyCatalogItem(product)) {
    return findCatalogSurfacePlacement({
      productId,
      variantId,
      purchaseOptionId,
      roomId,
      items: surfaceItems ?? [],
    });
  }

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
    const position: [number, number, number] = [
      safeX,
      getCeilingMountedItemBaseY({ product, dimsMm: resolved.dimsMm, roomHeight }),
      safeZ,
    ];
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
  surfaceItems,
  roomId,
  roomWidth,
  roomDepth,
  roomHeight = 2.7,
  wallThickness,
  clampToActiveRoom,
  collides,
}: CatalogPlacementRoomArgs & {
  productId: string;
  variantId?: string;
  purchaseOptionId?: string;
  itemCount: number;
  surfaceItems?: DesignItem[];
  roomId?: string;
  collides: (
    productId: string,
    position: [number, number, number],
    rotationY: number,
    dimsMm: DimensionsMm,
    excludedInstanceId?: string
  ) => boolean;
}): PendingCatalogPlacement | null {
  const product = CATALOG_ITEMS[productId];
  if (!product) return null;

  if (isSurfaceOnlyCatalogItem(product)) {
    return findCatalogSurfacePlacement({
      productId,
      variantId,
      purchaseOptionId,
      roomId,
      items: surfaceItems ?? [],
    });
  }

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
  const safeFallback: [number, number, number] = [
    safeX,
    getCeilingMountedItemBaseY({ product, dimsMm: resolved.dimsMm, roomHeight }),
    safeZ,
  ];
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
    (placement.position[1] ?? 0) + 0.03,
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
      [-width / 2, 0.01, -depth / 2],
      [width / 2, 0.01, -depth / 2],
      [width / 2, 0.01, depth / 2],
      [-width / 2, 0.01, depth / 2],
      [-width / 2, 0.01, -depth / 2],
    ],
  };
}
