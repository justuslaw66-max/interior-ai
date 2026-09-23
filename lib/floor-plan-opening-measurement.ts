import type { CompiledFloorPlanFloorV2 } from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanFloorV2,
  FloorPlanOpeningV2,
  FloorPlanPropertyEvidenceV2,
} from "@/lib/floor-plan-document-v2";

type OpeningMeasurementTarget = {
  kind: "opening_width" | "opening_height" | "opening_sill_height";
  openingId: string;
};

export function applyFloorPlanOpeningMeasurement(
  floor: FloorPlanFloorV2,
  compiledFloor: CompiledFloorPlanFloorV2,
  target: OpeningMeasurementTarget,
  valueMm: number,
  evidence: FloorPlanPropertyEvidenceV2
): { opening: FloorPlanOpeningV2; previousValueMm: number } | null {
  const opening = floor.openings.find((candidate) => candidate.id === target.openingId);
  const compiled = compiledFloor.openings.find((candidate) => candidate.id === target.openingId);
  if (!opening || !compiled) return null;
  let previousValueMm: number;
  if (target.kind === "opening_width") {
    previousValueMm = compiled.widthMm;
    opening.widthMm = valueMm;
    opening.widthEvidence = evidence;
  } else if (target.kind === "opening_height") {
    previousValueMm = compiled.heightMm;
    opening.heightMm = valueMm;
    opening.heightEvidence = evidence;
  } else {
    previousValueMm = compiled.sillHeightMm;
    opening.sillHeightMm = valueMm;
    opening.sillHeightEvidence = evidence;
  }
  return { opening, previousValueMm };
}
