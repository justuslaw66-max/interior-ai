import type { CabinetDefinition, CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_INSTALLATION_CLEAT_HEIGHT = 80;
export const CABINET_DEFAULT_INSTALLATION_CLEAT_THICKNESS = 18;
export const CABINET_DEFAULT_INSTALLATION_CLEAT_INSET_FROM_TOP = 70;

export interface CabinetInstallationCleatLayout {
  localX: number;
  localY: number;
  localZ: number;
  width: number;
  height: number;
  depth: number;
  insetFromTop: number;
}

export function hasCabinetInstallationCleat(module: CabinetModuleDefinition): boolean {
  if (module.installationCleatEnabled === false) return false;
  return (
    Boolean(module.installationCleatEnabled) ||
    typeof module.installationCleatHeight === "number" ||
    typeof module.installationCleatThickness === "number" ||
    typeof module.installationCleatInsetFromTop === "number"
  );
}

export function getCabinetInstallationCleatHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetInstallationCleat(module)) return 0;
  return Math.max(0, module.installationCleatHeight ?? CABINET_DEFAULT_INSTALLATION_CLEAT_HEIGHT);
}

export function getCabinetInstallationCleatThickness(module: CabinetModuleDefinition): number {
  if (!hasCabinetInstallationCleat(module)) return 0;
  return Math.max(0, module.installationCleatThickness ?? CABINET_DEFAULT_INSTALLATION_CLEAT_THICKNESS);
}

export function getCabinetInstallationCleatInsetFromTop(module: CabinetModuleDefinition): number {
  if (!hasCabinetInstallationCleat(module)) return 0;
  return Math.max(0, module.installationCleatInsetFromTop ?? CABINET_DEFAULT_INSTALLATION_CLEAT_INSET_FROM_TOP);
}

export function getCabinetInstallationCleatLayout(
  definition: CabinetDefinition,
  module: CabinetModuleDefinition
): CabinetInstallationCleatLayout | undefined {
  if (!hasCabinetInstallationCleat(module)) return undefined;

  const height = getCabinetInstallationCleatHeight(module);
  const depth = getCabinetInstallationCleatThickness(module);
  const insetFromTop = getCabinetInstallationCleatInsetFromTop(module);
  const width = Math.max(0, module.width - definition.boardThickness * 2);
  const localY = module.height - definition.boardThickness - insetFromTop - height;
  const localZ = module.depth - definition.backPanelThickness - depth;

  if (width <= 0 || height <= 0 || depth <= 0) return undefined;

  return {
    localX: definition.boardThickness,
    localY,
    localZ,
    width,
    height,
    depth,
    insetFromTop,
  };
}
