import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { HOUSE_ROOM_TYPES, ROOM_TYPE_LABELS, type HousePlanRoom2D } from "../lib/design-page-house-plan";
import { buildFloorPlanQualityReport } from "../lib/floor-plan-quality";
import {
  buildSurfaceSuitabilityIssues,
  getSlipClassNumber,
  withSurfaceSuitabilityIssues,
} from "../lib/floor-plan-surface-checks";
import type { RoomSurfaceFinishes, RoomType } from "../lib/room-types";
import { SURFACE_MATERIAL_RENDER_REGISTRY, getRuntimeSurfaceMaterialById } from "../lib/surface-material-runtime";
import { decodeSurfaceSuitability, encodeSurfaceSuitability } from "../lib/surface-material-suitability";
import { buildSurfaceSuitabilityFacts } from "../lib/surface-material-suitability-source";
import { getAllSurfaceMaterialYamlEntries } from "../lib/surface-material-yaml";
import { getLaminateWallPanelSourceEntries } from "../lib/surface-material-sources";

// Plan review's surface checks (J, 17 Oct 2026: "Build all five"; 25 Oct: "Warn on bathroom walls"), and the balcony
// room type they need.
const LUCE_R9 = "gardenia-flooring-luce-acciaio-0006083-120x120-nat";
const HERMIONE_BAREFOOT_A = "gardenia-flooring-hermione-beige-0202265-20x120-nat";
const CAMOUFLAGE_R10_B = "gardenia-flooring-camouflage-ecru-beton-0016235-120x280-nat";
const ANIMA_NO_SETTLED_CLASS = "gardenia-flooring-anima-beige-0006056-60x60-196221-0";
const ANIMA_OUTDOOR_R11 = "gardenia-flooring-anima-beige-0006354-60x120-r11";
const GIOIA_WHITE_BODY_WALL = "gardenia-wall-tile-gioia-beige-pf60008230-60x120-90227-0";
const ANIMA_PORCELAIN_WALL = "gardenia-wall-tile-anima-beige-0006044-120x120-196214-0";
const NORDIC_ACACIA_LAMINATE = "greenlam-woodgrains-5394";

function room(id: string, roomType: RoomType, surfaces?: RoomSurfaceFinishes): HousePlanRoom2D {
  return { id, name: ROOM_TYPE_LABELS[roomType], roomType, shape: "rectangle", x: 0, z: 0, w: 3, d: 2, surfaces };
}
const ids = (rooms: HousePlanRoom2D[]) => buildSurfaceSuitabilityIssues(rooms).map((issue) => issue.id);
const only = (rooms: HousePlanRoom2D[]) => {
  const issues = buildSurfaceSuitabilityIssues(rooms);
  assert.equal(issues.length, 1, JSON.stringify(issues.map((issue) => issue.id)));
  return issues[0];
};

// The facts the checks read come from the render data, built by the generator from the YAML and ABK's sheets.
for (const id of [LUCE_R9, HERMIONE_BAREFOOT_A, CAMOUFLAGE_R10_B, ANIMA_NO_SETTLED_CLASS, ANIMA_OUTDOOR_R11, GIOIA_WHITE_BODY_WALL]) {
  const material = getRuntimeSurfaceMaterialById(id);
  assert.ok(material?.suitability, `${id}: in the render data with its tile facts`);
  assert.equal(material?.import_governance.publish_status, "published", `${id}: published`);
}
assert.deepEqual(getRuntimeSurfaceMaterialById(LUCE_R9)?.suitability, {
  slip_rating: "R9", barefoot_slip_rating: null, datasheet: "Luce", outdoor_floor: false, wall_tile_body: false,
  laminate_sheet: false,
});
assert.deepEqual(getRuntimeSurfaceMaterialById(GIOIA_WHITE_BODY_WALL)?.suitability, {
  slip_rating: null, barefoot_slip_rating: null, datasheet: "Gioia", outdoor_floor: false, wall_tile_body: true,
  laminate_sheet: false,
});
assert.deepEqual(getRuntimeSurfaceMaterialById(NORDIC_ACACIA_LAMINATE)?.suitability, {
  slip_rating: null, barefoot_slip_rating: null, datasheet: null, outdoor_floor: false, wall_tile_body: false,
  laminate_sheet: true,
});
const yamlEntries = getAllSurfaceMaterialYamlEntries();
const laminatePanels = getLaminateWallPanelSourceEntries();
for (const entry of [...yamlEntries, ...laminatePanels]) {
  const id = entry.surface_material.material_id;
  const runtime = getRuntimeSurfaceMaterialById(id)?.suitability ?? null;
  const tuple = encodeSurfaceSuitability(buildSurfaceSuitabilityFacts(entry));
  assert.deepEqual(runtime, tuple ? decodeSurfaceSuitability(tuple) : null, `${id}: the render data has the generator's facts`);
}
const published = SURFACE_MATERIAL_RENDER_REGISTRY.filter((material) => material.import_governance.publish_status === "published");
const facts = published.flatMap((material) => (material.suitability ? [{ material, facts: material.suitability }] : []));
const floors = facts.filter(({ material }) => material.surface_material.surface_category === "flooring");
assert.deepEqual(
  {
    r9Floors: floors.filter(({ facts: f }) => getSlipClassNumber(f.slip_rating) === 9).length,
    barefootWithoutB: floors.filter(({ facts: f }) => f.barefoot_slip_rating && !f.barefoot_slip_rating.split("+").includes("B")).length,
    noSettledClass: floors.filter(({ facts: f }) => f.datasheet && !f.slip_rating && !f.barefoot_slip_rating).length,
    outdoorFloors: floors.filter(({ facts: f }) => f.outdoor_floor).length,
    whiteBodyFloors: floors.filter(({ facts: f }) => f.wall_tile_body).length,
    whiteBodyWalls: facts.filter(({ material, facts: f }) => material.surface_material.surface_category !== "flooring" && f.wall_tile_body).length,
    laminateSheets: facts.filter(({ facts: f }) => f.laminate_sheet).length,
  },
  { r9Floors: 14, barefootWithoutB: 23, noSettledClass: 87, outdoorFloors: 106, whiteBodyFloors: 0, whiteBodyWalls: 9, laminateSheets: 372 },
  "published entries the checks can flag (Gioia's floors are its porcelain decors; its white-body plain colours are wall tiles)"
);
assert.equal(laminatePanels.length, 372);
assert.ok(
  facts.every(({ material, facts: f }) => !f.laminate_sheet || material.surface_material.surface_category === "wall_panel"),
  "only the laminate catalogue's wall panels are laminate sheets: Goodrich's laminate floors aren't"
);
assert.equal(getSlipClassNumber("DS / R10"), 10, "a slip rating with a prefix still reads as its class");
assert.equal(getSlipClassNumber(null), null);

// 1. A bathroom floor that is R9.
const r9 = only([room("bath", "toilet", { floorMaterialId: LUCE_R9 })]);
assert.equal(r9.id, "surface-slip-bath");
assert.equal(r9.title, "Bathroom: the floor is R9");
assert.match(r9.detail, /^Gardenia Luce Acciaio 120x120 Nat is R9 \(DIN 51130\) on ABK's Luce sheet\. .*R10 \(ASR A1\.5\)/);
assert.deepEqual([r9.category, r9.severity, r9.action, r9.target], ["surfaces", "tip", "review_surface", { roomId: "bath" }]);
// 2. A bathroom floor whose barefoot class has no B, or whose sheet doesn't settle a slip class.
const barefoot = only([room("bath", "toilet", { floor: { materialId: HERMIONE_BAREFOOT_A } })]);
assert.equal(barefoot.id, "surface-barefoot-bath", "the floor's id is read from floor.materialId too");
assert.match(barefoot.detail, /barefoot class A \(DIN 51097\) on ABK's Hermione sheet\. Shower areas need barefoot class B \(DGUV 207-006\)/);
assert.deepEqual(ids([room("bath", "toilet", { floorMaterialId: CAMOUFLAGE_R10_B })]), [], "R10 and barefoot B: nothing to say");
const unknown = only([room("bath", "toilet", { floorMaterialId: ANIMA_NO_SETTLED_CLASS })]);
assert.equal(unknown.id, "surface-slip-unknown-bath");
assert.equal(unknown.detail, "ABK's Anima sheet doesn't settle one slip class for Gardenia Anima Beige 60x60.");
assert.deepEqual(ids([room("bath", "toilet", { floorMaterialId: "light_stone_tile" })]), [], "no facts, no guess");
assert.deepEqual(ids([room("bath", "toilet")]), [], "the starter floor has no facts either");
assert.deepEqual(ids([room("living", "living", { floorMaterialId: LUCE_R9 })]), [], "R9 is fine outside a bathroom");
// 3. A floor ABK's sheet calls a white-body wall tile (no floor entry is one today, so a stored wall tile id stands in).
const wallTileFloor = only([room("living", "living", { floorMaterialId: GIOIA_WHITE_BODY_WALL })]);
assert.equal(wallTileFloor.id, "surface-wall-tile-floor-living");
assert.match(wallTileFloor.detail, /^ABK's Gioia sheet makes Gardenia Gioia Beige 60x120 a white-body wall tile \(EN 14411 group BIII, water absorption over 10%\)\.$/);
// 4. A balcony floor that isn't in ABK's outdoor range.
assert.deepEqual(ids([room("out", "balcony", { floorMaterialId: ANIMA_OUTDOOR_R11 })]), [], "ABK's outdoor range");
const indoorTile = only([room("out", "balcony", { floorMaterialId: HERMIONE_BAREFOOT_A })]);
assert.equal(indoorTile.id, "surface-outdoor-floor-out");
assert.equal(indoorTile.title, "Balcony: not an outdoor floor");
assert.match(indoorTile.detail, /^Gardenia Hermione Beige 20x120 Nat isn't in ABK's outdoor range \(it is R10\)\. Outdoor paths need R11 \(ASR A1\.5\)/);
assert.match(only([room("out", "balcony")]).detail, /^This floor isn't one of ABK's outdoor tiles\./, "a new balcony's starter floor");
// 5. Balcony walls in a white-body wall tile, set for the room or for one face.
const outdoorWall = buildSurfaceSuitabilityIssues([
  room("out", "balcony", { floorMaterialId: ANIMA_OUTDOOR_R11, walls: { default: { materialId: GIOIA_WHITE_BODY_WALL } } }),
]);
assert.deepEqual(outdoorWall.map((issue) => issue.id), ["surface-outdoor-wall-out"]);
assert.match(outdoorWall[0].detail, /over 10% water absorption, not for outdoor walls/);
assert.deepEqual(
  ids([room("out", "balcony", {
    floorMaterialId: ANIMA_OUTDOOR_R11,
    walls: { default: { materialId: ANIMA_PORCELAIN_WALL }, faces: { north: { materialId: GIOIA_WHITE_BODY_WALL } } },
  })]),
  ["surface-outdoor-wall-out"],
  "one face is enough"
);
assert.deepEqual(ids([room("bath", "toilet", { floorMaterialId: CAMOUFLAGE_R10_B, wallMaterialId: GIOIA_WHITE_BODY_WALL })]), [], "indoor walls are what Gioia is for");
// 6. Bathroom walls in a laminate sheet (J, 25 Oct 2026: "Warn on bathroom walls"), set for the room, a face or a panel.
const laminateWall = only([room("bath", "toilet", { floorMaterialId: CAMOUFLAGE_R10_B, walls: { default: { materialId: NORDIC_ACACIA_LAMINATE } } })]);
assert.equal(laminateWall.id, "surface-laminate-wall-bath");
assert.equal(laminateWall.title, "Bathroom: laminate panels on the walls");
assert.equal(
  laminateWall.detail,
  "Greenlam Nordic Acacia 5394 is a laminate sheet for dry walls. Greenlam's pasting manual bonds its laminates to a board, " +
    "not to plaster or concrete, and for showers Greenlam makes Shower Surfaces, a 3 mm compact sold as waterproof."
);
assert.equal(laminateWall.suggestedFix, "If this bathroom has a shower, keep the panels to its dry walls and tile the shower walls.");
assert.deepEqual([laminateWall.category, laminateWall.severity, laminateWall.action], ["surfaces", "tip", "review_surface"]);
assert.deepEqual(
  ids([room("bath", "toilet", {
    floorMaterialId: CAMOUFLAGE_R10_B,
    walls: { default: { materialId: ANIMA_PORCELAIN_WALL }, panels: { "north-part-0": { materialId: NORDIC_ACACIA_LAMINATE } } },
  })]),
  ["surface-laminate-wall-bath"],
  "one panel is enough"
);
assert.deepEqual(
  ids([room("bath", "toilet", {
    floorMaterialId: CAMOUFLAGE_R10_B,
    walls: { panels: { "wall-panel:v2:1:bath:north:segment-start:segment-end:exterior": { materialId: NORDIC_ACACIA_LAMINATE } } },
  })]),
  [],
  "a wall's outside face isn't the bathroom's"
);
assert.deepEqual(ids([room("living", "living", { wallMaterialId: NORDIC_ACACIA_LAMINATE })]), [], "dry rooms are what the panels are for");
assert.deepEqual(ids([room("kitchen", "kitchen", { wallMaterialId: NORDIC_ACACIA_LAMINATE })]), [], "the check is the bathroom's");
assert.deepEqual(
  ids([room("bath", "toilet", { floorMaterialId: LUCE_R9, wallMaterialId: NORDIC_ACACIA_LAMINATE })]),
  ["surface-slip-bath", "surface-laminate-wall-bath"],
  "the floor's findings come first"
);

// The report: surface tips come after the plan's own issues and leave the score and label alone.
const rooms = [room("bath", "toilet", { floorMaterialId: LUCE_R9 }), room("out", "balcony")];
const base = buildFloorPlanQualityReport({ rooms, openings: [], items: [] });
const withChecks = withSurfaceSuitabilityIssues(base, rooms);
assert.deepEqual([withChecks.score, withChecks.label, withChecks.categoryScores], [base.score, base.label, base.categoryScores]);
assert.deepEqual(withChecks.issues.slice(0, base.issues.length), base.issues);
assert.deepEqual(withChecks.issues.slice(base.issues.length).map((issue) => issue.id), ["surface-slip-bath", "surface-outdoor-floor-out"]);
const plain = [room("living", "living")];
const plainReport = buildFloorPlanQualityReport({ rooms: plain, openings: [], items: [] });
assert.equal(withSurfaceSuitabilityIssues(plainReport, plain), plainReport, "no surface tips: the same report");

// The balcony room type: offered by the pickers, labelled, and kept across a share.
assert.deepEqual(HOUSE_ROOM_TYPES.map(({ type }) => type), ["living", "bedroom", "kitchen", "toilet", "dining", "balcony", "custom"]);
assert.deepEqual(HOUSE_ROOM_TYPES.find(({ type }) => type === "balcony"), { type: "balcony", label: "Balcony" });
assert.deepEqual(HOUSE_ROOM_TYPES.map(({ label }) => label), HOUSE_ROOM_TYPES.map(({ type }) => ROOM_TYPE_LABELS[type]));
const shareSource = readFileSync(path.join(process.cwd(), "lib", "shared-design-snapshot.ts"), "utf8");
assert.match(shareSource, /const publicRoomTypes = new Set\(\[[^\]]*"balcony"/, "a shared balcony stays a balcony");
assert.match(
  readFileSync(path.join(process.cwd(), "features", "cabinetry", "useDesignPageCabinetry.ts"), "utf8"),
  /roomType: activeRoom\.roomType === "balcony" \? "custom" : activeRoom\.roomType/,
  "cabinetry, which has no balcony templates, treats a balcony as a custom room"
);

// The app reads the facts from the render data; only the generator builds them from ABK's sheets.
function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : productionFiles(entryPath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
}
const sheetImporters = ["app", "components", "features", "lib"]
  .flatMap(productionFiles)
  .filter((file) => /surface-material-(?:suitability-source|abk-datasheet-lookup|abk-datasheets)["']/.test(readFileSync(file, "utf8")))
  .map((file) => path.relative(process.cwd(), file))
  .sort();
assert.deepEqual(
  sheetImporters,
  ["lib/surface-material-abk-datasheet-lookup.ts", "lib/surface-material-suitability-source.ts"],
  "no app code imports ABK's sheets or the facts' builder"
);

console.log("Floor plan surface checks passed.");
