import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import {
  joinedLegacyWallSurfacePart,
  legacyWallPartAxisRange,
  type WallPart3D,
  type WallSegment3D,
} from "./geometry";

/**
 * How far along its wall face a part of a wall finish starts, measured the way its picture runs: from the face's start
 * corner on side 1, where the picture runs along the wall, and from its end corner on side -1, whose finish is turned a
 * half turn so the picture runs back. Wall panels lay their sheets from there (surfaceTileRows.ts), so the parts beside and
 * above a door or window share their sheet edges and a full sheet meets the corner.
 */
export function getWallSurfacePartStartAlongFace({
  room,
  segment,
  part,
  side,
  wallThickness,
  squareStart,
  squareEnd,
}: {
  room: HousePlanRoom2D;
  segment: WallSegment3D;
  part: WallPart3D;
  side: 1 | -1;
  wallThickness: number;
  squareStart: boolean;
  squareEnd: boolean;
}): number {
  const endJoin = { squareStart, squareEnd };
  const partCenter = legacyWallPartAxisRange(segment, part).centerOffset;
  const partSurface = joinedLegacyWallSurfacePart(room, segment, part, side, wallThickness, endJoin);
  // The whole face: a part the length of the segment, centred on it, joined at both corners.
  const wholeWall: WallPart3D = { key: `${segment.key}:face`, x: segment.x, z: segment.z, length: segment.length };
  const face = joinedLegacyWallSurfacePart(room, segment, wholeWall, side, wallThickness, endJoin);
  const partStart = partCenter + partSurface.centerDelta - partSurface.length / 2;
  const faceStart = face.centerDelta - face.length / 2;
  return side === 1
    ? partStart - faceStart
    : faceStart + face.length - (partStart + partSurface.length);
}
