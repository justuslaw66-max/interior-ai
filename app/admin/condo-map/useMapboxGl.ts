import { useEffect, useState } from "react";
import type { MapboxGlobal } from "./mapbox-gl-types";

/**
 * Mapbox GL JS for the admin condo map, from jsDelivr's copy of the npm release (the Mapbox prototype's source, proven
 * in Safari on 24 Oct 2026). Each file is pinned to its exact version and checked by its SRI hash (taken from the
 * files jsDelivr served on 24 Oct 2026), so a changed file doesn't run. Loaded once per page, and only when the page
 * has a token to use it with. A new version needs both hashes again.
 */
export const MAPBOX_GL_VERSION = "3.31.0";
const CDN = `https://cdn.jsdelivr.net/npm/mapbox-gl@${MAPBOX_GL_VERSION}/dist`;
export const MAPBOX_GL_FILES = {
  script: { url: `${CDN}/mapbox-gl.js`, integrity: "sha384-NqIyzgfZwfTxxOnsv012sqQ5YuVZu8PT+1RmXe38XJj49M0JrKGzrTZnkBVzmQEt" },
  style: { url: `${CDN}/mapbox-gl.css`, integrity: "sha384-WR3U1V0+1MbG/yqoN2/UUbE92aMWypbO0XZyEPFDxl2zZgg3ppqJGUq3gqgaEZbX" },
} as const;

let loading: Promise<MapboxGlobal> | null = null;

function appendStyle(): void {
  if (document.querySelector(`link[href="${MAPBOX_GL_FILES.style.url}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = MAPBOX_GL_FILES.style.url;
  link.integrity = MAPBOX_GL_FILES.style.integrity;
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
}

function appendScript(resolve: (gl: MapboxGlobal) => void, reject: (cause: Error) => void): void {
  const script = document.createElement("script");
  script.src = MAPBOX_GL_FILES.script.url;
  script.integrity = MAPBOX_GL_FILES.script.integrity;
  script.crossOrigin = "anonymous";
  script.async = true;
  script.onload = () => {
    const gl = window.mapboxgl;
    if (gl) resolve(gl);
    else reject(new Error("Mapbox GL loaded without its mapboxgl global."));
  };
  script.onerror = () => {
    script.remove();
    reject(new Error(`Mapbox GL ${MAPBOX_GL_VERSION} didn't load from jsDelivr.`));
  };
  document.head.appendChild(script);
}

export function loadMapboxGl(): Promise<MapboxGlobal> {
  const ready = window.mapboxgl;
  if (ready) return Promise.resolve(ready);
  if (!loading) {
    loading = new Promise<MapboxGlobal>((resolve, reject) => {
      appendStyle();
      appendScript(resolve, reject);
    });
    // a failed load can be tried again (the next time the page mounts)
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

export type MapboxGlState = { gl: MapboxGlobal | null; error: string | null };

export function useMapboxGl(wanted: boolean): MapboxGlState {
  const [state, setState] = useState<MapboxGlState>({ gl: null, error: null });
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    loadMapboxGl().then(
      (gl) => {
        if (live) setState({ gl, error: null });
      },
      (cause: unknown) => {
        if (live) setState({ gl: null, error: cause instanceof Error ? cause.message : "Mapbox GL didn't load." });
      }
    );
    return () => {
      live = false;
    };
  }, [wanted]);
  return state;
}
