import type {
  FloorPlanDocumentV2,
  FloorPlanEntityProvenanceV2,
  FloorPlanFloorV2,
} from "@/lib/floor-plan-document-v2";
import { validateFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
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

/** Marks a storey height typed in the review: its evidence stays assumed, so this is how a home type knows to keep it. */
export const TYPED_STOREY_EXTRACTOR = "consumer-review-typed-1";

export function reviewHomeTypeHeights(id: ReviewHomeTypeId): ReviewHomeTypeHeights {
  const type = REVIEW_HOME_TYPES.find((entry) => entry.id === id) ?? REVIEW_HOME_TYPES[0];
  const ceiling = homeCeilingHeight(type.home);
  return { wallMm: ceiling.heightMm, storeyMm: storeyHeightForWallMm(ceiling.heightMm), rule: ceiling.rule, label: type.label };
}

/** A wall height a home type can give: the server keeps such a height "assumed" when the review changes it. */
export function isHomeTypeWallHeightMm(valueMm: number) {
  return (Object.values(HOME_CEILING_HEIGHTS_MM) as number[]).includes(valueMm);
}

/** The choice the review starts on: the home type whose walls the floor's assumed walls are (2.6 m reads "Not sure"). */
export function reviewHomeTypeFor(floor: FloorPlanFloorV2 | undefined): ReviewHomeTypeId {
  const wall = floor?.defaults.wallHeight;
  if (!wall || wall.evidence !== "assumed") return "unknown";
  return REVIEW_HOME_TYPES.find((type) => reviewHomeTypeHeights(type.id).wallMm === wall.valueMm)?.id ?? "unknown";
}

export function storeyTypedAtReview(floor: FloorPlanFloorV2) {
  return Boolean(floor.verticalEvidence?.storeyHeight.provenance.evidence.some(
    (entry) => entry.extractorVersion === TYPED_STOREY_EXTRACTOR));
}

function reviewProvenance(
  previous: FloorPlanEntityProvenanceV2 | undefined, sourceId: string, extractorVersion: string, note: string
): FloorPlanEntityProvenanceV2 {
  const first = previous?.evidence[0];
  return {
    confidence: 0,
    extractionVersion: previous?.extractionVersion ?? "consumer-review-1",
    evidence: [{ sourceId: first?.sourceId ?? sourceId, basis: "inferred", confidence: 0, extractorVersion,
      ...(first?.pageNumber ? { pageNumber: first.pageNumber } : {}), note }],
    reviewHistory: previous?.reviewHistory ?? [],
  };
}

/** A storey height typed in the review, marked so a later home type (after a save or a resume too) keeps it. */
export function markStoreyTypedAtReview(document: FloorPlanDocumentV2, floor: FloorPlanFloorV2) {
  const vertical = floor.verticalEvidence;
  const source = document.sources[0];
  if (!vertical || vertical.storeyHeight.evidence !== "assumed" || !source) return;
  vertical.storeyHeight = { evidence: "assumed", provenance: reviewProvenance(vertical.storeyHeight.provenance,
    source.id, TYPED_STOREY_EXTRACTOR, "Typed at review; not yet confirmed.") };
}

export type ReviewHomeTypeResult = {
  document: FloorPlanDocumentV2;
  /** A wall or storey height the home type left as it was: the plan states it, or the person set it. */
  kept: Array<"wall" | "storey">;
  /** The home type's walls would be lower than an opening on the plan, so nothing changed. */
  refused?: boolean;
  /** A storey height that stays (typed, confirmed or stated) is now lower than the walls plus 200 mm. */
  storeyBelowWalls?: boolean;
};

/**
 * The document with the floor's wall and storey heights set by the home type. Only a height still assumed changes; a
 * storey height typed in this review (its evidence stays assumed while only its number changes) is kept too. A storey
 * that changes stands 200 mm over the floor's walls, kept or not.
 */
export function applyReviewHomeType(
  document: FloorPlanDocumentV2,
  input: { floorId: string; homeType: ReviewHomeTypeId; storeyTyped: boolean }
): ReviewHomeTypeResult {
  const heights = reviewHomeTypeHeights(input.homeType);
  const next = structuredClone(document);
  const floor = next.floors.find((entry) => entry.id === input.floorId);
  const sourceId = document.sources[0]?.id;
  if (!floor || !sourceId) return { document, kept: [] };
  const note = `Home type chosen at review: ${heights.label}. The rule for ${heights.rule}; not source-verified.`;
  const kept: ReviewHomeTypeResult["kept"] = [];
  const wall = floor.defaults.wallHeight;
  if (wall.evidence === "assumed") {
    floor.defaults.wallHeight = { valueMm: heights.wallMm, evidence: "assumed",
      provenance: reviewProvenance(wall.provenance, sourceId, "consumer-review-home-type-1", note) };
    raiseStructuresWithWalls(floor, wall.valueMm, heights.wallMm);
  } else kept.push("wall");
  const storey = floor.verticalEvidence?.storeyHeight;
  if ((storey?.evidence ?? "assumed") === "assumed" && !input.storeyTyped && !storeyTypedAtReview(floor)) {
    floor.storeyHeightMm = storeyHeightForWallMm(floor.defaults.wallHeight.valueMm);
    if (floor.verticalEvidence) floor.verticalEvidence.storeyHeight = { evidence: "assumed",
      provenance: reviewProvenance(storey?.provenance, sourceId, "consumer-review-home-type-1", note) };
  } else kept.push("storey");
  // A plan whose door or window stands higher than these walls stays as it is: the walls can't be lower than it.
  const errors = (plan: FloorPlanDocumentV2) => validateFloorPlanDocumentV2(plan).filter((issue) => issue.severity === "error").length;
  if (errors(next) > errors(document)) {
    return { document, kept: [], refused: true };
  }
  const storeyBelowWalls = kept.includes("storey") && floor.storeyHeightMm < storeyHeightForWallMm(floor.defaults.wallHeight.valueMm);
  return { document: next, kept, ...(storeyBelowWalls ? { storeyBelowWalls } : {}) };
}

/** Assumed floor-standing structures as tall as the old walls (a core, a ledge, a column) follow the walls. */
function raiseStructuresWithWalls(floor: FloorPlanFloorV2, fromMm: number, toMm: number) {
  for (const structure of floor.structures) {
    if ((structure.heightEvidence ?? "assumed") === "assumed" && structure.baseOffsetMm === 0 && structure.heightMm === fromMm) {
      structure.heightMm = toMm;
    }
  }
}
