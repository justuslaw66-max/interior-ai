import type { FloorPlanOpeningV2, FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";
import { floorPlanPropertyEvidenceIsEditable } from "@/lib/floor-plan-property-evidence";
import type {
  FloorPlanOpeningEvidenceFieldV2, FloorPlanOpeningMutationPurposeV2,
  FloorPlanOpeningOverrideAuthorizationV2,
  FloorPlanOpeningReviewedOverrideV2,
} from "@/lib/floor-plan-opening-override-authorization";
export {
  appendFloorPlanOpeningOverrideAuditV2,
  type FloorPlanOpeningEvidenceFieldV2, type FloorPlanOpeningMutationPurposeV2,
  type FloorPlanOpeningOverrideAuthorizationV2,
  type FloorPlanOpeningOverrideFieldAuthorizationV2,
  type FloorPlanOpeningReviewedOverrideV2,
} from "@/lib/floor-plan-opening-override-authorization";

export type FloorPlanOpeningPolicyChangesV2 = Partial<
  Pick<
    FloorPlanOpeningV2,
    | "kind"
    | "widthMm"
    | "widthEvidence"
    | "heightMm"
    | "heightEvidence"
    | "sillHeightMm"
    | "sillHeightEvidence"
  >
>;

export type FloorPlanOpeningMutationFieldPlanV2 = {
  currentRawValueMm: number | undefined;
  proposedRawValueMm: number | undefined;
  currentEvidence: FloorPlanPropertyEvidenceV2;
  proposedEvidence: FloorPlanPropertyEvidenceV2 | undefined;
  valueChanged: boolean;
  evidenceChanged: boolean;
  requiresOverride: boolean;
};

export type FloorPlanOpeningMutationPolicyPlanV2 = {
  status: "applied" | "blocked" | "requires_override" | "invalid";
  fields: Record<
    FloorPlanOpeningEvidenceFieldV2,
    FloorPlanOpeningMutationFieldPlanV2
  >;
  changes: FloorPlanOpeningPolicyChangesV2 | null;
  explanation: string | null;
  auditNote: string | null;
};

type OpeningMutationFields = FloorPlanOpeningMutationPolicyPlanV2["fields"];

type FieldDefinition = {
  valueKey: "widthMm" | "heightMm" | "sillHeightMm";
  evidenceKey: "widthEvidence" | "heightEvidence" | "sillHeightEvidence";
};

const FIELD_DEFINITIONS: Record<FloorPlanOpeningEvidenceFieldV2, FieldDefinition> = {
  width: { valueKey: "widthMm", evidenceKey: "widthEvidence" },
  height: { valueKey: "heightMm", evidenceKey: "heightEvidence" },
  sill: { valueKey: "sillHeightMm", evidenceKey: "sillHeightEvidence" },
};

const has = (value: object, key: PropertyKey) => Object.hasOwn(value, key);

function defaultChangedEvidence(
  field: FloorPlanOpeningEvidenceFieldV2,
  proposedValueMm: number | undefined
): FloorPlanPropertyEvidenceV2 | undefined {
  if (field !== "width" && proposedValueMm === undefined) return undefined;
  return "assumed";
}

function validateRawValue(
  field: FloorPlanOpeningEvidenceFieldV2,
  valueMm: number | undefined
): string | null {
  if (valueMm === undefined && field !== "width") return null;
  if (!Number.isSafeInteger(valueMm)) {
    return `${field} must be an integer millimetre value.`;
  }
  if (field === "sill" ? valueMm! < 0 : valueMm! <= 0) {
    return `${field} must be ${field === "sill" ? "non-negative" : "positive"}.`;
  }
  return null;
}

function dependentKindChanges(
  opening: Pick<FloorPlanOpeningV2, "kind" | "sillHeightMm">,
  changes: FloorPlanOpeningPolicyChangesV2
): FloorPlanOpeningPolicyChangesV2 {
  if (
    opening.kind === "window" &&
    changes.kind === "door" &&
    opening.sillHeightMm !== undefined &&
    opening.sillHeightMm !== 0
  ) {
    return {
      ...changes,
      sillHeightMm: 0,
      sillHeightEvidence: changes.sillHeightEvidence ?? "user_confirmed",
    };
  }
  return { ...changes };
}

function fieldPlan(
  opening: FloorPlanOpeningV2,
  changes: FloorPlanOpeningPolicyChangesV2,
  field: FloorPlanOpeningEvidenceFieldV2
): FloorPlanOpeningMutationFieldPlanV2 {
  const definition = FIELD_DEFINITIONS[field];
  const currentRawValueMm = opening[definition.valueKey];
  const currentEvidence = opening[definition.evidenceKey] ?? "assumed";
  const valueSupplied = has(changes, definition.valueKey);
  const evidenceSupplied = has(changes, definition.evidenceKey);
  const proposedRawValueMm = valueSupplied
    ? changes[definition.valueKey]
    : currentRawValueMm;
  const valueChanged = proposedRawValueMm !== currentRawValueMm;
  const proposedEvidence = evidenceSupplied
    ? changes[definition.evidenceKey]
    : valueChanged
      ? defaultChangedEvidence(field, proposedRawValueMm)
      : currentEvidence;
  const evidenceChanged = proposedEvidence !== currentEvidence;
  return {
    currentRawValueMm,
    proposedRawValueMm,
    currentEvidence,
    proposedEvidence,
    valueChanged,
    evidenceChanged,
    requiresOverride:
      !floorPlanPropertyEvidenceIsEditable(currentEvidence) &&
      (valueChanged || evidenceChanged),
  };
}

function emptyInvalidPlan(
  fields: OpeningMutationFields,
  explanation: string
): FloorPlanOpeningMutationPolicyPlanV2 {
  return {
    status: "invalid",
    fields,
    changes: null,
    explanation,
    auditNote: null,
  };
}

function planUnprotectedChanges(
  changes: FloorPlanOpeningPolicyChangesV2,
  fields: OpeningMutationFields
): FloorPlanOpeningMutationPolicyPlanV2 {
  for (const field of ["width", "height", "sill"] as const) {
    const plan = fields[field];
    if (!plan.valueChanged) continue;
    const definition = FIELD_DEFINITIONS[field];
    changes[definition.evidenceKey] = plan.proposedEvidence;
  }
  return {
    status: "applied",
    fields,
    changes,
    explanation: null,
    auditNote: null,
  };
}

function blockedProtectedPlan(
  fields: OpeningMutationFields,
  explanation: string
): FloorPlanOpeningMutationPolicyPlanV2 {
  return { status: "blocked", fields, changes: null, explanation, auditNote: null };
}

type ProtectedAuthorizationInput = {
  opening: FloorPlanOpeningV2;
  changes: FloorPlanOpeningPolicyChangesV2;
  fields: OpeningMutationFields;
  protectedChanges: FloorPlanOpeningEvidenceFieldV2[];
  mutationPurpose: FloorPlanOpeningMutationPurposeV2;
  actorId: string;
  authorization: FloorPlanOpeningOverrideAuthorizationV2;
};

function validateAuthorizationIdentity(input: ProtectedAuthorizationInput): string | null {
  const authorization = input.authorization;
  if (
    authorization.schemaVersion !== "floor-plan-opening-override/v1" ||
    authorization.authorizationContext !== "pro_review"
  ) {
    return "Protected opening changes require a structured Pro-review authorization.";
  }
  if (authorization.openingId !== input.opening.id) {
    return "The opening override authorization names a different opening.";
  }
  if (authorization.mutationPurpose !== input.mutationPurpose) {
    return "The opening override authorization has a different mutation purpose.";
  }
  if (!input.actorId.trim() || typeof authorization.actorId !== "string" ||
      authorization.actorId !== input.actorId) {
    return "The opening override authorization actor does not match the mutation actor.";
  }
  if (typeof authorization.reason !== "string" || authorization.reason.trim().length < 12) {
    return "A reviewed opening override requires a specific human-readable reason.";
  }
  if (typeof authorization.auditNote !== "string" || authorization.auditNote.trim().length < 12) {
    return "A reviewed opening override requires a specific audit note.";
  }
  return null;
}

function validateAuthorizedField(
  input: ProtectedAuthorizationInput,
  authorized: FloorPlanOpeningOverrideAuthorizationV2["fields"][number]
): string | null {
  if (!authorized || typeof authorized !== "object" || !("field" in authorized)) {
    return "The opening override authorization contains a malformed field.";
  }
  const actual = input.fields[authorized.field];
  const definition = FIELD_DEFINITIONS[authorized.field];
  if (!actual || !definition ||
      authorized.currentRawValueMm !== actual.currentRawValueMm ||
      authorized.proposedRawValueMm !== actual.proposedRawValueMm ||
      authorized.currentEvidence !== actual.currentEvidence) {
    return `The ${authorized.field} override values or evidence do not match the mutation.`;
  }
  if (authorized.replacementEvidence !== "user_confirmed" &&
      authorized.replacementEvidence !== "site_measured") {
    return `The ${authorized.field} override replacement evidence is invalid.`;
  }
  if (has(input.changes, definition.evidenceKey) &&
      input.changes[definition.evidenceKey] !== authorized.replacementEvidence) {
    return `The ${authorized.field} override replacement evidence does not match the mutation.`;
  }
  return null;
}

function validateAuthorizationFields(input: ProtectedAuthorizationInput): string | null {
  const authorization = input.authorization;
  if (!Array.isArray(authorization.fields)) {
    return "The opening override authorization field list is malformed.";
  }
  const names = authorization.fields.map((entry) => entry?.field);
  if (new Set(names).size !== names.length) {
    return "The opening override authorization contains duplicate fields.";
  }
  if (
    names.length !== input.protectedChanges.length ||
    names.some((field, index) => field !== input.protectedChanges[index])
  ) {
    return "The opening override authorization does not exactly cover the protected fields.";
  }
  for (const authorized of authorization.fields) {
    const invalid = validateAuthorizedField(input, authorized);
    if (invalid) return invalid;
  }
  return null;
}

function validateProtectedAuthorization(input: ProtectedAuthorizationInput): string | null {
  if (!input.authorization || typeof input.authorization !== "object") {
    return "The opening override authorization is malformed.";
  }
  return validateAuthorizationIdentity(input) ?? validateAuthorizationFields(input);
}

function planProtectedChanges(input: {
  opening: FloorPlanOpeningV2;
  changes: FloorPlanOpeningPolicyChangesV2;
  fields: OpeningMutationFields;
  protectedChanges: FloorPlanOpeningEvidenceFieldV2[];
  mutationPurpose: FloorPlanOpeningMutationPurposeV2;
  actorId: string;
  overrideAuthorization?: FloorPlanOpeningOverrideAuthorizationV2;
}): FloorPlanOpeningMutationPolicyPlanV2 {
  if (!input.overrideAuthorization) {
    return {
      status: "requires_override", fields: input.fields, changes: null,
      explanation: `Protected opening ${input.protectedChanges.join(", ")} evidence requires an approved reviewed override.`,
      auditNote: null,
    };
  }
  const invalid = validateProtectedAuthorization({
    opening: input.opening,
    changes: input.changes,
    fields: input.fields,
    protectedChanges: input.protectedChanges,
    mutationPurpose: input.mutationPurpose,
    actorId: input.actorId,
    authorization: input.overrideAuthorization,
  });
  if (invalid) return blockedProtectedPlan(input.fields, invalid);
  for (const authorized of input.overrideAuthorization.fields) {
    const definition = FIELD_DEFINITIONS[authorized.field];
    input.changes[definition.evidenceKey] = authorized.replacementEvidence;
    const field = authorized.field;
    input.fields[field] = {
      ...input.fields[field], proposedEvidence: authorized.replacementEvidence,
      evidenceChanged:
        input.fields[field].currentEvidence !== authorized.replacementEvidence,
    };
  }
  return {
    status: "applied", fields: input.fields, changes: input.changes,
    explanation: null, auditNote: input.overrideAuthorization.auditNote.trim(),
  };
}

/**
 * Plans every raw opening measurement and dependent kind change before any
 * document, evidence, provenance or history state is mutated.
 */
export function planFloorPlanOpeningMutationV2(input: {
  opening: FloorPlanOpeningV2;
  changes: FloorPlanOpeningPolicyChangesV2;
  mutationPurpose?: FloorPlanOpeningMutationPurposeV2;
  actorId?: string;
  evidenceWorkflow?: "site_measurement";
  overrideAuthorization?: FloorPlanOpeningOverrideAuthorizationV2;
  /** @deprecated Use overrideAuthorization. A boolean is never accepted. */
  reviewedOverride?: FloorPlanOpeningReviewedOverrideV2;
}): FloorPlanOpeningMutationPolicyPlanV2 {
  const normalizedChanges = dependentKindChanges(input.opening, input.changes);
  const fields = {
    width: fieldPlan(input.opening, normalizedChanges, "width"),
    height: fieldPlan(input.opening, normalizedChanges, "height"),
    sill: fieldPlan(input.opening, normalizedChanges, "sill"),
  };
  for (const field of ["width", "height", "sill"] as const) {
    const invalid = validateRawValue(field, fields[field].proposedRawValueMm);
    if (invalid) return emptyInvalidPlan(fields, invalid);
  }
  const unsupportedEvidenceClaim = (["width", "height", "sill"] as const).find(
    (field) =>
      fields[field].evidenceChanged &&
      floorPlanPropertyEvidenceIsEditable(fields[field].currentEvidence) &&
      fields[field].proposedEvidence !== undefined &&
      !floorPlanPropertyEvidenceIsEditable(fields[field].proposedEvidence) &&
      !(input.evidenceWorkflow === "site_measurement" &&
        fields[field].proposedEvidence === "site_measured")
  );
  if (unsupportedEvidenceClaim) {
    return emptyInvalidPlan(
      fields,
      `Protected ${unsupportedEvidenceClaim} evidence must come from an audited source or measurement workflow.`
    );
  }

  const protectedChanges = (["width", "height", "sill"] as const).filter(
    (field) => fields[field].requiresOverride
  );
  if (!protectedChanges.length) {
    if (input.overrideAuthorization || input.reviewedOverride) {
      return emptyInvalidPlan(fields, "An opening override cannot authorize an unprotected or no-op change.");
    }
    return planUnprotectedChanges(normalizedChanges, fields);
  }
  return planProtectedChanges({
    opening: input.opening,
    changes: normalizedChanges,
    fields,
    protectedChanges,
    mutationPurpose: input.mutationPurpose ?? "measurement_edit",
    actorId: input.actorId ?? "",
    overrideAuthorization: input.overrideAuthorization ?? input.reviewedOverride,
  });
}

export function floorPlanOpeningPolicyInput(
  opening: Pick<
    FloorPlanOpeningV2,
    | "id"
    | "kind"
    | "widthMm"
    | "widthEvidence"
    | "heightMm"
    | "heightEvidence"
    | "sillHeightMm"
    | "sillHeightEvidence"
  >
): FloorPlanOpeningV2 {
  return {
    ...opening,
    wallId: "policy-only",
    operation: opening.kind === "window" ? "fixed" : "swing",
    offsetMm: 0,
    hinge: "unknown",
    handing: "unknown",
    provenance: {
      confidence: 0,
      extractionVersion: "policy-only",
      evidence: [],
      reviewHistory: [],
    },
  };
}
