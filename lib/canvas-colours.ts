"use client";

import { useCanvasColourScheme } from "./canvas-colour-scheme";

/**
 * The canvases' colours in dark (dark mode PR 4, J 28 Oct). The 2D plan, the 3D view's
 * surroundings and the previews are drawn in WebGL and with inline styles, so each colour is
 * written as its light value, today's, and swapped here for its dark one: dark paper (#1C1C1E,
 * the canvas card) with light lines, Apple's dark green, blue, orange and red, labels floating
 * at #2C2C2E. Translucent colours keep their alpha. A colour that isn't listed stays as written.
 *
 * Not swapped: what is the real room (paint, finishes, textures, product colours, lighting).
 */
const DARK_HEX: Readonly<Record<string, string>> = {
  // The paper, the 3D view's ground, white fills (handles, Pro's rooms, dots) and grids.
  "#f4f2ed": "#1c1c1e",
  "#f3f5f5": "#232325",
  "#ffffff": "#2c2c2e",
  "#fafafa": "#262628",
  "#ebe8df": "#3f3e3c",
  "#fff7ed": "#2c2c2e",
  "#f8fafc": "#2c2c2e",
  "#d8d8d8": "#2c2c2e",
  "#e1e1e1": "#2c2c2e",
  "#c8c8c8": "#3a3a3c",
  "#c4c4c4": "#3a3a3c",
  "#000000": "#48484a",
  // Lines and words that are dark on light paper turn light.
  "#111111": "#e5e5ea",
  "#9a9a9a": "#aeaeb2",
  "#d4d4d8": "#8e8e93",
  "#111827": "#f5f5f7",
  "#171717": "#f5f5f7",
  "#0f172a": "#f5f5f7",
  "#1f2937": "#e5e5ea",
  "#3f3f46": "#c7c7cc",
  "#374151": "#c7c7cc",
  "#38424c": "#c7c7cc",
  "#4b5563": "#aeaeb2",
  "#525252": "#aeaeb2",
  "#52525b": "#8e8e93",
  "#71717a": "#8e8e93",
  "#9ca3af": "#8e8e93",
  "#64748b": "#8e8e93",
  "#5f6770": "#98989d",
  "#6b7280": "#98989d",
  // Fixed elements and the imported plan's structures: dimmed fills.
  "#e5e7eb": "#3a3a3c",
  "#d7d7d7": "#333335",
  "#e2ddd3": "#3a3936",
  "#bfdbfe": "#2d4a6e",
  "#fde68a": "#6b5a2a",
  "#cbd5e1": "#48505c",
  "#94a3b8": "#6b7585",
  "#d1d5db": "#48484c",
  // Green: the room you're in, its dimensions, selection, snapping.
  "#22c55e": "#30d158",
  "#16a34a": "#30d158",
  "#15803d": "#30d158",
  "#10b981": "#30d158",
  "#047857": "#30d158",
  "#4ea81f": "#30d158",
  "#166534": "#30d158",
  "#14532d": "#30d158",
  // Blue: windows, snapping, previews; blue words a step lighter; the selected piece.
  "#2563eb": "#409cff",
  "#3b82f6": "#409cff",
  "#2080ff": "#409cff",
  "#0369a1": "#409cff",
  "#0284c7": "#409cff",
  "#0891b2": "#409cff",
  "#38bdf8": "#409cff",
  "#60a5fa": "#409cff",
  "#1d4ed8": "#64b0ff",
  "#1e3a8a": "#64b0ff",
  "#2a66ff": "#0a84ff",
  // Orange: doors, blocked moves, what's being placed.
  "#f97316": "#ff9f0a",
  "#ea580c": "#ff9f0a",
  "#c2410c": "#ff9f0a",
  "#d97706": "#ff9f0a",
  "#9a3412": "#ff9f0a",
  "#f59e0b": "#ffd60a",
  // Teal (zones, hover), red (overlaps, unresolved openings, Delete) and pink.
  "#0f766e": "#40c8e0",
  "#115e59": "#40c8e0",
  "#14b8a6": "#40c8e0",
  "#0ea5a0": "#40c8e0",
  "#dc2626": "#ff453a",
  "#d91f1f": "#ff453a",
  "#ef4444": "#ff453a",
  "#991b1b": "#ff8a84",
  "#db2777": "#ff375f",
  // Tinted fills: a blocked room, Delete's button, a piece that doesn't fit.
  "#fed7aa": "#604318",
  "#fee2e2": "#52302f",
  "#f8b6b6": "#6e3433",
  // The selected piece's Rotate and Copy buttons.
  "#f3f4f6": "#3a3a3c",
};

/** Translucent colours, by their red, green and blue; the alpha stays. */
const DARK_RGB: Readonly<Record<string, string>> = {
  // The labels' light backgrounds float at #2C2C2E; the pressed green and grey buttons.
  "255,255,255": "44,44,46",
  "240,253,244": "44,44,46",
  "239,246,255": "44,44,46",
  "255,247,237": "44,44,46",
  "240,253,250": "44,44,46",
  "254,242,242": "44,44,46",
  "209,250,229": "45,80,55",
  "220,252,231": "45,80,55",
  "243,244,246": "58,58,60",
  // Their edges and glows.
  "34,197,94": "48,209,88",
  "16,185,129": "48,209,88",
  "5,150,105": "48,209,88",
  "37,99,235": "64,156,255",
  "2,132,199": "64,156,255",
  "249,115,22": "255,159,10",
  "194,65,12": "255,159,10",
  "20,184,166": "64,200,224",
  "15,118,110": "64,200,224",
  "220,38,38": "255,69,58",
  "82,82,91": "142,142,147",
  "82,82,82": "142,142,147",
  "120,120,120": "142,142,147",
  "100,100,100": "142,142,147",
  "55,65,81": "142,142,147",
  "31,41,55": "142,142,147",
  "15,23,42": "0,0,0",
};

const HEX_PATTERN = /#[0-9a-fA-F]{6}\b/g;
const RGB_PATTERN = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g;

/** A light colour, or a CSS value holding some (a border, a shadow), with each colour in dark. */
export function darkCanvasColour(light: string): string {
  return light
    .replace(HEX_PATTERN, (hex) => DARK_HEX[hex.toLowerCase()] ?? hex)
    .replace(RGB_PATTERN, (match, red: string, green: string, blue: string, alpha?: string) => {
      const dark = DARK_RGB[`${red},${green},${blue}`];
      if (!dark) return match;
      return alpha === undefined ? `rgb(${dark})` : `rgba(${dark},${alpha})`;
    });
}

/** Whether a light colour has a dark value (the canvas tests check every one in use). */
export function hasDarkCanvasColour(light: string): boolean {
  return darkCanvasColour(light) !== light;
}

const DARK_PAPER = [28, 28, 30] as const;
const ACTIVE_FLOOR_SHARE = 0.21;
const OTHER_FLOOR_SHARE = 0.14;

/**
 * A floor's plan tint in dark (J, 28 Oct, question 1, A): its light tint mixed into the dark
 * paper, 21% for the room you're in and 14% for the others, so oak still reads warm.
 */
export function darkFloorTint(light: string, active: boolean): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(light)) return light;
  const share = active ? ACTIVE_FLOOR_SHARE : OTHER_FLOOR_SHARE;
  const channels = [1, 3, 5].map((start, index) => {
    const value = Number.parseInt(light.slice(start, start + 2), 16);
    const mixed = Math.round(DARK_PAPER[index] + (value - DARK_PAPER[index]) * share);
    return mixed.toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

export type CanvasPalette = {
  dark: boolean;
  /** The colour to draw for a light colour. */
  colour: (light: string) => string;
  /** The colour to draw for a floor's light plan tint. */
  floor: (light: string, active: boolean) => string;
};

const keepLight = (light: string) => light;
const LIGHT_PALETTE: CanvasPalette = { dark: false, colour: keepLight, floor: keepLight };
const DARK_PALETTE: CanvasPalette = { dark: true, colour: darkCanvasColour, floor: darkFloorTint };

export function canvasPalette(scheme: "light" | "dark"): CanvasPalette {
  return scheme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
}

/** The palette for the page's scheme; the same object until the scheme changes. */
export function useCanvasPalette(): CanvasPalette {
  return canvasPalette(useCanvasColourScheme());
}
