"use client";

import posthog from "posthog-js";
import { sanitizeObservabilityMeta } from "@/lib/observability";

type TrackProps = object;

declare global {
  interface Window {
    __INTERIOR_AI_ANALYTICS_DISABLED__?: boolean;
  }
}

export function setClientAnalyticsDisabled(disabled: boolean) {
  if (typeof window === "undefined") return;
  window.__INTERIOR_AI_ANALYTICS_DISABLED__ = disabled;
}

export function isClientAnalyticsDisabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS === "1" ||
    (typeof window !== "undefined" && window.__INTERIOR_AI_ANALYTICS_DISABLED__ === true)
  );
}

export function track(event: string, props: TrackProps = {}) {
  if (isClientAnalyticsDisabled()) return;

  const base = sanitizeObservabilityMeta({
    app: "interior_designer",
    platform: "desktop",
    ...props,
  });

  try {
    posthog.capture(event, base);
  } catch {
    // Analytics is best-effort and must never interrupt editing or saving.
  }
}
