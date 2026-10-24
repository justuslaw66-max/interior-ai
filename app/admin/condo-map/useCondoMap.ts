import { useEffect, useState } from "react";
import type { LonLat } from "@/lib/condo-map/condo-map-data";
import {
  CONDO_FOCUS_CAMERA,
  addCondoDevelopment,
  applyCondoView,
  bindCondoPicking,
  condoSiteRings,
  createCondoMap,
  keepBasemapOffSites,
  type CondoPick,
} from "./condo-map-mapbox";
import type { CondoMapView, CondoMapsBySlug } from "./condo-map-view";
import type { MapboxBounds, MapboxMap } from "./mapbox-gl-types";
import { useMapboxGl } from "./useMapboxGl";

/**
 * The admin condo map's Mapbox map in a container: made once Mapbox GL has loaded (and only with a token), then kept in
 * step with the developments as they arrive and with the view. The Mapbox work itself is in condo-map-mapbox.
 */
export type CondoMapStatus = { ready: boolean; problem: string | null };

type MapState = { map: MapboxMap | null; refused: number | null };

// which developments each map already has, so a new view only changes filters and colours
const ADDED = new WeakMap<MapboxMap, Set<string>>();
// the map buildings each map has hidden on the sites, kept as the map's own feature state
const HIDDEN = new WeakMap<MapboxMap, Set<string | number>>();

function useMapboxMap(token: string | null, container: HTMLElement | null, bounds: MapboxBounds | undefined) {
  const { gl, error } = useMapboxGl(token !== null);
  const [state, setState] = useState<MapState>({ map: null, refused: null });
  useEffect(() => {
    if (!gl || !token || !container) return;
    const map = createCondoMap(gl, container, token, bounds, {
      onStyle: (ready) => setState((current) => ({ ...current, map: ready })),
      onTokenRefused: (status) => setState((current) => ({ ...current, refused: status })),
    });
    return () => {
      map.remove();
      setState((current) => (current.map === map ? { ...current, map: null } : current));
    };
  }, [gl, token, container, bounds]);
  const refused = state.refused
    ? `Mapbox refused the token (${state.refused}). Check MAPBOX_PUBLIC_TOKEN and the addresses it is restricted to.`
    : null;
  return { map: state.map, problem: error ?? refused };
}

function useDevelopmentLayers(map: MapboxMap | null, maps: CondoMapsBySlug, view: CondoMapView) {
  useEffect(() => {
    if (!map) return;
    const added = ADDED.get(map) ?? new Set<string>();
    ADDED.set(map, added);
    for (const dev of Object.values(maps)) {
      if (!added.has(dev.slug)) {
        addCondoDevelopment(map, dev, window.location.origin);
        added.add(dev.slug);
      }
      applyCondoView(map, dev, view);
    }
  }, [map, maps, view]);
}

function useMapBehaviour(map: MapboxMap | null, maps: CondoMapsBySlug, onPick: (pick: CondoPick | null) => void) {
  const slugKey = Object.keys(maps).sort().join(",");
  useEffect(() => {
    if (!map) return;
    return bindCondoPicking(map, slugKey.split(",").filter(Boolean), onPick);
  }, [map, slugKey, onPick]);
  useEffect(() => {
    if (!map) return;
    const hidden = HIDDEN.get(map) ?? new Set<string | number>();
    HIDDEN.set(map, hidden);
    return keepBasemapOffSites(map, condoSiteRings(maps), hidden);
  }, [map, maps]);
}

/** A chosen development is brought into view (once it has loaded); choosing none leaves the camera where it is. */
function useFocus(map: MapboxMap | null, bounds: [LonLat, LonLat] | undefined) {
  useEffect(() => {
    if (map && bounds) map.fitBounds(bounds, CONDO_FOCUS_CAMERA);
  }, [map, bounds]);
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
  const { map, problem } = useMapboxMap(token, container, overview ?? undefined);
  useDevelopmentLayers(map, maps, view);
  useMapBehaviour(map, maps, onPick);
  useFocus(map, view.slug ? maps[view.slug]?.bounds : undefined);
  return { ready: map !== null, problem };
}
