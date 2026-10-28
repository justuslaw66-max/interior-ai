"use client";

import { useState, type DragEvent } from "react";
import { FileUp } from "lucide-react";
import type { FloorPlanUploadFormats } from "@/lib/floor-plan-upload-formats";
import { requestFloorPlanUploadSignIn } from "@/lib/floor-plan-upload-request";
import { Button } from "@/components/ui/Button";
import type { FloorPlanImportHint } from "@/lib/floor-plan-import-client";
import { FloorPlanLastUploadCard } from "./FloorPlanLastUploadCard";

/** Said before any file is chosen (audit finding ST5), where it used to come only at the end. */
export const FLOOR_PLAN_UPLOAD_NEW_DESIGN_NOTE =
  "It opens as a new design in Plan, where you check the walls and set the scale.";

/** What the upload window's first step knows about the person and their plan. */
export type FloorPlanUploadChooseState = {
  signedIn: boolean;
  formats: FloorPlanUploadFormats;
  /** Why the last file chosen can't be uploaded, in words for the person. */
  fileProblem: string | null;
  onFileDropped: (file: File) => void;
  /** The signed-in account's key ("guest" signed out): the stored upload's hint is only read for the account that wrote it. */
  accountKey?: string;
};

type FloorPlanUploadChooseStepProps = FloorPlanUploadChooseState & {
  disabled: boolean;
  onChooseFile: () => void;
  /** An earlier upload waiting on the person, offered to continue under the drop zone. */
  lastUpload?: FloorPlanImportHint | null;
  onContinueLastUpload?: (jobId: string) => void;
};

const shellClass =
  "flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-2xl border border-box-border bg-surface-elevated-secondary p-6 text-center shadow-sm";
const subtleClass = "text-label-secondary";

/** A file dragged from the desktop onto the step is chosen as if picked. */
function useFileDrop(disabled: boolean, onFileDropped: (file: File) => void) {
  const [dragging, setDragging] = useState(false);
  const allowDrop = (event: DragEvent<HTMLElement>) => {
    if (disabled || !Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };
  return {
    dragging,
    dropProps: {
      onDragEnter: allowDrop,
      onDragOver: allowDrop,
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file && !disabled) onFileDropped(file);
      },
    },
  };
}

function GuestSignInStep({ formats }: Pick<FloorPlanUploadChooseStepProps, "formats">) {
  return (
    <div className={shellClass} data-surface="floating" data-testid="floor-plan-upload-sign-in" data-floor-plan-workspace-state="sign-in">
      <h3 className="text-lg font-bold">Sign in to upload your floor plan</h3>
      <p className={`max-w-md text-sm leading-6 ${subtleClass}`}>
        We read your floor plan on our servers, so uploading needs a free account. You choose the
        file straight after.
      </p>
      <Button
        data-editor-dialog-initial-focus="true"
        data-floor-plan-workspace-focus="primary"
        data-testid="floor-plan-upload-sign-in-continue"
        variant="primary" size="touch"
        onClick={requestFloorPlanUploadSignIn}
      >
        Continue with Google
      </Button>
      <p className={`text-[13px] ${subtleClass}`}>
        {formats.summary}. {formats.cadNote}
      </p>
    </div>
  );
}

/**
 * The upload window's first step, as in the UploadSignIn mockup: a place to drop the file,
 * Choose a file, what can be uploaded, and that it opens as a new design in Plan. Guests are
 * asked to sign in here instead, so a file is never chosen only to be refused (ST3).
 */
export function FloorPlanUploadChooseStep(props: FloorPlanUploadChooseStepProps) {
  const { disabled, formats, fileProblem } = props;
  const { dragging, dropProps } = useFileDrop(disabled, props.onFileDropped);
  if (!props.signedIn) return <GuestSignInStep formats={formats} />;
  return (
    <div {...dropProps} className={shellClass} data-surface="floating" data-testid="floor-plan-import-dialog-empty-state"
      data-floor-plan-workspace-state="empty" data-dragging={dragging ? "true" : undefined}>
      <div className={`flex w-full max-w-lg flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-5 py-8 ${
        dragging ? "border-blue-500 bg-accent-tint" : "border-control-handle bg-tile"
      }`} data-testid="floor-plan-upload-drop-zone">
        <FileUp aria-hidden="true" className="h-7 w-7" strokeWidth={1.8} />
        <h3 className="text-base font-bold">Drop your floor plan here</h3>
        <Button
          data-editor-dialog-initial-focus="true"
          data-floor-plan-workspace-focus="primary"
          variant="primary" size="touch"
          disabled={disabled}
          onClick={props.onChooseFile}
        >
          Choose a file
        </Button>
        <p className={`text-[13px] ${subtleClass}`} data-testid="floor-plan-upload-formats">
          {formats.summary}
          {formats.cadNote ? `. ${formats.cadNote}` : ""}
        </p>
      </div>
      {fileProblem ? (
        <p role="alert" className="max-w-lg text-sm font-semibold text-on-danger-tint"
          data-testid="floor-plan-upload-file-problem">
          {fileProblem}
        </p>
      ) : null}
      <p className={`max-w-lg text-sm leading-6 ${subtleClass}`} data-testid="floor-plan-upload-new-design-note">
        {FLOOR_PLAN_UPLOAD_NEW_DESIGN_NOTE}
      </p>
      {props.lastUpload && props.onContinueLastUpload ? (
        <FloorPlanLastUploadCard upload={props.lastUpload} disabled={disabled} onContinue={props.onContinueLastUpload} />
      ) : null}
    </div>
  );
}
