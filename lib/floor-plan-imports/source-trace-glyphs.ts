import type { SourceTextEvidence } from "./deterministic-evidence";

export type TraceTextRegion = Pick<SourceTextEvidence, "center" | "widthPx" | "heightPx" | "text">;

/** Text boxes select a paint representation, never a deletion mask. Preserve
 * every observed ink pixel inside a plausible word/number box, including ink
 * touching a drawing stroke. Outside ink remains available for stroke tracing.
 * OCR readings never supply replacement glyphs or geometry. */
export function preserveTraceGlyphs(mask: Uint8Array, fill: Uint8Array,
  width: number, height: number, regions: TraceTextRegion[]) {
  let pixels = 0;
  for (const region of regions) {
    // Local OCR often reads narrow rails as I/l/| and punctuation.
    if (!/[\p{L}02-9]/u.test(region.text.replace(/[Iil]/g, "")) ||
      region.text.replace(/[^\p{L}\p{N}]/gu, "").length < 2) continue;
    const left = Math.max(0, Math.floor(region.center.x - region.widthPx / 2 - 1));
    const right = Math.min(width - 1, Math.ceil(region.center.x + region.widthPx / 2 + 1));
    const top = Math.max(0, Math.floor(region.center.y - region.heightPx / 2 - 1));
    const bottom = Math.min(height - 1, Math.ceil(region.center.y + region.heightPx / 2 + 1));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const at = y * width + x;
      if (mask[at] && !fill[at]) { fill[at] = 1; pixels++; }
    }
  }
  return pixels;
}
