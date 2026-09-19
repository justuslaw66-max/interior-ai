import { createElement, type ComponentProps } from "react";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import { getMountedSharedWallRenderOwnerRoomId } from "./LegacyWallOpeningMeshes";
import { CutawayWallMesh } from "./wallAndOpeningMeshes";

type MountedCutawayWallMeshProps = Omit<
  ComponentProps<typeof CutawayWallMesh>, "renderOwnerRoomId"
> & { visibleRooms: readonly Pick<HousePlanRoom2D, "id">[] };

export function MountedCutawayWallMesh({
  visibleRooms,
  ...props
}: MountedCutawayWallMeshProps) {
  // Topology supplies both shared faces; only a mounted room can render them.
  return createElement(CutawayWallMesh, {
    ...props,
    renderOwnerRoomId: getMountedSharedWallRenderOwnerRoomId(
      props.room, props.rooms, props.segment, props.part, visibleRooms
    ),
  });
}
