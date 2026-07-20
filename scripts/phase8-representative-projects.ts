import type { DesignItem, DesignSnapshot, RoomSnapshot, ZoneMin } from "../lib/room-types";

export type Phase8ProjectScale = "small" | "medium" | "large";

export type Phase8RepresentativeProject = {
  scale: Phase8ProjectScale;
  snapshot: DesignSnapshot;
  roomCount: number;
  itemCount: number;
};

const SCALE_CONFIGURATION: Record<
  Phase8ProjectScale,
  { roomCount: number; itemsPerRoom: number; savedViewsPerRoom: number }
> = {
  small: { roomCount: 1, itemsPerRoom: 6, savedViewsPerRoom: 1 },
  medium: { roomCount: 4, itemsPerRoom: 30, savedViewsPerRoom: 3 },
  large: { roomCount: 12, itemsPerRoom: 60, savedViewsPerRoom: 6 },
};

function createItem(roomIndex: number, itemIndex: number): DesignItem {
  const instanceId = `phase8-room-${roomIndex + 1}-item-${itemIndex + 1}`;
  const variantId = itemIndex % 2 === 0 ? "natural" : "charcoal";
  return {
    instanceId,
    productId: `phase8-product-${(itemIndex % 24) + 1}`,
    variantId,
    productSnapshot: {
      schemaVersion: 1,
      productId: `phase8-product-${(itemIndex % 24) + 1}`,
      variantId,
      name: `Representative product ${(itemIndex % 24) + 1}`,
      category: itemIndex % 3 === 0 ? "seating" : itemIndex % 3 === 1 ? "table" : "storage",
      dimensionsMm: {
        w: 600 + (itemIndex % 5) * 100,
        d: 450 + (itemIndex % 4) * 75,
        h: 500 + (itemIndex % 6) * 90,
      },
      variantLabel: variantId === "natural" ? "Natural" : "Charcoal",
      finish: {
        code: variantId,
        label: variantId === "natural" ? "Natural oak" : "Charcoal fabric",
        colorHex: variantId === "natural" ? "#b88b5a" : "#343434",
      },
      assets: {
        assetId: `phase8-asset-${(itemIndex % 24) + 1}`,
        modelUrl: `/models/phase8-product-${(itemIndex % 24) + 1}.glb`,
        thumbnailUrl: `/images/phase8-product-${(itemIndex % 24) + 1}.webp`,
      },
    },
    position: [
      (itemIndex % 10) * 0.72 - 3.2,
      0,
      Math.floor(itemIndex / 10) * 0.78 - 2.1,
    ],
    rotationY: (itemIndex % 8) * (Math.PI / 4),
    includeInCheckout: itemIndex % 4 !== 0,
    locked: itemIndex % 17 === 0,
    createdAt: `2026-07-19T00:${String(itemIndex % 60).padStart(2, "0")}:00.000Z`,
    updatedAt: `2026-07-19T01:${String(itemIndex % 60).padStart(2, "0")}:00.000Z`,
  };
}

function createZones(roomIndex: number, items: readonly DesignItem[]): ZoneMin[] {
  const zoneTypes: ZoneMin["type"][] = ["seating", "reading", "tv", "dining"];
  return Array.from({ length: Math.max(1, Math.ceil(items.length / 15)) }, (_, zoneIndex) => ({
    id: `phase8-room-${roomIndex + 1}-zone-${zoneIndex + 1}`,
    type: zoneTypes[zoneIndex % zoneTypes.length],
    itemIds: items
      .slice(zoneIndex * 5, zoneIndex * 5 + 5)
      .map((item) => item.instanceId),
    anchor: [zoneIndex * 0.5, 0, zoneIndex * 0.4],
    source: zoneIndex % 2 === 0 ? "auto" : "manual",
  }));
}

function createRoom(
  scale: Phase8ProjectScale,
  roomIndex: number,
  itemsPerRoom: number,
  savedViewsPerRoom: number
): RoomSnapshot {
  const items = Array.from({ length: itemsPerRoom }, (_, itemIndex) =>
    createItem(roomIndex, itemIndex)
  );
  return {
    id: `phase8-${scale}-room-${roomIndex + 1}`,
    name: `Representative Room ${roomIndex + 1}`,
    roomType: roomIndex % 3 === 0 ? "living" : roomIndex % 3 === 1 ? "dining" : "bedroom",
    floorLevel: Math.floor(roomIndex / 4) + 1,
    floorLabel: `${Math.floor(roomIndex / 4) + 1}F`,
    floorElevationMm: Math.floor(roomIndex / 4) * 3000,
    geometry: {
      width: 5.5 + (roomIndex % 3) * 0.5,
      depth: 4.4 + (roomIndex % 2) * 0.6,
      wallThickness: 0.12,
      height: 2.7,
      slabThickness: 0.12,
    },
    planPosition: { x: (roomIndex % 4) * 7, z: Math.floor(roomIndex / 4) * 6 },
    planShape: "rectangle",
    surfaces: {
      floorMaterialId: roomIndex % 2 === 0 ? "phase8-oak" : "phase8-stone",
      floorRotationDeg: (roomIndex % 4) * 45,
      wallMaterialId: "phase8-wall-neutral",
      ceilingColor: "#f4f2ec",
    },
    surfaceOpacity: { wall: 1, floor: 1, ceiling: 1 },
    ceilingVisible: true,
    items,
    zones: createZones(roomIndex, items),
    savedViews: Array.from({ length: savedViewsPerRoom }, (_, viewIndex) => ({
      id: `phase8-room-${roomIndex + 1}-view-${viewIndex + 1}`,
      name: `View ${viewIndex + 1}`,
      cameraPosition: [4 + viewIndex, 3.5, 5 - viewIndex * 0.2],
      cameraTarget: [0, 1, 0],
      timestamp: 1_721_344_000_000 + viewIndex * 1_000,
    })),
    layoutVersions: [],
  };
}

export function createPhase8RepresentativeProject(
  scale: Phase8ProjectScale
): Phase8RepresentativeProject {
  const configuration = SCALE_CONFIGURATION[scale];
  const rooms = Array.from({ length: configuration.roomCount }, (_, roomIndex) =>
    createRoom(
      scale,
      roomIndex,
      configuration.itemsPerRoom,
      configuration.savedViewsPerRoom
    )
  );
  const itemCount = rooms.reduce((sum, room) => sum + room.items.length, 0);
  return {
    scale,
    snapshot: {
      version: 3,
      rooms,
      activeRoomId: rooms[0].id,
      title: `Phase 8 ${scale} representative project`,
      style: "modern",
      budget: scale === "large" ? "luxury" : scale === "medium" ? "mid" : "budget",
      lightingPreset: "soft_daylight",
      notes: `Deterministic ${scale} benchmark fixture.`,
      floorPlan: {
        openings: rooms.map((room, roomIndex) => ({
          id: `phase8-opening-${roomIndex + 1}`,
          roomId: room.id,
          wall: roomIndex % 2 === 0 ? "south" : "north",
          offsetMm: 0,
          widthMm: 900,
          heightMm: 2100,
          kind: "door",
        })),
      },
    },
    roomCount: rooms.length,
    itemCount,
  };
}

export function createAllPhase8RepresentativeProjects(): Phase8RepresentativeProject[] {
  return (["small", "medium", "large"] as const).map(createPhase8RepresentativeProject);
}
