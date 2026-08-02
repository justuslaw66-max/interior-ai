import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  compileFloorPlanDocumentV2,
} from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
} from "@/lib/floor-plan-document-v2";
import {
  buildPublicFloorPlanRevisionPayload,
  projectPublicFloorPlanDocumentV2,
} from "@/lib/floor-plan-imports/public-document";
import {
  assertPublicFloorPlanEntityIdsOpaque,
  FloorPlanPublicEntityIdError,
} from "@/lib/floor-plan-imports/public-entity-ids";
import { mapPublishedFloorPlanRevisionRows } from "@/lib/floor-plan-catalog-repository";
import {
  projectSharedDesignSnapshot,
  projectSharedStoredDesign,
} from "@/lib/shared-design-snapshot";
import {
  storedToSnapshot,
  type StoredDesign,
} from "@/lib/room-persistence";
import { buildDuplicatedDesignData } from "@/lib/design-duplication";

const PRIVATE_EMAIL = "private-admin@example.com";
const PRIVATE_FILE = "Justus-Home-810A-private.pdf";
const PRIVATE_URI = "s3://private-bucket/users/private-user/home.pdf";
const PRIVATE_NOTE = "Internal note: call the private homeowner before publishing.";
const PRIVATE_HASH = "f".repeat(64);
const PRIVATE_DOCUMENT_ID = "Justus-private-home-document";
const PRIVATE_FLOOR_NAME = "Justus private penthouse floor";
const PRIVATE_ROOM_NAME = "Justus secret nursery";
const PRIVATE_STRUCTURE_NAME = "Owner-only safe column";
const PRIVATE_ANNOTATION_TEXT = "Private family option: Justus office";
const PRIVATE_ROOM_TYPE = "justus_private_nursery";
const PRIVATE_ADDRESS = "810A Chai Chee Street #12-509 private home";
const PUBLIC_DISPLAY_METADATA = {
  projectName: "Public housing project",
  label: "Living layout",
  flatType: "Public flat",
  floorAreaSqm: 42,
  previewUrl: "/floor-plan-previews/public-revision.webp",
  sourceUrl: null,
  sourceTitle: null,
  sourcePage: null,
  publisher: "Public housing authority",
};

const provenance: FloorPlanEntityProvenanceV2 = {
  confidence: 0.99,
  extractionVersion: "private-extractor-build-1729",
  evidence: [{
    sourceId: "private-source-id",
    basis: "vector_traced",
    confidence: 0.99,
    extractorVersion: "private-extractor-build-1729",
    pageNumber: 1,
    cropPx: { xPx: 10, yPx: 10, widthPx: 400, heightPx: 300 },
    note: PRIVATE_NOTE,
  }],
  reviewHistory: [{
    id: "private-review-record",
    action: "approved",
    reviewerId: PRIVATE_EMAIL,
    reviewedAt: "2026-07-16T08:00:00.000Z",
    note: PRIVATE_NOTE,
  }],
};

const measured = (valueMm: number) => ({
  valueMm,
  evidence: "assumed" as const,
  provenance,
});

const document: FloorPlanDocumentV2 = {
  schemaVersion: 2,
  units: "mm",
  id: PRIVATE_DOCUMENT_ID,
  revisionId: "public-projection-home-r1",
  createdAt: "2026-07-16T07:00:00.000Z",
  verification: {
    tier: "source_verified",
    criticalIssueIds: [],
    approvedBy: PRIVATE_EMAIL,
    approvedAt: "2026-07-16T08:00:00.000Z",
  },
  sources: [{
    id: "private-source-id",
    kind: "pdf",
    name: PRIVATE_FILE,
    mimeType: "application/pdf",
    uri: PRIVATE_URI,
    sha256: PRIVATE_HASH,
    pageCount: 1,
  }],
  floors: [{
    id: "floor-1",
    name: PRIVATE_FLOOR_NAME,
    levelIndex: 0,
    elevationMm: 0,
    storeyHeightMm: 2800,
    slabThicknessMm: 150,
    defaults: {
      wallHeight: measured(2600),
      doorHeight: measured(2100),
      windowHeight: measured(1200),
      windowSillHeight: measured(900),
    },
    calibrations: [{
      id: "private-calibration-id",
      sourceId: "private-source-id",
      pageNumber: 1,
      imageWidthPx: 500,
      imageHeightPx: 400,
      controlPoints: [
        { sourcePx: { x: 10, y: 10 }, planMm: { xMm: 0, zMm: 0 } },
        { sourcePx: { x: 410, y: 10 }, planMm: { xMm: 4000, zMm: 0 } },
        { sourcePx: { x: 10, y: 310 }, planMm: { xMm: 0, zMm: 3000 } },
      ],
      rmsErrorPx: 0,
    }],
    vertices: [
      { id: "v1", xMm: 0, zMm: 0, provenance },
      { id: "v2", xMm: 4000, zMm: 0, provenance },
      { id: "v3", xMm: 4000, zMm: 3000, provenance },
      { id: "v4", xMm: 0, zMm: 3000, provenance },
    ],
    walls: [
      { id: "w1", path: { kind: "line", startVertexId: "v1", endVertexId: "v2" }, thicknessMm: 200, classification: "exterior", adjacentRoomIds: ["room-1"], provenance },
      { id: "w2", path: { kind: "line", startVertexId: "v2", endVertexId: "v3" }, thicknessMm: 200, classification: "exterior", adjacentRoomIds: ["room-1"], provenance },
      { id: "w3", path: { kind: "line", startVertexId: "v3", endVertexId: "v4" }, thicknessMm: 200, classification: "exterior", adjacentRoomIds: ["room-1"], provenance },
      { id: "w4", path: { kind: "line", startVertexId: "v4", endVertexId: "v1" }, thicknessMm: 200, classification: "exterior", adjacentRoomIds: ["room-1"], provenance },
    ],
    rooms: [{
      id: "room-1",
      name: PRIVATE_ROOM_NAME,
      roomType: "living",
      wallLoops: [{
        kind: "outer",
        walls: ["w1", "w2", "w3", "w4"].map((wallId) => ({
          wallId,
          direction: "forward" as const,
        })),
      }],
      provenance,
    }],
    openings: [{
      id: "door-1",
      wallId: "w1",
      kind: "door",
      operation: "swing",
      offsetMm: 1000,
      widthMm: 900,
      hinge: "start",
      handing: "left",
      provenance,
    }],
    structures: [{
      id: "structure-1",
      name: PRIVATE_STRUCTURE_NAME,
      kind: "other",
      vertexIds: ["v1", "v2", "v3", "v4"],
      baseOffsetMm: 0,
      heightMm: 100,
      locked: true,
      provenance,
    }],
    annotations: [
      {
        id: "annotation-1",
        kind: "note",
        text: PRIVATE_NOTE,
        geometry: { kind: "point", vertexId: "v1" },
        provenance,
      },
      {
        id: "annotation-2",
        kind: "label",
        text: PRIVATE_ANNOTATION_TEXT,
        geometry: { kind: "point", vertexId: "v2" },
        provenance,
      },
      {
        id: "annotation-3",
        kind: "suggested_room",
        text: PRIVATE_ANNOTATION_TEXT,
        geometry: { kind: "polygon", vertexIds: ["v1", "v2", "v3", "v4"] },
        configurationId: "suggested-room-option",
        provenance,
      },
      {
        id: "annotation-4",
        kind: "optional_partition",
        text: PRIVATE_ANNOTATION_TEXT,
        geometry: { kind: "wall_span", wallId: "w1", offsetMm: 100, widthMm: 500 },
        configurationId: "partition-option",
        provenance,
      },
    ],
    dimensions: [{
      id: "dimension-1",
      fromVertexId: "v1",
      toVertexId: "v2",
      axis: "horizontal",
      measuredMm: 4000,
      label: PRIVATE_NOTE,
      provenance,
    }],
  }],
};

const internal = compileFloorPlanDocumentV2(document);
const first = projectPublicFloorPlanDocumentV2(document, internal.geometryHash);
const second = projectPublicFloorPlanDocumentV2(document, internal.geometryHash);
assert.deepEqual(first, second, "The public projection must be deterministic");
assert.equal(compileFloorPlanDocumentV2(first).geometryHash, internal.geometryHash);
assert.equal(first.id, document.revisionId);
assert.equal(first.revisionId, document.revisionId);

const publishedLineageDocument = structuredClone(document);
publishedLineageDocument.parentRevisionId = "published-parent-r0";
assert.equal(
  projectPublicFloorPlanDocumentV2(publishedLineageDocument).parentRevisionId,
  "published-parent-r0",
  "Published revision projection must retain its stable public lineage"
);

const serialized = JSON.stringify(first);
for (const sentinel of [
  PRIVATE_EMAIL,
  PRIVATE_FILE,
  PRIVATE_URI,
  PRIVATE_NOTE,
  PRIVATE_HASH,
  "private-extractor-build-1729",
  "private-review-record",
  "private-source-id",
  "private-calibration-id",
  PRIVATE_DOCUMENT_ID,
  PRIVATE_FLOOR_NAME,
  PRIVATE_ROOM_NAME,
  PRIVATE_STRUCTURE_NAME,
  PRIVATE_ANNOTATION_TEXT,
]) {
  assert.equal(serialized.includes(sentinel), false, `Public document leaked ${sentinel}`);
}
assert.equal(first.sources[0].uri, undefined);
assert.equal(first.sources[0].sha256, undefined);
assert.equal(first.floors[0].name, "Level 1");
assert.equal(first.floors[0].rooms[0].name, "Living Room");
assert.equal(first.floors[0].rooms[0].roomType, "living");
assert.equal(first.floors[0].structures[0].name, "Structure");
assert.deepEqual(
  first.floors[0].annotations.map(({ id, kind, text, geometry }) => ({
    id,
    kind,
    text,
    geometry,
  })),
  [
    {
      id: "annotation-3",
      kind: "suggested_room",
      text: "Suggested Room",
      geometry: { kind: "polygon", vertexIds: ["v1", "v2", "v3", "v4"] },
    },
    {
      id: "annotation-4",
      kind: "optional_partition",
      text: "Optional Partition",
      geometry: { kind: "wall_span", wallId: "w1", offsetMm: 100, widthMm: 500 },
    },
  ],
  "Only source-supported option geometry may cross the public boundary"
);
assert.equal(
  first.floors[0].annotations[0].configurationId,
  "published-configuration-1-2"
);
assert.equal(
  first.floors[0].annotations[1].configurationId,
  "published-configuration-1-1"
);

const unsafeRoomTypeDocument = structuredClone(document);
unsafeRoomTypeDocument.floors[0].rooms[0].roomType = PRIVATE_ROOM_TYPE;
const unsafeRoomTypeError = assert.throws(
  () => projectPublicFloorPlanDocumentV2(unsafeRoomTypeDocument)
);
assert.equal(String(unsafeRoomTypeError).includes(PRIVATE_ROOM_TYPE), false);

const PRIVATE_ENTITY_ID = "private-owner-justus-entity";
const privateEntityIdMutations: Array<{
  collection: string;
  mutate: (candidate: FloorPlanDocumentV2) => void;
}> = [
  { collection: "floor", mutate: (candidate) => { candidate.floors[0].id = PRIVATE_ENTITY_ID; } },
  { collection: "vertex", mutate: (candidate) => { candidate.floors[0].vertices[0].id = PRIVATE_ENTITY_ID; } },
  { collection: "wall", mutate: (candidate) => { candidate.floors[0].walls[0].id = PRIVATE_ENTITY_ID; } },
  { collection: "room", mutate: (candidate) => { candidate.floors[0].rooms[0].id = PRIVATE_ENTITY_ID; } },
  { collection: "opening", mutate: (candidate) => { candidate.floors[0].openings[0].id = PRIVATE_ENTITY_ID; } },
  { collection: "structure", mutate: (candidate) => { candidate.floors[0].structures[0].id = PRIVATE_ENTITY_ID; } },
  { collection: "annotation", mutate: (candidate) => { candidate.floors[0].annotations[0].id = PRIVATE_ENTITY_ID; } },
  { collection: "dimension", mutate: (candidate) => { candidate.floors[0].dimensions[0].id = PRIVATE_ENTITY_ID; } },
];
for (const { collection, mutate } of privateEntityIdMutations) {
  const candidate = structuredClone(document);
  mutate(candidate);
  const cause = assert.throws(
    () => assertPublicFloorPlanEntityIdsOpaque(candidate),
    FloorPlanPublicEntityIdError,
    `${collection} IDs must be opaque before publication`
  );
  assert.equal(String(cause).includes(PRIVATE_ENTITY_ID), false);
}

const numericPrivateRoom = structuredClone(document);
numericPrivateRoom.floors[0].rooms[0].id = "room-8675309";
numericPrivateRoom.floors[0].rooms[0].name = "8675309";
assert.throws(
  () => assertPublicFloorPlanEntityIdsOpaque(numericPrivateRoom),
  FloorPlanPublicEntityIdError,
  "An ordinal-looking ID must still be rejected when it embeds a private room label"
);

const PRIVATE_UNDERLAY_URL = `data:image/png;base64,${Buffer.from(PRIVATE_NOTE).toString("base64")}`;
const PRIVATE_SOURCE_JOB_ID = "private-import-job-justus";
const privateImportDocument = structuredClone(document);
privateImportDocument.id = `import-${PRIVATE_SOURCE_JOB_ID}`;
privateImportDocument.revisionId = `candidate-${PRIVATE_SOURCE_JOB_ID}-1`;
privateImportDocument.parentRevisionId = `candidate-${PRIVATE_SOURCE_JOB_ID}-0`;
const sharedStoredDesign: StoredDesign = {
  version: 3,
  activeRoomId: "room-1",
  title: "Shared furnishing design",
  notes: "A deliberately shared design note",
  rooms: [{
    id: "room-1",
    name: "Shared Living Room",
    roomType: "living",
    geometry: { width: 4, depth: 3, height: 2.6 },
    surfaces: {},
    surfaceFinishes: {},
    items: [{
      instanceId: "shared-sofa",
      productId: "sofa-product",
      variantId: "sofa-variant",
      position: [0, 0, 0],
    }],
    zones: [{ id: "shared-zone", type: "seating", itemIds: ["shared-sofa"] }],
    savedViews: [{
      id: "shared-view",
      name: "Shared View",
      cameraPosition: [1, 2, 3],
      cameraTarget: [0, 0, 0],
    }],
  }],
  floorPlan: {
    underlay: {
      id: "private-underlay",
      floorId: "floor-1",
      name: PRIVATE_FILE,
      assetUrl: PRIVATE_UNDERLAY_URL,
      mimeType: "image/png",
      sourceMimeType: "application/pdf",
      sourceAssetSha256: PRIVATE_HASH,
      sourceJobId: PRIVATE_SOURCE_JOB_ID,
      position: { x: 0, z: 0 },
      widthMeters: 4,
      depthMeters: 3,
      opacity: 0.5,
      rotationDeg: 0,
      locked: true,
    },
    openings: [{
      id: "door-1",
      roomId: "room-1",
      wall: "north",
      offsetMm: 1000,
      widthMm: 900,
      kind: "door",
      doorStyle: "swing",
      canonicalWallId: "w1",
      operation: "swing",
      evidence: { height: "assumed", sillHeight: "user_confirmed" },
    }],
    fixedElements: [{
      id: "structure-1",
      kind: "reference_zone",
      xMm: 2000,
      zMm: 1500,
      widthMm: 4000,
      depthMm: 3000,
      rotationDeg: 0,
      label: PRIVATE_STRUCTURE_NAME,
      locked: true,
      canonicalKind: PRIVATE_ANNOTATION_TEXT,
    }],
    canonicalDocument: privateImportDocument,
    canonicalGeometryHash: internal.geometryHash,
    revisionId: PRIVATE_SOURCE_JOB_ID,
    sourceRevisionGeometryHash: PRIVATE_HASH,
    verificationTier: "source_verified",
    surfaceMigrationReviewIssues: [{
      code: "AMBIGUOUS_LEGACY_WALL_FACE",
      roomId: "room-1",
      faceId: "private-face",
      message: PRIVATE_NOTE,
    }],
    addressTransform: "normal",
    addressBinding: {
      bindingId: "private-binding",
      countryCode: "SG",
      addressNormalized: PRIVATE_ADDRESS,
      block: "810A",
      street: "Chai Chee Street",
      postalCode: null,
      stack: "509",
      floorMin: 2,
      floorMax: 15,
      transform: "normal",
      unitFloor: 12,
      unitStack: "509",
    },
    sourceJobId: PRIVATE_SOURCE_JOB_ID,
    sourceAssetSha256: PRIVATE_HASH,
    orientationConfirmed: true,
  },
};

const projectedStoredDesign = projectSharedStoredDesign(sharedStoredDesign);
assert.ok(projectedStoredDesign);
assert.equal(projectedStoredDesign.floorPlan?.underlay, undefined);
assert.equal(projectedStoredDesign.floorPlan?.sourceJobId, undefined);
assert.equal(projectedStoredDesign.floorPlan?.sourceAssetSha256, undefined);
assert.equal(projectedStoredDesign.floorPlan?.sourceRevisionGeometryHash, undefined);
assert.equal(projectedStoredDesign.floorPlan?.revisionId, undefined);
assert.equal(projectedStoredDesign.floorPlan?.surfaceMigrationReviewIssues, undefined);
assert.equal(projectedStoredDesign.floorPlan?.addressBinding, undefined);
assert.equal(projectedStoredDesign.floorPlan?.addressTransform, undefined);
assert.equal(projectedStoredDesign.floorPlan?.fixedElements?.[0].label, "Structure");
assert.equal(projectedStoredDesign.floorPlan?.fixedElements?.[0].canonicalKind, "other");
assert.equal(projectedStoredDesign.floorPlan?.openings?.[0].evidence, undefined);
assert.equal(
  projectedStoredDesign.floorPlan?.canonicalDocument?.id,
  `shared-floor-plan-${internal.geometryHash}`
);
assert.equal(
  projectedStoredDesign.floorPlan?.canonicalDocument?.revisionId,
  `shared-floor-plan-${internal.geometryHash}`
);
assert.equal(
  projectedStoredDesign.floorPlan?.canonicalDocument?.parentRevisionId,
  undefined
);
assert.equal(projectedStoredDesign.rooms[0].name, "Living Room");
assert.equal(projectedStoredDesign.rooms[0].floorLabel, "Level 1");
assert.deepEqual(projectedStoredDesign.rooms[0].items, sharedStoredDesign.rooms[0].items);
assert.deepEqual(projectedStoredDesign.rooms[0].surfaces, sharedStoredDesign.rooms[0].surfaces);
assert.deepEqual(projectedStoredDesign.rooms[0].savedViews, sharedStoredDesign.rooms[0].savedViews);
assert.notEqual(projectedStoredDesign.rooms[0].items, sharedStoredDesign.rooms[0].items);
assert.equal(
  compileFloorPlanDocumentV2(projectedStoredDesign.floorPlan!.canonicalDocument!).geometryHash,
  internal.geometryHash,
  "The share projection must remain renderable with identical canonical geometry"
);

const projectedSharedSnapshot = projectSharedDesignSnapshot(
  storedToSnapshot(sharedStoredDesign)
);
assert.equal(projectedSharedSnapshot.floorPlan?.underlay, undefined);
assert.deepEqual(projectedSharedSnapshot.rooms[0].items, sharedStoredDesign.rooms[0].items);
assert.deepEqual(projectedSharedSnapshot.rooms[0].savedViews, sharedStoredDesign.rooms[0].savedViews);

const serializedShared = JSON.stringify(projectedSharedSnapshot);
for (const sentinel of [
  PRIVATE_UNDERLAY_URL,
  PRIVATE_SOURCE_JOB_ID,
  PRIVATE_HASH,
  PRIVATE_FILE,
  PRIVATE_URI,
  PRIVATE_NOTE,
  PRIVATE_FLOOR_NAME,
  PRIVATE_ROOM_NAME,
  PRIVATE_STRUCTURE_NAME,
  PRIVATE_ANNOTATION_TEXT,
  PRIVATE_ADDRESS,
]) {
  assert.equal(serializedShared.includes(sentinel), false, `Shared snapshot leaked ${sentinel}`);
}

const duplicatedSharedDesign = buildDuplicatedDesignData(
  {
    title: "Shared furnishing design",
    roomWidth: 4,
    roomDepth: 3,
    items: [],
    snapshot: projectedStoredDesign,
    zones: [],
    savedViews: [],
    style: "modern",
    budget: "mid",
    mode: "homeowner",
    notes: "A deliberately shared design note",
  },
  "share-recipient"
);
assert.equal(
  JSON.stringify(duplicatedSharedDesign).includes(PRIVATE_SOURCE_JOB_ID),
  false,
  "A share recipient's copy must not inherit import provenance"
);
assert.equal(
  (duplicatedSharedDesign.items as Array<{ instanceId: string }>)[0].instanceId,
  "shared-sofa",
  "A projected shared design must remain duplication-compatible"
);

const payload = buildPublicFloorPlanRevisionPayload({
  id: document.revisionId,
  geometryHash: internal.geometryHash,
  verificationTier: "source_verified",
  publicationStatus: "published",
  publishedAt: "2026-07-16T09:00:00.000Z",
  documentJson: document,
  publicMetadata: PUBLIC_DISPLAY_METADATA,
  addressBindings: [{
    id: "binding-1",
    countryCode: "SG",
    addressNormalized: "810A Chai Chee Street",
    block: "810A",
    street: "Chai Chee Street",
    stack: "509",
    floorMin: 2,
    floorMax: 15,
    transform: "normal",
    sourceEvidenceJson: { note: PRIVATE_NOTE },
  } as never],
});
assert.equal(JSON.stringify(payload).includes(PRIVATE_NOTE), false);
assert.equal("sourceEvidenceJson" in payload.revision.addressBindings[0], false);

const searchResults = mapPublishedFloorPlanRevisionRows(
  [{
    id: document.revisionId,
    geometryHash: internal.geometryHash,
    verificationTier: "source_verified",
    publishedAt: "2026-07-16T09:00:00.000Z",
    documentJson: document,
    publicMetadata: PUBLIC_DISPLAY_METADATA,
    sourceManifestJson: {
      schemaVersion: 2,
      generatedAt: "2026-07-16T09:00:00.000Z",
      reviewerId: PRIVATE_EMAIL,
      geometryHash: internal.geometryHash,
      sources: [{ name: PRIVATE_FILE, uri: PRIVATE_URI, sha256: PRIVATE_HASH }],
      sourceInventory: {
        pageNumbers: [1],
        reviewerNotes: PRIVATE_NOTE,
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
          projectName: PRIVATE_NOTE,
          label: PRIVATE_NOTE,
          flatType: PRIVATE_NOTE,
          previewUrl: PRIVATE_URI,
          sourceUrl: PRIVATE_URI,
          sourceTitle: PRIVATE_FILE,
          publisher: PRIVATE_EMAIL,
        },
      },
      floors: [{
        labels: [{
          id: PRIVATE_DOCUMENT_ID,
          name: PRIVATE_ROOM_NAME,
          roomType: "living",
        }],
      }],
    },
    addressBindings: [{
      id: "binding-1",
      countryCode: "SG",
      addressNormalized: "810A Chai Chee Street",
      block: "810A",
      street: "Chai Chee Street",
      postalCode: null,
      stack: "509",
      floorMin: 2,
      floorMax: 15,
      transform: "normal",
    }],
  }],
  { rawQuery: "810A Chai Chee Street #12-509" }
);
assert.equal(searchResults.length, 1);
const serializedSearch = JSON.stringify(searchResults);
for (const sentinel of [
  PRIVATE_EMAIL,
  PRIVATE_FILE,
  PRIVATE_URI,
  PRIVATE_NOTE,
  PRIVATE_HASH,
  PRIVATE_DOCUMENT_ID,
  PRIVATE_ROOM_NAME,
]) {
  assert.equal(serializedSearch.includes(sentinel), false, `Search result leaked ${sentinel}`);
}
assert.deepEqual(searchResults[0].roomLabels, [{
  id: "published-room-1",
  name: "Living Room",
  roomType: "living",
}]);
assert.equal(searchResults[0].sourceUrl, null);
assert.equal(searchResults[0].sourceTitle, null);
assert.equal(searchResults[0].publisher, "Public housing authority");
assert.equal(searchResults[0].previewUrl, "/floor-plan-previews/public-revision.webp");

const route = fs.readFileSync(
  path.join(process.cwd(), "app/api/floor-plans/revisions/[id]/route.ts"),
  "utf8"
);
assert.match(route, /assessFloorPlanServingIntegrity/);
assert.match(route, /constructionEvidenceJson: true/);
assert.match(route, /contentDeletedAt: true/);
assert.match(route, /buildPublicFloorPlanRevisionPayload/);
assert.doesNotMatch(route, /NextResponse\.json\(\s*\{\s*revision\s*\}/);
assert.match(route, /export const dynamic = "force-dynamic"/);
assert.match(route, /export const revalidate = 0/);
assert.match(route, /SAFE_PUBLIC_REVISION_CACHE_CONTROL = "no-store, max-age=0"/);
assert.doesNotMatch(route, /stale-while-revalidate|"Cache-Control": "public/);
assert.match(
  route,
  /function notFound\(\)[\s\S]*?SAFE_PUBLIC_REVISION_CACHE_CONTROL/,
  "Missing or retired revisions must not leave a cacheable response behind."
);

for (const adminRoutePath of [
  "app/api/admin/floor-plan-imports/[id]/approve/route.ts",
  "app/api/admin/floor-plan-imports/[id]/publish/route.ts",
]) {
  const adminRoute = fs.readFileSync(path.join(process.cwd(), adminRoutePath), "utf8");
  assert.match(
    adminRoute,
    /assertPublicFloorPlanEntityIdsOpaque/,
    `${adminRoutePath} must fail closed on private or non-opaque canonical IDs`
  );
}

for (const sharePath of [
  "app/share/[shareToken]/page.tsx",
  "app/share/[shareToken]/export/page.tsx",
  "app/share/[shareToken]/export/pdf/route.ts",
]) {
  const shareSource = fs.readFileSync(path.join(process.cwd(), sharePath), "utf8");
  assert.match(
    shareSource,
    /projectSharedDesignSnapshot\(\s*legacyApiToSnapshot\(/,
    `${sharePath} must project the stored snapshot before rendering or export`
  );
}

const shareDuplicateRoute = fs.readFileSync(
  path.join(process.cwd(), "app/api/share/[shareToken]/duplicate/route.ts"),
  "utf8"
);
assert.match(
  shareDuplicateRoute,
  /snapshot:\s*projectSharedStoredDesign\(source\.snapshot\)/,
  "Share-token duplication must not inherit the owner's private floor-plan source"
);

const designRoute = fs.readFileSync(
  path.join(process.cwd(), "app/api/designs/[id]/route.ts"),
  "utf8"
);
assert.match(designRoute, /isOwner\s*\?\s*design\.snapshot \?\? null/);
assert.match(designRoute, /:\s*projectSharedStoredDesign\(design\.snapshot\)/);

console.log("Public floor-plan document projection checks passed.");
