export type DesignPagePlacementAddMode = "preview" | "auto";

export function parseDesignPagePlacementAddMode(
  value: string | null
): DesignPagePlacementAddMode | null {
  return value === "preview" || value === "auto" ? value : null;
}
