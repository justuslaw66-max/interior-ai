"use client";

import type { FloorPlanAnnotationV2 } from "@/lib/floor-plan-document-v2";
import { isFinalSourceTrace } from "@/lib/floor-plan-source-trace";
import type { ReviewOverlay } from "@/lib/floor-plan-import-review-overlay";
import { sourceDrawingSvgPath, sourceDrawingSvgPoints as points } from "@/lib/floor-plan-source-drawing";

function SourceArtwork({ annotations, selectedId, picking, onSelect, focused }: {
  annotations: FloorPlanAnnotationV2[]; selectedId: string; picking: boolean; onSelect: (id: string) => void; focused: Set<string>;
}) {
  return annotations.map((annotation) => {
    const geometry = annotation.geometry;
    if (geometry.kind !== "source_drawing") return null;
    const selected = selectedId === annotation.id || focused.has(annotation.id);
    const select = () => { if (!picking) onSelect(annotation.id); };
    const text = geometry.command === "text", trace = isFinalSourceTrace(annotation);
    return <g key={annotation.id} data-review-entity-id={annotation.id} role="button" tabIndex={picking ? -1 : 0}
      aria-label={annotation.id.startsWith("source-proposal:") ? annotation.text : text ? `Source text: ${annotation.text}` : `Source stroke ${annotation.id}`}
      aria-pressed={selected} className="cursor-pointer focus:outline focus:outline-2 focus:outline-violet-600"
      onClick={(event) => { if (!picking) { event.stopPropagation(); select(); } }}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } }}>
      {text ? <text x={geometry.points[0].x} y={geometry.points[0].y} fill={selected ? "#dc2626" : "#7c3aed"}
        transform={`rotate(${geometry.textRotationDegrees ?? 0} ${geometry.points[0].x} ${geometry.points[0].y})`}
        stroke="none" fontSize={12} pointerEvents={picking ? "none" : "all"}>{annotation.text}</text>
        : <SourceArtworkShape geometry={geometry} selected={selected} trace={trace} proposal={annotation.id.startsWith("source-proposal:")} picking={picking}/> }
    </g>;
  });
}

function PlanOutlines({ overlay, focused, pickingRoom }: { overlay: ReviewOverlay | null; focused: Set<string>; pickingRoom: boolean }) {
  return <>
    {overlay?.structures.map((path) => <polygon key={path.id} data-review-entity-id={path.id} fill={focused.has(path.id) ? "rgba(245,158,11,.28)" : "rgba(245,158,11,.12)"}
      points={points(path.points)} stroke={focused.has(path.id) ? "#dc2626" : "#d97706"}
      strokeWidth={focused.has(path.id) ? 4 : 2} vectorEffect="non-scaling-stroke" />)}
    {overlay?.walls.map((path) => <polyline key={path.id} data-review-entity-id={path.id} points={points(path.points)} stroke={focused.has(path.id) ? "#dc2626" : "#059669"}
      strokeWidth={focused.has(path.id) ? 5 : 2.5} vectorEffect="non-scaling-stroke" />)}
    {overlay?.openings.map((path) => <polyline key={path.id} data-review-entity-id={path.id} points={points(path.points)} stroke={focused.has(path.id) ? "#dc2626" : "#2563eb"}
      strokeWidth={focused.has(path.id) ? 7 : 4} vectorEffect="non-scaling-stroke" />)}
    {overlay?.vertices.filter((point) => focused.has(point.id)).map((point) => <circle key={point.id} data-review-entity-id={point.id} cx={point.x} cy={point.y}
      fill="#fff" r={5} stroke="#dc2626" strokeWidth={3} vectorEffect="non-scaling-stroke" />)}
    {pickingRoom ? overlay?.vertices.map((point) => <circle key={`snap-${point.id}`} cx={point.x} cy={point.y}
      fill="white" opacity={0.9} r={5} stroke="#059669" strokeWidth={2} vectorEffect="non-scaling-stroke" />) : null}
  </>;
}

export default function FloorPlanSourceReviewOverlay(props: {
  overlay: ReviewOverlay | null; focused: Set<string>; pickingRoom: boolean;
  opacity: number; annotations: FloorPlanAnnotationV2[]; selectedId: string;
  picking: boolean; onSelect: (id: string) => void;
}) {
  return <g fill="none" opacity={props.opacity}>
    <SourceArtwork {...props} />
    <PlanOutlines {...props} />
  </g>;
}

function SourceArtworkShape({geometry,selected,trace,proposal,picking}:{geometry:import("@/lib/floor-plan-source-drawing").FloorPlanSourceDrawingGeometryV2;selected:boolean;trace:boolean;proposal:boolean;picking:boolean}) {
  return <>
          <path d={sourceDrawingSvgPath(geometry)} fill="none" stroke="transparent" strokeWidth={12}
            vectorEffect="non-scaling-stroke" pointerEvents={picking ? "none" : "stroke"} aria-hidden="true" />
          <path data-source-artwork-shape data-final-trace={trace||undefined} d={sourceDrawingSvgPath(geometry)} fill={geometry.fill ? (selected?"#dc2626":"#333") : "none"} stroke={geometry.fill?"none":selected ? "#dc2626" : trace ? "#333" : "#7c3aed"}
            strokeDasharray={proposal ? "4 3" : undefined}
            strokeWidth={trace ? geometry.strokeWidthPx ?? 1 : selected ? 4 : 1.5} vectorEffect={trace?undefined:"non-scaling-stroke"} pointerEvents="none" />
          {trace && selected ? geometry.points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={1.4} fill="white" stroke="#dc2626" strokeWidth={0.4}/>) : null}
        </>;
}
