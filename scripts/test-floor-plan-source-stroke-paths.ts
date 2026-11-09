import assert from "node:assert/strict";
import { sourceDrawingAnnotations } from "@/lib/floor-plan-imports/source-drawing-annotations";
import type { RegisteredPageEvidence } from "@/lib/floor-plan-imports/deterministic-evidence";
import { sourceStrokePaths, type SourceStroke } from "@/lib/floor-plan-imports/source-stroke-paths";
import { sourceDrawingGeometryError, sourceDrawingSvgPath } from "@/lib/floor-plan-source-drawing";

// A page's straight strokes joined into paths for the review's reference artwork (9 Nov 2026). A vector PDF's page was
// kept one annotation per segment, which put HDB Blk 670 over the 5 MB cap on a candidate. Joined, it's the same
// picture: every segment drawn once between its own two ends.

const p = (x: number, y: number) => ({ x, y });
const s = (x0: number, y0: number, x1: number, y1: number): SourceStroke => ({ start: p(x0, y0), end: p(x1, y1) });

/** The segments a set of paths draws, each as its sorted ends, counted. */
function drawn(paths: ReturnType<typeof sourceStrokePaths>) {
  const out: string[] = [];
  for (const path of paths) {
    assert.equal(path.pathCommands.length, path.points.length - 1, "one command per point after the first");
    path.pathCommands.forEach((command, index) => {
      if (command === "L") out.push([path.points[index], path.points[index + 1]].map((q) => `${q.x},${q.y}`).sort().join(" "));
    });
  }
  return out.sort();
}
const segments = (strokes: SourceStroke[]) => strokes.map((t) => [t.start, t.end].map((q) => `${q.x},${q.y}`).sort().join(" ")).sort();

function testChainIsOnePath() {
  // A rectangle drawn as four strokes, two of them reversed, as a PDF often writes them.
  const strokes = [s(0, 0, 10, 0), s(10, 10, 10, 0), s(10, 10, 0, 10), s(0, 0, 0, 10)];
  const paths = sourceStrokePaths(strokes);
  assert.equal(paths.length, 1);
  assert.deepEqual(paths[0].pathCommands, ["L", "L", "L", "L"], "a closed chain is one subpath");
  assert.deepEqual(drawn(paths), segments(strokes));
}

function testBranchAndApart() {
  // A T (three strokes at one point) and a separate dash: two paths; the T needs a second subpath.
  const strokes = [s(0, 0, 10, 0), s(10, 0, 20, 0), s(10, 0, 10, 10), s(50, 50, 60, 50)];
  const paths = sourceStrokePaths(strokes);
  assert.equal(paths.length, 2, "one path per connected group");
  assert.equal(paths[0].pathCommands.filter((c) => c === "M").length, 1, "a branch starts one new subpath");
  assert.deepEqual(drawn(paths), segments(strokes));
}

function testOnlyExactEndsJoin() {
  const strokes = [s(0, 0, 10, 0), s(10.004, 0, 20, 0)];
  const paths = sourceStrokePaths(strokes);
  assert.equal(paths.length, 2, "ends 0.004 px apart stay apart");
  assert.deepEqual(drawn(paths), segments(strokes), "and each keeps its own ends");
}

function testCommandLimit() {
  const strokes = Array.from({ length: 25 }, (_, i) => s(i, 0, i + 1, 0));
  const paths = sourceStrokePaths(strokes, 10);
  assert.ok(paths.length >= 3 && paths.every((path) => path.pathCommands.length <= 10), "a long group splits at the limit");
  assert.deepEqual(drawn(paths), segments(strokes), "and still draws every segment once");
}

function testAnnotations() {
  const strokes = [s(0, 0, 10, 0), s(10, 0, 10, 10), s(50, 50, 60, 50), s(-100_000, 0, 5, 5)];
  const page: RegisteredPageEvidence = {
    pageNumber: 1, widthPx: 100, heightPx: 100,
    vectorSegments: strokes.map((t, i) => ({ id: `s${i}`, pageNumber: 1, start: t.start, end: t.end, strokeWidthPx: 1, evidenceKind: "pdf_vector" })),
    vectorPaths: [], text: [], semantics: { roomLabels: [], dimensionLabels: [], openingSymbols: [], notes: [] },
  };
  const issues: Parameters<typeof sourceDrawingAnnotations>[3] = [];
  const artwork = sourceDrawingAnnotations(page, "source", "test", issues).filter((a) => a.id.startsWith("source-artwork:"));
  assert.deepEqual(artwork.map((a) => a.id), ["source-artwork:1:1", "source-artwork:1:2"], "two groups, two marks");
  for (const mark of artwork) {
    assert.equal(mark.geometry.kind, "source_drawing");
    if (mark.geometry.kind !== "source_drawing") continue;
    assert.equal(mark.geometry.command, "path");
    assert.equal(sourceDrawingGeometryError(mark.geometry), null, "each path passes the drawing's own rules");
  }
  const first = artwork[0].geometry;
  assert.ok(first.kind === "source_drawing" && sourceDrawingSvgPath(first) === "M 0 0 L 10 0 L 10 10", "drawn as one stroke");
  assert.deepEqual(issues.map((i) => i.code), ["source_artwork_unresolved"], "a stroke off the page is still counted as unresolved");
}

testChainIsOnePath();
testBranchAndApart();
testOnlyExactEndsJoin();
testCommandLimit();
testAnnotations();
console.log("floor-plan source stroke paths: ok");
