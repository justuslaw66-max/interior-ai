import type { FloorPlanAnnotationV2, FloorPlanDocumentV2 } from "./floor-plan-document-v2";
import type { SourceArtworkTrace } from "./floor-plan-imports/source-artwork-trace";
import { sourceDrawingGeometryError } from "./floor-plan-source-drawing";
export const SOURCE_TRACE_CONFIGURATION = "source-artwork-trace-v1";
export const isFinalSourceTrace = (a:FloorPlanAnnotationV2) => a.configurationId === SOURCE_TRACE_CONFIGURATION;

export function sourceTraceAnnotations(trace:SourceArtworkTrace,sourceId:string,pageNumber:number):FloorPlanAnnotationV2[] {
  return trace.paths.map((path,i)=>({id:`source-trace:${pageNumber}:${i}`,kind:"note",text:"Automatically traced source artwork; no building meaning or metric scale inferred.",
    scope:"reference",configurationId:SOURCE_TRACE_CONFIGURATION,
    geometry:{kind:"source_drawing",sourceId,pageNumber,widthPx:trace.widthPx,heightPx:trace.heightPx,command:"path",
      points:path.points,pathCommands:path.commands,strokeWidthPx:path.strokeWidthPx,fill:path.fill,groupId:path.groupId},
    provenance:{confidence:0,extractionVersion:trace.version,reviewHistory:[],evidence:[{sourceId,pageNumber,basis:"raster_traced",confidence:0,
      extractorVersion:trace.version,note:`Direct grayscale trace; fitting bound ${trace.settings.fitErrorPx}px in this source view. OCR replacements and semantic proposals excluded.`}]}}));
}

/** Reuse source artwork; raw candidates stay independently inspectable. Consumer-edited marks survive. */
export function replaceSourceTrace(document:FloorPlanDocumentV2,trace:SourceArtworkTrace,sourceId:string,pageNumber:number) {
  const next=structuredClone(document),floor=next.floors[0];if(!floor)throw new Error("No source review floor.");
  const same=(a:FloorPlanAnnotationV2)=>a.geometry.kind==="source_drawing"&&a.geometry.sourceId===sourceId&&a.geometry.pageNumber===pageNumber;
  if(floor.annotations.some(a=>same(a)&&isFinalSourceTrace(a)&&a.provenance.reviewHistory.some(h=>h.action==="corrected"))) {
    throw new Error("This trace has edited paths. Keep this review; retrace in a separate original-image import to compare without replacing your edits.");
  }
  floor.annotations=floor.annotations.filter(a=>!same(a)||!isFinalSourceTrace(a));
  floor.annotations.push(...sourceTraceAnnotations(trace,sourceId,pageNumber));
  return next;
}

export function editSourceTrace(document:FloorPlanDocumentV2,floorId:string,id:string,points:Array<{x:number;y:number}>) {
  const next=structuredClone(document),a=next.floors.find(f=>f.id===floorId)?.annotations.find(a=>a.id===id);
  if(!a||!isFinalSourceTrace(a)||a.geometry.kind!=="source_drawing")throw new Error("Select a traced artwork path.");
  const geometry={...a.geometry,points};const error=sourceDrawingGeometryError(geometry);if(error)throw new Error(error);
  a.geometry=geometry;a.provenance.reviewHistory.push({id:`trace-edit-${Date.now()}`,action:"corrected",reviewerId:"consumer-review",
    reviewedAt:new Date().toISOString(),note:"Source artwork control points edited; not measured building geometry."});
  next.parentRevisionId=document.revisionId;next.revisionId=`${document.revisionId}:trace:${Date.now()}`;return next;
}
