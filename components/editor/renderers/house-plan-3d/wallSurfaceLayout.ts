import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import {
  joinedLegacyWallSurfacePart,
  legacyWallPartAxisRange,
  type WallPart3D,
  type WallSegment3D,
} from "./geometry";

type WallSurfacePartOnFace = {
  room: HousePlanRoom2D;
  segment: WallSegment3D;
  part: WallPart3D;
  side: 1 | -1;
  wallThickness: number;
  squareStart: boolean;
  squareEnd: boolean;
};

/**
 * How far along its wall face a part of a wall finish starts, measured the way its picture runs: from the face's start
 * corner on side 1, where the picture runs along the wall, and from its end corner on side -1, whose finish is turned a
 * half turn so the picture runs back. Wall panels lay their sheets from there (surfaceTileRows.ts), so the parts beside and
 * above a door or window share their sheet edges and a full sheet meets the corner.
 */
export function getWallSurfacePartStartAlongFace(input: WallSurfacePartOnFace): number {
  return getWallSurfacePartAlongFace(input).start;
}

/**
 * Where a part of a wall finish starts and ends along its drawn face, measured as getWallSurfacePartStartAlongFace
 * measures: the finish as the 3D view draws it, joined at the corners. The bill of materials counts sheets from it.
 */
export function getWallSurfacePartAlongFace({
  room,
  segment,
  part,
  side,
  wallThickness,
  squareStart,
  squareEnd,
}: WallSurfacePartOnFace): { start: number; end: number } {
  const endJoin = { squareStart, squareEnd };
  const partCenter = legacyWallPartAxisRange(segment, part).centerOffset;
  const partSurface = joinedLegacyWallSurfacePart(room, segment, part, side, wallThickness, endJoin);
  // The whole face: a part the length of the segment, centred on it, joined at both corners.
  const wholeWall: WallPart3D = { key: `${segment.key}:face`, x: segment.x, z: segment.z, length: segment.length };
  const face = joinedLegacyWallSurfacePart(room, segment, wholeWall, side, wallThickness, endJoin);
  const partStart = partCenter + partSurface.centerDelta - partSurface.length / 2;
  const faceStart = face.centerDelta - face.length / 2;
  const start = side === 1
    ? partStart - faceStart
    : faceStart + face.length - (partStart + partSurface.length);
  return { start, end: start + partSurface.length };
}
