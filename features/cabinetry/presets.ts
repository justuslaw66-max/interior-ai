import { CABINET_HARDWARE } from "./catalog/hardware";
import { CABINET_MATERIALS } from "./catalog/materials";
import { createCabinetAutomationState } from "./automation";
import type {
  CabinetDefinition,
  CabinetModuleDefinition,
  CabinetRequiredHostType,
} from "./types";
import {
  DEFAULT_PRESET_TOE_KICK_HEIGHT_MM,
  names,
  presets,
  unitTypeByPreset,
  type CabinetPresetId,
} from "./presetData";

export type { CabinetPresetId } from "./presetData";

const nowIso = () => new Date().toISOString();

export type CabinetTemplateCategory =
  | "Kitchen"
  | "Bathroom"
  | "Wardrobes & closets"
  | "Living room"
  | "Home office"
  | "Mudroom & entry"
  | "Laundry"
  | "Bedroom"
  | "Small-space systems"
  | "Architectural woodwork";

export type CabinetTemplateDifficulty = "Quick" | "Guided" | "Advanced";
export type CabinetTemplateHost = CabinetRequiredHostType;

export type CabinetTemplateCustomizationOption =
  | "overall_dimensions"
  | "fit_to_space"
  | "module_layout"
  | "front_layout"
  | "door_layout"
  | "drawer_layout"
  | "shelf_layout"
  | "hanging_layout"
  | "door_style"
  | "materials"
  | "hardware"
  | "fillers_and_scribes"
  | "finished_end_panels"
  | "countertop"
  | "toe_kick"
  | "mounting_height"
  | "construction_details"
  | "sink_and_plumbing"
  | "media_opening"
  | "cable_management"
  | "ventilation"
  | "lighting"
  | "appliance_openings"
  | "work_surface"
  | "seating_layout"
  | "hook_layout"
  | "wall_bed_configuration"
  | "deployed_clearance"
  | "bed_platform_layout"
  | "stair_profile"
  | "finished_back"
  | "bar_storage"
  | "stemware_storage"
  | "wine_rack_layout"
  | "pull_out_storage"
  | "lifestyle_inserts"
  | "panel_pattern"
  | "slat_layout"
  | "beam_array"
  | "coffer_grid"
  | "fireplace_opening"
  | "mantel"
  | "trim_profile"
  | "trim_placement";

export type CabinetTemplateRoomType =
  | "kitchen"
  | "bathroom"
  | "bedroom"
  | "closet"
  | "living_room"
  | "dining_room"
  | "home_office"
  | "mudroom"
  | "entry"
  | "laundry"
  | "utility_room"
  | "pantry"
  | "library"
  | "playroom"
  | "hobby_room"
  | "pet_area"
  | "hallway"
  | "multipurpose_room"
  | "wine_cellar"
  | "whole_home";

export type CabinetTemplateSafetyClassification =
  | "standard"
  | "anchoring_required"
  | "operational_clearance_required"
  | "structural_review_required"
  | "specialist_installation_required";

export type CabinetTemplateVisualThumbnailKind =
  | "casework"
  | "wall_bed"
  | "fold_down_desk"
  | "platform_bed"
  | "under_stair"
  | "room_divider"
  | "wall_paneling"
  | "slat_wall"
  | "ceiling_beams"
  | "coffered_ceiling"
  | "fireplace_surround"
  | "trim_package";

export type CabinetTemplateVisualThumbnail = Readonly<{
  kind: CabinetTemplateVisualThumbnailKind;
  presetId: CabinetPresetId;
}>;

export type CabinetTemplateDefaultDimensions = Readonly<{
  widthMm: number;
  heightMm: number;
  depthMm: number;
}>;

export type CabinetTemplateDefaultModuleLayoutItem = Readonly<
  Pick<
    CabinetModuleDefinition,
    | "type"
    | "width"
    | "height"
    | "depth"
    | "frontType"
    | "doorStyle"
    | "doorCount"
    | "drawerCount"
    | "shelfCount"
    | "materialId"
    | "frontMaterialId"
    | "hardwareId"
  >
>;

export interface CabinetPresetOption {
  id: CabinetPresetId;
  /** Canonical user-facing template name. */
  name: string;
  /** Backward-compatible card label. */
  label: string;
  category: CabinetTemplateCategory;
  description: string;
  visualThumbnail: CabinetTemplateVisualThumbnail;
  defaultDimensions: CabinetTemplateDefaultDimensions;
  defaultModuleLayout: readonly CabinetTemplateDefaultModuleLayoutItem[];
  defaultMaterialIds: readonly string[];
  defaultHardwareIds: readonly string[];
  difficulty: CabinetTemplateDifficulty;
  estimatedMinutes: number;
  /** Backward-compatible placement field used by the current template cards. */
  host: CabinetTemplateHost;
  /** Explicit host requirement persisted into every definition created from this preset. */
  requiredHostType: CabinetTemplateHost;
  supportedCustomizationOptions: readonly CabinetTemplateCustomizationOption[];
  applicableRoomTypes: readonly CabinetTemplateRoomType[];
  safetyClassification: CabinetTemplateSafetyClassification;
  featured?: boolean;
  keywords: string[];
}

type CabinetPresetOptionCore = Omit<
  CabinetPresetOption,
  | "name"
  | "visualThumbnail"
  | "defaultDimensions"
  | "defaultModuleLayout"
  | "defaultMaterialIds"
  | "defaultHardwareIds"
  | "requiredHostType"
  | "supportedCustomizationOptions"
  | "applicableRoomTypes"
  | "safetyClassification"
>;

type CabinetPresetMetadata = Pick<
  CabinetPresetOption,
  "supportedCustomizationOptions" | "applicableRoomTypes" | "safetyClassification"
>;

const CASEWORK_CORE_OPTIONS = [
  "overall_dimensions",
  "module_layout",
  "front_layout",
  "door_layout",
  "drawer_layout",
  "shelf_layout",
  "door_style",
  "materials",
  "hardware",
  "construction_details",
] as const satisfies readonly CabinetTemplateCustomizationOption[];

const BUILT_IN_FIT_OPTIONS = [
  ...CASEWORK_CORE_OPTIONS,
  "fit_to_space",
  "fillers_and_scribes",
  "finished_end_panels",
] as const satisfies readonly CabinetTemplateCustomizationOption[];

const ARCHITECTURAL_CORE_OPTIONS = [
  "overall_dimensions",
  "fit_to_space",
  "materials",
  "construction_details",
] as const satisfies readonly CabinetTemplateCustomizationOption[];

function definePresetMetadata(
  supportedCustomizationOptions: readonly CabinetTemplateCustomizationOption[],
  applicableRoomTypes: readonly CabinetTemplateRoomType[],
  safetyClassification: CabinetTemplateSafetyClassification,
): CabinetPresetMetadata {
  return { supportedCustomizationOptions, applicableRoomTypes, safetyClassification };
}

/**
 * Curated capability metadata is intentionally exhaustive. A new preset ID must
 * declare its supported controls, intended rooms, and installation risk before
 * TypeScript will accept it as a released template.
 */
const CABINET_PRESET_METADATA = {
  base: definePresetMetadata(
    [...CASEWORK_CORE_OPTIONS, "toe_kick", "countertop"],
    ["kitchen", "laundry", "home_office"],
    "standard",
  ),
  wall: definePresetMetadata(
    [...CASEWORK_CORE_OPTIONS, "fit_to_space", "fillers_and_scribes", "mounting_height"],
    ["kitchen", "laundry", "utility_room"],
    "anchoring_required",
  ),
  tall: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "toe_kick"],
    ["kitchen", "pantry", "laundry", "utility_room"],
    "anchoring_required",
  ),
  wardrobe: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "hanging_layout", "toe_kick"],
    ["bedroom", "closet"],
    "anchoring_required",
  ),
  vanity: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "sink_and_plumbing", "countertop", "toe_kick"],
    ["bathroom"],
    "standard",
  ),
  tv_console: definePresetMetadata(
    [...CASEWORK_CORE_OPTIONS, "fit_to_space", "cable_management", "ventilation"],
    ["living_room", "bedroom", "multipurpose_room"],
    "standard",
  ),
  cabinet_run: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "countertop", "toe_kick"],
    ["kitchen", "laundry", "utility_room"],
    "standard",
  ),
  closet_system: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "hanging_layout", "lighting", "toe_kick"],
    ["bedroom", "closet"],
    "anchoring_required",
  ),
  media_wall: definePresetMetadata(
    [
      ...BUILT_IN_FIT_OPTIONS,
      "media_opening",
      "cable_management",
      "ventilation",
      "lighting",
    ],
    ["living_room", "bedroom", "multipurpose_room"],
    "anchoring_required",
  ),
  mudroom_storage: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "hanging_layout", "hook_layout", "seating_layout", "toe_kick"],
    ["mudroom", "entry"],
    "anchoring_required",
  ),
  laundry_room: definePresetMetadata(
    [
      ...BUILT_IN_FIT_OPTIONS,
      "appliance_openings",
      "sink_and_plumbing",
      "countertop",
      "toe_kick",
    ],
    ["laundry", "utility_room"],
    "operational_clearance_required",
  ),
  home_office_built_in: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "work_surface", "cable_management", "lighting", "toe_kick"],
    ["home_office", "bedroom", "multipurpose_room"],
    "anchoring_required",
  ),
  library_wall: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "lighting", "mounting_height"],
    ["library", "living_room", "home_office"],
    "anchoring_required",
  ),
  window_seat: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "seating_layout", "toe_kick"],
    ["living_room", "bedroom", "dining_room"],
    "structural_review_required",
  ),
  banquette: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "seating_layout", "finished_back", "toe_kick"],
    ["dining_room", "kitchen"],
    "structural_review_required",
  ),
  murphy_bed: definePresetMetadata(
    [
      ...BUILT_IN_FIT_OPTIONS,
      "wall_bed_configuration",
      "deployed_clearance",
      "mounting_height",
    ],
    ["bedroom", "home_office", "multipurpose_room"],
    "specialist_installation_required",
  ),
  fold_down_desk: definePresetMetadata(
    [
      "overall_dimensions",
      "fit_to_space",
      "materials",
      "hardware",
      "work_surface",
      "deployed_clearance",
      "mounting_height",
      "construction_details",
    ],
    ["home_office", "bedroom", "multipurpose_room"],
    "operational_clearance_required",
  ),
  platform_storage_bed: definePresetMetadata(
    [
      "overall_dimensions",
      "module_layout",
      "drawer_layout",
      "materials",
      "hardware",
      "bed_platform_layout",
      "construction_details",
    ],
    ["bedroom"],
    "structural_review_required",
  ),
  under_stair_storage: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "stair_profile"],
    ["hallway", "entry", "living_room"],
    "structural_review_required",
  ),
  room_divider_storage: definePresetMetadata(
    [
      ...CASEWORK_CORE_OPTIONS,
      "fit_to_space",
      "finished_back",
      "finished_end_panels",
    ],
    ["living_room", "dining_room", "multipurpose_room"],
    "anchoring_required",
  ),
  home_bar: definePresetMetadata(
    [
      ...BUILT_IN_FIT_OPTIONS,
      "bar_storage",
      "stemware_storage",
      "wine_rack_layout",
      "countertop",
      "lighting",
      "toe_kick",
    ],
    ["living_room", "dining_room", "kitchen"],
    "anchoring_required",
  ),
  kitchen_island: definePresetMetadata(
    [
      ...CASEWORK_CORE_OPTIONS,
      "countertop",
      "seating_layout",
      "finished_back",
      "appliance_openings",
      "sink_and_plumbing",
      "toe_kick",
    ],
    ["kitchen"],
    "structural_review_required",
  ),
  pantry_system: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "pull_out_storage", "toe_kick"],
    ["pantry", "kitchen"],
    "anchoring_required",
  ),
  wine_storage: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "wine_rack_layout", "lighting", "toe_kick"],
    ["wine_cellar", "dining_room", "living_room"],
    "anchoring_required",
  ),
  pet_built_in: definePresetMetadata(
    [...CASEWORK_CORE_OPTIONS, "fit_to_space", "lifestyle_inserts", "toe_kick"],
    ["pet_area", "mudroom", "entry"],
    "standard",
  ),
  kids_storage: definePresetMetadata(
    [...CASEWORK_CORE_OPTIONS, "fit_to_space", "lifestyle_inserts", "toe_kick"],
    ["bedroom", "playroom"],
    "anchoring_required",
  ),
  hobby_storage: definePresetMetadata(
    [...BUILT_IN_FIT_OPTIONS, "lifestyle_inserts", "work_surface", "toe_kick"],
    ["hobby_room", "home_office", "multipurpose_room"],
    "anchoring_required",
  ),
  wall_paneling: definePresetMetadata(
    [...ARCHITECTURAL_CORE_OPTIONS, "panel_pattern", "mounting_height"],
    ["whole_home", "living_room", "dining_room", "bedroom", "entry"],
    "anchoring_required",
  ),
  slat_wall: definePresetMetadata(
    [...ARCHITECTURAL_CORE_OPTIONS, "slat_layout", "mounting_height", "lighting"],
    ["whole_home", "living_room", "bedroom", "home_office", "entry"],
    "anchoring_required",
  ),
  ceiling_beams: definePresetMetadata(
    [...ARCHITECTURAL_CORE_OPTIONS, "beam_array"],
    ["whole_home", "living_room", "dining_room", "kitchen", "bedroom"],
    "specialist_installation_required",
  ),
  coffered_ceiling: definePresetMetadata(
    [...ARCHITECTURAL_CORE_OPTIONS, "coffer_grid"],
    ["whole_home", "living_room", "dining_room", "kitchen", "bedroom"],
    "specialist_installation_required",
  ),
  fireplace_surround: definePresetMetadata(
    [...ARCHITECTURAL_CORE_OPTIONS, "fireplace_opening", "mantel"],
    ["living_room", "bedroom"],
    "specialist_installation_required",
  ),
  trim_package: definePresetMetadata(
    [...ARCHITECTURAL_CORE_OPTIONS, "trim_profile", "trim_placement"],
    ["whole_home"],
    "standard",
  ),
} satisfies Record<CabinetPresetId, CabinetPresetMetadata>;

const CABINET_PRESET_OPTION_CORES: CabinetPresetOptionCore[] = [
  { id: "base", label: names.base, category: "Kitchen", description: "A finished three-drawer cabinet with worktop-ready proportions.", difficulty: "Quick", estimatedMinutes: 2, host: "Floor", featured: true, keywords: ["drawers", "kitchen", "casework"] },
  { id: "wall", label: names.wall, category: "Kitchen", description: "A two-door wall cabinet with shelves and mounting cleat.", difficulty: "Quick", estimatedMinutes: 2, host: "Wall", featured: true, keywords: ["upper", "doors", "kitchen"] },
  { id: "tall", label: names.tall, category: "Kitchen", description: "Full-height storage with shelves and anti-tip anchoring.", difficulty: "Quick", estimatedMinutes: 3, host: "Floor", keywords: ["pantry", "tower", "storage"] },
  { id: "wardrobe", label: names.wardrobe, category: "Wardrobes & closets", description: "Two-door hanging storage with adjustable internal shelves.", difficulty: "Quick", estimatedMinutes: 3, host: "Floor", featured: true, keywords: ["closet", "hanging", "bedroom"] },
  { id: "vanity", label: names.vanity, category: "Bathroom", description: "A sink-ready vanity with plumbing chase and countertop cutout.", difficulty: "Guided", estimatedMinutes: 5, host: "Floor", featured: true, keywords: ["bathroom", "sink", "plumbing"] },
  { id: "tv_console", label: names.tv_console, category: "Living room", description: "Low media storage sized for equipment, cables, and ventilation.", difficulty: "Quick", estimatedMinutes: 3, host: "Floor", keywords: ["media", "television", "console"] },
  { id: "cabinet_run", label: names.cabinet_run, category: "Kitchen", description: "A coordinated multi-module run ready for fillers and end panels.", difficulty: "Guided", estimatedMinutes: 6, host: "Floor", featured: true, keywords: ["kitchen", "multi-module", "built-in"] },
  { id: "closet_system", label: names.closet_system, category: "Wardrobes & closets", description: "Multi-bay hanging, drawer, and shelf storage for a full wall.", difficulty: "Guided", estimatedMinutes: 7, host: "Wall", featured: true, keywords: ["wardrobe", "hanging", "drawers"] },
  { id: "media_wall", label: names.media_wall, category: "Living room", description: "A full media composition with TV opening and service routes.", difficulty: "Advanced", estimatedMinutes: 10, host: "Wall", keywords: ["television", "cable", "built-in"] },
  { id: "mudroom_storage", label: names.mudroom_storage, category: "Mudroom & entry", description: "Bench, hooks, cubbies, and tall entry storage in one assembly.", difficulty: "Guided", estimatedMinutes: 7, host: "Wall", keywords: ["bench", "hooks", "shoes"] },
  { id: "laundry_room", label: names.laundry_room, category: "Laundry", description: "Cabinetry planned around appliances, clearances, and utility access.", difficulty: "Advanced", estimatedMinutes: 10, host: "Floor", keywords: ["washer", "dryer", "utility"] },
  { id: "home_office_built_in", label: names.home_office_built_in, category: "Home office", description: "Desk, storage, cable routes, and upper shelving for a work wall.", difficulty: "Guided", estimatedMinutes: 8, host: "Wall", keywords: ["desk", "workstation", "shelves"] },
  { id: "library_wall", label: names.library_wall, category: "Living room", description: "Floor-to-ceiling book storage with optional ladder rail details.", difficulty: "Guided", estimatedMinutes: 8, host: "Wall", keywords: ["books", "shelving", "ladder"] },
  { id: "window_seat", label: names.window_seat, category: "Living room", description: "A cushioned window bench with integrated storage below.", difficulty: "Guided", estimatedMinutes: 6, host: "Floor", keywords: ["bench", "cushion", "drawers"] },
  { id: "banquette", label: names.banquette, category: "Living room", description: "Built-in dining seating with storage and finished back support.", difficulty: "Guided", estimatedMinutes: 6, host: "Floor", keywords: ["dining", "bench", "seating"] },
  { id: "murphy_bed", label: names.murphy_bed, category: "Small-space systems", description: "A vertical wall-bed cabinet with deployed clearance guidance.", difficulty: "Advanced", estimatedMinutes: 12, host: "Wall", keywords: ["wall bed", "convertible", "small space"] },
  { id: "fold_down_desk", label: names.fold_down_desk, category: "Small-space systems", description: "A compact wall-mounted desk that folds away when not in use.", difficulty: "Advanced", estimatedMinutes: 8, host: "Wall", keywords: ["desk", "convertible", "compact"] },
  { id: "platform_storage_bed", label: names.platform_storage_bed, category: "Bedroom", description: "A bed platform with structural ribs and storage-ready bays.", difficulty: "Guided", estimatedMinutes: 8, host: "Floor", keywords: ["bed", "platform", "storage"] },
  { id: "under_stair_storage", label: names.under_stair_storage, category: "Small-space systems", description: "Stepped storage fitted to the slope beneath a stair.", difficulty: "Advanced", estimatedMinutes: 10, host: "Wall", keywords: ["stair", "scribe", "compact"] },
  { id: "room_divider_storage", label: names.room_divider_storage, category: "Small-space systems", description: "Two-sided open storage that also defines a room boundary.", difficulty: "Advanced", estimatedMinutes: 9, host: "Floor", keywords: ["divider", "two-sided", "open"] },
  { id: "home_bar", label: names.home_bar, category: "Living room", description: "Display, bottle, stemware, and base storage for a complete bar wall.", difficulty: "Advanced", estimatedMinutes: 10, host: "Wall", keywords: ["bar", "wine", "stemware"] },
  { id: "kitchen_island", label: names.kitchen_island, category: "Kitchen", description: "A freestanding island with worktop, seating overhang, and supports.", difficulty: "Guided", estimatedMinutes: 8, host: "Floor", keywords: ["island", "seating", "worktop"] },
  { id: "pantry_system", label: names.pantry_system, category: "Kitchen", description: "Tall food storage with pull-out trays and accessible clearances.", difficulty: "Guided", estimatedMinutes: 7, host: "Floor", keywords: ["pantry", "pull-out", "tall"] },
  { id: "wine_storage", label: names.wine_storage, category: "Living room", description: "Purpose-built bottle storage with configurable rack bays.", difficulty: "Guided", estimatedMinutes: 7, host: "Floor", keywords: ["wine", "bottles", "rack"] },
  { id: "pet_built_in", label: names.pet_built_in, category: "Mudroom & entry", description: "Integrated pet bed and storage sized as real cabinet modules.", difficulty: "Quick", estimatedMinutes: 4, host: "Floor", keywords: ["pet", "bed", "entry"] },
  { id: "kids_storage", label: names.kids_storage, category: "Bedroom", description: "Low, approachable toy and display storage for children’s rooms.", difficulty: "Quick", estimatedMinutes: 4, host: "Floor", keywords: ["kids", "toys", "low storage"] },
  { id: "hobby_storage", label: names.hobby_storage, category: "Home office", description: "Tall organized storage with trays for craft or hobby supplies.", difficulty: "Guided", estimatedMinutes: 6, host: "Floor", keywords: ["craft", "hobby", "trays"] },
  { id: "wall_paneling", label: names.wall_paneling, category: "Architectural woodwork", description: "Framed decorative wall panels with repeatable bay proportions.", difficulty: "Guided", estimatedMinutes: 6, host: "Wall", keywords: ["panels", "wainscot", "feature wall"] },
  { id: "slat_wall", label: names.slat_wall, category: "Architectural woodwork", description: "A dimensional timber slat feature with controlled spacing.", difficulty: "Quick", estimatedMinutes: 4, host: "Wall", keywords: ["slats", "feature wall", "timber"] },
  { id: "ceiling_beams", label: names.ceiling_beams, category: "Architectural woodwork", description: "A repeated decorative beam array across a ceiling span.", difficulty: "Guided", estimatedMinutes: 6, host: "Ceiling", keywords: ["beams", "ceiling", "array"] },
  { id: "coffered_ceiling", label: names.coffered_ceiling, category: "Architectural woodwork", description: "A regular coffer grid with controlled rows and columns.", difficulty: "Advanced", estimatedMinutes: 9, host: "Ceiling", keywords: ["coffer", "ceiling", "grid"] },
  { id: "fireplace_surround", label: names.fireplace_surround, category: "Architectural woodwork", description: "A mantel and framed opening with adjustable surround proportions.", difficulty: "Advanced", estimatedMinutes: 9, host: "Wall", keywords: ["fireplace", "mantel", "surround"] },
  { id: "trim_package", label: names.trim_package, category: "Architectural woodwork", description: "Coordinated base, casing, crown, or feature trim runs.", difficulty: "Advanced", estimatedMinutes: 8, host: "Flexible", keywords: ["trim", "moulding", "casing"] },
];

const CABINET_PRESET_THUMBNAIL_KINDS = {
  base: "casework",
  wall: "casework",
  tall: "casework",
  wardrobe: "casework",
  vanity: "casework",
  tv_console: "casework",
  cabinet_run: "casework",
  closet_system: "casework",
  media_wall: "casework",
  mudroom_storage: "casework",
  laundry_room: "casework",
  home_office_built_in: "casework",
  library_wall: "casework",
  window_seat: "casework",
  banquette: "casework",
  murphy_bed: "wall_bed",
  fold_down_desk: "fold_down_desk",
  platform_storage_bed: "platform_bed",
  under_stair_storage: "under_stair",
  room_divider_storage: "room_divider",
  home_bar: "casework",
  kitchen_island: "casework",
  pantry_system: "casework",
  wine_storage: "casework",
  pet_built_in: "casework",
  kids_storage: "casework",
  hobby_storage: "casework",
  wall_paneling: "wall_paneling",
  slat_wall: "slat_wall",
  ceiling_beams: "ceiling_beams",
  coffered_ceiling: "coffered_ceiling",
  fireplace_surround: "fireplace_surround",
  trim_package: "trim_package",
} as const satisfies Record<CabinetPresetId, CabinetTemplateVisualThumbnailKind>;

export const CABINET_PRESET_OPTIONS: CabinetPresetOption[] = CABINET_PRESET_OPTION_CORES.map(
  (option) => {
    const definition = presets[option.id];
    const defaultModuleLayout = definition.modules.map((module) => ({
      type: module.type ?? unitTypeByPreset[option.id],
      width: module.width,
      height: module.height ?? definition.height,
      depth: module.depth ?? definition.depth,
      frontType: module.frontType,
      doorStyle: module.doorStyle,
      doorCount: module.doorCount,
      drawerCount: module.drawerCount,
      shelfCount: module.shelfCount,
      materialId: module.materialId,
      frontMaterialId: module.frontMaterialId,
      hardwareId: module.hardwareId ?? "none",
    }));

    return {
      ...option,
      ...CABINET_PRESET_METADATA[option.id],
      name: option.label,
      visualThumbnail: {
        kind: CABINET_PRESET_THUMBNAIL_KINDS[option.id],
        presetId: option.id,
      },
      defaultDimensions: {
        widthMm: definition.totalWidth,
        heightMm: definition.height,
        depthMm: definition.depth,
      },
      defaultModuleLayout,
      defaultMaterialIds: [
        ...new Set(
          defaultModuleLayout.flatMap((module) =>
            module.frontMaterialId
              ? [module.materialId, module.frontMaterialId]
              : [module.materialId]
          )
        ),
      ],
      defaultHardwareIds: [
        ...new Set(defaultModuleLayout.map((module) => module.hardwareId ?? "none")),
      ],
      requiredHostType: option.host,
    };
  },
);

export type CabinetTemplateCatalogFilter = CabinetTemplateCategory | "Featured" | "All";

function normalizeCabinetTemplateSearchTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

/**
 * Builds the complete public search surface for a template. Search includes the
 * installation, room, customization, dimensional, material, and hardware
 * metadata—not only the marketing copy visible on its card.
 */
export function getCabinetPresetSearchText(option: CabinetPresetOption): string {
  const materialNames = option.defaultMaterialIds.map(
    (materialId) =>
      CABINET_MATERIALS.find((material) => material.id === materialId)?.name ?? materialId
  );
  const hardwareNames = option.defaultHardwareIds.map(
    (hardwareId) =>
      CABINET_HARDWARE.find((hardware) => hardware.id === hardwareId)?.name ?? hardwareId
  );
  const dimensions = option.defaultDimensions;

  return [
    option.id,
    option.name,
    option.label,
    option.category,
    option.description,
    option.difficulty,
    `${option.estimatedMinutes} min minutes`,
    option.host,
    option.requiredHostType,
    option.safetyClassification,
    ...option.keywords,
    ...option.supportedCustomizationOptions,
    ...option.applicableRoomTypes,
    `${dimensions.widthMm} ${dimensions.heightMm} ${dimensions.depthMm} mm`,
    `${option.defaultModuleLayout.length} module modules`,
    ...option.defaultModuleLayout.map((module) => module.frontType),
    ...option.defaultMaterialIds,
    ...materialNames,
    ...option.defaultHardwareIds,
    ...hardwareNames,
  ]
    .map((value) => normalizeCabinetTemplateSearchTerm(String(value)))
    .filter(Boolean)
    .join(" ");
}

/** Pure catalog predicate shared by the Studio and focused non-browser tests. */
export function cabinetPresetMatchesCatalogFilters(
  option: CabinetPresetOption,
  query: string,
  filter: CabinetTemplateCatalogFilter,
): boolean {
  const queryTerms = normalizeCabinetTemplateSearchTerm(query).split(/\s+/).filter(Boolean);
  const matchesSearch = queryTerms.every((term) =>
    getCabinetPresetSearchText(option).includes(term)
  );
  const matchesCategory =
    filter === "All" ||
    (filter === "Featured"
      ? queryTerms.length > 0 || Boolean(option.featured)
      : option.category === filter);

  return matchesSearch && matchesCategory;
}

export function createCabinetPreset(presetId: CabinetPresetId, id = `cabinet-${presetId}`): CabinetDefinition {
  const preset = presets[presetId];
  const timestamp = nowIso();

  const definition: CabinetDefinition = {
    ...preset,
    id,
    sourcePresetId: presetId,
    requiredHostType:
      CABINET_PRESET_OPTIONS.find((option) => option.id === presetId)?.requiredHostType ??
      "Flexible",
    totalWidth: preset.totalWidth,
    height: preset.height,
    depth: preset.depth,
    toeKickHeight: DEFAULT_PRESET_TOE_KICK_HEIGHT_MM,
    materials: CABINET_MATERIALS,
    hardware: CABINET_HARDWARE,
    modules: preset.modules.map((module, index) => ({
      id: `module-${index + 1}`,
      ...module,
      type: module.type ?? unitTypeByPreset[presetId],
      height: module.height ?? preset.height,
      depth: module.depth ?? preset.depth,
    })),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return {
    ...definition,
    automation: createCabinetAutomationState(definition),
  };
}

export function getCabinetPresetMillworkAssemblyType(
  presetId: CabinetPresetId
): CabinetDefinition["millworkAssemblyType"] {
  return presets[presetId].millworkAssemblyType;
}
