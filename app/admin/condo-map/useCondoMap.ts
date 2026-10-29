import { useEffect, useMemo, useState } from "react";
import type { LonLat } from "@/lib/condo-map/condo-map-data";
import { hidePlaceLabelsWhenClose } from "./condo-map-basemap";
import {
  CONDO_FOCUS_CAMERA,
  addCondoDevelopment,
  applyCondoView,
  bindCondoPicking,
  condoSiteRings,
  createCondoMap,
  keepBasemapOffSites,
  keepUnitInView,
  mapProblem,
  type CondoPick,
} from "./condo-map-mapbox";
import { unitPartOn, type CondoMapView, type CondoMapsBySlug } from "./condo-map-view";
import type { MapboxBounds, MapboxMap } from "./mapbox-gl-types";
import { useMapboxGl } from "./useMapboxGl";

/**
 * The admin condo map's Mapbox map in a container: made once Mapbox GL has loaded (and only with a token), then kept in
 * step with the developments as they arrive and with the view. The Mapbox work itself is in condo-map-mapbox.
 */
export type CondoMapStatus = { ready: boolean; problem: string | null; modelsFailed: string[] };

type MapState = { map: MapboxMap | null; refused: number | null; loadFailed: string | null; slow: boolean; modelsFailed: string[] };

const NO_MAP: MapState = { map: null, refused: null, loadFailed: null, slow: false, modelsFailed: [] };
// how long the map's style may take before the page says so (it keeps waiting)
const SLOW_MS = 20000;

// which developments each map already has, so a new view only changes filters and colours
const ADDED = new WeakMap<MapboxMap, Set<string>>();
// the map buildings each map has hidden on the sites, kept as the map's own feature state
const HIDDEN = new WeakMap<MapboxMap, Set<string | number>>();

function useMapboxMap(token: string | null, container: HTMLElement | null, bounds: MapboxBounds | undefined) {
  const { gl, error } = useMapboxGl(token !== null);
  const [state, setState] = useState<MapState>(NO_MAP);
  useEffect(() => {
    if (!gl || !token || !container) return;
    const slow = window.setTimeout(() => setState((current) => (current.map ? current : { ...current, slow: true })), SLOW_MS);
    const map = createCondoMap(gl, container, token, bounds, {
      onStyle: (ready) => {
        window.clearTimeout(slow);
        setState((current) => ({ ...current, map: ready, loadFailed: null, slow: false }));
      },
      onTokenRefused: (status) => setState((current) => ({ ...current, refused: status })),
      onLoadFailed: (detail) => setState((current) => ({ ...current, loadFailed: current.loadFailed ?? detail })),
      onModelFailed: (slug) =>
        setState((current) => (current.modelsFailed.includes(slug) ? current : { ...current, modelsFailed: [...current.modelsFailed, slug] })),
    });
    return () => {
      window.clearTimeout(slow);
      map.remove();
      // a new map (or none) starts clean: no stale load error or model failures from this one
      setState(NO_MAP);
    };
  }, [gl, token, container, bounds]);
  return { map: state.map, problem: error ?? mapProblem(state), modelsFailed: state.modelsFailed };
}

function useDevelopmentLayers(map: MapboxMap | null, maps: CondoMapsBySlug, view: CondoMapView, modelsFailed: readonly string[]) {
  useEffect(() => {
    if (!map) return;
    const added = ADDED.get(map) ?? new Set<string>();
    ADDED.set(map, added);
    for (const dev of Object.values(maps)) {
      if (!added.has(dev.slug)) {
        addCondoDevelopment(map, dev, window.location.origin);
        added.add(dev.slug);
      }
      applyCondoView(map, dev, view, modelsFailed.includes(dev.slug));
    }
  }, [map, maps, view, modelsFailed]);
}

function useMapBehaviour(map: MapboxMap | null, maps: CondoMapsBySlug, onPick: (pick: CondoPick | null) => void) {
  const slugKey = Object.keys(maps).sort().join(",");
  useEffect(() => {
    if (!map) return;
    return bindCondoPicking(map, slugKey.split(",").filter(Boolean), onPick);
  }, [map, slugKey, onPick]);
  useEffect(() => (map ? hidePlaceLabelsWhenClose(map) : undefined), [map]);
  useEffect(() => {
    if (!map) return;
    const hidden = HIDDEN.get(map) ?? new Set<string | number>();
    HIDDEN.set(map, hidden);
    return keepBasemapOffSites(map, condoSiteRings(maps), hidden);
  }, [map, maps]);
}

/**
 * A chosen development is brought into view (once it has loaded), and then a chosen unit if the framing leaves it at
 * the map's edge; choosing none leaves the camera where it is.
 */
function useFocus(map: MapboxMap | null, maps: CondoMapsBySlug, view: CondoMapView) {
  const dev = view.slug ? maps[view.slug] : undefined;
  const bounds: [LonLat, LonLat] | undefined = dev?.bounds;
  useEffect(() => {
    if (map && bounds) map.fitBounds(bounds, CONDO_FOCUS_CAMERA);
  }, [map, bounds]);
  const part = useMemo(() => (dev && view.unit && view.floor !== null ? unitPartOn(dev, view.unit, view.floor) : null), [dev, view.unit, view.floor]);
  useEffect(() => (map && part ? keepUnitInView(map, part) : undefined), [map, part]);
}

export function useCondoMap(options: {
  token: string | null;
  container: HTMLElement | null;
  overview: [LonLat, LonLat] | null;
  maps: CondoMapsBySlug;
  view: CondoMapView;
  onPick: (pick: CondoPick | null) => void;
}): CondoMapStatus {
  const { token, container, overview, maps, view, onPick } = options;
  const { map, problem, modelsFailed } = useMapboxMap(token, container, overview ?? undefined);
  useDevelopmentLayers(map, maps, view, modelsFailed);
  useMapBehaviour(map, maps, onPick);
  useFocus(map, maps, view);
  return { ready: map !== null, problem, modelsFailed };
}
