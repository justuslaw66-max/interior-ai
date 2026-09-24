import type { CompiledFloorPlanOpeningV2 } from "@/lib/floor-plan-compiler-v2";
import type { CanonicalOpeningSymbolLineV2 } from "@/lib/floor-plan-opening-primitives";
import type { PlanDrawingPrimitive } from "@/lib/floor-plan-vector-drawing";

/** A window frame's visible ink stays inside its host faces, independent of print scale. */
export function windowFrameInkNormal(opening: CompiledFloorPlanOpeningV2, symbol: CanonicalOpeningSymbolLineV2) {
  if (opening.kind !== "window" || !["fixed_panel", "sliding_panel"].includes(symbol.role)) return undefined;
  const dx = opening.end.xMm - opening.start.xMm, dz = opening.end.zMm - opening.start.zMm;
  const length = Math.hypot(dx, dz);
  if (!length || !symbol.points[0]) return undefined;
  const x = -dz / length, z = dx / length;
  const side = Math.sign((symbol.points[0].xMm - opening.start.xMm) * x + (symbol.points[0].zMm - opening.start.zMm) * z);
  return { x: -side * x, z: -side * z };
}

export function vectorInkPath(primitive: Extract<PlanDrawingPrimitive, { kind: "path" }>, scale: number) {
  const normal = primitive.strokeInsetNormal;
  if (!normal) return primitive.path;
  const insetMm = 0.09 * scale;
  return primitive.points.map((point, i) => {
    const x = point.xMm + normal.x * insetMm;
    const z = point.zMm + normal.z * insetMm;
    return `${i ? "L" : "M"} ${Number(x.toFixed(6))} ${Number(z.toFixed(6))}`;
  }).join(" ");
}
