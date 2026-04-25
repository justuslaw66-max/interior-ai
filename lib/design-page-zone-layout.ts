import type { CATALOG_ITEMS } from "@/lib/catalog";
import type { DesignItem, ZoneMin } from "@/lib/room-types";
import type { AABB } from "@/lib/snapGuides";

export type SelectionBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
};

type ClampToRoomFn = (
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  roomW: number,
  roomD: number,
  wall: number,
  rotationY?: number
) => [number, number];

type AlignSelectionParams = {
  axis: "x" | "z";
  currentItems: DesignItem[];
  selectedIds: Set<string>;
  isDesigner: boolean;
  catalogItems: typeof CATALOG_ITEMS;
  roomWidth: number;
  roomDepth: number;
  wallThickness: number;
  clampToRoom: ClampToRoomFn;
  getSelectionBounds: (selected: DesignItem[]) => SelectionBounds | null;
  getItemAABB: (item: DesignItem) => AABB | null;
  aabbIntersects: (a: AABB, b: AABB) => boolean;
};

export function buildAlignedSelectionItems(params: AlignSelectionParams): DesignItem[] | null {
  const {
    axis,
    currentItems,
    selectedIds,
    isDesigner,
    catalogItems,
    roomWidth,
    roomDepth,
    wallThickness,
    clampToRoom,
    getSelectionBounds,
    getItemAABB,
    aabbIntersects,
  } = params;

  if (selectedIds.size < 2) return null;

  const movable = currentItems.filter(
    (x) => selectedIds.has(x.instanceId) && !(isDesigner && x.locked)
  );
  if (!movable.length) return null;

  const bounds = getSelectionBounds(movable);
  if (!bounds) return null;
  const target = axis === "x" ? bounds.centerX : bounds.centerZ;

  const movableIds = new Set(movable.map((x) => x.instanceId));
  const blockers = currentItems.filter((x) => !movableIds.has(x.instanceId));

  const nextItems = currentItems.map((item) => {
    if (!movableIds.has(item.instanceId)) return item;
    const product = catalogItems[item.productId];
    if (!product) return item;

    const [safeX, safeZ] =
      axis === "x"
        ? clampToRoom(
            target,
            item.position[2],
            product.dimsMm.w / 1000,
            product.dimsMm.d / 1000,
            roomWidth,
            roomDepth,
            wallThickness,
            item.rotationY ?? 0
          )
        : clampToRoom(
            item.position[0],
            target,
            product.dimsMm.w / 1000,
            product.dimsMm.d / 1000,
            roomWidth,
            roomDepth,
            wallThickness,
            item.rotationY ?? 0
          );

    return {
      ...item,
      position: [safeX, item.position[1] ?? 0, safeZ] as [number, number, number],
    };
  });

  for (const moved of nextItems) {
    if (!movableIds.has(moved.instanceId)) continue;
    const movedAABB = getItemAABB(moved);
    if (!movedAABB) continue;
    for (const blocker of blockers) {
      const blockerAABB = getItemAABB(blocker);
      if (!blockerAABB) continue;
      if (aabbIntersects(movedAABB, blockerAABB)) return null;
    }
  }

  return nextItems;
}

type AutoLayoutZoneParams = {
  zoneId: string;
  zones: ZoneMin[];
  currentItems: DesignItem[];
  isDesigner: boolean;
  catalogItems: typeof CATALOG_ITEMS;
  roomWidth: number;
  roomDepth: number;
  wallThickness: number;
  clampToRoom: ClampToRoomFn;
};

export function buildAutoLayoutZoneItems(
  params: AutoLayoutZoneParams
): { nextItems: DesignItem[]; zoneType: ZoneMin["type"] } | null {
  const {
    zoneId,
    zones,
    currentItems,
    isDesigner,
    catalogItems,
    roomWidth,
    roomDepth,
    wallThickness,
    clampToRoom,
  } = params;

  const zone = zones.find((z) => z.id === zoneId);
  if (!zone) return null;

  const zoneSet = new Set(zone.itemIds);
  const zoneItems = currentItems.filter((item) => zoneSet.has(item.instanceId));
  if (!zoneItems.length) return null;

  const updates = new Map<string, DesignItem>();
  const getCategory = (item: DesignItem) => catalogItems[item.productId]?.category;

  if (zone.type === "seating") {
    const sofa = zoneItems.find((item) => getCategory(item) === "sofa");
    if (!sofa) return null;
    const sofaProduct = catalogItems[sofa.productId];
    const sofaDepth = (sofaProduct?.dimsMm.d ?? 900) / 1000;
    const sofaWidth = (sofaProduct?.dimsMm.w ?? 1800) / 1000;

    const coffee = zoneItems.find((item) => getCategory(item) === "coffee_table");
    if (coffee && !(isDesigner && coffee.locked)) {
      const coffeeProduct = catalogItems[coffee.productId];
      const coffeeDepth = (coffeeProduct?.dimsMm.d ?? 600) / 1000;
      const sofaFrontZ = sofa.position[2] + sofaDepth / 2;
      const targetZ = sofaFrontZ + 0.45 + coffeeDepth / 2;
      const [safeX, safeZ] = clampToRoom(
        sofa.position[0],
        targetZ,
        (coffeeProduct?.dimsMm.w ?? 600) / 1000,
        (coffeeProduct?.dimsMm.d ?? 600) / 1000,
        roomWidth,
        roomDepth,
        wallThickness,
        coffee.rotationY ?? 0
      );
      updates.set(coffee.instanceId, {
        ...coffee,
        position: [safeX, coffee.position[1] ?? 0, safeZ],
      });
    }

    const rug = zoneItems.find((item) => getCategory(item) === "rug");
    if (rug && !(isDesigner && rug.locked)) {
      const rugProduct = catalogItems[rug.productId];
      const rugZ = sofa.position[2] + sofaDepth * 0.35;
      const [safeX, safeZ] = clampToRoom(
        sofa.position[0],
        rugZ,
        rugProduct.dimsMm.w / 1000,
        rugProduct.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness,
        rug.rotationY ?? 0
      );
      updates.set(rug.instanceId, {
        ...rug,
        position: [safeX, rug.position[1] ?? 0, safeZ],
      });
    }

    const chairs = zoneItems.filter((item) => getCategory(item) === "accent_chair");
    const baseZ = sofa.position[2] + sofaDepth * 0.4;
    chairs.forEach((chair, index) => {
      if (isDesigner && chair.locked) return;
      const chairProduct = catalogItems[chair.productId];
      const chairWidth = (chairProduct?.dimsMm.w ?? 800) / 1000;
      const offsetX = sofaWidth / 2 + chairWidth / 2 + 0.25;
      const sign = index % 2 === 0 ? -1 : 1;
      const targetX = sofa.position[0] + sign * offsetX;
      const [safeX, safeZ] = clampToRoom(
        targetX,
        baseZ,
        (chairProduct?.dimsMm.w ?? 800) / 1000,
        (chairProduct?.dimsMm.d ?? 800) / 1000,
        roomWidth,
        roomDepth,
        wallThickness,
        chair.rotationY ?? 0
      );
      updates.set(chair.instanceId, {
        ...chair,
        position: [safeX, chair.position[1] ?? 0, safeZ],
      });
    });
  }

  if (zone.type === "reading") {
    const chair = zoneItems.find((item) => getCategory(item) === "accent_chair");
    const lamp = zoneItems.find((item) => getCategory(item) === "floor_lamp");
    if (chair && lamp && !(isDesigner && lamp.locked)) {
      const lampProduct = catalogItems[lamp.productId];
      const targetX = chair.position[0] + 0.45;
      const targetZ = chair.position[2] + 0.25;
      const [safeX, safeZ] = clampToRoom(
        targetX,
        targetZ,
        lampProduct.dimsMm.w / 1000,
        lampProduct.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness,
        lamp.rotationY ?? 0
      );
      updates.set(lamp.instanceId, {
        ...lamp,
        position: [safeX, lamp.position[1] ?? 0, safeZ],
      });
    }
  }

  if (zone.type === "tv") {
    const consoleItem = zoneItems.find((item) => {
      const category = getCategory(item);
      return category === "tv_console" || category === "sideboard";
    });
    if (consoleItem && !(isDesigner && consoleItem.locked)) {
      const consoleProduct = catalogItems[consoleItem.productId];
      const targetX = 0;
      const targetZ = roomDepth / 2 - wallThickness - consoleProduct.dimsMm.d / 1000 / 2;
      const [safeX, safeZ] = clampToRoom(
        targetX,
        targetZ,
        consoleProduct.dimsMm.w / 1000,
        consoleProduct.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness,
        consoleItem.rotationY ?? 0
      );
      updates.set(consoleItem.instanceId, {
        ...consoleItem,
        position: [safeX, consoleItem.position[1] ?? 0, safeZ],
      });
    }
  }

  if (!updates.size) return null;
  const nextItems = currentItems.map((item) => updates.get(item.instanceId) ?? item);
  return { nextItems, zoneType: zone.type };
}

type RotateZoneParams = {
  zoneId: string;
  deltaRot: number;
  zones: ZoneMin[];
  currentItems: DesignItem[];
  isDesigner: boolean;
  catalogItems: typeof CATALOG_ITEMS;
  roomWidth: number;
  roomDepth: number;
  wallThickness: number;
  clampToRoom: ClampToRoomFn;
  getSelectionBounds: (selected: DesignItem[]) => SelectionBounds | null;
  getItemAABB: (item: DesignItem) => AABB | null;
  aabbIntersects: (a: AABB, b: AABB) => boolean;
};

export function buildRotatedZoneItems(params: RotateZoneParams): DesignItem[] | null {
  const {
    zoneId,
    deltaRot,
    zones,
    currentItems,
    isDesigner,
    catalogItems,
    roomWidth,
    roomDepth,
    wallThickness,
    clampToRoom,
    getSelectionBounds,
    getItemAABB,
    aabbIntersects,
  } = params;

  const zone = zones.find((z) => z.id === zoneId);
  if (!zone) return null;

  const zoneSet = new Set(zone.itemIds);
  const movable = currentItems.filter(
    (item) => zoneSet.has(item.instanceId) && !(isDesigner && item.locked)
  );
  if (!movable.length) return null;

  const movableIds = new Set(movable.map((item) => item.instanceId));
  const blockers = currentItems.filter((item) => !movableIds.has(item.instanceId));
  const bounds = getSelectionBounds(movable);
  if (!bounds) return null;

  const pivotX = bounds.centerX;
  const pivotZ = bounds.centerZ;
  const cos = Math.cos(deltaRot);
  const sin = Math.sin(deltaRot);

  const nextItems = currentItems.map((item) => {
    if (!movableIds.has(item.instanceId)) return item;
    const product = catalogItems[item.productId];
    if (!product) return item;

    const offsetX = item.position[0] - pivotX;
    const offsetZ = item.position[2] - pivotZ;
    const rotatedX = offsetX * cos - offsetZ * sin;
    const rotatedZ = offsetX * sin + offsetZ * cos;
    const nextRot = (item.rotationY ?? 0) + deltaRot;
    const [safeX, safeZ] = clampToRoom(
      pivotX + rotatedX,
      pivotZ + rotatedZ,
      product.dimsMm.w / 1000,
      product.dimsMm.d / 1000,
      roomWidth,
      roomDepth,
      wallThickness,
      nextRot
    );

    return {
      ...item,
      position: [safeX, item.position[1] ?? 0, safeZ] as [number, number, number],
      rotationY: nextRot,
    };
  });

  for (const moved of nextItems) {
    if (!movableIds.has(moved.instanceId)) continue;
    const movedProduct = catalogItems[moved.productId];
    if (movedProduct?.category === "rug") continue;
    const movedAABB = getItemAABB(moved);
    if (!movedAABB) continue;

    for (const blocker of blockers) {
      const blockerProduct = catalogItems[blocker.productId];
      if (blockerProduct?.category === "rug") continue;
      const blockerAABB = getItemAABB(blocker);
      if (!blockerAABB) continue;
      if (aabbIntersects(movedAABB, blockerAABB)) return null;
    }
  }

  return nextItems;
}