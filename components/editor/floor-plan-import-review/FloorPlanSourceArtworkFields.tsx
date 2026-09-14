"use client";

import type { FloorPlanAnnotationV2, FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { applyConsumerTopologyCorrection } from "@/lib/floor-plan-import-review-geometry";

function FloorPlanSourceArtworkFields({ annotation, document, floorId, onChange, onError, onClose, disabled }: {
  annotation: FloorPlanAnnotationV2; document: FloorPlanDocumentV2; floorId: string;
  onChange?: (document: FloorPlanDocumentV2) => void; onError: (error: string | null) => void;
  onClose: () => void; disabled: boolean;
}) {
  const textMark = annotation.geometry.kind === "source_drawing" && annotation.geometry.command === "text";
  return <form key={`${annotation.id}:${document.revisionId}`} className="mt-2 rounded border bg-white p-3 text-xs text-neutral-800"
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
    </label> : <p>This unclassified line remains available for review against the original drawing.</p>}
    {textMark && onChange ? <button className="rounded border px-3 py-1" disabled={disabled} type="submit">Save text correction</button> : null}
  </form>;
}


export default function FloorPlanSourceArtworkSelection(props: {
  count: number; show: boolean; onShow: (show: boolean) => void;
  annotation?: FloorPlanAnnotationV2; document: FloorPlanDocumentV2; floorId: string;
  onChange?: (document: FloorPlanDocumentV2) => void; onError: (error: string | null) => void;
  onClose: () => void; disabled: boolean; previewOnly: boolean; error: string | null;
}) {
  return <>
    {props.count ? <label className="mb-2 flex items-center gap-2 text-xs">
      <input type="checkbox" checked={props.show} onChange={(event) => props.onShow(event.target.checked)} />
      Source strokes and text ({props.count}) · purple · select to review
    </label> : null}
    {props.annotation ? <FloorPlanSourceArtworkFields {...props} annotation={props.annotation}
      disabled={props.disabled || props.previewOnly} /> : null}
    {props.error ? <p role="alert" className="text-xs text-red-700">{props.error}</p> : null}
  </>;
}
