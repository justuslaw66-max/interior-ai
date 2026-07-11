import type { CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_WINE_RACK_COLUMN_COUNT = 3;
export const CABINET_DEFAULT_WINE_RACK_ROW_COUNT = 5;
export const CABINET_DEFAULT_WINE_RACK_DIVIDER_THICKNESS = 18;

export function hasCabinetWineRack(module: CabinetModuleDefinition): boolean {
  return (
    typeof module.wineRackColumnCount === "number" ||
    typeof module.wineRackRowCount === "number" ||
    typeof module.wineRackDepth === "number" ||
    typeof module.wineRackDividerThickness === "number"
  );
}

export function getCabinetWineRackColumnCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetWineRack(module)) return 0;
  return Math.max(0, module.wineRackColumnCount ?? CABINET_DEFAULT_WINE_RACK_COLUMN_COUNT);
}

export function getCabinetWineRackRowCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetWineRack(module)) return 0;
  return Math.max(0, module.wineRackRowCount ?? CABINET_DEFAULT_WINE_RACK_ROW_COUNT);
}

export function getCabinetWineRackDividerThickness(module: CabinetModuleDefinition): number {
  if (!hasCabinetWineRack(module)) return 0;
  return Math.max(0, module.wineRackDividerThickness ?? CABINET_DEFAULT_WINE_RACK_DIVIDER_THICKNESS);
}

export function getCabinetWineRackDepth(module: CabinetModuleDefinition, backPanelThickness: number): number {
  if (!hasCabinetWineRack(module)) return 0;
  return Math.max(0, module.wineRackDepth ?? Math.max(0, module.depth - backPanelThickness));
}

export function getCabinetWineRackOpeningWidth(
  module: CabinetModuleDefinition,
  boardThickness: number,
  revealGap: number
): number {
  return Math.max(0, module.width - boardThickness * 2 - revealGap * 2);
}

export function getCabinetWineRackOpeningHeight(
  module: CabinetModuleDefinition,
  boardThickness: number,
  toeKickHeight: number,
  revealGap: number
): number {
  return Math.max(0, module.height - toeKickHeight - boardThickness * 2 - revealGap * 2);
}

export function getCabinetWineRackBayWidth(
  module: CabinetModuleDefinition,
  boardThickness: number,
  revealGap: number
): number {
  const columnCount = getCabinetWineRackColumnCount(module);
  const dividerThickness = getCabinetWineRackDividerThickness(module);
  if (columnCount <= 0) return 0;
  return Math.max(
    0,
    (getCabinetWineRackOpeningWidth(module, boardThickness, revealGap) -
      Math.max(0, columnCount - 1) * dividerThickness) /
    columnCount
  );
}

export function getCabinetWineRackBayHeight(
  module: CabinetModuleDefinition,
  boardThickness: number,
  toeKickHeight: number,
  revealGap: number
): number {
  const rowCount = getCabinetWineRackRowCount(module);
  const dividerThickness = getCabinetWineRackDividerThickness(module);
  if (rowCount <= 0) return 0;
  return Math.max(
    0,
    (getCabinetWineRackOpeningHeight(module, boardThickness, toeKickHeight, revealGap) -
      Math.max(0, rowCount - 1) * dividerThickness) /
    rowCount
  );
}

export function getCabinetWineRackVerticalDividerLocalXPositions(
  module: CabinetModuleDefinition,
  boardThickness: number,
  revealGap: number
): number[] {
  const columnCount = getCabinetWineRackColumnCount(module);
  const dividerThickness = getCabinetWineRackDividerThickness(module);
  const bayWidth = getCabinetWineRackBayWidth(module, boardThickness, revealGap);
  const openingX = boardThickness + revealGap;
  const positions: number[] = [];

  if (columnCount <= 1 || dividerThickness <= 0 || bayWidth <= 0) return positions;

  for (let index = 1; index < columnCount; index += 1) {
    positions.push(openingX + index * bayWidth + (index - 1) * dividerThickness);
  }

  return positions;
}

export function getCabinetWineRackHorizontalRailLocalYPositions(
  module: CabinetModuleDefinition,
  boardThickness: number,
  toeKickHeight: number,
  revealGap: number
): number[] {
  const rowCount = getCabinetWineRackRowCount(module);
  const dividerThickness = getCabinetWineRackDividerThickness(module);
  const bayHeight = getCabinetWineRackBayHeight(module, boardThickness, toeKickHeight, revealGap);
  const openingY = toeKickHeight + boardThickness + revealGap;
  const positions: number[] = [];

  if (rowCount <= 1 || dividerThickness <= 0 || bayHeight <= 0) return positions;

  for (let index = 1; index < rowCount; index += 1) {
    positions.push(openingY + index * bayHeight + (index - 1) * dividerThickness);
  }

  return positions;
}
