import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import { resolveDesignPageOpeningHosts } from "@/lib/design-page-opening-host";
import type {
  RoomRendererAnnotation,
  RoomRendererFixedElement,
  RoomRendererOpening,
} from "@/lib/design-page-plan-overlays";
import {
  metersToMm,
  mmToMeters,
  type EditorAnnotation2D,
  type FixedElement2D,
  type RoomOpening2D,
} from "@/lib/editorScene";

function baseOpening(opening: RoomOpening2D) {
  return {
    id: opening.id,
    kind: opening.kind,
    offset: mmToMeters(opening.offsetMm),
    width: mmToMeters(opening.widthMm),
    height: opening.heightMm === undefined ? undefined : mmToMeters(opening.heightMm),
    bottom: opening.bottomMm === undefined ? undefined : mmToMeters(opening.bottomMm),
    doorStyle: opening.doorStyle,
    ...(opening.evidence?.width ? { widthEvidence: opening.evidence.width } : {}),
  };
}

export function mapPlanOpeningsToRoomRenderer(
  openings: readonly RoomOpening2D[],
  rooms: readonly HousePlanRoom2D[]
): RoomRendererOpening[] {
  return resolveDesignPageOpeningHosts(openings, rooms).map(({ opening, resolution }) => {
    if (resolution.status !== "resolved") return {
      ...baseOpening(opening),
      roomId: opening.roomId,
      wall: opening.wall,
      hostWorldCenter: resolution.requestedWorldCenter,
      hostResolution: resolution,
    };
    return {
      ...baseOpening(opening),
      roomId: resolution.host.roomId,
      wall: resolution.host.roomWall,
      physicalWallId: resolution.host.physicalWallId,
      hostPhysicalSegmentKey: resolution.host.segment.key,
      hostSegmentKey: resolution.host.roomSegmentKey,
      hostSegmentOffset: resolution.host.segmentOffsetMeters,
      hostWorldCenter: resolution.host.worldCenter,
      hostTangent: resolution.host.tangent,
      hostInwardNormal: resolution.host.inwardNormal,
      hostResolution: resolution,
    };
  });
}

export function mapPlanFixedElementsToRoomRenderer(
  elements: FixedElement2D[]
): RoomRendererFixedElement[] {
  return elements.map((fixed) => ({
    id: fixed.id, x: mmToMeters(fixed.xMm), z: mmToMeters(fixed.zMm),
    w: mmToMeters(fixed.widthMm), d: mmToMeters(fixed.depthMm),
    label: fixed.label, kind: fixed.kind, locked: fixed.locked,
  }));
}

export function mapPlanAnnotationsToRoomRenderer(
  annotations: EditorAnnotation2D[]
): RoomRendererAnnotation[] {
  return annotations.map((note) => ({
    id: note.id, x: mmToMeters(note.xMm), z: mmToMeters(note.zMm),
    text: note.text, kind: note.kind,
    anchorX: note.anchorXMm === undefined ? undefined : mmToMeters(note.anchorXMm),
    anchorZ: note.anchorZMm === undefined ? undefined : mmToMeters(note.anchorZMm),
  }));
}

export function movePlanFixedElement(
  elements: FixedElement2D[], id: string, xMeters: number, zMeters: number
): FixedElement2D[] {
  return elements.map((fixed) => fixed.id === id ? {
    ...fixed, xMm: metersToMm(xMeters), zMm: metersToMm(zMeters),
  } : fixed);
}

export function movePlanAnnotation(
  annotations: EditorAnnotation2D[], id: string, xMeters: number, zMeters: number
): EditorAnnotation2D[] {
  return annotations.map((note) => note.id === id ? {
    ...note, xMm: metersToMm(xMeters), zMm: metersToMm(zMeters),
  } : note);
}
