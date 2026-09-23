"use client";

import { useMemo } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { applyFloorPlanAddressTransformV2 } from "@/lib/floor-plan-legacy-adapters";
import {
  applyConsumerOrientation,
  buildThumbnailPaths,
  REVIEW_ORIENTATIONS,
  type ReviewSourcePoint,
} from "@/lib/floor-plan-import-review-geometry";

type FloorPlanOrientationReviewPanelProps = {
  document: FloorPlanDocumentV2;
  onChange: (value: FloorPlanDocumentV2) => void;
  onError: (message: string | null) => void;
  dark: boolean;
  disabled: boolean;
};

function thumbnailLine(points: ReviewSourcePoint[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export default function FloorPlanOrientationReviewPanel({
  document,
  onChange,
  onError,
  dark,
  disabled,
}: FloorPlanOrientationReviewPanelProps) {
  const previews = useMemo(
    () =>
      REVIEW_ORIENTATIONS.map((choice) => ({
        ...choice,
        paths: buildThumbnailPaths(
          applyFloorPlanAddressTransformV2(document, choice.id)
        ),
      })),
    [document]
  );

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-semibold">
        Orientation
      </summary>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {previews.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className={
              dark
                ? "rounded-md border border-white/10 p-1.5 text-[10px]"
                : "rounded-md border border-neutral-200 bg-white p-1.5 text-[10px]"
            }
            disabled={disabled || choice.id === "normal"}
            onClick={() => {
              try {
                onError(null);
                onChange(applyConsumerOrientation(document, choice.id));
              } catch (cause) {
                onError(
                  cause instanceof Error
                    ? cause.message
                    : "Orientation could not be applied."
                );
              }
            }}
          >
            <svg aria-hidden viewBox="0 0 120 76" className="h-16 w-full">
              <g fill="none" stroke="currentColor" strokeWidth={2}>
                {choice.paths.map((path, index) => (
                  <polyline key={index} points={thumbnailLine(path)} />
                ))}
              </g>
            </svg>
            <span>{choice.label}</span>
          </button>
        ))}
      </div>
      <p
        className={
          dark
            ? "mt-1 text-[10px] text-neutral-400"
            : "mt-1 text-[10px] text-neutral-600"
        }
      >
        Thumbnails are relative to the current candidate. Registration points
        rotate or mirror with geometry so the source overlay remains aligned.
      </p>
    </details>
  );
}
