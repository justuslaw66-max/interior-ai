import type { CabinetDefinition, CabinetModuleDefinition } from "./types";
import { isCabinetCeilingComponent } from "./ceilingBeamLayout";
import { isCabinetTrimComponent } from "./trimLayout";
import { isCabinetConvertibleComponent } from "./convertibleLayout";

export const CABINET_DEFAULT_LEVELING_FOOT_COUNT = 4;
export const CABINET_DEFAULT_LEVELING_FOOT_HEIGHT = 95;
export const CABINET_DEFAULT_LEVELING_FOOT_DIAMETER = 36;
export const CABINET_DEFAULT_LEVELING_FOOT_INSET_FROM_SIDES = 75;
export const CABINET_DEFAULT_LEVELING_FOOT_INSET_FROM_FRONT_BACK = 70;
export const CABINET_LEVELING_FOOT_HARDWARE_ID = "adjustable_leveling_foot";
export const CABINET_LEVELING_FOOT_SKU_ID = "CAB-HW-LEVELING-FOOT";

export interface CabinetLevelingFootLayout {
  footIndex: number;
  localX: number;
  localZ: number;
  centerX: number;
  centerZ: number;
}

export function hasCabinetLevelingFeet(definition: CabinetDefinition): boolean {
  if (definition.levelingFeetEnabled === false) return false;
  return (
    Boolean(definition.levelingFeetEnabled) ||
    typeof definition.levelingFootCount === "number" ||
    typeof definition.levelingFootHeight === "number" ||
    typeof definition.levelingFootDiameter === "number" ||
    typeof definition.levelingFootInsetFromSides === "number" ||
    typeof definition.levelingFootInsetFromFrontBack === "number"
  );
}

export function isCabinetLevelingFootEligibleModule(module: CabinetModuleDefinition): boolean {
  return (
    module.type !== "wall" &&
    !isCabinetCeilingComponent(module) &&
    !isCabinetTrimComponent(module) &&
    !isCabinetConvertibleComponent(module)
  );
}

export function getCabinetLevelingFootCount(definition: CabinetDefinition): number {
  if (!hasCabinetLevelingFeet(definition)) return 0;
  return Math.max(0, Math.floor(definition.levelingFootCount ?? CABINET_DEFAULT_LEVELING_FOOT_COUNT));
}

export function getCabinetLevelingFootHeight(definition: CabinetDefinition): number {
  if (!hasCabinetLevelingFeet(definition)) return 0;
  return Math.max(0, definition.levelingFootHeight ?? CABINET_DEFAULT_LEVELING_FOOT_HEIGHT);
}

export function getCabinetLevelingFootDiameter(definition: CabinetDefinition): number {
  if (!hasCabinetLevelingFeet(definition)) return 0;
  return Math.max(0, definition.levelingFootDiameter ?? CABINET_DEFAULT_LEVELING_FOOT_DIAMETER);
}

export function getCabinetLevelingFootInsetFromSides(definition: CabinetDefinition): number {
  if (!hasCabinetLevelingFeet(definition)) return 0;
  return Math.max(0, definition.levelingFootInsetFromSides ?? CABINET_DEFAULT_LEVELING_FOOT_INSET_FROM_SIDES);
}

export function getCabinetLevelingFootInsetFromFrontBack(definition: CabinetDefinition): number {
  if (!hasCabinetLevelingFeet(definition)) return 0;
  return Math.max(0, definition.levelingFootInsetFromFrontBack ?? CABINET_DEFAULT_LEVELING_FOOT_INSET_FROM_FRONT_BACK);
}

export function getCabinetLevelingFootLayouts(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): CabinetLevelingFootLayout[] {
  const count = getCabinetLevelingFootCount(definition);
  const diameter = getCabinetLevelingFootDiameter(definition);
  if (count <= 0 || diameter <= 0 || !isCabinetLevelingFootEligibleModule(module)) return [];

  const sideInset = getCabinetLevelingFootInsetFromSides(definition);
  const frontBackInset = getCabinetLevelingFootInsetFromFrontBack(definition);
  const xPositions =
    count === 1
      ? [module.width / 2]
      : Array.from({ length: Math.ceil(count / 2) }, (_, index) => {
          const slots = Math.max(1, Math.ceil(count / 2) - 1);
          const span = Math.max(0, module.width - sideInset * 2);
          return sideInset + (span * index) / slots;
        });
  const frontZ = frontBackInset;
  const rearZ = Math.max(frontZ, module.depth - frontBackInset);

  return Array.from({ length: count }, (_, index) => {
    const centerX = xPositions[Math.floor(index / 2)] ?? module.width / 2;
    const centerZ = count === 1 ? module.depth / 2 : index % 2 === 0 ? frontZ : rearZ;
    return {
      footIndex: index,
      centerX,
      centerZ,
      localX: centerX - diameter / 2,
      localZ: centerZ - diameter / 2,
    };
  });
}
