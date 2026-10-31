"use client";

import { useContext, useEffect, useMemo, type ReactNode } from "react";
import { formatFloorPlanRemainingTime } from "@/lib/floor-plan-imports/progress-estimate";
import { Button } from "@/components/ui/Button";
import type { ConsumerFloorPlanImportState } from "./useConsumerFloorPlanImportSession";
import { FloorPlanImportCancelContext, type FloorPlanImportCancel } from "./useFloorPlanImportCancel";

type WorkingState = Extract<ConsumerFloorPlanImportState, { kind: "working" }>;

const surface =
  "rounded-xl border border-success-tint-border bg-success-tint p-4 shadow-sm sm:p-5";
const subtle = "text-label-secondary";

/**
 * An earlier upload is loading. Nothing is being read, so this says only that, in the words the
 * design page uses while it opens a design, with no AI wording, progress or time estimate.
 */
export function FloorPlanImportOpeningCard({ fileName }: { fileName: string | null }) {
  return (
    <div
      className="flex min-h-[440px] flex-col items-center justify-center gap-1 rounded-xl border border-box-border bg-surface-elevated-secondary p-4 text-center shadow-sm sm:p-5"
      data-testid="floor-plan-import-opening" data-floor-plan-workspace-state="opening" aria-busy="true"
    >
      <p className={`text-sm ${subtle}`} role="status">Opening your upload…</p>
      {fileName ? <p className="max-w-lg truncate text-sm font-semibold">{fileName}</p> : null}
    </div>
  );
}

function timingMessage(estimate: WorkingState["estimate"]) {
  const retrySeconds =
    estimate?.activity === "retrying" && estimate.nextAttemptAt
      ? Math.max(1, Math.ceil((Date.parse(estimate.nextAttemptAt) - Date.now()) / 1_000))
      : null;
  if (estimate?.activity === "queued") return "Waiting to start";
  if (estimate?.activity === "retrying") return `Retrying in ${retrySeconds ?? 1} sec`;
  if (estimate?.activity === "awaiting_user") return "Waiting for your review";
  if (estimate?.activity === "attention" && !estimate.heartbeatHealthy) {
    return "Processing connection delayed";
  }
  if (estimate?.unusuallySlow) return "Taking longer than usual — AI is still working";
  return formatFloorPlanRemainingTime(
    estimate?.remainingRangeMs ?? null,
    estimate?.confidence ?? null
  );
}

/**
 * Cancel upload, when the upload window offers it. Not the window's primary focus, so Enter can't
 * cancel by accident; a refusal (the plan finished first, or no connection) is said under it. Once
 * pressed it is aria-disabled rather than disabled, so focus stays on it instead of falling to the
 * window's next control (its close button: closing while the file uploads would drop the cancel).
 */
function CancelUploadAction() {
  const cancel = useContext(FloorPlanImportCancelContext);
  // While pressed and on screen, the window greys out Choose file: a new file would drop a cancel still
  // waiting for its upload. An upload that fails meanwhile takes this screen, and that hold, with it.
  const cancelling = Boolean(cancel?.cancelling);
  const onCancellingChange = cancel?.onCancellingChange;
  useEffect(() => {
    if (!cancelling || !onCancellingChange) return;
    onCancellingChange(true);
    return () => onCancellingChange(false);
  }, [cancelling, onCancellingChange]);
  if (!cancel) return null;
  return (
    <div className="mt-5 flex flex-col items-center gap-2">
      <Button
        data-testid="floor-plan-import-cancel"
        variant="secondary" size="touch"
        aria-disabled={cancel.cancelling || undefined}
        className={cancel.cancelling ? "cursor-not-allowed opacity-60" : ""}
        onClick={cancel.cancel}
      >
        {cancel.cancelling ? "Cancelling…" : "Cancel upload"}
      </Button>
      {cancel.error ? (
        <p role="alert" className="max-w-lg text-xs text-on-danger-tint" data-testid="floor-plan-import-cancel-error">
          {cancel.error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Gives the reading screen its Cancel. Once the cancel has gone to the server, a short card stands
 * in for the upload, whose own screen may change meanwhile (a poll can see the cancelled job before
 * the answer comes). The upload stays mounted, hidden, and the card comes first so the window's
 * focus follows it. While a file is still uploading, the reading screen stays, its button saying
 * Cancelling…, so an upload that fails meanwhile still shows its error.
 */
export function FloorPlanImportCancelScope({ cancel, onCancellingChange, children }: {
  cancel: FloorPlanImportCancel;
  onCancellingChange?: (cancelling: boolean) => void;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ ...cancel, onCancellingChange }), [cancel, onCancellingChange]);
  return (
    <FloorPlanImportCancelContext.Provider value={value}>
      {cancel.stopping ? (
        <div
          className="flex min-h-[440px] flex-col items-center justify-center gap-1 rounded-xl border border-box-border bg-surface-elevated-secondary p-4 text-center shadow-sm sm:p-5"
          data-testid="floor-plan-import-cancelling" data-floor-plan-workspace-state="cancelling" aria-busy="true"
        >
          <p className="text-sm font-semibold" role="status">Cancelling your upload…</p>
          <p className={`text-sm ${subtle}`}>Stopping the AI and closing this upload.</p>
        </div>
      ) : null}
      <div hidden={cancel.stopping}>{children}</div>
    </FloorPlanImportCancelContext.Provider>
  );
}

/** A plan being uploaded or read: the stage, its estimated progress and the time left. */
export function FloorPlanImportProgressCard({ state }: { state: WorkingState }) {
  const estimate = state.estimate;
  const progress = Math.max(0, Math.min(99, Math.round(state.progress)));
  return (
    <div
      className={`${surface} flex min-h-[440px] flex-col items-center justify-center text-center`}
      data-testid="floor-plan-import-progress" data-floor-plan-workspace-state="working"
    >
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-full border-4 border-success-tint" />
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-emerald-600" />
      </div>
      <h3 className="mt-5 text-xl font-semibold">AI is reading your floor plan</h3>
      <p className={`mt-2 max-w-lg text-sm leading-6 ${subtle}`}>
        Finding walls, printed dimensions, room names, doors, and windows.
        You can leave this screen and return later.
      </p>
      <div className="mt-5 w-full max-w-xl">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold">
          <span className="flex items-center gap-2 text-left">
            {state.message}
            {estimate?.heartbeatHealthy ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-floating px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-on-success-tint">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Live
              </span>
            ) : null}
          </span>
          <span>{progress}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Estimated progress reading your floor plan"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="mt-2 h-2 overflow-hidden rounded-full bg-surface-floating"
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className={`mt-3 text-xs font-medium ${subtle}`}>
          Estimated progress
        </div>
        <div className={`mt-1 min-h-5 text-sm ${subtle}`} aria-live="polite">
          {timingMessage(estimate) ?? "Calculating time remaining…"}
        </div>
        <div className={`mt-2 text-xs ${subtle}`}>
          Upload · Detection · Dimensions · Editable plan
        </div>
      </div>
      <CancelUploadAction />
    </div>
  );
}
