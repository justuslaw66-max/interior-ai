import type { FloorPlanDocumentV2, FloorPlanSourceCalibrationV2, FloorPlanSourceMeasurementV2 } from "./floor-plan-document-v2";
import { proposePhotoCalibration } from "./floor-plan-photo-calibration";
import { photoReviewDraftSchema,type PhotoConstraints,type PhotoReviewDraft } from "./floor-plan-photo-constraints";
import { mapPhotoPoint } from "./floor-plan-photo-math";

/** Only explicit acceptance creates registration. Proposing, adjusting and cancelling leave the document intact. */
export function applyPhotoCalibration(input:{document:FloorPlanDocumentV2;floorId:string;sourceId:string;pageNumber:number;
  constraints:PhotoConstraints;expectedRevisionId:string;at:string}):FloorPlanDocumentV2 {
  if(input.document.revisionId!==input.expectedRevisionId) throw new Error("The review changed. Recheck the correction against the latest draft.");
  const floor=input.document.floors.find((f)=>f.id===input.floorId);
  if(!floor) throw new Error("Choose the source floor first.");
  if(floor.walls.length || floor.rooms.length || floor.openings.length || floor.vertices.length) {
    throw new Error("Keep the existing geometry and corrections. Start a new source review before changing its photo correction.");
  }
  const proposed=proposePhotoCalibration(input.constraints);
  if(!proposed.correction) throw new Error(proposed.kind==="affine_sufficient"?
    "Perspective correction is not supported as necessary by these checks. Review the ordinary scale and endpoint associations.":
    "The independent source measurements still conflict. Correct the highlighted endpoints or readings first.");
  const measurements=input.constraints.measurements;
  const primary=measurements.find((m)=>m.use==="fit");
  if(!primary) throw new Error("Choose fitting measurements first.");
  const a=primary.first,b=primary.second;
  const cross=(p:{x:number;y:number})=>Math.abs((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x));
  const third=measurements.flatMap((m)=>[m.first,m.second]).sort((x,y)=>cross(y)-cross(x))[0];
  if(cross(third)<1) throw new Error("Choose measurements in another direction.");
  const measurement=(m:typeof primary):FloorPlanSourceMeasurementV2=>({id:m.id,firstPx:m.first,secondPx:m.second,
    confirmedLengthMm:m.lengthMm,inputUnit:"mm",sourceQuality:m.quality,confirmedAt:input.at});
  const calibration:FloorPlanSourceCalibrationV2={id:`photo-${input.sourceId}-${input.pageNumber}`,sourceId:input.sourceId,pageNumber:input.pageNumber,
    imageWidthPx:input.constraints.widthPx,imageHeightPx:input.constraints.heightPx,photoCorrection:proposed.correction,
    controlPoints:[a,b,third].map((sourcePx)=> {const p=mapPhotoPoint(proposed.metricMatrix,sourcePx);
      return {sourcePx:{...sourcePx},planMm:{xMm:Math.round(p.x),zMm:Math.round(p.y)}};}),
    primaryMeasurement:measurement(primary),independentMeasurements:measurements.filter((m)=>m.use==="check").map(measurement)};
  const next=structuredClone(input.document), target=next.floors.find((f)=>f.id===input.floorId);
  if(!target) throw new Error("The source floor changed.");
  target.calibrations=[...target.calibrations.filter((c)=>c.sourceId!==input.sourceId||c.pageNumber!==input.pageNumber),calibration];
  target.photoReviewDrafts=target.photoReviewDrafts?.filter((d)=>d.sourceId!==input.sourceId||d.pageNumber!==input.pageNumber);
  next.revisionId=`photo-review-${input.at.replace(/[^0-9]/g,"")}`;
  return next;
}

export function updatePhotoReviewDraft(document:FloorPlanDocumentV2,floorId:string,value:PhotoReviewDraft):FloorPlanDocumentV2 {
  const draft=photoReviewDraftSchema.parse(value),next=structuredClone(document),floor=next.floors.find((f)=>f.id===floorId);
  if(!floor)throw new Error("Choose an existing floor for source review.");
  floor.photoReviewDrafts=[...(floor.photoReviewDrafts??[]).filter((d)=>d.sourceId!==draft.sourceId||d.pageNumber!==draft.pageNumber),draft];
  next.revisionId=`photo-draft-${crypto.randomUUID()}`;
  return next;
}

/** Geometry edits may continue, but changing their source registration needs a separate recomputation. */
export function assertExistingPhotoRegistration(current:FloorPlanDocumentV2,next:FloorPlanDocumentV2) {
  for(const floor of current.floors) {
    if(!floor.vertices.length&&!floor.walls.length&&!floor.openings.length&&!floor.rooms.length)continue;
    const updated=next.floors.find(f=>f.id===floor.id);
    const pages=new Set([...floor.calibrations,...(updated?.calibrations??[])].filter(c=>c.photoCorrection).map(c=>`${c.sourceId}:${c.pageNumber}`));
    const registration=(calibrations:FloorPlanSourceCalibrationV2[])=>calibrations.filter(c=>pages.has(`${c.sourceId}:${c.pageNumber}`)).map(c=>
      ({sourceId:c.sourceId,pageNumber:c.pageNumber,controlPoints:c.controlPoints,photoCorrection:c.photoCorrection}));
    if(JSON.stringify(registration(floor.calibrations))!==JSON.stringify(registration(updated?.calibrations??[]))) {
      throw new Error("The existing geometry uses this photo registration. Create a separate corrected review to recompute it while preserving your edits.");
    }
  }
}
