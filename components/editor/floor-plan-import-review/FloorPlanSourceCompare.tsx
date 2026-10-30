"use client";

import { useRef } from "react";
import { ChevronsLeftRight } from "lucide-react";
import type { FloorPlanAnnotationV2 } from "@/lib/floor-plan-document-v2";
import { sourceDrawingInk, sourceDrawingStroke, sourceDrawingSvgPath } from "@/lib/floor-plan-source-drawing";
import { isFinalSourceTrace } from "@/lib/floor-plan-source-trace";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { SourceReviewLayer } from "./useSourceReviewLayers";

/** Before / after for the traced drawing: what the tracer took from the floor plan, and what it left out. */

const VIEWS: Array<{ value: SourceReviewLayer; label: string; title: string }> = [
  { value: "source", label: "Original", title: "Your floor plan as uploaded" },
  { value: "trace", label: "Traced", title: "Only the strokes traced from it" },
  { value: "trace-overlay", label: "Both", title: "The trace drawn over the faded original" },
  { value: "compare", label: "Compare", title: "Slide a divider between the original and the trace" },
];

export function FloorPlanSourceCompareToggle({ layer, onLayer, wipe, onWipe, disabled }: {
  layer: SourceReviewLayer; onLayer: (value: string) => void; wipe: number; onWipe: (value: number) => void; disabled?: boolean;
}) {
  return (
    <div className="mb-2 rounded border border-separator bg-surface-floating p-2 text-xs text-label-secondary" data-testid="floor-plan-source-compare">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Before / after</span>
        <SegmentedControl label="Original or traced drawing" size="compact" value={layer} options={VIEWS} disabled={disabled}
          onChange={onLayer} />
        <span className="text-label-secondary">Anything visible on the original but missing from the trace was not picked up.</span>
      </div>
      {layer === "compare" ? (
        <label className="mt-2 flex items-center gap-2">
          <span className="whitespace-nowrap">Original</span>
          <input type="range" min={0} max={100} value={wipe} aria-label="Compare position" className="w-full" disabled={disabled}
            onChange={(event) => onWipe(Number(event.target.value))} />
          <span className="whitespace-nowrap">Traced</span>
        </label>
      ) : null}
    </div>
  );
}

/** The trace on white, clipped to the right of the divider, over the original; the divider drags. Its lines are drawn
 * as the Traced view draws them (`sourceDrawingStroke`), so both sides of the divider are at the same scale. */
export function FloorPlanSourceCompareWipe({ layer, wipe, onWipe, annotations, widthPx, heightPx }: {
  layer: SourceReviewLayer; wipe: number; onWipe: (value: number) => void; annotations: FloorPlanAnnotationV2[]; widthPx: number; heightPx: number;
}) {
  const frame = useRef<HTMLDivElement>(null);
  if (layer !== "compare") return null;
  const positionFrom = (clientX: number) => {
    const bounds = frame.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    onWipe(Math.round(Math.max(0, Math.min(100, ((clientX - bounds.left) / bounds.width) * 100))));
  };
  return (
    <div ref={frame} className="absolute inset-0" data-testid="floor-plan-source-compare-wipe">
      <div className="absolute inset-0 bg-white" style={{ clipPath: `inset(0 0 0 ${wipe}%)` }} aria-hidden="true">
        <svg className="h-full w-full" preserveAspectRatio="none" viewBox={`0 0 ${widthPx} ${heightPx}`}>
          {annotations.map((annotation) => annotation.geometry.kind === "source_drawing" && annotation.geometry.command !== "text" ? (
            <path key={annotation.id} d={sourceDrawingSvgPath(annotation.geometry)} fill={annotation.geometry.fill ? sourceDrawingInk(annotation.geometry, "#222") : "none"}
              stroke={annotation.geometry.fill ? "none" : sourceDrawingInk(annotation.geometry, "#222")} {...sourceDrawingStroke(annotation.geometry, isFinalSourceTrace(annotation))} />
          ) : null)}
        </svg>
      </div>
      <div role="separator" aria-label="Drag to compare the original with the trace" aria-valuenow={wipe} aria-valuemin={0} aria-valuemax={100}
        tabIndex={0} className="absolute inset-y-0 w-0.5 cursor-col-resize bg-emerald-600 shadow-[0_0_0_1px_#fff]"
        style={{ left: `${wipe}%`, touchAction: "none" }}
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); positionFrom(event.clientX); }}
        onPointerMove={(event) => { if (event.buttons) positionFrom(event.clientX); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") onWipe(Math.max(0, wipe - 2));
          if (event.key === "ArrowRight") onWipe(Math.min(100, wipe + 2));
        }}>
        <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-700 px-1.5 py-1 text-white"><ChevronsLeftRight className="h-4 w-4" aria-hidden="true" /></span>
      </div>
    </div>
  );
}
