import { prisma } from "@/lib/prisma";

export type AppEventType =
  | "share_link_created"
  | "share_link_opened"
  | "export_opened"
  | "export_printed"
  | "export_pdf_clicked"
  | "export_upgrade_prompt_shown"
  | "checkout_started"
  | "upgrade_checkout_started"
  | "upgrade_checkout_completed"
  | "billing_portal_opened"
  | "subscription_canceled"
  | "webhook_failed";

export type AppEventPayload = {
  eventType: AppEventType;
  userId?: string | null;
  designId?: string | null;
  shareToken?: string | null;
  meta?: Record<string, unknown> | null;
};

export async function logAppEvent(payload: AppEventPayload) {
  try {
    await prisma.appEvent.create({
      data: {
        eventType: payload.eventType,
        userId: payload.userId ?? null,
        designId: payload.designId ?? null,
        shareToken: payload.shareToken ?? null,
        meta: payload.meta ? (payload.meta as any) : undefined,
      },
    });
  } catch (err) {
    console.warn("[AppEvent] Failed to log event:", err instanceof Error ? err.message : err);
  }
}
