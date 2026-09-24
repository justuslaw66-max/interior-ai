import type { FloorPlanImportJobRecord } from "./types";
import type { FloorPlanAdapterContext,FloorPlanStageResult } from "./source-adapter";

/** Retain source observations as a private, retention-managed derivative, never as public geometry. */
export async function retainReviewExtraction(result:FloorPlanStageResult,context:FloorPlanAdapterContext) {
  const assetId=await context.store.putDerivative({jobId:context.jobId,fileName:"source-review-observations.json",mimeType:"application/json",
    bytes:new TextEncoder().encode(JSON.stringify(result.candidate))});
  return {...result,sourceManifest:{...result.sourceManifest,reviewExtractionAssetId:assetId}};
}

export function stageResultFromJob(job:FloorPlanImportJobRecord):FloorPlanStageResult {
  if(!job.candidate)throw new Error(`Floor-plan import ${job.id} has no persisted candidate at ${job.status}`);
  return {candidate:job.candidate,sourceManifest:job.sourceManifest,reviewIssues:job.reviewIssues};
}
