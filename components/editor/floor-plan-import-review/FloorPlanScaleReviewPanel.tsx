"use client";

import { useMemo, useState } from "react";
import type {
  FloorPlanDocumentV2,
  FloorPlanSourceCalibrationV2,
} from "@/lib/floor-plan-document-v2";
import {
  analyzePointScale,
  applyPointScaleCalibration,
  registerEmptyPlanScaleCalibration,
  registerPointScaleCalibration,
  type ReviewSourcePoint,
} from "@/lib/floor-plan-import-review-geometry";
import type { ConsumerFloorPlanImportJob } from "../floor-plan-import-ui-types";

type RenderedPage = ConsumerFloorPlanImportJob["renderedPagesJson"][number];

type FloorPlanScaleReviewPanelProps = {
  document: FloorPlanDocumentV2;
  floorId: string;
  sourceId: string;
  page: RenderedPage | null;
  calibration: FloorPlanSourceCalibrationV2 | undefined;
  pickingScale: boolean;
  scalePoints: ReviewSourcePoint[];
  onPickingScaleChange: (value: boolean) => void;
  onScalePointsChange: (value: ReviewSourcePoint[]) => void;
  onChange: (value: FloorPlanDocumentV2) => void;
  onError: (message: string | null) => void;
  openByDefault?: boolean;
  dark: boolean;
  disabled: boolean;
};

export default function FloorPlanScaleReviewPanel({
  document,
  floorId,
  sourceId,
  page,
  calibration,
  pickingScale,
  scalePoints,
  onPickingScaleChange,
  onScalePointsChange,
  onChange,
  onError,
  openByDefault = false,
  dark,
  disabled,
}: FloorPlanScaleReviewPanelProps) {
  const [printedMm, setPrintedMm] = useState(3000);
  const [firstVertexId, setFirstVertexId] = useState("");
  const [secondVertexId, setSecondVertexId] = useState("");
  const floor = document.floors.find((entry) => entry.id === floorId);
  const canMapExistingVertices = (floor?.vertices.length ?? 0) >= 2;
  const scale = useMemo(
    () =>
      page
        ? analyzePointScale({
            first: scalePoints[0] ?? null,
            second: scalePoints[1] ?? null,
            printedMm,
            pageWidthPx: page.widthPx,
            pageHeightPx: page.heightPx,
            calibration,
          })
        : null,
    [calibration, page, printedMm, scalePoints]
  );
  const control = dark
    ? "designer-control rounded-md border px-2 py-1.5 text-xs"
    : "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs";
  const subtle = dark ? "text-neutral-400" : "text-neutral-600";

  return (
    <details className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3" open={openByDefault || !calibration}>
      <summary className="cursor-pointer text-sm font-semibold">
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white">1</span>
        Set one real measurement
        <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${
          calibration
            ? "bg-emerald-100 text-emerald-800"
            : "bg-blue-100 text-blue-800"
        }`}>
          {calibration ? "Set" : "Start here"}
        </span>
      </summary>
      <div className="mt-2 grid gap-2">
        <p className={`text-[10px] leading-4 ${subtle}`}>
          Find a printed measurement such as 2890. Select both ends of that
          measurement on the plan, then enter the number exactly as printed.
        </p>
        <button
          type="button"
          className={control}
          disabled={disabled || !page}
          onClick={() => {
            onPickingScaleChange(!pickingScale);
            if (scalePoints.length >= 2) onScalePointsChange([]);
          }}
        >
          {pickingScale
            ? "Selecting points — click twice on the plan"
            : scalePoints.length === 2
              ? "Choose different points"
              : "Choose the two endpoints on the plan"}
        </button>
        <label className={`text-[10px] ${subtle}`}>
          Printed measurement (mm)
          <input
            className={`${control} mt-1 w-full`}
            min={100}
            step={1}
            type="number"
            value={printedMm}
            onChange={(event) => setPrintedMm(Number(event.target.value))}
          />
        </label>
        {!calibration && floor && canMapExistingVertices ? (
          <div className="grid grid-cols-2 gap-2">
            <label className={`text-[10px] ${subtle}`}>
              First selected point matches
              <select
                className={`${control} mt-1 w-full`}
                value={firstVertexId}
                onChange={(event) => setFirstVertexId(event.target.value)}
              >
                <option value="">Matching wall corner…</option>
                {floor.vertices.map((vertex) => (
                  <option key={vertex.id} value={vertex.id}>
                    {vertex.id} ({vertex.xMm}, {vertex.zMm})
                  </option>
                ))}
              </select>
            </label>
            <label className={`text-[10px] ${subtle}`}>
              Second selected point matches
              <select
                className={`${control} mt-1 w-full`}
                value={secondVertexId}
                onChange={(event) => setSecondVertexId(event.target.value)}
              >
                <option value="">Matching wall corner…</option>
                {floor.vertices.map((vertex) => (
                  <option key={vertex.id} value={vertex.id}>
                    {vertex.id} ({vertex.xMm}, {vertex.zMm})
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        <div className="rounded bg-white p-2 text-[10px] leading-4 text-neutral-600">
          {scalePoints.length !== 2
            ? "No measurement selected yet."
            : scale?.measurementValid
              ? `Measurement selected. The plan will use ${Math.round(printedMm)} mm.`
              : scale?.message}
          {scale?.residualPercent !== null && scale?.residualPercent !== undefined ? (
            <details className="mt-1">
              <summary className="cursor-pointer">Show scale comparison</summary>
              <p className="mt-1">
                Current difference: {scale.residualMm?.toFixed(0)} mm (
                {scale.residualPercent.toFixed(2)}%).
              </p>
            </details>
          ) : null}
        </div>
        {!calibration && (floor?.vertices.length ?? 0) < 2 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[10px] leading-4 text-amber-900">
            Automatic wall detection was empty. That is okay—set this
            measurement first, then outline the rooms in Step 2.
          </div>
        ) : null}
        <button
          type="button"
          className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          disabled={
            disabled ||
            !page ||
            scalePoints.length !== 2 ||
            (calibration
              ? !scale?.valid
              : !scale?.measurementValid ||
                (canMapExistingVertices &&
                  (!firstVertexId ||
                    !secondVertexId ||
                    firstVertexId === secondVertexId)))
          }
          onClick={() => {
            if (!page || scalePoints.length !== 2) return;
            try {
              onError(null);
              onChange(
                calibration
                  ? applyPointScaleCalibration({
                      document,
                      floorId,
                      sourceId,
                      pageNumber: page.pageNumber,
                      pageWidthPx: page.widthPx,
                      pageHeightPx: page.heightPx,
                      first: scalePoints[0],
                      second: scalePoints[1],
                      printedMm,
                    })
                  : canMapExistingVertices
                    ? registerPointScaleCalibration({
                        document,
                        floorId,
                        sourceId,
                        pageNumber: page.pageNumber,
                        pageWidthPx: page.widthPx,
                        pageHeightPx: page.heightPx,
                        first: scalePoints[0],
                        second: scalePoints[1],
                        firstVertexId,
                        secondVertexId,
                        printedMm,
                      })
                    : registerEmptyPlanScaleCalibration({
                        document,
                        floorId,
                        sourceId,
                        pageNumber: page.pageNumber,
                        pageWidthPx: page.widthPx,
                        pageHeightPx: page.heightPx,
                        first: scalePoints[0],
                        second: scalePoints[1],
                        printedMm,
                      })
              );
              onPickingScaleChange(false);
            } catch (cause) {
              const validationIssues =
                cause &&
                typeof cause === "object" &&
                Array.isArray(
                  (cause as { issues?: unknown }).issues
                )
                  ? (
                      cause as {
                        issues: Array<{ code?: unknown; message?: unknown }>;
                      }
                    ).issues
                      .slice(0, 4)
                      .map((issue) =>
                        [issue.code, issue.message]
                          .filter((value) => typeof value === "string")
                          .join(": ")
                      )
                      .filter(Boolean)
                  : [];
              onError(
                validationIssues.length
                  ? validationIssues.join(" · ")
                  : cause instanceof Error
                    ? cause.message
                  : "Scale could not be applied."
              );
            }
          }}
        >
          {calibration
            ? "Update measurement"
            : canMapExistingVertices
              ? "Apply measurement"
              : "Use this measurement"}
        </button>
      </div>
    </details>
  );
}
