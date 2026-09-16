"use client";
import { useState } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { sourceArtworkDrawing } from "@/lib/floor-plan-source-trace-export";
export default function FloorPlanTraceExport({document,sourceId,pageNumber}:{document:FloorPlanDocumentV2;sourceId:string;pageNumber:number}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const save=async(kind:"pdf"|"svg")=>{setBusy(true);setError(null);try{
    const {exportFloorPlanVectorPdf,exportFloorPlanVectorSvg}=await import("@/lib/floor-plan-vector-export"),drawing=sourceArtworkDrawing(document,sourceId,pageNumber);
    const options={paper:"A4" as const,orientation:"portrait" as const,scale:100 as const,title:"Traced source artwork"};
    const blob=kind==="pdf"?new Blob([new Uint8Array(await exportFloorPlanVectorPdf(drawing,options))],{type:"application/pdf"}):new Blob([await exportFloorPlanVectorSvg(drawing,options)],{type:"image/svg+xml"});
    const url=URL.createObjectURL(blob),link=window.document.createElement("a");link.href=url;link.download=`traced-source-artwork.${kind}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(c){setError(c instanceof Error?c.message:"Artwork export failed.");}finally{setBusy(false);}};
  return <div className="my-2 flex flex-wrap gap-2 text-xs"><button type="button" disabled={busy} className="rounded border px-3 py-2" onClick={()=>void save("pdf")}>Export traced PDF</button>
    <button type="button" disabled={busy} className="rounded border px-3 py-2" onClick={()=>void save("svg")}>Export traced SVG</button><span>Image coordinates · no physical scale</span>{error?<p role="alert">{error}</p>:null}</div>;
}
