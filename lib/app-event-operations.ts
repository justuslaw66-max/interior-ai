import { APP_EVENT_PROVENANCE_VERSION } from "@/lib/app-event-provenance";

export type OperationsAppEventWhere = {
  eventType: string;
  createdAt: { gte: Date };
  authority?: "BROWSER_AUTHORIZED_ANALYTICS" | "TRUSTED_SERVER_LIFECYCLE";
  producer?: "VERIFIED_STRIPE_WEBHOOK";
  verificationMethod?: "STRIPE_SIGNATURE";
  provenanceVersion?: number;
  externalEventId?: { startsWith: string };
};

export type OperationsAppEventClient<T> = {
  count: (args: { where: OperationsAppEventWhere }) => Promise<number>;
  findMany: (args: {
    where: OperationsAppEventWhere;
    orderBy: { createdAt: "desc" };
    take: number;
  }) => Promise<T[]>;
};

export function browserAnalyticsWhere(
  eventType: string,
  since: Date
): OperationsAppEventWhere {
  return {
    eventType,
    createdAt: { gte: since },
    authority: "BROWSER_AUTHORIZED_ANALYTICS",
  };
}

export function trustedWebhookFailureWhere(since: Date): OperationsAppEventWhere {
  return {
    eventType: "webhook_failed",
    createdAt: { gte: since },
    authority: "TRUSTED_SERVER_LIFECYCLE",
    producer: "VERIFIED_STRIPE_WEBHOOK",
    verificationMethod: "STRIPE_SIGNATURE",
    provenanceVersion: APP_EVENT_PROVENANCE_VERSION,
    externalEventId: { startsWith: "evt_" },
  };
}
