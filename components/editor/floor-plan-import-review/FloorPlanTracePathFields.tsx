"use client";
import { useState } from "react";
import type { FloorPlanAnnotationV2,FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { editSourceTrace } from "@/lib/floor-plan-source-trace";
export default function FloorPlanTracePathFields({annotation,document,floorId,onChange,onError,disabled}:{
  annotation:FloorPlanAnnotationV2;document:FloorPlanDocumentV2;floorId:string;onChange?:(doc:FloorPlanDocumentV2)=>void;onError:(error:string|null)=>void;disabled:boolean;
}) {
  const [index,setIndex]=useState(0),[dx,setDx]=useState("0"),[dy,setDy]=useState("0"),[undo,setUndo]=useState<{before:FloorPlanDocumentV2;after:string}|null>(null);
  if(annotation.geometry.kind!=="source_drawing")return null;
  const points=annotation.geometry.points,point=points[index]??points[0];
  const apply=(next:typeof points)=>{try{const updated=editSourceTrace(document,floorId,annotation.id,next);onChange?.(updated);setUndo({before:document,after:updated.revisionId});onError(null);}catch(c){onError(c instanceof Error?c.message:"Invalid source point.");}};
  return <fieldset disabled={disabled||!onChange} className="mt-2 space-y-2">
    <legend>Source path controls · pixels</legend>
    <p>Control points include curve handles. These edits do not change walls or physical dimensions.</p>
    <label>Point <select aria-label="Trace control point" value={index} onChange={e=>setIndex(Number(e.target.value))}>{points.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>
    <label>X <input aria-label="Trace point X" type="number" step="0.1" key={`x:${index}:${point.x}`} defaultValue={point.x} className="w-24 border" onBlur={e=>{if(Number.isFinite(e.target.valueAsNumber)&&e.target.valueAsNumber!==point.x)apply(points.map((p,i)=>i===index?{...p,x:e.target.valueAsNumber}:p));}}/></label>
    <label>Y <input aria-label="Trace point Y" type="number" step="0.1" key={`y:${index}:${point.y}`} defaultValue={point.y} className="w-24 border" onBlur={e=>{if(Number.isFinite(e.target.valueAsNumber)&&e.target.valueAsNumber!==point.y)apply(points.map((p,i)=>i===index?{...p,y:e.target.valueAsNumber}:p));}}/></label>
    <div><label>Move X <input aria-label="Move trace X" type="number" step="0.1" className="w-20 border" value={dx} onChange={e=>setDx(e.target.value)}/></label>
      <label>Y <input aria-label="Move trace Y" type="number" step="0.1" className="w-20 border" value={dy} onChange={e=>setDy(e.target.value)}/></label>
      <button type="button" className="ml-2 rounded border px-2 py-1" onClick={()=>apply(points.map(p=>({x:p.x+Number(dx),y:p.y+Number(dy)})))}>Move selected path</button></div>
    <button type="button" className="rounded border px-2 py-1" disabled={!undo||undo.after!==document.revisionId} onClick={()=>{if(undo&&undo.after===document.revisionId){onChange?.(undo.before);setUndo(null);}}}>Undo path edit</button>
  </fieldset>;
}
