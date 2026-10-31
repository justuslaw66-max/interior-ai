import type {
  FloorPlanEntityProvenanceV2,
  FloorPlanMeasuredPropertyV2,
  FloorPlanPropertyEvidenceV2,
} from "@/lib/floor-plan-document-v2";

/**
 * How high a home's ceilings are (its walls' height) when its plan or brochure doesn't say (J, 30 Oct 2026). A height
 * the plan or brochure states always wins; these rules are for the rest:
 * - HDB flats, BTO and resale alike: about 2.6 m (J, 31 Oct 2026: "include all HDB resale to 2.6 as well"; older
 *   resale flats can be 2.4 to 2.5 m, but the app gives them 2.6 too);
 * - top-floor HDB units: about 2.7 to 2.8 m (the roof slab and the design vary);
 * - condos 2.8 m, condo penthouses 3.2 m;
 * - strata landed homes (cluster houses, townhouses) 3.0 m;
 * - double-volume spaces: executive maisonettes up to 5 m, HDB lofts about 4.4 to 4.8 m. Not drawn yet: a floor has one
 *   wall height, so these are only recorded here.
 * A home whose type isn't known gets a newer HDB flat's 2.6 m, as the app always gave every home.
 */
export const HOME_CEILING_HEIGHTS_MM = {
  hdb: 2600,
  hdbTopFloor: 2750,
  condo: 2800,
  condoPenthouse: 3200,
  landed: 3000,
} as const;

export const DOUBLE_VOLUME_HEIGHTS_MM = { executiveMaisonette: 5000, hdbLoft: 4600 } as const;

/** What stands between a storey's ceiling and the next floor (slab and finishes): 2.6 m walls in a 2.8 m storey. */
export const STOREY_ALLOWANCE_MM = 200;

export type HomeKind = "hdb" | "condo" | "landed" | "unknown";

export type HomeHeightContext = {
  propertyType?: string | null;
  topFloor?: boolean;
  penthouse?: boolean;
};

export type HomeCeilingHeight = { heightMm: number; rule: string };

const CONDO_TYPES = new Set(["condo", "condominium", "executive_condo", "ec", "apartment", "private_apartment"]);
const LANDED_TYPES = new Set(["landed", "strata_landed", "cluster_house", "cluster", "townhouse", "terrace"]);

export function homeKind(propertyType: string | null | undefined): HomeKind {
  const type = (propertyType ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (type === "hdb" || type.startsWith("hdb_")) return "hdb";
  if (CONDO_TYPES.has(type)) return "condo";
  if (LANDED_TYPES.has(type)) return "landed";
  return "unknown";
}

/** The ceiling height the rules give a home, and the rule in words (for the height's provenance). */
export function homeCeilingHeight(home: HomeHeightContext): HomeCeilingHeight {
  const kind = homeKind(home.propertyType);
  if (kind === "condo" && home.penthouse) return { heightMm: HOME_CEILING_HEIGHTS_MM.condoPenthouse, rule: "a condo penthouse: about 3.2 m" };
  if (kind === "condo") return { heightMm: HOME_CEILING_HEIGHTS_MM.condo, rule: "a condo: about 2.8 m" };
  if (kind === "landed") return { heightMm: HOME_CEILING_HEIGHTS_MM.landed, rule: "a strata landed home: about 3.0 m" };
  if (kind === "hdb" && home.topFloor) return { heightMm: HOME_CEILING_HEIGHTS_MM.hdbTopFloor, rule: "a top-floor HDB flat: about 2.7 to 2.8 m" };
  if (kind === "hdb") return { heightMm: HOME_CEILING_HEIGHTS_MM.hdb, rule: "an HDB flat, BTO or resale: about 2.6 m" };
  return { heightMm: HOME_CEILING_HEIGHTS_MM.hdb, rule: "a home of unknown type: 2.6 m, as a newer HDB flat" };
}

export function storeyHeightForWallMm(wallHeightMm: number): number {
  return wallHeightMm + STOREY_ALLOWANCE_MM;
}

/** A template's height from its tags ("condo", "HDB-style"), or none for a template of no particular home. */
export function templateCeilingHeightM(tags: readonly string[]): number | null {
  const kind = tags.map((tag) => homeKind(tag.replace(/_style$|-style$/i, ""))).find((candidate) => candidate !== "unknown");
  return kind ? homeCeilingHeight({ propertyType: kind }).heightMm / 1000 : null;
}

/** A height a plan or brochure states: its value and where it says so. */
export type StatedCeilingHeight = { value_mm: number; source_page: number; quote: string };

export type CatalogHomeHeights = {
  wallMm: number;
  storeyMm: number;
  wallEvidence: FloorPlanPropertyEvidenceV2;
  /** The wall height as a floor default, its provenance made by the caller from a page and a note. */
  wallProperty: (provenance: (pageNumber: number, note: string) => FloorPlanEntityProvenanceV2) => FloorPlanMeasuredPropertyV2;
};

/**
 * A catalog layout's heights: the height its brochure states (the layout's own, else the plan's) as documented, else
 * the rules' height for its property type as assumed; the storey is the walls plus STOREY_ALLOWANCE_MM.
 */
export function catalogHomeHeights(input: {
  propertyType: string;
  penthouse?: boolean;
  /** stated heights, most particular first (a layout's, then its plan's); the first given wins */
  stated?: ReadonlyArray<StatedCeilingHeight | null | undefined>;
  sourcePage: number;
}): CatalogHomeHeights {
  const rule = homeCeilingHeight({ propertyType: input.propertyType, penthouse: input.penthouse });
  const stated = input.stated?.find((height) => height) ?? null;
  const wallMm = stated ? stated.value_mm : rule.heightMm;
  const wallEvidence: FloorPlanPropertyEvidenceV2 = stated ? "source_documented" : "assumed";
  const note = stated
    ? `Wall height stated by the source on page ${stated.source_page}: "${stated.quote}".`
    : `Wall height is the rule for ${rule.rule}; the source states none.`;
  return {
    wallMm,
    storeyMm: storeyHeightForWallMm(wallMm),
    wallEvidence,
    wallProperty: (provenance) => ({
      valueMm: wallMm,
      evidence: wallEvidence,
      provenance: provenance(stated ? stated.source_page : input.sourcePage, note),
    }),
  };
}
