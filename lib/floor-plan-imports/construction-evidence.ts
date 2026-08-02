import { z } from "zod";
import type {
  FloorPlanDocumentV2,
  FloorPlanFloorV2,
  FloorPlanPointMmV2,
  FloorPlanWallV2,
} from "@/lib/floor-plan-document-v2";
import type { AddressBindingWithEvidence } from "./address-binding-evidence";
import {
  collectFloorPlanConstructionVerticalProperties,
  floorPlanConstructionBasisForKind,
  floorPlanConstructionPropertyEvidenceForKind,
  floorPlanVerticalPropertyHasDirectConstructionEvidence,
} from "./construction-vertical-evidence";
import { FLOOR_PLAN_SOURCE_MIME_TYPES } from "./types";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, "Expected a SHA-256 hash");

const constructionMeasurementBaseSchema = z.object({
  entityId: z.string().min(1),
  measuredBy: z.string().min(1),
  measuredAt: z.string().datetime({ offset: true }),
  instrument: z.string().min(1).optional(),
});

const constructionMeasurementSchema = z.discriminatedUnion("property", [
  constructionMeasurementBaseSchema.extend({
    property: z.literal("position"),
    coordinatesMm: z
      .array(
        z.object({
          xMm: z.number().finite(),
          zMm: z.number().finite(),
        })
      )
      .min(1),
  }),
  constructionMeasurementBaseSchema.extend({
    property: z.enum([
      "length",
      "thickness",
      "height",
      "width",
      "sill_height",
      "elevation",
      "base_offset",
    ]),
    valueMm: z.number().int(),
    toleranceMm: z.number().int().nonnegative().max(100).optional(),
  }),
]);

export const floorPlanConstructionEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.enum(["unit_cad", "as_built", "site_measurement"]),
    unit: z.object({
      address: z.string().min(5),
      countryCode: z.string().trim().min(2).max(3),
      block: z.string().min(1),
      street: z.string().min(1),
      stack: z.string().min(1),
      floor: z.number().int().min(1).max(200),
      postalCode: z.string().min(3).optional(),
    }),
    source: z.object({
      assetId: z.string().min(1),
      name: z.string().min(1),
      sha256: sha256Schema,
      mimeType: z.string().min(3),
      uri: z.string().url().optional(),
      issuer: z.string().min(1),
      issuedAt: z.string().datetime({ offset: true }).optional(),
    }),
    confirmedEntityIds: z.array(z.string().min(1)).min(1),
    measurements: z.array(constructionMeasurementSchema).default([]),
    reviewerNotes: z.string().min(10),
  })
  .superRefine((evidence, context) => {
    if (evidence.kind !== "site_measurement") return;
    if (evidence.measurements.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["measurements"],
        message: "Site-measurement evidence requires recorded measurements.",
      });
    }
  });

export type FloorPlanConstructionEvidence = z.infer<
  typeof floorPlanConstructionEvidenceSchema
>;

export class FloorPlanConstructionEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FloorPlanConstructionEvidenceError";
  }
}

export type FloorPlanConstructionEvidenceContext = {
  durableSources: readonly {
    id: string;
    sha256: string;
    mimeType: string;
    evidenceKind: FloorPlanConstructionEvidence["kind"];
    authorizedAt: Date | string;
    authorizedBy: string;
    contentDeletedAt?: Date | string | null;
  }[];
  addressBindings: readonly AddressBindingWithEvidence[];
};

/** Geometry that must be mapped to unit-specific evidence for construction verification. */
export function collectConstructionCriticalEntityIds(document: FloorPlanDocumentV2) {
  return document.floors.flatMap((floor) => [
    ...floor.vertices.map((entity) => entity.id),
    ...floor.walls.map((entity) => entity.id),
    ...floor.openings.map((entity) => entity.id),
    ...floor.structures.map((entity) => entity.id),
    ...floor.dimensions.map((entity) => entity.id),
  ]);
}

function collectConstructionCriticalEntityProvenance(
  document: FloorPlanDocumentV2
) {
  return new Map(
    document.floors.flatMap((floor) => [
      ...floor.vertices.map((entity) => [entity.id, entity.provenance] as const),
      ...floor.walls.map((entity) => [entity.id, entity.provenance] as const),
      ...floor.openings.map((entity) => [entity.id, entity.provenance] as const),
      ...floor.structures.map((entity) => [entity.id, entity.provenance] as const),
      ...floor.dimensions.map((entity) => [entity.id, entity.provenance] as const),
    ])
  );
}

export type FloorPlanConstructionPositionClaim = {
  entityId: string;
  coordinatesMm: FloorPlanPointMmV2[];
};

export type FloorPlanConstructionScalarClaim = {
  entityId: string;
  property: "length" | "thickness" | "width";
  valueMm: number;
};

function roundDerived(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function wallLengthMm(floor: FloorPlanFloorV2, wall: FloorPlanWallV2) {
  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  const start = vertices.get(wall.path.startVertexId);
  const end = vertices.get(wall.path.endVertexId);
  if (!start || !end) return 0;
  if (wall.path.kind === "line") {
    return Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm);
  }
  const center = vertices.get(wall.path.centerVertexId);
  if (!center) return 0;
  const startAngle = Math.atan2(start.zMm - center.zMm, start.xMm - center.xMm);
  const endAngle = Math.atan2(end.zMm - center.zMm, end.xMm - center.xMm);
  let sweep = endAngle - startAngle;
  if (wall.path.clockwise && sweep > 0) sweep -= Math.PI * 2;
  if (!wall.path.clockwise && sweep < 0) sweep += Math.PI * 2;
  return Math.abs(sweep) * Math.hypot(start.xMm - center.xMm, start.zMm - center.zMm);
}

function pointOnWall(
  floor: FloorPlanFloorV2,
  wall: FloorPlanWallV2,
  offsetMm: number
): FloorPlanPointMmV2 {
  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  const start = vertices.get(wall.path.startVertexId);
  const end = vertices.get(wall.path.endVertexId);
  if (!start || !end) {
    throw new FloorPlanConstructionEvidenceError(
      `Cannot reconcile position for wall ${wall.id}: endpoint vertex is missing.`
    );
  }
  if (wall.path.kind === "line") {
    const length = Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm);
    const ratio = length === 0 ? 0 : offsetMm / length;
    return {
      xMm: roundDerived(start.xMm + (end.xMm - start.xMm) * ratio),
      zMm: roundDerived(start.zMm + (end.zMm - start.zMm) * ratio),
    };
  }
  const center = vertices.get(wall.path.centerVertexId);
  if (!center) {
    throw new FloorPlanConstructionEvidenceError(
      `Cannot reconcile position for wall ${wall.id}: arc centre vertex is missing.`
    );
  }
  const radius = Math.hypot(start.xMm - center.xMm, start.zMm - center.zMm);
  const startAngle = Math.atan2(start.zMm - center.zMm, start.xMm - center.xMm);
  const endAngle = Math.atan2(end.zMm - center.zMm, end.xMm - center.xMm);
  let sweep = endAngle - startAngle;
  if (wall.path.clockwise && sweep > 0) sweep -= Math.PI * 2;
  if (!wall.path.clockwise && sweep < 0) sweep += Math.PI * 2;
  const length = Math.abs(sweep) * radius;
  const ratio = length === 0 ? 0 : offsetMm / length;
  const angle = startAngle + sweep * ratio;
  return {
    xMm: roundDerived(center.xMm + Math.cos(angle) * radius),
    zMm: roundDerived(center.zMm + Math.sin(angle) * radius),
  };
}

/**
 * Exact canonical coordinate signatures for every construction-critical 2D
 * entity. Arc walls include start, mid-span, end and centre, in that order, so
 * centre and sweep direction cannot be confirmed by an endpoint-only record.
 */
export function collectConstructionCriticalPositionClaims(
  document: FloorPlanDocumentV2
): FloorPlanConstructionPositionClaim[] {
  return document.floors.flatMap((floor) => {
    const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
    const walls = new Map(floor.walls.map((wall) => [wall.id, wall]));
    const point = (vertexId: string, entityId: string) => {
      const vertex = vertices.get(vertexId);
      if (!vertex) {
        throw new FloorPlanConstructionEvidenceError(
          `Cannot reconcile position for ${entityId}: vertex ${vertexId} is missing.`
        );
      }
      return { xMm: vertex.xMm, zMm: vertex.zMm };
    };
    return [
      ...floor.vertices.map((vertex) => ({
        entityId: vertex.id,
        coordinatesMm: [{ xMm: vertex.xMm, zMm: vertex.zMm }],
      })),
      ...floor.walls.map((wall) => {
        const start = point(wall.path.startVertexId, wall.id);
        const end = point(wall.path.endVertexId, wall.id);
        if (wall.path.kind === "line") {
          return { entityId: wall.id, coordinatesMm: [start, end] };
        }
        const center = point(wall.path.centerVertexId, wall.id);
        return {
          entityId: wall.id,
          coordinatesMm: [
            start,
            pointOnWall(floor, wall, wallLengthMm(floor, wall) / 2),
            end,
            center,
          ],
        };
      }),
      ...floor.openings.map((opening) => {
        const wall = walls.get(opening.wallId);
        if (!wall) {
          throw new FloorPlanConstructionEvidenceError(
            `Cannot reconcile position for opening ${opening.id}: wall ${opening.wallId} is missing.`
          );
        }
        return {
          entityId: opening.id,
          coordinatesMm: [
            pointOnWall(floor, wall, opening.offsetMm),
            pointOnWall(floor, wall, opening.offsetMm + opening.widthMm),
          ],
        };
      }),
      ...floor.structures.map((structure) => ({
        entityId: structure.id,
        coordinatesMm: structure.vertexIds.map((vertexId) => point(vertexId, structure.id)),
      })),
      ...floor.dimensions.map((dimension) => ({
        entityId: dimension.id,
        coordinatesMm: [
          point(dimension.fromVertexId, dimension.id),
          point(dimension.toVertexId, dimension.id),
        ],
      })),
    ];
  });
}

export function collectConstructionCriticalScalarClaims(
  document: FloorPlanDocumentV2
): FloorPlanConstructionScalarClaim[] {
  return document.floors.flatMap((floor) => {
    const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
    return [
      ...floor.walls.map((wall) => ({
        entityId: wall.id,
        property: "thickness" as const,
        valueMm: wall.thicknessMm,
      })),
      ...floor.openings.map((opening) => ({
        entityId: opening.id,
        property: "width" as const,
        valueMm: opening.widthMm,
      })),
      ...floor.dimensions.map((dimension) => {
        const from = vertices.get(dimension.fromVertexId);
        const to = vertices.get(dimension.toVertexId);
        if (!from || !to) {
          throw new FloorPlanConstructionEvidenceError(
            `Cannot reconcile length for dimension ${dimension.id}: endpoint vertex is missing.`
          );
        }
        return {
          entityId: dimension.id,
          property: "length" as const,
          valueMm: dimension.measuredMm,
        };
      }),
    ];
  });
}

function sameCoordinates(
  left: readonly FloorPlanPointMmV2[],
  right: readonly FloorPlanPointMmV2[]
) {
  return (
    left.length === right.length &&
    left.every(
      (point, index) =>
        point.xMm === right[index]?.xMm && point.zMm === right[index]?.zMm
    )
  );
}

function sameIdSet(left: readonly string[], right: readonly string[]) {
  return [...new Set(left)].sort().join("|") === [...new Set(right)].sort().join("|");
}

export function assertFloorPlanConstructionEvidence(
  document: FloorPlanDocumentV2,
  value: unknown,
  context: FloorPlanConstructionEvidenceContext
): FloorPlanConstructionEvidence {
  const evidence = floorPlanConstructionEvidenceSchema.parse(value);
  const matchingAssets = context.durableSources.filter(
    (source) => source.id === evidence.source.assetId
  );
  if (matchingAssets.length !== 1 || matchingAssets[0].contentDeletedAt) {
    throw new FloorPlanConstructionEvidenceError(
      "Construction evidence must reference one live, job-scoped durable source asset."
    );
  }
  const durableSource = matchingAssets[0];
  if (
    !durableSource.authorizedAt ||
    !durableSource.authorizedBy.trim() ||
    durableSource.evidenceKind !== evidence.kind
  ) {
    throw new FloorPlanConstructionEvidenceError(
      "Construction evidence source is not authorized for the submitted evidence kind."
    );
  }
  if (
    durableSource.sha256.toLowerCase() !== evidence.source.sha256.toLowerCase() ||
    durableSource.mimeType.toLowerCase() !== evidence.source.mimeType.toLowerCase()
  ) {
    throw new FloorPlanConstructionEvidenceError(
      "Construction evidence source hash or MIME type does not match its durable asset."
    );
  }
  const canonicalSource = document.sources.find(
    (source) => source.id === durableSource.id
  );
  if (
    !canonicalSource ||
    canonicalSource.sha256?.toLowerCase() !== durableSource.sha256.toLowerCase() ||
    canonicalSource.mimeType.toLowerCase() !== durableSource.mimeType.toLowerCase()
  ) {
    throw new FloorPlanConstructionEvidenceError(
      "Construction evidence source is not attached to the canonical floor-plan document."
    );
  }
  const expectedCanonicalSourceKind =
    evidence.kind === "unit_cad"
      ? "cad"
      : evidence.kind === "as_built"
        ? "as_built"
        : "site_measurement";
  if (canonicalSource.kind !== expectedCanonicalSourceKind) {
    throw new FloorPlanConstructionEvidenceError(
      `Construction evidence kind ${evidence.kind} requires a canonical ${expectedCanonicalSourceKind} source.`
    );
  }
  const normalized = (input: string) =>
    input.trim().toUpperCase().replace(/\s+/g, " ");
  const catalogBindings = context.addressBindings.filter(
    (binding) => binding.role !== "authored_variant"
  );
  if (!catalogBindings.length) {
    throw new FloorPlanConstructionEvidenceError(
      "Construction verification requires one exact catalog address binding."
    );
  }
  const unmatchedBindings = catalogBindings.filter(
    (binding) =>
      normalized(binding.countryCode) !== normalized(evidence.unit.countryCode) ||
      normalized(binding.addressNormalized) !== normalized(evidence.unit.address) ||
      normalized(binding.block) !== normalized(evidence.unit.block) ||
      normalized(binding.street) !== normalized(evidence.unit.street) ||
      normalized(binding.stack ?? "") !== normalized(evidence.unit.stack) ||
      binding.floorMin !== evidence.unit.floor ||
      binding.floorMax !== evidence.unit.floor ||
      normalized(binding.postalCode ?? "") !==
        normalized(evidence.unit.postalCode ?? "")
  );
  if (unmatchedBindings.length) {
    throw new FloorPlanConstructionEvidenceError(
      `Construction evidence must exactly cover every served catalog binding. Unmatched: ${unmatchedBindings
        .map(
          (binding) =>
            `${binding.countryCode}:${binding.addressNormalized}:#${binding.floorMin ?? "?"}-${binding.stack ?? "?"}`
        )
        .join(", ")}`
    );
  }
  if (
    !(FLOOR_PLAN_SOURCE_MIME_TYPES as readonly string[]).includes(
      evidence.source.mimeType.toLowerCase()
    )
  ) {
    throw new FloorPlanConstructionEvidenceError(
      "Construction evidence uses an unsupported durable source format."
    );
  }
  const isCad = /(?:dxf|dwg|acad|autocad|ifc|step)/i.test(
    evidence.source.mimeType
  );
  if (evidence.kind === "unit_cad" && !isCad) {
    throw new FloorPlanConstructionEvidenceError(
      "Unit-CAD verification requires a durable DXF, DWG or IFC-family source."
    );
  }
  if (evidence.kind === "site_measurement" && isCad) {
    throw new FloorPlanConstructionEvidenceError(
      "Site-measurement verification requires a signed report source, not only a CAD file."
    );
  }
  const criticalIds = collectConstructionCriticalEntityIds(document);
  const positionClaims = collectConstructionCriticalPositionClaims(document);
  const scalarClaims = collectConstructionCriticalScalarClaims(document);
  const criticalProvenance = collectConstructionCriticalEntityProvenance(document);
  const verticalProperties = collectFloorPlanConstructionVerticalProperties(document);
  if (!sameIdSet(criticalIds, evidence.confirmedEntityIds)) {
    const confirmed = new Set(evidence.confirmedEntityIds);
    const critical = new Set(criticalIds);
    const missing = criticalIds.filter((id) => !confirmed.has(id));
    const unknown = evidence.confirmedEntityIds.filter((id) => !critical.has(id));
    throw new FloorPlanConstructionEvidenceError(
      [
        "Construction evidence does not cover the exact canonical geometry.",
        missing.length ? `Missing: ${missing.join(", ")}` : "",
        unknown.length ? `Unknown: ${unknown.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" ")
    );
  }
  const duplicateIds = evidence.confirmedEntityIds.filter(
    (id, index, values) => values.indexOf(id) !== index
  );
  if (duplicateIds.length) {
    throw new FloorPlanConstructionEvidenceError(
      `Construction evidence repeats entity IDs: ${[...new Set(duplicateIds)].join(", ")}`
    );
  }
  const measurementKeys = evidence.measurements.map(
    (entry) => `${entry.entityId}\u0000${entry.property}`
  );
  const duplicateMeasurementKeys = measurementKeys.filter(
    (key, index, values) => values.indexOf(key) !== index
  );
  if (duplicateMeasurementKeys.length) {
    throw new FloorPlanConstructionEvidenceError(
      "Construction evidence repeats an entity/property measurement pair."
    );
  }
  const allowedMeasurementKeys = new Set([
    ...positionClaims.map((claim) => `${claim.entityId}\u0000position`),
    ...scalarClaims.map((claim) => `${claim.entityId}\u0000${claim.property}`),
    ...verticalProperties.map((property) => `${property.id}\u0000${property.property}`),
  ]);
  const unknownMeasurements = evidence.measurements.filter(
    (entry) => !allowedMeasurementKeys.has(`${entry.entityId}\u0000${entry.property}`)
  );
  if (unknownMeasurements.length) {
    throw new FloorPlanConstructionEvidenceError(
      `Construction measurements reference unknown or unsupported geometry properties: ${[
        ...new Set(
          unknownMeasurements.map((entry) => `${entry.entityId}.${entry.property}`)
        ),
      ].join(", ")}`
    );
  }
  for (const claim of positionClaims) {
    const measurement = evidence.measurements.find(
      (entry) => entry.entityId === claim.entityId && entry.property === "position"
    );
    if (
      measurement?.property === "position" &&
      !sameCoordinates(measurement.coordinatesMm, claim.coordinatesMm)
    ) {
      throw new FloorPlanConstructionEvidenceError(
        `Construction position ${claim.entityId} does not exactly match the canonical coordinate signature.`
      );
    }
    const expectedBasis = floorPlanConstructionBasisForKind(evidence.kind);
    const hasDirectSourceGeometry = criticalProvenance
      .get(claim.entityId)
      ?.evidence.some(
        (entry) =>
          entry.sourceId === durableSource.id && entry.basis === expectedBasis
      );
    if (!hasDirectSourceGeometry && measurement?.property !== "position") {
      throw new FloorPlanConstructionEvidenceError(
        `Construction geometry ${claim.entityId} is not tied to source ${durableSource.id}; add direct ${expectedBasis} provenance or its exact coordinate signature.`
      );
    }
  }
  for (const claim of scalarClaims) {
    const measurement = evidence.measurements.find(
      (entry) => entry.entityId === claim.entityId && entry.property === claim.property
    );
    if (measurement && measurement.property !== "position" && measurement.valueMm !== claim.valueMm) {
      throw new FloorPlanConstructionEvidenceError(
        `Construction measurement ${claim.entityId}.${claim.property} must equal ${claim.valueMm} mm exactly.`
      );
    }
    if (!measurement || measurement.property === "position") {
      throw new FloorPlanConstructionEvidenceError(
        `Construction manifest must record ${claim.entityId}.${claim.property}=${claim.valueMm} mm exactly.`
      );
    }
  }
  const expectedPropertyEvidence = floorPlanConstructionPropertyEvidenceForKind(
    evidence.kind
  );
  for (const property of verticalProperties) {
    if (property.evidence !== expectedPropertyEvidence) {
      throw new FloorPlanConstructionEvidenceError(
        `${property.path} is labelled ${property.evidence}; ${evidence.kind} construction evidence requires ${expectedPropertyEvidence}.`
      );
    }
    const propertyMeasurements = evidence.measurements.filter(
      (entry) => entry.entityId === property.id
    );
    const contradictoryMeasurement = propertyMeasurements.find(
      (entry) =>
        entry.property !== property.property || entry.valueMm !== property.valueMm
    );
    if (contradictoryMeasurement) {
      throw new FloorPlanConstructionEvidenceError(
        `Construction measurement ${property.id} must record ${property.property}=${property.valueMm} mm exactly.`
      );
    }
    const hasExactMeasurement = propertyMeasurements.some(
      (entry) =>
        entry.property === property.property && entry.valueMm === property.valueMm
    );
    const hasDirectEvidence = floorPlanVerticalPropertyHasDirectConstructionEvidence({
      property,
      sourceId: durableSource.id,
      kind: evidence.kind,
    });
    if (!hasDirectEvidence && !hasExactMeasurement) {
      throw new FloorPlanConstructionEvidenceError(
        `${property.path} is not tied to construction source ${durableSource.id}; add direct provenance or exact measurement ${property.id}.`
      );
    }
  }
  if (evidence.kind === "site_measurement") {
    const missingPositions = positionClaims.filter(
      (claim) =>
        !evidence.measurements.some(
          (entry) => entry.entityId === claim.entityId && entry.property === "position"
        )
    );
    if (missingPositions.length) {
      throw new FloorPlanConstructionEvidenceError(
        `Site measurements must record exact coordinates for every critical geometry entity. Missing: ${missingPositions
          .map((claim) => claim.entityId)
          .join(", ")}`
      );
    }
    const missingScalars = scalarClaims.filter(
      (claim) =>
        !evidence.measurements.some(
          (entry) =>
            entry.entityId === claim.entityId && entry.property === claim.property
        )
    );
    if (missingScalars.length) {
      throw new FloorPlanConstructionEvidenceError(
        `Site measurements must record every authored width, thickness and dimension. Missing: ${missingScalars
          .map((claim) => `${claim.entityId}.${claim.property}`)
          .join(", ")}`
      );
    }
  }
  return evidence;
}
