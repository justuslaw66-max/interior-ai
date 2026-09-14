import type { CompiledFloorPlanFloorV2 } from "@/lib/floor-plan-compiler-v2";
import type { PlanDrawingPrimitive } from "@/lib/floor-plan-vector-drawing";
import type { CatalogItemSchema, DimensionsMm } from "@/lib/catalog-schema";
import type { DesignItem, RoomSnapshot } from "@/lib/room-types";
import { resolveDesignItemVisualProduct } from "@/lib/design-item-product-snapshot";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { getCabinetPlanningDimsMm } from "@/features/cabinetry/designItemAdapters";
import { resolveSceneItemCanonicalTransform } from "@/lib/design-page-scene-domain";

export type PlanFurnitureDrawingSource = {
  rooms: readonly RoomSnapshot[];
  resolveDimensions?: (item: DesignItem, product: CatalogItemSchema) => DimensionsMm | null;
};

/** Project the same per-item plan outlines in world millimetres; each remains its own editable path. */
export function buildFloorPlanFurnitureDrawing(floor: CompiledFloorPlanFloorV2, source: PlanFurnitureDrawingSource) {
  const primitives: PlanDrawingPrimitive[] = [], unsupported: string[] = [];
  const roomIds = new Set(floor.rooms.map(({ id }) => id));
  for (const room of source.rooms) {
    if (!roomIds.has(room.id)) continue;
    for (const item of room.items) {
      const product = resolveDesignItemVisualProduct(item);
      const dimensions = getCabinetPlanningDimsMm(item) ?? (product ? source.resolveDimensions
        ? source.resolveDimensions(item, product) : item.configurationCode ? null : resolveCatalogVariant(product, item.variantId).dimsMm : null);
      if (!dimensions || ![dimensions.w, dimensions.d, dimensions.h].every((value) => Number.isFinite(value) && value > 0)) {
        unsupported.push(`Furniture ${item.instanceId}: dimensions unresolved; outline omitted`); continue;
      }
      const transform = resolveSceneItemCanonicalTransform({ item, roomOffset: room.planPosition ?? { x: 0, z: 0 }, roomFloorElevationMeters: 0 });
      const cos = Math.cos(transform.rotationY), sin = Math.sin(transform.rotationY), width = dimensions.w, depth = dimensions.d;
      const x = transform.worldPosition[0] * 1000, z = transform.worldPosition[2] * 1000;
      const points = [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]]
        .map(([dx, dz]) => ({ xMm: x + cos * dx + sin * dz, zMm: z - sin * dx + cos * dz }));
      if (![width, depth].every((value) => Number.isFinite(value) && value > 0) || points.some((point) => !Number.isFinite(point.xMm) || !Number.isFinite(point.zMm))) {
        unsupported.push(`Furniture ${item.instanceId}: transform unresolved; outline omitted`); continue;
      }
      primitives.push({ id: `furniture:${item.instanceId}:outline`, kind: "path", fill: false, points, role: "furniture",
        path: points.map((point, index) => `${index ? "L" : "M"} ${Number(point.xMm.toFixed(6))} ${Number(point.zMm.toFixed(6))}`).join(" ") + " Z" });
    }
  }
  return { primitives, unsupported };
}
