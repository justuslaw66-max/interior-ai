import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { sanitizeObservabilityMeta } from "@/lib/observability";

export const APP_EVENT_TYPES = [
  "landing_viewed",
  "design_started",
  "first_item_added",
  "third_item_added",
  "first_run_activation_step_completed",
  "export_clicked",
  "upgrade_clicked",
  "share_link_created",
  "share_link_opened",
  "design_duplicated",
  "share_design_duplicated",
  "export_opened",
  "export_printed",
  "export_pdf_clicked",
  "export_upgrade_prompt_shown",
  "checkout_started",
  "checkout_completed",
  "checkout_return_observed",
  "checkout_variant_validation_failed",
  "upgrade_checkout_started",
  "upgrade_checkout_completed",
  "billing_portal_opened",
  "subscription_canceled",
  "beta_feedback_submitted",
  "webhook_failed",
  "variant_resolution_issue",
] as const;

export type AppEventType = (typeof APP_EVENT_TYPES)[number];

export type AppEventPayload = {
  eventType: AppEventType;
  userId?: string | null;
  designId?: string | null;
  shareToken?: string | null;
  meta?: Record<string, unknown> | null;
};

export type AppEventLogResult = {
  persisted: boolean;
  eventId: string | null;
  error?: string;
};

export async function logAppEvent(payload: AppEventPayload) {
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
      },
    });

    return { persisted: true, eventId: event.id } satisfies AppEventLogResult;
  } catch (err) {
    console.warn("[AppEvent] Failed to persist event", {
      eventType: payload.eventType,
      errorType: err instanceof Error ? err.name : "unknown",
    });
    return {
      persisted: false,
      eventId: null,
      error: "event_logging_failed",
    } satisfies AppEventLogResult;
  }
}
