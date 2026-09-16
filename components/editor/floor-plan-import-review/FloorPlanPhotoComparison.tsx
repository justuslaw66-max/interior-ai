import { useEffect,useRef,useState } from "react";
import type { PhotoCorrection } from "@/lib/floor-plan-photo-constraints";
import { rectifyPhotoPixels } from "@/lib/floor-plan-photo-raster";
import { mapPhotoPoint,type PhotoPoint } from "@/lib/floor-plan-photo-math";

function drawAnchors(canvas:HTMLCanvasElement,correction:PhotoCorrection,corrected:boolean) {
  const context=canvas.getContext("2d");if(!context)return;
  const map=(p:PhotoPoint)=>corrected?mapPhotoPoint(correction.originalToCorrected,p):p;
  context.lineWidth=2;context.font="14px sans-serif";
  correction.constraints.measurements.forEach((m,i)=> {
    const a=map(m.first),b=map(m.second);context.strokeStyle=m.use==="fit"?"#7c3aed":"#007ba7";context.fillStyle=context.strokeStyle;
    context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();context.fillText(String(i+1),(a.x+b.x)/2,(a.y+b.y)/2-4);
  });
  context.strokeStyle="#d95f02";
  for(const line of [correction.constraints.squareCorner.first,correction.constraints.squareCorner.second]) {
    const a=map(line[0]),b=map(line[1]);context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();
  }
}

export default function FloorPlanPhotoComparison({url,correction}:{url:string;correction:PhotoCorrection}) {
  const before=useRef<HTMLCanvasElement>(null),after=useRef<HTMLCanvasElement>(null);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=> {
    let cancelled=false;const image=new Image();
    image.onload=()=> {
      if(cancelled||!before.current||!after.current)return;
      try {
        const a=before.current,b=after.current;a.width=image.naturalWidth;a.height=image.naturalHeight;
        const source=a.getContext("2d",{willReadFrequently:true}),target=b.getContext("2d");
        if(!source||!target)throw new Error("Your browser cannot draw this comparison.");
        source.drawImage(image,0,0);
        const pixels=rectifyPhotoPixels(source.getImageData(0,0,a.width,a.height).data,a.width,a.height,correction);
        b.width=correction.correctedWidthPx;b.height=correction.correctedHeightPx;
        target.putImageData(new ImageData(pixels,b.width,b.height),0,0);
        drawAnchors(a,correction,false);drawAnchors(b,correction,true);
        setError(null);
      } catch(cause) {setError(cause instanceof Error?cause.message:"Unable to show the corrected photo.");}
    };
    image.onerror=()=>{if(!cancelled)setError("The private source preview could not be loaded.");};image.src=url;
    return ()=>{cancelled=true;image.onload=null;image.onerror=null;};
  },[url,correction]);
  return <div className="mt-3" aria-label="Photo correction comparison">
    <p className="text-xs">Purple: fitting measurements. Blue: independent checks. Orange: the single confirmed square corner.</p>
    <div className="mt-2 grid gap-3 sm:grid-cols-2">
      <figure><figcaption>Original with anchors</figcaption><canvas ref={before} className="w-full border" aria-label="Original photo with measurement anchors"/></figure>
      <figure><figcaption>Proposed correction</figcaption><canvas ref={after} className="w-full border" aria-label="Corrected photo with the same anchors"/></figure>
    </div>{error?<p role="alert">{error}</p>:null}
  </div>;
}
