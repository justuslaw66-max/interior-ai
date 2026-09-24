import type { FloorPlanDocumentV2 } from "./floor-plan-document-v2";
import type { PlanVectorDrawing,PlanDrawingPrimitive } from "./floor-plan-vector-drawing";
import { isFinalSourceTrace } from "./floor-plan-source-trace";
import { sourceDrawingSvgPath } from "./floor-plan-source-drawing";
/** Existing vector PDF/SVG writer, with explicit image-space layout and no metric-scale claim. */
export function sourceArtworkDrawing(document:FloorPlanDocumentV2,sourceId:string,pageNumber:number):PlanVectorDrawing {
  const annotations=document.floors.flatMap(f=>f.annotations).filter(a=>isFinalSourceTrace(a)&&a.geometry.kind==="source_drawing"&&a.geometry.sourceId===sourceId&&a.geometry.pageNumber===pageNumber);
  const geometry=annotations[0]?.geometry;if(!geometry||geometry.kind!=="source_drawing")throw new Error("Trace this source before exporting artwork.");
  const primitives:PlanDrawingPrimitive[]=annotations.flatMap(a=>a.geometry.kind==="source_drawing"?[{id:a.id,kind:"path",path:sourceDrawingSvgPath(a.geometry),
    fill:Boolean(a.geometry.fill),strokeWidth:a.geometry.strokeWidthPx??1,points:a.geometry.points.map(p=>({xMm:p.x,zMm:p.y})),role:a.geometry.fill?"source_fill":"source_stroke"}]:[]);
  return{coordinateSpace:"source_pixels",sourceSize:{width:geometry.widthPx,height:geometry.heightPx},geometryHash:document.revisionId,primitives,unsupported:[]};
}
