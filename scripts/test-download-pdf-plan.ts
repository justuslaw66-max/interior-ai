import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { authoredApartment } from "./fixtures/scan-to-editable-plan/apartment";
import { vectorExportFontBytes, vectorPdfPageContent } from "./fixtures/scan-to-editable-plan/pdf-vector-inspection";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { buildDownloadPlanDrawing } from "@/lib/download-plan-drawing";
import { decodeDownloadPlan, encodeDownloadPlan, planWirePathPoints } from "@/lib/download-plan-wire";
import { drawDownloadPlanPages } from "@/lib/download-pdf-plan-pages";
import { buildOpeningSymbolLines2D } from "@/lib/plan-opening-symbol-lines";
import { formatRoomArea } from "@/lib/download-plan-rooms-drawing";
import { buildPdfExportItems } from "@/lib/design-page-pdf-export-payload";
import { createRoom, type DesignItem, type DesignSnapshot } from "@/lib/room-types";

/** The Download PDF's furnished layout plan: drawing, wire checks, and the pages it adds. */

const close = (actual: number, expected: number, label: string) => assert(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);

function sofa(instanceId: string, position: [number, number, number]): DesignItem {
  return { instanceId, productId: "offline-sofa", variantId: "authored", position, rotationY: 0,
    productSnapshot: { schemaVersion: 1, productId: "offline-sofa", variantId: "authored", name: "Authored sofa", category: "sofa",
      dimensionsMm: { w: 2000, d: 900, h: 800 }, variantLabel: "Authored", assets: {} } };
}

/** The editor's door and window symbols, unchanged by their move into lib/plan-opening-symbol-lines. */
function testOpeningSymbols() {
  const base = { start: { x: 0, z: 0 }, end: { x: 1, z: 0 }, wall: "north" as const };
  const window = buildOpeningSymbolLines2D({ ...base, kind: "window" });
  assert.deepEqual(window.map((line) => line.points.map(({ z }) => z)), [[-0.045, -0.045], [0.045, 0.045], [-0.045, 0.045], [-0.045, 0.045]]);
  const swing = buildOpeningSymbolLines2D({ ...base, kind: "door" });
  assert.deepEqual(swing.map(({ role }) => role), ["swing_leaf", "swing_arc"]);
  assert.deepEqual(swing[0].points, [{ x: 0, z: 0 }, { x: 0, z: 1 }], "The leaf stands open from the hinge, into the room.");
  close(swing[1].points[0].x, 1, "arc starts at the closed end"); close(swing[1].points[8].z, 1, "arc ends at the open leaf");
  assert.equal(swing[1].points.length, 9);
  const sliding = buildOpeningSymbolLines2D({ ...base, kind: "door", doorStyle: "sliding" });
  assert.deepEqual(sliding.map((line) => line.points), [[{ x: 0, z: 0 }, { x: 0.58, z: 0 }], [{ x: 0.42, z: 0.055 }, { x: 1, z: 0.055 }]]);
  const folding = buildOpeningSymbolLines2D({ ...base, kind: "door", doorStyle: "folding" });
  assert.deepEqual(folding[0].points.map(({ z }) => z), [0, 0.07, -0.07, 0.07, 0]);
  assert.deepEqual(buildOpeningSymbolLines2D({ ...base, kind: "door", doorStyle: "open" }), [], "An open doorway is only the gap.");
  const south = buildOpeningSymbolLines2D({ ...base, wall: "south", kind: "door" });
  assert.deepEqual(south[0].points[1], { x: 0, z: -1 }, "A south wall's door opens north, into its room.");
}

function roomsSnapshot(): DesignSnapshot {
  const living = createRoom("living", "Living", "living", { width: 5, depth: 4, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 });
  const bedroom = { ...createRoom("bed", "主人房", "bedroom", { width: 3, depth: 4, wallThickness: 0.12, height: 2.6, slabThickness: 0.1 }), planPosition: { x: 4, z: 0 } };
  living.items = [sofa("sofa-a", [0, 0, 1]), sofa("sofa-b", [0, 0, -1])];
  return { version: 3, rooms: [living, bedroom], activeRoomId: "living", floorPlan: { openings: [
    { id: "door-1", roomId: "living", wall: "south", offsetMm: 0, widthMm: 900, kind: "door", doorStyle: "swing" },
    { id: "window-1", roomId: "living", wall: "north", offsetMm: 500, widthMm: 1200, kind: "window" },
  ] } };
}

function testRoomsDrawing() {
  const snapshot = roomsSnapshot(), before = JSON.stringify(snapshot);
  const plan = buildDownloadPlanDrawing(snapshot);
  assert.equal(JSON.stringify(snapshot), before, "Drawing the plan never changes the design.");
  assert.equal(plan.sheets.length, 1, "One floor, one sheet.");
  const primitives = plan.sheets[0].primitives, roles = primitives.map(({ role }) => role);
  assert(roles.filter((role) => role === "wall").length >= 8, "Every room's walls draw as filled bands.");
  const arc = primitives.find((primitive) => primitive.role === "swing_arc");
  assert(arc?.kind === "path" && / C /.test(arc.path), "A door swing is one true curve, not dashes.");
  assert.equal(roles.filter((role) => role === "glazing").length, 2, "A window draws its two glazing lines.");
  assert(roles.lastIndexOf("furniture-tag") < roles.indexOf("room-label"), "Names come after furniture, so its paper never covers them.");
  assert(roles.lastIndexOf("wall") < roles.indexOf("furniture"), "Furniture is drawn over the walls' fill.");
  const labels = primitives.filter((primitive) => primitive.kind === "text" && primitive.role === "room-label").map((primitive) => primitive.kind === "text" ? primitive.text : "");
  assert.deepEqual(labels, ["Living · 20.0 m²", "主人房 · 12.0 m²"]);
  assert.equal(plan.sheets[0].labelFallbacks["bed:label"], "Bedroom · 12.0 m²", "A name the PDF font cannot set falls back to its room type.");
  assert.deepEqual(plan.schedule.map(({ tag, quantity }) => [tag, quantity]), [[1, 2]], "Two of the same sofa share one tag.");
  assert.deepEqual(plan.tagByInstanceId, { "sofa-a": 1, "sofa-b": 1 });
  assert.deepEqual(buildPdfExportItems(snapshot.rooms[0].items, plan.tagByInstanceId).map(({ tag }) => tag), [1, 1], "The product list carries the plan's tags.");
  assert.equal(formatRoomArea(123.4), "123 m²");
  return plan;
}

function testCanonicalDrawing() {
  const document = authoredApartment();
  const snapshot = canonicalFloorPlanToDesignSnapshot(document).snapshot;
  snapshot.floorPlan = { ...snapshot.floorPlan, canonicalDocument: document };
  snapshot.rooms[0].items = [sofa("imported-sofa", [1, 0, 1])];
  const plan = buildDownloadPlanDrawing(snapshot);
  assert.equal(plan.sheets.length, 1);
  const roles = plan.sheets[0].primitives.map(({ role }) => role);
  assert(roles.includes("wall") && roles.includes("furniture-symbol"), "An imported plan draws its own walls, with the furniture on them.");
  assert(!roles.some((role) => role.startsWith("dimension")), "The furnished plan leaves dimension strings to the vector export.");
  assert(roles.lastIndexOf("furniture-tag") < roles.indexOf("room-label"));
  assert.deepEqual(plan.tagByInstanceId, { "imported-sofa": 1 });
}

function testWire(plan: ReturnType<typeof buildDownloadPlanDrawing>) {
  const wire = JSON.parse(JSON.stringify(encodeDownloadPlan(plan)));
  const decoded = decodeDownloadPlan(wire);
  if (!decoded) throw new Error("The client's own plan must pass the server's checks.");
  assert.equal(decoded.sheets[0].drawing.primitives.length, plan.sheets[0].primitives.length);
  assert.equal(decoded.schedule.length, 1);
  assert.deepEqual(planWirePathPoints("M 0 0 C 1 1 2 2 3 3 L 4 4 Z"), [{ xMm: 0, zMm: 0 }, { xMm: 1, zMm: 1 }, { xMm: 2, zMm: 2 }, { xMm: 3, zMm: 3 }, { xMm: 4, zMm: 4 }]);
  for (const path of ["M 0 0 A 1 1 0 0 1 2 2", "L 0 0", "M 0", "M 0 0 L 1e9 0", "M 0 0 L NaN 1", "M 0 0 L 1 1 m"]) {
    assert.equal(planWirePathPoints(path), null, `Rejects ${path}`);
  }
  const tampered = (change: (copy: typeof wire) => void) => { const copy = JSON.parse(JSON.stringify(wire)); change(copy); return decodeDownloadPlan(copy); };
  assert.equal(tampered((copy) => { copy.sheets[0].primitives[0].path = "M 0 0 Q 1 1 2 2"; }), null);
  assert.equal(tampered((copy) => { copy.sheets[0].primitives[0].role = "Wall<script>"; }), null);
  assert.equal(tampered((copy) => { copy.sheets[0].title = "Line\nbreak"; }), null);
  assert.equal(tampered((copy) => { copy.schedule[0].tag = 0; }), null);
  assert.equal(tampered((copy) => { copy.sheets = Array.from({ length: 9 }, () => copy.sheets[0]); }), null, "At most eight sheets.");
  return decoded;
}

async function testPages(decoded: NonNullable<ReturnType<typeof decodeDownloadPlan>>) {
  const pdf = await PDFDocument.create();
  let decorated = 0;
  const result = await drawDownloadPlanPages(pdf, decoded, new Uint8Array(await vectorExportFontBytes()), () => { decorated += 1; });
  assert.deepEqual(result, { sheetsDrawn: 1, sheetsSkipped: 0 });
  assert.equal(pdf.getPageCount(), 2, "The plan sheet, then its schedule.");
  assert.equal(decorated, 2, "Every plan page carries the tier's watermark.");
  const [width, height] = [pdf.getPage(0).getWidth(), pdf.getPage(0).getHeight()];
  assert(Math.abs(width - 297 * 72 / 25.4) < 0.01 && Math.abs(height - 210 * 72 / 25.4) < 0.01, "A small home fits A4 landscape.");
  // The inspector reads saved page streams, as a viewer would.
  const content = vectorPdfPageContent(await PDFDocument.load(await pdf.save({ useObjectStreams: false })));
  assert(/\bc\b/.test(content), "The swing stays a native PDF curve.");
  const huge = { ...decoded, sheets: decoded.sheets.map((sheet) => ({ ...sheet, drawing: { ...sheet.drawing, primitives: [...sheet.drawing.primitives,
    { id: "far", kind: "path" as const, path: "M 0 0 L 200000 0", fill: false, points: [{ xMm: 0, zMm: 0 }, { xMm: 200000, zMm: 0 }], role: "wall" }] } })) };
  const tooLarge = await drawDownloadPlanPages(await PDFDocument.create(), huge, new Uint8Array(await vectorExportFontBytes()));
  assert.deepEqual(tooLarge, { sheetsDrawn: 0, sheetsSkipped: 1 }, "A plan too large for A3 at 1:200 is left out, not shrunk off-scale.");
}

async function main() {
  testOpeningSymbols();
  const plan = testRoomsDrawing();
  testCanonicalDrawing();
  await testPages(testWire(plan));
  console.log("download PDF plan: drawing, wire and page checks passed");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
