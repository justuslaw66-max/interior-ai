"use client";
import { Button } from "@/components/ui/Button";

export type PlanCanvasFocusMode = "scale" | "door" | "window" | "room";

type PlanCanvasFocusControlState = {
  mode: PlanCanvasFocusMode;
  progressLabel: string;
  focused: boolean;
  guided: boolean;
  canUndo: boolean;
  canClear: boolean;
};

type PlanCanvasFocusControlActions = {
  undo: () => void;
  clear: () => void;
  togglePanel: () => void;
  finish: () => void;
};

type PlanCanvasFocusControlProps = {
  state: PlanCanvasFocusControlState;
  actions: PlanCanvasFocusControlActions;
};

function getFocusModeLabel(mode: PlanCanvasFocusMode) {
  if (mode === "scale") return "Setting scale";
  if (mode === "window") return "Placing window";
  if (mode === "door") return "Placing door";
  return "Drawing room";
}

export function PlanCanvasFocusControl({ state, actions }: PlanCanvasFocusControlProps) {
  return (
    <div
      data-testid="plan-focus-control" data-surface="floating"
      data-focused={state.focused ? "true" : "false"}
      className="absolute left-4 top-bar-17 z-30 md:top-bar-6 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-xl border border-separator bg-surface-floating/95 px-2.5 py-2 shadow-xl backdrop-blur"
      role="toolbar"
      aria-label="Plan focus controls"
    >
      <span className="flex min-w-0 items-center gap-2 pr-1">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
        <span className="truncate text-xs font-semibold text-control-label">
          {getFocusModeLabel(state.mode)}
        </span>
        <span
          data-testid="plan-focus-progress"
          className="shrink-0 rounded-full bg-control-track px-2 py-0.5 text-xs font-semibold text-label-secondary"
        >
          {state.progressLabel}
        </span>
        {!state.guided && (
          <span
            data-testid="plan-focus-manual-mode"
            className="shrink-0 rounded-full bg-control-primary px-2 py-0.5 text-xs font-semibold text-control-on-primary"
          >
            Manual
          </span>
        )}
      </span>
      {state.canUndo && (
        <Button
          data-testid="plan-focus-undo"
          variant="secondary" size="compact" className="shrink-0"
          onClick={actions.undo}
        >
          Undo
        </Button>
      )}
      {state.canClear && (
        <Button
          data-testid="plan-focus-clear"
          variant="secondary" size="compact" className="shrink-0"
          onClick={actions.clear}
        >
          Clear
        </Button>
      )}
      <Button
        data-testid="plan-focus-panel-toggle"
        variant="secondary" size="compact" className="shrink-0"
        onClick={actions.togglePanel}
      >
        {state.focused ? "Panel" : "Focus"}
      </Button>
      <Button
        data-testid="plan-focus-done"
        aria-label={state.guided ? "Finish plan focus mode" : "Cancel manual plan tool"}
        variant="primary" size="compact" className="shrink-0"
        onClick={actions.finish}
      >
        {state.guided ? "Done" : "Cancel"}
      </Button>
    </div>
  );
}
