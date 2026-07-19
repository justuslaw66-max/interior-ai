import {
  compileFloorPlanDocumentV2,
  hashFloorPlanGeometryV2,
} from "@/lib/floor-plan-compiler-v2";
import {
  catalogV1LayoutToFloorPlanDocumentV2,
} from "@/lib/floor-plan-catalog-v1-adapter";
import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanSourceV2,
} from "@/lib/floor-plan-document-v2";
import type { FloorPlanReviewIssue } from "@/lib/floor-plan-imports/types";
import type { FloorPlanLibraryCatalog } from "@/lib/floor-plan-library-schema";
import {
  validateFloorPlanConfigurationGroup,
  type FloorPlanAuthoredConfigurationGroup,
} from "@/lib/floor-plan-optional-configurations";

const PING_YI_PLAN_ID = "sg-hdb-ping-yi-court";
const SEED_CREATED_AT = "1970-01-01T00:00:00.000Z";

type ManifestAssertion = Record<string, unknown>;

export type PingYiCourtManifestLayoutV2 = {
  layout_id: string;
  source_page: number;
  printed_dimensions_mm: number[];
  catalog_room_assertions?: ManifestAssertion[] | null;
  catalog_polygon_assertions?: ManifestAssertion[] | null;
  catalog_opening_assertions?: ManifestAssertion[] | null;
  catalog_reference_zone_assertions?: ManifestAssertion[] | null;
  opening_semantics?: ManifestAssertion[] | null;
  unresolved?: string[] | null;
};

export type PingYiCourtSourceManifestV2 = {
  schema_version: number;
  fixture_kind: string;
  plan_id: string;
  coordinate_unit: string;
  verification_status: string;
  source: {
    url: string;
    sha256: string;
    page_count: number;
  };
  official_brochure: {
    url: string;
    sha256: string;
    page_count: number;
    unit_distribution_pdf_pages: number[];
    unit_distribution_brochure_pages: number[];
  };
  stack_bindings: Array<{
    block: string;
    stacks: string[];
    floor_ranges: Array<{ from: number; to: number }>;
    layout_id: string;
    evidence: string;
    transform: string;
  }>;
  layouts: PingYiCourtManifestLayoutV2[];
};

export type PingYiCourtReviewSeedV2 = {
  layoutId: string;
  label: string;
  sourcePage: number;
  geometryHash: string;
  document: FloorPlanDocumentV2;
  reviewIssues: FloorPlanReviewIssue[];
  sourceEvidence: {
    printedDimensionsMm: number[];
    roomAssertions: ManifestAssertion[];
    polygonAssertions: ManifestAssertion[];
    openingAssertions: ManifestAssertion[];
    structureAssertions: ManifestAssertion[];
    openingSemantics: ManifestAssertion[];
    unresolved: string[];
  };
};

export type PingYiCourtReviewSeedBundleV2 = {
  schemaVersion: 1;
  kind: "floor_plan_document_v2_review_seed_bundle";
  planId: typeof PING_YI_PLAN_ID;
  generatedFrom: {
    catalogSchemaVersion: 1;
    sourceManifestSchemaVersion: 2;
  };
  verificationTier: "needs_review";
  publication: {
    status: "draft";
    visibility: "review_only";
  };
  source: PingYiCourtSourceManifestV2["source"];
  officialBrochure: PingYiCourtSourceManifestV2["official_brochure"];
  stackBindings: PingYiCourtSourceManifestV2["stack_bindings"];
  configurationGroups: FloorPlanAuthoredConfigurationGroup[];
  fixtures: PingYiCourtReviewSeedV2[];
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid Ping Yi Court V2 seed input: ${message}`);
}

function allProvenances(document: FloorPlanDocumentV2): FloorPlanEntityProvenanceV2[] {
  return document.floors.flatMap((floor) => [
    ...Object.values(floor.verticalEvidence ?? {}).map(
      (property) => property.provenance
    ),
    ...Object.values(floor.defaults).map((property) => property.provenance),
    ...floor.vertices.map((entity) => entity.provenance),
    ...floor.walls.map((entity) => entity.provenance),
    ...floor.rooms.map((entity) => entity.provenance),
    ...floor.openings.map((entity) => entity.provenance),
    ...floor.structures.map((entity) => entity.provenance),
    ...floor.annotations.map((entity) => entity.provenance),
    ...floor.dimensions.map((entity) => entity.provenance),
  ]);
}

function replaceLegacySource(
  document: FloorPlanDocumentV2,
  primarySource: FloorPlanSourceV2,
  officialBrochure: FloorPlanSourceV2
): void {
  const legacySourceIds = new Set(document.sources.map((source) => source.id));
  for (const provenance of allProvenances(document)) {
    for (const evidence of provenance.evidence) {
      if (legacySourceIds.has(evidence.sourceId)) evidence.sourceId = primarySource.id;
    }
  }
  document.sources = [primarySource, officialBrochure];
}

function assertInputs(
  catalog: FloorPlanLibraryCatalog,
  manifest: PingYiCourtSourceManifestV2
): void {
  invariant(catalog.schema_version === 1, "the compatibility catalog must remain schema v1");
  invariant(catalog.floor_plan.plan_id === PING_YI_PLAN_ID, "unexpected catalog plan_id");
  invariant(catalog.publication.status === "draft", "the compatibility catalog must stay draft");
  invariant(
    catalog.publication.visibility === "review_only",
    "the compatibility catalog must stay review_only"
  );
  invariant(manifest.schema_version === 2, "source manifest schema_version must be 2");
  invariant(
    manifest.fixture_kind === "floor_plan_source_manifest",
    "unexpected source manifest kind"
  );
  invariant(manifest.plan_id === PING_YI_PLAN_ID, "source manifest plan_id mismatch");
  invariant(manifest.coordinate_unit === "millimetre", "source manifest must use millimetres");
  invariant(
    manifest.verification_status === "needs_review",
    "source manifest must not claim a verified tier"
  );
  invariant(manifest.source.url === catalog.source.source_url, "primary source URL mismatch");
  invariant(manifest.source.sha256 === catalog.source.sha256, "primary source hash mismatch");
  invariant(
    manifest.official_brochure.url === catalog.unit_distribution_source?.source_url,
    "official brochure URL mismatch"
  );
  invariant(
    manifest.official_brochure.sha256 === catalog.unit_distribution_source?.sha256,
    "official brochure hash mismatch"
  );

  const manifestLayoutIds = manifest.layouts.map((layout) => layout.layout_id);
  const catalogLayoutIds = catalog.layouts.map((layout) => layout.layout_id);
  invariant(new Set(manifestLayoutIds).size === manifestLayoutIds.length, "duplicate manifest layout_id");
  invariant(
    JSON.stringify(manifestLayoutIds) === JSON.stringify(catalogLayoutIds),
    "manifest layout order or coverage differs from the catalog"
  );
  for (const layout of manifest.layouts) {
    invariant(
      layout.printed_dimensions_mm.length > 0 &&
        layout.printed_dimensions_mm.every(
          (measurement) => Number.isSafeInteger(measurement) && measurement > 0
        ),
      `${layout.layout_id} has invalid printed dimensions`
    );
  }

  const threeGenBinding = manifest.stack_bindings.find(
    (binding) => binding.block === "810A" && binding.layout_id === "3gen"
  );
  invariant(threeGenBinding, "missing official 810A 3Gen stack binding");
  invariant(
    JSON.stringify(threeGenBinding.stacks) === JSON.stringify(["509", "527"]),
    "810A 3Gen stacks must remain exactly 509 and 527"
  );
  invariant(
    JSON.stringify(threeGenBinding.floor_ranges) ===
      JSON.stringify([{ from: 2, to: 15 }]),
    "810A 3Gen floor range must remain 2-15"
  );
  invariant(
    threeGenBinding.evidence === "official_unit_distribution" &&
      threeGenBinding.transform === "needs_review",
    "810A 3Gen evidence must stay official while its transform stays unresolved"
  );
  const block810A = catalog.address.buildings.find((building) => building.block === "810A");
  invariant(
    block810A?.unit_distribution?.status === "verified",
    "catalog 810A unit distribution must retain verified official evidence"
  );
  const catalogThreeGenGroup = block810A.unit_distribution.groups.find(
    (group) =>
      group.layout_ids.length === 1 &&
      group.layout_ids[0] === "3gen" &&
      JSON.stringify(group.stacks) === JSON.stringify(["509", "527"])
  );
  invariant(catalogThreeGenGroup, "catalog 810A stacks 509/527 must map only to 3Gen");
  invariant(
    JSON.stringify(catalogThreeGenGroup.floor_ranges) ===
      JSON.stringify(threeGenBinding.floor_ranges),
    "catalog and manifest 810A 3Gen floor ranges differ"
  );
}

function sourceEvidence(layout: PingYiCourtManifestLayoutV2) {
  return {
    printedDimensionsMm: [...layout.printed_dimensions_mm],
    roomAssertions: [...(layout.catalog_room_assertions ?? [])],
    polygonAssertions: [...(layout.catalog_polygon_assertions ?? [])],
    openingAssertions: [...(layout.catalog_opening_assertions ?? [])],
    structureAssertions: [...(layout.catalog_reference_zone_assertions ?? [])],
    openingSemantics: [...(layout.opening_semantics ?? [])],
    unresolved: [...(layout.unresolved ?? [])],
  };
}

function authoredConfigurationGroups(
  catalog: FloorPlanLibraryCatalog,
  fixtures: PingYiCourtReviewSeedV2[]
): FloorPlanAuthoredConfigurationGroup[] {
  const layoutsByGroup = new Map<string, typeof catalog.layouts>();
  for (const layout of catalog.layouts) {
    if (!layout.configuration) continue;
    const layouts = layoutsByGroup.get(layout.configuration.group_id) ?? [];
    layouts.push(layout);
    layoutsByGroup.set(layout.configuration.group_id, layouts);
  }
  const fixtureByLayout = new Map(fixtures.map((fixture) => [fixture.layoutId, fixture]));
  return [...layoutsByGroup.entries()].map(([groupId, layouts]) =>
    validateFloorPlanConfigurationGroup({
      groupId,
      label: `${layouts[0].flat_type} source layouts`,
      sourceSupported: true,
      variants: layouts.map((layout) => {
        const fixture = fixtureByLayout.get(layout.layout_id);
        invariant(fixture, `missing V2 fixture for configuration ${layout.layout_id}`);
        return {
          optionId: layout.configuration!.option_id,
          label: layout.configuration!.label,
          defaultSelected: layout.configuration!.default_selected,
          sourceSupported: true,
          artifact: {
            kind: "authored_revision",
            revisionId: fixture.document.revisionId,
            geometryHash: fixture.geometryHash,
            sourceId: fixture.document.sources[0].id,
            pageNumber: layout.source_page,
          },
        };
      }),
    })
  );
}

/**
 * Builds immutable-revision-shaped native V2 review seeds from the reviewed
 * compatibility tracing and its independent evidence manifest. This is a seed
 * generator, not an approval path: legacy provenance and every unresolved
 * manifest item continue to block source verification.
 */
export function generatePingYiCourtV2ReviewSeedBundle(
  catalog: FloorPlanLibraryCatalog,
  manifest: PingYiCourtSourceManifestV2
): PingYiCourtReviewSeedBundleV2 {
  assertInputs(catalog, manifest);

  const primarySource: FloorPlanSourceV2 = {
    id: `source:${PING_YI_PLAN_ID}:floor-plan-pdf`,
    kind: "pdf",
    name: catalog.source.source_title,
    mimeType: "application/pdf",
    uri: manifest.source.url,
    sha256: manifest.source.sha256,
    pageCount: manifest.source.page_count,
  };
  const officialBrochure: FloorPlanSourceV2 = {
    id: `source:${PING_YI_PLAN_ID}:official-brochure`,
    kind: "pdf",
    name: catalog.unit_distribution_source!.source_title,
    mimeType: "application/pdf",
    uri: manifest.official_brochure.url,
    sha256: manifest.official_brochure.sha256,
    pageCount: manifest.official_brochure.page_count,
  };

  const fixtures = catalog.layouts.map((layout, index): PingYiCourtReviewSeedV2 => {
    const evidence = manifest.layouts[index];
    invariant(layout.layout_id === evidence.layout_id, "layout evidence order changed");
    invariant(layout.source_page === evidence.source_page, `${layout.layout_id} source page mismatch`);
    const adapted = catalogV1LayoutToFloorPlanDocumentV2(catalog, layout, {
      createdAt: SEED_CREATED_AT,
      documentId: `floor-plan:${PING_YI_PLAN_ID}:${layout.layout_id}`,
      revisionId: `floor-plan:${PING_YI_PLAN_ID}:${layout.layout_id}:review-seed:1`,
    });
    const document = structuredClone(adapted.document);
    replaceLegacySource(document, structuredClone(primarySource), structuredClone(officialBrochure));

    const manifestIssues: FloorPlanReviewIssue[] = (evidence.unresolved ?? []).map(
      (message, unresolvedIndex) => ({
        id: `${layout.layout_id}:source-manifest-review:${unresolvedIndex + 1}`,
        code: "SOURCE_MANIFEST_UNRESOLVED",
        message,
        severity: "critical",
        resolved: false,
      })
    );
    const reviewIssues = [...adapted.reviewIssues, ...manifestIssues];
    document.verification = {
      tier: "needs_review",
      criticalIssueIds: reviewIssues
        .filter((issue) => issue.severity === "critical" && !issue.resolved)
        .map((issue) => issue.id),
    };
    const compiled = compileFloorPlanDocumentV2(document);
    invariant(compiled.verificationTier === "needs_review", "seed unexpectedly became verified");

    return {
      layoutId: layout.layout_id,
      label: layout.label,
      sourcePage: layout.source_page,
      geometryHash: hashFloorPlanGeometryV2(document),
      document,
      reviewIssues,
      sourceEvidence: sourceEvidence(evidence),
    };
  });

  return {
    schemaVersion: 1,
    kind: "floor_plan_document_v2_review_seed_bundle",
    planId: PING_YI_PLAN_ID,
    generatedFrom: {
      catalogSchemaVersion: 1,
      sourceManifestSchemaVersion: 2,
    },
    verificationTier: "needs_review",
    publication: { status: "draft", visibility: "review_only" },
    source: structuredClone(manifest.source),
    officialBrochure: structuredClone(manifest.official_brochure),
    stackBindings: structuredClone(manifest.stack_bindings),
    configurationGroups: authoredConfigurationGroups(catalog, fixtures),
    fixtures,
  };
}

export function serializePingYiCourtV2ReviewSeedBundle(
  bundle: PingYiCourtReviewSeedBundleV2
): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}
