import "server-only";

import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { sanitizeObservabilityMeta } from "@/lib/observability";
import {
  APP_EVENT_PROVENANCE_VERSION,
  type BrowserAuthorizedAnalyticsEventType,
  type InternalDiagnosticEventType,
} from "@/lib/app-event-provenance";

export type BrowserAnalyticsEventPayload = {
  eventType: BrowserAuthorizedAnalyticsEventType;
  userId?: string | null;
  designId?: string | null;
  shareToken?: string | null;
  meta?: Record<string, unknown> | null;
};

export type InternalDiagnosticEventPayload = {
  eventType: InternalDiagnosticEventType;
  userId?: string | null;
  designId?: string | null;
  meta?: Record<string, unknown> | null;
};

export type AppEventRecordResult = {
  persisted: boolean;
  eventId: string | null;
  error?: string;
};

type PersistedAnalyticsEvent = {
  eventType: BrowserAuthorizedAnalyticsEventType | InternalDiagnosticEventType;
  userId?: string | null;
  designId?: string | null;
  shareToken?: string | null;
  meta?: Record<string, unknown> | null;
  authority: "BROWSER_AUTHORIZED_ANALYTICS" | "INTERNAL_DIAGNOSTIC";
  producer: "PUBLIC_BROWSER_INGESTION" | "SERVER_APPLICATION";
  verificationMethod: "PUBLIC_REQUEST" | "SERVER_ACTION";
};

async function persistBestEffortAppEvent(payload: PersistedAnalyticsEvent) {
  try {
    const shareRef = payload.shareToken
      ? crypto.createHash("sha256").update(payload.shareToken).digest("hex").slice(0, 16)
      : undefined;
    const sanitizedMeta = sanitizeObservabilityMeta({
      ...(payload.meta ?? {}),
      ...(shareRef ? { shareRef } : {}),
    });
    const metaValue = sanitizedMeta
      ? JSON.parse(JSON.stringify(sanitizedMeta))
      : undefined;

    const event = await prisma.appEvent.create({
      data: {
        eventType: payload.eventType,
        userId: payload.userId ?? null,
        designId: payload.designId ?? null,
        // Raw bearer tokens must never be copied into analytics storage.
        shareToken: null,
        meta: metaValue,
        authority: payload.authority,
        producer: payload.producer,
        verificationMethod: payload.verificationMethod,
        provenanceVersion: APP_EVENT_PROVENANCE_VERSION,
        externalEventId: null,
      },
    });

    return { persisted: true, eventId: event.id } satisfies AppEventRecordResult;
  } catch (err) {
    console.warn("[AppEvent] Failed to persist event", {
      eventType: payload.eventType,
      errorType: err instanceof Error ? err.name : "unknown",
    });
    return {
      persisted: false,
      eventId: null,
      error: "event_logging_failed",
    } satisfies AppEventRecordResult;
  }
}

export function recordBrowserAnalyticsEvent(
  payload: BrowserAnalyticsEventPayload
) {
  return persistBestEffortAppEvent({
    ...payload,
    authority: "BROWSER_AUTHORIZED_ANALYTICS",
    producer: "PUBLIC_BROWSER_INGESTION",
    verificationMethod: "PUBLIC_REQUEST",
  });
}

export function recordServerAnalyticsEvent(payload: BrowserAnalyticsEventPayload) {
  return persistBestEffortAppEvent({
    ...payload,
    authority: "BROWSER_AUTHORIZED_ANALYTICS",
    producer: "SERVER_APPLICATION",
    verificationMethod: "SERVER_ACTION",
  });
}

export function recordInternalDiagnosticEvent(payload: InternalDiagnosticEventPayload) {
  return persistBestEffortAppEvent({
    ...payload,
    authority: "INTERNAL_DIAGNOSTIC",
    producer: "SERVER_APPLICATION",
    verificationMethod: "SERVER_ACTION",
  });
}
