import type { CabinetLaminateCategory } from "@/lib/cabinet-laminate-runtime-types";
import type { CabinetDefinition, CabinetMaterialRef, CabinetModuleDefinition } from "../types";
import { CABINET_LAMINATES, findCabinetLaminate, type CabinetLaminateCatalogItem } from "./laminates";
import { CABINET_MATERIALS } from "./materials";

/**
 * Cabinet finishes are real products only (J, 23 Oct 2026): a supplier's laminate designs.
 * See docs/architecture/cabinet-laminates.md.
 */
export const CABINET_FINISHES: readonly CabinetLaminateCatalogItem[] = CABINET_LAMINATES;

/**
 * The app's first five finishes, which were placeholders with invented codes. They are no
 * longer offered; a saved design that uses one still opens unchanged and is flagged.
 */
export const CABINET_PLACEHOLDER_FINISH_IDS: ReadonlySet<string> = new Set([
  "white_melamine",
  "oak_veneer",
  "walnut_veneer",
  "matte_black_laminate",
  "painted_shaker_white",
]);

/** The finish a choice starts from when nothing else gives one: Greenlam 101 White. */
export const CABINET_DEFAULT_FINISH_ID = "greenlam-solids-101";
/** Greenlam 9861 AFX Black X, an anti-fingerprint matte black. */
const CABINET_BLACK_FINISH_ID = "greenlam-solids-9861";

export function isCabinetPlaceholderFinish(materialId: string | undefined): boolean {
  return typeof materialId === "string" && CABINET_PLACEHOLDER_FINISH_IDS.has(materialId);
}

const CATEGORY_LABELS: Record<CabinetLaminateCategory, string> = {
  woodgrains: "Woodgrains",
  solids: "Solid colours",
  abstracts: "Stone & abstract",
  pearlescents: "Pearlescent",
  metals: "Metallic",
  unicore: "Unicore",
};

export type CabinetFinishCategory = { id: CabinetLaminateCategory; label: string; count: number };

export const CABINET_FINISH_CATEGORIES: readonly CabinetFinishCategory[] = (
  Object.keys(CATEGORY_LABELS) as CabinetLaminateCategory[]
)
  .map((id) => ({
    id,
    label: CATEGORY_LABELS[id],
    count: CABINET_FINISHES.filter((finish) => finish.laminateCategory === id).length,
  }))
  .filter((category) => category.count > 0);

/**
 * The finishes a picker shows: every design in the category, or, when there is a query, every
 * design whose code starts with a search word or whose name, supplier or kind contains it.
 */
export function filterCabinetFinishes(
  query: string,
  category: CabinetLaminateCategory
): readonly CabinetLaminateCatalogItem[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return CABINET_FINISHES.filter((finish) => finish.laminateCategory === category);
  return CABINET_FINISHES.filter((finish) => {
    const text = `${finish.supplier} ${finish.designName} ${CATEGORY_LABELS[finish.laminateCategory]}`.toLowerCase();
    return words.every((word) => finish.supplierCode.startsWith(word) || text.includes(word));
  });
}

/** A short label for designs whose grain is not the usual: shown on picker tiles. */
export function cabinetFinishBadge(finish: CabinetLaminateCatalogItem): string | null {
  if (finish.laminateGrain === "across") return "Horizontal grain";
  if (finish.laminateGrain === "pattern") return "Pattern";
  if (finish.laminateCategory === "unicore") return "Unicore";
  return null;
}

/** A design's name with its kind, which tells apart designs that share a code (5594 Olympia). */
export function cabinetFinishAccessibleName(finish: CabinetLaminateCatalogItem): string {
  return `${finish.name}, ${CATEGORY_LABELS[finish.laminateCategory]}`;
}

/** One line on how a finish is drawn. */
export function describeCabinetFinish(finish: CabinetLaminateCatalogItem): string {
  const sheet = `${finish.sheetSizeMm.width} × ${finish.sheetSizeMm.height} mm sheet`;
  if (!finish.textureUrl) return `Plain colour, ${sheet}.`;
  const lead: Record<CabinetLaminateCatalogItem["laminateGrain"], string> = {
    along: "Grain runs up doors and sides, at real size",
    across: "Grain runs across, at real size",
    pattern: "Pattern at real size",
    none: "At real size",
  };
  return `${lead[finish.laminateGrain]} from a ${sheet}.`;
}

/** What a finish choice is: its name, and how it is drawn or why it should be replaced. */
export function describeCabinetFinishChoice(
  materialId: string | undefined,
  materials: readonly CabinetMaterialRef[]
): { title: string; detail: string | null; placeholder: boolean } {
  const laminate = findCabinetLaminate(materialId ?? "");
  if (laminate) return { title: laminate.name, detail: describeCabinetFinish(laminate), placeholder: false };
  const material = findCabinetFinishMaterial(materialId, materials);
  if (isCabinetPlaceholderFinish(materialId)) {
    return {
      title: material?.name ?? "Placeholder finish",
      detail: "Placeholder finish, not a real product. Choose a real design.",
      placeholder: true,
    };
  }
  return { title: material?.name ?? "Not assigned", detail: null, placeholder: false };
}

/**
 * A material by id. A catalogue laminate always comes from the current catalogue, so a saved
 * design picks up corrected sizes or pictures; anything else from the design, then the built-ins.
 */
export function findCabinetFinishMaterial(
  materialId: string | undefined,
  materials: readonly CabinetMaterialRef[] = []
): CabinetMaterialRef | undefined {
  if (!materialId) return undefined;
  return (
    findCabinetLaminate(materialId) ??
    materials.find((material) => material.id === materialId) ??
    CABINET_MATERIALS.find((material) => material.id === materialId)
  );
}

/** A design's materials with each catalogue laminate replaced by its current catalogue entry. */
export function currentCabinetMaterials(materials: readonly CabinetMaterialRef[]): CabinetMaterialRef[] {
  return materials.map((material) => findCabinetLaminate(material.id) ?? material);
}

/** A module's visible finish: its fronts', or its body's when the fronts have none of their own. */
export function resolveCabinetModuleFinishId(module: CabinetModuleDefinition | undefined): string | undefined {
  return module?.frontMaterialId ?? module?.materialId;
}

/** A new surface's first finish: the module's fronts or body when that is a real design, else 101 White. */
export function inheritCabinetFinishId(module: CabinetModuleDefinition | undefined): string {
  const real = [module?.frontMaterialId, module?.materialId].find((id) => findCabinetLaminate(id ?? ""));
  return real ?? CABINET_DEFAULT_FINISH_ID;
}

function isDarkColour(hex: string | undefined): boolean {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? "");
  if (!match) return false;
  const [red, green, blue] = match.slice(1).map((channel) => parseInt(channel, 16) / 255);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue < 0.35;
}

/** A contrasting edge band's first suggestion: 9861 black, or 101 white on dark fronts. */
export function defaultCabinetContrastingFinishId(module: CabinetModuleDefinition): string {
  const fronts = findCabinetFinishMaterial(resolveCabinetModuleFinishId(module));
  return isDarkColour(fronts?.color) ? CABINET_DEFAULT_FINISH_ID : CABINET_BLACK_FINISH_ID;
}

/** Every material id a design's finish choices name. */
export function collectCabinetFinishReferences(definition: CabinetDefinition): string[] {
  const ids = [
    ...definition.modules.flatMap((module) => [module.materialId, module.frontMaterialId, module.edgeMaterialId]),
    definition.countertopMaterialId,
    definition.backsplashMaterialId,
    definition.faceFrameMaterialId,
  ];
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

/** A listed laminate's current catalogue entry; a saved copy that already matches it is kept. */
function currentLaminateEntry(material: CabinetMaterialRef): CabinetMaterialRef {
  const current = findCabinetLaminate(material.id);
  if (!current || current === material) return material;
  return JSON.stringify(current) === JSON.stringify(material) ? material : current;
}

/**
 * Keeps a design's material list in step with its choices: every laminate it names is listed,
 * from the current catalogue, and laminates it no longer names are dropped. Other materials stay
 * as they are. Returns the same definition when nothing changes.
 */
export function syncCabinetFinishMaterials(definition: CabinetDefinition): CabinetDefinition {
  const referenced = new Set(collectCabinetFinishReferences(definition));
  const kept = definition.materials
    .filter((material) => !findCabinetLaminate(material.id) || referenced.has(material.id))
    .map(currentLaminateEntry);
  const listed = new Set(kept.map((material) => material.id));
  const added = [...referenced]
    .filter((id) => !listed.has(id))
    .map((id) => findCabinetLaminate(id))
    .filter((laminate): laminate is CabinetLaminateCatalogItem => Boolean(laminate));
  const materials = [...kept, ...added];
  const unchanged =
    materials.length === definition.materials.length &&
    materials.every((material, index) => material === definition.materials[index]);
  return unchanged ? definition : { ...definition, materials };
}
