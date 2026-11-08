"use client";

import type { ReviewPlanDrawing, ReviewPlanLabel, ReviewPlanShape } from "@/lib/floor-plan-review-plan-drawing";

/** The clean plan drawn from the document, on white, in the source page's pixels (see buildReviewPlanDrawing). */
function Shape({ shape }: { shape: ReviewPlanShape }) {
  return shape.fill
    ? <path d={shape.d} fill={shape.ink} fillRule="nonzero" stroke="none" />
    : <path d={shape.d} fill="none" stroke={shape.ink} strokeWidth={shape.strokeWidthPx} strokeLinecap="butt" strokeLinejoin="miter" />;
}

function Label({ label }: { label: ReviewPlanLabel }) {
  const top = label.y - ((label.lines.length - 1) * label.sizePx * 1.15) / 2;
  return <text x={label.x} y={top} fontSize={label.sizePx} fill={label.role === "dimension" ? "#555555" : "#262626"} stroke="none"
    textAnchor="middle" dominantBaseline="central" fontFamily="Arial, Helvetica, sans-serif"
    transform={label.rotateDeg ? `rotate(${label.rotateDeg} ${label.x} ${label.y})` : undefined}>
    {label.lines.map((line, index) => <tspan key={index} x={label.x} dy={index ? label.sizePx * 1.15 : 0}>{line}</tspan>)}
  </text>;
}

export default function FloorPlanReviewPlanDrawing({ drawing }: { drawing: ReviewPlanDrawing | null }) {
  if (!drawing) return null;
  return <g data-testid="floor-plan-review-plan-drawing" aria-hidden="true" pointerEvents="none">
    <rect width={drawing.widthPx} height={drawing.heightPx} fill="#fff" />
    {drawing.traced.map((shape) => <Shape key={shape.id} shape={shape} />)}
    {drawing.shapes.map((shape) => <Shape key={shape.id} shape={shape} />)}
    {drawing.labels.map((label) => <Label key={label.id} label={label} />)}
  </g>;
}
