/**
 * The part of Mapbox GL JS (v3, loaded from its CDN by useMapboxGl) that the admin condo map uses. Mapbox isn't a
 * dependency of the app: the map is an admin preview, and its 1.5 MB library loads only on this page.
 */
export type MapboxJson = string | number | boolean | null | MapboxJson[] | { [key: string]: MapboxJson };

export type MapboxLayer = {
  id: string;
  type: string;
  source?: string;
  slot?: string;
  filter?: MapboxJson;
  layout?: Record<string, MapboxJson>;
  paint?: Record<string, MapboxJson>;
};

export type MapboxGeometry = { type: string; coordinates: unknown };

export type MapboxRenderedFeature = {
  id?: string | number;
  layer?: { id: string };
  properties?: Record<string, unknown> | null;
  geometry?: MapboxGeometry | null;
};

export type MapboxPoint = { x: number; y: number };

/**
 * What the map hands its listeners: a pointer event's point, or an error event's error; a move the user made (a drag, a
 * scroll) carries the browser's own event.
 */
export type MapboxEvent = { point?: MapboxPoint; error?: { message?: string; status?: number; url?: string }; originalEvent?: unknown };

export type MapboxBounds = [[number, number], [number, number]];

export type MapboxCamera = {
  padding?: number | { top: number; bottom: number; left: number; right: number };
  pitch?: number;
  bearing?: number;
  maxZoom?: number;
  duration?: number;
};

export interface MapboxMap {
  on(type: string, listener: (event: MapboxEvent) => void): void;
  once(type: string, listener: (event: MapboxEvent) => void): void;
  off(type: string, listener: (event: MapboxEvent) => void): void;
  addSource(id: string, source: Record<string, MapboxJson>): void;
  addLayer(layer: MapboxLayer): void;
  getLayer(id: string): unknown;
  setFilter(layerId: string, filter: MapboxJson): void;
  setPaintProperty(layerId: string, name: string, value: MapboxJson): void;
  addModel(id: string, url: string): void;
  addControl(control: unknown, position?: string): void;
  queryRenderedFeatures(point: MapboxPoint, options: { layers: string[] }): MapboxRenderedFeature[];
  queryRenderedFeatures(options: { target: { featuresetId: string; importId: string } }): MapboxRenderedFeature[];
  setFeatureState(feature: MapboxRenderedFeature, state: Record<string, boolean>): void;
  getCanvas(): HTMLCanvasElement;
  getZoom(): number;
  getPitch(): number;
  setConfigProperty(importId: string, name: string, value: MapboxJson): void;
  isMoving(): boolean;
  project(lngLat: [number, number]): MapboxPoint;
  easeTo(options: { center: [number, number]; offset?: [number, number]; duration?: number }): void;
  isStyleLoaded(): boolean;
  fitBounds(bounds: MapboxBounds, options?: MapboxCamera): void;
  remove(): void;
}

export type MapboxMapOptions = {
  container: HTMLElement;
  accessToken: string;
  style: string;
  config?: Record<string, Record<string, MapboxJson>>;
  bounds?: MapboxBounds;
  fitBoundsOptions?: MapboxCamera;
  pitch?: number;
  bearing?: number;
  maxPitch?: number;
  antialias?: boolean;
  transformRequest?: (url: string) => { url: string; credentials?: "same-origin" | "include" | "omit" };
};

export type MapboxGlobal = {
  version: string;
  Map: new (options: MapboxMapOptions) => MapboxMap;
  NavigationControl: new (options?: { visualizePitch?: boolean }) => unknown;
};

declare global {
  interface Window {
    /** Mapbox GL's own global, once useMapboxGl has loaded its script. */
    mapboxgl?: MapboxGlobal;
  }
}
