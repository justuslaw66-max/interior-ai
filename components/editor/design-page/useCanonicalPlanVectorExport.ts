import { useEffect, useRef, useState } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { PlanVectorExportOptions } from "@/lib/floor-plan-vector-export";
import type { PlanFurnitureDrawingSource } from "@/lib/floor-plan-vector-furniture";
import type { FloorPlanUnderlay } from "@/lib/floor-plan-types";

export type CanonicalPlanVectorExportSource = { furniture?: PlanFurnitureDrawingSource; underlay?: FloorPlanUnderlay | null; sourceJobId?: string };
export type CanonicalPlanVectorExportProps = CanonicalPlanVectorExportSource & { document: FloorPlanDocumentV2; floorId: string; original?: FloorPlanDocumentV2 };
type Selection = { options: PlanVectorExportOptions; dimensions: boolean; labels: boolean; fixtures: boolean; includeUnderlay: boolean };
type Format = "pdf" | "svg" | "original" | "proposed";

async function renderExport(props: CanonicalPlanVectorExportProps, selection: Selection, format: Format, signal: AbortSignal) {
  const { document, floorId, original, furniture, underlay, sourceJobId } = props;
  const { buildFloorPlanVectorDrawing } = await import("@/lib/floor-plan-vector-drawing");
  const { exportFloorPlanVectorPdf, exportFloorPlanVectorSvg } = await import("@/lib/floor-plan-vector-export");
  const { options, dimensions, labels, fixtures } = selection;
  const drawing = buildFloorPlanVectorDrawing(format === "original" && original ? original : document, { floorId, dimensions, labels, fixtures }, format === "original" ? undefined : furniture);
  const resources = selection.includeUnderlay && underlay ? { underlay: await (await import("@/lib/floor-plan-vector-underlay-source")).loadVectorUnderlay(underlay, floorId, signal, sourceJobId) } : {};
  const content = format === "pdf" ? await exportFloorPlanVectorPdf(drawing, options, resources) : await exportFloorPlanVectorSvg(drawing, options, resources);
  if (resources.underlay && underlay) await (await import("@/lib/floor-plan-vector-underlay-source")).confirmVectorUnderlayAccess(underlay, signal, sourceJobId);
  return { content, warnings: drawing.unsupported.length ? `Unsupported details: ${drawing.unsupported.join("; ")}` : "" };
}

function download(content: string | Uint8Array, format: "pdf" | "svg", scale: number) {
  const bytes = typeof content === "string" ? content : new Uint8Array(content).buffer;
  const url = URL.createObjectURL(new Blob([bytes], { type: format === "pdf" ? "application/pdf" : "image/svg+xml" }));
  const link = document.createElement("a"); link.href = url; link.download = `proposed-plan-1-${scale}.${format}`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useCanonicalPlanVectorExport(props: CanonicalPlanVectorExportProps, selection: Selection) {
  const { document, floorId, underlay, sourceJobId } = props;
  const [preview, setPreview] = useState<{ document: FloorPlanDocumentV2; floorId: string; underlay: typeof underlay; url: string } | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), [document, floorId, underlay, sourceJobId]);
  const run = async (format: Format) => {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setBusy(true); setMessage(""); setPreview(null);
    try {
      const { content, warnings } = await renderExport(props, selection, format, controller.signal);
      controller.signal.throwIfAborted();
      if (format === "original" || format === "proposed") {
        setPreview({ document, floorId, underlay, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(String(content))}` });
        setMessage(`${format === "original" ? "Original planning reference" : "Current proposed geometry"}. ${warnings}`);
      } else {
        download(content, format, selection.options.scale);
        setMessage(warnings || "Vector drawing exported. Print at 100% for the declared scale.");
      }
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Vector export failed.");
    } finally { if (pending.current === controller) setBusy(false); }
  };
  return { run, busy, message, preview: preview?.document === document && preview.floorId === floorId && preview.underlay === underlay ? preview.url : null };
}
