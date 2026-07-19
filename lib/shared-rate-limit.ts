import { createHmac } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

type SharedRateLimitClient = Pick<PrismaClient, "apiRateLimitBucket">;

export type SharedRateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: Date;
};

function rateLimitKeySecret(override?: string) {
  const secret = (
    override ??
    process.env.API_RATE_LIMIT_HASH_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    ""
  ).trim();
  if (secret.length < 16) {
    throw new Error(
      "Shared rate limiting requires API_RATE_LIMIT_HASH_SECRET or AUTH_SECRET with at least 16 characters"
    );
  }
  return secret;
}

function bucketKey(
  scope: string,
  subject: string,
  windowStartMs: number,
  secret: string
) {
  // A keyed digest prevents a leaked limiter table from becoming an oracle for
  // enumerating email addresses, IPs, or other low-entropy future subjects.
  return createHmac("sha256", secret)
    .update("api-rate-limit-bucket:v1")
    .update("\0")
    .update(scope)
    .update("\0")
    .update(subject)
    .update("\0")
    .update(String(windowStartMs))
    .digest("hex");
}

export async function takeSharedRateLimit(
  client: SharedRateLimitClient,
  input: {
    scope: string;
    subject: string;
    limit: number;
    windowMs: number;
    now?: Date;
    /** Test/dependency-injection override. Production defaults to the shared application secret. */
    keySecret?: string;
  }
): Promise<SharedRateLimitResult> {
  const scope = input.scope.trim();
  if (!scope || scope.length > 80) {
    throw new Error("Shared rate-limit scope must be 1-80 characters");
  }
  if (!input.subject || input.subject.length > 2_000) {
    throw new Error("Shared rate-limit subject must be 1-2000 characters");
  }
  if (!Number.isSafeInteger(input.limit) || input.limit <= 0) {
    throw new Error("Shared rate-limit count must be a positive safe integer");
  }
  if (!Number.isSafeInteger(input.windowMs) || input.windowMs <= 0) {
    throw new Error("Shared rate-limit window must be a positive safe integer");
  }

  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Shared rate-limit time must be a valid date");
  }
  const windowStartMs =
    Math.floor(now.getTime() / input.windowMs) * input.windowMs;
  const windowStart = new Date(windowStartMs);
  const resetAt = new Date(windowStartMs + input.windowMs);
  const expiresAt = new Date(windowStartMs + input.windowMs * 2);
  if (
    !Number.isFinite(windowStart.getTime()) ||
    !Number.isFinite(resetAt.getTime()) ||
    !Number.isFinite(expiresAt.getTime())
  ) {
    throw new Error("Shared rate-limit window is outside the supported date range");
  }
  const keySecret = rateLimitKeySecret(input.keySecret);
  const key = bucketKey(
    scope,
    input.subject,
    windowStartMs,
    keySecret
  );

  // The expiry index keeps this bounded cleanup cheap and avoids an
  // ever-growing counter table without relying on process-local timers. Run it
  // only after all input/key validation so an invalid call cannot mutate data.
  await cleanupSharedRateLimitBuckets(client, now);

  const bucket = await client.apiRateLimitBucket.upsert({
    where: { key },
    create: {
      key,
      scope,
      windowStart,
      expiresAt,
      count: 1,
    },
    update: {
      count: { increment: 1 },
      expiresAt,
    },
    select: { count: true },
  });

  return {
    ok: bucket.count <= input.limit,
    remaining: Math.max(0, input.limit - bucket.count),
    resetAt,
  };
}

export async function cleanupSharedRateLimitBuckets(
  client: SharedRateLimitClient,
  now = new Date()
) {
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Shared rate-limit cleanup time must be a valid date");
  }
  return client.apiRateLimitBucket.deleteMany({
    where: { expiresAt: { lt: now } },
  });
}
