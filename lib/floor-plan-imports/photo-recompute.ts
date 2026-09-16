import { createHash } from "node:crypto";
import type { FloorPlanDocumentV2,FloorPlanSourceCalibrationV2 } from "../floor-plan-document-v2";
import { mapPhotoPoint,photoDistance,inversePhotoMatrix,multiplyPhotoMatrices } from "../floor-plan-photo-math";
import { proposePhotoCalibration } from "../floor-plan-photo-calibration";
import { assertPhotoSourceFrames } from "../floor-plan-photo-frame";
import type { FloorPlanAdapterContext,FloorPlanSourceAdapter,StoredFloorPlanSource } from "./source-adapter";
import type { FloorPlanRenderedPage } from "./types";
import { asEnvelope,type ExtractionEnvelope } from "./pdf-raster-evidence";
import { correctedPhotoPng } from "./photo-preview";
import { correctedPhotoObservations } from "./photo-observations";
import { restorePhotoCandidateFrame } from "./photo-candidate-frame";
import { compileCandidateFloorPlanDocumentV2 } from "./validation";
import { reconcileFloorPlanImportReadinessIssues } from "./readiness";
import { mergePhotoReferenceReview } from "./photo-reference-review";

function reviewedPhotoScale(calibration:FloorPlanSourceCalibrationV2) {
  const c=calibration.photoCorrection;if(!c)throw new Error("Accept a supported photo correction first.");
  const proposal=proposePhotoCalibration(c.constraints),primary=c.constraints.measurements.find(m=>m.use==="fit");
  if(proposal.kind!=="supported"||!primary)throw new Error("Photo measurements are not supported.");
  const point=(p:{x:number;y:number})=>mapPhotoPoint(c.originalToCorrected,p),metric=(p:{x:number;y:number})=>mapPhotoPoint(proposal.metricMatrix,p);
  const millimetresPerPixel=photoDistance(metric(primary.first),metric(primary.second))/photoDistance(point(primary.first),point(primary.second));
  const evidence=c.constraints.measurements.map(m=>{
    const start=point(m.first),end=point(m.second),observedLengthPx=photoDistance(start,end);
    return {valueMm:m.lengthMm,observedLengthPx,residualMm:observedLengthPx*millimetresPerPixel-m.lengthMm,segmentId:m.id,start,end};
  });
  return {pageNumber:calibration.pageNumber,millimetresPerPixel,dimensionCount:evidence.length,
    rmsResidualMm:Math.sqrt(evidence.reduce((sum,e)=>sum+e.residualMm**2,0)/evidence.length),confidence:0.8,evidence};
}

export async function recomputeCorrectedPhoto(input:{original:FloorPlanDocumentV2;calibration:FloorPlanSourceCalibrationV2;
  source:StoredFloorPlanSource;pages:FloorPlanRenderedPage[];observations:ExtractionEnvelope;context:FloorPlanAdapterContext;adapter:FloorPlanSourceAdapter}) {
  const {calibration,context,adapter}=input,correction=calibration.photoCorrection;
  assertPhotoSourceFrames({...input.original,floors:input.original.floors.map(f=>({...f,calibrations:[calibration]}))},input.pages);
  if(!correction||!context.localOnly)throw new Error("Correction recomputation must run locally after explicit acceptance.");
  const page=input.pages.find(p=>p.pageNumber===calibration.pageNumber),prior=input.observations.pages.find(p=>p.pageNumber===calibration.pageNumber);
  if(!page||!prior||input.observations.source.sha256!==input.source.sha256)throw new Error("Retained source observations do not match this image.");
  const sourceAsset=await context.store.readDerivative?.(page.assetKey);
  if(!sourceAsset)throw new Error("The original preview is no longer available.");
  const bytes=await correctedPhotoPng(sourceAsset.bytes,correction);
  const assetKey=await context.store.putDerivative({jobId:context.jobId,fileName:"corrected-source.png",mimeType:"image/png",bytes});
  const correctedPage={pageNumber:page.pageNumber,widthPx:correction.correctedWidthPx,heightPx:correction.correctedHeightPx,assetKey};
  const derivativeSource={...input.source,bytes,byteLength:bytes.length,mimeType:"image/png",fileName:"corrected-source.png",sha256:createHash("sha256").update(bytes).digest("hex")};
  let result=await adapter.extract(derivativeSource,[correctedPage],context);
  const envelope=asEnvelope(result.candidate),detected=envelope.pages[0];
  if(!detected)throw new Error("Local extraction did not return the corrected page.");
  const freshDimensions=detected.semantics.dimensionLabels;
  detected.originalPixelMapping=multiplyPhotoMatrices(correction.constraints.originalFrame?.renderedToOriginal??[1,0,0,0,1,0,0,0,1],inversePhotoMatrix(correction.originalToCorrected));
  detected.semantics=correctedPhotoObservations(prior.semantics,correction);
  // Explicitly reviewed source readings drive calibration. Fresh OCR remains diagnostic, never silently authoritative.
  result.sourceManifest={...result.sourceManifest,photoReview:{kind:"consumer_confirmed_photo_correction",
    originalSha256:input.source.sha256,calibrationId:calibration.id,freshCorrectedDimensionCount:freshDimensions.length,
    retainedObservations:true,newRecognitionRequests:0}};
  envelope.catalogDraftMatch=null;
  // The solver still registers source opening/tick evidence locally before the reviewed scale is used.
  result=await adapter.solveScale(result,context);
  const solved=asEnvelope(result.candidate),scale=reviewedPhotoScale(calibration);solved.scale=scale;solved.scales=[scale];
  result=await adapter.buildTopology(result,context);
  const built=compileCandidateFloorPlanDocumentV2(result.candidate).document;
  const document=restorePhotoCandidateFrame(built,calibration,input.original);
  for(const floor of document.floors)floor.annotations=mergePhotoReferenceReview(floor.annotations,solved.pages[0],calibration,scale.millimetresPerPixel);
  compileCandidateFloorPlanDocumentV2(document);
  const issues=reconcileFloorPlanImportReadinessIssues({document,sourceManifest:result.sourceManifest,reviewIssues:[...result.reviewIssues,
    {id:"photo-recomputed-boundaries-review",code:"photo_recomputed_boundaries_review",severity:"critical",resolved:false,
      message:"Review the source-supported subset, missing boundaries and separate doorways. Calibration is consumer-confirmed; this is not complete apartment recognition."}]});
  return {document,reviewIssues:issues,sourceManifest:result.sourceManifest,correctedPage};
}
