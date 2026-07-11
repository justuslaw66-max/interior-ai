export const CLIENT_APP_EVENT_TYPES = [
  "landing_viewed",
  "design_started",
  "first_item_added",
  "third_item_added",
  "first_run_activation_step_completed",
  "export_clicked",
  "upgrade_clicked",
  "share_link_opened",
  "export_opened",
  "export_pdf_clicked",
  "export_upgrade_prompt_shown",
  "checkout_completed",
  "beta_feedback_submitted",
] as const;

export const INTERNAL_APP_EVENT_TYPES = [
  "share_link_created",
  "design_duplicated",
  "share_design_duplicated",
  "export_printed",
  "checkout_started",
  "checkout_variant_validation_failed",
  "upgrade_checkout_started",
  "upgrade_checkout_completed",
  "billing_portal_opened",
  "subscription_canceled",
  "webhook_failed",
  "variant_resolution_issue",
] as const;

export const APP_EVENT_TYPES = [
  ...CLIENT_APP_EVENT_TYPES,
  ...INTERNAL_APP_EVENT_TYPES,
] as const;

export type ClientAppEventType = (typeof CLIENT_APP_EVENT_TYPES)[number];
export type InternalAppEventType = (typeof INTERNAL_APP_EVENT_TYPES)[number];
export type AppEventType = (typeof APP_EVENT_TYPES)[number];

const CLIENT_APP_EVENT_TYPE_SET: ReadonlySet<string> = new Set(CLIENT_APP_EVENT_TYPES);

export function isClientAppEventType(value: unknown): value is ClientAppEventType {
  return typeof value === "string" && CLIENT_APP_EVENT_TYPE_SET.has(value);
}
