import type { Dispatch, SetStateAction } from "react";

export function FloorPlanReviewZoomControls({ zoom, setZoom, pages, pageNumber, onPageNumberChange, dark }: {
  zoom: number; setZoom: Dispatch<SetStateAction<number>>; pages: { pageNumber: number }[];
  pageNumber: number; onPageNumberChange: (value: number) => void; dark: boolean;
}) {
  const control = "rounded border bg-white px-2 py-1 disabled:opacity-40";
  return <div className="flex flex-wrap items-center justify-end gap-1 text-[10px]">
    <button aria-label="Zoom out" className={control} disabled={zoom <= 1} onClick={() => setZoom((current) => Math.max(1, current - 0.5))} type="button">−</button>
    <span className="min-w-10 text-center font-medium" aria-live="polite">{Math.round(zoom * 100)}%</span>
    <button aria-label="Zoom in" className={control} disabled={zoom >= 4} onClick={() => setZoom((current) => Math.min(4, current + 0.5))} type="button">+</button>
    <button className={control} onClick={() => setZoom(1)} type="button">Fit</button>
    {pages.length > 1 ? <select aria-label="Source page" className={dark ? "designer-control rounded border px-1 py-1 text-[10px]" : "rounded border border-neutral-300 bg-white px-1 py-1 text-[10px]"}
      value={pageNumber} onChange={(event) => { setZoom(1); onPageNumberChange(Number(event.target.value)); }}>
      {pages.map((item) => <option key={item.pageNumber} value={item.pageNumber}>Page {item.pageNumber}</option>)}
    </select> : null}
  </div>;
}
