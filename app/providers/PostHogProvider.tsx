"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

function resolvePostHogIngestHost(rawHost?: string): string {
  const fallback = "https://us.i.posthog.com";
  const host = (rawHost ?? fallback).trim();
  if (!host) return fallback;

  const normalized = host.replace(/\/$/, "").toLowerCase();

  if (
    normalized === "https://app.posthog.com" ||
    normalized === "https://us.posthog.com" ||
    normalized === "app.posthog.com" ||
    normalized === "us.posthog.com"
  ) {
    return fallback;
  }

  if (normalized === "https://eu.posthog.com" || normalized === "eu.posthog.com") {
    return "https://eu.i.posthog.com";
  }

  return host.replace(/\/$/, "");
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

    const isDevelopment = process.env.NODE_ENV === "development";
    const ingestHost = resolvePostHogIngestHost(process.env.NEXT_PUBLIC_POSTHOG_HOST);
    const uiHost = process.env.NEXT_PUBLIC_POSTHOG_UI_HOST || "https://us.posthog.com";

    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      // In local dev, call PostHog directly to avoid flaky local proxy timeouts.
      api_host: isDevelopment ? ingestHost : "/ingest",
      ui_host: uiHost,
      capture_pageview: false,
      autocapture: false,
      capture_exceptions: true,
      // Reduce noisy recorder traffic/errors in development.
      disable_session_recording: isDevelopment,
    });
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
