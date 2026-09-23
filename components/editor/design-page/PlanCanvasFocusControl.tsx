"use client";

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
  if (mode === "scale") return "Scaling plan";
  if (mode === "window") return "Placing window";
  if (mode === "door") return "Placing door";
  return "Drawing room";
}

export function PlanCanvasFocusControl({ state, actions }: PlanCanvasFocusControlProps) {
  return (
    <div
      data-testid="plan-focus-control"
      data-focused={state.focused ? "true" : "false"}
      className="absolute left-4 top-15 z-30 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white/95 px-2.5 py-2 shadow-xl backdrop-blur"
      role="toolbar"
      aria-label="Plan focus controls"
    >
      <span className="flex min-w-0 items-center gap-2 pr-1">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
        <span className="truncate text-xs font-semibold text-neutral-800">
          {getFocusModeLabel(state.mode)}
        </span>
        <span
          data-testid="plan-focus-progress"
          className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600"
        >
          {state.progressLabel}
        </span>
        {!state.guided && (
          <span
            data-testid="plan-focus-manual-mode"
            className="shrink-0 rounded-full bg-neutral-950 px-2 py-0.5 text-[11px] font-semibold text-white"
          >
            Manual
          </span>
        )}
      </span>
      {state.canUndo && (
        <button
          type="button"
          data-testid="plan-focus-undo"
          className="shrink-0 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
          onClick={actions.undo}
        >
          Undo
        </button>
      )}
      {state.canClear && (
        <button
          type="button"
          data-testid="plan-focus-clear"
          className="shrink-0 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
          onClick={actions.clear}
        >
          Clear
        </button>
      )}
      <button
        type="button"
        data-testid="plan-focus-panel-toggle"
        className="shrink-0 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
        onClick={actions.togglePanel}
      >
        {state.focused ? "Panel" : "Focus"}
      </button>
      <button
        type="button"
        data-testid="plan-focus-done"
        aria-label={state.guided ? "Finish plan focus mode" : "Cancel manual plan tool"}
        className="shrink-0 rounded-lg bg-neutral-950 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
        onClick={actions.finish}
      >
        {state.guided ? "Done" : "Cancel"}
      </button>
    </div>
  );
}
