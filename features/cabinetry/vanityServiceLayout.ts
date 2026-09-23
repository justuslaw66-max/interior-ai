import type { CabinetDefinition, CabinetModuleDefinition } from "./types";

export const CABINET_SERVICE_ZONE_MATERIAL_ID = "service_zone_marker";
export const CABINET_DEFAULT_SINK_CUTOUT_WIDTH = 480;
export const CABINET_DEFAULT_SINK_CUTOUT_DEPTH = 340;
export const CABINET_DEFAULT_SINK_CUTOUT_OFFSET_X = 0;
export const CABINET_DEFAULT_SINK_CUTOUT_OFFSET_Z = 250;
export const CABINET_SINK_CUTOUT_MARKER_THICKNESS = 4;
export const CABINET_DEFAULT_PLUMBING_CHASE_WIDTH = 360;
export const CABINET_DEFAULT_PLUMBING_CHASE_HEIGHT = 420;
export const CABINET_DEFAULT_PLUMBING_CHASE_DEPTH = 90;

export function hasCabinetSinkCutout(module: CabinetModuleDefinition): boolean {
  if (module.sinkCutoutEnabled === false) return false;
  return (
    Boolean(module.sinkCutoutEnabled) ||
    typeof module.sinkCutoutWidth === "number" ||
    typeof module.sinkCutoutDepth === "number" ||
    typeof module.sinkCutoutOffsetX === "number" ||
    typeof module.sinkCutoutOffsetZ === "number"
  );
}

export function hasCabinetPlumbingChase(module: CabinetModuleDefinition): boolean {
  return (
    hasCabinetSinkCutout(module) ||
    typeof module.plumbingChaseWidth === "number" ||
    typeof module.plumbingChaseHeight === "number" ||
    typeof module.plumbingChaseDepth === "number"
  );
}

export function getCabinetSinkCutoutWidth(module: CabinetModuleDefinition): number {
  if (!hasCabinetSinkCutout(module)) return 0;
  return Math.max(0, module.sinkCutoutWidth ?? CABINET_DEFAULT_SINK_CUTOUT_WIDTH);
}

export function getCabinetSinkCutoutDepth(module: CabinetModuleDefinition): number {
  if (!hasCabinetSinkCutout(module)) return 0;
  return Math.max(0, module.sinkCutoutDepth ?? CABINET_DEFAULT_SINK_CUTOUT_DEPTH);
}

export function getCabinetSinkCutoutOffsetX(module: CabinetModuleDefinition): number {
  if (!hasCabinetSinkCutout(module)) return 0;
  return module.sinkCutoutOffsetX ?? CABINET_DEFAULT_SINK_CUTOUT_OFFSET_X;
}

export function getCabinetSinkCutoutOffsetZ(module: CabinetModuleDefinition): number {
  if (!hasCabinetSinkCutout(module)) return 0;
  return Math.max(0, module.sinkCutoutOffsetZ ?? Math.min(module.depth, CABINET_DEFAULT_SINK_CUTOUT_OFFSET_Z));
}

export function getCabinetSinkCutoutLocalX(module: CabinetModuleDefinition): number {
  return module.width / 2 + getCabinetSinkCutoutOffsetX(module) - getCabinetSinkCutoutWidth(module) / 2;
}

export function getCabinetSinkCutoutLocalZ(module: CabinetModuleDefinition): number {
  return getCabinetSinkCutoutOffsetZ(module) - getCabinetSinkCutoutDepth(module) / 2;
}

export function getCabinetPlumbingChaseWidth(module: CabinetModuleDefinition): number {
  if (!hasCabinetPlumbingChase(module)) return 0;
  return Math.max(0, module.plumbingChaseWidth ?? CABINET_DEFAULT_PLUMBING_CHASE_WIDTH);
}

export function getCabinetPlumbingChaseHeight(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  if (!hasCabinetPlumbingChase(module)) return 0;
  return Math.max(
    0,
    Math.min(
      module.height - definition.toeKickHeight,
      module.plumbingChaseHeight ?? CABINET_DEFAULT_PLUMBING_CHASE_HEIGHT
    )
  );
}

export function getCabinetPlumbingChaseDepth(module: CabinetModuleDefinition): number {
  if (!hasCabinetPlumbingChase(module)) return 0;
  return Math.max(0, module.plumbingChaseDepth ?? CABINET_DEFAULT_PLUMBING_CHASE_DEPTH);
}

export function getCabinetPlumbingChaseLocalX(module: CabinetModuleDefinition): number {
  const centerX = hasCabinetSinkCutout(module)
    ? module.width / 2 + getCabinetSinkCutoutOffsetX(module)
    : module.width / 2;
  return centerX - getCabinetPlumbingChaseWidth(module) / 2;
}

export function getCabinetPlumbingChaseLocalZ(module: CabinetModuleDefinition): number {
  return Math.max(0, module.depth - getCabinetPlumbingChaseDepth(module));
}
