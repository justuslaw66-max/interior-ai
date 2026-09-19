import type { DesignPageOpeningHostResolution } from "@/lib/design-page-opening-host";
import type { FixedElement2D } from "@/lib/editorScene";
import type { FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";

export type RoomRendererOpening = {
  id: string;
  roomId?: string;
  wall: "north" | "south" | "east" | "west";
  kind: "door" | "window";
  offset: number;
  width: number;
  height?: number;
  bottom?: number;
  doorStyle?: "swing" | "sliding" | "folding" | "open";
  physicalWallId?: string;
  hostPhysicalSegmentKey?: string;
  hostSegmentKey?: string;
  hostSegmentOffset?: number;
  hostWorldCenter?: { x: number; z: number };
  hostTangent?: { x: number; z: number };
  hostInwardNormal?: { x: number; z: number };
  hostResolution?: DesignPageOpeningHostResolution;
  widthEvidence?: FloorPlanPropertyEvidenceV2;
};

export type RoomRendererFixedElement = {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  label?: string;
  kind?: FixedElement2D["kind"];
  locked?: boolean;
};

export type RoomRendererAnnotation = {
  id: string;
  x: number;
  z: number;
  text: string;
  kind: "note" | "callout" | "room_tag";
  anchorX?: number;
  anchorZ?: number;
};
