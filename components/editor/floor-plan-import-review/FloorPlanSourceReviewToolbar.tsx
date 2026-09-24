"use client";
import type { ComponentProps } from "react";
import FloorPlanSourceTracePanel from "./FloorPlanSourceTracePanel";
import FloorPlanTraceExport from "./FloorPlanTraceExport";
import FloorPlanSourceArtworkSelection from "./FloorPlanSourceArtworkFields";
import { isFinalSourceTrace } from "@/lib/floor-plan-source-trace";
import type { useSourceReviewLayers } from "./useSourceReviewLayers";
type Props=Omit<ComponentProps<typeof FloorPlanSourceArtworkSelection>,"count"|"visibleCount"|"layer"|"onLayer"|"annotation"|"onError"|"error"|"onClose"> & {
  sourceReview:ReturnType<typeof useSourceReviewLayers>;jobId:string;sourceId:string;pageNumber:number;assetUrl:string;
};
export default function FloorPlanSourceReviewToolbar(props:Props) {
  const {sourceReview,document,sourceId,pageNumber}=props;
  return <>
    {!props.previewOnly?<FloorPlanSourceTracePanel {...props}/>:null}
    <FloorPlanSourceArtworkSelection {...props} {...sourceReview} count={sourceReview.artwork.length} visibleCount={sourceReview.visible.length} onClose={()=>sourceReview.select("")}/>
    {sourceReview.artwork.some(isFinalSourceTrace)?<FloorPlanTraceExport document={document} sourceId={sourceId} pageNumber={pageNumber}/>:null}
  </>;
}
