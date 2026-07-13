import type {
  CabinetDefinition,
  CabinetModuleDefinition,
  CabinetShelfSpacingMode,
} from "./types";

export function getCabinetShelfSpacingMode(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): CabinetShelfSpacingMode {
  return (
    module.shelfSpacingMode ??
    definition.automation?.shelfSpacingMode ??
    "even"
  );
}

export function getCabinetEvenShelfCenterHeights(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition,
  shelfCount = module.shelfCount
): number[] {
  const count = Math.max(0, Math.floor(shelfCount));
  if (count === 0) return [];
  const minimumCenterMm = definition.toeKickHeight + definition.boardThickness;
  const maximumCenterMm = Math.max(
    minimumCenterMm,
    module.height - definition.boardThickness
  );
  const usableHeightMm = Math.max(0, maximumCenterMm - minimumCenterMm);
  return Array.from(
    { length: count },
    (_, index) =>
      minimumCenterMm + ((index + 1) * usableHeightMm) / (count + 1)
  );
}

export function getCabinetShelfCenterHeights(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number[] {
  const count = Math.max(0, Math.floor(module.shelfCount));
  if (
    getCabinetShelfSpacingMode(definition, module) === "custom" &&
    module.shelfPositionsMm?.length === count &&
    module.shelfPositionsMm.every(Number.isFinite)
  ) {
    return [...module.shelfPositionsMm];
  }
  return getCabinetEvenShelfCenterHeights(definition, module, count);
}
