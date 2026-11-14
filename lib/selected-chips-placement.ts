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
  /**
   * Whether a screen point shows the plan itself, not one of the page's controls over it. The plan
   * includes its own labels and the chips themselves, so the chips never send themselves below.
   */
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

/** What the side was last decided from; it starts unset, so the first check always runs. */
export type ChipsCheckMark = { anchorX: number; anchorY: number; width: number; regionTop: number; gap: number };

export function unsetChipsCheckMark(): ChipsCheckMark {
  return { anchorX: Number.NEGATIVE_INFINITY, anchorY: Number.NEGATIVE_INFINITY, width: 0, regionTop: 0, gap: 0 };
}

/**
 * Whether the item moved on screen, or the chips or plan changed, by half a pixel or more since the
 * side was last decided; if so it records the new values. The plan only redraws while something
 * changes, so checking on every move (rather than every few frames) never misses the frame where a
 * pan or the phone sheet's framing comes to rest (J's browser check, 14 Nov 2026), and a still plan
 * does no work.
 */
export function chipsCheckDue(mark: ChipsCheckMark, input: ChipsFitInput): boolean {
  const due =
    Math.abs(mark.anchorX - input.anchorX) >= 0.5 ||
    Math.abs(mark.anchorY - input.anchorY) >= 0.5 ||
    mark.width !== input.width ||
    mark.regionTop !== input.regionTop ||
    mark.gap !== input.gap;
  if (due) {
    mark.anchorX = input.anchorX;
    mark.anchorY = input.anchorY;
    mark.width = input.width;
    mark.regionTop = input.regionTop;
    mark.gap = input.gap;
  }
  return due;
}
