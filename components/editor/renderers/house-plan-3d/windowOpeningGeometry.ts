import {
  getOpeningDisplayBottom, getOpeningDisplayHeight, wallPartCenter,
  type WallOpening3D, type WallSegment3D,
} from "./geometry";

/** Match the physical opening, including its sill, clipping at wall endpoints and top. */
export function getWindowOpeningHitVolume(
  segment: WallSegment3D, opening: WallOpening3D, wallHeight: number
) {
  const start = Math.max(-segment.length / 2, opening.offset - opening.width / 2);
  const end = Math.min(segment.length / 2, opening.offset + opening.width / 2);
  const bottom = getOpeningDisplayBottom(opening, wallHeight, wallHeight);
  const height = Math.min(wallHeight - bottom, getOpeningDisplayHeight(opening, wallHeight, wallHeight));
  return { ...wallPartCenter(segment, (start + end) / 2),
    width: Math.max(0, end - start), height, bottom, centerY: bottom + height / 2 };
}
