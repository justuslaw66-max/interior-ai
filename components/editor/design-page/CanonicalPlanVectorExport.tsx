"use client";

import { useState } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { PlanVectorExportOptions } from "@/lib/floor-plan-vector-export";
import type { PlanFurnitureDrawingSource } from "@/lib/floor-plan-vector-furniture";

export function CanonicalPlanVectorExport({ document, floorId, original, furniture }: { document: FloorPlanDocumentV2; floorId: string; original?: FloorPlanDocumentV2; furniture?: PlanFurnitureDrawingSource }) {
  const [options, setOptions] = useState<PlanVectorExportOptions>({ paper: "A4", orientation: "landscape", scale: 100 });
  const [dimensions, setDimensions] = useState(true);
  const [labels, setLabels] = useState(true);
  const [fixtures, setFixtures] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (format: "pdf" | "svg" | "original" | "proposed") => {
    setBusy(true); setMessage("");
    try {
      const { buildFloorPlanVectorDrawing } = await import("@/lib/floor-plan-vector-drawing");
      const { exportFloorPlanVectorPdf, exportFloorPlanVectorSvg } = await import("@/lib/floor-plan-vector-export");
      const drawing = buildFloorPlanVectorDrawing(format === "original" && original ? original : document, { floorId, dimensions, labels, fixtures }, format === "original" ? undefined : furniture);
      const warnings = drawing.unsupported.length ? `Unsupported details: ${drawing.unsupported.join("; ")}` : "";
      if (format === "original" || format === "proposed") {
        setPreview(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(await exportFloorPlanVectorSvg(drawing, options))}`);
        setMessage(`${format === "original" ? "Original planning reference" : "Current proposed geometry"}. ${warnings}`);
      } else {
        const content = format === "pdf" ? new Uint8Array(await exportFloorPlanVectorPdf(drawing, options)).buffer : await exportFloorPlanVectorSvg(drawing, options);
        const url = URL.createObjectURL(new Blob([content], { type: format === "pdf" ? "application/pdf" : "image/svg+xml" }));
        const link = window.document.createElement("a"); link.href = url; link.download = `proposed-plan-1-${options.scale}.${format}`; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage(warnings || "Vector drawing exported. Print at 100% for the declared scale.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Vector export failed."); }
    finally { setBusy(false); }
  };
  const field = "mt-1 w-full rounded border border-neutral-400 bg-transparent p-1.5";
  return <details className="mt-3 border-t border-neutral-300 pt-3"><summary className="cursor-pointer font-semibold">Compare and export vector plan</summary>
    <p className="my-2">Exports separate paths and editable text with embedded Liberation Sans. The original source image and private source metadata are excluded. Install <a className="underline" href="/fonts/liberation-sans/LiberationSans-Regular.ttf" download>Liberation Sans</a> if Illustrator requests font substitution. <a className="underline" href="/fonts/liberation-sans/OFL.txt">Font license</a></p>
    <div className="grid grid-cols-3 gap-2">
      <label>Paper<select className={field} value={options.paper} onChange={(event) => setOptions({ ...options, paper: event.target.value === "A3" ? "A3" : "A4" })}><option>A4</option><option>A3</option></select></label>
      <label>Orientation<select className={field} value={options.orientation} onChange={(event) => setOptions({ ...options, orientation: event.target.value === "portrait" ? "portrait" : "landscape" })}><option>landscape</option><option>portrait</option></select></label>
      <label>Scale<select className={field} value={options.scale} onChange={(event) => setOptions({ ...options, scale: event.target.value === "50" ? 50 : 100 })}><option value="50">1:50</option><option value="100">1:100</option></select></label>
    </div>
    <div className="my-2 flex flex-wrap gap-3">{([['Dimensions', dimensions, setDimensions], ['Labels', labels, setLabels], ['Fixtures and furniture', fixtures, setFixtures]] as const).map(([text, value, change]) => <label key={text} className="flex items-center gap-1"><input type="checkbox" checked={value} onChange={(event) => change(event.target.checked)} />{text}</label>)}</div>
    <div className="flex flex-wrap gap-2">{([['PDF', 'pdf'], ['SVG', 'svg'], ['View proposed', 'proposed'], ...(original ? [['View original', 'original'] as const] : [])] as const).map(([label, format]) => <button key={format} type="button" className="rounded border border-neutral-400 px-2 py-1.5 disabled:opacity-40" disabled={busy} onClick={() => void run(format)}>{label}</button>)}</div>
    <p role="status" className="my-2">{message}</p>
    {preview ? <object aria-label="Plan comparison drawing" type="image/svg+xml" data={preview} className="w-full bg-white" /> : null}
  </details>;
}
