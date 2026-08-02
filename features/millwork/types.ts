export type MillworkFamily =
  | "cabinetry"
  | "closet"
  | "wardrobe"
  | "murphy_bed"
  | "media_wall"
  | "mudroom"
  | "vanity"
  | "laundry_room"
  | "home_office"
  | "library"
  | "window_seat"
  | "paneling"
  | "banquette"
  | "bar"
  | "island"
  | "pantry"
  | "wine_storage"
  | "trim"
  | "ceiling_woodwork"
  | "storage_bed"
  | "under_stair_storage"
  | "room_divider_storage"
  | "lifestyle_built_in";

export type MillworkAssemblyType =
  | "base"
  | "wall"
  | "tall"
  | "vanity"
  | "tv_console"
  | "wardrobe"
  | "cabinet_run"
  | "closet_system"
  | "murphy_bed"
  | "fold_down_desk"
  | "platform_storage_bed"
  | "media_wall"
  | "mudroom_storage"
  | "home_office_built_in"
  | "library_wall"
  | "laundry_room_cabinetry"
  | "window_seat"
  | "banquette"
  | "home_bar"
  | "kitchen_island"
  | "pantry_system"
  | "wine_storage"
  | "pet_built_in"
  | "kids_storage"
  | "hobby_storage"
  | "wall_paneling"
  | "slat_wall"
  | "ceiling_beams"
  | "coffered_ceiling"
  | "fireplace_surround"
  | "trim_package"
  | "under_stair_storage"
  | "room_divider_storage";

export type MillworkSourceType = "cabinet_definition";
export type MillworkAssetType = "parametric_cabinet";

export interface MillworkDimensions {
  width: number;
  height: number;
  depth: number;
  units: "mm";
}

export interface MillworkMaterialRef {
  id: string;
  name: string;
  color?: string;
  textureUrl?: string;
  roughness?: number;
  metalness?: number;
  skuId?: string;
}

export interface MillworkHardwareRef {
  id: string;
  name: string;
  type?: string;
  skuId?: string;
}

export interface MillworkPlacementTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export type MillworkProjectPhase =
  | "mvp"
  | "phase_2"
  | "phase_3"
  | "phase_4"
  | "phase_5"
  | "phase_6";

export type MillworkPlacementKind =
  | "floor_set"
  | "wall_mounted"
  | "built_in_wall"
  | "freestanding_island"
  | "ceiling_mounted"
  | "convertible_built_in";

export type MillworkFabricationComplexity = "standard" | "moderate" | "advanced";

export interface MillworkAssemblyProfile {
  schema: "custom_millwork.assembly_profile.v1";
  assemblyType: MillworkAssemblyType;
  family: MillworkFamily;
  label: string;
  projectPhase: MillworkProjectPhase;
  placementKind: MillworkPlacementKind;
  fabricationComplexity: MillworkFabricationComplexity;
  fieldMeasurementRequirements: string[];
  serviceCoordination: string[];
  installationConstraints: string[];
  quoteDrivers: string[];
}

export interface MillworkDefinition<TSource extends { id?: string } = { id?: string }> {
  id: string;
  schema: "custom_millwork.definition.v1";
  version: number;
  family: MillworkFamily;
  assemblyType: MillworkAssemblyType;
  assemblyProfile: MillworkAssemblyProfile;
  displayName: string;
  sourceType: MillworkSourceType;
  sourceDefinition: TSource;
  dimensions: MillworkDimensions;
  materials: MillworkMaterialRef[];
  hardware: MillworkHardwareRef[];
  capabilities: Array<
    | "live_3d_preview"
    | "glb_export"
    | "house_plan_smart_asset"
    | "edit_after_placement"
    | "bom"
    | "material_schedule"
    | "hardware_schedule"
    | "quote_ready_future"
    | "fabrication_ready_future"
  >;
  createdAt: string;
  updatedAt: string;
}

export interface MillworkAssetManifest {
  schema: "custom_millwork.asset_manifest.v1";
  version: number;
  assetType: MillworkAssetType;
  assetId: string;
  family: MillworkFamily;
  assemblyType: MillworkAssemblyType;
  sourceType: MillworkSourceType;
  sourceDefinitionId: string;
  sourceDefinitionVersion: number;
  millworkDefinitionId: string;
  millworkDefinitionVersion: number;
  roomId?: string;
  transform: MillworkPlacementTransform;
  generatedOutput: {
    kind: "glb";
    url?: string;
    durable: boolean;
  };
  createdAt: string;
  updatedAt: string;
}
