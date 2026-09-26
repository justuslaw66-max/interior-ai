import type { PhotoCorrection } from "./floor-plan-photo-constraints";
import { inversePhotoMatrix } from "./floor-plan-photo-math";

/** Deterministic bilinear resampling. Pixels outside the source are blank; no marks are painted or inferred. */
export function rectifyPhotoPixels(input:Uint8Array|Uint8ClampedArray,width:number,height:number,correction:PhotoCorrection) {
  const {outWidth,outHeight}=validateRaster(input,width,height,correction);
  const m=inversePhotoMatrix(correction.originalToCorrected), output=new Uint8ClampedArray(outWidth*outHeight*4);
  output.fill(255);
  for(let y=0;y<outHeight;y++) for(let x=0;x<outWidth;x++) {
    const dx=x+0.5,dy=y+0.5,w=m[6]*dx+m[7]*dy+m[8];
    const u=(m[0]*dx+m[1]*dy+m[2])/w-0.5,v=(m[3]*dx+m[4]*dy+m[5])/w-0.5;
    if(!Number.isFinite(u)||!Number.isFinite(v)||u<0||v<0||u>width-1||v>height-1) continue;
    const a=Math.floor(u),b=Math.floor(v),fx=u-a,fy=v-b;
    const indices=[(b*width+a)*4,(b*width+Math.min(a+1,width-1))*4,
      (Math.min(b+1,height-1)*width+a)*4,(Math.min(b+1,height-1)*width+Math.min(a+1,width-1))*4];
    const weights=[(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy];
    for(let c=0;c<4;c++) output[(y*outWidth+x)*4+c]=indices.reduce((sum,index,i)=>sum+input[index+c]*weights[i],0);
  }
  return output;
}

function validateRaster(input:Uint8Array|Uint8ClampedArray,width:number,height:number,correction:PhotoCorrection) {
  if(width!==correction.constraints.widthPx || height!==correction.constraints.heightPx || input.length!==width*height*4) {
    throw new Error("The source image changed. Reload the original before correcting it.");
  }
  const outWidth=correction.correctedWidthPx,outHeight=correction.correctedHeightPx;
  if(!Number.isSafeInteger(outWidth)||!Number.isSafeInteger(outHeight)||outWidth<1||outHeight<1||outWidth*outHeight>16_000_000) {
    throw new Error("Unsupported corrected image dimensions.");
  }
  return {outWidth,outHeight};
}
