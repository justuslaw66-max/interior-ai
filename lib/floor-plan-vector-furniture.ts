import type { CompiledFloorPlanFloorV2 } from "@/lib/floor-plan-compiler-v2";
import type { PlanDrawingPrimitive } from "@/lib/floor-plan-vector-drawing";
import type { CatalogItemSchema, DimensionsMm } from "@/lib/catalog-schema";
import type { DesignItem, RoomSnapshot } from "@/lib/room-types";
import { resolveDesignItemVisualProduct } from "@/lib/design-item-product-snapshot";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { getCabinetPlanningDimsMm } from "@/features/cabinetry/designItemAdapters";
import { resolveSceneItemCanonicalTransform } from "@/lib/design-page-scene-domain";
import {
  furnitureSymbolPrimitives,
  furnitureTagPrimitive,
  type FurnitureSymbolPlacement,
} from "@/lib/floor-plan-vector-furniture-symbols";

export type PlanFurnitureDrawingSource = {
  rooms: readonly RoomSnapshot[];
  resolveDimensions?: (item: DesignItem, product: CatalogItemSchema) => DimensionsMm | null;
};

/** One line of the furniture schedule: every item drawn with this tag. */
export type FurnitureScheduleEntry = {
  tag: number;
  name: string;
  variant?: string;
  sizeMm: DimensionsMm;
  quantity: number;
  rooms: string[];
};

type PlacedFurniture = {
  placement: FurnitureSymbolPlacement;
  key: string;
  name: string;
  variant?: string;
  sizeMm: DimensionsMm;
  quantity: number;
  room: string;
};

function itemDimensions(item: DesignItem, product: CatalogItemSchema | null, source: PlanFurnitureDrawingSource) {
  const cabinet = getCabinetPlanningDimsMm(item);
  if (cabinet) return cabinet;
  if (!product) return null;
  if (source.resolveDimensions) return source.resolveDimensions(item, product);
  return item.configurationCode ? null : resolveCatalogVariant(product, item.variantId).dimsMm;
}

/** Resolves one item's footprint and place, or says why it can't be drawn. */
function placeItem(item: DesignItem, room: RoomSnapshot, source: PlanFurnitureDrawingSource): PlacedFurniture | string {
  const product = resolveDesignItemVisualProduct(item);
  const dimensions = itemDimensions(item, product, source);
  if (!dimensions || ![dimensions.w, dimensions.d, dimensions.h].every((value) => Number.isFinite(value) && value > 0)) {
    return `Furniture ${item.instanceId}: dimensions unresolved; outline omitted`;
  }
  const transform = resolveSceneItemCanonicalTransform({ item, roomOffset: room.planPosition ?? { x: 0, z: 0 }, roomFloorElevationMeters: 0 });
  const centre = { xMm: transform.worldPosition[0] * 1000, zMm: transform.worldPosition[2] * 1000 };
  if (![centre.xMm, centre.zMm, transform.rotationY].every(Number.isFinite)) {
    return `Furniture ${item.instanceId}: transform unresolved; outline omitted`;
  }
  const name = product?.title ?? item.productId;
  const variant = product?.variants.find((entry) => entry.id === item.variantId)?.label;
  return {
    placement: { id: item.instanceId, category: product?.category ?? "", name, widthMm: dimensions.w, depthMm: dimensions.d, centre, rotationY: transform.rotationY },
    key: [item.productId, item.variantId, item.configurationCode ?? "", dimensions.w, dimensions.d, dimensions.h].join("|"),
    name,
    variant,
    sizeMm: dimensions,
    quantity: item.qty && item.qty > 0 ? item.qty : 1,
    room: room.name,
  };
}

/** The footprint, painted paper-white with no line of its own: the item's single editable path. */
function footprintPrimitive({ placement }: PlacedFurniture): PlanDrawingPrimitive {
  const cos = Math.cos(placement.rotationY), sin = Math.sin(placement.rotationY);
  const { xMm: x, zMm: z } = placement.centre, width = placement.widthMm, depth = placement.depthMm;
  const points = [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]]
    .map(([dx, dz]) => ({ xMm: x + cos * dx + sin * dz, zMm: z - sin * dx + cos * dz }));
  return { id: `furniture:${placement.id}:outline`, kind: "path", fill: false, paperFill: true, paperStrokeMm: 0, points, role: "furniture",
    path: points.map((point, index) => `${index ? "L" : "M"} ${Number(point.xMm.toFixed(6))} ${Number(point.zMm.toFixed(6))}`).join(" ") + " Z" };
}

/** Same product, variant and size share a tag; tags count up in drawing order. */
function scheduleFor(placed: readonly PlacedFurniture[]) {
  const entries = new Map<string, FurnitureScheduleEntry>();
  const tags = new Map<string, number>();
  for (const item of placed) {
    const existing = entries.get(item.key);
    if (existing) {
      existing.quantity += item.quantity;
      if (!existing.rooms.includes(item.room)) existing.rooms.push(item.room);
      continue;
    }
    const tag = entries.size + 1;
    tags.set(item.key, tag);
    entries.set(item.key, { tag, name: item.name, variant: item.variant, sizeMm: item.sizeMm, quantity: item.quantity, rooms: [item.room] });
  }
  return { schedule: Array.from(entries.values()), tags };
}

/**
 * Each placed item as its plan symbol in world millimetres: a paper footprint, the symbol's
 * own editable paths, and a numbered tag keyed to the furniture schedule.
 */
export function buildFloorPlanFurnitureDrawing(floor: CompiledFloorPlanFloorV2, source: PlanFurnitureDrawingSource) {
  const unsupported: string[] = [];
  const placed: PlacedFurniture[] = [];
  const roomIds = new Set(floor.rooms.map(({ id }) => id));
  for (const room of source.rooms) {
    if (!roomIds.has(room.id)) continue;
    for (const item of room.items) {
      const result = placeItem(item, room, source);
      if (typeof result === "string") unsupported.push(result);
      else placed.push(result);
    }
  }
  const { schedule, tags } = scheduleFor(placed);
  const primitives: PlanDrawingPrimitive[] = placed.flatMap((item) => [footprintPrimitive(item), ...furnitureSymbolPrimitives(item.placement)]);
  // Tags last, so no neighbour's paper covers one.
  primitives.push(...placed.map((item) => furnitureTagPrimitive(item.placement, tags.get(item.key) ?? 0)));
  return { primitives, unsupported, schedule };
}
