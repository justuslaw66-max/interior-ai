"use client";

import { Button } from "@/components/ui/Button";
import type { FloorPlanImportHint } from "@/lib/floor-plan-import-client";
import type { FloorPlanImportStatus } from "@/lib/floor-plan-imports/types";

const WAITING_FOR: Partial<Record<FloorPlanImportStatus, string>> = {
  selecting_page: "Waiting for you to choose a page",
  needs_review: "Waiting for your review",
  ready: "Ready to create your design",
  failed: "Couldn't finish reading this drawing",
};

/**
 * The upload this browser left waiting on the person, offered beside Choose a file instead of
 * being reopened by itself: opening it loads the whole review, and the person may be here to upload
 * a new plan. Its status is as this browser last saw it; Continue loads the upload as it is now.
 */
export function FloorPlanLastUploadCard({
  upload,
  disabled,
  onContinue,
}: {
  upload: FloorPlanImportHint;
  disabled: boolean;
  onContinue: (jobId: string) => void;
}) {
  return (
    <div
      className="flex w-full max-w-lg items-center gap-3 rounded-xl border border-box-border bg-surface-floating px-4 py-3 text-left"
      data-testid="floor-plan-last-upload"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-label-secondary">Your last upload</p>
        <p className="truncate text-sm font-semibold">{upload.fileName ?? "Uploaded floor plan"}</p>
        <p className="text-xs text-label-secondary">{WAITING_FOR[upload.status] ?? ""}</p>
      </div>
      <Button
        data-testid="floor-plan-last-upload-continue"
        aria-label={`Continue ${upload.fileName ?? "your last upload"}`}
        variant="secondary" size="compact"
        disabled={disabled}
        onClick={() => onContinue(upload.id)}
      >
        Continue
      </Button>
    </div>
  );
}
