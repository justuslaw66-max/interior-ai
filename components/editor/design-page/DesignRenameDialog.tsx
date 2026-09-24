"use client";

import {
  EditorDialog,
  EditorDialogActions,
  EditorDialogButton,
} from "@/components/editor/design-system/EditorDialog";
import { DESIGN_RENAME_RETURN_FOCUS_IDS } from "@/lib/design-rename-focus";
import { DESIGN_TITLE_MAX_LENGTH } from "@/lib/design-title";

export type DesignRenameDialogProps = {
  open: boolean;
  dark: boolean;
  value: string;
  onValueChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  /** My designs hands focus back to the card's More actions button instead. */
  returnFocusIds?: readonly string[];
  /** Saving (My designs waits for the server): Save stays off. */
  busy?: boolean;
};

/**
 * Rename design (audit finding F). The name shows in the command bar and in My designs, and
 * renaming is one step that Undo reverses. Focus goes back to the design's name, or to More
 * below `xl`, where Rename design lives.
 */
export function DesignRenameDialog({
  open,
  dark,
  value,
  onValueChange,
  onCancel,
  onSave,
  returnFocusIds = DESIGN_RENAME_RETURN_FOCUS_IDS, busy = false,
}: DesignRenameDialogProps) {
  const canSave = value.trim().length > 0 && !busy;
  return (
    <EditorDialog
      open={open}
      title="Rename design"
      onClose={onCancel}
      closeLabel="Close Rename design"
      testId="design-rename-dialog"
      returnFocusIds={returnFocusIds}
      dark={dark}
      forceLight={!dark}
      panelClassName={`${dark ? "designer-panel " : ""}max-w-[360px]`}
      footer={
        <EditorDialogActions>
          <EditorDialogButton className={dark ? "designer-control" : undefined} onClick={onCancel}>
            Cancel
          </EditorDialogButton>
          <EditorDialogButton
            variant="primary"
            data-testid="design-rename-save"
            className={dark ? "designer-primary-action" : undefined}
            disabled={!canSave}
            onClick={onSave}
          >
            Save
          </EditorDialogButton>
        </EditorDialogActions>
      }
    >
      <label className="block">
        <span className={dark ? "text-xs font-semibold" : "text-xs font-semibold text-neutral-700"}>
          Design name
        </span>
        <input
          data-testid="design-rename-input"
          data-editor-dialog-initial-focus="true"
          maxLength={DESIGN_TITLE_MAX_LENGTH}
          className={`mt-1 min-h-11 w-full rounded-lg border px-3 text-sm outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
            dark ? "designer-recessed" : "border-neutral-200 bg-white text-neutral-950"
          }`}
          value={value}
          onChange={(event) => onValueChange(event.currentTarget.value)}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canSave) onSave();
          }}
        />
      </label>
    </EditorDialog>
  );
}
