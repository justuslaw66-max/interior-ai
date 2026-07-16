"use client";

export type UpgradeDialogState = {
  open: boolean;
  variantLabel: string;
  contentVariant: "unlock_pro_exports" | "see_pricing";
  description: string;
  exportWorkflowBenefit: string;
  pricingGuidance: string;
  annualSavingsLabel: string;
  primaryCtaLabel: string;
  dismissLabel: string;
  startingCheckout: boolean;
  showSignIn: boolean;
};

export type UpgradeDialogActions = {
  onSeePlans: () => void;
  onSignIn: () => void;
  onClose: () => void;
};

type UpgradeDialogProps = {
  state: UpgradeDialogState;
  actions: UpgradeDialogActions;
};

export function UpgradeDialog({ state, actions }: UpgradeDialogProps) {
  if (!state.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-lg">
        <div className="text-lg font-semibold">Upgrade to Pro</div>
        <div
          className="mt-1 text-[11px] uppercase tracking-[0.2em] text-neutral-400"
          data-testid="upgrade-variant-label"
        >
          Variant: {state.variantLabel}
        </div>
        <div className="mt-2 text-sm text-neutral-600">{state.description}</div>
        <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
          {state.contentVariant === "unlock_pro_exports" ? (
            <div data-testid="upgrade-variant-unlock-pro-exports">
              <div className="font-medium text-neutral-900">Best for active projects</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-neutral-600">
                <li>Clean PDF exports without watermark</li>
                <li>Up to four image angles and clean presentation packs</li>
                <li>{state.exportWorkflowBenefit}</li>
              </ul>
              <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                {state.annualSavingsLabel}
              </div>
            </div>
          ) : (
            <div data-testid="upgrade-variant-see-pricing">
              <div className="font-medium text-neutral-900">Free vs Pro at a glance</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-600">
                <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                  <div className="font-semibold text-neutral-900">Free</div>
                  <div className="mt-1">Watermarked preview export</div>
                  <div>Basic sharing</div>
                </div>
                <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                  <div className="font-semibold text-neutral-900">Pro</div>
                  <div className="mt-1">Clean PDF and image exports</div>
                  <div>Pro planning controls</div>
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                {state.pricingGuidance}
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            data-testid="upgrade-see-plans"
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-60"
            disabled={state.startingCheckout}
            onClick={actions.onSeePlans}
          >
            {state.primaryCtaLabel}
          </button>
          {state.showSignIn && (
            <button
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700"
              onClick={actions.onSignIn}
            >
              Sign in to save progress
            </button>
          )}
          <button
            className="rounded-xl bg-neutral-200 px-4 py-2 text-sm"
            onClick={actions.onClose}
          >
            {state.dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
