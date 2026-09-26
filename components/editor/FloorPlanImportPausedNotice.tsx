"use client";

import { requestFloorPlanUploadSignIn } from "@/lib/floor-plan-upload-request";

type FloorPlanImportPausedNoticeProps = {
  dark: boolean;
  subtle: string;
  control: string;
  message: string;
  authenticationRequired: boolean;
  resumableJobId: string | null;
};

/**
 * "Auto-detection paused", with a way on: a refused sign-in (an expired session, say) gets "Sign in
 * and continue" (audit finding ST3), which comes back to the upload window, instead of a dead end;
 * a job that can go on gets "Resume processing". Either is the only way on, so it gets a full 44px
 * touch target.
 */
export function FloorPlanImportPausedNotice({
  dark,
  subtle,
  control,
  message,
  authenticationRequired,
  resumableJobId,
}: FloorPlanImportPausedNoticeProps) {
  return (
    <div className={dark ? "designer-recessed rounded-lg border border-amber-400/20 p-3" : "rounded-lg border border-amber-200 bg-amber-50 p-3"} data-testid="floor-plan-import-error" data-floor-plan-workspace-state="failure">
      <div className="text-xs font-semibold">Auto-detection paused</div>
      <p className={`mt-1 text-xs leading-4 ${subtle}`}>{message}</p>
      {authenticationRequired ? (
        <button
          type="button" data-floor-plan-workspace-focus="primary" data-testid="floor-plan-import-sign-in"
          className={`${control} mt-3 min-h-11 font-semibold`}
          onClick={requestFloorPlanUploadSignIn}
        >
          Sign in and continue
        </button>
      ) : resumableJobId ? (
        <button
          type="button" data-floor-plan-workspace-focus="primary"
          className={`${control} mt-3 min-h-11 font-semibold`}
          onClick={() => window.location.reload()}
        >
          Resume processing
        </button>
      ) : null}
    </div>
  );
}
