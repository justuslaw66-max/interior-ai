"use client";

import {
  EditorDialog,
  EditorDialogActions,
  EditorDialogButton,
} from "@/components/editor/design-system/EditorDialog";
import { PLANS_UPGRADE_OPENER_ID } from "@/lib/plans-dialog-focus";

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
      description={state.description} testId="upgrade-dialog"
      onClose={actions.onClose}
      closeDisabled={state.startingCheckout}
      showCloseButton={false}
      footer={
        <EditorDialogActions>
          <EditorDialogButton
            id={PLANS_UPGRADE_OPENER_ID} variant="primary"
            data-testid="upgrade-see-plans"
            data-editor-dialog-initial-focus="true"
            disabled={state.startingCheckout}
            onClick={actions.onSeePlans}
          >
            {state.primaryCtaLabel}
          </EditorDialogButton>
          {state.showSignIn ? (
            <EditorDialogButton
              className="border-accent-tint-border bg-accent-tint text-on-accent-tint hover:brightness-95"
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
          className="rounded-xl border border-box-border bg-tile p-3 text-sm text-label-secondary"
          data-testid="upgrade-variant-content"
          data-upgrade-variant={state.variantLabel}
        >
          {state.contentVariant === "unlock_pro_exports" ? (
            <div data-testid="upgrade-variant-unlock-pro-exports">
              <div className="font-medium text-label">Best for ongoing design work</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-label-secondary">
                <li>Clean PDF exports without watermark</li>
                <li>Up to four image angles and clean presentation packs</li>
                <li>{state.exportWorkflowBenefit}</li>
              </ul>
              <div className="mt-3 rounded-lg bg-success-tint px-3 py-2 text-xs font-medium text-on-success-tint">
                {state.annualSavingsLabel}
              </div>
            </div>
          ) : (
            <div data-testid="upgrade-variant-see-pricing">
              <div className="font-medium text-label">Free vs Pro at a glance</div>
              <div data-surface="floating" className="mt-2 grid grid-cols-2 gap-2 text-xs text-label-secondary">
                <div className="rounded-lg border border-box-border bg-field px-3 py-2">
                  <div className="font-semibold text-label">Free</div>
                  <div className="mt-1">Watermarked preview export</div>
                  <div>Basic sharing</div>
                </div>
                <div className="rounded-lg border border-box-border bg-field px-3 py-2">
                  <div className="font-semibold text-label">Pro</div>
                  <div className="mt-1">Clean PDF and image exports</div>
                  <div>Pro tools</div>
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-warning-tint px-3 py-2 text-xs font-medium text-on-warning-tint">
                {state.pricingGuidance}
              </div>
            </div>
          )}
        </div>
    </EditorDialog>
  );
}
