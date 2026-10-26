import type { CabinetLaminateCategory } from "./cabinet-laminate-runtime-types";

/**
 * How a laminate's face takes the light, per kind of decor. The same sheet is drawn on cabinets
 * (features/cabinetry/catalog/laminates.ts) and on walls (lib/laminate-wall-panel-materials.ts).
 *
 * Per kind of decor because the 4'x8' catalogue doesn't give each design's finish, and the
 * 4.25'x10' collection's finishes (in its JSON) are not drawn yet.
 */
export const LAMINATE_SURFACE_BY_CATEGORY: Readonly<
  Record<CabinetLaminateCategory, { roughness: number; metalness: number }>
> = {
  abstracts: { roughness: 0.55, metalness: 0 },
  metals: { roughness: 0.36, metalness: 0.45 },
  pearlescents: { roughness: 0.42, metalness: 0.18 },
  solids: { roughness: 0.58, metalness: 0 },
  unicore: { roughness: 0.6, metalness: 0 },
  woodgrains: { roughness: 0.62, metalness: 0 },
};
