import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CondoMapDataError,
  condoMapFileUrl,
  parseCondoDevelopmentMap,
  parseCondoMapIndex,
  type CondoDevelopmentMap,
} from "@/lib/condo-map/condo-map-data";
import { outerRings, pointInRing, ringsMeet } from "@/lib/condo-map/condo-map-geometry";
import { condoMapFilePath, isGitLfsPointer } from "@/lib/condo-map/condo-map-paths";
import { mapboxPublicToken } from "@/lib/condo-map/mapbox-token";
import { condoLayers, condoModelSlug, condoModels, condoPickTarget, condoSources, condoViewUpdates } from "@/app/admin/condo-map/condo-map-layers";
import { loadError, mapProblem } from "@/app/admin/condo-map/condo-map-mapbox";
import {
  NO_CONDO_VIEW,
  chooseDevelopment,
  chooseFloor,
  chooseUnit,
  condoMapCredits,
  floorName,
  unitArea,
  unitFloorName,
  unitLayout,
  unitStoreys,
  unitsOnFloor,
  type CondoMapView,
} from "@/app/admin/condo-map/condo-map-view";
import type { MapboxJson } from "@/app/admin/condo-map/mapbox-gl-types";

/**
 * The admin condo map (catalog/condo-map, /admin/condo-map): its exported data reads and is whole, its data route
 * serves only its own files, its token is a public one, and its Mapbox filters show what each view promises. The
 * filters are run here with a small evaluator of the expressions they use, against the real features.
 */
const root = process.cwd();
const dataRoot = path.join(root, "catalog", "condo-map");
const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(path.join(dataRoot, file), "utf8"));

// ---------- the data
const index = parseCondoMapIndex(readJson("index.json"));
// the masters' ten but 12 On Shan, which is serviced apartments now (its development.json: directory.listed false)
assert.equal(index.length, 9, "the developments of the floor-plan masters on the directory");
assert.ok(!index.some((summary) => summary.slug === "12-on-shan"), "12 On Shan is off the map");
const maps: Record<string, CondoDevelopmentMap> = {};
for (const summary of index) {
  const dev = parseCondoDevelopmentMap(readJson(`${summary.slug}/map.json`), `${summary.slug}/map.json`);
  maps[dev.slug] = dev;
  assert.equal(dev.slug, summary.slug);
  assert.equal(dev.units.length, summary.units, `${dev.slug}: the index counts its units`);
  assert.equal(Boolean(dev.models), summary.detailed, `${dev.slug}: the index says whether it has models`);
  assert.ok(dev.massing.features.length > 0 && dev.unitParts.features.length > 0, `${dev.slug}: something to draw`);
  assert.ok(dev.clip.length > 0, `${dev.slug}: an outline that clears Mapbox's buildings off the site`);
  assert.ok(dev.credits.length > 0, `${dev.slug}: its sources are credited`);
  const units = new Set(dev.units.map((unit) => unit.unit));
  assert.equal(units.size, dev.units.length, `${dev.slug}: unit numbers are unique`);
  for (const part of dev.unitParts.features) assert.ok(units.has(part.properties.unit), `${dev.slug}: ${part.properties.unit} has a card`);
  for (const unit of dev.units) {
    assert.ok(dev.unitFloors.includes(unit.floor), `${dev.slug} ${unit.unit}: its floor is offered`);
    for (const storey of unitStoreys(unit)) {
      // a two-level unit is there on each of its storeys: to click, and painted when that storey is chosen
      assert.ok(dev.unitParts.features.some((part) => part.properties.unit === unit.unit && part.properties.f === storey), `${dev.slug} ${unit.unit}: clickable on ${storey}`);
      assert.ok(dev.floors.features.some((part) => part.properties.unit === unit.unit && part.properties.f === storey), `${dev.slug} ${unit.unit}: painted on ${storey}`);
    }
    // the card's m² and sq ft measure the same thing (the attic void in both, or in neither): within the m²'s rounding
    if (unit.areaSqm !== null && unit.areaSqft !== null) {
      const m2 = unit.areaSqm + (unit.areaSqftWithVoid ? unit.atticVoidSqm ?? 0 : 0);
      assert.ok(Math.abs(unit.areaSqft * 0.09290304 - m2) <= Math.max(0.51, 0.005 * m2), `${dev.slug} ${unit.unit}: ${unit.areaSqft} sq ft for ${m2} m²`);
    }
    if (unit.plan) assert.ok(fs.existsSync(path.join(dataRoot, dev.slug, "plans", unit.plan)), `${dev.slug} ${unit.unit}: plan ${unit.plan}`);
  }
  for (const item of dev.models?.items ?? []) {
    const file = path.join(dataRoot, dev.slug, "models", item.file);
    assert.ok(fs.existsSync(file), `${dev.slug}: model ${item.file}`);
    const head = fs.readFileSync(file).subarray(0, 4).toString("latin1");
    // a checkout without Git LFS has the pointer file instead of the model
    assert.ok(head === "glTF" || head === "vers", `${dev.slug}: ${item.file} is a GLB (or its LFS pointer)`);
  }
}
// the framing takes in the whole building (a ground storey's blocks too), not just the units
for (const dev of Object.values(maps)) {
  const [[w, s], [e, n]] = dev.bounds;
  const inside = ([lon, lat]: readonly [number, number]) => lon >= w - 1e-7 && lon <= e + 1e-7 && lat >= s - 1e-7 && lat <= n + 1e-7;
  for (const feature of [...dev.massing.features, ...dev.unitParts.features]) {
    assert.ok(feature.geometry.coordinates[0].every(inside), `${dev.slug}: its bounds hold the building`);
  }
}
const lotsCredit = /Contains information from SLA Cadastral Land Parcel accessed on 24 Oct 2026 and 25 Oct 2026 from data\.gov\.sg/;
const credits = condoMapCredits(maps);
assert.ok(credits.some((credit) => lotsCredit.test(credit)), "the land lots' licence credit is shown once, with both days");
assert.equal(credits.filter((credit) => credit.includes("SLA Cadastral Land Parcel")).length, 1, "the lots' credit once");
assert.equal(credits.filter((credit) => credit.includes("OneMap, © Singapore Land Authority")).length, 1, "OneMap's credit once");
// every development placed on its official land lot carries the lots' licence words, whatever day the lots were read
const lotsLicence = /Contains information from SLA Cadastral Land Parcel accessed on \d{1,2} [A-Z][a-z]{2} \d{4} from data\.gov\.sg which is made available under the terms of the Singapore Open Data Licence version 1\.0/;
for (const dev of Object.values(maps).filter((d) => d.placedOn.includes("official land lot"))) {
  assert.ok(dev.credits.some((credit) => lotsLicence.test(credit)), `${dev.slug}: the land lots' licence credit`);
}
assert.ok(Object.values(maps).filter((dev) => dev.placedOn.includes("OneMap")).every((dev) => dev.credits.some((credit) => credit.includes("OneMap, © Singapore Land Authority"))));
const raw1953 = readJson("1953/map.json");
assert.ok(raw1953 && typeof raw1953 === "object");
assert.throws(() => parseCondoDevelopmentMap({ ...raw1953, schema: "other" }), CondoMapDataError);
assert.throws(() => parseCondoMapIndex({ schema: "interior-ai.condo-map.index.v1", developments: [{ slug: "../x" }] }), CondoMapDataError);

// ---------- the data route's files, and the token
assert.deepEqual(condoMapFilePath(["33-residences", "map.json"]), { segments: ["33-residences", "map.json"], contentType: "application/json" });
assert.equal(condoMapFilePath(["33-residences", "models", "c1.glb"])?.contentType, "model/gltf-binary");
assert.equal(condoMapFilePath(["10-evelyn", "plans", "1bedroom1.jpg"])?.contentType, "image/jpeg");
for (const refused of [[], ["..", "map.json"], ["33-residences"], ["33-residences", "index.json"], ["33-residences", "models", "x.json"],
  ["33-residences", "plans", "..jpg"], ["33-residences", "plans", "a/b.jpg"], ["33-residences", "secret", "a.jpg"], ["33-residences", "plans", "a.jpg", "b"]]) {
  assert.equal(condoMapFilePath(refused), null, `refused: ${refused.join("/")}`);
}
for (const folder of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
  assert.equal(condoMapFilePath(["33-residences", folder, "a.glb"]), null, `refused: the folder ${folder} (not Object's own)`);
}
const encode = (text: string) => new TextEncoder().encode(text);
assert.ok(isGitLfsPointer(encode("version https://git-lfs.github.com/spec/v1\noid sha256:cb66\nsize 16664\n")), "an LFS pointer");
assert.ok(!isGitLfsPointer(encode("glTF....")) && !isGitLfsPointer(new Uint8Array(0)), "a GLB, or nothing, is not a pointer");
assert.equal(condoMapFileUrl("10-evelyn", "plans", "a b.jpg"), "/api/admin/condo-map/10-evelyn/plans/a%20b.jpg");
assert.equal(mapboxPublicToken(" pk.abc123.def-456_x "), "pk.abc123.def-456_x");
for (const refused of [undefined, "", "sk.abc.def", "pk.abc", "pk.abc.def ghi", "tk.abc.def"]) assert.equal(mapboxPublicToken(refused), null);

// ---------- the outlines that keep Mapbox's buildings off the sites
const square = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]] as const;
assert.ok(pointInRing([1, 1], square) && !pointInRing([3, 1], square));
assert.ok(ringsMeet(square, [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]), "overlapping");
assert.ok(ringsMeet(square, [[-1, 0.5], [3, 0.5], [3, 1.5], [-1, 1.5], [-1, 0.5]]), "crossing, with no corner inside");
assert.ok(!ringsMeet(square, [[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]), "apart");
assert.equal(outerRings({ type: "MultiPolygon", coordinates: [[square], [square]] }).length, 2);
assert.deepEqual(outerRings({ type: "Point", coordinates: [0, 0] }), []);

// ---------- the layers: one id each, on sources that exist
const ids = new Set<string>();
for (const dev of Object.values(maps)) {
  const sources = new Set(condoSources(dev).map(([id]) => id));
  for (const layer of condoLayers(dev)) {
    assert.ok(!ids.has(layer.id), `layer ${layer.id} is unique`);
    ids.add(layer.id);
    assert.ok(layer.source && sources.has(layer.source), `${layer.id} draws a source it has`);
  }
  assert.equal(condoModels(dev).length, dev.models?.items.length ?? 0);
}

// ---------- the views: a small evaluator of the expressions the filters and colours use
function evaluate(expression: MapboxJson, properties: Readonly<Record<string, unknown>>): unknown {
  if (!Array.isArray(expression)) return expression;
  const [operator, ...args] = expression;
  const value = (index: number) => evaluate(args[index], properties);
  const numbers = () => [Number(value(0)), Number(value(1))];
  switch (operator) {
    case "get": return properties[String(args[0])] ?? null;
    case "all": return args.every((arg) => evaluate(arg, properties) === true);
    case "any": return args.some((arg) => evaluate(arg, properties) === true);
    case "==": return value(0) === value(1);
    case "!=": return value(0) !== value(1);
    case "<": { const [a, b] = numbers(); return a < b; }
    case "<=": { const [a, b] = numbers(); return a <= b; }
    case ">": { const [a, b] = numbers(); return a > b; }
    case ">=": { const [a, b] = numbers(); return a >= b; }
    case "+": return args.reduce<number>((sum, arg) => sum + Number(evaluate(arg, properties)), 0);
    case "case": {
      for (let i = 0; i + 1 < args.length; i += 2) if (evaluate(args[i], properties) === true) return evaluate(args[i + 1], properties);
      return evaluate(args[args.length - 1], properties);
    }
    default: throw new Error(`the evaluator doesn't know ${String(operator)}`);
  }
}

function shown(dev: CondoDevelopmentMap, view: CondoMapView, part: string) {
  const update = condoViewUpdates(dev, view).filters.find(([layerId]) => layerId === `condo-${dev.slug}-${part}`);
  assert.ok(update, `${dev.slug}: the view sets ${part}`);
  const features = { mass: dev.massing, cut: dev.massing, balconies: dev.balconies, floor: dev.floors, unit: dev.unitParts, pick: dev.unitParts, ghost: dev.massing }[part];
  const all = features?.features.map((feature) => feature.properties) ?? (dev.models?.items ?? []);
  return all.filter((properties) => evaluate(update[1], properties) === true);
}

for (const dev of Object.values(maps)) {
  const detailed = Boolean(dev.models);
  const whole: CondoMapView = { slug: dev.slug, floor: null, unit: null };
  assert.equal(shown(dev, whole, "mass").length, detailed ? 0 : dev.massing.features.length, `${dev.slug}: the whole building`);
  assert.equal(shown(dev, whole, "pick").length, dev.unitParts.features.length, `${dev.slug}: every unit can be clicked`);
  assert.equal(shown(dev, whole, "floor").length + shown(dev, whole, "ghost").length, 0);
  const floor = dev.unitFloors[Math.floor(dev.unitFloors.length / 2)];
  const [unit] = unitsOnFloor(dev, floor);
  const chosen = chooseUnit(chooseFloor(whole, floor), maps, { slug: dev.slug, unit: unit.unit });
  assert.deepEqual(chosen, { slug: dev.slug, floor, unit: unit.unit });
  if (!detailed) assert.ok(shown(dev, chosen, "mass").every((properties) => "f" in properties && Number(properties.f) < floor), `${dev.slug}: below the floor`);
  assert.ok(shown(dev, chosen, "ghost").every((properties) => "f" in properties && Number(properties.f) > floor), `${dev.slug}: above it, a ghost`);
  assert.ok(shown(dev, chosen, "floor").length > 0, `${dev.slug}: the floor's rooms are painted`);
  assert.ok(shown(dev, chosen, "unit").length > 0 && shown(dev, chosen, "unit").every((properties) => "unit" in properties && properties.unit === unit.unit));
  const rooms = condoViewUpdates(dev, chosen).paint.find(([layerId, property]) => layerId === `condo-${dev.slug}-floor` && property === "fill-extrusion-color");
  assert.equal(evaluate(rooms?.[2] ?? null, { unit: unit.unit, kind: "room" }), "#f4c9b7", `${dev.slug}: the chosen unit's rooms stand out`);
  const elsewhere = condoViewUpdates(dev, { ...chosen, slug: "another" }).filters;
  assert.deepEqual(elsewhere, condoViewUpdates(dev, NO_CONDO_VIEW).filters, `${dev.slug}: whole while another development is chosen`);
}

const residences = maps["33-residences"];
// its models failed to load (a deployment without LFS answers 404): drawn as massing, the model layer empty
assert.equal(condoModelSlug("https://x.app/api/admin/condo-map/33-residences/models/c1.glb"), "33-residences");
assert.equal(condoModelSlug("https://api.mapbox.com/styles/v1/mapbox/standard"), null);
const fallback = condoViewUpdates(residences, { slug: residences.slug, floor: null, unit: null }, true).filters;
const filterOf = (part: string) => fallback.find(([layerId]) => layerId === `condo-33-residences-${part}`)?.[1];
assert.equal(residences.massing.features.filter((feature) => evaluate(filterOf("mass") ?? null, feature.properties) === true).length, residences.massing.features.length, "33: massing when the models fail");
assert.ok(residences.models?.items.every((item) => evaluate(filterOf("models") ?? null, item) !== true), "33: no models drawn when they failed");
const models = shown(residences, { slug: residences.slug, floor: 5, unit: null }, "models");
assert.ok(models.length > 0 && models.every((item) => "part" in item && item.part !== "lights"), "33: no lit windows by day");
assert.ok(models.every((item) => "part" in item && (item.floor < 5 || (item.part === "slab" && item.floor === 5))), "33: below the floor, and its slab");

// ---------- picking and the panel's steps
assert.deepEqual(condoPickTarget("condo-1953-pick", "#03-01", ["1953"]), { slug: "1953", unit: "#03-01" });
assert.equal(condoPickTarget("condo-1953-mass", "#03-01", ["1953"]), null);
const dev1953 = maps["1953"];
const picked = chooseUnit(NO_CONDO_VIEW, maps, { slug: "1953", unit: dev1953.units[0].unit });
assert.deepEqual(picked, { slug: "1953", floor: dev1953.units[0].floor, unit: dev1953.units[0].unit }, "a click brings its development and floor");
assert.deepEqual(chooseUnit(picked, maps, null), { ...picked, unit: null }, "a click off the units keeps the floor");
assert.deepEqual(chooseFloor(picked, null), { ...picked, floor: null, unit: null });
assert.deepEqual(chooseDevelopment(picked, "10-evelyn"), { slug: "10-evelyn", floor: null, unit: null });
assert.equal(chooseUnit(picked, maps, { slug: "1953", unit: "#99-99" }), picked, "an unknown unit changes nothing");
assert.deepEqual([floorName(1), floorName(2), floorName(12)], ["1st storey", "2nd storey", "Level 12"]);
const card = { ...dev1953.units[0], bedrooms: 2, study: true, penthouse: false, levels: 2, areaSqm: 65, areaSqft: 700, areaSqftFrom: "converted", atticVoidSqm: null, areaSqftWithVoid: false };
assert.equal(unitLayout(card), "2 bedrooms + study · 2 levels");
assert.equal(unitLayout({ ...card, bedrooms: 0, study: false, levels: 1 }), "Studio");
assert.equal(unitArea(card), "65 m² · 700 sq ft (converted)");
// 10 Evelyn's 5th storey: the plan's m² leaves out the attic void that the sq ft counts, and the card says so
const evelyn = maps["10-evelyn"].units;
assert.equal(unitArea(evelyn.find((unit) => unit.unit === "#05-05") ?? card), "46 m² + attic void 25 m² · 764 sq ft with the void");
assert.equal(unitArea(evelyn.find((unit) => unit.unit === "#05-10") ?? card), "116 m² + attic void 17 m² · 1,432 sq ft with the void (converted)");
assert.equal(unitArea(evelyn.find((unit) => unit.unit === "#02-09") ?? card), "75 m² · 807 sq ft (converted)");
// 24 One's duplexes: on both storeys' lists, chosen on the upper one it stays there, and the card names both
const one = maps["24-one-residences"];
assert.deepEqual(unitsOnFloor(one, 2).map((unit) => unit.unit), ["#01-05", "#01-06", "#02-01", "#02-02", "#02-03", "#02-04"]);
const upper = chooseUnit({ slug: one.slug, floor: 2, unit: null }, maps, { slug: one.slug, unit: "#01-05" });
assert.deepEqual(upper, { slug: one.slug, floor: 2, unit: "#01-05" }, "a duplex chosen on its upper storey keeps it");
assert.deepEqual(chooseUnit({ slug: one.slug, floor: 4, unit: null }, maps, { slug: one.slug, unit: "#01-05" }).floor, 1, "elsewhere, its own floor");
assert.equal(shown(one, upper, "unit").length, 1, "24 One: the duplex's upper part is marked");
const duplex = one.units.find((unit) => unit.unit === "#01-05") ?? card;
assert.equal(unitFloorName(duplex), "1st–2nd storey");
assert.equal(unitFloorName({ ...duplex, floor: 4 }), "Levels 4–5");
assert.equal(unitFloorName({ ...duplex, levels: 1 }), "1st storey");
// credits read on different days are one credit with both days
const lots = (day: string) => `Contains information from SLA Cadastral Land Parcel accessed on ${day} from data.gov.sg which is made available under the terms of the Singapore Open Data Licence version 1.0`;
const credited = (list: string[]) => ({ ...dev1953, credits: list });
assert.deepEqual(condoMapCredits({ a: credited(["A", lots("24 Oct 2026")]), b: credited([lots("25 Oct 2026"), "A"]), c: credited([lots("24 Oct 2026")]) }), ["A", lots("24 Oct 2026 and 25 Oct 2026")]);
// why the map isn't up
assert.equal(loadError(404, "https://api.mapbox.com/styles/v1/x", undefined), "api.mapbox.com answered 404");
assert.equal(loadError(undefined, "not a url", "Failed to fetch"), "Failed to fetch");
assert.match(mapProblem({ map: null, refused: null, loadFailed: "api.mapbox.com answered 404", slow: false }) ?? "", /didn't load: api\.mapbox\.com answered 404/);
assert.match(mapProblem({ map: null, refused: null, loadFailed: null, slow: true }) ?? "", /taking long/);
assert.equal(mapProblem({ map: null, refused: null, loadFailed: null, slow: false }), null);

// ---------- the page and the route ship the data, and the page stays off the admin menu
const nextConfig = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
assert.match(nextConfig, /"\/api\/admin\/condo-map\/\*\*": \["\.\/catalog\/condo-map\/\*\*\/\*"\]/);
assert.match(nextConfig, /"\/admin\/condo-map": \["\.\/catalog\/condo-map\/index\.json"\]/);
assert.doesNotMatch(fs.readFileSync(path.join(root, "app/admin/admin-navigation.ts"), "utf8"), /condo-map/, "unlisted for now");

console.log(`Condo map checks passed: ${index.length} developments, ${Object.values(maps).reduce((sum, dev) => sum + dev.units.length, 0)} units.`);
