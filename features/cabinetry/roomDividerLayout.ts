import type { CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_ROOM_DIVIDER_BACK_PANEL_COUNT = 2;
export const CABINET_DEFAULT_ROOM_DIVIDER_BACK_PANEL_THICKNESS = 18;
export const CABINET_DEFAULT_ROOM_DIVIDER_STABILIZER_FOOT_COUNT = 2;
export const CABINET_DEFAULT_ROOM_DIVIDER_STABILIZER_FOOT_WIDTH = 90;
export const CABINET_DEFAULT_ROOM_DIVIDER_STABILIZER_FOOT_HEIGHT = 45;

export interface CabinetRoomDividerBackPanelLayout {
  index: number;
  localX: number;
  width: number;
}

export interface CabinetRoomDividerStabilizerFootLayout {
  index: number;
  localX: number;
  width: number;
}

export function hasCabinetRoomDividerDetails(module: CabinetModuleDefinition): boolean {
  return (
    Boolean(module.roomDividerFinishedBack) ||
    typeof module.roomDividerBackPanelCount === "number" ||
    typeof module.roomDividerBackPanelThickness === "number" ||
    typeof module.roomDividerStabilizerFootCount === "number" ||
    typeof module.roomDividerStabilizerFootWidth === "number" ||
    typeof module.roomDividerStabilizerFootHeight === "number" ||
    typeof module.roomDividerStabilizerFootDepth === "number"
  );
}

export function hasCabinetRoomDividerFinishedBack(module: CabinetModuleDefinition): boolean {
  return Boolean(module.roomDividerFinishedBack) || (module.roomDividerBackPanelCount ?? 0) > 0;
}

export function getCabinetRoomDividerBackPanelCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetRoomDividerFinishedBack(module)) return 0;
  return Math.max(0, module.roomDividerBackPanelCount ?? CABINET_DEFAULT_ROOM_DIVIDER_BACK_PANEL_COUNT);
}

export function getCabinetRoomDividerBackPanelThickness(module: CabinetModuleDefinition): number {
  if (!hasCabinetRoomDividerFinishedBack(module)) return 0;
  return Math.max(0, module.roomDividerBackPanelThickness ?? CABINET_DEFAULT_ROOM_DIVIDER_BACK_PANEL_THICKNESS);
}

export function getCabinetRoomDividerStabilizerFootCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetRoomDividerDetails(module)) return 0;
  return Math.max(0, module.roomDividerStabilizerFootCount ?? CABINET_DEFAULT_ROOM_DIVIDER_STABILIZER_FOOT_COUNT);
}

export function getCabinetRoomDividerStabilizerFootWidth(module: CabinetModuleDefinition): number {
  if (!hasCabinetRoomDividerDetails(module)) return 0;
  return Math.max(0, module.roomDividerStabilizerFootWidth ?? CABINET_DEFAULT_ROOM_DIVIDER_STABILIZER_FOOT_WIDTH);
}

export function getCabinetRoomDividerStabilizerFootHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetRoomDividerDetails(module)) return 0;
  return Math.max(0, module.roomDividerStabilizerFootHeight ?? CABINET_DEFAULT_ROOM_DIVIDER_STABILIZER_FOOT_HEIGHT);
}

export function getCabinetRoomDividerStabilizerFootDepth(module: CabinetModuleDefinition): number {
  if (!hasCabinetRoomDividerDetails(module)) return 0;
  return Math.max(0, module.roomDividerStabilizerFootDepth ?? module.depth);
}

export function getCabinetRoomDividerBackPanelLayouts(
  module: CabinetModuleDefinition
): CabinetRoomDividerBackPanelLayout[] {
  const panelCount = getCabinetRoomDividerBackPanelCount(module);
  if (panelCount <= 0) return [];
  const panelWidth = module.width / panelCount;
  return Array.from({ length: panelCount }, (_, index) => ({
    index,
    localX: index * panelWidth,
    width: panelWidth,
  }));
}

export function getCabinetRoomDividerStabilizerFootLayouts(
  module: CabinetModuleDefinition
): CabinetRoomDividerStabilizerFootLayout[] {
  const footCount = getCabinetRoomDividerStabilizerFootCount(module);
  if (footCount <= 0) return [];
  const footWidth = getCabinetRoomDividerStabilizerFootWidth(module);
  if (footCount === 1) {
    return [{ index: 0, localX: Math.max(0, (module.width - footWidth) / 2), width: footWidth }];
  }

  const clear = module.width - footCount * footWidth;
  const gap = clear > 0 ? clear / (footCount + 1) : 0;
  return Array.from({ length: footCount }, (_, index) => ({
    index,
    localX: Math.max(0, Math.min(Math.max(0, module.width - footWidth), gap + index * (footWidth + gap))),
    width: footWidth,
  }));
}
