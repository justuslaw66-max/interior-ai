import type { CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_OFFICE_WORKSURFACE_THICKNESS = 36;
export const CABINET_DEFAULT_OFFICE_WORKSURFACE_DEPTH = 650;
export const CABINET_DEFAULT_OFFICE_WORKSURFACE_OVERHANG_FRONT = 100;
export const CABINET_DEFAULT_CABLE_GROMMET_COUNT = 3;
export const CABINET_DEFAULT_CABLE_GROMMET_DIAMETER = 80;
export const CABINET_DEFAULT_CABLE_GROMMET_OFFSET_FROM_BACK = 110;
export const CABINET_DEFAULT_DESK_POWER_CHASE_HEIGHT = 120;
export const CABINET_DEFAULT_DESK_POWER_CHASE_DEPTH = 60;
export const CABINET_CABLE_GROMMET_MARKER_THICKNESS = 4;

export function hasCabinetOfficeWorkstation(module: CabinetModuleDefinition): boolean {
  if (module.officeWorksurfaceEnabled === false) return false;
  return (
    Boolean(module.officeWorksurfaceEnabled) ||
    typeof module.officeWorksurfaceThickness === "number" ||
    typeof module.officeWorksurfaceDepth === "number" ||
    typeof module.officeWorksurfaceOverhangFront === "number" ||
    typeof module.cableGrommetCount === "number" ||
    typeof module.cableGrommetDiameter === "number" ||
    typeof module.cableGrommetOffsetFromBack === "number" ||
    typeof module.deskPowerChaseHeight === "number" ||
    typeof module.deskPowerChaseDepth === "number"
  );
}

export function getCabinetOfficeWorksurfaceThickness(module: CabinetModuleDefinition): number {
  if (!hasCabinetOfficeWorkstation(module)) return 0;
  return Math.max(0, module.officeWorksurfaceThickness ?? CABINET_DEFAULT_OFFICE_WORKSURFACE_THICKNESS);
}

export function getCabinetOfficeWorksurfaceDepth(module: CabinetModuleDefinition): number {
  if (!hasCabinetOfficeWorkstation(module)) return 0;
  return Math.max(0, module.officeWorksurfaceDepth ?? Math.max(module.depth, CABINET_DEFAULT_OFFICE_WORKSURFACE_DEPTH));
}

export function getCabinetOfficeWorksurfaceOverhangFront(module: CabinetModuleDefinition): number {
  if (!hasCabinetOfficeWorkstation(module)) return 0;
  return Math.max(0, module.officeWorksurfaceOverhangFront ?? CABINET_DEFAULT_OFFICE_WORKSURFACE_OVERHANG_FRONT);
}

export function getCabinetCableGrommetCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetOfficeWorkstation(module)) return 0;
  return Math.max(0, module.cableGrommetCount ?? CABINET_DEFAULT_CABLE_GROMMET_COUNT);
}

export function getCabinetCableGrommetDiameter(module: CabinetModuleDefinition): number {
  if (!hasCabinetOfficeWorkstation(module)) return 0;
  return Math.max(0, module.cableGrommetDiameter ?? CABINET_DEFAULT_CABLE_GROMMET_DIAMETER);
}

export function getCabinetCableGrommetOffsetFromBack(module: CabinetModuleDefinition): number {
  if (!hasCabinetOfficeWorkstation(module)) return 0;
  return Math.max(0, module.cableGrommetOffsetFromBack ?? CABINET_DEFAULT_CABLE_GROMMET_OFFSET_FROM_BACK);
}

export function getCabinetCableGrommetLocalXPositions(module: CabinetModuleDefinition): number[] {
  const count = getCabinetCableGrommetCount(module);
  const diameter = getCabinetCableGrommetDiameter(module);
  if (count <= 0 || diameter <= 0) return [];

  return Array.from({ length: count }, (_, index) => ((index + 1) * module.width) / (count + 1) - diameter / 2);
}

export function getCabinetCableGrommetLocalZ(module: CabinetModuleDefinition): number {
  return (
    -getCabinetOfficeWorksurfaceOverhangFront(module) +
    getCabinetOfficeWorksurfaceDepth(module) -
    getCabinetCableGrommetOffsetFromBack(module) -
    getCabinetCableGrommetDiameter(module) / 2
  );
}

export function getCabinetDeskPowerChaseHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetOfficeWorkstation(module)) return 0;
  return Math.max(0, module.deskPowerChaseHeight ?? CABINET_DEFAULT_DESK_POWER_CHASE_HEIGHT);
}

export function getCabinetDeskPowerChaseDepth(module: CabinetModuleDefinition): number {
  if (!hasCabinetOfficeWorkstation(module)) return 0;
  return Math.max(0, module.deskPowerChaseDepth ?? CABINET_DEFAULT_DESK_POWER_CHASE_DEPTH);
}

export function getCabinetDeskPowerChaseLocalZ(module: CabinetModuleDefinition): number {
  return Math.max(0, module.depth - getCabinetDeskPowerChaseDepth(module));
}
