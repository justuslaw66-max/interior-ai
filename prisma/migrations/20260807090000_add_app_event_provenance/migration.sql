-- CreateEnum
CREATE TYPE "AppEventAuthority" AS ENUM (
  'BROWSER_AUTHORIZED_ANALYTICS',
  'TRUSTED_SERVER_LIFECYCLE',
  'UNTRUSTED_OR_LEGACY',
  'INTERNAL_DIAGNOSTIC'
);

-- CreateEnum
CREATE TYPE "AppEventProducer" AS ENUM (
  'PUBLIC_BROWSER_INGESTION',
  'SERVER_APPLICATION',
  'VERIFIED_STRIPE_WEBHOOK'
);

-- CreateEnum
CREATE TYPE "AppEventVerificationMethod" AS ENUM (
  'PUBLIC_REQUEST',
  'SERVER_ACTION',
  'STRIPE_SIGNATURE'
);

-- AlterTable: existing rows intentionally retain the fail-closed legacy default.
ALTER TABLE "AppEvent"
  ADD COLUMN "authority" "AppEventAuthority" NOT NULL DEFAULT 'UNTRUSTED_OR_LEGACY',
  ADD COLUMN "producer" "AppEventProducer",
  ADD COLUMN "verificationMethod" "AppEventVerificationMethod",
  ADD COLUMN "provenanceVersion" INTEGER,
  ADD COLUMN "externalEventId" TEXT;

-- Trusted rows fail closed unless every durable Stripe provenance field is current.
ALTER TABLE "AppEvent"
  ADD CONSTRAINT "AppEvent_trusted_provenance_check"
  CHECK (
    "authority" <> 'TRUSTED_SERVER_LIFECYCLE'
    OR (
      "eventType" IN (
        'upgrade_checkout_completed',
        'subscription_canceled',
        'webhook_failed',
        'stripe_webhook_processed'
      )
      AND "producer" IS NOT DISTINCT FROM 'VERIFIED_STRIPE_WEBHOOK'
      AND "verificationMethod" IS NOT DISTINCT FROM 'STRIPE_SIGNATURE'
      AND "provenanceVersion" IS NOT DISTINCT FROM 1
      AND "externalEventId" IS NOT NULL
      AND "externalEventId" ~ '^evt_[A-Za-z0-9_]+$'
    )
  );

-- CreateIndex
CREATE INDEX "AppEvent_authority_eventType_createdAt_idx"
  ON "AppEvent"("authority", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "AppEvent_producer_provenanceVersion_idx"
  ON "AppEvent"("producer", "provenanceVersion");
