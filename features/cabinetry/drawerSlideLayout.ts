import { getCabinetDrawerHeightProportions } from "./frontBehavior";
import type { CabinetDefinition, CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_DRAWER_SLIDE_LENGTH = 500;
export const CABINET_DEFAULT_DRAWER_SLIDE_CLEARANCE = 13;
export const CABINET_DRAWER_SLIDE_PAIR_HEIGHT = 24;
export const CABINET_DEFAULT_DRAWER_SLIDE_OFFSET_FROM_BOTTOM = 45;
export const CABINET_DRAWER_SLIDE_HARDWARE_ID = "soft_close_drawer_slide_pair";
export const CABINET_DRAWER_SLIDE_SKU_ID = "CAB-HW-DRAWER-SLIDE-PAIR";

export interface CabinetDrawerFrontLayout {
  key: string;
  drawerIndex: number;
  localX: number;
  localY: number;
  width: number;
  height: number;
}

export interface CabinetDrawerSlideLayout {
  frontKey: string;
  frontPartId: string;
  drawerIndex: number;
  localX: number;
  localY: number;
  localZ: number;
  width: number;
}

export function hasCabinetDrawerSlides(module: CabinetModuleDefinition): boolean {
  if (module.drawerSlideHardwareEnabled === false) return false;
  return (
    Boolean(module.drawerSlideHardwareEnabled) ||
    typeof module.drawerSlideLength === "number" ||
    typeof module.drawerSlideClearance === "number"
  );
}

export function getCabinetDrawerSlideLength(module: CabinetModuleDefinition): number {
  if (!hasCabinetDrawerSlides(module)) return 0;
  return Math.max(0, module.drawerSlideLength ?? CABINET_DEFAULT_DRAWER_SLIDE_LENGTH);
}

export function getCabinetDrawerSlideClearance(module: CabinetModuleDefinition): number {
  if (!hasCabinetDrawerSlides(module)) return 0;
  return Math.max(0, module.drawerSlideClearance ?? CABINET_DEFAULT_DRAWER_SLIDE_CLEARANCE);
}

export function getCabinetDrawerFrontLayouts(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): CabinetDrawerFrontLayout[] {
  const boardThickness = definition.boardThickness;
  const gap = definition.revealGap;
  const openingX = boardThickness + gap;
  const openingY = definition.toeKickHeight + boardThickness + gap;
  const openingWidth = Math.max(1, module.width - 2 * boardThickness - 2 * gap);
  const openingHeight = Math.max(
    1,
    module.height - definition.toeKickHeight - 2 * boardThickness - 2 * gap
  );
  const fronts: CabinetDrawerFrontLayout[] = [];

  const addDrawerFronts = (
    drawerCount: number,
    localY: number,
    height: number,
    keyPrefix = "drawer"
  ) => {
    if (drawerCount <= 0) return;
    const proportions = getCabinetDrawerHeightProportions(
      definition,
      drawerCount === module.drawerCount ? module : { ...module, drawerCount }
    );
    const availableFrontHeight = Math.max(1, height - gap * (drawerCount - 1));
    let nextLocalY = localY;
    for (let index = 0; index < drawerCount; index += 1) {
      const drawerHeight = availableFrontHeight * (proportions[index] ?? 1 / drawerCount);
      fronts.push({
        key: `${keyPrefix}-${index + 1}`,
        drawerIndex: index,
        localX: openingX,
        localY: nextLocalY,
        width: openingWidth,
        height: drawerHeight,
      });
      nextLocalY += drawerHeight + gap;
    }
  };

  if (module.frontType === "drawer_stack") {
    addDrawerFronts(module.drawerCount, openingY, openingHeight);
  }
  if (module.frontType === "door_and_drawer") {
    const drawerBand = Math.min(220, openingHeight * 0.32);
    addDrawerFronts(Math.max(1, module.drawerCount), openingY + openingHeight - drawerBand, drawerBand, "top-drawer");
  }

  return fronts;
}

export function getCabinetDrawerSlideLayouts(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): CabinetDrawerSlideLayout[] {
  return getCabinetDrawerFrontLayouts(definition, module).map((front) => ({
    frontKey: front.key,
    frontPartId: `${module.id}:drawer_front:${front.key}`,
    drawerIndex: front.drawerIndex,
    localX: front.localX,
    localY:
      front.localY +
      Math.min(
        Math.max(0, front.height - CABINET_DRAWER_SLIDE_PAIR_HEIGHT),
        CABINET_DEFAULT_DRAWER_SLIDE_OFFSET_FROM_BOTTOM
      ),
    localZ: 0,
    width: front.width,
  }));
}
