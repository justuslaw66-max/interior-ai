import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { validateFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type {
  FloorPlanDocumentV2,
  FloorPlanOpeningV2,
  FloorPlanRoomV2,
  FloorPlanVertexV2,
  FloorPlanWallV2,
} from "@/lib/floor-plan-document-v2";
import type { RegisteredPageEvidence } from "@/lib/floor-plan-imports/deterministic-evidence";
import { PdfRasterFloorPlanSourceAdapter } from "@/lib/floor-plan-imports/pdf-raster-adapter";
import type { FloorPlanAdapterContext } from "@/lib/floor-plan-imports/source-adapter";
import { parseFloorPlanVectorizerEvidence, registerVectorizerEvidence } from "@/lib/floor-plan-imports/vectorizer-evidence";
import { cleanVectorizerTopology, summarizeTopologyCleanup } from "@/lib/floor-plan-imports/vectorizer-topology-cleanup";
import { type TopologyFloor, wallsByVertex } from "@/lib/floor-plan-imports/vectorizer-topology-graph";

/**
 * The topology clean-up (vectorizer-topology-cleanup.ts): each step on a small floor drawn for it, then the real
 * exporter fixtures through the adapter with the switch on (every document still compiles, fewer free wall ends) and
 * off (the document is as before).
 */

const provenance: FloorPlanVertexV2["provenance"] = { confidence: 1, extractionVersion: "test", evidence: [], reviewHistory: [] };
type WallSpec = [id: string, start: string, end: string, thicknessMm: number, rooms?: string[]];

function floorOf(points: Record<string, [number, number]>, wallSpecs: WallSpec[], loops: Record<string, string[]> = {},
  openings: Partial<FloorPlanOpeningV2>[] = []): TopologyFloor {
  const vertices = Object.entries(points).map(([id, [xMm, zMm]]) => ({ id, xMm, zMm, provenance }));
  const walls: FloorPlanWallV2[] = wallSpecs.map(([id, start, end, thicknessMm, rooms = []]) => ({
    id, path: { kind: "line", startVertexId: start, endVertexId: end }, thicknessMm,
    classification: rooms.length > 1 ? "interior" : "exterior", adjacentRoomIds: rooms, provenance,
  }));
  const rooms: FloorPlanRoomV2[] = Object.entries(loops).map(([id, refs]) => ({
    id, name: id, roomType: "other", provenance,
    wallLoops: [{ kind: "outer", walls: refs.map((ref) => ({ wallId: ref.replace("-", ""), direction: ref.startsWith("-") ? "reverse" : "forward" })) }],
  }));
  return {
    vertices, walls, rooms, annotations: [], dimensions: [], structures: [],
    openings: openings.map((opening, index) => ({ id: `o${index + 1}`, kind: "door", operation: "swing",
      offsetMm: 0, widthMm: 800, hinge: "unknown", handing: "unknown", provenance, ...opening }) as FloorPlanOpeningV2),
  };
}

const square: Record<string, [number, number]> = { a: [0, 0], b: [4000, 0], c: [4000, 3000], d: [0, 3000] };
const box: WallSpec[] = [["w1", "a", "b", 200, ["r"]], ["w2", "b", "c", 200, ["r"]], ["w3", "c", "d", 200, ["r"]], ["w4", "d", "a", 200, ["r"]]];

// A free end 60 mm short of a room wall meets it in a T; the room wall is split there and keeps its door.
{
  const floor = floorOf({ ...square, e: [2000, 1000], f: [2000, 2940] }, [...box, ["w5", "e", "f", 100]],
    { r: ["w1", "w2", "w3", "w4"] }, [{ wallId: "w3", offsetMm: 300, widthMm: 800 }]);
  const log = cleanVectorizerTopology(floor);
  assert.equal(log.joined, 1);
  const tee = floor.vertices.find((vertex) => vertex.xMm === 2000 && vertex.zMm === 3000);
  assert.ok(tee, "the T is a shared vertex on the room wall");
  assert.equal(wallsByVertex(floor).get(tee.id)?.length, 3);
  assert.equal(floor.rooms[0].wallLoops[0].walls.length, 5, "the room's loop runs through both halves");
  const door = floor.openings[0];
  const host = floor.walls.find((wall) => wall.id === door.wallId)!;
  assert.equal(host.path.endVertexId, tee.id, "the door (300-1100 mm from c) stays on the half from c to the T");
  assert.equal(door.offsetMm, 300);
}

// Pieces running straight on with the same thickness and rooms become one wall; an opening keeps its place.
{
  const floor = floorOf({ ...square, m: [2000, 0] },
    [["w1a", "a", "m", 200, ["r"]], ["w1b", "b", "m", 200, ["r"]], ...box.slice(1)],
    { r: ["w1a", "-w1b", "w2", "w3", "w4"] }, [{ wallId: "w1b", offsetMm: 500, widthMm: 900 }]);
  const log = cleanVectorizerTopology(floor);
  assert.equal(log.merged, 1);
  assert.equal(floor.walls.length, 4);
  const merged = floor.walls.find((wall) => wall.id === "w1a")!;
  assert.deepEqual([merged.path.startVertexId, merged.path.endVertexId], ["a", "b"]);
  assert.equal(floor.openings[0].wallId, "w1a");
  assert.equal(floor.openings[0].offsetMm, 2000 + (2000 - 500 - 900), "500 mm from b is 2600 mm from a");
  assert.deepEqual(floor.rooms[0].wallLoops[0].walls.map((ref) => ref.wallId), ["w1a", "w2", "w3", "w4"]);
  assert.ok(!floor.vertices.some((vertex) => vertex.id === "m"), "the vertex between them goes");
}

// A short piece running straight on into a longer wall at another thickness takes its thickness, then merges.
{
  const floor = floorOf({ ...square, m: [3880, 0] },
    [["w1a", "a", "m", 200, ["r"]], ["w1b", "m", "b", 150, ["r"]], ...box.slice(1)], { r: ["w1a", "w1b", "w2", "w3", "w4"] });
  const log = cleanVectorizerTopology(floor);
  assert.equal(log.thickened, 1);
  assert.equal(floor.walls.find((wall) => wall.id === "w1a")!.thicknessMm, 200);
  assert.equal(floor.walls.length, 4);
}

// Walls within 2 degrees of square are squared and logged; one further off is left as drawn.
{
  const floor = floorOf({ a: [0, 0], b: [4000, 50], c: [4000, 3000], d: [0, 3000] }, box, { r: ["w1", "w2", "w3", "w4"] });
  const log = cleanVectorizerTopology(floor);
  assert.equal(log.squared.length, 1);
  assert.equal(log.squared[0].wallId, "w1");
  assert.equal(log.squared[0].degrees, 0.72);
  const [a, b] = ["a", "b"].map((id) => floor.vertices.find((vertex) => vertex.id === id)!);
  assert.equal(a.zMm, b.zMm);
  assert.match(summarizeTopologyCleanup(log), /squared 1 \(w1 0\.72deg 25mm\)/);
  const skew = floorOf({ a: [0, 0], b: [4000, 400], c: [4000, 3000], d: [0, 3000] }, box, { r: ["w1", "w2", "w3", "w4"] });
  assert.equal(cleanVectorizerTopology(skew).squared.length, 0);
}

// A short wall no room uses with nothing near either end is dropped; a long one stays.
{
  const floor = floorOf({ ...square, e: [1000, 1500], f: [1200, 1500], g: [1000, 2000], h: [2500, 2000] },
    [...box, ["w5", "e", "f", 100], ["w6", "g", "h", 100]], { r: ["w1", "w2", "w3", "w4"] });
  const log = cleanVectorizerTopology(floor);
  assert.equal(log.stubsDropped, 1);
  assert.deepEqual(floor.walls.map((wall) => wall.id).sort(), ["w1", "w2", "w3", "w4", "w6"]);
}

// A piece lying along a wall for most of its length is folded into it: one wall, both bands wide, in their middle.
{
  const floor = floorOf({ ...square, e: [200, -150], f: [3800, -150] }, [...box, ["w5", "e", "f", 100]],
    { r: ["w1", "w2", "w3", "w4"] });
  const log = cleanVectorizerTopology(floor);
  assert.equal(log.folded, 1);
  const wall = floor.walls.find((candidate) => candidate.id === "w1")!;
  assert.equal(wall.thicknessMm, 300);
  assert.equal(floor.vertices.find((vertex) => vertex.id === "a")!.zMm, -50);
  assert.ok(!floor.walls.some((candidate) => candidate.id === "w5"));
}

// Real exporter fixtures through the adapter: off leaves the document as it was; on, it still compiles.
const fixtureDirectory = path.join(__dirname, "fixtures", "floor-plan-vectorizer");
const context = { jobId: "topology-cleanup-test" } as unknown as FloorPlanAdapterContext;

async function documentFor(file: string) {
  const bytes = readFileSync(path.join(fixtureDirectory, file));
  const evidence = parseFloorPlanVectorizerEvidence(JSON.parse(bytes.toString("utf8")));
  const page: RegisteredPageEvidence = {
    pageNumber: 1, widthPx: evidence.page.widthPx, heightPx: evidence.page.heightPx, vectorPaths: [], text: [],
    vectorSegments: evidence.wallEdges.map((edge, index) => ({
      id: `raster-${index + 1}`, pageNumber: 1, strokeWidthPx: 1, evidenceKind: "raster_linework" as const,
      start: { x: edge.sourcePx[0][0], y: edge.sourcePx[0][1] }, end: { x: edge.sourcePx[1][0], y: edge.sourcePx[1][1] },
    })),
    semantics: { roomLabels: [], dimensionLabels: [], openingSymbols: [], notes: [] },
  };
  page.semantics = registerVectorizerEvidence(page, evidence, bytes);
  const adapter = new PdfRasterFloorPlanSourceAdapter({ localOcrProvider: null, vectorizerProvider: null });
  const solved = await adapter.solveScale({
    candidate: { kind: "floor_plan_deterministic_evidence_v1", pages: [page], scale: null, scales: [],
      source: { id: "source-1", fileName: "page.png", mimeType: "image/png", sha256: "0".repeat(64) } } as never,
    sourceManifest: null, reviewIssues: [],
  });
  const built = await adapter.buildTopology(solved, context);
  return { document: built.candidate as unknown as FloorPlanDocumentV2, cleanup: String(built.metrics?.topologyCleanup) };
}

function freeEnds(document: FloorPlanDocumentV2) {
  return [...wallsByVertex(document.floors[0]).values()].filter((walls) => walls.length === 1).length;
}

async function main() {
  const previous = process.env.FLOOR_PLAN_TOPOLOGY_CLEANUP;
  try {
    for (const file of readdirSync(fixtureDirectory).filter((name) => name.endsWith(".evidence.json"))) {
      delete process.env.FLOOR_PLAN_TOPOLOGY_CLEANUP;
      const off = await documentFor(file);
      assert.equal(off.cleanup, "off", file);
      process.env.FLOOR_PLAN_TOPOLOGY_CLEANUP = "1";
      const on = await documentFor(file);
      assert.match(on.cleanup, /^joined \d+; merged \d+;/, file);
      const errors = validateFloorPlanDocumentV2(on.document).filter((issue) => issue.severity === "error");
      assert.deepEqual(errors.map((issue) => issue.code), [], `${file} still compiles`);
      assert.ok(freeEnds(on.document) <= freeEnds(off.document), `${file}: no more free wall ends`);
      assert.equal(on.document.floors[0].rooms.length, off.document.floors[0].rooms.length, `${file}: the same rooms`);
      assert.equal(on.document.floors[0].openings.length, off.document.floors[0].openings.length, `${file}: the same openings`);
      console.log(`  ${file}: ${on.cleanup.slice(0, 120)}`);
    }
  } finally {
    if (previous === undefined) delete process.env.FLOOR_PLAN_TOPOLOGY_CLEANUP;
    else process.env.FLOOR_PLAN_TOPOLOGY_CLEANUP = previous;
  }
  console.log("floor-plan topology clean-up tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
