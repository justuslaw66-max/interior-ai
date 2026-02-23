"use client";

import posthog from "posthog-js";

type TrackProps = Record<string, any>;

export function track(event: string, props: TrackProps = {}) {
  const base = {
    app: "interior_designer",
    platform: "desktop",
    ...props,
  };

  posthog.capture(event, base);
}
