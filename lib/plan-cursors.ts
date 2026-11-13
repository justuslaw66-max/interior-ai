/**
 * The plan's own pointer cursors (J, 13 Nov 2026): playful, soft "sweet" shapes instead of the
 * browser's arrows, in three styles the customer picks in Preferences, plus Standard (the browser's
 * own cursors, for anyone who finds the others distracting or relies on system cursor settings).
 * Each is a 32 px SVG with its hot spot in the middle; the resize cursor is turned to the handle's
 * exact direction, so a turned block's handles point the way they move. A browser that cannot show
 * an SVG cursor falls back to the nearest standard one.
 */
import { getPlanCursorTheme, type PlanCursorTheme } from "@/lib/plan-cursor-preference";

const SIZE = 32;
const HOT_SPOT = SIZE / 2;
const INK = "#2b2b2e";
const SHINE = "#ffffff";

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

const shine = (d: string) => `<path d="${d}" fill="none" stroke="${SHINE}" stroke-width="1.4" stroke-linecap="round"/>`;
const sprinkle = (d: string, colour: string) => `<path d="${d}" stroke="${colour}" stroke-width="1.5" stroke-linecap="round"/>`;
/** A soft, rounded shape drawn as a thick line: the edge colour under, the fill colour over. */
const puffy = (d: string, fill: string, edge: string) =>
  `<path d="${d}" fill="none" stroke="${edge}" stroke-width="8.6" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="none" stroke="${fill}" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round"/>`;

const PUFFY_ARROW = "M4.5 16 H27.5 M9 11.2 L4.5 16 L9 20.8 M23 11.2 L27.5 16 L23 20.8";
const PUFFY_RING = "M9.6 22.4 A9 9 0 1 1 22.4 22.4 M26.6 21.4 L22.4 22.4 L21.6 18.2";
const GUMMY_ARROW =
  "M3 16 L9 10.6 Q10.4 9.6 10.8 11 V12.6 H21.2 V11 Q21.6 9.6 23 10.6 L29 16 L23 21.4 Q21.6 22.4 21.2 21 V19.4 H10.8 V21 Q10.4 22.4 9 21.4 Z";
const GUMMY_RING = "M9.6 22.4 A9 9 0 1 1 22.4 22.4";
const PEACH = "#FFB4A2";
const CREAM = "#FFF6EA";
const ROSE = "#D9668A";
const MINT = "#8FE3C8";

type SweetStyle = { resize: string; rotate: string };

/** The drawings, in a 32 × 32 box, for the three sweet styles; the resize one lies left–right. */
const SWEET_STYLES: Record<Exclude<PlanCursorTheme, "standard">, SweetStyle> = {
  gummy: {
    resize: `<path d="${GUMMY_ARROW}" fill="${PEACH}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>` + shine("M12.6 14.2 H17.2"),
    rotate:
      `<path d="${GUMMY_RING}" fill="none" stroke="${INK}" stroke-width="7.6" stroke-linecap="round"/>` +
      `<path d="${GUMMY_RING}" fill="none" stroke="${PEACH}" stroke-width="4.6" stroke-linecap="round"/>` +
      `<polygon points="26.4,25.6 19.4,19.4 18.4,27.6" fill="${PEACH}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>` +
      shine("M10.2 11.2 A8 8 0 0 1 14 8.2"),
  },
  marshmallow: {
    resize: puffy(PUFFY_ARROW, CREAM, ROSE) + shine("M11.5 14.9 H14.5"),
    rotate: puffy(PUFFY_RING, CREAM, ROSE) + shine("M10.6 11.6 A7 7 0 0 1 13.6 9.2"),
  },
  sprinkles: {
    resize: puffy(PUFFY_ARROW, MINT, INK) + sprinkle("M12 15.4 L13.6 16.6", "#FF7E95") + sprinkle("M18.4 16.6 L20 15.4", "#FFD34D"),
    rotate:
      puffy(PUFFY_RING, MINT, INK) +
      sprinkle("M8.2 13 L9.6 11.4", "#FF7E95") +
      sprinkle("M15.2 7 L16.8 7.2", "#FFD34D") +
      sprinkle("M23 10.4 L24 12.2", "#6EA8FF"),
  },
};

/** The SVG for a sweet style's drawing, turned by `angle` degrees about its middle. */
export function planCursorSvg(theme: Exclude<PlanCursorTheme, "standard">, kind: keyof SweetStyle, angle = 0): string {
  const body = SWEET_STYLES[theme][kind];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><g transform="rotate(${angle} ${HOT_SPOT} ${HOT_SPOT})">${body}</g></svg>`;
}

const svgCursor = (svg: string, fallback: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${HOT_SPOT} ${HOT_SPOT}, ${fallback}`;

const cursors = new Map<string, string>();
function cached(key: string, make: () => string): string {
  let cursor = cursors.get(key);
  if (!cursor) {
    cursor = make();
    cursors.set(key, cursor);
  }
  return cursor;
}

/**
 * The resize cursor for a handle whose drag direction on screen is (directionX, directionZ), in the
 * customer's chosen style (lib/plan-cursor-preference.ts).
 */
export function planResizeCursor(directionX: number, directionZ: number, theme: PlanCursorTheme = getPlanCursorTheme()): string {
  const fallback = nativeResizeCursor(directionX, directionZ);
  if (theme === "standard") return fallback;
  const angle = resizeCursorAngle(directionX, directionZ);
  return cached(`${theme}:resize:${angle}`, () => svgCursor(planCursorSvg(theme, "resize", angle), fallback));
}

/** The cursor over an item's rotate handle and while turning it, in the chosen style. */
export function planRotateCursor(theme: PlanCursorTheme = getPlanCursorTheme()): string {
  if (theme === "standard") return "grab";
  return cached(`${theme}:rotate`, () => svgCursor(planCursorSvg(theme, "rotate"), "grab"));
}
