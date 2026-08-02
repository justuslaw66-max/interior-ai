import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  FloorPlanAddressBindingEvidenceError,
  validateFloorPlanAddressBindingEvidence,
} from "@/lib/floor-plan-imports/address-binding-evidence";
import { snapshotFloorPlanAddressBindings } from "@/lib/floor-plan-imports/revision-audit";

const SOURCE_HASH = "a".repeat(64);
const BROCHURE_HASH = "b".repeat(64);
const renderedPages = [{
  pageNumber: 1,
  widthPx: 1000,
  heightPx: 800,
  assetKey: "rendered/source/page-1.webp",
}];
const document: FloorPlanDocumentV2 = {
  schemaVersion: 2,
  units: "mm",
  id: "3gen",
  revisionId: "3gen-r1",
  createdAt: "2026-07-16T00:00:00.000Z",
  verification: { tier: "needs_review", criticalIssueIds: [] },
  sources: [{
    id: "source-asset-1",
    kind: "pdf",
    name: "internal.pdf",
    mimeType: "application/pdf",
    sha256: SOURCE_HASH,
    pageCount: 1,
  }, {
    id: "official-brochure-asset",
    kind: "pdf",
    name: "official-brochure.pdf",
    mimeType: "application/pdf",
    sha256: BROCHURE_HASH,
    pageCount: 8,
  }],
  floors: [],
};

function binding(stack: string, sourceEvidence: unknown = evidence(stack)) {
  return {
    countryCode: "SG",
    addressNormalized: "810A Chai Chee Street",
    block: "810A",
    street: "Chai Chee Street",
    postalCode: null,
    stack,
    floorMin: 2,
    floorMax: 15,
    transform: "normal",
    sourceEvidence,
  };
}

function evidence(stack: string) {
  return {
    schemaVersion: 1,
    sourceId: "source-asset-1",
    sourceSha256: SOURCE_HASH,
    pageNumber: 1,
    cropPx: { xPx: 100, yPx: 100, widthPx: 500, heightPx: 300 },
    anchors: [
      { kind: "block_label", xPx: 140, yPx: 130, observedText: "BLOCK 810A" },
      { kind: "stack_label", xPx: 200, yPx: 150, observedText: stack },
      { kind: "floor_range", xPx: 250, yPx: 200, observedText: "#02-#15" },
      { kind: "layout_label", xPx: 300, yPx: 220, observedText: "3 GEN" },
      { kind: "orientation_marker", xPx: 350, yPx: 240, observedText: "page top" },
    ],
    observed: {
      block: "810A",
      stacks: ["509", "527"],
      floorMin: 2,
      floorMax: 15,
      documentId: "3gen",
    },
    orientationSupport: {
      transform: "normal",
      sourceUp: "page_top",
      basis: "source_orientation_marker",
    },
    reviewerConfirmation: {
      confirmed: true,
      scope: "address_binding_and_orientation",
      reviewerId: "untrusted-client@example.com",
      reviewedAt: "2000-01-01T00:00:00.000Z",
    },
  };
}

const context = {
  document,
  sourceAsset: { id: "source-asset-1", sha256: SOURCE_HASH },
  renderedPages,
  reviewer: {
    id: "trusted-admin@example.com",
    reviewedAt: "2026-07-16T10:00:00.000Z",
  },
};

function assertEvidenceError(
  expectedCode: string,
  callback: () => unknown
) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof FloorPlanAddressBindingEvidenceError);
    assert.equal(error.code, expectedCode);
    return true;
  });
}

assertEvidenceError("MISSING", () =>
  validateFloorPlanAddressBindingEvidence([
    { ...binding("509"), sourceEvidence: undefined },
  ], context)
);
assertEvidenceError("MALFORMED", () =>
  validateFloorPlanAddressBindingEvidence([
    binding("509", { pageNumber: 1 }),
  ], context)
);
assertEvidenceError("WRONG_PAGE", () =>
  validateFloorPlanAddressBindingEvidence([
    binding("509", { ...evidence("509"), pageNumber: 2 }),
  ], context)
);
assertEvidenceError("OUT_OF_BOUNDS", () =>
  validateFloorPlanAddressBindingEvidence([
    binding("509", {
      ...evidence("509"),
      cropPx: { xPx: 990, yPx: 100, widthPx: 20, heightPx: 100 },
      anchors: undefined,
    }),
  ], context)
);
assertEvidenceError("UNSUPPORTED_TRANSFORM", () =>
  validateFloorPlanAddressBindingEvidence([
    { ...binding("509"), transform: "rotate_90" },
  ], context)
);

const stamped = validateFloorPlanAddressBindingEvidence(
  [binding("509"), binding("527")],
  context
);
assert.equal(stamped.length, 2);
for (const result of stamped) {
  assert.deepEqual(result.sourceEvidence.reviewerConfirmation, {
    confirmed: true,
    scope: "address_binding_and_orientation",
    reviewerId: "trusted-admin@example.com",
    reviewedAt: "2026-07-16T10:00:00.000Z",
  });
}

const addressOnlyEvidence = {
  ...evidence("509"),
  anchors: [
    { kind: "address_label", xPx: 140, yPx: 130, observedText: "810A Chai Chee Street" },
    { kind: "postal_code", xPx: 200, yPx: 150, observedText: "460810" },
  ],
  observed: {
    addressNormalized: "810A Chai Chee Street",
    postalCode: "460810",
    documentId: "3gen",
  },
};
const [addressOnlyStamped] = validateFloorPlanAddressBindingEvidence([{
  countryCode: "SG",
  addressNormalized: "810A Chai Chee Street",
  block: "",
  street: "",
  postalCode: "460810",
  stack: null,
  floorMin: null,
  floorMax: null,
  transform: "normal",
  sourceEvidence: addressOnlyEvidence,
}], context);
assert.equal(addressOnlyStamped.stack, null);
assert.equal(addressOnlyStamped.floorMin, null);
assert.equal(addressOnlyStamped.sourceEvidence.observed.postalCode, "460810");

const brochureEvidence = {
  ...evidence("509"),
  sourceId: "official-brochure-asset",
  sourceSha256: BROCHURE_HASH,
  pageNumber: 5,
};
const brochureContext = {
  ...context,
  supplementarySources: [{
    sourceAsset: {
      id: "official-brochure-asset",
      sha256: BROCHURE_HASH,
      contentDeletedAt: null,
    },
    renderedPages: [{
      pageNumber: 5,
      widthPx: 1000,
      heightPx: 800,
      assetKey: "official-page-5",
    }],
  }],
};
const brochureStamped = validateFloorPlanAddressBindingEvidence(
  [binding("509", brochureEvidence)],
  brochureContext
);
assert.equal(brochureStamped[0].sourceEvidence.sourceId, "official-brochure-asset");
assert.equal(brochureStamped[0].sourceEvidence.sourceSha256, BROCHURE_HASH);
assertEvidenceError("WRONG_SOURCE_HASH", () =>
  validateFloorPlanAddressBindingEvidence([
    binding("509", { ...brochureEvidence, sourceSha256: "c".repeat(64) }),
  ], brochureContext)
);
assertEvidenceError("WRONG_PAGE", () =>
  validateFloorPlanAddressBindingEvidence([
    binding("509", { ...brochureEvidence, pageNumber: 6 }),
  ], brochureContext)
);
assertEvidenceError("WRONG_SOURCE", () =>
  validateFloorPlanAddressBindingEvidence(
    [binding("509", brochureEvidence)],
    context
  )
);
assertEvidenceError("WRONG_SOURCE", () =>
  validateFloorPlanAddressBindingEvidence([binding("509")], {
    ...context,
    sourceAsset: {
      ...context.sourceAsset,
      contentDeletedAt: new Date("2026-07-17T00:00:00.000Z"),
    },
  })
);

const persisted = stamped.map(({ sourceEvidence, ...entry }) => ({
  ...entry,
  sourceEvidenceJson: sourceEvidence,
}));
validateFloorPlanAddressBindingEvidence(persisted, {
  document,
  sourceAsset: context.sourceAsset,
  renderedPages,
});
const auditSnapshot = snapshotFloorPlanAddressBindings(persisted);
assert.equal(
  (auditSnapshot[0].sourceEvidence as { reviewerConfirmation: { reviewerId: string } })
    .reviewerConfirmation.reviewerId,
  "trusted-admin@example.com"
);

assertEvidenceError("WRONG_LAYOUT", () =>
  validateFloorPlanAddressBindingEvidence([binding("509")], {
    ...context,
    document: { ...document, id: "4-room" },
  })
);

const pingYiManifest = JSON.parse(
  fs.readFileSync(
    path.join(
      process.cwd(),
      "catalog/floor-plans/sg/hdb/ping-yi-court/source-manifest.json"
    ),
    "utf8"
  )
) as {
  verification_status: string;
  stack_bindings: Array<{
    block: string;
    stacks: string[];
    layout_id: string;
    transform: string;
  }>;
};
const golden = pingYiManifest.stack_bindings.filter(
  (entry) =>
    entry.block === "810A" &&
    entry.stacks.some((stack) => stack === "509" || stack === "527")
);
assert.deepEqual(golden, [{
  block: "810A",
  stacks: ["509", "527"],
  floor_ranges: [{ from: 2, to: 15 }],
  layout_id: "3gen",
  evidence: "official_unit_distribution",
  transform: "needs_review",
}]);
assert.equal(pingYiManifest.verification_status, "needs_review");
assert.equal(golden[0].layout_id, "3gen");
assert.equal(golden[0].transform, "needs_review");

for (const routePath of [
  "app/api/admin/floor-plan-imports/[id]/approve/route.ts",
  "app/api/admin/floor-plan-imports/[id]/publish/route.ts",
]) {
  const route = fs.readFileSync(path.join(process.cwd(), routePath), "utf8");
  assert.match(route, /validateFloorPlanAddressBindingEvidence/);
}
const dataSource = fs.readFileSync(
  path.join(process.cwd(), "lib/floor-plan-catalog-prisma.ts"),
  "utf8"
);
assert.match(dataSource, /sourceEvidenceJson:\s*\{\s*not:\s*Prisma\.DbNull/);
assert.doesNotMatch(dataSource, /stack:\s*\{\s*not:\s*null/);
assert.doesNotMatch(dataSource, /floorMin:\s*\{\s*not:\s*null/);
assert.match(
  dataSource,
  /assessFloorPlanServingIntegrity\(row\)/,
  "public search must validate the complete serving contract, not merely non-null JSON"
);
assert.match(
  dataSource,
  /constructionEvidenceJson: true/,
  "catalog search must revalidate construction evidence against durable sources"
);
assert.match(
  dataSource,
  /assessFloorPlanServingIntegrity\(row\)\.valid\)[\s\S]*?return \[\];/,
  "public search must fail closed when persisted address evidence is invalid"
);
const publicRevisionRoute = fs.readFileSync(
  path.join(process.cwd(), "app/api/floor-plans/revisions/[id]/route.ts"),
  "utf8"
);
assert.match(publicRevisionRoute, /assessFloorPlanServingIntegrity/);
assert.match(publicRevisionRoute, /supplementarySources:/);

console.log("Floor-plan address-binding evidence checks passed.");
