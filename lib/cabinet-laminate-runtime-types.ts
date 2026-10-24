/** Runtime shape of the cabinet laminate catalogue (lib/generated/cabinet-laminates.generated.ts). */

export type CabinetLaminateCategory =
  | "abstracts"
  | "metals"
  | "pearlescents"
  | "solids"
  | "unicore"
  | "woodgrains";

/** How a design's grain lies on its sheet; `pattern` is a directionless layout such as a herringbone. */
export type CabinetLaminateGrain = "along" | "across" | "pattern" | "none";

/**
 * One laminate design:
 * [id, supplier code, name, category, mean colour, texture URL, swatch URL,
 *  texture width mm, texture height mm, grain]. Flat colours have no texture (nulls).
 */
export type CabinetLaminateTuple = readonly [
  id: string,
  code: string,
  name: string,
  category: CabinetLaminateCategory,
  colour: string,
  textureUrl: string | null,
  swatchUrl: string | null,
  textureWidthMm: number | null,
  textureHeightMm: number | null,
  grain: CabinetLaminateGrain,
];

export type CabinetLaminateCollection = {
  id: string;
  supplier: string;
  name: string;
  sourceUrl: string;
  sheetMm: { width: number; height: number; thickness: number };
  laminates: readonly CabinetLaminateTuple[];
};
