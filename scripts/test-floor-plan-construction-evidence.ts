import assert from "node:assert/strict";
import {
  assertFloorPlanConstructionEvidence,
  collectConstructionCriticalEntityIds,
  collectConstructionCriticalPositionClaims,
  collectConstructionCriticalScalarClaims,
  type FloorPlanConstructionEvidenceContext,
} from "@/lib/floor-plan-imports/construction-evidence";
import { collectFloorPlanConstructionVerticalProperties } from "@/lib/floor-plan-imports/construction-vertical-evidence";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanEvidenceBasisV2,
  FloorPlanPropertyEvidenceV2,
} from "@/lib/floor-plan-document-v2";
import { catalogV1ToFloorPlanDocumentV2Fixtures } from "@/lib/floor-plan-catalog-v1-adapter";
import { getAllFloorPlanLibraryCatalogs } from "@/lib/floor-plan-library-yaml";

const catalog = getAllFloorPlanLibraryCatalogs()[0];
assert.ok(catalog, "Expected a floor-plan catalog fixture.");
const fixture = catalogV1ToFloorPlanDocumentV2Fixtures(catalog)[0];
assert.ok(fixture, "Expected a canonical floor-plan fixture.");
const document = structuredClone(fixture.document);
document.sources.push({
  id: "construction-source-asset",
  kind: "as_built",
  name: "Signed as-built source",
  mimeType: "application/pdf",
  sha256: "a".repeat(64),
  pageCount: 1,
});

function bindVerticalClaims(input: {
  document: FloorPlanDocumentV2;
  sourceId: string;
  basis: Extract<FloorPlanEvidenceBasisV2, "as_built" | "site_measured">;
  evidence: Extract<FloorPlanPropertyEvidenceV2, "source_documented" | "site_measured">;
}) {
  const evidenceEntry = {
    sourceId: input.sourceId,
    basis: input.basis,
    confidence: 1,
    extractorVersion: "construction-evidence-test-v1",
    note: "Directly reviewed against the unit-specific construction source.",
  };
  const bindProvenance = (property: {
    evidence: FloorPlanPropertyEvidenceV2;
    provenance: FloorPlanEntityProvenanceV2;
  }) => {
    property.evidence = input.evidence;
    property.provenance.evidence = [
      ...property.provenance.evidence.filter(
        (entry) => entry.sourceId !== input.sourceId
      ),
      evidenceEntry,
    ];
  };

  for (const floor of input.document.floors) {
    assert.ok(floor.verticalEvidence, "Vertical evidence fixture should be present.");
    bindProvenance(floor.verticalEvidence.elevation);
    bindProvenance(floor.verticalEvidence.storeyHeight);
    bindProvenance(floor.verticalEvidence.slabThickness);
    Object.values(floor.defaults).forEach(bindProvenance);
    for (const wall of floor.walls) {
      wall.baseOffsetEvidence = input.evidence;
      if (wall.heightMm !== undefined) wall.heightEvidence = input.evidence;
    }
    for (const opening of floor.openings) {
      if (opening.heightMm !== undefined) {
        opening.heightEvidence = input.evidence;
      }
      if (opening.sillHeightMm !== undefined) {
        opening.sillHeightEvidence = input.evidence;
      }
      // Property labels are explicit, but entity provenance deliberately
      // cannot satisfy either sibling numeric property.
    }
    for (const structure of floor.structures) {
      structure.baseOffsetEvidence = input.evidence;
      structure.heightEvidence = input.evidence;
    }
  }
}

bindVerticalClaims({
  document,
  sourceId: "construction-source-asset",
  basis: "as_built",
  evidence: "source_documented",
});
const criticalIds = collectConstructionCriticalEntityIds(document);
assert.ok(criticalIds.length > 0);
const durableSource = document.sources.find(
  (source) => source.id === "construction-source-asset"
);
assert.ok(durableSource?.sha256);
const evidenceContext: FloorPlanConstructionEvidenceContext = {
  durableSources: [
    {
      id: durableSource.id,
      sha256: durableSource.sha256,
      mimeType: durableSource.mimeType,
      evidenceKind: "as_built",
      authorizedAt: new Date("2026-07-17T00:00:00.000Z"),
      authorizedBy: "reviewer@example.com",
      contentDeletedAt: null,
    },
  ],
  addressBindings: [
    {
      countryCode: "SG",
      addressNormalized: "810A CHAI CHEE STREET",
      block: "810A",
      street: "Chai Chee Street",
      postalCode: null,
      stack: "509",
      floorMin: 12,
      floorMax: 12,
      transform: "normal",
    },
  ],
};
const validate = (
  value: unknown,
  context = evidenceContext
) => assertFloorPlanConstructionEvidence(document, value, context);

const baseEvidence = {
  schemaVersion: 1 as const,
  kind: "as_built" as const,
  unit: {
    address: "810A Chai Chee Street",
    countryCode: "SG",
    block: "810A",
    street: "Chai Chee Street",
    stack: "509",
    floor: 12,
  },
  source: {
    assetId: durableSource.id,
    name: "Unit-specific as-built plan",
    sha256: durableSource.sha256,
    mimeType: durableSource.mimeType,
    issuer: "Registered surveyor",
  },
  confirmedEntityIds: criticalIds,
  measurements: [
    ...collectConstructionCriticalPositionClaims(document).map((claim) => ({
      entityId: claim.entityId,
      property: "position" as const,
      coordinatesMm: claim.coordinatesMm,
      measuredBy: "Registered surveyor",
      measuredAt: "2026-07-17T00:00:00.000Z",
    })),
    ...collectConstructionCriticalScalarClaims(document).map((claim) => ({
      entityId: claim.entityId,
      property: claim.property,
      valueMm: claim.valueMm,
      measuredBy: "Registered surveyor",
      measuredAt: "2026-07-17T00:00:00.000Z",
    })),
    ...collectFloorPlanConstructionVerticalProperties(document).map(
      (property) => ({
        entityId: property.id,
        property: property.property,
        valueMm: property.valueMm,
        measuredBy: "Registered surveyor",
        measuredAt: "2026-07-17T00:00:00.000Z",
      })
    ),
  ],
  reviewerNotes: "Matched each canonical geometry entity to the signed as-built plan.",
};

assert.equal(
  validate(baseEvidence).kind,
  "as_built"
);

assert.throws(
  () =>
    validate({
      ...baseEvidence,
      measurements: baseEvidence.measurements.filter(
        (measurement) =>
          measurement.property !== "position" &&
          measurement.property !== "thickness" &&
          measurement.property !== "width" &&
          measurement.property !== "length"
      ),
    }),
  /not tied to source.*exact coordinate signature/i,
  "ID-only CAD/as-built coverage must not prove canonical topology."
);

assert.throws(
  () => validate({}),
  /schemaVersion|Invalid input/i,
  "An empty object must never unlock construction verification."
);
assert.throws(
  () =>
    validate({
      ...baseEvidence,
      confirmedEntityIds: criticalIds.slice(1),
    }),
  /does not cover the exact canonical geometry.*Missing:/,
  "Construction evidence must cover every critical canonical entity."
);
assert.throws(
  () =>
    validate({
      ...baseEvidence,
      confirmedEntityIds: [...criticalIds, criticalIds[0]],
    }),
  /repeats entity IDs/,
  "Duplicate coverage IDs should be rejected instead of hiding omissions."
);

const unrelatedVerticalSource = structuredClone(document);
const unrelatedWallHeight = unrelatedVerticalSource.floors[0]?.defaults.wallHeight;
assert.ok(unrelatedWallHeight);
unrelatedWallHeight.provenance.evidence = unrelatedWallHeight.provenance.evidence.filter(
  (entry) => entry.sourceId !== durableSource.id
);
const unrelatedWallHeightClaim = collectFloorPlanConstructionVerticalProperties(
  unrelatedVerticalSource
).find((property) => property.id.endsWith(":default:wall-height"));
assert.ok(unrelatedWallHeightClaim);
assert.throws(
  () =>
    assertFloorPlanConstructionEvidence(
      unrelatedVerticalSource,
      {
        ...baseEvidence,
        measurements: baseEvidence.measurements.filter(
          (measurement) => measurement.entityId !== unrelatedWallHeightClaim.id
        ),
      },
      evidenceContext
    ),
  /not tied to construction source.*exact measurement/i,
  "A brochure-derived height label plus an unrelated durable source must not unlock construction verification."
);

const exactWallHeightMeasurement = {
  entityId: unrelatedWallHeightClaim.id,
  property: unrelatedWallHeightClaim.property,
  valueMm: unrelatedWallHeightClaim.valueMm,
  measuredBy: "Registered surveyor",
  measuredAt: "2026-07-16T10:00:00+08:00",
  instrument: "Calibrated laser distance meter",
};
assert.equal(
  assertFloorPlanConstructionEvidence(
    unrelatedVerticalSource,
    {
      ...baseEvidence,
      measurements: [
        ...baseEvidence.measurements.filter(
          (measurement) => measurement.entityId !== unrelatedWallHeightClaim.id
        ),
        exactWallHeightMeasurement,
      ],
    },
    evidenceContext
  ).kind,
  "as_built",
  "An exact, source-bound measurement may replace missing direct property provenance."
);
assert.throws(
  () =>
    assertFloorPlanConstructionEvidence(
      unrelatedVerticalSource,
      {
        ...baseEvidence,
        measurements: [
          ...baseEvidence.measurements.filter(
            (measurement) => measurement.entityId !== unrelatedWallHeightClaim.id
          ),
          { ...exactWallHeightMeasurement, valueMm: exactWallHeightMeasurement.valueMm + 1 },
        ],
      },
      evidenceContext
    ),
  /must record height=.* exactly/i,
  "A near or contradictory vertical measurement must fail closed."
);

const measuredAt = "2026-07-16T10:00:00+08:00";
const siteDocument = structuredClone(document);
const siteSource = siteDocument.sources.find((source) => source.id === durableSource.id);
assert.ok(siteSource);
siteSource.kind = "site_measurement";
bindVerticalClaims({
  document: siteDocument,
  sourceId: durableSource.id,
  basis: "site_measured",
  evidence: "site_measured",
});
const siteCriticalIds = collectConstructionCriticalEntityIds(siteDocument);
const sitePositionClaims = collectConstructionCriticalPositionClaims(siteDocument);
const siteScalarClaims = collectConstructionCriticalScalarClaims(siteDocument);
const siteVerticalClaims = collectFloorPlanConstructionVerticalProperties(siteDocument);
const siteContext: FloorPlanConstructionEvidenceContext = {
  ...evidenceContext,
  durableSources: evidenceContext.durableSources.map((source) => ({
    ...source,
    evidenceKind: "site_measurement" as const,
  })),
};
const siteEvidence = {
  ...baseEvidence,
  kind: "site_measurement" as const,
  source: {
    ...baseEvidence.source,
    name: "Signed unit measurement report",
  },
  measurements: [
    ...sitePositionClaims.map((claim) => ({
      entityId: claim.entityId,
      property: "position" as const,
      coordinatesMm: claim.coordinatesMm,
      measuredBy: "Registered surveyor",
      measuredAt,
      instrument: "Calibrated total station",
    })),
    ...siteScalarClaims.map((claim) => ({
      entityId: claim.entityId,
      property: claim.property,
      valueMm: claim.valueMm,
      measuredBy: "Registered surveyor",
      measuredAt,
      instrument: "Calibrated laser distance meter",
    })),
    ...siteVerticalClaims.map((claim) => ({
      entityId: claim.id,
      property: claim.property,
      valueMm: claim.valueMm,
      measuredBy: "Registered surveyor",
      measuredAt,
      instrument: "Calibrated laser distance meter",
    })),
  ],
};
assert.equal(
  assertFloorPlanConstructionEvidence(siteDocument, siteEvidence, siteContext)
    .measurements.length,
  siteEvidence.measurements.length
);
assert.throws(
  () =>
    assertFloorPlanConstructionEvidence(
      siteDocument,
      {
        ...siteEvidence,
        measurements: [
          ...siteEvidence.measurements.filter(
            (measurement) => measurement.property !== "position"
          ),
          {
            entityId: siteCriticalIds[0],
            property: "position",
            coordinatesMm: sitePositionClaims[0].coordinatesMm,
            measuredBy: "Registered surveyor",
            measuredAt,
          },
        ],
      },
      siteContext
    ),
  /exact coordinate signature/,
  "Partial site measurements cannot claim construction verification."
);

assert.throws(
  () =>
    assertFloorPlanConstructionEvidence(
      siteDocument,
      {
        ...siteEvidence,
        measurements: siteEvidence.measurements.map((measurement) =>
          measurement.property === "position" &&
          measurement.entityId === sitePositionClaims[0].entityId
            ? {
                ...measurement,
                coordinatesMm: measurement.coordinatesMm.map((point, index) =>
                  index === 0 ? { ...point, xMm: point.xMm + 1 } : point
                ),
              }
            : measurement
        ),
      },
      siteContext
    ),
  /does not exactly match the canonical coordinate signature/,
  "A site-measurement ID with different coordinates must fail closed."
);

const siblingDocument = structuredClone(document);
const siblingWall = siblingDocument.floors[0].walls[0];
siblingWall.provenance.evidence.push({
  sourceId: durableSource.id,
  basis: "as_built",
  confidence: 1,
  extractorVersion: "construction-evidence-test-v1",
  note: "This evidence proves the 2D wall path and one reviewed height only.",
});
const siblingBaseClaim = collectFloorPlanConstructionVerticalProperties(
  siblingDocument
).find((claim) => claim.id.endsWith(`:wall:${siblingWall.id}:base-offset`));
assert.ok(siblingBaseClaim);
assert.throws(
  () =>
    assertFloorPlanConstructionEvidence(
      siblingDocument,
      {
        ...baseEvidence,
        measurements: baseEvidence.measurements.filter(
          (measurement) => measurement.entityId !== siblingBaseClaim.id
        ),
      },
      evidenceContext
    ),
  /baseOffsetMm is not tied to construction source.*base-offset/i,
  "Wall-path or height provenance must not cross-satisfy the wall base offset."
);

assert.throws(
  () =>
    validate({
      ...baseEvidence,
      source: { ...baseEvidence.source, sha256: "f".repeat(64) },
    }),
  /does not match its durable asset/i,
  "A submitted hash cannot impersonate the durable source asset."
);
assert.throws(
  () =>
    validate({
      ...baseEvidence,
      unit: { ...baseEvidence.unit, stack: "999" },
    }),
  /exactly cover every served catalog binding/i,
  "Construction evidence must be unit-bound, not only address-shaped text."
);
assert.throws(
  () =>
    validate(baseEvidence, {
      ...evidenceContext,
      addressBindings: [
        ...evidenceContext.addressBindings,
        {
          ...evidenceContext.addressBindings[0],
          stack: "510",
        },
      ],
    }),
  /exactly cover every served catalog binding.*#12-510/i,
  "A revision-wide construction tier must not overclaim another served unit binding."
);
assert.throws(
  () =>
    validate(baseEvidence, {
      ...evidenceContext,
      durableSources: evidenceContext.durableSources.map((source) => ({
        ...source,
        contentDeletedAt: new Date(),
      })),
    }),
  /live, job-scoped durable source asset/i,
  "Deleted evidence must never unlock construction verification."
);

console.log("Floor-plan construction evidence checks passed.");
