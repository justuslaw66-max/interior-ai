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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4 backdrop-blur-[1px]"
      data-testid="room-rename-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Rename room"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="w-[min(360px,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-950">Rename room</h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              Update the selected room label in the plan.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm font-semibold text-neutral-500 hover:bg-neutral-100"
            aria-label="Close rename room dialog"
            onClick={onCancel}
          >
            x
          </button>
        </div>
        <label className="mt-3 block">
          <span className="text-xs font-semibold text-neutral-700">Room name</span>
          <input
            data-testid="room-rename-input"
            className="mt-1 h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            value={value}
            autoFocus
            onChange={(event) => onValueChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSave();
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
            data-testid="room-rename-save"
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
            disabled={!value.trim()}
            onClick={onSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
