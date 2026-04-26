import {
  metersToMm,
  mmToMeters,
  type EditorAnnotation2D,
  type FixedElement2D,
  type RoomOpening2D,
} from "@/lib/editorScene";

export type RoomRendererOpening = {
  id: string;
  wall: "north" | "south" | "east" | "west";
  kind: "door" | "window";
  offset: number;
  width: number;
};

export type RoomRendererFixedElement = {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  label?: string;
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

export function mapPlanOpeningsToRoomRenderer(openings: RoomOpening2D[]): RoomRendererOpening[] {
  return openings.map((opening) => ({
    id: opening.id,
    wall: opening.wall,
    kind: opening.kind,
    offset: mmToMeters(opening.offsetMm),
    width: mmToMeters(opening.widthMm),
  }));
}

export function mapPlanFixedElementsToRoomRenderer(
  fixedElements: FixedElement2D[]
): RoomRendererFixedElement[] {
  return fixedElements.map((fixed) => ({
    id: fixed.id,
    x: mmToMeters(fixed.xMm),
    z: mmToMeters(fixed.zMm),
    w: mmToMeters(fixed.widthMm),
    d: mmToMeters(fixed.depthMm),
    label: fixed.label,
  }));
}

export function mapPlanAnnotationsToRoomRenderer(
  annotations: EditorAnnotation2D[]
): RoomRendererAnnotation[] {
  return annotations.map((note) => ({
    id: note.id,
    x: mmToMeters(note.xMm),
    z: mmToMeters(note.zMm),
    text: note.text,
    kind: note.kind,
    anchorX: note.anchorXMm !== undefined ? mmToMeters(note.anchorXMm) : undefined,
    anchorZ: note.anchorZMm !== undefined ? mmToMeters(note.anchorZMm) : undefined,
  }));
}

export function movePlanOpening(
  openings: RoomOpening2D[],
  id: string,
  offsetMeters: number
): RoomOpening2D[] {
  return openings.map((opening) =>
    opening.id === id ? { ...opening, offsetMm: Math.round(offsetMeters * 1000) } : opening
  );
}

export function movePlanFixedElement(
  fixedElements: FixedElement2D[],
  id: string,
  xMeters: number,
  zMeters: number
): FixedElement2D[] {
  return fixedElements.map((fixed) =>
    fixed.id === id
      ? {
          ...fixed,
          xMm: metersToMm(xMeters),
          zMm: metersToMm(zMeters),
        }
      : fixed
  );
}

export function movePlanAnnotation(
  annotations: EditorAnnotation2D[],
  id: string,
  xMeters: number,
  zMeters: number
): EditorAnnotation2D[] {
  return annotations.map((note) =>
    note.id === id
      ? {
          ...note,
          xMm: metersToMm(xMeters),
          zMm: metersToMm(zMeters),
        }
      : note
  );
}
