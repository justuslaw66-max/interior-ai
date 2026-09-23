import type { CabinetDefinition, CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_HAMPER_BASKET_COUNT = 2;
export const CABINET_DEFAULT_HAMPER_BASKET_DEPTH = 520;
export const CABINET_DEFAULT_HAMPER_BASKET_HEIGHT = 360;
export const CABINET_DEFAULT_HAMPER_SLIDE_CLEARANCE = 35;
export const CABINET_HAMPER_SLIDE_PAIR_HEIGHT = 24;
export const CABINET_HAMPER_BASKET_HARDWARE_ID = "pullout_hamper_basket";
export const CABINET_HAMPER_BASKET_SKU_ID = "CAB-HW-HAMPER-BASKET";
export const CABINET_HAMPER_SLIDE_HARDWARE_ID = "pullout_hamper_slide_pair";
export const CABINET_HAMPER_SLIDE_SKU_ID = "CAB-HW-HAMPER-SLIDE-PAIR";

export interface CabinetHamperBasketLayout {
  index: number;
  localX: number;
  width: number;
}

export function hasCabinetHamperPullOut(module: CabinetModuleDefinition): boolean {
  if (module.hamperPullOutEnabled === false) return false;
  return (
    Boolean(module.hamperPullOutEnabled) ||
    typeof module.hamperBasketCount === "number" ||
    typeof module.hamperBasketDepth === "number" ||
    typeof module.hamperBasketHeight === "number" ||
    typeof module.hamperSlideClearance === "number"
  );
}

export function getCabinetHamperBasketCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetHamperPullOut(module)) return 0;
  return Math.max(0, module.hamperBasketCount ?? CABINET_DEFAULT_HAMPER_BASKET_COUNT);
}

export function getCabinetHamperBasketDepth(module: CabinetModuleDefinition): number {
  if (!hasCabinetHamperPullOut(module)) return 0;
  return Math.max(0, module.hamperBasketDepth ?? CABINET_DEFAULT_HAMPER_BASKET_DEPTH);
}

export function getCabinetHamperBasketHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetHamperPullOut(module)) return 0;
  return Math.max(0, module.hamperBasketHeight ?? CABINET_DEFAULT_HAMPER_BASKET_HEIGHT);
}

export function getCabinetHamperSlideClearance(module: CabinetModuleDefinition): number {
  if (!hasCabinetHamperPullOut(module)) return 0;
  return Math.max(0, module.hamperSlideClearance ?? CABINET_DEFAULT_HAMPER_SLIDE_CLEARANCE);
}

export function getCabinetHamperOpeningX(definition: CabinetDefinition, module: CabinetModuleDefinition): number {
  return definition.boardThickness + definition.revealGap + getCabinetHamperSlideClearance(module);
}

export function getCabinetHamperOpeningY(definition: CabinetDefinition): number {
  return definition.toeKickHeight + definition.boardThickness + definition.revealGap;
}

export function getCabinetHamperOpeningWidth(definition: CabinetDefinition, module: CabinetModuleDefinition): number {
  return Math.max(
    0,
    module.width -
      definition.boardThickness * 2 -
      definition.revealGap * 2 -
      getCabinetHamperSlideClearance(module) * 2
  );
}

export function getCabinetHamperOpeningHeight(definition: CabinetDefinition, module: CabinetModuleDefinition): number {
  return Math.max(
    0,
    module.height -
      definition.toeKickHeight -
      definition.boardThickness * 2 -
      definition.revealGap * 2
  );
}

export function getCabinetHamperBasketLayouts(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): CabinetHamperBasketLayout[] {
  const count = getCabinetHamperBasketCount(module);
  if (count <= 0) return [];
  const openingWidth = getCabinetHamperOpeningWidth(definition, module);
  const basketWidth = Math.max(0, (openingWidth - definition.revealGap * (count - 1)) / count);
  return Array.from({ length: count }, (_, index) => ({
    index,
    localX: getCabinetHamperOpeningX(definition, module) + index * (basketWidth + definition.revealGap),
    width: basketWidth,
  })).filter((layout) => layout.width > 0);
}
