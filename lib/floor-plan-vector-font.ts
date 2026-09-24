import type { Font } from "@pdf-lib/fontkit";

export const PLAN_VECTOR_FONT_URL = "/fonts/liberation-sans/LiberationSans-Regular.ttf";
export const PLAN_VECTOR_FONT_FAMILY = "Liberation Sans";
export const PLAN_VECTOR_FONT_FEATURES = { kern: false, liga: false, clig: false };
let bundledFontBytes: Promise<Uint8Array> | undefined;

export async function loadPlanVectorFont(bytes?: Uint8Array) {
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  if (!bytes) {
    bundledFontBytes ??= fetch(PLAN_VECTOR_FONT_URL).then(async (response) => {
      if (!response.ok) throw new Error("The editable export font could not be loaded. Retry the export.");
      return new Uint8Array(await response.arrayBuffer());
    }).catch((cause: unknown) => { bundledFontBytes = undefined; throw cause; });
    bytes = await bundledFontBytes;
  }
  if (bytes.length > 2_000_000) throw new Error("The export font exceeds the supported size.");
  return { fontkit, bytes, font: fontkit.create(bytes) };
}

/** Match PDF's unpositioned editable glyph advances; SVG disables the same kerning/ligature features. */
export function vectorTextMetrics(font: Font, text: string, size: number) {
  if (text.length > 1000 || /[\r\n]/.test(text)) throw new Error("Export labels must fit on one line. Shorten the label or turn Labels off.");
  const missing = [...new Set([...text].filter((character) => !font.hasGlyphForCodePoint(character.codePointAt(0)!)))];
  if (missing.length) throw new Error(`Liberation Sans does not contain ${missing.slice(0, 4).join(" ")}. Correct that text or turn Labels off; text has not been removed or outlined.`);
  const run = font.layout(text, PLAN_VECTOR_FONT_FEATURES);
  if (run.direction === "rtl" || run.positions.some((position) => position.xOffset || position.yOffset || position.yAdvance)) {
    throw new Error("This text needs shaping the editable exporter cannot yet preserve. Correct the label or turn Labels off.");
  }
  const ratio = size / font.unitsPerEm, advance = run.glyphs.reduce((sum, glyph) => sum + glyph.advanceWidth, 0) * ratio;
  const box = run.bbox, visible = [box.minX, box.minY, box.maxX, box.maxY].every(Number.isFinite);
  return { advance, left: visible ? box.minX * ratio : 0, right: visible ? box.maxX * ratio : advance,
    top: visible ? -box.maxY * ratio : 0, bottom: visible ? -box.minY * ratio : 0 };
}

export function vectorFontDataUrl(bytes: Uint8Array) {
  return `data:font/ttf;base64,${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))}`;
}
