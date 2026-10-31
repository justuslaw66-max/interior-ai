import assert from "node:assert/strict";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import { registerEmptyPlanScaleCalibration } from "@/lib/floor-plan-import-review-geometry";
import { findRoomRegion } from "@/lib/floor-plan-review-room-fill";
import { roomCornersFromRegion, traceBoundary } from "@/lib/floor-plan-review-room-outline";
import { inkFromPixels, roomMaskSize, withSegments, type InkMask } from "@/lib/floor-plan-review-room-mask";
import { findRoomAtClick, roomTypeFromName } from "@/lib/floor-plan-review-room-click";
import { addFoundRoom } from "@/lib/floor-plan-review-room-conform";
import { openingKindFromNote, openingSymbolAt } from "@/lib/floor-plan-review-door-click";
import { traceOpeningFromSourceSpan, type ReviewSourcePoint } from "@/lib/floor-plan-import-review-geometry";
import { openingSymbolClick } from "@/components/editor/floor-plan-import-review/openingSymbolClick";
import { loadPingYiCourtV2ReviewSeedBundle } from "@/lib/floor-plan-seeds/ping-yi-court-review-intake";

// "Click inside a room" in the upload review (J, 1 Nov 2026: one click inside a closed area of the clean drawing makes
// that room). A drawn plan at 20 mm a pixel, walls 6 px (120 mm) thick on these centre lines:
//
//   x=100        x=400        x=650   x=800
//   +------------+------------+-------+  y=100
//   |  A         :  B         |  E    |
//   |  BEDROOM 2 :  (door)    +-------+  y=250
//   |            |            |
//   +------------+------------+          y=350
//   |  C                      |
//   +-------------------------+          y=550
//
// A to B through an 800 mm doorway (y 200-240). A's printed name, a row of letter marks across its middle, leaves too
// little room at its ends for the sweeping square: A's two halves join along the edge they share through the lettering.
const W = 1000, H = 800;

function plan(): InkMask {
  const ink = new Uint8Array(W * H);
  const box = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) ink[y * W + x] = 1;
  };
  const wall = (x0: number, y0: number, x1: number, y1: number) => box(Math.min(x0, x1) - 3, Math.min(y0, y1) - 3, Math.max(x0, x1) + 3, Math.max(y0, y1) + 3);
  wall(100, 100, 800, 100); wall(100, 100, 100, 550); wall(100, 550, 650, 550); wall(650, 100, 650, 550);
  wall(100, 350, 650, 350); wall(800, 100, 800, 250); wall(650, 250, 800, 250);
  wall(400, 100, 400, 200); wall(400, 240, 400, 350);
  for (let x = 140; x < 360; x += 12) box(x, 220, x + 6, 232);
  return { ink, widthPx: W, heightPx: H, scale: 1 };
}

const area = (region: Uint8Array) => region.reduce((sum, value) => sum + value, 0) * 0.0004;
const near = (actual: { x: number; y: number }[], expected: [number, number][], tolerance = 2) =>
  expected.every(([x, y]) => actual.some((point) => Math.hypot(point.x - x, point.y - y) <= tolerance));

// 1. The room around a click: A whole, stopped by the doorway (not B), its printed name not cutting it up.
const mask = plan();
const roomA = findRoomRegion(mask, { x: 250, y: 160 }, 20);
assert.ok(roomA.ok);
assert.ok(roomA.areaM2 > 27 && roomA.areaM2 < 30, `room A is about 6 m by 5 m inside: ${roomA.areaM2}`);
assert.equal(roomA.region[220 * W + 520], 0, "B, beyond the doorway, is not part of A");
assert.equal(roomA.region[226 * W + 250], 1, "A's printed name lies inside it");
const belowName = findRoomRegion(mask, { x: 250, y: 300 }, 20);
assert.ok(belowName.ok && Math.abs(belowName.areaM2 - roomA.areaM2) < 0.01, "a click below the name finds the same room");
assert.ok(Math.abs(area(roomA.region) - roomA.areaM2) < 1e-9);

// 2. Nothing closed: a click on paper running out to the page edge, a click on a wall, a page too coarse to read.
assert.deepEqual(findRoomRegion(mask, { x: 900, y: 700 }, 20), { ok: false, failure: "open_to_edge" });
const walled = findRoomRegion(withSegments(mask, [[{ x: 0, y: 0 }, { x: 0, y: 0 }]], 1), { x: 100, y: 450 }, 20);
assert.ok(walled.ok && walled.region[450 * W + 300] === 1, "a click on a wall takes the paper nearest it");
assert.deepEqual(findRoomRegion({ ink: new Uint8Array(4), widthPx: 2, heightPx: 2 }, { x: 1, y: 1 }, 20), { ok: false, failure: "no_room_here" });

// 3. Its corners: the four wall centre lines, at the drawn 120 mm thickness.
const outline = roomCornersFromRegion(roomA.region, mask.ink, W, H, 20);
assert.ok(outline);
assert.equal(outline.corners.length, 4, JSON.stringify(outline.corners));
assert.ok(near(outline.corners, [[100, 100], [400, 100], [400, 350], [100, 350]]), JSON.stringify(outline.corners));
assert.equal(outline.wallThicknessMm, 120);
assert.equal(traceBoundary(new Uint8Array([0, 1, 1, 0, 1, 1, 0, 0, 0]), 3, 3).length, 4, "a 2 px square has four corners");

// 4. The mask: ink is what is darker than mid grey over white; a page is shrunk to at most 2.5 MP.
assert.deepEqual([...inkFromPixels([0, 0, 0, 255, 200, 200, 200, 255, 0, 0, 0, 40, 120, 120, 120, 255], 4, 1)], [1, 0, 0, 1]);
assert.deepEqual(roomMaskSize(1000, 800), { widthPx: 1000, heightPx: 800, scale: 1 });
assert.ok(roomMaskSize(4000, 3000).widthPx * roomMaskSize(4000, 3000).heightPx <= 2_500_000);

// 5. In the review: a registered empty plan (100 px = 2 m) with A's printed name as page text.
const seed = loadPingYiCourtV2ReviewSeedBundle().fixtures[0].document;
const empty = structuredClone(seed);
const floor = empty.floors[0];
const sourceId = empty.sources[0].id;
Object.assign(floor, { calibrations: [], vertices: [], walls: [], rooms: [], openings: [], structures: [], dimensions: [], annotations: [] });
compileFloorPlanDocumentV2(empty);
let document: FloorPlanDocumentV2 = registerEmptyPlanScaleCalibration({ document: empty, floorId: floor.id, sourceId, pageNumber: 1,
  pageWidthPx: W, pageHeightPx: H, first: { x: 100, y: 100 }, second: { x: 300, y: 100 }, printedMm: 4000 });
document.floors[0].annotations.push({ id: "page-text-a", kind: "label", scope: "reference", text: "BEDROOM 2",
  geometry: { kind: "source_drawing", sourceId, pageNumber: 1, widthPx: W, heightPx: H, command: "text", points: [{ x: 250, y: 226 }] },
  provenance: { confidence: 0, extractionVersion: "test", reviewHistory: [], evidence: [] } });
const click = (x: number, y: number) => findRoomAtClick({ document, floorId: floor.id, sourceId, pageNumber: 1, mask, point: { x, y } });
const add = (x: number, y: number) => {
  const found = click(x, y);
  assert.ok(found.ok, JSON.stringify(found));
  document = addFoundRoom({ document, floorId: floor.id, sourceId, pageNumber: 1, corners: found.room.corners,
    roomName: found.room.name, roomType: found.room.roomType, wallThicknessMm: found.room.wallThicknessMm ?? 120, at: "2026-11-01T00:00:00.000Z" });
  return found.room;
};
const walls = () => document.floors[0].walls;
const wallBetween = (a: [number, number], b: [number, number]) => {
  const vertex = new Map(document.floors[0].vertices.map((entry) => [entry.id, entry]));
  return walls().filter((wall) => {
    const ends = [vertex.get(wall.path.startVertexId)!, vertex.get(wall.path.endVertexId)!].map((v) => `${v.xMm},${v.zMm}`).sort();
    return ends.join(" ") === [`${a[0]},${a[1]}`, `${b[0]},${b[1]}`].sort().join(" ");
  });
};

// A first: named from the page text inside it, a bedroom, its walls at the drawn thickness.
const a = add(250, 160);
assert.equal(a.name, "BEDROOM 2");
assert.equal(a.roomType, "bedroom");
assert.equal(document.floors[0].rooms.length, 1);
assert.equal(document.floors[0].rooms[0].name, "BEDROOM 2");
assert.equal(walls().length, 4);
assert.ok(walls().every((wall) => wall.thicknessMm === 120));
assert.deepEqual(click(250, 300), { ok: false, message: "This room is already outlined." });

// B next to it shares A's wall (one wall, both rooms beside it), not a second wall standing beside the first.
add(520, 160);
assert.equal(document.floors[0].rooms.length, 2);
assert.equal(walls().length, 7);
const shared = wallBetween([6000, 0], [6000, 5000]);
assert.equal(shared.length, 1);
assert.deepEqual([...shared[0].adjacentRoomIds].sort(), document.floors[0].rooms.map((room) => room.id).sort());

// C below both: A's corner on its top side joins the outline, so C reuses A's and B's bottom walls.
add(300, 450);
assert.equal(walls().length, 10);
assert.equal(wallBetween([0, 5000], [6000, 5000]).length, 1);
assert.equal(wallBetween([6000, 5000], [11000, 5000]).length, 1);

// E meets B's right wall half way down: that wall is split there and E reuses its top half.
add(720, 160);
assert.equal(document.floors[0].rooms.length, 4);
assert.equal(wallBetween([11000, 0], [11000, 3000]).length, 1, "B's right wall split where E's corner meets it");
assert.equal(wallBetween([11000, 3000], [11000, 5000]).length, 1);
assert.equal(wallBetween([11000, 0], [11000, 5000]).length, 0);
assert.ok(compileFloorPlanDocumentV2(document));

// 6. "Click on a door": the reader's unplaced door between A and B and a window in A's top wall, as review proposals.
const proposal = (index: number, note: string, points: ReviewSourcePoint[]) => document.floors[0].annotations.push({
  id: `source-proposal:1:opening:${index}`, kind: "note", scope: "reference", text: note,
  geometry: { kind: "source_drawing", sourceId, pageNumber: 1, widthPx: W, heightPx: H, command: "line", points },
  provenance: { confidence: 0, extractionVersion: "test", reviewHistory: [], evidence: [] } });
proposal(0, "Unverified door span; operation swing needs review", [{ x: 400, y: 200 }, { x: 400, y: 240 }]);
proposal(1, "Unverified window span; operation fixed needs review", [{ x: 150, y: 100 }, { x: 250, y: 100 }]);
const symbolAt = (x: number, y: number) => openingSymbolAt({ document, floorId: floor.id, sourceId, pageNumber: 1, point: { x, y } });
assert.deepEqual(symbolAt(425, 215), { id: "source-proposal:1:opening:0", kind: "door", points: [{ x: 400, y: 200 }, { x: 400, y: 240 }] });
assert.equal(symbolAt(200, 120)?.kind, "window");
assert.equal(symbolAt(250, 300), null, "a click away from every symbol finds none");
assert.equal(openingSymbolAt({ document, floorId: floor.id, sourceId, pageNumber: 2, point: { x: 425, y: 215 } }), null, "only this page's symbols");
assert.deepEqual(["Unverified door span", "Unverified window span", "Unverified open_passage span", "Unverified sliding_door span"].map(openingKindFromNote),
  ["door", "window", "open_passage", "door"]);
// A first click on a symbol fills both ends; a click with one end placed, or away from symbols, places one end.
let points: ReviewSourcePoint[] = [];
let symbol: string | null = null;
const clickAt = (x: number, y: number) => openingSymbolClick({ document, floorId: floor.id, sourceId, pageNumber: 1, current: points,
  setPoints: (value) => { points = value; }, setSymbol: (value) => { symbol = value.id; } })({ x, y });
clickAt(425, 215);
assert.deepEqual(points, [{ x: 400, y: 200 }, { x: 400, y: 240 }]);
assert.equal(symbol, "source-proposal:1:opening:0");
document = traceOpeningFromSourceSpan({ document, floorId: floor.id, sourceId, pageNumber: 1, first: points[0], second: points[1], kind: "door" });
assert.equal(document.floors[0].openings.length, 1);
assert.equal(document.floors[0].openings[0].widthMm, 800, "the door between A and B, 800 mm wide");
points = [];
clickAt(250, 300);
clickAt(425, 215);
assert.deepEqual(points, [{ x: 250, y: 300 }, { x: 425, y: 215 }]);

// 7. Room types from printed names, as the room panel offers them.
assert.deepEqual(["MASTER BEDROOM", "BATH/ W.C. 1", "KITCHEN", "SERVICE YARD", "HOUSEHOLD SHELTER", "STUDY", "LIVING/ DINING", "BALCONY"].map(roomTypeFromName),
  ["bedroom", "toilet", "kitchen", "service_yard", "shelter", "study", "living", "other"]);

console.log("floor plan review room click: ok");
