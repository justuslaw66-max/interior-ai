import { prisma } from "@/lib/prisma";

export type AppEventType =
  | "landing_viewed"
  | "design_started"
  | "first_item_added"
  | "third_item_added"
  | "first_run_activation_step_completed"
  | "export_clicked"
  | "upgrade_clicked"
  | "share_link_created"
  | "share_link_opened"
  | "design_duplicated"
  | "share_design_duplicated"
  | "export_opened"
  | "export_printed"
  | "export_pdf_clicked"
  | "export_upgrade_prompt_shown"
  | "checkout_started"
  | "checkout_completed"
  | "checkout_variant_validation_failed"
  | "upgrade_checkout_started"
  | "upgrade_checkout_completed"
  | "billing_portal_opened"
  | "subscription_canceled"
  | "beta_feedback_submitted"
  | "webhook_failed"
  | "variant_resolution_issue";

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
    const metaValue = payload.meta
      ? JSON.parse(JSON.stringify(payload.meta))
      : undefined;

    const event = await prisma.appEvent.create({
      data: {
        eventType: payload.eventType,
        userId: payload.userId ?? null,
        designId: payload.designId ?? null,
        shareToken: payload.shareToken ?? null,
        meta: metaValue,
      },
    });

    return { persisted: true, eventId: event.id } satisfies AppEventLogResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[AppEvent] Failed to log event:", message);
    return { persisted: false, eventId: null, error: message } satisfies AppEventLogResult;
  }
}
