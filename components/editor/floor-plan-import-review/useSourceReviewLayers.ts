"use client";

import { useMemo, useState } from "react";
import type { FloorPlanAnnotationV2, FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { isFinalSourceTrace } from "@/lib/floor-plan-source-trace";
import { INTERIOR_ITEM_REVIEW_CONFIGURATION } from "@/lib/floor-plan-source-span-review";

export const SOURCE_REVIEW_LAYERS = [
  { value: "source", label: "Source only" },
  { value: "trace", label: "Final vectors only" },
  { value: "trace-overlay", label: "Source + final vectors" },
  { value: "compare", label: "Compare: slide between source and trace" },
  { value: "raw", label: "Raw stroke candidates (diagnostic)" },
  { value: "selected", label: "Plan + selected mark" },
  { value: "boundary", label: "Boundary proposals" },
  { value: "opening", label: "Opening proposals" },
  { value: "dimension", label: "Printed dimensions" },
  { value: "text", label: "Source text" },
  { value: "all", label: "All extracted marks (diagnostic)" },
] as const;
export type SourceReviewLayer = typeof SOURCE_REVIEW_LAYERS[number]["value"];

export const sourceTraceView = (layer: SourceReviewLayer) => ["source","trace","trace-overlay","compare"].includes(layer);

function annotationLayer(annotation: FloorPlanAnnotationV2): SourceReviewLayer {
  if (isFinalSourceTrace(annotation)) return "trace";
  if (annotation.configurationId === INTERIOR_ITEM_REVIEW_CONFIGURATION) return "selected";
  if (annotation.geometry.kind === "source_drawing" && annotation.geometry.command === "text") return "text";
  if (/^source-proposal:\d+:dimension:/.test(annotation.id)) return "dimension";
  if (/^source-proposal:\d+:opening:|^consumer-source:(door|window):/.test(annotation.id)) return "opening";
  if (/^source-proposal:\d+:room:|^source-local-boundary:|^consumer-source:boundary:/.test(annotation.id)) return "boundary";
  return "raw";
}

/** View filters never discard evidence or change recognition/acceptance state.
 * Explicit issue/span focus remains visible even when its layer is hidden. */
export function useSourceReviewLayers(document: FloorPlanDocumentV2, floorId: string, sourceId: string,
  pageNumber: number | undefined, focused: Set<string>) {
  const [layer, setLayer] = useState<SourceReviewLayer>(document.floors.some(f=>f.annotations.some(isFinalSourceTrace)) ? "trace-overlay" : "selected");
  const [selectedId, select] = useState("");
  const [error, onError] = useState<string | null>(null);
  // Where the compare wipe sits, as a share of the page width: the source shows to its left, the trace to its right.
  const [wipe, setWipe] = useState(50);
  const artwork = useMemo(() => document.floors.find(floor => floor.id === floorId)?.annotations.filter(annotation =>
    annotation.geometry.kind === "source_drawing" && annotation.geometry.sourceId === sourceId && annotation.geometry.pageNumber === pageNumber
  ) ?? [], [document, floorId, sourceId, pageNumber]);
  const visible = artwork.filter(a => sourceTraceView(layer) ? layer !== "source" && isFinalSourceTrace(a) :
    layer === "all" || a.id === selectedId || focused.has(a.id) || (layer !== "selected" && annotationLayer(a) === layer));
  const onLayer = (value: string) => {
    const option = SOURCE_REVIEW_LAYERS.find(item => item.value === value);
    if (option) { setLayer(option.value); select(""); onError(null); }
  };
  return { artwork, visible, layer, onLayer, selectedId, select, error, onError, wipe, setWipe,
    annotation: artwork.find(annotation => annotation.id === selectedId) };
}

export function sourceReviewPresentation(layer:SourceReviewLayer,sourceOpacity:number,overlayOpacity:number) {
  const trace=sourceTraceView(layer);
  return {sourceOpacity:layer==="trace"?0:layer==="source"||layer==="compare"?1:layer==="trace-overlay"?0.6:sourceOpacity/100,
    overlayOpacity:layer==="compare"?0:trace?1:overlayOpacity/100,showProposals:!trace&&layer!=="raw",artworkView:trace};
}

export const sourceReviewOverlay = <T,>(layer:SourceReviewLayer,overlay:T) => sourceTraceView(layer)||layer==="raw" ? null : overlay;

export function sourceReviewLabels(artwork:boolean,isCad:boolean,registered:boolean) {
  if(artwork)return {title:"Traced drawing",description:"Compare the visible strokes with your floor plan. Select a path to edit its image coordinates.",
    overlay:"Traced drawing overlay",caption:"Dark paths: traced from your floor plan. Red: selected path. No building meaning or physical scale is inferred."};
  return {title:"2D preview",overlay:"Detected rooms and walls",
    description:registered?"Saved room and wall outlines are shown over your floor plan.":"Your selected measurements and room corners will appear here.",
    caption:isCad?"CAD lines remain a reference until you confirm them.":"Green: proposed walls. Blue: proposed doors, windows and selected measurements. Orange: opening being marked. Purple: evidence from your floor plan that needs review."};
}
