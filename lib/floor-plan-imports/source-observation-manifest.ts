import { z } from "zod";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanRenderedPage } from "./types";
import {
  collectFloorPlanCanonicalObservationTargets,
  validateFloorPlanObservationTargetIntegrity,
} from "./source-observation-integrity";

export const FLOOR_PLAN_SOURCE_OBSERVATION_SCHEMA_VERSION = 1 as const;

export const floorPlanSourceObservationKindSchema = z.enum([
  "wall",
  "opening",
  "structure",
  "label",
  "dimension",
]);

const cropSchema = z.object({
  xPx: z.number().finite().min(0).max(100_000),
  yPx: z.number().finite().min(0).max(100_000),
  widthPx: z.number().finite().positive().max(100_000),
  heightPx: z.number().finite().positive().max(100_000),
}).strict();

const anchorSchema = z.object({
  role: z.enum(["start", "midpoint", "end", "center", "label"]),
  xPx: z.number().finite().min(0).max(100_000),
  yPx: z.number().finite().min(0).max(100_000),
}).strict();

export const floorPlanSourceObservationSchema = z.object({
  id: z.string().trim().min(1).max(160),
  kind: floorPlanSourceObservationKindSchema,
  floorId: z.string().trim().min(1).max(160),
  canonicalEntityId: z.string().trim().min(1).max(160),
  pageNumber: z.number().int().positive().max(10_000),
  cropPx: cropSchema,
  anchorsPx: z.array(anchorSchema).min(1).max(32),
  observedText: z.string().trim().min(1).max(1_000).optional(),
  measuredMm: z.number().int().positive().max(10_000_000).optional(),
  reviewerNote: z.string().trim().max(2_000).optional(),
}).strict().superRefine((observation, context) => {
  if (
    ["wall", "opening", "dimension"].includes(observation.kind) &&
    observation.anchorsPx.length < 2
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["anchorsPx"],
      message: `${observation.kind} observations require at least two source anchors`,
    });
  }
  if (
    ["label", "dimension"].includes(observation.kind) &&
    !observation.observedText
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["observedText"],
      message: `${observation.kind} observations require the exact visible text`,
    });
  }
  if (observation.kind === "dimension" && observation.measuredMm === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["measuredMm"],
      message: "Dimension observations require the printed value in millimetres",
    });
  }
});

const floorPlanSourceObservationSubmissionObjectSchema = z.object({
  schemaVersion: z.literal(FLOOR_PLAN_SOURCE_OBSERVATION_SCHEMA_VERSION),
  rightsEvidence: z.object({
    status: z.enum(["licensed", "permission_confirmed", "public_domain"]),
    basis: z.string().trim().min(10).max(4_000),
    evidenceReference: z.string().trim().min(3).max(1_000),
    permitsDerivedFloorPlanPublication: z.literal(true),
    sourceAssetRedistributionAllowed: z.boolean(),
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  }).strict(),
  reviewerNotes: z.string().trim().min(10).max(10_000),
  observations: z.array(floorPlanSourceObservationSchema).min(1).max(50_000),
}).strict();

function validateObservationManifestUniqueness(
  manifest: z.infer<typeof floorPlanSourceObservationSubmissionObjectSchema>,
  context: z.RefinementCtx
) {
  const ids = new Set<string>();
  const targets = new Set<string>();
  manifest.observations.forEach((observation, index) => {
    if (ids.has(observation.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["observations", index, "id"],
        message: "Observation IDs must be unique",
      });
    }
    ids.add(observation.id);
    const target = `${observation.floorId}:${observation.canonicalEntityId}`;
    if (targets.has(target)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["observations", index, "canonicalEntityId"],
        message: "Each canonical entity may be mapped by exactly one observation",
      });
    }
    targets.add(target);
  });
  if (Buffer.byteLength(JSON.stringify(manifest), "utf8") > 2 * 1024 * 1024) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Source observation manifest is larger than 2 MB",
    });
  }
}

export const floorPlanSourceObservationSubmissionSchema =
  floorPlanSourceObservationSubmissionObjectSchema.superRefine(
    validateObservationManifestUniqueness
  );

export const floorPlanSourceObservationManifestSchema =
  floorPlanSourceObservationSubmissionObjectSchema.extend({
    source: z.object({
      assetId: z.string().trim().min(1).max(200),
      sha256: z.string().regex(/^[a-f0-9]{64}$/i),
      mimeType: z.string().trim().min(1).max(160),
    }).strict(),
    candidateVersion: z.number().int().nonnegative(),
    recordedByReviewerId: z.string().trim().min(3).max(320),
    recordedAt: z.string().datetime({ offset: true }),
  }).strict().superRefine(validateObservationManifestUniqueness);

export type FloorPlanSourceObservation = z.infer<
  typeof floorPlanSourceObservationSchema
>;
export type FloorPlanSourceObservationSubmission = z.infer<
  typeof floorPlanSourceObservationSubmissionSchema
>;
export type FloorPlanSourceObservationManifest = z.infer<
  typeof floorPlanSourceObservationManifestSchema
>;

export type FloorPlanSourceObservationIssue = {
  code: string;
  message: string;
  observationId?: string;
  canonicalEntityId?: string;
};

function pageMap(renderedPages: readonly FloorPlanRenderedPage[]) {
  return new Map(renderedPages.map((page) => [page.pageNumber, page]));
}

function withinPage(value: number, size: number) {
  return Number.isFinite(value) && value >= 0 && value <= size;
}

export function validateFloorPlanSourceObservationBounds(input: {
  manifest: FloorPlanSourceObservationManifest;
  renderedPages: readonly FloorPlanRenderedPage[];
}): FloorPlanSourceObservationIssue[] {
  const pages = pageMap(input.renderedPages);
  return input.manifest.observations.flatMap((observation) => {
    const page = pages.get(observation.pageNumber);
    if (!page) {
      return [{
        code: "OBSERVATION_PAGE_MISSING",
        message: `Source page ${observation.pageNumber} is not a durable rendered page`,
        observationId: observation.id,
      }];
    }
    const crop = observation.cropPx;
    const cropValid =
      withinPage(crop.xPx, page.widthPx) &&
      withinPage(crop.yPx, page.heightPx) &&
      crop.xPx + crop.widthPx <= page.widthPx &&
      crop.yPx + crop.heightPx <= page.heightPx;
    const anchorsValid = observation.anchorsPx.every(
      (anchor) =>
        withinPage(anchor.xPx, page.widthPx) &&
        withinPage(anchor.yPx, page.heightPx) &&
        anchor.xPx >= crop.xPx &&
        anchor.xPx <= crop.xPx + crop.widthPx &&
        anchor.yPx >= crop.yPx &&
        anchor.yPx <= crop.yPx + crop.heightPx
    );
    return cropValid && anchorsValid
      ? []
      : [{
          code: "OBSERVATION_OUT_OF_BOUNDS",
          message: "Observation crop and anchors must stay inside their rendered page and crop",
          observationId: observation.id,
        }];
  });
}

function referencedVertexIds(document: FloorPlanDocumentV2) {
  return new Set(document.floors.flatMap((floor) => [
    ...floor.walls.flatMap((wall) => [
      wall.path.startVertexId,
      wall.path.endVertexId,
      ...(wall.path.kind === "arc" ? [wall.path.centerVertexId] : []),
    ]),
    ...floor.structures.flatMap((structure) => structure.vertexIds),
    ...floor.dimensions.flatMap((dimension) => [
      dimension.fromVertexId,
      dimension.toVertexId,
    ]),
  ]));
}

export function evaluateFloorPlanSourceObservationCompleteness(input: {
  document: FloorPlanDocumentV2;
  manifest: FloorPlanSourceObservationManifest;
  sourceAsset: { id: string; sha256: string; mimeType: string };
  renderedPages: readonly FloorPlanRenderedPage[];
  now?: Date;
}) {
  const issues: FloorPlanSourceObservationIssue[] = [];
  if (
    input.manifest.source.assetId !== input.sourceAsset.id ||
    input.manifest.source.sha256.toLowerCase() !== input.sourceAsset.sha256.toLowerCase() ||
    input.manifest.source.mimeType !== input.sourceAsset.mimeType
  ) {
    issues.push({
      code: "OBSERVATION_SOURCE_MISMATCH",
      message: "Observation manifest is not bound to the immutable primary source asset",
    });
  }
  const expiresAt = input.manifest.rightsEvidence.expiresAt;
  if (expiresAt && new Date(expiresAt).getTime() <= (input.now ?? new Date()).getTime()) {
    issues.push({ code: "PUBLICATION_RIGHTS_EXPIRED", message: "Source publication rights have expired" });
  }
  issues.push(...validateFloorPlanSourceObservationBounds({
    manifest: input.manifest,
    renderedPages: input.renderedPages,
  }));

  const targets = collectFloorPlanCanonicalObservationTargets(input.document);
  const targetsByKey = new Map(
    targets.map((target) => [`${target.floorId}:${target.entityId}`, target])
  );
  const observedKeys = new Set<string>();
  for (const observation of input.manifest.observations) {
    const key = `${observation.floorId}:${observation.canonicalEntityId}`;
    const target = targetsByKey.get(key);
    observedKeys.add(key);
    if (!target) {
      issues.push({
        code: "OBSERVATION_TARGET_MISSING",
        message: "Observation maps to no canonical critical entity",
        observationId: observation.id,
        canonicalEntityId: observation.canonicalEntityId,
      });
    } else if (target.kind !== observation.kind) {
      issues.push({
        code: "OBSERVATION_TARGET_KIND_MISMATCH",
        message: `Observed ${observation.kind} cannot map to canonical ${target.kind}`,
        observationId: observation.id,
        canonicalEntityId: observation.canonicalEntityId,
      });
    } else if (
      observation.kind === "dimension" &&
      observation.measuredMm !== target.measuredMm
    ) {
      issues.push({
        code: "OBSERVED_DIMENSION_MISMATCH",
        message: `Printed dimension ${observation.measuredMm} mm does not equal canonical ${target.measuredMm} mm`,
        observationId: observation.id,
        canonicalEntityId: observation.canonicalEntityId,
      });
    } else {
      issues.push(...validateFloorPlanObservationTargetIntegrity({
        observation,
        target,
        sourceId: input.sourceAsset.id,
      }));
    }
  }
  for (const target of targets) {
    const key = `${target.floorId}:${target.entityId}`;
    if (!observedKeys.has(key)) {
      issues.push({
        code: "CANONICAL_CRITICAL_ENTITY_UNOBSERVED",
        message: `Canonical ${target.kind} has no independent source observation`,
        canonicalEntityId: target.entityId,
      });
    }
  }

  const referenced = referencedVertexIds(input.document);
  for (const floor of input.document.floors) {
    for (const vertex of floor.vertices) {
      if (!referenced.has(vertex.id)) {
        issues.push({
          code: "CANONICAL_VERTEX_UNACCOUNTED",
          message: "Canonical vertex is not part of any observed critical entity",
          canonicalEntityId: vertex.id,
        });
      }
    }
  }
  return {
    passed: issues.length === 0,
    issues,
    observationCount: input.manifest.observations.length,
    canonicalTargetCount: targets.length,
  };
}

export function stampFloorPlanSourceObservationManifest(input: {
  submitted: FloorPlanSourceObservationSubmission;
  sourceAsset: { id: string; sha256: string; mimeType: string };
  candidateVersion: number;
  reviewerId: string;
  recordedAt: string;
}): FloorPlanSourceObservationManifest {
  return floorPlanSourceObservationManifestSchema.parse({
    ...input.submitted,
    source: {
      assetId: input.sourceAsset.id,
      sha256: input.sourceAsset.sha256,
      mimeType: input.sourceAsset.mimeType,
    },
    candidateVersion: input.candidateVersion,
    recordedByReviewerId: input.reviewerId,
    recordedAt: input.recordedAt,
  });
}

export function assertFloorPlanSourceObservationsComplete(
  result: ReturnType<typeof evaluateFloorPlanSourceObservationCompleteness>
) {
  if (result.passed) return;
  const summary = result.issues
    .slice(0, 8)
    .map((issue) => `${issue.code}${issue.canonicalEntityId ? `:${issue.canonicalEntityId}` : ""}`)
    .join(", ");
  throw new Error(`FLOOR_PLAN_SOURCE_OBSERVATIONS_INCOMPLETE: ${summary}`);
}
