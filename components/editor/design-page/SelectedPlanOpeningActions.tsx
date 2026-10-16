import MeasurementField from "@/components/editor/MeasurementField";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import { Button } from "@/components/ui/Button";

type SelectedPlanOpeningActionsProps = {
  state: {
    kind: "door" | "window";
    wall: string;
    widthMm: number;
    maxWidthMm: number;
    measurementUnit: PlanMeasurementUnit;
  };
  configuration: {
    canEdit: boolean;
  };
  actions: {
    changeWidthMm: (valueMm: number) => void;
    deleteOpening: () => void;
  };
};

/**
 * A selected door's or window's width and Delete, over the plan from md. Phones get the whole
 * inspector in the step sheet instead (UX 4d, audit AX2).
 */
export function SelectedPlanOpeningActions({
  state,
  configuration,
  actions,
}: SelectedPlanOpeningActionsProps) {
  return (
    <div
      data-testid="selected-plan-opening-actions" data-touch-area
      className="absolute left-1/2 top-bar-28 z-30 hidden -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white/95 px-3 py-2 text-xs text-neutral-800 shadow-xl backdrop-blur md:flex"
      style={{ maxWidth: "calc(100% - 2rem)" }}
    >
      <span className="font-semibold">
        {state.kind === "door" ? "Door" : "Window"} selected
      </span>
      <span className="text-neutral-500">
        {state.wall}
      </span>
      <span className="text-neutral-500">
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
        compact
        touchFriendly
        hideLabel
        testId="selected-plan-opening-width-input"
        className="w-[132px]"
        onCommit={actions.changeWidthMm}
      />
      <Button
        data-testid="selected-plan-opening-delete"
        variant="danger" size="compact"
        onClick={actions.deleteOpening}
      >
        Delete
      </Button>
    </div>
  );
}
