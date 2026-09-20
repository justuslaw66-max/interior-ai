import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import {
  buildOpeningLintelParts,
  buildOpeningSillParts,
  getSelectableWallFacePanelId,
  getSelectableWallSurfacePanelId,
  getSharedWallRoomIds,
  getWallInteriorSurfaceSide,
  getWallSurfaceFaceId,
  getWallSurfacePanelId,
  legacyWallPartAxisRange,
  type WallOpening3D,
  type WallSegment3D,
  type WallSurfacePanelDescriptor,
} from "./geometry";

/** Give each solid above/below an opening the same surface owner as side panels. */
export function buildOpeningWallSurfacePanels(
  room: HousePlanRoom2D,
  topologyRooms: readonly HousePlanRoom2D[],
  segment: WallSegment3D,
  openings: WallOpening3D[],
  wallHeight: number
): WallSurfacePanelDescriptor[] {
  const interiorSide = getWallInteriorSurfaceSide(segment);
  const parts = [
    ...buildOpeningLintelParts(segment, openings, wallHeight, wallHeight),
    ...buildOpeningSillParts(segment, openings, wallHeight, wallHeight),
  ];
  return parts.flatMap((part) => {
    const range = legacyWallPartAxisRange(segment, part);
    const startAnchor = `${part.key}:start`;
    const endAnchor = `${part.key}:end`;
    return (["interior", "exterior"] as const).flatMap((role) => {
      if (role === "exterior" && getSharedWallRoomIds(room, topologyRooms, segment, part).length) return [];
      const side = role === "interior" ? interiorSide : interiorSide === 1 ? -1 : 1;
      const panelId = getWallSurfacePanelId({ room, segment, startAnchor, endAnchor, role });
      const legacyFaceId = getSelectableWallFacePanelId(part);
      return [{
        key: panelId, panelId, roomId: room.id,
        faceId: getWallSurfaceFaceId(room, segment),
        floorLevel: room.floorLevel ?? 1, segmentKey: segment.key, role, side,
        startOffset: range.startOffset, endOffset: range.endOffset,
        startAnchor, endAnchor, part, supportingStructuralIntervals: [part],
        legacyPanelIds: [
          getSelectableWallSurfacePanelId(legacyFaceId, side), legacyFaceId,
          getSelectableWallSurfacePanelId(part.key, side), part.key,
        ],
      }];
    });
  });
}
