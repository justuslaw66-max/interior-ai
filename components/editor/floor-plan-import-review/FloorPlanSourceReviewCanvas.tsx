"use client";

import { useMemo, useState, type MouseEvent } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  buildReviewOverlay,
  snapReviewSourcePoint,
  type ReviewSourcePoint,
  type ReviewSourceSnapResult,
} from "@/lib/floor-plan-import-review-geometry";
import FloorPlanSourceReviewOverlay from "./FloorPlanSourceReviewOverlay";
import FloorPlanSourceArtworkSelection from "./FloorPlanSourceArtworkFields";
import type { ConsumerFloorPlanImportJob } from "../floor-plan-import-ui-types";
import { useFloorPlanReviewZoom } from "./useFloorPlanReviewZoom";
import { FloorPlanReviewZoomControls } from "./FloorPlanReviewZoomControls";
import { sourceDrawingSvgPoints as polygonPoints } from "@/lib/floor-plan-source-drawing";
import { useSourceReviewLayers } from "./useSourceReviewLayers";

type FloorPlanSourceReviewCanvasProps = {
  document: FloorPlanDocumentV2;
  floorId: string;
  sourceId: string;
  jobId: string;
  adapterId: string | null;
  pages: ConsumerFloorPlanImportJob["renderedPagesJson"];
  pageNumber: number;
  onPageNumberChange: (value: number) => void;
  focusedEntityIds: string[];
  pickingScale: boolean;
  scalePoints: ReviewSourcePoint[];
  onSourcePoint: (point: ReviewSourcePoint) => void;
  onUseScaleEndpoints?: (points: ReviewSourcePoint[]) => void;
  pickingRoom?: boolean;
  roomPoints?: ReviewSourcePoint[];
  onRoomPoint?: (point: ReviewSourcePoint) => void;
  pickingOpening?: boolean;
  openingPoints?: ReviewSourcePoint[];
  onOpeningPoint?: (point: ReviewSourcePoint) => void;
  assetRoutePrefix?: string;
  dark?: boolean;
  onDocumentChange?: (document: FloorPlanDocumentV2) => void;
  disabled?: boolean;
  previewOnly?: boolean;
};

export default function FloorPlanSourceReviewCanvas({
  document,
  floorId,
  sourceId,
  jobId,
  adapterId,
  pages,
  pageNumber,
  onPageNumberChange,
  focusedEntityIds,
  pickingScale,
  scalePoints, onSourcePoint, onUseScaleEndpoints,
  pickingRoom = false,
  roomPoints = [],
  onRoomPoint,
  pickingOpening = false,
  openingPoints = [],
  onOpeningPoint,
  assetRoutePrefix,
  dark = false,
  onDocumentChange,
  disabled = false,
  previewOnly = false,
}: FloorPlanSourceReviewCanvasProps) {
  const [sourceOpacity, setSourceOpacity] = useState(82);
  const [overlayOpacity, setOverlayOpacity] = useState(92);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [hoverSnap, setHoverSnap] = useState<ReviewSourceSnapResult | null>(null);
  const page =
    pages.find((item) => item.pageNumber === pageNumber) ?? pages[0] ?? null;
  const { zoom, setZoom, scrollRef, svgRef } = useFloorPlanReviewZoom(focusedEntityIds, page, `${jobId}:${floorId}:${sourceId}`);
  const overlay = useMemo(
    () =>
      page
        ? buildReviewOverlay({
            document,
            floorId,
            sourceId,
            pageNumber: page.pageNumber,
          })
        : null,
    [document, floorId, page, sourceId]
  );
  const focused = useMemo(
    () => new Set(focusedEntityIds),
    [focusedEntityIds]
  );
  const sourceReview = useSourceReviewLayers(document, floorId, sourceId, page?.pageNumber, focused);

  if (!page) {
    return (
      <div
        className={
          dark
            ? "mt-2 rounded-md bg-white/5 p-2 text-[10px] text-neutral-300"
            : "mt-2 rounded-md bg-neutral-100 p-2 text-[10px] text-neutral-600"
        }
      >
        No durable source preview is available. Keep the underlay and use guided
        tracing.
      </div>
    );
  }

  const assetUrl = `${
    assetRoutePrefix ??
    `/api/floor-plan-imports/${encodeURIComponent(jobId)}/assets`
  }/${encodeURIComponent(page.assetKey)}`;
  const pointFromEvent = (event: MouseEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    const point: ReviewSourcePoint = {
      x:
        Math.round(
          ((event.clientX - bounds.left) / bounds.width) * page.widthPx * 10
        ) / 10,
      y:
        Math.round(
          ((event.clientY - bounds.top) / bounds.height) * page.heightPx * 10
        ) / 10,
    };
    if (!snapEnabled) {
      return { point, kind: "none", label: null } satisfies ReviewSourceSnapResult;
    }
    return snapReviewSourcePoint({
      point,
      pageWidthPx: page.widthPx,
      pageHeightPx: page.heightPx,
      viewportWidthPx: bounds.width,
      viewportHeightPx: bounds.height,
      candidates: overlay?.vertices ?? [],
      previousPoint: pickingRoom
        ? (roomPoints.at(-1) ?? null)
        : pickingOpening
          ? (openingPoints.at(-1) ?? null)
          : null,
    });
  };
  const onCanvasClick = (event: MouseEvent<SVGSVGElement>) => {
    if (!pickingScale && !pickingRoom && !pickingOpening) return;
    const snap = pointFromEvent(event);
    if (!snap) return;
    if (pickingScale) onSourcePoint(snap.point);
    else if (pickingRoom) onRoomPoint?.(snap.point);
    else onOpeningPoint?.(snap.point);
  };
  const isCad = Boolean(adapterId && /(dxf|ifc|dwg)/i.test(adapterId));
  const picking = pickingScale || pickingRoom || pickingOpening;
  const lensSize = Math.max(
    60,
    Math.min(page.widthPx, page.heightPx) / 12
  );
  const lensX = hoverSnap
    ? Math.max(
        0,
        Math.min(page.widthPx - lensSize, hoverSnap.point.x - lensSize / 2)
      )
    : 0;
  const lensY = hoverSnap
    ? Math.max(
        0,
        Math.min(page.heightPx - lensSize, hoverSnap.point.y - lensSize / 2)
      )
    : 0;

  return (
    <section className="mt-3" aria-label="Interactive 2D plan preview">
      <FloorPlanSourceArtworkSelection {...sourceReview} count={sourceReview.artwork.length} visibleCount={sourceReview.visible.length}
        document={document} floorId={floorId} onChange={onDocumentChange}
        onClose={() => sourceReview.select("")} onUseScaleEndpoints={onUseScaleEndpoints}
        disabled={disabled} previewOnly={previewOnly} />
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">2D plan preview</div>
          <div
            className={dark ? "text-xs text-neutral-400" : "text-xs text-neutral-600"}
          >
            {overlay
              ? "Source registration is available. Review any recovered outlines against the uploaded plan."
              : "Your selected measurements and room corners will appear here."}
          </div>
        </div>
        <FloorPlanReviewZoomControls zoom={zoom} setZoom={setZoom} pages={pages} pageNumber={page.pageNumber} dark={dark}
          onPageNumberChange={(value) => { setHoverSnap(null); onPageNumberChange(value); }} />
      </div>
      <figure
        className={
          dark
            ? "overflow-hidden rounded-md border border-white/10 bg-white"
            : "overflow-hidden rounded-md border border-neutral-200 bg-white"
        }
      >
        <div className="relative">
          <div ref={scrollRef} data-testid="source-review-scroll" className="max-h-[72vh] overflow-auto bg-neutral-100">
            <div
              className="relative origin-top-left bg-white"
              style={{
                aspectRatio: `${page.widthPx} / ${page.heightPx}`,
                width: `${zoom * 100}%`,
              }}
            >
          {/* This owner-scoped URL verifies both job and derivative IDs. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={
              isCad
                ? "Deterministic CAD linework preview"
                : "Uploaded floor plan source"
            }
            className="absolute inset-0 h-full w-full select-none"
            draggable={false}
            style={{ opacity: sourceOpacity / 100 }}
            src={assetUrl}
          />
          <svg
            ref={svgRef}
            aria-label={
              pickingScale
                ? "Pick scale points on the source drawing"
                : pickingRoom
                  ? "Trace room corners on the source drawing"
                  : pickingOpening
                    ? "Pick both ends of an opening on the source drawing"
                  : "Canonical candidate overlay"
            }
            className={
              picking
                ? "absolute inset-0 h-full w-full cursor-crosshair"
                : "pointer-events-none absolute inset-0 h-full w-full"
            }
            onClick={onCanvasClick}
            onMouseLeave={() => setHoverSnap(null)}
            onMouseMove={(event) =>
              setHoverSnap(picking ? pointFromEvent(event) : null)
            }
            preserveAspectRatio="none"
            role="group"
            viewBox={`0 0 ${page.widthPx} ${page.heightPx}`}
          >
            <FloorPlanSourceReviewOverlay overlay={overlay} focused={focused} pickingRoom={pickingRoom}
              opacity={overlayOpacity / 100} annotations={sourceReview.visible} selectedId={sourceReview.selectedId}
              picking={picking} onSelect={sourceReview.select} />
            {scalePoints.map((point, index) => (
              <g key={`${point.x}-${point.y}-${index}`}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  fill={index ? "#2563eb" : "#dc2626"}
                  r={7}
                  stroke="#fff"
                  strokeWidth={3}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={point.x + 9}
                  y={point.y - 9}
                  fill="#111827"
                  fontSize={16}
                  fontWeight={700}
                  paintOrder="stroke"
                  stroke="#fff"
                  strokeWidth={4}
                >
                  {index + 1}
                </text>
              </g>
            ))}
            {roomPoints.length ? (
              <g>
                <polyline
                  fill={roomPoints.length >= 3 ? "rgba(37,99,235,.12)" : "none"}
                  points={polygonPoints(roomPoints)}
                  stroke="#2563eb"
                  strokeDasharray="7 5"
                  strokeWidth={3}
                  vectorEffect="non-scaling-stroke"
                />
                {roomPoints.map((point, index) => (
                  <g key={`room-${point.x}-${point.y}-${index}`}>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      fill="#2563eb"
                      r={6}
                      stroke="#fff"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      fill="#1e3a8a"
                      fontSize={14}
                      fontWeight={700}
                      paintOrder="stroke"
                      stroke="#fff"
                      strokeWidth={4}
                      x={point.x + 8}
                      y={point.y - 8}
                    >
                      {index + 1}
                    </text>
                  </g>
                ))}
              </g>
            ) : null}
            {openingPoints.length ? (
              <g>
                <polyline
                  fill="none"
                  points={polygonPoints(openingPoints)}
                  stroke="#ea580c"
                  strokeWidth={5}
                  vectorEffect="non-scaling-stroke"
                />
                {openingPoints.map((point, index) => (
                  <g key={`opening-${point.x}-${point.y}-${index}`}>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      fill="#ea580c"
                      r={7}
                      stroke="#fff"
                      strokeWidth={3}
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      fill="#9a3412"
                      fontSize={14}
                      fontWeight={700}
                      paintOrder="stroke"
                      stroke="#fff"
                      strokeWidth={4}
                      x={point.x + 9}
                      y={point.y - 9}
                    >
                      {index + 1}
                    </text>
                  </g>
                ))}
              </g>
            ) : null}
            {hoverSnap && picking ? (
              <g pointerEvents="none">
                {hoverSnap.kind === "aligned_x" ? (
                  <line
                    stroke="#7c3aed"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    x1={hoverSnap.point.x}
                    x2={hoverSnap.point.x}
                    y1={0}
                    y2={page.heightPx}
                  />
                ) : null}
                {hoverSnap.kind === "aligned_y" ? (
                  <line
                    stroke="#7c3aed"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    x1={0}
                    x2={page.widthPx}
                    y1={hoverSnap.point.y}
                    y2={hoverSnap.point.y}
                  />
                ) : null}
                <circle
                  cx={hoverSnap.point.x}
                  cy={hoverSnap.point.y}
                  fill="rgba(124,58,237,.16)"
                  r={10}
                  stroke="#7c3aed"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ) : null}
          </svg>
            </div>
          </div>
          {hoverSnap && picking ? (
            <div className="pointer-events-none absolute right-3 top-3 hidden w-40 overflow-hidden rounded-lg border-2 border-violet-600 bg-white shadow-xl sm:block">
              <svg
                aria-label="Magnified selection area"
                className="block aspect-square w-full bg-white"
                preserveAspectRatio="xMidYMid slice"
                viewBox={`${lensX} ${lensY} ${lensSize} ${lensSize}`}
              >
                <image
                  height={page.heightPx}
                  href={assetUrl}
                  opacity={sourceOpacity / 100}
                  width={page.widthPx}
                />
                <line
                  stroke="#7c3aed"
                  strokeWidth={Math.max(1, lensSize / 100)}
                  x1={hoverSnap.point.x - lensSize / 8}
                  x2={hoverSnap.point.x + lensSize / 8}
                  y1={hoverSnap.point.y}
                  y2={hoverSnap.point.y}
                />
                <line
                  stroke="#7c3aed"
                  strokeWidth={Math.max(1, lensSize / 100)}
                  x1={hoverSnap.point.x}
                  x2={hoverSnap.point.x}
                  y1={hoverSnap.point.y - lensSize / 8}
                  y2={hoverSnap.point.y + lensSize / 8}
                />
                <circle
                  cx={hoverSnap.point.x}
                  cy={hoverSnap.point.y}
                  fill="none"
                  r={lensSize / 14}
                  stroke="#7c3aed"
                  strokeWidth={Math.max(1, lensSize / 100)}
                />
              </svg>
              <div className="border-t bg-white px-2 py-1 text-center text-[10px] font-semibold text-violet-800">
                {hoverSnap.label ?? "Magnified selection"}
              </div>
            </div>
          ) : null}
        </div>
        <figcaption className="border-t border-neutral-200 px-2 py-1.5 text-[10px] text-neutral-600">
          {isCad
            ? "CAD lines remain a reference until you confirm them."
            : "Green: proposed walls. Blue: proposed openings and selected measurements. Orange: opening being marked. Purple: source evidence needing review."}
        </figcaption>
      </figure>
      <details className="mt-2 text-[10px] text-neutral-600">
        <summary className="cursor-pointer">Display options</summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="col-span-2 flex items-center gap-2 rounded border bg-white p-2">
            <input
              checked={snapEnabled}
              onChange={(event) => setSnapEnabled(event.target.checked)}
              type="checkbox"
            />
            Snap to saved corners and straight lines
          </label>
          <label>
            Uploaded plan {sourceOpacity}%
            <input
              aria-label="Uploaded plan opacity"
              className="block w-full accent-emerald-600"
              type="range"
              min={10}
              max={100}
              value={sourceOpacity}
              onChange={(event) => setSourceOpacity(Number(event.target.value))}
            />
          </label>
          <label>
            Saved outlines {overlayOpacity}%
            <input
              aria-label="Saved outlines opacity"
              className="block w-full accent-emerald-600"
              type="range"
              min={10}
              max={100}
              value={overlayOpacity}
              onChange={(event) => setOverlayOpacity(Number(event.target.value))}
            />
          </label>
        </div>
      </details>
    </section>
  );
}
