import type { CSSProperties } from "react";

/**
 * For drei's <Html> on the plan. Its wrapper keeps the box of what it holds at the anchor, even when
 * the content is moved off the anchor with a CSS transform, and that box takes the pointer. Passed as
 * the Html's `style`, this lets the pointer through to the canvas, so a name label or the action chips
 * never hide a resize handle; controls inside set `pointerEvents: "auto"` themselves (J's browser
 * check, 14 Nov 2026: the lifted chips left an unseen box over a block's top edge).
 */
export const PLAN_HTML_PASS_THROUGH: CSSProperties = { pointerEvents: "none" };
