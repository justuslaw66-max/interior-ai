import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { floorPlanAddressBindingsOverlap } from "@/lib/floor-plan-imports/address-binding-conflicts";
import type { FloorPlanAddressTransform } from "@/lib/floor-plan-imports/types";
import { retirePublishedFloorPlanRevisionForSupersede } from "@/lib/floor-plan-imports/revision-retirement";
import {
  assertFloorPlanSupersedeCoverage,
  findUncoveredFloorPlanSupersedeBindings,
} from "@/lib/floor-plan-imports/revision-supersede";

const oldBinding = {
  id: "old-binding",
  countryCode: "SG",
  addressNormalized: "810A Chai Chee St",
  block: "810A",
  street: "Chai Chee St",
  postalCode: null,
  stack: "509",
  floorMin: 2,
  floorMax: 15,
  transform: "normal" as const,
  sourceEvidenceJson: { sourcePage: 7 },
};

assert.doesNotThrow(() =>
  assertFloorPlanSupersedeCoverage({
    replaced: [oldBinding],
    replacement: [
      { ...oldBinding, id: "replacement-low", floorMax: 8, transform: "mirror_x" },
      { ...oldBinding, id: "replacement-high", floorMin: 9, transform: "mirror_x" },
    ],
  })
);
assert.equal(
  findUncoveredFloorPlanSupersedeBindings({
    replaced: [oldBinding],
    replacement: [
      { ...oldBinding, id: "replacement-low", floorMax: 8 },
      { ...oldBinding, id: "replacement-high", floorMin: 10 },
    ],
  }).length,
  1,
  "a one-floor address gap must block atomic supersede"
);
assert.throws(
  () =>
    assertFloorPlanSupersedeCoverage({
      replaced: [{ ...oldBinding, stack: null }],
      replacement: [{ ...oldBinding, stack: "509" }],
    }),
  /SUPERSEDE_ADDRESS_GAP:.*all stacks/
);
assert.doesNotThrow(() =>
  assertFloorPlanSupersedeCoverage({
    replaced: [oldBinding],
    replacement: [{ ...oldBinding, stack: null, transform: "rotate_180" }],
  })
);

type TestBinding = Omit<typeof oldBinding, "transform"> & {
  transform: FloorPlanAddressTransform;
};
type FakeRevision = {
  id: string;
  publicationStatus: "published" | "retired";
  bindings: TestBinding[];
};
type FakeAudit = { revisionId: string; eventType: string; sourceEvidenceJson: unknown; metadataJson: unknown };
type FakeState = { revisions: Map<string, FakeRevision>; audits: FakeAudit[] };

function cloneState(state: FakeState): FakeState {
  return {
    revisions: new Map(
      [...state.revisions].map(([id, revision]) => [id, structuredClone(revision)])
    ),
    audits: structuredClone(state.audits),
  };
}

class FakeAtomicDatabase {
  state: FakeState = {
    revisions: new Map([
      [
        "old-revision",
        { id: "old-revision", publicationStatus: "published", bindings: [oldBinding] },
      ],
    ]),
    audits: [],
  };

  async transaction<T>(operation: (tx: ReturnType<FakeAtomicDatabase["client"]>) => Promise<T>) {
    const working = cloneState(this.state);
    const result = await operation(this.client(working));
    this.state = working;
    return result;
  }

  private client(state: FakeState) {
    return {
      state,
      floorPlanRevision: {
        updateMany: async (args: {
          where: { id: string; publicationStatus: string };
          data: { publicationStatus: "retired" };
        }) => {
          const revision = state.revisions.get(args.where.id);
          if (!revision || revision.publicationStatus !== args.where.publicationStatus) {
            return { count: 0 };
          }
          revision.publicationStatus = args.data.publicationStatus;
          return { count: 1 };
        },
      },
      floorPlanRevisionAuditEvent: {
        create: async (args: { data: FakeAudit }) => {
          state.audits.push(structuredClone(args.data));
          return args.data;
        },
      },
    };
  }
}

const retirementRecord = {
  id: "old-revision",
  sourceJobId: "old-job",
  publicationStatus: "published" as const,
  geometryHash: "a".repeat(64),
  sourceManifestJson: { sourceInventory: ["wall-1"] },
  constructionEvidenceJson: null,
  addressBindings: [oldBinding],
  sourceJob: {
    candidateVersion: 3,
    sourceAsset: {
      id: "old-source",
      sha256: "b".repeat(64),
      mimeType: "application/pdf",
      fileName: "old-source.pdf",
    },
  },
};
const replacementBinding = {
  ...oldBinding,
  id: "replacement-binding",
  transform: "mirror_x" as const,
};

async function testTransactionalSupersede() {
  const failed = new FakeAtomicDatabase();
  await assert.rejects(
    failed.transaction(async (tx) => {
      await retirePublishedFloorPlanRevisionForSupersede({
        tx: tx as never,
        revision: retirementRecord,
        replacementRevisionId: "replacement-revision",
        actorEmail: "admin@example.com",
        occurredAt: new Date("2026-07-16T12:00:00.000Z"),
        reason: "Corrected source geometry",
      });
      tx.state.revisions.set("replacement-revision", {
        id: "replacement-revision",
        publicationStatus: "published",
        bindings: [replacementBinding],
      });
      throw new Error("simulated replacement publication failure");
    }),
    /simulated replacement publication failure/
  );
  assert.equal(
    failed.state.revisions.get("old-revision")?.publicationStatus,
    "published",
    "replacement failure must roll back old retirement"
  );
  assert.equal(failed.state.revisions.has("replacement-revision"), false);
  assert.equal(failed.state.audits.length, 0, "retirement audit must roll back too");

  const succeeded = new FakeAtomicDatabase();
  await succeeded.transaction(async (tx) => {
    await retirePublishedFloorPlanRevisionForSupersede({
      tx: tx as never,
      revision: retirementRecord,
      replacementRevisionId: "replacement-revision",
      actorEmail: "admin@example.com",
      occurredAt: new Date("2026-07-16T12:00:00.000Z"),
      reason: "Corrected source geometry",
    });
    // Uncommitted state is not externally visible: readers still see the old
    // published row until the replacement transaction commits.
    assert.equal(succeeded.state.revisions.get("old-revision")?.publicationStatus, "published");
    tx.state.revisions.set("replacement-revision", {
      id: "replacement-revision",
      publicationStatus: "published",
      bindings: [replacementBinding],
    });
  });
  const activeMatches = [...succeeded.state.revisions.values()].filter(
    (revision) =>
      revision.publicationStatus === "published" &&
      revision.bindings.some((binding) =>
        floorPlanAddressBindingsOverlap(binding, oldBinding)
      )
  );
  assert.deepEqual(
    activeMatches.map((revision) => revision.id),
    ["replacement-revision"],
    "commit must move the selector to exactly one published revision"
  );
  assert.equal(succeeded.state.audits.length, 1);
  assert.equal(succeeded.state.audits[0].eventType, "revision_retired");
  assert.deepEqual(succeeded.state.audits[0].metadataJson, {
    previousStatus: "published",
    nextStatus: "retired",
    geometryHash: "a".repeat(64),
    candidateVersion: 3,
    addressBindingCount: 1,
    replacementRevisionId: "replacement-revision",
    lifecycleReason: "Corrected source geometry",
  });
  assert.equal(
    (succeeded.state.audits[0].sourceEvidenceJson as { addressBindings: unknown[] })
      .addressBindings.length,
    1,
    "retirement event must retain the old source/address snapshot"
  );
}

const approveRoute = fs.readFileSync(
  path.join(
    process.cwd(),
    "app/api/admin/floor-plan-imports/[id]/approve/route.ts"
  ),
  "utf8"
);
const transactionStart = approveRoute.indexOf("prisma.$transaction(async (tx) =>");
const transactionEnd = approveRoute.indexOf(
  "{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }",
  transactionStart
);
const transactionBody = approveRoute.slice(transactionStart, transactionEnd);
assert(transactionStart >= 0 && transactionEnd > transactionStart);
assert.doesNotMatch(transactionBody, /retirePublishedFloorPlanRevisionForSupersede/);
assert.match(
  approveRoute,
  /approvedDocument\.parentRevisionId = supersedesRevisionId/,
  "An approved replacement must persist direct lineage in the canonical document."
);
assert.match(transactionBody, /publicationStatus: "approved"/);
assert.doesNotMatch(transactionBody, /eventType: "revision_published"/);

const publishRoute = fs.readFileSync(
  path.join(
    process.cwd(),
    "app/api/admin/floor-plan-imports/[id]/publish/route.ts"
  ),
  "utf8"
);
const publishTransactionStart = publishRoute.indexOf("prisma.$transaction(async (tx) =>");
const publishTransactionEnd = publishRoute.indexOf(
  "{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }",
  publishTransactionStart
);
const publishTransactionBody = publishRoute.slice(
  publishTransactionStart,
  publishTransactionEnd
);
assert(publishTransactionStart >= 0 && publishTransactionEnd > publishTransactionStart);
assert.match(publishRoute, /assertDistinctFloorPlanReviewerPublisher/);
assert.match(publishTransactionBody, /retirePublishedFloorPlanRevisionForSupersede/);
assert.match(publishTransactionBody, /eventType: "revision_published"/);
assert.match(publishTransactionBody, /data: \{ status: "published", progress: 100 \}/);
assert.match(publishTransactionBody, /notIn: \[job\.revision!\.id, superseded\.id\]/);

testTransactionalSupersede()
  .then(() => console.log("Floor-plan atomic supersede tests passed."))
  .catch((cause) => {
    console.error(cause);
    process.exitCode = 1;
  });
