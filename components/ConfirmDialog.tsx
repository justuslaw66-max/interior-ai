"use client";

import {
  EditorDialog,
  EditorDialogActions,
  EditorDialogButton,
} from "@/components/editor/design-system/EditorDialog";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  destructive = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <EditorDialog
      open
      title={title}
      description={description}
      onClose={onCancel}
      closeDisabled={busy}
      showCloseButton={false}
      panelClassName="max-w-sm"
      footer={
        <EditorDialogActions>
          <EditorDialogButton
            data-editor-dialog-initial-focus="true"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </EditorDialogButton>
          <EditorDialogButton
            variant={destructive ? "danger" : "primary"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Working..." : confirmLabel}
          </EditorDialogButton>
        </EditorDialogActions>
      }
    >
      <span className="sr-only" role="status" aria-live="polite">
        {busy ? "Action in progress" : "Ready for confirmation"}
      </span>
    </EditorDialog>
  );
}
