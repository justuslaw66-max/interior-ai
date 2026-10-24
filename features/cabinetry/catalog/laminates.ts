import type {
  CabinetLaminateCategory,
  CabinetLaminateCollection,
  CabinetLaminateGrain,
  CabinetLaminateTuple,
} from "@/lib/cabinet-laminate-runtime-types";
import { CABINET_LAMINATE_COLLECTIONS } from "@/lib/generated/cabinet-laminates.generated";
import type { CabinetMaterialCatalogItem } from "./materials";

/** A supplier's laminate as a cabinet material (see docs/architecture/cabinet-laminates.md). */
export type CabinetLaminateCatalogItem = CabinetMaterialCatalogItem & {
  supplier: string;
  supplierCode: string;
  /** The supplier's name for the design, without the supplier or code. */
  designName: string;
  collectionId: string;
  laminateCategory: CabinetLaminateCategory;
  laminateGrain: CabinetLaminateGrain;
  /** The sheet the design is sold on, in mm. */
  sheetSizeMm: { width: number; height: number };
  /** A small picture of the middle of the sheet, for pickers; flat colours have none. */
  swatchUrl?: string;
};

// The 4'x8' catalogue doesn't give each design's finish, so these are per kind of decor.
const SURFACE_BY_CATEGORY: Record<CabinetLaminateCategory, { roughness: number; metalness: number }> = {
  abstracts: { roughness: 0.55, metalness: 0 },
  metals: { roughness: 0.36, metalness: 0.45 },
  pearlescents: { roughness: 0.42, metalness: 0.18 },
  solids: { roughness: 0.58, metalness: 0 },
  unicore: { roughness: 0.6, metalness: 0 },
  woodgrains: { roughness: 0.62, metalness: 0 },
};

function toCabinetLaminate(
  collection: CabinetLaminateCollection,
  tuple: CabinetLaminateTuple
): CabinetLaminateCatalogItem {
  const [id, code, name, category, colour, textureUrl, swatchUrl, widthMm, heightMm, grain] = tuple;
  const hasTexture = textureUrl !== null && widthMm !== null && heightMm !== null;
  return {
    id,
    name: `${collection.supplier} ${code} ${name}`,
    color: colour,
    ...(hasTexture ? { textureUrl, textureSizeMm: { width: widthMm, height: heightMm } } : {}),
    ...(grain === "along" || grain === "across" ? { textureGrain: grain } : {}),
    ...SURFACE_BY_CATEGORY[category],
    skuId: id.toUpperCase(),
    grainBehavior: grain === "along" || grain === "across" ? "directional" : "non_directional",
    supportedEdgeTreatments: ["matching_edge_band", "contrasting_edge_band", "solid_lipping", "none"],
    supplier: collection.supplier,
    supplierCode: code,
    designName: name,
    collectionId: collection.id,
    laminateCategory: category,
    laminateGrain: grain,
    sheetSizeMm: { width: collection.sheetMm.width, height: collection.sheetMm.height },
    ...(swatchUrl ? { swatchUrl } : {}),
  };
}

export const CABINET_LAMINATES: readonly CabinetLaminateCatalogItem[] = CABINET_LAMINATE_COLLECTIONS.flatMap(
  (collection) => collection.laminates.map((tuple) => toCabinetLaminate(collection, tuple))
);

const LAMINATE_BY_ID = new Map(CABINET_LAMINATES.map((laminate) => [laminate.id, laminate]));

export function findCabinetLaminate(id: string): CabinetLaminateCatalogItem | undefined {
  return LAMINATE_BY_ID.get(id);
}
