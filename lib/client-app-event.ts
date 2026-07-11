"use client";

import type { ClientAppEventType } from "@/lib/app-event-contract";

export type ClientAppEventPayload = {
  eventType: ClientAppEventType;
  designId?: string | null;
  shareToken?: string | null;
  meta?: Record<string, unknown> | null;
};

export type ClientAppEventFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export function postClientAppEvent(
  payload: ClientAppEventPayload,
  fetchImpl: ClientAppEventFetch = fetch,
) {
  return fetchImpl("/api/track/app-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
