import type { FloorPlanReviewIssue } from "@/lib/floor-plan-imports/types";

export function createImportReviewMutationMetadata(
  floorId: string,
  property: string,
  note: string
) {
  const timestamp = Date.now().toString(36);
  return {
    mutationId: `import-review:${floorId}:${property}:${timestamp}`,
    nextRevisionId: `import-review-revision:${timestamp}:${property}`,
    actorId: "consumer-import-review",
    mutatedAt: new Date().toISOString(),
    note,
  };
}

export const photoReviewRequired=(issues:FloorPlanReviewIssue[])=>issues.some(i=>i.code==="photo_recomputed_boundaries_review"&&!i.resolved);
export function importReviewSummary(input:{needsRoomRecovery:boolean;needsScaleRecovery:boolean;unresolvedCritical:FloorPlanReviewIssue[];photo:boolean}) {
  if(input.photo)return {title:"Check the corrected outline",description:"The photo correction uses your confirmed measurements. Recovered outlines can be incomplete: check missing walls, connections and separate doors and windows before creating a design."};
  if(input.needsRoomRecovery)return {title:"AI needs a clearer wall outline",description:"The drawing is visible, but the AI could not safely close the room walls. Nothing has been created or added to your current design."};
  if(input.needsScaleRecovery)return {title:"Set scale",description:"The rooms are visible, but the AI needs one printed measurement to make your floor plan the right size."};
  return {title:input.unresolvedCritical.length?"Check your floor plan":"Your floor plan is ready for a final check",description:"AI read your floor plan. Check the preview once, then continue to create a separate editable 2D and 3D design."};
}
