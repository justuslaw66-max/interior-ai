import type { CabinetLifestyleInsertKind, CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_LIFESTYLE_INSERT_KIND: CabinetLifestyleInsertKind = "toy_bin";
export const CABINET_DEFAULT_LIFESTYLE_INSERT_COUNT = 1;
export const CABINET_DEFAULT_LIFESTYLE_INSERT_DECK_HEIGHT = 18;
export const CABINET_DEFAULT_LIFESTYLE_INSERT_LIP_HEIGHT = 80;

export interface CabinetLifestyleInsertLayout {
  index: number;
  localX: number;
  width: number;
}

export function hasCabinetLifestyleInsert(module: CabinetModuleDefinition): boolean {
  return (
    typeof module.lifestyleInsertKind === "string" ||
    typeof module.lifestyleInsertCount === "number" ||
    typeof module.lifestyleInsertDepth === "number" ||
    typeof module.lifestyleInsertDeckHeight === "number" ||
    typeof module.lifestyleInsertLipHeight === "number"
  );
}

export function getCabinetLifestyleInsertKind(
  module: CabinetModuleDefinition
): CabinetLifestyleInsertKind {
  return module.lifestyleInsertKind ?? CABINET_DEFAULT_LIFESTYLE_INSERT_KIND;
}

export function getCabinetLifestyleInsertCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetLifestyleInsert(module)) return 0;
  return Math.max(0, module.lifestyleInsertCount ?? CABINET_DEFAULT_LIFESTYLE_INSERT_COUNT);
}

export function getCabinetLifestyleInsertDepth(module: CabinetModuleDefinition): number {
  if (!hasCabinetLifestyleInsert(module)) return 0;
  return Math.max(0, module.lifestyleInsertDepth ?? Math.max(0, module.depth - 80));
}

export function getCabinetLifestyleInsertDeckHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetLifestyleInsert(module)) return 0;
  return Math.max(0, module.lifestyleInsertDeckHeight ?? CABINET_DEFAULT_LIFESTYLE_INSERT_DECK_HEIGHT);
}

export function getCabinetLifestyleInsertLipHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetLifestyleInsert(module)) return 0;
  return Math.max(0, module.lifestyleInsertLipHeight ?? CABINET_DEFAULT_LIFESTYLE_INSERT_LIP_HEIGHT);
}

export function getCabinetLifestyleInsertLayouts(
  module: CabinetModuleDefinition,
  boardThickness: number,
  revealGap: number
): CabinetLifestyleInsertLayout[] {
  const insertCount = getCabinetLifestyleInsertCount(module);
  if (insertCount <= 0) return [];
  const usableWidth = Math.max(0, module.width - boardThickness * 2 - revealGap * 2);
  const insertWidth = Math.max(0, (usableWidth - revealGap * (insertCount - 1)) / insertCount);
  return Array.from({ length: insertCount }, (_, index) => ({
    index,
    localX: boardThickness + revealGap + index * (insertWidth + revealGap),
    width: insertWidth,
  })).filter((layout) => layout.width > 0);
}
