import { sanitizeObservabilityMeta } from "@/lib/observability";
import {
  buildTrustedLifecycleProvenance,
  type TrustedServerLifecycleEventType,
  type VerifiedStripeWebhookContext,
} from "@/lib/app-event-provenance";

export type TrustedLifecycleEventPayload = {
  id?: string;
  eventType: TrustedServerLifecycleEventType;
  userId?: string | null;
  designId?: string | null;
  meta?: Record<string, unknown> | null;
};

export function buildTrustedLifecycleEventData(
  payload: TrustedLifecycleEventPayload,
  context: VerifiedStripeWebhookContext
) {
  const provenance = buildTrustedLifecycleProvenance(context);
  const sanitizedMeta = sanitizeObservabilityMeta(payload.meta);
  return {
    ...(payload.id ? { id: payload.id } : {}),
    eventType: payload.eventType,
    userId: payload.userId ?? null,
    designId: payload.designId ?? null,
    shareToken: null,
    meta: sanitizedMeta ? JSON.parse(JSON.stringify(sanitizedMeta)) : undefined,
    ...provenance,
  };
}

type TrustedCreate = (
  data: ReturnType<typeof buildTrustedLifecycleEventData>
) => Promise<unknown>;

type TrustedClaim = (
  data: ReturnType<typeof buildTrustedLifecycleEventData>
) => Promise<{ count: number }>;

// Dependency injection keeps fail-closed persistence behavior deterministic in
// the required security test. The server-only facade is the sole product caller.
export function persistTrustedLifecycleEventWith(
  create: TrustedCreate,
  payload: TrustedLifecycleEventPayload,
  context: VerifiedStripeWebhookContext
) {
  return create(buildTrustedLifecycleEventData(payload, context));
}

export async function claimTrustedLifecycleEventWith(
  createMany: TrustedClaim,
  payload: TrustedLifecycleEventPayload & { id: string },
  context: VerifiedStripeWebhookContext
) {
  const claim = await createMany(buildTrustedLifecycleEventData(payload, context));
  return claim.count === 1;
}
