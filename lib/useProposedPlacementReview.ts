import { useMemo } from "react";
import type { DesignSnapshot } from "@/lib/room-types";
import { compileCanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import { currentProposedPlacementReview } from "@/lib/floor-plan-placement-review";

export function useProposedPlacementReview(snapshot: DesignSnapshot) {
  const document = snapshot.floorPlan?.proposal ? snapshot.floorPlan.canonicalDocument : undefined;
  // Furniture edits reuse the same compiled topology; canonical geometry edits rebuild it.
  const model = useMemo(() => document ? compileCanonicalFloorPlanRenderModel(document) : undefined, [document]);
  return useMemo(() => model ? currentProposedPlacementReview(snapshot, model) : snapshot.floorPlan?.proposal, [snapshot, model]);
}
