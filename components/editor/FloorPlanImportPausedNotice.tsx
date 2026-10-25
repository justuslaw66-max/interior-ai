"use client";

import { Button } from "@/components/ui/Button";
import { requestFloorPlanUploadSignIn } from "@/lib/floor-plan-upload-request";

type FloorPlanImportPausedNoticeProps = {
  subtle: string;
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
  subtle,
  message,
  authenticationRequired,
  resumableJobId,
}: FloorPlanImportPausedNoticeProps) {
  return (
    <div className="rounded-lg border border-warning-tint-border bg-warning-tint p-3" data-testid="floor-plan-import-error" data-floor-plan-workspace-state="failure">
      <div className="text-xs font-semibold">Auto-detection paused</div>
      <p className={`mt-1 text-xs leading-4 ${subtle}`}>{message}</p>
      {authenticationRequired ? (
        <Button
          data-floor-plan-workspace-focus="primary" data-testid="floor-plan-import-sign-in"
          className="mt-3"
          onClick={requestFloorPlanUploadSignIn}
        >
          Sign in and continue
        </Button>
      ) : resumableJobId ? (
        <Button
          data-floor-plan-workspace-focus="primary"
          className="mt-3"
          onClick={() => window.location.reload()}
        >
          Resume processing
        </Button>
      ) : null}
    </div>
  );
}
