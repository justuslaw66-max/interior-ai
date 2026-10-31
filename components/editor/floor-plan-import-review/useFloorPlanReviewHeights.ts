import { useState, type Dispatch, type SetStateAction } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  applyFloorPlanMeasuredPropertyMutationV2,
  type FloorPlanConsumerMeasurementEvidenceV2,
} from "@/lib/floor-plan-measured-property-mutations";
import {
  applyReviewHomeType,
  type ReviewHomeTypeId,
  type ReviewHomeTypeResult,
} from "@/lib/floor-plan-imports/review-home-type";
import { createImportReviewMutationMetadata } from "./import-review-summary";

type Floor = FloorPlanDocumentV2["floors"][number];
type DefaultKey = keyof Floor["defaults"];
type VerticalProperty = "storeyHeight" | "slabThickness";

function withEditedDefault(candidate: FloorPlanDocumentV2, floor: Floor, key: DefaultKey, value: number) {
  try {
    return applyFloorPlanMeasuredPropertyMutationV2(
      candidate,
      {
        target: { kind: "floor_default", floorId: floor.id, property: key },
        valueMm: Math.max(key === "windowSillHeight" ? 0 : 100, Math.round(value)),
        evidence: "user_confirmed",
      },
      createImportReviewMutationMetadata(floor.id, key, `Consumer edited and confirmed the displayed ${key}.`)
    ).document;
  } catch {
    return null; // Locked or invalid values stay unchanged and remain reviewable.
  }
}

function withVerticalNumber(candidate: FloorPlanDocumentV2, property: VerticalProperty, value: number) {
  const next = structuredClone(candidate);
  const nextFloor = next.floors[0];
  if (!nextFloor) return null;
  if (property === "storeyHeight") nextFloor.storeyHeightMm = Math.max(100, Math.round(value));
  else nextFloor.slabThicknessMm = Math.max(0, Math.round(value));
  // Editing the number alone deliberately preserves its current evidence.
  return next;
}

function withConfirmedVertical(
  candidate: FloorPlanDocumentV2, floor: Floor, property: VerticalProperty,
  evidence: FloorPlanConsumerMeasurementEvidenceV2, note?: string
) {
  const target = property === "storeyHeight"
    ? { kind: "floor_storey_height" as const, floorId: floor.id }
    : { kind: "floor_slab_thickness" as const, floorId: floor.id };
  const label = property === "storeyHeight" ? "storey height" : "slab thickness";
  try {
    return applyFloorPlanMeasuredPropertyMutationV2(
      candidate,
      { target, valueMm: property === "storeyHeight" ? floor.storeyHeightMm : floor.slabThicknessMm, evidence },
      createImportReviewMutationMetadata(floor.id, property, note?.trim() || `Consumer explicitly confirmed the displayed ${label}.`)
    ).document;
  } catch {
    // The mutation engine remains the source of truth; invalid measurements
    // are left unchanged and the review issue stays unresolved.
    return null;
  }
}

function withAssumedDefaultsConfirmed(candidate: FloorPlanDocumentV2, floor: Floor) {
  let next = candidate;
  const timestamp = Date.now().toString(36);
  for (const [index, key] of (Object.keys(floor.defaults) as DefaultKey[]).entries()) {
    const property = next.floors[0]?.defaults[key];
    if (!property || property.evidence !== "assumed") continue;
    try {
      next = applyFloorPlanMeasuredPropertyMutationV2(
        next,
        { target: { kind: "floor_default", floorId: floor.id, property: key }, valueMm: property.valueMm, evidence: "user_confirmed" },
        {
          mutationId: `import-review:${floor.id}:${key}:${timestamp}:${index}`,
          nextRevisionId: `import-review-revision:${timestamp}:${key}:${index}`,
          actorId: "consumer-import-review",
          mutatedAt: new Date().toISOString(),
          note: `Consumer explicitly confirmed the displayed ${key}.`,
        }
      ).document;
    } catch {
      return null;
    }
  }
  return next;
}

/** The review's heights: the home type, the height fields and their confirmations, on the candidate document. */
export function useFloorPlanReviewHeights(
  candidate: FloorPlanDocumentV2,
  setCandidate: Dispatch<SetStateAction<FloorPlanDocumentV2 | null>>
) {
  const floor = candidate.floors[0];
  const [homeType, setHomeType] = useState<ReviewHomeTypeId>("unknown");
  const [kept, setKept] = useState<ReviewHomeTypeResult["kept"]>([]);
  const [storeyTyped, setStoreyTyped] = useState(false);
  const commit = (next: FloorPlanDocumentV2 | null) => { if (next) setCandidate(next); };
  return {
    homeType,
    kept,
    chooseHomeType: (next: ReviewHomeTypeId) => {
      if (!floor) return;
      const result = applyReviewHomeType(candidate, { floorId: floor.id, homeType: next, storeyTyped });
      setHomeType(next);
      setKept(result.kept);
      commit(result.document);
    },
    changeHeight: (key: DefaultKey, value: number) => {
      if (floor && Number.isFinite(value)) commit(withEditedDefault(candidate, floor, key, value));
    },
    changeVerticalValue: (property: VerticalProperty, value: number) => {
      if (!Number.isFinite(value)) return;
      if (property === "storeyHeight") setStoreyTyped(true);
      commit(withVerticalNumber(candidate, property, value));
    },
    confirmVerticalValue: (property: VerticalProperty, evidence: FloorPlanConsumerMeasurementEvidenceV2, note?: string) => {
      if (floor) commit(withConfirmedVertical(candidate, floor, property, evidence, note));
    },
    confirmDisplayedHeightDefaults: () => {
      if (floor) commit(withAssumedDefaultsConfirmed(candidate, floor));
    },
  };
}
