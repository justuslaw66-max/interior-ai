import type { ConstraintResult } from "@/lib/constraints/evaluate";
import type { FloorPlanAddressTransform } from "@/lib/floor-plan-imports/types";
import { FLOOR_PLAN_CONSUMER_ORIENTATION_OPTIONS } from "@/lib/floor-plan-consumer-orientation";

export type DesignValidationFeedbackProps = {
  hidden: boolean;
  constraints: ConstraintResult[];
  confidence: string | null;
  floorPlanOrientation?: {
    pending: boolean;
    transformLabel: string;
    currentTransform: FloorPlanAddressTransform;
    onConfirm: () => void;
    onTransform: (transform: FloorPlanAddressTransform) => void;
  };
  floorPlanRevisionUpdate?: {
    currentRevisionId: string;
    revisionId: string;
    diffSummary: string;
    mappedRoomCount: number;
    unmappedRoomCount: number;
    preservedItemCount: number;
    skippedItemCount: number;
    creatingCopy: boolean;
    errorMessage: string | null;
    onDismiss: () => void;
    onCreateUpdatedCopy: () => void;
  } | null;
};

export function DesignValidationFeedback({
  hidden,
  constraints,
  confidence,
  floorPlanOrientation,
  floorPlanRevisionUpdate,
}: DesignValidationFeedbackProps) {
  if (hidden) return null;

  return (
    <>
      {floorPlanOrientation?.pending && (
        <div
          data-testid="floor-plan-orientation-confirmation"
          className="fixed left-1/2 top-24 z-50 w-[min(92vw,34rem)] -translate-x-1/2 animate-fade-in"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-white/95 px-4 py-3 text-neutral-900 shadow-xl backdrop-blur">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Does this orientation match your unit?</div>
              <p className="mt-0.5 text-xs leading-4 text-neutral-600">
                The address match opened with {floorPlanOrientation.transformLabel}. Check the
                entrance and windows against your home; you can keep designing while this stays open.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <label className="text-[10px] font-semibold text-neutral-600">
                Change orientation
                <select
                  data-testid="floor-plan-orientation-choice"
                  className="ml-1 rounded-lg border border-neutral-300 bg-white px-2 py-2 text-xs text-neutral-800"
                  value={floorPlanOrientation.currentTransform}
                  onChange={(event) =>
                    floorPlanOrientation.onTransform(
                      event.target.value as FloorPlanAddressTransform
                    )
                  }
                >
                  {FLOOR_PLAN_CONSUMER_ORIENTATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                onClick={floorPlanOrientation.onConfirm}
              >
                Yes, it matches
              </button>
            </div>
          </div>
        </div>
      )}

      {floorPlanRevisionUpdate && (
        <div
          data-testid="floor-plan-revision-update-prompt"
          data-current-revision-id={floorPlanRevisionUpdate.currentRevisionId}
          data-new-revision-id={floorPlanRevisionUpdate.revisionId}
          className={`fixed left-1/2 z-50 w-[min(92vw,38rem)] -translate-x-1/2 animate-fade-in ${
            floorPlanOrientation?.pending ? "top-52" : "top-24"
          }`}
        >
          <div className="rounded-2xl border border-blue-200 bg-white/95 px-4 py-3 text-neutral-900 shadow-xl backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">A newer verified floor plan is available</div>
                <p className="mt-0.5 text-xs leading-4 text-neutral-600">
                  {floorPlanRevisionUpdate.diffSummary}. {floorPlanRevisionUpdate.mappedRoomCount}{" "}
                  stable room {floorPlanRevisionUpdate.mappedRoomCount === 1 ? "ID" : "IDs"} can keep {floorPlanRevisionUpdate.preservedItemCount}{" "}
                  furniture item{floorPlanRevisionUpdate.preservedItemCount === 1 ? "" : "s"}, finishes and saved views.
                  Your current design will stay unchanged.
                </p>
                <div
                  data-testid="floor-plan-revision-compare-preview"
                  className="mt-2 grid grid-cols-2 gap-2 text-[11px]"
                >
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2">
                    <div className="font-semibold text-neutral-800">Current design</div>
                    <div className="mt-1 text-neutral-600">Kept unchanged</div>
                    <div className="mt-1 font-mono text-[9px] text-neutral-400">
                      {floorPlanRevisionUpdate.currentRevisionId.slice(0, 18)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-2">
                    <div className="font-semibold text-blue-900">Updated copy</div>
                    <div className="mt-1 text-blue-800">
                      {floorPlanRevisionUpdate.mappedRoomCount} rooms · {floorPlanRevisionUpdate.preservedItemCount} items carried over
                    </div>
                    <div className="mt-1 font-mono text-[9px] text-blue-500">
                      {floorPlanRevisionUpdate.revisionId.slice(0, 18)}
                    </div>
                  </div>
                </div>
                {floorPlanRevisionUpdate.unmappedRoomCount > 0 && (
                  <p className="mt-1 text-[11px] leading-4 text-amber-700">
                    {floorPlanRevisionUpdate.unmappedRoomCount} unmatched room
                    {floorPlanRevisionUpdate.unmappedRoomCount === 1 ? "" : "s"} will not be guessed or copied; review the new copy before placing furniture there.
                    {floorPlanRevisionUpdate.skippedItemCount > 0
                      ? ` ${floorPlanRevisionUpdate.skippedItemCount} item${floorPlanRevisionUpdate.skippedItemCount === 1 ? "" : "s"} in those rooms will remain only in the original design.`
                      : ""}
                  </p>
                )}
                {floorPlanRevisionUpdate.errorMessage && (
                  <p role="alert" className="mt-1 text-[11px] leading-4 text-red-700">
                    {floorPlanRevisionUpdate.errorMessage}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                  onClick={floorPlanRevisionUpdate.onDismiss}
                  disabled={floorPlanRevisionUpdate.creatingCopy}
                >
                  Not now
                </button>
                <button
                  type="button"
                  data-testid="create-updated-floor-plan-copy"
                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
                  onClick={floorPlanRevisionUpdate.onCreateUpdatedCopy}
                  disabled={floorPlanRevisionUpdate.creatingCopy}
                >
                  {floorPlanRevisionUpdate.creatingCopy
                    ? "Creating copy..."
                    : "Create updated copy"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {constraints.length > 0 && (
        <div
          data-testid="constraint-feedback"
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 transform animate-fade-in"
        >
          <div className="flex items-center gap-2">
            {constraints.map((item) => (
              <div
                key={item.id}
                className={`rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${
                  item.level === "ok"
                    ? "bg-green-600 text-white"
                    : item.level === "warn"
                      ? "bg-orange-500 text-white"
                      : "bg-red-600 text-white"
                }`}
              >
                {item.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {confidence && (
        <div
          data-testid="layout-confidence"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transform animate-fade-in"
        >
          <div className="rounded-full bg-neutral-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur">
            {confidence}
          </div>
        </div>
      )}
    </>
  );
}
