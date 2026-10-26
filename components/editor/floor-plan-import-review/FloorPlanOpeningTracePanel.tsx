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
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import { Button } from "@/components/ui/Button";

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
  disabled: boolean;
};

const OPENING_TYPES: ReadonlyArray<{
  value: FloorPlanOpeningKindV2;
  label: string;
}> = [
  { value: "door", label: "Door" },
  { value: "window", label: "Window" },
  { value: "open_passage", label: "Opening (no door)" },
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

  const control = "rounded-md border border-control-secondary-border bg-field px-2 py-1.5 text-xs";
  const subtle = "text-label-secondary";

  return (
    <details
      className="mt-3 rounded-lg border border-warning-tint-border bg-warning-tint p-3"
      open={pickingOpening || !floor.openings.length}
    >
      <summary className="cursor-pointer text-sm font-semibold">
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-700 text-xs text-white">
          3
        </span>
        Add visible doors and windows
        <span className="ml-2 rounded-full bg-surface-floating px-2 py-0.5 text-xs text-on-warning-tint">
          {floor.openings.length
            ? `${floor.openings.length} added`
            : "Recommended"}
        </span>
      </summary>
      <div className="mt-2 grid gap-2">
        <p className={`text-xs leading-4 ${subtle}`}>
          Choose the type, then select both ends of the opening directly on the
          plan. The wall, position and width are calculated automatically.
        </p>
        <label className={`text-xs ${subtle}`}>
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
          <div className="rounded-md border border-warning-tint-border bg-surface-floating p-2 text-xs font-medium text-on-warning-tint">
            Set scale and outline the rooms first.
          </div>
        ) : null}
        <Button
          size="compact" pressed={pickingOpening} className="w-full"
          disabled={disabled || !calibration || !floor.walls.length}
          onClick={() => {
            if (pickingOpening) {
              onPickingOpeningChange(false);
              return;
            }
            onOpeningPointsChange([]);
            onPickingOpeningChange(true);
          }}
        >
          {pickingOpening
            ? "Selecting ends — click twice on the plan"
            : `Place ${OPENING_TYPES.find((option) => option.value === kind)?.label.toLowerCase()}`}
        </Button>
        <div
          className={`rounded-md border p-2 text-xs ${
            openingPoints.length === 2 && analysis?.valid
              ? "border-success-tint-border bg-success-tint text-on-success-tint"
              : "border-warning-tint-border bg-surface-floating text-label-secondary"
          }`}
        >
          {openingPoints.length === 0
            ? "Select the first end, then the second end."
            : openingPoints.length === 1
              ? "First end selected. Now select the other end."
              : analysis?.message}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Button
            size="compact"
            disabled={disabled || !openingPoints.length}
            onClick={() => onOpeningPointsChange(openingPoints.slice(0, -1))}
          >
            Undo last point
          </Button>
          <Button
            size="compact"
            disabled={disabled || !openingPoints.length}
            onClick={() => onOpeningPointsChange([])}
          >
            Start over
          </Button>
        </div>
        <Button
          variant="primary" size="compact"
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
              onError(userFacingErrorMessage(cause, "The door or window could not be added."));
            }
          }}
        >
          Add this opening
        </Button>
        <p className="rounded-md bg-surface-floating p-2 text-xs leading-4 text-label-secondary">
          Add every visible opening. If the source truly shows none, skip this
          step and mark the checklist suggestion as reviewed.
        </p>
      </div>
    </details>
  );
}
