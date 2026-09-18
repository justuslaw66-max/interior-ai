import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import {
  getWallSurfacePanelId, joinedLegacyWallSurfacePart, legacyWallPartAxisRange,
  type LegacyWallEndJoinOptions, type WallOpening3D, type WallSegment3D,
  type WallSurfacePanelDescriptor,
} from "./geometry";

type Point = [number, number];
type Rect = { left: number; right: number; bottom: number; top: number };
export type SelectableWallSurfacePanel = WallSurfacePanelDescriptor & {
  selectionPanelId?: string;
  selectionPanelAliases?: string[];
  boundaryEdges?: [Point, Point][];
};
const EPSILON = 0.00001;

export function getContinuousWallPanelId(
  room: HousePlanRoom2D, segment: WallSegment3D,
  openings: readonly WallOpening3D[], role: WallSurfacePanelDescriptor["role"]
): string | undefined {
  if (!openings.some((opening) => opening.kind === "window")) return undefined;
  return getWallSurfacePanelId({ room, segment, role,
    startAnchor: "segment-start", endAnchor: "segment-end" });
}

/** Remove shared edges between render rectangles, leaving the wall perimeter and holes. */
function exposedEdges(rect: Rect, neighbors: Rect[]): [Point, Point][] {
  const edges: [Point, Point][] = [];
  for (const side of ["left", "right", "bottom", "top"] as const) {
    const vertical = side === "left" || side === "right";
    const start = vertical ? rect.bottom : rect.left;
    const end = vertical ? rect.top : rect.right;
    const coordinate = rect[side];
    const outward = side === "left" || side === "bottom" ? -EPSILON : EPSILON;
    const covered = neighbors.filter((other) => vertical
      ? other.left < coordinate + outward && other.right > coordinate + outward
      : other.bottom < coordinate + outward && other.top > coordinate + outward
    ).map((other) => vertical ? [other.bottom, other.top] : [other.left, other.right]);
    let spans = [[start, end]];
    for (const [low, high] of covered) {
      spans = spans.flatMap(([from, to]) => {
        if (high <= from + EPSILON || low >= to - EPSILON) return [[from, to]];
        return [[from, Math.min(to, low)], [Math.max(from, high), to]]
          .filter(([a, b]) => b - a > EPSILON);
      });
    }
    edges.push(...spans.map(([from, to]): [Point, Point] => vertical
      ? [[coordinate, from], [coordinate, to]]
      : [[from, coordinate], [to, coordinate]]));
  }
  return edges;
}

export function withContinuousWallSelection(
  room: HousePlanRoom2D, segment: WallSegment3D,
  openings: readonly WallOpening3D[], panels: WallSurfacePanelDescriptor[],
  wallHeight: number, wallThickness: number, endJoins: LegacyWallEndJoinOptions = {}
): SelectableWallSurfacePanel[] {
  return (["interior", "exterior"] as const).flatMap((role) => {
    const siblings = panels.filter((panel) => panel.role === role);
    const selectionPanelId = getContinuousWallPanelId(room, segment, openings, role);
    if (!selectionPanelId) return siblings;
    const selectionPanelAliases = [...new Set(siblings.flatMap((panel) =>
      [panel.panelId, ...panel.legacyPanelIds]))].filter((id) => id !== selectionPanelId);
    const rectangles = siblings.map((panel): Rect => {
      const joined = joinedLegacyWallSurfacePart(room, segment, panel.part, panel.side, wallThickness, endJoins);
      const center = legacyWallPartAxisRange(segment, panel.part).centerOffset + joined.centerDelta;
      const height = panel.part.height ?? wallHeight;
      const centerY = panel.part.centerY ?? wallHeight / 2;
      return { left: center - joined.length / 2, right: center + joined.length / 2,
        bottom: centerY - height / 2, top: centerY + height / 2 };
    });
    return siblings.map((panel, index) => {
      const centerX = legacyWallPartAxisRange(segment, panel.part).centerOffset;
      const centerY = panel.part.centerY ?? wallHeight / 2;
      const local = ([x, y]: Point): Point => [x - centerX, y - centerY];
      return { ...panel, selectionPanelId, selectionPanelAliases,
        boundaryEdges: exposedEdges(rectangles[index], rectangles.filter((_, i) => i !== index))
          .map(([a, b]): [Point, Point] => [local(a), local(b)]) };
    });
  });
}
