import type { RoomOpening2D } from "@/lib/editorScene";
import type { RoomWallSegment2D } from "@/lib/room-renderer-2d-walls";
import type { PlanPoint2D } from "@/lib/wall-segment-geometry";

// The opening-host types live apart from the resolver so that the canonical-host resolver can
// name them without importing the module that imports it (no design-page dependency cycle).

export type OpeningHostInput = Pick<
  RoomOpening2D,
  "id" | "roomId" | "wall" | "offsetMm" | "widthMm" |
  "canonicalWallId" | "canonicalHost" | "requestedWorldCenterMm"
>;

export type DesignPagePhysicalWallHost = {
  physicalWallId: string;
  segment: RoomWallSegment2D;
  roomId?: string;
  roomWall: RoomOpening2D["wall"];
  roomSegmentKey: string;
  roomSegment: RoomWallSegment2D;
  offsetOriginMeters?: number;
  segmentOffsetMeters: number;
  alongSegmentMeters: number;
  worldCenter: PlanPoint2D;
  tangent: PlanPoint2D;
  inwardNormal: PlanPoint2D;
  spanMeters: number;
};

export type OpeningHostFailure = {
  status: "unresolved" | "ambiguous" | "unsupported" | "invalid";
  code:
    | "NO_PHYSICAL_WALL"
    | "AMBIGUOUS_PHYSICAL_WALL"
    | "UNSUPPORTED_PHYSICAL_WALL"
    | "INVALID_OPENING_GEOMETRY";
  diagnostic: string;
  consumerMessage: string;
  requestedWorldCenter?: PlanPoint2D;
};

export type DesignPageOpeningHostResolution =
  | { status: "resolved"; host: DesignPagePhysicalWallHost }
  | OpeningHostFailure;
