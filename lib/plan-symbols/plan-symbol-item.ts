import { buildPlanSymbol } from "./plan-symbol-library";
import { resolvePlanSymbolKind } from "./plan-symbol-match";
import { rect } from "./plan-symbol-shapes";
import type { PlanSymbolKind, PlanSymbolShape } from "./plan-symbol-types";

/** Where a placed item's symbol starts above the floor in the 2D plan (metres). */
export const PLAN_SYMBOL_BASE_Y = 0.002;
/** Height between a symbol's layers: four depth steps of the plan camera (near 0.1, far 2000). */
export const PLAN_SYMBOL_LAYER_STEP = 0.0005;
/** Selection, hover and clash marks: above every symbol's layers. */
export const PLAN_SYMBOL_OVERLAY_Y = 0.03;

/**
 * The shapes a placed product draws in the 2D plan: its symbol, from its category and name,
 * or a plain outlined box when no symbol fits it yet.
 */
export function planSymbolShapesForItem(
  category: string,
  name: string,
  width: number,
  depth: number,
  explicitKind: PlanSymbolKind | null = null
): PlanSymbolShape[] {
  const kind = explicitKind ?? resolvePlanSymbolKind(category, name);
  if (kind) return buildPlanSymbol(kind, width, depth).shapes;
  const safeWidth = Number.isFinite(width) ? Math.max(0.05, width) : 0.5;
  const safeDepth = Number.isFinite(depth) ? Math.max(0.05, depth) : 0.5;
  return [rect(0, 0, safeWidth, safeDepth, "outline", 0.01, { fill: true })];
}
