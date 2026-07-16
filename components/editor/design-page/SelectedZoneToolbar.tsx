"use client";

type SelectedZoneToolbarProps = {
  state: {
    label: string;
  };
  configuration: {
    dark: boolean;
  };
  actions: {
    autoLayout: () => void;
    rotate: () => void;
    ungroup: () => void;
  };
};

export function SelectedZoneToolbar({
  state,
  configuration,
  actions,
}: SelectedZoneToolbarProps) {
  const buttonClass = configuration.dark
    ? "rounded-full border px-2 py-1 text-xs"
    : "rounded-full border border-neutral-200 px-2 py-1 text-xs text-neutral-900";

  return (
    <div className="absolute left-1/2 top-16 z-30 -translate-x-1/2">
      <div
        className={
          configuration.dark
            ? "designer-panel flex items-center gap-2 rounded-full px-3 py-2"
            : "flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow"
        }
      >
        <div
          className={
            configuration.dark
              ? "designer-text-primary text-xs font-semibold"
              : "text-xs font-semibold text-neutral-900"
          }
        >
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
