type CrossRoomDragTargetProps = {
  state: {
    valid: boolean;
    label: string;
  };
};

export function CrossRoomDragTarget({ state }: CrossRoomDragTargetProps) {
  return (
    <div
      data-testid="cross-room-drag-target"
      className={`pointer-events-none absolute left-1/2 top-36 z-30 -translate-x-1/2 rounded-full border px-4 py-2 text-sm font-semibold shadow-xl backdrop-blur ${
        state.valid
          ? "border-emerald-200 bg-white/95 text-emerald-800"
          : "border-red-200 bg-white/95 text-red-700"
      }`}
    >
      {state.valid ? `Drop in ${state.label}` : `Blocked by ${state.label}`}
    </div>
  );
}
