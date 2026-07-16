"use client";

type DesignToolsRestoreButtonProps = {
  state: {
    label: string;
  };
  actions: {
    restore: () => void;
  };
};

export function DesignToolsRestoreButton({
  state,
  actions,
}: DesignToolsRestoreButtonProps) {
  return (
    <button
      type="button"
      data-testid="design-tools-restore"
      className="pointer-events-auto absolute bottom-4 left-4 z-30 rounded-xl border border-neutral-200 bg-white/95 px-3 py-2 text-xs font-semibold text-neutral-800 shadow-xl backdrop-blur hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
      aria-label={`Show ${state.label.toLowerCase()}`}
      onClick={actions.restore}
    >
      {state.label}
    </button>
  );
}
