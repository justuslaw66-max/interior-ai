import type { CabinetModuleDefinition, CabinetStairScribeDirection } from "./types";

export const CABINET_DEFAULT_STAIR_SCRIBE_STEP_COUNT = 3;
export const CABINET_DEFAULT_STAIR_SCRIBE_DEPTH = 18;
export const CABINET_DEFAULT_STAIR_SCRIBE_HEIGHT_DELTA = 450;

export interface CabinetStairScribePanelLayout {
  index: number;
  localX: number;
  width: number;
  height: number;
  topHeight: number;
}

export function hasCabinetStairScribe(module: CabinetModuleDefinition): boolean {
  return (
    typeof module.stairScribeStepCount === "number" ||
    typeof module.stairScribeHighHeight === "number" ||
    typeof module.stairScribeLowHeight === "number" ||
    typeof module.stairScribeDepth === "number" ||
    typeof module.stairScribeDirection === "string"
  );
}

export function getCabinetStairScribeStepCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetStairScribe(module)) return 0;
  return Math.max(0, module.stairScribeStepCount ?? CABINET_DEFAULT_STAIR_SCRIBE_STEP_COUNT);
}

export function getCabinetStairScribeDepth(module: CabinetModuleDefinition): number {
  if (!hasCabinetStairScribe(module)) return 0;
  return Math.max(0, module.stairScribeDepth ?? CABINET_DEFAULT_STAIR_SCRIBE_DEPTH);
}

export function getCabinetStairScribeHighHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetStairScribe(module)) return module.height;
  return Math.max(
    module.height,
    module.stairScribeHighHeight ?? module.height + CABINET_DEFAULT_STAIR_SCRIBE_HEIGHT_DELTA
  );
}

export function getCabinetStairScribeLowHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetStairScribe(module)) return module.height;
  return Math.max(module.height, module.stairScribeLowHeight ?? module.height);
}

export function getCabinetStairScribeDirection(
  module: CabinetModuleDefinition
): CabinetStairScribeDirection {
  return module.stairScribeDirection ?? "rises_left";
}

export function getCabinetStairScribePanelLayouts(
  module: CabinetModuleDefinition
): CabinetStairScribePanelLayout[] {
  const stepCount = getCabinetStairScribeStepCount(module);
  if (stepCount <= 0) return [];

  const highHeight = getCabinetStairScribeHighHeight(module);
  const lowHeight = getCabinetStairScribeLowHeight(module);
  const direction = getCabinetStairScribeDirection(module);
  const stepWidth = module.width / stepCount;

  return Array.from({ length: stepCount }, (_, index) => {
    const t = stepCount === 1 ? 1 : index / (stepCount - 1);
    const risesLeftFraction = 1 - t;
    const risesRightFraction = t;
    const fraction = direction === "rises_right" ? risesRightFraction : risesLeftFraction;
    const topHeight = lowHeight + (highHeight - lowHeight) * fraction;

    return {
      index,
      localX: index * stepWidth,
      width: stepWidth,
      height: Math.max(0, topHeight - module.height),
      topHeight,
    };
  }).filter((panel) => panel.height > 0);
}
