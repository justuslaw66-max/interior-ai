import {
  compileFloorPlanDocumentV2,
} from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanAnnotationV2,
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanEvidenceBasisV2,
  FloorPlanSourceV2,
} from "@/lib/floor-plan-document-v2";

const SAFE_ID = /^[a-z0-9][a-z0-9:_-]{0,199}$/i;
const SHA256 = /^[a-f0-9]{64}$/;

const DIRECT_SOURCE_BASES = new Set<FloorPlanEvidenceBasisV2>([
  "explicit_dimension",
  "vector_traced",
  "raster_traced",
  "site_measured",
  "cad",
  "as_built",
  // Review-only compatibility drawings retain legacy evidence. It is still a
  // direct source reference, but never upgrades a document's verification tier.
  "legacy",
]);

export type FloorPlanAuthoredConfigurationVariant = {
  optionId: string;
  label: string;
  defaultSelected: boolean;
  sourceSupported: true;
  artifact: {
    kind: "authored_revision";
    revisionId: string;
    geometryHash: string;
    sourceId: string;
    pageNumber?: number;
  };
};

export type FloorPlanAuthoredConfigurationGroup = {
  groupId: string;
  label: string;
  sourceSupported: true;
  variants: FloorPlanAuthoredConfigurationVariant[];
};

export type FloorPlanOptionalConfigurationSuggestion = {
  annotationId: string;
  configurationId: string | null;
  kind: Extract<FloorPlanAnnotationV2["kind"], "suggested_room" | "optional_partition">;
  label: string;
  floorId: string;
  sourceSupported: boolean;
  sourcePages: number[];
  status: "authored_variant_available" | "annotation_only" | "needs_review";
  variant: FloorPlanAuthoredConfigurationVariant | null;
};

function fail(message: string): never {
  throw new Error(`Invalid floor-plan optional configuration: ${message}`);
}

function assertIdentifier(value: string, field: string): void {
  if (!SAFE_ID.test(value)) fail(`${field} must be a stable identifier`);
}

function sourceAllowsPageOmission(source: FloorPlanSourceV2): boolean {
  return ["cad", "as_built", "site_measurement"].includes(source.kind);
}

function directEvidence(
  provenance: FloorPlanEntityProvenanceV2,
  sources: ReadonlyMap<string, FloorPlanSourceV2>
) {
  return provenance.evidence.filter((evidence) => {
    const source = sources.get(evidence.sourceId);
    if (!source || !DIRECT_SOURCE_BASES.has(evidence.basis)) return false;
    return sourceAllowsPageOmission(source) ||
      (Number.isSafeInteger(evidence.pageNumber) && (evidence.pageNumber ?? 0) > 0);
  });
}

export function validateFloorPlanConfigurationGroup(
  group: FloorPlanAuthoredConfigurationGroup
): FloorPlanAuthoredConfigurationGroup {
  assertIdentifier(group.groupId, "groupId");
  if (group.sourceSupported !== true) fail("group must be source-supported");
  if (!group.label.trim()) fail("group label is required");
  if (group.variants.length < 2) fail("group needs at least two authored variants");

  const optionIds = new Set<string>();
  const revisionIds = new Set<string>();
  for (const variant of group.variants) {
    assertIdentifier(variant.optionId, "optionId");
    assertIdentifier(variant.artifact.revisionId, "revisionId");
    assertIdentifier(variant.artifact.sourceId, "sourceId");
    if (!variant.label.trim()) fail("variant label is required");
    if (variant.sourceSupported !== true) fail("variant must be source-supported");
    if (variant.artifact.kind !== "authored_revision") {
      fail("only a complete authored revision can be selected");
    }
    if (!SHA256.test(variant.artifact.geometryHash)) {
      fail("authored variant geometryHash must be sha256");
    }
    if (
      variant.artifact.pageNumber !== undefined &&
      (!Number.isSafeInteger(variant.artifact.pageNumber) || variant.artifact.pageNumber < 1)
    ) {
      fail("source page must be a positive integer");
    }
    if (optionIds.has(variant.optionId)) fail(`duplicate option ${variant.optionId}`);
    if (revisionIds.has(variant.artifact.revisionId)) {
      fail(`revision ${variant.artifact.revisionId} is assigned to more than one option`);
    }
    optionIds.add(variant.optionId);
    revisionIds.add(variant.artifact.revisionId);
  }
  if (group.variants.filter((variant) => variant.defaultSelected).length !== 1) {
    fail("group needs exactly one default variant");
  }
  return structuredClone(group);
}

function physicalEntityProvenances(document: FloorPlanDocumentV2) {
  return document.floors.flatMap((floor) => [
    ...floor.vertices.map((entity) => entity.provenance),
    ...floor.walls.map((entity) => entity.provenance),
    ...floor.rooms.map((entity) => entity.provenance),
    ...floor.openings.map((entity) => entity.provenance),
    ...floor.structures.map((entity) => entity.provenance),
  ]);
}

/**
 * Resolves an option only from its complete immutable document. Annotation
 * geometry is deliberately not accepted as a patch or room boundary.
 */
export function resolveFloorPlanAuthoredConfiguration(input: {
  group: FloorPlanAuthoredConfigurationGroup;
  optionId: string;
  document: FloorPlanDocumentV2;
}): FloorPlanDocumentV2 {
  const group = validateFloorPlanConfigurationGroup(input.group);
  const variant = group.variants.find((entry) => entry.optionId === input.optionId);
  if (!variant) fail(`unknown option ${input.optionId}`);
  if (input.document.revisionId !== variant.artifact.revisionId) {
    fail("loaded document does not match the authored revision reference");
  }
  const compiled = compileFloorPlanDocumentV2(input.document);
  if (compiled.geometryHash !== variant.artifact.geometryHash) {
    fail("loaded authored revision failed its geometry integrity check");
  }
  const source = input.document.sources.find(
    (entry) => entry.id === variant.artifact.sourceId
  );
  if (!source) fail("authored revision source is missing");
  if (!sourceAllowsPageOmission(source) && !variant.artifact.pageNumber) {
    fail("page-based authored revision is missing its source page");
  }
  const sources = new Map(input.document.sources.map((entry) => [entry.id, entry]));
  const physical = physicalEntityProvenances(input.document);
  if (!physical.length) fail("authored revision contains no physical geometry");
  if (
    physical.some((provenance) =>
      !directEvidence(provenance, sources).some(
        (evidence) =>
          evidence.sourceId === variant.artifact.sourceId &&
          (variant.artifact.pageNumber === undefined ||
            evidence.pageNumber === variant.artifact.pageNumber)
      )
    )
  ) {
    fail("every physical entity in an authored variant needs direct source evidence");
  }
  return structuredClone(input.document);
}

export function inspectFloorPlanOptionalConfigurations(
  document: FloorPlanDocumentV2,
  groups: FloorPlanAuthoredConfigurationGroup[] = []
): FloorPlanOptionalConfigurationSuggestion[] {
  const validGroups = groups.flatMap((group) => {
    try {
      return [validateFloorPlanConfigurationGroup(group)];
    } catch {
      // Display the source annotation, but never offer executable geometry
      // when a catalog/API relationship is malformed.
      return [];
    }
  });
  const sources = new Map(document.sources.map((source) => [source.id, source]));
  return document.floors.flatMap((floor) =>
    floor.annotations.flatMap((annotation) => {
      if (
        annotation.kind !== "suggested_room" &&
        annotation.kind !== "optional_partition"
      ) {
        return [];
      }
      const evidence = directEvidence(annotation.provenance, sources);
      const configurationId = annotation.configurationId?.trim() || null;
      const matchingVariants = configurationId
        ? validGroups
            .flatMap((group) => group.variants)
            .filter((entry) => entry.optionId === configurationId)
        : [];
      // FloorPlanAnnotationV2 intentionally stores no executable group
      // relationship. A repeated option ID is therefore ambiguous and remains
      // annotation-only until an exact group/revision binding is supplied.
      const variant = matchingVariants.length === 1 ? matchingVariants[0] : null;
      const sourceSupported = evidence.length > 0;
      return [{
        annotationId: annotation.id,
        configurationId,
        kind: annotation.kind,
        label: annotation.text,
        floorId: floor.id,
        sourceSupported,
        sourcePages: [...new Set(
          evidence.flatMap((entry) => entry.pageNumber === undefined ? [] : [entry.pageNumber])
        )].sort((left, right) => left - right),
        status: !sourceSupported || !configurationId
          ? "needs_review" as const
          : variant
            ? "authored_variant_available" as const
            : "annotation_only" as const,
        variant,
      }];
    })
  );
}
