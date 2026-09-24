import { resolveDesignItemVisualProduct } from "@/lib/design-item-product-snapshot";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { getCabinetPlanningDimsMm } from "@/features/cabinetry/designItemAdapters";
import type { DesignSnapshot } from "@/lib/room-types";
import type { CanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import { findCanonicalPlacementWall } from "@/lib/floor-plan-placement-boundaries";
import { getRotatedFootprint } from "@/lib/design-page-utils";
import { isFootprintInsideRoomPolygon } from "@/lib/design-page-geometry";

/** The wall edit preserves every item. A collision requires a separate furniture transaction. */
export function reviewProposedPlacements(snapshot: DesignSnapshot, model: CanonicalFloorPlanRenderModel): string[] {
  const issues: string[] = [];
  for (const room of snapshot.rooms) {
    for (const item of room.items) {
      const product = resolveDesignItemVisualProduct(item);
      const dimensions = getCabinetPlanningDimsMm(item) ?? (product ? resolveCatalogVariant(product, item.variantId).dimsMm : undefined);
      if (!dimensions) {
        issues.push(`Placement ${item.instanceId}: dimensions unavailable; check it against the proposed walls. Its position is preserved.`);
        continue;
      }
      const scale = item.transform?.scale ?? [1, 1, 1];
      const scaled = { w: dimensions.w * scale[0], h: dimensions.h * scale[1], d: dimensions.d * scale[2] };
      const wall = findCanonicalPlacementWall(model, room, item.position, item.rotationY ?? 0,
        scaled);
      if (wall) issues.push(`Placement ${item.instanceId} intersects proposed wall ${wall}. Move it in Furnish; its position is preserved.`);
      const [width, depth] = getRotatedFootprint(scaled.w / 1000, scaled.d / 1000, item.rotationY ?? 0);
      if (room.planPolygon?.length && !isFootprintInsideRoomPolygon(item.position[0], item.position[2], width / 2, depth / 2, room.planPolygon, room.planHoles)) {
        issues.push(`Placement ${item.instanceId} extends outside ${room.name} or into a void. Move it in Furnish; its position is preserved.`);
      }
    }
  }
  return issues;
}

/** Stored placement notes describe earlier edits; the inspector shows the current placement assessment. */
export function currentProposedPlacementReview(snapshot: DesignSnapshot, model: CanonicalFloorPlanRenderModel) {
  const proposal = snapshot.floorPlan?.proposal;
  if (!proposal) return undefined;
  return { ...proposal, reviewIssues: [...proposal.reviewIssues.filter((issue) => !issue.startsWith("Placement ")),
    ...reviewProposedPlacements(snapshot, model)] };
}
