import type { PlacementRules, ProductCategory } from "@/lib/catalog-schema";
import { PLAN_SYMBOLS, PLAN_SYMBOL_KINDS } from "@/lib/plan-symbols/plan-symbol-library";
import type { PlanSymbolKind } from "@/lib/plan-symbols/plan-symbol-types";
import type { DesignItem } from "@/lib/room-types";

/**
 * Layout blocks: plan items with no product behind them (J, 12 Nov 2026). A block is one of the
 * plan symbols at a size the person sets, so a whole home can be laid out in 2D before anything
 * is chosen to buy. It is an ordinary DesignItem whose product snapshot holds its name, category
 * and size, so placement, collision, history, saving and sharing treat it like any placed item;
 * it has no price and no shop, and stays out of the cart, the budget and the product list.
 */

export const LAYOUT_BLOCK_ASSET_TYPE = "layout_block" as const;
const PRODUCT_PREFIX = "layout-block:";
const VARIANT_ID = "custom";
export const LAYOUT_BLOCK_VARIANT_LABEL = "Layout block";

/** What a block can be sized to, in millimetres. */
export const LAYOUT_BLOCK_LIMITS_MM = { minPlan: 50, maxPlan: 20_000, minHeight: 10, maxHeight: 5_000 } as const;

/** Things fixed high on a wall or the ceiling: dashed on the plan, and passing over what stands on the floor. */
const OVERHEAD_KINDS: ReadonlySet<PlanSymbolKind> = new Set([
  "pendant_light", "ceiling_fan", "wall_tv", "aircon", "range_hood", "wall_cabinet", "drying_rack", "water_heater", "mirror_cabinet",
]);

const CATEGORY_BY_KIND: Partial<Record<PlanSymbolKind, ProductCategory>> = {
  sofa: "sofa", sectional_sofa: "sofa", u_shaped_sofa: "sofa", sofa_bed: "sofa", chaise_lounge: "sofa",
  armchair: "accent_chair", recliner: "accent_chair", ottoman: "ottoman",
  coffee_table: "coffee_table", side_table: "side_table", tv_console: "tv_console", rug: "rug", floor_lamp: "floor_lamp",
  dining_table: "dining_table", dining_set: "dining_table", dining_bench: "dining_bench",
  bed: "bed", bunk_bed: "bed", cot: "bed", bookshelf: "bookshelf", sideboard: "sideboard",
  storage: "storage", wardrobe: "storage", dresser: "storage", shoe_cabinet: "storage", tall_cabinet: "storage", altar_cabinet: "storage",
};

/** A typical height for each kind, in millimetres; anything not listed stands 750 mm tall. */
const HEIGHT_MM: Partial<Record<PlanSymbolKind, number>> = {
  sofa: 820, sectional_sofa: 820, u_shaped_sofa: 820, sofa_bed: 850, chaise_lounge: 700, armchair: 800, recliner: 1000,
  ottoman: 420, coffee_table: 420, side_table: 550, tv_console: 500, rug: 10, floor_lamp: 1600, table_lamp: 500,
  pendant_light: 400, ceiling_fan: 350, plant: 1200, console_table: 780, bar_stool: 650, wall_tv: 850, piano: 1250, aircon: 300,
  dining_chair: 800, dining_set: 750, bed: 1000, bunk_bed: 1650, cot: 900, nightstand: 550, wardrobe: 2400, dresser: 900,
  office_chair: 1000, dressing_table: 1300, sideboard: 800, bookshelf: 1800, shoe_cabinet: 1000, tall_cabinet: 2400,
  shoe_bench: 450, coat_rack: 1750, altar_cabinet: 1100, kitchen_counter: 900, hob: 60, kitchen_sink: 900, fridge: 1800,
  washing_machine: 850, dryer: 850, microwave: 300, range_hood: 500, kitchen_island: 900, oven: 600, dishwasher: 820,
  wall_cabinet: 700, fridge_housing: 2400, drying_rack: 200, toilet: 780, basin: 850, vanity: 850, shower: 2000,
  bathtub: 560, water_heater: 600, shower_screen: 2000, towel_rail: 50, mirror_cabinet: 700, outdoor_set: 750,
  planter_box: 450, bay_window_seat: 500,
};

export function isLayoutBlock(item: Pick<DesignItem, "assetType">): boolean {
  return item.assetType === LAYOUT_BLOCK_ASSET_TYPE;
}

const KINDS: ReadonlySet<string> = new Set(PLAN_SYMBOL_KINDS);
const isPlanSymbolKind = (value: string): value is PlanSymbolKind => KINDS.has(value);

/** The block's symbol, from its product id; null for anything that is not a block. */
export function layoutBlockKind(item: Pick<DesignItem, "assetType" | "productId">): PlanSymbolKind | null {
  if (!isLayoutBlock(item) || !item.productId.startsWith(PRODUCT_PREFIX)) return null;
  const kind = item.productId.slice(PRODUCT_PREFIX.length);
  return isPlanSymbolKind(kind) ? kind : null;
}

/**
 * What collision checks need of a block, from its product id alone: it is a piece of furniture
 * that blocks others, overhead kinds only overhead ones. Null for anything that is not a block.
 */
export function layoutBlockCollisionProduct(
  productId: string
): { category: ProductCategory; placementRules: Pick<PlacementRules, "ceilingOnly"> } | null {
  const kind = layoutBlockKind({ assetType: LAYOUT_BLOCK_ASSET_TYPE, productId });
  return kind ? { category: layoutBlockCategory(kind), placementRules: { ceilingOnly: isOverheadLayoutBlockKind(kind) } } : null;
}

export function isOverheadLayoutBlockKind(kind: PlanSymbolKind): boolean {
  return OVERHEAD_KINDS.has(kind);
}

export function layoutBlockCategory(kind: PlanSymbolKind): ProductCategory {
  return CATEGORY_BY_KIND[kind] ?? "other";
}

export function layoutBlockTypicalSizeMm(kind: PlanSymbolKind) {
  const { typical } = PLAN_SYMBOLS[kind];
  return { w: Math.round(typical.width * 1000), d: Math.round(typical.depth * 1000), h: HEIGHT_MM[kind] ?? 750 };
}

const clampMm = (value: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, value)));

/** A size kept within the block limits, whole millimetres; anything not a number keeps the old size. */
export function clampLayoutBlockSizeMm(size: { w: number; d: number; h: number }, previous: { w: number; d: number; h: number }) {
  const pick = (value: number, fallback: number) => (Number.isFinite(value) && value > 0 ? value : fallback);
  const { minPlan, maxPlan, minHeight, maxHeight } = LAYOUT_BLOCK_LIMITS_MM;
  return {
    w: clampMm(pick(size.w, previous.w), minPlan, maxPlan),
    d: clampMm(pick(size.d, previous.d), minPlan, maxPlan),
    h: clampMm(pick(size.h, previous.h), minHeight, maxHeight),
  };
}

export type CreateLayoutBlockInput = {
  kind: PlanSymbolKind;
  instanceId: string;
  position: [number, number, number];
  rotationY?: number;
  roomId?: string;
};

/** A new block at its kind's typical size, named for its kind. */
export function createLayoutBlockItem({ kind, instanceId, position, rotationY = 0, roomId }: CreateLayoutBlockInput): DesignItem {
  const productId = `${PRODUCT_PREFIX}${kind}`;
  return {
    instanceId,
    productId,
    variantId: VARIANT_ID,
    assetType: LAYOUT_BLOCK_ASSET_TYPE,
    ...(roomId ? { roomId } : {}),
    position,
    rotationY,
    qty: 1,
    includeInCheckout: false,
    productSnapshot: {
      schemaVersion: 1,
      productId,
      variantId: VARIANT_ID,
      name: PLAN_SYMBOLS[kind].label,
      category: layoutBlockCategory(kind),
      dimensionsMm: layoutBlockTypicalSizeMm(kind),
      variantLabel: LAYOUT_BLOCK_VARIANT_LABEL,
      assets: {},
    },
  };
}

export type LayoutBlockPatch = { sizeMm?: { w: number; d: number; h: number }; name?: string };

/** The block with a new size and name; a product item comes back unchanged. */
export function updateLayoutBlock(item: DesignItem, patch: LayoutBlockPatch): DesignItem {
  const snapshot = item.productSnapshot;
  if (!isLayoutBlock(item) || !snapshot) return item;
  const name = patch.name?.trim().slice(0, 80);
  return {
    ...item,
    productSnapshot: {
      ...snapshot,
      dimensionsMm: patch.sizeMm ? clampLayoutBlockSizeMm(patch.sizeMm, snapshot.dimensionsMm) : snapshot.dimensionsMm,
      name: name || snapshot.name,
    },
  };
}
