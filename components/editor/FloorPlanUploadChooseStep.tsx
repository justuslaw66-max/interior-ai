"use client";

import { useState, type DragEvent } from "react";
import { FileUp } from "lucide-react";
import type { FloorPlanUploadFormats } from "@/lib/floor-plan-upload-formats";
import { requestFloorPlanUploadSignIn } from "@/lib/floor-plan-upload-request";

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
};

type FloorPlanUploadChooseStepProps = FloorPlanUploadChooseState & {
  dark: boolean;
  disabled: boolean;
  onChooseFile: () => void;
};

const shellClass = (dark: boolean) =>
  dark
    ? "designer-recessed flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 p-6 text-center"
    : "flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm";
const primaryButtonClass = (dark: boolean) =>
  dark
    ? "designer-control-active min-h-11 rounded-lg border px-5 text-sm font-bold"
    : "min-h-11 rounded-lg bg-neutral-900 px-5 text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-50";
const subtleClass = (dark: boolean) => (dark ? "text-neutral-400" : "text-neutral-600");

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

function GuestSignInStep({ dark, formats }: Pick<FloorPlanUploadChooseStepProps, "dark" | "formats">) {
  return (
    <div className={shellClass(dark)} data-testid="floor-plan-upload-sign-in" data-floor-plan-workspace-state="sign-in">
      <h3 className="text-lg font-bold">Sign in to upload your floor plan</h3>
      <p className={`max-w-md text-sm leading-6 ${subtleClass(dark)}`}>
        We read your floor plan on our servers, so uploading needs a free account. You choose the
        file straight after.
      </p>
      <button type="button" data-editor-dialog-initial-focus="true" data-floor-plan-workspace-focus="primary"
        data-testid="floor-plan-upload-sign-in-continue" className={primaryButtonClass(dark)}
        onClick={requestFloorPlanUploadSignIn}>
        Continue with Google
      </button>
      <p className={`text-[13px] ${subtleClass(dark)}`}>
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
  const { dark, disabled, formats, fileProblem } = props;
  const { dragging, dropProps } = useFileDrop(disabled, props.onFileDropped);
  if (!props.signedIn) return <GuestSignInStep dark={dark} formats={formats} />;
  return (
    <div {...dropProps} className={shellClass(dark)} data-testid="floor-plan-import-dialog-empty-state"
      data-floor-plan-workspace-state="empty" data-dragging={dragging ? "true" : undefined}>
      <div className={`flex w-full max-w-lg flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-5 py-8 ${
        dragging ? "border-blue-500 bg-blue-50" : dark ? "border-white/20" : "border-neutral-300 bg-neutral-50"
      }`} data-testid="floor-plan-upload-drop-zone">
        <FileUp aria-hidden="true" className="h-7 w-7" strokeWidth={1.8} />
        <h3 className="text-base font-bold">Drop your floor plan here</h3>
        <button type="button" data-editor-dialog-initial-focus="true" data-floor-plan-workspace-focus="primary"
          className={primaryButtonClass(dark)} disabled={disabled} onClick={props.onChooseFile}>
          Choose a file
        </button>
        <p className={`text-[13px] ${subtleClass(dark)}`} data-testid="floor-plan-upload-formats">
          {formats.summary}
          {formats.cadNote ? `. ${formats.cadNote}` : ""}
        </p>
      </div>
      {fileProblem ? (
        <p role="alert" className={`max-w-lg text-sm font-semibold ${dark ? "text-red-300" : "text-red-700"}`}
          data-testid="floor-plan-upload-file-problem">
          {fileProblem}
        </p>
      ) : null}
      <p className={`max-w-lg text-sm leading-6 ${subtleClass(dark)}`} data-testid="floor-plan-upload-new-design-note">
        {FLOOR_PLAN_UPLOAD_NEW_DESIGN_NOTE}
      </p>
    </div>
  );
}
