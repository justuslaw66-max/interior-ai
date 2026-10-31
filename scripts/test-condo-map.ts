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
import {
  CONDO_GHOST_OPACITY,
  CONDO_MAP_BEDROOM_COLOURS,
  CONDO_MAP_COLOURS,
  CONDO_PLAN_LIFT_M,
  bedroomColour,
  condoLayers,
  condoModelSlug,
  condoModels,
  condoPickTarget,
  condoPlanImage,
  condoPlanLayer,
  condoSources,
  condoViewUpdates,
  floorLegend,
} from "@/app/admin/condo-map/condo-map-layers";
import { CONDO_PLACE_LABELS_BELOW_ZOOM, hidePlaceLabelsWhenClose, placeLabelsShown } from "@/app/admin/condo-map/condo-map-basemap";
import { keepUnitInView, loadError, mapProblem, showCondoPlan } from "@/app/admin/condo-map/condo-map-mapbox";
import {
  NO_CONDO_VIEW,
  boundsAround,
  chooseDevelopment,
  chooseFloor,
  chooseUnit,
  condoMapCredits,
  floorName,
  liftPixels,
  metresPerPixel,
  unitArea,
  unitFloorName,
  unitLayout,
  unitOutOfView,
  unitPartOn,
  unitPlanOn,
  unitPlans,
  unitStoreys,
  unitsOnFloor,
  type CondoMapView,
} from "@/app/admin/condo-map/condo-map-view";
import type { MapboxEvent, MapboxJson, MapboxMap } from "@/app/admin/condo-map/mapbox-gl-types";

/**
 * The admin condo map (catalog/condo-map, /admin/condo-map): its exported data reads and is whole, its data route
 * serves only its own files, its token is a public one, and its Mapbox filters show what each view promises. The
 * filters are run here with a small evaluator of the expressions they use, against the real features.
 */
const root = process.cwd();
const dataRoot = path.join(root, "catalog", "condo-map");
const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(path.join(dataRoot, file), "utf8"));
const raw = (file: string): Record<string, unknown> => {
  const body = readJson(file);
  assert.ok(body && typeof body === "object" && !Array.isArray(body), `${file}: an object`);
  return { ...body };
};

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
  // Mapbox's point-of-interest labels go over the whole lot: it holds the building, and the clip of its buildings
  assert.ok(dev.labelClip.length > 0, `${dev.slug}: an outline that clears Mapbox's labels off the site`);
  const onLot = ([lon, lat]: readonly [number, number]) => dev.labelClip.some((polygon) => pointInRing([lon, lat], polygon[0]));
  for (const polygon of dev.clip) assert.ok(polygon[0].every(onLot), `${dev.slug}: the labels' clip covers the buildings' clip`);
  // both outlines are traced on a 2.5 cm raster: a corner may stand a few cm off the other's edge (1e-6 degrees: 11 cm)
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const nearLot = ([lon, lat]: readonly [number, number]) => onLot([lon, lat]) || steps.some(([dx, dy]) => onLot([lon + dx * 1e-6, lat + dy * 1e-6]));
  for (const block of dev.massing.features.filter((feature) => feature.properties.kind !== "columns")) {
    assert.ok(block.geometry.coordinates[0].every(nearLot), `${dev.slug}: the labels' clip covers the building (storey ${block.properties.f})`);
  }
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
// the brochure plans on their floors (J, 30 Oct 2026: the units whose plan's turn and mirror on the building are sure):
// each a WebP in the development's overlays folder (and nothing else there), on a storey of its unit, over the unit's
// outline there, at the top of its floor's paint
let plannedUnits = 0;
let plannedLevels = 0;
for (const dev of Object.values(maps)) {
  const folder = path.join(dataRoot, dev.slug, "overlays");
  const used = new Set<string>();
  for (const [unit, plans] of Object.entries(dev.plans)) {
    const card = dev.units.find((candidate) => candidate.unit === unit);
    assert.ok(card && plans.length > 0, `${dev.slug} ${unit}: a plan for a unit with a card`);
    plannedUnits += 1;
    for (const plan of plans) {
      plannedLevels += 1;
      used.add(plan.file);
      assert.ok(unitStoreys(card).includes(plan.f), `${dev.slug} ${unit}: its plan on one of its storeys (${plan.f})`);
      const bytes = fs.readFileSync(path.join(folder, plan.file));
      assert.ok(bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP", `${dev.slug} ${unit}: a WebP`);
      const part = dev.unitParts.features.find((candidate) => candidate.properties.unit === unit && candidate.properties.f === plan.f);
      assert.ok(part, `${dev.slug} ${unit}: a part on storey ${plan.f}`);
      const ring = part.geometry.coordinates[0].slice(0, -1);
      const middle: [number, number] = [ring.reduce((sum, point) => sum + point[0], 0) / ring.length, ring.reduce((sum, point) => sum + point[1], 0) / ring.length];
      assert.ok(pointInRing(middle, [...plan.corners, plan.corners[0]]), `${dev.slug} ${unit}: its plan over its outline`);
      const paint = dev.floors.features.filter((feature) => feature.properties.unit === unit && feature.properties.f === plan.f);
      assert.ok(paint.length > 0 && paint.every((feature) => Math.abs(feature.properties.top - plan.z) < 0.01), `${dev.slug} ${unit}: on its floor's paint`);
    }
  }
  const files = fs.existsSync(folder) ? fs.readdirSync(folder).sort() : [];
  assert.deepEqual(files, [...used].sort(), `${dev.slug}: the overlays folder holds its plans' pictures and nothing else`);
}
assert.equal(plannedUnits, 350, "the units with a plan on the map (30 Oct 2026: 279 by their outline, 71 by their windows)");
assert.equal(plannedLevels, 350, "one storey each: none of the two-level units' plans is sure yet");
assert.throws(() => parseCondoDevelopmentMap({ ...(raw("1953/map.json")), plans: { "#03-01": [{ f: 3, file: "../x.webp", corners: [[0, 0], [0, 0], [0, 0], [0, 0]], z: 1 }] } }), CondoMapDataError);
assert.throws(() => parseCondoDevelopmentMap({ ...(raw("1953/map.json")), plans: { "#03-01": [{ f: 3, file: "0123456789abcdef.webp", corners: [[0, 0], [0, 0], [0, 0]], z: 1 }] } }), CondoMapDataError);
assert.deepEqual(parseCondoDevelopmentMap({ ...(raw("1953/map.json")), plans: undefined }).plans, {}, "a map without plans has none");
assert.deepEqual(unitPlans(maps["1953"], "constructor"), [], "a unit's plans are the map's own (not Object's)");

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
assert.equal(condoMapFilePath(["10-evelyn", "overlays", "0123456789abcdef.webp"])?.contentType, "image/webp");
for (const refused of [["10-evelyn", "overlays", "a.png"], ["10-evelyn", "overlays", "a.glb"], ["10-evelyn", "overlays", "..webp"]]) {
  assert.equal(condoMapFilePath(refused), null, `refused: ${refused.join("/")}`);
}
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
    case "match": {
      const input = value(0);
      for (let i = 1; i + 1 < args.length; i += 2) {
        const labels = Array.isArray(args[i]) ? (args[i] as MapboxJson[]) : [args[i]];
        if (labels.includes(input as MapboxJson)) return evaluate(args[i + 1], properties);
      }
      return evaluate(args[args.length - 1], properties);
    }
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
  // the chosen unit's orange box, unless its plan lies there instead (below)
  const boxed = shown(dev, chosen, "unit");
  if (unitPlanOn(dev, chosen)) assert.equal(boxed.length, 0, `${dev.slug}: no box over the plan`);
  else assert.ok(boxed.length > 0 && boxed.every((properties) => "unit" in properties && properties.unit === unit.unit));
  const rooms = condoViewUpdates(dev, chosen).paint.find(([layerId, property]) => layerId === `condo-${dev.slug}-floor` && property === "fill-extrusion-color");
  assert.equal(evaluate(rooms?.[2] ?? null, { unit: unit.unit, kind: "room" }), CONDO_MAP_COLOURS.selectedUnit, `${dev.slug}: the chosen unit's rooms stand out`);
  // the floor's other units by their bedroom count; open parts (balconies, ledges) as they were
  for (const other of unitsOnFloor(dev, floor).filter((card) => card.unit !== unit.unit)) {
    assert.equal(evaluate(rooms?.[2] ?? null, { unit: other.unit, kind: "room" }), bedroomColour(other.bedrooms), `${dev.slug} ${other.unit}: by its bedrooms`);
    assert.equal(evaluate(rooms?.[2] ?? null, { unit: other.unit, kind: "balcony" }), CONDO_MAP_COLOURS.open);
  }
  const noUnit = condoViewUpdates(dev, { ...chosen, unit: null }).paint.find(([layerId]) => layerId === `condo-${dev.slug}-floor`);
  assert.equal(evaluate(noUnit?.[2] ?? null, { unit: unit.unit, kind: "room" }), bedroomColour(unit.bedrooms), `${dev.slug}: no unit chosen, none orange`);
  assert.equal(evaluate(noUnit?.[2] ?? null, { unit: "", kind: "room" }), CONDO_MAP_COLOURS.room, `${dev.slug}: a room of no unit isn't orange`);
  const elsewhere = condoViewUpdates(dev, { ...chosen, slug: "another" }).filters;
  assert.deepEqual(elsewhere, condoViewUpdates(dev, NO_CONDO_VIEW).filters, `${dev.slug}: whole while another development is chosen`);
}

// a chosen unit with its plan: the plan on its floor, and no orange box or ghost over it (Mapbox would draw them over
// the picture); one without a plan keeps both; another storey of a unit, or no unit, shows no plan
for (const dev of Object.values(maps)) {
  const [planned] = Object.entries(dev.plans);
  if (!planned) continue;
  const [unit, [plan]] = planned;
  const view: CondoMapView = { slug: dev.slug, floor: plan.f, unit };
  assert.deepEqual(condoViewUpdates(dev, view).plan, plan, `${dev.slug} ${unit}: its plan shows`);
  assert.equal(shown(dev, view, "unit").length + shown(dev, view, "ghost").length, 0, `${dev.slug} ${unit}: nothing over its plan`);
  assert.ok(shown(dev, view, "floor").length > 0 && shown(dev, view, "pick").length > 0, `${dev.slug} ${unit}: the floor painted and clickable`);
  assert.equal(condoViewUpdates(dev, { ...view, unit: null }).plan, null, `${dev.slug}: no unit, no plan`);
  assert.equal(condoViewUpdates(dev, { ...view, slug: "another" }).plan, null, `${dev.slug}: another development chosen, no plan`);
  const top = Math.max(...dev.massing.features.map((feature) => feature.properties.f));
  const bare = dev.units.find((card) => unitPlans(dev, card.unit).length === 0 && card.floor < top);
  if (bare) {
    const plain: CondoMapView = { slug: dev.slug, floor: bare.floor, unit: bare.unit };
    assert.equal(unitPlanOn(dev, plain), null);
    assert.ok(shown(dev, plain, "unit").length > 0 && shown(dev, plain, "ghost").length > 0, `${dev.slug} ${bare.unit}: no plan, its box and the ghost`);
  }
  const image = condoPlanImage(dev.slug, plan, "https://x.app");
  assert.deepEqual(image, { url: `https://x.app/api/admin/condo-map/${dev.slug}/overlays/${plan.file}`, coordinates: plan.corners });
  const layer = condoPlanLayer(dev.slug, plan);
  assert.ok(layer.type === "raster" && !ids.has(layer.id), `${dev.slug}: the plan's own raster layer`);
  assert.equal(layer.paint?.["raster-elevation"], plan.z + CONDO_PLAN_LIFT_M, `${dev.slug}: just over its floor's paint`);
}
// a penthouse's attic plan isn't on the map, which doesn't offer the attic as a floor (183 LongHaus #04-07: its own
// storey's plan only, mirrored with its words turned back)
const longhaus = maps["183-longhaus"];
assert.deepEqual(unitPlans(longhaus, "#04-07").map((plan) => plan.f), [4]);
assert.equal(unitPlanOn(longhaus, { slug: longhaus.slug, floor: 4, unit: "#04-07" })?.f, 4);
assert.equal(unitPlanOn(longhaus, { slug: longhaus.slug, floor: 5, unit: "#04-07" }), null);

// the plan on the map: its picture and layer made when one first shows, pointed at the next, hidden for none
{
  const [first, second] = Object.values(maps["10-evelyn"].plans).flat().filter((plan, index, all) => all.findIndex((other) => other.file === plan.file) === index);
  const calls: string[] = [];
  const layers = new Set<string>();
  let source: { updateImage: (options: { url: string }) => void } | undefined;
  const map = {
    getLayer: (id: string) => (layers.has(id) ? {} : undefined),
    getSource: () => source,
    addSource: (id: string, spec: { url: string }) => {
      calls.push(`source ${id} ${spec.url.split("/").pop()}`);
      source = { updateImage: (options) => calls.push(`image ${options.url.split("/").pop()}`) };
    },
    addLayer: (layer: { id: string }) => {
      layers.add(layer.id);
      calls.push(`layer ${layer.id}`);
    },
    setPaintProperty: (_id: string, name: string, value: MapboxJson) => calls.push(`${name} ${String(value)}`),
    setLayoutProperty: (_id: string, name: string, value: MapboxJson) => calls.push(`${name} ${String(value)}`),
  } as unknown as MapboxMap;
  showCondoPlan(map, "10-evelyn", null, "https://x.app");
  assert.deepEqual(calls, [], "no plan yet: nothing made");
  showCondoPlan(map, "10-evelyn", first, "https://x.app");
  assert.deepEqual(calls.splice(0), [`source condo-10-evelyn-plan-source ${first.file}`, "layer condo-10-evelyn-plan", "visibility visible"]);
  showCondoPlan(map, "10-evelyn", first, "https://x.app");
  assert.deepEqual(calls.splice(0), [`raster-elevation ${first.z + CONDO_PLAN_LIFT_M}`, "visibility visible"], "the same plan isn't loaded again");
  showCondoPlan(map, "10-evelyn", second, "https://x.app");
  assert.deepEqual(calls.splice(0), [`image ${second.file}`, `raster-elevation ${second.z + CONDO_PLAN_LIFT_M}`, "visibility visible"]);
  showCondoPlan(map, "10-evelyn", null, "https://x.app");
  assert.deepEqual(calls.splice(0), ["visibility none"]);
}

// the storeys above a chosen floor: a faint ghost of the outline; the labels' clip takes labels only
for (const dev of Object.values(maps)) {
  const layers = condoLayers(dev);
  assert.equal(layers.find((layer) => layer.id === `condo-${dev.slug}-ghost`)?.paint?.["fill-extrusion-opacity"], CONDO_GHOST_OPACITY);
  const labelClip = layers.find((layer) => layer.id === `condo-${dev.slug}-label-clip`);
  assert.deepEqual(labelClip?.layout, { "clip-layer-types": ["symbol"], "clip-layer-scope": ["basemap"] }, `${dev.slug}: labels only`);
}
assert.ok(CONDO_GHOST_OPACITY > 0 && CONDO_GHOST_OPACITY <= 0.06, "the ghost stays, faint");
assert.deepEqual([0, 1, 2, 3, 4, 5, 6, null].map(bedroomColour), [
  CONDO_MAP_COLOURS.room, CONDO_MAP_BEDROOM_COLOURS[1], CONDO_MAP_BEDROOM_COLOURS[2], CONDO_MAP_BEDROOM_COLOURS[3],
  CONDO_MAP_BEDROOM_COLOURS[4], CONDO_MAP_BEDROOM_COLOURS[5], CONDO_MAP_BEDROOM_COLOURS[5], CONDO_MAP_COLOURS.room,
]);
const cardOf = (bedrooms: number | null) => ({ ...maps["1953"].units[0], bedrooms });
assert.deepEqual(floorLegend([cardOf(3), cardOf(1), cardOf(3), cardOf(0), cardOf(null), cardOf(7)]).map((entry) => entry.label),
  ["Studio", "1 bedroom", "3 bedrooms", "5 or more bedrooms", "Bedrooms not given"]);

// ---------- a chosen unit kept in view (32 Gilstead's #03-02 sat at the map's right edge)
const gilstead = maps["32-gilstead"];
const part = unitPartOn(gilstead, "#03-02", 3);
assert.ok(part && part.ring.length >= 4 && part.base > 0, "32 Gilstead #03-02: its outline on the 3rd storey, off the ground");
assert.equal(unitPartOn(gilstead, "#99-99", 3), null);
assert.ok(Math.abs(metresPerPixel(0, 0) - 78271.517) < 0.01, "a 512-pixel world at zoom 0");
assert.ok(Math.abs(liftPixels(10, 0, 18, 30) - (5 / metresPerPixel(0, 18))) < 1e-9, "10 m up at a 30-degree tilt shows as 5 m");
const inside = [{ x: 200, y: 200 }, { x: 300, y: 260 }];
assert.equal(unitOutOfView(inside, 0, 800, 600), false, "well inside");
assert.equal(unitOutOfView([...inside, { x: 790, y: 300 }], 0, 800, 600), true, "at the right edge");
assert.equal(unitOutOfView(inside, 190, 800, 600), true, "lifted out of the top");
assert.equal(unitOutOfView([{ x: 400, y: 560 }], 100, 800, 600), false, "low on the ground, but its storey stands inside");

// the camera: a stand-in map whose screen puts a lon/lat at fixed pixels, on an 800 x 600 map tilted 50 degrees
function standInMap(moving: boolean, at: (point: [number, number]) => { x: number; y: number }) {
  const eases: Array<{ center: [number, number]; offset?: [number, number] }> = [];
  const waiting = new Set<(event: MapboxEvent) => void>();
  const map = {
    isMoving: () => moving,
    once: (_type: string, listener: (event: MapboxEvent) => void) => waiting.add(listener),
    off: (_type: string, listener: (event: MapboxEvent) => void) => waiting.delete(listener),
    getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
    getZoom: () => 18.6,
    getPitch: () => 50,
    project: at,
    easeTo: (options: { center: [number, number]; offset?: [number, number] }) => eases.push(options),
  } as unknown as MapboxMap;
  const settle = (event: MapboxEvent = {}) => [...waiting].forEach((listener) => listener(event));
  return { map, eases, waiting, settle };
}
if (part) {
  const middle = () => ({ x: 400, y: 380 });
  const still = standInMap(false, middle);
  keepUnitInView(still.map, part);
  assert.equal(still.eases.length, 0, "a unit well in view: the camera stays");
  const edge = standInMap(true, () => ({ x: 790, y: 380 }));
  const cancel = keepUnitInView(edge.map, part);
  assert.equal(edge.eases.length, 0, "it waits for the development's framing to settle");
  edge.settle();
  assert.equal(edge.eases.length, 1, "then brings a unit at the edge to the middle");
  assert.ok(edge.eases[0].offset && edge.eases[0].offset[1] > 0, "lower by its storey's height on screen");
  const [[w, s], [e, n]] = boundsAround(part.ring) ?? [[0, 0], [0, 0]];
  assert.deepEqual(edge.eases[0].center, [(w + e) / 2, (s + n) / 2], "on the unit's middle");
  cancel();
  const dragged = standInMap(true, () => ({ x: 790, y: 380 }));
  keepUnitInView(dragged.map, part);
  dragged.settle({ originalEvent: {} });
  assert.equal(dragged.eases.length, 0, "a move the user made is left alone");
  const replaced = standInMap(true, () => ({ x: 790, y: 380 }));
  keepUnitInView(replaced.map, part)();
  assert.equal(replaced.waiting.size, 0, "a newer choice cancels the wait");
}

// ---------- house numbers: Standard's place labels go from zoom 16.5 in (house numbers show from 17), back further out
assert.equal(CONDO_PLACE_LABELS_BELOW_ZOOM, 16.5);
assert.ok(placeLabelsShown(12) && placeLabelsShown(16.49), "the overview keeps the area names");
assert.ok(!placeLabelsShown(16.5) && !placeLabelsShown(17) && !placeLabelsShown(18.6), "a site's view has no house numbers");
{
  let zoom = 12;
  const sets: Array<[string, string, MapboxJson]> = [];
  const listeners = new Set<(event: MapboxEvent) => void>();
  const map = {
    getZoom: () => zoom,
    setConfigProperty: (importId: string, name: string, value: MapboxJson) => sets.push([importId, name, value]),
    on: (_type: string, listener: (event: MapboxEvent) => void) => listeners.add(listener),
    off: (_type: string, listener: (event: MapboxEvent) => void) => listeners.delete(listener),
  } as unknown as MapboxMap;
  const zoomTo = (to: number) => {
    zoom = to;
    listeners.forEach((listener) => listener({}));
  };
  const unbind = hidePlaceLabelsWhenClose(map);
  assert.deepEqual(sets, [["basemap", "showPlaceLabels", true]], "set once at the start");
  for (const step of [13, 14.5, 16, 16.4]) zoomTo(step);
  assert.equal(sets.length, 1, "no change while it stays out");
  zoomTo(17.2);
  zoomTo(18.6);
  assert.deepEqual(sets.slice(1), [["basemap", "showPlaceLabels", false]], "off once on crossing in");
  zoomTo(15);
  assert.deepEqual(sets.slice(2), [["basemap", "showPlaceLabels", true]], "on again on crossing out");
  unbind();
  assert.equal(listeners.size, 0, "unbinding removes the listener");
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
// a duplex chosen on its lower storey stands up (J, 31 Oct 2026: "Both levels, standing up"): its upper level's rooms
// painted orange over the cut floor, and its box from its floor to 1.2 m over its upper level; others as before
const boxHeight = (view: CondoMapView, properties: Readonly<Record<string, unknown>>) => {
  const update = condoViewUpdates(one, view).paint.find(([layerId, property]) => layerId === `condo-${one.slug}-unit` && property === "fill-extrusion-height");
  assert.ok(update, "the view sets the box's height");
  return evaluate(update[2], properties);
};
const roomColour = (view: CondoMapView, properties: Readonly<Record<string, unknown>>) =>
  evaluate(condoViewUpdates(one, view).paint.find(([layerId]) => layerId === `condo-${one.slug}-floor`)?.[2] ?? null, properties);
const lower = chooseUnit({ slug: one.slug, floor: null, unit: null }, maps, { slug: one.slug, unit: "#01-05" });
assert.deepEqual(lower, { slug: one.slug, floor: 1, unit: "#01-05" }, "a duplex chosen from the whole building opens on its lower storey");
assert.equal(unitPlanOn(one, lower), null, "#01-05's plan isn't placed: its floor is painted");
const lowerRooms = shown(one, lower, "floor");
const upperRooms = lowerRooms.filter((properties) => properties.f === 2);
assert.ok(upperRooms.length > 0 && upperRooms.every((properties) => properties.unit === "#01-05"), "its upper level's rooms, and no other unit's on storey 2");
assert.equal(lowerRooms.length - upperRooms.length, one.floors.features.filter((feature) => feature.properties.f === 1).length, "the whole cut floor, as before");
assert.ok(upperRooms.every((properties) => roomColour(lower, properties) === CONDO_MAP_COLOURS.selectedUnit), "its upper rooms in the accent");
const lowerBox = shown(one, lower, "unit");
assert.deepEqual(lowerBox.map((properties) => properties.f).sort(), [1, 2], "its box on both of its storeys");
const [part1, part2] = [1, 2].map((f) => lowerBox.find((properties) => properties.f === f) ?? {});
assert.equal(boxHeight(lower, part1), part1.top, "the lower part's box runs up to its upper level");
assert.equal(boxHeight(lower, part2), Number(part2.base) + 1.2, "the upper part's box: 1.2 m over its upper level");
assert.ok(shown(one, lower, "ghost").every((properties) => Number(properties.f) > 1), "the storeys above still a ghost");
// on its upper storey: as before, that storey's rooms and the upper part's 1.2 m box
assert.ok(shown(one, upper, "floor").every((properties) => properties.f === 2), "chosen on storey 2: storey 2's rooms only");
assert.equal(boxHeight(upper, part2), Number(part2.base) + 1.2);
// a single-level unit on the same floor, and no unit: one storey, a 1.2 m box
const flat = chooseUnit({ slug: one.slug, floor: 2, unit: null }, maps, { slug: one.slug, unit: "#02-01" });
assert.ok(shown(one, flat, "floor").every((properties) => properties.f === 2) && shown(one, flat, "unit").every((properties) => properties.f === 2));
const flatPart = shown(one, flat, "unit")[0] ?? {};
assert.equal(boxHeight(flat, flatPart), Number(flatPart.base) + 1.2, "a single-level unit's box: 1.2 m");
assert.equal(boxHeight({ ...lower, unit: null }, part1), Number(part1.base) + 1.2, "no unit chosen: the box's height as it was");
// #01-06's lower-level plan is placed: the plan shows alone (its upper level would stand over the picture and hide it)
const planned06 = { slug: one.slug, floor: 1, unit: "#01-06" };
assert.ok(unitPlanOn(one, planned06), "#01-06's plan lies on storey 1");
assert.equal(shown(one, planned06, "unit").length, 0, "no box over its plan");
assert.ok(shown(one, planned06, "floor").every((properties) => properties.f === 1), "and no upper level over it");
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
// mapbox-gl.css sets the map container to position: relative after the app's styles, so a container sized by absolute
// positioning collapses to 0 px tall (the live page, 26 Oct 2026): it must be sized by its height
const mapContainer = /<div ref=\{setContainer\} className="([^"]*)"/.exec(fs.readFileSync(path.join(root, "app/admin/condo-map/CondoMapExplorer.tsx"), "utf8"));
assert.ok(mapContainer, "the map container is found");
assert.doesNotMatch(mapContainer[1], /\b(absolute|fixed|inset-)/, "the map container isn't sized by absolute positioning");
assert.match(mapContainer[1], /\bh-full\b/, "the map container takes its frame's height");

console.log(`Condo map checks passed: ${index.length} developments, ${Object.values(maps).reduce((sum, dev) => sum + dev.units.length, 0)} units.`);
