import type { CabinetModuleDefinition } from "./types";

export const CABINET_SEAT_CUSHION_MATERIAL_ID = "upholstery_neutral";
export const CABINET_DEFAULT_SEAT_DECK_THICKNESS = 24;
export const CABINET_DEFAULT_SEAT_CUSHION_THICKNESS = 75;
export const CABINET_DEFAULT_SEAT_CUSHION_OVERHANG_FRONT = 20;
export const CABINET_DEFAULT_SEAT_BACK_HEIGHT = 420;
export const CABINET_DEFAULT_SEAT_BACK_THICKNESS = 24;

export function hasCabinetSeatingDetails(module: CabinetModuleDefinition): boolean {
  return (
    typeof module.seatDeckThickness === "number" ||
    typeof module.seatCushionThickness === "number" ||
    typeof module.seatCushionDepth === "number" ||
    typeof module.seatCushionOverhangFront === "number" ||
    typeof module.seatBackHeight === "number" ||
    typeof module.seatBackThickness === "number"
  );
}

export function hasCabinetSeatBack(module: CabinetModuleDefinition): boolean {
  return typeof module.seatBackHeight === "number" || typeof module.seatBackThickness === "number";
}

export function getCabinetSeatDeckThickness(module: CabinetModuleDefinition): number {
  if (!hasCabinetSeatingDetails(module)) return 0;
  return Math.max(0, module.seatDeckThickness ?? CABINET_DEFAULT_SEAT_DECK_THICKNESS);
}

export function getCabinetSeatCushionThickness(module: CabinetModuleDefinition): number {
  if (!hasCabinetSeatingDetails(module)) return 0;
  return Math.max(0, module.seatCushionThickness ?? CABINET_DEFAULT_SEAT_CUSHION_THICKNESS);
}

export function getCabinetSeatCushionOverhangFront(module: CabinetModuleDefinition): number {
  if (!hasCabinetSeatingDetails(module)) return 0;
  return Math.max(0, module.seatCushionOverhangFront ?? CABINET_DEFAULT_SEAT_CUSHION_OVERHANG_FRONT);
}

export function getCabinetSeatCushionDepth(module: CabinetModuleDefinition): number {
  if (!hasCabinetSeatingDetails(module)) return 0;
  return Math.max(
    0,
    module.seatCushionDepth ?? module.depth + getCabinetSeatCushionOverhangFront(module)
  );
}

export function getCabinetSeatBackHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetSeatBack(module)) return 0;
  return Math.max(0, module.seatBackHeight ?? CABINET_DEFAULT_SEAT_BACK_HEIGHT);
}

export function getCabinetSeatBackThickness(module: CabinetModuleDefinition): number {
  if (!hasCabinetSeatBack(module)) return 0;
  return Math.max(0, module.seatBackThickness ?? CABINET_DEFAULT_SEAT_BACK_THICKNESS);
}

export function getCabinetSeatFinishedHeight(module: CabinetModuleDefinition): number {
  if (!hasCabinetSeatingDetails(module)) return module.height;
  return module.height + getCabinetSeatDeckThickness(module) + getCabinetSeatCushionThickness(module);
}
