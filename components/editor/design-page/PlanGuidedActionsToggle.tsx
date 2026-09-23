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

export function PlanGuidedActionsToggle({ state, actions }: PlanGuidedActionsToggleProps) {
  const toggleClass = [
    "pointer-events-auto absolute z-30 flex items-center rounded-xl border text-xs font-semibold shadow-xl backdrop-blur transition",
    state.compact
      ? "left-1/2 top-[7.5rem] translate-x-4 gap-1.5 px-2 py-1.5"
      : "left-1/2 top-15 -translate-x-1/2 gap-2 px-3 py-2",
    state.enabled
      ? "border-emerald-200 bg-white/95 text-neutral-950 hover:border-emerald-300"
      : "border-neutral-200 bg-white/95 text-neutral-600 hover:border-neutral-300",
  ].join(" ");

  return (
    <button
      type="button"
      data-testid="plan-guided-actions-toggle"
      data-enabled={state.enabled ? "true" : "false"}
      data-compact={state.compact ? "true" : "false"}
      role="switch"
      aria-checked={state.enabled}
      aria-label={state.enabled ? "Turn guided actions off" : "Turn guided actions on"}
      className={toggleClass}
      onClick={actions.toggle}
    >
      <span>{state.compact ? "Guided" : "Guided actions"}</span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          state.enabled ? "bg-emerald-500" : "bg-neutral-300"
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${
            state.enabled ? "left-4" : "left-0.5"
          }`}
        />
      </span>
      <span className={state.enabled ? "text-emerald-700" : "text-neutral-500"}>
        {state.enabled ? "On" : "Off"}
      </span>
    </button>
  );
}
