import { calibratedScaleFixture } from "./scale-review";
import type { FloorPlanReviewIssue } from "@/lib/floor-plan-imports/types";

export function issueNavigationDocument() {
  const document = calibratedScaleFixture(), floor = document.floors[0];
  floor.calibrations.push({ ...structuredClone(floor.calibrations[0]), id: "page-two-scale", pageNumber: 2 });
  const wall = floor.walls.find(({ id }) => id === "shared")!;
  wall.provenance = { ...wall.provenance, evidence: [{ ...wall.provenance.evidence[0], pageNumber: 2 }] };
  floor.dimensions[0].provenance = { ...floor.dimensions[0].provenance, evidence: [{ ...floor.dimensions[0].provenance.evidence[0], pageNumber: 1 }] };
  floor.annotations.push({ id: "review-note", kind: "label", text: "Uncertain kitchen", scope: "reference", provenance: wall.provenance,
    geometry: { kind: "source_drawing", sourceId: "authored-source", pageNumber: 2, widthPx: 1000, heightPx: 800,
      command: "text", points: [{ x: 700, y: 650 }] } });
  return document;
}

export const issueNavigationPages = [1, 2].map((pageNumber) => ({ pageNumber, widthPx: 1000, heightPx: 800, assetKey: `page-${pageNumber}` }));
export const issueNavigationIssues: FloorPlanReviewIssue[] = [
  { id: "wall-issue", code: "wall_confirmation", message: "Check the marked shared wall.", entityIds: ["shared"], severity: "warning", resolved: false },
  { id: "dimension-issue", code: "dimensions_confirmation", message: "Check the overall dimension.", entityIds: ["overall-width"], severity: "warning", resolved: false },
  { id: "artwork-issue", code: "uncertain_label", message: "Check the kitchen text.", entityIds: ["review-note"], severity: "warning", resolved: false },
  { id: "scale-issue", code: "scale_unresolved", message: "Review the source scale.", entityIds: [], severity: "warning", resolved: false },
];
