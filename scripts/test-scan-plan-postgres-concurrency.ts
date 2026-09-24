import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import sharp from "sharp";
import { calibratedScaleFixture } from "./fixtures/scan-to-editable-plan/scale-review";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { Prisma } from "@prisma/client";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
  const expectedDirectory = process.env.SCAN_PLAN_DISPOSABLE_DATABASE_DIRECTORY;
  assert.equal(url.protocol, "postgresql:"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55438");
  assert.equal(url.pathname, "/scan_plan_disposable"); assert.equal(url.username, "scan_plan");
  assert.ok(expectedDirectory?.includes("interior-ai-task-state/scan-to-editable-plan-v1/db-"), "Explicit task-owned disposable data directory required");
  const pool = new Pool({ connectionString: url.toString(), max: 6, connectionTimeoutMillis: 2000 });
  const identity = (await pool.query<{ data_directory: string }>("SHOW data_directory")).rows[0];
  assert.equal(identity.data_directory, expectedDirectory, "Never write to an unverified database cluster");
  const { prisma } = await import("../lib/prisma");
  const { PrismaFloorPlanRetentionService } = await import("../lib/floor-plan-imports/retention");
  const ownerId = `scan-owner-${randomUUID()}`, strangerId = `scan-stranger-${randomUUID()}`;
  let authenticatedId: string | null = ownerId;
  const authPath = require.resolve("@/lib/auth"), previousAuth = require.cache[authPath];
  // Only login identity is stubbed; routes, queries, locks, transactions and retention execute unchanged.
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { auth: async () => authenticatedId ? { user: { id: authenticatedId } } : null } } as NodeModule;
  const { POST } = await import("../app/api/floor-plan-imports/[id]/confirm/route");
  const { DELETE } = await import("../app/api/floor-plan-imports/[id]/source/route");
  const bytes = await sharp({ create: { width: 1000, height: 800, channels: 4, background: "white" } }).png().toBuffer();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const evidence: Array<Record<string, unknown>> = [];
  const lockers = new Set<PoolClient>();
  const request = (id: string, candidateVersion = 7) => POST(new Request(`http://127.0.0.1/api/floor-plan-imports/${id}/confirm`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Authored concurrency test", candidateVersion }),
  }), { params: Promise.resolve({ id }) });
  const remove = (id: string) => DELETE(new Request(`http://127.0.0.1/api/floor-plan-imports/${id}/source`, { method: "DELETE" }), { params: Promise.resolve({ id }) });
  async function fixture(label: string) {
    const id = `scan-${label}-${randomUUID()}`, sourceId = `source-${id}`;
    // Rename only the authored fixture's source identifier, including its explicit evidence references.
    const document: FloorPlanDocumentV2 = JSON.parse(JSON.stringify(calibratedScaleFixture()).replaceAll('"authored-source"', JSON.stringify(sourceId)));
    document.sources[0].sha256 = sha256;
    await prisma.floorPlanSourceAsset.create({ data: { id: sourceId, sha256, dedupeKey: createHash("sha256").update(id).digest("hex"),
      ownerScope: ownerId, fileName: "authored.png", mimeType: "image/png", byteLength: bytes.length, storageKey: id, bytes } });
    await prisma.floorPlanImportJob.create({ data: { id, userId: ownerId, sourceAssetId: sourceId, status: "ready", progress: 100,
      candidateVersion: 7, candidateJson: document as unknown as Prisma.InputJsonValue,
      renderedPagesJson: [{ pageNumber: 1, widthPx: 1000, heightPx: 800, assetKey: "page-1" }] } });
    return { id, sourceId, document };
  }
  async function lockSource(sourceId: string) {
    const client = await pool.connect();
    lockers.add(client);
    await client.query("BEGIN");
    await client.query('SELECT "id" FROM "FloorPlanSourceAsset" WHERE "id" = $1 FOR UPDATE', [sourceId]);
    return client;
  }
  async function blocked(fragment: string, count = 1) {
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      const rows = (await pool.query<{ pid: number; query: string; blockers: number[] }>(
        "SELECT pid, query, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'"
      )).rows.filter((row) => row.query.includes(fragment));
      if (rows.length >= count) return rows;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Expected ${count} real blocked transaction(s): ${fragment}`);
  }
  async function unlock(client: PoolClient) { await client.query("COMMIT"); lockers.delete(client); client.release(); }
  const designCount = () => prisma.design.count({ where: { userId: ownerId } });
  try {
    await prisma.user.createMany({ data: [{ id: ownerId, plan: "pro" }, { id: strangerId, plan: "pro" }] });
    {
      const row = await fixture("deletion-first"), locker = await lockSource(row.sourceId);
      const deletion = remove(row.id); const deletionWait = await blocked('FROM "FloorPlanSourceAsset" WHERE');
      const confirmation = request(row.id); const confirmationWait = await blocked('INNER JOIN "FloorPlanImportJob"');
      await unlock(locker);
      const [deleted, confirmed] = await Promise.all([deletion, confirmation]);
      assert.equal(deleted.status, 200, JSON.stringify(await deleted.clone().json()));
      assert.equal(confirmed.status, 409, JSON.stringify(await confirmed.clone().json()));
      assert.equal(await designCount(), 0);
      const source = await prisma.floorPlanSourceAsset.findUniqueOrThrow({ where: { id: row.sourceId } });
      assert.equal(source.bytes, null); assert.ok(source.contentDeletedAt);
      evidence.push({ case: "deletion first", deletionStatus: deleted.status, confirmationStatus: confirmed.status, deletionWait, confirmationWait, orphanDesigns: 0 });
    }
    {
      const row = await fixture("confirmation-first"), locker = await lockSource(row.sourceId);
      const confirmation = request(row.id); const confirmationWait = await blocked('INNER JOIN "FloorPlanImportJob"');
      const deletion = remove(row.id); const deletionWait = await blocked('FROM "FloorPlanSourceAsset" WHERE');
      await unlock(locker);
      const [confirmed, deleted] = await Promise.all([confirmation, deletion]);
      assert.equal(confirmed.status, 201, JSON.stringify(await confirmed.clone().json()));
      assert.equal(deleted.status, 200, JSON.stringify(await deleted.clone().json()));
      const { id } = await confirmed.json();
      const saved = await prisma.design.findUniqueOrThrow({ where: { id } });
      const { storedToSnapshot, isStoredDesign } = await import("../lib/room-persistence");
      assert.ok(isStoredDesign(saved.snapshot));
      const snapshot = storedToSnapshot(saved.snapshot);
      assert.deepEqual(snapshot.floorPlan?.canonicalDocument?.floors[0].walls, row.document.floors[0].walls);
      assert.equal(snapshot.floorPlan?.underlay, null);
      assert.ok(snapshot.floorPlan?.canonicalDocument?.verification.planningReview);
      assert.equal(await designCount(), 1);
      assert.ok(await prisma.floorPlanDesignReference.findUnique({ where: { designId: id } }));
      const duplicate = await request(row.id); assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).id, id);
      evidence.push({ case: "confirmation first", confirmationStatus: confirmed.status, deletion: await deleted.json(), confirmationWait, deletionWait, designId: id });
    }
    {
      const row = await fixture("duplicate"), locker = await lockSource(row.sourceId);
      const first = request(row.id); await blocked('INNER JOIN "FloorPlanImportJob"');
      const second = request(row.id); const waits = await blocked('INNER JOIN "FloorPlanImportJob"', 2);
      await unlock(locker);
      const responses = await Promise.all([first, second]);
      assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
      assert.equal(await designCount(), 2, "Only one additional design may commit");
      evidence.push({ case: "concurrent duplicate", statuses: responses.map((response) => response.status), waits });
    }
    {
      const row = await fixture("correction"), locker = await lockSource(row.sourceId);
      const confirmation = request(row.id); const waits = await blocked('INNER JOIN "FloorPlanImportJob"');
      const update = await prisma.floorPlanImportJob.updateMany({ where: { id: row.id, userId: ownerId, candidateVersion: 7 }, data: { candidateVersion: 8 } });
      assert.equal(update.count, 1); await unlock(locker);
      assert.equal((await confirmation).status, 409); assert.equal(await designCount(), 2);
      authenticatedId = strangerId; assert.equal((await request(row.id, 8)).status, 404); assert.equal((await remove(row.id)).status, 404);
      authenticatedId = null; assert.equal((await request(row.id, 8)).status, 401);
      authenticatedId = ownerId; assert.equal((await request(row.id, 8)).status, 201); assert.equal(await designCount(), 3);
      // Exercise the service directly too; no source or design state is mocked.
      const deletion = await new PrismaFloorPlanRetentionService(prisma).requestOwnerDeletion({ jobId: row.id, ownerUserId: ownerId });
      assert.equal(deletion.sourceContentDeleted, true);
      evidence.push({ case: "candidate CAS and ownership", rejectedVersion: 7, acceptedVersion: 8, waits, finalOwnerDesigns: 3 });
    }
    const result = { environment: { postgres: (await pool.query("SHOW server_version")).rows[0].server_version, database: url.pathname.slice(1), dataDirectory: identity.data_directory },
      authBoundary: "Stubbed login identity; actual owner-scoped queries and all database effects", evidence };
    if (process.env.SCAN_PLAN_CONCURRENCY_OUTPUT) await writeFile(process.env.SCAN_PLAN_CONCURRENCY_OUTPUT, JSON.stringify(result, null, 2));
    console.log("PASS: actual confirmation/deletion routes on disposable PostgreSQL; both lock orderings, post-deletion underlay scrub, single duplicate commit, current-version CAS, ownership and persisted geometry.");
  } finally {
    if (previousAuth) require.cache[authPath] = previousAuth; else delete require.cache[authPath];
    await Promise.all([...lockers].map(async (client) => { try { await client.query("ROLLBACK"); } finally { client.release(); } }));
    await prisma.$disconnect(); await pool.end();
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
