import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  claimTrustedLifecycleEventWith,
  persistTrustedLifecycleEventWith,
  type TrustedLifecycleEventPayload,
} from "@/lib/trusted-app-event-core";
import type { VerifiedStripeWebhookContext } from "@/lib/app-event-provenance";

export type { TrustedLifecycleEventPayload } from "@/lib/trusted-app-event-core";

export async function recordTrustedLifecycleEvent(
  payload: TrustedLifecycleEventPayload,
  context: VerifiedStripeWebhookContext
) {
  return persistTrustedLifecycleEventWith(
    (data) => prisma.appEvent.create({ data }),
    payload,
    context
  );
}

export async function recordTrustedLifecycleEventInTransaction(
  tx: Prisma.TransactionClient,
  payload: TrustedLifecycleEventPayload,
  context: VerifiedStripeWebhookContext
) {
  return persistTrustedLifecycleEventWith(
    (data) => tx.appEvent.create({ data }),
    payload,
    context
  );
}

export async function claimTrustedLifecycleEventInTransaction(
  tx: Prisma.TransactionClient,
  payload: TrustedLifecycleEventPayload & { id: string },
  context: VerifiedStripeWebhookContext
) {
  return claimTrustedLifecycleEventWith(
    (data) => tx.appEvent.createMany({ data: [data], skipDuplicates: true }),
    payload,
    context
  );
}

export async function claimTrustedLifecycleEvent(
  payload: TrustedLifecycleEventPayload & { id: string },
  context: VerifiedStripeWebhookContext
) {
  return claimTrustedLifecycleEventWith(
    (data) => prisma.appEvent.createMany({ data: [data], skipDuplicates: true }),
    payload,
    context
  );
}
