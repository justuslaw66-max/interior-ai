import type { CondoDevelopmentMap } from "@/lib/condo-map/condo-map-data";
import type { Ring } from "@/lib/condo-map/condo-map-geometry";
import { condoMapOptions, hideBasemapBuildingsOnSites } from "./condo-map-basemap";
import { condoLayers, condoModels, condoPickLayers, condoPickTarget, condoSources, condoViewUpdates } from "./condo-map-layers";
import type { CondoMapView, CondoMapsBySlug } from "./condo-map-view";
import type { MapboxBounds, MapboxEvent, MapboxGlobal, MapboxMap } from "./mapbox-gl-types";

/**
 * The admin condo map's work on the Mapbox map itself, outside React: making the map, adding a development, applying a
 * view, picking a unit and keeping Mapbox's old buildings off the sites. The hooks call these from their effects.
 */
export type CondoPick = { slug: string; unit: string };

const DATA_ROUTE = "/api/admin/condo-map/";

export function createCondoMap(
  gl: MapboxGlobal,
  container: HTMLElement,
  token: string,
  bounds: MapboxBounds | undefined,
  handlers: { onStyle: (map: MapboxMap) => void; onTokenRefused: (status: number) => void }
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
    const fromMapbox = (event.error?.url ?? "").includes("mapbox.com");
    if (fromMapbox && (status === 401 || status === 403)) handlers.onTokenRefused(status);
  });
  return map;
}

export function addCondoDevelopment(map: MapboxMap, dev: CondoDevelopmentMap, origin: string): void {
  for (const [id, path] of condoModels(dev)) map.addModel(id, new URL(path, origin).href);
  for (const [id, source] of condoSources(dev)) map.addSource(id, source);
  for (const layer of condoLayers(dev)) map.addLayer(layer);
}

export function applyCondoView(map: MapboxMap, dev: CondoDevelopmentMap, view: CondoMapView): void {
  const { filters, paint } = condoViewUpdates(dev, view);
  for (const [layerId, filter] of filters) if (map.getLayer(layerId)) map.setFilter(layerId, filter);
  for (const [layerId, property, value] of paint) if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value);
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
