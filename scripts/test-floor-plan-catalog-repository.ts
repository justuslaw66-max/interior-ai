import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PublishedRevisionFloorPlanCatalogRepository,
  ReviewOnlyYamlFloorPlanCatalogRepository,
  mapPublishedFloorPlanRevisionRows,
  type PublishedFloorPlanCatalogKey,
  type PublishedFloorPlanRevisionRow,
} from "../lib/floor-plan-catalog-repository";
import {
  decodeFloorPlanCatalogCursor,
  encodeFloorPlanCatalogCursor,
} from "../lib/floor-plan-catalog-cursor";
import { getAllFloorPlanLibraryCatalogs } from "../lib/floor-plan-library-yaml";

const PRIVATE_ROOM_ID = "private-owner-room-justus";
const PRIVATE_ROOM_NAME = "Private homeowner nursery";

const revisionRows: PublishedFloorPlanRevisionRow[] = [
  {
    id: "ping-yi-4-room-r2",
    geometryHash: "a".repeat(64),
    verificationTier: "source_verified",
    publishedAt: "2026-07-16T00:00:00.000Z",
    publicMetadata: {
      projectName: "Ping Yi Court",
      label: "4-room Type A",
      flatType: "4-room",
      floorAreaSqm: 93,
      previewUrl: "/floor-plan-previews/ping-yi-4-room.webp",
      sourceUrl: "https://www.hdb.gov.sg/ping-yi-court",
      sourceTitle: "Ping Yi Court sales brochure",
      sourcePage: 5,
      publisher: "Housing and Development Board",
    },
    documentJson: {
      schemaVersion: 2,
      floors: [{
        rooms: [
          { id: PRIVATE_ROOM_ID, name: PRIVATE_ROOM_NAME, roomType: "bedroom" },
          { id: "room-bed-2", name: "Bedroom 2", roomType: "bedroom" },
          { id: "room-bed-3", name: "Bedroom 3", roomType: "bedroom" },
          { id: "room-living", name: "Living / Dining", roomType: "living" },
        ],
      }],
    },
    sourceManifestJson: {
      schemaVersion: 2,
      generatedAt: "2026-07-16T00:00:00.000Z",
      reviewerId: "reviewer@example.com",
      geometryHash: "a".repeat(64),
      sources: [
        {
          name: "Ping Yi Court floor plans",
          uri: "https://example.com/ping-yi.pdf",
        },
      ],
      sourceInventory: {
        pageNumbers: [5],
        licenseStatus: "permission_confirmed",
      },
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
      reviewerMetadata: {
        display: {
          projectName: "Ping Yi Court",
          label: "4-room",
          flatType: "4-room",
          floorAreaSqm: 93,
          previewUrl: "/floor-plans/ping-yi/4-room.png",
          publisher: "HDB",
        },
      },
      floors: [
        {
          labels: [
            { id: PRIVATE_ROOM_ID, name: PRIVATE_ROOM_NAME, roomType: "bedroom" },
            { id: "room-bed-2", name: "Bedroom 2", roomType: "bedroom" },
            { id: "room-bed-3", name: "Bedroom 3", roomType: "bedroom" },
            { id: "room-living", name: "Living / Dining", roomType: "living" },
          ],
        },
      ],
    },
    addressBindings: [
      {
        id: "binding-810a-509",
        countryCode: "SG",
        addressNormalized: "810a chai chee street singapore",
        block: "810A",
        street: "Chai Chee Street",
        postalCode: "461810",
        stack: "509",
        floorMin: 2,
        floorMax: 15,
        transform: "mirror_x_rotate_90",
      },
      {
        id: "binding-811a-541",
        countryCode: "SG",
        addressNormalized: "811a chai chee street singapore",
        block: "811A",
        street: "Chai Chee Street",
        postalCode: null,
        stack: "541",
        floorMin: 2,
        floorMax: 15,
        transform: "rotate_90",
      },
    ],
  },
];

const exact = mapPublishedFloorPlanRevisionRows(revisionRows, {
  rawQuery: "810A Chai Chee St #12-509",
});
assert.equal(exact.length, 1);
assert.equal(exact[0].resultKind, "canonical_revision");
assert.equal(exact[0].revisionId, "ping-yi-4-room-r2");
assert.equal(exact[0].geometryHash, "a".repeat(64));
assert.equal(exact[0].verificationTier, "source_verified");
assert.equal(exact[0].addressTransform, "mirror_x_rotate_90");
assert.equal(exact[0].matchLevel, "unit");
assert.equal(exact[0].unitMatches[0].label, "#12-509");
assert.equal(exact[0].projectName, "Ping Yi Court");
assert.equal(exact[0].label, "4-room Type A");
assert.equal(exact[0].bedroomCount, 3);
assert.equal(exact[0].floorAreaSqm, 93);
assert.equal(exact[0].previewUrl, "/floor-plan-previews/ping-yi-4-room.webp");
assert.equal(exact[0].sourceUrl, "https://www.hdb.gov.sg/ping-yi-court");
assert.equal(exact[0].sourceTitle, "Ping Yi Court sales brochure");
assert.equal(exact[0].sourcePage, 5);
assert.equal(exact[0].publisher, "Housing and Development Board");
assert.equal(exact[0].revisionUrl, "/api/floor-plans/revisions/ping-yi-4-room-r2");
assert.equal("document" in exact[0], false, "search must not return the canonical document");
assert.equal(JSON.stringify(exact).includes(PRIVATE_ROOM_ID), false);
assert.equal(JSON.stringify(exact).includes(PRIVATE_ROOM_NAME), false);
assert.deepEqual(exact[0].roomLabels, [
  { id: "published-room-1", name: "Bedroom", roomType: "bedroom" },
  { id: "published-room-2", name: "Bedroom", roomType: "bedroom" },
  { id: "published-room-3", name: "Bedroom", roomType: "bedroom" },
  { id: "published-room-4", name: "Living Room", roomType: "living" },
]);

const addressOnly = mapPublishedFloorPlanRevisionRows([{
  ...revisionRows[0],
  id: "address-only-r1",
  addressBindings: [{
    id: "binding-address-only",
    countryCode: "SG",
    addressNormalized: "810A Chai Chee Street Singapore",
    block: "",
    street: "",
    postalCode: "460810",
    stack: null,
    floorMin: null,
    floorMax: null,
    transform: "normal",
  }],
}], { rawQuery: "810A Chai Chee Street" });
assert.equal(addressOnly.length, 1);
assert.equal(addressOnly[0].addressLabel, "810A Chai Chee Street Singapore, 460810");
assert.equal(addressOnly[0].matchLevel, "street");
assert.equal(addressOnly[0].unitMatches.length, 0);
assert.equal(mapPublishedFloorPlanRevisionRows([{
  ...revisionRows[0],
  id: "address-only-r1",
  addressBindings: addressOnly.length
    ? [{ ...addressOnly[0].addressBinding }]
    : [],
}], { rawQuery: "810A Chai Chee Street #12-509" }).length, 0);

const unsafeRoomTypeDocument = structuredClone(
  revisionRows[0].documentJson as Record<string, unknown>
);
(unsafeRoomTypeDocument.floors as Array<{ rooms: Array<{ roomType: string }> }>)[0]
  .rooms[0].roomType = "private_nursery";
assert.equal(
  mapPublishedFloorPlanRevisionRows(
    [{
      ...revisionRows[0],
      id: "unsafe-room-label-row",
      documentJson: unsafeRoomTypeDocument,
    }],
    { rawQuery: "810A Chai Chee St #12-509" }
  ).length,
  0,
  "Unknown semantic room types must fail closed instead of entering public search."
);

assert.equal(
  mapPublishedFloorPlanRevisionRows(
    [{ ...revisionRows[0], id: "missing-display-row", publicMetadata: null }],
    { rawQuery: "810A Chai Chee St #12-509" }
  ).length,
  0,
  "A published revision without separately approved display metadata must fail closed."
);
assert.equal(
  JSON.stringify(exact).includes("reviewerMetadata"),
  false,
  "Internal source-manifest display notes must never be projected into browse results."
);

assert.equal(
  mapPublishedFloorPlanRevisionRows(
    [{
      ...revisionRows[0],
      id: "unsafe-legacy-row",
      sourceManifestJson: {
        ...(revisionRows[0].sourceManifestJson as Record<string, unknown>),
        sourceInventory: { licenseStatus: "unknown" },
      },
    }],
    { rawQuery: "810A Chai Chee St #12-509" }
  ).length,
  0,
  "A published status without approved licence evidence must fail closed."
);

assert.equal(
  mapPublishedFloorPlanRevisionRows(revisionRows, {
    rawQuery: "810A Chai Chee St #16-509",
  }).length,
  0,
  "floor range must be enforced"
);
assert.equal(
  mapPublishedFloorPlanRevisionRows(revisionRows, {
    rawQuery: "810A Chai Chee St #12-527",
  }).length,
  0,
  "stack must be enforced"
);
assert.equal(
  mapPublishedFloorPlanRevisionRows(revisionRows, {
    rawQuery: "811A Chai Chee Street",
  })[0].addressTransform,
  "rotate_90"
);

const browsed = mapPublishedFloorPlanRevisionRows(revisionRows, {
  browse: true,
  limit: 10,
});
assert.equal(browsed.length, 2);
assert.equal(browsed[0].matchLevel, "street");

async function main() {
  let dataSourceInput: unknown = null;
  const revisionRepository = new PublishedRevisionFloorPlanCatalogRepository({
    async listPublishedRevisions(input) {
      dataSourceInput = input;
      const catalogKey = {
        publishedAt: new Date(revisionRows[0].publishedAt!).toISOString(),
        revisionId: revisionRows[0].id,
        bindingId: revisionRows[0].addressBindings[0].id,
      };
      return {
        rows: [{
          ...revisionRows[0],
          addressBindings: [revisionRows[0].addressBindings[0]],
          catalogKey,
        }],
        lastScannedKey: catalogKey,
        hasMore: false,
      };
    },
  });
  const repositoryExact = await revisionRepository.search(
    "810A Chai Chee Street #12-509",
    { limit: 2 }
  );
  assert.equal(repositoryExact.length, 1);
  assert.deepEqual(
    (dataSourceInput as { unitQuery: unknown }).unitQuery,
    { floor: 12, stack: "509", label: "#12-509" }
  );

  const pagedRows: PublishedFloorPlanRevisionRow[] = Array.from(
    { length: 126 },
    (_, index) => {
      const bindingId = `binding-${String(index).padStart(3, "0")}`;
      const catalogKey: PublishedFloorPlanCatalogKey = {
        publishedAt: "2026-07-16T00:00:00.000Z",
        revisionId: revisionRows[0].id,
        bindingId,
      };
      const sourceManifestJson = index === 63
        ? {
            ...(revisionRows[0].sourceManifestJson as Record<string, unknown>),
            sourceInventory: { licenseStatus: "unknown" },
          }
        : revisionRows[0].sourceManifestJson;
      return {
        ...revisionRows[0],
        sourceManifestJson,
        addressBindings: [{
          ...revisionRows[0].addressBindings[0],
          id: bindingId,
          stack: String(500 + index),
        }],
        catalogKey,
      };
    }
  );
  const scalableRepository = new PublishedRevisionFloorPlanCatalogRepository({
    async listPublishedRevisions(input) {
      const cursor = input.after;
      const start = cursor
        ? pagedRows.findIndex((row) =>
            row.catalogKey?.publishedAt === cursor.publishedAt &&
            row.catalogKey?.revisionId === cursor.revisionId &&
            row.catalogKey?.bindingId === cursor.bindingId
          ) + 1
        : 0;
      const scanned = pagedRows.slice(start, start + input.take);
      return {
        rows: scanned,
        lastScannedKey: scanned.at(-1)?.catalogKey ?? null,
        hasMore: start + scanned.length < pagedRows.length,
      };
    },
  });
  const collectedIds: string[] = [];
  let after: PublishedFloorPlanCatalogKey | null = null;
  do {
    const page = await scalableRepository.browsePage({ limit: 17, after });
    collectedIds.push(...page.results.map((result) => result.id));
    after = page.nextKey;
  } while (after);
  assert.equal(collectedIds.length, 125, "Keyset pagination must not retain a 100-result window.");
  assert.equal(new Set(collectedIds).size, 125, "Keyset pages must not duplicate bindings.");
  assert.equal(
    collectedIds.some((id) => id.endsWith("binding-063")),
    false,
    "An invalid publication-evidence row must fail closed without stopping later pages."
  );

  const cursorScope = { mode: "search" as const, query: "810A Chai Chee Street" };
  const cursorKey = pagedRows[20].catalogKey!;
  const opaqueCursor = encodeFloorPlanCatalogCursor(cursorKey, cursorScope);
  assert.doesNotMatch(opaqueCursor, /810A|Chai|offset:/i);
  assert.deepEqual(decodeFloorPlanCatalogCursor(opaqueCursor, cursorScope), cursorKey);
  assert.equal(
    decodeFloorPlanCatalogCursor(opaqueCursor, { ...cursorScope, query: "811A Chai Chee Street" }),
    null,
    "A search cursor must not be replayed against another address query."
  );
  assert.equal(
    decodeFloorPlanCatalogCursor(`${opaqueCursor.slice(0, -1)}x`, cursorScope),
    null,
    "Tampered cursors must fail closed."
  );

  const reviewOnlyYaml = new ReviewOnlyYamlFloorPlanCatalogRepository(
    getAllFloorPlanLibraryCatalogs
  );
  const reviewMatches = await reviewOnlyYaml.searchForReview(
    "810A Chai Chee Street #12-509"
  );
  assert.deepEqual(
    reviewMatches.map((result) => result.layoutId),
    ["3gen"],
    "Internal review must retain the corrected 810A stack 509 fixture mapping."
  );
  assert.deepEqual(
    (
      await reviewOnlyYaml.searchForReview("810A Chai Chee Street #12-527")
    ).map((result) => result.layoutId),
    ["3gen"],
    "Internal review must retain the corrected 810A stack 527 fixture mapping."
  );
  assert.equal((await reviewOnlyYaml.browseForReview()).length, 7);
  assert.equal(
    "search" in reviewOnlyYaml,
    false,
    "A review-only YAML repository must not implement the consumer repository surface."
  );

  const publicRoute = fs.readFileSync(
    path.join(process.cwd(), "app/api/floor-plans/route.ts"),
    "utf8"
  );
  assert.doesNotMatch(publicRoute, /YamlFloorPlanCatalogRepository|floor-plan-library-yaml/);
  assert.doesNotMatch(publicRoute, /serving the YAML library|YAML fallback/i);
  assert.match(
    publicRoute,
    /new PublishedRevisionFloorPlanCatalogRepository\([\s\S]*?prismaPublishedFloorPlanRevisionDataSource/,
    "Consumer search must be backed only by approved canonical database revisions."
  );
  assert.match(
    publicRoute,
    /"Cache-Control": "no-store, max-age=0"/,
    "Consumer search must not cache retired or corrected public floor-plan revisions."
  );
  assert.doesNotMatch(
    publicRoute,
    /stale-while-revalidate|"Cache-Control": "public/,
    "Consumer search must withdraw unsafe revisions immediately instead of serving stale results."
  );
  assert.doesNotMatch(publicRoute, /offset:|MAX_RESULT_WINDOW/);
  assert.match(publicRoute, /decodeFloorPlanCatalogCursor/);
  assert.match(publicRoute, /encodeFloorPlanCatalogCursor/);
  const consumerPicker = fs.readFileSync(
    path.join(process.cwd(), "components/editor/FloorPlanAddressSearch.tsx"),
    "utf8"
  );
  const consumerResults = fs.readFileSync(
    path.join(process.cwd(), "components/editor/FloorPlanCatalogResultList.tsx"),
    "utf8"
  );
  assert.doesNotMatch(
    consumerPicker,
    /onApplyPlanTemplate\(result\.template\)/,
    "The consumer picker must not retain a direct legacy YAML apply path."
  );
  assert.match(consumerPicker, /buildCanonicalFloorPlanTemplate/);
  assert.match(consumerResults, /Start a new design/);

  console.log("Floor-plan catalog repository checks passed.");
}

void main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
