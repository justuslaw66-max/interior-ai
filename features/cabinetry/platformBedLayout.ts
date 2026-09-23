import type { CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_PLATFORM_DECK_THICKNESS = 24;
export const CABINET_DEFAULT_PLATFORM_SUPPORT_RIB_COUNT = 3;
export const CABINET_DEFAULT_PLATFORM_SUPPORT_RIB_WIDTH = 70;
export const CABINET_DEFAULT_PLATFORM_SUPPORT_RIB_HEIGHT = 90;

export function hasCabinetPlatformDeck(module: CabinetModuleDefinition): boolean {
  return (
    typeof module.platformDeckThickness === "number" ||
    typeof module.platformSupportRibCount === "number" ||
    typeof module.platformDeckOverhangFront === "number" ||
    typeof module.platformDeckOverhangBack === "number"
  );
}

export function getCabinetPlatformDeckThickness(module: CabinetModuleDefinition): number {
  if (!hasCabinetPlatformDeck(module)) return 0;
  return Math.max(0, module.platformDeckThickness ?? CABINET_DEFAULT_PLATFORM_DECK_THICKNESS);
}

export function getCabinetPlatformDeckOverhangFront(module: CabinetModuleDefinition): number {
  if (!hasCabinetPlatformDeck(module)) return 0;
  return Math.max(0, module.platformDeckOverhangFront ?? 0);
}

export function getCabinetPlatformDeckOverhangBack(module: CabinetModuleDefinition): number {
  if (!hasCabinetPlatformDeck(module)) return 0;
  return Math.max(0, module.platformDeckOverhangBack ?? 0);
}

export function getCabinetPlatformDeckDepth(module: CabinetModuleDefinition): number {
  return (
    getCabinetPlatformDeckOverhangFront(module) +
    module.depth +
    getCabinetPlatformDeckOverhangBack(module)
  );
}

export function getCabinetPlatformSupportRibCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetPlatformDeck(module)) return 0;
  return Math.max(0, module.platformSupportRibCount ?? CABINET_DEFAULT_PLATFORM_SUPPORT_RIB_COUNT);
}

export function getCabinetPlatformSupportRibWidth(module: CabinetModuleDefinition): number {
  if (!hasCabinetPlatformDeck(module)) return 0;
  return Math.max(0, module.platformSupportRibWidth ?? CABINET_DEFAULT_PLATFORM_SUPPORT_RIB_WIDTH);
}

export function getCabinetPlatformSupportRibHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetPlatformDeck(module)) return 0;
  return Math.max(0, module.platformSupportRibHeight ?? CABINET_DEFAULT_PLATFORM_SUPPORT_RIB_HEIGHT);
}

export function getCabinetPlatformSupportRibLocalZPositions(module: CabinetModuleDefinition): number[] {
  const ribCount = getCabinetPlatformSupportRibCount(module);
  if (ribCount <= 0) return [];

  const ribWidth = getCabinetPlatformSupportRibWidth(module);
  const deckDepth = getCabinetPlatformDeckDepth(module);
  if (ribCount === 1) return [Math.max(0, (deckDepth - ribWidth) / 2)];

  const remaining = deckDepth - ribCount * ribWidth;
  const gap = remaining > 0 ? remaining / (ribCount + 1) : 0;
  return Array.from({ length: ribCount }, (_, index) =>
    Math.max(0, Math.min(Math.max(0, deckDepth - ribWidth), gap + index * (ribWidth + gap)))
  );
}
