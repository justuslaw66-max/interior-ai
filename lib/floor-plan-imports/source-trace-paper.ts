/**
 * The page's paper, cleared before the clean traced drawing (v3) is traced: the tint a marketing plan is printed on and
 * a website's watermark laid across it are taken to white, so neither is traced as ink. The same two rules stage 1 of
 * the vectorizer reads the page with (floorplan_vectorize.py: flatten_background, round 23; remove_watermark, round
 * 30), at the source's own resolution. A page drawn black on white is left exactly as it is.
 */
export const PAPER_SETTINGS = Object.freeze({
  /** A page this bright at its 60th percentile, with this little colour, is plain paper already. */
  plainTone: 252,
  plainChroma: 18,
  plainColourShare: 0.03,
  /** The background probe: a square this share of the page's longer side (at least 31 px). */
  probeShare: 0.035,
  probeFloor: 160,
  /** Ink within 12 % of its background is paper (a tint, a watermark). */
  paperRatio: 0.88,
  /** A watermark: pale ink in strokes this many working pixels across or wider (stage 1 reads small pages at twice
   * their size, so half as many source pixels there). */
  paleLow: 170,
  paleHigh: 240,
  watermarkStrokePx: 7,
  watermarkMinShare: 0.004,
});

/** Max (or min) over a square window, rows then columns (van Herk / Gil-Werman, linear time). */
export function squareFilter(src: Uint8Array, width: number, height: number, size: number, max: boolean) {
  const pick = max ? Math.max : Math.min, half = size >> 1, tmp = new Uint8Array(src.length), out = new Uint8Array(src.length);
  const pass = (from: Uint8Array, to: Uint8Array, n: number, count: number, at: (line: number, i: number) => number) => {
    const fwd = new Uint8Array(n), bwd = new Uint8Array(n);
    for (let line = 0; line < count; line++) {
      for (let i = 0; i < n; i++) fwd[i] = i % size === 0 ? from[at(line, i)] : pick(fwd[i - 1], from[at(line, i)]);
      for (let i = n - 1; i >= 0; i--) bwd[i] = i === n - 1 || (i + 1) % size === 0 ? from[at(line, i)] : pick(bwd[i + 1], from[at(line, i)]);
      for (let i = 0; i < n; i++) {
        const lo = Math.max(0, i - half), hi = Math.min(n - 1, i + half);
        to[at(line, i)] = pick(bwd[lo], fwd[hi]);
      }
    }
  };
  pass(src, tmp, width, height, (y, x) => y * width + x);
  pass(tmp, out, height, width, (x, y) => y * width + x);
  return out;
}

/** A box blur along rows then columns, three times: close to a Gaussian of the given sigma. */
function blur(src: Uint8Array, width: number, height: number, sigma: number) {
  const size = Math.max(3, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1)) | 1), half = size >> 1;
  const a = Float32Array.from(src), b = new Float32Array(src.length);
  const line = (from: Float32Array, to: Float32Array, n: number, count: number, at: (l: number, i: number) => number) => {
    for (let l = 0; l < count; l++) {
      let sum = 0;
      for (let i = -half; i <= half; i++) sum += from[at(l, Math.min(n - 1, Math.max(0, i)))];
      for (let i = 0; i < n; i++) {
        to[at(l, i)] = sum / size;
        sum += from[at(l, Math.min(n - 1, i + half + 1))] - from[at(l, Math.max(0, i - half))];
      }
    }
  };
  for (let k = 0; k < 3; k++) {
    line(a, b, width, height, (y, x) => y * width + x);
    line(b, a, height, width, (x, y) => y * width + x);
  }
  return a;
}

/** Is the page drawn black on white already (no tint, next to no colour)? */
function plainPage(gray: Uint8Array, rgb: Uint8Array) {
  const counts = new Uint32Array(256);
  let coloured = 0;
  for (let i = 0; i < gray.length; i++) {
    counts[gray[i]]++;
    const r = rgb[3 * i], g = rgb[3 * i + 1], b = rgb[3 * i + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > PAPER_SETTINGS.plainChroma) coloured++;
  }
  let seen = 0, p60 = 255;
  for (let tone = 0; tone < 256; tone++) if ((seen += counts[tone]) >= 0.6 * gray.length) { p60 = tone; break; }
  return p60 >= PAPER_SETTINGS.plainTone && coloured <= PAPER_SETTINGS.plainColourShare * gray.length;
}

/** The page with its tint taken to white: each pixel against its local background (flatten_background). */
function flattenBackground(gray: Uint8Array, width: number, height: number) {
  const probe = Math.max(31, Math.round(PAPER_SETTINGS.probeShare * Math.max(width, height)) | 1);
  const background = blur(squareFilter(squareFilter(gray, width, height, probe, true), width, height, probe, false), width, height, 5);
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const bg = Math.max(background[i], PAPER_SETTINGS.probeFloor);
    out[i] = Math.max(0, Math.min(255, Math.round((gray[i] / bg / PAPER_SETTINGS.paperRatio) * 255)));
  }
  return out;
}

/** A pixel's eight neighbours inside the page. */
export function eightNeighbours(p: number, width: number, height: number) {
  const x = p % width, y = (p - x) / width, out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((dx || dy) && x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) out.push(p + dy * width + dx);
  }
  return out;
}

/** The 8-connected pieces of a binary mask: for each, its pixels. */
function pieces(mask: Uint8Array, width: number, height: number) {
  const seen = new Uint8Array(mask.length), out: number[][] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const pixels = [start];
    seen[start] = 1;
    for (let k = 0; k < pixels.length; k++) for (const q of eightNeighbours(pixels[k], width, height)) if (mask[q] && !seen[q]) { seen[q] = 1; pixels.push(q); }
    out.push(pixels);
  }
  return out;
}

/** Pale ink in strokes far fatter than any line of the drawing taken to white, with its pale rim (remove_watermark).
 * A piece lying mostly on the vectorizer's drawing or in a text box is the plan's own (a grey wall's paint, a blurred
 * letter), never a watermark. */
function removeWatermark(gray: Uint8Array, width: number, height: number, own: Uint8Array) {
  const workScale = Math.max(width, height) < 1500 ? 2 : 1;
  const stroke = Math.max(3, Math.round(PAPER_SETTINGS.watermarkStrokePx / workScale) | 1);
  const pale = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) pale[i] = gray[i] >= PAPER_SETTINGS.paleLow && gray[i] < PAPER_SETTINGS.paleHigh ? 255 : 0;
  const fat = squareFilter(squareFilter(pale, width, height, stroke, false), width, height, stroke, true);
  let count = 0;
  for (const piece of pieces(fat, width, height)) {
    if (piece.filter((p) => own[p]).length >= 0.5 * piece.length) for (const p of piece) fat[p] = 0;
    else count += piece.length;
  }
  if (count < PAPER_SETTINGS.watermarkMinShare * gray.length) return 0;
  const zone = squareFilter(fat, width, height, stroke, true);
  for (let i = 0; i < gray.length; i++) if (zone[i] && !own[i] && gray[i] >= 150) gray[i] = 255;
  return count;
}

/** The grey page with its paper cleared for the clean traced drawing, and how much was cleared (pixels). `own` marks
 * the pixels the vectorizer's drawing and its text boxes account for. */
export function clearPaper(gray: Uint8Array, rgb: Uint8Array, width: number, height: number, own: Uint8Array) {
  const flattened = !plainPage(gray, rgb), out = flattened ? flattenBackground(gray, width, height) : Uint8Array.from(gray);
  return { gray: out, flattened, watermarkPixels: removeWatermark(out, width, height, own) };
}
