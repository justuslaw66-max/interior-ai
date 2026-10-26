/**
 * The admin condo map's data (catalog/condo-map): each development's building as GeoJSON in lon/lat, exported from the
 * floor-plan masters (`_tools/mapexport/export_condo_map.py`). Read at the boundary with these checks, so a file
 * the exporter changed shape for fails loudly instead of drawing nothing.
 */
export type LonLat = [number, number];
export type PolygonCoordinates = LonLat[][];

export type CondoFeature<Properties> = {
  type: "Feature";
  properties: Properties;
  geometry: { type: "Polygon"; coordinates: PolygonCoordinates };
};

export type CondoFeatureCollection<Properties> = {
  type: "FeatureCollection";
  features: CondoFeature<Properties>[];
};

/** A storey's blocks (their union), or an attic, column or slab block, with its heights in metres. */
export type MassingProperties = { f: number; kind: string; base: number; top: number };
/** A unit's outline at a storey it takes (its own, its attic, its upper part), for picking. */
export type UnitPartProperties = { unit: string; f: number; floor: number; base: number; top: number };
/** A room or open part (balcony, ledge, planter) of a unit, painted on its floor. */
export type FloorPaintProperties = { unit: string; f: number; kind: string; base: number; top: number };

export type CondoUnitCard = {
  unit: string;
  floor: number;
  stack: string | null;
  type: string | null;
  bedrooms: number | null;
  study: boolean;
  penthouse: boolean;
  levels: number;
  areaSqm: number | null;
  areaSqft: number | null;
  areaSqftFrom: string | null;
  /** The attic void the plan leaves out of its m² (10 Evelyn's 5th storey), when it gives one. */
  atticVoidSqm: number | null;
  /** The sq ft counts the attic void (the unit chart's figure, or converted from the m² with it). */
  areaSqftWithVoid: boolean;
  balconyM2: number | null;
  plan: string | null;
};

export type CondoModelItem = {
  id: string;
  file: string;
  floor: number;
  part: string;
  unit: string | null;
  type: string | null;
};

export type CondoDevelopmentMap = {
  slug: string;
  name: string;
  subtitle: string;
  placedOn: string;
  credits: string[];
  centre: LonLat;
  bounds: [LonLat, LonLat];
  unitFloors: number[];
  units: CondoUnitCard[];
  massing: CondoFeatureCollection<MassingProperties>;
  unitParts: CondoFeatureCollection<UnitPartProperties>;
  floors: CondoFeatureCollection<FloorPaintProperties>;
  balconies: CondoFeatureCollection<FloorPaintProperties>;
  clip: PolygonCoordinates[];
  models: { origin: LonLat; items: CondoModelItem[] } | null;
};

export type CondoDevelopmentSummary = {
  slug: string;
  name: string;
  subtitle: string;
  centre: LonLat;
  units: number;
  detailed: boolean;
};

export const CONDO_MAP_INDEX_SCHEMA = "interior-ai.condo-map.index.v1";
export const CONDO_MAP_DEVELOPMENT_SCHEMA = "interior-ai.condo-map.development.v1";
export const CONDO_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const CONDO_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export class CondoMapDataError extends Error {
  constructor(public readonly path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = "CondoMapDataError";
  }
}

type Fields = Record<string, unknown>;

function fields(value: unknown, path: string): Fields {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CondoMapDataError(path, "expected an object");
  return value as Fields;
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new CondoMapDataError(path, "expected a list");
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string") throw new CondoMapDataError(path, "expected text");
  return value;
}

function number(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new CondoMapDataError(path, "expected a number");
  return value;
}

function optional<T>(value: unknown, path: string, read: (value: unknown, path: string) => T): T | null {
  return value === null || value === undefined ? null : read(value, path);
}

function matching(value: unknown, path: string, pattern: RegExp): string {
  const result = text(value, path);
  if (!pattern.test(result)) throw new CondoMapDataError(path, `"${result}" is not allowed here`);
  return result;
}

function lonLat(value: unknown, path: string): LonLat {
  const pair = list(value, path);
  const lon = number(pair[0], `${path}[0]`);
  const lat = number(pair[1], `${path}[1]`);
  if (pair.length !== 2 || Math.abs(lon) > 180 || Math.abs(lat) > 90) throw new CondoMapDataError(path, "expected [lon, lat]");
  return [lon, lat];
}

function polygon(value: unknown, path: string): PolygonCoordinates {
  return list(value, path).map((ring, r) => {
    const points = list(ring, `${path}[${r}]`).map((point, p) => lonLat(point, `${path}[${r}][${p}]`));
    if (points.length < 4) throw new CondoMapDataError(`${path}[${r}]`, "a ring needs at least four points");
    return points;
  });
}

function collection<Properties>(
  value: unknown,
  path: string,
  readProperties: (value: Fields, path: string) => Properties
): CondoFeatureCollection<Properties> {
  const body = fields(value, path);
  if (body.type !== "FeatureCollection") throw new CondoMapDataError(path, "expected a FeatureCollection");
  const features = list(body.features, `${path}.features`).map((entry, index) => {
    const at = `${path}.features[${index}]`;
    const feature = fields(entry, at);
    const geometry = fields(feature.geometry, `${at}.geometry`);
    if (feature.type !== "Feature" || geometry.type !== "Polygon") throw new CondoMapDataError(at, "expected a Polygon feature");
    return {
      type: "Feature" as const,
      properties: readProperties(fields(feature.properties, `${at}.properties`), `${at}.properties`),
      geometry: { type: "Polygon" as const, coordinates: polygon(geometry.coordinates, `${at}.geometry.coordinates`) },
    };
  });
  return { type: "FeatureCollection", features };
}

function heights(value: Fields, path: string) {
  const base = number(value.base, `${path}.base`);
  const top = number(value.top, `${path}.top`);
  if (top < base) throw new CondoMapDataError(path, "top is below base");
  return { f: number(value.f, `${path}.f`), base, top };
}

function massingProperties(value: Fields, path: string): MassingProperties {
  return { ...heights(value, path), kind: text(value.kind, `${path}.kind`) };
}

function unitPartProperties(value: Fields, path: string): UnitPartProperties {
  return { ...heights(value, path), unit: text(value.unit, `${path}.unit`), floor: number(value.floor, `${path}.floor`) };
}

function floorPaintProperties(value: Fields, path: string): FloorPaintProperties {
  return { ...heights(value, path), unit: text(value.unit ?? "", `${path}.unit`), kind: text(value.kind, `${path}.kind`) };
}

function unitCard(value: unknown, path: string): CondoUnitCard {
  const card = fields(value, path);
  return {
    unit: text(card.unit, `${path}.unit`),
    floor: number(card.floor, `${path}.floor`),
    stack: optional(card.stack, `${path}.stack`, text),
    type: optional(card.type, `${path}.type`, text),
    bedrooms: optional(card.bedrooms, `${path}.bedrooms`, number),
    study: card.study === true,
    penthouse: card.penthouse === true,
    levels: number(card.levels ?? 1, `${path}.levels`),
    areaSqm: optional(card.areaSqm, `${path}.areaSqm`, number),
    areaSqft: optional(card.areaSqft, `${path}.areaSqft`, number),
    areaSqftFrom: optional(card.areaSqftFrom, `${path}.areaSqftFrom`, text),
    atticVoidSqm: optional(card.atticVoidSqm, `${path}.atticVoidSqm`, number),
    areaSqftWithVoid: card.areaSqftWithVoid === true,
    balconyM2: optional(card.balconyM2, `${path}.balconyM2`, number),
    plan: optional(card.plan, `${path}.plan`, (entry, at) => matching(entry, at, CONDO_FILE_NAME)),
  };
}

function modelItem(value: unknown, path: string): CondoModelItem {
  const item = fields(value, path);
  return {
    id: matching(item.id, `${path}.id`, CONDO_FILE_NAME),
    file: matching(item.file, `${path}.file`, CONDO_FILE_NAME),
    floor: number(item.floor, `${path}.floor`),
    part: text(item.part, `${path}.part`),
    unit: optional(item.unit, `${path}.unit`, text),
    type: optional(item.type, `${path}.type`, text),
  };
}

function models(value: unknown, path: string): CondoDevelopmentMap["models"] {
  if (value === null || value === undefined) return null;
  const body = fields(value, path);
  return {
    origin: lonLat(body.origin, `${path}.origin`),
    items: list(body.items, `${path}.items`).map((item, index) => modelItem(item, `${path}.items[${index}]`)),
  };
}

export function parseCondoDevelopmentMap(value: unknown, path = "map.json"): CondoDevelopmentMap {
  const body = fields(value, path);
  if (body.schema !== CONDO_MAP_DEVELOPMENT_SCHEMA) throw new CondoMapDataError(`${path}.schema`, "unknown schema");
  const bounds = list(body.bounds, `${path}.bounds`);
  return {
    slug: matching(body.slug, `${path}.slug`, CONDO_SLUG),
    name: text(body.name, `${path}.name`),
    subtitle: text(body.subtitle ?? "", `${path}.subtitle`),
    placedOn: text(body.placedOn, `${path}.placedOn`),
    credits: list(body.credits, `${path}.credits`).map((credit, index) => text(credit, `${path}.credits[${index}]`)),
    centre: lonLat(body.centre, `${path}.centre`),
    bounds: [lonLat(bounds[0], `${path}.bounds[0]`), lonLat(bounds[1], `${path}.bounds[1]`)],
    unitFloors: list(body.unitFloors, `${path}.unitFloors`).map((floor, index) => number(floor, `${path}.unitFloors[${index}]`)),
    units: list(body.units, `${path}.units`).map((unit, index) => unitCard(unit, `${path}.units[${index}]`)),
    massing: collection(body.massing, `${path}.massing`, massingProperties),
    unitParts: collection(body.unitParts, `${path}.unitParts`, unitPartProperties),
    floors: collection(body.floors, `${path}.floors`, floorPaintProperties),
    balconies: collection(body.balconies, `${path}.balconies`, floorPaintProperties),
    clip: list(body.clip, `${path}.clip`).map((entry, index) => polygon(entry, `${path}.clip[${index}]`)),
    models: models(body.models, `${path}.models`),
  };
}

export function parseCondoMapIndex(value: unknown, path = "index.json"): CondoDevelopmentSummary[] {
  const body = fields(value, path);
  if (body.schema !== CONDO_MAP_INDEX_SCHEMA) throw new CondoMapDataError(`${path}.schema`, "unknown schema");
  return list(body.developments, `${path}.developments`).map((entry, index) => {
    const at = `${path}.developments[${index}]`;
    const development = fields(entry, at);
    return {
      slug: matching(development.slug, `${at}.slug`, CONDO_SLUG),
      name: text(development.name, `${at}.name`),
      subtitle: text(development.subtitle ?? "", `${at}.subtitle`),
      centre: lonLat(development.centre, `${at}.centre`),
      units: number(development.units, `${at}.units`),
      detailed: development.detailed === true,
    };
  });
}

/** The data route's address for a development's file (its map, a plan picture, a model). */
export function condoMapFileUrl(slug: string, ...parts: string[]): string {
  return ["/api/admin/condo-map", slug, ...parts].map((part, index) => (index === 0 ? part : encodeURIComponent(part))).join("/");
}
