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
  const stubbed = new Map<string, NodeModule | undefined>();
  function stub(name: string, exports: object) {
    const id = require.resolve(name);
    stubbed.set(id, require.cache[id]);
    const stubModule = new Module(id);
    stubModule.exports = exports; stubModule.loaded = true;
    require.cache[id] = stubModule;
  }
  const tx = {
    design: { create: async ({ data }: { data: { snapshot: unknown; userId: string } }) => {
      assert.equal(data.userId, "owner"); writes++; snapshots.push(structuredClone(data.snapshot));
      return { id: "private-design", snapshot: data.snapshot };
    } },
    floorPlanImportJob: { updateMany: async ({ where }: { where: { userId: string; candidateVersion: number } }) => {
      assert.equal(where.userId, "owner"); assert.equal(where.candidateVersion, 7); return { count: 1 };
    } },
  };
  stub("@/lib/auth", { auth: async () => userId ? { user: { id: userId } } : null });
  stub("@/lib/prisma", { prisma: {
    floorPlanImportJob: { findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
      reads++; assert.equal(where.id, "private-import");
      if (where.userId !== "owner") return null;
      return { id: where.id, status: "ready", candidateVersion: 7, candidateJson: candidate,
        sourceManifestJson: null, renderedPagesJson: renderedPages, reviewIssuesJson: [], appliedDesignId: null, revision: null,
        sourceAsset: { id: "authored-source", sha256: "a".repeat(64), fileName: "private-authored.png", mimeType: "image/png" } };
    } },
    user: { findUnique: async () => ({ plan: "pro" }) },
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
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
    console.log("PASS: actual confirmation POST enforces current independent scale, candidate version, authentication and owner scope before design writes. Database/auth boundaries are isolated stubs.");
  } finally {
    for (const [id, value] of stubbed) { if (value) require.cache[id] = value; else delete require.cache[id]; }
  }
}
void main().catch((cause) => { console.error(cause); process.exitCode = 1; });
