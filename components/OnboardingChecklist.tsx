"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { getOnboardingProgress, type OnboardingStep } from "@/lib/onboarding";

export function OnboardingChecklist({
  items,
  isClientPreview,
  onAutoStep,
  onDismiss,
  onComplete,
}: {
  items: Array<{ productId: string }>;
  isClientPreview: boolean;
  onAutoStep: (step: OnboardingStep) => Promise<void> | void;
  onDismiss: () => void;
  onComplete: () => void;
}) {
  if (isClientPreview) return null;

  const { has, next, done } = getOnboardingProgress(items);
  const shownRef = useRef(false);
  const prevHasRef = useRef(has);
  const [pulseStep, setPulseStep] = useState<OnboardingStep | null>(null);
  const pulseShownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    track("onboarding_checklist_shown", { next });
    shownRef.current = true;
  }, [next]);

  useEffect(() => {
    const prev = prevHasRef.current;
    (Object.keys(has) as OnboardingStep[]).forEach((step) => {
      if (!prev[step] && has[step]) {
        track("onboarding_step_completed", { step });
      }
    });
    prevHasRef.current = has;
  }, [has]);

  useEffect(() => {
    if (!next || pulseShownRef.current) return;
    setPulseStep(next);
    pulseShownRef.current = true;
    const t = window.setTimeout(() => setPulseStep(null), 900);
    return () => window.clearTimeout(t);
  }, [next]);

  if (done) {
    return (
      <div
        className="panel"
        style={{ position: "absolute", right: 16, top: 72, width: 320, padding: 14 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 600 }}>Nice. Your room is ready.</div>
          <button onClick={onDismiss} style={{ opacity: 0.7 }}>
            X
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.75 }}>
          Save and share it when you are ready.
        </div>
        <button
          onClick={onComplete}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--border-subtle)",
            background: "color-mix(in oklab, var(--accent) 18%, transparent)",
          }}
        >
          Save and Share
        </button>
      </div>
    );
  }

  return (
    <div
      className="panel"
      style={{ position: "absolute", right: 16, top: 72, width: 320, padding: 14 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <div style={{ fontWeight: 600 }}>Finish your living room</div>
        <button onClick={onDismiss} style={{ opacity: 0.7 }}>
          X
        </button>
      </div>

      <Step
        label="Place a sofa"
        done={has.sofa}
        active={next === "sofa"}
        pulse={pulseStep === "sofa"}
        onAuto={() => {
          setPulseStep(null);
          onAutoStep("sofa");
        }}
      />
      <Step
        label="Add a rug (auto-sized)"
        done={has.rug}
        active={next === "rug"}
        pulse={pulseStep === "rug"}
        onAuto={() => {
          setPulseStep(null);
          onAutoStep("rug");
        }}
      />
      <Step
        label="Add a coffee table"
        done={has.coffee_table}
        active={next === "coffee_table"}
        pulse={pulseStep === "coffee_table"}
        onAuto={() => {
          setPulseStep(null);
          onAutoStep("coffee_table");
        }}
      />
      <Step
        label="Create a reading corner"
        done={has.reading_corner}
        active={next === "reading_corner"}
        pulse={pulseStep === "reading_corner"}
        onAuto={() => {
          setPulseStep(null);
          onAutoStep("reading_corner");
        }}
      />

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
        Tip: you can skip this anytime.
      </div>
    </div>
  );
}

function Step({
  label,
  done,
  active,
  pulse,
  onAuto,
}: {
  label: string;
  done: boolean;
  active: boolean;
  pulse: boolean;
  onAuto: () => void;
}) {
  const border = active
    ? "1px solid color-mix(in oklab, var(--accent) 40%, transparent)"
    : "1px solid var(--border-subtle)";
  const background = active
    ? "color-mix(in oklab, var(--accent) 10%, transparent)"
    : "transparent";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 10px",
        borderRadius: 12,
        border,
        background,
        marginBottom: 8,
      }}
    >
      <div style={{ width: 18, fontSize: 12 }}>{done ? "Done" : active ? "Next" : "Todo"}</div>
      <div style={{ flex: 1, fontSize: 13, opacity: done ? 0.6 : 1 }}>{label}</div>
      {!done && (
        <button
          onClick={onAuto}
          style={{
            fontSize: 12,
            padding: "6px 8px",
            borderRadius: 10,
            border: "1px solid var(--border-subtle)",
            background: "transparent",
          }}
          className={pulse ? "pulse-once" : undefined}
        >
          Do it for me
        </button>
      )}
    </div>
  );
}
