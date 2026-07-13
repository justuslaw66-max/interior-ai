import { CABINET_FRONT_THICKNESS } from "./layout";
import { getCabinetEffectiveDoorCount } from "./frontBehavior";
import type { CabinetDefinition, CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_DOOR_HINGE_COUNT_PER_DOOR = 2;
export const CABINET_DEFAULT_DOOR_HINGE_INSET_FROM_TOP_BOTTOM = 90;
export const CABINET_DOOR_HINGE_MARKER_WIDTH = 14;
export const CABINET_DOOR_HINGE_MARKER_HEIGHT = 70;
export const CABINET_DOOR_HINGE_MARKER_DEPTH = 8;
export const CABINET_DOOR_HINGE_HARDWARE_ID = "concealed_door_hinge_pair";
export const CABINET_DOOR_HINGE_SKU_ID = "CAB-HW-DOOR-HINGE-PAIR";

export interface CabinetDoorHingeLayout {
  frontKey: string;
  frontPartId: string;
  doorIndex: number;
  hingeIndex: number;
  hingeCountPerDoor: number;
  swingSide: "left" | "right";
  localX: number;
  localY: number;
  localZ: number;
}

export interface CabinetDoorFrontLayout {
  key: string;
  doorIndex: number;
  swingSide: "left" | "right";
  localX: number;
  localY: number;
  width: number;
  height: number;
}

export function hasCabinetDoorHinges(module: CabinetModuleDefinition): boolean {
  if (module.doorHingeHardwareEnabled === false) return false;
  return (
    Boolean(module.doorHingeHardwareEnabled) ||
    typeof module.doorHingeCountPerDoor === "number" ||
    typeof module.doorHingeInsetFromTopBottom === "number"
  );
}

export function getCabinetDoorHingeCountPerDoor(module: CabinetModuleDefinition): number {
  if (!hasCabinetDoorHinges(module)) return 0;
  return Math.max(0, module.doorHingeCountPerDoor ?? CABINET_DEFAULT_DOOR_HINGE_COUNT_PER_DOOR);
}

export function getCabinetDoorHingeInsetFromTopBottom(module: CabinetModuleDefinition): number {
  if (!hasCabinetDoorHinges(module)) return 0;
  return Math.max(0, module.doorHingeInsetFromTopBottom ?? CABINET_DEFAULT_DOOR_HINGE_INSET_FROM_TOP_BOTTOM);
}

export function getCabinetDoorHingeLocalYPositions(
  module: CabinetModuleDefinition,
  doorHeight: number
): number[] {
  const hingeCount = getCabinetDoorHingeCountPerDoor(module);
  if (hingeCount <= 0) return [];

  const inset = getCabinetDoorHingeInsetFromTopBottom(module);
  const minY = inset;
  const maxY = Math.max(
    minY,
    doorHeight - inset - CABINET_DOOR_HINGE_MARKER_HEIGHT
  );

  if (hingeCount === 1) return [Math.max(0, (doorHeight - CABINET_DOOR_HINGE_MARKER_HEIGHT) / 2)];
  return Array.from({ length: hingeCount }, (_, index) =>
    minY + ((maxY - minY) * index) / Math.max(1, hingeCount - 1)
  );
}

export function getCabinetDoorFrontLayouts(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): CabinetDoorFrontLayout[] {
  const boardThickness = definition.boardThickness;
  const gap = definition.revealGap;
  const openingX = boardThickness + gap;
  const openingY = definition.toeKickHeight + boardThickness + gap;
  const openingWidth = Math.max(1, module.width - 2 * boardThickness - 2 * gap);
  const openingHeight = Math.max(
    1,
    module.height - definition.toeKickHeight - 2 * boardThickness - 2 * gap
  );
  const fronts: CabinetDoorFrontLayout[] = [];
  const effectiveDoorCount = getCabinetEffectiveDoorCount(definition, module);

  const addDoorFronts = (
    doorCount: number,
    localY: number,
    height: number,
    keyPrefix = "door"
  ) => {
    if (doorCount <= 0) return;
    const frontCount = Math.max(1, doorCount);
    const doorWidth = (openingWidth - gap * (frontCount - 1)) / frontCount;

    for (let index = 0; index < frontCount; index += 1) {
      fronts.push({
        key: `${keyPrefix}-${index + 1}`,
        doorIndex: index,
        swingSide: frontCount === 1 ? module.hingeSide === "right" ? "right" : "left" : index === 0 ? "left" : "right",
        localX: openingX + index * (doorWidth + gap),
        localY,
        width: doorWidth,
        height,
      });
    }
  };

  if (module.frontType === "single_door") {
    addDoorFronts(effectiveDoorCount, openingY, openingHeight);
  }
  if (module.frontType === "double_door") {
    addDoorFronts(effectiveDoorCount, openingY, openingHeight);
  }
  if (module.frontType === "slab_panel") {
    addDoorFronts(effectiveDoorCount, openingY, openingHeight, "slab");
  }
  if (module.frontType === "door_and_drawer") {
    const drawerBand = Math.min(220, openingHeight * 0.32);
    addDoorFronts(
      effectiveDoorCount,
      openingY,
      Math.max(1, openingHeight - drawerBand - gap),
      "lower-door"
    );
  }

  return fronts;
}

export function getCabinetDoorHingeLayouts(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): CabinetDoorHingeLayout[] {
  const hingeCountPerDoor = getCabinetDoorHingeCountPerDoor(module);
  if (hingeCountPerDoor <= 0) return [];

  return getCabinetDoorFrontLayouts(definition, module).flatMap((front) =>
    getCabinetDoorHingeLocalYPositions(module, front.height).map((localY, hingeIndex) => ({
      frontKey: front.key,
      frontPartId: `${module.id}:door_front:${front.key}`,
      doorIndex: front.doorIndex,
      hingeIndex,
      hingeCountPerDoor,
      swingSide: front.swingSide,
      localX:
        front.swingSide === "left"
          ? front.localX + 4
          : front.localX + front.width - CABINET_DOOR_HINGE_MARKER_WIDTH - 4,
      localY: front.localY + localY,
      localZ: -CABINET_FRONT_THICKNESS - CABINET_DOOR_HINGE_MARKER_DEPTH,
    }))
  );
}
