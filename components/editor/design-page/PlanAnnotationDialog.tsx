"use client";

import {
  EditorDialog,
  EditorDialogActions,
  EditorDialogButton,
} from "@/components/editor/design-system/EditorDialog";
import type { EditorAnnotation2D } from "@/lib/editorScene";

export type PlanAnnotationDialogProps = {
  kind: EditorAnnotation2D["kind"] | null;
  text: string;
  onTextChange: (value: string) => void;
  onCancel: () => void;
  onAdd: () => void;
};

export function PlanAnnotationDialog({
  kind,
  text,
  onTextChange,
  onCancel,
  onAdd,
}: PlanAnnotationDialogProps) {
  if (!kind) return null;

  const title =
    kind === "room_tag"
      ? "Add room tag"
      : kind === "callout"
        ? "Add callout"
        : "Add note";

  return (
    <EditorDialog
      open
      title={title}
      description="Place a draggable label on the 2D plan."
      onClose={onCancel}
      closeLabel="Close annotation dialog"
      testId="plan-annotation-dialog"
      panelClassName="max-w-[380px]"
      footer={
        <EditorDialogActions>
          <EditorDialogButton onClick={onCancel}>Cancel</EditorDialogButton>
          <EditorDialogButton
            variant="primary"
            data-testid="plan-annotation-save"
            disabled={!text.trim()}
            onClick={onAdd}
          >
            Add
          </EditorDialogButton>
        </EditorDialogActions>
      }
    >
      <label className="block">
        <span className="text-xs font-semibold text-neutral-700">
          {kind === "room_tag" ? "Tag text" : "Annotation text"}
        </span>
        <textarea
          data-testid="plan-annotation-input"
          data-editor-dialog-initial-focus="true"
          className="mt-1 min-h-24 w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-950 outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30"
          value={text}
          onChange={(event) => onTextChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              onAdd();
            }
          }}
        />
      </label>
    </EditorDialog>
  );
}
