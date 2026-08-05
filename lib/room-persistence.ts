/**
 * Multi-Room Persistence Helpers v3
 * 
 * Utilities for saving and loading multi-room designs.
 * Handles migration from single-room (v1/v2) to multi-room (v3) format.
 */

import type {
  DesignItem,
  DesignSnapshot,
  LayoutVersion,
  RoomSurfaceAssignments,
  RoomSurfaceOpacity,
  RoomSurfaceFinishes,
  RoomSnapshot,
  SavedView,
  PersistedFloorPlanState,
  ZoneMin,
} from "./room-types";
import { migrateToV3 } from "./room-types";
import type { DesignLightingSettings } from "./lightingPresets";
import { resolveDesignLightingSettings } from "./design-lighting-settings";
import {
  DESIGN_DOCUMENT_COORDINATE_SYSTEM,
  DESIGN_DOCUMENT_LIMITS,
  DESIGN_DOCUMENT_SCHEMA_REVISION,
  DESIGN_DOCUMENT_UNITS,
  getSerializedDesignDocumentByteLength,
  type DesignDocumentCoordinateSystem,
  type DesignDocumentUnits,
} from "./design-document-contract";
import { migrateDesignDocument } from "./design-document-migrations";

export function isPersistableFloorPlanAssetUrl(assetUrl: string): boolean {
  return (
    assetUrl.startsWith("data:") ||
    assetUrl.startsWith("/") ||
    assetUrl.startsWith("http://") ||
    assetUrl.startsWith("https://")
  );
}

/**
 * Format for storage (database or localStorage)
 * Stores the v3 snapshot directly
 */
export interface StoredDesign {
  version: 3;
  schemaRevision?: 1;
  units?: DesignDocumentUnits;
  coordinateSystem?: DesignDocumentCoordinateSystem;
  rooms: Array<{
    id: string;
    name: string;
    roomType: string;
    floorLevel?: number;
    floorLabel?: string;
    floorElevationMm?: number;
    floorStoreyHeightMm?: number;
    floorSlabThicknessMm?: number;
    geometry: {
      width: number;
      depth: number;
      wallThickness?: number;
      height?: number;
      slabThickness?: number;
      /** Baseboard/skirting projection from the finished wall, in metres. */
      baseboardDepth?: number;
    };
    planPosition?: { x: number; z: number };
    planShape?: string;
    planPolygon?: Array<{ x: number; z: number }>;
    planHoles?: Array<Array<{ x: number; z: number }>>;
    surfaces?: RoomSurfaceAssignments;
    surfaceFinishes?: RoomSurfaceFinishes;
    surfaceOpacity?: RoomSurfaceOpacity;
    ceilingVisible?: boolean;
    items: DesignItem[];
    zones: ZoneMin[];
    savedViews: SavedView[];
    layoutVersions?: LayoutVersion[];
    [key: string]: unknown;
  }>;
  activeRoomId: string;
  // Design-level metadata
  title?: string;
  style?: string;
  budget?: string;
  lighting?: DesignLightingSettings;
  lightingPreset?: string;
  notes?: string;
  floorPlan?: PersistedFloorPlanState;
  [key: string]: unknown;
}

export function isStoredDesign(value: unknown): value is StoredDesign {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as { version?: unknown }).version !== 3
  ) {
    return false;
  }
  return migrateDesignDocument(value).ok;
}

export function sanitizeStoredDesign(value: unknown): StoredDesign | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as { version?: unknown }).version !== 3
  ) {
    return null;
  }
  const migrated = migrateDesignDocument(value);
  if (!migrated.ok) return null;
  const serialized = JSON.stringify(migrated.document);
  if (
    getSerializedDesignDocumentByteLength(serialized) >
    DESIGN_DOCUMENT_LIMITS.maxSerializedBytes
  ) {
    return null;
  }
  return JSON.parse(serialized) as StoredDesign;
}

function stripTemporaryCabinetOutput(item: DesignItem): DesignItem {
  if (item.assetType !== "parametric_cabinet") return item;

  const nextItem: DesignItem = { ...item };
  if (nextItem.glbAssetUrl?.startsWith("blob:")) {
    delete nextItem.glbAssetUrl;
  }

  const manifest = nextItem.millworkAssetManifest;
  if (!manifest) return nextItem;

  const generatedOutput = manifest.generatedOutput;
  if (generatedOutput?.url?.startsWith("blob:")) {
    const durableGeneratedOutput = { ...generatedOutput };
    delete durableGeneratedOutput.url;
    nextItem.millworkAssetManifest = {
      ...manifest,
      generatedOutput: {
        ...durableGeneratedOutput,
        durable: false,
      },
    };
  }

  return nextItem;
}

/**
 * Convert DesignSnapshot to StoredDesign format
 */
export function snapshotToStored(snapshot: DesignSnapshot): StoredDesign {
  const v3 = migrateToV3(snapshot);
  const preserved = v3 as DesignSnapshot & Record<string, unknown>;
  const lighting = resolveDesignLightingSettings(v3);
  
  return {
    ...preserved,
    version: 3,
    schemaRevision: DESIGN_DOCUMENT_SCHEMA_REVISION,
    units: DESIGN_DOCUMENT_UNITS,
    coordinateSystem: DESIGN_DOCUMENT_COORDINATE_SYSTEM,
    rooms: v3.rooms.map((room) => ({
      ...(room as RoomSnapshot & Record<string, unknown>),
      id: room.id,
      name: room.name,
      roomType: room.roomType,
      floorLevel: room.floorLevel ?? 1,
      floorLabel: room.floorLabel,
      floorElevationMm: room.floorElevationMm,
      floorStoreyHeightMm: room.floorStoreyHeightMm,
      floorSlabThicknessMm: room.floorSlabThicknessMm,
      geometry: room.geometry,
      planPosition: room.planPosition,
      planShape: room.planShape,
      planPolygon: room.planPolygon,
      planHoles: room.planHoles,
      surfaces: room.surfaces ? { ...room.surfaces } : room.surfaceFinishes ? { ...room.surfaceFinishes } : undefined,
      surfaceFinishes: room.surfaceFinishes ? { ...room.surfaceFinishes } : room.surfaces ? { ...room.surfaces } : undefined,
      surfaceOpacity: room.surfaceOpacity ? { ...room.surfaceOpacity } : undefined,
      ceilingVisible: room.ceilingVisible,
      items: room.items.map(stripTemporaryCabinetOutput),
      zones: room.zones,
      savedViews: room.savedViews,
      layoutVersions: room.layoutVersions ?? [],
    })),
    activeRoomId: v3.activeRoomId,
    title: v3.title,
    style: v3.style,
    budget: v3.budget,
    lighting,
    lightingPreset: lighting.preset,
    notes: v3.notes,
    floorPlan: v3.floorPlan,
  };
}

/**
 * Convert StoredDesign back to DesignSnapshot
 */
export function storedToSnapshot(stored: StoredDesign): DesignSnapshot {
  // If it has the v3 multi-room format, use it directly
  if (stored.version === 3 && stored.rooms && stored.rooms.length > 0) {
    const lighting = resolveDesignLightingSettings(stored);
    return {
      ...(stored as StoredDesign & Record<string, unknown>),
      version: 3,
      rooms: stored.rooms.map((room) => ({
        ...(room as RoomSnapshot),
        surfaces: room.surfaces ?? room.surfaceFinishes,
        surfaceFinishes: room.surfaceFinishes ?? room.surfaces,
        layoutVersions: room.layoutVersions ?? [],
      })),
      activeRoomId: stored.activeRoomId,
      title: stored.title,
      style: stored.style,
      budget: stored.budget as DesignSnapshot["budget"],
      lighting,
      lightingPreset: lighting.preset,
      notes: stored.notes,
      floorPlan: stored.floorPlan,
    };
  }

  // Otherwise migrate from legacy format
  // Otherwise migrate from legacy format
  return migrateToV3(stored as unknown as DesignSnapshot);
}

/**
 * Save design snapshot to localStorage (for guest mode)
 */
export function saveToLocalStorage(snapshot: DesignSnapshot, key: string = "design-snapshot") {
  try {
    const stored = snapshotToStored(snapshot);
    localStorage.setItem(key, JSON.stringify(stored));
    return true;
  } catch (err) {
    console.error("Failed to save to localStorage:", err);
    return false;
  }
}

/**
 * Load design snapshot from localStorage
 */
export function loadFromLocalStorage(key: string = "design-snapshot"): DesignSnapshot | null {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;
    const migrated = migrateDesignDocument(JSON.parse(item));
    return migrated.ok ? storedToSnapshot(migrated.document) : null;
  } catch (err) {
    console.error("Failed to load from localStorage:", err);
    return null;
  }
}

/**
 * Convert v3 multi-room format to legacy single-room API format
 * for backward compatibility with existing endpoints
 * Returns the active room's data flattened
 */
export function snapshotToLegacyApi(snapshot: DesignSnapshot): {
  title?: string;
  roomWidth: number;
  roomDepth: number;
  items: DesignItem[];
  zones: ZoneMin[];
  savedViews: SavedView[];
  snapshot: StoredDesign;
  style?: string;
  budget?: string;
  mode?: string;
  notes?: string;
} {
  const v3 = migrateToV3(snapshot);
  const stored = snapshotToStored(v3);
  // Get the active room
  const activeRoom = v3.rooms.find((r: RoomSnapshot) => r.id === v3.activeRoomId);
  
  if (!activeRoom) {
    return {
      title: v3.title,
      roomWidth: 4,
      roomDepth: 5,
      items: [],
      zones: [],
      savedViews: [],
      snapshot: stored,
    };
  }

  return {
    title: v3.title,
    roomWidth: activeRoom.geometry.width,
    roomDepth: activeRoom.geometry.depth,
    items: activeRoom.items,
    zones: activeRoom.zones,
    savedViews: activeRoom.savedViews,
    snapshot: stored,
  };
}

/**
 * Convert legacy API response to new multi-room snapshot
 */
export function legacyApiToSnapshot(data: {
  id: string;
  title?: string;
  roomWidth: number;
  roomDepth: number;
  items: DesignItem[];
  zones?: ZoneMin[];
  savedViews?: SavedView[];
  snapshot?: unknown;
  style?: string;
  budget?: string;
  mode?: string;
  notes?: string;
}): DesignSnapshot {
  const migratedSnapshot = migrateDesignDocument(data.snapshot);
  if (migratedSnapshot.ok) {
    return storedToSnapshot(migratedSnapshot.document);
  }

  return migrateToV3({
    items: data.items ?? [],
    zones: data.zones ?? [],
    savedViews: data.savedViews ?? [],
    roomBounds: {
      width: data.roomWidth ?? 5,
      depth: data.roomDepth ?? 4,
      wallThickness: 0.2,
    },
    title: data.title,
    style: data.style,
    budget: data.budget as DesignSnapshot["budget"],
    notes: data.notes,
  } as DesignSnapshot);
}
