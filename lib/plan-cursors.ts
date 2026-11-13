/**
 * The plan's own pointer cursors (J, 13 Nov 2026: "help me to create my own symbol, clear and
 * understandable like Illustrator but different"). Each is a 32 px SVG with its hot spot in the
 * middle, white with a dark outline so it reads on the dark and the light plan, and a blue mark in
 * the app's selection colour at its centre: the handle being dragged. A browser that cannot show an
 * SVG cursor falls back to the nearest standard one.
 */

const OUTLINE = "#1c1c1e";
const FILL = "#ffffff";
const ACCENT = "#2a66ff";
const SIZE = 32;
const HOT_SPOT = SIZE / 2;

function svgCursor(body: string, fallback: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${HOT_SPOT} ${HOT_SPOT}, ${fallback}`;
}

/** The standard cursor nearest a direction on the plan (x right, z down): ew, ns, nwse or nesw. */
export function nativeResizeCursor(directionX: number, directionZ: number): string {
  const degrees = ((Math.atan2(directionZ, directionX) * 180) / Math.PI + 180) % 180;
  if (degrees < 22.5 || degrees >= 157.5) return "ew-resize";
  if (degrees < 67.5) return "nwse-resize";
  if (degrees < 112.5) return "ns-resize";
  return "nesw-resize";
}

/** Whole degrees in [0, 180), in 5° steps: a double arrow looks the same both ways round. */
export function resizeCursorAngle(directionX: number, directionZ: number): number {
  const degrees = (((Math.atan2(directionZ, directionX) * 180) / Math.PI) % 180 + 180) % 180;
  return (Math.round(degrees / 5) * 5) % 180;
}

/** A solid double arrow, turned to the handle's direction, with a small blue handle square at its middle. */
const RESIZE_ARROW =
  `<polygon points="3,16 10,9 10,13.5 22,13.5 22,9 29,16 22,23 22,18.5 10,18.5 10,23" ` +
  `fill="${FILL}" stroke="${OUTLINE}" stroke-width="1.6" stroke-linejoin="round"/>` +
  `<rect x="13.5" y="13.5" width="5" height="5" rx="1" fill="${ACCENT}" stroke="${FILL}" stroke-width="1"/>`;

const resizeCursors = new Map<number, string>();

/**
 * The resize cursor for a handle whose drag direction on screen is (directionX, directionZ). Unlike
 * the four standard cursors it follows the exact angle, so a turned block's handles point the way
 * they will move.
 */
export function planResizeCursor(directionX: number, directionZ: number): string {
  const angle = resizeCursorAngle(directionX, directionZ);
  let cursor = resizeCursors.get(angle);
  if (!cursor) {
    cursor = svgCursor(`<g transform="rotate(${angle} ${HOT_SPOT} ${HOT_SPOT})">${RESIZE_ARROW}</g>`, nativeResizeCursor(directionX, directionZ));
    resizeCursors.set(angle, cursor);
  }
  return cursor;
}

/**
 * Turning: three quarters of a circle with one arrowhead, round a blue pivot dot. The arc is drawn
 * twice, dark under white, for the outline.
 */
const ROTATE_ARC = "M10 22 A8.5 8.5 0 1 1 22 22";
const ROTATE_HEAD = "24.8,24.8 19.2,19.2 18.6,25.4";
export const PLAN_ROTATE_CURSOR = svgCursor(
  `<path d="${ROTATE_ARC}" fill="none" stroke="${OUTLINE}" stroke-width="5.4" stroke-linecap="round"/>` +
    `<polygon points="${ROTATE_HEAD}" fill="${OUTLINE}" stroke="${OUTLINE}" stroke-width="3.2" stroke-linejoin="round"/>` +
    `<path d="${ROTATE_ARC}" fill="none" stroke="${FILL}" stroke-width="2.6" stroke-linecap="round"/>` +
    `<polygon points="${ROTATE_HEAD}" fill="${FILL}" stroke="${FILL}" stroke-width="0.6" stroke-linejoin="round"/>` +
    `<circle cx="16" cy="16" r="2.6" fill="${ACCENT}" stroke="${FILL}" stroke-width="1"/>`,
  "grab"
);
