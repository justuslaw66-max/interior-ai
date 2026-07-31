"use client";

import { useMemo, useState, type MouseEvent } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  buildReviewOverlay,
  snapReviewSourcePoint,
  type ReviewSourcePoint,
  type ReviewSourceSnapResult,
} from "@/lib/floor-plan-import-review-geometry";
import type { ConsumerFloorPlanImportJob } from "../floor-plan-import-ui-types";

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
  pickingRoom?: boolean;
  roomPoints?: ReviewSourcePoint[];
  onRoomPoint?: (point: ReviewSourcePoint) => void;
  pickingOpening?: boolean;
  openingPoints?: ReviewSourcePoint[];
  onOpeningPoint?: (point: ReviewSourcePoint) => void;
  assetRoutePrefix?: string;
  dark?: boolean;
};

function polygonPoints(value: ReviewSourcePoint[]) {
  return value.map((point) => `${point.x},${point.y}`).join(" ");
}

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
  scalePoints,
  onSourcePoint,
  pickingRoom = false,
  roomPoints = [],
  onRoomPoint,
  pickingOpening = false,
  openingPoints = [],
  onOpeningPoint,
  assetRoutePrefix,
  dark = false,
}: FloorPlanSourceReviewCanvasProps) {
  const [sourceOpacity, setSourceOpacity] = useState(82);
  const [overlayOpacity, setOverlayOpacity] = useState(92);
  const [zoom, setZoom] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [hoverSnap, setHoverSnap] = useState<ReviewSourceSnapResult | null>(null);
  const page =
    pages.find((item) => item.pageNumber === pageNumber) ?? pages[0] ?? null;
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
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">2D plan preview</div>
          <div
            className={dark ? "text-xs text-neutral-400" : "text-xs text-neutral-600"}
          >
            {overlay
              ? "Saved room and wall outlines are shown over the uploaded plan."
              : "Your selected measurements and room corners will appear here."}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1 text-[10px]">
          <button
            aria-label="Zoom out"
            className="rounded border bg-white px-2 py-1 disabled:opacity-40"
            disabled={zoom <= 1}
            onClick={() => setZoom((current) => Math.max(1, current - 0.5))}
            type="button"
          >
            −
          </button>
          <span className="min-w-10 text-center font-medium">{Math.round(zoom * 100)}%</span>
          <button
            aria-label="Zoom in"
            className="rounded border bg-white px-2 py-1 disabled:opacity-40"
            disabled={zoom >= 4}
            onClick={() => setZoom((current) => Math.min(4, current + 0.5))}
            type="button"
          >
            +
          </button>
          <button
            className="rounded border bg-white px-2 py-1"
            onClick={() => setZoom(1)}
            type="button"
          >
            Fit
          </button>
          {pages.length > 1 ? (
            <select
              aria-label="Source page"
              className={
                dark
                  ? "designer-control rounded border px-1 py-1 text-[10px]"
                  : "rounded border border-neutral-300 bg-white px-1 py-1 text-[10px]"
              }
              value={page.pageNumber}
              onChange={(event) => {
                setZoom(1);
                setHoverSnap(null);
                onPageNumberChange(Number(event.target.value));
              }}
            >
              {pages.map((item) => (
                <option key={item.pageNumber} value={item.pageNumber}>
                  Page {item.pageNumber}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>
      <figure
        className={
          dark
            ? "overflow-hidden rounded-md border border-white/10 bg-white"
            : "overflow-hidden rounded-md border border-neutral-200 bg-white"
        }
      >
        <div className="relative">
          <div className="max-h-[72vh] overflow-auto bg-neutral-100">
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
            role="img"
            viewBox={`0 0 ${page.widthPx} ${page.heightPx}`}
          >
            <g fill="none" opacity={overlayOpacity / 100}>
              {overlay?.structures.map((path) => (
                <polygon
                  key={path.id}
                  fill={
                    focused.has(path.id)
                      ? "rgba(245,158,11,.28)"
                      : "rgba(245,158,11,.12)"
                  }
                  points={polygonPoints(path.points)}
                  stroke={focused.has(path.id) ? "#dc2626" : "#d97706"}
                  strokeWidth={focused.has(path.id) ? 4 : 2}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {overlay?.walls.map((path) => (
                <polyline
                  key={path.id}
                  points={polygonPoints(path.points)}
                  stroke={focused.has(path.id) ? "#dc2626" : "#059669"}
                  strokeWidth={focused.has(path.id) ? 5 : 2.5}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {overlay?.openings.map((path) => (
                <polyline
                  key={path.id}
                  points={polygonPoints(path.points)}
                  stroke={focused.has(path.id) ? "#dc2626" : "#2563eb"}
                  strokeWidth={focused.has(path.id) ? 7 : 4}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {overlay?.vertices
                .filter((point) => focused.has(point.id))
                .map((point) => (
                  <circle
                    key={point.id}
                    cx={point.x}
                    cy={point.y}
                    fill="#fff"
                    r={5}
                    stroke="#dc2626"
                    strokeWidth={3}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              {pickingRoom
                ? overlay?.vertices.map((point) => (
                    <circle
                      cx={point.x}
                      cy={point.y}
                      fill="white"
                      key={`snap-${point.id}`}
                      opacity={0.9}
                      r={5}
                      stroke="#059669"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))
                : null}
            </g>
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
            : "Blue marks rooms and measurements. Orange marks a new opening. Green lines are saved walls."}
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
