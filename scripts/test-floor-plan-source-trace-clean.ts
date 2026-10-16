import assert from "node:assert/strict";
import sharp from "sharp";
import { extractSourceArtwork } from "../lib/floor-plan-imports/source-artwork-trace";
import type { TracePath } from "../lib/floor-plan-imports/source-trace-fit";
import { drawingPolylines } from "../lib/floor-plan-imports/source-trace-clean";
import { letteringBoxes } from "../lib/floor-plan-imports/source-trace-lettering";
import { drawingPointCount, registeredVectorizerDrawing, type RegisteredVectorizerDrawing } from "../lib/floor-plan-imports/vectorizer-drawing";
import { sourceTraceAnnotations } from "../lib/floor-plan-source-trace";
import { sourceDrawingGeometryError } from "../lib/floor-plan-source-drawing";

// The clean traced drawing (source-strokes-v3): the vectorizer's own drawing as sharp shapes, the lettering and small
// marks traced finely from the picture, faint marks and the drawing's soft edges left out.
type Point = { x: number; y: number };
const W = 240, H = 220;
const svg = (body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="white"/>${body}</svg>`);
const samples = (path: TracePath) => drawingPolylines({ kind: "", fill: path.fill, strokeWidthPx: 0, commands: path.commands, points: path.points })
  .flatMap((line) => line.points);
const inside = (p: Point, b: { left: number; top: number; right: number; bottom: number }) => p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom;

async function inkBox(bytes: Buffer, region: { left: number; top: number; right: number; bottom: number }) {
  const { data } = await sharp(bytes).greyscale().raw().toBuffer({ resolveWithObject: true });
  const box = { left: W, top: H, right: 0, bottom: 0 };
  for (let y = region.top; y <= region.bottom; y++) for (let x = region.left; x <= region.right; x++) {
    if (data[y * W + x] < 128) Object.assign(box, { left: Math.min(box.left, x), top: Math.min(box.top, y), right: Math.max(box.right, x + 1), bottom: Math.max(box.bottom, y + 1) });
  }
  return box;
}

async function run() {
  const body = '<path d="M20 20H200V30H20Z" fill="#111"/><path d="M40 100H200" stroke="#111" stroke-width="1.5"/>' +
    '<text x="80" y="62" font-size="13" font-family="sans-serif">1234</text>' +
    '<text x="150" y="180" font-size="24" font-family="sans-serif" fill="#e8e8e8">A</text>' +
    '<circle cx="60" cy="160" r="4" fill="none" stroke="#111" stroke-width="1.2"/>';
  const bytes = await sharp(svg(body)).png().toBuffer(), text = await inkBox(bytes, { left: 70, top: 40, right: 140, bottom: 70 });
  const clean: RegisteredVectorizerDrawing = { version: "stage1-svg-1", textBoxes: [text], items: [
    { kind: "wall", fill: true, strokeWidthPx: 0, commands: ["L", "L", "L", "Z"], points: [{ x: 20, y: 20 }, { x: 200, y: 20 }, { x: 200, y: 30 }, { x: 20, y: 30 }] },
    { kind: "line", fill: false, strokeWidthPx: 1.5, commands: ["L"], points: [{ x: 40, y: 100 }, { x: 200, y: 100 }] },
  ] };
  const trace = await extractSourceArtwork(bytes, { clean });
  assert.equal(trace.version, "source-strokes-v3");
  assert.equal(trace.settings.version, "source-strokes-v3");
  const cleanPaths = trace.paths.filter((p) => p.groupId.startsWith("clean-"));
  assert.deepEqual(cleanPaths.map((p) => p.groupId), ["clean-wall-1", "clean-line-2"], "The drawing's shapes lead, in order");
  assert.deepEqual(cleanPaths[0].points, clean.items[0].points, "A wall is the drawing's own shape");
  assert.equal(cleanPaths[0].fill, true, "Walls are solid");
  const letters = trace.paths.filter((p) => p.groupId.startsWith("letter-"));
  assert.ok(letters.length >= 4, `Each digit is traced as its own shape (${letters.length})`);
  const [box] = letteringBoxes([text], W, H);
  assert.ok(letters.every((p) => p.fill && samples(p).every((q) => inside(q, box))), "Letters stay inside their text box");
  assert.ok(letters.some((p) => p.points.some((q) => Math.abs(q.x * 4 - Math.round(q.x * 4)) < 1e-9 && q.x % 1 !== 0)),
    "Letter outlines follow the ink between pixels, not the pixel grid");
  const others = trace.paths.filter((p) => !p.groupId.startsWith("clean-") && !p.groupId.startsWith("letter-"));
  for (const p of others) {
    const points = samples(p), alongLine = points.filter((q) => q.x > 44 && q.x < 196 && Math.abs(q.y - 100) < 4).length;
    assert.ok(alongLine < 0.5 * points.length, "No traced double of a line the drawing has");
    assert.ok(points.every((q) => q.y > 34 || q.x < 16 || q.x > 204), "No traced double of a wall the drawing has");
  }
  assert.ok(trace.paths.every((p) => samples(p).every((q) => !inside(q, { left: 148, top: 158, right: 172, bottom: 182 }))), "A faint mark is left out");
  assert.ok(others.some((p) => samples(p).some((q) => Math.hypot(q.x - 64, q.y - 160) < 1.5)), "A mark the drawing does not have is traced");
  assert.deepEqual((await extractSourceArtwork(bytes, { clean })).paths, trace.paths, "Deterministic");
  const annotations = sourceTraceAnnotations(trace, "test-source", 1);
  for (const a of annotations) if (a.geometry.kind === "source_drawing") assert.equal(sourceDrawingGeometryError(a.geometry), null);
  assert.match(annotations[0].provenance.evidence[0].note ?? "", /vectorizer's own drawing/);
  const plain = await extractSourceArtwork(bytes);
  assert.equal(plain.version, "source-strokes-v2", "Without a drawing the trace is the artwork trace (v2)");
  assert.equal(plain.paths.filter((p) => p.groupId.startsWith("clean-")).length, 0);
  const none = await extractSourceArtwork(bytes, { clean: { version: "stage1-svg-1", items: [], textBoxes: [] } });
  assert.deepEqual(none.paths, plain.paths, "An empty drawing changes nothing");

  const registered = registeredVectorizerDrawing({ version: "stage1-svg-1", textBoxes: [[1, 2, 3, 4]], items: [
    { kind: "door", fill: false, strokeWidthPx: 1, commands: ["C"], points: [[0, 0], [1, 0], [2, 1], [2, 2]] },
    { kind: "bad", fill: false, strokeWidthPx: 1, commands: ["C"], points: [[0, 0], [1, 1]] },
  ] }, 2, 2);
  assert.equal(drawingPointCount(["M", "L", "C", "Z"]), 6);
  assert.deepEqual(registered.items.map((i) => i.kind), ["door"], "An item whose points do not match its commands is left out");
  assert.deepEqual(registered.items[0].points[3], { x: 4, y: 4 });
  assert.equal(registered.items[0].strokeWidthPx, 2);
  assert.deepEqual(registered.textBoxes[0], { left: 2, top: 4, right: 6, bottom: 8 });
  console.log("Clean traced drawing: drawing shapes, solid walls, fine lettering, no doubled edges, faint marks out, leftover marks traced, v2 unchanged without a drawing, registration PASS.");
}
void run().catch((error) => { console.error(error); process.exit(1); });
