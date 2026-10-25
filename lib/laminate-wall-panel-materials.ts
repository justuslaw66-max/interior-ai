import type {
  CabinetLaminateCategory,
  CabinetLaminateCollection,
  CabinetLaminateTuple,
} from "./cabinet-laminate-runtime-types";
import { CABINET_LAMINATE_COLLECTIONS } from "./generated/cabinet-laminates.generated";
import { LAMINATE_SURFACE_BY_CATEGORY } from "./laminate-surface-finish";
import { SURFACE_PHYSICAL_SIZE_TOLERANCE } from "./surface-material-physical-sampling";
import type { SurfaceDesignEffect, SurfaceMaterial } from "./surface-material-schema";

/**
 * Laminate sheets as wall panels, from the one laminate catalogue the cabinets use (J, 22 and 25 Oct 2026).
 *
 * Each patterned design of Greenlam's 4'x8' collection becomes a `wall_panel` surface material with the same id, picture and
 * sizes: a portrait 1220x2440 mm sheet whose one face is the design's picture, drawn at the size it covers. There is no YAML
 * copy; the surface generator and the server registry both read these records, and they are audited like the YAML ones.
 * See docs/architecture/cabinet-laminates.md.
 *
 * Left out: the flat colours (the surface schema needs a picture), the 4.25'x10' collection (its pictures cover 2600 of a
 * sheet's 3050 mm), and a design whose picture covers less than its sheet (5338 Steamed Bouchle, 1220x2115 mm), which can't
 * be drawn at real size.
 */
export const LAMINATE_WALL_PANEL_COLLECTION_IDS: readonly string[] = ["hpl-1220x2440"];

const COLLECTION_LABEL: Record<CabinetLaminateCategory, string> = {
  abstracts: "Abstracts",
  metals: "Metals",
  pearlescents: "Pearlescents",
  solids: "Solids",
  unicore: "Unicore",
  woodgrains: "Woodgrains",
};

// An abstract's effect is read from its name only where the name says it (Creme Marquina, Tivoli Travertine, Urban Concrete,
// Grey Mesh); the rest are patterns.
const ABSTRACT_EFFECT_BY_NAME: ReadonlyArray<[RegExp, SurfaceDesignEffect]> = [
  [/\b(marble|marmor|marquina|statuario)\b/i, "marble"],
  [/\b(travertine|sandstone)\b/i, "stone"],
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

/** A picture drawn on a sheet must cover the whole sheet, within the tolerance of supplier pictures. */
function coversSheet(widthMm: number, heightMm: number, sheet: CabinetLaminateCollection["sheetMm"]): boolean {
  const enough = 1 - SURFACE_PHYSICAL_SIZE_TOLERANCE;
  return widthMm / sheet.width >= enough && heightMm / sheet.height >= enough;
}

type SheetMm = CabinetLaminateCollection["sheetMm"];
type PanelPicture = { textureUrl: string; swatchUrl: string; widthMm: number; heightMm: number };

function panelSource(collection: CabinetLaminateCollection, picture: PanelPicture): SurfaceMaterial["source"] {
  const sheet = collection.sheetMm;
  return {
    supplier_region: "international",
    source_url: collection.sourceUrl,
    sample_request_url: null,
    license_status: "confirmed",
    notes: [
      `From ${getLaminateCollectionSourcePath(collection)}, ${collection.supplier}'s ${collection.name} collection, the catalogue the cabinets use.`,
      `One picture is one sheet: it covers ${picture.widthMm}x${picture.heightMm} mm of the ${sheet.width}x${sheet.height} mm sheet.`,
      "Greenlam's permission given (J, 22 Oct 2026); confirmed for wall panels (J, 25 Oct 2026).",
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

function toWallPanelMaterial(collection: CabinetLaminateCollection, tuple: CabinetLaminateTuple): SurfaceMaterial | null {
  const [id, code, name, category, , textureUrl, swatchUrl, widthMm, heightMm] = tuple;
  if (!textureUrl || !swatchUrl || !widthMm || !heightMm) return null;
  if (!coversSheet(widthMm, heightMm, collection.sheetMm)) return null;
  const picture: PanelPicture = { textureUrl, swatchUrl, widthMm, heightMm };
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
