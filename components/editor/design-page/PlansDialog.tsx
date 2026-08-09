"use client";

import { EditorDialog } from "@/components/editor/design-system/EditorDialog";
import { getPlansReturnFocusIds } from "@/lib/plans-dialog-focus";

export type PlansDialogState = {
  open: boolean;
  openedFromUpgrade: boolean;
  layout: "default" | "annual_highlight";
  proActive: boolean;
  startingCheckout: boolean;
  openingBillingPortal: boolean;
  monthlyLabel: string;
  yearlyLabel: string;
  yearlyEffectiveMonthlyLabel: string;
  annualSavingsLabel: string;
};

export type PlansDialogActions = {
  onClose: () => void;
  onManageBilling: () => void;
  onStartCheckout: (interval: "monthly" | "yearly") => void;
};

export type PlansDialogProps = {
  state: PlansDialogState;
  actions: PlansDialogActions;
};

const actionStyle = {
  flex: 1,
  padding: "10px 12px",
  borderRadius: 12,
} as const;

export function PlansDialog({ state, actions }: PlansDialogProps) {
  return (
    <EditorDialog
      open={state.open}
      title="Plans"
      onClose={actions.onClose}
      closeLabel="Close Plans"
      testId="plans-dialog"
      dialogId="editor-plans-dialog"
      closeButtonTestId="plans-dialog-close"
      returnFocusIds={getPlansReturnFocusIds(state.openedFromUpgrade)}
      cancelFocusRestorationOnUnmount
      manageBackground
      forceLight
      panelClassName="!max-w-[420px] max-h-[calc(100dvh-2rem)] !p-4"
      contentClassName="!mt-3 overflow-y-auto"
    >
      <div style={{ fontSize: 13, opacity: 0.85 }}>
        {state.layout === "annual_highlight" ? (
          <>
            <div data-testid="plans-layout-annual-highlight" style={{ marginBottom: 8 }}>
              <b>Pro Yearly — {state.yearlyLabel}</b> · {state.yearlyEffectiveMonthlyLabel}
            </div>
            <div style={{ marginBottom: 8 }}>
              <b>Pro Monthly — {state.monthlyLabel}</b> · flexible access for short project
              bursts
            </div>
            <div style={{ marginBottom: 12, color: "#047857", fontWeight: 600 }}>
              {state.annualSavingsLabel}
            </div>
          </>
        ) : (
          <>
            <div data-testid="plans-layout-default" style={{ marginBottom: 8 }}>
              <b>Free</b> — design, save, share, and export a watermarked preview
            </div>
            <div style={{ marginBottom: 8 }}>
              <b>Pro Monthly — {state.monthlyLabel}</b>
            </div>
            <div style={{ marginBottom: 8 }}>
              <b>Pro Yearly — {state.yearlyLabel}</b>
            </div>
            <div style={{ marginBottom: 12 }}>
              Clean PDFs, up to four image angles, and Pro planning controls
            </div>
            <div style={{ marginBottom: 12, color: "#047857", fontWeight: 600 }}>
              {state.annualSavingsLabel}
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        {state.proActive ? (
          <>
            <div
              data-testid="plans-pro-active"
              style={{
                ...actionStyle,
                background: "#ecfdf5",
                color: "#047857",
                fontWeight: 600,
              }}
            >
              Pro is active
            </div>
            <button
              type="button"
              data-testid="plans-manage-billing"
              disabled={state.openingBillingPortal}
              className="outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              style={{
                ...actionStyle,
                border: "1px solid var(--border-subtle)",
              }}
              onClick={actions.onManageBilling}
            >
              {state.openingBillingPortal ? "Opening billing…" : "Manage billing"}
            </button>
          </>
        ) : state.layout === "annual_highlight" ? (
          <>
            <button
              type="button"
              data-testid="checkout-yearly"
              disabled={state.startingCheckout}
              className="outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              style={{
                ...actionStyle,
                border: "1px solid #059669",
                background: "#ecfdf5",
                fontWeight: 600,
              }}
              onClick={() => actions.onStartCheckout("yearly")}
            >
              Start yearly — {state.yearlyLabel}
            </button>

            <button
              type="button"
              data-testid="checkout-monthly"
              disabled={state.startingCheckout}
              className="outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              style={{
                ...actionStyle,
                border: "1px solid var(--border-subtle)",
              }}
              onClick={() => actions.onStartCheckout("monthly")}
            >
              Start monthly — {state.monthlyLabel}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              data-testid="checkout-monthly"
              disabled={state.startingCheckout}
              className="outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              style={{
                ...actionStyle,
                border: "1px solid var(--border-subtle)",
              }}
              onClick={() => actions.onStartCheckout("monthly")}
            >
              Start monthly — {state.monthlyLabel}
            </button>

            <button
              type="button"
              data-testid="checkout-yearly"
              disabled={state.startingCheckout}
              className="outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              style={{
                ...actionStyle,
                border: "1px solid var(--border-subtle)",
              }}
              onClick={() => actions.onStartCheckout("yearly")}
            >
              Start yearly — {state.yearlyLabel}
            </button>
          </>
        )}
      </div>
    </EditorDialog>
  );
}
