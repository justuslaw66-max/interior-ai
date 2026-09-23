import type { CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_LIBRARY_LADDER_RAIL_HEIGHT = 2140;
export const CABINET_DEFAULT_LIBRARY_LADDER_RAIL_DIAMETER = 32;
export const CABINET_DEFAULT_LIBRARY_LADDER_RAIL_PROJECTION = 55;
export const CABINET_DEFAULT_LIBRARY_LADDER_STANDOFF_COUNT = 3;
export const CABINET_DEFAULT_LIBRARY_LADDER_STANDOFF_DIAMETER = 28;
export const CABINET_LIBRARY_LADDER_RAIL_HARDWARE_ID = "library_ladder_rail";
export const CABINET_LIBRARY_LADDER_RAIL_SKU_ID = "CAB-HW-LIB-LADDER-RAIL";

export function hasCabinetLibraryLadderRail(module: CabinetModuleDefinition): boolean {
  if (module.libraryLadderRailEnabled === false) return false;
  return (
    Boolean(module.libraryLadderRailEnabled) ||
    typeof module.libraryLadderRailHeight === "number" ||
    typeof module.libraryLadderRailDiameter === "number" ||
    typeof module.libraryLadderRailProjection === "number" ||
    typeof module.libraryLadderStandoffCount === "number" ||
    typeof module.libraryLadderStandoffDiameter === "number"
  );
}

export function getCabinetLibraryLadderRailHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetLibraryLadderRail(module)) return 0;
  return Math.max(0, module.libraryLadderRailHeight ?? CABINET_DEFAULT_LIBRARY_LADDER_RAIL_HEIGHT);
}

export function getCabinetLibraryLadderRailDiameter(module: CabinetModuleDefinition): number {
  if (!hasCabinetLibraryLadderRail(module)) return 0;
  return Math.max(0, module.libraryLadderRailDiameter ?? CABINET_DEFAULT_LIBRARY_LADDER_RAIL_DIAMETER);
}

export function getCabinetLibraryLadderRailProjection(module: CabinetModuleDefinition): number {
  if (!hasCabinetLibraryLadderRail(module)) return 0;
  return Math.max(0, module.libraryLadderRailProjection ?? CABINET_DEFAULT_LIBRARY_LADDER_RAIL_PROJECTION);
}

export function getCabinetLibraryLadderRailLocalY(module: CabinetModuleDefinition): number {
  return getCabinetLibraryLadderRailHeight(module) - getCabinetLibraryLadderRailDiameter(module) / 2;
}

export function getCabinetLibraryLadderRailLocalZ(module: CabinetModuleDefinition): number {
  return -getCabinetLibraryLadderRailProjection(module);
}

export function getCabinetLibraryLadderStandoffCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetLibraryLadderRail(module)) return 0;
  return Math.max(0, module.libraryLadderStandoffCount ?? CABINET_DEFAULT_LIBRARY_LADDER_STANDOFF_COUNT);
}

export function getCabinetLibraryLadderStandoffDiameter(module: CabinetModuleDefinition): number {
  if (!hasCabinetLibraryLadderRail(module)) return 0;
  return Math.max(0, module.libraryLadderStandoffDiameter ?? CABINET_DEFAULT_LIBRARY_LADDER_STANDOFF_DIAMETER);
}

export function getCabinetLibraryLadderStandoffLocalXPositions(module: CabinetModuleDefinition): number[] {
  const count = getCabinetLibraryLadderStandoffCount(module);
  const diameter = getCabinetLibraryLadderStandoffDiameter(module);
  if (count <= 0 || diameter <= 0) return [];

  return Array.from({ length: count }, (_, index) => ((index + 1) * module.width) / (count + 1) - diameter / 2);
}
