import {
  getCabinetAutomationState,
  setCabinetParameterState,
} from "./automation";
import type {
  CabinetDefinition,
  CabinetDrawerHeightMode,
  CabinetFrontLayoutMode,
  CabinetHandlePlacementMode,
  CabinetModuleDefinition,
  HandleType,
} from "./types";

export const CABINET_RECOMMENDED_MAX_DOOR_LEAF_WIDTH_MM = 600;
export const CABINET_MIN_DRAWER_FRONT_HEIGHT_MM = 90;
export const CABINET_HANDLE_DEPTH_MM = 24;
export const CABINET_HANDLE_HEIGHT_MM = 12;
export const CABINET_HANDLE_WIDTH_MM = 180;

export interface CabinetHandleLocalPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
}

function normalizedPositive(values: readonly number[]): number[] | null {
  if (!values.length || values.some((value) => !Number.isFinite(value) || value <= 0)) {
    return null;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  return values.map((value) => value / total);
}

function replaceModule(
  definition: CabinetDefinition,
  moduleId: string,
  updater: (module: CabinetModuleDefinition) => CabinetModuleDefinition
): CabinetDefinition {
  return {
    ...definition,
    modules: definition.modules.map((module) =>
      module.id === moduleId ? updater(module) : module
    ),
  };
}

export function getCabinetDoorLayoutMode(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): CabinetFrontLayoutMode {
  return (
    module.doorLayoutMode ??
    getCabinetAutomationState(definition).frontLayoutMode ??
    "recommended"
  );
}

export function getCabinetRecommendedDoorCount(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  if (module.frontType === "open" || module.frontType === "drawer_stack") return 0;
  if (module.frontType === "single_door") return 1;
  if (module.frontType === "slab_panel") return Math.max(1, Math.floor(module.doorCount || 1));

  const openingWidth = Math.max(
    1,
    module.width - definition.boardThickness * 2 - definition.revealGap * 2
  );
  const widthDrivenCount = Math.max(
    1,
    Math.min(12, Math.ceil(openingWidth / CABINET_RECOMMENDED_MAX_DOOR_LEAF_WIDTH_MM))
  );
  const semanticMinimum =
    module.frontType === "double_door" ||
    (module.frontType === "door_and_drawer" && module.hingeSide === "double")
      ? 2
      : 1;
  return Math.max(semanticMinimum, widthDrivenCount);
}

export function getCabinetEffectiveDoorCount(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  if (getCabinetDoorLayoutMode(definition, module) === "recommended") {
    return getCabinetRecommendedDoorCount(definition, module);
  }
  if (module.frontType === "open" || module.frontType === "drawer_stack") return 0;
  if (module.frontType === "double_door") return Math.max(2, Math.floor(module.doorCount));
  return Math.max(1, Math.floor(module.doorCount || 1));
}

export function setCabinetDoorLayoutMode(
  definition: CabinetDefinition,
  moduleId: string,
  mode: CabinetFrontLayoutMode
): CabinetDefinition {
  const cabinetModule = definition.modules.find((candidate) => candidate.id === moduleId);
  if (!cabinetModule) return definition;
  const startingCount =
    mode === "manual"
      ? getCabinetEffectiveDoorCount(definition, cabinetModule)
      : getCabinetRecommendedDoorCount(definition, cabinetModule);
  let next = replaceModule(definition, moduleId, (candidate) => ({
    ...candidate,
    doorLayoutMode: mode,
    doorCount: startingCount,
  }));
  next = setCabinetParameterState(next, `modules.${moduleId}.doorLayoutMode`, {
    source: "user_overridden",
  });
  return setCabinetParameterState(next, `modules.${moduleId}.doorCount`, {
    source: mode === "recommended" ? "automatic" : "user_overridden",
  });
}

export function getCabinetDrawerHeightMode(
  module: CabinetModuleDefinition
): CabinetDrawerHeightMode {
  // Existing curated templates were authored with equal fronts. Treat that
  // generated layout as the automatic backward-compatible default.
  return module.drawerHeightMode ?? "equal";
}

export function getCabinetDrawerBandHeight(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number {
  const openingHeight = Math.max(
    1,
    module.height -
      definition.toeKickHeight -
      definition.boardThickness * 2 -
      definition.revealGap * 2
  );
  return module.frontType === "door_and_drawer"
    ? Math.min(220, openingHeight * 0.32)
    : openingHeight;
}

export function getCabinetEqualDrawerHeightProportions(
  drawerCount: number
): number[] {
  const count = Math.max(0, Math.floor(drawerCount));
  if (!count) return [];
  return Array.from({ length: count }, () => 1 / count);
}

export function getCabinetRecommendedDrawerHeightProportions(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number[] {
  const count = Math.max(0, Math.floor(module.drawerCount));
  if (!count) return [];
  if (count === 1) return [1];

  const usableFrontHeight = Math.max(
    1,
    getCabinetDrawerBandHeight(definition, module) - definition.revealGap * (count - 1)
  );
  const guaranteedHeight = Math.min(
    CABINET_MIN_DRAWER_FRONT_HEIGHT_MM,
    usableFrontHeight / count
  );
  const distributableHeight = Math.max(0, usableFrontHeight - guaranteedHeight * count);
  // Drawer arrays are bottom-to-top. Decreasing weights create deeper lower drawers
  // while retaining a useful top drawer for utensils and small items.
  const weights = Array.from({ length: count }, (_, index) =>
    0.8 + ((count - index - 1) / Math.max(1, count - 1)) * 0.8
  );
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  return normalizedPositive(
    weights.map(
      (weight) => guaranteedHeight + distributableHeight * (weight / weightTotal)
    )
  ) ?? getCabinetEqualDrawerHeightProportions(count);
}

export function getCabinetDrawerHeightProportions(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): number[] {
  const count = Math.max(0, Math.floor(module.drawerCount));
  const mode = getCabinetDrawerHeightMode(module);
  if (mode === "equal") return getCabinetEqualDrawerHeightProportions(count);
  if (mode === "recommended") {
    return getCabinetRecommendedDrawerHeightProportions(definition, module);
  }
  if (module.drawerHeightProportions?.length === count) {
    const normalized = normalizedPositive(module.drawerHeightProportions);
    if (normalized) return normalized;
  }
  return getCabinetRecommendedDrawerHeightProportions(definition, module);
}

export function resizeCabinetDrawerHeightProportions(
  proportions: readonly number[],
  nextCount: number
): number[] {
  const count = Math.max(0, Math.floor(nextCount));
  if (!count) return [];
  const normalized = normalizedPositive(proportions) ?? [];
  const next = normalized.slice(0, count);
  const fillValue = normalized.length
    ? normalized.reduce((sum, value) => sum + value, 0) / normalized.length
    : 1;
  while (next.length < count) next.push(fillValue);
  return normalizedPositive(next) ?? getCabinetEqualDrawerHeightProportions(count);
}

export function setCabinetDrawerHeightMode(
  definition: CabinetDefinition,
  moduleId: string,
  mode: CabinetDrawerHeightMode
): CabinetDefinition {
  const cabinetModule = definition.modules.find((candidate) => candidate.id === moduleId);
  if (!cabinetModule) return definition;
  const currentGenerated = getCabinetDrawerHeightProportions(definition, cabinetModule);
  let next = replaceModule(definition, moduleId, (candidate) => ({
    ...candidate,
    drawerHeightMode: mode,
    drawerHeightProportions: mode === "custom" ? currentGenerated : undefined,
  }));
  next = setCabinetParameterState(next, `modules.${moduleId}.drawerHeightMode`, {
    source: "user_overridden",
  });
  return setCabinetParameterState(next, `modules.${moduleId}.drawerHeightProportions`, {
    source: mode === "custom" ? "user_overridden" : "automatic",
  });
}

export function getCabinetHandlePlacementMode(
  module: CabinetModuleDefinition
): CabinetHandlePlacementMode {
  return module.handlePlacementMode ?? "automatic";
}

export function setCabinetHandlePlacementMode(
  definition: CabinetDefinition,
  moduleId: string,
  mode: CabinetHandlePlacementMode
): CabinetDefinition {
  if (!definition.modules.some((module) => module.id === moduleId)) return definition;
  let next = replaceModule(definition, moduleId, (module) => ({
    ...module,
    handlePlacementMode: mode,
    handleOffsetX: mode === "custom" ? module.handleOffsetX ?? 0 : undefined,
    handleOffsetY: mode === "custom" ? module.handleOffsetY ?? 0 : undefined,
  }));
  next = setCabinetParameterState(next, `modules.${moduleId}.handlePlacementMode`, {
    source: "user_overridden",
  });
  next = setCabinetParameterState(next, `modules.${moduleId}.handleOffsetX`, {
    source: mode === "custom" ? "user_overridden" : "automatic",
  });
  return setCabinetParameterState(next, `modules.${moduleId}.handleOffsetY`, {
    source: mode === "custom" ? "user_overridden" : "automatic",
  });
}

export function isCabinetFrontHandleType(type: HandleType): boolean {
  return type === "bar_pull" || type === "knob" || type === "edge_pull";
}

export function getCabinetHandleLocalPlacement(
  module: CabinetModuleDefinition,
  hardwareType: HandleType,
  frontWidth: number,
  frontHeight: number
): CabinetHandleLocalPlacement | null {
  if (!isCabinetFrontHandleType(hardwareType)) return null;
  const width =
    hardwareType === "knob"
      ? 24
      : Math.min(
          CABINET_HANDLE_WIDTH_MM,
          frontWidth * (hardwareType === "edge_pull" ? 0.7 : 0.65)
        );
  const height = hardwareType === "knob" ? 24 : hardwareType === "edge_pull" ? 10 : CABINET_HANDLE_HEIGHT_MM;
  const depth = hardwareType === "edge_pull" ? 16 : CABINET_HANDLE_DEPTH_MM;
  const automaticX = (frontWidth - width) / 2;
  const automaticY = hardwareType === "edge_pull" ? frontHeight - height : (frontHeight - height) / 2;
  const custom = getCabinetHandlePlacementMode(module) === "custom";
  return {
    x: automaticX + (custom ? module.handleOffsetX ?? 0 : 0),
    y: automaticY + (custom ? module.handleOffsetY ?? 0 : 0),
    width,
    height,
    depth,
  };
}
