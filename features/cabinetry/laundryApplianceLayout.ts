import type { CabinetLaundryApplianceKind, CabinetModuleDefinition } from "./types";

export const CABINET_DEFAULT_LAUNDRY_APPLIANCE_KIND: CabinetLaundryApplianceKind = "washer_dryer";
export const CABINET_DEFAULT_LAUNDRY_APPLIANCE_COUNT = 2;
export const CABINET_DEFAULT_LAUNDRY_APPLIANCE_WIDTH = 570;
export const CABINET_DEFAULT_LAUNDRY_APPLIANCE_HEIGHT = 850;
export const CABINET_DEFAULT_LAUNDRY_APPLIANCE_DEPTH = 560;
export const CABINET_DEFAULT_LAUNDRY_APPLIANCE_SIDE_CLEARANCE = 20;
export const CABINET_DEFAULT_LAUNDRY_APPLIANCE_TOP_CLEARANCE = 40;
export const CABINET_DEFAULT_LAUNDRY_APPLIANCE_BACK_CLEARANCE = 40;
export const CABINET_DEFAULT_LAUNDRY_UTILITY_CHASE_HEIGHT = 180;
export const CABINET_DEFAULT_LAUNDRY_UTILITY_CHASE_DEPTH = 80;

export function hasCabinetLaundryApplianceBay(module: CabinetModuleDefinition): boolean {
  if (module.laundryApplianceBayEnabled === false) return false;
  return (
    Boolean(module.laundryApplianceBayEnabled) ||
    typeof module.laundryApplianceKind === "string" ||
    typeof module.laundryApplianceCount === "number" ||
    typeof module.laundryApplianceWidth === "number" ||
    typeof module.laundryApplianceHeight === "number" ||
    typeof module.laundryApplianceDepth === "number" ||
    typeof module.laundryApplianceSideClearance === "number" ||
    typeof module.laundryApplianceTopClearance === "number" ||
    typeof module.laundryApplianceBackClearance === "number" ||
    typeof module.laundryUtilityChaseHeight === "number" ||
    typeof module.laundryUtilityChaseDepth === "number"
  );
}

export function getCabinetLaundryApplianceKind(module: CabinetModuleDefinition): NonNullable<CabinetModuleDefinition["laundryApplianceKind"]> {
  return module.laundryApplianceKind ?? CABINET_DEFAULT_LAUNDRY_APPLIANCE_KIND;
}

export function getCabinetLaundryApplianceCount(module: CabinetModuleDefinition): number {
  if (!hasCabinetLaundryApplianceBay(module)) return 0;
  return Math.max(0, module.laundryApplianceCount ?? CABINET_DEFAULT_LAUNDRY_APPLIANCE_COUNT);
}

export function getCabinetLaundryApplianceWidth(module: CabinetModuleDefinition): number {
  if (!hasCabinetLaundryApplianceBay(module)) return 0;
  return Math.max(0, module.laundryApplianceWidth ?? CABINET_DEFAULT_LAUNDRY_APPLIANCE_WIDTH);
}

export function getCabinetLaundryApplianceHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetLaundryApplianceBay(module)) return 0;
  return Math.max(0, module.laundryApplianceHeight ?? CABINET_DEFAULT_LAUNDRY_APPLIANCE_HEIGHT);
}

export function getCabinetLaundryApplianceDepth(module: CabinetModuleDefinition): number {
  if (!hasCabinetLaundryApplianceBay(module)) return 0;
  return Math.max(0, module.laundryApplianceDepth ?? CABINET_DEFAULT_LAUNDRY_APPLIANCE_DEPTH);
}

export function getCabinetLaundryApplianceSideClearance(module: CabinetModuleDefinition): number {
  if (!hasCabinetLaundryApplianceBay(module)) return 0;
  return Math.max(0, module.laundryApplianceSideClearance ?? CABINET_DEFAULT_LAUNDRY_APPLIANCE_SIDE_CLEARANCE);
}

export function getCabinetLaundryApplianceTopClearance(module: CabinetModuleDefinition): number {
  if (!hasCabinetLaundryApplianceBay(module)) return 0;
  return Math.max(0, module.laundryApplianceTopClearance ?? CABINET_DEFAULT_LAUNDRY_APPLIANCE_TOP_CLEARANCE);
}

export function getCabinetLaundryApplianceBackClearance(module: CabinetModuleDefinition): number {
  if (!hasCabinetLaundryApplianceBay(module)) return 0;
  return Math.max(0, module.laundryApplianceBackClearance ?? CABINET_DEFAULT_LAUNDRY_APPLIANCE_BACK_CLEARANCE);
}

export function getCabinetLaundryUtilityChaseHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetLaundryApplianceBay(module)) return 0;
  return Math.max(0, module.laundryUtilityChaseHeight ?? CABINET_DEFAULT_LAUNDRY_UTILITY_CHASE_HEIGHT);
}

export function getCabinetLaundryUtilityChaseDepth(module: CabinetModuleDefinition): number {
  if (!hasCabinetLaundryApplianceBay(module)) return 0;
  return Math.max(0, module.laundryUtilityChaseDepth ?? CABINET_DEFAULT_LAUNDRY_UTILITY_CHASE_DEPTH);
}

export function getCabinetLaundryApplianceRequiredWidth(module: CabinetModuleDefinition): number {
  const count = getCabinetLaundryApplianceCount(module);
  const applianceWidth = getCabinetLaundryApplianceWidth(module);
  const sideClearance = getCabinetLaundryApplianceSideClearance(module);
  if (count <= 0) return 0;
  return count * applianceWidth + (count + 1) * sideClearance;
}

export function getCabinetLaundryApplianceRequiredHeight(module: CabinetModuleDefinition): number {
  return getCabinetLaundryApplianceHeight(module) + getCabinetLaundryApplianceTopClearance(module);
}

export function getCabinetLaundryApplianceRequiredDepth(module: CabinetModuleDefinition): number {
  return getCabinetLaundryApplianceDepth(module) + getCabinetLaundryApplianceBackClearance(module);
}

export function getCabinetLaundryApplianceLocalXPositions(module: CabinetModuleDefinition): number[] {
  const count = getCabinetLaundryApplianceCount(module);
  const applianceWidth = getCabinetLaundryApplianceWidth(module);
  const sideClearance = getCabinetLaundryApplianceSideClearance(module);
  if (count <= 0 || applianceWidth <= 0) return [];

  const requiredWidth = getCabinetLaundryApplianceRequiredWidth(module);
  const startX = Math.max(0, (module.width - requiredWidth) / 2) + sideClearance;
  return Array.from({ length: count }, (_, index) => startX + index * (applianceWidth + sideClearance));
}

export function getCabinetLaundryUtilityChaseLocalZ(module: CabinetModuleDefinition): number {
  return Math.max(0, module.depth - getCabinetLaundryUtilityChaseDepth(module));
}
