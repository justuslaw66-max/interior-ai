import type { ConstraintResult } from "@/lib/constraints/evaluate";
import type { FloorPlanAddressTransform } from "@/lib/floor-plan-imports/types";
import { FLOOR_PLAN_CONSUMER_ORIENTATION_OPTIONS } from "@/lib/floor-plan-consumer-orientation";
import { Button } from "@/components/ui/Button";

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
          <div data-surface="floating" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-success-tint-border bg-surface-floating/95 px-4 py-3 text-label shadow-xl ring-1 ring-surface-floating-edge backdrop-blur">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Does this orientation match your unit?</div>
              <p className="mt-0.5 text-xs leading-4 text-label-secondary">
                The address match opened with {floorPlanOrientation.transformLabel}. Check the
                entrance and windows against your home; you can keep designing while this stays open.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <label className="text-xs font-semibold text-label-secondary">
                Change orientation
                <select
                  data-testid="floor-plan-orientation-choice"
                  className="ml-1 rounded-lg border border-control-secondary-border bg-field px-2 py-2 text-xs text-label"
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
              <Button
                variant="primary" size="compact"
                onClick={floorPlanOrientation.onConfirm}
              >
                Yes, it matches
              </Button>
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
          <div data-surface="floating" className="rounded-2xl border border-accent-tint-border bg-surface-floating/95 px-4 py-3 text-label shadow-xl ring-1 ring-surface-floating-edge backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">A newer verified floor plan is available</div>
                <p className="mt-0.5 text-xs leading-4 text-label-secondary">
                  {floorPlanRevisionUpdate.diffSummary}. {floorPlanRevisionUpdate.mappedRoomCount}{" "}
                  room{floorPlanRevisionUpdate.mappedRoomCount === 1 ? "" : "s"} can keep {floorPlanRevisionUpdate.preservedItemCount}{" "}
                  furniture item{floorPlanRevisionUpdate.preservedItemCount === 1 ? "" : "s"}, finishes and saved views.
                  Your current design will stay unchanged.
                </p>
                <div
                  data-testid="floor-plan-revision-compare-preview"
                  className="mt-2 grid grid-cols-2 gap-2 text-xs"
                >
                  <div className="rounded-lg border border-separator bg-surface-floating p-2">
                    <div className="font-semibold text-label">Current design</div>
                    <div className="mt-1 text-label-secondary">Kept unchanged</div>
                  </div>
                  <div className="rounded-lg border border-accent-tint-border bg-accent-tint p-2">
                    <div className="font-semibold text-on-accent-tint">Updated copy</div>
                    <div className="mt-1 text-on-accent-tint">
                      {floorPlanRevisionUpdate.mappedRoomCount} rooms · {floorPlanRevisionUpdate.preservedItemCount} items carried over
                    </div>
                  </div>
                </div>
                {floorPlanRevisionUpdate.unmappedRoomCount > 0 && (
                  <p className="mt-1 text-xs leading-4 text-on-warning-tint">
                    {floorPlanRevisionUpdate.unmappedRoomCount} unmatched room
                    {floorPlanRevisionUpdate.unmappedRoomCount === 1 ? "" : "s"} will not be guessed or copied; review the new copy before placing furniture there.
                    {floorPlanRevisionUpdate.skippedItemCount > 0
                      ? ` ${floorPlanRevisionUpdate.skippedItemCount} item${floorPlanRevisionUpdate.skippedItemCount === 1 ? "" : "s"} in those rooms will remain only in the original design.`
                      : ""}
                  </p>
                )}
                {floorPlanRevisionUpdate.errorMessage && (
                  <p role="alert" className="mt-1 text-xs leading-4 text-on-danger-tint">
                    {floorPlanRevisionUpdate.errorMessage}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="secondary" size="compact"
                  onClick={floorPlanRevisionUpdate.onDismiss}
                  disabled={floorPlanRevisionUpdate.creatingCopy}
                >
                  Not now
                </Button>
                <Button
                  data-testid="create-updated-floor-plan-copy"
                  variant="primary" size="compact"
                  onClick={floorPlanRevisionUpdate.onCreateUpdatedCopy}
                  disabled={floorPlanRevisionUpdate.creatingCopy}
                >
                  {floorPlanRevisionUpdate.creatingCopy
                    ? "Creating copy…"
                    : "Create updated copy"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {constraints.length > 0 && (
        <div
          data-testid="constraint-feedback"
          className="fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 transform animate-fade-in md:bottom-24"
        >
          <div className="flex items-center gap-2">
            {constraints.map((item) => (
              <div
                key={item.id}
                className={`rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${
                  item.level === "ok"
                    ? "bg-green-700 text-white"
                    : item.level === "warn"
                      ? "bg-orange-700 text-white"
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
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 transform animate-fade-in md:bottom-6"
        >
          <div className="rounded-full bg-surface-toast/90 px-4 py-2 text-xs font-medium text-on-surface-toast shadow-lg backdrop-blur">
            {confidence}
          </div>
        </div>
      )}
    </>
  );
}
