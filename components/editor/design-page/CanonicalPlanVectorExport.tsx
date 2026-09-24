"use client";

import { useState } from "react";
import type { PlanVectorExportOptions } from "@/lib/floor-plan-vector-export";
import { useCanonicalPlanVectorExport, type CanonicalPlanVectorExportProps } from "./useCanonicalPlanVectorExport";

export function CanonicalPlanVectorExport(props: CanonicalPlanVectorExportProps) {
  const [options, setOptions] = useState<PlanVectorExportOptions>({ paper: "A4", orientation: "landscape", scale: 100 });
  const [dimensions, setDimensions] = useState(true);
  const [labels, setLabels] = useState(true);
  const [fixtures, setFixtures] = useState(true);
  const [includedUnderlayId, setIncludedUnderlayId] = useState<string | null>(null);
  const available = props.underlay?.floorId === props.floorId ? props.underlay : null;
  const includeUnderlay = Boolean(available && includedUnderlayId === available.id);
  const { run, busy, message, preview } = useCanonicalPlanVectorExport(props, { options, dimensions, labels, fixtures, includeUnderlay });
  const field = "mt-1 w-full rounded border border-neutral-400 bg-transparent p-1.5";
  return <details className="mt-3 border-t border-neutral-300 pt-3"><summary className="cursor-pointer font-semibold">Compare and export vector plan</summary>
    <p className="my-2">Exports separate paths and editable text with embedded Liberation Sans. The source image is excluded by default. Install <a className="underline" href="/fonts/liberation-sans/LiberationSans-Regular.ttf" download>Liberation Sans</a> if Illustrator requests font substitution. <a className="underline" href="/fonts/liberation-sans/OFL.txt">Font license</a></p>
    <fieldset disabled={busy}>
    <div className="grid grid-cols-3 gap-2">
      <label>Paper<select className={field} value={options.paper} onChange={(event) => setOptions({ ...options, paper: event.target.value === "A3" ? "A3" : "A4" })}><option>A4</option><option>A3</option></select></label>
      <label>Orientation<select className={field} value={options.orientation} onChange={(event) => setOptions({ ...options, orientation: event.target.value === "portrait" ? "portrait" : "landscape" })}><option>landscape</option><option>portrait</option></select></label>
      <label>Scale<select className={field} value={options.scale} onChange={(event) => setOptions({ ...options, scale: event.target.value === "50" ? 50 : 100 })}><option value="50">1:50</option><option value="100">1:100</option></select></label>
    </div>
    <div className="my-2 flex flex-wrap gap-3">{([['Dimensions', dimensions, setDimensions], ['Labels', labels, setLabels], ['Fixtures and furniture', fixtures, setFixtures]] as const).map(([text, value, change]) => <label key={text} className="flex items-center gap-1"><input type="checkbox" checked={value} onChange={(event) => change(event.target.checked)} />{text}</label>)}</div>
    {available ? <label className="my-2 flex items-center gap-1"><input type="checkbox" checked={includeUnderlay} onChange={(event) => setIncludedUnderlayId(event.target.checked ? available.id : null)} />Floor plan image</label> : null}
    {includeUnderlay ? <p className="mb-2">Includes the source image as separate raster artwork behind the vectors, at its current placement and opacity. Visible names and old markings in the image will be included; they are historical reference, not proposed geometry.</p> : null}
    </fieldset>
    <div className="flex flex-wrap gap-2">{([['PDF', 'pdf'], ['SVG', 'svg'], ['View proposed', 'proposed'], ...(props.original ? [['View original', 'original'] as const] : [])] as const).map(([label, format]) => <button key={format} type="button" className="rounded border border-neutral-400 px-2 py-1.5 disabled:opacity-40" disabled={busy} onClick={() => void run(format)}>{label}</button>)}</div>
    <p role="status" className="my-2">{message}</p>
    {preview ? <object aria-label="Plan comparison drawing" type="image/svg+xml" data={preview} className="w-full bg-white" /> : null}
  </details>;
}
