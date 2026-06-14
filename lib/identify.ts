"use client";

import posthog from "posthog-js";
import { getAnonId } from "./anon";
import { isClientAnalyticsDisabled } from "./analytics";

export function identifyUser(user: {
  id: string;
  email?: string;
  plan?: string;
}) {
  if (isClientAnalyticsDisabled()) return;

  const anon = getAnonId();

  posthog.register({ anonymous_id: anon });
  posthog.identify(user.id, {
    email: user.email,
    plan: user.plan,
  });
}
