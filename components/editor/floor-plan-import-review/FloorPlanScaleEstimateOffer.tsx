"use client";

import type { FloorPlanAnnotationV2, FloorPlanSourceCalibrationV2 } from "@/lib/floor-plan-document-v2";

/** Badge and copy for the scale step's header, by what the review has so far; `open` is whether the step starts
 *  expanded and `offerOpenings` whether the measured door openings are still offered (no scale yet, or an assumed one). */
export function scaleReviewStatus(
  hasConflict: boolean,
  calibration: FloorPlanSourceCalibrationV2 | undefined
): { label: string; className: string; assumed: boolean; open: boolean; offerOpenings: boolean } {
  const assumed = calibration?.primaryMeasurement?.basis === "assumed_opening_width";
  const flags = { assumed, open: hasConflict || !calibration || assumed, offerOpenings: !calibration || assumed };
  if (hasConflict) return { label: "Scale conflict", className: "bg-red-100 text-red-800", ...flags };
  if (assumed) return { label: "Set from an assumed width", className: "bg-amber-100 text-amber-900", ...flags };
  if (calibration) return { label: "Set", className: "bg-emerald-100 text-emerald-800", ...flags };
  return { label: "Start here", className: "bg-blue-100 text-blue-800", ...flags };
}

export function FloorPlanScaleAssumedNotice() {
  return (
    <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-[10px] leading-4 text-amber-900" data-testid="floor-plan-scale-assumed-notice">
      This scale rests on a door width that was assumed, not read off the plan; every length is approximate (about ±10 %).
      When you find a printed measurement, cross-check or set the scale from it.
    </p>
  );
}

type EstimateOfferProps = {
  marks: FloorPlanAnnotationV2[];
  assumedMm: number | null;
  control: string;
  disabled: boolean;
  onPick: (mark: FloorPlanAnnotationV2) => void;
};

/** The door openings the vectorizer measured where a plan prints no dimensions: pick one to seed the scale. */
export function FloorPlanScaleEstimateOffer({ marks, assumedMm, control, disabled, onPick }: EstimateOfferProps) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[10px] leading-4 text-amber-900" data-testid="floor-plan-scale-estimate">
      <p className="font-semibold">No printed dimensions were found on this plan.</p>
      <p className="mt-1">
        The door openings below were measured on the plan; the width shown is what each would be if standard
        {" "}door leaves are assumed. Pick one: its two jambs become the endpoints and the assumed width is filled in.
        If you know the real width, change the number before applying.
      </p>
      <ul className="mt-1 grid gap-1">
        {marks.map((mark, index) => {
          const mm = /about (\d+) mm/.exec(mark.text ?? "")?.[1];
          return (
            <li key={mark.id}>
              <button type="button" className={`${control} w-full text-left`} disabled={disabled} onClick={() => onPick(mark)}>
                Door opening {index + 1}{mm ? ` · about ${mm} mm (assumed)` : ""}
              </button>
            </li>
          );
        })}
      </ul>
      {assumedMm !== null ? (
        <p className="mt-1">Applying with {assumedMm} mm records the scale as assumed; the plan will say so until a printed measurement confirms it.</p>
      ) : null}
    </div>
  );
}
