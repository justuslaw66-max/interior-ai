import type { CabinetCeilingBeamOrientation, CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_CEILING_BEAM_COUNT = 4;
export const CABINET_DEFAULT_CEILING_BEAM_WIDTH = 160;
export const CABINET_DEFAULT_CEILING_BEAM_DEPTH = 180;
export const CABINET_DEFAULT_CEILING_GRID_COUNT = 3;

export function isCabinetCeilingBeamArray(module: CabinetModuleDefinition): boolean {
  return module.millworkComponentType === "ceiling_beam_array";
}

export function isCabinetCofferedCeilingGrid(module: CabinetModuleDefinition): boolean {
  return module.millworkComponentType === "coffered_ceiling_grid";
}

export function isCabinetCeilingComponent(module: CabinetModuleDefinition): boolean {
  return isCabinetCeilingBeamArray(module) || isCabinetCofferedCeilingGrid(module);
}

export function getCabinetCeilingBeamCount(module: CabinetModuleDefinition): number {
  if (!isCabinetCeilingBeamArray(module)) return 0;
  return Math.max(1, module.ceilingBeamCount ?? CABINET_DEFAULT_CEILING_BEAM_COUNT);
}

export function getCabinetCeilingBeamWidth(module: CabinetModuleDefinition): number {
  return Math.max(0, module.ceilingBeamWidth ?? CABINET_DEFAULT_CEILING_BEAM_WIDTH);
}

export function getCabinetCeilingBeamDepth(module: CabinetModuleDefinition): number {
  return Math.max(0, module.ceilingBeamDepth ?? module.height ?? CABINET_DEFAULT_CEILING_BEAM_DEPTH);
}

export function getCabinetCeilingBeamOrientation(
  module: CabinetModuleDefinition
): CabinetCeilingBeamOrientation {
  return module.ceilingBeamOrientation ?? "z";
}

export function getCabinetCeilingGridColumnCount(module: CabinetModuleDefinition): number {
  if (!isCabinetCofferedCeilingGrid(module)) return 0;
  return Math.max(1, module.ceilingGridColumnCount ?? CABINET_DEFAULT_CEILING_GRID_COUNT);
}

export function getCabinetCeilingGridRowCount(module: CabinetModuleDefinition): number {
  if (!isCabinetCofferedCeilingGrid(module)) return 0;
  return Math.max(1, module.ceilingGridRowCount ?? CABINET_DEFAULT_CEILING_GRID_COUNT);
}

export function getCabinetCeilingBeamArraySpan(module: CabinetModuleDefinition): number {
  return getCabinetCeilingBeamOrientation(module) === "z" ? module.width : module.depth;
}

export function getCabinetCeilingBeamArrayLocalPositions(module: CabinetModuleDefinition): number[] {
  const count = getCabinetCeilingBeamCount(module);
  if (count <= 0) return [];

  const beamWidth = getCabinetCeilingBeamWidth(module);
  const span = getCabinetCeilingBeamArraySpan(module);
  if (count === 1) return [Math.max(0, (span - beamWidth) / 2)];

  const remaining = span - count * beamWidth;
  const gap = remaining > 0 ? remaining / (count + 1) : 0;
  return Array.from({ length: count }, (_, index) =>
    Math.max(0, Math.min(Math.max(0, span - beamWidth), gap + index * (beamWidth + gap)))
  );
}

export function getCabinetCeilingGridOpeningWidth(module: CabinetModuleDefinition): number {
  const columnCount = getCabinetCeilingGridColumnCount(module);
  if (columnCount <= 0) return 0;
  return (module.width - getCabinetCeilingBeamWidth(module) * (columnCount + 1)) / columnCount;
}

export function getCabinetCeilingGridOpeningDepth(module: CabinetModuleDefinition): number {
  const rowCount = getCabinetCeilingGridRowCount(module);
  if (rowCount <= 0) return 0;
  return (module.depth - getCabinetCeilingBeamWidth(module) * (rowCount + 1)) / rowCount;
}

export function getCabinetCeilingGridColumnBeamXPositions(module: CabinetModuleDefinition): number[] {
  const columnCount = getCabinetCeilingGridColumnCount(module);
  if (columnCount <= 0) return [];

  const beamWidth = getCabinetCeilingBeamWidth(module);
  const maxX = Math.max(0, module.width - beamWidth);

  return Array.from({ length: columnCount + 1 }, (_, index) => {
    if (index === 0) return 0;
    if (index === columnCount) return maxX;
    return Math.max(0, Math.min(maxX, (index * module.width) / columnCount - beamWidth / 2));
  });
}

export function getCabinetCeilingGridRowBeamZPositions(module: CabinetModuleDefinition): number[] {
  const rowCount = getCabinetCeilingGridRowCount(module);
  if (rowCount <= 0) return [];

  const beamWidth = getCabinetCeilingBeamWidth(module);
  const maxZ = Math.max(0, module.depth - beamWidth);

  return Array.from({ length: rowCount + 1 }, (_, index) => {
    if (index === 0) return 0;
    if (index === rowCount) return maxZ;
    return Math.max(0, Math.min(maxZ, (index * module.depth) / rowCount - beamWidth / 2));
  });
}
