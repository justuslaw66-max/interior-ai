import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  InvalidRequestJsonObjectError,
  readBoundedJsonObject,
  RequestBodyTooLargeError,
} from "@/lib/bounded-request-body";
import {
  FLOOR_PLAN_CANDIDATE_MUTATION_RATE_LIMIT,
  FLOOR_PLAN_CANDIDATE_MUTATION_RATE_WINDOW_MS,
  takeFloorPlanCandidateMutationAllowance,
} from "@/lib/floor-plan-imports/candidate-mutation-rate-limit";

function requestFromChunks(chunks: Uint8Array[]) {
  const pending = [...chunks];
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = pending.shift();
      if (next) controller.enqueue(next);
      else controller.close();
    },
  });
  return new Request("http://localhost/api/floor-plan-imports/job/candidate", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function jsonRequest(value: string) {
  return requestFromChunks([new TextEncoder().encode(value)]);
}

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

async function main() {
  const parsed = await readBoundedJsonObject(jsonRequest('{"candidateVersion":3}'), 64);
  assert.deepEqual(parsed, { candidateVersion: 3 });

  await assert.rejects(
    () => readBoundedJsonObject(jsonRequest('{"candidateVersion":'), 64),
    InvalidRequestJsonObjectError,
    "malformed JSON must be rejected after a bounded read"
  );
  await assert.rejects(
    () => readBoundedJsonObject(jsonRequest("[]"), 64),
    InvalidRequestJsonObjectError,
    "mutation envelopes must be JSON objects"
  );

  const oversized = requestFromChunks([
    new Uint8Array(20).fill(0x20),
    new Uint8Array(20).fill(0x20),
  ]);
  await assert.rejects(
    () => readBoundedJsonObject(oversized, 32),
    (cause: unknown) =>
      cause instanceof RequestBodyTooLargeError && cause.limitBytes === 32,
    "oversized JSON must stop at the streaming byte boundary"
  );
  assert.equal(oversized.body?.locked, false);

  let sharedCalls = 0;
  const localLimited = await takeFloorPlanCandidateMutationAllowance(
    {} as never,
    "request-hardening-local-limited",
    {
      localRateLimit(key, limit, windowMs) {
        assert.match(key, /^floor-plan-candidate-mutation:/);
        assert.equal(limit, FLOOR_PLAN_CANDIDATE_MUTATION_RATE_LIMIT);
        assert.equal(windowMs, FLOOR_PLAN_CANDIDATE_MUTATION_RATE_WINDOW_MS);
        return { ok: false, remaining: 0 };
      },
      async sharedRateLimit() {
        sharedCalls += 1;
        return { ok: true, remaining: 1, resetAt: new Date(0) };
      },
    }
  );
  assert.equal(localLimited.outcome, "limited");
  assert.equal(sharedCalls, 0, "local rejection must not spend a shared counter write");

  const sharedLimited = await takeFloorPlanCandidateMutationAllowance(
    {} as never,
    "request-hardening-shared-limited",
    {
      localRateLimit: () => ({ ok: true, remaining: 1 }),
      async sharedRateLimit(_client, input) {
        assert.equal(input.scope, "floor-plan-candidate-mutation");
        assert.equal(input.subject, "request-hardening-shared-limited");
        assert.equal(input.limit, FLOOR_PLAN_CANDIDATE_MUTATION_RATE_LIMIT);
        assert.equal(input.windowMs, FLOOR_PLAN_CANDIDATE_MUTATION_RATE_WINDOW_MS);
        return { ok: false, remaining: 0, resetAt: new Date(0) };
      },
    }
  );
  assert.equal(sharedLimited.outcome, "limited");

  const unavailable = await takeFloorPlanCandidateMutationAllowance(
    {} as never,
    "request-hardening-unavailable",
    {
      localRateLimit: () => ({ ok: true, remaining: 1 }),
      async sharedRateLimit() {
        throw new Error("synthetic shared limiter outage");
      },
    }
  );
  assert.equal(unavailable.outcome, "unavailable");

  const consumerRoute = source("app/api/floor-plan-imports/[id]/route.ts");
  assert.doesNotMatch(consumerRoute, /request\.json\(/);
  assert.match(
    consumerRoute,
    /MAX_FLOOR_PLAN_CANDIDATE_BYTES \+ 2 \* 1024 \* 1024/,
    "the request bound must leave explicit metadata overhead above the 5 MB candidate cap"
  );
  assert.match(consumerRoute, /RequestBodyTooLargeError[\s\S]*status: 413|payload is too large", 413/);
  assert.match(consumerRoute, /allowance\.outcome === "limited"[\s\S]*429/);
  assert.match(consumerRoute, /allowance\.outcome === "unavailable"[\s\S]*503/);
  assert.ok(
    consumerRoute.indexOf("takeFloorPlanCandidateMutationAllowance(") <
      consumerRoute.indexOf("readBoundedJsonObject("),
    "rate limiting must reject abusive requests before their body is read"
  );
  assert.ok(
    consumerRoute.indexOf("readBoundedJsonObject(") <
      consumerRoute.indexOf("parseCandidate(body.candidate)"),
    "bounded JSON parsing must precede the independent candidate-size contract"
  );

  for (const routePath of [
    "app/api/admin/floor-plan-imports/[id]/route.ts",
    "app/api/admin/floor-plan-imports/[id]/approve/route.ts",
    "app/api/admin/floor-plan-imports/[id]/retire/route.ts",
  ]) {
    const route = source(routePath);
    assert.doesNotMatch(route, /request\.json\(/, `${routePath} must not buffer unbounded JSON`);
    assert.match(route, /readBoundedJsonObject\(/);
    assert.match(route, /RequestBodyTooLargeError/);
    assert.match(route, /413/);
    assert.ok(
      route.indexOf("await auth()") < route.indexOf("readBoundedJsonObject("),
      `${routePath} must authenticate before reading its bounded body`
    );
  }

  console.log("Floor-plan request-hardening tests passed");
}

void main();
