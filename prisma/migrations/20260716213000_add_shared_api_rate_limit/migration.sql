CREATE TABLE "ApiRateLimitBucket" (
    "key" CHAR(64) NOT NULL,
    "scope" VARCHAR(80) NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiRateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "ApiRateLimitBucket_expiresAt_idx"
ON "ApiRateLimitBucket"("expiresAt");

CREATE INDEX "ApiRateLimitBucket_scope_windowStart_idx"
ON "ApiRateLimitBucket"("scope", "windowStart");
