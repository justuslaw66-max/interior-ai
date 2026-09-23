import { sanitizeObservabilityMeta } from "@/lib/observability";
import { getPostHogClient } from "@/lib/posthog-server";

type ServerAnalyticsProperties = Record<string, unknown>;

/**
 * Vendor-neutral boundary for server-side product and operational analytics.
 * Domain code must not import or call the analytics vendor directly.
 */
export function trackServerEvent(
  event: string,
  distinctId: string,
  properties: ServerAnalyticsProperties = {}
) {
  try {
    getPostHogClient().capture({
      distinctId,
      event,
      properties: sanitizeObservabilityMeta(properties),
    });
  } catch {
    // Analytics is best-effort and must not change the domain operation outcome.
  }
}
