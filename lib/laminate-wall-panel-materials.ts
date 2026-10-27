import type {
  CabinetLaminateCategory,
  CabinetLaminateCollection,
  CabinetLaminateTuple,
} from "./cabinet-laminate-runtime-types";
import { CABINET_LAMINATE_COLLECTIONS } from "./generated/cabinet-laminates.generated";
import { getLaminateFlatPictureUrl } from "./laminate-flat-pictures";
import { LAMINATE_SURFACE_BY_CATEGORY } from "./laminate-surface-finish";
import { SURFACE_PHYSICAL_SIZE_TOLERANCE } from "./surface-material-physical-sampling";
import type { SurfaceDesignEffect, SurfaceMaterial } from "./surface-material-schema";

/**
 * Laminate sheets as wall panels, from the one laminate catalogue the cabinets use (J, 22, 25 and 27 Oct 2026).
 *
 * Each design becomes a `wall_panel` surface material with the same id and sheet size: a portrait sheet whose one face is the
 * design's picture, drawn at the size it covers. There is no YAML copy; the surface generator and the server registry both
 * read these records, and they are audited like the YAML ones. See docs/architecture/cabinet-laminates.md.
 *
 * - **Patterned designs** use their picture.
 * - **Flat colours** (the solids, whose scans are unevenly lit, so the cabinets draw them flat) use a one-colour picture of
 *   their catalogue colour that covers the sheet (lib/laminate-flat-pictures.ts, written by
 *   scripts/generate-laminate-flat-pictures.ts).
 * - **The 4'x8' collection's pictures must cover the sheet.** 5338 Steamed Bouchle (1220x2115 mm) is left out, because it
 *   would repeat on every sheet.
 * - **The 4.25'x10' collection's pictures cover only 2600 of a sheet's 3050 mm** (Tuscany Oak 2816; Albin Oak Black is a
 *   1299 mm tile that repeats by design). They are drawn at real size from the sheet's foot, and repeat above it
 *   (`PICTURE_FROM_SHEET_FOOT_COLLECTION_IDS`; J, 27 Oct: "Real size, from the floor").
 */
export const LAMINATE_WALL_PANEL_COLLECTION_IDS: readonly string[] = ["hpl-1220x2440", "hpl-1300x3050"];

/** Collections whose pictures may be shorter than the sheet: drawn from its foot, repeating above (wallPanelSheetPainter.ts). */
const PICTURE_FROM_SHEET_FOOT_COLLECTION_IDS: readonly string[] = ["hpl-1300x3050"];


const COLLECTION_LABEL: Record<CabinetLaminateCategory, string> = {
  abstracts: "Abstracts",
  metals: "Metals",
  pearlescents: "Pearlescents",
  solids: "Solids",
  unicore: "Unicore",
  woodgrains: "Woodgrains",
};

// An abstract's effect is read from its name only where the name says it (Creme Marquina, Tivoli Travertine, Grey Onyx, Dune
// Pietra, Urban Concrete, Grey Mesh); the rest are patterns.
const ABSTRACT_EFFECT_BY_NAME: ReadonlyArray<[RegExp, SurfaceDesignEffect]> = [
  [/\b(marble|marmor|marquina|statuario)\b/i, "marble"],
  [/\b(travertine|sandstone|onyx|pietra)\b/i, "stone"],
  [/\bconcrete\b/i, "concrete"],
  [/\b(mesh|woven|twine)\b/i, "woven"],
];

function getLaminateDesignEffect(category: CabinetLaminateCategory, name: string): SurfaceDesignEffect {
  if (category === "woodgrains") return "wood";
  if (category === "solids" || category === "unicore") return "plain";
  if (category === "metals" || category === "pearlescents") return "metallic";
  return ABSTRACT_EFFECT_BY_NAME.find(([pattern]) => pattern.test(name))?.[1] ?? "pattern";
}

/** The catalogue a collection's records come from, relative to the repository. */
export function getLaminateCollectionSourcePath(collection: Pick<CabinetLaminateCollection, "id" | "supplier">): string {
  return `catalog/laminates/${collection.supplier.toLowerCase()}/${collection.id}.json`;
}

/**
 * A picture drawn on a sheet must cover the sheet's width, and its height too unless the collection draws its pictures from
 * the sheet's foot, within the tolerance of supplier pictures.
 */
function fitsSheet(widthMm: number, heightMm: number, collection: CabinetLaminateCollection): boolean {
  const enough = 1 - SURFACE_PHYSICAL_SIZE_TOLERANCE;
  const sheet = collection.sheetMm;
  if (widthMm / sheet.width < enough) return false;
  return heightMm / sheet.height >= enough || PICTURE_FROM_SHEET_FOOT_COLLECTION_IDS.includes(collection.id);
}

type SheetMm = CabinetLaminateCollection["sheetMm"];
type PanelPicture = { textureUrl: string; swatchUrl: string; widthMm: number; heightMm: number; flatColour: string | null };

function pictureNote(picture: PanelPicture, sheet: SheetMm): string {
  if (picture.flatColour) return `A flat colour, ${picture.flatColour}, as the cabinets draw it, over the whole sheet.`;
  const covers = `One picture is one sheet: it covers ${picture.widthMm}x${picture.heightMm} mm of the ${sheet.width}x${sheet.height} mm sheet`;
  return picture.heightMm < sheet.height ? `${covers}, drawn from its foot and repeating above.` : `${covers}.`;
}

function panelSource(collection: CabinetLaminateCollection, picture: PanelPicture): SurfaceMaterial["source"] {
  const sheet = collection.sheetMm;
  return {
    supplier_region: "international",
    source_url: collection.sourceUrl,
    sample_request_url: null,
    license_status: "confirmed",
    notes: [
      `From ${getLaminateCollectionSourcePath(collection)}, ${collection.supplier}'s ${collection.name} collection, the catalogue the cabinets use.`,
      pictureNote(picture, sheet),
      "Greenlam's permission given (J, 22 Oct 2026); confirmed for wall panels (J, 25 Oct 2026; solids and 10' designs 27 Oct).",
    ],
  };
}

function panelClassification(category: CabinetLaminateCategory, name: string): SurfaceMaterial["classification"] {
  return {
    flooring_type: "laminate",
    design_effect: getLaminateDesignEffect(category, name),
    color_family: "unknown",
    tone: ["durable"],
    style_cluster: ["contemporary", "modern"],
    // Thin HPL is for dry walls (Greenlam); bathrooms and balconies take compact panels.
    room_suitability: ["living_room", "bedroom", "dining_room", "study", "hallway", "kitchen", "commercial", "hospitality"],
  };
}

function panelPhysicalSpecs(sheet: SheetMm): SurfaceMaterial["physical_specs"] {
  return {
    plank_or_tile_format: "sheet",
    plank_width_mm: null,
    plank_length_mm: null,
    tile_width_mm: sheet.width,
    tile_length_mm: sheet.height,
    total_thickness_mm: sheet.thickness,
    wear_layer_mm: null,
    installation_method: ["unknown"],
    waterproof: null,
    slip_rating: null,
    suitable_for_wet_area: null,
    suitable_for_outdoor: null,
    commercial_grade: null,
  };
}

function panelTextureAssets(sheet: SheetMm, picture: PanelPicture): SurfaceMaterial["texture_assets"] {
  return {
    swatch_url: picture.swatchUrl,
    base_color_url: picture.textureUrl,
    normal_url: null,
    roughness_url: null,
    ao_url: null,
    preview_room_url: null,
    tileable: false,
    texture_repeat_size_cm: { width: sheet.width / 10, height: sheet.height / 10 },
    // The sheet's one face is its base colour picture (lib/surface-material-physical-sampling.ts).
    image_physical_size_mm: { width: picture.widthMm, height: picture.heightMm },
  };
}

/** The design's picture, or for a flat colour its one-colour picture over the whole sheet; null for one that doesn't fit. */
function panelPicture(collection: CabinetLaminateCollection, tuple: CabinetLaminateTuple): PanelPicture | null {
  const [, , , , colour, textureUrl, swatchUrl, widthMm, heightMm] = tuple;
  if (!textureUrl) {
    const flatUrl = getLaminateFlatPictureUrl(colour);
    const { width, height } = collection.sheetMm;
    return { textureUrl: flatUrl, swatchUrl: flatUrl, widthMm: width, heightMm: height, flatColour: colour };
  }
  if (!swatchUrl || !widthMm || !heightMm || !fitsSheet(widthMm, heightMm, collection)) return null;
  return { textureUrl, swatchUrl, widthMm, heightMm, flatColour: null };
}

function toWallPanelMaterial(collection: CabinetLaminateCollection, tuple: CabinetLaminateTuple): SurfaceMaterial | null {
  const [id, code, name, category] = tuple;
  const picture = panelPicture(collection, tuple);
  if (!picture) return null;
  return {
    schema_version: 1,
    surface_material: {
      supplier: collection.supplier.toLowerCase(),
      brand: collection.supplier,
      collection: COLLECTION_LABEL[category],
      material_id: id,
      // Name first, so the wall browser, which sorts by name, lists the designs among the tiles rather than all ahead of them.
      product_name: `${collection.supplier} ${name} ${code}`,
      slug: id,
      surface_category: "wall_panel",
      material_family: "wall_panel",
    },
    source: panelSource(collection, picture),
    classification: panelClassification(category, name),
    physical_specs: panelPhysicalSpecs(collection.sheetMm),
    texture_assets: panelTextureAssets(collection.sheetMm, picture),
    rendering: {
      default_rotation_deg: 0,
      ...LAMINATE_SURFACE_BY_CATEGORY[category],
      scale_mode: "physical_repeat",
      seam_strategy: "repeat_texture",
      available_pattern_layouts: ["straight"],
    },
    commerce: { purchase_mode: "unknown", sample_available: "unknown", sample_request_url: null, direct_checkout: false },
    import_governance: {
      publish_status: "published",
      publish_blockers: [],
      qa_flags: ["laminate_catalogue_wall_panel", "physical_scale_faces", "user_confirmed_permission"],
    },
  };
}

/** The wall panels of the given laminate collections (by default the app's own), in catalogue order. */
export function buildLaminateWallPanelMaterials(
  collections: readonly CabinetLaminateCollection[] = CABINET_LAMINATE_COLLECTIONS
): SurfaceMaterial[] {
  return collections
    .filter((collection) => LAMINATE_WALL_PANEL_COLLECTION_IDS.includes(collection.id))
    .flatMap((collection) =>
      collection.laminates.flatMap((tuple) => {
        const material = toWallPanelMaterial(collection, tuple);
        return material ? [material] : [];
      })
    );
}
