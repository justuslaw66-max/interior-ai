import { EDITOR_BAR_HEIGHT_PX } from "@/lib/design-page-editor-configuration";

export { EDITOR_BAR_HEIGHT_PX };

/**
 * How far the step panel reaches into the editor from the left, from md: the 2D fit keeps the
 * plan clear of it, measured from the editor's left edge (UX 4c). Pro's panel sits right of the
 * tool rail; a collapsed panel leaves its edge strip.
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

/** The canvas's distance from each side of the editor. */
export type CanvasFrameBox = Readonly<{ leftPx: number; topPx: number; rightPx: number; bottomPx: number }>;

export const CANVAS_FRAME_GUTTER_PX = 8;

export const FULL_WINDOW_CANVAS: CanvasFrameBox = Object.freeze({ leftPx: 0, topPx: 0, rightPx: 0, bottomPx: 0 });

// There are only a few frames, so each is one object: effects and memos can depend on it.
const framesBesidePx = new Map<number, CanvasFrameBox>();

function framedCanvas(besidePx: number): CanvasFrameBox {
  const known = framesBesidePx.get(besidePx);
  if (known) return known;
  const frame = Object.freeze({
    leftPx: besidePx + CANVAS_FRAME_GUTTER_PX,
    topPx: EDITOR_BAR_HEIGHT_PX + CANVAS_FRAME_GUTTER_PX,
    rightPx: CANVAS_FRAME_GUTTER_PX,
    bottomPx: CANVAS_FRAME_GUTTER_PX,
  });
  framesBesidePx.set(besidePx, frame);
  return frame;
}

/**
 * The rounded inset frame (the dark-mode plan's edge; J, 13 Oct, and 23 Oct: dock the step panel).
 * From md the canvas is a card with 12px corners set 8px into the frame: under the bar, beside the
 * docked step panel (or Pro's tool rail while the panel is hidden), and in from the right and the
 * bottom. The 2D fit and 3D's lens keep the plan and the room clear of what floats over the card
 * (Plan's tools, the right rail), so they centre in what's visible. Phones (the sheet and the bottom
 * nav) and Client Preview keep the whole window. Shop keeps the panel's place, so leaving it
 * doesn't resize the canvas.
 */
export function resolveCanvasFrameBox({
  wide,
  clientPreview,
  panelVisible,
  shopping,
  collapsed,
  isDesigner,
}: {
  wide: boolean;
  clientPreview: boolean;
  panelVisible: boolean;
  shopping: boolean;
  collapsed: boolean;
  isDesigner: boolean;
}): CanvasFrameBox {
  if (!wide || clientPreview) return FULL_WINDOW_CANVAS;
  const panelOpen = panelVisible && (shopping || !collapsed);
  // The step panel's cards end 294px in (Pro's, beside the tool rail, 366px); Pro's rail, 72px.
  return framedCanvas(panelOpen ? (isDesigner ? 366 : 294) : isDesigner ? 72 : 0);
}

/**
 * What 3D keeps clear in the card, from md: the step panel's margin at the left (the 2D fit's left
 * inset, from the card's edge) and, at the right, the rail (Levels, the inspector), which floats
 * inside the card. The whole-home view fits the home between them.
 */
export function resolveCanvas3DInsetsPx({
  wide,
  planLeftInsetPx,
  frame,
  overlayStackVisible,
  overlayStackWidthPx,
}: {
  wide: boolean;
  planLeftInsetPx: number;
  frame: CanvasFrameBox;
  overlayStackVisible: boolean;
  overlayStackWidthPx: number;
}) {
  return {
    leftPx: wide ? Math.max(0, planLeftInsetPx - frame.leftPx) : 0,
    rightPx: wide && overlayStackVisible ? overlayStackWidthPx + 32 : 0,
  };
}

/**
 * How far 3D's picture centre sits left of the card's middle, so every 3D view centres between
 * the insets: the camera's lens shifts (`CanvasLensShift`), and the camera stays where the view
 * put it, so the view keeps its angle.
 */
export function resolveCanvasLensShiftPx(insets: { leftPx: number; rightPx: number }) {
  return Math.round((insets.rightPx - insets.leftPx) / 2);
}

/** Whether the editor is md or wider, from a canvas this wide in this frame. */
export function isWideEditor(canvasWidthPx: number, frame: CanvasFrameBox = FULL_WINDOW_CANVAS) {
  return canvasWidthPx + frame.leftPx + frame.rightPx >= 768;
}

/**
 * From md the 2D plan is framed under the bar, the canvas toolbar and Plan's tools row (they end
 * 128px under the bar), so the room's size chips at its top edge aren't under them (UX 4d).
 */
export const WIDE_PLAN_TOP_INSET_PX = EDITOR_BAR_HEIGHT_PX + 128;

/**
 * The 2D fit's insets for a canvas this wide: from md the side panels' and the top's, and on
 * phones the header's, the pills' and the step sheet's (UX 4d), named as `resolvePlan2DViewFit`
 * takes them. The insets are measured from the editor's sides and `frame` is where the canvas sits,
 * so the left and top ones count from the card's edges. The right ones stand as they are: the
 * right rail moved in with the card's right edge.
 */
export function resolvePlanFitInsetsPx(
  viewportWidthPx: number,
  inset: { leftPx: number; rightPx: number; topPx: number; bottomPx: number; frame?: CanvasFrameBox }
) {
  const frame = inset.frame ?? FULL_WINDOW_CANVAS;
  const wide = isWideEditor(viewportWidthPx, frame);
  return {
    safeAreaLeftPx: wide ? Math.max(0, inset.leftPx - frame.leftPx) : 0,
    safeAreaRightPx: wide ? Math.max(0, inset.rightPx) : 0,
    safeAreaTopPx: wide ? Math.max(0, WIDE_PLAN_TOP_INSET_PX - frame.topPx) : Math.max(0, inset.topPx),
    safeAreaBottomPx: wide ? 0 : Math.max(0, inset.bottomPx),
  };
}
