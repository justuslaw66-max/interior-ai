import type { FloorPlanAddressTransform } from "@/lib/floor-plan-imports/types";
import {
  applyFloorPlanAddressTransformV2,
  canonicalFloorPlanToDesignSnapshot,
  type CanonicalDesignAdapterResult,
} from "@/lib/floor-plan-legacy-adapters";
import type { DesignSnapshot } from "@/lib/room-types";

export const FLOOR_PLAN_CONSUMER_ORIENTATION_OPTIONS: ReadonlyArray<{
  value: FloorPlanAddressTransform;
  label: string;
}> = [
  { value: "normal", label: "As published" },
  { value: "mirror_x", label: "Mirror left/right" },
  { value: "mirror_z", label: "Mirror top/bottom" },
  { value: "rotate_90", label: "Rotate 90°" },
  { value: "rotate_180", label: "Rotate 180°" },
  { value: "rotate_270", label: "Rotate 270°" },
  { value: "mirror_x_rotate_90", label: "Mirror + rotate 90°" },
  { value: "mirror_x_rotate_270", label: "Mirror + rotate 270°" },
];

export function inverseFloorPlanAddressTransform(
  transform: FloorPlanAddressTransform
): FloorPlanAddressTransform {
  if (transform === "rotate_90") return "rotate_270";
  if (transform === "rotate_270") return "rotate_90";
  return transform;
}

/**
 * Reprojects the canonical source instead of rotating legacy room rectangles.
 * Stable room/wall IDs let the adapter carry furniture, finishes and views.
 */
export function reorientConsumerFloorPlanDesign(
  snapshot: DesignSnapshot,
  targetTransform: FloorPlanAddressTransform
): CanonicalDesignAdapterResult {
  const floorPlan = snapshot.floorPlan;
  if (!floorPlan?.canonicalDocument) {
    throw new Error("This design does not contain a canonical floor plan");
  }
  const currentTransform = floorPlan.addressTransform ?? "normal";
  const authoredDocument = applyFloorPlanAddressTransformV2(
    floorPlan.canonicalDocument,
    inverseFloorPlanAddressTransform(currentTransform)
  );
  const result = canonicalFloorPlanToDesignSnapshot(authoredDocument, {
    baseSnapshot: snapshot,
    title: snapshot.title,
    addressTransform: targetTransform,
    addressBinding: floorPlan.addressBinding,
    sourceJobId: floorPlan.sourceJobId,
    sourceAssetSha256: floorPlan.sourceAssetSha256,
    sourceRevisionGeometryHash: floorPlan.sourceRevisionGeometryHash,
  });
  result.snapshot.floorPlan = {
    ...result.snapshot.floorPlan!,
    orientationConfirmed: true,
  };
  return result;
}
