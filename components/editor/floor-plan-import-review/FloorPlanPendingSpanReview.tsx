"use client";
import { useState } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { saveSourceReviewSpan,INTERIOR_ITEM_REVIEW_CONFIGURATION,type SourceSpanKind } from "@/lib/floor-plan-source-span-review";
import { userFacingErrorMessage } from "@/lib/user-facing-error";

type Props={document:FloorPlanDocumentV2;floorId:string;sourceId:string;
  page:{pageNumber:number;widthPx:number;heightPx:number}|null;points:Array<{x:number;y:number}>;
  onPick:()=>void;onSelect:(id:string,points:Array<{x:number;y:number}>)=>void;onChange:(value:FloorPlanDocumentV2)=>void;disabled:boolean};
const control="rounded border bg-white px-2 py-1 text-xs disabled:opacity-50";

export default function FloorPlanPendingSpanReview(props:Props) {
  const [kind,setKind]=useState<SourceSpanKind>("boundary"),[selected,setSelected]=useState(""),[note,setNote]=useState("");
  const [message,setMessage]=useState<string|null>(null);
  const spans=props.document.floors.find(f=>f.id===props.floorId)?.annotations.filter(a=>a.scope==="reference"&&a.geometry.kind==="source_drawing"&&
    a.geometry.command==="line"&&a.geometry.sourceId===props.sourceId&&a.geometry.pageNumber===props.page?.pageNumber)??[];
  const save=()=>{
    if(!props.page)return;
    try{props.onChange(saveSourceReviewSpan({...props,page:props.page,annotationId:selected||undefined,kind,note,at:new Date().toISOString()}));
      setMessage("Pending source correction recorded. Save the review draft to keep it. Scale and geometry have not changed.");
    }catch(cause){setMessage(userFacingErrorMessage(cause, "The source correction could not be saved."));}
  };
  return <details className="mt-3 rounded-lg border border-violet-200 bg-white p-3 text-neutral-800">
    <summary className="cursor-pointer text-sm font-semibold">Review missing boundaries and openings</summary>
    <fieldset disabled={props.disabled} className="mt-2 grid gap-2 text-xs">
      <p>Mark a missing span, or correct a proposal, even before scale and walls exist. These purple reference marks stay pending; they do not close a room or create an opening.</p>
      <label>Source proposal<select aria-label="Source span to correct" className={`${control} block w-full`} value={selected} onChange={e=>{
        const id=e.target.value,span=spans.find(a=>a.id===id);setSelected(id);setMessage(null);
        setKind(span?.configurationId===INTERIOR_ITEM_REVIEW_CONFIGURATION?"interior_item":id?"unknown":"boundary");
        props.onSelect(id,span?.geometry.kind==="source_drawing"?span.geometry.points.map(p=>({x:p.x,y:p.y})):[]);
      }}>
        <option value="">Mark a new unresolved span</option>{spans.map((a,i)=><option key={a.id} value={a.id}>{i+1}. {a.text||"Unlabelled span"}</option>)}
      </select></label>
      <label>What is visible?<select aria-label="Pending source span kind" className={`${control} ml-2`} value={kind} onChange={e=>{
        const value=e.target.value;if(value==="boundary"||value==="door"||value==="window"||value==="interior_item"||value==="unknown")setKind(value);
      }}><option value="boundary">Boundary</option><option value="door">Door</option><option value="window">Window</option><option value="interior_item">Interior item (not an opening)</option><option value="unknown">Uncertain mark</option></select></label>
      {kind==="interior_item"?<p>{/^source-proposal:\d+:opening:\d+$/.test(selected)?"This excludes the selected opening proposal from a separate corrected review.":"This records an interior item as a reference mark."} Nearby marks and existing geometry stay unchanged.</p>:null}
      <button type="button" className={control} onClick={props.onPick}>Pick pending span endpoints</button>
      <p>{props.points.length}/2 endpoints selected on the source above. Selecting a proposal highlights it and loads its endpoints; pick again to adjust them.</p>
      <label>Review note<input aria-label="Pending source span note" className={`${control} block w-full`} value={note} maxLength={500} onChange={e=>setNote(e.target.value)}/></label>
      <button type="button" className={control} disabled={props.points.length!==2||!props.page||!note.trim()} onClick={save}>Record pending source correction</button>
      {message?<p role="status">{message}</p>:null}
    </fieldset>
  </details>;
}
