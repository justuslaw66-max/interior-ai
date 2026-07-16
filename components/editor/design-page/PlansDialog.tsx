"use client";

export type PlansDialogState = {
  open: boolean;
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

type PlansDialogProps = {
  state: PlansDialogState;
  actions: PlansDialogActions;
};

export function PlansDialog({ state, actions }: PlansDialogProps) {
  if (!state.open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={actions.onClose}
    >
      <div
        className="panel"
        style={{ width: 420, padding: 16 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontWeight: 700 }}>Plans</div>
          <button onClick={actions.onClose}>✕</button>
        </div>

        <div style={{ marginTop: 12, fontSize: 13, opacity: 0.85 }}>
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
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "#ecfdf5",
                  color: "#047857",
                  fontWeight: 600,
                }}
              >
                Pro is active
              </div>
              <button
                data-testid="plans-manage-billing"
                disabled={state.openingBillingPortal}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
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
                data-testid="checkout-yearly"
                disabled={state.startingCheckout}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #059669",
                  background: "#ecfdf5",
                  fontWeight: 600,
                }}
                onClick={() => actions.onStartCheckout("yearly")}
              >
                Start yearly — {state.yearlyLabel}
              </button>

              <button
                data-testid="checkout-monthly"
                disabled={state.startingCheckout}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
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
                data-testid="checkout-monthly"
                disabled={state.startingCheckout}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border-subtle)",
                }}
                onClick={() => actions.onStartCheckout("monthly")}
              >
                Start monthly — {state.monthlyLabel}
              </button>

              <button
                data-testid="checkout-yearly"
                disabled={state.startingCheckout}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border-subtle)",
                }}
                onClick={() => actions.onStartCheckout("yearly")}
              >
                Start yearly — {state.yearlyLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
