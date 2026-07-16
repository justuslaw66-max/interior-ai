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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4 backdrop-blur-[1px]"
      data-testid="plan-annotation-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Add plan annotation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="w-[min(380px,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-950">
              {kind === "room_tag"
                ? "Add room tag"
                : kind === "callout"
                  ? "Add callout"
                  : "Add note"}
            </h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              Place a draggable label on the 2D plan.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm font-semibold text-neutral-500 hover:bg-neutral-100"
            aria-label="Close annotation dialog"
            onClick={onCancel}
          >
            x
          </button>
        </div>
        <label className="mt-3 block">
          <span className="text-xs font-semibold text-neutral-700">
            {kind === "room_tag" ? "Tag text" : "Annotation text"}
          </span>
          <textarea
            data-testid="plan-annotation-input"
            className="mt-1 min-h-20 w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            value={text}
            autoFocus
            onChange={(event) => onTextChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                onAdd();
              }
              if (event.key === "Escape") onCancel();
            }}
          />
        </label>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="plan-annotation-save"
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
            disabled={!text.trim()}
            onClick={onAdd}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
