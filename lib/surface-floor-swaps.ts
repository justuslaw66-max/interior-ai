import {
  buildFloorSurfaceIssues,
  getSlipClassNumber,
  type SurfaceCheckRoom,
} from "@/lib/floor-plan-surface-checks";
import type { RoomType } from "@/lib/room-types";
import {
  getRuntimeSurfaceMaterialById,
  SURFACE_MATERIAL_RENDER_REGISTRY,
  type SurfaceMaterialRenderRecord,
} from "@/lib/surface-material-runtime";
import type { SurfaceSuitabilityFacts } from "@/lib/surface-material-runtime-types";

/**
 * The floors AI notes may offer in place of a flagged one (J, 18 Oct 2026: "Floors only"). A candidate is a published
 * catalogue floor that the room's checks don't flag, and whose sheet says positively that it suits the room:
 *
 * - a bathroom floor is R10 or higher (DIN 51130) and barefoot class B or better (DIN 51097);
 * - a balcony floor is in ABK's outdoor range;
 * - any other room's floor has a technical sheet that doesn't make it a white-body wall tile.
 *
 * A floor without facts never qualifies, as the checks never guess. The nearest come first: the same ABK collection, then
 * the same colour family, then the same size.
 */
export const FLOOR_SWAP_CANDIDATE_LIMIT = 3;

function suitsRoom(roomType: RoomType, facts: SurfaceSuitabilityFacts | undefined): boolean {
  if (!facts || facts.wall_tile_body) return false;
  if (roomType === "toilet") {
    const slip = getSlipClassNumber(facts.slip_rating);
    return slip !== null && slip >= 10 && (facts.barefoot_slip_rating ?? "").split("+").includes("B");
  }
  if (roomType === "balcony") return facts.outdoor_floor;
  return Boolean(facts.datasheet);
}

export function isFloorSwapCandidate(room: SurfaceCheckRoom, record: SurfaceMaterialRenderRecord | null): boolean {
  if (!record) return false;
  const materialId = record.surface_material.material_id;
  if (record.import_governance.publish_status !== "published") return false;
  if (record.surface_material.surface_category !== "flooring" || materialId === room.floorMaterialId) return false;
  if (!suitsRoom(room.roomType, record.suitability)) return false;
  return buildFloorSurfaceIssues({ ...room, floorMaterialId: materialId }).length === 0;
}

function sizeKey(record: SurfaceMaterialRenderRecord | null): string | null {
  const specs = record?.physical_specs;
  const width = specs?.tile_width_mm ?? specs?.plank_width_mm;
  const length = specs?.tile_length_mm ?? specs?.plank_length_mm;
  return width && length ? `${width}x${length}` : null;
}

/** 0 for a match and 1 for none, for each of the collection, the colour family and the size. */
function nearness(current: SurfaceMaterialRenderRecord | null, candidate: SurfaceMaterialRenderRecord): number[] {
  const sheet = current?.suitability?.datasheet;
  const colour = current?.classification.color_family;
  const size = sizeKey(current);
  return [
    sheet && candidate.suitability?.datasheet === sheet ? 0 : 1,
    colour && colour !== "unknown" && candidate.classification.color_family === colour ? 0 : 1,
    size && sizeKey(candidate) === size ? 0 : 1,
  ];
}

function compareNearness(left: number[], right: number[]): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

/** Up to `limit` floors for a room whose floor the checks flag, nearest first; none when they flag nothing. */
export function getFloorSwapCandidates(
  room: SurfaceCheckRoom,
  limit = FLOOR_SWAP_CANDIDATE_LIMIT
): SurfaceMaterialRenderRecord[] {
  if (buildFloorSurfaceIssues(room).length === 0) return [];
  const current = getRuntimeSurfaceMaterialById(room.floorMaterialId);
  return SURFACE_MATERIAL_RENDER_REGISTRY.filter((record) => isFloorSwapCandidate(room, record))
    .map((record) => ({ record, rank: nearness(current, record) }))
    .sort(
      (left, right) =>
        compareNearness(left.rank, right.rank) ||
        left.record.surface_material.product_name.localeCompare(right.record.surface_material.product_name) ||
        left.record.surface_material.material_id.localeCompare(right.record.surface_material.material_id)
    )
    .slice(0, limit)
    .map(({ record }) => record);
}
