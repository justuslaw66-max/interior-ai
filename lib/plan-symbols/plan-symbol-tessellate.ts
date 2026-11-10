import { roundedRectPoints } from "./plan-symbol-shapes";
import type { PlanSymbolPoint, PlanSymbolShape, PlanSymbolStroke } from "./plan-symbol-types";

/**
 * A symbol as straight segments and fill polygons, for a renderer that draws lines
 * (the 2D plan's WebGL canvas). Painting order becomes height: each filled shape sits
 * one layer above what came before it, so a table's paper covers its tucked-in chairs
 * under the plan's top-down camera.
 */

export type PlanSymbolLineBatch = {
  stroke: PlanSymbolStroke;
  dashed: boolean;
  /** Segment end points in pairs, as [x, y, z]. */
  segments: Array<[number, number, number]>;
};

export type PlanSymbolFillPolygon = {
  y: number;
  points: PlanSymbolPoint[];
};

export type TessellatedPlanSymbol = {
  lines: PlanSymbolLineBatch[];
  fills: PlanSymbolFillPolygon[];
  /** Just above the highest line, where selection marks can go. */
  topY: number;
};

export type PlanSymbolTessellationOptions = {
  baseY: number;
  /** Height between layers; enough for the plan camera's depth buffer to tell apart. */
  layerStep: number;
};

const CURVE_SEGMENTS = 32;

function ellipsePoints(cx: number, cz: number, rx: number, rz: number): PlanSymbolPoint[] {
  return Array.from({ length: CURVE_SEGMENTS }, (_, index) => {
    const angle = (index / CURVE_SEGMENTS) * Math.PI * 2;
    return [cx + rx * Math.cos(angle), cz + rz * Math.sin(angle)] as const;
  });
}

function arcPoints(shape: Extract<PlanSymbolShape, { type: "arc" }>): PlanSymbolPoint[] {
  const span = shape.endDeg - shape.startDeg;
  const steps = Math.max(4, Math.ceil((Math.abs(span) / 360) * CURVE_SEGMENTS));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const radians = ((shape.startDeg + (span * index) / steps) * Math.PI) / 180;
    return [shape.cx + shape.r * Math.cos(radians), shape.cz + shape.r * Math.sin(radians)] as const;
  });
}

/** A shape's outline as points, and whether it closes. */
export function planSymbolShapeOutline(shape: PlanSymbolShape): { points: PlanSymbolPoint[]; closed: boolean } {
  if (shape.type === "polyline") return { points: shape.points, closed: shape.closed };
  if (shape.type === "ellipse") return { points: ellipsePoints(shape.cx, shape.cz, shape.rx, shape.rz), closed: true };
  if (shape.type === "arc") return { points: arcPoints(shape), closed: false };
  const points = roundedRectPoints(shape.width, shape.depth, shape.radius).map(
    ([x, z]) => [x + shape.cx, z + shape.cz] as const
  );
  return { points, closed: true };
}

function batchFor(lines: PlanSymbolLineBatch[], stroke: PlanSymbolStroke, dashed: boolean) {
  const existing = lines.find((batch) => batch.stroke === stroke && batch.dashed === dashed);
  if (existing) return existing;
  const created: PlanSymbolLineBatch = { stroke, dashed, segments: [] };
  lines.push(created);
  return created;
}

export function tessellatePlanSymbol(
  shapes: readonly PlanSymbolShape[],
  { baseY, layerStep }: PlanSymbolTessellationOptions
): TessellatedPlanSymbol {
  const lines: PlanSymbolLineBatch[] = [];
  const fills: PlanSymbolFillPolygon[] = [];
  let layer = 0;
  for (const shape of shapes) {
    const { points, closed } = planSymbolShapeOutline(shape);
    const canFill = closed && points.length >= 3;
    if (shape.fill && canFill) {
      layer += 1;
      fills.push({ y: baseY + layer * layerStep, points });
    }
    const lineY = baseY + layer * layerStep + layerStep / 2;
    const batch = batchFor(lines, shape.stroke, Boolean(shape.dashed));
    const count = closed ? points.length : points.length - 1;
    for (let index = 0; index < count; index += 1) {
      const [x0, z0] = points[index];
      const [x1, z1] = points[(index + 1) % points.length];
      batch.segments.push([x0, lineY, z0], [x1, lineY, z1]);
    }
  }
  return { lines: lines.filter((batch) => batch.segments.length > 0), fills, topY: baseY + (layer + 1) * layerStep };
}
