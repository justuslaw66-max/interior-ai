"use client";
import { useContext,useEffect,useRef,useState } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { SourceArtworkTrace } from "@/lib/floor-plan-imports/source-artwork-trace";
import { SourceTraceAction } from "./source-trace-action";
import { floorPlanImportResponseJson } from "../useConsumerFloorPlanImportSession";
import { sourceTraceAnnotations } from "@/lib/floor-plan-source-trace";
import { sourceDrawingSvgPath } from "@/lib/floor-plan-source-drawing";

type Preview={assetId:string;trace:SourceArtworkTrace};
function SourceTracePanelSession({document,jobId,pageNumber,sourceId,assetUrl,disabled}:{
  document:FloorPlanDocumentV2;jobId:string;pageNumber:number;sourceId:string;assetUrl:string;disabled:boolean;
}) {
  const action=useContext(SourceTraceAction),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const [view,setView]=useState("overlay"),controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  if(!action)return null;
  const saved=JSON.stringify(document)===JSON.stringify(action.saved);
  const trace=async()=>{
    controller.current?.abort();const current=new AbortController();controller.current=current;setBusy(true);setError(null);setPreview(null);
    try{
      const result=await floorPlanImportResponseJson(await fetch(`/api/floor-plan-imports/${jobId}/source-trace`,{method:"POST",signal:current.signal,
        headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"preview",pageNumber,candidateVersion:action.candidateVersion})}));
      current.signal.throwIfAborted();if(typeof result.assetId!=="string"||!result.trace||typeof result.trace!=="object")throw new Error("Invalid trace preview.");
      setPreview({assetId:result.assetId,trace:result.trace as SourceArtworkTrace});
    }catch(cause){if(!current.signal.aborted)setError(cause instanceof Error?cause.message:"Unable to trace this image.");}
    finally{if(!current.signal.aborted)setBusy(false);}
  };
  const cancel=()=>{controller.current?.abort();setBusy(false);setPreview(null);};
  return <details className="mb-3 rounded border bg-white p-3 text-xs text-neutral-800">
    <summary className="cursor-pointer font-semibold">Trace visible drawing</summary>
    <p className="my-2">Trace the displayed source locally as editable strokes, curves and fills. Scale and room recognition are not required. Text shapes stay in the trace; OCR readings remain a separate review layer.</p>
    {!saved?<p>Save your review edits before tracing.</p>:null}
    <button type="button" className="rounded border px-3 py-2" disabled={disabled||busy||!saved} onClick={()=>void trace()}>Preview local vector trace</button>
    {busy?<button type="button" className="ml-2 rounded border px-3 py-2" onClick={cancel}>Cancel tracing</button>:null}
    {error?<p role="alert" className="my-2 text-red-700">{error}</p>:null}
    {preview?<div className="mt-3">
      <p>{preview.trace.paths.length} source paths, {preview.trace.diagnostics.curves} curve spans. Check fine details before keeping this trace.</p>
      <label>Trace preview <select aria-label="Trace preview" value={view} onChange={e=>setView(e.target.value)}>
        <option value="source">Source only</option><option value="vectors">Final vectors only</option><option value="overlay">Source + final vectors</option></select></label>
      <div className="my-2 max-h-[60vh] overflow-auto border bg-white"><svg aria-label="Local trace replacement preview" width={preview.trace.widthPx} height={preview.trace.heightPx} viewBox={`0 0 ${preview.trace.widthPx} ${preview.trace.heightPx}`}>
        {view!=="vectors"?<image href={assetUrl} width="100%" height="100%" opacity={view==="overlay"?0.6:1}/>:null}
        {view!=="source"?sourceTraceAnnotations(preview.trace,sourceId,pageNumber).map(a=>a.geometry.kind==="source_drawing"?<path key={a.id} d={sourceDrawingSvgPath(a.geometry)} fill={a.geometry.fill?"#222":"none"} stroke={a.geometry.fill?"none":"#222"} strokeWidth={a.geometry.strokeWidthPx}/>:null):null}
      </svg></div>
      <button type="button" className="rounded border px-3 py-2" disabled={disabled||!saved} onClick={()=>action.onAccept({assetId:preview.assetId,pageNumber})}>Keep trace in separate review</button>
      <button type="button" className="ml-2 rounded border px-3 py-2" onClick={cancel}>Discard trace preview</button>
      <p className="mt-2">Your current review and saved design remain available. This artwork is not a measured building plan.</p>
    </div>:null}
  </details>;
}

export default function FloorPlanSourceTracePanel(props:Parameters<typeof SourceTracePanelSession>[0]) {
  return <SourceTracePanelSession key={`${props.jobId}:${props.pageNumber}:${props.document.revisionId}:${props.assetUrl}`} {...props}/>;
}
