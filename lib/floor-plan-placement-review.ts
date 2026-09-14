import { CATALOG_ITEMS } from "@/lib/catalog";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { getCabinetPlanningDimsMm } from "@/features/cabinetry/designItemAdapters";
import type { DesignSnapshot } from "@/lib/room-types";
import type { CanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import { findCanonicalPlacementWall } from "@/lib/floor-plan-placement-boundaries";

/** The wall edit preserves every item. A collision requires a separate furniture transaction. */
export function reviewProposedPlacements(snapshot: DesignSnapshot, model: CanonicalFloorPlanRenderModel): string[] {
  const issues: string[] = [];
  for (const room of snapshot.rooms) {
    for (const item of room.items) {
      const product = CATALOG_ITEMS[item.productId];
      const dimensions = getCabinetPlanningDimsMm(item) ?? (product ? resolveCatalogVariant(product, item.variantId).dimsMm : undefined);
      if (!dimensions) {
        issues.push(`Placement ${item.instanceId}: dimensions unavailable; check it against the proposed walls. Its position is preserved.`);
        continue;
      }
      const scale = item.transform?.scale ?? [1, 1, 1];
      const wall = findCanonicalPlacementWall(model, room, item.position, item.rotationY ?? 0,
        { w: dimensions.w * scale[0], h: dimensions.h * scale[1], d: dimensions.d * scale[2] });
      if (wall) issues.push(`Placement ${item.instanceId} intersects proposed wall ${wall}. Move it in Furnish; its position is preserved.`);
    }
  }
  return issues;
}
