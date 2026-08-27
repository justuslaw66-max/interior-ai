import assert from "node:assert/strict";

import {
  CERTIFICATION_APP_EVENT_BINDING_KEY,
} from "@/lib/certification-app-event-binding";
import {
  recordBrowserAnalyticsEvent,
} from "@/lib/app-events";
import { prisma } from "@/lib/prisma";
import {
  claimTrustedLifecycleEvent,
  claimTrustedLifecycleEventInTransaction,
  recordTrustedLifecycleEvent,
  recordTrustedLifecycleEventInTransaction,
} from "@/lib/trusted-app-events";

const mode = process.env.APP_EVENT_WRITER_FIXTURE_MODE;

async function appEventCount() {
  return prisma.appEvent.count();
}

function bindingFrom(meta: unknown) {
  assert.ok(meta && typeof meta === "object" && !Array.isArray(meta));
  const binding = (meta as Record<string, unknown>)[
    CERTIFICATION_APP_EVENT_BINDING_KEY
  ];
  assert.ok(binding && typeof binding === "object" && !Array.isArray(binding));
  return binding as Record<string, unknown>;
}

async function writeRuntimeFamilies() {
  const families = [
    ["design_started", 1],
    ["first_item_added", 5],
    ["first_run_activation_step_completed", 3],
    ["landing_viewed", 5],
    ["third_item_added", 5],
  ] as const;
  let persistedCount = 0;
  for (const [eventType, count] of families) {
    for (let index = 0; index < count; index += 1) {
      const result = await recordBrowserAnalyticsEvent({
        eventType,
        meta: {
          fixtureClassification: "runtime-writer-regression",
          [CERTIFICATION_APP_EVENT_BINDING_KEY]: {
            certificationId: "client-supplied-foreign-binding",
          },
        },
      });
      assert.equal(result.persisted, true);
      assert.ok(result.eventId);
      persistedCount += 1;
    }
  }
  assert.equal(persistedCount, 19);
  assert.equal(await appEventCount(), 19);
}

async function writeBrowserOwnerEvent() {
  const result = await recordBrowserAnalyticsEvent({
    eventType: "checkout_started",
    meta: { fixtureClassification: "browser-writer-regression" },
  });
  assert.equal(result.persisted, true);
  assert.ok(result.eventId);
  assert.equal(await appEventCount(), 20);
}

async function rejectMissingRuntimeBinding() {
  const result = await recordBrowserAnalyticsEvent({
    eventType: "landing_viewed",
    meta: { fixtureClassification: "missing-binding-regression" },
  });
  assert.equal(result.persisted, false);
  assert.equal(result.eventId, null);
  assert.equal(await appEventCount(), 0);
}

async function preserveOrdinaryProductionSemantics() {
  const result = await recordBrowserAnalyticsEvent({
    eventType: "landing_viewed",
    meta: { fixtureClassification: "ordinary-production-regression" },
  });
  assert.equal(result.persisted, true);
  assert.ok(result.eventId);
  const row = await prisma.appEvent.findUniqueOrThrow({
    where: { id: result.eventId },
    select: { meta: true },
  });
  assert.ok(row.meta && typeof row.meta === "object" && !Array.isArray(row.meta));
  assert.equal(
    CERTIFICATION_APP_EVENT_BINDING_KEY in (row.meta as Record<string, unknown>),
    false,
  );
  await prisma.appEvent.delete({ where: { id: result.eventId } });
  assert.equal(await appEventCount(), 0);
}

async function exerciseTrustedWriterFacades() {
  const ids = [
    "runtime-trusted-record-global",
    "runtime-trusted-record-transaction",
    "runtime-trusted-claim-global",
    "runtime-trusted-claim-transaction",
  ];
  const contexts = ids.map((_, index) => ({
    producer: "VERIFIED_STRIPE_WEBHOOK" as const,
    verificationMethod: "STRIPE_SIGNATURE" as const,
    externalEventId: `evt_runtime_writer_fixture_${index + 1}`,
  }));
  await recordTrustedLifecycleEvent(
    { id: ids[0], eventType: "webhook_failed" },
    contexts[0],
  );
  await prisma.$transaction((tx) =>
    recordTrustedLifecycleEventInTransaction(
      tx,
      { id: ids[1], eventType: "webhook_failed" },
      contexts[1],
    ),
  );
  assert.equal(
    await claimTrustedLifecycleEvent(
      { id: ids[2], eventType: "stripe_webhook_processed" },
      contexts[2],
    ),
    true,
  );
  assert.equal(
    await prisma.$transaction((tx) =>
      claimTrustedLifecycleEventInTransaction(
        tx,
        { id: ids[3], eventType: "stripe_webhook_processed" },
        contexts[3],
      ),
    ),
    true,
  );
  const rows = await prisma.appEvent.findMany({
    where: { id: { in: ids } },
    select: { id: true, meta: true },
  });
  assert.equal(rows.length, 4);
  for (const row of rows) {
    const binding = bindingFrom(row.meta);
    assert.equal(binding.stage, "runtime-smoke");
    assert.equal(binding.writerClassification, "trusted-stripe-lifecycle");
  }
  const removed = await prisma.appEvent.deleteMany({
    where: { id: { in: ids } },
  });
  assert.equal(removed.count, 4);
  assert.equal(await appEventCount(), 0);
}

function verifySourceContract() {
  assert.equal(typeof recordBrowserAnalyticsEvent, "function");
  assert.equal(typeof recordTrustedLifecycleEvent, "function");
  assert.equal(typeof recordTrustedLifecycleEventInTransaction, "function");
  assert.equal(typeof claimTrustedLifecycleEvent, "function");
  assert.equal(typeof claimTrustedLifecycleEventInTransaction, "function");
}

async function main() {
  try {
    if (mode === "runtime") await writeRuntimeFamilies();
    else if (mode === "browser") await writeBrowserOwnerEvent();
    else if (mode === "missing-runtime-binding") {
      await rejectMissingRuntimeBinding();
    } else if (mode === "ordinary-production") {
      await preserveOrdinaryProductionSemantics();
    } else if (mode === "trusted-facades") {
      await exerciseTrustedWriterFacades();
    } else if (mode === "source-contract") {
      verifySourceContract();
    } else {
      throw new Error("unknown AppEvent writer fixture mode");
    }
    console.log(
      `APP_EVENT_WRITER_FIXTURE_RESULT ${JSON.stringify({ mode, passed: true })}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
