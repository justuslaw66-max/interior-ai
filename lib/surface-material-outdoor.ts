import {
  SURFACE_MATERIAL_VOCABULARY,
  type SurfaceMaterial,
  type SurfaceMaterialOutdoorProfile,
} from "./surface-material-schema";

// Outdoor floor tiles in the catalogue data (J, 13 Oct 2026: "Knowledge in the catalogue"). Each outdoor floor entry says where it
// goes (classification.outdoor_uses) and how it can be laid (physical_specs.installation_method); the generator adds the same
// colour's indoor floor entries and puts the three in the browser data as classification.outdoor. The manufacturer's words behind
// them are in lib/surface-material-outdoor-knowledge.ts and lib/surface-material-plein-air-system.ts (ABK's Plein Air catalogue);
// docs/architecture/surface-material-outdoor-tiles.md describes the fields.

/** The `outdoor_use` vocabulary in words: a card's search text and, later, the AI read these. */
export const SURFACE_OUTDOOR_USE_LABELS: Readonly<Record<string, string>> = {
  terrace: "Terrace",
  balcony: "Balcony",
  patio: "Patio",
  garden: "Garden",
  path: "Paths",
  pool_edge: "Pool edge",
  driveway: "Driveway",
  steps: "Steps",
  outdoor_shower: "Outdoor shower",
};

/** How an outdoor tile can be laid, in words. `direct_stick` is glued down; outdoors, on a screed. */
export const SURFACE_OUTDOOR_LAYING_LABELS: Readonly<Record<string, string>> = {
  direct_stick: "Glued on a screed",
  dry_lay_on_grass: "Dry laid on grass",
  dry_lay_on_gravel_or_sand: "Dry laid on gravel or sand",
  raised_installation: "Raised installation",
};

type OutdoorEntry = {
  surface_material: Pick<
    SurfaceMaterial["surface_material"],
    "material_id" | "supplier" | "collection" | "product_name" | "surface_category" | "material_family"
  >;
  classification: Pick<SurfaceMaterial["classification"], "design_effect" | "color_family" | "outdoor_uses">;
  physical_specs: Pick<SurfaceMaterial["physical_specs"], "suitable_for_outdoor" | "installation_method">;
};

const OUTDOOR_ONLY_LAYING = new Set(["dry_lay_on_grass", "dry_lay_on_gravel_or_sand", "raised_installation"]);

/** The name without its size and finish: "Gardenia Dorica Avorio 60x120 R11" -> "Gardenia Dorica Avorio". */
function getColourName(productName: string): string {
  return productName.replace(/\s+\d+(?:[.,]\d+)?x\d+(?:[.,]\d+)?(?:\s.*)?$/i, "").trim();
}

/** Entries with the same key are sizes of one colour on one card: same maker, collection, surface, look and name. */
function getColourKey(entry: OutdoorEntry): string {
  return [
    entry.surface_material.supplier,
    entry.surface_material.collection,
    entry.surface_material.surface_category,
    entry.surface_material.material_family,
    entry.classification.design_effect,
    entry.classification.color_family,
    getColourName(entry.surface_material.product_name),
  ]
    .map((part) => String(part ?? "").trim().toLowerCase())
    .join("|");
}

/** The outdoor profile of every entry that has outdoor uses, by material id. */
export function buildSurfaceMaterialOutdoorProfiles(
  entries: readonly OutdoorEntry[]
): Map<string, SurfaceMaterialOutdoorProfile> {
  const indoorByColour = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.physical_specs.suitable_for_outdoor === true) continue;
    const key = getColourKey(entry);
    indoorByColour.set(key, [...(indoorByColour.get(key) ?? []), entry.surface_material.material_id]);
  }
  const profiles = new Map<string, SurfaceMaterialOutdoorProfile>();
  for (const entry of entries) {
    const uses = entry.classification.outdoor_uses;
    if (!uses?.length) continue;
    profiles.set(entry.surface_material.material_id, {
      uses: [...uses],
      laying: [...(entry.physical_specs.installation_method ?? [])],
      indoor_twin_ids: [...(indoorByColour.get(getColourKey(entry)) ?? [])].sort(),
    });
  }
  return profiles;
}

/** Outdoor uses belong to outdoor floors, and every outdoor floor has them; outdoor-only laying belongs to outdoor tiles. */
export function getSurfaceMaterialOutdoorFailures(entry: OutdoorEntry): string[] {
  const uses = entry.classification.outdoor_uses;
  const isOutdoorFloor =
    entry.physical_specs.suitable_for_outdoor === true && entry.surface_material.surface_category === "flooring";
  const failures: string[] = [];
  if (uses !== undefined && !isOutdoorFloor) {
    failures.push("classification.outdoor_uses is only for floors with suitable_for_outdoor: true.");
  }
  if (isOutdoorFloor && !uses?.length) failures.push("an outdoor floor needs classification.outdoor_uses.");
  const vocabulary: readonly string[] = SURFACE_MATERIAL_VOCABULARY.outdoor_use;
  (uses ?? [])
    .filter((use) => !vocabulary.includes(use))
    .forEach((use) => failures.push(`classification.outdoor_uses has invalid value "${use}".`));
  const outdoorLaying = (entry.physical_specs.installation_method ?? []).filter((method) => OUTDOOR_ONLY_LAYING.has(method));
  if (outdoorLaying.length > 0 && entry.physical_specs.suitable_for_outdoor !== true) {
    failures.push(`physical_specs.installation_method ${outdoorLaying.join(", ")} is only for outdoor tiles.`);
  }
  // ABK's Plein Air catalogue: the traditional (glued) installation is the one for floors vehicles drive over.
  if (uses?.includes("driveway") && !entry.physical_specs.installation_method?.includes("direct_stick")) {
    failures.push("classification.outdoor_uses driveway needs physical_specs.installation_method direct_stick.");
  }
  return failures;
}

/** Words a search should find an outdoor floor by: "outdoor", where it goes, and the laying only outdoor tiles have. */
export function getSurfaceMaterialOutdoorSearchTerms(material: {
  classification?: { outdoor?: SurfaceMaterialOutdoorProfile };
}): string[] {
  const outdoor = material.classification?.outdoor;
  if (!outdoor) return [];
  return [
    "outdoor",
    ...outdoor.uses.map((use) => SURFACE_OUTDOOR_USE_LABELS[use] ?? use),
    ...outdoor.laying
      .filter((method) => OUTDOOR_ONLY_LAYING.has(method))
      .map((method) => SURFACE_OUTDOOR_LAYING_LABELS[method] ?? method),
  ];
}
