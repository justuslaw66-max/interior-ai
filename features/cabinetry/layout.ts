import type { CabinetDefinition, CabinetModuleDefinition } from "./types";
import {
  getCabinetPlatformDeckOverhangBack,
  getCabinetPlatformDeckOverhangFront,
  hasCabinetPlatformDeck,
} from "./platformBedLayout";
import {
  getCabinetStairScribeHighHeight,
  hasCabinetStairScribe,
} from "./stairScribeLayout";
import {
  getCabinetOfficeWorksurfaceDepth,
  getCabinetOfficeWorksurfaceOverhangFront,
  hasCabinetOfficeWorkstation,
} from "./officeWorkstationLayout";

export const CABINET_FRONT_THICKNESS = 18;
export const CABINET_DEFAULT_END_PANEL_THICKNESS = CABINET_FRONT_THICKNESS;
export const CABINET_DEFAULT_COUNTERTOP_THICKNESS = 38;
export const CABINET_DEFAULT_COUNTERTOP_SIDE_OVERHANG = 20;
export const CABINET_DEFAULT_COUNTERTOP_FRONT_OVERHANG = 25;
export const CABINET_DEFAULT_BACKSPLASH_HEIGHT = 100;
export const CABINET_DEFAULT_BACKSPLASH_THICKNESS = 18;
export const CABINET_DEFAULT_TOE_KICK_SETBACK = 40;
export const CABINET_DEFAULT_TOE_KICK_BACK_CLEARANCE = 80;
export const CABINET_MIN_TOE_KICK_DEPTH = 40;

const nonNegative = (value: number | undefined) => Math.max(0, value ?? 0);

function countertopValue(definition: CabinetDefinition, value: number | undefined, fallback: number): number {
  if (!definition.includeCountertop) return 0;
  return nonNegative(value ?? fallback);
}

function backsplashValue(definition: CabinetDefinition, value: number | undefined, fallback: number): number {
  if (!definition.includeBacksplash) return 0;
  return nonNegative(value ?? fallback);
}

function endPanelValue(enabled: boolean | undefined, value: number | undefined): number {
  if (!enabled) return 0;
  return nonNegative(value ?? CABINET_DEFAULT_END_PANEL_THICKNESS);
}

export function getCabinetModuleRunWidth(definition: CabinetDefinition): number {
  return definition.modules.reduce((sum, module) => sum + module.width, 0);
}

export function getCabinetModuleRunDepth(definition: CabinetDefinition): number {
  return definition.modules.reduce((max, module) => Math.max(max, module.depth), 0);
}

export function getCabinetModuleRunHeight(definition: CabinetDefinition): number {
  return definition.modules.reduce(
    (max, module) =>
      Math.max(max, hasCabinetStairScribe(module) ? getCabinetStairScribeHighHeight(module) : module.height),
    0
  );
}

export function getCabinetLeftFillerWidth(definition: CabinetDefinition): number {
  return nonNegative(definition.leftFillerWidth);
}

export function getCabinetRightFillerWidth(definition: CabinetDefinition): number {
  return nonNegative(definition.rightFillerWidth);
}

export function getCabinetLeftFillerScribeAllowance(definition: CabinetDefinition): number {
  return nonNegative(definition.leftFillerScribeAllowance);
}

export function getCabinetRightFillerScribeAllowance(definition: CabinetDefinition): number {
  return nonNegative(definition.rightFillerScribeAllowance);
}

export function getCabinetLeftEndPanelThickness(definition: CabinetDefinition): number {
  return endPanelValue(definition.includeLeftEndPanel, definition.leftEndPanelThickness);
}

export function getCabinetRightEndPanelThickness(definition: CabinetDefinition): number {
  return endPanelValue(definition.includeRightEndPanel, definition.rightEndPanelThickness);
}

export function getCabinetToeKickSetback(definition: CabinetDefinition): number {
  return nonNegative(definition.toeKickSetback ?? CABINET_DEFAULT_TOE_KICK_SETBACK);
}

export function getCabinetToeKickDepth(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  if (definition.toeKickHeight <= 0) return 0;
  return nonNegative(
    definition.toeKickDepth ??
      Math.max(
        CABINET_MIN_TOE_KICK_DEPTH,
        module.depth - getCabinetToeKickSetback(definition) - CABINET_DEFAULT_TOE_KICK_BACK_CLEARANCE
      )
  );
}

export function getCabinetCountertopThickness(definition: CabinetDefinition): number {
  return countertopValue(definition, definition.countertopThickness, CABINET_DEFAULT_COUNTERTOP_THICKNESS);
}

export function getCabinetCountertopOverhangLeft(definition: CabinetDefinition): number {
  return countertopValue(definition, definition.countertopOverhangLeft, CABINET_DEFAULT_COUNTERTOP_SIDE_OVERHANG);
}

export function getCabinetCountertopOverhangRight(definition: CabinetDefinition): number {
  return countertopValue(definition, definition.countertopOverhangRight, CABINET_DEFAULT_COUNTERTOP_SIDE_OVERHANG);
}

export function getCabinetCountertopOverhangFront(definition: CabinetDefinition): number {
  return countertopValue(definition, definition.countertopOverhangFront, CABINET_DEFAULT_COUNTERTOP_FRONT_OVERHANG);
}

export function getCabinetCountertopOverhangBack(definition: CabinetDefinition): number {
  return countertopValue(definition, definition.countertopOverhangBack, 0);
}

export function getCabinetBacksplashHeight(definition: CabinetDefinition): number {
  return backsplashValue(definition, definition.backsplashHeight, CABINET_DEFAULT_BACKSPLASH_HEIGHT);
}

export function getCabinetBacksplashThickness(definition: CabinetDefinition): number {
  return backsplashValue(definition, definition.backsplashThickness, CABINET_DEFAULT_BACKSPLASH_THICKNESS);
}

export function getCabinetPlatformDeckOverhangFrontMax(definition: CabinetDefinition): number {
  return definition.modules.reduce(
    (max, module) => Math.max(max, hasCabinetPlatformDeck(module) ? getCabinetPlatformDeckOverhangFront(module) : 0),
    0
  );
}

export function getCabinetPlatformDeckOverhangBackMax(definition: CabinetDefinition): number {
  return definition.modules.reduce(
    (max, module) => Math.max(max, hasCabinetPlatformDeck(module) ? getCabinetPlatformDeckOverhangBack(module) : 0),
    0
  );
}

export function getCabinetOfficeWorksurfaceOverhangFrontMax(definition: CabinetDefinition): number {
  return definition.modules.reduce(
    (max, module) =>
      Math.max(max, hasCabinetOfficeWorkstation(module) ? getCabinetOfficeWorksurfaceOverhangFront(module) : 0),
    0
  );
}

export function getCabinetOfficeWorksurfaceOverhangBackMax(definition: CabinetDefinition): number {
  return definition.modules.reduce((max, module) => {
    if (!hasCabinetOfficeWorkstation(module)) return max;
    return Math.max(
      max,
      getCabinetOfficeWorksurfaceDepth(module) - getCabinetOfficeWorksurfaceOverhangFront(module) - module.depth
    );
  }, 0);
}

export function getCabinetModuleStartOffset(definition: CabinetDefinition): number {
  return (
    getCabinetCountertopOverhangLeft(definition) +
    getCabinetLeftFillerWidth(definition) +
    getCabinetLeftEndPanelThickness(definition)
  );
}

export function getCabinetModuleFrontOffset(definition: CabinetDefinition): number {
  return Math.max(
    getCabinetCountertopOverhangFront(definition),
    getCabinetPlatformDeckOverhangFrontMax(definition),
    getCabinetOfficeWorksurfaceOverhangFrontMax(definition)
  );
}

export function getCabinetOverallWidth(definition: CabinetDefinition): number {
  return (
    getCabinetCountertopOverhangLeft(definition) +
    getCabinetLeftFillerWidth(definition) +
    getCabinetLeftEndPanelThickness(definition) +
    getCabinetModuleRunWidth(definition) +
    getCabinetRightEndPanelThickness(definition) +
    getCabinetRightFillerWidth(definition) +
    getCabinetCountertopOverhangRight(definition)
  );
}

export function getCabinetOverallDepth(definition: CabinetDefinition): number {
  return (
    getCabinetModuleFrontOffset(definition) +
    getCabinetModuleRunDepth(definition) +
    Math.max(
      getCabinetCountertopOverhangBack(definition),
      getCabinetPlatformDeckOverhangBackMax(definition),
      getCabinetOfficeWorksurfaceOverhangBackMax(definition)
    )
  );
}

export function getCabinetOverallHeight(definition: CabinetDefinition): number {
  return getCabinetModuleRunHeight(definition) + getCabinetCountertopThickness(definition) + getCabinetBacksplashHeight(definition);
}
