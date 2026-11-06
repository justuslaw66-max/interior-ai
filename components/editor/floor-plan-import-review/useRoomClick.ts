"use client";

import { useRef, useState } from "react";
import type { FloorPlanAnnotationV2, FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanRenderedPage } from "@/lib/floor-plan-imports/types";
import type { ReviewSourcePoint } from "@/lib/floor-plan-import-review-geometry";
import { isFinalSourceTrace } from "@/lib/floor-plan-source-trace";
import { findRoomAtClick, type FoundRoom } from "@/lib/floor-plan-review-room-click";
import { drawingInk, pictureInk, type InkMask } from "@/lib/floor-plan-review-room-mask";

export type RoomClick = ReturnType<typeof useRoomClick>;
/** A found room, with the page it was found on. */
export type PageRoom = FoundRoom & { pageNumber: number };

async function pagePicture(url: string) {
  const picture = new Image();
  picture.src = url;
  await picture.decode();
  return picture;
}

/** What the clean drawing's mask depends on: its shapes and where their points are (an edited trace draws anew). */
function traceKey(trace: FloorPlanAnnotationV2[]) {
  let hash = trace.length;
  for (const annotation of trace) {
    const points = annotation.geometry.kind === "source_drawing" ? annotation.geometry.points : [];
    for (const point of points) hash = (Math.imul(hash, 31) + Math.round(point.x * 8) * 7919 + Math.round(point.y * 8)) | 0;
  }
  return `${trace.length}:${hash}`;
}

/** Lets the browser show "Finding the room…" before the work starts. */
const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

/**
 * "Click inside a room": while `picking`, a click on the page finds the room around it from the page's clean drawing
 * (else from the page picture) and holds it as `found` until it is added or cleared. The ink is drawn once per page.
 * A click's result that comes back after the person has cleared it, stopped, or moved to another page is dropped.
 */
export function useRoomClick(input: {
  document: FloorPlanDocumentV2; floorId: string | undefined; sourceId: string; page: FloorPlanRenderedPage | null;
  jobId: string; assetRoutePrefix?: string;
}) {
  const [picking, setPicking] = useState(false);
  const [found, setFound] = useState<PageRoom | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ink = useRef<{ key: string; mask: InkMask | null } | null>(null);
  const request = useRef(0);
  const { document, sourceId, page } = input;
  const floorId = input.floorId ?? "";
  // The same owner-scoped picture the review shows (FloorPlanSourceReviewCanvas).
  const assetUrl = page ? `${input.assetRoutePrefix ?? `/api/floor-plan-imports/${encodeURIComponent(input.jobId)}/assets`}/${encodeURIComponent(page.assetKey)}` : null;

  const maskFor = async (target: FloorPlanRenderedPage) => {
    const floor = document.floors.find((entry) => entry.id === floorId);
    const trace = (floor?.annotations ?? []).filter((annotation) => isFinalSourceTrace(annotation) &&
      annotation.geometry.kind === "source_drawing" && annotation.geometry.sourceId === sourceId &&
      annotation.geometry.pageNumber === target.pageNumber);
    const key = `${sourceId}:${target.pageNumber}:${trace.length ? traceKey(trace) : assetUrl}`;
    if (ink.current?.key === key) return ink.current.mask;
    const mask = trace.length ? drawingInk(trace, target.widthPx, target.heightPx)
      : assetUrl ? pictureInk(await pagePicture(assetUrl), target.widthPx, target.heightPx) : null;
    ink.current = { key, mask };
    return mask;
  };

  const click = async (point: ReviewSourcePoint) => {
    if (!page || busy) return;
    const ticket = ++request.current;
    setBusy(true);
    try {
      await nextPaint();
      const mask = await maskFor(page);
      const result = mask
        ? findRoomAtClick({ document, floorId, sourceId, pageNumber: page.pageNumber, mask, point })
        : { ok: false as const, message: "The plan's drawing is not available to read rooms from here." };
      if (ticket !== request.current) return;
      setFound(result.ok ? { ...result.room, pageNumber: page.pageNumber } : null);
      setMessage(result.ok ? null : result.message);
    } catch {
      if (ticket !== request.current) return;
      setFound(null);
      setMessage("The room could not be read from the drawing here. Outline it corner by corner instead.");
    } finally {
      setBusy(false);
    }
  };

  const clear = () => { request.current += 1; setFound(null); setMessage(null); };
  const choose = (value: boolean) => { setPicking(value); if (!value) clear(); };
  return { picking, choose, found, message, busy, click, clear };
}

/** The canvas's room props: a found room's corners show as the outline; clicks go to the room click while it picks. */
export function roomCanvasProps(roomClick: RoomClick, pickingRoom: boolean, roomPoints: ReviewSourcePoint[],
  addPoint: (point: ReviewSourcePoint) => void) {
  return {
    pickingRoom: pickingRoom || roomClick.picking,
    roomPoints: roomClick.found?.corners ?? roomPoints,
    onRoomPoint: (point: ReviewSourcePoint) => (roomClick.picking ? void roomClick.click(point) : addPoint(point)),
  };
}
