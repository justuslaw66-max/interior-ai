import type { PageSemanticEvidence,SemanticBoundingBox,SemanticRatioPoint } from "./deterministic-evidence";
import type { PhotoCorrection } from "../floor-plan-photo-constraints";
import { mapPhotoPoint } from "../floor-plan-photo-math";

/** Transform retained hints, not accepted walls. Fresh linework still has to support every proposal. */
export function correctedPhotoObservations(semantics:PageSemanticEvidence,correction:PhotoCorrection):PageSemanticEvidence {
  const {widthPx,heightPx}=correction.constraints;
  const point=(p:SemanticRatioPoint):SemanticRatioPoint=>{
    const q=mapPhotoPoint(correction.originalToCorrected,{x:p.xRatio*widthPx,y:p.yRatio*heightPx});
    return {xRatio:q.x/correction.correctedWidthPx,yRatio:q.y/correction.correctedHeightPx};
  };
  const bbox=(b:SemanticBoundingBox):SemanticBoundingBox=>{
    const corners=[point({xRatio:b.leftRatio,yRatio:b.topRatio}),point({xRatio:b.rightRatio,yRatio:b.topRatio}),
      point({xRatio:b.rightRatio,yRatio:b.bottomRatio}),point({xRatio:b.leftRatio,yRatio:b.bottomRatio})];
    return {leftRatio:Math.min(...corners.map(p=>p.xRatio)),rightRatio:Math.max(...corners.map(p=>p.xRatio)),
      topRatio:Math.min(...corners.map(p=>p.yRatio)),bottomRatio:Math.max(...corners.map(p=>p.yRatio))};
  };
  const located=<T extends {centerXRatio:number;centerYRatio:number;bbox?:SemanticBoundingBox}>(value:T):T=>{
    const p=point({xRatio:value.centerXRatio,yRatio:value.centerYRatio});
    return {...value,centerXRatio:p.xRatio,centerYRatio:p.yRatio,...(value.bbox?{bbox:bbox(value.bbox)}:{})};
  };
  return {...semantics,planRegion:semantics.planRegion?{...semantics.planRegion,bbox:bbox(semantics.planRegion.bbox)}:null,
    roomLabels:semantics.roomLabels.map(located),fixtureSymbols:semantics.fixtureSymbols?.map(located),
    roomBoundaries:semantics.roomBoundaries?.map(room=>({...room,points:room.points.map(point)})),
    dimensionLabels:semantics.dimensionLabels.map(d=>({...located(d),extensionStart:d.extensionStart?point(d.extensionStart):undefined,
      extensionEnd:d.extensionEnd?point(d.extensionEnd):undefined})),
    openingSymbols:semantics.openingSymbols.map(o=>({...located(o),spanStart:o.spanStart?point(o.spanStart):undefined,spanEnd:o.spanEnd?point(o.spanEnd):undefined})),
    entrance:semantics.entrance?located(semantics.entrance):undefined};
}
