import type {
  CabinetBOMItem,
  CabinetCutListItem,
  CabinetDefinition,
  CabinetDimensionScheduleItem,
  CabinetDrawingViewScheduleItem,
  CabinetEdgeBandingScheduleItem,
  CabinetFabricationReleaseReadinessSnapshot,
  CabinetHardwareScheduleItem,
  CabinetInstallerNote,
  CabinetMaterialScheduleItem,
  CabinetQuoteSummary,
  CabinetReleaseChecklistItem,
  CabinetSupplierReadinessSnapshot,
  CabinetSupplierSkuMappingItem,
} from "@/features/cabinetry/types";
import type {
  MillworkAssemblyType,
  MillworkAssetManifest,
  MillworkDefinition,
  MillworkHardwareRef,
  MillworkMaterialRef,
} from "@/features/millwork/types";

/**
 * Multi-Room Foundation Types v3
 * 
 * Defines the data model for multi-room designs.
 * Each design contains multiple rooms, each with its own items, zones, and saved views.
 */

export type RoomType = "living" | "bedroom" | "dining" | "kitchen" | "toilet" | "custom";
export type RoomPlanShape = "rectangle" | "l_shape" | "custom_polygon";

export interface RoomGeometry {
  width: number;
  depth: number;
  wallThickness?: number;
  height?: number;
  slabThickness?: number;
  /** Baseboard/skirting projection from the finished wall, in metres. */
  baseboardDepth?: number;
}

export interface RoomPlanPosition {
  x: number;
  z: number;
}

export interface RoomPlanPolygonPoint {
  x: number;
  z: number;
}

export type RoomFloorPattern = "straight" | "herringbone" | "grid" | "checker";

export interface RoomSurfaceAssignments {
  floorMaterialId?: string | null;
  floorRotationDeg?: number;
  floorPattern?: RoomFloorPattern;
  floorScale?: number;
  ceilingColor?: string;
}

export type RoomSurfaceFinishes = RoomSurfaceAssignments;

export interface RoomSurfaceOpacity {
  wall?: number;
  floor?: number;
  ceiling?: number;
}

export interface SavedView {
  id: string;
  name: string;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  timestamp?: number;
}

export type LayoutVersionSource = "manual" | "auto_place" | "ai" | "make_space";

export interface LayoutVersionSummary {
  itemCount: number;
  zoneCount: number;
}

export interface LayoutVersion {
  id: string;
  name: string;
  source: LayoutVersionSource;
  timestamp: number;
  items: DesignItem[];
  zones: ZoneMin[];
  summary: LayoutVersionSummary;
}

export interface PersistedFloorPlanCalibration {
  pixelsPerMeter: number;
  referenceLengthMeters: number;
  referencePointsPx: [
    { x: number; y: number },
    { x: number; y: number },
  ];
}

export interface PersistedFloorPlanUnderlay {
  id: string;
  floorId: string;
  name: string;
  assetUrl: string;
  mimeType: string;
  sourceMimeType?: string;
  renderedPage?: number;
  pageCount?: number;
  widthPx?: number;
  heightPx?: number;
  position: { x: number; z: number };
  widthMeters: number;
  depthMeters: number;
  opacity: number;
  rotationDeg: number;
  locked: boolean;
  calibration?: PersistedFloorPlanCalibration;
}

export interface PersistedPlanOpening {
  id: string;
  roomId?: string;
  wall: "north" | "south" | "east" | "west";
  offsetMm: number;
  widthMm: number;
  heightMm?: number;
  bottomMm?: number;
  kind: "door" | "window";
}

export interface PersistedFloorPlanState {
  underlay?: PersistedFloorPlanUnderlay | null;
  openings?: PersistedPlanOpening[];
}

export interface DesignItem {
  id?: string;
  instanceId: string;
  productId: string;
  variantId: string;
  assetType?: "catalog_item" | "parametric_cabinet";
  roomId?: string;
  assemblyType?: MillworkAssemblyType;
  millworkAssetManifest?: MillworkAssetManifest;
  millworkDefinition?: MillworkDefinition;
  millworkDefinitionVersion?: number;
  millworkMaterials?: MillworkMaterialRef[];
  millworkHardware?: MillworkHardwareRef[];
  name?: string;
  cabinetDefinition?: CabinetDefinition;
  glbAssetUrl?: string;
  bomSnapshot?: CabinetBOMItem[];
  materialScheduleSnapshot?: CabinetMaterialScheduleItem[];
  hardwareScheduleSnapshot?: CabinetHardwareScheduleItem[];
  edgeBandingScheduleSnapshot?: CabinetEdgeBandingScheduleItem[];
  cutListSnapshot?: CabinetCutListItem[];
  dimensionScheduleSnapshot?: CabinetDimensionScheduleItem[];
  drawingViewScheduleSnapshot?: CabinetDrawingViewScheduleItem[];
  installerNotesSnapshot?: CabinetInstallerNote[];
  releaseChecklistSnapshot?: CabinetReleaseChecklistItem[];
  quoteSummarySnapshot?: CabinetQuoteSummary;
  supplierSkuMappingsSnapshot?: CabinetSupplierSkuMappingItem[];
  supplierReadinessSnapshot?: CabinetSupplierReadinessSnapshot;
  fabricationReleaseReadinessSnapshot?: CabinetFabricationReleaseReadinessSnapshot;
  cabinetUpdatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  transform?: {
    position: [number, number, number];
    rotationY?: number;
    rotation?: [number, number, number];
    scale?: [number, number, number];
  };
  configurationCode?: string;
  position: [number, number, number];
  rotationY?: number;
  qty?: number;
  includeInCheckout?: boolean;
  purchaseOptionId?: string;
  bundleGroupId?: string;
  bundleRole?: "primary" | "component";
  bundleQuantity?: number;
  locked?: boolean;
  materialPreset?: string;
  materialOverrides?: {
    roughness?: number;
    metalness?: number;
    colorHex?: string;
  };
  // NO roomId field - items are stored inside room.items[]
}

export interface ZoneMin {
  id: string;
  type: "seating" | "reading" | "tv" | "dining";
  itemIds: string[];
  anchor?: [number, number, number];
  source?: "auto" | "manual";
  // NO roomId field - zones are stored inside room.zones[]
}

export interface RoomSnapshot {
  id: string;
  name: string;
  roomType: RoomType;
  floorLevel?: number;
  floorLabel?: string;
  geometry: RoomGeometry;
  planPosition?: RoomPlanPosition;
  planShape?: RoomPlanShape;
  planPolygon?: RoomPlanPolygonPoint[];
  surfaces?: RoomSurfaceAssignments;
  surfaceFinishes?: RoomSurfaceFinishes;
  surfaceOpacity?: RoomSurfaceOpacity;
  ceilingVisible?: boolean;
  items: DesignItem[];
  zones: ZoneMin[];
  savedViews: SavedView[];
  layoutVersions?: LayoutVersion[];
}

/**
 * Design snapshot v3 - multi-room aware
 * Clean room-scoped architecture
 */
export interface DesignSnapshot {
  version: 3;
  rooms: RoomSnapshot[];
  activeRoomId: string;
  // Design-level metadata
  title?: string;
  style?: string;
  budget?: "budget" | "mid" | "luxury";
  lightingPreset?: string;
  notes?: string;
  floorPlan?: PersistedFloorPlanState;
  // Legacy fields for migration (v1/v2)
  items?: DesignItem[];
  zones?: ZoneMin[];
  savedViews?: SavedView[];
  roomBounds?: RoomGeometry;
}

/**
 * Create a new room with default values
 */
export function createRoom(
  id: string,
  name: string,
  roomType: RoomType = "living",
  geometry: RoomGeometry = { width: 4, depth: 5, wallThickness: 0.2, height: 2.6, slabThickness: 0.1 }
): RoomSnapshot {
  return {
    id,
    name,
    roomType,
    floorLevel: 1,
    floorLabel: "1F",
    geometry,
    planPosition: { x: 0, z: 0 },
    planShape: "rectangle",
    surfaces: {},
    surfaceOpacity: { wall: 1, floor: 1, ceiling: 1 },
    ceilingVisible: true,
    items: [],
    zones: [],
    savedViews: [],
    layoutVersions: [],
  };
}

/**
 * Migrate legacy single-room snapshot (v1/v2) to v3 multi-room format
 * Wraps existing items/zones/savedViews into a single "Living Room"
 */
export function migrateToV3(snapshot: DesignSnapshot): DesignSnapshot {
  // If already v3, return as-is
  if (snapshot.version === 3 && snapshot.rooms && snapshot.rooms.length > 0) {
    return {
      ...snapshot,
      rooms: snapshot.rooms.map((room) => ({
        ...room,
        surfaces: room.surfaces ?? room.surfaceFinishes,
        surfaceFinishes: room.surfaceFinishes ?? room.surfaces,
        items: room.items ?? [],
        zones: room.zones ?? [],
        savedViews: room.savedViews ?? [],
        layoutVersions: room.layoutVersions ?? [],
      })),
    };
  }

  // Create a single room from legacy data
  const geometry: RoomGeometry = {
    width: snapshot.roomBounds?.width ?? 5,
    depth: snapshot.roomBounds?.depth ?? 4,
    wallThickness: snapshot.roomBounds?.wallThickness ?? 0.12,
    height: snapshot.roomBounds?.height ?? 2.6,
    slabThickness: snapshot.roomBounds?.slabThickness ?? 0.1,
  };
  const room: RoomSnapshot = {
    id: "room_living",
    name: "Living Room",
    roomType: "living",
    floorLevel: 1,
    floorLabel: "1F",
    geometry,
    planPosition: { x: 0, z: 0 },
    planShape: "rectangle",
    surfaces: {},
    surfaceOpacity: { wall: 1, floor: 1, ceiling: 1 },
    ceilingVisible: true,
    items: snapshot.items ?? [],
    zones: snapshot.zones ?? [],
    savedViews: snapshot.savedViews ?? [],
    layoutVersions: [],
  };

  return {
    version: 3,
    rooms: [room],
    activeRoomId: room.id,
    title: snapshot.title,
    style: snapshot.style,
    budget: snapshot.budget,
    lightingPreset: snapshot.lightingPreset,
    notes: snapshot.notes,
    floorPlan: snapshot.floorPlan,
  };
}

/**
 * Get the currently active room
 */
export function getActiveRoom(snapshot: DesignSnapshot): RoomSnapshot | null {
  const migrated = migrateToV3(snapshot);
  return migrated.rooms.find((r) => r.id === migrated.activeRoomId) ?? migrated.rooms[0] ?? null;
}

/**
 * Update a room in the snapshot
 */
export function updateRoom(snapshot: DesignSnapshot, updatedRoom: RoomSnapshot): DesignSnapshot {
  const migrated = migrateToV3(snapshot);
  return {
    ...migrated,
    rooms: migrated.rooms.map((r) => (r.id === updatedRoom.id ? updatedRoom : r)),
  };
}

/**
 * Switch to a different room
 * Clears selection and resets UI state (handled by caller)
 */
export function switchRoom(snapshot: DesignSnapshot, roomId: string): DesignSnapshot {
  const migrated = migrateToV3(snapshot);
  if (!migrated.rooms.find((r) => r.id === roomId)) {
    console.warn(`Room ${roomId} not found`);
    return migrated;
  }
  return {
    ...migrated,
    activeRoomId: roomId,
  };
}

/**
 * Add a new room to the design
 */
export function addRoom(snapshot: DesignSnapshot, room: RoomSnapshot): DesignSnapshot {
  const migrated = migrateToV3(snapshot);
  return {
    ...migrated,
    rooms: [...migrated.rooms, room],
  };
}

/**
 * Delete a room from the design (if not the only room)
 */
export function deleteRoom(snapshot: DesignSnapshot, roomId: string): DesignSnapshot {
  const migrated = migrateToV3(snapshot);
  const remaining = migrated.rooms.filter((r) => r.id !== roomId);
  
  if (remaining.length === 0) {
    console.warn("Cannot delete the last room");
    return migrated;
  }

  const nextActiveId =
    migrated.activeRoomId === roomId ? remaining[0].id : migrated.activeRoomId;

  return {
    ...migrated,
    rooms: remaining,
    activeRoomId: nextActiveId,
  };
}
