import { CABINET_HARDWARE } from "../catalog/hardware";
import { CABINET_MATERIALS } from "../catalog/materials";
import {
  CABINET_PRESET_OPTIONS,
  type CabinetTemplateCategory,
} from "../presets";
import type {
  CabinetDefinition,
  CabinetEdgeTreatment,
  CabinetExposedFace,
  CabinetFrontType,
  CabinetGrainDirection,
  CabinetLaundryApplianceKind,
  CabinetLifestyleInsertKind,
  CabinetMillworkComponentType,
  CabinetModuleDefinition,
  CabinetStairScribeDirection,
  CabinetTrimEndTreatment,
  CabinetTrimPlacement,
  CabinetUnitType,
  DoorStyle,
} from "../types";

// Preserve the Studio's pre-extraction default millimetre rounding step.
export const CABINET_GUIDED_DIMENSION_INCREMENT_MM = 10;

// Preserve the Studio's pre-extraction lower bounds for direct overall resizing.
export const CABINET_RESIZE_MINIMUM_MODULE_HEIGHT_MM = 200;
export const CABINET_RESIZE_MINIMUM_MODULE_DEPTH_MM = 120;

export const frontTypes: CabinetFrontType[] = [
  "open",
  "single_door",
  "double_door",
  "drawer_stack",
  "door_and_drawer",
  "slab_panel",
];

export const doorStyles: DoorStyle[] = [
  "flat_slab",
  "shaker",
  "glass",
  "fluted",
];

export const grainDirectionOptions: Array<{
  value: "automatic" | CabinetGrainDirection;
  label: string;
}> = [
  { value: "automatic", label: "Automatic from material and part" },
  { value: "vertical", label: "Vertical" },
  { value: "horizontal", label: "Horizontal" },
  { value: "none", label: "No directional grain" },
];

export const edgeTreatmentOptions: Array<{
  value: "automatic" | CabinetEdgeTreatment;
  label: string;
}> = [
  { value: "automatic", label: "Automatic matching edge" },
  { value: "matching_edge_band", label: "Matching edge band" },
  { value: "contrasting_edge_band", label: "Contrasting edge band" },
  { value: "solid_lipping", label: "Solid lipping" },
  { value: "painted_edge", label: "Painted edge" },
  { value: "none", label: "No edge treatment" },
];

export const exposedFaceOptions: Array<{
  value: CabinetExposedFace;
  label: string;
}> = [
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
];

export const unitTypes: CabinetUnitType[] = [
  "base",
  "wall",
  "tall",
  "vanity",
  "tv_console",
  "wardrobe",
];

export const componentTypes: CabinetMillworkComponentType[] = [
  "cabinet",
  "ceiling_beam_array",
  "coffered_ceiling_grid",
  "trim_run",
  "fireplace_surround_frame",
  "wall_bed_panel",
  "fold_down_worksurface",
];

export const hingeSides: NonNullable<CabinetModuleDefinition["hingeSide"]>[] = [
  "left",
  "right",
  "double",
];

export const CABINET_CONSTRUCTION_RESET_FIELDS = [
  "boardThickness",
  "backPanelThickness",
  "toeKickHeight",
  "toeKickSetback",
  "toeKickDepth",
  "revealGap",
  "leftFillerWidth",
  "rightFillerWidth",
  "leftFillerScribeAllowance",
  "rightFillerScribeAllowance",
  "includeLeftEndPanel",
  "includeRightEndPanel",
  "leftEndPanelThickness",
  "rightEndPanelThickness",
  "levelingFeetEnabled",
  "levelingFootCount",
  "levelingFootHeight",
  "levelingFootDiameter",
  "levelingFootInsetFromSides",
  "levelingFootInsetFromFrontBack",
  "faceFrameEnabled",
  "faceFrameStileWidth",
  "faceFrameRailHeight",
  "faceFrameDepth",
  "includeCountertop",
  "countertopThickness",
  "countertopOverhangLeft",
  "countertopOverhangRight",
  "countertopOverhangFront",
  "countertopOverhangBack",
  "includeBacksplash",
  "backsplashHeight",
  "backsplashThickness",
  "islandSeatingOverhangEnabled",
  "islandSeatingOverhangDepth",
  "islandSupportPanelCount",
  "islandSupportPanelThickness",
  "islandSupportPanelDepth",
  "islandSupportPanelEndInset",
] as const satisfies readonly (keyof CabinetDefinition)[];

export const stairScribeDirections: CabinetStairScribeDirection[] = [
  "rises_left",
  "rises_right",
];

export const lifestyleInsertKinds: CabinetLifestyleInsertKind[] = [
  "pet_bed",
  "toy_bin",
  "hobby_tray",
];

export const laundryApplianceKinds: CabinetLaundryApplianceKind[] = [
  "washer",
  "dryer",
  "washer_dryer",
  "stacked_washer_dryer",
];

export const trimPlacements: CabinetTrimPlacement[] = [
  "baseboard",
  "crown_moulding",
  "casing",
  "chair_rail",
  "picture_rail",
  "generic_trim",
];

export const trimEndTreatments: CabinetTrimEndTreatment[] = [
  "butt",
  "mitered_return",
  "coped",
  "scribed",
];

export { CABINET_SHELF_LAYOUT_FIELDS } from "../shelfLayout";

export const GUIDED_TEMPLATE_CATEGORIES: CabinetTemplateCategory[] = Array.from(
  new Set(CABINET_PRESET_OPTIONS.map((preset) => preset.category))
);

export const GUIDED_MATERIALS = CABINET_MATERIALS.filter(
  (material) =>
    !["service_zone_marker", "upholstery_neutral", "glass"].includes(
      material.id
    )
);

export const GUIDED_HARDWARE = CABINET_HARDWARE.filter((hardware) =>
  [
    "none",
    "brushed_steel_bar_pull",
    "black_bar_pull",
    "round_knob",
    "edge_pull",
    "push_to_open",
  ].includes(hardware.id)
);
