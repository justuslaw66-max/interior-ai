import { condoMapFileUrl, type CondoDevelopmentMap, type LonLat } from "@/lib/condo-map/condo-map-data";
import type { CondoMapView } from "./condo-map-view";
import type { MapboxJson, MapboxLayer } from "./mapbox-gl-types";

/**
 * Each development on the admin condo map as Mapbox sources and layers, and what a chosen floor or unit changes.
 * Pure, so the drawing rules are tested without a map (scripts/test-condo-map.ts).
 *
 * The building is grey massing, storey by storey (or, for a development with detailed models, those models). With a
 * floor chosen: the storeys below stay, the chosen one is cut to its slab with its units' rooms painted on it, and the
 * storeys above are a faint ghost. Invisible blocks on every unit (opacity 0, still clickable) pick a unit.
 */
export const CONDO_MAP_COLOURS = {
  block: "#e4e1da",
  attic: "#dad5cb",
  columns: "#cfc9bd",
  slab: "#ece9e2",
  ghost: "#ffffff",
  room: "#f5f2eb",
  open: "#dce8e2",
  selectedRoom: "#f4c9b7",
  selectedUnit: "#e2572f",
} as const;

const SLAB_M = 0.25;
const UNIT_BOX_M = 1.2;
const ALL: MapboxJson = [">=", ["get", "f"], -1];
const NONE: MapboxJson = ["==", ["get", "f"], -1];

export const condoLayerId = (slug: string, part: string) => `condo-${slug}-${part}`;
const sourceId = (slug: string, part: string) => `condo-${slug}-${part}-source`;
export const condoModelId = (slug: string, id: string) => `condo-${slug}-${id}`;

function geojson(data: MapboxJson): Record<string, MapboxJson> {
  return { type: "geojson", data };
}

export function condoSources(dev: CondoDevelopmentMap): Array<[string, Record<string, MapboxJson>]> {
  const sources: Array<[string, Record<string, MapboxJson>]> = [
    [sourceId(dev.slug, "mass"), geojson(dev.massing)],
    [sourceId(dev.slug, "units"), geojson(dev.unitParts)],
    [sourceId(dev.slug, "floors"), geojson(dev.floors)],
    [sourceId(dev.slug, "balconies"), geojson(dev.balconies)],
    [sourceId(dev.slug, "clip"), geojson({ type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: dev.clip } })],
  ];
  if (dev.models) {
    const origin: LonLat = dev.models.origin;
    const points = dev.models.items.map((item) => ({
      type: "Feature",
      properties: { mid: condoModelId(dev.slug, item.id), floor: item.floor, part: item.part, unit: item.unit },
      geometry: { type: "Point", coordinates: origin },
    }));
    sources.push([sourceId(dev.slug, "models"), geojson({ type: "FeatureCollection", features: points })]);
  }
  return sources;
}

/** The 3D models a detailed development brings, by model id and the data route's address. */
export function condoModels(dev: CondoDevelopmentMap): Array<[string, string]> {
  return (dev.models?.items ?? []).map((item) => [condoModelId(dev.slug, item.id), condoMapFileUrl(dev.slug, "models", item.file)]);
}

function extrusion(slug: string, part: string, source: string, paint: Record<string, MapboxJson>): MapboxLayer {
  return {
    id: condoLayerId(slug, part),
    type: "fill-extrusion",
    source: sourceId(slug, source),
    filter: NONE,
    paint: {
      "fill-extrusion-base": ["get", "base"],
      "fill-extrusion-height": ["get", "top"],
      "fill-extrusion-ambient-occlusion-intensity": 0.3,
      "fill-extrusion-ambient-occlusion-wall-radius": 1.2,
      "fill-extrusion-ambient-occlusion-ground-radius": 2.5,
      ...paint,
    },
  };
}

const UNLIT = { "fill-extrusion-cast-shadows": false, "fill-extrusion-ambient-occlusion-intensity": 0 } as const;

const massColour: MapboxJson = [
  "match", ["get", "kind"],
  "attic", CONDO_MAP_COLOURS.attic,
  "columns", CONDO_MAP_COLOURS.columns,
  "slab", CONDO_MAP_COLOURS.slab,
  CONDO_MAP_COLOURS.block,
];

export function condoLayers(dev: CondoDevelopmentMap): MapboxLayer[] {
  const { slug } = dev;
  const layers: MapboxLayer[] = [
    {
      id: condoLayerId(slug, "clip"),
      type: "clip",
      source: sourceId(slug, "clip"),
      layout: { "clip-layer-types": ["model", "symbol"], "clip-layer-scope": ["basemap"] },
    },
    extrusion(slug, "mass", "mass", { "fill-extrusion-color": massColour }),
    extrusion(slug, "cut", "mass", { "fill-extrusion-color": CONDO_MAP_COLOURS.slab, "fill-extrusion-height": ["+", ["get", "base"], SLAB_M] }),
    extrusion(slug, "balconies", "balconies", { "fill-extrusion-color": CONDO_MAP_COLOURS.slab }),
    extrusion(slug, "floor", "floors", { "fill-extrusion-color": CONDO_MAP_COLOURS.room }),
    extrusion(slug, "unit", "units", {
      ...UNLIT,
      "fill-extrusion-color": CONDO_MAP_COLOURS.selectedUnit,
      "fill-extrusion-opacity": 0.35,
      "fill-extrusion-height": ["+", ["get", "base"], UNIT_BOX_M],
    }),
    extrusion(slug, "pick", "units", { ...UNLIT, "fill-extrusion-color": "#000000", "fill-extrusion-opacity": 0 }),
    extrusion(slug, "ghost", "mass", { ...UNLIT, "fill-extrusion-color": CONDO_MAP_COLOURS.ghost, "fill-extrusion-opacity": 0.16 }),
  ];
  if (dev.models) {
    layers.push({
      id: condoLayerId(slug, "models"),
      type: "model",
      source: sourceId(slug, "models"),
      layout: { "model-id": ["get", "mid"], "model-allow-density-reduction": false },
      paint: { "model-scale": [1, 1, 1], "model-rotation": [0, 0, 0], "model-type": "common-3d", "model-cast-shadows": true, "model-receive-shadows": true },
    });
  }
  return layers;
}

function modelFilter(floor: number | null): MapboxJson {
  const notLights: MapboxJson = ["!=", ["get", "part"], "lights"];
  if (floor === null) return notLights;
  const below: MapboxJson = ["<", ["get", "floor"], floor];
  const slabHere: MapboxJson = ["all", ["==", ["get", "part"], "slab"], ["<=", ["get", "floor"], floor]];
  return ["all", notLights, ["any", below, slabHere]];
}

export type CondoFilterUpdate = [layerId: string, filter: MapboxJson];
export type CondoPaintUpdate = [layerId: string, property: string, value: MapboxJson];

const F: MapboxJson = ["get", "f"];

/** The grey massing's filters: all of it, or with a floor chosen the storeys below and the chosen one's cut slab. */
function massingFilters(detailed: boolean, floor: number | null): Array<[string, MapboxJson]> {
  if (detailed) return [["mass", NONE], ["cut", NONE], ["balconies", NONE]];
  if (floor === null) return [["mass", ALL], ["cut", NONE], ["balconies", ALL]];
  const below: MapboxJson = ["<", F, floor];
  return [["mass", below], ["cut", ["all", ["==", F, floor], ["==", ["get", "kind"], "block"]]], ["balconies", below]];
}

function floorFilters(floor: number | null, unit: string | null): Array<[string, MapboxJson]> {
  // the chosen unit's part on its own floor (choosing a unit chooses its floor: condo-map-view)
  const chosenUnit: MapboxJson = unit === null || floor === null ? NONE : ["all", ["==", ["get", "unit"], unit], ["==", F, floor]];
  if (floor === null) return [["floor", NONE], ["unit", chosenUnit], ["pick", ALL], ["ghost", NONE]];
  return [["floor", ["==", F, floor]], ["unit", chosenUnit], ["pick", ["<=", F, floor]], ["ghost", [">", F, floor]]];
}

function paintUpdates(dev: CondoDevelopmentMap, unit: string | null): CondoPaintUpdate[] {
  const chosen: MapboxJson = ["==", ["get", "unit"], unit ?? ""];
  const rooms: MapboxJson = ["case", chosen, CONDO_MAP_COLOURS.selectedRoom, ["==", ["get", "kind"], "room"], CONDO_MAP_COLOURS.room, CONDO_MAP_COLOURS.open];
  const paint: CondoPaintUpdate[] = [[condoLayerId(dev.slug, "floor"), "fill-extrusion-color", rooms]];
  if (!dev.models) return paint;
  // the chosen unit's walls and glass take the accent colour; the rest keep the models' own
  const models = condoLayerId(dev.slug, "models");
  paint.push([models, "model-color", ["case", chosen, CONDO_MAP_COLOURS.selectedUnit, "#ffffff"]]);
  paint.push([models, "model-color-mix-intensity", ["case", chosen, 0.55, 0]]);
  return paint;
}

/** What a view sets on a development's layers: their filters, and the colours of the chosen floor's rooms and unit. */
export function condoViewUpdates(dev: CondoDevelopmentMap, view: CondoMapView) {
  const here = view.slug === dev.slug;
  const floor = here ? view.floor : null;
  const unit = here ? view.unit : null;
  const parts = [...massingFilters(Boolean(dev.models), floor), ...floorFilters(floor, unit)];
  if (dev.models) parts.push(["models", modelFilter(floor)]);
  const filters: CondoFilterUpdate[] = parts.map(([part, filter]) => [condoLayerId(dev.slug, part), filter]);
  return { filters, paint: paintUpdates(dev, unit) };
}

/** The layers a click looks in, and which development and unit a hit belongs to. */
export function condoPickLayers(slugs: readonly string[]): string[] {
  return slugs.map((slug) => condoLayerId(slug, "pick"));
}

export function condoPickTarget(layerId: string | undefined, unit: unknown, slugs: readonly string[]) {
  const slug = slugs.find((candidate) => layerId === condoLayerId(candidate, "pick"));
  return slug && typeof unit === "string" ? { slug, unit } : null;
}
