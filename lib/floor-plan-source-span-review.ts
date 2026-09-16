import type { FloorPlanDocumentV2,FloorPlanAnnotationV2 } from "./floor-plan-document-v2";
import { compileFloorPlanDocumentV2 } from "./floor-plan-compiler-v2";

export type SourceSpanKind="boundary"|"door"|"window"|"unknown";
type Point={x:number;y:number};
type Page={pageNumber:number;widthPx:number;heightPx:number};

function assertReferenceSpan(existing:FloorPlanAnnotationV2|null|undefined,sourceId:string,page:Page) {
  if(!existing||existing.scope!=="reference"||existing.geometry.kind!=="source_drawing"||existing.geometry.command!=="line"||
    existing.geometry.sourceId!==sourceId||existing.geometry.pageNumber!==page.pageNumber)throw new Error("Select a straight source reference on this page.");
}

/** A source correction can be saved before scale/topology exists. It creates no metric geometry. */
export function saveSourceReviewSpan(input:{document:FloorPlanDocumentV2;floorId:string;sourceId:string;page:Page;
  points:Point[];kind:SourceSpanKind;annotationId?:string;note:string;at:string}) {
  const {points,page}=input;
  if(points.length!==2||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>page.widthPx||p.y>page.heightPx)) {
    throw new Error("Select two endpoints inside the source image.");
  }
  if(Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y)<1)throw new Error("Choose two distinct endpoints.");
  if(!input.note.trim())throw new Error("Describe what this source span needs reviewed.");
  const next=structuredClone(input.document),floor=next.floors.find(f=>f.id===input.floorId);
  if(!floor||!next.sources.some(s=>s.id===input.sourceId))throw new Error("The source floor changed.");
  const existing=input.annotationId?floor.annotations.find(a=>a.id===input.annotationId):null;
  if(input.annotationId)assertReferenceSpan(existing,input.sourceId,page);
  const id=existing?.id??`consumer-source:${input.kind}:${crypto.randomUUID()}`;
  const note=`${existing?"Manually corrected":"Manually marked"} ${input.kind} proposal: ${input.note.trim().slice(0,500)}. Pending geometry review; not automatic recognition.`;
  const annotation={id,kind:"note" as const,scope:"reference" as const,text:note,
    geometry:{kind:"source_drawing" as const,sourceId:input.sourceId,pageNumber:page.pageNumber,widthPx:page.widthPx,heightPx:page.heightPx,
      command:"line" as const,points:points.map(p=>({...p}))},
    provenance:{confidence:0,extractionVersion:"consumer-source-span-v1",evidence:[{sourceId:input.sourceId,pageNumber:page.pageNumber,
      basis:"user_confirmed" as const,confidence:0,extractorVersion:"consumer-source-span-v1",note}],
      reviewHistory:[...(existing?.provenance.reviewHistory??[]),{id:`source-review-${crypto.randomUUID()}`,action:"corrected" as const,
        reviewerId:"consumer-source-review",reviewedAt:input.at,note}]}};
  if(existing)floor.annotations[floor.annotations.indexOf(existing)]=annotation;else floor.annotations.push(annotation);
  next.revisionId=`source-review-${crypto.randomUUID()}`;
  compileFloorPlanDocumentV2(next);
  return next;
}
