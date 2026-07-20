"use client";

import {
  EditorDialog,
  EditorDialogActions,
  EditorDialogButton,
} from "@/components/editor/design-system/EditorDialog";

export type RoomRenameDialogProps = {
  open: boolean;
  value: string;
  onValueChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

export function RoomRenameDialog({
  open,
  value,
  onValueChange,
  onCancel,
  onSave,
}: RoomRenameDialogProps) {
  if (!open) return null;

  return (
    <EditorDialog
      open
      title="Rename room"
      description="Update the selected room label in the plan."
      onClose={onCancel}
      closeLabel="Close rename room dialog"
      testId="room-rename-dialog"
      panelClassName="max-w-[360px]"
      footer={
        <EditorDialogActions>
          <EditorDialogButton onClick={onCancel}>Cancel</EditorDialogButton>
          <EditorDialogButton
            variant="primary"
            data-testid="room-rename-save"
            disabled={!value.trim()}
            onClick={onSave}
          >
            Save
          </EditorDialogButton>
        </EditorDialogActions>
      }
    >
      <label className="block">
        <span className="text-xs font-semibold text-neutral-700">Room name</span>
        <input
          data-testid="room-rename-input"
          data-editor-dialog-initial-focus="true"
          className="mt-1 min-h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-950 outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30"
          value={value}
          onChange={(event) => onValueChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSave();
          }}
        />
      </label>
    </EditorDialog>
  );
}
