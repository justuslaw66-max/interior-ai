import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { FloorPlanQualityIssue, FloorPlanQualityReport } from "@/lib/floor-plan-quality";
import type { RoomSurfaceFinishes } from "@/lib/room-types";
import { getRuntimeSurfaceMaterialById, type SurfaceMaterialRenderRecord } from "@/lib/surface-material-runtime";
import { normalizeSurfaceMaterialId } from "@/lib/surface-settings";

/**
 * Plan review's surface checks (J, 17 Oct 2026): a room's floor and walls against what the room is for, from ABK's
 * technical sheets. They are advice ("tip"), never errors, and leave the score alone. Private homes aren't regulated; the
 * R10 and R11 levels are the German workplace rules' (ASR A1.5, DGUV 207-006), which tile makers use as the reference.
 *
 * 1. A bathroom floor that is R9.
 * 2. A bathroom floor whose barefoot class has no B (shower areas need B), or whose sheet doesn't settle a slip class for
 *    it (none, or one per finish when the entry doesn't say which).
 * 3. A floor ABK's sheet calls a white-body wall tile (EN 14411 group BIII, water absorption over 10%).
 * 4. A balcony floor that isn't in ABK's outdoor range (outdoor paths need R11).
 * 5. Balcony walls in a white-body wall tile.
 */
type CheckedMaterial = { record: SurfaceMaterialRenderRecord | null; name: string };

const SOURCES = {
  washroom: "Workplace washrooms and showers need R10 (ASR A1.5); homes aren't regulated.",
  shower: "Shower areas need barefoot class B (DGUV 207-006); homes aren't regulated.",
  outdoor: "Outdoor paths need R11 (ASR A1.5); ABK's outdoor tiles are R11 and 20 mm.",
};

export function getSlipClassNumber(slipRating: string | null | undefined): number | null {
  const match = slipRating?.match(/\bR(9|1[0-3])\b/);
  return match ? Number(match[1]) : null;
}

function roomSurfaces(room: HousePlanRoom2D): RoomSurfaceFinishes | undefined {
  return room.surfaces ?? room.surfaceFinishes;
}

function checkedMaterial(materialId: unknown, fallbackName: string): CheckedMaterial {
  const record = getRuntimeSurfaceMaterialById(normalizeSurfaceMaterialId(materialId));
  return { record, name: record?.surface_material.product_name ?? fallbackName };
}

function floorMaterial(room: HousePlanRoom2D): CheckedMaterial {
  const surfaces = roomSurfaces(room);
  return checkedMaterial(surfaces?.floorMaterialId ?? surfaces?.floor?.materialId, "This floor");
}

function wallMaterials(room: HousePlanRoom2D): CheckedMaterial[] {
  const walls = roomSurfaces(room)?.walls;
  const ids = [
    walls?.default?.materialId ?? roomSurfaces(room)?.wallMaterialId,
    ...Object.values(walls?.faces ?? {}).map((face) => face.materialId),
    ...Object.values(walls?.panels ?? {}).map((panel) => panel.materialId),
  ];
  return ids.map((id) => checkedMaterial(id, "This wall")).filter((material) => material.record);
}

function issue(
  room: HousePlanRoom2D,
  rule: string,
  text: Pick<FloorPlanQualityIssue, "title" | "detail" | "suggestedFix">
): FloorPlanQualityIssue {
  return {
    id: `surface-${rule}-${room.id}`,
    category: "surfaces",
    severity: "tip",
    roomId: room.id,
    target: { roomId: room.id },
    ...text,
    action: "review_surface",
  };
}

function sheetOf(material: CheckedMaterial) {
  return `ABK's ${material.record?.suitability?.datasheet} sheet`;
}

function bathroomFloorIssues(room: HousePlanRoom2D, floor: CheckedMaterial): FloorPlanQualityIssue[] {
  const facts = floor.record?.suitability;
  if (!facts?.datasheet) return [];
  const slip = getSlipClassNumber(facts.slip_rating);
  const barefoot = facts.barefoot_slip_rating;
  const issues: FloorPlanQualityIssue[] = [];
  if (slip === 9) {
    issues.push(issue(room, "slip", {
      title: `${room.name}: the floor is R9`,
      detail: `${floor.name} is R9 (DIN 51130) on ${sheetOf(floor)}. ${SOURCES.washroom}`,
      suggestedFix: "If this bathroom has a shower, pick an R10 or R11 floor.",
    }));
  }
  if (barefoot && !barefoot.split("+").includes("B")) {
    issues.push(issue(room, "barefoot", {
      title: `${room.name}: barefoot class ${barefoot}`,
      detail: `${floor.name} is barefoot class ${barefoot} (DIN 51097) on ${sheetOf(floor)}. ${SOURCES.shower}`,
      suggestedFix: "For a shower floor, pick a tile rated barefoot B.",
    }));
  }
  if (slip === null && !barefoot) {
    issues.push(issue(room, "slip-unknown", {
      title: `${room.name}: slip class not known`,
      detail: `${sheetOf(floor)} doesn't settle one slip class for ${floor.name}.`,
      suggestedFix: "Ask ABK for its slip class before using it in a bathroom.",
    }));
  }
  return issues;
}

function wallTileFloorIssues(room: HousePlanRoom2D, floor: CheckedMaterial): FloorPlanQualityIssue[] {
  if (!floor.record?.suitability?.wall_tile_body) return [];
  return [issue(room, "wall-tile-floor", {
    title: `${room.name}: a wall tile on the floor`,
    detail: `${sheetOf(floor)} makes ${floor.name} a white-body wall tile (EN 14411 group BIII, water absorption over 10%).`,
    suggestedFix: "Check with ABK before laying it on a floor.",
  })];
}

function balconyIssues(room: HousePlanRoom2D, floor: CheckedMaterial): FloorPlanQualityIssue[] {
  const issues: FloorPlanQualityIssue[] = [];
  const facts = floor.record?.suitability;
  if (!facts?.outdoor_floor) {
    const slip = facts?.slip_rating ? ` (it is ${facts.slip_rating})` : "";
    issues.push(issue(room, "outdoor-floor", {
      title: `${room.name}: not an outdoor floor`,
      detail: facts?.datasheet
        ? `${floor.name} isn't in ABK's outdoor range${slip}. ${SOURCES.outdoor}`
        : `${floor.name} isn't one of ABK's outdoor tiles. ${SOURCES.outdoor}`,
      suggestedFix: "Pick an outdoor tile: search \"balcony\" in the floor picker.",
    }));
  }
  const wall = wallMaterials(room).find((material) => material.record?.suitability?.wall_tile_body);
  if (wall) {
    issues.push(issue(room, "outdoor-wall", {
      title: `${room.name}: an indoor wall tile outside`,
      detail: `${sheetOf(wall)} makes ${wall.name} a white-body wall tile: over 10% water absorption, not for outdoor walls.`,
      suggestedFix: "Pick a porcelain wall tile for the balcony.",
    }));
  }
  return issues;
}

export function buildSurfaceSuitabilityIssues(rooms: readonly HousePlanRoom2D[]): FloorPlanQualityIssue[] {
  return rooms.flatMap((room) => {
    const floor = floorMaterial(room);
    return [
      ...(room.roomType === "toilet" ? bathroomFloorIssues(room, floor) : []),
      ...wallTileFloorIssues(room, floor),
      ...(room.roomType === "balcony" ? balconyIssues(room, floor) : []),
    ];
  });
}

/** The report with the surface checks added after its own issues. They are tips, so the score and label stay as they are. */
export function withSurfaceSuitabilityIssues(
  report: FloorPlanQualityReport,
  rooms: readonly HousePlanRoom2D[]
): FloorPlanQualityReport {
  const issues = buildSurfaceSuitabilityIssues(rooms);
  return issues.length === 0 ? report : { ...report, issues: [...report.issues, ...issues] };
}
