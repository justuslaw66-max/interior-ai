import { useState } from "react";
import type { FloorPlanDocumentV2, FloorPlanSourceCalibrationV2 } from "@/lib/floor-plan-document-v2";
import { proposePhotoCalibration } from "@/lib/floor-plan-photo-calibration";
import { applyPhotoCalibration, updatePhotoReviewDraft } from "@/lib/floor-plan-photo-review";
import type { PhotoConstraints } from "@/lib/floor-plan-photo-constraints";
import type { PhotoPoint } from "@/lib/floor-plan-photo-math";
import { originalPhotoFrame } from "@/lib/floor-plan-photo-frame";

export type PhotoReviewProps={document:FloorPlanDocumentV2;floorId:string;sourceId:string;jobId:string;
  page:import("@/lib/floor-plan-imports/types").FloorPlanRenderedPage;calibration?:FloorPlanSourceCalibrationV2|null;
  scalePoints:PhotoPoint[];onPicking:()=>void;onChange:(document:FloorPlanDocumentV2)=>void;
  assetRoutePrefix?:string;disabled?:boolean};

export function usePhotoCorrectionReview(props:PhotoReviewProps) {
  const prior=props.calibration?.photoCorrection?.constraints;
  const draft=props.document.floors.find((f)=>f.id===props.floorId)?.photoReviewDrafts?.find((d)=>d.sourceId===props.sourceId&&d.pageNumber===props.page.pageNumber)??
    {sourceId:props.sourceId,pageNumber:props.page.pageNumber,widthPx:props.page.widthPx,heightPx:props.page.heightPx,
      measurements:prior?.measurements??[],first:prior?.squareCorner.first??null,second:prior?.squareCorner.second??null,confirmed:prior?.squareCorner.confirmed??false};
  const {measurements,first,second,confirmed}=draft;
  const [length,setLength]=useState(""); const [use,setUse]=useState<"fit"|"check">("fit");
  const [error,setError]=useState<string|null>(null);
  const [proposal,setProposal]=useState<{result:ReturnType<typeof proposePhotoCalibration>;constraints:PhotoConstraints;document:FloorPlanDocumentV2}|null>(null);
  const change=(patch:Partial<typeof draft>)=>{props.onChange(updatePhotoReviewDraft(props.document,props.floorId,{...draft,...patch}));setProposal(null);setError(null);};
  const pair=():[PhotoPoint,PhotoPoint]=> {
    if(props.scalePoints.length!==2) throw new Error("Select both endpoints on the source image first.");
    return [{...props.scalePoints[0]},{...props.scalePoints[1]}];
  };
  const safely=(action:()=>void)=> {try{setError(null);action();}catch(cause){setError(cause instanceof Error?cause.message:"Unable to review this correction.");}};
  const add=()=>safely(()=> {
    const [a,b]=pair(), lengthMm=Number(length);
    if(!Number.isSafeInteger(lengthMm)||lengthMm<100) throw new Error("Enter the printed length in whole millimetres.");
    change({measurements:[...measurements,{id:`photo-span-${crypto.randomUUID()}`,first:a,second:b,lengthMm,use,quality:"scan"}]});setLength("");
  });
  const propose=()=>safely(()=> {
    if(!first||!second||!confirmed) throw new Error("Select two straight edges and confirm that this one corner is square.");
    const constraints:PhotoConstraints={widthPx:props.page.widthPx,heightPx:props.page.heightPx,originalFrame:originalPhotoFrame(props.page),measurements,
      squareCorner:{first,second,confirmed:true}};
    setProposal({result:proposePhotoCalibration(constraints),constraints,document:props.document});
  });
  const accept=()=>safely(()=> {
    if(!proposal||proposal.document!==props.document) throw new Error("The draft changed. Preview the correction again before accepting it.");
    props.onChange(applyPhotoCalibration({...props,constraints:proposal.constraints,pageNumber:props.page.pageNumber,
      expectedRevisionId:proposal.document.revisionId,at:new Date().toISOString()}));setProposal(null);
  });
  const edit=(index:number,patch:Partial<PhotoConstraints["measurements"][number]>)=>safely(()=>change({measurements:measurements.map((m,i)=>i===index?{...m,...patch}:m)}));
  return {measurements,length,setLength,use,setUse,error,proposal,first,second,confirmed,add,propose,accept,
    cancel:()=>{setProposal(null);setError(null);},edit,
    remove:(index:number)=>change({measurements:measurements.filter((_,i)=>i!==index)}),
    replace:(index:number)=>safely(()=>{const [a,b]=pair();edit(index,{first:a,second:b});}),
    setEdge:(edge:"first"|"second")=>safely(()=>change({[edge]:pair(),confirmed:false})),
    confirm:(value:boolean)=>safely(()=>change({confirmed:value}))};
}
