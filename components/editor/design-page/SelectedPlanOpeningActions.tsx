import MeasurementField from "@/components/editor/MeasurementField";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";

type SelectedPlanOpeningActionsProps = {
  state: {
    kind: "door" | "window";
    wall: string;
    widthMm: number;
    maxWidthMm: number;
    measurementUnit: PlanMeasurementUnit;
  };
  configuration: {
    dark: boolean;
    canEdit: boolean;
  };
  actions: {
    changeWidthMm: (valueMm: number) => void;
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
      <span className={configuration.dark ? "text-neutral-400" : "text-neutral-500"}>
        Width
      </span>
      <MeasurementField
        label={`${state.kind === "door" ? "Door" : "Window"} width`}
        valueMm={state.widthMm}
        unit={state.measurementUnit}
        minMm={400}
        maxMm={state.maxWidthMm}
        stepMm={50}
        keyboardStepMm={50}
        disabled={!configuration.canEdit}
        dark={configuration.dark}
        compact
        touchFriendly
        hideLabel
        testId="selected-plan-opening-width-input"
        className="w-[132px]"
        onCommit={actions.changeWidthMm}
      />
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
