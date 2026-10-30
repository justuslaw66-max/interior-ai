import type { CondoDevelopmentMap, CondoUnitPlan, LonLat } from "@/lib/condo-map/condo-map-data";
import type { Ring } from "@/lib/condo-map/condo-map-geometry";
import { condoMapOptions, hideBasemapBuildingsOnSites } from "./condo-map-basemap";
import {
  CONDO_PLAN_LIFT_M,
  condoLayerId,
  condoLayers,
  condoModelSlug,
  condoModels,
  condoPickLayers,
  condoPickTarget,
  condoPlanImage,
  condoPlanLayer,
  condoPlanSourceId,
  condoSources,
  condoViewUpdates,
} from "./condo-map-layers";
import { boundsAround, liftPixels, unitOutOfView, type CondoMapView, type CondoMapsBySlug } from "./condo-map-view";
import type { MapboxBounds, MapboxEvent, MapboxGlobal, MapboxMap } from "./mapbox-gl-types";

/**
 * The admin condo map's work on the Mapbox map itself, outside React: making the map, adding a development, applying a
 * view, picking a unit and keeping Mapbox's old buildings off the sites. The hooks call these from their effects.
 */
export type CondoPick = { slug: string; unit: string };

const DATA_ROUTE = "/api/admin/condo-map/";

/** What failed before the map's style loaded, in a few words: the answer's status and the server, or Mapbox's message. */
export function loadError(status: number | undefined, url: string, message: string | undefined): string {
  let host = "";
  try {
    host = url ? new URL(url).host : "";
  } catch {
    host = "";
  }
  if (status) return host ? `${host} answered ${status}` : `a request answered ${status}`;
  return message || "a request failed";
}

/** Why the map isn't up, in the words the page shows: a refused token, a failed load, or a load that is taking long. */
export function mapProblem(state: { map: MapboxMap | null; refused: number | null; loadFailed: string | null; slow: boolean }): string | null {
  if (state.refused) return `Mapbox refused the token (${state.refused}). Check MAPBOX_PUBLIC_TOKEN and the addresses it is restricted to.`;
  if (state.map) return null;
  if (state.loadFailed) return `The map didn't load: ${state.loadFailed}. Check the network (api.mapbox.com) and reload.`;
  if (state.slow) return "The map is taking long to load. It may be blocked on this network (api.mapbox.com); it keeps trying.";
  return null;
}

export function createCondoMap(
  gl: MapboxGlobal,
  container: HTMLElement,
  token: string,
  bounds: MapboxBounds | undefined,
  handlers: {
    onStyle: (map: MapboxMap) => void;
    onTokenRefused: (status: number) => void;
    /** an error before the style loaded (style, sprite or glyph request failed): the map won't come up by itself */
    onLoadFailed: (detail: string) => void;
    /** one of a detailed development's models failed: that development is drawn as massing */
    onModelFailed: (slug: string) => void;
  }
): MapboxMap {
  const origin = window.location.origin;
  const map = new gl.Map({
    ...condoMapOptions(container, token, bounds),
    // the models come from the admin data route, which needs the admin's session cookie
    transformRequest: (url) => (url.startsWith(`${origin}${DATA_ROUTE}`) ? { url, credentials: "same-origin" } : { url }),
  });
  map.addControl(new gl.NavigationControl({ visualizePitch: true }), "bottom-right");
  map.on("style.load", () => handlers.onStyle(map));
  map.on("error", (event: MapboxEvent) => {
    const status = event.error?.status;
    const url = event.error?.url ?? "";
    if (url.includes("mapbox.com") && (status === 401 || status === 403)) return handlers.onTokenRefused(status);
    const modelOf = condoModelSlug(url);
    if (modelOf) return handlers.onModelFailed(modelOf);
    if (!map.isStyleLoaded()) handlers.onLoadFailed(loadError(status, url, event.error?.message));
  });
  return map;
}

export function addCondoDevelopment(map: MapboxMap, dev: CondoDevelopmentMap, origin: string): void {
  for (const [id, path] of condoModels(dev)) map.addModel(id, new URL(path, origin).href);
  for (const [id, source] of condoSources(dev)) map.addSource(id, source);
  for (const layer of condoLayers(dev)) map.addLayer(layer);
}

export function applyCondoView(map: MapboxMap, dev: CondoDevelopmentMap, view: CondoMapView, modelsFailed: boolean, origin: string): void {
  const { filters, paint, plan } = condoViewUpdates(dev, view, modelsFailed);
  for (const [layerId, filter] of filters) if (map.getLayer(layerId)) map.setFilter(layerId, filter);
  for (const [layerId, property, value] of paint) if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value);
  showCondoPlan(map, dev.slug, plan, origin);
}

// the plan each map shows for each development (its picture and corners), so an unchanged view doesn't load it again
const SHOWN_PLANS = new WeakMap<MapboxMap, Map<string, string>>();

/**
 * A development's chosen unit's plan on its floor, or none. Its picture source and layer are made the first time one
 * shows (most developments are never chosen), then pointed at the next plan; with none, the layer is hidden.
 */
export function showCondoPlan(map: MapboxMap, slug: string, plan: CondoUnitPlan | null, origin: string): void {
  const layerId = condoLayerId(slug, "plan");
  const shown = SHOWN_PLANS.get(map) ?? new Map<string, string>();
  SHOWN_PLANS.set(map, shown);
  if (!plan) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "none");
    return;
  }
  const image = condoPlanImage(slug, plan, origin);
  const key = JSON.stringify(image);
  const source = map.getSource(condoPlanSourceId(slug));
  if (!source) map.addSource(condoPlanSourceId(slug), { type: "image", ...image });
  else if (shown.get(slug) !== key) source.updateImage(image);
  shown.set(slug, key);
  if (!map.getLayer(layerId)) map.addLayer(condoPlanLayer(slug, plan));
  else map.setPaintProperty(layerId, "raster-elevation", plan.z + CONDO_PLAN_LIFT_M);
  map.setLayoutProperty(layerId, "visibility", "visible");
}

/** Clicks on a unit pick it (or, off every unit, nothing); the pointer shows a hand over one. Returns the unbinding. */
export function bindCondoPicking(map: MapboxMap, slugs: readonly string[], onPick: (pick: CondoPick | null) => void): () => void {
  const pickAt = (event: MapboxEvent): CondoPick | null => {
    const layers = condoPickLayers(slugs).filter((id) => map.getLayer(id));
    if (!event.point || layers.length === 0) return null;
    const hits = map.queryRenderedFeatures(event.point, { layers });
    return hits.map((hit) => condoPickTarget(hit.layer?.id, hit.properties?.unit, slugs)).find((pick) => pick !== null) ?? null;
  };
  const onClick = (event: MapboxEvent) => onPick(pickAt(event));
  const onMove = (event: MapboxEvent) => {
    map.getCanvas().style.cursor = pickAt(event) ? "pointer" : "";
  };
  map.on("click", onClick);
  map.on("mousemove", onMove);
  return () => {
    map.off("click", onClick);
    map.off("mousemove", onMove);
  };
}

/** The outlines Mapbox's own buildings must keep off: each development's clip polygons' outer rings. */
export function condoSiteRings(maps: CondoMapsBySlug): Ring[] {
  return Object.values(maps).flatMap((dev) => dev.clip.map((polygon) => polygon[0]));
}

export function keepBasemapOffSites(map: MapboxMap, sites: readonly Ring[], hidden: Set<string | number>): () => void {
  const onIdle = () => {
    hideBasemapBuildingsOnSites(map, sites, hidden);
  };
  map.on("idle", onIdle);
  onIdle();
  return () => map.off("idle", onIdle);
}

export const CONDO_FOCUS_CAMERA = { padding: 64, pitch: 50, bearing: -35, maxZoom: 18.6, duration: 900 } as const;

/**
 * A chosen unit kept in view (28 Oct 2026: #03-02 of 32 Gilstead was framed at the map's right edge, partly cut off).
 * Once the camera settles (a development's framing may still be moving), a unit whose outline at its storey isn't
 * inside the map with a margin is brought to the middle, keeping the zoom, tilt and turn. A move the user makes is left
 * alone. Returns the cancelling, for a newer choice or the map going.
 */
export function keepUnitInView(map: MapboxMap, part: { ring: LonLat[]; base: number }): () => void {
  let live = true;
  const check = (event?: MapboxEvent) => {
    if (!live || event?.originalEvent) return;
    live = false;
    const canvas = map.getCanvas();
    const box = boundsAround(part.ring);
    if (!box) return;
    const centre: LonLat = [(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2];
    const lift = liftPixels(part.base, centre[1], map.getZoom(), map.getPitch());
    const points = part.ring.map((point) => map.project(point));
    if (!unitOutOfView(points, lift, canvas.clientWidth, canvas.clientHeight)) return;
    // the target ends `lift` below the middle, so the unit, standing that much higher on screen, is in the middle
    map.easeTo({ center: centre, offset: [0, lift], duration: 600 });
  };
  if (map.isMoving()) map.once("moveend", check);
  else check();
  return () => {
    live = false;
    map.off("moveend", check);
  };
}
