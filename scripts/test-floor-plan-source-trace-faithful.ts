import assert from "node:assert/strict";
import sharp from "sharp";
import { extractSourceArtwork } from "../lib/floor-plan-imports/source-artwork-trace";
import { FAITHFUL_TRACE_VERSION } from "../lib/floor-plan-imports/source-trace-faithful";
import { isFaithfulDrawing, registeredVectorizerDrawing } from "../lib/floor-plan-imports/vectorizer-drawing";
import { parseFloorPlanVectorizerDrawing } from "../lib/floor-plan-imports/vectorizer-evidence-schema";
import { replaceSourceTrace, sourceTraceAnnotations } from "../lib/floor-plan-source-trace";
import { sourceDrawingGeometryError, sourceDrawingInk } from "../lib/floor-plan-source-drawing";
import { sourceArtworkDrawing } from "../lib/floor-plan-source-trace-export";
import { acceptedPhotoFixture } from "./fixtures/scan-to-editable-plan/photo-calibration";

// The faithful trace of a clean page (faithful_drawing.py): the drawing is the trace. It is drawn as it is - nothing
// moved against the picture, nothing traced from it beside it - and every shape keeps its own grey.
const W = 240, H = 200;
const page = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="white"/>` +
  '<path d="M20 20H200V30H20Z" fill="#111"/><path d="M40 100H200" stroke="#999" stroke-width="1.5"/>' +
  '<text x="60" y="160" font-size="22" font-family="sans-serif">LIVING</text></svg>');
// as faithful_drawing.py writes it: a filled polygon with a hole wound the other way, two lines of one width and
// tone as one item of separate sub-paths, a quarter arc as one cubic, a dot as a closed filled circle
const faithful = {
  version: "faithful-trace-r6",
  items: [
    { kind: "fill", fill: true, strokeWidthPx: 0, tone: 17, commands: ["L", "L", "L", "Z", "M", "L", "L", "L", "Z"],
      points: [[20, 20], [200, 20], [200, 30], [20, 30], [30, 22], [30, 28], [40, 28], [40, 22]] },
    { kind: "line", fill: false, strokeWidthPx: 1.5, tone: 153, commands: ["L", "M", "L"],
      points: [[39.25, 100], [200.75, 100], [100, 40], [100, 60]] },
    { kind: "arc", fill: false, strokeWidthPx: 1, tone: 0, commands: ["C"], points: [[150, 150], [150, 177.6], [172.4, 200], [200, 200]] },
    { kind: "dot", fill: true, strokeWidthPx: 0, tone: 40, commands: ["C", "C", "C", "C", "Z"],
      points: [[12, 10], [12, 11.1], [11.1, 12], [10, 12], [8.9, 12], [8, 11.1], [8, 10], [8, 8.9], [8.9, 8], [10, 8], [11.1, 8], [12, 8.9], [12, 10]] },
  ],
  textBoxes: [],
};

async function run() {
  const parsed = parseFloorPlanVectorizerDrawing(faithful);
  assert.throws(() => parseFloorPlanVectorizerDrawing({ ...faithful, items: [{ ...faithful.items[0], tone: 300 }] }), "a tone is a grey, 0-255");
  const drawing = registeredVectorizerDrawing(parsed, 1, 1);
  assert.ok(isFaithfulDrawing(drawing) && !isFaithfulDrawing({ version: "stage1-svg-1" }));
  assert.deepEqual(drawing.items.map((item) => item.tone), [17, 153, 0, 40], "the tone is registered with each item");

  const bytes = await sharp(page).png().toBuffer();
  const trace = await extractSourceArtwork(bytes, { widthPx: W, heightPx: H, clean: drawing });
  assert.equal(trace.version, FAITHFUL_TRACE_VERSION);
  assert.equal(trace.paths.length, faithful.items.length, "nothing is traced from the picture beside the faithful drawing (not even LIVING)");
  trace.paths.forEach((path, i) => {
    const item = faithful.items[i];
    assert.deepEqual(path.points, item.points.map(([x, y]) => ({ x, y })), "the faithful drawing is not moved against the picture");
    assert.deepEqual(path.commands, item.commands);
    assert.equal(path.tone, item.tone);
    assert.equal(path.groupId, `faithful-${item.kind}-${i + 1}`);
    assert.equal(path.strokeWidthPx, item.fill ? 1 : item.strokeWidthPx);
  });
  assert.equal(trace.diagnostics.curves, 5, "the arc and the dot's four quarters");
  await assert.rejects(extractSourceArtwork(bytes, { widthPx: W + 1, heightPx: H, clean: drawing }), /frame changed/);

  const annotations = sourceTraceAnnotations(trace, "source-1", 1);
  for (const annotation of annotations) {
    assert.equal(annotation.geometry.kind, "source_drawing");
    if (annotation.geometry.kind !== "source_drawing") continue;
    assert.equal(sourceDrawingGeometryError(annotation.geometry), null);
    assert.match(annotation.provenance.evidence[0].note ?? "", /^Faithful trace of this source view/);
  }
  const line = annotations[1].geometry;
  assert.ok(line.kind === "source_drawing" && line.tone === 153);
  if (line.kind === "source_drawing") {
    assert.equal(sourceDrawingInk(line, "#333"), "rgb(153,153,153)");
    assert.equal(sourceDrawingInk({}, "#333"), "#333", "a trace without tones keeps the view's ink");
    assert.equal(sourceDrawingGeometryError({ ...line, tone: 256 }), "Invalid source tone.");
    assert.equal(sourceDrawingGeometryError({ ...line, tone: 1.5 }), "Invalid source tone.");
  }

  // the export takes each traced shape's grey (test-floor-plan-source-trace-export.ts draws it)
  const input = acceptedPhotoFixture(), sourceId = input.sources[0].id;
  input.floors[0].calibrations = [];
  const exported = sourceArtworkDrawing(replaceSourceTrace(input, trace, sourceId, 1), sourceId, 1);
  assert.deepEqual(exported.primitives.map((p) => (p.kind === "path" ? p.tone : null)), [17, 153, 0, 40]);
  console.log("PASS: a faithful drawing is the trace as it is - no rework, no pixel tracing beside it - and keeps each shape's grey through annotations, validation and export.");
}

void run().catch((error) => { console.error(error); process.exitCode = 1; });
