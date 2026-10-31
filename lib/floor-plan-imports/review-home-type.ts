import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanFloorV2,
} from "@/lib/floor-plan-document-v2";
import {
  HOME_CEILING_HEIGHTS_MM,
  homeCeilingHeight,
  storeyHeightForWallMm,
  type HomeHeightContext,
} from "@/lib/home-height-rules";

/**
 * The home type an upload's review asks for (J, 31 Oct 2026: on the review step, visible; a height the person typed or
 * confirmed is kept). It sets the floor's wall and storey heights by the height rules while they are still assumed, so
 * a condo's plan doesn't come in with an HDB flat's 2.6 m walls. "Not sure" gives what every upload got before.
 */
export const REVIEW_HOME_TYPES = [
  { id: "unknown", label: "Not sure", home: {} },
  { id: "hdb", label: "HDB flat", home: { propertyType: "hdb" } },
  { id: "hdb_top_floor", label: "HDB top floor", home: { propertyType: "hdb", topFloor: true } },
  { id: "condo", label: "Condo", home: { propertyType: "condo" } },
  { id: "condo_penthouse", label: "Condo penthouse", home: { propertyType: "condo", penthouse: true } },
  { id: "landed", label: "Landed", home: { propertyType: "landed" } },
] as const satisfies ReadonlyArray<{ id: string; label: string; home: HomeHeightContext }>;

export type ReviewHomeTypeId = (typeof REVIEW_HOME_TYPES)[number]["id"];

export type ReviewHomeTypeHeights = { wallMm: number; storeyMm: number; rule: string; label: string };

export function reviewHomeTypeHeights(id: ReviewHomeTypeId): ReviewHomeTypeHeights {
  const type = REVIEW_HOME_TYPES.find((entry) => entry.id === id) ?? REVIEW_HOME_TYPES[0];
  const ceiling = homeCeilingHeight(type.home);
  return { wallMm: ceiling.heightMm, storeyMm: storeyHeightForWallMm(ceiling.heightMm), rule: ceiling.rule, label: type.label };
}

/** A wall height a home type can give: the server keeps such a height "assumed" when the review changes it. */
export function isHomeTypeWallHeightMm(valueMm: number) {
  return (Object.values(HOME_CEILING_HEIGHTS_MM) as number[]).includes(valueMm);
}

export function homeTypeRuleNote(heights: Pick<ReviewHomeTypeHeights, "label" | "rule">) {
  return `Home type chosen at review: ${heights.label}. The rule for ${heights.rule}; not source-verified.`;
}

function ruleProvenance(previous: FloorPlanEntityProvenanceV2 | undefined, note: string): FloorPlanEntityProvenanceV2 {
  const first = previous?.evidence[0];
  return {
    confidence: 0,
    extractionVersion: previous?.extractionVersion ?? "consumer-review-1",
    evidence: [{ sourceId: first?.sourceId ?? "consumer-review", basis: "inferred", confidence: 0,
      extractorVersion: "consumer-review-home-type-1", ...(first?.pageNumber ? { pageNumber: first.pageNumber } : {}), note }],
    reviewHistory: previous?.reviewHistory ?? [],
  };
}

export type ReviewHomeTypeResult = {
  document: FloorPlanDocumentV2;
  /** A wall or storey height the person typed or confirmed, which the home type left as it was. */
  kept: Array<"wall" | "storey">;
};

/**
 * The document with the floor's wall and storey heights set by the home type. Only a height still assumed changes; a
 * storey height typed in this review (its evidence stays assumed while only its number changes) is kept too.
 */
export function applyReviewHomeType(
  document: FloorPlanDocumentV2,
  input: { floorId: string; homeType: ReviewHomeTypeId; storeyTyped: boolean }
): ReviewHomeTypeResult {
  const heights = reviewHomeTypeHeights(input.homeType);
  const next = structuredClone(document);
  const floor: FloorPlanFloorV2 | undefined = next.floors.find((entry) => entry.id === input.floorId);
  if (!floor) return { document, kept: [] };
  const note = homeTypeRuleNote(heights);
  const kept: ReviewHomeTypeResult["kept"] = [];
  const wall = floor.defaults.wallHeight;
  if (wall.evidence === "assumed") {
    floor.defaults.wallHeight = { valueMm: heights.wallMm, evidence: "assumed", provenance: ruleProvenance(wall.provenance, note) };
  } else kept.push("wall");
  const storeyEvidence = floor.verticalEvidence?.storeyHeight;
  if ((storeyEvidence?.evidence ?? "assumed") === "assumed" && !input.storeyTyped) {
    floor.storeyHeightMm = heights.storeyMm;
    if (floor.verticalEvidence) {
      floor.verticalEvidence.storeyHeight = { evidence: "assumed", provenance: ruleProvenance(storeyEvidence?.provenance, note) };
    }
  } else kept.push("storey");
  return { document: next, kept };
}
