import type { FloorPlanTopologyMutationV2 } from "@/lib/floor-plan-topology-mutations";

export function assertFloorPlanImportReviewMutationPermission(
  operation: FloorPlanTopologyMutationV2,
  reviewMode: "consumer" | "pro" = "consumer"
): void {
  if (
    operation.kind === "update_opening" &&
    operation.reviewedEvidenceOverride &&
    reviewMode !== "pro"
  ) {
    throw new Error("Only Pro review may authorize an opening evidence override.");
  }
}
