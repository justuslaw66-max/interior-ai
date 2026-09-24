import { pointInPolygon,type RegisteredPageEvidence,type SourcePointPx,type SourceVectorSegment,type SemanticBoundingBox } from "./deterministic-evidence";
import { mapPhotoPoint } from "../floor-plan-photo-math";
const MIN_SEGMENT_LENGTH_PX=8;
const pointDistance=(a:SourcePointPx,b:SourcePointPx)=>Math.hypot(a.x-b.x,a.y-b.y);
const segmentMidpoint=(s:SourceVectorSegment)=>({x:(s.start.x+s.end.x)/2,y:(s.start.y+s.end.y)/2});
function pointInBox(p:SourcePointPx,b:SemanticBoundingBox,page:RegisteredPageEvidence){
  const padding=Math.max(2,Math.hypot(page.widthPx,page.heightPx)*0.001);
  return p.x>=b.leftRatio*page.widthPx-padding&&p.x<=b.rightRatio*page.widthPx+padding&&
    p.y>=b.topRatio*page.heightPx-padding&&p.y<=b.bottomRatio*page.heightPx+padding;
}
export function sourcePixelDistance(page:RegisteredPageEvidence,a:SourcePointPx,b:SourcePointPx) {
  const m=page.originalPixelMapping;return m?pointDistance(mapPhotoPoint(m,a),mapPhotoPoint(m,b)):pointDistance(a,b);
}
function lineDistance(point:SourcePointPx,start:SourcePointPx,end:SourcePointPx) {
  const dx=end.x-start.x,dy=end.y-start.y,denominator=dx*dx+dy*dy;
  const ratio=denominator?Math.max(0,Math.min(1,((point.x-start.x)*dx+(point.y-start.y)*dy)/denominator)):0;
  return pointDistance(point,{x:start.x+ratio*dx,y:start.y+ratio*dy});
}
/** Confirmed dimension rulers are observations, never architectural wall edges. */
export function architecturalLineworkPage(page:RegisteredPageEvidence):RegisteredPageEvidence {
  const rulers=(page.dimensionSpanEvidence?.observations??[]).filter(o=>o.status==="source_supported"&&o.start&&o.end);
  if(!rulers.length)return page;
  const map=(p:SourcePointPx)=>page.originalPixelMapping?mapPhotoPoint(page.originalPixelMapping,p):p;
  const spans=rulers.map(r=>({start:map(r.start!),end:map(r.end!)}));
  const excluded=new Set(page.vectorSegments.filter(s=>coveredByRulers(map(s.start),map(s.end),spans)).map(s=>s.id));
  return {...page,vectorSegments:page.vectorSegments.filter(s=>!excluded.has(s.id)),
    vectorPaths:page.vectorPaths.filter(p=>!p.segmentIds.some(id=>excluded.has(id)))};
}

function coveredByRulers(a:SourcePointPx,b:SourcePointPx,rulers:Array<{start:SourcePointPx;end:SourcePointPx}>) {
  const length=pointDistance(a,b);if(length<1)return false;
  const ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
  const along=(p:SourcePointPx)=>(p.x-a.x)*ux+(p.y-a.y)*uy;
  const across=(p:SourcePointPx)=>Math.abs((p.x-a.x)*uy-(p.y-a.y)*ux);
  const intervals=rulers.filter(r=>across(r.start)<=3&&across(r.end)<=3).map(r=>
    [Math.max(0,Math.min(along(r.start),along(r.end))),Math.min(length,Math.max(along(r.start),along(r.end)))])
    .filter(([start,end])=>end>start).sort((a,b)=>a[0]-b[0]);
  let coverage=0,right=0;
  for(const [start,end] of intervals){coverage+=Math.max(0,end-Math.max(right,start));right=Math.max(right,end);}
  return coverage/length>=0.9;
}
export function sourceSegmentsForWalls(page: RegisteredPageEvidence) {
  const semanticTextBoxes = [
    ...page.semantics.roomLabels.flatMap((label) => (label.bbox ? [label.bbox] : [])),
    ...page.semantics.dimensionLabels.flatMap((label) =>
      label.bbox ? [label.bbox] : []
    ),
  ];
  return architecturalLineworkPage(page).vectorSegments.filter((segment) => {
    if (pointDistance(segment.start, segment.end) < MIN_SEGMENT_LENGTH_PX) return false;
    if ((segment.confidence ?? 1) < 0.55) return false;
    const midpoint = segmentMidpoint(segment);
    if (semanticTextBoxes.some((box) => pointInBox(midpoint, box, page))) return false;
    return !page.text.some((text) => {
      const box = {
        leftRatio: (text.center.x - text.widthPx / 2) / page.widthPx,
        topRatio: (text.center.y - text.heightPx / 2) / page.heightPx,
        rightRatio: (text.center.x + text.widthPx / 2) / page.widthPx,
        bottomRatio: (text.center.y + text.heightPx / 2) / page.heightPx,
      };
      // OCR often reads long wall rails as I/l/| or punctuation. Such marks
      // remain visible for review but cannot erase architectural evidence.
      // A real text box excludes only strokes contained within that text.
      return /[\p{L}02-9]/u.test(text.text.replace(/[Iil]/g, "")) &&
        pointInBox(segment.start, box, page) && pointInBox(segment.end, box, page);
    });
  });
}


/** Abstain when an apparent room contains a complete pair of opposing-edge wall rails. */
export function hasSourceDivider(page:RegisteredPageEvidence,polygon:SourcePointPx[]) {
  const boundaryDistance=(p:SourcePointPx)=>Math.min(...polygon.map((a,i)=>lineDistance(p,a,polygon[(i+1)%polygon.length])));
  const xs=polygon.map(p=>p.x),ys=polygon.map(p=>p.y),minimumLength=Math.min(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))*0.7;
  const crossing=sourceSegmentsForWalls(page).flatMap(s=>clippedCrossing(s,polygon,minimumLength));
  return crossing.some((a,i)=>crossing.slice(i+1).some(b=>{
    const al=pointDistance(a.start,a.end),bl=pointDistance(b.start,b.end);
    const alignment=Math.abs(((a.end.x-a.start.x)*(b.end.x-b.start.x)+(a.end.y-a.start.y)*(b.end.y-b.start.y))/(al*bl));
    const midpoint=segmentMidpoint(b),gap=lineDistance(midpoint,a.start,a.end);
    return alignment>0.999&&gap>=1&&gap<=Math.min(page.widthPx,page.heightPx)*0.025&&
      boundaryDistance(segmentMidpoint(a))>Math.max(3,2*gap)&&boundaryDistance(midpoint)>Math.max(3,2*gap);
  }));
}

function clippedCrossing(segment:SourceVectorSegment,polygon:SourcePointPx[],minimumLength:number):SourceVectorSegment[] {
  const length=pointDistance(segment.start,segment.end);if(length<minimumLength)return [];
  const ux=(segment.end.x-segment.start.x)/length,uy=(segment.end.y-segment.start.y)/length;
  const crossings=polygon.flatMap((a,i)=>{
    const b=polygon[(i+1)%polygon.length],vx=b.x-a.x,vy=b.y-a.y,den=ux*vy-uy*vx;
    if(Math.abs(den)<1e-9)return [];
    const dx=a.x-segment.start.x,dy=a.y-segment.start.y,t=(dx*vy-dy*vx)/den,q=(dx*uy-dy*ux)/den;
    return q>=0&&q<=1&&t>=-3&&t<=length+3?[t]:[];
  }).sort((a,b)=>a-b);
  if(crossings.length<2)return [];
  const a=crossings[0],b=crossings.at(-1)!;
  if(b-a<minimumLength)return [];
  const at=(t:number)=>({x:segment.start.x+ux*t,y:segment.start.y+uy*t});
  return pointInPolygon(at((a+b)/2),polygon)?[{...segment,start:at(a),end:at(b)}]:[];
}

export function roomSourceConflict(page:RegisteredPageEvidence,points:SourcePointPx[],ambiguousLabel:boolean) {
  if(ambiguousLabel)return "ambiguousLabel" as const;
  return hasSourceDivider(page,points)?"internalDivider" as const:null;
}
