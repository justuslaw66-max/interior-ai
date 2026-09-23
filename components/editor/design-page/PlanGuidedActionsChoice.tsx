"use client";

type PlanGuidedActionsChoiceProps = {
  actions: {
    close: () => void;
    choose: (guided: boolean) => void;
  };
};

export function PlanGuidedActionsChoice({ actions }: PlanGuidedActionsChoiceProps) {
  return (
    <div
      data-testid="plan-guided-actions-choice"
      className="pointer-events-auto absolute bottom-32 left-4 z-30 w-[min(calc(100vw-2rem),360px)] rounded-xl border border-neutral-200 bg-white/95 p-3 shadow-xl backdrop-blur"
      role="group"
      aria-label="Choose plan action mode"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-neutral-950">Plan mode</div>
          <div className="mt-0.5 text-xs leading-5 text-neutral-600">
            Pick a starting style. Change it anytime.
          </div>
        </div>
        <button
          type="button"
          data-testid="plan-guided-actions-choice-dismiss"
          className="shrink-0 rounded-lg border border-neutral-200 px-2 py-1 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-50"
          onClick={actions.close}
        >
          Close
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="plan-guided-actions-choice-guided"
          className="min-h-10 rounded-lg bg-neutral-950 px-3 text-xs font-semibold text-white hover:bg-neutral-800"
          onClick={() => actions.choose(true)}
        >
          Guided setup
        </button>
        <button
          type="button"
          data-testid="plan-guided-actions-choice-manual"
          className="min-h-10 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
          onClick={() => actions.choose(false)}
        >
          Manual editing
        </button>
      </div>
    </div>
  );
}
