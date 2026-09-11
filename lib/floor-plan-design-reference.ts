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
  unitFloor: number | null;
  unitStack: string | null;
};

type RevisionLineage = {
  id: string;
  sourceJobId: string;
  geometryHash: string;
  publicationStatus: string;
  publishedAt: Date | null;
  verificationTier: string;
};

type AddressBindingLineage = {
  id: string;
  revisionId: string;
  transform: string;
  stack: string | null;
  floorMin: number | null;
  floorMax: number | null;
  revision: RevisionLineage;
};

export type FloorPlanDesignReferenceSyncErrorCode =
  | "DESIGN_NOT_OWNED"
  | "SOURCE_JOB_NOT_FOUND"
  | "SOURCE_JOB_NOT_OWNED"
  | "ADDRESS_BINDING_NOT_FOUND"
  | "LINEAGE_REVISION_MISMATCH"
  | "LINEAGE_SOURCE_JOB_MISMATCH"
  | "LINEAGE_SOURCE_HASH_MISMATCH"
  | "LINEAGE_GEOMETRY_HASH_MISMATCH"
  | "REVISION_NOT_ELIGIBLE"
  | "ADDRESS_UNIT_MISMATCH"
  | "ADDRESS_TRANSFORM_MISMATCH";

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

function unitFloor(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 99
    ? Number(value)
    : null;
}

function unitStack(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().toUpperCase();
  return /^\d{2,5}[A-Z]?$/.test(normalized) ? normalized : null;
}

function assertEligiblePublishedSelection(
  candidate: FloorPlanDesignReferenceCandidate,
  revision: RevisionLineage | null,
  binding: AddressBindingLineage | null,
  retained: boolean
) {
  if (
    revision && (
      (revision.publicationStatus !== "published" && !(retained && revision.publicationStatus === "retired")) ||
      !revision.publishedAt ||
      !["source_verified", "construction_verified"].includes(revision.verificationTier)
    )
  ) {
    throw new FloorPlanDesignReferenceSyncError("REVISION_NOT_ELIGIBLE");
  }
  assertSelectedUnit(candidate, binding, retained);
}

function assertSelectedUnit(
  candidate: FloorPlanDesignReferenceCandidate,
  binding: AddressBindingLineage | null,
  retained: boolean
) {
  if (!binding) return;
  if (retained && candidate.unitFloor === null && candidate.unitStack === null) return;
  if (
    candidate.unitFloor === null ||
    candidate.unitStack === null ||
    binding.stack?.toUpperCase() !== candidate.unitStack ||
    (binding.floorMin !== null && candidate.unitFloor < binding.floorMin) ||
    (binding.floorMax !== null && candidate.unitFloor > binding.floorMax)
  ) {
    throw new FloorPlanDesignReferenceSyncError("ADDRESS_UNIT_MISMATCH");
  }
  if (!candidate.transform || candidate.transform !== binding.transform) {
    throw new FloorPlanDesignReferenceSyncError("ADDRESS_TRANSFORM_MISMATCH");
  }
}

async function loadRevisionSelection(
  client: Prisma.TransactionClient,
  candidate: FloorPlanDesignReferenceCandidate
) {
  const binding = candidate.addressBindingId
    ? await client.floorPlanAddressBinding.findUnique({
        where: { id: candidate.addressBindingId },
        select: {
          id: true,
          revisionId: true,
          transform: true,
          stack: true,
          floorMin: true,
          floorMax: true,
          revision: {
            select: {
              id: true,
              sourceJobId: true,
              geometryHash: true,
              publicationStatus: true,
              publishedAt: true,
              verificationTier: true,
            },
          },
        },
      })
    : null;
  if (candidate.addressBindingId && !binding) {
    throw new FloorPlanDesignReferenceSyncError("ADDRESS_BINDING_NOT_FOUND");
  }

  let revision = candidate.revisionId
    ? await client.floorPlanRevision.findUnique({
        where: { id: candidate.revisionId },
        select: {
          id: true,
          sourceJobId: true,
          geometryHash: true,
          publicationStatus: true,
          publishedAt: true,
          verificationTier: true,
        },
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
  return { binding, revision };
}

function sourceHashMismatch(
  candidateHash: string | null,
  sourceJob: { sourceAsset: { sha256: string } } | null
) {
  return Boolean(
    candidateHash && sourceJob && sourceJob.sourceAsset.sha256 !== candidateHash
  );
}

async function loadValidatedSourceJob(input: {
  client: Prisma.TransactionClient;
  candidate: FloorPlanDesignReferenceCandidate;
  revision: RevisionLineage | null;
  ownerUserId: string;
}) {
  const sourceJobId = input.candidate.sourceJobId ?? input.revision?.sourceJobId ?? null;
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
  if (input.revision && sourceJob?.id !== input.revision.sourceJobId) {
    throw new FloorPlanDesignReferenceSyncError("LINEAGE_SOURCE_JOB_MISMATCH");
  }
  if (!input.revision && sourceJob && sourceJob.userId !== input.ownerUserId) {
    throw new FloorPlanDesignReferenceSyncError("SOURCE_JOB_NOT_OWNED");
  }
  if (sourceHashMismatch(input.candidate.sourceAssetSha256, sourceJob)) {
    throw new FloorPlanDesignReferenceSyncError("LINEAGE_SOURCE_HASH_MISMATCH");
  }
  if (
    input.candidate.geometryHash &&
    input.revision &&
    input.revision.geometryHash !== input.candidate.geometryHash
  ) {
    throw new FloorPlanDesignReferenceSyncError("LINEAGE_GEOMETRY_HASH_MISMATCH");
  }
  return sourceJob;
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
    unitFloor: unitFloor(binding?.unitFloor),
    unitStack: unitStack(binding?.unitStack),
  };
  return Object.values(result).some(Boolean) ? result : null;
}

async function isRetainedOwnedReference(input: {
  client: Prisma.TransactionClient; designId: string; previousSnapshot?: unknown;
}, candidate: FloorPlanDesignReferenceCandidate) {
  const previous = extractFloorPlanDesignReference(input.previousSnapshot);
  if (!previous || Object.entries(candidate).some(([key, value]) =>
    previous[key as keyof FloorPlanDesignReferenceCandidate] !== value)) return false;
  const existing = await input.client.floorPlanDesignReference.findUnique({
    where: { designId: input.designId },
  });
  if (!existing || !candidate.revisionId || !candidate.geometryHash) return false;
  const identityKeys = ["revisionId", "geometryHash", "addressBindingId", "transform"] as const;
  if (identityKeys.some((key) => existing[key] !== candidate[key])) return false;
  return ["sourceJobId", "sourceAssetSha256"].every((key) => {
    const field = key as "sourceJobId" | "sourceAssetSha256";
    return !candidate[field] || existing[field] === candidate[field];
  });
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
  /** Server-read pre-update snapshot; never supplied from the request body. */
  previousSnapshot?: unknown;
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

  const { binding, revision } = await loadRevisionSelection(input.client, candidate);
  assertEligiblePublishedSelection(candidate, revision, binding, await isRetainedOwnedReference(input, candidate));
  const sourceJob = await loadValidatedSourceJob({
    client: input.client,
    candidate,
    revision,
    ownerUserId: input.ownerUserId,
  });

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
