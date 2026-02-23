import { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema, ProductCategory } from "@/lib/catalog-schema";

export type ConstraintLevel = "ok" | "warn" | "error";

export type ConstraintResult = {
  id: string;
  level: ConstraintLevel;
  message: string;
  anchor?: [number, number, number];
};

type PlacedItemLike = {
  instanceId: string;
  productId: string;
  position: [number, number, number];
  rotationY?: number;
};

type AABB = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

type RoomSpec = {
  width: number;
  depth: number;
  wallThickness?: number;
};

type DesignLike = {
  items: PlacedItemLike[];
};

function getRotatedFootprint(
  itemWidth: number,
  itemDepth: number,
  rotationY: number
): [number, number] {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const effW = Math.abs(cos) * itemWidth + Math.abs(sin) * itemDepth;
  const effD = Math.abs(sin) * itemWidth + Math.abs(cos) * itemDepth;
  return [effW, effD];
}

function getItemAabb(item: PlacedItemLike, catalogItem: CatalogItemSchema): AABB {
  const rotationY = item.rotationY ?? 0;
  
  // Use canonical bounds from catalog if available, otherwise compute from dimensions
  let itemWidth = catalogItem.dimsMm.w / 1000;  // mm to meters
  let itemDepth = catalogItem.dimsMm.d / 1000;
  
  // If bounds are explicitly defined (from ModelAsset), prefer those
  if (catalogItem.bounds && catalogItem.bounds.type === "aabb") {
    itemWidth = catalogItem.bounds.size.w;
    itemDepth = catalogItem.bounds.size.d;
  }
  
  const [effW, effD] = getRotatedFootprint(itemWidth, itemDepth, rotationY);
  
  return {
    minX: item.position[0] - effW / 2,
    maxX: item.position[0] + effW / 2,
    minZ: item.position[2] - effD / 2,
    maxZ: item.position[2] + effD / 2,
  };
}

function aabbIntersects(a: AABB, b: AABB) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

function aabbGap(a: AABB, b: AABB) {
  const gapX = Math.max(0, Math.max(b.minX - a.maxX, a.minX - b.maxX));
  const gapZ = Math.max(0, Math.max(b.minZ - a.maxZ, a.minZ - b.maxZ));
  return { gapX, gapZ, minGap: Math.min(gapX, gapZ) };
}

function nearestWallGap(aabb: AABB, room: RoomSpec) {
  const wall = room.wallThickness ?? 0;
  const minX = -room.width / 2 + wall;
  const maxX = room.width / 2 - wall;
  const minZ = -room.depth / 2 + wall;
  const maxZ = room.depth / 2 - wall;

  const gaps = [
    aabb.minX - minX,
    maxX - aabb.maxX,
    aabb.minZ - minZ,
    maxZ - aabb.maxZ,
  ];
  return Math.min(...gaps);
}

function findNearestByCategory(
  items: PlacedItemLike[],
  from: PlacedItemLike,
  targetCategory: ProductCategory
): { item: PlacedItemLike; product: CatalogItemSchema } | null {
  let best: { item: PlacedItemLike; product: CatalogItemSchema; dist: number } | null = null;
  for (const item of items) {
    if (item.instanceId === from.instanceId) continue;
    const product = CATALOG_ITEMS[item.productId];
    if (!product || product.category !== targetCategory) continue;
    const dx = item.position[0] - from.position[0];
    const dz = item.position[2] - from.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (!best || dist < best.dist) {
      best = { item, product, dist };
    }
  }
  return best ? { item: best.item, product: best.product } : null;
}

export function evaluateConstraints(opts: {
  design: DesignLike;
  movedItemId?: string;
  room: RoomSpec;
}): ConstraintResult[] {
  const { design, movedItemId, room } = opts;
  const items = design.items ?? [];
  if (!movedItemId) return [];

  const movedItem = items.find((item) => item.instanceId === movedItemId);
  if (!movedItem) return [];

  const movedProduct = CATALOG_ITEMS[movedItem.productId];
  if (!movedProduct) return [];

  const results: ConstraintResult[] = [];
  const movedAabb = getItemAabb(movedItem, movedProduct);

  // Collision / overlap
  let minItemGap = Number.POSITIVE_INFINITY;
  let overlapItem: CatalogItemSchema | null = null;
  for (const other of items) {
    if (other.instanceId === movedItem.instanceId) continue;
    const otherProduct = CATALOG_ITEMS[other.productId];
    if (!otherProduct) continue;
    const otherAabb = getItemAabb(other, otherProduct);
    if (aabbIntersects(movedAabb, otherAabb)) {
      overlapItem = otherProduct;
    }
    const { minGap } = aabbGap(movedAabb, otherAabb);
    minItemGap = Math.min(minItemGap, minGap);
  }

  if (overlapItem) {
    results.push({
      id: "collision",
      level: "error",
      message: `Overlapping item — move blocked (${overlapItem.title})`,
    });
  } else if (Number.isFinite(minItemGap) && minItemGap < 0.25) {
    results.push({
      id: "tight-fit",
      level: "warn",
      message: `Tight fit — may feel cramped (${Math.round(minItemGap * 100)}cm)`,
    });
  }

  // Walkway clearance (min gap to walls/items)
  const wallGap = nearestWallGap(movedAabb, room);
  const minClearance = Math.min(minItemGap, wallGap);
  if (Number.isFinite(minClearance)) {
    if (minClearance < 0.7) {
      results.push({
        id: "walkway",
        level: "error",
        message: `Walkway blocked (${Math.round(minClearance * 100)}cm). Move furniture to clear path`,
      });
    } else if (minClearance < 0.8) {
      results.push({
        id: "walkway",
        level: "warn",
        message: `Walkway is tight (${Math.round(minClearance * 100)}cm). Aim for 80cm+`,
      });
    } else {
      results.push({
        id: "walkway",
        level: "ok",
        message: `Walkway clearance looks good (${Math.round(minClearance * 100)}cm)`,
      });
    }
  }

  // Coffee table ↔ sofa distance
  if (movedProduct.category === "coffee_table" || movedProduct.category === "sofa") {
    const targetCategory: ProductCategory =
      movedProduct.category === "coffee_table" ? "sofa" : "coffee_table";
    const nearest = findNearestByCategory(items, movedItem, targetCategory);
    if (nearest) {
      const otherAabb = getItemAabb(nearest.item, nearest.product);
      const { gapX, gapZ, minGap } = aabbGap(movedAabb, otherAabb);
      const overlapX = movedAabb.minX <= otherAabb.maxX && movedAabb.maxX >= otherAabb.minX;
      const overlapZ = movedAabb.minZ <= otherAabb.maxZ && movedAabb.maxZ >= otherAabb.minZ;
      const faceGap = overlapX ? gapZ : overlapZ ? gapX : minGap;

      if (faceGap >= 0.35 && faceGap <= 0.55) {
        results.push({
          id: "coffee-sofa",
          level: "ok",
          message: `Coffee table gap is ideal (${Math.round(faceGap * 100)}cm)`,
        });
      } else {
        const reason = faceGap < 0.35 ? "too close" : "too far";
        results.push({
          id: "coffee-sofa",
          level: "warn",
          message: `Coffee table is ${reason} (${Math.round(faceGap * 100)}cm). Aim 35–55cm`,
        });
      }
    }
  }

  // Rug sizing rule
  if (movedProduct.category === "rug" || movedProduct.category === "sofa") {
    const targetCategory: ProductCategory =
      movedProduct.category === "rug" ? "sofa" : "rug";
    const nearest = findNearestByCategory(items, movedItem, targetCategory);
    if (nearest) {
      const [movedW] = getRotatedFootprint(
        movedProduct.dimsMm.w / 1000,
        movedProduct.dimsMm.d / 1000,
        movedItem.rotationY ?? 0
      );
      const [otherW] = getRotatedFootprint(
        nearest.product.dimsMm.w / 1000,
        nearest.product.dimsMm.d / 1000,
        nearest.item.rotationY ?? 0
      );
      const rugWidth = movedProduct.category === "rug" ? movedW : otherW;
      const sofaWidth = movedProduct.category === "sofa" ? movedW : otherW;
      if (sofaWidth > 0) {
        const ratio = rugWidth / sofaWidth;
        if (ratio >= 0.65 && ratio <= 0.8) {
          results.push({
            id: "rug-size",
            level: "ok",
            message: `Rug size works well (${Math.round(ratio * 100)}% of sofa width)`,
          });
        } else {
          results.push({
            id: "rug-size",
            level: "warn",
            message: `Rug looks ${ratio < 0.65 ? "small" : "large"} (${Math.round(ratio * 100)}%). Try 65–80%`,
          });
        }
      }
    }
  }

  // Wall placement sanity
  const wallItems = new Set<ProductCategory>(["sofa", "tv_console"]);
  if (wallItems.has(movedProduct.category)) {
    const wallGapCm = Math.round(nearestWallGap(movedAabb, room) * 100);
    if (wallGapCm <= 10 && wallGapCm >= 2) {
      results.push({
        id: "wall-gap",
        level: "ok",
        message: `Placed nicely against wall (${wallGapCm}cm gap)`,
      });
    } else if (wallGapCm > 20) {
      results.push({
        id: "wall-gap",
        level: "warn",
        message: `Looks floating (${wallGapCm}cm). Consider pushing to wall`,
      });
    } else if (wallGapCm < 2) {
      results.push({
        id: "wall-gap",
        level: "warn",
        message: `Too tight to wall (${wallGapCm}cm). Leave a small gap`,
      });
    }
  }

  return results;
}
