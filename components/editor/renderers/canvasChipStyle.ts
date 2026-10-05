import type { CSSProperties } from "react";

/**
 * One chip style on the 2D canvas (UX audit ED7, phase 4f): 12px bold text, at least 24px tall.
 * Chips don't scale down with the zoom; the labels that would crowd hide when zoomed out instead.
 */
export const CANVAS_CHIP_TEXT: CSSProperties = { fontSize: 12, fontWeight: 700, lineHeight: "16px" };

export const CANVAS_CHIP: CSSProperties = {
  ...CANVAS_CHIP_TEXT,
  minHeight: 24,
  padding: "4px 8px",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  whiteSpace: "nowrap",
  borderRadius: 6,
};

/** A chip you press that isn't on a wall (the room's toolbar, "Add door here"): 32px tall. */
export const CANVAS_CHIP_BUTTON: CSSProperties = { ...CANVAS_CHIP, minHeight: 32, justifyContent: "center" };

/** Every pressable chip is 44px on touch screens, where a finger presses it. */
export const CANVAS_CHIP_TOUCH_CLASS = "touch:min-h-11 touch:min-w-11";
