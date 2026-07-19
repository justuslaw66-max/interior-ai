import type { FloorPlanDrawRoomMode } from "@/lib/floor-plan-types";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanAddressTransform } from "@/lib/floor-plan-imports/types";
import { resolveCanonicalFloorElevationMeters } from "@/lib/floor-plan-scene-elevation";
import type {
  PersistedFloorPlanAddressBinding,
} from "@/lib/room-types";
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

export const HOUSE_ROOM_WALL_SNAP_DISTANCE_METERS = 0.18;

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
  | "railroad_apartment"
  | `library_${string}`;

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
  planPolygon?: Array<{ x: number; z: number }>;
  width: number;
  depth: number;
  x: number;
  z: number;
  wallThickness?: number;
};

export type HousePlanTemplateDoorway = {
  fromRoomId: string;
  toRoomId?: string;
  wall: "north" | "south" | "east" | "west";
  offsetMeters?: number;
  widthMeters?: number;
  kind?: "door" | "opening";
  operation?: "swing" | "sliding" | "folding" | "fixed" | "open";
};

export type HousePlanTemplateWindow = {
  roomId: string;
  wall: "north" | "south" | "east" | "west";
  offsetMeters?: number;
  widthMeters?: number;
  kind?: "window" | "vent" | "louvre";
  operation?: "fixed" | "sliding" | "casement" | "awning";
};

export type HousePlanTemplateReferenceZone = {
  id: string;
  label: string;
  kind: "exterior" | "structural";
  width: number;
  depth: number;
  x: number;
  z: number;
  locked?: boolean;
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
  /** Address-library primary action: preserve the current design before applying. */
  startAsNewDesign?: boolean;
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
  realLifeChecks: string[];
  rooms: HousePlanTemplateRoom[];
  doorways: HousePlanTemplateDoorway[];
  windows: HousePlanTemplateWindow[];
  referenceZones?: HousePlanTemplateReferenceZone[];
  furnishingPacks: HousePlanTemplateFurnishingPack[];
  canonical?: {
    document: FloorPlanDocumentV2;
    revisionId: string;
    geometryHash: string;
    verificationTier: FloorPlanDocumentV2["verification"]["tier"];
    addressTransform: FloorPlanAddressTransform;
    addressBinding: PersistedFloorPlanAddressBinding;
  };
};

const HOUSE_PLAN_TEMPLATE_BASES: Array<Omit<HousePlanTemplate, "furnishingPacks">> = [
  {
    id: "studio",
    label: "Rectangular studio",
    summary: "Open living/sleeping room with a side kitchen and bath core",
    bestFor: "Renters, students, first apartments",
    layoutType: "studio",
    footprint: "compact",
    bedroomCount: 0,
    tags: ["studio", "compact", "service core", "open room"],
    zones: ["Sleep/living wall", "Kitchenette run", "Entry drop zone", "Bathroom core"],
    realLifeChecks: ["Exterior light to main room", "Kitchen/bath share service wall", "Plan needs local code review"],
    rooms: [
      {
        id: "living",
        name: "Living / Sleep",
        roomType: "living",
        shape: "rectangle",
        width: 4.2,
        depth: 4.8,
        x: 2.1,
        z: 2.4,
      },
      {
        id: "kitchen",
        name: "Kitchenette",
        roomType: "kitchen",
        shape: "rectangle",
        width: 2.1,
        depth: 2.1,
        x: 5.25,
        z: 1.05,
      },
      {
        id: "entry",
        name: "Entry",
        roomType: "custom",
        shape: "rectangle",
        width: 2.1,
        depth: 1.4,
        x: 5.25,
        z: 2.8,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 2.1,
        depth: 2.2,
        x: 5.25,
        z: 4.6,
      },
    ],
    doorways: [
      { fromRoomId: "entry", toRoomId: "living", wall: "west", offsetMeters: 0 },
      { fromRoomId: "entry", toRoomId: "bathroom", wall: "south", offsetMeters: 0 },
      { fromRoomId: "living", toRoomId: "kitchen", wall: "east", offsetMeters: -1.35, widthMeters: 1.2 },
    ],
    windows: [
      { roomId: "living", wall: "west", offsetMeters: 0, widthMeters: 1.4 },
      { roomId: "kitchen", wall: "east", offsetMeters: -0.2, widthMeters: 0.9 },
    ],
  },
  {
    id: "one_bedroom",
    label: "Compact 1-bed",
    summary: "Entry/service side with open living and a private bedroom",
    bestFor: "Singles, couples, city apartments",
    layoutType: "one_bed",
    footprint: "compact",
    bedroomCount: 1,
    tags: ["1-bed", "compact", "private bedroom", "service side"],
    zones: ["Sofa wall", "Kitchen run", "Entry storage", "Queen bed wall"],
    realLifeChecks: ["Bedroom has exterior wall", "Entry buffers bath from living", "Kitchen/bath service core"],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 4.8,
        depth: 4.2,
        x: 2.4,
        z: 2.1,
      },
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "kitchen",
        shape: "rectangle",
        width: 2.6,
        depth: 2.8,
        x: 6.1,
        z: 1.4,
      },
      {
        id: "entry",
        name: "Entry",
        roomType: "custom",
        shape: "rectangle",
        width: 2.6,
        depth: 1.4,
        x: 6.1,
        z: 3.5,
      },
      {
        id: "bedroom",
        name: "Bedroom",
        roomType: "bedroom",
        shape: "rectangle",
        width: 4,
        depth: 3.6,
        x: 2,
        z: 6,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 2.6,
        depth: 2.2,
        x: 6.1,
        z: 5.3,
      },
    ],
    doorways: [
      { fromRoomId: "entry", toRoomId: "living", wall: "west", offsetMeters: -0.25 },
      { fromRoomId: "entry", toRoomId: "bathroom", wall: "south", offsetMeters: 0 },
      { fromRoomId: "living", toRoomId: "kitchen", wall: "east", offsetMeters: -1 },
      { fromRoomId: "living", toRoomId: "bedroom", wall: "south", offsetMeters: -0.7 },
    ],
    windows: [
      { roomId: "living", wall: "west", offsetMeters: -0.2, widthMeters: 1.4 },
      { roomId: "bedroom", wall: "south", offsetMeters: 0, widthMeters: 1.2 },
      { roomId: "kitchen", wall: "east", offsetMeters: -0.4, widthMeters: 0.8 },
    ],
  },
  {
    id: "living_dining",
    label: "Open 1-bed + dining",
    summary: "Wide living/dining room, side kitchen, private bedroom and bath",
    bestFor: "Hosting, couples, open living",
    layoutType: "one_bed",
    footprint: "wide",
    bedroomCount: 1,
    tags: ["1-bed", "open plan", "dining", "wide"],
    zones: ["Conversation zone", "Dining table", "Kitchen run", "Private bedroom"],
    realLifeChecks: ["Open public zone", "Private bedroom edge", "Bath near entry/service side"],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 4.8,
        depth: 4.2,
        x: 2.4,
        z: 2.1,
      },
      {
        id: "dining",
        name: "Dining",
        roomType: "dining",
        shape: "rectangle",
        width: 3,
        depth: 4.2,
        x: 6.3,
        z: 2.1,
      },
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "kitchen",
        shape: "rectangle",
        width: 2.8,
        depth: 2.8,
        x: 9.2,
        z: 1.4,
      },
      {
        id: "entry",
        name: "Entry",
        roomType: "custom",
        shape: "rectangle",
        width: 2.8,
        depth: 1.4,
        x: 9.2,
        z: 3.5,
      },
      {
        id: "bedroom",
        name: "Bedroom",
        roomType: "bedroom",
        shape: "rectangle",
        width: 4,
        depth: 3.6,
        x: 2,
        z: 6,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 3,
        depth: 2.2,
        x: 6.3,
        z: 5.3,
      },
    ],
    doorways: [
      { fromRoomId: "entry", toRoomId: "kitchen", wall: "north", offsetMeters: 0 },
      { fromRoomId: "kitchen", toRoomId: "dining", wall: "west", offsetMeters: -0.2, widthMeters: 1.2 },
      { fromRoomId: "dining", toRoomId: "living", wall: "west", offsetMeters: 0, widthMeters: 1.4 },
      { fromRoomId: "living", toRoomId: "bedroom", wall: "south", offsetMeters: -0.5 },
      { fromRoomId: "dining", toRoomId: "bathroom", wall: "south", offsetMeters: -1 },
    ],
    windows: [
      { roomId: "living", wall: "west", offsetMeters: 0, widthMeters: 1.5 },
      { roomId: "dining", wall: "north", offsetMeters: 0, widthMeters: 1.2 },
      { roomId: "bedroom", wall: "south", offsetMeters: 0, widthMeters: 1.2 },
    ],
  },
  {
    id: "compact_two_bed",
    label: "Roommate 2-bed",
    summary: "Two similar bedrooms with a shared hall bath and compact living area",
    bestFor: "Roommates, students, shared rentals",
    layoutType: "two_bed",
    footprint: "compact",
    bedroomCount: 2,
    tags: ["2-bed", "roommates", "compact", "shared bath"],
    zones: ["Shared living", "Compact kitchen", "Equal bedrooms", "Hall bath"],
    realLifeChecks: ["Similar bedroom sizes", "Shared bath off circulation", "Separate bedroom window walls"],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 4.6,
        depth: 3.8,
        x: 2.3,
        z: 1.9,
      },
      {
        id: "kitchen",
        name: "Kitchen",
        roomType: "kitchen",
        shape: "rectangle",
        width: 2.8,
        depth: 2.4,
        x: 6,
        z: 1.2,
      },
      {
        id: "entry",
        name: "Entry",
        roomType: "custom",
        shape: "rectangle",
        width: 2.8,
        depth: 1.4,
        x: 6,
        z: 3.1,
      },
      {
        id: "bedroom",
        name: "Bedroom",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3.2,
        depth: 3.2,
        x: 1.6,
        z: 5.4,
      },
      {
        id: "bedroom_2",
        name: "Bedroom 2",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3.2,
        depth: 3.2,
        x: 7.2,
        z: 5.4,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 2.4,
        depth: 2.2,
        x: 4.4,
        z: 4.9,
      },
    ],
    doorways: [
      { fromRoomId: "entry", toRoomId: "living", wall: "west", offsetMeters: -0.2 },
      { fromRoomId: "entry", toRoomId: "bathroom", wall: "south", offsetMeters: 0 },
      { fromRoomId: "living", toRoomId: "kitchen", wall: "east", offsetMeters: -0.9 },
      { fromRoomId: "living", toRoomId: "bedroom", wall: "south", offsetMeters: -0.6 },
      { fromRoomId: "entry", toRoomId: "bedroom_2", wall: "south", offsetMeters: 0.7 },
    ],
    windows: [
      { roomId: "living", wall: "west", offsetMeters: -0.2, widthMeters: 1.3 },
      { roomId: "bedroom", wall: "south", offsetMeters: 0, widthMeters: 1 },
      { roomId: "bedroom_2", wall: "east", offsetMeters: 0, widthMeters: 1 },
      { roomId: "kitchen", wall: "east", offsetMeters: -0.2, widthMeters: 0.8 },
    ],
  },
  {
    id: "three_room_flat",
    label: "Family 2-bed flat",
    summary: "Public front rooms with a short hall to bedrooms and bath",
    bestFor: "Small families, couples with kids",
    layoutType: "flat",
    footprint: "wide",
    bedroomCount: 2,
    tags: ["family", "2-bed", "hall bath", "separated rooms"],
    zones: ["Family sofa wall", "Kitchen dining", "Bedroom storage", "Short hall"],
    realLifeChecks: ["Short private hall", "Family living at front", "Both bedrooms on exterior walls"],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        roomType: "living",
        shape: "rectangle",
        width: 4.8,
        depth: 4.2,
        x: 2.4,
        z: 2.1,
      },
      {
        id: "kitchen_dining",
        name: "Kitchen / Dining",
        roomType: "kitchen",
        shape: "rectangle",
        width: 3.2,
        depth: 4.2,
        x: 6.4,
        z: 2.1,
      },
      {
        id: "hall",
        name: "Hall",
        roomType: "custom",
        shape: "rectangle",
        width: 1.6,
        depth: 3.4,
        x: 4,
        z: 5.9,
      },
      {
        id: "bedroom",
        name: "Bedroom",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3.2,
        depth: 3.4,
        x: 1.6,
        z: 5.9,
      },
      {
        id: "bedroom_2",
        name: "Bedroom 2",
        roomType: "bedroom",
        shape: "rectangle",
        width: 3.2,
        depth: 3.4,
        x: 6.4,
        z: 5.9,
      },
      {
        id: "bathroom",
        name: "Bathroom",
        roomType: "toilet",
        shape: "rectangle",
        width: 1.6,
        depth: 2.4,
        x: 4,
        z: 8.8,
      },
    ],
    doorways: [
      { fromRoomId: "living", toRoomId: "kitchen_dining", wall: "east", offsetMeters: 0 },
      { fromRoomId: "living", toRoomId: "hall", wall: "south", offsetMeters: 1.4 },
      { fromRoomId: "hall", toRoomId: "bedroom", wall: "west", offsetMeters: 0 },
      { fromRoomId: "hall", toRoomId: "bedroom_2", wall: "east", offsetMeters: 0 },
      { fromRoomId: "hall", toRoomId: "bathroom", wall: "south", offsetMeters: 0 },
    ],
    windows: [
      { roomId: "living", wall: "west", offsetMeters: 0, widthMeters: 1.4 },
      { roomId: "kitchen_dining", wall: "east", offsetMeters: -0.2, widthMeters: 1 },
      { roomId: "bedroom", wall: "west", offsetMeters: 0, widthMeters: 1 },
      { roomId: "bedroom_2", wall: "east", offsetMeters: 0, widthMeters: 1 },
    ],
  },
  {
    id: "l_shaped_studio",
    label: "Studio with sleep nook",
    summary: "L-shaped studio with entry/service core and recessed sleep zone",
    bestFor: "Renters who want separation without a full bedroom",
    layoutType: "studio",
    footprint: "corner",
    bedroomCount: 0,
    tags: ["studio", "sleep nook", "open plan", "corner"],
    zones: ["Sleep nook", "Sofa wall", "Kitchenette wall", "Entry storage"],
    realLifeChecks: ["Recessed sleep zone", "Entry/service core", "Main room and nook get exterior light"],
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
    windows: [
      { roomId: "living", wall: "west", offsetMeters: -0.3, widthMeters: 1.2 },
      { roomId: "sleep_nook", wall: "south", offsetMeters: 0, widthMeters: 0.9 },
      { roomId: "kitchen", wall: "east", offsetMeters: 0, widthMeters: 0.8 },
    ],
  },
  {
    id: "narrow_one_bed",
    label: "Narrow city 1-bed",
    summary: "Long public-to-private plan with galley kitchen and side bath",
    bestFor: "City apartments and converted narrow units",
    layoutType: "one_bed",
    footprint: "narrow",
    bedroomCount: 1,
    tags: ["1-bed", "narrow", "city", "separated rooms"],
    zones: ["Long sofa wall", "Galley kitchen", "Entry storage", "Bedroom storage wall"],
    realLifeChecks: ["Linear circulation", "Galley/service side", "Living and bedroom have end-wall light"],
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
    windows: [
      { roomId: "living", wall: "west", offsetMeters: 0, widthMeters: 1 },
      { roomId: "bedroom", wall: "south", offsetMeters: 0, widthMeters: 1 },
      { roomId: "kitchen", wall: "east", offsetMeters: -0.2, widthMeters: 0.7 },
    ],
  },
  {
    id: "corner_one_bed",
    label: "Corner 1-bed",
    summary: "Corner living room with side service core, bedroom, and work nook",
    bestFor: "Work-from-home couples",
    layoutType: "one_bed",
    footprint: "corner",
    bedroomCount: 1,
    tags: ["1-bed", "corner", "work nook", "separated rooms"],
    zones: ["Corner sofa", "Desk nook", "Queen bed wall", "Kitchen wall"],
    realLifeChecks: ["Work nook off entry", "Corner living light", "Bath does not control access"],
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
        width: 2.8,
        depth: 2,
        x: 7.2,
        z: 5,
      },
    ],
    doorways: [
      { fromRoomId: "entry", toRoomId: "living", wall: "west", offsetMeters: -0.2 },
      { fromRoomId: "entry", toRoomId: "kitchen", wall: "north", offsetMeters: 0 },
      { fromRoomId: "living", toRoomId: "bedroom", wall: "south", offsetMeters: -0.6 },
      { fromRoomId: "entry", toRoomId: "bathroom", wall: "south", offsetMeters: -0.7 },
      { fromRoomId: "entry", toRoomId: "study", wall: "south", offsetMeters: 1 },
    ],
    windows: [
      { roomId: "living", wall: "west", offsetMeters: 0, widthMeters: 1.3 },
      { roomId: "bedroom", wall: "south", offsetMeters: 0, widthMeters: 1 },
      { roomId: "study", wall: "east", offsetMeters: 0, widthMeters: 0.8 },
    ],
  },
  {
    id: "adu_guest_house",
    label: "ADU / guest house",
    summary: "Detached small home with entry hall, bedroom, and compact service core",
    bestFor: "Backyard rentals or guests",
    layoutType: "adu",
    footprint: "compact",
    bedroomCount: 1,
    tags: ["ADU", "guest", "rental", "separated rooms"],
    zones: ["Sleeper sofa option", "Kitchen wall", "Entry hall", "Guest bed wall"],
    realLifeChecks: ["Detached-unit footprint", "Entry hall to bath/bed", "Public and private rooms get windows"],
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
        depth: 1.8,
        x: 4.6,
        z: 6.5,
      },
      {
        id: "entry",
        name: "Entry Hall",
        roomType: "custom",
        shape: "rectangle",
        width: 2.4,
        depth: 1.8,
        x: 4.6,
        z: 4.7,
      },
    ],
    doorways: [
      { fromRoomId: "living", toRoomId: "kitchen", wall: "east", offsetMeters: 0, widthMeters: 1.2 },
      { fromRoomId: "living", toRoomId: "bedroom", wall: "south", offsetMeters: -0.7 },
      { fromRoomId: "kitchen", toRoomId: "entry", wall: "south", offsetMeters: -0.4 },
      { fromRoomId: "entry", toRoomId: "bedroom", wall: "west", offsetMeters: 0 },
      { fromRoomId: "entry", toRoomId: "bathroom", wall: "south", offsetMeters: 0 },
    ],
    windows: [
      { roomId: "living", wall: "west", offsetMeters: 0, widthMeters: 1.2 },
      { roomId: "kitchen", wall: "east", offsetMeters: -0.2, widthMeters: 0.8 },
      { roomId: "bedroom", wall: "south", offsetMeters: 0, widthMeters: 1 },
      { roomId: "bathroom", wall: "east", offsetMeters: 0, widthMeters: 0.6 },
    ],
  },
  {
    id: "small_condo",
    label: "Small condo",
    summary: "Open living/kitchen with separate bedroom, bath, and den",
    bestFor: "Condo owners",
    layoutType: "one_bed",
    footprint: "wide",
    bedroomCount: 1,
    tags: ["condo", "den", "1-bed", "separated rooms"],
    zones: ["Island dining", "Media wall", "Den desk", "Bedroom storage"],
    realLifeChecks: ["Den can become office/guest zone", "Service core near entry", "Bedroom has exterior light"],
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
      { fromRoomId: "entry", toRoomId: "bathroom", wall: "south", offsetMeters: -0.7 },
      { fromRoomId: "entry", toRoomId: "den", wall: "south", offsetMeters: 0.9 },
    ],
    windows: [
      { roomId: "living", wall: "west", offsetMeters: 0, widthMeters: 1.3 },
      { roomId: "bedroom", wall: "south", offsetMeters: 0, widthMeters: 1 },
      { roomId: "den", wall: "east", offsetMeters: 0, widthMeters: 0.8 },
      { roomId: "kitchen", wall: "east", offsetMeters: -0.2, widthMeters: 0.8 },
    ],
  },
  {
    id: "hdb_two_room",
    label: "HDB-style 2-room",
    summary: "Compact flat with flexible living, kitchen/service yard, bedroom, and bath",
    bestFor: "Compact flat planning",
    layoutType: "flat",
    footprint: "compact",
    bedroomCount: 1,
    tags: ["flat", "HDB-style", "compact", "separated rooms"],
    zones: ["Flexible living", "Kitchen/dining", "Utility storage", "Bedroom wall"],
    realLifeChecks: ["Utility yard off kitchen", "Compact flat service core", "Living and bedroom have exterior light"],
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
        z: 4.9,
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
      { fromRoomId: "kitchen", toRoomId: "bathroom", wall: "south", offsetMeters: -0.7 },
      { fromRoomId: "kitchen", toRoomId: "utility", wall: "south", offsetMeters: 0.7 },
    ],
    windows: [
      { roomId: "living", wall: "west", offsetMeters: 0, widthMeters: 1.2 },
      { roomId: "bedroom", wall: "south", offsetMeters: 0, widthMeters: 1 },
      { roomId: "kitchen", wall: "east", offsetMeters: -0.2, widthMeters: 0.8 },
      { roomId: "utility", wall: "east", offsetMeters: 0, widthMeters: 0.6 },
    ],
  },
  {
    id: "family_two_bed",
    label: "Family 2-bed",
    summary: "Family plan with living/dining front and separate bedroom wing",
    bestFor: "Small families",
    layoutType: "two_bed",
    footprint: "wide",
    bedroomCount: 2,
    tags: ["family", "2-bed", "dining", "separated rooms"],
    zones: ["Family sofa", "Dining table", "Kids room", "Primary bed"],
    realLifeChecks: ["Bedroom wing separated from kitchen", "Family-scale dining", "Both bedrooms have exterior light"],
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
      { fromRoomId: "entry", toRoomId: "dining", wall: "west", offsetMeters: 0 },
      { fromRoomId: "entry", toRoomId: "bathroom", wall: "south", offsetMeters: 0 },
      { fromRoomId: "kitchen", toRoomId: "dining", wall: "west", offsetMeters: -0.2 },
      { fromRoomId: "dining", toRoomId: "living", wall: "west", offsetMeters: 0 },
      { fromRoomId: "living", toRoomId: "bedroom", wall: "south", offsetMeters: -0.6 },
      { fromRoomId: "dining", toRoomId: "bedroom_2", wall: "south", offsetMeters: -0.9 },
    ],
    windows: [
      { roomId: "living", wall: "west", offsetMeters: 0, widthMeters: 1.4 },
      { roomId: "dining", wall: "north", offsetMeters: 0, widthMeters: 1 },
      { roomId: "bedroom", wall: "west", offsetMeters: 0, widthMeters: 1 },
      { roomId: "bedroom_2", wall: "south", offsetMeters: 0, widthMeters: 1 },
      { roomId: "kitchen", wall: "east", offsetMeters: -0.2, widthMeters: 0.8 },
    ],
  },
  {
    id: "railroad_apartment",
    label: "Railroad 1-bed",
    summary: "Long older-apartment sequence with service rooms off the middle",
    bestFor: "Long narrow older units",
    layoutType: "one_bed",
    footprint: "long",
    bedroomCount: 1,
    tags: ["railroad", "long", "narrow", "older apartment"],
    zones: ["Front sitting room", "Pass-through dining", "Kitchen wall", "Rear bedroom"],
    realLifeChecks: ["Older-unit room sequence", "Service rooms off middle", "Best treated as renovation concept"],
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
    windows: [
      { roomId: "living", wall: "north", offsetMeters: 0, widthMeters: 1 },
      { roomId: "dining", wall: "west", offsetMeters: 0, widthMeters: 0.8 },
      { roomId: "bedroom", wall: "south", offsetMeters: 0, widthMeters: 1 },
      { roomId: "kitchen", wall: "west", offsetMeters: 0, widthMeters: 0.8 },
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
  floorElevationMm?: number;
  floorStoreyHeightMm?: number;
  floorSlabThicknessMm?: number;
  shape: RoomPlanShape;
  polygon?: Array<{ x: number; z: number }>;
  holes?: Array<Array<{ x: number; z: number }>>;
  surfaces?: RoomSurfaceFinishes;
  surfaceFinishes?: RoomSurfaceFinishes;
  surfaceOpacity?: RoomSurfaceOpacity;
  slabThickness?: number;
  wallThickness?: number;
  height?: number;
  wallHeights?: Record<string, number>;
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

/**
 * Resolves a room's world-space finished-floor elevation. Canonical imports
 * carry an exact millimetre elevation and always win; the historical display
 * spacing remains only for non-canonical snapshots in stacked-floor mode.
 */
export function resolveHouseRoomFloorElevationMeters(
  room: HousePlanRoom2D,
  wallHeightMeters: number,
  stackedFloors: boolean
): number {
  const canonicalElevation = resolveCanonicalFloorElevationMeters(room);
  if (canonicalElevation !== null) return canonicalElevation;
  if (!stackedFloors) return 0;
  const level =
    typeof room.floorLevel === "number" && Number.isFinite(room.floorLevel)
      ? room.floorLevel
      : 1;
  return (
    (level - 1) *
    (wallHeightMeters +
      Math.max(0.08, room.slabThickness ?? ROOM_DIMENSION_DEFAULTS.slabThickness) +
      0.28)
  );
}

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

export type HouseRoomMoveStatus = "free" | "snapped" | "blocked";
export type HouseRoomStructuralStatus = "attached" | "detached" | "disconnected_group";

export type HouseRoomMoveResult = {
  x: number;
  z: number;
  attemptedX: number;
  attemptedZ: number;
  movementStatus: HouseRoomMoveStatus;
  structuralStatus: HouseRoomStructuralStatus;
  snapPreview: HouseRoomSnapPreview | null;
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
  roomIds: string[];
  roomNames: string[];
  sharedWallLengthMeters: number;
  status: "connected" | "needs_doorway" | "detached" | "disconnected_group";
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

export function resolveHouseRoomDimension(
  value: unknown,
  fallback: number
): number {
  // Manual room creation keeps the friendlier 1.8 m minimum, but imported and
  // persisted plans legitimately contain narrow baths, shelters, and passages.
  const storedDimensionMinimumMeters = 0.45;
  const numericValue = Number(value);
  if (
    Number.isFinite(numericValue) &&
    numericValue >= storedDimensionMinimumMeters &&
    numericValue <= ROOM_DIMENSION_DEFAULTS.max
  ) {
    return numericValue;
  }

  const numericFallback = Number(fallback);
  if (
    Number.isFinite(numericFallback) &&
    numericFallback >= storedDimensionMinimumMeters &&
    numericFallback <= ROOM_DIMENSION_DEFAULTS.max
  ) {
    return numericFallback;
  }

  return ROOM_DIMENSION_DEFAULTS.width;
}

export function getRoomTypeLabel(roomType: RoomType): string {
  return ROOM_TYPE_LABELS[roomType] ?? "Room";
}

export function resolveNewRoomName(rooms: RoomSnapshot[], roomType: RoomType): string {
  const roomTypeCount = rooms.filter((room) => room.roomType === roomType).length;
  const baseName = getRoomTypeLabel(roomType);
  return roomTypeCount > 0 ? `${baseName} ${roomTypeCount + 1}` : baseName;
}

function mergeRoomSurfaceFinishes(
  surfaces: RoomSurfaceFinishes | undefined,
  surfaceFinishes: RoomSurfaceFinishes | undefined
): RoomSurfaceFinishes | undefined {
  if (!surfaces && !surfaceFinishes) return undefined;

  const base = surfaceFinishes ?? {};
  const next = surfaces ?? {};
  const baseWalls = base.walls;
  const nextWalls = next.walls;
  const mergedWalls =
    baseWalls || nextWalls
      ? {
          ...baseWalls,
          ...nextWalls,
          default:
            baseWalls?.default || nextWalls?.default
              ? {
                  ...baseWalls?.default,
                  ...nextWalls?.default,
                }
              : undefined,
          faces:
            baseWalls?.faces || nextWalls?.faces
              ? Object.fromEntries(
                  Array.from(
                    new Set([
                      ...Object.keys(baseWalls?.faces ?? {}),
                      ...Object.keys(nextWalls?.faces ?? {}),
                    ])
                  ).map((faceId) => [
                    faceId,
                    {
                      ...baseWalls?.faces?.[faceId],
                      ...nextWalls?.faces?.[faceId],
                    },
                  ])
                )
              : undefined,
        }
      : undefined;

  return {
    ...base,
    ...next,
    ...(mergedWalls ? { walls: mergedWalls } : {}),
  };
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
    const roomSurfaces = mergeRoomSurfaceFinishes(room.surfaces, room.surfaceFinishes);
    const w = resolveHouseRoomDimension(room.geometry.width, ROOM_DIMENSION_DEFAULTS.width);
    const d = resolveHouseRoomDimension(room.geometry.depth, ROOM_DIMENSION_DEFAULTS.depth);
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
      ...(typeof room.floorElevationMm === "number" && Number.isInteger(room.floorElevationMm)
        ? { floorElevationMm: room.floorElevationMm }
        : {}),
      ...(typeof room.floorStoreyHeightMm === "number" && Number.isInteger(room.floorStoreyHeightMm)
        ? { floorStoreyHeightMm: room.floorStoreyHeightMm }
        : {}),
      ...(typeof room.floorSlabThicknessMm === "number" && Number.isInteger(room.floorSlabThicknessMm)
        ? { floorSlabThicknessMm: room.floorSlabThicknessMm }
        : {}),
      shape: room.planShape ?? "rectangle",
      ...(room.planPolygon ? { polygon: room.planPolygon } : {}),
      ...(room.planHoles?.length ? { holes: room.planHoles } : {}),
      ...(roomSurfaces ? { surfaces: roomSurfaces } : {}),
      ...(roomSurfaces ? { surfaceFinishes: roomSurfaces } : {}),
      ...(room.surfaceOpacity ? { surfaceOpacity: room.surfaceOpacity } : {}),
      slabThickness:
        typeof room.floorSlabThicknessMm === "number" && Number.isInteger(room.floorSlabThicknessMm)
          ? room.floorSlabThicknessMm / 1000
          : typeof room.geometry.slabThickness === "number" && Number.isFinite(room.geometry.slabThickness)
          ? room.geometry.slabThickness
          : ROOM_DIMENSION_DEFAULTS.slabThickness,
      wallThickness:
        typeof room.geometry.wallThickness === "number" && Number.isFinite(room.geometry.wallThickness)
          ? room.geometry.wallThickness
          : ROOM_DIMENSION_DEFAULTS.wallThickness,
      height:
        typeof room.geometry.height === "number" && Number.isFinite(room.geometry.height)
          ? room.geometry.height
          : ROOM_DIMENSION_DEFAULTS.roomHeight,
      ...(room.geometry.wallHeights ? { wallHeights: room.geometry.wallHeights } : {}),
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

type HouseRoomPlanPoint = { x: number; z: number };

function getHouseRoomPlanPolygon(
  room: HousePlanRoom2D,
  x = room.x,
  z = room.z,
  w = room.w,
  d = room.d
): HouseRoomPlanPoint[] {
  if (room.shape === "custom_polygon" && room.polygon && room.polygon.length >= 3) {
    return room.polygon.map((point) => ({
      x: x + point.x,
      z: z + point.z,
    }));
  }

  const left = x - w / 2;
  const right = x + w / 2;
  const top = z - d / 2;
  const bottom = z + d / 2;
  if (room.shape === "l_shape") {
    const notchW = w * 0.42;
    const notchD = d * 0.42;
    return [
      { x: left, z: top },
      { x: right, z: top },
      { x: right, z: bottom - notchD },
      { x: right - notchW, z: bottom - notchD },
      { x: right - notchW, z: bottom },
      { x: left, z: bottom },
    ];
  }
  return [
    { x: left, z: top },
    { x: right, z: top },
    { x: right, z: bottom },
    { x: left, z: bottom },
  ];
}

function pointOnPlanSegment(
  point: HouseRoomPlanPoint,
  start: HouseRoomPlanPoint,
  end: HouseRoomPlanPoint,
  tolerance = 1e-7
): boolean {
  const cross =
    (end.x - start.x) * (point.z - start.z) -
    (end.z - start.z) * (point.x - start.x);
  if (Math.abs(cross) > tolerance) return false;
  return (
    point.x >= Math.min(start.x, end.x) - tolerance &&
    point.x <= Math.max(start.x, end.x) + tolerance &&
    point.z >= Math.min(start.z, end.z) - tolerance &&
    point.z <= Math.max(start.z, end.z) + tolerance
  );
}

function pointInsidePlanPolygon(
  point: HouseRoomPlanPoint,
  polygon: HouseRoomPlanPoint[]
): boolean {
  for (let index = 0; index < polygon.length; index += 1) {
    if (
      pointOnPlanSegment(
        point,
        polygon[index],
        polygon[(index + 1) % polygon.length]
      )
    ) {
      return false;
    }
  }

  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (
      (currentPoint.z > point.z) !== (previousPoint.z > point.z) &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.z - currentPoint.z)) /
          (previousPoint.z - currentPoint.z) +
          currentPoint.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function planSegmentsCross(
  firstStart: HouseRoomPlanPoint,
  firstEnd: HouseRoomPlanPoint,
  secondStart: HouseRoomPlanPoint,
  secondEnd: HouseRoomPlanPoint
): boolean {
  const cross = (
    start: HouseRoomPlanPoint,
    end: HouseRoomPlanPoint,
    point: HouseRoomPlanPoint
  ) =>
    (end.x - start.x) * (point.z - start.z) -
    (end.z - start.z) * (point.x - start.x);
  return (
    cross(firstStart, firstEnd, secondStart) *
      cross(firstStart, firstEnd, secondEnd) <
      -1e-8 &&
    cross(secondStart, secondEnd, firstStart) *
      cross(secondStart, secondEnd, firstEnd) <
      -1e-8
  );
}

function planPolygonsOverlap(
  first: HouseRoomPlanPoint[],
  second: HouseRoomPlanPoint[]
): boolean {
  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    const firstStart = first[firstIndex];
    const firstEnd = first[(firstIndex + 1) % first.length];
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      if (
        planSegmentsCross(
          firstStart,
          firstEnd,
          second[secondIndex],
          second[(secondIndex + 1) % second.length]
        )
      ) {
        return true;
      }
    }
  }

  const samplePoints = (polygon: HouseRoomPlanPoint[]) => [
    ...polygon,
    ...polygon.map((point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return { x: (point.x + next.x) / 2, z: (point.z + next.z) / 2 };
    }),
  ];
  return (
    samplePoints(first).some((point) => pointInsidePlanPolygon(point, second)) ||
    samplePoints(second).some((point) => pointInsidePlanPolygon(point, first))
  );
}

function getHouseRoomFloorLevel(room: Pick<HousePlanRoom2D, "floorLevel">): number {
  return typeof room.floorLevel === "number" && Number.isFinite(room.floorLevel)
    ? room.floorLevel
    : 1;
}

function areHouseRoomsOnSameFloor(
  first: Pick<HousePlanRoom2D, "floorLevel">,
  second: Pick<HousePlanRoom2D, "floorLevel">
): boolean {
  return getHouseRoomFloorLevel(first) === getHouseRoomFloorLevel(second);
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
  const moving = rooms.find((entry) => entry.id === roomId);

  return rooms.some((room) => {
    if (room.id === roomId) return false;
    if (moving && !areHouseRoomsOnSameFloor(moving, room)) return false;

    const other = getHouseRoomBounds(room.x, room.z, room.w, room.d);
    const boundsOverlap =
      candidate.left < other.right - tolerance &&
      candidate.right > other.left + tolerance &&
      candidate.top < other.bottom - tolerance &&
      candidate.bottom > other.top + tolerance;
    if (!boundsOverlap) return false;
    if (
      (!moving || moving.shape === "rectangle") &&
      room.shape === "rectangle"
    ) {
      return true;
    }

    const candidatePolygon = moving
      ? getHouseRoomPlanPolygon(moving, x, z, w, d)
      : [
          { x: candidate.left, z: candidate.top },
          { x: candidate.right, z: candidate.top },
          { x: candidate.right, z: candidate.bottom },
          { x: candidate.left, z: candidate.bottom },
        ];
    return planPolygonsOverlap(candidatePolygon, getHouseRoomPlanPolygon(room));
  });
}

export function resolveHouseRoomDimensionEditPlacement(
  roomId: string,
  axis: "width" | "depth",
  width: number,
  depth: number,
  rooms: HousePlanRoom2D[]
): { x: number; z: number } | null {
  const room = rooms.find((entry) => entry.id === roomId);
  if (!room) return null;

  const widthDelta = width - room.w;
  const depthDelta = depth - room.d;
  const candidates =
    axis === "width"
      ? [
          { x: room.x, z: room.z },
          { x: room.x + widthDelta / 2, z: room.z },
          { x: room.x - widthDelta / 2, z: room.z },
        ]
      : [
          { x: room.x, z: room.z },
          { x: room.x, z: room.z + depthDelta / 2 },
          { x: room.x, z: room.z - depthDelta / 2 },
        ];

  const placement = candidates.find(
    (candidate) =>
      !doesHouseRoomOverlap(roomId, candidate.x, candidate.z, width, depth, rooms)
  );

  if (!placement) return null;

  return {
    x: roundPlanCoordinate(placement.x),
    z: roundPlanCoordinate(placement.z),
  };
}

export function resolveHouseRoomResizePlacement(
  roomId: string,
  width: number,
  depth: number,
  rooms: HousePlanRoom2D[]
): { x: number; z: number } | null {
  const room = rooms.find((entry) => entry.id === roomId);
  if (!room) return null;

  const xShifts = [0, (width - room.w) / 2, (room.w - width) / 2];
  const zShifts = [0, (depth - room.d) / 2, (room.d - depth) / 2];
  const candidates = xShifts.flatMap((xShift) =>
    zShifts.map((zShift) => ({ x: room.x + xShift, z: room.z + zShift }))
  );
  const placement = candidates.find(
    (candidate) =>
      !doesHouseRoomOverlap(roomId, candidate.x, candidate.z, width, depth, rooms)
  );

  return placement
    ? { x: roundPlanCoordinate(placement.x), z: roundPlanCoordinate(placement.z) }
    : null;
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
  snapDistance = HOUSE_ROOM_WALL_SNAP_DISTANCE_METERS
): { x: number; z: number } | null {
  const moving = rooms.find((room) => room.id === roomId);
  if (!moving) return null;

  let nextX = x;
  let nextZ = z;
  const alignmentSnapDistance = Math.max(snapDistance * 2.5, 0.45);

  for (const other of rooms) {
    if (other.id === roomId) continue;
    if (!areHouseRoomsOnSameFloor(moving, other)) continue;

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

export type HouseRoomConnectivityReport = {
  roomCount: number;
  components: string[][];
  detachedRoomIds: string[];
  disconnectedGroups: string[][];
};

export function buildHouseRoomConnectivityReport(
  rooms: HousePlanRoom2D[]
): HouseRoomConnectivityReport {
  const adjacency = new Map<string, Set<string>>();
  for (const room of rooms) {
    adjacency.set(room.id, new Set());
  }

  for (const guide of buildHouseRoomAdjacencyGuides(rooms)) {
    const [first, second] = guide.roomIds;
    adjacency.get(first)?.add(second);
    adjacency.get(second)?.add(first);
  }

  const visited = new Set<string>();
  const components: string[][] = [];
  for (const room of rooms) {
    if (visited.has(room.id)) continue;
    const stack = [room.id];
    const component: string[] = [];
    visited.add(room.id);

    while (stack.length > 0) {
      const id = stack.pop()!;
      component.push(id);
      for (const next of adjacency.get(id) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }

    components.push(component);
  }

  const detachedRoomIds = rooms.length > 1
    ? components.filter((component) => component.length === 1).flat()
    : [];
  const disconnectedGroups = components.length > 1
    ? components.filter((component) => component.length > 1)
    : [];

  return {
    roomCount: rooms.length,
    components,
    detachedRoomIds,
    disconnectedGroups,
  };
}

function resolveHouseRoomStructuralStatus(
  roomId: string,
  x: number,
  z: number,
  rooms: HousePlanRoom2D[]
): HouseRoomStructuralStatus {
  const moving = rooms.find((room) => room.id === roomId);
  if (!moving) return "attached";
  const sameFloorRooms = rooms
    .filter((room) => room.id === roomId || areHouseRoomsOnSameFloor(room, moving))
    .map((room) => (room.id === roomId ? { ...room, x, z } : room));
  if (sameFloorRooms.length <= 1) return "attached";

  const connectivity = buildHouseRoomConnectivityReport(sameFloorRooms);
  const movingComponent = connectivity.components.find((component) => component.includes(roomId));
  if (!movingComponent || movingComponent.length <= 1) return "detached";
  return connectivity.components.length > 1 ? "disconnected_group" : "attached";
}

export function resolveHouseRoomMove({
  roomId,
  x,
  z,
  rooms,
  snap = true,
  snapDistance = HOUSE_ROOM_WALL_SNAP_DISTANCE_METERS,
}: {
  roomId: string;
  x: number;
  z: number;
  rooms: HousePlanRoom2D[];
  snap?: boolean;
  snapDistance?: number;
}): HouseRoomMoveResult | null {
  const moving = rooms.find((room) => room.id === roomId);
  if (!moving || !Number.isFinite(x) || !Number.isFinite(z)) return null;

  const rawOverlaps = doesHouseRoomOverlap(roomId, x, z, moving.w, moving.d, rooms);
  const nextPosition = snap
    ? snapHouseRoomMove(roomId, x, z, rooms, snapDistance)
    : { x, z };
  if (!nextPosition) return null;

  const nextOverlaps = doesHouseRoomOverlap(
    roomId,
    nextPosition.x,
    nextPosition.z,
    moving.w,
    moving.d,
    rooms
  );
  const snappedToCurrent =
    Math.abs(nextPosition.x - moving.x) < 0.001 &&
    Math.abs(nextPosition.z - moving.z) < 0.001;
  const pointerMovedFromOrigin =
    Math.abs(x - moving.x) > 0.001 || Math.abs(z - moving.z) > 0.001;
  const blocked =
    nextOverlaps ||
    (!snap && rawOverlaps) ||
    (snap && rawOverlaps && snappedToCurrent && pointerMovedFromOrigin);

  if (blocked) {
    return {
      x: moving.x,
      z: moving.z,
      attemptedX: x,
      attemptedZ: z,
      movementStatus: "blocked",
      structuralStatus: resolveHouseRoomStructuralStatus(roomId, moving.x, moving.z, rooms),
      snapPreview: null,
    };
  }

  const snapped =
    snap &&
    (Math.abs(nextPosition.x - x) > 0.001 || Math.abs(nextPosition.z - z) > 0.001);

  return {
    x: nextPosition.x,
    z: nextPosition.z,
    attemptedX: x,
    attemptedZ: z,
    movementStatus: snapped ? "snapped" : "free",
    structuralStatus: resolveHouseRoomStructuralStatus(roomId, nextPosition.x, nextPosition.z, rooms),
    snapPreview: snap ? resolveHouseRoomSnapPreview(roomId, x, z, rooms, snapDistance) : null,
  };
}

export function roundPlanCoordinate(value: number): number {
  return Number(value.toFixed(3));
}

export function resolveHousePlanTemplateOpeningMetrics(
  spanMeters: number,
  requestedWidthMeters: number,
  requestedOffsetMeters = 0
): { widthMeters: number; offsetMeters: number } {
  const safeSpan = Math.max(0, spanMeters);
  const widthMeters = Math.min(Math.max(0, requestedWidthMeters), safeSpan);
  const maxOffsetMeters = Math.max(0, safeSpan / 2 - widthMeters / 2);
  return {
    widthMeters,
    offsetMeters: Math.max(
      -maxOffsetMeters,
      Math.min(maxOffsetMeters, requestedOffsetMeters)
    ),
  };
}

export function buildHouseRoomAdjacencyGuides(
  rooms: HousePlanRoom2D[],
  toleranceMeters = 0.04,
  minSharedWallMeters = 0.45
): HouseRoomAdjacencyGuide[] {
  const guides: HouseRoomAdjacencyGuide[] = [];

  type AxisSegment = {
    orientation: "vertical" | "horizontal";
    fixed: number;
    start: number;
    end: number;
  };
  const roomSegments = (room: HousePlanRoom2D): AxisSegment[] => {
    const polygon = getHouseRoomPlanPolygon(room);
    return polygon.flatMap<AxisSegment>((point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      if (Math.abs(point.x - next.x) <= 0.001) {
        return [
          {
            orientation: "vertical" as const,
            fixed: (point.x + next.x) / 2,
            start: Math.min(point.z, next.z),
            end: Math.max(point.z, next.z),
          },
        ];
      }
      if (Math.abs(point.z - next.z) <= 0.001) {
        return [
          {
            orientation: "horizontal" as const,
            fixed: (point.z + next.z) / 2,
            start: Math.min(point.x, next.x),
            end: Math.max(point.x, next.x),
          },
        ];
      }
      return [];
    });
  };

  for (let i = 0; i < rooms.length; i += 1) {
    const first = rooms[i];
    const firstSegments = roomSegments(first);

    for (let j = i + 1; j < rooms.length; j += 1) {
      const second = rooms[j];
      if (!areHouseRoomsOnSameFloor(first, second)) continue;
      const secondSegments = roomSegments(second);
      let bestGuide: HouseRoomAdjacencyGuide | null = null;

      for (const firstSegment of firstSegments) {
        for (const secondSegment of secondSegments) {
          if (
            firstSegment.orientation !== secondSegment.orientation ||
            Math.abs(firstSegment.fixed - secondSegment.fixed) > toleranceMeters
          ) {
            continue;
          }
          const overlapStart = Math.max(firstSegment.start, secondSegment.start);
          const overlapEnd = Math.min(firstSegment.end, secondSegment.end);
          const overlap = overlapEnd - overlapStart;
          if (overlap < minSharedWallMeters) continue;

          const fixed = roundPlanCoordinate(
            (firstSegment.fixed + secondSegment.fixed) / 2
          );
          const sideSuffix =
            firstSegment.orientation === "vertical"
              ? `${firstSegment.fixed >= first.x ? "east" : "west"}-${
                  secondSegment.fixed >= second.x ? "east" : "west"
                }`
              : `${firstSegment.fixed >= first.z ? "south" : "north"}-${
                  secondSegment.fixed >= second.z ? "south" : "north"
                }`;
          const candidate: HouseRoomAdjacencyGuide =
            firstSegment.orientation === "vertical"
              ? {
                  id: `${first.id}-${second.id}-vertical-${sideSuffix}`,
                  roomIds: [first.id, second.id],
                  orientation: "vertical",
                  points: [
                    [fixed, roundPlanCoordinate(overlapStart)],
                    [fixed, roundPlanCoordinate(overlapEnd)],
                  ],
                  labelPosition: {
                    x: fixed,
                    z: roundPlanCoordinate((overlapStart + overlapEnd) / 2),
                  },
                  lengthMeters: roundPlanCoordinate(overlap),
                }
              : {
                  id: `${first.id}-${second.id}-horizontal-${sideSuffix}`,
                  roomIds: [first.id, second.id],
                  orientation: "horizontal",
                  points: [
                    [roundPlanCoordinate(overlapStart), fixed],
                    [roundPlanCoordinate(overlapEnd), fixed],
                  ],
                  labelPosition: {
                    x: roundPlanCoordinate((overlapStart + overlapEnd) / 2),
                    z: fixed,
                  },
                  lengthMeters: roundPlanCoordinate(overlap),
                };
          if (!bestGuide || candidate.lengthMeters > bestGuide.lengthMeters) {
            bestGuide = candidate;
          }
        }
      }

      if (bestGuide) guides.push(bestGuide);
    }
  }

  return guides;
}

export function resolveHouseRoomSnapPreview(
  roomId: string,
  x: number,
  z: number,
  rooms: HousePlanRoom2D[],
  snapDistance = HOUSE_ROOM_WALL_SNAP_DISTANCE_METERS
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

  const adjacencyItems: HouseRoomConnectionChecklistItem[] = buildHouseRoomAdjacencyGuides(rooms).map((guide) => {
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

  const warningItems: HouseRoomConnectionChecklistItem[] = [];
  const roomsByFloor = new Map<number, HousePlanRoom2D[]>();
  for (const room of rooms) {
    const floorLevel = getHouseRoomFloorLevel(room);
    roomsByFloor.set(floorLevel, [...(roomsByFloor.get(floorLevel) ?? []), room]);
  }

  for (const [floorLevel, floorRooms] of roomsByFloor) {
    const connectivity = buildHouseRoomConnectivityReport(floorRooms);
    for (const roomId of connectivity.detachedRoomIds) {
      const room = floorRooms.find((entry) => entry.id === roomId);
      if (!room) continue;
      warningItems.push({
        id: `floor-${floorLevel}-${roomId}-detached`,
        roomIds: [roomId],
        roomNames: [room.name],
        sharedWallLengthMeters: 0,
        status: "detached",
      });
    }

    for (const group of connectivity.disconnectedGroups) {
      const groupRooms = group
        .map((roomId) => floorRooms.find((entry) => entry.id === roomId))
        .filter((room): room is HousePlanRoom2D => Boolean(room));
      if (groupRooms.length <= 1) continue;
      warningItems.push({
        id: `floor-${floorLevel}-${group.join("-")}-disconnected`,
        roomIds: groupRooms.map((room) => room.id),
        roomNames: groupRooms.map((room) => room.name),
        sharedWallLengthMeters: 0,
        status: "disconnected_group",
      });
    }
  }

  return [...adjacencyItems, ...warningItems];
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
