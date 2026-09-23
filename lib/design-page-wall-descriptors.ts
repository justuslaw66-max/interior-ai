import type { WallDescriptor } from "@/lib/design-page-types";

export const DEFAULT_WALL_LONG_SIDE_CLEARANCE_METERS = 2.2;

export type BuildRoomWallDescriptorsInput = {
  roomWidth: number;
  roomDepth: number;
  wallThickness: number;
  /** Full long-side span reserved inside each wall's snap range. */
  longSideClearanceMeters?: number;
};

export type RoomWallDescriptors = [
  WallDescriptor,
  WallDescriptor,
  WallDescriptor,
  WallDescriptor,
];

export function buildRoomWallDescriptors({
  roomWidth,
  roomDepth,
  wallThickness,
  longSideClearanceMeters = DEFAULT_WALL_LONG_SIDE_CLEARANCE_METERS,
}: BuildRoomWallDescriptorsInput): RoomWallDescriptors {
  const halfWidth = roomWidth / 2;
  const halfDepth = roomDepth / 2;
  const halfWallThickness = wallThickness / 2;
  const halfLongSideClearance = longSideClearanceMeters / 2;

  return [
    {
      axis: "x",
      coord: -halfWidth + halfWallThickness,
      min: -halfDepth + halfWallThickness + halfLongSideClearance,
      max: halfDepth - halfWallThickness - halfLongSideClearance,
    },
    {
      axis: "x",
      coord: halfWidth - halfWallThickness,
      min: -halfDepth + halfWallThickness + halfLongSideClearance,
      max: halfDepth - halfWallThickness - halfLongSideClearance,
    },
    {
      axis: "z",
      coord: -halfDepth + halfWallThickness,
      min: -halfWidth + halfWallThickness + halfLongSideClearance,
      max: halfWidth - halfWallThickness - halfLongSideClearance,
    },
    {
      axis: "z",
      coord: halfDepth - halfWallThickness,
      min: -halfWidth + halfWallThickness + halfLongSideClearance,
      max: halfWidth - halfWallThickness - halfLongSideClearance,
    },
  ];
}
