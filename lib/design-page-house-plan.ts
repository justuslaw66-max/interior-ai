import type { FloorPlanDrawRoomMode } from "@/lib/floor-plan-types";
import type {
  RoomPlanShape,
  RoomSnapshot,
  RoomSurfaceOpacity,
  RoomSurfaceFinishes,
  RoomType,
} from "@/lib/room-types";
import type { ProductCategory } from "@/lib/catalog-schema";

export const ROOM_DIMENSION_DEFAULTS = {
  width: 5,
  depth: 4,
  wallThickness: 0.12,
  roomHeight: 2.6,
  min: 1.8,
  max: 20,
  minRoomHeight: 2,
  maxRoomHeight: 6,
  slabThickness: 0.1,
  minSlabThickness: 0.01,
  maxSlabThickness: 0.6,
} as const;

export const HOUSE_ROOM_TYPES: Array<{ type: RoomType; label: string }> = [
  { type: "living", label: "Living Room" },
  { type: "bedroom", label: "Bedroom" },
  { type: "kitchen", label: "Kitchen" },
  { type: "toilet", label: "Bathroom" },
  { type: "dining", label: "Dining Room" },
  { type: "custom", label: "Custom Room" },
];

export const HOUSE_ROOM_SHAPES: Array<{ shape: RoomPlanShape; label: string }> = [
  { shape: "rectangle", label: "Rectangle" },
  { shape: "l_shape", label: "L-shape" },
];

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  living: "Living Room",
  bedroom: "Bedroom",
  dining: "Dining Room",
  kitchen: "Kitchen",
  toilet: "Bathroom",
  custom: "Custom Room",
};

export type HouseRoomTemplateId =
  | "bedroom"
  | "kitchen"
  | "bathroom"
  | "dining";

export type HousePlanTemplateId =
  | "studio"
  | "one_bedroom"
  | "living_dining"
  | "compact_two_bed"
  | "three_room_flat"
  | "l_shaped_studio"
  | "narrow_one_bed"
  | "corner_one_bed"
  | "adu_guest_house"
  | "small_condo"
  | "hdb_two_room"
  | "family_two_bed"
  | "railroad_apartment";

export type HousePlanTemplateLayoutType =
  | "studio"
  | "one_bed"
  | "two_bed"
  | "flat"
  | "adu";

export type HousePlanTemplateFootprint =
  | "compact"
  | "narrow"
  | "wide"
  | "corner"
  | "long";

export type HousePlanTemplateRoom = {
  id: string;
  name: string;
  roomType: RoomType;
  shape: RoomPlanShape;
  width: number;
  depth: number;
  x: number;
  z: number;
};

export type HousePlanTemplateDoorway = {
  fromRoomId: string;
  toRoomId: string;
  wall: "north" | "south" | "east" | "west";
  offsetMeters?: number;
  widthMeters?: number;
};

export type HousePlanTemplateFurnishingPackId = "essentials" | "styled_starter";

export type HousePlanTemplateFurnishingIntent = {
  id: string;
  roomId: string;
  category: Extract<
    ProductCategory,
    | "sofa"
    | "coffee_table"
    | "rug"
    | "dining_table"
    | "dining_bench"
    | "accent_chair"
    | "floor_lamp"
    | "tv_console"
    | "sideboard"
    | "ottoman"
    | "side_table"
  >;
  x: number;
  z: number;
  rotationDeg?: number;
};

export type HousePlanTemplateFurnishingPack = {
  id: HousePlanTemplateFurnishingPackId;
  label: string;
  bestFor: string;
  intents: HousePlanTemplateFurnishingIntent[];
};

export type HousePlanTemplateApplyOptions = {
  furnishingPackId?: HousePlanTemplateFurnishingPackId;
};

export type HousePlanTemplate = {
  id: HousePlanTemplateId;
  label: string;
  summary: string;
  bestFor: string;
  layoutType: HousePlanTemplateLayoutType;
  footprint: HousePlanTemplateFootprint;
  bedroomCount: number;
  tags: string[];
  zones: string[];
  rooms: HousePlanTemplateRoom[];
  doorways: HousePlanTemplateDoorway[];
  furnishingPacks: HousePlanTemplateFurnishingPack[];
};

const HOUSE_PLAN_TEMPLATE_BASES: Array<Omit<HousePlanTemplate, "furnishingPacks">> = [
  {
    id: "studio",
    label: "Alcove studio",
    summary: "Entry, living/sleeping, kitchenette, bath",
    bestFor: "Renters and first apartments",
    layoutType: "studio",
    footprint: "compact",
    bedroomCount: 0,
    tags: ["studio", "renter", "compact", "alcove"],
    zones: ["Sofa/bed wall", "One-wall kitchenette", "Entry drop zone"],
    rooms: [
      {
        id: "living",
        name: "Living / Sleep",
        roomType: "living",
        shape: "rectangle",
        width: 5,
        depth: 4.4,
        x: 2.5,
        z: 2.2,
      },
      {
        id: "kitchen",
        name: "Kitchenette",
        roomType: "kitchen",
        shape: "rectangle",
        width: 2.4,
        depth: 2.2,
        x: 6.2,
        z: 1.1,
      },
      {
        id: "entry",
        name: "Entry",
        roomType: "custom",
        shape: "rectangle",
        width: 2.4,
        depth: 2.2,
        x: 6.2,
        z: 3.3,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 2.4,
        depth: 2.2,
        x: 6.2,
        z: 5.5,
      },
    ],
    doorways: [
      { fromRoomId: "entry", toRoomId: "living", wall: "west", offsetMeters: -0.2 },
      { fromRoomId: "entry", toRoomId: "bathroom", wall: "south", offsetMeters: 0 },
      { fromRoomId: "living", toRoomId: "kitchen", wall: "east", offsetMeters: -1.1, widthMeters: 1.2 },
    ],
  },
  {
    id: "one_bedroom",
    label: "Compact apartment",
    summary: "Entry, living, kitchen, bedroom, bath",
    bestFor: "Singles or couples",
    layoutType: "one_bed",
    footprint: "compact",
    bedroomCount: 1,
    tags: ["1-bed", "couple", "compact", "apartment"],
    zones: ["Sofa wall", "TV wall", "Queen bed wall", "Wardrobe wall"],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 4.8,
        depth: 4,
        x: 2.4,
        z: 2,
      },
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "kitchen",
        shape: "rectangle",
        width: 2.6,
        depth: 2.6,
        x: 6.1,
        z: 1.3,
      },
      {
        id: "entry",
        name: "Entry",
        roomType: "custom",
        shape: "rectangle",
        width: 2.6,
        depth: 1.4,
        x: 6.1,
        z: 3.3,
      },
      {
        id: "bedroom",
        name: "Bedroom",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3.4,
        depth: 3.4,
        x: 1.7,
        z: 5.7,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 2.4,
        depth: 2.4,
        x: 4.6,
        z: 5.2,
      },
    ],
    doorways: [
      { fromRoomId: "entry", toRoomId: "living", wall: "west", offsetMeters: -0.25 },
      { fromRoomId: "entry", toRoomId: "bathroom", wall: "west", offsetMeters: 0.5 },
      { fromRoomId: "living", toRoomId: "kitchen", wall: "east", offsetMeters: -1 },
      { fromRoomId: "living", toRoomId: "bedroom", wall: "south", offsetMeters: -0.7 },
    ],
  },
  {
    id: "living_dining",
    label: "Open-plan 1-bed",
    summary: "Entry, open living/dining, kitchen, bedroom, bath",
    bestFor: "Hosting and open living",
    layoutType: "one_bed",
    footprint: "wide",
    bedroomCount: 1,
    tags: ["1-bed", "open plan", "hosting", "wide"],
    zones: ["Conversation zone", "Dining nook", "Kitchen run", "Private bedroom"],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 4.4,
        depth: 4,
        x: 2.2,
        z: 2,
      },
      {
        id: "dining",
        name: "Dining",
        roomType: "dining",
        shape: "rectangle",
        width: 2.8,
        depth: 4,
        x: 5.8,
        z: 2,
      },
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "kitchen",
        shape: "rectangle",
        width: 2.8,
        depth: 2.6,
        x: 8.6,
        z: 1.3,
      },
      {
        id: "entry",
        name: "Entry",
        roomType: "custom",
        shape: "rectangle",
        width: 2.8,
        depth: 1.4,
        x: 8.6,
        z: 3.3,
      },
      {
        id: "bedroom",
        name: "Bedroom",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3.4,
        depth: 3.4,
        x: 1.7,
        z: 5.7,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 2.4,
        depth: 2.4,
        x: 4.6,
        z: 5.2,
      },
    ],
    doorways: [
      { fromRoomId: "entry", toRoomId: "kitchen", wall: "north", offsetMeters: 0 },
      { fromRoomId: "kitchen", toRoomId: "dining", wall: "west", offsetMeters: -0.2, widthMeters: 1.2 },
      { fromRoomId: "dining", toRoomId: "living", wall: "west", offsetMeters: 0, widthMeters: 1.4 },
      { fromRoomId: "living", toRoomId: "bedroom", wall: "south", offsetMeters: -0.5 },
      { fromRoomId: "dining", toRoomId: "bathroom", wall: "south", offsetMeters: -1 },
    ],
  },
  {
    id: "compact_two_bed",
    label: "Roommate 2-bed",
    summary: "Entry, living, kitchen, two bedrooms, bath",
    bestFor: "Roommates",
    layoutType: "two_bed",
    footprint: "compact",
    bedroomCount: 2,
    tags: ["2-bed", "roommates", "compact", "apartment"],
    zones: ["Shared living", "Compact kitchen", "Two bed walls", "Shared bath"],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 4.8,
        depth: 4,
        x: 2.4,
        z: 2,
      },
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "kitchen",
        shape: "rectangle",
        width: 2.8,
        depth: 2.8,
        x: 6.2,
        z: 1.4,
      },
      {
        id: "entry",
        name: "Entry",
        roomType: "custom",
        shape: "rectangle",
        width: 2.8,
        depth: 1.2,
        x: 6.2,
        z: 3.4,
      },
      {
        id: "bedroom",
        name: "Bedroom",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3.6,
        depth: 3.6,
        x: 1.8,
        z: 5.8,
      },
      {
        id: "bedroom_2",
        name: "Bedroom 2",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3,
        depth: 3.4,
        x: 7.5,
        z: 5.7,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 2.4,
        depth: 2.4,
        x: 4.8,
        z: 5.2,
      },
    ],
    doorways: [
      { fromRoomId: "entry", toRoomId: "living", wall: "west", offsetMeters: -0.2 },
      { fromRoomId: "entry", toRoomId: "bathroom", wall: "west", offsetMeters: 0.6 },
      { fromRoomId: "living", toRoomId: "kitchen", wall: "east", offsetMeters: -0.9 },
      { fromRoomId: "bedroom", toRoomId: "bathroom", wall: "east", offsetMeters: -0.4 },
      { fromRoomId: "bedroom_2", toRoomId: "bathroom", wall: "west", offsetMeters: -0.3 },
    ],
  },
  {
    id: "three_room_flat",
    label: "Family flat",
    summary: "Living, kitchen/dining, hall, two bedrooms, bath",
    bestFor: "Small families",
    layoutType: "flat",
    footprint: "wide",
    bedroomCount: 2,
    tags: ["family", "flat", "2-bed", "separated rooms"],
    zones: ["Family sofa wall", "Dining run", "Bedroom storage", "Rear bath"],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 5.2,
        depth: 4.2,
        x: 2.6,
        z: 2.1,
      },
      {
        id: "kitchen_dining",
        name: "Kitchen / Dining",
        roomType: "kitchen",
        shape: "rectangle",
        width: 3.4,
        depth: 4.2,
        x: 6.9,
        z: 2.1,
      },
      {
        id: "hall",
        name: "Hall",
        roomType: "custom",
        shape: "rectangle",
        width: 1.8,
        depth: 3.6,
        x: 4.3,
        z: 6,
      },
      {
        id: "bedroom",
        name: "Bedroom",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3.4,
        depth: 3.6,
        x: 1.7,
        z: 6,
      },
      {
        id: "bedroom_2",
        name: "Bedroom 2",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3.4,
        depth: 3.6,
        x: 6.9,
        z: 6,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 1.8,
        depth: 2.4,
        x: 4.3,
        z: 9,
      },
    ],
    doorways: [
      { fromRoomId: "living", toRoomId: "kitchen_dining", wall: "east", offsetMeters: 0 },
      { fromRoomId: "living", toRoomId: "hall", wall: "south", offsetMeters: 1.4 },
      { fromRoomId: "hall", toRoomId: "bedroom", wall: "west", offsetMeters: 0 },
      { fromRoomId: "hall", toRoomId: "bedroom_2", wall: "east", offsetMeters: 0 },
      { fromRoomId: "hall", toRoomId: "bathroom", wall: "south", offsetMeters: 0 },
    ],
  },
  {
    id: "l_shaped_studio",
    label: "L-shaped studio",
    summary: "Entry, kitchenette, living, sleep nook, bath",
    bestFor: "Renters who want a sleep nook",
    layoutType: "studio",
    footprint: "corner",
    bedroomCount: 0,
    tags: ["studio", "sleep nook", "renter", "corner"],
    zones: ["Sleep nook", "Sofa wall", "Kitchenette wall", "Entry storage"],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 4,
        depth: 4,
        x: 2,
        z: 2,
      },
      {
        id: "sleep_nook",
        name: "Sleep Nook",
        roomType: "custom",
        shape: "rectangle",
        width: 2.8,
        depth: 2.6,
        x: 1.4,
        z: 5.3,
      },
      {
        id: "kitchen",
        name: "Kitchenette",
        roomType: "kitchen",
        shape: "rectangle",
        width: 2.2,
        depth: 2.4,
        x: 5.1,
        z: 1.2,
      },
      {
        id: "entry",
        name: "Entry",
        roomType: "custom",
        shape: "rectangle",
        width: 2.2,
        depth: 1.6,
        x: 5.1,
        z: 3.2,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 2.2,
        depth: 2.2,
        x: 5.1,
        z: 5.1,
      },
    ],
    doorways: [
      { fromRoomId: "entry", toRoomId: "living", wall: "west", offsetMeters: -0.2 },
      { fromRoomId: "entry", toRoomId: "kitchen", wall: "north", offsetMeters: 0 },
      { fromRoomId: "entry", toRoomId: "bathroom", wall: "south", offsetMeters: 0 },
      { fromRoomId: "living", toRoomId: "sleep_nook", wall: "south", offsetMeters: -0.7, widthMeters: 1.2 },
    ],
  },
  {
    id: "narrow_one_bed",
    label: "Narrow 1-bed",
    summary: "Long apartment with side service spine",
    bestFor: "Narrow city units",
    layoutType: "one_bed",
    footprint: "narrow",
    bedroomCount: 1,
    tags: ["1-bed", "narrow", "city", "long"],
    zones: ["Long sofa wall", "Galley kitchen", "Bedroom storage wall"],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 3.4,
        depth: 4.2,
        x: 1.7,
        z: 2.1,
      },
      {
        id: "kitchen",
        name: "Galley Kitchen",
        roomType: "kitchen",
        shape: "rectangle",
        width: 2.2,
        depth: 3,
        x: 4.5,
        z: 1.5,
      },
      {
        id: "entry",
        name: "Entry",
        roomType: "custom",
        shape: "rectangle",
        width: 2.2,
        depth: 2.2,
        x: 4.5,
        z: 4.1,
      },
      {
        id: "bedroom",
        name: "Bedroom",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3.4,
        depth: 4,
        x: 1.7,
        z: 6.2,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 2.2,
        depth: 2.6,
        x: 4.5,
        z: 6.5,
      },
    ],
    doorways: [
      { fromRoomId: "entry", toRoomId: "living", wall: "west", offsetMeters: -0.4 },
      { fromRoomId: "entry", toRoomId: "kitchen", wall: "north", offsetMeters: 0 },
      { fromRoomId: "entry", toRoomId: "bathroom", wall: "south", offsetMeters: 0 },
      { fromRoomId: "living", toRoomId: "bedroom", wall: "south", offsetMeters: -0.6 },
    ],
  },
  {
    id: "corner_one_bed",
    label: "Corner 1-bed",
    summary: "Corner living, kitchen, bedroom, bath, work nook",
    bestFor: "Work-from-home couples",
    layoutType: "one_bed",
    footprint: "corner",
    bedroomCount: 1,
    tags: ["1-bed", "corner", "work nook", "couple"],
    zones: ["Corner sofa", "Desk nook", "Queen bed wall", "Kitchen wall"],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 4.4,
        depth: 4,
        x: 2.2,
        z: 2,
      },
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "kitchen",
        shape: "rectangle",
        width: 2.8,
        depth: 2.8,
        x: 5.8,
        z: 1.4,
      },
      {
        id: "entry",
        name: "Entry",
        roomType: "custom",
        shape: "rectangle",
        width: 2.8,
        depth: 1.2,
        x: 5.8,
        z: 3.4,
      },
      {
        id: "bedroom",
        name: "Bedroom",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3.4,
        depth: 3.4,
        x: 1.7,
        z: 5.7,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 2.4,
        depth: 2.4,
        x: 4.6,
        z: 5.2,
      },
      {
        id: "study",
        name: "Work Nook",
        roomType: "custom",
        shape: "rectangle",
        width: 2.4,
        depth: 2,
        x: 7,
        z: 5.6,
      },
    ],
    doorways: [
      { fromRoomId: "entry", toRoomId: "living", wall: "west", offsetMeters: -0.2 },
      { fromRoomId: "entry", toRoomId: "kitchen", wall: "north", offsetMeters: 0 },
      { fromRoomId: "living", toRoomId: "bedroom", wall: "south", offsetMeters: -0.6 },
      { fromRoomId: "bathroom", toRoomId: "study", wall: "east", offsetMeters: 0.2 },
      { fromRoomId: "living", toRoomId: "bathroom", wall: "south", offsetMeters: 1.4 },
    ],
  },
  {
    id: "adu_guest_house",
    label: "ADU / guest house",
    summary: "Small detached plan with bedroom and compact bath",
    bestFor: "Backyard rentals or guests",
    layoutType: "adu",
    footprint: "compact",
    bedroomCount: 1,
    tags: ["ADU", "guest", "rental", "compact"],
    zones: ["Sleeper sofa option", "Kitchen wall", "Guest bed wall", "Linen storage"],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 4,
        depth: 3.8,
        x: 2,
        z: 1.9,
      },
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "kitchen",
        shape: "rectangle",
        width: 2.4,
        depth: 3.8,
        x: 5.2,
        z: 1.9,
      },
      {
        id: "bedroom",
        name: "Bedroom",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3.4,
        depth: 3.2,
        x: 1.7,
        z: 5.4,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 2.4,
        depth: 2.2,
        x: 4.6,
        z: 4.9,
      },
      {
        id: "entry",
        name: "Entry",
        roomType: "custom",
        shape: "rectangle",
        width: 2.4,
        depth: 1,
        x: 4.6,
        z: 6.5,
      },
    ],
    doorways: [
      { fromRoomId: "living", toRoomId: "kitchen", wall: "east", offsetMeters: 0, widthMeters: 1.2 },
      { fromRoomId: "living", toRoomId: "bedroom", wall: "south", offsetMeters: -0.7 },
      { fromRoomId: "bedroom", toRoomId: "bathroom", wall: "east", offsetMeters: -0.2 },
      { fromRoomId: "bathroom", toRoomId: "entry", wall: "south", offsetMeters: 0 },
    ],
  },
  {
    id: "small_condo",
    label: "Small condo",
    summary: "Entry, open kitchen/living, bedroom, den, bath",
    bestFor: "Condo owners",
    layoutType: "one_bed",
    footprint: "wide",
    bedroomCount: 1,
    tags: ["condo", "den", "1-bed", "owner"],
    zones: ["Island dining", "Media wall", "Den desk", "Bedroom storage"],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 4.6,
        depth: 4,
        x: 2.3,
        z: 2,
      },
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "kitchen",
        shape: "rectangle",
        width: 3,
        depth: 2.8,
        x: 6.1,
        z: 1.4,
      },
      {
        id: "entry",
        name: "Entry",
        roomType: "custom",
        shape: "rectangle",
        width: 3,
        depth: 1.2,
        x: 6.1,
        z: 3.4,
      },
      {
        id: "bedroom",
        name: "Bedroom",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3.6,
        depth: 3.4,
        x: 1.8,
        z: 5.7,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 2.4,
        depth: 2.4,
        x: 4.8,
        z: 5.2,
      },
      {
        id: "den",
        name: "Den",
        roomType: "custom",
        shape: "rectangle",
        width: 2.4,
        depth: 2.4,
        x: 7.2,
        z: 5.2,
      },
    ],
    doorways: [
      { fromRoomId: "entry", toRoomId: "living", wall: "west", offsetMeters: -0.2 },
      { fromRoomId: "entry", toRoomId: "kitchen", wall: "north", offsetMeters: 0 },
      { fromRoomId: "living", toRoomId: "bedroom", wall: "south", offsetMeters: -0.6 },
      { fromRoomId: "bedroom", toRoomId: "bathroom", wall: "east", offsetMeters: -0.2 },
      { fromRoomId: "bathroom", toRoomId: "den", wall: "east", offsetMeters: 0 },
    ],
  },
  {
    id: "hdb_two_room",
    label: "HDB-style 2-room",
    summary: "Living, bedroom, kitchen, bath, utility",
    bestFor: "Compact flat planning",
    layoutType: "flat",
    footprint: "compact",
    bedroomCount: 1,
    tags: ["flat", "HDB-style", "compact", "utility"],
    zones: ["Flexible living", "Kitchen/dining", "Utility storage", "Bedroom wall"],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 4.4,
        depth: 3.8,
        x: 2.2,
        z: 1.9,
      },
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "kitchen",
        shape: "rectangle",
        width: 2.8,
        depth: 3.8,
        x: 5.8,
        z: 1.9,
      },
      {
        id: "bedroom",
        name: "Bedroom",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3.4,
        depth: 3.4,
        x: 1.7,
        z: 5.5,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 2.4,
        depth: 2.2,
        x: 4.6,
        z: 5.1,
      },
      {
        id: "utility",
        name: "Utility",
        roomType: "custom",
        shape: "rectangle",
        width: 1.4,
        depth: 1.2,
        x: 6.5,
        z: 4.4,
      },
    ],
    doorways: [
      { fromRoomId: "living", toRoomId: "kitchen", wall: "east", offsetMeters: 0 },
      { fromRoomId: "living", toRoomId: "bedroom", wall: "south", offsetMeters: -0.5 },
      { fromRoomId: "bedroom", toRoomId: "bathroom", wall: "east", offsetMeters: -0.2 },
      { fromRoomId: "kitchen", toRoomId: "utility", wall: "south", offsetMeters: 0.7 },
    ],
  },
  {
    id: "family_two_bed",
    label: "Family 2-bed",
    summary: "Living, dining, kitchen, hall, two bedrooms, bath",
    bestFor: "Small families",
    layoutType: "two_bed",
    footprint: "wide",
    bedroomCount: 2,
    tags: ["family", "2-bed", "dining", "separated rooms"],
    zones: ["Family sofa", "Dining table", "Kids room", "Primary bed"],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 4.8,
        depth: 4,
        x: 2.4,
        z: 2,
      },
      {
        id: "dining",
        name: "Dining",
        roomType: "dining",
        shape: "rectangle",
        width: 2.8,
        depth: 4,
        x: 6.2,
        z: 2,
      },
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "kitchen",
        shape: "rectangle",
        width: 2.8,
        depth: 2.8,
        x: 9,
        z: 1.4,
      },
      {
        id: "entry",
        name: "Entry",
        roomType: "custom",
        shape: "rectangle",
        width: 2.8,
        depth: 1.2,
        x: 9,
        z: 3.4,
      },
      {
        id: "bedroom",
        name: "Bedroom",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3.6,
        depth: 3.6,
        x: 1.8,
        z: 5.8,
      },
      {
        id: "bedroom_2",
        name: "Bedroom 2",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3.4,
        depth: 3.4,
        x: 5.3,
        z: 5.7,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 2.4,
        depth: 2.4,
        x: 8.2,
        z: 5.2,
      },
    ],
    doorways: [
      { fromRoomId: "entry", toRoomId: "kitchen", wall: "north", offsetMeters: 0 },
      { fromRoomId: "kitchen", toRoomId: "dining", wall: "west", offsetMeters: -0.2 },
      { fromRoomId: "dining", toRoomId: "living", wall: "west", offsetMeters: 0 },
      { fromRoomId: "living", toRoomId: "bedroom", wall: "south", offsetMeters: -0.6 },
      { fromRoomId: "bedroom", toRoomId: "bedroom_2", wall: "east", offsetMeters: 0 },
      { fromRoomId: "bedroom_2", toRoomId: "bathroom", wall: "east", offsetMeters: -0.2 },
    ],
  },
  {
    id: "railroad_apartment",
    label: "Railroad apartment",
    summary: "Long sequence of living, dining, kitchen, bedroom",
    bestFor: "Long narrow older units",
    layoutType: "one_bed",
    footprint: "long",
    bedroomCount: 1,
    tags: ["railroad", "long", "narrow", "older apartment"],
    zones: ["Front sitting room", "Pass-through dining", "Kitchen wall", "Rear bedroom"],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 3.4,
        depth: 3.6,
        x: 1.7,
        z: 1.8,
      },
      {
        id: "dining",
        name: "Dining Room",
        roomType: "dining",
        shape: "rectangle",
        width: 3.4,
        depth: 2.6,
        x: 1.7,
        z: 4.9,
      },
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "kitchen",
        shape: "rectangle",
        width: 3.4,
        depth: 2.6,
        x: 1.7,
        z: 7.5,
      },
      {
        id: "bedroom",
        name: "Bedroom",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3.4,
        depth: 3.8,
        x: 1.7,
        z: 10.7,
      },
      {
        id: "entry",
        name: "Entry",
        roomType: "custom",
        shape: "rectangle",
        width: 2.2,
        depth: 2.6,
        x: 4.5,
        z: 4.9,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 2.2,
        depth: 2.2,
        x: 4.5,
        z: 7.5,
      },
    ],
    doorways: [
      { fromRoomId: "living", toRoomId: "dining", wall: "south", offsetMeters: 0, widthMeters: 1.2 },
      { fromRoomId: "dining", toRoomId: "kitchen", wall: "south", offsetMeters: 0, widthMeters: 1.2 },
      { fromRoomId: "kitchen", toRoomId: "bedroom", wall: "south", offsetMeters: 0 },
      { fromRoomId: "dining", toRoomId: "entry", wall: "east", offsetMeters: 0 },
      { fromRoomId: "kitchen", toRoomId: "bathroom", wall: "east", offsetMeters: 0 },
    ],
  },
];

type HousePlanTemplateFurnishingPreset = Omit<HousePlanTemplateFurnishingIntent, "id">;

const TEMPLATE_FURNISHING_OVERRIDES: Partial<
  Record<
    HousePlanTemplateId,
    Record<HousePlanTemplateFurnishingPackId, HousePlanTemplateFurnishingPreset[]>
  >
> = {
  studio: {
    essentials: [
      { roomId: "living", category: "sofa", x: -1.25, z: -1.15, rotationDeg: 0 },
      { roomId: "living", category: "coffee_table", x: -1.25, z: -0.15, rotationDeg: 0 },
      { roomId: "living", category: "rug", x: -1.25, z: -0.1, rotationDeg: 0 },
    ],
    styled_starter: [
      { roomId: "living", category: "sofa", x: -1.25, z: -1.15, rotationDeg: 0 },
      { roomId: "living", category: "coffee_table", x: -1.25, z: -0.15, rotationDeg: 0 },
      { roomId: "living", category: "rug", x: -1.25, z: -0.1, rotationDeg: 0 },
      { roomId: "living", category: "accent_chair", x: 0.65, z: 0.65, rotationDeg: -35 },
      { roomId: "living", category: "floor_lamp", x: -2, z: -1.55, rotationDeg: 0 },
      { roomId: "living", category: "side_table", x: 0.95, z: -1.35, rotationDeg: 0 },
    ],
  },
  one_bedroom: {
    essentials: [
      { roomId: "living", category: "sofa", x: -0.85, z: -1.25, rotationDeg: 0 },
      { roomId: "living", category: "coffee_table", x: -0.85, z: -0.25, rotationDeg: 0 },
      { roomId: "living", category: "rug", x: -0.85, z: -0.2, rotationDeg: 0 },
    ],
    styled_starter: [
      { roomId: "living", category: "sofa", x: -0.85, z: -1.25, rotationDeg: 0 },
      { roomId: "living", category: "coffee_table", x: -0.85, z: -0.25, rotationDeg: 0 },
      { roomId: "living", category: "rug", x: -0.85, z: -0.2, rotationDeg: 0 },
      { roomId: "living", category: "accent_chair", x: 1.15, z: 0.35, rotationDeg: -35 },
      { roomId: "living", category: "floor_lamp", x: -1.85, z: -1.45, rotationDeg: 0 },
      { roomId: "living", category: "tv_console", x: 1.35, z: -1.25, rotationDeg: 90 },
    ],
  },
  living_dining: {
    essentials: [
      { roomId: "living", category: "sofa", x: -0.9, z: -1.15, rotationDeg: 0 },
      { roomId: "living", category: "coffee_table", x: -0.9, z: -0.15, rotationDeg: 0 },
      { roomId: "living", category: "rug", x: -0.9, z: -0.1, rotationDeg: 0 },
      { roomId: "dining", category: "dining_table", x: 0, z: -0.25, rotationDeg: 90 },
    ],
    styled_starter: [
      { roomId: "living", category: "sofa", x: -0.9, z: -1.15, rotationDeg: 0 },
      { roomId: "living", category: "coffee_table", x: -0.9, z: -0.15, rotationDeg: 0 },
      { roomId: "living", category: "rug", x: -0.9, z: -0.1, rotationDeg: 0 },
      { roomId: "living", category: "accent_chair", x: 1.1, z: 0.65, rotationDeg: -35 },
      { roomId: "living", category: "tv_console", x: 1.35, z: -1.15, rotationDeg: 90 },
      { roomId: "dining", category: "dining_table", x: 0, z: -0.25, rotationDeg: 90 },
      { roomId: "dining", category: "dining_bench", x: -0.55, z: -1.25, rotationDeg: 90 },
    ],
  },
  compact_two_bed: {
    essentials: [
      { roomId: "living", category: "sofa", x: -0.8, z: -1, rotationDeg: 0 },
      { roomId: "living", category: "coffee_table", x: -0.8, z: -0.1, rotationDeg: 0 },
      { roomId: "kitchen", category: "dining_table", x: 0, z: 0.55, rotationDeg: 0 },
    ],
    styled_starter: [
      { roomId: "living", category: "sofa", x: -0.8, z: -1, rotationDeg: 0 },
      { roomId: "living", category: "coffee_table", x: -0.8, z: -0.1, rotationDeg: 0 },
      { roomId: "living", category: "rug", x: -0.8, z: -0.1, rotationDeg: 0 },
      { roomId: "living", category: "floor_lamp", x: -1.75, z: -1.25, rotationDeg: 0 },
      { roomId: "living", category: "tv_console", x: 1.35, z: -0.95, rotationDeg: 90 },
      { roomId: "kitchen", category: "dining_table", x: 0, z: 0.55, rotationDeg: 0 },
    ],
  },
  three_room_flat: {
    essentials: [
      { roomId: "living", category: "sofa", x: -1.1, z: -1.15, rotationDeg: 0 },
      { roomId: "living", category: "coffee_table", x: -1.1, z: -0.15, rotationDeg: 0 },
      { roomId: "kitchen_dining", category: "dining_table", x: 0.25, z: 0.35, rotationDeg: 90 },
    ],
    styled_starter: [
      { roomId: "living", category: "sofa", x: -1.1, z: -1.15, rotationDeg: 0 },
      { roomId: "living", category: "coffee_table", x: -1.1, z: -0.15, rotationDeg: 0 },
      { roomId: "living", category: "rug", x: -1.1, z: -0.15, rotationDeg: 0 },
      { roomId: "living", category: "accent_chair", x: 1.05, z: 0.55, rotationDeg: -35 },
      { roomId: "living", category: "tv_console", x: 1.45, z: -1.2, rotationDeg: 90 },
      { roomId: "kitchen_dining", category: "dining_table", x: 0.25, z: 0.35, rotationDeg: 90 },
      { roomId: "kitchen_dining", category: "dining_bench", x: 1.05, z: 0.35, rotationDeg: 90 },
    ],
  },
};

function findTemplateFurnishingRoom(
  template: Omit<HousePlanTemplate, "furnishingPacks">,
  roomTypes: RoomType[]
): HousePlanTemplateRoom | null {
  return template.rooms.find((room) => roomTypes.includes(room.roomType)) ?? null;
}

function pushTemplateFurnishingIntent(
  intents: HousePlanTemplateFurnishingIntent[],
  room: HousePlanTemplateRoom | null,
  intent: Omit<HousePlanTemplateFurnishingIntent, "id" | "roomId">
) {
  if (!room) return;

  const marginMeters = 0.55;
  const maxX = Math.max(0, room.width / 2 - marginMeters);
  const maxZ = Math.max(0, room.depth / 2 - marginMeters);
  const x = Math.max(-maxX, Math.min(maxX, intent.x));
  const z = Math.max(-maxZ, Math.min(maxZ, intent.z));

  intents.push({
    ...intent,
    id: `${room.id}-${intent.category}-${intents.length + 1}`,
    roomId: room.id,
    x: roundPlanCoordinate(x),
    z: roundPlanCoordinate(z),
  });
}

function buildTemplateFurnishingOverrideIntents(
  template: Omit<HousePlanTemplate, "furnishingPacks">,
  presets: HousePlanTemplateFurnishingPreset[]
): HousePlanTemplateFurnishingIntent[] {
  const intents: HousePlanTemplateFurnishingIntent[] = [];

  for (const preset of presets) {
    const room = template.rooms.find((entry) => entry.id === preset.roomId) ?? null;
    pushTemplateFurnishingIntent(intents, room, {
      category: preset.category,
      x: preset.x,
      z: preset.z,
      rotationDeg: preset.rotationDeg,
    });
  }

  return intents;
}

function buildTemplateFurnishingPacks(
  template: Omit<HousePlanTemplate, "furnishingPacks">
): HousePlanTemplateFurnishingPack[] {
  const override = TEMPLATE_FURNISHING_OVERRIDES[template.id];
  if (override) {
    return [
      {
        id: "essentials",
        label: "Essentials",
        bestFor: "A sparse shoppable starting point",
        intents: buildTemplateFurnishingOverrideIntents(template, override.essentials),
      },
      {
        id: "styled_starter",
        label: "Styled starter",
        bestFor: "A warmer lived-in first draft",
        intents: buildTemplateFurnishingOverrideIntents(template, override.styled_starter),
      },
    ];
  }

  const livingRoom = findTemplateFurnishingRoom(template, ["living"]);
  const diningRoom = findTemplateFurnishingRoom(template, ["dining"]);
  const kitchenDiningRoom = template.rooms.find(
    (room) =>
      room.roomType === "dining" ||
      room.id.includes("dining") ||
      room.name.toLowerCase().includes("dining")
  ) ?? null;
  const diningTarget = diningRoom ?? kitchenDiningRoom;
  const hasLargeLivingRoom = Boolean(livingRoom && livingRoom.width >= 4.2 && livingRoom.depth >= 3.4);
  const hasDiningSpace = Boolean(diningTarget && diningTarget.width >= 3 && diningTarget.depth >= 2.4);

  const essentials: HousePlanTemplateFurnishingIntent[] = [];
  pushTemplateFurnishingIntent(essentials, livingRoom, {
    category: "sofa",
    x: 0,
    z: -1.15,
    rotationDeg: 0,
  });
  pushTemplateFurnishingIntent(essentials, livingRoom, {
    category: "coffee_table",
    x: 0,
    z: -0.15,
    rotationDeg: 0,
  });
  if (hasLargeLivingRoom) {
    pushTemplateFurnishingIntent(essentials, livingRoom, {
      category: "rug",
      x: 0,
      z: -0.1,
      rotationDeg: 0,
    });
  }
  if (hasDiningSpace) {
    pushTemplateFurnishingIntent(essentials, diningTarget, {
      category: "dining_table",
      x: 0,
      z: 0,
      rotationDeg: 0,
    });
  }

  const styledStarter: HousePlanTemplateFurnishingIntent[] = [...essentials];
  if (hasLargeLivingRoom) {
    pushTemplateFurnishingIntent(styledStarter, livingRoom, {
      category: "accent_chair",
      x: -1.3,
      z: 0.75,
      rotationDeg: 35,
    });
    pushTemplateFurnishingIntent(styledStarter, livingRoom, {
      category: "floor_lamp",
      x: 1.75,
      z: -1.45,
      rotationDeg: 0,
    });
    pushTemplateFurnishingIntent(styledStarter, livingRoom, {
      category: "tv_console",
      x: 0,
      z: 0.95,
      rotationDeg: 180,
    });
  } else {
    pushTemplateFurnishingIntent(styledStarter, livingRoom, {
      category: "side_table",
      x: -1,
      z: -1.15,
      rotationDeg: 0,
    });
  }
  if (hasDiningSpace && diningTarget && diningTarget.width >= 3.3 && diningTarget.depth >= 3.2) {
    pushTemplateFurnishingIntent(styledStarter, diningTarget, {
      category: "dining_bench",
      x: 0,
      z: 0.85,
      rotationDeg: 0,
    });
  }

  return [
    {
      id: "essentials",
      label: "Essentials",
      bestFor: "A sparse shoppable starting point",
      intents: essentials,
    },
    {
      id: "styled_starter",
      label: "Styled starter",
      bestFor: "A warmer lived-in first draft",
      intents: styledStarter,
    },
  ];
}

export const HOUSE_PLAN_TEMPLATES: HousePlanTemplate[] = HOUSE_PLAN_TEMPLATE_BASES.map(
  (template) => ({
    ...template,
    furnishingPacks: buildTemplateFurnishingPacks(template),
  })
);

export const HOUSE_ROOM_TEMPLATES: Array<{
  id: HouseRoomTemplateId;
  label: string;
  roomType: RoomType;
  shape: RoomPlanShape;
  width: number;
  depth: number;
}> = [
  {
    id: "bedroom",
    label: "Bedroom",
    roomType: "bedroom",
    shape: "rectangle",
    width: 4,
    depth: 3.6,
  },
  {
    id: "kitchen",
    label: "Kitchen",
    roomType: "kitchen",
    shape: "rectangle",
    width: 3.6,
    depth: 3,
  },
  {
    id: "bathroom",
    label: "Bathroom",
    roomType: "toilet",
    shape: "rectangle",
    width: 2.4,
    depth: 2.2,
  },
  {
    id: "dining",
    label: "Dining",
    roomType: "dining",
    shape: "rectangle",
    width: 4,
    depth: 3.4,
  },
];

export type RoomSizePresetId =
  | "living_small"
  | "living_medium"
  | "open_plan"
  | "custom";

export const ROOM_SIZE_PRESETS: Array<{
  id: Exclude<RoomSizePresetId, "custom">;
  label: string;
  width: number;
  depth: number;
}> = [
  { id: "living_small", label: "Small Living (5 x 4m)", width: 5, depth: 4 },
  { id: "living_medium", label: "Medium Living (6 x 4.5m)", width: 6, depth: 4.5 },
  { id: "open_plan", label: "Open Plan (7.2 x 5m)", width: 7.2, depth: 5 },
];

export type HousePlanRoom2D = {
  id: string;
  name: string;
  roomType: RoomType;
  floorLevel?: number;
  floorLabel?: string;
  shape: RoomPlanShape;
  polygon?: Array<{ x: number; z: number }>;
  surfaceFinishes?: RoomSurfaceFinishes;
  surfaceOpacity?: RoomSurfaceOpacity;
  slabThickness?: number;
  ceilingVisible?: boolean;
  x: number;
  z: number;
  w: number;
  d: number;
};

export type HousePlan2D = {
  rooms: HousePlanRoom2D[];
  width: number;
  depth: number;
};

export type HouseRoomAdjacencyGuide = {
  id: string;
  roomIds: [string, string];
  orientation: "vertical" | "horizontal";
  points: [[number, number], [number, number]];
  labelPosition: { x: number; z: number };
  lengthMeters: number;
};

export type HouseRoomSnapPreview = HouseRoomAdjacencyGuide & {
  x: number;
  z: number;
  targetRoomId: string;
  targetRoomName: string;
  label: string;
};

export type HouseRoomDoorwaySuggestion = {
  id: string;
  roomId: string;
  adjacentRoomId: string;
  adjacentRoomName: string;
  wall: "north" | "south" | "east" | "west";
  offsetMeters: number;
  widthMeters: number;
  points: [[number, number], [number, number]];
  labelPosition: { x: number; z: number };
  label: string;
};

export type HouseRoomConnectionOpening = {
  roomId?: string;
  wall: "north" | "south" | "east" | "west";
  offsetMm: number;
  widthMm: number;
  kind: "door" | "window";
};

export type HouseRoomConnectionChecklistItem = {
  id: string;
  roomIds: [string, string];
  roomNames: [string, string];
  sharedWallLengthMeters: number;
  status: "connected" | "needs_doorway";
  doorwaySuggestion?: HouseRoomDoorwaySuggestion;
};

export type FloorPlanDrawCancelDecision = {
  shouldHandle: boolean;
  clearRoomPoints: boolean;
  clearRoomPreview: boolean;
  exitRoomDrawMode: boolean;
};

export type FloorPlanOpeningCancelDecision = {
  shouldHandle: boolean;
  clearOpeningPoints: boolean;
  exitOpeningMode: boolean;
};

export function resolveFloorPlanDrawCancelDecision({
  traceRoomMode,
  pointCount,
}: {
  traceRoomMode: boolean;
  drawMode: FloorPlanDrawRoomMode;
  pointCount: number;
}): FloorPlanDrawCancelDecision {
  if (!traceRoomMode) {
    return {
      shouldHandle: false,
      clearRoomPoints: false,
      clearRoomPreview: false,
      exitRoomDrawMode: false,
    };
  }

  const hasActiveDraw = pointCount > 0;
  return {
    shouldHandle: true,
    clearRoomPoints: true,
    clearRoomPreview: true,
    exitRoomDrawMode: !hasActiveDraw,
  };
}

export function resolveFloorPlanOpeningCancelDecision({
  traceOpeningMode,
  pointCount,
}: {
  traceOpeningMode: boolean;
  pointCount: number;
}): FloorPlanOpeningCancelDecision {
  if (!traceOpeningMode && pointCount === 0) {
    return {
      shouldHandle: false,
      clearOpeningPoints: false,
      exitOpeningMode: false,
    };
  }

  const hasActiveTrace = pointCount > 0;
  return {
    shouldHandle: true,
    clearOpeningPoints: true,
    exitOpeningMode: !hasActiveTrace,
  };
}

export function clampRoomDimension(value: number): number {
  return Math.max(
    ROOM_DIMENSION_DEFAULTS.min,
    Math.min(ROOM_DIMENSION_DEFAULTS.max, Number(value))
  );
}

export function getRoomTypeLabel(roomType: RoomType): string {
  return ROOM_TYPE_LABELS[roomType] ?? "Room";
}

export function resolveNewRoomName(rooms: RoomSnapshot[], roomType: RoomType): string {
  const roomTypeCount = rooms.filter((room) => room.roomType === roomType).length;
  const baseName = getRoomTypeLabel(roomType);
  return roomTypeCount > 0 ? `${baseName} ${roomTypeCount + 1}` : baseName;
}

export function buildHousePlan2D(
  rooms: RoomSnapshot[],
  fallbackWidth: number,
  fallbackDepth: number
): HousePlan2D {
  if (!rooms.length) {
    return { rooms: [], width: fallbackWidth, depth: fallbackDepth };
  }

  let rightEdge = 0;
  const placedRooms = rooms.map((room, index) => {
    const w = room.geometry.width || ROOM_DIMENSION_DEFAULTS.width;
    const d = room.geometry.depth || ROOM_DIMENSION_DEFAULTS.depth;
    const storedX = room.planPosition?.x;
    const storedZ = room.planPosition?.z;
    const fallbackX = index === 0 ? 0 : rightEdge + w / 2;

    if (index === 0) {
      rightEdge = w / 2;
    } else {
      rightEdge += w;
    }

    return {
      id: room.id,
      name: room.name,
      roomType: room.roomType,
      floorLevel:
        typeof room.floorLevel === "number" && Number.isFinite(room.floorLevel)
          ? room.floorLevel
          : 1,
      ...(room.floorLabel ? { floorLabel: room.floorLabel } : {}),
      shape: room.planShape ?? "rectangle",
      ...(room.planPolygon ? { polygon: room.planPolygon } : {}),
      ...(room.surfaceFinishes ? { surfaceFinishes: room.surfaceFinishes } : {}),
      ...(room.surfaceOpacity ? { surfaceOpacity: room.surfaceOpacity } : {}),
      slabThickness:
        typeof room.geometry.slabThickness === "number" && Number.isFinite(room.geometry.slabThickness)
          ? room.geometry.slabThickness
          : ROOM_DIMENSION_DEFAULTS.slabThickness,
      ceilingVisible: room.ceilingVisible ?? true,
      x: typeof storedX === "number" && Number.isFinite(storedX) ? storedX : fallbackX,
      z: typeof storedZ === "number" && Number.isFinite(storedZ) ? storedZ : 0,
      w,
      d,
    };
  });

  let minX = 0;
  let maxX = 0;
  let minZ = 0;
  let maxZ = 0;

  for (const room of placedRooms) {
    minX = Math.min(minX, room.x - room.w / 2);
    maxX = Math.max(maxX, room.x + room.w / 2);
    minZ = Math.min(minZ, room.z - room.d / 2);
    maxZ = Math.max(maxZ, room.z + room.d / 2);
  }

  const widthFromOrigin = Math.max(Math.abs(minX), Math.abs(maxX)) * 2;
  const depthFromOrigin = Math.max(Math.abs(minZ), Math.abs(maxZ)) * 2;

  return {
    rooms: placedRooms,
    width: Math.max(fallbackWidth, widthFromOrigin),
    depth: Math.max(fallbackDepth, depthFromOrigin),
  };
}

export function getActiveRoomPlanOffset(
  rooms: HousePlanRoom2D[],
  activeRoomId: string
): { x: number; z: number } {
  const room = rooms.find((entry) => entry.id === activeRoomId);
  return { x: room?.x ?? 0, z: room?.z ?? 0 };
}

export function getNextRoomPlanPosition(
  rooms: HousePlanRoom2D[],
  fallbackRoomWidth: number,
  newRoomWidth: number
): { x: number; z: number } {
  const rightEdge = rooms.reduce(
    (edge, room) => Math.max(edge, room.x + room.w / 2),
    fallbackRoomWidth / 2
  );

  return {
    x: rightEdge + newRoomWidth / 2,
    z: 0,
  };
}

function getHouseRoomBounds(
  x: number,
  z: number,
  w: number,
  d: number
): { left: number; right: number; top: number; bottom: number } {
  return {
    left: x - w / 2,
    right: x + w / 2,
    top: z - d / 2,
    bottom: z + d / 2,
  };
}

function getHouseRoomOverlapArea(
  first: { left: number; right: number; top: number; bottom: number },
  second: { left: number; right: number; top: number; bottom: number }
): number {
  const overlapWidth = Math.min(first.right, second.right) - Math.max(first.left, second.left);
  const overlapDepth = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
  if (overlapWidth <= 0 || overlapDepth <= 0) return 0;
  return overlapWidth * overlapDepth;
}

export function doesHouseRoomOverlap(
  roomId: string,
  x: number,
  z: number,
  w: number,
  d: number,
  rooms: HousePlanRoom2D[],
  tolerance = 0.01
): boolean {
  const candidate = getHouseRoomBounds(x, z, w, d);

  return rooms.some((room) => {
    if (room.id === roomId) return false;

    const other = getHouseRoomBounds(room.x, room.z, room.w, room.d);
    return (
      candidate.left < other.right - tolerance &&
      candidate.right > other.left + tolerance &&
      candidate.top < other.bottom - tolerance &&
      candidate.bottom > other.top + tolerance
    );
  });
}

export function shouldReplaceStarterRoomWithDrawnRoom({
  activeRoom,
  rooms,
  x,
  z,
  w,
  d,
  tolerance = 0.01,
  minCandidateOverlapRatio = 0.55,
}: {
  activeRoom: RoomSnapshot | null | undefined;
  rooms: HousePlanRoom2D[];
  x: number;
  z: number;
  w: number;
  d: number;
  tolerance?: number;
  minCandidateOverlapRatio?: number;
}): boolean {
  if (!activeRoom || rooms.length !== 1) return false;
  if ((activeRoom.items?.length ?? 0) > 0 || (activeRoom.zones?.length ?? 0) > 0) return false;

  const activePlanRoom = rooms.find((room) => room.id === activeRoom.id);
  if (!activePlanRoom) return false;

  const candidate = getHouseRoomBounds(x, z, w, d);
  const starter = getHouseRoomBounds(
    activePlanRoom.x,
    activePlanRoom.z,
    activePlanRoom.w,
    activePlanRoom.d
  );
  const candidateCenterInsideStarter =
    x > starter.left + tolerance &&
    x < starter.right - tolerance &&
    z > starter.top + tolerance &&
    z < starter.bottom - tolerance;
  if (!candidateCenterInsideStarter) return false;

  const overlapArea = getHouseRoomOverlapArea(candidate, starter);
  if (overlapArea <= 0) return false;

  const candidateArea = Math.max(w * d, tolerance);
  return overlapArea / candidateArea >= minCandidateOverlapRatio;
}

export function snapHouseRoomMove(
  roomId: string,
  x: number,
  z: number,
  rooms: HousePlanRoom2D[],
  snapDistance = 0.18
): { x: number; z: number } | null {
  const moving = rooms.find((room) => room.id === roomId);
  if (!moving) return null;

  let nextX = x;
  let nextZ = z;
  const alignmentSnapDistance = Math.max(snapDistance * 2.5, 0.45);

  for (const other of rooms) {
    if (other.id === roomId) continue;

    const movingBounds = getHouseRoomBounds(nextX, nextZ, moving.w, moving.d);
    const otherBounds = getHouseRoomBounds(other.x, other.z, other.w, other.d);

    const alignDepth = () => {
      const candidates = [
        {
          distance: Math.abs(movingBounds.top - otherBounds.top),
          z: otherBounds.top + moving.d / 2,
        },
        {
          distance: Math.abs(movingBounds.bottom - otherBounds.bottom),
          z: otherBounds.bottom - moving.d / 2,
        },
        {
          distance: Math.abs(nextZ - other.z),
          z: other.z,
        },
      ].filter((candidate) => candidate.distance < alignmentSnapDistance);
      const best = candidates.sort((first, second) => first.distance - second.distance)[0];
      if (best) nextZ = best.z;
    };

    const alignWidth = () => {
      const candidates = [
        {
          distance: Math.abs(movingBounds.left - otherBounds.left),
          x: otherBounds.left + moving.w / 2,
        },
        {
          distance: Math.abs(movingBounds.right - otherBounds.right),
          x: otherBounds.right - moving.w / 2,
        },
        {
          distance: Math.abs(nextX - other.x),
          x: other.x,
        },
      ].filter((candidate) => candidate.distance < alignmentSnapDistance);
      const best = candidates.sort((first, second) => first.distance - second.distance)[0];
      if (best) nextX = best.x;
    };

    if (Math.abs(movingBounds.left - otherBounds.right) < snapDistance) {
      nextX = otherBounds.right + moving.w / 2;
      alignDepth();
    } else if (Math.abs(movingBounds.right - otherBounds.left) < snapDistance) {
      nextX = otherBounds.left - moving.w / 2;
      alignDepth();
    }

    if (Math.abs(movingBounds.top - otherBounds.bottom) < snapDistance) {
      nextZ = otherBounds.bottom + moving.d / 2;
      alignWidth();
    } else if (Math.abs(movingBounds.bottom - otherBounds.top) < snapDistance) {
      nextZ = otherBounds.top - moving.d / 2;
      alignWidth();
    }
  }

  if (doesHouseRoomOverlap(roomId, nextX, nextZ, moving.w, moving.d, rooms)) {
    return { x: moving.x, z: moving.z };
  }

  return { x: nextX, z: nextZ };
}

export function roundPlanCoordinate(value: number): number {
  return Number(value.toFixed(3));
}

export function buildHouseRoomAdjacencyGuides(
  rooms: HousePlanRoom2D[],
  toleranceMeters = 0.04,
  minSharedWallMeters = 0.45
): HouseRoomAdjacencyGuide[] {
  const guides: HouseRoomAdjacencyGuide[] = [];

  for (let i = 0; i < rooms.length; i += 1) {
    const first = rooms[i];
    const firstBounds = getHouseRoomBounds(first.x, first.z, first.w, first.d);

    for (let j = i + 1; j < rooms.length; j += 1) {
      const second = rooms[j];
      const secondBounds = getHouseRoomBounds(second.x, second.z, second.w, second.d);
      const verticalOverlapTop = Math.max(firstBounds.top, secondBounds.top);
      const verticalOverlapBottom = Math.min(firstBounds.bottom, secondBounds.bottom);
      const verticalOverlap = verticalOverlapBottom - verticalOverlapTop;
      const horizontalOverlapLeft = Math.max(firstBounds.left, secondBounds.left);
      const horizontalOverlapRight = Math.min(firstBounds.right, secondBounds.right);
      const horizontalOverlap = horizontalOverlapRight - horizontalOverlapLeft;
      const rightToLeftGap = Math.abs(firstBounds.right - secondBounds.left);
      const leftToRightGap = Math.abs(firstBounds.left - secondBounds.right);
      const bottomToTopGap = Math.abs(firstBounds.bottom - secondBounds.top);
      const topToBottomGap = Math.abs(firstBounds.top - secondBounds.bottom);

      if (verticalOverlap >= minSharedWallMeters && rightToLeftGap <= toleranceMeters) {
        const x = roundPlanCoordinate((firstBounds.right + secondBounds.left) / 2);
        guides.push({
          id: `${first.id}-${second.id}-vertical-east-west`,
          roomIds: [first.id, second.id],
          orientation: "vertical",
          points: [
            [x, roundPlanCoordinate(verticalOverlapTop)],
            [x, roundPlanCoordinate(verticalOverlapBottom)],
          ],
          labelPosition: {
            x,
            z: roundPlanCoordinate((verticalOverlapTop + verticalOverlapBottom) / 2),
          },
          lengthMeters: roundPlanCoordinate(verticalOverlap),
        });
      } else if (verticalOverlap >= minSharedWallMeters && leftToRightGap <= toleranceMeters) {
        const x = roundPlanCoordinate((firstBounds.left + secondBounds.right) / 2);
        guides.push({
          id: `${first.id}-${second.id}-vertical-west-east`,
          roomIds: [first.id, second.id],
          orientation: "vertical",
          points: [
            [x, roundPlanCoordinate(verticalOverlapTop)],
            [x, roundPlanCoordinate(verticalOverlapBottom)],
          ],
          labelPosition: {
            x,
            z: roundPlanCoordinate((verticalOverlapTop + verticalOverlapBottom) / 2),
          },
          lengthMeters: roundPlanCoordinate(verticalOverlap),
        });
      }

      if (horizontalOverlap >= minSharedWallMeters && bottomToTopGap <= toleranceMeters) {
        const z = roundPlanCoordinate((firstBounds.bottom + secondBounds.top) / 2);
        guides.push({
          id: `${first.id}-${second.id}-horizontal-south-north`,
          roomIds: [first.id, second.id],
          orientation: "horizontal",
          points: [
            [roundPlanCoordinate(horizontalOverlapLeft), z],
            [roundPlanCoordinate(horizontalOverlapRight), z],
          ],
          labelPosition: {
            x: roundPlanCoordinate((horizontalOverlapLeft + horizontalOverlapRight) / 2),
            z,
          },
          lengthMeters: roundPlanCoordinate(horizontalOverlap),
        });
      } else if (horizontalOverlap >= minSharedWallMeters && topToBottomGap <= toleranceMeters) {
        const z = roundPlanCoordinate((firstBounds.top + secondBounds.bottom) / 2);
        guides.push({
          id: `${first.id}-${second.id}-horizontal-north-south`,
          roomIds: [first.id, second.id],
          orientation: "horizontal",
          points: [
            [roundPlanCoordinate(horizontalOverlapLeft), z],
            [roundPlanCoordinate(horizontalOverlapRight), z],
          ],
          labelPosition: {
            x: roundPlanCoordinate((horizontalOverlapLeft + horizontalOverlapRight) / 2),
            z,
          },
          lengthMeters: roundPlanCoordinate(horizontalOverlap),
        });
      }
    }
  }

  return guides;
}

export function resolveHouseRoomSnapPreview(
  roomId: string,
  x: number,
  z: number,
  rooms: HousePlanRoom2D[],
  snapDistance = 0.18
): HouseRoomSnapPreview | null {
  const moving = rooms.find((room) => room.id === roomId);
  if (!moving) return null;

  const snapped = snapHouseRoomMove(roomId, x, z, rooms, snapDistance);
  if (!snapped) return null;

  const proposedOverlaps = doesHouseRoomOverlap(roomId, x, z, moving.w, moving.d, rooms);
  const snappedToCurrent =
    Math.abs(snapped.x - moving.x) < 0.001 &&
    Math.abs(snapped.z - moving.z) < 0.001;

  if (proposedOverlaps && snappedToCurrent) {
    return null;
  }

  const previewRooms = rooms.map((room) =>
    room.id === roomId
      ? {
          ...room,
          x: snapped.x,
          z: snapped.z,
        }
      : room
  );
  const guide = buildHouseRoomAdjacencyGuides(previewRooms).find((candidate) =>
    candidate.roomIds.includes(roomId)
  );

  if (!guide) return null;

  const targetRoomId = guide.roomIds.find((id) => id !== roomId);
  const targetRoom = targetRoomId ? rooms.find((room) => room.id === targetRoomId) : null;
  if (!targetRoomId || !targetRoom) return null;

  return {
    ...guide,
    x: roundPlanCoordinate(snapped.x),
    z: roundPlanCoordinate(snapped.z),
    targetRoomId,
    targetRoomName: targetRoom.name,
    label: `Align to ${targetRoom.name} wall`,
  };
}

export function buildHouseRoomDoorwaySuggestions(
  rooms: HousePlanRoom2D[],
  activeRoomId?: string | null
): HouseRoomDoorwaySuggestion[] {
  const suggestions: HouseRoomDoorwaySuggestion[] = [];
  const guides = buildHouseRoomAdjacencyGuides(rooms);
  const minDoorwayWidthMeters = 0.55;
  const doorwayWallMarginMeters = 0.3;
  const preferredDoorwayWidthMeters = 0.9;

  for (const guide of guides) {
    const roomIds = activeRoomId && guide.roomIds.includes(activeRoomId)
      ? [activeRoomId]
      : activeRoomId
        ? []
        : guide.roomIds;

    for (const roomId of roomIds) {
      const room = rooms.find((entry) => entry.id === roomId);
      const adjacentRoomId = guide.roomIds.find((id) => id !== roomId);
      const adjacentRoom = adjacentRoomId
        ? rooms.find((entry) => entry.id === adjacentRoomId)
        : null;

      if (!room || !adjacentRoomId || !adjacentRoom) continue;

      const doorwayWidth = roundPlanCoordinate(
        Math.min(preferredDoorwayWidthMeters, guide.lengthMeters - doorwayWallMarginMeters)
      );

      if (doorwayWidth < minDoorwayWidthMeters) continue;

      const wall =
        guide.orientation === "vertical"
          ? room.x < guide.labelPosition.x
            ? "east"
            : "west"
          : room.z < guide.labelPosition.z
            ? "south"
            : "north";
      const offsetMeters =
        guide.orientation === "vertical"
          ? roundPlanCoordinate(guide.labelPosition.z - room.z)
          : roundPlanCoordinate(guide.labelPosition.x - room.x);

      suggestions.push({
        id: `${guide.id}-${roomId}-doorway`,
        roomId,
        adjacentRoomId,
        adjacentRoomName: adjacentRoom.name,
        wall,
        offsetMeters,
        widthMeters: doorwayWidth,
        points: guide.points,
        labelPosition: guide.labelPosition,
        label: "Add doorway",
      });
    }
  }

  return suggestions;
}

function doorwaySuggestionMatchesOpening(
  suggestion: HouseRoomDoorwaySuggestion,
  opening: HouseRoomConnectionOpening
): boolean {
  if (opening.kind !== "door") return false;
  if (opening.roomId !== suggestion.roomId) return false;
  if (opening.wall !== suggestion.wall) return false;

  const offsetMm = Math.round(suggestion.offsetMeters * 1000);
  const widthMm = Math.round(suggestion.widthMeters * 1000);
  return Math.abs(opening.offsetMm - offsetMm) <= Math.max(150, widthMm / 2);
}

export function buildHouseRoomConnectionChecklist(
  rooms: HousePlanRoom2D[],
  openings: HouseRoomConnectionOpening[],
  activeRoomId?: string | null
): HouseRoomConnectionChecklistItem[] {
  const suggestions = buildHouseRoomDoorwaySuggestions(rooms);

  return buildHouseRoomAdjacencyGuides(rooms).map((guide) => {
    const [firstRoomId, secondRoomId] = guide.roomIds;
    const firstRoom = rooms.find((room) => room.id === firstRoomId);
    const secondRoom = rooms.find((room) => room.id === secondRoomId);
    const pairSuggestions = suggestions.filter(
      (suggestion) =>
        guide.roomIds.includes(suggestion.roomId) &&
        guide.roomIds.includes(suggestion.adjacentRoomId)
    );
    const hasDoorway = pairSuggestions.some((suggestion) =>
      openings.some((opening) => doorwaySuggestionMatchesOpening(suggestion, opening))
    );
    const doorwaySuggestion =
      hasDoorway
        ? undefined
        : activeRoomId
          ? pairSuggestions.find((suggestion) => suggestion.roomId === activeRoomId) ??
            pairSuggestions[0]
          : pairSuggestions[0];

    return {
      id: guide.id,
      roomIds: guide.roomIds,
      roomNames: [
        firstRoom?.name ?? "Room",
        secondRoom?.name ?? "Room",
      ],
      sharedWallLengthMeters: guide.lengthMeters,
      status: hasDoorway ? "connected" : "needs_doorway",
      doorwaySuggestion,
    };
  });
}

export function resolvePlanFitZoom(params: {
  viewportWidthPx: number;
  viewportHeightPx: number;
  planWidthMeters: number;
  planDepthMeters: number;
  paddingMeters?: number;
  minZoom?: number;
  maxZoom?: number;
}): number {
  const paddingMeters = params.paddingMeters ?? 1.2;
  const minZoom = params.minZoom ?? 24;
  const maxZoom = params.maxZoom ?? 220;
  const spanX = Math.max(0.1, params.planWidthMeters + paddingMeters);
  const spanZ = Math.max(0.1, params.planDepthMeters + paddingMeters);
  const zoomX = params.viewportWidthPx / spanX;
  const zoomZ = params.viewportHeightPx / spanZ;
  return Math.max(minZoom, Math.min(maxZoom, Math.min(zoomX, zoomZ)));
}
