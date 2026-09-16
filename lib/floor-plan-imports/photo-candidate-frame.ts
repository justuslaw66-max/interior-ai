import type { FloorPlanDocumentV2,FloorPlanSourceCalibrationV2,FloorPlanEntityProvenanceV2 } from "../floor-plan-document-v2";
import { inversePhotoMatrix,mapPhotoPoint } from "../floor-plan-photo-math";
import { buildFloorPlanSourceProjection } from "./source-projection";

/** Rebind fresh derivative extraction to original source pixels; canonical metric geometry is unchanged. */
export function restorePhotoCandidateFrame(document:FloorPlanDocumentV2,accepted:FloorPlanSourceCalibrationV2,original:FloorPlanDocumentV2) {
  const correction=accepted.photoCorrection;if(!correction)throw new Error("Accept the photo correction first.");
  const inverse=inversePhotoMatrix(correction.originalToCorrected),next=structuredClone(document);
  const source=original.sources.find(s=>s.id===accepted.sourceId);if(!source)throw new Error("Original source is missing.");
  next.sources=[structuredClone(source)];
  const point=(p:{x:number;y:number})=>mapPhotoPoint(inverse,p);
  const provenance=(value:FloorPlanEntityProvenanceV2)=>{
    for(const evidence of value.evidence){evidence.sourceId=source.id;
      if(evidence.calibrationId)evidence.calibrationId=accepted.id;
      if(evidence.sourceAnchors)for(const anchor of evidence.sourceAnchors)anchor.sourcePx=point(anchor.sourcePx);
      if(evidence.cropPx){const c=evidence.cropPx,corners=[point({x:c.xPx,y:c.yPx}),point({x:c.xPx+c.widthPx,y:c.yPx}),
        point({x:c.xPx,y:c.yPx+c.heightPx}),point({x:c.xPx+c.widthPx,y:c.yPx+c.heightPx})];
        const x=Math.max(0,Math.min(...corners.map(p=>p.x))),y=Math.max(0,Math.min(...corners.map(p=>p.y)));
        evidence.cropPx={xPx:x,yPx:y,widthPx:Math.min(accepted.imageWidthPx,Math.max(...corners.map(p=>p.x)))-x,
          heightPx:Math.min(accepted.imageHeightPx,Math.max(...corners.map(p=>p.y)))-y};}
    }
  };
  for(const floor of next.floors) {
    const extracted=floor.calibrations[0],projection=extracted?buildFloorPlanSourceProjection(extracted):null;
    if(!projection)throw new Error("Recomputed source registration is missing.");
    floor.calibrations=[{...structuredClone(accepted),controlPoints:extracted.controlPoints.map(control=>({...control,sourcePx:point(control.sourcePx)})),
      // A third noncollinear point preserves the full corrected image registration.
      rmsErrorPx:undefined}];
    const bottom={x:0,y:correction.correctedHeightPx},plan=projection.unproject(bottom);
    if(!plan)throw new Error("Recomputed registration is singular.");
    floor.calibrations[0].controlPoints.push({sourcePx:point(bottom),planMm:{xMm:Math.round(plan.xMm),zMm:Math.round(plan.zMm)}});
    for(const entity of [...floor.vertices,...floor.walls,...floor.rooms,...floor.openings,...floor.structures,...floor.dimensions,...floor.annotations])provenance(entity.provenance);
    for(const property of Object.values(floor.defaults))provenance(property.provenance);
    if(floor.verticalEvidence)for(const property of Object.values(floor.verticalEvidence))provenance(property.provenance);
    // Preserve original review artwork and consumer text corrections exactly, including curved source marks.
    floor.annotations=[...floor.annotations.filter(a=>a.scope!=="reference"),
      ...structuredClone(original.floors.flatMap(f=>f.annotations.filter(a=>a.scope==="reference")))];
  }
  return next;
}
