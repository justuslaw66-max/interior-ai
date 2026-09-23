import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolveFloorPlanObjectStorageConfig } from "@/lib/floor-plan-imports/object-storage-config";
import { S3CompatibleFloorPlanObjectStorage } from "@/lib/floor-plan-imports/object-storage-s3";
import {
  FloorPlanObjectStorageError,
  type PrivateFloorPlanObjectStorage,
} from "@/lib/floor-plan-imports/object-storage";
import { PrismaFloorPlanSourceStore } from "@/lib/floor-plan-imports/prisma-store";

const fixedNow = new Date("2026-07-17T03:04:05.000Z");
const keySecret = "test-only-object-key-secret-that-is-long-enough";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function s3Config(overrides: Record<string, string | undefined> = {}) {
  const config = resolveFloorPlanObjectStorageConfig({
    NODE_ENV: "test",
    FLOOR_PLAN_OBJECT_STORAGE_PROVIDER: "s3",
    FLOOR_PLAN_S3_ENDPOINT: "http://127.0.0.1:9000/private-api",
    FLOOR_PLAN_S3_REGION: "ap-southeast-1",
    FLOOR_PLAN_S3_BUCKET: "private-floor-plans",
    FLOOR_PLAN_S3_ACCESS_KEY_ID: "test-access-key",
    FLOOR_PLAN_S3_SECRET_ACCESS_KEY: "test-secret-key",
    FLOOR_PLAN_S3_KEY_PREFIX: "floor-plans/v1",
    FLOOR_PLAN_OBJECT_STORAGE_KEY_SECRET: keySecret,
    FLOOR_PLAN_S3_SERVER_SIDE_ENCRYPTION: "managed",
    ...overrides,
  });
  assert.equal(config.provider, "s3");
  return config;
}

function responseWithBytes(bytes: Uint8Array, mimeType: string): Response {
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "content-length": String(bytes.byteLength),
      "content-type": mimeType,
      "x-amz-meta-byte-length": String(bytes.byteLength),
      "x-amz-meta-sha256": sha256(bytes),
    },
  });
}

async function testFailClosedConfiguration() {
  assert.deepEqual(resolveFloorPlanObjectStorageConfig({}), { provider: "database" });
  assert.deepEqual(
    resolveFloorPlanObjectStorageConfig({
      FLOOR_PLAN_OBJECT_STORAGE_PROVIDER: "database",
      FLOOR_PLAN_S3_ADDRESSING_STYLE: "path",
      FLOOR_PLAN_S3_KEY_PREFIX: "floor-plans/v1",
      FLOOR_PLAN_S3_SERVER_SIDE_ENCRYPTION: "AES256",
    }),
    { provider: "database" }
  );
  assert.throws(
    () => resolveFloorPlanObjectStorageConfig({ FLOOR_PLAN_S3_BUCKET: "configured-by-mistake" }),
    (error) =>
      error instanceof FloorPlanObjectStorageError && error.code === "configuration"
  );
  assert.throws(
    () => s3Config({ NODE_ENV: "production" }),
    /must use HTTPS/
  );
  assert.throws(
    () => s3Config({ FLOOR_PLAN_OBJECT_STORAGE_KEY_SECRET: "too-short" }),
    /at least 32 bytes/
  );
  assert.throws(
    () => s3Config({ FLOOR_PLAN_S3_KEY_PREFIX: "unsafe/../prefix" }),
    /safe-key namespace/
  );
  assert.throws(
    () => s3Config({ FLOOR_PLAN_S3_ADDRESSING_STYLE: "public" }),
    /path or virtual/
  );
}

async function testOpaqueKeysAndSignedPrivatePut() {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const storage = new S3CompatibleFloorPlanObjectStorage(s3Config(), {
    now: () => fixedNow,
    sleep: async () => undefined,
    fetch: async (input, init = {}) => {
      calls.push({ url: new URL(input.toString()), init });
      return new Response(null, { status: 204 });
    },
  });
  const logicalIdentity = "user@example.com:810A Chai Chee St:my-plan.pdf";
  const key = storage.keyFor("source", logicalIdentity);
  assert.match(key, /^floor-plans\/v1\/source\/[a-f0-9]{64}$/);
  assert.ok(!key.includes("user"));
  assert.ok(!key.includes("810"));
  assert.ok(!key.includes("pdf"));
  assert.equal(storage.keyFor("source", logicalIdentity), key);
  assert.notEqual(storage.keyFor("derived", logicalIdentity), key);

  const bytes = new TextEncoder().encode("private source bytes");
  await storage.putObject({
    key,
    bytes,
    mimeType: "application/pdf",
    sha256: sha256(bytes),
  });
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(
    call.url.toString(),
    `http://127.0.0.1:9000/private-api/private-floor-plans/${key}`
  );
  assert.equal(call.url.search, "");
  const headers = new Headers(call.init.headers);
  assert.match(headers.get("authorization") ?? "", /Credential=test-access-key\/20260717\/ap-southeast-1\/s3\/aws4_request/);
  assert.equal(headers.get("x-amz-date"), "20260717T030405Z");
  assert.equal(headers.get("x-amz-content-sha256"), sha256(bytes));
  assert.equal(headers.get("x-amz-meta-sha256"), sha256(bytes));
  assert.equal(headers.get("x-amz-meta-byte-length"), String(bytes.byteLength));
  assert.equal(headers.get("x-amz-acl"), null);
  assert.ok(!(call.url.toString().includes("X-Amz-Signature")));
  assert.deepEqual(new Uint8Array(call.init.body as Buffer), bytes);
}

async function testVerifiedReadsAndDeletes() {
  const bytes = new TextEncoder().encode("rendered preview");
  const key = "floor-plans/v1/derived/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const queue: Response[] = [
    responseWithBytes(bytes, "image/png"),
    new Response(null, { status: 404 }),
    new Response(null, { status: 404 }),
  ];
  const methods: string[] = [];
  const storage = new S3CompatibleFloorPlanObjectStorage(s3Config(), {
    now: () => fixedNow,
    sleep: async () => undefined,
    fetch: async (_input, init = {}) => {
      methods.push(init.method ?? "GET");
      const response = queue.shift();
      assert.ok(response);
      return response;
    },
  });
  const read = await storage.getObject({
    key,
    expectedByteLength: bytes.byteLength,
    expectedMimeType: "image/png",
    expectedSha256: sha256(bytes),
  });
  assert.deepEqual(read, bytes);
  assert.equal(
    await storage.getObject({
      key,
      expectedByteLength: bytes.byteLength,
      expectedMimeType: "image/png",
      expectedSha256: sha256(bytes),
    }),
    null
  );
  await storage.deleteObject(key);
  assert.deepEqual(methods, ["GET", "GET", "DELETE"]);
}

async function testIntegrityFailuresAndRetry() {
  const expected = new TextEncoder().encode("expected");
  const tampered = new TextEncoder().encode("tampered");
  let attempts = 0;
  const retrying = new S3CompatibleFloorPlanObjectStorage(s3Config(), {
    now: () => fixedNow,
    sleep: async () => undefined,
    fetch: async () => {
      attempts += 1;
      return attempts === 1
        ? new Response(null, { status: 503 })
        : new Response(null, { status: 204 });
    },
  });
  const putKey = retrying.keyFor("source", "retry-source");
  await retrying.putObject({
    key: putKey,
    bytes: expected,
    mimeType: "application/pdf",
    sha256: sha256(expected),
  });
  assert.equal(attempts, 2);
  await assert.rejects(
    () =>
      retrying.putObject({
        key: putKey,
        bytes: expected,
        mimeType: "application/pdf",
        sha256: "c".repeat(64),
      }),
    (error) =>
      error instanceof FloorPlanObjectStorageError && error.code === "integrity_mismatch"
  );

  const tamperedStorage = new S3CompatibleFloorPlanObjectStorage(s3Config(), {
    now: () => fixedNow,
    fetch: async () =>
      new Response(tampered, {
        status: 200,
        headers: {
          "content-length": String(tampered.byteLength),
          "content-type": "application/pdf",
        },
      }),
  });
  await assert.rejects(
    () =>
      tamperedStorage.getObject({
        key: putKey,
        expectedByteLength: expected.byteLength,
        expectedMimeType: "application/pdf",
        expectedSha256: sha256(expected),
      }),
    (error) =>
      error instanceof FloorPlanObjectStorageError && error.code === "integrity_mismatch"
  );

  const wrongMetadata = new S3CompatibleFloorPlanObjectStorage(s3Config(), {
    now: () => fixedNow,
    fetch: async () =>
      new Response(expected, {
        status: 200,
        headers: {
          "content-length": String(expected.byteLength),
          "content-type": "application/pdf",
          "x-amz-meta-sha256": "b".repeat(64),
        },
      }),
  });
  await assert.rejects(
    () =>
      wrongMetadata.getObject({
        key: putKey,
        expectedByteLength: expected.byteLength,
        expectedMimeType: "application/pdf",
        expectedSha256: sha256(expected),
      }),
    /private metadata SHA-256 is inconsistent/
  );

  const overlongStorage = new S3CompatibleFloorPlanObjectStorage(s3Config(), {
    now: () => fixedNow,
    fetch: async () =>
      new Response(Buffer.concat([Buffer.from(expected), Buffer.from("!")]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
  });
  await assert.rejects(
    () =>
      overlongStorage.getObject({
        key: putKey,
        expectedByteLength: expected.byteLength,
        expectedMimeType: "application/pdf",
        expectedSha256: sha256(expected),
      }),
    /exceeded its stored length/
  );
}

async function testPrismaMetadataIntegration() {
  const objects = new Map<string, Uint8Array>();
  const objectStorage: PrivateFloorPlanObjectStorage = {
    keyFor(kind, logicalIdentity) {
      return `floor-plans/v1/${kind}/${createHash("sha256").update(logicalIdentity).digest("hex")}`;
    },
    async putObject(input) {
      assert.equal(sha256(input.bytes), input.sha256);
      objects.set(input.key, input.bytes.slice());
    },
    async getObject(input) {
      return objects.get(input.key)?.slice() ?? null;
    },
    async deleteObject(key) {
      objects.delete(key);
    },
  };
  let sourceRow: Record<string, unknown> | null = null;
  let derivativeRow: Record<string, unknown> | null = null;
  const client = {
    floorPlanSourceAsset: {
      async findFirst() {
        return sourceRow;
      },
      async findUnique(args: { where: { id?: string; dedupeKey?: string } }) {
        return args.where.id || args.where.dedupeKey ? sourceRow : null;
      },
      async createMany(args: { data: Array<Record<string, unknown>> }) {
        sourceRow = { id: "source-1", ...args.data[0] };
        return { count: 1 };
      },
    },
    floorPlanDerivedAsset: {
      async upsert(args: { create: Record<string, unknown>; update: Record<string, unknown> }) {
        derivativeRow = derivativeRow
          ? { ...derivativeRow, ...args.update }
          : { id: "derived-1", ...args.create };
        return derivativeRow;
      },
      async findUnique() {
        return derivativeRow;
      },
    },
  };
  const store = new PrismaFloorPlanSourceStore(client, { objectStorage });
  const sourceBytes = new TextEncoder().encode("consumer floor plan");
  const source = await store.putSource({
    ownerScope: "private-user-id",
    fileName: "sensitive-address.pdf",
    mimeType: "application/pdf",
    bytes: sourceBytes,
  });
  assert.equal(source.id, "source-1");
  const storedSource = sourceRow as Record<string, unknown> | null;
  assert.ok(storedSource);
  assert.equal(storedSource.storageProvider, "external");
  assert.equal(storedSource.bytes, null);
  assert.equal(storedSource.externalUrl, null);
  const sourceKey = String(storedSource.storageKey);
  assert.ok(!sourceKey.includes("private-user-id"));
  assert.ok(!sourceKey.includes("sensitive-address"));
  assert.deepEqual((await store.readSource("source-1"))?.bytes, sourceBytes);

  const derivativeBytes = new TextEncoder().encode("preview");
  const derivativeId = await store.putDerivative({
    jobId: "private-job-id",
    fileName: "address-preview.png",
    mimeType: "image/png",
    bytes: derivativeBytes,
  });
  assert.equal(derivativeId, "derived-1");
  const storedDerivative = derivativeRow as Record<string, unknown> | null;
  assert.ok(storedDerivative);
  assert.equal(storedDerivative.storageProvider, "external");
  assert.equal(storedDerivative.bytes, null);
  assert.equal(storedDerivative.externalUrl, null);
  const derivativeKey = String(storedDerivative.storageKey);
  assert.ok(!derivativeKey.includes("private-job-id"));
  assert.ok(!derivativeKey.includes("address-preview"));
  assert.deepEqual((await store.readDerivative("derived-1"))?.bytes, derivativeBytes);
}

async function main() {
  await testFailClosedConfiguration();
  await testOpaqueKeysAndSignedPrivatePut();
  await testVerifiedReadsAndDeletes();
  await testIntegrityFailuresAndRetry();
  await testPrismaMetadataIntegration();
  console.log("floor-plan private object storage tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
