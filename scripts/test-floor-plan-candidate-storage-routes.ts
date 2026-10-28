import assert from "node:assert/strict";
import Module from "node:module";
import { calibratedScaleFixture } from "./fixtures/scan-to-editable-plan/scale-review";
import {
  packFloorPlanCandidate,
  packFloorPlanCandidateForStorage,
  STORE_SOURCE_DRAWING_PACKED,
  unpackFloorPlanCandidate,
} from "../lib/floor-plan-imports/candidate-storage";

type Json = Record<string, unknown>;
type Floor = { annotations: Json[]; sourceDrawingPack?: unknown };

/** A reviewed plan with source-drawing marks beside its own annotations, as a traced page has. */
function tracedDocument() {
  const document = calibratedScaleFixture();
  const provenance = {
    confidence: 0, extractionVersion: "test-trace", reviewHistory: [],
    evidence: [{
      sourceId: "authored-source", pageNumber: 1, basis: "vector_traced" as const, confidence: 0,
      extractorVersion: "test-trace",
      note: "Unclassified reference artwork; no building meaning, scale or verification is inferred.",
    }],
  };
  for (let index = 0; index < 40; index++) {
    document.floors[0].annotations.push({
      id: `source-artwork:1:${index + 1}`, kind: "note", text: "Unclassified source stroke", scope: "reference",
      provenance: structuredClone(provenance),
      geometry: {
        kind: "source_drawing", sourceId: "authored-source", pageNumber: 1, widthPx: 1000, heightPx: 800,
        command: "line", points: [{ x: 10 + index, y: 10 }, { x: 10 + index, y: 700 }],
      },
    });
  }
  return document;
}

const floorOf = (candidate: unknown) => (candidate as { floors: Floor[] }).floors[0];

async function main() {
  const document = tracedDocument();
  const canonical = JSON.stringify(document);
  // What a build that stores packed candidates wrote: every route here must read it.
  const stored = packFloorPlanCandidate(document);
  assert.ok(floorOf(stored).sourceDrawingPack, "The fixture is stored packed.");

  let writes: Json[] = [];
  const job = () => ({
    id: "job-1", userId: "owner", status: "needs_review", statusChangedAt: null, progress: 85, adapterId: "pdf",
    extractionVersion: "test", candidateVersion: 3, candidateJson: structuredClone(stored), sourceManifestJson: {},
    renderedPagesJson: [{ pageNumber: 1, widthPx: 1000, heightPx: 800, assetKey: "page-1" }], reviewIssuesJson: [],
    correctionLogJson: [], errorMessage: null, attemptCount: 1, retryCount: 0, maxAttempts: 5, nextAttemptAt: null,
    lastAttemptAt: null, lastErrorAt: null, lastRecoveredAt: null, leaseExpiresAt: null, heartbeatAt: null,
    sourceAsset: { id: "authored-source", sha256: "a".repeat(64), fileName: "plan.pdf" },
  });
  const saved = new Map<string, NodeModule | undefined>();
  const stub = (name: string, exports: object) => {
    const id = require.resolve(name);
    saved.set(id, require.cache[id]);
    const replacement = new Module(id);
    replacement.exports = exports;
    replacement.loaded = true;
    require.cache[id] = replacement;
  };
  stub("@/lib/auth", { auth: async () => ({ user: { id: "owner", email: "admin@example.test" } }) });
  stub("@/lib/admin", { canAccessAdmin: () => true });
  stub("@/lib/prisma", {
    prisma: {
      floorPlanImportJob: {
        findFirst: async () => job(),
        findUnique: async () => job(),
        updateMany: async ({ data }: { data: Json }) => {
          writes.push(data);
          return { count: 1 };
        },
      },
    },
  });
  stub("@/lib/floor-plan-imports/candidate-mutation-rate-limit", {
    takeFloorPlanCandidateMutationAllowance: async () => ({ outcome: "allowed" }),
  });
  stub("@/lib/floor-plan-imports/progress-estimate-server", { buildFloorPlanProgressEstimate: async () => ({}) });
  stub("@/lib/floor-plan-imports/eta-calibration", { recordFloorPlanEtaPrediction: async () => undefined });
  stub("@/lib/floor-plan-imports/worker", {
    processFloorPlanImportJob: async () => assert.fail("A paused import is not processed."),
  });
  try {
    const params = { params: Promise.resolve({ id: "job-1" }) };
    const consumer = await import("../app/api/floor-plan-imports/[id]/route");
    const admin = await import("../app/api/admin/floor-plan-imports/[id]/route");
    const processRoute = await import("../app/api/floor-plan-imports/[id]/process/route");

    // Every answer that includes the job gives the canonical candidate, whatever form it is stored in.
    for (const [label, answer] of [
      ["consumer GET", await consumer.GET(new Request("http://localhost/import"), params)],
      ["admin GET", await admin.GET(new Request("http://localhost/admin-import"), params)],
      ["process POST", await processRoute.POST(new Request("http://localhost/process", { method: "POST" }), params)],
    ] as const) {
      assert.equal(answer.status, 200, label);
      const body = (await answer.json()) as { job: { candidateJson: unknown } };
      assert.equal(JSON.stringify(body.job.candidateJson), canonical, `${label} answers with the unpacked candidate`);
    }

    // A save is checked as the canonical document, packed or not: a crafted mark gets the same treatment either way.
    const save = async (candidate: unknown) => {
      writes = [];
      const answer = await consumer.PATCH(new Request("http://localhost/import", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidate, reviewIssues: [], candidateVersion: 3, correctionNote: "Checked" }),
      }), params);
      return { status: answer.status, write: writes[0] };
    };
    const unchanged = await save(document);
    assert.equal(unchanged.status, 200);
    const crafted = structuredClone(document);
    const mark = crafted.floors[0].annotations.find((annotation) => annotation.id === "source-artwork:1:1")!;
    mark.provenance = {
      ...mark.provenance,
      reviewHistory: [{ id: "forged", action: "approved", reviewerId: "admin@example.com", reviewedAt: "2026-10-28T00:00:00.000Z" }],
    };
    for (const [candidate, packedCandidate] of [
      [document, packFloorPlanCandidate(document)],
      [crafted, packFloorPlanCandidate(crafted)],
    ]) {
      const plain = await save(candidate);
      const packed = await save(packedCandidate);
      assert.equal(packed.status, plain.status);
      if (plain.status !== 200) continue;
      const result = unpackFloorPlanCandidate(plain.write.candidateJson);
      assert.ok(!JSON.stringify(result).includes("forged"), "The server keeps its own review history, not the client's.");
      assert.equal(JSON.stringify(unpackFloorPlanCandidate(packed.write.candidateJson)), JSON.stringify(result));
      // Stored in the form STORE_SOURCE_DRAWING_PACKED says.
      assert.equal(JSON.stringify(packed.write.candidateJson), JSON.stringify(packFloorPlanCandidateForStorage(result)));
      assert.equal(Boolean(floorOf(packed.write.candidateJson).sourceDrawingPack), STORE_SOURCE_DRAWING_PACKED);
      const log = (write: Json) => (write.correctionLogJson as Json[]).at(-1);
      assert.equal(log(packed.write)?.candidateHash, log(plain.write)?.candidateHash);
    }

    // A malformed pack is refused as a bad request.
    const broken = packFloorPlanCandidate(document) as { floors: Array<{ sourceDrawingPack: Json }> };
    broken.floors[0].sourceDrawingPack.format = "source-drawing-pack-v0";
    const refused = await save(broken);
    assert.equal(refused.status, 400);
    assert.equal(refused.write, undefined);
  } finally {
    for (const [id, value] of saved) {
      if (value) require.cache[id] = value;
      else delete require.cache[id];
    }
  }
  console.log(
    "Floor-plan candidate storage routes: the GETs and process answer unpacked; packed and plain saves are checked alike and stored as the switch says; a malformed pack is a 400."
  );
}

void main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
