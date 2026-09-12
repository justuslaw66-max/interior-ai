import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PublishedRevisionFloorPlanCatalogRepository,
  ReviewOnlyYamlFloorPlanCatalogRepository,
  mapPublishedFloorPlanRevisionRows,
  type PublishedFloorPlanAddressBindingRow,
  type PublishedFloorPlanCatalogKey,
  type PublishedFloorPlanRevisionRow,
} from "../lib/floor-plan-catalog-repository";
import {
  decodeFloorPlanCatalogCursor,
  encodeFloorPlanCatalogCursor,
} from "../lib/floor-plan-catalog-cursor";
import type { FloorPlanExactSearch } from "../lib/floor-plan-directory-contract";
import { getAllFloorPlanLibraryCatalogs } from "../lib/floor-plan-library-yaml";
import {
  assertPublicFloorPlanProjectionSafe,
  assertPublicFloorPlanSentinelsAbsent,
} from "./floor-plan-public-privacy-assertions";

const PRIVATE_ADDRESS = "867A Privacy Sentinel Street";
const PRIVATE_STACK = "731";
const PRIVATE_FLOOR = 73;
const HASH = "a".repeat(64);

function manifest() {
  return {
    schemaVersion: 2,
    generatedAt: "2026-07-16T00:00:00.000Z",
    reviewerId: "reviewer@example.com",
    geometryHash: HASH,
    sourceInventory: { licenseStatus: "permission_confirmed" },
    publicationChecks: {
      dimensionsExact: true,
      criticalElementsAccountedFor: true,
      topologyValid: true,
      overlayRegistered: true,
      sourceOverlayAnchorsWithinOnePixel: true,
      renderParityVerified: true,
      persistenceRoundTripVerified: true,
      sourceBound: true,
      sourceEvidenceWithinBounds: true,
    },
    sourceOverlayVerification: { passed: true, residuals: [{ residualPx: 0 }] },
  };
}

function binding(
  id: string,
  transform: "normal" | "mirror_x" = "normal"
): PublishedFloorPlanAddressBindingRow {
  return {
    id,
    countryCode: "SG",
    addressNormalized: PRIVATE_ADDRESS,
    block: "867A",
    street: "Privacy Sentinel Street",
    postalCode: "519867",
    stack: PRIVATE_STACK,
    floorMin: 70,
    floorMax: 75,
    transform,
  };
}

function revision(
  id: string,
  publishedAt: string,
  bindings = [binding(`${id}-binding`)]
): PublishedFloorPlanRevisionRow {
  return {
    id,
    geometryHash: HASH,
    verificationTier: "source_verified",
    publishedAt,
    documentJson: {
      schemaVersion: 2,
      floors: [{ rooms: [{ id: "private-room", name: "Private", roomType: "bedroom" }] }],
    },
    sourceManifestJson: manifest(),
    publicMetadata: {
      projectName: `Public project ${id}`,
      label: "Reviewed layout",
      flatType: "4-room",
      floorAreaSqm: 93,
      previewUrl: "/public-preview.webp",
      sourceUrl: "https://example.com/public-source",
      sourceTitle: "Public source",
      sourcePage: 5,
      publisher: "Public authority",
    },
    addressBindings: bindings.map((value) => ({ ...value })),
    catalogKey: { publishedAt, revisionId: id },
  };
}

const exactSearch: FloorPlanExactSearch = {
  countryCode: "SG",
  address: PRIVATE_ADDRESS,
  unit: { floor: PRIVATE_FLOOR, stack: PRIVATE_STACK },
};

const base = revision("revision-a", "2026-07-18T00:00:00.000Z", [
  binding("binding-wrong-stack"),
  { ...binding("binding-intended", "mirror_x"), stack: PRIVATE_STACK },
  { ...binding("binding-other-address"), addressNormalized: "Unrelated address", block: "999" },
]);
base.addressBindings[0].stack = "999";
base.authoredVariantGroups = [{
  groupKey: "kitchen-layout",
  label: "Kitchen layout",
  publicationStatus: "published",
  approvedByEmail: "reviewer@example.com",
  publishedAt: "2026-07-18T00:00:00.000Z",
  publishedByEmail: "publisher@example.com",
  options: [
    {
      optionKey: "open",
      label: "Open kitchen",
      revisionId: base.id,
      addressBindingId: "binding-intended",
      geometryHash: HASH,
      sourceId: "source-a",
      sourcePage: 1,
      defaultSelected: true,
      sourceEvidenceJson: {
        basis: "direct_source_configuration",
        sourceId: "source-a",
        pageNumber: 1,
        revisionId: base.id,
        geometryHash: HASH,
      },
      revision: {
        id: base.id,
        geometryHash: HASH,
        verificationTier: "source_verified",
        publicationStatus: "published",
        publishedAt: "2026-07-18T00:00:00.000Z",
      },
      addressBinding: {
        id: "binding-intended",
        revisionId: base.id,
        transform: "mirror_x",
        role: "catalog",
      },
    },
    {
      optionKey: "enclosed",
      label: "Enclosed kitchen",
      revisionId: "revision-alternate",
      addressBindingId: "binding-alternate",
      geometryHash: HASH,
      sourceId: "source-a",
      sourcePage: 2,
      defaultSelected: false,
      sourceEvidenceJson: {
        basis: "direct_source_configuration",
        sourceId: "source-a",
        pageNumber: 2,
        revisionId: "revision-alternate",
        geometryHash: HASH,
      },
      revision: {
        id: "revision-alternate",
        geometryHash: HASH,
        verificationTier: "source_verified",
        publicationStatus: "published",
        publishedAt: "2026-07-18T00:00:00.000Z",
      },
      addressBinding: {
        id: "binding-alternate",
        revisionId: "revision-alternate",
        transform: "normal",
        role: "authored_variant",
      },
    },
  ],
}];

const exact = mapPublishedFloorPlanRevisionRows([base], { exactSearch });
assert.equal(exact.length, 1);
assert.equal(exact[0].id, "revision:revision-a");
assert.equal(exact[0].selectedBindingId, "binding-intended");
assert.equal(exact[0].addressTransform, "mirror_x");
assert.equal(exact[0].matchLevel, "unit");
assert.equal(exact[0].floorAreaSqm, 93);
assert.equal(exact[0].verificationTier, "source_verified");
assert.equal(exact[0].authoredConfigurationGroups?.length, 1);
const exactAuthoredGroup = exact[0].authoredConfigurationGroups?.[0];
assert.ok(exactAuthoredGroup);
assert.equal(
  "addressBinding" in exactAuthoredGroup.options[0],
  false,
  "Authored variants must survive exact matching without exposing their binding"
);
assertPublicFloorPlanProjectionSafe(exact);
const serializedExact = JSON.stringify(exact);
assert.equal(serializedExact.includes(PRIVATE_ADDRESS), false);
assert.equal(serializedExact.includes(`"${PRIVATE_FLOOR}"`), false);
assert.equal(serializedExact.includes(PRIVATE_STACK), false);
assert.equal(serializedExact.includes("binding-wrong-stack"), false);
assertPublicFloorPlanSentinelsAbsent(exact, [PRIVATE_ADDRESS, PRIVATE_FLOOR, PRIVATE_STACK]);

assert.equal(
  mapPublishedFloorPlanRevisionRows([base], {
    exactSearch: { ...exactSearch, unit: { ...exactSearch.unit, floor: 69 } },
  }).length,
  0
);
assert.equal(
  mapPublishedFloorPlanRevisionRows([base], {
    exactSearch: { ...exactSearch, unit: { ...exactSearch.unit, stack: "000" } },
  }).length,
  0
);

const browsed = mapPublishedFloorPlanRevisionRows([base]);
assert.equal(browsed.length, 1, "Private bindings must group to one public revision");
assert.equal(browsed[0].matchLevel, "layout");
assert.equal("selectedBindingId" in browsed[0], false);
assert.equal("addressTransform" in browsed[0], false);
assertPublicFloorPlanProjectionSafe(browsed);

assert.equal(
  mapPublishedFloorPlanRevisionRows([{
    ...base,
    sourceManifestJson: { ...manifest(), sourceInventory: { licenseStatus: "unknown" } },
  }], { exactSearch }).length,
  0,
  "Invalid publication evidence must fail closed"
);

async function main() {
  let exactInput: unknown;
  const exactRepository = new PublishedRevisionFloorPlanCatalogRepository({
    async listPublishedRevisions(input) {
      exactInput = input;
      return { rows: [base], lastScannedKey: base.catalogKey ?? null, hasMore: false };
    },
  });
  const repositoryExact = await exactRepository.search(exactSearch, { limit: 2 });
  assert.equal(repositoryExact.length, 1);
  assert.deepEqual((exactInput as { unit: unknown }).unit, exactSearch.unit);
  assert.equal((exactInput as { mode: string }).mode, "search");

  const revisions = [
    base,
    revision("revision-b", "2026-07-17T00:00:00.000Z"),
    revision("revision-c", "2026-07-16T00:00:00.000Z"),
  ];
  const pagedRepository = new PublishedRevisionFloorPlanCatalogRepository({
    async listPublishedRevisions(input) {
      const start = input.after
        ? revisions.findIndex((row) => row.id === input.after?.revisionId) + 1
        : 0;
      const rows = revisions.slice(start, start + input.take);
      return {
        rows,
        lastScannedKey: rows.at(-1)?.catalogKey ?? null,
        hasMore: start + rows.length < revisions.length,
      };
    },
  });
  const first = await pagedRepository.browsePage({ limit: 2 });
  assert.equal(first.results.length, 2);
  assert.deepEqual(first.results.map((result) => result.revisionId), ["revision-a", "revision-b"]);
  assert.deepEqual(first.nextKey, revisions[1].catalogKey);
  const second = await pagedRepository.browsePage({ limit: 2, after: first.nextKey });
  assert.deepEqual(second.results.map((result) => result.revisionId), ["revision-c"]);
  assert.equal(second.nextKey, null);
  assert.equal(new Set([...first.results, ...second.results].map((result) => result.id)).size, 3);

  const cursorKey: PublishedFloorPlanCatalogKey = revisions[1].catalogKey!;
  const searchScope = { mode: "search" as const, ...exactSearch };
  const opaqueCursor = encodeFloorPlanCatalogCursor(cursorKey, searchScope);
  assert.doesNotMatch(opaqueCursor, /Privacy|867A|731/);
  assert.deepEqual(decodeFloorPlanCatalogCursor(opaqueCursor, searchScope), cursorKey);
  assert.equal(
    decodeFloorPlanCatalogCursor(opaqueCursor, {
      ...searchScope,
      unit: { ...searchScope.unit, stack: "999" },
    }),
    null,
    "A search cursor must remain bound to the exact contract"
  );
  assert.equal(
    decodeFloorPlanCatalogCursor(`${opaqueCursor.slice(0, -1)}x`, searchScope),
    null,
    "Tampered cursors must fail closed"
  );
  const browseCursor = encodeFloorPlanCatalogCursor(cursorKey, { mode: "browse" });
  assert.equal(decodeFloorPlanCatalogCursor(browseCursor, searchScope), null);

  const reviewOnlyYaml = new ReviewOnlyYamlFloorPlanCatalogRepository(
    getAllFloorPlanLibraryCatalogs
  );
  assert.deepEqual(
    (await reviewOnlyYaml.searchForReview("810A Chai Chee Street #12-509"))
      .map((result) => result.layoutId),
    ["3gen"]
  );
  assert.equal((await reviewOnlyYaml.browseForReview()).length, 7);
  assert.equal("search" in reviewOnlyYaml, false);

  const publicRoute = fs.readFileSync(
    path.join(process.cwd(), "app/api/floor-plans/route.ts"),
    "utf8"
  );
  const prismaSource = fs.readFileSync(
    path.join(process.cwd(), "lib/floor-plan-catalog-prisma.ts"),
    "utf8"
  );
  assert.doesNotMatch(publicRoute, /YamlFloorPlanCatalogRepository|floor-plan-library-yaml/);
  assert.match(publicRoute, /prismaPublishedFloorPlanRevisionDataSource/);
  assert.match(publicRoute, /"Cache-Control": SAFE_CACHE_CONTROL/);
  assert.doesNotMatch(publicRoute, /offset:|stale-while-revalidate/);
  assert.match(prismaSource, /floorPlanRevision\.findMany/);
  assert.doesNotMatch(prismaSource, /floorPlanAddressBinding\.findMany/);
  assert.match(prismaSource, /orderBy: \[\{ publishedAt: "desc" \}, \{ id: "asc" \}\]/);

  console.log("Floor-plan catalog repository checks passed.");
}

void main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
