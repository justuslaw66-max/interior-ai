"use client";

type SelectedZoneToolbarProps = {
  state: {
    label: string;
  };
  actions: {
    autoLayout: () => void;
    rotate: () => void;
    ungroup: () => void;
  };
};

export function SelectedZoneToolbar({
  state,
  actions,
}: SelectedZoneToolbarProps) {
  const buttonClass = "rounded-full border border-neutral-200 px-2 py-1 text-xs text-neutral-900";

  return (
    <div className="absolute left-1/2 top-bar-17 z-30 md:top-bar-16 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow">
        <div className="text-xs font-semibold text-neutral-900">
          {state.label}
        </div>
        <button className={buttonClass} onClick={actions.autoLayout}>
          Auto-layout
        </button>
        <button className={buttonClass} onClick={actions.rotate}>
          Rotate zone
        </button>
        <button className={buttonClass} onClick={actions.ungroup}>
          Ungroup
        </button>
      </div>
    </div>
  );
}
