import assert from "node:assert/strict";
import Module from "node:module";
import { calibratedScaleFixture, scaleMeasurement } from "./fixtures/scan-to-editable-plan/scale-review";
import { changeReviewMeasurement } from "@/lib/floor-plan-review-measurements";
import { isStoredDesign, storedToSnapshot } from "@/lib/room-persistence";
import { mapUnderlayWorldPointToPixels } from "@/lib/floor-plan-calibration";

async function main() {
  let userId: string | null = "owner", candidate = calibratedScaleFixture(), writes = 0, reads = 0;
  let renderedPages: { pageNumber: number; widthPx: number; heightPx: number; assetKey: string }[] = [];
  const snapshots: unknown[] = [];
  const freshJob = () => ({ id: "private-import", userId: "owner", status: "ready", candidateVersion: 7,
    sourceAssetId: "authored-source", appliedDesignId: null as string | null, revision: null as { id: string } | null,
    sourceDeletionRequestedAt: null as Date | null, historyDeletedAt: null as Date | null,
    sourceAsset: { id: "authored-source", sha256: "a".repeat(64), fileName: "private-authored.png", mimeType: "image/png", contentDeletedAt: null as Date | null } });
  let jobState = freshJob();
  let beforeTransaction: () => void = () => undefined, beforeApply: () => void = () => undefined;
  const events: string[] = [];
  let checkedWhere: unknown;
  const matches = (where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => {
    if (key === "revision") return jobState.revision === null;
    if (key === "sourceAsset") {
      const filter = value as { is: Record<string, unknown> };
      return Object.entries(filter.is).every(([field, expected]) => JSON.stringify(jobState.sourceAsset[field as keyof typeof jobState.sourceAsset]) === JSON.stringify(expected));
    }
    assert.ok(Object.hasOwn(jobState, key), `Unhandled database predicate ${key}`);
    return JSON.stringify(jobState[key as keyof typeof jobState]) === JSON.stringify(value);
  });
  const stubbed = new Map<string, NodeModule | undefined>();
  function stub(name: string, exports: object) {
    const id = require.resolve(name);
    stubbed.set(id, require.cache[id]);
    const stubModule = new Module(id);
    stubModule.exports = exports; stubModule.loaded = true;
    require.cache[id] = stubModule;
  }
  const tx = {
    $queryRaw: async (query: { sql: string; values: unknown[] }) => {
      assert.match(query.sql, /FOR UPDATE OF source/); assert.match(query.sql, /INNER JOIN "FloorPlanImportJob" job/);
      assert.deepEqual(query.values, ["private-import", "owner"]); events.push("source-lock"); return [{ id: "authored-source" }];
    },
    design: { create: async ({ data }: { data: { snapshot: unknown; userId: string } }) => {
      events.push("design-create");
      assert.equal(data.userId, "owner"); writes++; snapshots.push(structuredClone(data.snapshot));
      return { id: "private-design", snapshot: data.snapshot };
    } },
    floorPlanImportJob: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        events.push("fresh-check"); checkedWhere = structuredClone(where); return matches(where) ? { id: jobState.id } : null;
      },
      updateMany: async ({ where }: { where: Record<string, unknown> }) => {
        beforeApply(); events.push("compare-and-set");
        assert.equal(where.userId, "owner"); assert.equal(where.candidateVersion, 7);
        if (checkedWhere) assert.deepEqual(where, checkedWhere, "Final application must retain every fresh-read condition.");
        return { count: matches(where) ? 1 : 0 };
      },
    },
  };
  stub("@/lib/auth", { auth: async () => userId ? { user: { id: userId } } : null });
  stub("@/lib/prisma", { prisma: {
    floorPlanImportJob: { findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
      reads++; assert.equal(where.id, "private-import");
      if (where.userId !== "owner") return null;
      return structuredClone({ ...jobState, candidateJson: candidate, sourceManifestJson: null, renderedPagesJson: renderedPages, reviewIssuesJson: [] });
    } },
    user: { findUnique: async () => ({ plan: "pro" }) },
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
      beforeTransaction(); events.length = 0; checkedWhere = undefined;
      const previousWrites: number = writes, previousSnapshots = snapshots.length;
      try { return await callback(tx); }
      catch (cause) { writes = previousWrites; snapshots.length = previousSnapshots; throw cause; }
    },
  } });
  stub("@/lib/floor-plan-design-reference", { syncFloorPlanDesignReference: async (input: { ownerUserId: string; designId: string }) => {
    assert.equal(input.ownerUserId, "owner"); assert.equal(input.designId, "private-design");
  } });
  try {
    const { POST } = await import("../app/api/floor-plan-imports/[id]/confirm/route");
    const request = (version = 7) => POST(new Request("http://127.0.0.1/api/floor-plan-imports/private-import/confirm", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ candidateVersion: version }),
    }), { params: Promise.resolve({ id: "private-import" }) });
    const recorded = (confirmedLengthMm: number) => changeReviewMeasurement({ document: calibratedScaleFixture(), floorId: "apartment", calibrationId: "scale",
      measurement: scaleMeasurement({ confirmedLengthMm }) });
    candidate = recorded(4500);
    const conflict = await request(); assert.equal(conflict.status, 409); assert.match((await conflict.json()).error, /scale/);
    assert.equal(writes, 0, "A ready job with no recorded issues still cannot bypass recalculated scale conflicts.");
    candidate = recorded(4000);
    assert.equal((await request(6)).status, 409); assert.equal(writes, 0);
    userId = "different-owner"; assert.equal((await request()).status, 404); assert.equal(writes, 0);
    userId = null; const beforeReads = reads; assert.equal((await request()).status, 401); assert.equal(reads, beforeReads);
    userId = "owner"; const accepted = await request(); assert.equal(accepted.status, 201); assert.equal(writes, 1);
    assert.equal((await accepted.json()).id, "private-design");
    assert.match(JSON.stringify(snapshots[0]), /independentMeasurements/);
    assert.doesNotMatch(JSON.stringify(snapshots[0]), /source_verified|construction_verified/);
    candidate = calibratedScaleFixture();
    candidate.floors[0].calibrations[0].controlPoints = [
      { sourcePx: { x: 100, y: 200 }, planMm: { xMm: 0, zMm: 0 } },
      { sourcePx: { x: 100, y: 600 }, planMm: { xMm: 4000, zMm: 0 } },
    ];
    renderedPages = [{ pageNumber: 1, widthPx: 1000, heightPx: 800, assetKey: "rotated-authored-page" }];
    assert.equal((await request()).status, 201);
    const stored = snapshots.at(-1); assert.ok(isStoredDesign(stored));
    const underlay = storedToSnapshot(stored).floorPlan?.underlay; assert.ok(underlay);
    assert.deepEqual(mapUnderlayWorldPointToPixels(underlay, { x: 0, z: 0 }), { x: 100, y: 200 });
    assert.deepEqual(mapUnderlayWorldPointToPixels(underlay, { x: 4, z: 0 }), { x: 100, y: 600 });
    assert.deepEqual(mapUnderlayWorldPointToPixels(underlay, { x: 0, z: -4 }), { x: 500, y: 200 });
    const rejectionScenarios = [
      ["deleted source", () => { jobState.sourceAsset.contentDeletedAt = new Date(); }],
      ["queued deletion", () => { jobState.sourceDeletionRequestedAt = new Date(); }],
      ["deleted history", () => { jobState.historyDeletedAt = new Date(); }],
      ["newer correction", () => { jobState.candidateVersion++; }],
      ["cancelled/failed job", () => { jobState.status = "failed"; }],
      ["another tab applied", () => { jobState.appliedDesignId = "other-design"; }],
      ["public revision", () => { jobState.revision = { id: "public-revision" }; }],
      ["changed owner", () => { jobState.userId = "different-owner"; }],
      ["replaced source", () => { jobState.sourceAssetId = "other-source"; jobState.sourceAsset.id = "other-source"; }],
      ["changed source bytes", () => { jobState.sourceAsset.sha256 = "b".repeat(64); }],
    ] as const;
    for (const [label, change] of rejectionScenarios) {
      jobState = freshJob(); beforeTransaction = change;
      const previousWrites: number = writes, previousSnapshots = snapshots.length;
      const response = await request();
      assert.equal(response.status, 409, `${label} between validation and transaction must block confirmation`);
      assert.equal(writes, previousWrites); assert.equal(snapshots.length, previousSnapshots);
      assert.deepEqual(events, ["source-lock", "fresh-check"], `${label} must be rejected before attempting a Design write`);
    }
    beforeTransaction = () => undefined;
    for (const [label, change] of rejectionScenarios.slice(3, 8)) {
      jobState = freshJob(); beforeApply = change;
      const previousWrites: number = writes, previousSnapshots = snapshots.length;
      assert.equal((await request()).status, 409, `${label} after the fresh read must roll back the design`);
      assert.equal(writes, previousWrites); assert.equal(snapshots.length, previousSnapshots);
      assert.deepEqual(events, ["source-lock", "fresh-check", "design-create", "compare-and-set"]);
    }
    beforeApply = () => undefined; jobState = freshJob();
    jobState.sourceAsset.contentDeletedAt = new Date();
    const beforeDeleted = writes; assert.equal((await request()).status, 409); assert.equal(writes, beforeDeleted);
    jobState = freshJob(); assert.equal((await request()).status, 201);
    assert.deepEqual(events, ["source-lock", "fresh-check", "design-create", "compare-and-set"]);
    assert.deepEqual(checkedWhere, { id: "private-import", userId: "owner", status: "ready", candidateVersion: 7,
      appliedDesignId: null, revision: { is: null }, sourceDeletionRequestedAt: null, historyDeletedAt: null,
      sourceAssetId: "authored-source", sourceAsset: { is: { id: "authored-source", sha256: "a".repeat(64), contentDeletedAt: null } } });
    jobState.appliedDesignId = "private-design";
    const beforeDuplicate = writes, duplicate = await request();
    assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).alreadyApplied, true); assert.equal(writes, beforeDuplicate);
    console.log("PASS: actual confirmation POST enforces independent scale, source registration, owner/version checks, source-row lock before Design writes, deletion/correction/cancellation races, rollback and duplicate requests. Database/auth boundaries are isolated stubs, not live database certification.");
  } finally {
    for (const [id, value] of stubbed) { if (value) require.cache[id] = value; else delete require.cache[id]; }
  }
}
void main().catch((cause) => { console.error(cause); process.exitCode = 1; });
