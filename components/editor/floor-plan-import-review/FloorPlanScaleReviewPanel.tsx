"use client";

import type {
  FloorPlanDocumentV2,
  FloorPlanSourceCalibrationV2,
} from "@/lib/floor-plan-document-v2";
import type { ReviewSourcePoint } from "@/lib/floor-plan-import-review-geometry";
import type { ConsumerFloorPlanImportJob } from "../floor-plan-import-ui-types";
import FloorPlanMeasurementInput from "./FloorPlanMeasurementInput";
import FloorPlanIndependentScaleReview from "./FloorPlanIndependentScaleReview";
import { useFloorPlanScaleReview } from "./useFloorPlanScaleReview";

type RenderedPage = ConsumerFloorPlanImportJob["renderedPagesJson"][number];

export type FloorPlanScaleReviewPanelProps = {
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

export default function FloorPlanScaleReviewPanel(props: FloorPlanScaleReviewPanelProps) {
  const {
    document, floorId, page, calibration, pickingScale, scalePoints,
    onPickingScaleChange, onScalePointsChange, onChange, onError,
    openByDefault = false, dark, disabled,
  } = props;
  const { input, printedMm, hasConflict, mode, setMode, floor, canMapExistingVertices, scale, apply, canApply,
    firstVertexId, setFirstVertexId, secondVertexId, setSecondVertexId } = useFloorPlanScaleReview(props);
  const control = dark
    ? "designer-control rounded-md border px-2 py-1.5 text-xs"
    : "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs";
  const subtle = dark ? "text-neutral-400" : "text-neutral-600";

  return (
    <details data-review-controls="scale" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3" open={openByDefault || !calibration || hasConflict}>
      <summary className="cursor-pointer text-sm font-semibold">
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white">1</span>
        Set and check scale
        <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${
          hasConflict ? "bg-red-100 text-red-800" : calibration
            ? "bg-emerald-100 text-emerald-800"
            : "bg-blue-100 text-blue-800"
        }`}>
          {hasConflict ? "Scale conflict" : calibration ? "Set" : "Start here"}
        </span>
      </summary>
      {calibration && <div className="mt-2 flex gap-2">
        {(["set", "check"] as const).map((value) => <button key={value} type="button" className={control}
          aria-pressed={mode === value} disabled={disabled} onClick={() => {
            setMode(value); onScalePointsChange([]); onPickingScaleChange(false);
          }}>{value === "set" ? "Set scale" : "Cross-check scale"}</button>)}
      </div>}
      {mode === "check" && calibration ? <FloorPlanIndependentScaleReview
        document={document} floorId={floorId} calibration={calibration} scalePoints={scalePoints}
        onScalePointsChange={onScalePointsChange} onPickingScaleChange={onPickingScaleChange}
        onChange={onChange} onError={onError} disabled={disabled} control={control} /> : <div className="mt-2 grid gap-2">
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
        <FloorPlanMeasurementInput input={input} control={control} disabled={disabled} />
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
          disabled={!canApply}
          onClick={apply}
        >
          {calibration
            ? "Update measurement"
            : canMapExistingVertices
              ? "Apply measurement"
              : "Use this measurement"}
        </button>
      </div>}
    </details>
  );
}
