/**
 * Whether a PDF fill colour is light: white or nearly (14 Nov 2026). A CAD plot fills a window's frame or a room's
 * floor white to mask what lies under it (Tengah's windows); only a dark fill is a solid wall or column. pdf.js hands
 * the colour of `setFillRGBColor` as "#rrggbb".
 */
export function isLightFillColour(args: unknown): boolean {
  const hex = Array.isArray(args) && typeof args[0] === "string" ? args[0] : "";
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return false;
  const [r, g, b] = match.slice(1).map((part) => parseInt(part, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b >= 0.85;
}
