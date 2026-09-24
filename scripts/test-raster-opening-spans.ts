import assert from "node:assert/strict";
import sharp from "sharp";
import type { RegisteredPageEvidence, SemanticOpeningSymbol } from "@/lib/floor-plan-imports/deterministic-evidence";
import { detectRasterOpeningSpans, sourceOpeningSpan } from "@/lib/floor-plan-imports/raster-opening-spans";

const width = 360, height = 320;
function rotate(x: number, y: number, degrees: number) {
  const angle = degrees * Math.PI / 180, dx = x - width / 2, dy = y - height / 2;
  return { xRatio: (width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle)) / width,
    yRatio: (height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle)) / height };
}
function symbol(kind: "door" | "window", x: number, first: number, last: number, angle = 0): SemanticOpeningSymbol {
  return { kind, operation: "unknown", centerXRatio: x / width, centerYRatio: (first + last) / 2 / height,
    spanStart: rotate(x, first, angle), spanEnd: rotate(x, last, angle), confidence: 0.55, evidenceKind: "vision" };
}
function page(angle = 0): RegisteredPageEvidence {
  return { pageNumber: 1, widthPx: width, heightPx: height, vectorPaths: [], vectorSegments: [], text: [],
    semantics: { roomLabels: [], dimensionLabels: [], notes: [], openingSymbols: [symbol("door", 83, 130, 181, angle), symbol("window", 205, 115, 183, angle)] } };
}
async function raster(options: { caps?: boolean; extraRail?: boolean; angle?: number; gray?: string } = {}) {
  const caps = options.caps === false ? "" : "M80 105H86M80 155H86M200 100H210M200 200H210";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="320"><rect width="360" height="320" fill="white"/>
    <g transform="rotate(${options.angle ?? 0} 180 160)" stroke="${options.gray ?? '#888'}" stroke-width="1.5" fill="none">
    <path d="M80 40V260M86 40V105M86 155V260M80 128L66 139L80 152M200 40V260M210 40V260M205 100V200${caps}"/>
    ${options.extraRail ? '<path d="M215 100V200M200 100H215M200 200H215"/>' : ''}</g></svg>`;
  const { data } = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { width, height, data };
}
const distance = (a: { x: number; y: number }, b: { xRatio: number; yRatio: number }) => Math.hypot(a.x - b.xRatio * width, a.y - b.yRatio * height);

export async function testRasterOpeningSpans() {
  for (const angle of [0, 3, 90]) {
    const input = page(angle), original = structuredClone(input), result = detectRasterOpeningSpans(input, await raster({ angle }));
    assert.equal(result.length, 2);
    for (const [index, ends] of [[105, 155], [100, 200]].entries()) {
      const span = result[index].span;
      assert.ok(span, JSON.stringify(result[index]));
      assert.ok(distance(span.start, rotate(index ? 205 : 83, ends[0], angle)) < 3);
      assert.ok(distance(span.end, rotate(index ? 205 : 83, ends[1], angle)) < 3);
    }
    assert.deepEqual(input, original, "Source hints, walls and labels are immutable.");
  }
  const input = page(), pixels = await raster({ gray: '#c1c1c1' }), observed = detectRasterOpeningSpans(input, pixels);
  assert.ok(observed.every((value) => value.span), JSON.stringify(observed));
  input.openingSpanEvidence = { coordinateSpace: "rendered_px", imageSha256: "a".repeat(64), widthPx: width, heightPx: height, observations: observed };
  assert.equal(sourceOpeningSpan(input, input.semantics.openingSymbols[1], 1).pixelSupported, true);
  const stale = structuredClone(input); stale.semantics.openingSymbols[1].spanStart!.yRatio += .01;
  assert.equal(sourceOpeningSpan(stale, stale.semantics.openingSymbols[1], 1).pixelSupported, false);
  stale.semantics.openingSymbols[1].spanStart = input.semantics.openingSymbols[1].spanStart;
  stale.semantics.openingSymbols[1].kind = 'door';
  assert.equal(sourceOpeningSpan(stale, stale.semantics.openingSymbols[1], 1).pixelSupported, false);
  const reversed = page(); reversed.semantics.openingSymbols[1] = symbol('window', 205, 183, 115);
  const reversedSpan = detectRasterOpeningSpans(reversed, await raster())[1].span;
  assert.ok(reversedSpan && Math.abs(reversedSpan.start.y - 200) < 3 && Math.abs(reversedSpan.end.y - 100) < 3);
  const missing = detectRasterOpeningSpans(page(), await raster({ caps: false }));
  assert.ok(missing.every((value) => !value.span), JSON.stringify(missing));
  const ambiguous = detectRasterOpeningSpans(page(), await raster({ extraRail: true }));
  assert.equal(ambiguous[1].span, null, 'Competing parallel line patterns require review.');
  assert.ok(detectRasterOpeningSpans(page(), { width, height, data: new Uint8Array(width * height).fill(255) }).every((value) => !value.span));
  assert.throws(() => detectRasterOpeningSpans(page(), { ...pixels, width: width - 1 }), /coordinate space/);
  const oversized = page(); oversized.semantics.openingSymbols[0].spanEnd!.yRatio = 100;
  assert.equal(detectRasterOpeningSpans(oversized, pixels)[0].span, null);
  const offPage = page(); offPage.semantics.openingSymbols[1] = symbol('window', -20, 115, 183);
  assert.equal(detectRasterOpeningSpans(offPage, pixels)[1].span, null);
  const clipped = page(); clipped.heightPx = 205;
  clipped.semantics.openingSymbols[1] = { ...symbol('window', 205, 115, 183),
    spanStart: { xRatio: 205 / width, yRatio: 115 / 205 }, spanEnd: { xRatio: 205 / width, yRatio: 183 / 205 } };
  assert.equal(detectRasterOpeningSpans(clipped, { width, height: 205, data: pixels.data.subarray(0, width * 205) })[1].span,
    null, 'A cropped image cannot prove the middle rail terminates beyond the frame.');
  console.log('Raster opening endpoints: shifted door, short window, rotated/reversed/low-contrast, absent caps, ambiguous rails, stale hints and frames PASS');
}
