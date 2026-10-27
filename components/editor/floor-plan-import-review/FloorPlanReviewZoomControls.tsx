import type { Dispatch, SetStateAction } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function FloorPlanReviewZoomControls({ zoom, setZoom, pages, pageNumber, onPageNumberChange }: {
  zoom: number; setZoom: Dispatch<SetStateAction<number>>; pages: { pageNumber: number }[];
  pageNumber: number; onPageNumberChange: (value: number) => void;
}) {
  return <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 text-xs">
    <Button size="mini" aria-label="Zoom out" title="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((current) => Math.max(1, current - 0.5))}>
      <Minus className="h-3.5 w-3.5" aria-hidden="true" /></Button>
    <span className="min-w-10 text-center font-medium" aria-live="polite">{Math.round(zoom * 100)}%</span>
    <Button size="mini" aria-label="Zoom in" title="Zoom in" disabled={zoom >= 4} onClick={() => setZoom((current) => Math.min(4, current + 0.5))}>
      <Plus className="h-3.5 w-3.5" aria-hidden="true" /></Button>
    <Button size="mini" aria-label="Fit" title="Fit the plan to the frame" onClick={() => setZoom(1)}>
      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /></Button>
    {pages.length > 1 ? <select aria-label="Floor plan page" className="rounded border border-control-secondary-border bg-field px-1 py-1 text-xs"
      value={pageNumber} onChange={(event) => { setZoom(1); onPageNumberChange(Number(event.target.value)); }}>
      {pages.map((item) => <option key={item.pageNumber} value={item.pageNumber}>Page {item.pageNumber}</option>)}
    </select> : null}
  </div>;
}
