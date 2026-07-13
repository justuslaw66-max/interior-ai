import type { CabinetDefinition } from "./types";

export const CABINET_DEFAULT_ISLAND_SEATING_OVERHANG_DEPTH = 300;
export const CABINET_DEFAULT_ISLAND_SUPPORT_PANEL_COUNT = 3;
export const CABINET_DEFAULT_ISLAND_SUPPORT_PANEL_THICKNESS = 36;
export const CABINET_DEFAULT_ISLAND_SUPPORT_PANEL_DEPTH = 240;
export const CABINET_DEFAULT_ISLAND_SUPPORT_PANEL_END_INSET = 160;

export function hasCabinetIslandSeating(definition: CabinetDefinition): boolean {
  if (definition.islandSeatingOverhangEnabled === false) return false;
  return (
    Boolean(definition.islandSeatingOverhangEnabled) ||
    typeof definition.islandSeatingOverhangDepth === "number" ||
    typeof definition.islandSupportPanelCount === "number" ||
    typeof definition.islandSupportPanelThickness === "number" ||
    typeof definition.islandSupportPanelDepth === "number" ||
    typeof definition.islandSupportPanelEndInset === "number"
  );
}

export function getCabinetIslandSeatingOverhangDepth(definition: CabinetDefinition): number {
  if (!hasCabinetIslandSeating(definition)) return 0;
  return Math.max(
    0,
    definition.islandSeatingOverhangDepth ??
      definition.countertopOverhangBack ??
      CABINET_DEFAULT_ISLAND_SEATING_OVERHANG_DEPTH
  );
}

export function getCabinetIslandSupportPanelCount(definition: CabinetDefinition): number {
  if (!hasCabinetIslandSeating(definition)) return 0;
  return Math.max(0, definition.islandSupportPanelCount ?? CABINET_DEFAULT_ISLAND_SUPPORT_PANEL_COUNT);
}

export function getCabinetIslandSupportPanelThickness(definition: CabinetDefinition): number {
  if (!hasCabinetIslandSeating(definition)) return 0;
  return Math.max(0, definition.islandSupportPanelThickness ?? CABINET_DEFAULT_ISLAND_SUPPORT_PANEL_THICKNESS);
}

export function getCabinetIslandSupportPanelDepth(definition: CabinetDefinition): number {
  if (!hasCabinetIslandSeating(definition)) return 0;
  return Math.max(
    0,
    definition.islandSupportPanelDepth ??
      Math.min(
        CABINET_DEFAULT_ISLAND_SUPPORT_PANEL_DEPTH,
        getCabinetIslandSeatingOverhangDepth(definition)
      )
  );
}

export function getCabinetIslandSupportPanelEndInset(definition: CabinetDefinition): number {
  if (!hasCabinetIslandSeating(definition)) return 0;
  return Math.max(0, definition.islandSupportPanelEndInset ?? CABINET_DEFAULT_ISLAND_SUPPORT_PANEL_END_INSET);
}

export function getCabinetIslandSupportPanelLocalXPositions(
  definition: CabinetDefinition,
  spanWidth: number
): number[] {
  const count = getCabinetIslandSupportPanelCount(definition);
  const thickness = getCabinetIslandSupportPanelThickness(definition);
  const endInset = getCabinetIslandSupportPanelEndInset(definition);
  if (count <= 0 || thickness <= 0 || spanWidth <= 0) return [];

  if (count === 1) return [Math.max(0, (spanWidth - thickness) / 2)];

  const usableSpan = Math.max(0, spanWidth - 2 * endInset);
  return Array.from({ length: count }, (_, index) => {
    const centerX = endInset + (usableSpan * index) / (count - 1);
    return Math.max(0, Math.min(spanWidth - thickness, centerX - thickness / 2));
  });
}
