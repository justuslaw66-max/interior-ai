import { outerRings, ringsMeet, type Ring } from "@/lib/condo-map/condo-map-geometry";
import type { MapboxJson, MapboxMap, MapboxMapOptions, MapboxRenderedFeature } from "./mapbox-gl-types";

/**
 * Mapbox's own map under the developments: its Standard style in daylight, with a "selected" building drawn clear, so
 * the page can take away what Mapbox draws of the old building on a site (hideBasemapBuildingsOnSites).
 */
export const CONDO_MAP_STYLE = "mapbox://styles/mapbox/standard";
export const CONDO_MAP_CONFIG: Record<string, Record<string, MapboxJson>> = {
  basemap: { lightPreset: "day", colorBuildingSelect: "rgba(0,0,0,0)" },
};

export function condoMapOptions(container: HTMLElement, accessToken: string, bounds: MapboxMapOptions["bounds"]): MapboxMapOptions {
  return {
    container,
    accessToken,
    style: CONDO_MAP_STYLE,
    config: CONDO_MAP_CONFIG,
    bounds,
    fitBoundsOptions: { padding: 48, maxZoom: 16 },
    pitch: 48,
    bearing: -35,
    maxPitch: 80,
    antialias: true,
  };
}

/**
 * The clip layer takes away Mapbox's buildings inside each site, but a browser can still draw one (Safari did, 24 Oct
 * 2026: a 3 m box standing out of 33 Residences' south-west corner). Any map building the sites' clip outlines touch
 * is made "selected", which the config above draws clear. Runs whenever the map settles; returns how many it hid.
 */
export function hideBasemapBuildingsOnSites(map: MapboxMap, sites: readonly Ring[], hidden: Set<string | number>): number {
  if (sites.length === 0 || map.getZoom() < 15) return 0;
  let features: MapboxRenderedFeature[];
  try {
    features = map.queryRenderedFeatures({ target: { featuresetId: "buildings", importId: "basemap" } });
  } catch {
    return 0;
  }
  let count = 0;
  for (const feature of features) {
    if (feature.id === undefined || hidden.has(feature.id)) continue;
    if (!outerRings(feature.geometry).some((ring) => sites.some((site) => ringsMeet(ring, site)))) continue;
    map.setFeatureState(feature, { select: true });
    hidden.add(feature.id);
    count += 1;
  }
  return count;
}
