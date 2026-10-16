"use client";

import { useRef } from "react";

import { EditorDialog } from "@/components/editor/design-system/EditorDialog";
import { Button } from "@/components/ui/Button";

export type PlanTemplateChoiceDialogProps = {
  open: boolean;
  templateLabel: string;
  busy: boolean;
  errorMessage: string | null;
  isAuthenticated: boolean;
  onCancel: () => void;
  onReplaceCurrent: () => void;
  onSaveCurrentAndStartNew: () => void | Promise<void>;
  onSignIn: () => void;
};

/**
 * Start a new design from a template: keep the current design or replace it. The shared dialog
 * owns focus, Escape and the backdrop (UX AX5); both close it only while nothing is saving.
 */
export function PlanTemplateChoiceDialog({
  open,
  templateLabel,
  busy,
  errorMessage,
  isAuthenticated,
  onCancel,
  onReplaceCurrent,
  onSaveCurrentAndStartNew,
  onSignIn,
}: PlanTemplateChoiceDialogProps) {
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);

  return (
    <EditorDialog
      open={open}
      title="Start a new design?"
      description={`Use ${templateLabel} as a new design and keep your current one, or replace the current rooms, doors, and furniture.`}
      onClose={onCancel}
      closeDisabled={busy}
      busy={busy}
      showCloseButton={false}
      initialFocusRef={primaryActionRef}
      testId="new-plan-choice-dialog"
      panelClassName="max-w-lg"
    >
      {!isAuthenticated ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          Sign in first so the current design can be kept in My designs.
        </div>
      ) : null}
      {errorMessage ? (
        <div
          data-testid="new-plan-choice-error"
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {errorMessage}
        </div>
      ) : null}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button
          data-testid="new-plan-cancel"
          variant="secondary" size="regular"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          data-testid="new-plan-replace-current"
          variant="secondary" size="regular"
          disabled={busy}
          onClick={onReplaceCurrent}
        >
          Replace current design
        </Button>
        <Button
          ref={primaryActionRef}
          data-testid="new-plan-save-current"
          variant="primary" size="regular"
          disabled={busy}
          onClick={isAuthenticated ? onSaveCurrentAndStartNew : onSignIn}
        >
          {busy
            ? "Saving current design…"
            : isAuthenticated
              ? "Save current & start new"
              : "Sign in to save & start new"}
        </Button>
      </div>
    </EditorDialog>
  );
}
