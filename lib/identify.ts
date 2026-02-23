"use client";

import posthog from "posthog-js";
import { getAnonId } from "./anon";

export function identifyUser(user: {
  id: string;
  email?: string;
  plan?: string;
}) {
  const anon = getAnonId();

  posthog.register({ anonymous_id: anon });
  posthog.identify(user.id, {
    email: user.email,
    plan: user.plan,
  });
}
