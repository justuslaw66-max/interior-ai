import type { TracePath } from "./source-trace-fit";
import { boxLevel, boxTones, dropFineShapes, fineInk, fineShapePaths, grownBox, type PixelBox } from "./source-trace-fine";
import { eightNeighbours } from "./source-trace-paper";
import type { VectorizerTextBox } from "./vectorizer-drawing";

/**
 * The lettering of the clean traced drawing (v3), traced from the picture (J, 15 Oct: lettering "keep as traced") as
 * smooth fine shapes at the source's own weight. Faint lettering - a watermark - is left out. (Small marks:
 * source-trace-marks.ts.)
 */
export const LETTERING_SETTINGS = Object.freeze({
  boxMarginPx: 2,
});

const overlaps = (a: PixelBox, b: PixelBox) => a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;

/** Boxes with every overlapping pair merged into one. */
function mergedBoxes(boxes: PixelBox[]) {
  let merged = boxes.map((box) => ({ ...box }));
  for (let changed = true; changed;) {
    changed = false;
    const next: PixelBox[] = [];
    for (const box of merged) {
      const hit = next.find((o) => overlaps(o, box));
      if (!hit) { next.push({ ...box }); continue; }
      Object.assign(hit, { left: Math.min(hit.left, box.left), top: Math.min(hit.top, box.top),
        right: Math.max(hit.right, box.right), bottom: Math.max(hit.bottom, box.bottom) });
      changed = true;
    }
    merged = next;
  }
  return merged;
}

/** Text boxes in whole pixels with the margin, overlapping boxes merged so no letter is traced twice. */
export function letteringBoxes(boxes: VectorizerTextBox[], width: number, height: number): PixelBox[] {
  return mergedBoxes(boxes.map((b) => grownBox(b, LETTERING_SETTINGS.boxMarginPx, { width, height }))
    .filter((b) => b.right > b.left && b.bottom > b.top));
}

/** The piece of ink from `start` (8-connected), marked in `seen`: its box, or null when it runs out of `limit`. */
function pieceWithin(ink: Uint8Array, width: number, height: number, start: number, limit: PixelBox, seen: Uint8Array) {
  const pixels = [start], box = { left: width, top: height, right: -1, bottom: -1 };
  let escapes = false;
  seen[start] = 1;
  for (let k = 0; k < pixels.length; k++) {
    const p = pixels[k], x = p % width, y = (p - x) / width;
    box.left = Math.min(box.left, x); box.right = Math.max(box.right, x); box.top = Math.min(box.top, y); box.bottom = Math.max(box.bottom, y);
    escapes ||= x <= limit.left || x >= limit.right || y <= limit.top || y >= limit.bottom;
    if (!escapes) for (const q of eightNeighbours(p, width, height)) if (ink[q] && !seen[q]) { seen[q] = 1; pixels.push(q); }
  }
  return escapes ? null : box;
}

/** A text box grown over the letters it cuts through (a rotated figure's first digit, a basin read as text): the ink
 * pieces it overlaps that stay within reach of it (60 % of its shorter side). A line running through it is left out. */
function grownOverInk(ink: Uint8Array, width: number, height: number, box: PixelBox): PixelBox {
  const reach = Math.max(3, Math.round(0.6 * Math.min(box.right - box.left, box.bottom - box.top)));
  const limit = grownBox(box, reach, { width, height }), seen = new Uint8Array(ink.length), out = { ...box };
  for (let y = box.top; y <= box.bottom; y++) for (let x = box.left; x <= box.right; x++) {
    const p = y * width + x, piece = ink[p] && !seen[p] ? pieceWithin(ink, width, height, p, limit, seen) : null;
    if (piece) Object.assign(out, { left: Math.min(out.left, piece.left), top: Math.min(out.top, piece.top),
      right: Math.max(out.right, piece.right), bottom: Math.max(out.bottom, piece.bottom) });
  }
  return out;
}

function clearBox(ink: Uint8Array, width: number, box: PixelBox) {
  for (let y = box.top; y <= box.bottom; y++) ink.fill(0, y * width + box.left, y * width + box.right + 1);
}

type LetteringInput = { ink: Uint8Array; gray: Uint8Array; width: number; height: number; explained: Uint8Array;
  drawn: Uint8Array; faint: number; signal: AbortSignal; boxes: VectorizerTextBox[] };

/**
 * The lettering as smooth filled shapes (`groupId` letter-<n>). Each traced box's ink leaves the main mask, so the
 * general pass does not trace it again; a faint box is left out; any other box with too little contrast is left to the
 * general pass (`untraced`).
 */
export async function traceLettering(input: LetteringInput) {
  const { ink, gray, width, height, explained, faint, signal } = input;
  const paths: TracePath[] = [], untraced: PixelBox[] = [];
  const boxes = mergedBoxes(letteringBoxes(input.boxes, width, height).map((box) => grownOverInk(ink, width, height, box)));
  for (const box of boxes) {
    const tones = boxTones(gray, width, box), level = boxLevel(tones), faintBox = tones[Math.floor(tones.length * 0.03)] > faint;
    if (level === null && !faintBox) { untraced.push(box); continue; }
    if (level !== null && !faintBox) {
      const fine = fineInk(gray, { width, height }, box, level);
      dropFineShapes(fine, explained, width, input.drawn);
      const shapes = await fineShapePaths(fine, signal).catch((error) => { if (signal.aborted) throw error; return null; });
      if (!shapes) { untraced.push(box); continue; }              // (a shape the fitting cannot bound: the general pass)
      for (const path of shapes) paths.push({ ...path, groupId: `letter-${paths.length + 1}` });
    }
    clearBox(ink, width, box);
  }
  return { paths, untraced };
}
