import type { FloorPlanDocumentV2, FloorPlanEntityProvenanceV2, FloorPlanFloorV2 } from "./floor-plan-document-v2";
import type { FloorPlanReviewIssue, FloorPlanRenderedPage } from "./floor-plan-imports/types";

export type FloorPlanReviewTarget = {
  control: "wall" | "vertex" | "opening" | "structure" | "dimension" | "artwork" | "scale" | "room";
  label: string;
  entityId?: string;
  pageNumber?: number;
};

const labels = { wall: "wall", vertex: "wall endpoint", opening: "door and window", structure: "structural object",
  dimension: "dimension", artwork: "source artwork", scale: "scale", room: "room outline" };

function entityTarget(floor: FloorPlanFloorV2, id: string, sourceId: string): FloorPlanReviewTarget | null {
  const calibration = floor.calibrations.find((entry) => entry.id === id && entry.sourceId === sourceId);
  if (calibration) return { control: "scale", label: labels.scale, entityId: id, pageNumber: calibration.pageNumber };
  const collections = { wall: floor.walls, vertex: floor.vertices, opening: floor.openings, structure: floor.structures,
    dimension: floor.dimensions, artwork: floor.annotations, room: floor.rooms };
  for (const control of Object.keys(collections) as (keyof typeof collections)[]) {
    const entity: { id: string; provenance: FloorPlanEntityProvenanceV2 } | undefined = collections[control].find((entry) => entry.id === id);
    if (!entity) continue;
    const artwork = control === "artwork" ? floor.annotations.find((entry) => entry.id === id)?.geometry : null;
    if (control === "artwork" && (artwork?.kind !== "source_drawing" || artwork.sourceId !== sourceId)) continue;
    const pageNumber = artwork?.kind === "source_drawing" && artwork.sourceId === sourceId ? artwork.pageNumber
      : entity.provenance.evidence.find((entry) => entry.sourceId === sourceId && entry.pageNumber)?.pageNumber;
    return { control, label: labels[control], entityId: id, pageNumber };
  }
  return null;
}

/** Route only to an available page of the primary upload; never guess from issue prose. */
export function resolveFloorPlanReviewTarget(document: FloorPlanDocumentV2, pages: readonly Pick<FloorPlanRenderedPage, "pageNumber">[],
  issue: Pick<FloorPlanReviewIssue, "code" | "entityIds"> | null | undefined): FloorPlanReviewTarget | null {
  const floor = document.floors[0];
  if (!floor || !issue) return null;
  const sourceId = floor.calibrations[0]?.sourceId ?? document.sources[0]?.id ?? "";
  for (const id of issue.entityIds ?? []) {
    const target = entityTarget(floor, id, sourceId);
    if (target?.control === "artwork" && !pages.some((page) => page.pageNumber === target.pageNumber)) continue;
    if (target) return { ...target, pageNumber: pages.some((page) => page.pageNumber === target.pageNumber) ? target.pageNumber : undefined };
  }
  if (["scale_unresolved", "source_registration_incomplete", "independent_scale_conflict"].includes(issue.code)) return { control: "scale", label: labels.scale };
  if (["room_topology_unresolved", "exterior_boundary_confirmation", "canonical_room_coverage_incomplete", "rooms_confirmation", "source_room_coverage_incomplete"].includes(issue.code)) return { control: "room", label: labels.room };
  return null;
}

export function floorPlanReviewPage(document: FloorPlanDocumentV2, pages: FloorPlanRenderedPage[], pageNumber: number) {
  const floor = document.floors[0], page = pages.find((entry) => entry.pageNumber === pageNumber) ?? pages[0] ?? null;
  const fallbackSourceId = floor?.calibrations[0]?.sourceId ?? document.sources[0]?.id ?? "";
  const sourceId = floor?.calibrations.find((entry) => entry.pageNumber === page?.pageNumber)?.sourceId ?? fallbackSourceId;
  const calibration = floor?.calibrations.find((entry) => entry.sourceId === sourceId && entry.pageNumber === page?.pageNumber);
  return { page, sourceId, calibration };
}

export function expandFloorPlanReviewFocus(floor: FloorPlanFloorV2, issueIds: string[], correctionIds: string[]) {
  const expanded = new Set(issueIds);
  for (const room of floor.rooms) {
    if (!expanded.has(room.id)) continue;
    for (const loop of room.wallLoops) {
      for (const wall of loop.walls) expanded.add(wall.wallId);
    }
  }
  return [...new Set([...expanded, ...correctionIds])];
}
