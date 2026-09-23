import type { CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_PANEL_FRAME_WIDTH = 55;
export const CABINET_DEFAULT_PANEL_FRAME_DEPTH = 18;

export function hasCabinetPanelFrame(module: CabinetModuleDefinition): boolean {
  return (module.panelColumnCount ?? 0) > 0 || (module.panelRowCount ?? 0) > 0;
}

export function getCabinetPanelColumnCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetPanelFrame(module)) return 0;
  return Math.max(1, module.panelColumnCount ?? 1);
}

export function getCabinetPanelRowCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetPanelFrame(module)) return 0;
  return Math.max(1, module.panelRowCount ?? 1);
}

export function getCabinetPanelFrameWidth(module: CabinetModuleDefinition): number {
  return Math.max(0, module.panelFrameWidth ?? CABINET_DEFAULT_PANEL_FRAME_WIDTH);
}

export function getCabinetPanelFrameDepth(module: CabinetModuleDefinition): number {
  return Math.max(0, module.panelFrameDepth ?? CABINET_DEFAULT_PANEL_FRAME_DEPTH);
}

export function getCabinetPanelStileLocalXPositions(module: CabinetModuleDefinition): number[] {
  const columnCount = getCabinetPanelColumnCount(module);
  if (columnCount <= 0) return [];

  const frameWidth = getCabinetPanelFrameWidth(module);
  const maxX = Math.max(0, module.width - frameWidth);

  return Array.from({ length: columnCount + 1 }, (_, index) => {
    if (index === 0) return 0;
    if (index === columnCount) return maxX;
    return Math.max(0, Math.min(maxX, (index * module.width) / columnCount - frameWidth / 2));
  });
}

export function getCabinetPanelRailLocalYPositions(module: CabinetModuleDefinition): number[] {
  const rowCount = getCabinetPanelRowCount(module);
  if (rowCount <= 0) return [];

  const frameWidth = getCabinetPanelFrameWidth(module);
  const maxY = Math.max(0, module.height - frameWidth);

  return Array.from({ length: rowCount + 1 }, (_, index) => {
    if (index === 0) return 0;
    if (index === rowCount) return maxY;
    return Math.max(0, Math.min(maxY, (index * module.height) / rowCount - frameWidth / 2));
  });
}

export function getCabinetPanelOpeningWidth(module: CabinetModuleDefinition): number {
  const columnCount = getCabinetPanelColumnCount(module);
  if (columnCount <= 0) return 0;
  return (module.width - getCabinetPanelFrameWidth(module) * (columnCount + 1)) / columnCount;
}

export function getCabinetPanelOpeningHeight(module: CabinetModuleDefinition): number {
  const rowCount = getCabinetPanelRowCount(module);
  if (rowCount <= 0) return 0;
  return (module.height - getCabinetPanelFrameWidth(module) * (rowCount + 1)) / rowCount;
}
