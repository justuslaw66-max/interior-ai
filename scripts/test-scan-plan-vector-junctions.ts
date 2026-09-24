import assert from "node:assert/strict";
import type { FloorPlanDocumentV2, FloorPlanPointMmV2 as Point } from "@/lib/floor-plan-document-v2";
import { buildFloorPlanVectorDrawing, type PlanVectorDrawing } from "@/lib/floor-plan-vector-drawing";
import { compileCanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import { isPointInPlanarRing } from "@/lib/floor-plan-planar-union";

function wallAt(drawing: PlanVectorDrawing, point: Point) {
  return drawing.primitives.some((primitive) => primitive.kind === "path" && primitive.role === "wall" &&
    isPointInPlanarRing(point, primitive.points));
}

function checkWallCoverage(document: FloorPlanDocumentV2, transform: (point: Point) => Point) {
  const input = JSON.stringify(document), options = { floorId: "apartment", dimensions: true, labels: true, fixtures: true };
  const drawing = buildFloorPlanVectorDrawing(document, options);
  const occupied = [
    [-75, -75], [9335, -75], [9335, 6075], [-75, 6075], // Outside corner quarters formerly absent.
    [3980, -50], [4020, -50], [4000, 25], [4000, 5990], // Both T-junctions remain solid.
    [4990, 0], [6810, 0], [4000, 1690], [4000, 2560], // Actual opening jambs remain fixed.
  ];
  for (const [xMm, zMm] of occupied) assert(wallAt(drawing, transform({ xMm, zMm })), `Missing wall at ${xMm},${zMm}`);
  for (const [xMm, zMm] of [[150, 150], [5900, 0], [4000, 2100], [9400, 6150]]) {
    assert(!wallAt(drawing, transform({ xMm, zMm })), `Wall paint bridges an opening or leaks at ${xMm},${zMm}`);
  }
  const model = compileCanonicalFloorPlanRenderModel(document);
  assert.equal(drawing.geometryHash, model.geometryHash);
  assert.equal(drawing.primitives.filter((primitive) => primitive.role === "wall").length,
    model.floors[0].walls.reduce((count, wall) => count + wall.planSegments.length, 0),
    "Each uninterrupted wall section must retain a separately editable path.");
  assert.equal(JSON.stringify(document), input, "Export must not edit canonical geometry.");
  return drawing;
}

export function testVectorJunctions(document: FloorPlanDocumentV2) {
  checkWallCoverage(document, (point) => point);
  // A 3-4-5 rotation preserves integer coordinates for this independently authored fixture.
  const rotate = ({ xMm, zMm }: Point) => ({ xMm: Math.round(xMm * 0.8 - zMm * 0.6),
    zMm: Math.round(xMm * 0.6 + zMm * 0.8) });
  const rotated = structuredClone(document);
  rotated.floors[0].vertices = rotated.floors[0].vertices.map((vertex) => ({ ...vertex, ...rotate(vertex) }));
  rotated.floors[0].dimensions = rotated.floors[0].dimensions.map((dimension) => ({ ...dimension, axis: "aligned" }));
  checkWallCoverage(rotated, rotate);
  for (const thickness of [120, 200, 300]) {
    const source = structuredClone(document), host = source.floors[0].walls.find((wall) => wall.id === "north-east");
    assert(host); host.thicknessMm = thickness;
    const drawing = buildFloorPlanVectorDrawing(source, { floorId: "apartment", dimensions: false, labels: false, fixtures: false });
    const rails = drawing.primitives.filter((primitive) => primitive.id.startsWith("window:") && primitive.kind === "path");
    assert.equal(rails.length, 3);
    assert.deepEqual(rails.flatMap((primitive) => primitive.kind === "path" ? [primitive.points[0].zMm] : []).sort((a, b) => a - b),
      [-thickness / 2, 0, thickness / 2], "Window rails must align with this host's actual wall faces.");
    for (const rail of rails) if (rail.kind === "path") {
      assert.deepEqual(rail.points.map((point) => point.xMm), [5000, 6800], "Frame alignment cannot alter the opening span.");
    }
  }
  console.log("PASS: vector wall corners, T-junctions, open gaps, rotated plans, independent wall paths and host-width window frames");
}

export function testVectorInk(svg: string, scale: number) {
  const frames = [...svg.matchAll(/id="window:fixed_panel:\d+" d="([^"]+)"/g)];
  assert.equal(frames.length, 2);
  for (const [, path] of frames) {
    const [x1, z1, x2, z2] = path.replace(/[ML]/g, "").trim().split(/\s+/).map(Number);
    assert.deepEqual([x1, x2], [5000, 6800]);
    assert.equal(z1, z2);
    assert(Math.abs((Math.abs(z1) + 0.09 * scale) / scale - 100 / scale) < 1e-8,
      "Actual frame stroke must end at the wall face at both print scales.");
  }
  const wallPaths = [...svg.matchAll(/<path id="[^"]+:wall:\d+"[^>]+>/g)];
  assert.equal(wallPaths.length, 9);
  assert(wallPaths.every(([path]) => path.includes('stroke="none"')),
    "Separate wall paths must not add internal borders or projecting stroke spikes.");
}
