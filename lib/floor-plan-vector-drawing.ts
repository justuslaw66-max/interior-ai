import type { CompiledFloorPlanFloorV2 } from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanDocumentV2, FloorPlanPointMmV2 as Point } from "@/lib/floor-plan-document-v2";
import { compileCanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import { buildRectangularWallFootprint } from "@/lib/floor-plan-wall-footprints";
import { buildCanonicalOpeningSymbolLinesV2 } from "@/lib/floor-plan-opening-primitives";

export type PlanDrawingPrimitive =
  | { id: string; kind: "path"; path: string; fill: boolean; points: Point[]; role: string }
  | { id: string; kind: "text"; text: string; point: Point; role: string };
export type PlanDrawingOptions = { floorId: string; dimensions: boolean; labels: boolean; fixtures: boolean };
export type PlanVectorDrawing = { geometryHash: string; primitives: PlanDrawingPrimitive[]; unsupported: string[] };

const number = (value: number) => Number(value.toFixed(6));
const xy = (point: Point) => `${number(point.xMm)} ${number(point.zMm)}`;

function line(id: string, points: Point[], role: string, fill = false): PlanDrawingPrimitive {
  return { id, kind: "path", path: points.map((point, i) => `${i ? "L" : "M"} ${xy(point)}`).join(" ") + (fill ? " Z" : ""), fill, points, role };
}

/** Circular segments use native cubic curves; no tessellated swing dashes. */
function swingCurve(id: string, center: Point, points: Point[]): PlanDrawingPrimitive {
  const first = points[0];
  const last = points[points.length - 1];
  const a = Math.atan2(first.zMm - center.zMm, first.xMm - center.xMm);
  let sweep = Math.atan2(last.zMm - center.zMm, last.xMm - center.xMm) - a;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  const factor = 4 / 3 * Math.tan(sweep / 4);
  const c1 = { xMm: first.xMm - factor * (first.zMm - center.zMm), zMm: first.zMm + factor * (first.xMm - center.xMm) };
  const c2 = { xMm: last.xMm + factor * (last.zMm - center.zMm), zMm: last.zMm - factor * (last.xMm - center.xMm) };
  return { id, kind: "path", path: `M ${xy(first)} C ${xy(c1)} ${xy(c2)} ${xy(last)}`, fill: false, points, role: "swing_arc" };
}

function openingPrimitives(floor: CompiledFloorPlanFloorV2) {
  return floor.openings.flatMap((opening) => {
    const symbols = buildCanonicalOpeningSymbolLinesV2(opening);
    return symbols.map((symbol, index) => {
      const id = `${opening.id}:${symbol.role}:${index}`;
      const leaf = symbols[index - 1];
      return symbol.role === "swing_arc" && leaf?.role === "swing_leaf"
        ? swingCurve(id, leaf.points[0], symbol.points)
        : line(id, symbol.points, symbol.role);
    });
  });
}

function dimensionPrimitives(floor: CompiledFloorPlanFloorV2): PlanDrawingPrimitive[] {
  return floor.dimensions.flatMap((dimension) => {
    const horizontal = dimension.axis === "horizontal";
    const vertical = dimension.axis === "vertical";
    const start = { ...dimension.from };
    const end = { ...dimension.to };
    if (horizontal) end.zMm = start.zMm;
    if (vertical) end.xMm = start.xMm;
    const length = Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm);
    if (!length) return [];
    const normal = { xMm: -(end.zMm - start.zMm) / length, zMm: (end.xMm - start.xMm) / length };
    const shift = (point: Point, distance: number) => ({ xMm: point.xMm + normal.xMm * distance, zMm: point.zMm + normal.zMm * distance });
    const a = shift(start, -500), b = shift(end, -500);
    return [
      line(`${dimension.id}:line`, [a, b], "dimension"),
      line(`${dimension.id}:extension-a`, [start, shift(start, -650)], "dimension-extension"),
      line(`${dimension.id}:extension-b`, [end, shift(end, -650)], "dimension-extension"),
      line(`${dimension.id}:tick-a`, [shift(a, -70), shift(a, 70)], "dimension-tick"),
      line(`${dimension.id}:tick-b`, [shift(b, -70), shift(b, 70)], "dimension-tick"),
      { id: `${dimension.id}:text`, kind: "text", text: String(Math.round(dimension.actualMm)), point: shift({ xMm: (a.xMm + b.xMm) / 2, zMm: (a.zMm + b.zMm) / 2 }, -100), role: "live-dimension-mm" },
    ];
  });
}

function annotationPrimitives(floor: CompiledFloorPlanFloorV2): PlanDrawingPrimitive[] {
  return floor.annotations.flatMap((annotation) => {
    const geometry = annotation.geometry;
    const points = geometry.kind === "point" ? [geometry.point] : geometry.kind === "polygon" ? geometry.points : [geometry.start, geometry.end];
    if (!points.length) return [];
    const result: PlanDrawingPrimitive[] = [];
    if (points.length > 1) result.push(line(`${annotation.id}:artwork`, points, "annotation"));
    if (annotation.text) result.push({ id: `${annotation.id}:text`, kind: "text", text: annotation.text, point: points[0], role: "annotation-text" });
    return result;
  });
}

export function buildFloorPlanVectorDrawing(document: FloorPlanDocumentV2, options: PlanDrawingOptions): PlanVectorDrawing {
  const model = compileCanonicalFloorPlanRenderModel(document);
  const floor = model.floors.find(({ id }) => id === options.floorId);
  const compiled = model.compiledScene.floors.find(({ id }) => id === options.floorId);
  if (!floor || !compiled) throw new Error("Choose an existing floor for vector export.");
  const primitives: PlanDrawingPrimitive[] = [];
  const unsupported: string[] = [];
  for (const wall of floor.walls) {
    for (const [index, segment] of wall.planSegments.entries()) {
      const footprint = buildRectangularWallFootprint(segment, wall.thicknessMm);
      primitives.push(line(`${wall.id}:wall:${index}`, [footprint.startLeft, footprint.endLeft, footprint.endRight, footprint.startRight], "wall", true));
    }
    if (wall.path.kind === "arc") unsupported.push(`${wall.id}: curved wall footprint currently sampled`);
  }
  primitives.push(...openingPrimitives(compiled));
  if (options.dimensions) primitives.push(...dimensionPrimitives(compiled));
  if (options.labels) {
    primitives.push(...annotationPrimitives(compiled));
    for (const room of compiled.rooms) {
      const points = room.wallLoops.find((loop) => loop.kind === "outer")?.walls.map((ref) => ref.start) ?? [];
      if (!points.length) continue;
      primitives.push({ id: `${room.id}:label`, kind: "text", text: room.name, point: {
        xMm: (Math.min(...points.map((p) => p.xMm)) + Math.max(...points.map((p) => p.xMm))) / 2,
        zMm: (Math.min(...points.map((p) => p.zMm)) + Math.max(...points.map((p) => p.zMm))) / 2,
      }, role: "room-label" });
    }
  }
  if (options.fixtures) compiled.structures.forEach((structure) => primitives.push(line(`${structure.id}:outline`, [...structure.points, structure.points[0]], "fixture")));
  return { geometryHash: model.geometryHash, primitives, unsupported };
}
