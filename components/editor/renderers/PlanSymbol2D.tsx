"use client";

import { Line } from "@react-three/drei/core/Line";
import { useEffect, useMemo } from "react";
import { BufferGeometry, DoubleSide, Float32BufferAttribute, ShapeUtils, Vector2 } from "three";
import { useCanvasPalette } from "@/lib/canvas-colours";
import {
  PLAN_SYMBOL_BASE_Y,
  PLAN_SYMBOL_LAYER_STEP,
  planSymbolShapesForItem,
} from "@/lib/plan-symbols/plan-symbol-item";
import {
  tessellatePlanSymbol,
  type PlanSymbolFillPolygon,
} from "@/lib/plan-symbols/plan-symbol-tessellate";
import type { PlanSymbolKind, PlanSymbolStroke } from "@/lib/plan-symbols/plan-symbol-types";

/** Screen widths of the three line weights, in pixels (they hold steady as the plan zooms). */
const LINE_PX: Record<PlanSymbolStroke, number> = { outline: 1.4, detail: 1, fine: 0.75 };

type PlanSymbol2DProps = {
  category: string;
  label: string;
  /** A layout block's own symbol, ahead of matching the category and name. */
  kind?: PlanSymbolKind | null;
  width: number;
  depth: number;
};

/** All fill polygons as one triangle mesh: one draw call for the symbol's paper. */
function fillGeometry(fills: readonly PlanSymbolFillPolygon[]): BufferGeometry {
  const positions: number[] = [];
  for (const { y, points } of fills) {
    const contour = points.map(([x, z]) => new Vector2(x, z));
    for (const triangle of ShapeUtils.triangulateShape(contour, [])) {
      for (const index of triangle) positions.push(points[index][0], y, points[index][1]);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

/**
 * A placed product drawn as its black-and-white plan symbol (lib/plan-symbols), at its
 * real footprint: one paper mesh and one line batch per weight and dash.
 */
export default function PlanSymbol2D({ category, label, kind = null, width, depth }: PlanSymbol2DProps) {
  const { colour } = useCanvasPalette();
  const drawing = useMemo(
    () =>
      tessellatePlanSymbol(planSymbolShapesForItem(category, label, width, depth, kind), {
        baseY: PLAN_SYMBOL_BASE_Y,
        layerStep: PLAN_SYMBOL_LAYER_STEP,
      }),
    [category, depth, kind, label, width]
  );
  const paper = useMemo(() => fillGeometry(drawing.fills), [drawing]);
  useEffect(() => () => paper.dispose(), [paper]);
  const ink = colour("#111111");

  return (
    <group>
      <mesh geometry={paper}>
        <meshBasicMaterial color={colour("#ffffff")} side={DoubleSide} toneMapped={false} />
      </mesh>
      {drawing.lines.map((batch) => (
        <Line
          key={`${batch.stroke}-${batch.dashed ? "dashed" : "solid"}`}
          points={batch.segments}
          segments
          color={ink}
          lineWidth={LINE_PX[batch.stroke]}
          dashed={batch.dashed}
          dashSize={0.05}
          gapSize={0.035}
        />
      ))}
    </group>
  );
}
