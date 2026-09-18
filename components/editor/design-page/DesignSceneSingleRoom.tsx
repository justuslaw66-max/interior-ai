"use client";

import { Room } from "@/components/scene/RoomEnvironment";
import { ROOM_DIMENSION_DEFAULTS } from "@/lib/design-page-house-plan";

type SingleRoomProps = Parameters<typeof Room>[0];

export type DesignSceneSingleRoomState = {
  floorWorldY: number;
  width: number;
  depth: number;
  height: number;
  wallThickness: number;
  slabThickness?: number;
  wallOpacity: number;
  floorOpacity: number;
  ceilingOpacity: number;
  ceilingVisible: boolean;
  ceilingColor: string;
};

/** Legacy single-room 3D shell rendered when the design has exactly one plain room. */
export function DesignSceneSingleRoom({
  room,
  renderQuality,
}: {
  room: DesignSceneSingleRoomState;
  renderQuality: SingleRoomProps["renderQuality"];
}) {
  return (
    <Room
      floorWorldY={room.floorWorldY}
      width={room.width}
      depth={room.depth}
      height={room.height}
      wallThickness={room.wallThickness}
      slabThickness={room.slabThickness ?? ROOM_DIMENSION_DEFAULTS.slabThickness}
      wallOpacity={room.wallOpacity}
      floorOpacity={room.floorOpacity}
      ceilingOpacity={room.ceilingOpacity}
      ceilingVisible={room.ceilingVisible}
      ceilingColor={room.ceilingColor}
      renderQuality={renderQuality}
    />
  );
}
