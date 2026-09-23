import { canonicalJson } from "./json";

export type FloorPlanRevisionLifecycleStatus =
  | "draft"
  | "approved"
  | "published"
  | "retired";

const CANONICAL_REVISION_FIELDS = [
  "id",
  "sourceJobId",
  "geometryHash",
  "documentJson",
  "sourceManifestJson",
  "constructionEvidenceJson",
  "verificationTier",
] as const;

type CanonicalRevisionField = (typeof CANONICAL_REVISION_FIELDS)[number];

export type FloorPlanRevisionMutation = Partial<
  Record<CanonicalRevisionField, unknown> & {
    publicationStatus: FloorPlanRevisionLifecycleStatus;
    approvedAt: Date | string | null;
    approvedByEmail: string | null;
    publishedAt: Date | string | null;
    publishedByEmail: string | null;
  }
>;

const APPROVAL_AUDIT_FIELDS = ["approvedAt", "approvedByEmail"] as const;
const PUBLICATION_AUDIT_FIELDS = ["publishedAt", "publishedByEmail"] as const;

function comparableLifecycleValue(value: unknown) {
  return value instanceof Date ? value.toISOString() : value ?? null;
}

export function assertFloorPlanRevisionMutationAllowed(
  current: FloorPlanRevisionMutation & { publicationStatus: FloorPlanRevisionLifecycleStatus },
  mutation: FloorPlanRevisionMutation
) {
  const immutable = ["approved", "published", "retired"].includes(
    current.publicationStatus
  );
  if (immutable) {
    for (const field of CANONICAL_REVISION_FIELDS) {
      if (
        Object.prototype.hasOwnProperty.call(mutation, field) &&
        canonicalJson(mutation[field]) !== canonicalJson(current[field])
      ) {
        throw new Error(
          `FLOOR_PLAN_REVISION_IMMUTABLE: ${field} cannot change after approval`
        );
      }
    }
  }

  const immutableAuditFields =
    current.publicationStatus === "approved"
      ? APPROVAL_AUDIT_FIELDS
      : current.publicationStatus === "published" || current.publicationStatus === "retired"
        ? [...APPROVAL_AUDIT_FIELDS, ...PUBLICATION_AUDIT_FIELDS]
        : [];
  for (const field of immutableAuditFields) {
    if (
      Object.prototype.hasOwnProperty.call(mutation, field) &&
      comparableLifecycleValue(mutation[field]) !== comparableLifecycleValue(current[field])
    ) {
      throw new Error(
        `FLOOR_PLAN_REVISION_IMMUTABLE: ${field} cannot change after it is recorded`
      );
    }
  }

  const nextStatus = mutation.publicationStatus ?? current.publicationStatus;
  if (
    current.publicationStatus === "approved" &&
    nextStatus !== "approved" &&
    nextStatus !== "published" &&
    nextStatus !== "retired"
  ) {
    throw new Error(
      "FLOOR_PLAN_REVISION_IMMUTABLE: an approved revision cannot return to draft"
    );
  }
  if (
    current.publicationStatus === "published" &&
    nextStatus !== "published" &&
    nextStatus !== "retired"
  ) {
    throw new Error(
      "FLOOR_PLAN_REVISION_IMMUTABLE: a published revision may only be retired"
    );
  }
  if (current.publicationStatus === "retired" && nextStatus !== "retired") {
    throw new Error(
      "FLOOR_PLAN_REVISION_IMMUTABLE: a retired revision cannot be reactivated"
    );
  }
}
