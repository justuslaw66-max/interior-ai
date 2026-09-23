import type { CabinetDefinition, CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_PANTRY_PULL_OUT_TRAY_COUNT = 4;
export const CABINET_DEFAULT_PANTRY_PULL_OUT_TRAY_DEPTH = 520;
export const CABINET_DEFAULT_PANTRY_PULL_OUT_TRAY_FRONT_HEIGHT = 70;
export const CABINET_DEFAULT_PANTRY_PULL_OUT_SLIDE_CLEARANCE = 35;
export const CABINET_PANTRY_PULL_OUT_SLIDE_PAIR_HEIGHT = 24;
export const CABINET_PANTRY_PULL_OUT_TRAY_VERTICAL_PITCH = 260;
export const CABINET_PANTRY_PULL_OUT_SLIDE_HARDWARE_ID = "pantry_pullout_slide_pair";
export const CABINET_PANTRY_PULL_OUT_SLIDE_SKU_ID = "CAB-HW-PANTRY-SLIDE-PAIR";

export function hasCabinetPantryPullOuts(module: CabinetModuleDefinition): boolean {
  if (module.pantryPullOutTrayEnabled === false) return false;
  return (
    Boolean(module.pantryPullOutTrayEnabled) ||
    typeof module.pantryPullOutTrayCount === "number" ||
    typeof module.pantryPullOutTrayDepth === "number" ||
    typeof module.pantryPullOutTrayFrontHeight === "number" ||
    typeof module.pantryPullOutSlideClearance === "number"
  );
}

export function getCabinetPantryPullOutTrayCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetPantryPullOuts(module)) return 0;
  return Math.max(0, module.pantryPullOutTrayCount ?? CABINET_DEFAULT_PANTRY_PULL_OUT_TRAY_COUNT);
}

export function getCabinetPantryPullOutTrayDepth(module: CabinetModuleDefinition): number {
  if (!hasCabinetPantryPullOuts(module)) return 0;
  return Math.max(0, module.pantryPullOutTrayDepth ?? CABINET_DEFAULT_PANTRY_PULL_OUT_TRAY_DEPTH);
}

export function getCabinetPantryPullOutTrayFrontHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetPantryPullOuts(module)) return 0;
  return Math.max(0, module.pantryPullOutTrayFrontHeight ?? CABINET_DEFAULT_PANTRY_PULL_OUT_TRAY_FRONT_HEIGHT);
}

export function getCabinetPantryPullOutSlideClearance(module: CabinetModuleDefinition): number {
  if (!hasCabinetPantryPullOuts(module)) return 0;
  return Math.max(0, module.pantryPullOutSlideClearance ?? CABINET_DEFAULT_PANTRY_PULL_OUT_SLIDE_CLEARANCE);
}

export function getCabinetPantryPullOutOpeningX(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  return definition.boardThickness + definition.revealGap + getCabinetPantryPullOutSlideClearance(module);
}

export function getCabinetPantryPullOutOpeningWidth(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  return Math.max(
    0,
    module.width -
      2 * definition.boardThickness -
      2 * definition.revealGap -
      2 * getCabinetPantryPullOutSlideClearance(module)
  );
}

export function getCabinetPantryPullOutOpeningY(definition: CabinetDefinition): number {
  return definition.toeKickHeight + definition.boardThickness + definition.revealGap;
}

export function getCabinetPantryPullOutOpeningHeight(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  return Math.max(
    0,
    module.height -
      definition.toeKickHeight -
      2 * definition.boardThickness -
      2 * definition.revealGap
  );
}

export function getCabinetPantryPullOutTrayLocalYPositions(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number[] {
  const count = getCabinetPantryPullOutTrayCount(module);
  if (count <= 0) return [];

  const startY = getCabinetPantryPullOutOpeningY(definition);
  const pitch = Math.max(
    CABINET_PANTRY_PULL_OUT_TRAY_VERTICAL_PITCH,
    definition.boardThickness + getCabinetPantryPullOutTrayFrontHeight(module) + 120
  );

  return Array.from({ length: count }, (_, index) => startY + index * pitch);
}

export function getCabinetPantryPullOutRequiredHeight(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  const positions = getCabinetPantryPullOutTrayLocalYPositions(definition, module);
  if (positions.length === 0) return 0;
  const lastY = positions[positions.length - 1] ?? 0;
  return lastY - getCabinetPantryPullOutOpeningY(definition) + definition.boardThickness + getCabinetPantryPullOutTrayFrontHeight(module);
}
