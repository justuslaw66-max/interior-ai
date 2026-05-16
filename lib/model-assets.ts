/**
 * Model Assets Registry - Single Source of Truth for 3D Assets
 * 
 * This registry maps asset IDs to their physical bounds, dimensions, and file locations.
 * Assets are imported via scripts/import-model.ts which generates these entries deterministically.
 */

// ============================================================================
// Asset Shape
// ============================================================================

export interface ModelAsset {
  id: string; // unique asset ID (e.g., "sofa-real-castlery-dawson-3s")
  modelUrl: string; // GLB file path
  thumbUrl: string; // thumbnail path
  
  // Computed at import time from GLB
  bounds: {
    type: "aabb";
    size: { x: number; y: number; z: number }; // meters
    center: { x: number; y: number; z: number }; // meters
  };
  dimsMm: { w: number; d: number; h: number }; // millimeters
  pivot: {
    offsetX: number; // meters
    offsetZ: number; // meters
    groundAligned: boolean;
  };
  
  // Metadata
  updatedAt: string; // ISO timestamp
  importMetadata?: {
    normalizedScale?: number;
    originalBounds?: { min: number[]; max: number[] };
    pivotAdjustment?: { x: number; z: number };
  };
}

// ============================================================================
// Registry
// ============================================================================

/**
 * Central registry of all 3D model assets.
 * 
 * NOTE: This is currently code-based for rapid iteration.
 * In production, this can be moved to the database (ModelAsset table).
 * 
 * To add a new asset:
 * 1. Run: npm run import-model -- path/to/file.glb --id <asset-id>
 * 2. The script will output a registry entry to copy here
 * 3. Reference the assetId in your catalog product definition
 */
export const MODEL_ASSETS: Record<string, ModelAsset> = {
  // Placeholder entries - real assets will be added via import script
  // Example structure:
  /*
  "sofa-real-castlery-dawson-3s": {
    id: "sofa-real-castlery-dawson-3s",
    modelUrl: "/assets/models/sofa-real-castlery-dawson-3s.glb",
    thumbUrl: "/assets/thumbs/sofa-real-castlery-dawson-3s.png",
    bounds: {
      type: "aabb",
      size: { x: 2.1, y: 0.8, z: 0.85 },
      center: { x: 0, y: 0.4, z: 0 },
    },
    dimsMm: { w: 2100, d: 850, h: 800 },
    pivot: { offsetX: 0, offsetZ: 0, groundAligned: true },
    updatedAt: "2026-02-23T00:00:00.000Z",
  },
  */
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get asset by ID with validation
 */
export function getModelAsset(assetId: string): ModelAsset | undefined {
  return MODEL_ASSETS[assetId];
}

/**
 * Check if asset exists and has valid geometry
 */
export function isValidAsset(assetId: string): boolean {
  const asset = MODEL_ASSETS[assetId];
  if (!asset) return false;
  
  return (
    asset.bounds &&
    asset.dimsMm &&
    asset.dimsMm.w > 0 &&
    asset.dimsMm.d > 0 &&
    asset.dimsMm.h > 0
  );
}

/**
 * Get all asset IDs
 */
export function getAssetIds(): string[] {
  return Object.keys(MODEL_ASSETS);
}

/**
 * Count registered assets
 */
export function getAssetCount(): number {
  return Object.keys(MODEL_ASSETS).length;
}
