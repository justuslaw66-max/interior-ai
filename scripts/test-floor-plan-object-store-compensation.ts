import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { PrivateFloorPlanObjectStorage } from "@/lib/floor-plan-imports/object-storage";
import { PrismaFloorPlanSourceStore } from "@/lib/floor-plan-imports/prisma-store";

const sourceInput = {
  ownerScope: "private-user",
  fileName: "home.pdf",
  mimeType: "application/pdf",
  bytes: new TextEncoder().encode("%PDF-fault-fixture"),
};

function storageFixture(input: {
  failDelete?: boolean;
  assertOutsideTransaction?: () => void;
} = {}) {
  const objects = new Set<string>();
  const puts: string[] = [];
  const deletes: string[] = [];
  const storage: PrivateFloorPlanObjectStorage = {
    keyFor(kind, logicalIdentity) {
      return `${kind}/${Buffer.from(logicalIdentity).toString("hex")}`;
    },
    async putObject({ key }) {
      input.assertOutsideTransaction?.();
      puts.push(key);
      objects.add(key);
    },
    async getObject() {
      return null;
    },
    async deleteObject(key) {
      input.assertOutsideTransaction?.();
      deletes.push(key);
      if (input.failDelete) throw new Error("synthetic cleanup failure");
      objects.delete(key);
    },
  };
  return { storage, objects, puts, deletes };
}

function unusedDerivedAsset() {
  return {
    async upsert() {
      throw new Error("unused derivative persistence");
    },
    async findFirst() {
      return null;
    },
    async findUnique() {
      return null;
    },
  };
}

async function testSourcePersistenceCompensation() {
  const fixture = storageFixture();
  const persistenceFailure = new Error("synthetic source database failure");
  const client = {
    floorPlanSourceAsset: {
      async findFirst() {
        return null;
      },
      async findUnique() {
        return null;
      },
      async createMany() {
        throw persistenceFailure;
      },
    },
    floorPlanDerivedAsset: unusedDerivedAsset(),
  };
  const store = new PrismaFloorPlanSourceStore(client, {
    objectStorage: fixture.storage,
    stagedWrites: { createWriteId: () => "source-write" },
  });
  await assert.rejects(() => store.putSource(sourceInput), (cause) => {
    assert.equal(cause, persistenceFailure, "cleanup must preserve the original error");
    return true;
  });
  assert.equal(fixture.puts.length, 1);
  assert.deepEqual(fixture.deletes, fixture.puts);
  assert.equal(fixture.objects.size, 0, "failed source metadata must not orphan bytes");
}

async function testCleanupFailureDoesNotMaskPersistenceFailure() {
  const cleanupErrors: unknown[] = [];
  const fixture = storageFixture({ failDelete: true });
  const persistenceFailure = new Error("primary persistence error");
  const client = {
    floorPlanSourceAsset: {
      async findFirst() {
        return null;
      },
      async findUnique() {
        return null;
      },
      async createMany() {
        throw persistenceFailure;
      },
    },
    floorPlanDerivedAsset: unusedDerivedAsset(),
  };
  const store = new PrismaFloorPlanSourceStore(client, {
    objectStorage: fixture.storage,
    stagedWrites: {
      createWriteId: () => "cleanup-failure-write",
      onCleanupError: (event) => {
        cleanupErrors.push(event);
        throw new Error("synthetic reporter failure");
      },
    },
  });
  await assert.rejects(() => store.putSource(sourceInput), (cause) => {
    assert.equal(cause, persistenceFailure);
    return true;
  });
  assert.equal(fixture.deletes.length, 1, "cleanup must still be attempted");
  assert.equal(cleanupErrors.length, 1, "failed cleanup must be observable");
}

async function testSourceDedupeNeverDeletesWinner() {
  const fixture = storageFixture();
  const existingKey = "source/existing-dedupe-winner";
  fixture.objects.add(existingKey);
  let findUniqueCalls = 0;
  const winner = {
    id: "existing-source",
    fileName: sourceInput.fileName,
    mimeType: sourceInput.mimeType,
    byteLength: sourceInput.bytes.byteLength,
    sha256: "a".repeat(64),
    bytes: null,
    storageProvider: "external" as const,
    storageKey: existingKey,
    contentDeletedAt: null,
  };
  const client = {
    floorPlanSourceAsset: {
      async findFirst() {
        return null;
      },
      async findUnique() {
        findUniqueCalls += 1;
        return findUniqueCalls === 1 ? null : winner;
      },
      async createMany() {
        return { count: 0 };
      },
    },
    floorPlanDerivedAsset: unusedDerivedAsset(),
  };
  const store = new PrismaFloorPlanSourceStore(client, {
    objectStorage: fixture.storage,
    stagedWrites: { createWriteId: () => "losing-source-write" },
  });
  assert.equal((await store.putSource(sourceInput)).id, winner.id);
  assert.equal(fixture.puts.length, 1);
  assert.deepEqual(fixture.deletes, fixture.puts, "only the losing staged key is removed");
  assert.equal(fixture.objects.has(existingKey), true, "dedupe winner must survive");
  assert.equal(fixture.deletes.includes(existingKey), false);
}

async function testDerivativePersistenceCompensationAndDedupe() {
  const fixture = storageFixture();
  const persistenceFailure = new Error("synthetic derivative database failure");
  let existingDerivative: Record<string, unknown> | null = null;
  const client = {
    floorPlanSourceAsset: {
      async findFirst() {
        return null;
      },
      async findUnique() {
        return null;
      },
      async createMany() {
        return { count: 0 };
      },
    },
    floorPlanDerivedAsset: {
      async findFirst() {
        return existingDerivative;
      },
      async findUnique() {
        return null;
      },
      async upsert() {
        throw persistenceFailure;
      },
    },
  };
  const store = new PrismaFloorPlanSourceStore(client, {
    objectStorage: fixture.storage,
    stagedWrites: { createWriteId: () => "derivative-write" },
  });
  const derivativeInput = {
    jobId: "job-1",
    fileName: "page-1.png",
    mimeType: "image/png" as const,
    bytes: new TextEncoder().encode("rendered-page"),
  };
  await assert.rejects(() => store.putDerivative(derivativeInput), (cause) => {
    assert.equal(cause, persistenceFailure);
    return true;
  });
  assert.deepEqual(fixture.deletes, fixture.puts);
  assert.equal(fixture.objects.size, 0, "failed derivative metadata must not orphan bytes");

  existingDerivative = { id: "existing-derivative" };
  const putsBeforeDedupe = fixture.puts.length;
  assert.equal(await store.putDerivative(derivativeInput), "existing-derivative");
  assert.equal(
    fixture.puts.length,
    putsBeforeDedupe,
    "a live derivative dedupe hit must not write or delete its object"
  );
}

async function testObjectIoStaysOutsideTransaction() {
  let inTransaction = false;
  const fixture = storageFixture({
    assertOutsideTransaction() {
      assert.equal(inTransaction, false, "object I/O ran inside a database transaction");
    },
  });
  let persistedRow: Record<string, unknown> | null = null;
  let findUniqueCalls = 0;
  const client = {
    floorPlanSourceAsset: {
      async findFirst() {
        return null;
      },
      async findUnique() {
        findUniqueCalls += 1;
        return findUniqueCalls === 1 ? null : persistedRow;
      },
      async createMany(args: { data: Array<Record<string, unknown>> }) {
        assert.equal(inTransaction, true);
        persistedRow = { id: "source-transaction", ...args.data[0] };
        return { count: 1 };
      },
    },
    floorPlanDerivedAsset: unusedDerivedAsset(),
  };
  const store = new PrismaFloorPlanSourceStore(client, {
    objectStorage: fixture.storage,
    stagedWrites: { createWriteId: () => "transaction-boundary-write" },
  });
  const prepared = await store.prepareSource(sourceInput);
  assert.equal(fixture.puts.length, 1);
  const importTransactionFailure = new Error("synthetic import job failure");
  let observedFailure: unknown;
  let source: Awaited<ReturnType<typeof prepared.persist>> | null = null;
  try {
    inTransaction = true;
    source = await prepared.persist(client);
    throw importTransactionFailure;
  } catch (cause) {
    observedFailure = cause;
    inTransaction = false;
    await prepared.rollback(cause);
  }
  assert.equal(observedFailure, importTransactionFailure);
  assert.ok(source);
  assert.equal(source.id, "source-transaction");
  assert.deepEqual(
    fixture.deletes,
    fixture.puts,
    "a later import-job failure must compensate the already-staged source"
  );

  const route = fs.readFileSync(
    path.join(process.cwd(), "app/api/floor-plan-imports/route.ts"),
    "utf8"
  );
  assert.ok(route.indexOf("store.prepareSource(") < route.indexOf("createFloorPlanImportFromPreparedSource({"));
  assert.match(
    route,
    /prisma\.\$transaction\([\s\S]*?preparedSource\.persist\(transaction\)/
  );
  assert.doesNotMatch(
    route,
    /\$transaction\([\s\S]{0,500}?\.putSource\(/,
    "the primary upload route must not perform object I/O inside its transaction"
  );
}

async function main() {
  await testSourcePersistenceCompensation();
  await testCleanupFailureDoesNotMaskPersistenceFailure();
  await testSourceDedupeNeverDeletesWinner();
  await testDerivativePersistenceCompensationAndDedupe();
  await testObjectIoStaysOutsideTransaction();
  console.log("floor-plan object-store compensation tests passed");
}

void main();
