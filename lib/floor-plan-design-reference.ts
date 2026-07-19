import type { Prisma } from "@prisma/client";
import type { FloorPlanAddressTransform } from "./floor-plan-imports/types";

const SHA256 = /^[a-f0-9]{64}$/;
const TRANSFORMS = new Set<FloorPlanAddressTransform>([
  "normal",
  "mirror_x",
  "mirror_z",
  "rotate_90",
  "rotate_180",
  "rotate_270",
  "mirror_x_rotate_90",
  "mirror_x_rotate_270",
]);

export type FloorPlanDesignReferenceCandidate = {
  revisionId: string | null;
  sourceJobId: string | null;
  sourceAssetSha256: string | null;
  geometryHash: string | null;
  addressBindingId: string | null;
  transform: FloorPlanAddressTransform | null;
};

export type FloorPlanDesignReferenceSyncErrorCode =
  | "DESIGN_NOT_OWNED"
  | "SOURCE_JOB_NOT_FOUND"
  | "SOURCE_JOB_NOT_OWNED"
  | "ADDRESS_BINDING_NOT_FOUND"
  | "LINEAGE_REVISION_MISMATCH"
  | "LINEAGE_SOURCE_JOB_MISMATCH"
  | "LINEAGE_SOURCE_HASH_MISMATCH"
  | "LINEAGE_GEOMETRY_HASH_MISMATCH";

export class FloorPlanDesignReferenceSyncError extends Error {
  constructor(public readonly code: FloorPlanDesignReferenceSyncErrorCode) {
    super(code);
    this.name = "FloorPlanDesignReferenceSyncError";
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function identifier(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 191 ? normalized : null;
}

function hash(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return SHA256.test(normalized) ? normalized : null;
}

/**
 * Extracts only indexed lineage fields from a design snapshot. Callers must
 * still verify revision/job ownership and existence before persisting foreign
 * keys; shared snapshots intentionally use synthetic revision IDs.
 */
export function extractFloorPlanDesignReference(
  snapshot: unknown
): FloorPlanDesignReferenceCandidate | null {
  const root = record(snapshot);
  const floorPlan = record(root?.floorPlan);
  if (!floorPlan) return null;
  const underlay = record(floorPlan.underlay);
  const binding = record(floorPlan.addressBinding);
  const transformValue = floorPlan.addressTransform ?? binding?.transform;
  const transform =
    typeof transformValue === "string" &&
    TRANSFORMS.has(transformValue as FloorPlanAddressTransform)
      ? (transformValue as FloorPlanAddressTransform)
      : null;
  const result: FloorPlanDesignReferenceCandidate = {
    revisionId: identifier(floorPlan.revisionId),
    sourceJobId:
      identifier(floorPlan.sourceJobId) ?? identifier(underlay?.sourceJobId),
    sourceAssetSha256:
      hash(floorPlan.sourceAssetSha256) ?? hash(underlay?.sourceAssetSha256),
    geometryHash:
      hash(floorPlan.sourceRevisionGeometryHash) ??
      hash(floorPlan.canonicalGeometryHash),
    addressBindingId: identifier(binding?.bindingId),
    transform,
  };
  return Object.values(result).some(Boolean) ? result : null;
}

/**
 * Projects validated floor-plan lineage out of the saved snapshot inside the
 * same transaction as the Design write. A private import job must belong to
 * the design owner. A public revision may originate from an admin-owned job,
 * but its job, geometry and binding must agree with the immutable revision.
 * Synthetic document revision IDs are deliberately ignored only when an
 * owner-scoped private import job provides the durable lineage instead.
 */
export async function syncFloorPlanDesignReference(input: {
  client: Prisma.TransactionClient;
  designId: string;
  ownerUserId: string;
  snapshot: unknown;
}) {
  const design = await input.client.design.findFirst({
    where: { id: input.designId, userId: input.ownerUserId },
    select: { id: true },
  });
  if (!design) {
    throw new FloorPlanDesignReferenceSyncError("DESIGN_NOT_OWNED");
  }

  const candidate = extractFloorPlanDesignReference(input.snapshot);
  if (!candidate) {
    await input.client.floorPlanDesignReference.deleteMany({
      where: { designId: input.designId },
    });
    return null;
  }

  const binding = candidate.addressBindingId
    ? await input.client.floorPlanAddressBinding.findUnique({
        where: { id: candidate.addressBindingId },
        select: {
          id: true,
          revisionId: true,
          transform: true,
          revision: {
            select: { id: true, sourceJobId: true, geometryHash: true },
          },
        },
      })
    : null;
  if (candidate.addressBindingId && !binding) {
    throw new FloorPlanDesignReferenceSyncError("ADDRESS_BINDING_NOT_FOUND");
  }

  let revision = candidate.revisionId
    ? await input.client.floorPlanRevision.findUnique({
        where: { id: candidate.revisionId },
        select: { id: true, sourceJobId: true, geometryHash: true },
      })
    : null;
  if (binding) {
    if (candidate.revisionId && candidate.revisionId !== binding.revisionId) {
      throw new FloorPlanDesignReferenceSyncError("LINEAGE_REVISION_MISMATCH");
    }
    if (revision && revision.id !== binding.revisionId) {
      throw new FloorPlanDesignReferenceSyncError("LINEAGE_REVISION_MISMATCH");
    }
    revision = binding.revision;
  }
  const sourceJobId = candidate.sourceJobId ?? revision?.sourceJobId ?? null;
  const sourceJob = sourceJobId
    ? await input.client.floorPlanImportJob.findUnique({
        where: { id: sourceJobId },
        select: {
          id: true,
          userId: true,
          sourceAsset: { select: { sha256: true } },
        },
      })
    : null;
  if (sourceJobId && !sourceJob) {
    throw new FloorPlanDesignReferenceSyncError("SOURCE_JOB_NOT_FOUND");
  }
  if (revision && sourceJob?.id !== revision.sourceJobId) {
    throw new FloorPlanDesignReferenceSyncError("LINEAGE_SOURCE_JOB_MISMATCH");
  }
  if (!revision && sourceJob && sourceJob.userId !== input.ownerUserId) {
    throw new FloorPlanDesignReferenceSyncError("SOURCE_JOB_NOT_OWNED");
  }
  if (
    candidate.sourceAssetSha256 &&
    sourceJob &&
    sourceJob.sourceAsset.sha256 !== candidate.sourceAssetSha256
  ) {
    throw new FloorPlanDesignReferenceSyncError("LINEAGE_SOURCE_HASH_MISMATCH");
  }
  if (
    candidate.geometryHash &&
    revision &&
    revision.geometryHash !== candidate.geometryHash
  ) {
    throw new FloorPlanDesignReferenceSyncError("LINEAGE_GEOMETRY_HASH_MISMATCH");
  }

  // A local canonical document with only synthetic IDs is not durable lineage.
  if (!revision && !sourceJob && !binding) {
    await input.client.floorPlanDesignReference.deleteMany({
      where: { designId: input.designId },
    });
    return null;
  }

  const data = {
    revisionId: revision?.id ?? null,
    sourceJobId: sourceJob?.id ?? null,
    sourceAssetSha256: sourceJob?.sourceAsset.sha256 ?? null,
    geometryHash: revision?.geometryHash ?? candidate.geometryHash ?? null,
    addressBindingId: binding?.id ?? null,
    transform: candidate.transform ?? binding?.transform ?? null,
  };
  return input.client.floorPlanDesignReference.upsert({
    where: { designId: input.designId },
    create: { designId: input.designId, ...data },
    update: data,
  });
}
