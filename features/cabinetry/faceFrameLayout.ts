import type { CabinetDefinition, CabinetModuleDefinition } from "./types";
import { isCabinetCeilingComponent } from "./ceilingBeamLayout";
import { isCabinetConvertibleComponent } from "./convertibleLayout";
import { isCabinetTrimComponent } from "./trimLayout";

export const CABINET_DEFAULT_FACE_FRAME_STILE_WIDTH = 38;
export const CABINET_DEFAULT_FACE_FRAME_RAIL_HEIGHT = 38;
export const CABINET_DEFAULT_FACE_FRAME_DEPTH = 18;

export interface CabinetFaceFrameLayout {
  index: string;
  type: "stile" | "rail";
  role: "left_stile" | "right_stile" | "bottom_rail" | "top_rail";
  localX: number;
  localY: number;
  localZ: number;
  width: number;
  height: number;
  depth: number;
}

export function hasCabinetFaceFrame(definition: CabinetDefinition): boolean {
  if (definition.faceFrameEnabled === false) return false;
  return (
    Boolean(definition.faceFrameEnabled) ||
    typeof definition.faceFrameStileWidth === "number" ||
    typeof definition.faceFrameRailHeight === "number" ||
    typeof definition.faceFrameDepth === "number" ||
    typeof definition.faceFrameMaterialId === "string"
  );
}

export function isCabinetFaceFrameEligibleModule(module: CabinetModuleDefinition): boolean {
  return (
    !isCabinetCeilingComponent(module) &&
    !isCabinetTrimComponent(module) &&
    !isCabinetConvertibleComponent(module)
  );
}

export function getCabinetFaceFrameStileWidth(definition: CabinetDefinition): number {
  if (!hasCabinetFaceFrame(definition)) return 0;
  return Math.max(0, definition.faceFrameStileWidth ?? CABINET_DEFAULT_FACE_FRAME_STILE_WIDTH);
}

export function getCabinetFaceFrameRailHeight(definition: CabinetDefinition): number {
  if (!hasCabinetFaceFrame(definition)) return 0;
  return Math.max(0, definition.faceFrameRailHeight ?? CABINET_DEFAULT_FACE_FRAME_RAIL_HEIGHT);
}

export function getCabinetFaceFrameDepth(definition: CabinetDefinition): number {
  if (!hasCabinetFaceFrame(definition)) return 0;
  return Math.max(0, definition.faceFrameDepth ?? CABINET_DEFAULT_FACE_FRAME_DEPTH);
}

export function getCabinetFaceFrameLayouts(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): CabinetFaceFrameLayout[] {
  if (!hasCabinetFaceFrame(definition) || !isCabinetFaceFrameEligibleModule(module)) return [];

  const stileWidth = getCabinetFaceFrameStileWidth(definition);
  const railHeight = getCabinetFaceFrameRailHeight(definition);
  const depth = getCabinetFaceFrameDepth(definition);
  const frameBottomY = Math.min(definition.toeKickHeight, Math.max(0, module.height));
  const frameHeight = Math.max(0, module.height - frameBottomY);
  if (stileWidth <= 0 || railHeight <= 0 || depth <= 0 || frameHeight <= 0) return [];

  return [
    {
      index: "left-stile",
      type: "stile",
      role: "left_stile",
      localX: 0,
      localY: frameBottomY,
      localZ: -depth,
      width: stileWidth,
      height: frameHeight,
      depth,
    },
    {
      index: "right-stile",
      type: "stile",
      role: "right_stile",
      localX: Math.max(0, module.width - stileWidth),
      localY: frameBottomY,
      localZ: -depth,
      width: stileWidth,
      height: frameHeight,
      depth,
    },
    {
      index: "bottom-rail",
      type: "rail",
      role: "bottom_rail",
      localX: 0,
      localY: frameBottomY,
      localZ: -depth,
      width: module.width,
      height: railHeight,
      depth,
    },
    {
      index: "top-rail",
      type: "rail",
      role: "top_rail",
      localX: 0,
      localY: Math.max(frameBottomY, module.height - railHeight),
      localZ: -depth,
      width: module.width,
      height: railHeight,
      depth,
    },
  ];
}
