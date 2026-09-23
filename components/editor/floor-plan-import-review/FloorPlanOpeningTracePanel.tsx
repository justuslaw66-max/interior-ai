"use client";

import { useMemo, useState } from "react";
import type {
  FloorPlanDocumentV2,
  FloorPlanOpeningKindV2,
  FloorPlanSourceCalibrationV2,
} from "@/lib/floor-plan-document-v2";
import {
  analyzeSourceOpeningSpan,
  traceOpeningFromSourceSpan,
  type ReviewSourcePoint,
} from "@/lib/floor-plan-import-review-geometry";

type FloorPlanOpeningTracePanelProps = {
  document: FloorPlanDocumentV2;
  floorId: string;
  sourceId: string;
  pageNumber: number | null;
  calibration: FloorPlanSourceCalibrationV2 | undefined;
  pickingOpening: boolean;
  openingPoints: ReviewSourcePoint[];
  onPickingOpeningChange: (value: boolean) => void;
  onOpeningPointsChange: (value: ReviewSourcePoint[]) => void;
  onChange: (value: FloorPlanDocumentV2) => void;
  onError: (message: string | null) => void;
  dark: boolean;
  disabled: boolean;
};

const OPENING_TYPES: ReadonlyArray<{
  value: FloorPlanOpeningKindV2;
  label: string;
}> = [
  { value: "door", label: "Door" },
  { value: "window", label: "Window" },
  { value: "open_passage", label: "Open passage" },
];

export default function FloorPlanOpeningTracePanel({
  document,
  floorId,
  sourceId,
  pageNumber,
  calibration,
  pickingOpening,
  openingPoints,
  onPickingOpeningChange,
  onOpeningPointsChange,
  onChange,
  onError,
  dark,
  disabled,
}: FloorPlanOpeningTracePanelProps) {
  const floor = document.floors.find((entry) => entry.id === floorId);
  const [kind, setKind] = useState<FloorPlanOpeningKindV2>("door");
  const analysis = useMemo(
    () =>
      pageNumber === null
        ? null
        : analyzeSourceOpeningSpan({
            document,
            floorId,
            sourceId,
            pageNumber,
            first: openingPoints[0] ?? null,
            second: openingPoints[1] ?? null,
          }),
    [document, floorId, openingPoints, pageNumber, sourceId]
  );
  if (!floor) return null;

  const control = dark
    ? "designer-control rounded-md border px-2 py-1.5 text-xs"
    : "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs";
  const subtle = dark ? "text-neutral-400" : "text-neutral-600";

  return (
    <details
      className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-3"
      open={pickingOpening || !floor.openings.length}
    >
      <summary className="cursor-pointer text-sm font-semibold">
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange-600 text-xs text-white">
          3
        </span>
        Add visible doors and windows
        <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] text-orange-800">
          {floor.openings.length
            ? `${floor.openings.length} added`
            : "Recommended"}
        </span>
      </summary>
      <div className="mt-2 grid gap-2">
        <p className={`text-[10px] leading-4 ${subtle}`}>
          Choose the type, then select both ends of the opening directly on the
          plan. The wall, position and width are calculated automatically.
        </p>
        <label className={`text-[10px] ${subtle}`}>
          What are you adding?
          <select
            className={`${control} mt-1 w-full`}
            disabled={disabled}
            onChange={(event) =>
              setKind(event.target.value as FloorPlanOpeningKindV2)
            }
            value={kind}
          >
            {OPENING_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {!calibration || !floor.walls.length ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[10px] font-medium text-amber-900">
            Finish the scale and room outlines first.
          </div>
        ) : null}
        <button
          className={`${control} w-full font-semibold`}
          disabled={disabled || !calibration || !floor.walls.length}
          onClick={() => {
            if (pickingOpening) {
              onPickingOpeningChange(false);
              return;
            }
            onOpeningPointsChange([]);
            onPickingOpeningChange(true);
          }}
          type="button"
        >
          {pickingOpening
            ? "Selecting ends — click twice on the plan"
            : `Place ${OPENING_TYPES.find((option) => option.value === kind)?.label.toLowerCase()}`}
        </button>
        <div
          className={`rounded-md border p-2 text-xs ${
            openingPoints.length === 2 && analysis?.valid
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-orange-100 bg-white text-neutral-700"
          }`}
        >
          {openingPoints.length === 0
            ? "Select the first end, then the second end."
            : openingPoints.length === 1
              ? "First end selected. Now select the other end."
              : analysis?.message}
        </div>
        <div className="flex flex-wrap gap-2 text-[10px]">
          <button
            className={control}
            disabled={disabled || !openingPoints.length}
            onClick={() => onOpeningPointsChange(openingPoints.slice(0, -1))}
            type="button"
          >
            Undo last point
          </button>
          <button
            className={control}
            disabled={disabled || !openingPoints.length}
            onClick={() => onOpeningPointsChange([])}
            type="button"
          >
            Start over
          </button>
        </div>
        <button
          className="rounded-md bg-orange-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          disabled={
            disabled ||
            !calibration ||
            pageNumber === null ||
            openingPoints.length !== 2 ||
            !analysis?.valid
          }
          onClick={() => {
            if (pageNumber === null || openingPoints.length !== 2) return;
            try {
              onError(null);
              onChange(
                traceOpeningFromSourceSpan({
                  document,
                  floorId,
                  sourceId,
                  pageNumber,
                  first: openingPoints[0],
                  second: openingPoints[1],
                  kind,
                })
              );
              onOpeningPointsChange([]);
              onPickingOpeningChange(false);
            } catch (cause) {
              onError(
                cause instanceof Error
                  ? cause.message
                  : "The opening could not be added."
              );
            }
          }}
          type="button"
        >
          Add this opening
        </button>
        <p className="rounded-md bg-white p-2 text-[10px] leading-4 text-neutral-600">
          Add every visible opening. If the source truly shows none, skip this
          step and mark the checklist suggestion as reviewed.
        </p>
      </div>
    </details>
  );
}
