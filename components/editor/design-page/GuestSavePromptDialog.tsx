"use client";

import {
  EditorDialog,
  EditorDialogActions,
  EditorDialogButton,
} from "@/components/editor/design-system/EditorDialog";
import {
  GUEST_PROMPT_CLOSE_ACTION_ID,
  GUEST_PROMPT_CONTINUE_ACTION_ID,
  GUEST_PROMPT_DIALOG_ID,
  GUEST_PROMPT_PRIMARY_ACTION_ID,
  getGuestPromptReturnFocusIds,
  type GuestPromptReason,
} from "@/lib/guest-save-prompt";

export type GuestSavePromptDialogProps = {
  reason: GuestPromptReason | null;
  busy: boolean;
  lifecycleScopeKey: string;
  onCancel: () => void;
  onContinueWithoutSaving: () => void;
  onSaveAndContinue: () => void | Promise<void>;
};

export function GuestSavePromptDialog({
  reason,
  busy,
  onCancel,
  onContinueWithoutSaving,
  onSaveAndContinue,
}: GuestSavePromptDialogProps) {
  return (
    <EditorDialog
      open={reason !== null}
      title="Sign in to save this design"
      description="After you sign in, this design appears in My designs."
      onClose={onCancel}
      closeLabel="Close sign-in prompt"
      closeButtonId={GUEST_PROMPT_CLOSE_ACTION_ID}
      closeButtonTestId="guest-save-prompt-close"
      closeButtonClassName="focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white"
      testId="guest-save-prompt"
      dialogId={GUEST_PROMPT_DIALOG_ID}
      returnFocusIds={reason ? getGuestPromptReturnFocusIds(reason) : undefined}
      cancelFocusRestorationOnUnmount
      manageBackground
      forceLight
      panelClassName="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      footer={
        <EditorDialogActions>
          <EditorDialogButton
            id={GUEST_PROMPT_CONTINUE_ACTION_ID}
            data-testid="guest-save-prompt-not-now"
            onClick={onContinueWithoutSaving}
          >
            Not now
          </EditorDialogButton>
          <EditorDialogButton
            id={GUEST_PROMPT_PRIMARY_ACTION_ID}
            data-testid="guest-save-prompt-primary"
            variant="primary"
            disabled={busy}
            onClick={() => void onSaveAndContinue()}
          >
            {busy ? "Saving…" : "Sign in and save"}
          </EditorDialogButton>
        </EditorDialogActions>
      }
    >
      <span
        aria-hidden="true"
        data-guest-prompt-reason={reason ?? undefined}
      />
    </EditorDialog>
  );
}
