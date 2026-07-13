import type {
  CabinetModuleDefinition,
  CabinetTrimEndTreatment,
  CabinetTrimOrientation,
  CabinetTrimPlacement,
} from "./types";

export const CABINET_DEFAULT_TRIM_MEMBER_COUNT = 4;
export const CABINET_DEFAULT_TRIM_PROFILE_WIDTH = 120;
export const CABINET_DEFAULT_TRIM_PROFILE_DEPTH = 24;
export const CABINET_DEFAULT_TRIM_PLACEMENT: CabinetTrimPlacement = "generic_trim";
export const CABINET_DEFAULT_TRIM_END_TREATMENT: CabinetTrimEndTreatment = "butt";
export const CABINET_DEFAULT_TRIM_RETURN_DEPTH = 90;
export const CABINET_DEFAULT_TRIM_MITER_ANGLE = 45;
export const CABINET_DEFAULT_TRIM_REVEAL_STRIP_HEIGHT = 18;
export const CABINET_DEFAULT_TRIM_REVEAL_STRIP_DEPTH = 12;
export const CABINET_DEFAULT_TRIM_REVEAL_STRIP_INSET_FROM_TOP = 6;
export const CABINET_DEFAULT_CHAIR_RAIL_SETOUT_HEIGHT = 900;
export const CABINET_DEFAULT_PICTURE_RAIL_OFFSET_FROM_TOP = 300;
export const CABINET_DEFAULT_FIREPLACE_OPENING_WIDTH = 1100;
export const CABINET_DEFAULT_FIREPLACE_OPENING_HEIGHT = 900;
export const CABINET_DEFAULT_FIREPLACE_LEG_WIDTH = 180;
export const CABINET_DEFAULT_FIREPLACE_HEADER_HEIGHT = 220;
export const CABINET_DEFAULT_FIREPLACE_MANTEL_HEIGHT = 120;
export const CABINET_DEFAULT_FIREPLACE_MANTEL_DEPTH = 260;

export function isCabinetTrimRun(module: CabinetModuleDefinition): boolean {
  return module.millworkComponentType === "trim_run";
}

export function isCabinetFireplaceSurroundFrame(module: CabinetModuleDefinition): boolean {
  return module.millworkComponentType === "fireplace_surround_frame";
}

export function isCabinetTrimComponent(module: CabinetModuleDefinition): boolean {
  return isCabinetTrimRun(module) || isCabinetFireplaceSurroundFrame(module);
}

export function getCabinetTrimMemberCount(module: CabinetModuleDefinition): number {
  if (!isCabinetTrimRun(module)) return 0;
  return Math.max(1, module.trimMemberCount ?? CABINET_DEFAULT_TRIM_MEMBER_COUNT);
}

export function getCabinetTrimProfileWidth(module: CabinetModuleDefinition): number {
  return Math.max(0, module.trimProfileWidth ?? CABINET_DEFAULT_TRIM_PROFILE_WIDTH);
}

export function getCabinetTrimProfileDepth(module: CabinetModuleDefinition): number {
  return Math.max(0, module.trimProfileDepth ?? CABINET_DEFAULT_TRIM_PROFILE_DEPTH);
}

export function getCabinetTrimOrientation(module: CabinetModuleDefinition): CabinetTrimOrientation {
  return module.trimOrientation ?? "x";
}

export function getCabinetTrimPlacement(module: CabinetModuleDefinition): CabinetTrimPlacement {
  return module.trimPlacement ?? CABINET_DEFAULT_TRIM_PLACEMENT;
}

export function getCabinetTrimSetoutHeight(module: CabinetModuleDefinition): number {
  if (!isCabinetTrimRun(module)) return 0;
  if (typeof module.trimSetoutHeight === "number") return Math.max(0, module.trimSetoutHeight);

  const profileWidth = getCabinetTrimProfileWidth(module);
  switch (getCabinetTrimPlacement(module)) {
    case "crown_moulding":
      return Math.max(0, module.height - profileWidth);
    case "chair_rail":
      return Math.min(Math.max(0, module.height - profileWidth), CABINET_DEFAULT_CHAIR_RAIL_SETOUT_HEIGHT);
    case "picture_rail":
      return Math.max(0, module.height - CABINET_DEFAULT_PICTURE_RAIL_OFFSET_FROM_TOP);
    case "baseboard":
    case "casing":
    case "generic_trim":
    default:
      return 0;
  }
}

export function getCabinetTrimLeftEndTreatment(module: CabinetModuleDefinition): CabinetTrimEndTreatment {
  return module.trimLeftEndTreatment ?? CABINET_DEFAULT_TRIM_END_TREATMENT;
}

export function getCabinetTrimRightEndTreatment(module: CabinetModuleDefinition): CabinetTrimEndTreatment {
  return module.trimRightEndTreatment ?? CABINET_DEFAULT_TRIM_END_TREATMENT;
}

export function getCabinetTrimReturnDepth(module: CabinetModuleDefinition): number {
  if (!isCabinetTrimRun(module)) return 0;
  return Math.max(0, module.trimReturnDepth ?? CABINET_DEFAULT_TRIM_RETURN_DEPTH);
}

export function getCabinetTrimMiterAngle(module: CabinetModuleDefinition): number {
  if (!isCabinetTrimRun(module)) return 0;
  return Math.max(0, module.trimMiterAngle ?? CABINET_DEFAULT_TRIM_MITER_ANGLE);
}

export function hasCabinetTrimRevealStrip(module: CabinetModuleDefinition): boolean {
  if (!isCabinetTrimRun(module) || module.trimRevealStripEnabled === false) return false;
  return (
    Boolean(module.trimRevealStripEnabled) ||
    typeof module.trimRevealStripHeight === "number" ||
    typeof module.trimRevealStripDepth === "number" ||
    typeof module.trimRevealStripInsetFromTop === "number"
  );
}

export function getCabinetTrimRevealStripHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetTrimRevealStrip(module)) return 0;
  return Math.max(0, module.trimRevealStripHeight ?? CABINET_DEFAULT_TRIM_REVEAL_STRIP_HEIGHT);
}

export function getCabinetTrimRevealStripDepth(module: CabinetModuleDefinition): number {
  if (!hasCabinetTrimRevealStrip(module)) return 0;
  return Math.max(0, module.trimRevealStripDepth ?? CABINET_DEFAULT_TRIM_REVEAL_STRIP_DEPTH);
}

export function getCabinetTrimRevealStripInsetFromTop(module: CabinetModuleDefinition): number {
  if (!hasCabinetTrimRevealStrip(module)) return 0;
  return Math.max(0, module.trimRevealStripInsetFromTop ?? CABINET_DEFAULT_TRIM_REVEAL_STRIP_INSET_FROM_TOP);
}

export interface CabinetTrimRevealStripLayout {
  index: number;
  localX: number;
  localY: number;
  localZ: number;
  width: number;
  height: number;
  depth: number;
  orientation: CabinetTrimOrientation;
  placement: CabinetTrimPlacement;
}

export function getCabinetTrimRevealStripLayouts(module: CabinetModuleDefinition): CabinetTrimRevealStripLayout[] {
  if (!hasCabinetTrimRevealStrip(module)) return [];

  const memberCount = getCabinetTrimMemberCount(module);
  if (memberCount <= 0) return [];

  const orientation = getCabinetTrimOrientation(module);
  const span = orientation === "x" ? module.width : module.depth;
  const memberLength = span / memberCount;
  const profileWidth = getCabinetTrimProfileWidth(module);
  const profileDepth = getCabinetTrimProfileDepth(module);
  const stripHeight = getCabinetTrimRevealStripHeight(module);
  const stripDepth = getCabinetTrimRevealStripDepth(module);
  const insetFromTop = getCabinetTrimRevealStripInsetFromTop(module);
  const localY = getCabinetTrimSetoutHeight(module) + Math.max(0, profileWidth - insetFromTop - stripHeight);
  const placement = getCabinetTrimPlacement(module);

  return Array.from({ length: memberCount }, (_, index) => {
    const localOffset = index * memberLength;

    if (orientation === "x") {
      return {
        index,
        localX: localOffset,
        localY,
        localZ: profileDepth,
        width: memberLength,
        height: stripHeight,
        depth: stripDepth,
        orientation,
        placement,
      };
    }

    return {
      index,
      localX: profileDepth,
      localY,
      localZ: localOffset,
      width: stripDepth,
      height: stripHeight,
      depth: memberLength,
      orientation,
      placement,
    };
  });
}

export interface CabinetTrimReturnLayout {
  side: "left" | "right";
  localX: number;
  localY: number;
  localZ: number;
  width: number;
  height: number;
  depth: number;
  endTreatment: CabinetTrimEndTreatment;
  returnDepth: number;
  miterAngle: number;
}

export function getCabinetTrimReturnLayouts(module: CabinetModuleDefinition): CabinetTrimReturnLayout[] {
  if (!isCabinetTrimRun(module)) return [];

  const profileWidth = getCabinetTrimProfileWidth(module);
  const profileDepth = getCabinetTrimProfileDepth(module);
  const orientation = getCabinetTrimOrientation(module);
  const setoutHeight = getCabinetTrimSetoutHeight(module);
  const returnDepth = getCabinetTrimReturnDepth(module);
  const miterAngle = getCabinetTrimMiterAngle(module);
  const treatments: Array<["left" | "right", CabinetTrimEndTreatment]> = [
    ["left", getCabinetTrimLeftEndTreatment(module)],
    ["right", getCabinetTrimRightEndTreatment(module)],
  ];

  return treatments.flatMap(([side, endTreatment]) => {
    if (endTreatment !== "mitered_return" || returnDepth <= 0) return [];

    if (orientation === "x") {
      return [{
        side,
        localX: side === "left" ? 0 : Math.max(0, module.width - profileDepth),
        localY: setoutHeight,
        localZ: 0,
        width: profileDepth,
        height: profileWidth,
        depth: returnDepth,
        endTreatment,
        returnDepth,
        miterAngle,
      }];
    }

    return [{
      side,
      localX: 0,
      localY: setoutHeight,
      localZ: side === "left" ? 0 : Math.max(0, module.depth - profileDepth),
      width: returnDepth,
      height: profileWidth,
      depth: profileDepth,
      endTreatment,
      returnDepth,
      miterAngle,
    }];
  });
}

export function getCabinetFireplaceOpeningWidth(module: CabinetModuleDefinition): number {
  return Math.max(0, module.fireplaceOpeningWidth ?? CABINET_DEFAULT_FIREPLACE_OPENING_WIDTH);
}

export function getCabinetFireplaceOpeningHeight(module: CabinetModuleDefinition): number {
  return Math.max(0, module.fireplaceOpeningHeight ?? CABINET_DEFAULT_FIREPLACE_OPENING_HEIGHT);
}

export function getCabinetFireplaceLegWidth(module: CabinetModuleDefinition): number {
  return Math.max(0, module.fireplaceLegWidth ?? CABINET_DEFAULT_FIREPLACE_LEG_WIDTH);
}

export function getCabinetFireplaceHeaderHeight(module: CabinetModuleDefinition): number {
  return Math.max(0, module.fireplaceHeaderHeight ?? CABINET_DEFAULT_FIREPLACE_HEADER_HEIGHT);
}

export function getCabinetFireplaceMantelHeight(module: CabinetModuleDefinition): number {
  return Math.max(0, module.fireplaceMantelHeight ?? CABINET_DEFAULT_FIREPLACE_MANTEL_HEIGHT);
}

export function getCabinetFireplaceMantelDepth(module: CabinetModuleDefinition): number {
  return Math.max(0, module.fireplaceMantelDepth ?? CABINET_DEFAULT_FIREPLACE_MANTEL_DEPTH);
}

export function getCabinetFireplaceOpeningX(module: CabinetModuleDefinition): number {
  return Math.max(0, (module.width - getCabinetFireplaceOpeningWidth(module)) / 2);
}

export function getCabinetFireplaceFrameOuterWidth(module: CabinetModuleDefinition): number {
  return getCabinetFireplaceOpeningWidth(module) + getCabinetFireplaceLegWidth(module) * 2;
}

export function getCabinetFireplaceFrameStartX(module: CabinetModuleDefinition): number {
  return Math.max(0, getCabinetFireplaceOpeningX(module) - getCabinetFireplaceLegWidth(module));
}

export function getCabinetFireplaceTrimStackHeight(module: CabinetModuleDefinition): number {
  return (
    getCabinetFireplaceOpeningHeight(module) +
    getCabinetFireplaceHeaderHeight(module) +
    getCabinetFireplaceMantelHeight(module)
  );
}
