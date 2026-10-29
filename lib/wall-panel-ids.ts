/**
 * Wall panel ids, as the 3D view writes them: `wall-panel:v2:<floor>:<room>:<face>:<start>:<end>:<interior|exterior>`
 * (`getWallSurfacePanelId`, components/editor/renderers/house-plan-3d/geometry.ts). A wall with no opening is one panel,
 * from `segment-start` to `segment-end`; a door splits it into pieces beside and above it, each with anchors of its own.
 */
const WHOLE_WALL_ANCHORS = ["segment-start", "segment-end"] as const;

/**
 * The whole wall's id for a piece of it: the first v2 id among `panelIds`, with the wall's own anchors; the same id for a
 * whole wall. A finish saved on a wall before a door split it stays on the pieces until a piece is given one of its own
 * (J, 29 Oct 2026: "Keep it on the pieces"). Null when none of the ids is a v2 id.
 */
export function getWholeWallPanelId(panelIds: readonly (string | null | undefined)[]): string | null {
  for (const panelId of panelIds) {
    const parts = panelId?.split(":") ?? [];
    if (parts.length === 8 && parts[0] === "wall-panel" && parts[1] === "v2") {
      return [...parts.slice(0, 5), ...WHOLE_WALL_ANCHORS, parts[7]].join(":");
    }
  }
  return null;
}
