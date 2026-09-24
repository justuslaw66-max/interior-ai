import type { FloorPlanDocumentV2 } from "./floor-plan-document-v2";

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
