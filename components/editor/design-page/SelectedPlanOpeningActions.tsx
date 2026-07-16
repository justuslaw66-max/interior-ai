type SelectedPlanOpeningActionsProps = {
  state: {
    kind: "door" | "window";
    wall: string;
    widthLabel: string;
  };
  configuration: {
    dark: boolean;
  };
  actions: {
    deleteOpening: () => void;
  };
};

export function SelectedPlanOpeningActions({
  state,
  configuration,
  actions,
}: SelectedPlanOpeningActionsProps) {
  return (
    <div
      data-testid="selected-plan-opening-actions"
      className={
        configuration.dark
          ? "designer-work-surface absolute left-1/2 top-[112px] z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs"
          : "absolute left-1/2 top-[112px] z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white/95 px-3 py-2 text-xs text-neutral-800 shadow-xl backdrop-blur"
      }
      style={{ maxWidth: "calc(100% - 2rem)" }}
    >
      <span className="font-semibold">
        {state.kind === "door" ? "Door" : "Window"} selected
      </span>
      <span className={configuration.dark ? "text-neutral-400" : "text-neutral-500"}>
        {state.wall}
      </span>
      <span
        className={
          configuration.dark
            ? "designer-recessed rounded-md px-2 py-1 text-[11px]"
            : "rounded-md bg-neutral-100 px-2 py-1 text-[11px] text-neutral-600"
        }
      >
        {state.widthLabel} wide
      </span>
      <button
        type="button"
        data-testid="selected-plan-opening-delete"
        className={
          configuration.dark
            ? "designer-status-blocked rounded-lg px-2.5 py-1.5 font-semibold"
            : "rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 font-semibold text-red-700 hover:bg-red-100"
        }
        onClick={actions.deleteOpening}
      >
        Delete
      </button>
    </div>
  );
}
