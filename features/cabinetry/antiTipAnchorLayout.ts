import type { CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_ANTI_TIP_ANCHOR_COUNT = 2;
export const CABINET_DEFAULT_ANTI_TIP_ANCHOR_INSET_FROM_SIDES = 90;
export const CABINET_DEFAULT_ANTI_TIP_ANCHOR_OFFSET_FROM_TOP = 180;
export const CABINET_ANTI_TIP_ANCHOR_WIDTH = 48;
export const CABINET_ANTI_TIP_ANCHOR_HEIGHT = 64;
export const CABINET_ANTI_TIP_ANCHOR_DEPTH = 12;
export const CABINET_ANTI_TIP_ANCHOR_HARDWARE_ID = "anti_tip_anchor_bracket";
export const CABINET_ANTI_TIP_ANCHOR_SKU_ID = "CAB-HW-ANTI-TIP-BRACKET";

export interface CabinetAntiTipAnchorLayout {
  anchorIndex: number;
  localX: number;
  localY: number;
  localZ: number;
  centerX: number;
  centerY: number;
}

export function hasCabinetAntiTipAnchors(module: CabinetModuleDefinition): boolean {
  if (module.antiTipAnchorEnabled === false) return false;
  return (
    Boolean(module.antiTipAnchorEnabled) ||
    typeof module.antiTipAnchorCount === "number" ||
    typeof module.antiTipAnchorHeight === "number" ||
    typeof module.antiTipAnchorInsetFromSides === "number"
  );
}

export function getCabinetAntiTipAnchorCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetAntiTipAnchors(module)) return 0;
  return Math.max(0, Math.floor(module.antiTipAnchorCount ?? CABINET_DEFAULT_ANTI_TIP_ANCHOR_COUNT));
}

export function getCabinetAntiTipAnchorHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetAntiTipAnchors(module)) return 0;
  return Math.max(
    0,
    module.antiTipAnchorHeight ?? Math.max(300, module.height - CABINET_DEFAULT_ANTI_TIP_ANCHOR_OFFSET_FROM_TOP)
  );
}

export function getCabinetAntiTipAnchorInsetFromSides(module: CabinetModuleDefinition): number {
  if (!hasCabinetAntiTipAnchors(module)) return 0;
  return Math.max(0, module.antiTipAnchorInsetFromSides ?? CABINET_DEFAULT_ANTI_TIP_ANCHOR_INSET_FROM_SIDES);
}

export function getCabinetAntiTipAnchorLayouts(module: CabinetModuleDefinition): CabinetAntiTipAnchorLayout[] {
  const count = getCabinetAntiTipAnchorCount(module);
  if (count <= 0) return [];

  const inset = getCabinetAntiTipAnchorInsetFromSides(module);
  const centerY = getCabinetAntiTipAnchorHeight(module);
  const usableSpan = Math.max(0, module.width - inset * 2);

  return Array.from({ length: count }, (_, index) => {
    const centerX = count === 1 ? module.width / 2 : inset + (usableSpan * index) / Math.max(1, count - 1);

    return {
      anchorIndex: index,
      centerX,
      centerY,
      localX: centerX - CABINET_ANTI_TIP_ANCHOR_WIDTH / 2,
      localY: centerY - CABINET_ANTI_TIP_ANCHOR_HEIGHT / 2,
      localZ: module.depth,
    };
  });
}
