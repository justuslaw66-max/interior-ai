import type { CabinetDefinition, CabinetModuleDefinition } from "./types";

export const CABINET_MUDROOM_HOOK_HARDWARE_ID = "mudroom_wall_hook";
export const CABINET_MUDROOM_HOOK_SKU_ID = "CAB-HW-MUD-HOOK";
export const CABINET_DEFAULT_MUDROOM_HOOK_COUNT = 4;
export const CABINET_DEFAULT_MUDROOM_HOOK_RAIL_HEIGHT = 1450;
export const CABINET_DEFAULT_MUDROOM_HOOK_PROJECTION = 55;
export const CABINET_MUDROOM_HOOK_RAIL_HEIGHT = 120;
export const CABINET_MUDROOM_HOOK_RAIL_DEPTH = 18;
export const CABINET_MUDROOM_HOOK_WIDTH = 28;
export const CABINET_MUDROOM_HOOK_HEIGHT = 72;
export const CABINET_DEFAULT_SHOE_CUBBY_COUNT = 4;
export const CABINET_DEFAULT_SHOE_CUBBY_HEIGHT = 170;
export const CABINET_DEFAULT_SHOE_CUBBY_DEPTH = 360;
export const CABINET_DEFAULT_SHOE_CUBBY_DIVIDER_THICKNESS = 18;

export function hasCabinetMudroomHooks(module: CabinetModuleDefinition): boolean {
  return (
    typeof module.mudroomHookCount === "number" ||
    typeof module.mudroomHookRailHeight === "number" ||
    typeof module.mudroomHookProjection === "number"
  );
}

export function hasCabinetShoeCubbies(module: CabinetModuleDefinition): boolean {
  return (
    typeof module.shoeCubbyCount === "number" ||
    typeof module.shoeCubbyHeight === "number" ||
    typeof module.shoeCubbyDepth === "number" ||
    typeof module.shoeCubbyDividerThickness === "number"
  );
}

export function getCabinetMudroomHookCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetMudroomHooks(module)) return 0;
  return Math.max(0, module.mudroomHookCount ?? CABINET_DEFAULT_MUDROOM_HOOK_COUNT);
}

export function getCabinetMudroomHookRailHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetMudroomHooks(module)) return 0;
  return Math.max(0, module.mudroomHookRailHeight ?? CABINET_DEFAULT_MUDROOM_HOOK_RAIL_HEIGHT);
}

export function getCabinetMudroomHookProjection(module: CabinetModuleDefinition): number {
  if (!hasCabinetMudroomHooks(module)) return 0;
  return Math.max(0, module.mudroomHookProjection ?? CABINET_DEFAULT_MUDROOM_HOOK_PROJECTION);
}

export function getCabinetMudroomHookLocalXPositions(module: CabinetModuleDefinition): number[] {
  const count = getCabinetMudroomHookCount(module);
  if (count <= 0) return [];

  return Array.from({ length: count }, (_, index) =>
    ((index + 1) * module.width) / (count + 1) - CABINET_MUDROOM_HOOK_WIDTH / 2
  );
}

export function getCabinetShoeCubbyCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetShoeCubbies(module)) return 0;
  return Math.max(0, module.shoeCubbyCount ?? CABINET_DEFAULT_SHOE_CUBBY_COUNT);
}

export function getCabinetShoeCubbyHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetShoeCubbies(module)) return 0;
  return Math.max(0, module.shoeCubbyHeight ?? CABINET_DEFAULT_SHOE_CUBBY_HEIGHT);
}

export function getCabinetShoeCubbyDepth(module: CabinetModuleDefinition): number {
  if (!hasCabinetShoeCubbies(module)) return 0;
  return Math.max(0, module.shoeCubbyDepth ?? Math.min(module.depth, CABINET_DEFAULT_SHOE_CUBBY_DEPTH));
}

export function getCabinetShoeCubbyDividerThickness(module: CabinetModuleDefinition): number {
  if (!hasCabinetShoeCubbies(module)) return 0;
  return Math.max(0, module.shoeCubbyDividerThickness ?? CABINET_DEFAULT_SHOE_CUBBY_DIVIDER_THICKNESS);
}

export function getCabinetShoeCubbyOpeningX(definition: CabinetDefinition): number {
  return definition.boardThickness + definition.revealGap;
}

export function getCabinetShoeCubbyOpeningY(definition: CabinetDefinition): number {
  return definition.toeKickHeight + definition.boardThickness + definition.revealGap;
}

export function getCabinetShoeCubbyOpeningWidth(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  return Math.max(0, module.width - definition.boardThickness * 2 - definition.revealGap * 2);
}

export function getCabinetShoeCubbyBayWidth(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  const count = getCabinetShoeCubbyCount(module);
  const dividerThickness = getCabinetShoeCubbyDividerThickness(module);
  if (count <= 0) return 0;
  return Math.max(
    0,
    (getCabinetShoeCubbyOpeningWidth(definition, module) -
      Math.max(0, count - 1) * dividerThickness) /
      count
  );
}

export function getCabinetShoeCubbyVerticalDividerLocalXPositions(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number[] {
  const count = getCabinetShoeCubbyCount(module);
  const dividerThickness = getCabinetShoeCubbyDividerThickness(module);
  const bayWidth = getCabinetShoeCubbyBayWidth(definition, module);
  const openingX = getCabinetShoeCubbyOpeningX(definition);
  const positions: number[] = [];

  if (count <= 1 || dividerThickness <= 0 || bayWidth <= 0) return positions;

  for (let index = 1; index < count; index += 1) {
    positions.push(openingX + index * bayWidth + (index - 1) * dividerThickness);
  }

  return positions;
}
