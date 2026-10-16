import assert from "node:assert/strict";
import sharp from "sharp";
import { extractSourceArtwork } from "../lib/floor-plan-imports/source-artwork-trace";
import type { TracePath } from "../lib/floor-plan-imports/source-trace-fit";
import { drawingPolylines } from "../lib/floor-plan-imports/source-trace-clean";
import { clearPaper } from "../lib/floor-plan-imports/source-trace-paper";
import type { RegisteredVectorizerDrawing, VectorizerDrawingItem } from "../lib/floor-plan-imports/vectorizer-drawing";

// The clean traced drawing (v3) against J's s001 close-ups (15 Oct): dimension dots as true circles, thin leftovers as
// sharp strokes, the reading's lines on their own ink (never drawn twice), walls as drawn, no door through a wall,
// lettering traced whole, and the page's paper cleared first.
type Point = { x: number; y: number };
const W = 260, H = 240;
const svg = (body: string, paper = "white") => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${paper}"/>${body}</svg>`);
const samples = (path: TracePath) => drawingPolylines({ kind: "", fill: path.fill, strokeWidthPx: 0, commands: path.commands, points: path.points })
  .flatMap((line) => line.points);
const line = (kind: string, a: Point, b: Point, strokeWidthPx = 1): VectorizerDrawingItem => ({ kind, fill: false, strokeWidthPx, commands: ["L"], points: [a, b] });
const box = (kind: string, l: number, t: number, r: number, b: number): VectorizerDrawingItem => ({ kind, fill: true, strokeWidthPx: 0,
  commands: ["L", "L", "L", "Z"], points: [{ x: l, y: t }, { x: r, y: t }, { x: r, y: b }, { x: l, y: b }] });
const gap = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
/** Does the path's outline pass within `d` px of the point? */
const near = (path: TracePath, p: Point, d: number) => samples(path).some((q, i, all) => gap(p, q, all[Math.min(i + 1, all.length - 1)]) < d);

async function marksAndLines() {
  const body = '<path d="M30 40H200M100 20V90" stroke="#777" stroke-width="1.5"/><circle cx="100.5" cy="40" r="3.5" fill="#000"/>' +
    '<path d="M40 120L56 136" stroke="#555" stroke-width="1.4"/>' +
    '<path d="M30 172.5H220" stroke="#111" stroke-width="1.2"/>' +
    '<rect x="150" y="100" width="50" height="12" fill="#000"/>' +
    '<rect x="20" y="150" width="20" height="60" fill="#000"/>';
  const bytes = await sharp(svg(body)).png().toBuffer();
  const clean: RegisteredVectorizerDrawing = { version: "stage1-svg-1", textBoxes: [], items: [
    line("dim-line", { x: 30, y: 40 }, { x: 200, y: 40 }), line("dim-ext", { x: 100, y: 20 }, { x: 100, y: 90 }),
    line("line", { x: 30, y: 170.5 }, { x: 220, y: 170.5 }),
    box("wall", 152, 102, 198, 110), box("wall", 20, 150, 40, 210),
    { kind: "door-swing", fill: false, strokeWidthPx: 1, commands: ["C"], points: [{ x: 30, y: 160 }, { x: 30, y: 180 }, { x: 35, y: 200 }, { x: 60, y: 205 }] },
  ] };
  const trace = await extractSourceArtwork(bytes, { clean });
  const dot = trace.paths.find((p) => p.fill && p.commands.filter((c) => c === "C").length === 4 && near(p, { x: 100.5, y: 40 }, 6));
  assert.ok(dot, "A dimension's dot with its lines running into it is a true circle");
  const xs = dot.points.map((p) => p.x), ys = dot.points.map((p) => p.y), r = (Math.max(...xs) - Math.min(...xs)) / 2;
  assert.ok(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2 - 100.5) < 0.6 && Math.abs((Math.max(...ys) + Math.min(...ys)) / 2 - 40) < 0.6, "... on its centre");
  assert.ok(Math.abs(r - 3.5) < 0.8, `... at its size (r ${r.toFixed(2)})`);
  const dash = trace.paths.find((p) => !p.fill && !p.groupId.startsWith("clean-") && near(p, { x: 48, y: 128 }, 2));
  assert.ok(dash, "A thin leftover the reading does not have is a sharp stroke along its centre");
  assert.ok(dash.commands.every((c) => c === "L") && dash.commands.length <= 2, "... straight");
  assert.ok(dash.strokeWidthPx > 0.6 && dash.strokeWidthPx < 2, `... at the weight of its ink (${dash.strokeWidthPx.toFixed(2)})`);
  const moved = trace.paths.find((p) => p.groupId.startsWith("clean-line-"));
  assert.ok(moved && moved.points.every((p) => Math.abs(p.y - 172.5) < 0.4), "A line of the reading 2 px off its ink is drawn on it");
  const doubles = trace.paths.filter((p) => !p.groupId.startsWith("clean-") && samples(p).filter((q) => Math.abs(q.y - 172.5) < 3 && q.x > 40 && q.x < 210).length > 3);
  assert.equal(doubles.length, 0, "... and never traced a second time beside it");
  const wall = trace.paths.find((p) => p.groupId.startsWith("clean-wall-") && near(p, { x: 175, y: 106 }, 30));
  assert.ok(wall && wall.points.every((p) => [150, 200].some((x) => Math.abs(p.x - x) < 0.6) && [100, 112].some((y) => Math.abs(p.y - y) < 0.6)),
    "A solid wall's faces are on its ink's edges");
  assert.ok(!trace.paths.some((p) => p.groupId.startsWith("clean-door-swing")), "A door swing drawn through a wall is left out");
}

async function wallsAsDrawn() {
  const body = '<path d="M40 60H220M40 70H220" stroke="#111" stroke-width="1.2"/>';
  const bytes = await sharp(svg(body)).png().toBuffer();
  const clean: RegisteredVectorizerDrawing = { version: "stage1-svg-1", textBoxes: [], items: [box("partition-fill", 40, 59.5, 220, 70.5)] };
  const trace = await extractSourceArtwork(bytes, { clean });
  const drawn = trace.paths.filter((p) => p.groupId.startsWith("clean-"));
  assert.ok(drawn.every((p) => !p.fill), "A wall drawn as two lines with paper between is not filled");
  for (const y of [60, 70]) assert.ok(drawn.some((p) => p.points.every((q) => Math.abs(q.y - y) < 0.5)), `... its line at ${y} is drawn`);
}

async function letteringAndPaper() {
  const body = '<text x="60" y="60" font-size="16" font-family="sans-serif">8</text>';
  const bytes = await sharp(svg(body)).png().toBuffer();
  const clean: RegisteredVectorizerDrawing = { version: "stage1-svg-1", textBoxes: [{ left: 59, top: 46, right: 64, bottom: 61 }],
    items: [line("line", { x: 20, y: 200 }, { x: 240, y: 200 })] };
  const trace = await extractSourceArtwork(bytes, { clean });
  const letters = trace.paths.filter((p) => p.groupId.startsWith("letter-")), right = Math.max(...letters.flatMap((p) => p.points.map((q) => q.x)));
  assert.ok(right > 67, `A letter cut by its text box is traced whole (${right.toFixed(1)})`);

  const page = await sharp(svg('<path d="M20 100H240" stroke="#000" stroke-width="2"/><text x="40" y="190" font-size="90" font-weight="bold" font-family="sans-serif" fill="#cfcfcf">WM</text>', "#f2efe6"))
    .png().toBuffer();
  const { data: g } = await sharp(page).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { data: rgb } = await sharp(page).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const cleared = clearPaper(new Uint8Array(g), new Uint8Array(rgb), W, H, new Uint8Array(W * H)).gray;
  assert.ok(cleared[20 * W + 10] >= 250, "Tinted paper is taken to white");
  assert.ok(cleared[100 * W + 120] < 60, "... the plan's own lines stay");
  let pale = 0;
  for (let y = 120; y < 195; y++) for (let x = 40; x < 220; x++) if (cleared[y * W + x] < 240) pale++;
  assert.ok(pale < 40, `... and a pale watermark in fat strokes goes (${pale} px left)`);
}

/** The faces of a traced wall polygon at `y`-ish, level: their heights. */
const levelFaces = (path: TracePath, near: number) => {
  const out: number[] = [];
  path.points.forEach((p, i) => {
    const q = path.points[(i + 1) % path.points.length];
    if (Math.abs(p.y - q.y) < 1e-6 && Math.abs(p.y - near) < 4) out.push(p.y);
  });
  return out;
};

// J, 15 Oct (h1's close-ups): a wall is flat "until there is a step in the floor plan itself".
async function flatFaces() {
  const body = '<rect x="40" y="100" width="90" height="12"/><rect x="130" y="100.5" width="90" height="11.5"/>' +
    '<rect x="40" y="160" width="90" height="12"/><rect x="130" y="157.5" width="90" height="14.5"/>' +
    '<path d="M60 40H160" stroke="#000" stroke-width="3"/><path d="M160 38.5V80" stroke="#000" stroke-width="2"/>';
  const bytes = await sharp(svg(body)).png().toBuffer();
  const clean: RegisteredVectorizerDrawing = { version: "stage1-svg-1", textBoxes: [], items: [
    box("wall", 40, 100, 130, 112), box("wall", 130, 100.5, 220, 112), box("wall", 40, 160, 130, 172), box("wall", 130, 157.5, 220, 172),
    { ...line("line", { x: 60, y: 40 }, { x: 163, y: 40 }), strokeWidthPx: 3 }, { ...line("line", { x: 160, y: 38.5 }, { x: 160, y: 80 }), strokeWidthPx: 2 },
  ] };
  const trace = await extractSourceArtwork(bytes, { clean });
  const walls = trace.paths.filter((p) => p.groupId.startsWith("clean-wall-"));
  const tops = (y: number) => walls.flatMap((w) => levelFaces(w, y)).filter((v) => Math.abs(v - y) < 3);
  const flat = tops(100);
  assert.ok(flat.length >= 2 && Math.max(...flat) - Math.min(...flat) < 1e-6, `Two wall pieces half a pixel apart on one drawn face share it (${flat.map((v) => v.toFixed(2))})`);
  const stepped = tops(158.75);
  assert.ok(Math.max(...stepped) - Math.min(...stepped) > 2, `... and a step the plan draws (2.5 px) stays (${stepped.map((v) => v.toFixed(2))})`);
  const across = trace.paths.find((p) => p.groupId.startsWith("clean-line-") && Math.abs(p.points[0].y - p.points[1].y) < 1e-6 && near(p, { x: 100, y: 40 }, 2));
  assert.ok(across && Math.max(...across.points.map((p) => p.x)) <= 161 + 1e-6, "A line meeting a lighter one at a corner ends on its far face, not past it");
}

async function run() {
  await marksAndLines();
  await wallsAsDrawn();
  await letteringAndPaper();
  await flatFaces();
  console.log("Clean traced drawing (J's s001 and h1 close-ups): true dots, sharp strokes, lines on their ink and never doubled, walls as drawn and flat, corners flush, no door through a wall, whole letters, paper cleared PASS.");
}

void run().catch((error) => { console.error(error); process.exit(1); });
