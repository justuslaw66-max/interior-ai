"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";

type ActivationState = "checking" | "active" | "delayed" | "error";

const POLL_INTERVAL_MS = 1500;
const MAX_ATTEMPTS = 20;

/** The page says what it knows: checking until the account shows Pro (UX audit PR7). */
const ACTIVATION_COPY: Readonly<Record<ActivationState, { heading: string; detail: string }>> = {
  checking: { heading: "Checking your payment…", detail: "Confirming your Pro access…" },
  active: { heading: "Pro is active", detail: "Pro is active on your account." },
  delayed: { heading: "Payment received", detail: "Payment completed, but Pro access is still syncing." },
  error: { heading: "We couldn't confirm Pro yet", detail: "We could not confirm your Pro access yet." },
};

async function fetchPlanStatus(): Promise<"pro" | "pending" | "failed"> {
  try {
    const response = await fetch("/api/me", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    return response.ok && data?.plan === "pro" ? "pro" : "pending";
  } catch {
    return "failed";
  }
}

function trackCheckoutCompletion() {
  track("checkout_success_viewed", { source: "billing_success_page" });
  fetch("/api/track/app-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType: "checkout_success_viewed",
      meta: { source: "billing_success_page", planStatusObserved: "pro" },
    }),
  }).catch(() => undefined);
}

/** Polls /api/me until the account is Pro, for at most MAX_ATTEMPTS tries per round. */
function usePlanActivation() {
  const [state, setState] = useState<ActivationState>("checking");
  const [retryNonce, setRetryNonce] = useState(0);
  const completionTrackedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      const status = await fetchPlanStatus();
      if (!alive) return;
      if (status === "pro") {
        setState("active");
        if (!completionTrackedRef.current) {
          completionTrackedRef.current = true;
          trackCheckoutCompletion();
        }
        return;
      }
      if (attempts >= MAX_ATTEMPTS) {
        setState(status === "failed" ? "error" : "delayed");
        return;
      }
      timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };
    void poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [retryNonce]);

  const retry = () => {
    setState("checking");
    setRetryNonce((value) => value + 1);
  };
  return { state, retry };
}

function ActivationActions({ state, onRetry }: { state: ActivationState; onRetry: () => void }) {
  if (state === "active") {
    return (
      <div className="mt-4 flex flex-col gap-2">
        <Link href="/design?mode=designer" className="rounded-xl bg-neutral-900 px-4 py-2 text-center text-sm text-white">
          Open Pro tools
        </Link>
        <Link href="/dashboard" className="rounded-xl border px-4 py-2 text-center text-sm">
          My designs
        </Link>
      </div>
    );
  }
  if (state === "checking") return null;
  return (
    <button type="button" className="mt-3 w-full rounded-xl border px-4 py-2 text-center text-sm" onClick={onRetry}>
      Check again
    </button>
  );
}

/** The billing success page's heading, status and next step, while Pro reaches the account. */
export default function RefreshPlanButton() {
  const { state, retry } = usePlanActivation();
  const copy = ACTIVATION_COPY[state];
  return (
    <div data-testid="billing-activation-status" data-status={state} aria-live="polite">
      <h1 className="text-2xl font-semibold">{copy.heading}</h1>
      <div
        className={
          state === "active"
            ? "mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
            : "mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700"
        }
      >
        {copy.detail}
      </div>
      <ActivationActions state={state} onRetry={retry} />
    </div>
  );
}
