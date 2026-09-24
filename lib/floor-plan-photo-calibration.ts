import { originalPhotoPoint,parsePhotoConstraints, type PhotoConstraints, type PhotoCorrection } from "./floor-plan-photo-constraints";
import { fitPhotoMetric } from "./floor-plan-photo-fit";
import { inversePhotoMatrix, mapPhotoPoint, multiplyPhotoMatrices, photoCorners, photoDistance, type PhotoMatrix } from "./floor-plan-photo-math";

/** Test both endpoints through the inverse map in original pixels, including all held-out observations. */
export function photoCalibrationResiduals(matrix:PhotoMatrix,input:PhotoConstraints) {
  const inverse=inversePhotoMatrix(matrix);
  return input.measurements.map((m)=> {
    const a=mapPhotoPoint(matrix,m.first), b=mapPhotoPoint(matrix,m.second), length=photoDistance(a,b), ratio=m.lengthMm/length;
    const expectedB=mapPhotoPoint(inverse,{x:a.x+(b.x-a.x)*ratio,y:a.y+(b.y-a.y)*ratio});
    const expectedA=mapPhotoPoint(inverse,{x:b.x+(a.x-b.x)*ratio,y:b.y+(a.y-b.y)*ratio});
    const original=(p:{x:number;y:number})=>originalPhotoPoint(input,p);
    const residualPx=Math.max(photoDistance(original(expectedA),original(m.first)),photoDistance(original(expectedB),original(m.second))), tolerancePx=m.quality==="clean"?2:3;
    return {id:m.id,use:m.use,lengthMm:length,residualPx,tolerancePx,passes:Number.isFinite(residualPx)&&residualPx<=tolerancePx};
  });
}

function correctionFromMetric(matrix:PhotoMatrix,input:PhotoConstraints):PhotoCorrection {
  const corners=photoCorners(input.widthPx,input.heightPx).map((p)=>mapPhotoPoint(matrix,p));
  const left=Math.min(...corners.map((p)=>p.x)), top=Math.min(...corners.map((p)=>p.y));
  const width=Math.max(...corners.map((p)=>p.x))-left, height=Math.max(...corners.map((p)=>p.y))-top;
  const mmPerPixel=Math.sqrt(width*height/(input.widthPx*input.heightPx));
  const correctedWidthPx=Math.ceil(width/mmPerPixel+32), correctedHeightPx=Math.ceil(height/mmPerPixel+32);
  if(correctedWidthPx*correctedHeightPx>16_000_000) throw new Error("This correction exceeds the supported preview size.");
  return {kind:"constrained_photo_v1",constraints:input,correctedWidthPx,correctedHeightPx,
    originalToCorrected:multiplyPhotoMatrices([1/mmPerPixel,0,16-left/mmPerPixel,0,1/mmPerPixel,16-top/mmPerPixel,0,0,1],matrix)};
}

export function proposePhotoCalibration(value:unknown) {
  const input=parsePhotoConstraints(value), affine=fitPhotoMetric(input,false);
  const affineChecks=photoCalibrationResiduals(affine.matrix,input);
  if(affineChecks.every((check)=>check.passes)) {
    return {kind:"affine_sufficient" as const,affineChecks,checks:affineChecks,correction:null,metricMatrix:affine.matrix,condition:affine.condition};
  }
  const projective=fitPhotoMetric(input,true), checks=photoCalibrationResiduals(projective.matrix,input);
  return {kind:checks.every((check)=>check.passes)?"supported" as const:"conflicting" as const,affineChecks,checks,
    correction:checks.every((check)=>check.passes)?correctionFromMetric(projective.matrix,input):null,
    metricMatrix:projective.matrix,condition:projective.condition};
}

export function validatePhotoCorrection(correction:PhotoCorrection,widthPx:number,heightPx:number):string|null {
  try {
    if(correction.kind!=="constrained_photo_v1" || correction.constraints.widthPx!==widthPx || correction.constraints.heightPx!==heightPx) {
      throw new Error("Photo correction must retain the original source dimensions.");
    }
    const expected=proposePhotoCalibration(correction.constraints).correction;
    if(!expected || correction.originalToCorrected.length!==9 || correction.originalToCorrected.some((v,i)=>
      !Number.isFinite(v)||Math.abs(v-expected.originalToCorrected[i])>1e-8) ||
      correction.correctedWidthPx!==expected.correctedWidthPx || correction.correctedHeightPx!==expected.correctedHeightPx) {
      throw new Error("Photo correction must match the supported source anchors and independent checks.");
    }
    return null;
  } catch(cause) { return cause instanceof Error?cause.message:"Invalid photo correction."; }
}
