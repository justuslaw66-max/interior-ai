export { EDITOR_BAR_HEIGHT_PX } from "@/lib/design-page-editor-configuration";

/**
 * How far the step panel reaches into the canvas from the left, from md: the 2D fit keeps the
 * plan clear of it, and the canvas toolbar centres itself on the rest (UX 4c). Pro's panel sits
 * right of the tool rail; a collapsed panel leaves its edge strip.
 */
export function resolveCanvasLeftInsetPx({
  panelVisible,
  shopping,
  collapsed,
  isDesigner,
}: {
  panelVisible: boolean;
  shopping: boolean;
  collapsed: boolean;
  isDesigner: boolean;
}): number {
  if (!panelVisible) return 0;
  if (!shopping && collapsed) return isDesigner ? 128 : 88;
  return isDesigner ? 398 : 318;
}

/**
 * The 2D fit's insets for a canvas this wide: the side panels' from md, and on phones the
 * header's, the pills' and the step sheet's (UX 4d), named as `resolvePlan2DViewFit` takes them.
 */
export function resolvePlanFitInsetsPx(
  viewportWidthPx: number,
  inset: { leftPx: number; rightPx: number; topPx: number; bottomPx: number }
) {
  const wide = viewportWidthPx >= 768;
  return {
    safeAreaLeftPx: wide ? Math.max(0, inset.leftPx) : 0,
    safeAreaRightPx: wide ? Math.max(0, inset.rightPx) : 0,
    safeAreaTopPx: wide ? 0 : Math.max(0, inset.topPx),
    safeAreaBottomPx: wide ? 0 : Math.max(0, inset.bottomPx),
  };
}
