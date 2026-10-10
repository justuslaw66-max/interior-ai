import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";

/**
 * A selected product shows the one item panel in Plan, Furnish and Suggest a layout (UX audit,
 * phase 4f); Plan's inspector no longer has a product card, and Plan's right rail steps aside.
 * Shop covers the canvas.
 */
export function showsItemPanel(editorMode: DesignPageEditorMode): boolean {
  return editorMode === "design" || editorMode === "adjust" || editorMode === "ai";
}
