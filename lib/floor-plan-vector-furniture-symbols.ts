import type { FloorPlanPointMmV2 as Point } from "@/lib/floor-plan-document-v2";
import type { PlanDrawingPrimitive } from "@/lib/floor-plan-vector-drawing";
import { planSymbolShapesForItem } from "@/lib/plan-symbols/plan-symbol-item";
import type { PlanSymbolKind } from "@/lib/plan-symbols/plan-symbol-types";
import { planSymbolShapeOutline } from "@/lib/plan-symbols/plan-symbol-tessellate";
import type { PlanSymbolStroke } from "@/lib/plan-symbols/plan-symbol-types";

/**
 * A placed product in the vector plan: its black-and-white plan symbol (lib/plan-symbols) at
 * its footprint, each shape its own editable path, under a numbered tag. Line weights and
 * dashes are in paper millimetres, so they print the same at 1:50 and 1:100.
 */

const PAPER_STROKE_MM: Record<PlanSymbolStroke, number> = { outline: 0.25, detail: 0.18, fine: 0.13 };
const PAPER_DASH_MM: [number, number] = [1.2, 0.8];

export type FurnitureSymbolPlacement = {
  id: string;
  category: string;
  name: string;
  /** A layout block's own symbol (lib/layout-blocks.ts); products are matched from category and name. */
  kind?: PlanSymbolKind | null;
  widthMm: number;
  depthMm: number;
  /** The item's centre in world millimetres, and its plan rotation (Three.js Y rotation). */
  centre: Point;
  rotationY: number;
};

const round = (value: number) => Number(value.toFixed(6));

function toWorld(placement: FurnitureSymbolPlacement) {
  const cos = Math.cos(placement.rotationY);
  const sin = Math.sin(placement.rotationY);
  return ([dxM, dzM]: readonly [number, number]): Point => {
    const dx = dxM * 1000;
    const dz = dzM * 1000;
    return { xMm: placement.centre.xMm + cos * dx + sin * dz, zMm: placement.centre.zMm - sin * dx + cos * dz };
  };
}

function pathOf(points: readonly Point[], closed: boolean) {
  const body = points.map((point, index) => `${index ? "L" : "M"} ${round(point.xMm)} ${round(point.zMm)}`).join(" ");
  return closed ? `${body} Z` : body;
}

/** The symbol's shapes as paths, in drawing order, so later paper covers earlier lines. */
export function furnitureSymbolPrimitives(placement: FurnitureSymbolPlacement): PlanDrawingPrimitive[] {
  const shapes = planSymbolShapesForItem(placement.category, placement.name, placement.widthMm / 1000, placement.depthMm / 1000, placement.kind ?? null);
  const world = toWorld(placement);
  return shapes.map((shape, index) => {
    const outline = planSymbolShapeOutline(shape);
    const points = outline.points.map(world);
    return {
      id: `furniture:${placement.id}:symbol:${index}`,
      kind: "path" as const,
      path: pathOf(points, outline.closed),
      fill: false,
      paperFill: Boolean(shape.fill && outline.closed),
      paperStrokeMm: PAPER_STROKE_MM[shape.stroke],
      ...(shape.dashed ? { paperDashMm: PAPER_DASH_MM } : {}),
      points,
      role: "furniture-symbol",
    };
  });
}

/** The tag that keys an item to the furniture schedule: its number, centred on the item. */
export function furnitureTagPrimitive(placement: FurnitureSymbolPlacement, tag: number): PlanDrawingPrimitive {
  return { id: `furniture:${placement.id}:tag`, kind: "text", text: String(tag), point: placement.centre, role: "furniture-tag" };
}
