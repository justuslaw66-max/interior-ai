"use client";

import {
  EditorDialog,
  EditorDialogActions,
  EditorDialogButton,
} from "@/components/editor/design-system/EditorDialog";

type CopyFallbackDialogProps = {
  open: boolean;
  title: string;
  description: string;
  value: string;
  onClose: () => void;
};

export default function CopyFallbackDialog({
  open,
  title,
  description,
  value,
  onClose,
}: CopyFallbackDialogProps) {
  if (!open) return null;

  return (
    <EditorDialog
      open
      title={title}
      description={description}
      onClose={onClose}
      panelClassName="max-w-md"
      footer={
        <EditorDialogActions>
          <EditorDialogButton variant="primary" onClick={onClose}>
            Done
          </EditorDialogButton>
        </EditorDialogActions>
      }
    >
      <label className="block text-xs font-semibold uppercase tracking-wide text-label-secondary">
        Copy manually
        <input
          readOnly
          value={value}
          data-editor-dialog-initial-focus="true"
          className="mt-1 min-h-11 w-full rounded-lg border border-box-border bg-tile px-3 py-2 text-sm font-normal normal-case tracking-normal text-label outline-hidden focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30"
          data-testid="copy-fallback-value"
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
    </EditorDialog>
  );
}
