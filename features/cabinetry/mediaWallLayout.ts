import type { CabinetDefinition, CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_MEDIA_TV_OPENING_WIDTH = 1400;
export const CABINET_DEFAULT_MEDIA_TV_OPENING_HEIGHT = 850;
export const CABINET_DEFAULT_MEDIA_TV_MOUNT_HEIGHT = 1200;
export const CABINET_DEFAULT_MEDIA_TV_BLOCKING_THICKNESS = 18;
export const CABINET_DEFAULT_MEDIA_CABLE_CHASE_WIDTH = 120;
export const CABINET_DEFAULT_MEDIA_CABLE_CHASE_DEPTH = 60;
export const CABINET_DEFAULT_MEDIA_CABLE_CHASE_HEIGHT = 700;
export const CABINET_DEFAULT_MEDIA_VENT_SLOT_COUNT = 4;
export const CABINET_DEFAULT_MEDIA_VENT_SLOT_WIDTH = 220;
export const CABINET_DEFAULT_MEDIA_VENT_SLOT_HEIGHT = 24;
export const CABINET_DEFAULT_MEDIA_VENT_SLOT_SPACING = 24;
export const CABINET_MEDIA_VENT_SLOT_MARKER_THICKNESS = 4;

export function hasCabinetMediaWallDetails(module: CabinetModuleDefinition): boolean {
  if (module.mediaWallEnabled === false) return false;
  return (
    Boolean(module.mediaWallEnabled) ||
    typeof module.mediaTvOpeningWidth === "number" ||
    typeof module.mediaTvOpeningHeight === "number" ||
    typeof module.mediaTvMountHeight === "number" ||
    typeof module.mediaTvBlockingThickness === "number" ||
    typeof module.mediaCableChaseWidth === "number" ||
    typeof module.mediaCableChaseDepth === "number" ||
    typeof module.mediaCableChaseHeight === "number" ||
    typeof module.mediaVentSlotCount === "number" ||
    typeof module.mediaVentSlotWidth === "number" ||
    typeof module.mediaVentSlotHeight === "number" ||
    typeof module.mediaVentSlotSpacing === "number"
  );
}

export function getCabinetMediaTvOpeningWidth(module: CabinetModuleDefinition): number {
  if (!hasCabinetMediaWallDetails(module)) return 0;
  return Math.max(0, module.mediaTvOpeningWidth ?? CABINET_DEFAULT_MEDIA_TV_OPENING_WIDTH);
}

export function getCabinetMediaTvOpeningHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetMediaWallDetails(module)) return 0;
  return Math.max(0, module.mediaTvOpeningHeight ?? CABINET_DEFAULT_MEDIA_TV_OPENING_HEIGHT);
}

export function getCabinetMediaTvMountHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetMediaWallDetails(module)) return 0;
  return Math.max(0, module.mediaTvMountHeight ?? CABINET_DEFAULT_MEDIA_TV_MOUNT_HEIGHT);
}

export function getCabinetMediaTvBlockingThickness(module: CabinetModuleDefinition): number {
  if (!hasCabinetMediaWallDetails(module)) return 0;
  return Math.max(0, module.mediaTvBlockingThickness ?? CABINET_DEFAULT_MEDIA_TV_BLOCKING_THICKNESS);
}

export function getCabinetMediaTvBlockingLocalX(module: CabinetModuleDefinition): number {
  return (module.width - getCabinetMediaTvOpeningWidth(module)) / 2;
}

export function getCabinetMediaTvBlockingLocalY(
  _definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  return getCabinetMediaTvMountHeight(module) - getCabinetMediaTvOpeningHeight(module) / 2;
}

export function getCabinetMediaTvBlockingLocalZ(module: CabinetModuleDefinition): number {
  return Math.max(0, module.depth - getCabinetMediaTvBlockingThickness(module));
}

export function getCabinetMediaCableChaseWidth(module: CabinetModuleDefinition): number {
  if (!hasCabinetMediaWallDetails(module)) return 0;
  return Math.max(0, module.mediaCableChaseWidth ?? CABINET_DEFAULT_MEDIA_CABLE_CHASE_WIDTH);
}

export function getCabinetMediaCableChaseDepth(module: CabinetModuleDefinition): number {
  if (!hasCabinetMediaWallDetails(module)) return 0;
  return Math.max(0, module.mediaCableChaseDepth ?? CABINET_DEFAULT_MEDIA_CABLE_CHASE_DEPTH);
}

export function getCabinetMediaCableChaseHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetMediaWallDetails(module)) return 0;
  return Math.max(0, module.mediaCableChaseHeight ?? CABINET_DEFAULT_MEDIA_CABLE_CHASE_HEIGHT);
}

export function getCabinetMediaCableChaseLocalX(module: CabinetModuleDefinition): number {
  return (module.width - getCabinetMediaCableChaseWidth(module)) / 2;
}

export function getCabinetMediaCableChaseLocalY(
  _definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  return getCabinetMediaTvMountHeight(module) - getCabinetMediaCableChaseHeight(module) / 2;
}

export function getCabinetMediaCableChaseLocalZ(module: CabinetModuleDefinition): number {
  return Math.max(0, module.depth - getCabinetMediaCableChaseDepth(module));
}

export function getCabinetMediaVentSlotCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetMediaWallDetails(module)) return 0;
  return Math.max(0, module.mediaVentSlotCount ?? CABINET_DEFAULT_MEDIA_VENT_SLOT_COUNT);
}

export function getCabinetMediaVentSlotWidth(module: CabinetModuleDefinition): number {
  if (!hasCabinetMediaWallDetails(module)) return 0;
  return Math.max(0, module.mediaVentSlotWidth ?? CABINET_DEFAULT_MEDIA_VENT_SLOT_WIDTH);
}

export function getCabinetMediaVentSlotHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetMediaWallDetails(module)) return 0;
  return Math.max(0, module.mediaVentSlotHeight ?? CABINET_DEFAULT_MEDIA_VENT_SLOT_HEIGHT);
}

export function getCabinetMediaVentSlotSpacing(module: CabinetModuleDefinition): number {
  if (!hasCabinetMediaWallDetails(module)) return 0;
  return Math.max(0, module.mediaVentSlotSpacing ?? CABINET_DEFAULT_MEDIA_VENT_SLOT_SPACING);
}

export function getCabinetMediaVentSlotTotalWidth(module: CabinetModuleDefinition): number {
  const count = getCabinetMediaVentSlotCount(module);
  if (count <= 0) return 0;
  return count * getCabinetMediaVentSlotWidth(module) + (count - 1) * getCabinetMediaVentSlotSpacing(module);
}

export function getCabinetMediaVentSlotLocalXPositions(module: CabinetModuleDefinition): number[] {
  const count = getCabinetMediaVentSlotCount(module);
  const slotWidth = getCabinetMediaVentSlotWidth(module);
  const slotSpacing = getCabinetMediaVentSlotSpacing(module);
  if (count <= 0 || slotWidth <= 0) return [];

  const startX = (module.width - getCabinetMediaVentSlotTotalWidth(module)) / 2;
  return Array.from({ length: count }, (_, index) => startX + index * (slotWidth + slotSpacing));
}

export function getCabinetMediaVentSlotLocalY(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  const slotHeight = getCabinetMediaVentSlotHeight(module);
  const minimumY = definition.toeKickHeight + definition.boardThickness;
  const preferredY = Math.round(module.height * 0.34);
  const maxY = Math.max(minimumY, module.height - slotHeight - 70);
  return Math.max(minimumY, Math.min(maxY, preferredY));
}
