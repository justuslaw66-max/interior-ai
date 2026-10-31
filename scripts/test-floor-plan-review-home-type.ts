import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  REVIEW_HOME_TYPES,
  applyReviewHomeType,
  isHomeTypeWallHeightMm,
  markStoreyTypedAtReview,
  reviewHomeTypeFor,
  reviewHomeTypeHeights,
  storeyTypedAtReview,
} from "@/lib/floor-plan-imports/review-home-type";
import { validateFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import { applyConsumerFloorPlanCorrection } from "@/lib/floor-plan-imports/review";
import { loadPingYiCourtV2ReviewSeedBundle } from "@/lib/floor-plan-seeds/ping-yi-court-review-intake";

// The upload review's home type (J, 31 Oct 2026: asked on the review step, visible; a height the person typed or
// confirmed is kept).

// 1. Each home type's heights: the height rules' walls, the storey 200 mm more.
assert.deepEqual(
  REVIEW_HOME_TYPES.map((type) => [type.label, reviewHomeTypeHeights(type.id).wallMm, reviewHomeTypeHeights(type.id).storeyMm]),
  [
    ["Not sure", 2600, 2800],
    ["HDB flat", 2600, 2800],
    ["HDB top floor", 2750, 2950],
    ["Condo", 2800, 3000],
    ["Condo penthouse", 3200, 3400],
    ["Landed", 3000, 3200],
  ]
);
assert.ok([2600, 2750, 2800, 3000, 3200].every(isHomeTypeWallHeightMm));
assert.ok(![2400, 2700, 3100].some(isHomeTypeWallHeightMm));

// A plan as an upload brings it: walls and storey assumed (Ping Yi Court's 2.6 m / 2.8 m, its review seed).
const seed = loadPingYiCourtV2ReviewSeedBundle().fixtures[0].document;
const plan = (): FloorPlanDocumentV2 => {
  const document = structuredClone(seed);
  document.verification = { tier: "needs_review", criticalIssueIds: [] };
  if (!document.sources[0].sha256) document.sources[0].sha256 = "a".repeat(64);
  return document;
};
const floorId = seed.floors[0].id;
assert.equal(seed.floors[0].defaults.wallHeight.evidence, "assumed");
assert.equal(seed.floors[0].verticalEvidence?.storeyHeight.evidence, "assumed");

// 2. A condo: both heights set, still assumed, with the rule named; the document given is left as it was.
const original = plan();
const before = JSON.stringify(original);
const condo = applyReviewHomeType(original, { floorId, homeType: "condo", storeyTyped: false });
assert.equal(JSON.stringify(original), before);
assert.deepEqual(condo.kept, []);
const condoFloor = condo.document.floors[0];
assert.equal(condoFloor.defaults.wallHeight.valueMm, 2800);
assert.equal(condoFloor.defaults.wallHeight.evidence, "assumed");
assert.equal(condoFloor.storeyHeightMm, 3000);
assert.equal(condoFloor.verticalEvidence?.storeyHeight.evidence, "assumed");
assert.match(condoFloor.defaults.wallHeight.provenance.evidence[0].note ?? "", /Home type chosen at review: Condo\. The rule for a condo: about 2\.8 m/);
assert.match(condoFloor.verticalEvidence?.storeyHeight.provenance.evidence[0].note ?? "", /Condo/);
// Door and window heights don't depend on the home type.
assert.deepEqual(condoFloor.defaults.doorHeight, original.floors[0].defaults.doorHeight);
assert.deepEqual(condoFloor.defaults.windowSillHeight, original.floors[0].defaults.windowSillHeight);
// Back to "Not sure": 2.6 m / 2.8 m again.
const unsure = applyReviewHomeType(condo.document, { floorId, homeType: "unknown", storeyTyped: false }).document.floors[0];
assert.deepEqual([unsure.defaults.wallHeight.valueMm, unsure.storeyHeightMm], [2600, 2800]);

// 3. A wall height the person confirmed (or typed: typing confirms it) is kept; the storey still follows.
const confirmed = plan();
confirmed.floors[0].defaults.wallHeight = { ...confirmed.floors[0].defaults.wallHeight, valueMm: 2700, evidence: "user_confirmed" };
const keptWall = applyReviewHomeType(confirmed, { floorId, homeType: "landed", storeyTyped: false });
assert.deepEqual(keptWall.kept, ["wall"]);
assert.equal(keptWall.document.floors[0].defaults.wallHeight.valueMm, 2700);
assert.equal(keptWall.document.floors[0].storeyHeightMm, 2900, "the storey stands 200 mm over the walls that stay");
const confirmedHigh = plan();
confirmedHigh.floors[0].defaults.wallHeight = { ...confirmedHigh.floors[0].defaults.wallHeight, valueMm: 3000, evidence: "user_confirmed" };
assert.equal(applyReviewHomeType(confirmedHigh, { floorId, homeType: "hdb", storeyTyped: false }).document.floors[0].storeyHeightMm, 3200,
  "an HDB flat's rule doesn't put the storey under 3 m walls the person confirmed");

// 4. A storey height typed in this review keeps its assumed evidence, so the review says so and it is kept.
const typed = plan();
typed.floors[0].storeyHeightMm = 2900;
const keptStorey = applyReviewHomeType(typed, { floorId, homeType: "condo_penthouse", storeyTyped: true });
assert.deepEqual(keptStorey.kept, ["storey"]);
assert.equal(keptStorey.document.floors[0].storeyHeightMm, 2900);
assert.equal(keptStorey.document.floors[0].defaults.wallHeight.valueMm, 3200);
assert.equal(keptStorey.storeyBelowWalls, true, "the review says the kept 2.9 m storey is now under 3.2 m walls + 0.2 m");
assert.equal(condo.storeyBelowWalls, undefined);

// 4a. Assumed floor-standing structures as tall as the walls (Ping Yi Court's core and ledge) follow them.
const structures = original.floors[0].structures;
assert.ok(structures.length > 0 && structures.some((structure) => structure.heightMm === 2600));
const landed = applyReviewHomeType(original, { floorId, homeType: "landed", storeyTyped: false }).document.floors[0].structures;
assert.ok(landed.some((structure) => structure.heightMm === 3000), "at least one structure follows");
structures.forEach((structure, index) => {
  const follows = (structure.heightEvidence ?? "assumed") === "assumed" && structure.baseOffsetMm === 0 && structure.heightMm === 2600;
  assert.equal(landed[index].heightMm, follows ? 3000 : structure.heightMm, `${structure.name}: follows the walls only when assumed, on the floor, at their height`);
});

// 4b. The typing is recorded in the document, so it holds after a draft save or a resume (the review's state is new then).
const marked = plan();
marked.floors[0].storeyHeightMm = 2900;
markStoreyTypedAtReview(marked, marked.floors[0]);
assert.ok(storeyTypedAtReview(marked.floors[0]));
assert.equal(marked.floors[0].verticalEvidence?.storeyHeight.evidence, "assumed");
assert.deepEqual(applyReviewHomeType(marked, { floorId, homeType: "condo", storeyTyped: false }).kept, ["storey"]);

// 5. Heights the plan states are kept.
const stated = plan();
stated.floors[0].defaults.wallHeight = { ...stated.floors[0].defaults.wallHeight, evidence: "source_documented" };
const statedFloor = stated.floors[0];
if (statedFloor.verticalEvidence) statedFloor.verticalEvidence.storeyHeight = { ...statedFloor.verticalEvidence.storeyHeight, evidence: "source_documented" };
assert.deepEqual(applyReviewHomeType(stated, { floorId, homeType: "condo", storeyTyped: false }).kept, ["wall", "storey"]);
assert.deepEqual(applyReviewHomeType(plan(), { floorId: "no-such-floor", homeType: "condo", storeyTyped: false }).kept, []);

// 5b. What it writes is a valid plan: real source ids, also where a height's provenance had no evidence, or the floor
// had no level evidence at all.
const issues = (document: FloorPlanDocumentV2) => validateFloorPlanDocumentV2(document).filter((issue) => issue.severity === "error");
assert.deepEqual(issues(condo.document), issues(original));
const bare = plan();
const bareFloor = bare.floors[0];
if (bareFloor.verticalEvidence) bareFloor.verticalEvidence.storeyHeight.provenance.evidence = [];
bareFloor.defaults.wallHeight.provenance.evidence = [];
const bareCondo = applyReviewHomeType(bare, { floorId, homeType: "condo", storeyTyped: false }).document;
assert.equal(bareCondo.floors[0].defaults.wallHeight.provenance.evidence[0].sourceId, bare.sources[0].id);
assert.equal(bareCondo.floors[0].verticalEvidence?.storeyHeight.provenance.evidence[0].sourceId, bare.sources[0].id);
assert.equal(issues(bareCondo).filter((issue) => issue.code === "UNKNOWN_SOURCE").length, 0);
const levelless = plan();
delete levelless.floors[0].verticalEvidence;
const levellessCondo = applyReviewHomeType(levelless, { floorId, homeType: "condo", storeyTyped: false });
assert.deepEqual([levellessCondo.document.floors[0].storeyHeightMm, levellessCondo.document.floors[0].verticalEvidence], [3000, undefined]);
// A door standing higher than the home type's walls: nothing changes.
const tall = plan();
const tallFloor = tall.floors[0];
tallFloor.defaults.wallHeight = { ...tallFloor.defaults.wallHeight, valueMm: 3000 };
tallFloor.openings[0] = { ...tallFloor.openings[0], heightMm: 2700, sillHeightMm: 0 };
assert.deepEqual(issues(tall).filter((issue) => issue.code === "OPENING_ABOVE_WALL"), []);
const refused = applyReviewHomeType(tall, { floorId, homeType: "hdb", storeyTyped: false });
assert.equal(refused.refused, true);
assert.equal(refused.document, tall);
// The review starts on the home type the floor's assumed walls are.
assert.equal(reviewHomeTypeFor(original.floors[0]), "unknown");
assert.equal(reviewHomeTypeFor(condo.document.floors[0]), "condo");
assert.equal(reviewHomeTypeFor(confirmedHigh.floors[0]), "unknown");

// 6. The server keeps a home type's wall height assumed, with its own note; any other changed value is the person's.
const submit = (current: FloorPlanDocumentV2, next: FloorPlanDocumentV2) =>
  applyConsumerFloorPlanCorrection({ current, next, currentIssues: [], submittedIssues: [], sourceId: current.sources[0].id,
    sourceSha256: current.sources[0].sha256 ?? "", userId: "reviewer", note: "Home type test", at: "2026-10-31T08:00:00.000Z" }).document.floors[0];
const reviewed = submit(original, condo.document);
assert.equal(reviewed.defaults.wallHeight.valueMm, 2800);
assert.equal(reviewed.defaults.wallHeight.evidence, "assumed");
assert.equal(reviewed.defaults.wallHeight.provenance.evidence[0].basis, "inferred");
assert.match(reviewed.defaults.wallHeight.provenance.evidence[0].note ?? "", /home type chosen at review: 2800 mm; not source-verified/);
assert.equal(reviewed.storeyHeightMm, 3000);
const claimed = structuredClone(original);
claimed.floors[0].defaults.wallHeight = { ...claimed.floors[0].defaults.wallHeight, valueMm: 2700 };
assert.equal(submit(original, claimed).defaults.wallHeight.evidence, "user_confirmed", "2.7 m is no home type's: the person's value");
assert.equal(reviewed.verticalEvidence?.storeyHeight.evidence, "assumed");
// A typed storey's mark survives the save, so the next home type keeps it.
const savedTyped = submit(original, marked);
assert.ok(storeyTypedAtReview(savedTyped));
// A storey the client says the plan states, when it didn't, is the person's.
const forged = plan();
const forgedFloor = forged.floors[0];
forgedFloor.storeyHeightMm = 3400;
if (forgedFloor.verticalEvidence) forgedFloor.verticalEvidence.storeyHeight = { ...forgedFloor.verticalEvidence.storeyHeight, evidence: "source_documented" };
assert.equal(submit(original, forged).verticalEvidence?.storeyHeight.evidence, "user_confirmed");
const stating = plan();
if (stating.floors[0].verticalEvidence) stating.floors[0].verticalEvidence.storeyHeight.evidence = "source_documented";
assert.equal(submit(stating, structuredClone(stating)).verticalEvidence?.storeyHeight.evidence, "source_documented",
  "a height the plan stated stays the plan's");
const restated = structuredClone(stating);
const restatedEvidence = restated.floors[0].verticalEvidence?.storeyHeight.provenance.evidence[0];
assert.ok(restatedEvidence);
restatedEvidence.extractorVersion = "forged";
assert.deepEqual(submit(stating, restated).verticalEvidence?.storeyHeight, stating.floors[0].verticalEvidence?.storeyHeight,
  "with the server's own provenance, not the client's");
const untouched = submit(original, plan());
assert.deepEqual(untouched.defaults.wallHeight, original.floors[0].defaults.wallHeight);

// 7. The review shows it above the plan's details, from the heights hook called before the panel's early return.
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const panel = read("components/editor/floor-plan-import-review/FloorPlanImportReviewPanel.tsx");
const field = read("components/editor/floor-plan-import-review/FloorPlanReviewHomeType.tsx");
assert.match(panel, /useFloorPlanReviewHeights\(candidate, setCandidate\);[\s\S]*?if \(!floor\) return null;/);
assert.match(panel, /<FloorPlanReviewHomeType[\s\S]*?Optional plan details/);
assert.match(field, /Home type[\s\S]*?REVIEW_HOME_TYPES\.map/);
assert.match(field, /data-testid="floor-plan-import-home-type"/);
assert.match(field, /role="status" aria-live="polite"/);
assert.match(field, /toFixed\(3\)/, "heights to the millimetre");

console.log("Floor-plan review home type checks passed: 6 home types, kept heights, the server's assumed walls.");
