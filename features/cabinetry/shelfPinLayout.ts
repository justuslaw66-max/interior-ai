import type { CabinetDefinition, CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_SHELF_PIN_ROW_PAIR_COUNT = 2;
export const CABINET_DEFAULT_SHELF_PIN_HOLE_COUNT = 12;
export const CABINET_DEFAULT_SHELF_PIN_HOLE_SPACING = 32;
export const CABINET_DEFAULT_SHELF_PIN_INSET_FROM_FRONT = 55;
export const CABINET_DEFAULT_SHELF_PIN_START_HEIGHT = 300;
export const CABINET_SHELF_PIN_ROW_MARKER_WIDTH = 6;
export const CABINET_SHELF_PIN_ROW_MARKER_DEPTH = 6;
export const CABINET_SHELF_PIN_HARDWARE_ID = "adjustable_shelf_pin_set";
export const CABINET_SHELF_PIN_SKU_ID = "CAB-HW-SHELF-PIN-SET";

export interface CabinetShelfPinRowLayout {
  pairIndex: number;
  side: "left" | "right";
  localX: number;
  localZ: number;
}

export function hasCabinetShelfPinRows(module: CabinetModuleDefinition): boolean {
  if (module.shelfPinRowsEnabled === false) return false;
  return (
    Boolean(module.shelfPinRowsEnabled) ||
    typeof module.shelfPinRowPairCount === "number" ||
    typeof module.shelfPinHoleCount === "number" ||
    typeof module.shelfPinHoleSpacing === "number" ||
    typeof module.shelfPinInsetFromFront === "number" ||
    typeof module.shelfPinStartHeight === "number"
  );
}

export function getCabinetShelfPinRowPairCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetShelfPinRows(module)) return 0;
  return Math.max(0, module.shelfPinRowPairCount ?? CABINET_DEFAULT_SHELF_PIN_ROW_PAIR_COUNT);
}

export function getCabinetShelfPinHoleCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetShelfPinRows(module)) return 0;
  return Math.max(0, module.shelfPinHoleCount ?? CABINET_DEFAULT_SHELF_PIN_HOLE_COUNT);
}

export function getCabinetShelfPinHoleSpacing(module: CabinetModuleDefinition): number {
  if (!hasCabinetShelfPinRows(module)) return 0;
  return Math.max(0, module.shelfPinHoleSpacing ?? CABINET_DEFAULT_SHELF_PIN_HOLE_SPACING);
}

export function getCabinetShelfPinInsetFromFront(module: CabinetModuleDefinition): number {
  if (!hasCabinetShelfPinRows(module)) return 0;
  return Math.max(0, module.shelfPinInsetFromFront ?? CABINET_DEFAULT_SHELF_PIN_INSET_FROM_FRONT);
}

export function getCabinetShelfPinStartHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetShelfPinRows(module)) return 0;
  return Math.max(0, module.shelfPinStartHeight ?? CABINET_DEFAULT_SHELF_PIN_START_HEIGHT);
}

export function getCabinetShelfPinRowHeight(module: CabinetModuleDefinition): number {
  const holeCount = getCabinetShelfPinHoleCount(module);
  if (holeCount <= 0) return 0;
  return CABINET_SHELF_PIN_ROW_MARKER_WIDTH + Math.max(0, holeCount - 1) * getCabinetShelfPinHoleSpacing(module);
}

export function getCabinetShelfPinRowLocalZPositions(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number[] {
  const pairCount = getCabinetShelfPinRowPairCount(module);
  const inset = getCabinetShelfPinInsetFromFront(module);
  if (pairCount <= 0) return [];
  if (pairCount === 1) return [inset];

  const maxZ = Math.max(
    inset,
    module.depth - definition.backPanelThickness - inset - CABINET_SHELF_PIN_ROW_MARKER_DEPTH
  );
  return Array.from({ length: pairCount }, (_, index) =>
    inset + ((maxZ - inset) * index) / Math.max(1, pairCount - 1)
  );
}

export function getCabinetShelfPinRowLayouts(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): CabinetShelfPinRowLayout[] {
  const leftX = definition.boardThickness - CABINET_SHELF_PIN_ROW_MARKER_WIDTH / 2;
  const rightX = module.width - definition.boardThickness - CABINET_SHELF_PIN_ROW_MARKER_WIDTH / 2;
  return getCabinetShelfPinRowLocalZPositions(definition, module).flatMap((localZ, pairIndex) => [
    { pairIndex, side: "left", localX: leftX, localZ },
    { pairIndex, side: "right", localX: rightX, localZ },
  ]);
}
