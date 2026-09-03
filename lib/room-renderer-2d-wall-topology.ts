import { EDITOR_GEOMETRY_TOLERANCES } from "@/lib/editor-geometry-tolerances";
import type { RoomWallSegment2D } from "@/lib/room-renderer-2d-walls";
import {
  getCanonicalPlanLine,
  pointOnCanonicalPlanLine,
} from "@/lib/wall-segment-geometry";

const EPSILON = EDITOR_GEOMETRY_TOLERANCES.wallSegmentMeters;
const rounded = (value: number) => Number(value.toFixed(4));

function groupKey(segment: RoomWallSegment2D) {
  const line = getCanonicalPlanLine(segment);
  return line
    ? [rounded(line.tangent.x), rounded(line.tangent.z), rounded(line.lineOffset)].join(":")
    : null;
}

export function mergeSharedWallSegments2D(
  segments: RoomWallSegment2D[]
): RoomWallSegment2D[] {
  const groups = new Map<string, RoomWallSegment2D[]>();
  for (const segment of segments) {
    const key = groupKey(segment);
    if (key) groups.set(key, [...(groups.get(key) ?? []), segment]);
  }
  return [...groups.values()].flatMap((group) => {
    const boundaries = [...new Set(group.flatMap((segment) => {
      const line = getCanonicalPlanLine(segment);
      return line ? [rounded(line.low), rounded(line.high)] : [];
    }))].sort((a, b) => a - b);
    return boundaries.slice(0, -1).flatMap((start, index): RoomWallSegment2D[] => {
      const end = boundaries[index + 1];
      if (end - start <= EPSILON) return [];
      const covering = group.filter((segment) => {
        const line = getCanonicalPlanLine(segment);
        return line && line.low <= start + EPSILON && line.high >= end - EPSILON;
      });
      if (!covering.length) return [];
      const base = covering.slice().sort((a, b) => a.key.localeCompare(b.key))[0];
      const line = getCanonicalPlanLine(base);
      if (!line) return [];
      const first = pointOnCanonicalPlanLine(line.tangent, line.normal, line.lineOffset, start);
      const last = pointOnCanonicalPlanLine(line.tangent, line.normal, line.lineOffset, end);
      const baseKey = covering.map(({ key }) => key).sort().join("-");
      return [{
        ...base,
        key: group.length === 1 || boundaries.length === 2
          ? baseKey
          : `${baseKey}:${rounded(start)}:${rounded(end)}`,
        roomIds: [...new Set(covering.flatMap(({ roomIds }) => roomIds))].sort(),
        roomWalls: Object.assign({}, ...covering.map(({ roomWalls }) => roomWalls)),
        roomAxisCenters: Object.assign({}, ...covering.map(({ roomAxisCenters }) => roomAxisCenters)),
        orientation: Math.abs(line.tangent.x) >= Math.abs(line.tangent.z) ? "horizontal" : "vertical",
        x1: rounded(first.x), z1: rounded(first.z), x2: rounded(last.x), z2: rounded(last.z),
        thickness: Math.max(...covering.map(({ thickness }) => thickness)),
      }];
    });
  });
}
