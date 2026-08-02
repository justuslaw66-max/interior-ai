"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";

type ActivationState = "checking" | "active" | "delayed" | "error";

const POLL_INTERVAL_MS = 1500;
const MAX_ATTEMPTS = 20;

export default function RefreshPlanButton() {
  const [state, setState] = useState<ActivationState>("checking");
  const [retryNonce, setRetryNonce] = useState(0);
  const completionTrackedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const trackCompletion = () => {
      if (completionTrackedRef.current) return;
      completionTrackedRef.current = true;
      track("upgrade_checkout_completed", { source: "billing_success_page" });
      fetch("/api/track/app-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "upgrade_checkout_completed",
          meta: { source: "billing_success_page", verified: true },
        }),
      }).catch(() => undefined);
    };

    const poll = async () => {
      attempts += 1;
      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!alive) return;

        if (response.ok && data?.plan === "pro") {
          setState("active");
          trackCompletion();
          return;
        }

        if (attempts >= MAX_ATTEMPTS) {
          setState("delayed");
          return;
        }
      } catch {
        if (!alive) return;
        if (attempts >= MAX_ATTEMPTS) {
          setState("error");
          return;
        }
      }

      timer = setTimeout(() => {
        void poll();
      }, POLL_INTERVAL_MS);
    };

    void poll();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [retryNonce]);

  const message =
    state === "active"
      ? "Pro is active on your account."
      : state === "checking"
        ? "Confirming your Pro access…"
        : state === "delayed"
          ? "Payment completed, but Pro access is still syncing."
          : "We could not confirm your plan yet.";

  return (
    <div
      className="mt-5"
      data-testid="billing-activation-status"
      data-status={state}
      aria-live="polite"
    >
      <div
        className={
          state === "active"
            ? "rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
            : "rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700"
        }
      >
        {message}
      </div>

      {state === "active" ? (
        <div className="mt-4 flex flex-col gap-2">
          <Link
            href="/design?mode=designer"
            className="rounded-xl bg-neutral-900 px-4 py-2 text-center text-sm text-white"
          >
            Open Pro tools
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border px-4 py-2 text-center text-sm"
          >
            Go to dashboard
          </Link>
        </div>
      ) : state === "delayed" || state === "error" ? (
        <button
          type="button"
          className="mt-3 w-full rounded-xl border px-4 py-2 text-center text-sm"
          onClick={() => {
            setState("checking");
            setRetryNonce((value) => value + 1);
          }}
        >
          Check again
        </button>
      ) : null}
    </div>
  );
}
