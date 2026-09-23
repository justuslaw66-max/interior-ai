import assert from "node:assert/strict";
import {
  cleanupSharedRateLimitBuckets,
  takeSharedRateLimit,
} from "@/lib/shared-rate-limit";

const TEST_KEY_SECRET = "test-shared-rate-limit-secret";

type Bucket = {
  key: string;
  scope: string;
  windowStart: Date;
  expiresAt: Date;
  count: number;
};

function memoryClient(buckets = new Map<string, Bucket>()) {
  return {
    buckets,
    apiRateLimitBucket: {
      async upsert(input: {
        where: { key: string };
        create: Bucket;
        update: { count: { increment: number }; expiresAt: Date };
      }) {
        const current = buckets.get(input.where.key);
        if (current) {
          current.count += input.update.count.increment;
          current.expiresAt = input.update.expiresAt;
          return { count: current.count };
        }
        buckets.set(input.where.key, { ...input.create });
        return { count: input.create.count };
      },
      async deleteMany(input: { where: { expiresAt: { lt: Date } } }) {
        let count = 0;
        for (const [key, bucket] of buckets) {
          if (bucket.expiresAt < input.where.expiresAt.lt) {
            buckets.delete(key);
            count += 1;
          }
        }
        return { count };
      },
    },
  };
}

async function main() {
  const sharedBuckets = new Map<string, Bucket>();
  // These are intentionally separate client objects over the same table to
  // model independent application instances using one database.
  const clients = [memoryClient(sharedBuckets), memoryClient(sharedBuckets)];
  const now = new Date("2030-01-01T00:00:10.000Z");
  const requests = await Promise.all(
    Array.from({ length: 7 }, (_, index) =>
      takeSharedRateLimit(clients[index % clients.length] as never, {
        scope: " floor-plan-import ",
        subject: "private-user-id",
        limit: 6,
        windowMs: 60_000,
        now,
        keySecret: TEST_KEY_SECRET,
      })
    )
  );
  assert.equal(requests.filter((result) => result.ok).length, 6);
  assert.equal(requests.filter((result) => result.remaining === 0).length, 2);
  assert.equal(sharedBuckets.size, 1);
  assert.doesNotMatch(
    [...sharedBuckets.keys()][0],
    /private-user-id/,
    "bucket keys must not expose the private rate-limit subject"
  );
  assert.equal([...sharedBuckets.values()][0]?.scope, "floor-plan-import");
  assert.doesNotMatch(
    JSON.stringify([...sharedBuckets.values()]),
    /private-user-id/,
    "the private subject must not be persisted in any bucket field"
  );

  const nextWindow = await takeSharedRateLimit(clients[1] as never, {
    scope: "floor-plan-import",
    subject: "private-user-id",
    limit: 6,
    windowMs: 60_000,
    now: new Date("2030-01-01T00:01:00.000Z"),
    keySecret: TEST_KEY_SECRET,
  });
  assert.equal(nextWindow.ok, true);
  assert.equal(sharedBuckets.size, 2);

  // Cleanup running concurrently on another instance must not remove or split
  // the current fixed-window bucket.
  const raceBuckets = new Map<string, Bucket>();
  const raceClients = [memoryClient(raceBuckets), memoryClient(raceBuckets)];
  const raced = await Promise.all([
    ...Array.from({ length: 7 }, (_, index) =>
      takeSharedRateLimit(raceClients[index % 2] as never, {
        scope: "floor-plan-import",
        subject: "race-user",
        limit: 6,
        windowMs: 60_000,
        now,
        keySecret: TEST_KEY_SECRET,
      })
    ),
    ...Array.from({ length: 5 }, (_, index) =>
      cleanupSharedRateLimitBuckets(raceClients[index % 2] as never, now)
    ),
  ]);
  assert.equal(
    raced.slice(0, 7).filter((result) => "ok" in result && result.ok).length,
    6
  );
  assert.equal(raceBuckets.size, 1);
  assert.equal([...raceBuckets.values()][0]?.count, 7);

  const cleanup = await cleanupSharedRateLimitBuckets(
    clients[0] as never,
    new Date("2030-01-01T00:03:01.000Z")
  );
  assert.equal(cleanup.count, 2);
  assert.equal(sharedBuckets.size, 0);

  const invalidClient = memoryClient();
  await assert.rejects(
    () =>
      takeSharedRateLimit(invalidClient as never, {
        scope: "floor-plan-import",
        subject: "private-user-id",
        limit: 6,
        windowMs: 60_000,
        now,
        keySecret: "too-short",
      }),
    /requires API_RATE_LIMIT_HASH_SECRET or AUTH_SECRET/
  );
  assert.equal(
    invalidClient.buckets.size,
    0,
    "invalid key configuration must fail before cleanup or counter mutation"
  );
  await assert.rejects(
    () =>
      takeSharedRateLimit(invalidClient as never, {
        scope: "floor-plan-import",
        subject: "private-user-id",
        limit: 6,
        windowMs: 60_000,
        now: new Date(Number.NaN),
        keySecret: TEST_KEY_SECRET,
      }),
    /valid date/
  );

  let upsertCalled = false;
  const unavailableClient = {
    apiRateLimitBucket: {
      async deleteMany() {
        throw new Error("database unavailable");
      },
      async upsert() {
        upsertCalled = true;
        return { count: 1 };
      },
    },
  };
  await assert.rejects(
    () =>
      takeSharedRateLimit(unavailableClient as never, {
        scope: "floor-plan-import",
        subject: "private-user-id",
        limit: 6,
        windowMs: 60_000,
        now,
        keySecret: TEST_KEY_SECRET,
      }),
    /database unavailable/
  );
  assert.equal(upsertCalled, false, "cleanup failure must fail closed");

  console.log("Floor-plan shared rate-limit tests passed");
}

void main();
