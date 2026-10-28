"use client";

import { useSyncExternalStore } from "react";

/**
 * Which scheme the page shows, for the canvases (dark mode PR 4, 28 Oct). The 2D plan and the 3D
 * view are drawn in WebGL, which can't read the colour tokens, so they ask for the scheme instead:
 * the computed `color-scheme` of `<html>`, which the token blocks in globals.css set. It follows
 * `data-color-scheme` and, once the app follows the device, the device's setting.
 */
export type CanvasColourScheme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();
let watched: CanvasColourScheme | null = null;
let stopWatching: (() => void) | null = null;

function readScheme(): CanvasColourScheme {
  const value = getComputedStyle(document.documentElement).getPropertyValue("color-scheme");
  const schemes = value.trim().split(/\s+/);
  if (!schemes.includes("dark")) return "light";
  if (!schemes.includes("light")) return "dark";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function refresh() {
  const next = readScheme();
  if (next === watched) return;
  watched = next;
  listeners.forEach((listener) => listener());
}

function watch() {
  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-color-scheme", "class", "style"] });
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", refresh);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", refresh);
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!stopWatching) {
    watched = readScheme();
    stopWatching = watch();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0 || !stopWatching) return;
    stopWatching();
    stopWatching = null;
    watched = null;
  };
}

/** One read per change while anything is watching; a fresh read before the first subscriber. */
function getSnapshot(): CanvasColourScheme {
  return watched ?? readScheme();
}

/** The server and hydration draw light, then the page's scheme takes over. */
function getServerSnapshot(): CanvasColourScheme {
  return "light";
}

export function useCanvasColourScheme(): CanvasColourScheme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
