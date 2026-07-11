import type { CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_STEMWARE_RACK_LANE_COUNT = 3;
export const CABINET_DEFAULT_STEMWARE_RACK_DEPTH = 360;
export const CABINET_DEFAULT_STEMWARE_RACK_RAIL_WIDTH = 14;
export const CABINET_DEFAULT_STEMWARE_RACK_RAIL_HEIGHT = 12;
export const CABINET_DEFAULT_STEMWARE_RACK_LANE_SPACING = 70;
export const CABINET_DEFAULT_STEMWARE_RACK_MOUNT_HEIGHT = 1760;
export const CABINET_STEMWARE_RACK_HARDWARE_ID = "stemware_rack";
export const CABINET_STEMWARE_RACK_SKU_ID = "CAB-HW-STEMWARE-RACK";

export function hasCabinetStemwareRack(module: CabinetModuleDefinition): boolean {
  if (module.stemwareRackEnabled === false) return false;
  return (
    Boolean(module.stemwareRackEnabled) ||
    typeof module.stemwareRackLaneCount === "number" ||
    typeof module.stemwareRackDepth === "number" ||
    typeof module.stemwareRackRailWidth === "number" ||
    typeof module.stemwareRackLaneSpacing === "number" ||
    typeof module.stemwareRackMountHeight === "number"
  );
}

export function getCabinetStemwareRackLaneCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetStemwareRack(module)) return 0;
  return Math.max(0, module.stemwareRackLaneCount ?? CABINET_DEFAULT_STEMWARE_RACK_LANE_COUNT);
}

export function getCabinetStemwareRackDepth(module: CabinetModuleDefinition): number {
  if (!hasCabinetStemwareRack(module)) return 0;
  return Math.max(0, module.stemwareRackDepth ?? CABINET_DEFAULT_STEMWARE_RACK_DEPTH);
}

export function getCabinetStemwareRackRailWidth(module: CabinetModuleDefinition): number {
  if (!hasCabinetStemwareRack(module)) return 0;
  return Math.max(0, module.stemwareRackRailWidth ?? CABINET_DEFAULT_STEMWARE_RACK_RAIL_WIDTH);
}

export function getCabinetStemwareRackLaneSpacing(module: CabinetModuleDefinition): number {
  if (!hasCabinetStemwareRack(module)) return 0;
  return Math.max(0, module.stemwareRackLaneSpacing ?? CABINET_DEFAULT_STEMWARE_RACK_LANE_SPACING);
}

export function getCabinetStemwareRackMountHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetStemwareRack(module)) return 0;
  return Math.max(0, module.stemwareRackMountHeight ?? CABINET_DEFAULT_STEMWARE_RACK_MOUNT_HEIGHT);
}

export function getCabinetStemwareRackTotalWidth(module: CabinetModuleDefinition): number {
  const laneCount = getCabinetStemwareRackLaneCount(module);
  if (laneCount <= 0) return 0;
  const railWidth = getCabinetStemwareRackRailWidth(module);
  const laneSpacing = getCabinetStemwareRackLaneSpacing(module);
  return laneCount * (railWidth * 2 + laneSpacing) + (laneCount - 1) * laneSpacing;
}

export function getCabinetStemwareRackRailLocalXPositions(module: CabinetModuleDefinition): number[] {
  const laneCount = getCabinetStemwareRackLaneCount(module);
  const railWidth = getCabinetStemwareRackRailWidth(module);
  const laneSpacing = getCabinetStemwareRackLaneSpacing(module);
  if (laneCount <= 0 || railWidth <= 0) return [];

  const laneWidth = railWidth * 2 + laneSpacing;
  const startX = (module.width - getCabinetStemwareRackTotalWidth(module)) / 2;
  const positions: number[] = [];
  for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) {
    const laneX = startX + laneIndex * (laneWidth + laneSpacing);
    positions.push(laneX, laneX + railWidth + laneSpacing);
  }
  return positions;
}

export function getCabinetStemwareRackLocalY(module: CabinetModuleDefinition): number {
  return getCabinetStemwareRackMountHeight(module) - CABINET_DEFAULT_STEMWARE_RACK_RAIL_HEIGHT / 2;
}

export function getCabinetStemwareRackLocalZ(module: CabinetModuleDefinition): number {
  return Math.max(0, (module.depth - getCabinetStemwareRackDepth(module)) / 2);
}
