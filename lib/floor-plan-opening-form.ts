import type { FloorPlanFloorV2, FloorPlanOpeningV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanOpeningChangesV2 } from "@/lib/floor-plan-topology-mutation-types";

export function proposedOpeningForm(floor: FloorPlanFloorV2, opening?: FloorPlanOpeningV2) {
  const kind = opening?.kind ?? "door";
  const windowLike = kind === "window" || kind === "vent" || kind === "louvre";
  return { kind, operation: opening?.operation ?? "swing", offsetMm: opening?.offsetMm ?? 0,
    widthMm: opening?.widthMm ?? 900,
    heightMm: opening?.heightMm ?? (windowLike ? floor.defaults.windowHeight.valueMm : floor.defaults.doorHeight.valueMm),
    sillHeightMm: opening?.sillHeightMm ?? (windowLike ? floor.defaults.windowSillHeight.valueMm : 0),
    hinge: opening?.hinge ?? "start", handing: opening?.handing ?? "left" } satisfies FloorPlanOpeningChangesV2;
}

/** Unchanged displayed defaults remain assumed; clicking Apply never confirms hidden measurements. */
export function changedOpeningFormFields(floor: FloorPlanFloorV2, opening: FloorPlanOpeningV2, draft: ReturnType<typeof proposedOpeningForm>): FloorPlanOpeningChangesV2 {
  const previous = proposedOpeningForm(floor, opening);
  return Object.fromEntries(Object.entries(draft).filter(([key, value]) => previous[key as keyof typeof previous] !== value));
}
