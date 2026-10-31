import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  REVIEW_HOME_TYPES,
  applyReviewHomeType,
  isHomeTypeWallHeightMm,
  reviewHomeTypeHeights,
} from "@/lib/floor-plan-imports/review-home-type";
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
assert.equal(keptWall.document.floors[0].storeyHeightMm, 3200);

// 4. A storey height typed in this review keeps its assumed evidence, so the review says so and it is kept.
const typed = plan();
typed.floors[0].storeyHeightMm = 2900;
const keptStorey = applyReviewHomeType(typed, { floorId, homeType: "condo_penthouse", storeyTyped: true });
assert.deepEqual(keptStorey.kept, ["storey"]);
assert.equal(keptStorey.document.floors[0].storeyHeightMm, 2900);
assert.equal(keptStorey.document.floors[0].defaults.wallHeight.valueMm, 3200);

// 5. Heights the plan states are kept.
const stated = plan();
stated.floors[0].defaults.wallHeight = { ...stated.floors[0].defaults.wallHeight, evidence: "source_documented" };
const statedFloor = stated.floors[0];
if (statedFloor.verticalEvidence) statedFloor.verticalEvidence.storeyHeight = { ...statedFloor.verticalEvidence.storeyHeight, evidence: "source_documented" };
assert.deepEqual(applyReviewHomeType(stated, { floorId, homeType: "condo", storeyTyped: false }).kept, ["wall", "storey"]);
assert.deepEqual(applyReviewHomeType(plan(), { floorId: "no-such-floor", homeType: "condo", storeyTyped: false }).kept, []);

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

console.log("Floor-plan review home type checks passed: 6 home types, kept heights, the server's assumed walls.");
