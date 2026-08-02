"use client";

import {
  EditorDialog,
  EditorDialogActions,
  EditorDialogButton,
} from "@/components/editor/design-system/EditorDialog";

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

export type UpgradeDialogProps = {
  state: UpgradeDialogState;
  actions: UpgradeDialogActions;
};

export function UpgradeDialog({ state, actions }: UpgradeDialogProps) {
  if (!state.open) return null;

  return (
    <EditorDialog
      open
      title="Upgrade to Pro"
      description={state.description}
      onClose={actions.onClose}
      closeDisabled={state.startingCheckout}
      showCloseButton={false}
      footer={
        <EditorDialogActions>
          <EditorDialogButton
            variant="primary"
            data-testid="upgrade-see-plans"
            data-editor-dialog-initial-focus="true"
            disabled={state.startingCheckout}
            onClick={actions.onSeePlans}
          >
            {state.primaryCtaLabel}
          </EditorDialogButton>
          {state.showSignIn ? (
            <EditorDialogButton
              className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              onClick={actions.onSignIn}
            >
              Sign in to save progress
            </EditorDialogButton>
          ) : null}
          <EditorDialogButton
            disabled={state.startingCheckout}
            onClick={actions.onClose}
          >
            {state.dismissLabel}
          </EditorDialogButton>
        </EditorDialogActions>
      }
    >
        <div
          className="text-[11px] uppercase tracking-[0.2em] text-neutral-400"
          data-testid="upgrade-variant-label"
        >
          Variant: {state.variantLabel}
        </div>
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
    </EditorDialog>
  );
}
