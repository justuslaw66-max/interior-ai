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
  projectSharedDesignTransport,
  projectSharedStoredDesign,
} from "@/lib/shared-design-snapshot";
import { SHARED_DESIGN_PRESENTATION_LIMITS } from "@/lib/shared-design-projection-schema";
import {
  storedToSnapshot,
  type StoredDesign,
} from "@/lib/room-persistence";
import { buildDuplicatedDesignData } from "@/lib/design-duplication";
import { fingerprintDesignSnapshot } from "@/lib/snapshot-fingerprint";
import { buildPublicProjectionContentIdentity } from "@/lib/public-design-projection-identity";
import type { DesignSnapshot } from "@/lib/room-types";
import {
  fingerprintPublicDesignProjection,
  normalizePublicDesignProjection,
  parsePublicDesignProjection,
  publicDesignProjectionHasIdentity,
} from "../tests/e2e/public-projection-assertion";

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
  style: "modern",
  budget: "mid",
  notes: "A deliberately shared design note",
  rooms: [
    {
      id: "room-1",
      name: "Shared Living Room",
      roomType: "living",
      geometry: { width: 4, depth: 3, height: 2.6 },
      surfaces: { floorMaterialId: "public-oak" },
      surfaceFinishes: { floorMaterialId: "public-oak" },
      items: [
        {
          instanceId: "shared-sofa",
          productId: "sofa-product",
          variantId: "sofa-variant",
          productSnapshot: {
            schemaVersion: 1,
            productId: "sofa-product",
            variantId: "sofa-variant",
            name: "Shared Sofa",
            category: "sofa",
            dimensionsMm: { w: 2100, d: 950, h: 820 },
            variantLabel: "Natural linen",
            finish: { code: "linen-natural", label: "Natural linen" },
            assets: { materialPreset: "linen-natural" },
          },
          position: [-0.75, 0, 0.5],
          rotationY: 0.25,
          materialPreset: "linen-natural",
          releaseChecklistSnapshot: [{
            id: "release-check-1",
            phase: "design_approval",
            label: "Approve shared finish",
            owner: "designer",
            status: "required",
            dueBefore: "quote_request",
            notes: "Visible recipient approval role",
          }],
        },
        {
          instanceId: "shared-table",
          productId: "table-product",
          variantId: "table-oak",
          position: [0.8, 0, -0.4],
          rotationY: 1.57,
        },
      ],
      zones: [{
        id: "shared-zone",
        type: "seating",
        itemIds: ["shared-sofa", "shared-table"],
      }],
      savedViews: [{
        id: "shared-view",
        name: "Shared View",
        cameraPosition: [1, 2, 3],
        cameraTarget: [0, 0, 0],
      }],
    },
    {
      id: "room-2",
      name: "Dining Room",
      roomType: "dining",
      geometry: { width: 5, depth: 4, height: 2.7 },
      planPosition: { x: 5, z: 0 },
      surfaces: { floorMaterialId: "public-stone" },
      surfaceFinishes: { floorMaterialId: "public-stone" },
      items: [{
        instanceId: "shared-dining-table",
        productId: "dining-product",
        variantId: "dining-walnut",
        position: [5, 0, 0],
        rotationY: 0,
        materialPreset: "walnut",
      }],
      zones: [{
        id: "shared-dining-zone",
        type: "dining",
        itemIds: ["shared-dining-table"],
      }],
      savedViews: [{
        id: "shared-dining-view",
        name: "Dining View",
        cameraPosition: [5, 3, 4],
        cameraTarget: [5, 0, 0],
      }],
    },
  ],
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

const rawOuterInput = {
  id: "shared-design-1",
  title: "Divergent legacy title",
  roomWidth: 99,
  roomDepth: 98,
  items: [{
    instanceId: "legacy-private-item",
    productId: "legacy-private-product",
    variantId: "legacy-private-variant",
    position: [0, 0, 0],
    rotationY: 0,
  }],
  zones: [],
  savedViews: [],
  snapshot: sharedStoredDesign,
  style: "divergent-legacy-style",
  budget: "divergent-legacy-budget",
  mode: "homeowner",
  notes: "Divergent legacy notes",
} as const;
const projectedTransport = projectSharedDesignTransport(rawOuterInput);
assert.deepEqual(
  projectedTransport.snapshot,
  projectedStoredDesign,
  "A v3 public transport must use the projected snapshot as its content source"
);
assert.equal(projectedTransport.title, projectedStoredDesign.title);
assert.equal(projectedTransport.roomWidth, projectedStoredDesign.rooms[0].geometry.width);
assert.equal(projectedTransport.roomDepth, projectedStoredDesign.rooms[0].geometry.depth);
assert.deepEqual(projectedTransport.items, projectedStoredDesign.rooms[0].items);
assert.deepEqual(projectedTransport.zones, projectedStoredDesign.rooms[0].zones);
assert.deepEqual(projectedTransport.savedViews, projectedStoredDesign.rooms[0].savedViews);
assert.equal(projectedTransport.style, projectedStoredDesign.style);
assert.equal(projectedTransport.budget, projectedStoredDesign.budget);
assert.equal(projectedTransport.notes, projectedStoredDesign.notes);
for (const rawOuterValue of [
  rawOuterInput.title,
  rawOuterInput.style,
  rawOuterInput.budget,
  rawOuterInput.notes,
]) {
  assert.equal(
    JSON.stringify(projectedTransport).includes(rawOuterValue),
    false,
    `A divergent raw outer value must not enter the public transport: ${rawOuterValue}`
  );
}

const RAW_OUTER_PRIVATE_SENTINEL = "PRIVATE RAW OUTER NOTES MUST NEVER BE PUBLIC";
const changedPrivateOuterInput = {
  ...rawOuterInput,
  notes: RAW_OUTER_PRIVATE_SENTINEL,
  unknownOuterPresentationField: RAW_OUTER_PRIVATE_SENTINEL,
};
const changedPrivateOuterTransport = projectSharedDesignTransport(changedPrivateOuterInput);
assert.deepEqual(
  changedPrivateOuterTransport,
  projectedTransport,
  "Raw private or unknown outer fields must not change a valid v3 public transport"
);
assert.equal(
  fingerprintPublicDesignProjection(storedToSnapshot(changedPrivateOuterTransport.snapshot)),
  fingerprintPublicDesignProjection(storedToSnapshot(projectedTransport.snapshot)),
  "Raw private outer changes must not change the public fingerprint"
);
assert.equal(
  JSON.stringify(changedPrivateOuterTransport).includes(RAW_OUTER_PRIVATE_SENTINEL),
  false,
  "A raw private outer sentinel must not be serialized by the public transport"
);

const olderV3Snapshot = structuredClone(sharedStoredDesign);
delete olderV3Snapshot.title;
delete olderV3Snapshot.style;
delete olderV3Snapshot.budget;
delete olderV3Snapshot.notes;
const olderV3Transport = projectSharedDesignTransport({
  ...rawOuterInput,
  snapshot: olderV3Snapshot,
  title: "Legacy-column public title",
  style: "legacy-column-public-style",
  budget: "luxury",
  notes: "Legacy-column public notes",
});
assert.equal(olderV3Transport.snapshot.title, "Legacy-column public title");
assert.equal(olderV3Transport.snapshot.style, "legacy-column-public-style");
assert.equal(olderV3Transport.snapshot.budget, "luxury");
assert.equal(olderV3Transport.snapshot.notes, "Legacy-column public notes");
assert.equal(olderV3Transport.title, olderV3Transport.snapshot.title);
assert.equal(olderV3Transport.style, olderV3Transport.snapshot.style);
assert.equal(olderV3Transport.budget, olderV3Transport.snapshot.budget);
assert.equal(olderV3Transport.notes, olderV3Transport.snapshot.notes);

const missingLegacyPresentationTransport = projectSharedDesignTransport({
  ...rawOuterInput,
  snapshot: olderV3Snapshot,
  title: null,
  style: null,
  budget: null,
  notes: null,
});
assert.equal(missingLegacyPresentationTransport.title, "Untitled Living Room");
assert.equal(missingLegacyPresentationTransport.style, null);
assert.equal(missingLegacyPresentationTransport.budget, null);
assert.equal(missingLegacyPresentationTransport.notes, null);

const legacyTransport = projectSharedDesignTransport({
  id: "legacy-shared-design",
  title: "Legacy shared room",
  roomWidth: 6,
  roomDepth: 4,
  items: [{ id: "sofa-1", type: "sofa", x: 1, y: 1, width: 2, depth: 1 }],
  zones: [{ id: "zone-1", name: "Conversation", itemIds: ["sofa-1"] }],
  savedViews: [{ id: "view-1", name: "Client Preview", mode: "3d" }],
  style: "legacy-public-style",
  budget: "$$",
  mode: "homeowner",
  notes: "Legacy public notes",
});
assert.ok(
  projectSharedStoredDesign(legacyTransport.snapshot),
  "A no-snapshot legacy row must become a valid public v3 snapshot"
);
assert.deepEqual(
  legacyTransport.items[0],
  {
    id: "sofa-1",
    type: "sofa",
    x: 1,
    y: 1,
    width: 2,
    depth: 1,
    instanceId: "sofa-1",
    productId: "sofa",
    variantId: "legacy",
    position: [1, 0, 1],
    rotationY: 0,
  },
  "Known legacy public fields must be preserved while required v3 identity is added"
);
assert.equal((legacyTransport.zones[0] as unknown as { name?: string }).name, "Conversation");
assert.equal((legacyTransport.savedViews[0] as unknown as { mode?: string }).mode, "3d");
assert.equal(legacyTransport.snapshot.title, "Legacy shared room");
assert.equal(legacyTransport.snapshot.style, "legacy-public-style");
assert.equal(legacyTransport.snapshot.budget, "$$");
assert.equal(legacyTransport.snapshot.notes, "Legacy public notes");
assert.equal(legacyTransport.title, legacyTransport.snapshot.title);
assert.equal(legacyTransport.style, legacyTransport.snapshot.style);
assert.equal(legacyTransport.budget, legacyTransport.snapshot.budget);
assert.equal(legacyTransport.notes, legacyTransport.snapshot.notes);

const rootExtension = structuredClone(sharedStoredDesign);
rootExtension.secret = "private-root-sentinel";
assert.throws(
  () => projectSharedStoredDesign(rootExtension),
  /undeclared field snapshot.secret/,
  "Unknown root fields must fail closed before a public projection is returned"
);
const invalidPublicTitle = structuredClone(sharedStoredDesign) as unknown as Record<
  string,
  unknown
>;
invalidPublicTitle.title = 42;
assert.throws(
  () => projectSharedStoredDesign(invalidPublicTitle),
  /snapshot\.title.*string.*120/i,
  "Public title must retain its exact bounded string contract"
);
const oversizedPublicStyle = structuredClone(sharedStoredDesign);
oversizedPublicStyle.style = "s".repeat(
  SHARED_DESIGN_PRESENTATION_LIMITS.style + 1
);
assert.throws(
  () => projectSharedStoredDesign(oversizedPublicStyle),
  /snapshot\.style.*string.*80/i,
  "Public style must fail closed above its declared limit"
);
const invalidPublicBudget = structuredClone(sharedStoredDesign);
invalidPublicBudget.budget = "premium-plus";
assert.throws(
  () => projectSharedStoredDesign(invalidPublicBudget),
  /snapshot\.budget.*declared public budget category/i,
  "Public budget must be one of the declared canonical or legacy categories"
);
const oversizedPublicNotes = structuredClone(sharedStoredDesign);
oversizedPublicNotes.notes = "n".repeat(
  SHARED_DESIGN_PRESENTATION_LIMITS.notes + 1
);
assert.throws(
  () => projectSharedStoredDesign(oversizedPublicNotes),
  /snapshot\.notes.*string.*20000/i,
  "Public notes must fail closed above the persisted notes limit"
);
const roomExtension = structuredClone(sharedStoredDesign);
roomExtension.rooms[0].diagnosticBlob = "private-room-sentinel";
assert.throws(
  () => projectSharedStoredDesign(roomExtension),
  /undeclared field snapshot.rooms\[0\]\.diagnosticBlob/,
  "Unknown room fields must fail closed before a public projection is returned"
);
const itemExtension = structuredClone(sharedStoredDesign);
Object.assign(itemExtension.rooms[0].items[0], {
  ownerInternalState: "private-item-sentinel",
});
assert.throws(
  () => projectSharedStoredDesign(itemExtension),
  /undeclared field snapshot.rooms\[0\]\.items\[0\]\.ownerInternalState/,
  "Unknown item fields must fail closed before a public projection is returned"
);
const draftItemExtension = structuredClone(sharedStoredDesign);
Object.assign(draftItemExtension.rooms[0].items[0], {
  publicationStatus: "draft",
});
assert.throws(
  () => projectSharedStoredDesign(draftItemExtension),
  /undeclared field snapshot.rooms\[0\]\.items\[0\]\.publicationStatus/,
  "An invented per-item draft lifecycle must fail closed instead of leaking publicly"
);
for (const nestedSensitiveKey of [
  "AddressBinding",
  "ReviewerID",
  "SHA256",
  "URI",
  "adminData",
  "authData",
  "userEmail",
  "authenticationData",
  "apiKeyValue",
  "administratorEmail",
  "ownerData",
  "sessionId",
]) {
  const nestedSensitiveExtension = structuredClone(sharedStoredDesign);
  Object.assign(
    nestedSensitiveExtension.rooms[0].items[0].productSnapshot!,
    { [nestedSensitiveKey]: `private-${nestedSensitiveKey}` }
  );
  assert.throws(
    () => projectSharedStoredDesign(nestedSensitiveExtension),
    new RegExp(`${nestedSensitiveKey}$`),
    `Nested sensitive field ${nestedSensitiveKey} must fail closed`
  );
}

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

assert.deepEqual(projectedSharedSnapshot.rooms[0].zones, sharedStoredDesign.rooms[0].zones);
assert.deepEqual(projectedSharedSnapshot.rooms[1].items, sharedStoredDesign.rooms[1].items);
assert.deepEqual(projectedSharedSnapshot.rooms[1].surfaces, sharedStoredDesign.rooms[1].surfaces);
assert.equal(projectedSharedSnapshot.rooms[1].name, "Dining Room");
assert.equal(projectedSharedSnapshot.rooms[0].items[0].variantId, "sofa-variant");
assert.deepEqual(
  projectedSharedSnapshot.rooms[0].items[0].productSnapshot?.dimensionsMm,
  { w: 2100, d: 950, h: 820 }
);
assert.deepEqual(projectedSharedSnapshot.rooms[0].items[0].position, [-0.75, 0, 0.5]);
assert.equal(projectedSharedSnapshot.rooms[0].items[0].rotationY, 0.25);
assert.equal(projectedSharedSnapshot.rooms[0].items[0].materialPreset, "linen-natural");
assert.equal(
  projectedSharedSnapshot.rooms[0].items[0].releaseChecklistSnapshot?.[0].owner,
  "designer",
  "A typed public cabinetry responsibility role must survive projection"
);
assert.equal(projectedSharedSnapshot.floorPlan?.fixedElements?.[0].rotationDeg, 0);

const sharedPublicFingerprint = fingerprintPublicDesignProjection(
  storedToSnapshot(sharedStoredDesign)
);
const sharedPublicContentIdentity = buildPublicProjectionContentIdentity(
  projectedSharedSnapshot
);
const changedPrivateOwnerSnapshot = structuredClone(sharedStoredDesign);
changedPrivateOwnerSnapshot.floorPlan!.sourceJobId = "different-private-job";
changedPrivateOwnerSnapshot.floorPlan!.sourceAssetSha256 = "a".repeat(64);
changedPrivateOwnerSnapshot.floorPlan!.underlay!.name = "different-private-file.pdf";
changedPrivateOwnerSnapshot.floorPlan!.openings![0].evidence = {
  height: "user_confirmed",
  sillHeight: "assumed",
};
assert.equal(
  fingerprintPublicDesignProjection(storedToSnapshot(changedPrivateOwnerSnapshot)),
  sharedPublicFingerprint,
  "Owner-only import metadata must not change the public projection fingerprint"
);
assert.equal(
  buildPublicProjectionContentIdentity(
    projectSharedDesignSnapshot(storedToSnapshot(changedPrivateOwnerSnapshot))
  ),
  sharedPublicContentIdentity,
  "Owner-only import metadata must not change public correctness identity"
);

const publicFingerprintMutations: Array<{
  label: string;
  mutate: (snapshot: DesignSnapshot) => void;
}> = [
  {
    label: "design title",
    mutate: (snapshot) => { snapshot.title = "Public client presentation"; },
  },
  {
    label: "design style",
    mutate: (snapshot) => { snapshot.style = "scandinavian"; },
  },
  {
    label: "design budget",
    mutate: (snapshot) => { snapshot.budget = "luxury"; },
  },
  {
    label: "public design notes",
    mutate: (snapshot) => { snapshot.notes = "Updated public handoff note"; },
  },
  {
    label: "room name",
    mutate: (snapshot) => { snapshot.rooms[1].name = "Dining Gallery"; },
  },
  {
    label: "room dimensions",
    mutate: (snapshot) => { snapshot.rooms[1].geometry.width = 5.5; },
  },
  {
    label: "item XZ position",
    mutate: (snapshot) => { snapshot.rooms[0].items[0].position = [-1, 0, 0.75]; },
  },
  {
    label: "item rotation",
    mutate: (snapshot) => { snapshot.rooms[0].items[0].rotationY = 0.5; },
  },
  {
    label: "selected variant",
    mutate: (snapshot) => {
      snapshot.rooms[0].items[0].variantId = "sofa-variant-blue";
      snapshot.rooms[0].items[0].productSnapshot!.variantId = "sofa-variant-blue";
    },
  },
  {
    label: "product dimensions",
    mutate: (snapshot) => { snapshot.rooms[0].items[0].productSnapshot!.dimensionsMm.w = 2200; },
  },
  {
    label: "material identity",
    mutate: (snapshot) => { snapshot.rooms[0].items[0].materialPreset = "linen-blue"; },
  },
  {
    label: "surface material",
    mutate: (snapshot) => {
      snapshot.rooms[0].surfaces!.floorMaterialId = "public-walnut";
      snapshot.rooms[0].surfaceFinishes!.floorMaterialId = "public-walnut";
    },
  },
  {
    label: "canonical rotationDeg",
    mutate: (snapshot) => { snapshot.floorPlan!.fixedElements![0].rotationDeg = 90; },
  },
];
for (const { label, mutate } of publicFingerprintMutations) {
  const changed = storedToSnapshot(structuredClone(sharedStoredDesign));
  mutate(changed);
  assert.notEqual(
    fingerprintPublicDesignProjection(changed),
    sharedPublicFingerprint,
    `${label} must change the public projection fingerprint`
  );
  assert.notEqual(
    buildPublicProjectionContentIdentity(projectSharedDesignSnapshot(changed)),
    sharedPublicContentIdentity,
    `${label} must change the collision-resistant public content identity`
  );
}

const reorderedOwnerSnapshot = storedToSnapshot(structuredClone(sharedStoredDesign));
reorderedOwnerSnapshot.rooms.reverse();
for (const room of reorderedOwnerSnapshot.rooms) {
  room.items.reverse();
  room.zones.reverse();
  room.zones.forEach((zone) => zone.itemIds.reverse());
  room.savedViews.reverse();
}
assert.equal(
  fingerprintPublicDesignProjection(reorderedOwnerSnapshot),
  sharedPublicFingerprint,
  "Equivalent room, item, zone, and saved-view ordering must normalize identically"
);
assert.equal(
  buildPublicProjectionContentIdentity(
    projectSharedDesignSnapshot(reorderedOwnerSnapshot)
  ),
  sharedPublicContentIdentity,
  "Equivalent public collection ordering must keep one content identity"
);
assert.notEqual(
  fingerprintDesignSnapshot(projectSharedDesignSnapshot(reorderedOwnerSnapshot)),
  fingerprintDesignSnapshot(projectedSharedSnapshot),
  "The public assertion must not rely on the generic order-sensitive design fingerprint"
);

const normalizedProjection = normalizePublicDesignProjection(
  storedToSnapshot(sharedStoredDesign)
);
assert.deepEqual(normalizedProjection.rooms.map((room) => room.id), ["room-1", "room-2"]);
assert.deepEqual(
  normalizedProjection.rooms[0].items.map((item) => item.instanceId),
  ["shared-sofa", "shared-table"]
);

const fixedRevision = "2026-08-05T04:00:00.000Z";
const publicResponseBody = {
  id: "shared-design-1",
  title: "Shared furnishing design",
  roomWidth: 4,
  roomDepth: 3,
  items: projectedStoredDesign.rooms[0].items,
  snapshot: projectedStoredDesign,
  zones: projectedStoredDesign.rooms[0].zones,
  savedViews: projectedStoredDesign.rooms[0].savedViews,
  style: "modern",
  budget: "mid",
  mode: "homeowner",
  notes: "A deliberately shared design note",
  updatedAt: fixedRevision,
  shareToken: null,
  shareEnabled: true,
};
const parsedPublicResponse = parsePublicDesignProjection(
  publicResponseBody,
  "shared-design-1"
);
const parsedLegacyResponse = parsePublicDesignProjection({
  id: "legacy-shared-design",
  title: legacyTransport.title,
  roomWidth: legacyTransport.roomWidth,
  roomDepth: legacyTransport.roomDepth,
  items: legacyTransport.items,
  snapshot: legacyTransport.snapshot,
  zones: legacyTransport.zones,
  savedViews: legacyTransport.savedViews,
  style: legacyTransport.style,
  budget: legacyTransport.budget,
  mode: legacyTransport.mode,
  notes: legacyTransport.notes,
  updatedAt: fixedRevision,
  shareToken: null,
  shareEnabled: true,
}, "legacy-shared-design");
assert.equal(parsedLegacyResponse.snapshot.rooms[0].items[0].instanceId, "sofa-1");
assert.equal(
  publicDesignProjectionHasIdentity(parsedPublicResponse, {
    designId: "shared-design-1",
    revision: fixedRevision,
  }),
  true
);
assert.equal(
  publicDesignProjectionHasIdentity(parsedPublicResponse, {
    designId: "shared-design-1",
    revision: "2026-08-05T03:59:59.000Z",
  }),
  false,
  "A stale shared revision must not compare as the current projection identity"
);
assert.equal(
  publicDesignProjectionHasIdentity(parsedPublicResponse, {
    designId: "different-design",
    revision: fixedRevision,
  }),
  false,
  "A different design must not compare as the current projection identity"
);
assert.throws(
  () => parsePublicDesignProjection({ ...publicResponseBody, snapshot: null }, "shared-design-1"),
  /valid v3 public snapshot is required/,
  "Missing required public snapshot data must fail closed"
);
assert.throws(
  () => parsePublicDesignProjection(
    { ...publicResponseBody, ownerUserId: "private-owner" },
    "shared-design-1"
  ),
  /response fields were/,
  "Unexpected sensitive response fields must be detected rather than picked away"
);
assert.throws(
  () => parsePublicDesignProjection(
    { ...publicResponseBody, title: "Divergent public title" },
    "shared-design-1"
  ),
  /title did not match the public snapshot/,
  "The outer title must be bound to the projected snapshot"
);
assert.throws(
  () => parsePublicDesignProjection(
    { ...publicResponseBody, roomWidth: 99 },
    "shared-design-1"
  ),
  /roomWidth did not match the active public room/,
  "The outer dimensions must be bound to the projected active room"
);
assert.throws(
  () => parsePublicDesignProjection(
    { ...publicResponseBody, items: [{ ownerInternalState: "private-item" }] },
    "shared-design-1"
  ),
  /items did not match the public snapshot/,
  "Raw outer items must not bypass the projected active room"
);
const unexpectedSensitiveSnapshot: DesignSnapshot & { ownerInternalState: string } = {
  ...storedToSnapshot(sharedStoredDesign),
  ownerInternalState: "private-owner-state",
};
assert.throws(
  () => fingerprintPublicDesignProjection(unexpectedSensitiveSnapshot),
  /undeclared field snapshot.ownerInternalState/,
  "Unexpected sensitive snapshot fields must fail the fingerprint assertion"
);
assert.throws(
  () => buildPublicProjectionContentIdentity(unexpectedSensitiveSnapshot),
  /undeclared field snapshot.ownerInternalState/,
  "Unexpected sensitive snapshot fields must fail closed before identity"
);

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
const duplicatedLegacyDesign = buildDuplicatedDesignData(
  legacyTransport,
  "legacy-share-recipient"
);
assert.equal(
  (duplicatedLegacyDesign.items as Array<{ instanceId: string }>)[0].instanceId,
  "sofa-1",
  "A normalized legacy public transport must remain duplication-compatible"
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
  "app/share/[shareToken]/(presentation)/page.tsx",
  "app/share/[shareToken]/export/page.tsx",
  "app/share/[shareToken]/export/pdf/route.ts",
]) {
  const shareSource = fs.readFileSync(path.join(process.cwd(), sharePath), "utf8");
  assert.match(
    shareSource,
    /const publicDesign = projectSharedDesignTransport\(design\)/,
    `${sharePath} must create one canonical public transport before rendering or export`
  );
  assert.match(shareSource, /storedToSnapshot\(publicDesign\.snapshot\)/);
  assert.doesNotMatch(
    shareSource,
    /\bdesign\.(?:title|style|budget|notes|createdAt)\b/,
    `${sharePath} must not render a raw outer presentation field`
  );
  assert.doesNotMatch(
    shareSource,
    /createdAt:\s*true|\b(?:name|email):\s*true/,
    `${sharePath} must not select owner identity or row-created metadata for anonymous presentation`
  );
}

const sharePageSource = fs.readFileSync(
  path.join(process.cwd(), "app/share/[shareToken]/(presentation)/page.tsx"),
  "utf8"
);
assert.match(sharePageSource, /export const metadata = \{[\s\S]*?robots:/);
assert.doesNotMatch(
  sharePageSource,
  /generateMetadata/,
  "Share page metadata must remain static instead of opening a second raw presentation lookup"
);

const shareDuplicateRoute = fs.readFileSync(
  path.join(process.cwd(), "app/api/share/[shareToken]/duplicate/route.ts"),
  "utf8"
);
assert.match(
  shareDuplicateRoute,
  /buildDuplicatedDesignData\(projectedSource, userId\)/,
  "Share-token duplication must not inherit the owner's private floor-plan source"
);
assert.match(shareDuplicateRoute, /projectSharedDesignTransport\(source\)/);
assert.match(shareDuplicateRoute, /style:\s*projectedSource\.style/);
assert.match(shareDuplicateRoute, /budget:\s*projectedSource\.budget/);
assert.doesNotMatch(shareDuplicateRoute, /style:\s*source\.style|budget:\s*source\.budget/);

const designRoute = fs.readFileSync(
  path.join(process.cwd(), "app/api/designs/[id]/route.ts"),
  "utf8"
);
assert.match(designRoute, /projectSharedDesignTransport\(design\)/);
assert.match(designRoute, /const responseContent = sharedProjection \?\?/);
assert.match(designRoute, /\.\.\.responseContent/);

console.log("Public floor-plan document projection checks passed.");
