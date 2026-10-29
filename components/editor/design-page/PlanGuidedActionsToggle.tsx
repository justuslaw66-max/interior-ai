"use client";

type PlanGuidedActionsToggleProps = {
  state: {
    enabled: boolean;
    compact: boolean;
  };
  actions: {
    toggle: () => void;
  };
};

/**
 * Tips (UX audit ED6): on, Plan guides each step on the canvas; off, it shows the plain tools
 * (Select, Draw room, Door, Window, Fit). One switch, on by default; the first-visit "Plan mode"
 * choice is gone.
 */
export function PlanGuidedActionsToggle({ state, actions }: PlanGuidedActionsToggleProps) {
  const toggleClass = [
    "pointer-events-auto flex touch:min-h-11 items-center rounded-xl border text-xs font-semibold shadow-xl backdrop-blur transition",
    // Compact, it sits in the quick actions' row (DesignPagePlanCanvasOverlays); on its own, top centre.
    state.compact
      ? "gap-1.5 px-2 py-1.5"
      : "absolute z-30 left-1/2 md:left-[var(--canvas-centre-x,50%)] top-bar-17 -translate-x-1/2 gap-2 px-3 py-2 md:top-bar-20",
    state.enabled
      ? "border-separator bg-surface-floating/95 text-label hover:border-control-edge-hover"
      : "border-separator bg-surface-floating/95 text-label-secondary hover:border-control-secondary-border",
  ].join(" ");

  return (
    <button
      type="button"
      data-testid="plan-guided-actions-toggle" data-surface="floating"
      data-enabled={state.enabled ? "true" : "false"}
      data-compact={state.compact ? "true" : "false"}
      role="switch"
      aria-checked={state.enabled}
      aria-label="Tips"
      className={toggleClass}
      onClick={actions.toggle}
    >
      <span>Tips</span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          state.enabled ? "bg-control-primary" : "bg-control-switch-off"
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full shadow-sm transition ${
            state.enabled ? "left-4 bg-control-on-primary" : "left-0.5 bg-control-switch-knob"
          }`}
        />
      </span>
      <span className={state.enabled ? "text-label" : "text-label-secondary"}>
        {state.enabled ? "On" : "Off"}
      </span>
    </button>
  );
}
