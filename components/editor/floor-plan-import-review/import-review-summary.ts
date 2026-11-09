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

/** The import's own reading could not be built into a plan (`addCanonicalDocumentIssue`), most often for its size. */
const unbuiltReading=(issue:FloorPlanReviewIssue)=>issue.code==="canonical_document_invalid"&&!issue.resolved;
/** `parseCandidate`'s refusal: the plan is over the cap on a candidate's size. */
const overSizeCap=(issue:FloorPlanReviewIssue)=>unbuiltReading(issue)&&/larger than \d+ MB/.test(issue.message);

/**
 * What the recovery box says, and whether rerunning detection can help. A plan over the size cap is not something to
 * correct in the review, and a rerun reads it the same way, so it says so and offers another file instead.
 */
export function importRecoveryNotice(input:{needsRoomRecovery:boolean;unresolvedCritical:FloorPlanReviewIssue[];prerequisite?:string}) {
  if(input.needsRoomRecovery)return {title:"For the fastest result, upload the original floor plan",retry:true,
    description:"Check the scale and visible wall outlines. You can save an incomplete draft, retry detection, or choose another source. Manually traced rooms remain consumer-authored corrections."};
  if(input.unresolvedCritical.some(overSizeCap))return {title:"This floor plan has too much drawing detail to import",retry:false,
    description:"Its drawing is over the size an editable plan can hold, and rerunning detection reads it the same way. Choose another file, such as a single-page plan without a title block or notes."};
  if(input.unresolvedCritical.some(unbuiltReading))return {title:"AI couldn't build this floor plan",retry:true,
    description:"Its reading of the drawing couldn't be made into an editable plan. Rerun AI detection, or choose another file."};
  return {title:"One small correction is needed",retry:true,
    description:input.prerequisite??"Open the correction tools and adjust the highlighted part of the plan."};
}
