export type EditorViewMode = "3d" | "2d";

export type Vec2Mm = {
  x: number;
  z: number;
};

export type RoomShell = {
  widthMm: number;
  depthMm: number;
};

export type PlacedItem2D = {
  id: string;
  catalogItemId: string;
  positionMm: Vec2Mm;
  rotationDeg: number;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  label: string;
  category: string;
};

export type EditorAnnotation2D = {
  id: string;
  xMm: number;
  zMm: number;
  text: string;
  kind: "note" | "callout" | "room_tag";
  anchorXMm?: number;
  anchorZMm?: number;
};

export type RoomOpening2D = {
  id: string;
  wall: "north" | "south" | "east" | "west";
  offsetMm: number;
  widthMm: number;
  kind: "door" | "window";
};

export type FixedElement2D = {
  id: string;
  kind: "kitchen_counter" | "island" | "wardrobe" | "window" | "door";
  xMm: number;
  zMm: number;
  widthMm: number;
  depthMm: number;
  rotationDeg: number;
  label?: string;
};

export type EditorScene2D = {
  room: RoomShell;
  items: PlacedItem2D[];
  selectedItemId: string | null;
  annotations: EditorAnnotation2D[];
  openings: RoomOpening2D[];
  fixedElements: FixedElement2D[];
};

export function metersToMm(valueMeters: number) {
  return Math.round(valueMeters * 1000);
}

export function mmToMeters(valueMm: number) {
  return valueMm / 1000;
}

export function radiansToDeg(radians: number) {
  return (radians * 180) / Math.PI;
}

export function degToRadians(deg: number) {
  return (deg * Math.PI) / 180;
}
