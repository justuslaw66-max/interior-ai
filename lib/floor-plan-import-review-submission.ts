import type { FloorPlanDocumentV2 } from "./floor-plan-document-v2";
import { packFloorPlanCandidateForStorage } from "./floor-plan-imports/candidate-storage";

/** Prepare a private review submission without mutating the displayed candidate. */
export function prepareFloorPlanReviewSubmission(candidate: FloorPlanDocumentV2, entranceOpeningId: string) {
  const next = structuredClone(candidate), floor = next.floors[0];
  const entrance = floor?.openings.find((opening) => opening.id === entranceOpeningId);
  if (!entrance || floor.annotations.some((annotation) => annotation.configurationId === "main-entrance")) return next;
  let index = floor.annotations.length + 1;
  while (floor.annotations.some((annotation) => annotation.id === `annotation-${index}`)) index++;
  floor.annotations.push({
    id: `annotation-${index}`, kind: "label", text: "Main entrance", configurationId: "main-entrance",
    geometry: { kind: "wall_span", wallId: entrance.wallId, offsetMm: entrance.offsetMm, widthMm: entrance.widthMm },
    provenance: structuredClone(entrance.provenance),
  });
  return next;
}

/**
 * The review submission as it is sent: in the form candidates are stored in (floor-plan-imports/candidate-storage.ts),
 * so once they are stored packed a traced plan's save sends about a sixth of its JSON. The server unpacks it first.
 */
export function floorPlanReviewSubmissionForSending(candidate: FloorPlanDocumentV2, entranceOpeningId: string) {
  return packFloorPlanCandidateForStorage(prepareFloorPlanReviewSubmission(candidate, entranceOpeningId));
}
