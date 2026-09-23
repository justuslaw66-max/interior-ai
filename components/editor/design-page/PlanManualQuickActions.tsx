"use client";

import type { FloorPlanTool } from "@/components/editor/FloorPlanToolStrip";

type ManualPlanActionIconName =
  | "select"
  | "scale"
  | "draw"
  | "door"
  | "window"
  | "fit";

type PlanManualQuickActionsState = {
  activeTool: FloorPlanTool;
  hasUnderlay: boolean;
  calibrationActive: boolean;
  canScale: boolean;
  hasRooms: boolean;
};

type PlanManualQuickActionsActions = {
  select: () => void;
  scale: () => void;
  drawRoom: () => void;
  addOpening: (kind: "door" | "window") => void;
  fit: () => void;
};

type PlanManualQuickActionsProps = {
  state: PlanManualQuickActionsState;
  actions: PlanManualQuickActionsActions;
};

const manualPlanQuickActionButtonClass = (active: boolean, disabled = false) =>
  [
    "group relative grid h-10 w-10 shrink-0 place-items-center rounded-lg border text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-neutral-900/20",
    active
      ? "border-neutral-950 bg-neutral-950 text-white shadow-sm"
      : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
    disabled ? "cursor-not-allowed opacity-45 hover:bg-white" : "",
  ].join(" ");

const manualPlanQuickActionTooltipClass =
  "pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-950 px-2 py-1 text-[10px] font-semibold text-white shadow-lg group-hover:block group-focus:block group-focus-visible:block";

function ManualPlanActionIcon({ name }: { name: ManualPlanActionIconName }) {
  const lineProps = {
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
  };

  if (name === "select") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path d="M6 4l10 8-5 1.5 3 5-2.5 1.5-3-5-3.5 4V4z" {...lineProps} />
      </svg>
    );
  }

  if (name === "scale") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path d="M4 16l12-12 4 4L8 20l-4-4zM8 16l-2-2M11 13l-2-2M14 10l-2-2" {...lineProps} />
      </svg>
    );
  }

  if (name === "draw") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path d="M5 19h14M7 15l8.5-8.5 2 2L9 17H7v-2z" {...lineProps} />
      </svg>
    );
  }

  if (name === "door") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path d="M7 20V5h9v15M10 12h.01M16 20H5" {...lineProps} />
      </svg>
    );
  }

  if (name === "window") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path d="M5 6h14v12H5zM12 6v12M5 12h14" {...lineProps} />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
      <path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4M8 4L4 8M16 4l4 4M20 16l-4 4M4 16l4 4" {...lineProps} />
    </svg>
  );
}

export function PlanManualQuickActions({ state, actions }: PlanManualQuickActionsProps) {
  const roomsUnavailable = !state.hasRooms;

  return (
    <div
      data-testid="plan-manual-quick-actions"
      className="pointer-events-auto absolute left-1/2 top-15 z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl border border-neutral-200 bg-white/95 p-1 shadow-xl backdrop-blur"
      role="toolbar"
      aria-label="Manual plan actions"
    >
      <button
        type="button"
        data-testid="manual-plan-action-select"
        className={manualPlanQuickActionButtonClass(state.activeTool === "select")}
        aria-label="Select plan objects"
        aria-pressed={state.activeTool === "select"}
        title="Select"
        onClick={actions.select}
      >
        <ManualPlanActionIcon name="select" />
        <span className="sr-only">Select</span>
        <span
          data-testid="manual-plan-action-select-tooltip"
          className={manualPlanQuickActionTooltipClass}
          aria-hidden="true"
        >
          Select
        </span>
      </button>
      {state.hasUnderlay && (
        <button
          type="button"
          data-testid="manual-plan-action-scale"
          className={manualPlanQuickActionButtonClass(
            state.calibrationActive,
            !state.canScale
          )}
          disabled={!state.canScale}
          aria-label="Set plan scale"
          aria-pressed={state.calibrationActive}
          title={state.canScale ? "Set scale" : "Scale is unavailable for this upload"}
          onClick={actions.scale}
        >
          <ManualPlanActionIcon name="scale" />
          <span className="sr-only">Set scale</span>
          <span
            data-testid="manual-plan-action-scale-tooltip"
            className={manualPlanQuickActionTooltipClass}
            aria-hidden="true"
          >
            {state.canScale ? "Set scale" : "Scale unavailable"}
          </span>
        </button>
      )}
      <button
        type="button"
        data-testid="manual-plan-action-draw"
        className={manualPlanQuickActionButtonClass(state.activeTool === "draw_room")}
        aria-label="Draw room"
        aria-pressed={state.activeTool === "draw_room"}
        title="Draw room"
        onClick={actions.drawRoom}
      >
        <ManualPlanActionIcon name="draw" />
        <span className="sr-only">Draw room</span>
        <span
          data-testid="manual-plan-action-draw-tooltip"
          className={manualPlanQuickActionTooltipClass}
          aria-hidden="true"
        >
          Draw room
        </span>
      </button>
      <button
        type="button"
        data-testid="manual-plan-action-door"
        className={manualPlanQuickActionButtonClass(
          state.activeTool === "door",
          roomsUnavailable
        )}
        disabled={roomsUnavailable}
        aria-label={roomsUnavailable ? "Draw a room first to add a door" : "Add door"}
        aria-pressed={state.activeTool === "door"}
        title={roomsUnavailable ? "Draw a room first" : "Add door"}
        onClick={() => actions.addOpening("door")}
      >
        <ManualPlanActionIcon name="door" />
        <span className="sr-only">Add door</span>
        <span
          data-testid="manual-plan-action-door-tooltip"
          className={manualPlanQuickActionTooltipClass}
          aria-hidden="true"
        >
          {roomsUnavailable ? "Draw room first" : "Add door"}
        </span>
      </button>
      <button
        type="button"
        data-testid="manual-plan-action-window"
        className={manualPlanQuickActionButtonClass(
          state.activeTool === "window",
          roomsUnavailable
        )}
        disabled={roomsUnavailable}
        aria-label={roomsUnavailable ? "Draw a room first to add a window" : "Add window"}
        aria-pressed={state.activeTool === "window"}
        title={roomsUnavailable ? "Draw a room first" : "Add window"}
        onClick={() => actions.addOpening("window")}
      >
        <ManualPlanActionIcon name="window" />
        <span className="sr-only">Add window</span>
        <span
          data-testid="manual-plan-action-window-tooltip"
          className={manualPlanQuickActionTooltipClass}
          aria-hidden="true"
        >
          {roomsUnavailable ? "Draw room first" : "Add window"}
        </span>
      </button>
      <button
        type="button"
        data-testid="manual-plan-action-fit"
        className={manualPlanQuickActionButtonClass(false)}
        aria-label="Fit plan to screen"
        title="Fit plan"
        onClick={actions.fit}
      >
        <ManualPlanActionIcon name="fit" />
        <span className="sr-only">Fit plan</span>
        <span
          data-testid="manual-plan-action-fit-tooltip"
          className={manualPlanQuickActionTooltipClass}
          aria-hidden="true"
        >
          Fit plan
        </span>
      </button>
    </div>
  );
}
