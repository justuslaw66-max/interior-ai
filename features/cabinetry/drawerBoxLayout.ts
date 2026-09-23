import { CABINET_FRONT_THICKNESS } from "./layout";
import {
  CABINET_DEFAULT_DRAWER_SLIDE_CLEARANCE,
  getCabinetDrawerFrontLayouts,
  getCabinetDrawerSlideLength,
  hasCabinetDrawerSlides,
} from "./drawerSlideLayout";
import type { CabinetDefinition, CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_DRAWER_BOX_SIDE_THICKNESS = 12;
export const CABINET_DEFAULT_DRAWER_BOX_BOTTOM_THICKNESS = 6;
export const CABINET_DEFAULT_DRAWER_BOX_HEIGHT_CLEARANCE = 45;
export const CABINET_DEFAULT_DRAWER_BOX_BACK_CLEARANCE = 20;

export interface CabinetDrawerBoxLayout {
  frontKey: string;
  frontPartId: string;
  drawerIndex: number;
  localX: number;
  localY: number;
  localZ: number;
  width: number;
  height: number;
  depth: number;
  sideThickness: number;
  bottomThickness: number;
  backClearance: number;
  heightClearance: number;
}

export function hasCabinetDrawerBoxes(module: CabinetModuleDefinition): boolean {
  if (module.drawerBoxEnabled === false) return false;
  return (
    Boolean(module.drawerBoxEnabled) ||
    typeof module.drawerBoxSideThickness === "number" ||
    typeof module.drawerBoxBottomThickness === "number" ||
    typeof module.drawerBoxHeightClearance === "number" ||
    typeof module.drawerBoxBackClearance === "number"
  );
}

export function getCabinetDrawerBoxSideThickness(module: CabinetModuleDefinition): number {
  if (!hasCabinetDrawerBoxes(module)) return 0;
  return Math.max(0, module.drawerBoxSideThickness ?? CABINET_DEFAULT_DRAWER_BOX_SIDE_THICKNESS);
}

export function getCabinetDrawerBoxBottomThickness(module: CabinetModuleDefinition): number {
  if (!hasCabinetDrawerBoxes(module)) return 0;
  return Math.max(0, module.drawerBoxBottomThickness ?? CABINET_DEFAULT_DRAWER_BOX_BOTTOM_THICKNESS);
}

export function getCabinetDrawerBoxHeightClearance(module: CabinetModuleDefinition): number {
  if (!hasCabinetDrawerBoxes(module)) return 0;
  return Math.max(0, module.drawerBoxHeightClearance ?? CABINET_DEFAULT_DRAWER_BOX_HEIGHT_CLEARANCE);
}

export function getCabinetDrawerBoxBackClearance(module: CabinetModuleDefinition): number {
  if (!hasCabinetDrawerBoxes(module)) return 0;
  return Math.max(0, module.drawerBoxBackClearance ?? CABINET_DEFAULT_DRAWER_BOX_BACK_CLEARANCE);
}

export function getCabinetDrawerBoxLayouts(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): CabinetDrawerBoxLayout[] {
  if (!hasCabinetDrawerBoxes(module)) return [];

  const sideThickness = getCabinetDrawerBoxSideThickness(module);
  const bottomThickness = getCabinetDrawerBoxBottomThickness(module);
  const heightClearance = getCabinetDrawerBoxHeightClearance(module);
  const backClearance = getCabinetDrawerBoxBackClearance(module);
  const sideClearance = Math.max(0, module.drawerSlideClearance ?? CABINET_DEFAULT_DRAWER_SLIDE_CLEARANCE);
  const maxInteriorDepth = Math.max(
    1,
    module.depth - definition.backPanelThickness - CABINET_FRONT_THICKNESS - backClearance
  );
  const slideDepth = hasCabinetDrawerSlides(module)
    ? Math.max(1, getCabinetDrawerSlideLength(module) - backClearance)
    : maxInteriorDepth;
  const boxDepth = Math.max(1, Math.min(slideDepth, maxInteriorDepth));

  return getCabinetDrawerFrontLayouts(definition, module).map((front) => {
    const boxWidth = Math.max(1, front.width - sideClearance * 2);
    const boxHeight = Math.max(1, front.height - heightClearance);

    return {
      frontKey: front.key,
      frontPartId: `${module.id}:drawer_front:${front.key}`,
      drawerIndex: front.drawerIndex,
      localX: front.localX + sideClearance,
      localY: front.localY + Math.max(0, heightClearance / 2),
      localZ: CABINET_FRONT_THICKNESS,
      width: boxWidth,
      height: boxHeight,
      depth: boxDepth,
      sideThickness,
      bottomThickness,
      backClearance,
      heightClearance,
    };
  });
}
