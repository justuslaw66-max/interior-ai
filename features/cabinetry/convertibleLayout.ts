import type {
  CabinetModuleDefinition,
  CabinetWallBedDisplayState,
  CabinetWallBedMattressSize,
  CabinetWallBedOrientation,
  CabinetWallBedSideStorage,
} from "./types";

export const CABINET_DEFAULT_CONVERTIBLE_PANEL_THICKNESS = 36;
export const CABINET_DEFAULT_WALL_BED_OPEN_DEPTH = 2000;
export const CABINET_DEFAULT_DESK_OPEN_DEPTH = 620;
export const CABINET_DEFAULT_WALL_BED_HINGE_HEIGHT = 80;
export const CABINET_DEFAULT_DESK_HINGE_HEIGHT = 740;
export const CABINET_DEFAULT_SUPPORT_LEG_WIDTH = 45;
export const CABINET_DEFAULT_SUPPORT_LEG_DEPTH = 45;
export const CABINET_DEFAULT_HINGE_RAIL_HEIGHT = 80;
export const CABINET_DEFAULT_HINGE_RAIL_DEPTH = 48;

export const CABINET_WALL_BED_MATTRESS_DIMENSIONS: Readonly<
  Record<CabinetWallBedMattressSize, { widthMm: number; lengthMm: number }>
> = {
  single: { widthMm: 900, lengthMm: 1900 },
  double: { widthMm: 1350, lengthMm: 1900 },
  queen: { widthMm: 1500, lengthMm: 2000 },
  king: { widthMm: 1800, lengthMm: 2000 },
};

export function isCabinetWallBedPanel(module: CabinetModuleDefinition): boolean {
  return module.millworkComponentType === "wall_bed_panel";
}

export function isCabinetFoldDownWorksurface(module: CabinetModuleDefinition): boolean {
  return module.millworkComponentType === "fold_down_worksurface";
}

export function isCabinetConvertibleComponent(module: CabinetModuleDefinition): boolean {
  return isCabinetWallBedPanel(module) || isCabinetFoldDownWorksurface(module);
}

export function getCabinetWallBedMattressSize(
  module: CabinetModuleDefinition
): CabinetWallBedMattressSize {
  return module.wallBedMattressSize ?? "double";
}

export function getCabinetWallBedOrientation(
  module: CabinetModuleDefinition
): CabinetWallBedOrientation {
  return module.wallBedOrientation ?? "vertical";
}

export function getCabinetWallBedDisplayState(
  module: CabinetModuleDefinition
): CabinetWallBedDisplayState {
  return module.wallBedDisplayState ?? "closed";
}

export function getCabinetWallBedSideStorage(
  module: CabinetModuleDefinition
): CabinetWallBedSideStorage {
  return module.wallBedSideStorage ?? "both";
}

export function getCabinetWallBedRecommendedGeometry(
  mattressSize: CabinetWallBedMattressSize,
  orientation: CabinetWallBedOrientation
): { moduleWidthMm: number; panelHeightMm: number; openDepthMm: number } {
  const mattress = CABINET_WALL_BED_MATTRESS_DIMENSIONS[mattressSize];
  return orientation === "vertical"
    ? {
        moduleWidthMm: mattress.widthMm + 100,
        panelHeightMm: mattress.lengthMm + 200,
        openDepthMm: mattress.lengthMm + 100,
      }
    : {
        moduleWidthMm: mattress.lengthMm + 100,
        panelHeightMm: mattress.widthMm + 200,
        openDepthMm: mattress.widthMm + 100,
      };
}

export function getCabinetConvertiblePanelThickness(module: CabinetModuleDefinition): number {
  return Math.max(0, module.convertiblePanelThickness ?? CABINET_DEFAULT_CONVERTIBLE_PANEL_THICKNESS);
}

export function getCabinetConvertiblePanelHeight(module: CabinetModuleDefinition): number {
  if (typeof module.convertiblePanelHeight === "number") return Math.max(0, module.convertiblePanelHeight);
  if (isCabinetWallBedPanel(module)) return module.height;
  return Math.max(0, Math.min(760, module.height * 0.52));
}

export function getCabinetConvertibleOpenDepth(module: CabinetModuleDefinition): number {
  return Math.max(
    0,
    module.convertibleOpenDepth ??
      (isCabinetWallBedPanel(module) ? CABINET_DEFAULT_WALL_BED_OPEN_DEPTH : CABINET_DEFAULT_DESK_OPEN_DEPTH)
  );
}

export function getCabinetConvertibleHingeHeight(module: CabinetModuleDefinition): number {
  return Math.max(
    0,
    module.convertibleHingeHeight ??
      (isCabinetWallBedPanel(module) ? CABINET_DEFAULT_WALL_BED_HINGE_HEIGHT : CABINET_DEFAULT_DESK_HINGE_HEIGHT)
  );
}

export function getCabinetConvertibleSupportLegCount(module: CabinetModuleDefinition): number {
  if (typeof module.convertibleSupportLegCount === "number") {
    return Math.max(0, module.convertibleSupportLegCount);
  }
  return isCabinetConvertibleComponent(module) ? 2 : 0;
}

export function getCabinetConvertibleSupportLegWidth(module: CabinetModuleDefinition): number {
  return Math.max(0, module.convertibleSupportLegWidth ?? CABINET_DEFAULT_SUPPORT_LEG_WIDTH);
}

export function getCabinetConvertibleSupportLegDepth(module: CabinetModuleDefinition): number {
  return Math.max(0, module.convertibleSupportLegDepth ?? CABINET_DEFAULT_SUPPORT_LEG_DEPTH);
}
