"use client";

import {
  EditorDialog,
  EditorDialogButton,
} from "@/components/editor/design-system/EditorDialog";

export const START_UPLOAD_CHOICE_ID = "start-choice-upload-action";
const RETURN_FOCUS_IDS = [START_UPLOAD_CHOICE_ID] as const;

const STEPS = [
  { title: "Choose your file", detail: "PDF, JPG, PNG or WebP, up to 25 MB." },
  { title: "Check the walls", detail: "We trace the rooms. You fix anything we missed." },
  { title: "Set scale", detail: "Enter one real measurement so every size is right." },
] as const;

export type UploadSignInDialogProps = {
  open: boolean;
  onClose: () => void;
  onSignIn: () => void;
};

/**
 * Guests sign in before they choose a file (audit finding ST3), instead of losing the file to
 * "Auto-detection paused" after the upload is refused. Signing in comes back to the upload.
 */
export function UploadSignInDialog({ open, onClose, onSignIn }: UploadSignInDialogProps) {
  return (
    <EditorDialog
      open={open}
      title="Sign in to upload your floor plan"
      description="We read your floor plan on our servers, so uploading needs a free account. You choose the file straight after."
      onClose={onClose}
      closeLabel="Close"
      testId="upload-sign-in-dialog"
      returnFocusIds={RETURN_FOCUS_IDS}
      forceLight
      panelClassName="max-w-[520px]"
    >
      <ol className="flex flex-col gap-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                index === 0 ? "bg-neutral-900 text-white" : "bg-neutral-200 text-neutral-700"
              }`}
            >
              {index + 1}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-bold">{step.title}</span>
              <span className="text-sm text-neutral-600">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-col gap-2.5">
        <EditorDialogButton variant="primary" data-testid="upload-sign-in-continue" onClick={onSignIn}>
          Continue with Google
        </EditorDialogButton>
        <EditorDialogButton data-testid="upload-sign-in-not-now" onClick={onClose}>
          Not now
        </EditorDialogButton>
      </div>
    </EditorDialog>
  );
}
