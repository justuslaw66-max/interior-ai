import { hashCanonicalJson } from "./json";
import type { FloorPlanRevisionLifecycleStatus } from "./revision-immutability";

export type FloorPlanRevisionAuditEventType =
  | "revision_approved"
  | "revision_published"
  | "revision_retired";

export type AuditedFloorPlanAddressBinding = {
  id?: string;
  countryCode: string;
  addressNormalized: string;
  block: string;
  street: string;
  postalCode?: string | null;
  stack?: string | null;
  floorMin?: number | null;
  floorMax?: number | null;
  transform: string;
  sourceEvidenceJson?: unknown;
  sourceEvidence?: unknown;
};

type RevisionAuditSourceAsset = {
  id: string;
  sha256: string;
  mimeType: string;
  fileName?: string | null;
};

export type BuildFloorPlanRevisionAuditRecordInput = {
  eventType: FloorPlanRevisionAuditEventType;
  revisionId: string;
  sourceJobId: string;
  actorEmail: string | null;
  occurredAt: Date;
  previousStatus: FloorPlanRevisionLifecycleStatus | null;
  nextStatus: FloorPlanRevisionLifecycleStatus;
  geometryHash: string;
  sourceManifest: unknown;
  constructionEvidence?: unknown;
  sourceAsset: RevisionAuditSourceAsset;
  addressBindings: readonly AuditedFloorPlanAddressBinding[];
  candidateVersion?: number | null;
  supersedesRevisionId?: string | null;
  replacementRevisionId?: string | null;
  lifecycleReason?: string | null;
};

function nullableString(value: string | null | undefined) {
  return value?.trim() || null;
}

function nullableInteger(value: number | null | undefined) {
  return Number.isInteger(value) ? value! : null;
}

/**
 * Copies the complete address selector and its evidence into an append-only
 * lifecycle event. The revision owns the live rows; this snapshot is the
 * durable explanation of exactly what an administrator approved or published.
 */
export function snapshotFloorPlanAddressBindings(
  bindings: readonly AuditedFloorPlanAddressBinding[]
) {
  return bindings
    .map((binding) => ({
      id: nullableString(binding.id),
      countryCode: binding.countryCode.trim().toUpperCase(),
      addressNormalized: binding.addressNormalized.trim(),
      block: binding.block.trim(),
      street: binding.street.trim(),
      postalCode: nullableString(binding.postalCode),
      stack: nullableString(binding.stack),
      floorMin: nullableInteger(binding.floorMin),
      floorMax: nullableInteger(binding.floorMax),
      transform: binding.transform,
      sourceEvidence:
        binding.sourceEvidenceJson === undefined
          ? binding.sourceEvidence ?? null
          : binding.sourceEvidenceJson,
    }))
    .sort((left, right) => {
      const leftKey = `${left.countryCode}|${left.addressNormalized}|${left.stack ?? ""}|${
        left.floorMin ?? ""
      }|${left.floorMax ?? ""}|${left.transform}|${left.id ?? ""}`;
      const rightKey = `${right.countryCode}|${right.addressNormalized}|${right.stack ?? ""}|${
        right.floorMin ?? ""
      }|${right.floorMax ?? ""}|${right.transform}|${right.id ?? ""}`;
      return leftKey.localeCompare(rightKey);
    });
}

export function buildFloorPlanRevisionAuditRecord(
  input: BuildFloorPlanRevisionAuditRecordInput
) {
  const actorEmail = nullableString(input.actorEmail);
  const addressBindings = snapshotFloorPlanAddressBindings(input.addressBindings);
  return {
    revisionId: input.revisionId,
    eventType: input.eventType,
    actorEmail,
    occurredAt: input.occurredAt,
    sourceEvidence: {
      sourceAsset: {
        id: input.sourceAsset.id,
        sha256: input.sourceAsset.sha256,
        mimeType: input.sourceAsset.mimeType,
        fileName: nullableString(input.sourceAsset.fileName),
      },
      sourceJobId: input.sourceJobId,
      sourceManifestHash: hashCanonicalJson(input.sourceManifest),
      constructionEvidenceHash:
        input.constructionEvidence == null
          ? null
          : hashCanonicalJson(input.constructionEvidence),
      addressBindings,
    },
    metadata: {
      previousStatus: input.previousStatus,
      nextStatus: input.nextStatus,
      geometryHash: input.geometryHash,
      candidateVersion: Number.isInteger(input.candidateVersion)
        ? input.candidateVersion!
        : null,
      addressBindingCount: addressBindings.length,
      ...(nullableString(input.supersedesRevisionId)
        ? { supersedesRevisionId: nullableString(input.supersedesRevisionId) }
        : {}),
      ...(nullableString(input.replacementRevisionId)
        ? { replacementRevisionId: nullableString(input.replacementRevisionId) }
        : {}),
      ...(nullableString(input.lifecycleReason)
        ? { lifecycleReason: nullableString(input.lifecycleReason) }
        : {}),
    },
  };
}

/**
 * Address selectors are part of an approved revision's evidence record. A
 * correction is represented by approving a new revision, never by rewriting
 * or deleting the old binding in place.
 */
export function assertFloorPlanAddressBindingMutationAllowed(
  revisionStatus: FloorPlanRevisionLifecycleStatus,
  operation: "update" | "delete"
) {
  if (revisionStatus === "draft") return;
  throw new Error(
    `FLOOR_PLAN_ADDRESS_BINDING_IMMUTABLE: cannot ${operation} an address binding ` +
      `on a ${revisionStatus} revision; create a new revision for the correction`
  );
}
