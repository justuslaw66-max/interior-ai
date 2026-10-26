type CrossRoomDragTargetProps = {
  state: {
    valid: boolean;
    label: string;
  };
};

export function CrossRoomDragTarget({ state }: CrossRoomDragTargetProps) {
  return (
    <div
      data-testid="cross-room-drag-target" data-surface="floating"
      className={`pointer-events-none absolute left-1/2 top-36 z-30 md:top-bar-41 -translate-x-1/2 rounded-full border px-4 py-2 text-sm font-semibold shadow-xl ring-1 ring-surface-floating-edge backdrop-blur ${
        state.valid
          ? "border-success-tint-border bg-surface-floating/95 text-on-success-tint"
          : "border-danger-tint-border bg-surface-floating/95 text-on-danger-tint"
      }`}
    >
      {state.valid ? `Drop in ${state.label}` : `Blocked by ${state.label}`}
    </div>
  );
}
