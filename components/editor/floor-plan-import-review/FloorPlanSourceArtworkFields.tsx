"use client";

import type { FloorPlanAnnotationV2, FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { applyConsumerTopologyCorrection } from "@/lib/floor-plan-import-review-geometry";
import { isFinalSourceTrace } from "@/lib/floor-plan-source-trace";
import FloorPlanTracePathFields from "./FloorPlanTracePathFields";
import { SOURCE_REVIEW_LAYERS, type SourceReviewLayer } from "./useSourceReviewLayers";

function FloorPlanSourceArtworkFields({ annotation, document, floorId, onChange, onError, onClose, disabled, onUseScaleEndpoints }: {
  annotation: FloorPlanAnnotationV2; document: FloorPlanDocumentV2; floorId: string;
  onChange?: (document: FloorPlanDocumentV2) => void; onError: (error: string | null) => void;
  onClose: () => void; disabled: boolean;
  onUseScaleEndpoints?: (points: Array<{ x: number; y: number }>) => void;
}) {
  const textMark = annotation.geometry.kind === "source_drawing" && annotation.geometry.command === "text";
  return <form key={annotation.id} className="mt-2 rounded border bg-white p-3 text-xs text-neutral-800"
    onSubmit={(event) => {
      event.preventDefault();
      if (!onChange || disabled) return;
      try {
        const text = String(new FormData(event.currentTarget).get("text") ?? "");
        onChange(applyConsumerTopologyCorrection({ document,
          operation: { kind: "update_annotation_text", floorId, annotationId: annotation.id, text },
          mutationId: `artwork:${Date.now()}`,
        }));
        onError(null);
      } catch (error) { onError(error instanceof Error ? error.message : "Drawing correction failed."); }
    }}>
    <div className="flex justify-between gap-3"><strong>Source {textMark ? "text" : "stroke"}</strong>
      <button type="button" onClick={onClose}>Close selection</button></div>
    <p className="my-2">Reference artwork. It stays separate from walls and 3D geometry; clean proposed exports omit it.</p>
    {textMark ? <label>Correct text
      <input aria-label="Correct source text" className="my-2 block w-full rounded border p-2" name="text"
        defaultValue={annotation.text} maxLength={2000} disabled={!onChange || disabled} />
    </label> : <p>{annotation.id.startsWith("source-proposal:")||annotation.id.startsWith("consumer-source:") ? annotation.text : "This unclassified line remains available for review against the original drawing."}</p>}
    {onUseScaleEndpoints && /^source-proposal:\d+:dimension:\d+$/.test(annotation.id) && annotation.geometry.kind === "source_drawing" &&
      annotation.geometry.command === "line" && annotation.geometry.points.length === 2 ?
      <button type="button" className="mt-2 rounded border px-3 py-1" disabled={disabled} onClick={() => {
        if (annotation.geometry.kind === "source_drawing") onUseScaleEndpoints(annotation.geometry.points);
        onClose();
      }}>Use these endpoints for scale review</button> : null}
    {isFinalSourceTrace(annotation) ? <FloorPlanTracePathFields annotation={annotation} document={document} floorId={floorId} onChange={onChange} onError={onError} disabled={disabled}/> : null}
    {textMark && onChange ? <button className="rounded border px-3 py-1" disabled={disabled} type="submit">Save text correction</button> : null}
  </form>;
}


export default function FloorPlanSourceArtworkSelection(props: {
  count: number; visibleCount: number; layer: SourceReviewLayer; onLayer: (value: string) => void;
  annotation?: FloorPlanAnnotationV2; document: FloorPlanDocumentV2; floorId: string;
  onChange?: (document: FloorPlanDocumentV2) => void; onError: (error: string | null) => void;
  onClose: () => void; disabled: boolean; previewOnly: boolean; error: string | null;
  onUseScaleEndpoints?: (points: Array<{ x: number; y: number }>) => void;
}) {
  return <>
    {props.count ? <div className="mb-3 rounded border border-violet-200 bg-white p-2 text-xs text-neutral-700">
      <label className="flex flex-wrap items-center gap-2">Review overlay
        <select aria-label="Review overlay" className="rounded border bg-white px-2 py-1" value={props.layer} onChange={event => props.onLayer(event.target.value)}>
          {SOURCE_REVIEW_LAYERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <p className="mt-1">{props.visibleCount} of {props.count} source marks shown. Traced artwork stays separate from walls. OCR readings and raw candidates are separate diagnostic layers.</p>
      {props.layer === "all" ? <p className="mt-1">Diagnostic view includes overlapping strokes and uncertain text. Use a specific layer or select one proposal for a clearer view.</p> : null}
    </div> : null}
    {props.annotation ? <FloorPlanSourceArtworkFields {...props} annotation={props.annotation}
      disabled={props.disabled || props.previewOnly} /> : null}
    {props.error ? <p role="alert" className="text-xs text-red-700">{props.error}</p> : null}
  </>;
}
