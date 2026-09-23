import type { CabinetDefinition, CabinetModuleDefinition } from "./types";

export const CABINET_HANGING_ROD_DIAMETER = 28;
export const CABINET_DEFAULT_HANGING_ROD_HEIGHT = 1700;
export const CABINET_DEFAULT_HANGING_ROD_SPACING = 900;
export const CABINET_HANGING_ROD_HARDWARE_ID = "closet_hanging_rod";
export const CABINET_HANGING_ROD_SKU_ID = "CAB-HW-CLOSET-ROD";

export function getCabinetHangingRodCount(module: CabinetModuleDefinition): number {
  return Math.max(0, module.hangingRodCount ?? 0);
}

export function getCabinetHangingRodHeight(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  if (typeof module.hangingRodHeight === "number") return module.hangingRodHeight;
  const maxHeight = module.height - definition.boardThickness - 120;
  const minHeight = definition.toeKickHeight + definition.boardThickness + 250;
  return Math.max(minHeight, Math.min(CABINET_DEFAULT_HANGING_ROD_HEIGHT, maxHeight));
}

export function getCabinetHangingRodSpacing(module: CabinetModuleDefinition): number {
  return Math.max(0, module.hangingRodSpacing ?? CABINET_DEFAULT_HANGING_ROD_SPACING);
}

export function getCabinetHangingRodCenterHeights(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number[] {
  const count = getCabinetHangingRodCount(module);
  const firstHeight = getCabinetHangingRodHeight(definition, module);
  const spacing = getCabinetHangingRodSpacing(module);

  return Array.from({ length: count }, (_, index) => Math.max(0, firstHeight - index * spacing));
}
