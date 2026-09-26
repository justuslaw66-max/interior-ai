import { applyConsumerFloorPlanCorrection } from "./review";
import { compileCandidateFloorPlanDocumentV2,parseCandidate,parseReviewIssues,parseRenderedPages } from "./validation";
import { assertPhotoSourceFrames } from "../floor-plan-photo-frame";
import { assertExistingPhotoRegistration } from "../floor-plan-photo-review";

export function checkedConsumerCandidateCorrection(input:{body:Record<string,unknown>;current:{candidateJson:unknown;reviewIssuesJson:unknown;
  renderedPagesJson:unknown;sourceAsset:{id:string;sha256:string}};userId:string;note:string}) {
  const candidate=parseCandidate(input.body.candidate),current=compileCandidateFloorPlanDocumentV2(input.current.candidateJson).document;
  const next=compileCandidateFloorPlanDocumentV2(candidate).document;
  assertExistingPhotoRegistration(current,next);
  if(next.floors.some((floor)=>floor.calibrations.some((c)=>c.photoCorrection))) {
    assertPhotoSourceFrames(next,parseRenderedPages(input.current.renderedPagesJson));
  }
  const correction=applyConsumerFloorPlanCorrection({current,next,
    currentIssues:parseReviewIssues(input.current.reviewIssuesJson),submittedIssues:parseReviewIssues(input.body.reviewIssues),
    sourceId:input.current.sourceAsset.id,sourceSha256:input.current.sourceAsset.sha256,userId:input.userId,note:input.note});
  compileCandidateFloorPlanDocumentV2(correction.document);
  return correction;
}
