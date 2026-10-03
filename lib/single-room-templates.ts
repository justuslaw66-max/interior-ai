import type { HousePlanTemplate, HousePlanTemplateFurnishingIntent } from "@/lib/design-page-house-plan";

// One-room templates (UX phase 4g, ST8): most people design one room, so Start a new design
// offers a living room and a bedroom on their own, each with a door, a window and a furnished
// pack. They sit under the "1 room" chip; the pack's pieces are fitted to the products they get
// (`lib/template-furnishing-layout.ts`), and `scripts/test-template-review.tsx` reviews them too.

type Piece = Omit<HousePlanTemplateFurnishingIntent, "id" | "roomId">;

function pack(roomId: string, pieces: readonly Piece[]): HousePlanTemplate["furnishingPacks"] {
  return [
    {
      id: "styled_starter",
      label: "Styled starter",
      bestFor: "A furnished first draft of the room",
      intents: pieces.map((piece, index) => ({ ...piece, id: `${roomId}-${piece.category}-${index + 1}`, roomId })),
    },
  ];
}

const SHARED = {
  layoutType: "studio",
  footprint: "compact",
  bedroomCount: 0,
  zones: [],
  realLifeChecks: [],
} satisfies Partial<HousePlanTemplate>;

export const LIVING_ROOM_TEMPLATE: HousePlanTemplate = {
  ...SHARED,
  id: "one_room_living",
  label: "Living room",
  summary: "One living room with a door and a window. Set its size, then furnish it.",
  bestFor: "Planning a living room",
  tags: ["one room", "living room"],
  rooms: [{ id: "living", name: "Living Room", roomType: "living", shape: "rectangle", width: 5, depth: 4, x: 0, z: 0 }],
  doorways: [{ fromRoomId: "living", wall: "east", offsetMeters: 1, widthMeters: 0.9 }],
  windows: [{ roomId: "living", wall: "west", offsetMeters: 0, widthMeters: 1.6 }],
  furnishingPacks: pack("living", [
    { category: "sofa", x: -0.4, z: -1.5, rotationDeg: 0 },
    { category: "coffee_table", x: -0.4, z: -0.4, rotationDeg: 0 },
    { category: "floor_lamp", x: -2, z: -1.6, rotationDeg: 0 },
    { category: "accent_chair", x: 1.5, z: -0.3, rotationDeg: -90 },
    { category: "tv_console", x: -0.4, z: 1.8, rotationDeg: 180 },
  ]),
};

export const BEDROOM_TEMPLATE: HousePlanTemplate = {
  ...SHARED,
  id: "one_room_bedroom",
  label: "Bedroom",
  summary: "One bedroom with a door and a window. Set its size, then furnish it.",
  bestFor: "Planning a bedroom",
  tags: ["one room", "bedroom"],
  rooms: [{ id: "bedroom", name: "Bedroom", roomType: "bedroom", shape: "rectangle", width: 4, depth: 3.6, x: 0, z: 0 }],
  doorways: [{ fromRoomId: "bedroom", wall: "south", offsetMeters: 1.3, widthMeters: 0.9 }],
  windows: [{ roomId: "bedroom", wall: "west", offsetMeters: 0, widthMeters: 1.4 }],
  furnishingPacks: pack("bedroom", [
    { category: "bed", x: -0.2, z: -0.6, rotationDeg: 0 },
    { category: "side_table", x: -1.4, z: -1.5, rotationDeg: 0 },
    { category: "side_table", x: 1, z: -1.5, rotationDeg: 0 },
  ]),
};

export const SINGLE_ROOM_TEMPLATES: readonly HousePlanTemplate[] = [LIVING_ROOM_TEMPLATE, BEDROOM_TEMPLATE];
