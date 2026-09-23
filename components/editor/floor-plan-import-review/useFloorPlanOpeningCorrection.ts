"use client";

import { useState } from "react";
import type {
  FloorPlanFloorV2,
  FloorPlanOpeningKindV2,
  FloorPlanOpeningOperationV2,
  FloorPlanOpeningV2,
  FloorPlanPropertyEvidenceV2,
} from "@/lib/floor-plan-document-v2";
import { planFloorPlanOpeningKindCorrection } from "@/lib/floor-plan-opening-kind-correction";
import { createFloorPlanOpeningOverrideAuthorizationV2 } from "@/lib/floor-plan-opening-override-factory";
import { planFloorPlanOpeningMutationV2 } from "@/lib/floor-plan-opening-mutation-policy";
import { floorPlanPropertyEvidenceIsEditable } from "@/lib/floor-plan-measured-property-mutations";
import type {
  FloorPlanOpeningChangesV2,
  FloorPlanTopologyMutationV2,
} from "@/lib/floor-plan-topology-mutations";

export type OpeningCorrectionValues = {
  openingOffset: number;
  openingWidth: number;
  openingKind: FloorPlanOpeningKindV2;
  openingOperation: FloorPlanOpeningOperationV2;
  heightMm: number | "";
  sillHeightMm: number | "";
  hinge: FloorPlanOpeningV2["hinge"];
  handing: FloorPlanOpeningV2["handing"];
};

export type OpeningEvidence = {
  width: FloorPlanPropertyEvidenceV2;
  height: FloorPlanPropertyEvidenceV2;
  sill: FloorPlanPropertyEvidenceV2;
};
export type EvidenceField = keyof OpeningEvidence;

const USER_CONFIRMED_EVIDENCE = "user_confirmed" as const;

type UseOpeningCorrectionInput = {
  floor: FloorPlanFloorV2;
  onFocusIds: (ids: string[]) => void;
  onMutate: (operation: FloorPlanTopologyMutationV2) => boolean;
};
type KindCorrection = ReturnType<typeof planFloorPlanOpeningKindCorrection>;

const optionalMm = (value: number | "") => value === "" ? undefined : value;

function buildMeasurementChanges(
  values: OpeningCorrectionValues,
  opening: FloorPlanOpeningV2,
  evidence: OpeningEvidence,
  overrides: ReadonlySet<EvidenceField>
): FloorPlanOpeningChangesV2 {
  return {
    ...(values.openingWidth !== opening.widthMm
      ? {
          widthMm: values.openingWidth,
          ...(floorPlanPropertyEvidenceIsEditable(evidence.width) || overrides.has("width")
            ? { widthEvidence: USER_CONFIRMED_EVIDENCE } : {}),
        }
      : {}),
    ...(values.heightMm !== (opening.heightMm ?? "")
      ? {
          heightMm: optionalMm(values.heightMm),
          ...(floorPlanPropertyEvidenceIsEditable(evidence.height) || overrides.has("height")
            ? { heightEvidence: values.heightMm === "" ? undefined : USER_CONFIRMED_EVIDENCE } : {}),
        }
      : {}),
    ...(values.sillHeightMm !== (opening.sillHeightMm ?? "")
      ? {
          sillHeightMm: optionalMm(values.sillHeightMm),
          ...(floorPlanPropertyEvidenceIsEditable(evidence.sill) || overrides.has("sill")
            ? { sillHeightEvidence: values.sillHeightMm === "" ? undefined : USER_CONFIRMED_EVIDENCE } : {}),
        }
      : {}),
  };
}

function valuesForOpening(opening: FloorPlanOpeningV2): OpeningCorrectionValues {
  return {
    openingOffset: opening.offsetMm,
    openingWidth: opening.widthMm,
    openingKind: opening.kind,
    openingOperation: opening.operation,
    heightMm: opening.heightMm ?? "",
    sillHeightMm: opening.sillHeightMm ?? "",
    hinge: opening.hinge,
    handing: opening.handing,
  };
}

type OpeningUpdatePlan = {
  status: "ready" | "noop" | "blocked";
  changes: FloorPlanOpeningChangesV2;
  requiredOverrideFields: EvidenceField[];
  reviewedEvidenceOverride?: ReturnType<typeof createFloorPlanOpeningOverrideAuthorizationV2>;
  explanation: string | null;
};

function changedNonMeasurementFields(
  values: OpeningCorrectionValues,
  opening: FloorPlanOpeningV2,
  kindCorrection: KindCorrection,
  kindOverrideApproved: boolean
): FloorPlanOpeningChangesV2 {
  return {
    ...(values.openingOffset !== opening.offsetMm ? { offsetMm: values.openingOffset } : {}),
    ...(values.openingKind !== opening.kind && (!kindCorrection.locked || kindOverrideApproved)
      ? { kind: values.openingKind, ...kindCorrection.changes } : {}),
    ...(values.openingOperation !== opening.operation ? { operation: values.openingOperation } : {}),
    ...(values.hinge !== opening.hinge ? { hinge: values.hinge } : {}),
    ...(values.handing !== opening.handing ? { handing: values.handing } : {}),
  };
}

export function planFloorPlanOpeningCorrectionUpdate(input: {
  values: OpeningCorrectionValues; opening: FloorPlanOpeningV2; evidence: OpeningEvidence;
  measurementOverrides: ReadonlySet<EvidenceField>; kindCorrection: KindCorrection;
  kindOverrideApproved: boolean;
  authorizationFactory?: typeof createFloorPlanOpeningOverrideAuthorizationV2;
}): OpeningUpdatePlan {
  const changedKindIsBlocked = input.values.openingKind !== input.opening.kind &&
    input.kindCorrection.locked && !input.kindOverrideApproved;
  if (changedKindIsBlocked) {
    return { status: "blocked", changes: {}, requiredOverrideFields: [], explanation:
      "The protected kind change has not been approved." };
  }
  const measurementChanges = buildMeasurementChanges(input.values, input.opening,
    input.evidence, input.measurementOverrides);
  const changes = {
    ...measurementChanges,
    ...changedNonMeasurementFields(
      input.values, input.opening, input.kindCorrection, input.kindOverrideApproved
    ),
  };
  if (Object.keys(changes).length === 0) {
    return { status: "noop", changes, requiredOverrideFields: [], explanation: null };
  }
  const policy = planFloorPlanOpeningMutationV2({
    opening: input.opening, changes, mutationPurpose: "import_review_correction",
    actorId: "pending-pro-review",
  });
  if (policy.status === "invalid" || policy.status === "blocked") {
    return { status: "blocked", changes, requiredOverrideFields: [],
      explanation: policy.explanation };
  }
  const requiredOverrideFields = (["width", "height", "sill"] as const)
    .filter((field) => policy.fields[field].requiresOverride);
  const approved = requiredOverrideFields.every((field) =>
    input.measurementOverrides.has(field) ||
      (field === "sill" && input.kindCorrection.locked && input.kindOverrideApproved));
  if (!approved) {
    return { status: "blocked", changes, requiredOverrideFields,
      explanation: "The exact protected measurement changes have not been approved." };
  }
  const authorizationFactory = input.authorizationFactory ??
    createFloorPlanOpeningOverrideAuthorizationV2;
  return {
    status: "ready",
    changes,
    requiredOverrideFields,
    reviewedEvidenceOverride: requiredOverrideFields.length
      ? authorizationFactory({
          opening: input.opening,
          changes,
          mutationPurpose: "import_review_correction",
          actorId: "pending-pro-review",
          reason: "Pro reviewer approved protected opening evidence replacement.",
          auditNote: "Protected opening measurements were corrected against the private source overlay.",
        })
      : undefined,
    explanation: null,
  };
}

export function useFloorPlanOpeningCorrection(input: UseOpeningCorrectionInput) {
  const [openingId, setOpeningId] = useState("");
  const [values, setValues] = useState<OpeningCorrectionValues>({
    openingOffset: 0, openingWidth: 900, openingKind: "door", openingOperation: "swing",
    heightMm: "", sillHeightMm: "", hinge: "unknown", handing: "unknown",
  });
  const [kindOverrideApproved, setKindOverrideApproved] = useState(false);
  const [measurementOverrides, setMeasurementOverrides] = useState<Set<EvidenceField>>(new Set());
  const selectedOpening = input.floor.openings.find((entry) => entry.id === openingId);
  const evidence: OpeningEvidence = {
    width: selectedOpening?.widthEvidence ?? "assumed", height: selectedOpening?.heightEvidence ?? "assumed",
    sill: selectedOpening?.sillHeightEvidence ?? "assumed" };
  const kindCorrection = planFloorPlanOpeningKindCorrection(selectedOpening, values.openingKind);
  const setValue = <Key extends keyof OpeningCorrectionValues>(
    key: Key, value: OpeningCorrectionValues[Key]
  ) => setValues((current) => ({ ...current, [key]: value }));
  const selectOpening = (id: string) => {
    setOpeningId(id);
    const opening = input.floor.openings.find((entry) => entry.id === id);
    if (!opening) {
      input.onFocusIds([]);
      return;
    }
    setValues(valuesForOpening(opening));
    setKindOverrideApproved(false);
    setMeasurementOverrides(new Set());
    input.onFocusIds([opening.id, opening.wallId]);
  };
  const updateOpening = () => {
    if (!selectedOpening) return;
    const update = planFloorPlanOpeningCorrectionUpdate({ values, opening: selectedOpening, evidence,
      measurementOverrides, kindCorrection, kindOverrideApproved });
    if (update.status !== "ready") {
      if (update.status === "noop") {
        setKindOverrideApproved(false);
        setMeasurementOverrides(new Set());
      }
      return update;
    }
    const accepted = input.onMutate({
      kind: "update_opening", floorId: input.floor.id, openingId,
      changes: update.changes,
      mutationPurpose: "import_review_correction",
      ...(update.reviewedEvidenceOverride
        ? { reviewedEvidenceOverride: update.reviewedEvidenceOverride } : {}),
    });
    if (accepted) {
      setKindOverrideApproved(false);
      setMeasurementOverrides(new Set());
    }
    return update;
  };
  return {
    openingId, values, evidence, kindCorrection, kindOverrideApproved,
    measurementOverrides, setKindOverrideApproved,
    approveMeasurementOverride: (field: EvidenceField) =>
      setMeasurementOverrides((current) => new Set(current).add(field)),
    setValue, selectOpening, updateOpening,
  };
}
