import type { CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_SLAT_WIDTH = 32;
export const CABINET_DEFAULT_SLAT_DEPTH = 38;

export function getCabinetSlatCount(module: CabinetModuleDefinition): number {
  return Math.max(0, module.slatCount ?? 0);
}

export function getCabinetSlatWidth(module: CabinetModuleDefinition): number {
  return Math.max(0, module.slatWidth ?? CABINET_DEFAULT_SLAT_WIDTH);
}

export function getCabinetSlatDepth(module: CabinetModuleDefinition): number {
  return Math.max(0, module.slatDepth ?? CABINET_DEFAULT_SLAT_DEPTH);
}

export function getCabinetSlatSpacing(module: CabinetModuleDefinition): number | undefined {
  return typeof module.slatSpacing === "number" ? Math.max(0, module.slatSpacing) : undefined;
}

export function getCabinetSlatLocalXPositions(module: CabinetModuleDefinition): number[] {
  const slatCount = getCabinetSlatCount(module);
  if (slatCount <= 0) return [];

  const slatWidth = getCabinetSlatWidth(module);
  const explicitSpacing = getCabinetSlatSpacing(module);
  const spanWidth =
    typeof explicitSpacing === "number"
      ? slatCount * slatWidth + Math.max(0, slatCount - 1) * explicitSpacing
      : module.width;
  const startX = Math.max(0, (module.width - spanWidth) / 2);
  const spacing =
    typeof explicitSpacing === "number"
      ? explicitSpacing
      : slatCount > 1
        ? Math.max(0, (module.width - slatCount * slatWidth) / (slatCount - 1))
        : 0;

  return Array.from({ length: slatCount }, (_, index) => startX + index * (slatWidth + spacing));
}
