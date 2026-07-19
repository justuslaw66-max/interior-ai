import type {
  FloorPlanDocumentV2,
  FloorPlanPropertyEvidenceV2,
} from "@/lib/floor-plan-document-v2";
import type { FloorPlanAddressTransform } from "@/lib/floor-plan-imports/types";
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
  /** Optional per-face wall height overrides, in metres. */
  wallHeights?: Record<string, number>;
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

export type RoomFloorPattern =
  | "straight"
  | "brick"
  | "vertical_brick"
  | "random_stagger"
  | "herringbone"
  | "grid"
  | "checker";

export type RoomSurfaceTargetKind = "floor" | "wall" | "ceiling";
export type SurfacePattern = RoomFloorPattern;

export interface SurfacePatternOffset {
  x: number;
  y: number;
}

export interface SurfaceSettings {
  materialId?: string | null;
  paintColorHex?: string | null;
  paintName?: string | null;
  pattern?: SurfacePattern;
  rotationDeg?: number;
  scale?: number;
  offset?: SurfacePatternOffset;
  jointSizeMm?: number;
  jointColor?: string;
}

export interface RoomSurfaceZone {
  id: string;
  kind: RoomSurfaceTargetKind;
  label?: string;
  faceId?: string;
  points?: Array<{ x: number; z: number }>;
  settings?: SurfaceSettings;
}

export interface RoomWallSurfaceAssignments {
  default?: SurfaceSettings;
  faces?: Record<string, SurfaceSettings>;
}

export interface RoomSurfaceAssignments {
  floor?: SurfaceSettings;
  ceiling?: SurfaceSettings;
  walls?: RoomWallSurfaceAssignments;
  zones?: RoomSurfaceZone[];
  floorMaterialId?: string | null;
  floorRotationDeg?: number;
  floorPattern?: RoomFloorPattern;
  floorScale?: number;
  floorPatternOffset?: { x: number; y: number };
  floorJointSizeMm?: number;
  floorJointColor?: string;
  wallMaterialId?: string | null;
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
  /**
   * SHA-256 of the original private upload (not the rendered PDF preview).
   * Retention cleanup uses this owner-scoped link to remove persisted data-URL
   * copies without touching the rest of the saved design.
   */
  sourceAssetSha256?: string;
  /** Import-job link when the underlay was attached by an import workflow. */
  sourceJobId?: string;
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
  doorStyle?: "swing" | "sliding" | "folding" | "open";
  canonicalWallId?: string;
  operation?: "swing" | "sliding" | "folding" | "fixed" | "open";
  evidence?: {
    height?: FloorPlanPropertyEvidenceV2;
    sillHeight?: FloorPlanPropertyEvidenceV2;
  };
}

export interface PersistedPlanFixedElement {
  id: string;
  kind:
    | "kitchen_counter"
    | "island"
    | "wardrobe"
    | "window"
    | "door"
    | "reference_zone";
  xMm: number;
  zMm: number;
  widthMm: number;
  depthMm: number;
  rotationDeg: number;
  label?: string;
  locked?: boolean;
  canonicalKind?: string;
}

/**
 * Immutable copy of the address-library binding selected by the consumer.
 *
 * Binding rows belong to immutable revisions, so a later correction receives
 * a new row ID. The normalized address/stack/range tuple lets the application
 * discover that newer row without changing the saved design in place.
 */
export interface PersistedFloorPlanAddressBinding {
  bindingId: string;
  countryCode: string;
  addressNormalized: string;
  block: string;
  street: string;
  postalCode: string | null;
  stack: string | null;
  floorMin: number | null;
  floorMax: number | null;
  transform: FloorPlanAddressTransform;
  /** Exact searched unit context, when this plan was opened from #floor-stack. */
  unitFloor?: number | null;
  unitStack?: string | null;
}

export interface PersistedFloorPlanState {
  underlay?: PersistedFloorPlanUnderlay | null;
  openings?: PersistedPlanOpening[];
  fixedElements?: PersistedPlanFixedElement[];
  canonicalDocument?: FloorPlanDocumentV2;
  canonicalGeometryHash?: string;
  revisionId?: string;
  /** Geometry hash of the immutable, untransformed published revision. */
  sourceRevisionGeometryHash?: string;
  verificationTier?: FloorPlanDocumentV2["verification"]["tier"];
  /**
   * Non-geometric compatibility issues found while mapping legacy room-face
   * finish keys onto canonical wall IDs. These keep the saved design in
   * `needs_review` without mutating the immutable source revision.
   */
  surfaceMigrationReviewIssues?: Array<{
    code: "AMBIGUOUS_LEGACY_WALL_FACE";
    roomId: string;
    faceId: string;
    message: string;
  }>;
  addressTransform?: FloorPlanAddressTransform;
  addressBinding?: PersistedFloorPlanAddressBinding;
  sourceJobId?: string;
  sourceAssetSha256?: string;
  orientationConfirmed?: boolean;
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
  /** Overall ceiling-to-bottom height for an adjustable pendant light, in centimetres. */
  hangingHeightCm?: number;
  position: [number, number, number];
  rotationY?: number;
  qty?: number;
  includeInCheckout?: boolean;
  purchaseOptionId?: string;
  supportInstanceId?: string;
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
  /** Exact canonical floor elevation, retained independently of display level. */
  floorElevationMm?: number;
  /** Exact canonical floor-to-floor height for non-uniform multi-storey homes. */
  floorStoreyHeightMm?: number;
  /** Exact canonical slab thickness; geometry.slabThickness is the metre projection. */
  floorSlabThicknessMm?: number;
  geometry: RoomGeometry;
  planPosition?: RoomPlanPosition;
  planShape?: RoomPlanShape;
  planPolygon?: RoomPlanPolygonPoint[];
  /**
   * Ordered local-space void/courtyard loops inside planPolygon. Canonical
   * imports populate these from room wall loops so floor and ceiling surfaces
   * cannot silently fill a source-authored hole.
   */
  planHoles?: RoomPlanPolygonPoint[][];
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
