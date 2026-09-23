import type { RoomOpening2D } from "@/lib/editorScene";
import type { FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";
import { createFloorPlanOpeningOverrideAuthorizationV2 } from "@/lib/floor-plan-opening-override-factory";
import {
  floorPlanOpeningPolicyInput,
  planFloorPlanOpeningMutationV2,
  type FloorPlanOpeningMutationFieldPlanV2,
  type FloorPlanOpeningPolicyChangesV2,
  type FloorPlanOpeningOverrideAuthorizationV2,
} from "@/lib/floor-plan-opening-mutation-policy";
import type { FloorPlanConsumerMeasurementEvidenceV2 } from "@/lib/floor-plan-measured-property-mutations";

export type DesignPageOpeningMetricsPatch = {
  widthMeters?: number;
  widthEvidence?: FloorPlanConsumerMeasurementEvidenceV2;
  offsetMeters?: number;
  heightMeters?: number;
  bottomMeters?: number;
  kind?: RoomOpening2D["kind"];
  wall?: RoomOpening2D["wall"];
  heightEvidence?: FloorPlanConsumerMeasurementEvidenceV2;
  bottomEvidence?: FloorPlanConsumerMeasurementEvidenceV2;
  measurementNote?: string;
  openingOverrideAuthorization?: FloorPlanOpeningOverrideAuthorizationV2;
};

type KindMutationFieldPlan = {
  oldValueMm: number | undefined;
  proposedValueMm: number | undefined;
  oldEvidence: FloorPlanPropertyEvidenceV2;
  proposedEvidence: FloorPlanPropertyEvidenceV2 | undefined;
  changed: boolean;
  requiresOverride: boolean;
};

export type DesignPageOpeningKindMutationPlan = {
  status: "ready" | "blocked" | "no_change";
  oldKind: RoomOpening2D["kind"];
  newKind: RoomOpening2D["kind"];
  fields: {
    width: KindMutationFieldPlan;
    height: KindMutationFieldPlan;
    sill: KindMutationFieldPlan;
  };
  explanation: string | null;
  patch: DesignPageOpeningMetricsPatch | null;
  approvedOverridePatch: DesignPageOpeningMetricsPatch | null;
};

function canonicalOpening(opening: Pick<
  RoomOpening2D,
  "kind" | "widthMm" | "heightMm" | "bottomMm" | "evidence"
> & { id?: string }) {
  return floorPlanOpeningPolicyInput({
    id: opening.id ?? "opening-policy",
    kind: opening.kind,
    widthMm: opening.widthMm,
    widthEvidence: opening.evidence?.width,
    heightMm: opening.heightMm,
    heightEvidence: opening.evidence?.height,
    sillHeightMm: opening.bottomMm,
    sillHeightEvidence: opening.evidence?.sillHeight,
  });
}

export function floorPlanOpeningChangesFromDesignPageMetrics(
  metrics: DesignPageOpeningMetricsPatch
): FloorPlanOpeningPolicyChangesV2 {
  return {
    ...(metrics.kind !== undefined ? { kind: metrics.kind } : {}),
    ...(metrics.widthMeters !== undefined
      ? { widthMm: Math.round(metrics.widthMeters * 1000) } : {}),
    ...(metrics.widthEvidence !== undefined
      ? { widthEvidence: metrics.widthEvidence } : {}),
    ...(metrics.heightMeters !== undefined
      ? { heightMm: Math.round(metrics.heightMeters * 1000) } : {}),
    ...(metrics.heightEvidence !== undefined
      ? { heightEvidence: metrics.heightEvidence } : {}),
    ...(metrics.bottomMeters !== undefined
      ? { sillHeightMm: Math.round(metrics.bottomMeters * 1000) } : {}),
    ...(metrics.bottomEvidence !== undefined
      ? { sillHeightEvidence: metrics.bottomEvidence } : {}),
  };
}

function reviewedOverride(
  metrics: DesignPageOpeningMetricsPatch
): FloorPlanOpeningOverrideAuthorizationV2 | undefined {
  return metrics.openingOverrideAuthorization;
}

function metricsFromChanges(
  original: DesignPageOpeningMetricsPatch,
  changes: FloorPlanOpeningPolicyChangesV2
): DesignPageOpeningMetricsPatch {
  const widthEvidence = consumerEvidence(changes.widthEvidence);
  const heightEvidence = consumerEvidence(changes.heightEvidence);
  const bottomEvidence = consumerEvidence(changes.sillHeightEvidence);
  const kind = changes.kind === "door" || changes.kind === "window"
    ? changes.kind : undefined;
  return {
    ...original,
    ...(kind !== undefined ? { kind } : {}),
    ...(typeof changes.widthMm === "number"
      ? { widthMeters: changes.widthMm / 1000 } : {}),
    ...(widthEvidence ? { widthEvidence } : {}),
    ...(typeof changes.heightMm === "number"
      ? { heightMeters: changes.heightMm / 1000 } : {}),
    ...(heightEvidence ? { heightEvidence } : {}),
    ...(typeof changes.sillHeightMm === "number"
      ? { bottomMeters: changes.sillHeightMm / 1000 } : {}),
    ...(bottomEvidence ? { bottomEvidence } : {}),
  };
}

function consumerEvidence(
  evidence: FloorPlanPropertyEvidenceV2 | undefined
): FloorPlanConsumerMeasurementEvidenceV2 | undefined {
  return evidence === "user_confirmed" || evidence === "site_measured"
    ? evidence
    : undefined;
}

function kindField(plan: FloorPlanOpeningMutationFieldPlanV2): KindMutationFieldPlan {
  return {
    oldValueMm: plan.currentRawValueMm,
    proposedValueMm: plan.proposedRawValueMm,
    oldEvidence: plan.currentEvidence,
    proposedEvidence: plan.proposedEvidence,
    changed: plan.valueChanged || plan.evidenceChanged,
    requiresOverride: plan.requiresOverride,
  };
}

export function planDesignPageOpeningKindMutation(
  opening: Pick<RoomOpening2D, "id" | "kind" | "widthMm" | "heightMm" | "bottomMm" | "evidence">,
  newKind: RoomOpening2D["kind"],
  openingOverrideAuthorization?: FloorPlanOpeningOverrideAuthorizationV2
): DesignPageOpeningKindMutationPlan {
  const metrics: DesignPageOpeningMetricsPatch = {
    kind: newKind,
    ...(openingOverrideAuthorization ? { openingOverrideAuthorization } : {}),
  };
  const policyOpening = canonicalOpening(opening);
  const policy = planFloorPlanOpeningMutationV2({
    opening: policyOpening,
    changes: floorPlanOpeningChangesFromDesignPageMetrics(metrics),
    mutationPurpose: "opening_kind_change",
    actorId: openingOverrideAuthorization?.actorId,
    overrideAuthorization: reviewedOverride(metrics),
  });
  const base = {
    oldKind: opening.kind,
    newKind,
    fields: {
      width: kindField(policy.fields.width),
      height: kindField(policy.fields.height),
      sill: kindField(policy.fields.sill),
    },
  };
  if (newKind === opening.kind) {
    return { ...base, status: "no_change", explanation: null, patch: {}, approvedOverridePatch: null };
  }
  if (policy.status === "applied" && policy.changes) {
    return {
      ...base,
      status: "ready",
      explanation: policy.fields.sill.valueChanged
        ? "Changing this to a door requires changing the sill." : null,
      patch: metricsFromChanges(metrics, policy.changes),
      approvedOverridePatch: null,
    };
  }
  return {
    ...base,
    status: "blocked",
    explanation: policy.explanation,
    patch: null,
    approvedOverridePatch: {
      kind: newKind,
      bottomMeters: 0,
      bottomEvidence: "user_confirmed",
      measurementNote: "Reviewed opening-kind override changed the dependent sill.",
      openingOverrideAuthorization: createFloorPlanOpeningOverrideAuthorizationV2({
        opening: policyOpening,
        changes: { kind: newKind },
        mutationPurpose: "opening_kind_change",
        actorId: "design-editor",
        reason: "Pro reviewer approved the required dependent sill correction.",
        auditNote: "Opening kind changed from window to door and the documented sill was replaced.",
      }),
    },
  };
}

export class DesignPageOpeningMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DesignPageOpeningMutationError";
  }
}

export class DesignPageOpeningKindMutationError extends DesignPageOpeningMutationError {
  readonly plan: DesignPageOpeningKindMutationPlan;

  constructor(plan: DesignPageOpeningKindMutationPlan) {
    super(plan.explanation ?? "The opening kind change is blocked.");
    this.name = "DesignPageOpeningKindMutationError";
    this.plan = plan;
  }
}

export function applyOpeningKindPlanToMetrics(
  opening: RoomOpening2D,
  metrics: DesignPageOpeningMetricsPatch
) {
  const policy = planFloorPlanOpeningMutationV2({
    opening: canonicalOpening(opening),
    changes: floorPlanOpeningChangesFromDesignPageMetrics(metrics),
    mutationPurpose: metrics.kind ? "opening_kind_change" : "measurement_edit",
    actorId: metrics.openingOverrideAuthorization?.actorId,
    overrideAuthorization: reviewedOverride(metrics),
  });
  if (policy.status !== "applied" || !policy.changes) {
    if (metrics.kind) {
      throw new DesignPageOpeningKindMutationError(
        planDesignPageOpeningKindMutation(opening, metrics.kind)
      );
    }
    throw new DesignPageOpeningMutationError(
      policy.explanation ?? "The opening measurement change is blocked."
    );
  }
  return metricsFromChanges(metrics, policy.changes);
}

export type NormalizeDesignPageOpeningMetricsInput = {
  currentOpening: RoomOpening2D | undefined;
  metrics: DesignPageOpeningMetricsPatch;
  roomHeight: number;
};

export function normalizeDesignPageOpeningMetrics({
  metrics,
  currentOpening: _currentOpening,
  roomHeight: _roomHeight,
}: NormalizeDesignPageOpeningMetricsInput): DesignPageOpeningMetricsPatch {
  return { ...metrics };
}

export function getDesignPageOpeningMetricsHistoryLabel(
  metrics: DesignPageOpeningMetricsPatch
): "Resize opening" | "Edit opening" {
  const hasDimensionEdit =
    metrics.widthMeters !== undefined ||
    metrics.heightMeters !== undefined ||
    metrics.bottomMeters !== undefined;
  return hasDimensionEdit && metrics.kind === undefined
    ? "Resize opening"
    : "Edit opening";
}
