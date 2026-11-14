import type { PlanHandleSizes } from "@/lib/plan-handle-sizes";

/**
 * Where a selected item's Rotate / Copy / Delete chips sit on the plan. They go above the item, clear
 * of the rotate knob; when that spot is off the plan or under the plan's own controls (the 2D/3D
 * switch on a phone), they go below it instead, as Figma and Canva flip a selection toolbar
 * (J's browser check, 14 Nov 2026).
 */
export type ChipsSide = "above" | "below";

/** From the item's edge to the chips' near side, in CSS px: above, past the knob; below, past the edge's grab area. */
export function chipsGapPx(side: ChipsSide, sizes: PlanHandleSizes): number {
  return side === "above" ? sizes.knobOffset + sizes.knobHit / 2 + 6 : sizes.cornerHit / 2 + 10;
}

/** The chips' CSS transform from the anchor, which drei's Html centres on the item's edge. */
export function chipsTransform(side: ChipsSide, gap: number): string {
  return side === "above" ? `translateY(calc(-50% - ${gap}px))` : `translateY(calc(50% + ${gap}px))`;
}

export type ChipsFitInput = {
  /** The item's top edge on screen, in client px. */
  anchorX: number;
  anchorY: number;
  gap: number;
  width: number;
  height: number;
  /** The top of the plan on screen. */
  regionTop: number;
  /** Whether a screen point shows the plan itself (the canvas or its own labels), not a control over it. */
  isClear: (x: number, y: number) => boolean;
};

/**
 * Whether the chips fit above the item: on the plan, and with nothing of the page's own over them.
 * It samples the left, middle and right of the chips' top and middle rows, and allocates nothing,
 * since the plan asks it from a frame callback.
 */
export function chipsFitAbove({ anchorX, anchorY, gap, width, height, regionTop, isClear }: ChipsFitInput): boolean {
  const top = anchorY - gap - height;
  if (top < regionTop) return false;
  const inset = Math.min(6, width / 2);
  for (let column = -1; column <= 1; column += 1) {
    const x = anchorX + column * (width / 2 - inset);
    if (!isClear(x, top + Math.min(2, height / 2)) || !isClear(x, top + height / 2)) return false;
  }
  return true;
}
