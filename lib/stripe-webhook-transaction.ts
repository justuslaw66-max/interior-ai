export type StripeEntitlementDecision = {
  plan: "free" | "pro";
  subscriptionId: string | null;
  reason: string;
};

export type StripeEntitlementUser = { id: string; plan: string };

export type AppliedStripeEntitlement = {
  duplicate: boolean;
  users: StripeEntitlementUser[];
  decision: StripeEntitlementDecision | null;
};

export type StripeWebhookTransactionPort = {
  claimProcessed: () => Promise<boolean>;
  findUsers: (customerId: string) => Promise<StripeEntitlementUser[]>;
  updateUsers: (
    customerId: string,
    decision: StripeEntitlementDecision
  ) => Promise<void>;
  recordUpgrade: (
    userId: string,
    subscriptionId: string | null
  ) => Promise<void>;
  recordCancellation: (userId: string) => Promise<void>;
};

export type StripeWebhookTransactionRunner = <T>(
  operation: (port: StripeWebhookTransactionPort) => Promise<T>
) => Promise<T>;

export async function applyVerifiedStripeEntitlementOnce(
  customerId: string | null,
  decision: StripeEntitlementDecision | null,
  runTransaction: StripeWebhookTransactionRunner
): Promise<AppliedStripeEntitlement> {
  return runTransaction(async (port) => {
    const claimed = await port.claimProcessed();
    if (!claimed) return { duplicate: true, users: [], decision };
    if (!customerId || !decision) {
      return { duplicate: false, users: [], decision };
    }

    const users = await port.findUsers(customerId);
    if (users.length > 0) await port.updateUsers(customerId, decision);

    for (const user of users) {
      if (decision.plan === "pro" && user.plan !== "pro") {
        await port.recordUpgrade(user.id, decision.subscriptionId);
      }
      if (decision.plan === "free" && user.plan === "pro") {
        await port.recordCancellation(user.id);
      }
    }

    return { duplicate: false, users, decision };
  });
}

export type VerifiedStripeEnvelope<T> =
  | { ok: true; event: T }
  | { ok: false; errorType: string };

export function verifyStripeWebhookEnvelope<T>(
  constructEvent: (body: string, signature: string, secret: string) => T,
  body: string,
  signature: string,
  secret: string
): VerifiedStripeEnvelope<T> {
  try {
    return { ok: true, event: constructEvent(body, signature, secret) };
  } catch (error) {
    return {
      ok: false,
      errorType: error instanceof Error ? error.name : "unknown",
    };
  }
}
