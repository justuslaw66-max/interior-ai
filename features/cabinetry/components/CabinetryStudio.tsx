"use client";

import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { Grid } from "@react-three/drei/core/Grid";
import { Canvas } from "@react-three/fiber";
import { track } from "@/lib/analytics";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  FileText,
  Layers3,
  Lock,
  MapPin,
  Palette,
  Plus,
  Redo2,
  RotateCcw,
  Ruler,
  Save,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CABINET_HARDWARE, isCabinetFrontHardwareType } from "../catalog/hardware";
import { CABINET_MATERIALS } from "../catalog/materials";
import {
  CABINET_MAX_MODULE_WIDTH_MM,
  CABINET_EQUAL_MODULE_WIDTHS_PARAMETER_PATH,
  getCabinetAutomationState,
  getCabinetParameterState,
  isCabinetModuleWidthLocked,
  isCabinetOverallWidthLocked,
  resizeCabinetToOverallWidth,
  setCabinetAutomationMode,
  setCabinetEqualModuleSizing,
  setCabinetModuleWidth,
  setCabinetModuleWidthLocked,
  setCabinetOverallWidthLocked,
  setCabinetParameterState,
  syncCabinetDefinitionDimensions,
} from "../automation";
import { fitCabinetToSpace, getCabinetAvailableSegments, type CabinetFitResult } from "../fitToSpace";
import { downloadCabinetGlb, exportCabinetAsGlb } from "../exportCabinetGlb";
import { downloadCabinetFabricationDxf } from "../exportCabinetFabricationDxf";
import { downloadCabinetShopDrawingSvg } from "../exportCabinetShopDrawingSvg";
import { generateCabinetBOM } from "../generateCabinetBOM";
import { generateCabinetParts } from "../generateCabinetParts";
import {
  CABINET_DEFAULT_BACKSPLASH_HEIGHT,
  CABINET_DEFAULT_BACKSPLASH_THICKNESS,
  CABINET_DEFAULT_COUNTERTOP_FRONT_OVERHANG,
  CABINET_DEFAULT_END_PANEL_THICKNESS,
  CABINET_DEFAULT_COUNTERTOP_SIDE_OVERHANG,
  CABINET_DEFAULT_COUNTERTOP_THICKNESS,
  getCabinetOverallDepth,
  getCabinetOverallHeight,
  getCabinetOverallWidth,
  getCabinetToeKickDepth,
  getCabinetToeKickSetback,
} from "../layout";
import { getCabinetOverallWidthLimits } from "../moduleWidthConstraints";
import { getCabinetMinimumModuleWidthMm } from "../moduleWidthRules";
import {
  getCabinetModuleOptionGroupIdForControlTestId,
  getVisibleCabinetModuleOptionGroupIds,
  type CabinetModuleOptionGroupId,
} from "../moduleOptionGroups";
import { reconcileCabinetModuleSizing } from "../moduleSizingReconciliation";
import { getCabinetTemplateRoomTerms } from "../templateRecommendations";
import {
  cabinetDisplayToMillimetres,
  cabinetMillimetresToDisplay,
  formatCabinetMeasurement,
  formatCabinetMeasurementTokens,
} from "../measurementUnits";
import {
  dismissCabinetOnboarding as persistCabinetOnboardingDismissal,
  isCabinetOnboardingDismissed,
  readCabinetExperiencePreference,
  writeCabinetExperiencePreference,
  type CabinetStudioExperience,
} from "../studioOnboarding";
import { getCabinetVisiblePreviewParts } from "../previewParts";
import { useDelayedCabinetPreviewRegenerationIndicator } from "../previewRegenerationIndicator";
import { applyCabinetSemanticPreviewToParts } from "../semanticPreviewParts";
import {
  cabinetStudioElapsedMs,
  collectCabinetValidationIssueExposures,
  type CabinetValidationExposureState,
} from "../validationIssueAnalytics";
import {
  resolveCabinetModuleExposedFaces,
  resolveCabinetPartFabricationSpec,
} from "../fabricationSemantics";
import {
  getCompatibleCabinetFrontHardware,
  resolveCabinetHardwareCompatibility,
} from "../hardwareCompatibility";
import { resolveCabinetTemplateHostCompatibility } from "../hostCompatibility";
import {
  getCabinetEvenShelfCenterHeights,
  getCabinetShelfCenterHeights,
  getCabinetShelfSpacingMode,
} from "../shelfLayout";
import {
  CABINET_DEFAULT_LEVELING_FOOT_COUNT,
  CABINET_DEFAULT_LEVELING_FOOT_DIAMETER,
  CABINET_DEFAULT_LEVELING_FOOT_HEIGHT,
  CABINET_DEFAULT_LEVELING_FOOT_INSET_FROM_FRONT_BACK,
  CABINET_DEFAULT_LEVELING_FOOT_INSET_FROM_SIDES,
} from "../levelingFootLayout";
import {
  CABINET_DEFAULT_FACE_FRAME_DEPTH,
  CABINET_DEFAULT_FACE_FRAME_RAIL_HEIGHT,
  CABINET_DEFAULT_FACE_FRAME_STILE_WIDTH,
} from "../faceFrameLayout";
import {
  CABINET_DEFAULT_PLUMBING_CHASE_DEPTH,
  CABINET_DEFAULT_PLUMBING_CHASE_HEIGHT,
  CABINET_DEFAULT_PLUMBING_CHASE_WIDTH,
  CABINET_DEFAULT_SINK_CUTOUT_DEPTH,
  CABINET_DEFAULT_SINK_CUTOUT_OFFSET_X,
  CABINET_DEFAULT_SINK_CUTOUT_OFFSET_Z,
  CABINET_DEFAULT_SINK_CUTOUT_WIDTH,
} from "../vanityServiceLayout";
import {
  CABINET_DEFAULT_LAUNDRY_APPLIANCE_BACK_CLEARANCE,
  CABINET_DEFAULT_LAUNDRY_APPLIANCE_COUNT,
  CABINET_DEFAULT_LAUNDRY_APPLIANCE_DEPTH,
  CABINET_DEFAULT_LAUNDRY_APPLIANCE_HEIGHT,
  CABINET_DEFAULT_LAUNDRY_APPLIANCE_KIND,
  CABINET_DEFAULT_LAUNDRY_APPLIANCE_SIDE_CLEARANCE,
  CABINET_DEFAULT_LAUNDRY_APPLIANCE_TOP_CLEARANCE,
  CABINET_DEFAULT_LAUNDRY_APPLIANCE_WIDTH,
  CABINET_DEFAULT_LAUNDRY_UTILITY_CHASE_DEPTH,
  CABINET_DEFAULT_LAUNDRY_UTILITY_CHASE_HEIGHT,
} from "../laundryApplianceLayout";
import {
  CABINET_DEFAULT_CABLE_GROMMET_COUNT,
  CABINET_DEFAULT_CABLE_GROMMET_DIAMETER,
  CABINET_DEFAULT_CABLE_GROMMET_OFFSET_FROM_BACK,
  CABINET_DEFAULT_DESK_POWER_CHASE_DEPTH,
  CABINET_DEFAULT_DESK_POWER_CHASE_HEIGHT,
  CABINET_DEFAULT_OFFICE_WORKSURFACE_DEPTH,
  CABINET_DEFAULT_OFFICE_WORKSURFACE_OVERHANG_FRONT,
  CABINET_DEFAULT_OFFICE_WORKSURFACE_THICKNESS,
} from "../officeWorkstationLayout";
import {
  CABINET_DEFAULT_ISLAND_SEATING_OVERHANG_DEPTH,
  CABINET_DEFAULT_ISLAND_SUPPORT_PANEL_COUNT,
  CABINET_DEFAULT_ISLAND_SUPPORT_PANEL_DEPTH,
  CABINET_DEFAULT_ISLAND_SUPPORT_PANEL_END_INSET,
  CABINET_DEFAULT_ISLAND_SUPPORT_PANEL_THICKNESS,
} from "../islandSeatingLayout";
import {
  CABINET_DEFAULT_PANTRY_PULL_OUT_SLIDE_CLEARANCE,
  CABINET_DEFAULT_PANTRY_PULL_OUT_TRAY_COUNT,
  CABINET_DEFAULT_PANTRY_PULL_OUT_TRAY_DEPTH,
  CABINET_DEFAULT_PANTRY_PULL_OUT_TRAY_FRONT_HEIGHT,
} from "../pantryPullOutLayout";
import {
  CABINET_DEFAULT_MEDIA_CABLE_CHASE_DEPTH,
  CABINET_DEFAULT_MEDIA_CABLE_CHASE_HEIGHT,
  CABINET_DEFAULT_MEDIA_CABLE_CHASE_WIDTH,
  CABINET_DEFAULT_MEDIA_TV_BLOCKING_THICKNESS,
  CABINET_DEFAULT_MEDIA_TV_MOUNT_HEIGHT,
  CABINET_DEFAULT_MEDIA_TV_OPENING_HEIGHT,
  CABINET_DEFAULT_MEDIA_TV_OPENING_WIDTH,
  CABINET_DEFAULT_MEDIA_VENT_SLOT_COUNT,
  CABINET_DEFAULT_MEDIA_VENT_SLOT_HEIGHT,
  CABINET_DEFAULT_MEDIA_VENT_SLOT_SPACING,
  CABINET_DEFAULT_MEDIA_VENT_SLOT_WIDTH,
  hasCabinetMediaWallDetails,
} from "../mediaWallLayout";
import {
  CABINET_DEFAULT_LIBRARY_LADDER_RAIL_DIAMETER,
  CABINET_DEFAULT_LIBRARY_LADDER_RAIL_HEIGHT,
  CABINET_DEFAULT_LIBRARY_LADDER_RAIL_PROJECTION,
  CABINET_DEFAULT_LIBRARY_LADDER_STANDOFF_COUNT,
  CABINET_DEFAULT_LIBRARY_LADDER_STANDOFF_DIAMETER,
  hasCabinetLibraryLadderRail,
} from "../libraryLadderLayout";
import {
  CABINET_DEFAULT_STEMWARE_RACK_DEPTH,
  CABINET_DEFAULT_STEMWARE_RACK_LANE_COUNT,
  CABINET_DEFAULT_STEMWARE_RACK_LANE_SPACING,
  CABINET_DEFAULT_STEMWARE_RACK_MOUNT_HEIGHT,
  CABINET_DEFAULT_STEMWARE_RACK_RAIL_WIDTH,
  hasCabinetStemwareRack,
} from "../stemwareRackLayout";
import {
  CABINET_DEFAULT_LIGHTING_CHANNEL_COUNT,
  CABINET_DEFAULT_LIGHTING_CHANNEL_DEPTH,
  CABINET_DEFAULT_LIGHTING_CHANNEL_HEIGHT,
  CABINET_DEFAULT_LIGHTING_CHANNEL_INSET_FROM_FRONT,
  hasCabinetLightingChannels,
} from "../lightingLayout";
import {
  CABINET_DEFAULT_HAMPER_BASKET_COUNT,
  CABINET_DEFAULT_HAMPER_BASKET_DEPTH,
  CABINET_DEFAULT_HAMPER_BASKET_HEIGHT,
  CABINET_DEFAULT_HAMPER_SLIDE_CLEARANCE,
  hasCabinetHamperPullOut,
} from "../hamperPullOutLayout";
import {
  CABINET_DEFAULT_SHELF_PIN_HOLE_COUNT,
  CABINET_DEFAULT_SHELF_PIN_HOLE_SPACING,
  CABINET_DEFAULT_SHELF_PIN_INSET_FROM_FRONT,
  CABINET_DEFAULT_SHELF_PIN_ROW_PAIR_COUNT,
  CABINET_DEFAULT_SHELF_PIN_START_HEIGHT,
  hasCabinetShelfPinRows,
} from "../shelfPinLayout";
import {
  CABINET_DEFAULT_DOOR_HINGE_COUNT_PER_DOOR,
  CABINET_DEFAULT_DOOR_HINGE_INSET_FROM_TOP_BOTTOM,
  hasCabinetDoorHinges,
} from "../doorHingeLayout";
import {
  CABINET_DEFAULT_DRAWER_SLIDE_CLEARANCE,
  CABINET_DEFAULT_DRAWER_SLIDE_LENGTH,
  getCabinetDrawerFrontLayouts,
  hasCabinetDrawerSlides,
} from "../drawerSlideLayout";
import {
  CABINET_DEFAULT_DRAWER_BOX_BACK_CLEARANCE,
  CABINET_DEFAULT_DRAWER_BOX_BOTTOM_THICKNESS,
  CABINET_DEFAULT_DRAWER_BOX_HEIGHT_CLEARANCE,
  CABINET_DEFAULT_DRAWER_BOX_SIDE_THICKNESS,
  hasCabinetDrawerBoxes,
} from "../drawerBoxLayout";
import {
  getCabinetDoorLayoutMode,
  getCabinetDrawerHeightMode,
  getCabinetDrawerHeightProportions,
  getCabinetEffectiveDoorCount,
  getCabinetHandlePlacementMode,
  isCabinetFrontHandleType,
  resizeCabinetDrawerHeightProportions,
  setCabinetDoorLayoutMode,
  setCabinetDrawerHeightMode,
  setCabinetHandlePlacementMode,
} from "../frontBehavior";
import {
  CABINET_DEFAULT_INSTALLATION_CLEAT_HEIGHT,
  CABINET_DEFAULT_INSTALLATION_CLEAT_INSET_FROM_TOP,
  CABINET_DEFAULT_INSTALLATION_CLEAT_THICKNESS,
  hasCabinetInstallationCleat,
} from "../installationCleatLayout";
import {
  CABINET_DEFAULT_ANTI_TIP_ANCHOR_COUNT,
  CABINET_DEFAULT_ANTI_TIP_ANCHOR_INSET_FROM_SIDES,
  getCabinetAntiTipAnchorHeight,
  hasCabinetAntiTipAnchors,
} from "../antiTipAnchorLayout";
import {
  CABINET_DEFAULT_TRIM_REVEAL_STRIP_DEPTH,
  CABINET_DEFAULT_TRIM_REVEAL_STRIP_HEIGHT,
  CABINET_DEFAULT_TRIM_REVEAL_STRIP_INSET_FROM_TOP,
  getCabinetFireplaceHeaderHeight,
  getCabinetFireplaceLegWidth,
  getCabinetFireplaceMantelDepth,
  getCabinetFireplaceMantelHeight,
  getCabinetFireplaceOpeningHeight,
  getCabinetFireplaceOpeningWidth,
  getCabinetTrimMemberCount,
  getCabinetTrimMiterAngle,
  getCabinetTrimProfileDepth,
  getCabinetTrimProfileWidth,
  getCabinetTrimReturnDepth,
  getCabinetTrimSetoutHeight,
  hasCabinetTrimRevealStrip,
} from "../trimLayout";
import {
  getCabinetCeilingBeamCount,
  getCabinetCeilingBeamDepth,
  getCabinetCeilingBeamWidth,
  getCabinetCeilingGridColumnCount,
  getCabinetCeilingGridRowCount,
} from "../ceilingBeamLayout";
import {
  CABINET_WALL_BED_MATTRESS_DIMENSIONS,
  getCabinetConvertibleHingeHeight,
  getCabinetConvertibleOpenDepth,
  getCabinetConvertiblePanelHeight,
  getCabinetConvertiblePanelThickness,
  getCabinetConvertibleSupportLegCount,
  getCabinetConvertibleSupportLegDepth,
  getCabinetConvertibleSupportLegWidth,
  getCabinetWallBedDisplayState,
  getCabinetWallBedMattressSize,
  getCabinetWallBedOrientation,
  getCabinetWallBedRecommendedGeometry,
  getCabinetWallBedSideStorage,
  isCabinetWallBedPanel,
} from "../convertibleLayout";
import {
  downloadCabinetFabricationQuoteRequestJson,
  downloadCabinetDocumentationCsv,
  downloadCabinetDocumentationPackageJson,
  downloadCabinetSourceDefinitionJson,
  generateCabinetDocumentation,
  parseCabinetSourceDefinitionJson,
} from "../generateCabinetDocumentation";
import {
  CABINET_PRESET_OPTIONS,
  cabinetPresetMatchesCatalogFilters,
  createCabinetPreset,
  getCabinetPresetSearchText,
  type CabinetPresetId,
  type CabinetTemplateCategory,
  type CabinetTemplateVisualThumbnailKind,
} from "../presets";
import {
  CABINET_PROPERTY_REGISTRY,
  filterCabinetProperties,
} from "../propertyRegistry";
import { findCabinetNonFiniteNumbers, validateCabinetNumberDraft } from "../numericInput";
import { validateCabinetDefinition } from "../validation";
import {
  applyCabinetWardrobeArrangement,
  CABINET_WARDROBE_ARRANGEMENTS,
  getMatchingCabinetWardrobeArrangementId,
  type CabinetWardrobeArrangementId,
} from "../wardrobeArrangements";
import type {
  CabinetBOMItem,
  CabinetDefinition,
  CabinetFrontType,
  CabinetFitAlignment,
  CabinetFitMode,
  CabinetHostKind,
  CabinetHostSpace,
  CabinetLaundryApplianceKind,
  CabinetLifestyleInsertKind,
  CabinetMillworkComponentType,
  CabinetModuleDefinition,
  CabinetPart,
  CabinetGrainDirection,
  CabinetEdgeTreatment,
  CabinetExposedFace,
  CabinetValidationAutoFix,
  CabinetValidationIssue,
  CabinetStairScribeDirection,
  CabinetTrimEndTreatment,
  CabinetTrimPlacement,
  CabinetUnitType,
  CabinetWallBedDisplayState,
  CabinetWallBedMattressSize,
  CabinetWallBedOrientation,
  CabinetWallBedSideStorage,
  DoorStyle,
} from "../types";
import {
  CabinetSceneItem,
  type CabinetSemanticSelection,
} from "./CabinetSceneItem";
import {
  CabinetOverallDimensionHandles,
  type CabinetDimensionPreview,
  type CabinetOverallDimensionField,
} from "./CabinetOverallDimensionHandles";
import {
  CabinetSemanticEditOverlays,
  type CabinetSemanticEditPreview,
} from "./CabinetSemanticEditOverlays";
import {
  CabinetPreviewCameraController,
  CabinetPreviewViewSelector,
  type CabinetPreviewView,
} from "./CabinetPreviewCameraController";
import { CabinetNumberField } from "./CabinetNumberField";
import { useCabinetMeasurementUnit } from "./CabinetMeasurementUnitContext";
import {
  CabinetDoorStylePreview,
  CabinetHandleTypePreview,
} from "./CabinetChoicePreviews";
import {
  CabinetDrawerConfigurationPreview,
  CabinetWallBedConfigurationPreview,
  CabinetWallPanelPatternPreview,
} from "./CabinetConfigurationPreviews";
import { CabinetContextualOnboarding } from "./CabinetContextualOnboarding";

export interface CabinetryStudioProps {
  initialDefinition?: CabinetDefinition;
  availableSpaces?: CabinetHostSpace[];
  preferredSpaceId?: string | null;
  mode: "create" | "edit";
  accessLevel: "consumer" | "pro";
  onSave?: (definition: CabinetDefinition) => boolean | Promise<boolean>;
  onPlaceInPlan?: (payload: {
    definition: CabinetDefinition;
    glbBlob: Blob;
    bom: CabinetBOMItem[];
    placeAsCopy?: boolean;
  }) => boolean | Promise<boolean>;
  onCancel?: () => void;
}

const frontTypes: CabinetFrontType[] = [
  "open",
  "single_door",
  "double_door",
  "drawer_stack",
  "door_and_drawer",
  "slab_panel",
];

function cabinetPresetIdFromDefinition(
  definition?: CabinetDefinition
): CabinetPresetId | null {
  if (!definition) return null;
  const sourcePresetId = definition?.sourcePresetId;
  if (
    sourcePresetId &&
    CABINET_PRESET_OPTIONS.some((preset) => preset.id === sourcePresetId)
  ) {
    return sourcePresetId as CabinetPresetId;
  }
  const normalizedName = definition.name.trim().toLowerCase();
  const nameMatch = CABINET_PRESET_OPTIONS.find(
    (preset) => preset.label.trim().toLowerCase() === normalizedName
  );
  if (nameMatch) return nameMatch.id;
  if (!definition.millworkAssemblyType) return null;
  const assemblyMatches = CABINET_PRESET_OPTIONS.filter(
    (preset) =>
      createCabinetPreset(preset.id, "preset-host-migration").millworkAssemblyType ===
      definition.millworkAssemblyType
  );
  return assemblyMatches.length === 1 ? assemblyMatches[0].id : null;
}

const doorStyles: DoorStyle[] = ["flat_slab", "shaker", "glass", "fluted"];
const grainDirectionOptions: Array<{ value: "automatic" | CabinetGrainDirection; label: string }> = [
  { value: "automatic", label: "Automatic from material and part" },
  { value: "vertical", label: "Vertical" },
  { value: "horizontal", label: "Horizontal" },
  { value: "none", label: "No directional grain" },
];
const edgeTreatmentOptions: Array<{ value: "automatic" | CabinetEdgeTreatment; label: string }> = [
  { value: "automatic", label: "Automatic matching edge" },
  { value: "matching_edge_band", label: "Matching edge band" },
  { value: "contrasting_edge_band", label: "Contrasting edge band" },
  { value: "solid_lipping", label: "Solid lipping" },
  { value: "painted_edge", label: "Painted edge" },
  { value: "none", label: "No edge treatment" },
];
const exposedFaceOptions: Array<{ value: CabinetExposedFace; label: string }> = [
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
];
const unitTypes: CabinetUnitType[] = ["base", "wall", "tall", "vanity", "tv_console", "wardrobe"];
const componentTypes: CabinetMillworkComponentType[] = [
  "cabinet",
  "ceiling_beam_array",
  "coffered_ceiling_grid",
  "trim_run",
  "fireplace_surround_frame",
  "wall_bed_panel",
  "fold_down_worksurface",
];
const hingeSides: NonNullable<CabinetModuleDefinition["hingeSide"]>[] = ["left", "right", "double"];
const CABINET_CONSTRUCTION_RESET_FIELDS = [
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
const stairScribeDirections: CabinetStairScribeDirection[] = ["rises_left", "rises_right"];
const lifestyleInsertKinds: CabinetLifestyleInsertKind[] = ["pet_bed", "toy_bin", "hobby_tray"];
const laundryApplianceKinds: CabinetLaundryApplianceKind[] = ["washer", "dryer", "washer_dryer", "stacked_washer_dryer"];
const trimPlacements: CabinetTrimPlacement[] = ["baseboard", "crown_moulding", "casing", "chair_rail", "picture_rail", "generic_trim"];
const trimEndTreatments: CabinetTrimEndTreatment[] = ["butt", "mitered_return", "coped", "scribed"];

type SpecialtyNumberFieldDefinition = {
  field: Extract<keyof CabinetModuleDefinition, string>;
  label: string;
  testId: string;
  step: number;
  min?: number;
  max?: number;
};

function getSpecialtyNumberFields(
  componentType: CabinetMillworkComponentType
): SpecialtyNumberFieldDefinition[] {
  if (componentType === "ceiling_beam_array" || componentType === "coffered_ceiling_grid") {
    return [
      ...(componentType === "ceiling_beam_array"
        ? [{ field: "ceilingBeamCount", label: "Beam count", testId: "cabinet-input-ceiling-beams", step: 1 }] satisfies SpecialtyNumberFieldDefinition[]
        : []),
      { field: "ceilingBeamWidth", label: "Beam width", testId: "cabinet-input-ceiling-beam-width", step: 1 },
      { field: "ceilingBeamDepth", label: "Beam depth", testId: "cabinet-input-ceiling-beam-depth", step: 1 },
      ...(componentType === "coffered_ceiling_grid"
        ? [
            { field: "ceilingGridColumnCount", label: "Grid columns", testId: "cabinet-input-ceiling-grid-columns", step: 1 },
            { field: "ceilingGridRowCount", label: "Grid rows", testId: "cabinet-input-ceiling-grid-rows", step: 1 },
          ] satisfies SpecialtyNumberFieldDefinition[]
        : []),
    ];
  }
  if (componentType === "trim_run") {
    return [
      { field: "trimMemberCount", label: "Trim pieces", testId: "cabinet-input-trim-members", step: 1 },
      { field: "trimProfileWidth", label: "Profile width", testId: "cabinet-input-trim-profile-width", step: 1 },
      { field: "trimProfileDepth", label: "Profile depth", testId: "cabinet-input-trim-profile-depth", step: 1 },
      { field: "trimSetoutHeight", label: "Installation height", testId: "cabinet-input-trim-setout-height", step: 10 },
      { field: "trimReturnDepth", label: "Return depth", testId: "cabinet-input-trim-return-depth", step: 5 },
      { field: "trimMiterAngle", label: "Miter angle", testId: "cabinet-input-trim-miter-angle", step: 1, min: 1, max: 89 },
    ];
  }
  if (componentType === "fireplace_surround_frame") {
    return [
      { field: "fireplaceOpeningWidth", label: "Opening width", testId: "cabinet-input-fireplace-opening-width", step: 10 },
      { field: "fireplaceOpeningHeight", label: "Opening height", testId: "cabinet-input-fireplace-opening-height", step: 10 },
      { field: "fireplaceLegWidth", label: "Leg width", testId: "cabinet-input-fireplace-leg-width", step: 10 },
      { field: "fireplaceHeaderHeight", label: "Header height", testId: "cabinet-input-fireplace-header-height", step: 10 },
      { field: "fireplaceMantelHeight", label: "Mantel height", testId: "cabinet-input-fireplace-mantel-height", step: 10 },
      { field: "fireplaceMantelDepth", label: "Mantel depth", testId: "cabinet-input-fireplace-mantel-depth", step: 10 },
    ];
  }
  return [
    { field: "convertiblePanelThickness", label: "Panel thickness", testId: "cabinet-input-convertible-panel-thickness", step: 1 },
    { field: "convertiblePanelHeight", label: "Panel height", testId: "cabinet-input-convertible-panel-height", step: 10 },
    { field: "convertibleOpenDepth", label: "Open depth", testId: "cabinet-input-convertible-open-depth", step: 10 },
    { field: "convertibleHingeHeight", label: "Hinge height", testId: "cabinet-input-convertible-hinge-height", step: 10 },
    { field: "convertibleSupportLegCount", label: "Support legs", testId: "cabinet-input-convertible-support-legs", step: 1 },
    { field: "convertibleSupportLegWidth", label: "Leg width", testId: "cabinet-input-convertible-support-leg-width", step: 1 },
    { field: "convertibleSupportLegDepth", label: "Leg depth", testId: "cabinet-input-convertible-support-leg-depth", step: 1 },
  ];
}

function getSpecialtyNumberValue(
  module: CabinetModuleDefinition,
  field: SpecialtyNumberFieldDefinition["field"]
): number {
  if (field === "ceilingBeamCount") return getCabinetCeilingBeamCount(module);
  if (field === "ceilingBeamWidth") return getCabinetCeilingBeamWidth(module);
  if (field === "ceilingBeamDepth") return getCabinetCeilingBeamDepth(module);
  if (field === "ceilingGridColumnCount") return getCabinetCeilingGridColumnCount(module);
  if (field === "ceilingGridRowCount") return getCabinetCeilingGridRowCount(module);
  if (field === "trimMemberCount") return getCabinetTrimMemberCount(module);
  if (field === "trimProfileWidth") return getCabinetTrimProfileWidth(module);
  if (field === "trimProfileDepth") return getCabinetTrimProfileDepth(module);
  if (field === "trimSetoutHeight") return getCabinetTrimSetoutHeight(module);
  if (field === "trimReturnDepth") return getCabinetTrimReturnDepth(module);
  if (field === "trimMiterAngle") return getCabinetTrimMiterAngle(module);
  if (field === "fireplaceOpeningWidth") return getCabinetFireplaceOpeningWidth(module);
  if (field === "fireplaceOpeningHeight") return getCabinetFireplaceOpeningHeight(module);
  if (field === "fireplaceLegWidth") return getCabinetFireplaceLegWidth(module);
  if (field === "fireplaceHeaderHeight") return getCabinetFireplaceHeaderHeight(module);
  if (field === "fireplaceMantelHeight") return getCabinetFireplaceMantelHeight(module);
  if (field === "fireplaceMantelDepth") return getCabinetFireplaceMantelDepth(module);
  if (field === "convertiblePanelThickness") return getCabinetConvertiblePanelThickness(module);
  if (field === "convertiblePanelHeight") return getCabinetConvertiblePanelHeight(module);
  if (field === "convertibleOpenDepth") return getCabinetConvertibleOpenDepth(module);
  if (field === "convertibleHingeHeight") return getCabinetConvertibleHingeHeight(module);
  if (field === "convertibleSupportLegCount") return getCabinetConvertibleSupportLegCount(module);
  if (field === "convertibleSupportLegWidth") return getCabinetConvertibleSupportLegWidth(module);
  if (field === "convertibleSupportLegDepth") return getCabinetConvertibleSupportLegDepth(module);
  const value = module[field];
  return typeof value === "number" ? value : 0;
}

const labelize = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const freshDefinition = () => createCabinetPreset("base", `cabinet-${Date.now()}`);

function touchDefinition(definition: CabinetDefinition): CabinetDefinition {
  const totalWidth = getCabinetOverallWidth(definition);
  return {
    ...definition,
    totalWidth,
    height: getCabinetOverallHeight(definition),
    depth: getCabinetOverallDepth(definition),
    updatedAt: new Date().toISOString(),
  };
}

function selectClass() {
  return "h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm text-neutral-900 outline-none focus:border-neutral-900";
}

function sectionTitle(title: string) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>;
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-neutral-600">
      <span>{label}</span>
      {children}
      {helper ? <span className="text-[10px] font-normal leading-4 text-neutral-400">{helper}</span> : null}
    </label>
  );
}

function CabinetModuleOptionGroup({
  id,
  visible,
  children,
}: {
  id: CabinetModuleOptionGroupId;
  visible: boolean;
  children: React.ReactNode;
}) {
  if (!visible) return null;
  return (
    <div
      className="contents"
      data-testid={`cabinet-module-option-group-${id.replace(/_/g, "-")}`}
    >
      {children}
    </div>
  );
}

const GUIDED_STEPS = [
  { id: "type", label: "Type", hint: "Choose what to build", icon: Sparkles },
  { id: "space", label: "Space", hint: "Choose where it will go", icon: MapPin },
  { id: "size", label: "Size", hint: "Set the available size", icon: Ruler },
  { id: "layout", label: "Layout", hint: "Arrange useful storage", icon: Layers3 },
  { id: "style", label: "Style", hint: "Choose finishes", icon: Palette },
  { id: "review", label: "Review", hint: "Check and place", icon: Check },
] as const;
const OUTPUT_TABS = [
  ["overview", "Overview"],
  ["issues", "Issues"],
  ["bom", "BOM"],
  ["materials", "Materials"],
  ["hardware", "Hardware"],
  ["outputs", "Outputs"],
] as const;
type CabinetOutputTab = (typeof OUTPUT_TABS)[number][0];
const CABINET_CUSTOM_TEMPLATE_STORAGE_KEY = "interior-ai:millwork-custom-templates:v1";
const CABINET_CUSTOM_SPACE_STORAGE_KEY = "interior-ai:millwork-custom-host-spaces:v1";
const CABINET_INSPECTOR_PREFERENCES_STORAGE_KEY = "interior-ai:millwork-inspector-preferences:v1";
const CABINET_STUDIO_STORAGE_VERSION = 1;
const CABINET_CUSTOM_SPACE_LIMIT = 24;
const CABINET_CUSTOM_SPACE_KINDS = ["niche", "opening", "rectangular_area"] as const;
const CABINET_ROOM_TYPES = ["living", "bedroom", "dining", "kitchen", "toilet", "custom"] as const;
const CABINET_SHELF_LAYOUT_FIELDS = [
  "shelfCount",
  "shelfSpacingMode",
  "shelfPositionsMm",
  "shelfPinRowsEnabled",
  "shelfPinRowPairCount",
  "shelfPinHoleCount",
  "shelfPinHoleSpacing",
  "shelfPinInsetFromFront",
  "shelfPinStartHeight",
] as const satisfies readonly (keyof CabinetModuleDefinition)[];

function cabinetShelfLayoutParameterPath(moduleId: string): string {
  return `modules.${moduleId}.shelfLayout`;
}

interface SavedCabinetTemplate {
  id: string;
  name: string;
  savedAt: string;
  definition: CabinetDefinition;
}

interface CabinetTemplateSourceIdentity {
  presetId: CabinetPresetId | null;
  savedTemplateId: string | null;
}

interface CabinetHistoryEntry extends CabinetTemplateSourceIdentity {
  definition: CabinetDefinition;
}

interface CabinetInspectorPreferences {
  moduleOptionsOpen: boolean;
  advancedOpen: boolean;
  fabricationOpen: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFiniteMeasurement(
  value: unknown,
  minimum: number,
  maximum: number
): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isOptionalStoredString(value: unknown, maximumLength: number): value is string | undefined {
  return (
    value === undefined ||
    (typeof value === "string" &&
      value.length > 0 &&
      value.length <= maximumLength &&
      value === value.trim())
  );
}

function isStoredCabinetCustomSpaceKind(
  value: unknown
): value is (typeof CABINET_CUSTOM_SPACE_KINDS)[number] {
  return CABINET_CUSTOM_SPACE_KINDS.some((candidate) => candidate === value);
}

function isStoredCabinetRoomType(
  value: unknown
): value is (typeof CABINET_ROOM_TYPES)[number] {
  return CABINET_ROOM_TYPES.some((candidate) => candidate === value);
}

function parseStoredCabinetCustomSpace(value: unknown): CabinetHostSpace | null {
  if (!isRecord(value)) return null;
  const kind = value.kind;
  const id = value.id;
  const label = value.label;
  if (
    typeof id !== "string" ||
    id.length > 128 ||
    !/^custom-space-[a-zA-Z0-9_-]+$/.test(id) ||
    !isStoredCabinetCustomSpaceKind(kind) ||
    typeof label !== "string" ||
    label.length === 0 ||
    label.length > 80 ||
    label !== label.trim() ||
    !isOptionalStoredString(value.roomId, 160) ||
    !isOptionalStoredString(value.roomName, 160) ||
    (value.roomType !== undefined && !isStoredCabinetRoomType(value.roomType)) ||
    !isFiniteMeasurement(value.availableWidthMm, 1, 100_000) ||
    !isFiniteMeasurement(value.availableHeightMm, 1, 30_000) ||
    !isFiniteMeasurement(value.availableDepthMm, 1, 30_000) ||
    !isFiniteMeasurement(value.baseboardOffsetMm, 0, 5_000) ||
    !isFiniteMeasurement(value.installationClearanceLeftMm, 0, 5_000) ||
    !isFiniteMeasurement(value.installationClearanceRightMm, 0, 5_000) ||
    !isFiniteMeasurement(value.installationClearanceTopMm, 0, 5_000) ||
    (value.mountingHeightMm !== undefined &&
      !isFiniteMeasurement(value.mountingHeightMm, 0, 30_000)) ||
    !Array.isArray(value.openings) ||
    value.openings.length !== 0
  ) {
    return null;
  }

  return {
    id,
    kind,
    label,
    roomId: value.roomId,
    roomName: value.roomName,
    roomType: value.roomType,
    availableWidthMm: value.availableWidthMm,
    availableHeightMm: value.availableHeightMm,
    availableDepthMm: value.availableDepthMm,
    baseboardOffsetMm: value.baseboardOffsetMm,
    installationClearanceLeftMm: value.installationClearanceLeftMm,
    installationClearanceRightMm: value.installationClearanceRightMm,
    installationClearanceTopMm: value.installationClearanceTopMm,
    mountingHeightMm: value.mountingHeightMm,
    openings: [],
  };
}

function writeStoredCabinetCustomSpaces(spaces: readonly CabinetHostSpace[]): void {
  if (typeof window === "undefined") return;
  const normalized = spaces
    .map(parseStoredCabinetCustomSpace)
    .filter((space): space is CabinetHostSpace => Boolean(space))
    .slice(-CABINET_CUSTOM_SPACE_LIMIT);
  try {
    if (!normalized.length) {
      window.localStorage.removeItem(CABINET_CUSTOM_SPACE_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      CABINET_CUSTOM_SPACE_STORAGE_KEY,
      JSON.stringify({ version: CABINET_STUDIO_STORAGE_VERSION, spaces: normalized })
    );
  } catch {
    // Browser persistence is optional; the current session remains usable.
  }
}

function readStoredCabinetCustomSpaces(): CabinetHostSpace[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CABINET_CUSTOM_SPACE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (
      !isRecord(parsed) ||
      parsed.version !== CABINET_STUDIO_STORAGE_VERSION ||
      !Array.isArray(parsed.spaces)
    ) {
      window.localStorage.removeItem(CABINET_CUSTOM_SPACE_STORAGE_KEY);
      return [];
    }

    const seen = new Set<string>();
    const spaces: CabinetHostSpace[] = [];
    for (let index = parsed.spaces.length - 1; index >= 0; index -= 1) {
      const space = parseStoredCabinetCustomSpace(parsed.spaces[index]);
      if (!space || seen.has(space.id)) continue;
      seen.add(space.id);
      spaces.unshift(space);
      if (spaces.length === CABINET_CUSTOM_SPACE_LIMIT) break;
    }

    const canonical = JSON.stringify({ version: CABINET_STUDIO_STORAGE_VERSION, spaces });
    if (canonical !== raw) {
      writeStoredCabinetCustomSpaces(spaces);
    }
    return spaces;
  } catch {
    try {
      window.localStorage.removeItem(CABINET_CUSTOM_SPACE_STORAGE_KEY);
    } catch {
      // Ignore storage access failures.
    }
    return [];
  }
}

function capCabinetCustomSpaces(
  spaces: readonly CabinetHostSpace[],
  pinnedSpaceId?: string
): CabinetHostSpace[] {
  const deduplicated = new Map<string, CabinetHostSpace>();
  spaces.forEach((space) => {
    deduplicated.delete(space.id);
    deduplicated.set(space.id, space);
  });
  const allSpaces = Array.from(deduplicated.values());
  const measured = allSpaces.filter((space) => parseStoredCabinetCustomSpace(space));
  const sessionOnly = allSpaces.filter((space) => !parseStoredCabinetCustomSpace(space));
  let keptMeasured = measured.slice(-CABINET_CUSTOM_SPACE_LIMIT);
  const pinned = pinnedSpaceId
    ? measured.find((space) => space.id === pinnedSpaceId)
    : undefined;
  if (pinned && !keptMeasured.some((space) => space.id === pinned.id)) {
    keptMeasured = [pinned, ...keptMeasured.slice(-(CABINET_CUSTOM_SPACE_LIMIT - 1))];
  }
  return [...sessionOnly, ...keptMeasured];
}

function readCabinetInspectorPreferences(): CabinetInspectorPreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CABINET_INSPECTOR_PREFERENCES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      !isRecord(parsed) ||
      parsed.version !== CABINET_STUDIO_STORAGE_VERSION ||
      typeof parsed.moduleOptionsOpen !== "boolean" ||
      typeof parsed.advancedOpen !== "boolean" ||
      typeof parsed.fabricationOpen !== "boolean"
    ) {
      window.localStorage.removeItem(CABINET_INSPECTOR_PREFERENCES_STORAGE_KEY);
      return null;
    }
    return {
      moduleOptionsOpen: parsed.moduleOptionsOpen,
      advancedOpen: parsed.advancedOpen,
      fabricationOpen: parsed.fabricationOpen,
    };
  } catch {
    try {
      window.localStorage.removeItem(CABINET_INSPECTOR_PREFERENCES_STORAGE_KEY);
    } catch {
      // Ignore storage access failures.
    }
    return null;
  }
}

function readSavedCabinetTemplates(): SavedCabinetTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(CABINET_CUSTOM_TEMPLATE_STORAGE_KEY) ?? "[]"
    ) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is SavedCabinetTemplate => {
      if (!value || typeof value !== "object") return false;
      const candidate = value as Partial<SavedCabinetTemplate>;
      return Boolean(
        typeof candidate.id === "string" &&
          typeof candidate.name === "string" &&
          typeof candidate.savedAt === "string" &&
          candidate.definition &&
          Array.isArray(candidate.definition.modules)
      );
    });
  } catch {
    return [];
  }
}

const GUIDED_TEMPLATE_CATEGORIES: CabinetTemplateCategory[] = Array.from(
  new Set(CABINET_PRESET_OPTIONS.map((preset) => preset.category))
);

const GUIDED_MATERIALS = CABINET_MATERIALS.filter(
  (material) => !["service_zone_marker", "upholstery_neutral", "glass"].includes(material.id)
);

const GUIDED_HARDWARE = CABINET_HARDWARE.filter((hardware) =>
  [
    "none",
    "brushed_steel_bar_pull",
    "black_bar_pull",
    "round_knob",
    "edge_pull",
    "push_to_open",
  ].includes(hardware.id)
);

function roundToIncrement(value: number, increment = 10): number {
  return Math.round(value / increment) * increment;
}

function resizeCabinetDefinition(
  definition: CabinetDefinition,
  field: "height" | "depth",
  requestedValue: number
): CabinetDefinition {
  if (!Number.isFinite(requestedValue) || definition.modules.length === 0) return definition;

  if (field === "height") {
    const currentRunHeight = Math.max(...definition.modules.map((module) => module.height));
    const fixedHeight = getCabinetOverallHeight(definition) - currentRunHeight;
    const targetRunHeight = Math.max(200, requestedValue - fixedHeight);
    const scale = currentRunHeight > 0 ? targetRunHeight / currentRunHeight : 1;
    const tallestIndex = definition.modules.findIndex((module) => module.height === currentRunHeight);
    return {
      ...definition,
      modules: definition.modules.map((module, index) => ({
        ...module,
        height:
          index === tallestIndex
            ? targetRunHeight
            : Math.max(200, roundToIncrement(module.height * scale)),
      })),
    };
  }

  const currentRunDepth = Math.max(...definition.modules.map((module) => module.depth));
  const fixedDepth = getCabinetOverallDepth(definition) - currentRunDepth;
  const targetRunDepth = Math.max(120, requestedValue - fixedDepth);
  const scale = currentRunDepth > 0 ? targetRunDepth / currentRunDepth : 1;
  const deepestIndex = definition.modules.findIndex((module) => module.depth === currentRunDepth);
  return {
    ...definition,
    modules: definition.modules.map((module, index) => ({
      ...module,
      depth:
        index === deepestIndex
          ? targetRunDepth
          : Math.max(120, roundToIncrement(module.depth * scale)),
    })),
  };
}

function guidedFrontPatch(frontType: CabinetFrontType): Partial<CabinetModuleDefinition> {
  const automaticFrontDefaults = {
    doorLayoutMode: "recommended" as const,
    drawerHeightMode: "recommended" as const,
    drawerHeightProportions: undefined,
  };
  if (frontType === "open") return { ...automaticFrontDefaults, frontType, doorCount: 0, drawerCount: 0 };
  if (frontType === "single_door") return { ...automaticFrontDefaults, frontType, doorCount: 1, drawerCount: 0, hingeSide: "left" };
  if (frontType === "double_door") return { ...automaticFrontDefaults, frontType, doorCount: 2, drawerCount: 0, hingeSide: "double" };
  if (frontType === "drawer_stack") return { ...automaticFrontDefaults, frontType, doorCount: 0, drawerCount: 3 };
  if (frontType === "door_and_drawer") return { ...automaticFrontDefaults, frontType, doorCount: 2, drawerCount: 1, hingeSide: "double" };
  return { ...automaticFrontDefaults, frontType, doorCount: 1, drawerCount: 0 };
}

function GuidedNumberField({
  label,
  value,
  min,
  max,
  step = 10,
  suffix,
  testId,
  fieldPath,
  issues = [],
  disabled = false,
  disabledReason,
  integer = false,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  step?: number;
  suffix?: string;
  testId: string;
  fieldPath?: string;
  issues?: CabinetValidationIssue[];
  disabled?: boolean;
  disabledReason?: string;
  integer?: boolean;
  onCommit: (value: number) => void;
}) {
  return (
    <CabinetNumberField
      label={label}
      value={value}
      min={min}
      max={max}
      step={suffix === "mm" ? 1 : step}
      keyboardStep={step}
      integer={integer}
      unit={suffix}
      testId={testId}
      fieldPath={fieldPath}
      issues={issues}
      disabled={disabled}
      disabledReason={disabledReason}
      inputClassName="h-11 rounded-xl text-base"
      onCommit={onCommit}
    />
  );
}

function ValidationIssueCard({
  issue,
  onFocus,
  onRequestFix,
}: {
  issue: CabinetValidationIssue;
  onFocus: (issue: CabinetValidationIssue) => void;
  onRequestFix: (issue: CabinetValidationIssue, fix: CabinetValidationAutoFix) => void;
}) {
  const measurementUnit = useCabinetMeasurementUnit();
  const formatFeedback = (message: string) =>
    formatCabinetMeasurementTokens(message, measurementUnit);
  const tone =
    issue.severity === "error"
      ? "border-red-200 bg-red-50 text-red-950"
      : issue.severity === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : "border-blue-200 bg-blue-50 text-blue-950";
  const testId =
    issue.severity === "error"
      ? "cabinet-validation-error"
      : issue.severity === "warning"
        ? "cabinet-validation-warning"
        : "cabinet-validation-info";

  return (
    <div
      data-testid={testId}
      data-validation-code={issue.code}
      data-validation-scope={issue.target.scope}
      className={`rounded-xl border p-3 text-xs ${tone}`}
    >
      <button
        type="button"
        className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2"
        onClick={() => onFocus(issue)}
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            {issue.severity}
          </span>
          <span className="font-semibold">{formatFeedback(issue.title)}</span>
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            {issue.target.scope}
          </span>
          {issue.target.moduleIds?.length ? (
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium">
              {issue.target.moduleIds.length === 1
                ? issue.target.moduleIds[0]
                : `${issue.target.moduleIds.length} modules`}
            </span>
          ) : null}
        </span>
        <span className="mt-1 block leading-5 opacity-90">{formatFeedback(issue.message)}</span>
        <span className="mt-1 block font-medium leading-5">{formatFeedback(issue.resolution)}</span>
      </button>
      {issue.fixes?.length ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-current/10 pt-3">
          {issue.fixes.map((fix) => (
            <button
              key={fix.id}
              type="button"
              data-testid="cabinet-validation-fix"
              data-validation-fix-id={fix.id}
              className="rounded-lg bg-white px-2.5 py-1.5 font-semibold text-neutral-900 shadow-sm ring-1 ring-black/10 hover:bg-neutral-50"
              onClick={() => onRequestFix(issue, fix)}
            >
              {formatFeedback(fix.label)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ModuleIssueBadges({ issues }: { issues: CabinetValidationIssue[] }) {
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  if (!errorCount && !warningCount) return null;

  return (
    <span className="ml-auto flex shrink-0 items-center gap-1" aria-label={`${errorCount} errors and ${warningCount} warnings`}>
      {errorCount ? (
        <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700">
          {errorCount}E
        </span>
      ) : null}
      {warningCount ? (
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
          {warningCount}W
        </span>
      ) : null}
    </span>
  );
}

function ValidationFixPreview({
  pending,
  current,
  onCancel,
  onApply,
}: {
  pending: {
    issue: CabinetValidationIssue;
    fix: CabinetValidationAutoFix;
    candidate: CabinetDefinition;
  };
  current: CabinetDefinition;
  onCancel: () => void;
  onApply: () => void;
}) {
  const measurementUnit = useCabinetMeasurementUnit();
  const formatMeasurement = (valueMm: number) =>
    formatCabinetMeasurement(valueMm, measurementUnit, {
      includeMillimetreReference: measurementUnit !== "mm",
    });
  const formatFeedback = (message: string) =>
    formatCabinetMeasurementTokens(message, measurementUnit);
  const candidateValidation = validateCabinetDefinition(pending.candidate);
  const candidateErrorCount = candidateValidation.issues.filter(
    (issue) => issue.severity === "error"
  ).length;
  const candidateWarningCount = candidateValidation.issues.filter(
    (issue) => issue.severity === "warning"
  ).length;

  return (
    <div
      role="dialog"
      aria-label={`Preview fix: ${formatFeedback(pending.fix.label)}`}
      data-testid="cabinet-fix-preview"
      className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950 shadow-sm"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">Preview change</p>
      <h4 className="mt-1 text-sm font-semibold">{formatFeedback(pending.fix.label)}</h4>
      <p className="mt-1 text-xs leading-5 text-blue-900">{formatFeedback(pending.fix.description)}</p>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-xl bg-white/70 p-3">
          <span className="font-semibold">Before</span>
          <span className="mt-1 block">
            {formatMeasurement(current.totalWidth)} × {formatMeasurement(current.height)} × {formatMeasurement(current.depth)} · {current.modules.length}{" "}
            {current.modules.length === 1 ? "module" : "modules"}
          </span>
        </div>
        <div className="rounded-xl bg-white/70 p-3">
          <span className="font-semibold">After</span>
          <span className="mt-1 block">
            {formatMeasurement(pending.candidate.totalWidth)} × {formatMeasurement(pending.candidate.height)} × {formatMeasurement(pending.candidate.depth)} ·{" "}
            {pending.candidate.modules.length}{" "}
            {pending.candidate.modules.length === 1 ? "module" : "modules"}
          </span>
          <span className="mt-1 block text-blue-700">
            {candidateErrorCount} errors · {candidateWarningCount} recommendations
          </span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          data-testid="cabinet-fix-preview-cancel"
          className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="cabinet-fix-preview-apply"
          className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800"
          onClick={onApply}
        >
          Apply change
        </button>
      </div>
    </div>
  );
}

function CabinetSpecialtyTemplateDiagram({
  kind,
}: {
  kind: Exclude<CabinetTemplateVisualThumbnailKind, "casework">;
}) {
  const commonSvgProps = {
    viewBox: "0 0 240 96",
    className: "h-full w-full",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    focusable: "false" as const,
  };

  switch (kind) {
    case "wall_bed":
      return (
        <svg {...commonSvgProps}>
          <rect x="42" y="9" width="156" height="78" rx="3" fill="#ded8ca" />
          <rect x="72" y="14" width="96" height="68" rx="2" fill="#f8f6f0" />
          <path d="M78 20h84v55H78zM83 70h74M48 18h18M48 31h18M48 44h18M174 18h18M174 31h18M174 44h18" />
          <circle cx="157" cy="48" r="2" fill="currentColor" />
        </svg>
      );
    case "fold_down_desk":
      return (
        <svg {...commonSvgProps}>
          <rect x="68" y="10" width="104" height="59" rx="3" fill="#ded8ca" />
          <path d="M78 18h84v36H78z" fill="#f8f6f0" />
          <path d="M78 53h84l24 25H54z" fill="#c8aa7d" />
          <path d="M68 69h104M62 78h116" />
        </svg>
      );
    case "platform_bed":
      return (
        <svg {...commonSvgProps}>
          <path d="M34 61h172v24H34z" fill="#c8aa7d" />
          <path d="M46 42h148l12 19H34z" fill="#f8f6f0" />
          <path d="M34 17h24v44H34z" fill="#ded8ca" />
          <path d="M91 62v22M149 62v22M40 69h45M97 69h46M155 69h45" />
          <circle cx="77" cy="76" r="1.5" fill="currentColor" />
          <circle cx="135" cy="76" r="1.5" fill="currentColor" />
          <circle cx="193" cy="76" r="1.5" fill="currentColor" />
        </svg>
      );
    case "under_stair":
      return (
        <svg {...commonSvgProps}>
          <path d="M30 82V70h32V58h32V46h32V34h32V22h50" fill="#f8f6f0" />
          <path d="M30 82h178M62 70v12M94 58v24M126 46v36M158 34v48M190 22v60" />
          <path d="M35 73h22M67 61h22M99 49h22M131 37h22M163 25h22" />
          <circle cx="55" cy="76" r="1.5" fill="currentColor" />
          <circle cx="87" cy="64" r="1.5" fill="currentColor" />
          <circle cx="119" cy="52" r="1.5" fill="currentColor" />
          <circle cx="151" cy="40" r="1.5" fill="currentColor" />
          <circle cx="183" cy="28" r="1.5" fill="currentColor" />
        </svg>
      );
    case "room_divider":
      return (
        <svg {...commonSvgProps}>
          <rect x="43" y="10" width="154" height="70" rx="2" fill="#f8f6f0" />
          <path d="M94 10v70M146 10v70M43 34h154M43 57h154" />
          <path d="M34 84h172M50 80v4M190 80v4" strokeWidth="3" />
          <rect x="50" y="16" width="36" height="12" rx="1" fill="#c8aa7d" stroke="none" />
          <rect x="154" y="63" width="35" height="11" rx="1" fill="#ded8ca" stroke="none" />
        </svg>
      );
    case "wall_paneling":
      return (
        <svg {...commonSvgProps}>
          <rect x="24" y="12" width="192" height="72" rx="2" fill="#f8f6f0" />
          {[32, 79, 126, 173].map((x) => (
            <rect key={x} x={x} y="21" width="35" height="53" rx="1" fill="#ded8ca" />
          ))}
          <path d="M24 77h192" strokeWidth="4" />
        </svg>
      );
    case "slat_wall":
      return (
        <svg {...commonSvgProps}>
          <rect x="30" y="9" width="180" height="78" rx="2" fill="#e8e3d8" stroke="none" />
          {Array.from({ length: 12 }, (_, index) => (
            <rect
              key={index}
              x={36 + index * 15}
              y="12"
              width="7"
              height="72"
              rx="2"
              fill="#9b7048"
              stroke="none"
            />
          ))}
        </svg>
      );
    case "ceiling_beams":
      return (
        <svg {...commonSvgProps}>
          <path d="M36 20h168l20 54H16z" fill="#f8f6f0" />
          {[48, 82, 116, 150, 184].map((x) => (
            <path
              key={x}
              d={`M${x} 23h12l13 46H${x - 17}z`}
              fill="#9b7048"
              stroke="none"
            />
          ))}
          <path d="M16 74h208" />
        </svg>
      );
    case "coffered_ceiling":
      return (
        <svg {...commonSvgProps}>
          <path d="M35 17h170l19 62H16z" fill="#f8f6f0" />
          <path d="M77 17 68 79M120 17v62M163 17l9 62M27 43h186M21 62h198" strokeWidth="5" />
        </svg>
      );
    case "fireplace_surround":
      return (
        <svg {...commonSvgProps}>
          <path d="M47 84V27h146v57h-28V48H75v36z" fill="#ded8ca" />
          <rect x="35" y="19" width="170" height="10" rx="2" fill="#c8aa7d" />
          <path d="M75 84V48h90v36M31 84h178" strokeWidth="3" />
          <path d="M84 77V57h72v20" fill="#554136" />
        </svg>
      );
    case "trim_package":
      return (
        <svg {...commonSvgProps}>
          <rect x="25" y="13" width="190" height="72" rx="1" fill="#f8f6f0" />
          <path d="M25 20h190M25 77h190" strokeWidth="7" />
          <path d="M83 77V34h74v43M76 29h88" strokeWidth="6" />
          <path d="M87 73V38h66v35" strokeWidth="2" />
        </svg>
      );
  }
}

function CabinetTemplateDiagram({
  definition,
  thumbnailKind = "casework",
  testId,
}: {
  definition: CabinetDefinition;
  thumbnailKind?: CabinetTemplateVisualThumbnailKind;
  testId?: string;
}) {
  const materialById = new Map(CABINET_MATERIALS.map((material) => [material.id, material]));
  const modules = definition.modules.slice(0, 5);

  return (
    <div
      aria-hidden="true"
      data-testid={testId}
      data-thumbnail-kind={thumbnailKind}
      className="flex h-24 items-end gap-1 rounded-xl bg-[#ece9e1] px-4 pb-3 pt-4"
    >
      {thumbnailKind !== "casework" ? (
        <CabinetSpecialtyTemplateDiagram kind={thumbnailKind} />
      ) : modules.map((module) => {
        const frontColor = materialById.get(module.frontMaterialId ?? module.materialId)?.color ?? "#d6d3d1";
        const heightRatio = Math.max(0.32, module.height / Math.max(...modules.map((item) => item.height)));
        return (
          <div
            key={module.id}
            className="relative min-w-0 overflow-hidden rounded-sm border border-black/15 shadow-sm"
            style={{ flex: Math.max(1, module.width), height: `${Math.round(heightRatio * 100)}%`, backgroundColor: frontColor }}
          >
            {module.frontType === "double_door" ? <span className="absolute inset-y-0 left-1/2 w-px bg-black/20" /> : null}
            {module.frontType === "single_door" || module.frontType === "double_door" ? (
              <span className="absolute right-1 top-1/2 h-1 w-1 rounded-full bg-black/50" />
            ) : null}
            {module.frontType === "drawer_stack"
              ? Array.from({ length: Math.max(2, Math.min(4, module.drawerCount)) }).map((_, index) => (
                  <span
                    key={index}
                    className="absolute inset-x-0 h-px bg-black/20"
                    style={{ top: `${((index + 1) / Math.max(2, Math.min(4, module.drawerCount))) * 100}%` }}
                  />
                ))
              : null}
            {module.frontType === "open"
              ? Array.from({ length: Math.max(1, Math.min(4, module.shelfCount)) }).map((_, index) => (
                  <span
                    key={index}
                    className="absolute inset-x-1 h-px bg-black/25"
                    style={{ top: `${((index + 1) / (Math.max(1, Math.min(4, module.shelfCount)) + 1)) * 100}%` }}
                  />
                ))
              : null}
          </div>
        );
      })}
    </div>
  );
}

function CabinetWardrobeArrangementDiagram({
  option,
}: {
  option: (typeof CABINET_WARDROBE_ARRANGEMENTS)[number];
}) {
  const { visual } = option;
  const drawerHeight = visual.drawerBands > 0 ? 30 / visual.drawerBands : 0;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 100 100"
      className="h-24 w-full rounded-xl bg-[#ece9e1] p-2 text-neutral-700"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      vectorEffect="non-scaling-stroke"
    >
      <rect x="20" y="8" width="60" height="84" rx="3" fill="currentColor" fillOpacity="0.04" />
      {visual.shelfLevels.map((level) => {
        const y = 88 - level * 76;
        return <path key={`shelf-${level}`} d={`M25 ${y}h50`} opacity="0.64" />;
      })}
      {visual.hangingRodLevels.map((level) => {
        const y = 88 - level * 76;
        return (
          <g key={`rod-${level}`}>
            <path d={`M27 ${y}h46`} strokeWidth="3" strokeLinecap="round" />
            <path
              d={`M37 ${y + 3}v6l-7 8h14l-7-8M58 ${y + 3}v6l-7 8h14l-7-8`}
              opacity="0.45"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </g>
        );
      })}
      {Array.from({ length: visual.drawerBands }, (_, index) => {
        const y = 88 - drawerHeight * (index + 1);
        return (
          <g key={`drawer-${index}`}>
            <rect x="25" y={y} width="50" height={drawerHeight - 2} rx="1.5" opacity="0.62" />
            <path d={`M46 ${y + (drawerHeight - 2) / 2}h8`} opacity="0.78" strokeLinecap="round" />
          </g>
        );
      })}
      {visual.front === "doors_and_drawer" ? (
        <path d="M50 10v48" opacity="0.18" />
      ) : null}
    </svg>
  );
}

function CabinetPreview3D({
  definition,
  generatedParts,
  view,
  showClearances,
  selection,
  onSemanticSelect,
  dimensionPreview,
}: {
  definition: CabinetDefinition;
  generatedParts?: readonly CabinetPart[];
  view: CabinetPreviewView;
  showClearances: boolean;
  selection?: CabinetSemanticSelection;
  onSemanticSelect?: (selection: CabinetSemanticSelection) => void;
  dimensionPreview?: CabinetDimensionPreview | null;
}) {
  const cameraDistance = Math.max(2.4, definition.totalWidth / 650, definition.height / 850);
  const currentWidthMm = Math.max(1, getCabinetOverallWidth(definition));
  const currentHeightMm = Math.max(1, getCabinetOverallHeight(definition));
  const currentDepthMm = Math.max(1, getCabinetOverallDepth(definition));
  const previewWidthMm =
    dimensionPreview?.field === "totalWidth" ? dimensionPreview.valueMm : currentWidthMm;
  const previewHeightMm =
    dimensionPreview?.field === "height" ? dimensionPreview.valueMm : currentHeightMm;
  const previewDepthMm =
    dimensionPreview?.field === "depth" ? dimensionPreview.valueMm : currentDepthMm;

  return (
    <Canvas
      shadows
      frameloop="demand"
      camera={{
        position: [cameraDistance, Math.max(1.4, definition.height / 900), cameraDistance * 1.25],
        fov: 42,
        near: 0.01,
        far: 50,
      }}
    >
      <CabinetPreviewCameraController
        view={view}
        widthMm={currentWidthMm}
        heightMm={currentHeightMm}
        depthMm={currentDepthMm}
        fitKey={definition.id}
      />
      <ambientLight intensity={0.48} />
      <directionalLight position={[3, 5, 4]} intensity={1.15} castShadow />
      <group
        position={[0, 0, 0]}
        scale={[
          previewWidthMm / currentWidthMm,
          previewHeightMm / currentHeightMm,
          previewDepthMm / currentDepthMm,
        ]}
      >
        <CabinetSceneItem
          definition={definition}
          generatedParts={generatedParts}
          showClearances={showClearances}
          interactive={false}
          selected={selection?.scope === "assembly"}
          highlightModuleId={selection?.moduleId}
          highlightPartId={selection?.partId}
          onSemanticSelect={onSemanticSelect}
        />
      </group>
      <Grid
        args={[6, 6]}
        cellSize={0.25}
        sectionSize={1}
        cellThickness={0.45}
        sectionThickness={0.8}
        position={[0, -0.002, 0]}
      />
      <OrbitControls
        target={[0, definition.height / 2000, 0]}
        enableRotate={view === "perspective"}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.9}
        maxDistance={8}
        maxPolarAngle={Math.PI / 2.05}
      />
    </Canvas>
  );
}

export default function CabinetryStudio({
  initialDefinition,
  availableSpaces = [],
  preferredSpaceId = null,
  mode,
  accessLevel,
  onSave,
  onPlaceInPlan,
  onCancel,
}: CabinetryStudioProps) {
  const isProWorkspace = accessLevel === "pro";
  const projectMeasurementUnit = useCabinetMeasurementUnit();
  const formatProjectMeasurement = (valueMm: number) =>
    formatCabinetMeasurement(valueMm, projectMeasurementUnit, {
      includeMillimetreReference: projectMeasurementUnit !== "mm",
    });
  const formatProjectFeedback = (message: string) =>
    formatCabinetMeasurementTokens(message, projectMeasurementUnit);
  const toProjectMeasurementValue = (valueMm: number) =>
    cabinetMillimetresToDisplay(valueMm, projectMeasurementUnit);
  const fromProjectMeasurementValue = (value: number) =>
    cabinetDisplayToMillimetres(value, projectMeasurementUnit);
  const parseProjectMeasurementDraft = (
    draft: string,
    minimumMm: number,
    maximumMm: number
  ): number | null => {
    const parsed = validateCabinetNumberDraft(draft, {
      min: toProjectMeasurementValue(minimumMm),
      max: toProjectMeasurementValue(maximumMm),
      unit: projectMeasurementUnit,
    });
    return parsed.status === "valid"
      ? fromProjectMeasurementValue(parsed.value)
      : null;
  };
  const initialNumericIntegrityIssue = initialDefinition
    ? findCabinetNonFiniteNumbers(initialDefinition)[0]
    : undefined;
  const acceptedInitialDefinition = initialNumericIntegrityIssue ? undefined : initialDefinition;
  const acceptedInitialPresetId = cabinetPresetIdFromDefinition(
    acceptedInitialDefinition
  );
  const acceptedInitialPreset = CABINET_PRESET_OPTIONS.find(
    (preset) => preset.id === acceptedInitialPresetId
  );
  const hydratedInitialDefinition =
    acceptedInitialDefinition && acceptedInitialPreset
      ? {
          ...acceptedInitialDefinition,
          sourcePresetId: acceptedInitialPreset.id,
          requiredHostType: acceptedInitialPreset.requiredHostType,
        }
      : acceptedInitialDefinition;
  const [definition, setDefinition] = useState<CabinetDefinition>(() =>
    initialNumericIntegrityIssue && initialDefinition
      ? createCabinetPreset("base", initialDefinition.id)
      : hydratedInitialDefinition ?? freshDefinition()
  );
  const [activeModuleId, setActiveModuleId] = useState(definition.modules[0]?.id ?? "");
  const [experienceMode, setExperienceMode] = useState<CabinetStudioExperience>(
    !isProWorkspace || mode === "create" ? "guided" : "detailed"
  );
  const effectiveExperienceMode = isProWorkspace ? experienceMode : "guided";
  const [guidedStep, setGuidedStep] = useState(0);
  const [activePresetId, setActivePresetId] = useState<CabinetPresetId | null>(
    acceptedInitialDefinition ? acceptedInitialPresetId : "base"
  );
  const [templateCategory, setTemplateCategory] = useState<"Featured" | "All" | CabinetTemplateCategory>(
    "Featured"
  );
  const [templateQuery, setTemplateQuery] = useState("");
  const [savedTemplates, setSavedTemplates] = useState<SavedCabinetTemplate[]>([]);
  const [deletedTemplateUndo, setDeletedTemplateUndo] = useState<{
    template: SavedCabinetTemplate;
    index: number;
    restoreSourceForDefinitionId: string | null;
  } | null>(null);
  const [activeSavedTemplateId, setActiveSavedTemplateId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(mode === "create");
  const [propertyQuery, setPropertyQuery] = useState("");
  const [outputTab, setOutputTab] = useState<CabinetOutputTab>("issues");
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(
    hydratedInitialDefinition?.fitState?.host.id ?? preferredSpaceId ?? null
  );
  const [customSpaces, setCustomSpaces] = useState<CabinetHostSpace[]>(() =>
    hydratedInitialDefinition?.fitState?.host.kind !== "wall" && hydratedInitialDefinition?.fitState?.host
      ? [hydratedInitialDefinition.fitState.host]
      : []
  );
  const [customSpaceDraft, setCustomSpaceDraft] = useState({
    kind: "rectangular_area" as Exclude<CabinetHostKind, "wall" | "unhosted">,
    label: "Measured area",
    width: String(toProjectMeasurementValue(1800)),
    height: String(toProjectMeasurementValue(2400)),
    depth: String(toProjectMeasurementValue(600)),
    baseboard: String(toProjectMeasurementValue(0)),
  });
  const [customSpaceFormOpen, setCustomSpaceFormOpen] = useState(false);
  const [fitMode, setFitMode] = useState<CabinetFitMode>(
    hydratedInitialDefinition?.fitState?.mode ?? "fit_both"
  );
  const [fitAlignment, setFitAlignment] = useState<CabinetFitAlignment>(
    hydratedInitialDefinition?.fitState?.alignment ?? "center"
  );
  const [mountingHeightDraft, setMountingHeightDraft] = useState(() =>
    String(toProjectMeasurementValue(
      hydratedInitialDefinition?.fitState?.host.mountingHeightMm ??
        (definition.modules.every((module) => module.type === "wall") ? 1400 : 0)
    ))
  );
  const [fitFeedback, setFitFeedback] = useState<CabinetFitResult | null>(null);
  const [dimensionPreview, setDimensionPreview] = useState<CabinetDimensionPreview | null>(null);
  const [semanticEditPreview, setSemanticEditPreview] =
    useState<CabinetSemanticEditPreview | null>(null);
  const [previewView, setPreviewView] = useState<CabinetPreviewView>("perspective");
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(true);
  const [showClearances, setShowClearances] = useState(isProWorkspace);
  const [draggedModuleId, setDraggedModuleId] = useState<string | null>(null);
  const [semanticSelection, setSemanticSelection] = useState<CabinetSemanticSelection>(() => ({
    scope: definition.modules[0] ? "module" : "assembly",
    cabinetDefinitionId: definition.id,
    moduleId: definition.modules[0]?.id,
    additive: false,
  }));
  const [pendingValidationFix, setPendingValidationFix] = useState<{
    issue: CabinetValidationIssue;
    fix: CabinetValidationAutoFix;
    candidate: CabinetDefinition;
  } | null>(null);
  const [moduleOptionsOpen, setModuleOptionsOpen] = useState(false);
  const [explicitlyRevealedModuleOptionGroupId, setExplicitlyRevealedModuleOptionGroupId] =
    useState<CabinetModuleOptionGroupId | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [fabricationOpen, setFabricationOpen] = useState(false);
  const [pendingPropertyControlFocus, setPendingPropertyControlFocus] =
    useState<string | null>(null);
  const [customSpacesStorageReady, setCustomSpacesStorageReady] = useState(false);
  const [inspectorPreferencesStorageReady, setInspectorPreferencesStorageReady] = useState(false);
  const [busyAction, setBusyAction] = useState<"download" | "source" | "import" | "docs" | "shopDrawing" | "dxf" | "rfq" | "package" | "place" | "copy" | "save" | null>(null);
  const [actionError, setActionError] = useState<string | null>(() =>
    initialNumericIntegrityIssue
      ? `Stored design data contained a non-finite number at ${initialNumericIntegrityIssue.path}. A safe Base layout was opened instead; cancel to avoid replacing the stored design, or restore a valid template.`
      : null
  );
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const sourceImportInputRef = useRef<HTMLInputElement | null>(null);
  const measurementUnitRef = useRef(projectMeasurementUnit);
  const initialDefinitionRef = useRef(definition);
  const definitionRef = useRef(definition);
  const studioSessionStartedAtRef = useRef(Date.now());
  const validationExposureStateRef = useRef<CabinetValidationExposureState | null>(null);
  const templateSourceRef = useRef<CabinetTemplateSourceIdentity>({
    presetId: activePresetId,
    savedTemplateId: activeSavedTemplateId,
  });
  const trackStudioInteraction = useCallback(
    (event: string, details: Record<string, unknown> = {}) => {
      const current = definitionRef.current;
      try {
        track(event, {
          access_level: accessLevel,
          studio_mode: mode,
          assembly_type: current.millworkAssemblyType ?? current.millworkFamily ?? "cabinet",
          module_count: current.modules.length,
          ...details,
        });
      } catch {
        // Analytics is optional and must never turn a completed editor action into a failure.
      }
    },
    [accessLevel, mode]
  );

  useEffect(() => {
    const previousUnit = measurementUnitRef.current;
    if (previousUnit === projectMeasurementUnit) return;
    measurementUnitRef.current = projectMeasurementUnit;
    const convertDraft = (draft: string) => {
      const parsed = validateCabinetNumberDraft(draft);
      if (parsed.status !== "valid") return draft;
      return String(
        cabinetMillimetresToDisplay(
          cabinetDisplayToMillimetres(parsed.value, previousUnit),
          projectMeasurementUnit
        )
      );
    };
    setMountingHeightDraft(convertDraft);
    setCustomSpaceDraft((current) => ({
      ...current,
      width: convertDraft(current.width),
      height: convertDraft(current.height),
      depth: convertDraft(current.depth),
      baseboard: convertDraft(current.baseboard),
    }));
  }, [projectMeasurementUnit]);

  useEffect(() => {
    if (isProWorkspace) return;
    setExperienceMode("guided");
    setShowClearances(false);
  }, [isProWorkspace]);

  useEffect(() => {
    if (!isProWorkspace) return;
    if (mode !== "create") {
      setExperienceMode("detailed");
      return;
    }
    const preference = readCabinetExperiencePreference(window.localStorage);
    if (preference) setExperienceMode(preference);
  }, [isProWorkspace, mode]);
  const historyRef = useRef<{
    past: CabinetHistoryEntry[];
    future: CabinetHistoryEntry[];
  }>({
    past: [],
    future: [],
  });

  const activeModule = definition.modules.find((module) => module.id === activeModuleId) ?? definition.modules[0];
  const activeModuleIndex = activeModule
    ? definition.modules.findIndex((module) => module.id === activeModule.id)
    : -1;
  const visibleModuleOptionGroupIds = useMemo(
    () =>
      new Set(
        activeModule
          ? getVisibleCabinetModuleOptionGroupIds(
              {
                assemblyType: definition.millworkAssemblyType,
                module: activeModule,
              },
              explicitlyRevealedModuleOptionGroupId
            )
          : []
      ),
    [
      activeModule,
      definition.millworkAssemblyType,
      explicitlyRevealedModuleOptionGroupId,
    ]
  );
  useEffect(() => {
    setExplicitlyRevealedModuleOptionGroupId(null);
  }, [activeModuleId, definition.millworkAssemblyType, definition.sourcePresetId]);
  const deferredDefinition = useDeferredValue(definition);
  const previewRegenerationPending = deferredDefinition !== definition;
  const previewRegenerationIndicatorVisible =
    useDelayedCabinetPreviewRegenerationIndicator(previewRegenerationPending);
  const previewStatus = previewRegenerationIndicatorVisible ? "regenerating" : "ready";
  const generatedParts = useMemo(
    () => generateCabinetParts(deferredDefinition),
    [deferredDefinition]
  );
  const previewParts = useMemo(
    () =>
      applyCabinetSemanticPreviewToParts(
        deferredDefinition,
        generatedParts,
        semanticEditPreview
      ),
    [deferredDefinition, generatedParts, semanticEditPreview]
  );
  const validation = useMemo(() => validateCabinetDefinition(definition), [definition]);
  useEffect(() => {
    const next = collectCabinetValidationIssueExposures(
      definition.id,
      validation.issues,
      validationExposureStateRef.current
    );
    validationExposureStateRef.current = next.state;
    for (const exposure of next.exposures) {
      trackStudioInteraction("millwork_validation_issue_exposed", {
        issue_code: exposure.issueCode,
        severity: exposure.severity,
        target_scope: exposure.targetScope,
        module_count: definition.modules.length,
        elapsed_ms: cabinetStudioElapsedMs(
          studioSessionStartedAtRef.current,
          Date.now()
        ),
      });
    }
  }, [definition.id, definition.modules.length, trackStudioInteraction, validation.issues]);
  const bom = useMemo(
    () => generateCabinetBOM(deferredDefinition, generatedParts),
    [deferredDefinition, generatedParts]
  );
  const visiblePreviewParts = useMemo(
    () =>
      getCabinetVisiblePreviewParts(deferredDefinition, previewParts, {
        showClearances,
      }),
    [deferredDefinition, previewParts, showClearances]
  );
  const generatedPartIds = useMemo(
    () => new Set(visiblePreviewParts.map((part) => part.id)),
    [visiblePreviewParts]
  );
  const selectedPart = useMemo(
    () =>
      semanticSelection.scope === "part" && semanticSelection.partId
        ? visiblePreviewParts.find((part) => part.id === semanticSelection.partId) ?? null
        : null,
    [semanticSelection.partId, semanticSelection.scope, visiblePreviewParts]
  );
  const selectedPartFabrication = useMemo(
    () =>
      selectedPart
        ? resolveCabinetPartFabricationSpec(deferredDefinition, selectedPart)
        : null,
    [deferredDefinition, selectedPart]
  );
  const documentation = useMemo(
    () => generateCabinetDocumentation(deferredDefinition, { parts: generatedParts }),
    [deferredDefinition, generatedParts]
  );
  const errors = validation.issues.filter((issue) => issue.severity === "error");
  const warnings = validation.issues.filter((issue) => issue.severity === "warning");
  const infos = validation.issues.filter((issue) => issue.severity === "info");
  const automation = getCabinetAutomationState(definition);
  const overallWidthLocked = isCabinetOverallWidthLocked(definition);
  const structuralModuleChangeDisabled =
    automation.moduleSizingMode === "manual" && overallWidthLocked;
  const structuralModuleChangeTitle = structuralModuleChangeDisabled
    ? "Manual sizing cannot change the module total while overall width is locked"
    : automation.moduleSizingMode === "automatic"
      ? "Preserve the overall target and redistribute unlocked module widths"
      : "Preserve entered module widths and derive the new overall width";
  const overallWidthLimits = getCabinetOverallWidthLimits(definition);
  const overallWidthCanResize =
    !overallWidthLocked && overallWidthLimits.maxMm - overallWidthLimits.minMm > 0.5;
  const overallWidthBlockedByModuleLocks =
    !overallWidthLocked && !overallWidthCanResize;
  const equalModuleSizingLocked = Boolean(
    getCabinetParameterState(definition, CABINET_EQUAL_MODULE_WIDTHS_PARAMETER_PATH).locked
  );
  const activeShelfSpacingLocked = Boolean(
    activeModule &&
      (getCabinetParameterState(
        definition,
        cabinetShelfLayoutParameterPath(activeModule.id)
      ).locked ||
        CABINET_SHELF_LAYOUT_FIELDS.some(
          (field) =>
            getCabinetParameterState(
              definition,
              `modules.${activeModule.id}.${field}`
            ).locked
        ))
  );
  const activeShelfSpacingMode = activeModule
    ? getCabinetShelfSpacingMode(definition, activeModule)
    : "even";
  const activeShelfPositions = activeModule
    ? getCabinetShelfCenterHeights(definition, activeModule)
    : [];
  const activeMaterialLocked = Boolean(
    activeModule &&
      getCabinetParameterState(definition, `modules.${activeModule.id}.materialId`).locked
  );
  const activeFrontMaterialLocked = Boolean(
    activeModule &&
      getCabinetParameterState(definition, `modules.${activeModule.id}.frontMaterialId`).locked
  );
  const selectedPartIsDoorFront = selectedPart?.type === "door_front";
  const selectedPartIsDrawerOrHandle =
    selectedPart?.type === "drawer_front" || selectedPart?.type === "handle";
  const selectedPartIsShelf =
    selectedPart?.type === "shelf" || selectedPart?.type === "shoe_cubby_shelf";
  const selectedPartIsHangingRod = selectedPart?.type === "hanging_rod";
  const selectedPartMaterialTarget = !selectedPart || !activeModule
    ? null
    : selectedPart.type === "countertop"
      ? "countertop"
      : selectedPart.type === "backsplash"
        ? "backsplash"
        : selectedPart.type === "face_frame_stile" || selectedPart.type === "face_frame_rail"
          ? "face_frame"
          : selectedPartIsDoorFront || selectedPartIsDrawerOrHandle
            ? "front"
            : selectedPartIsShelf
              ? "carcass"
              : activeModule.frontMaterialId && selectedPart.materialId === activeModule.frontMaterialId
                ? "front"
                : selectedPart.materialId === activeModule.materialId
                  ? "carcass"
                  : null;
  const selectedPartMaterialId = selectedPartMaterialTarget === "countertop"
    ? definition.countertopMaterialId ?? selectedPart?.materialId ?? ""
    : selectedPartMaterialTarget === "backsplash"
      ? definition.backsplashMaterialId ?? selectedPart?.materialId ?? ""
      : selectedPartMaterialTarget === "face_frame"
        ? definition.faceFrameMaterialId ?? selectedPart?.materialId ?? ""
        : selectedPartMaterialTarget === "front"
          ? activeModule?.frontMaterialId ?? activeModule?.materialId ?? ""
          : selectedPartMaterialTarget === "carcass"
            ? activeModule?.materialId ?? ""
            : selectedPart?.materialId ?? "";
  const selectedPartMaterialName =
    definition.materials.find((material) => material.id === selectedPartMaterialId)?.name ??
    CABINET_MATERIALS.find((material) => material.id === selectedPartMaterialId)?.name ??
    labelize(selectedPartMaterialId || "not assigned");
  const allAvailableSpaces = useMemo(
    () => [
      ...availableSpaces,
      ...customSpaces.filter(
        (customSpace) =>
          (isProWorkspace || definition.fitState?.host.id === customSpace.id) &&
          !availableSpaces.some((space) => space.id === customSpace.id)
      ),
    ],
    [availableSpaces, customSpaces, definition.fitState?.host.id, isProWorkspace]
  );
  const selectedSpace =
    allAvailableSpaces.find((space) => space.id === selectedSpaceId) ??
    (definition.fitState?.host.id === selectedSpaceId ? definition.fitState.host : null);
  const getIssuesForField = (field: string, moduleId?: string) =>
    validation.issues.filter((issue) => {
      if (issue.target.field !== field && issue.field !== field) return false;
      if (!moduleId) return issue.target.scope !== "module";
      return issue.target.moduleIds?.includes(moduleId);
    });
  const getIssuesForModule = (moduleId: string) =>
    validation.issues.filter((issue) => issue.target.moduleIds?.includes(moduleId));
  const activeModuleIssues = activeModule ? getIssuesForModule(activeModule.id) : [];
  const activePreset = CABINET_PRESET_OPTIONS.find((preset) => preset.id === activePresetId) ?? null;
  const requiredHostType = activePreset?.requiredHostType ?? definition.requiredHostType;
  const selectedSpaceHostCompatibility =
    selectedSpace && requiredHostType
      ? resolveCabinetTemplateHostCompatibility(
          requiredHostType,
          selectedSpace
        )
      : null;
  const supportsGuidedWardrobeArrangements = Boolean(
    activeModule &&
      (activeModule.millworkComponentType ?? "cabinet") === "cabinet" &&
      (activeModule.type === "wardrobe" ||
        (definition.millworkFamily === "closet" &&
          (activeModule.type === "tall" || activeModule.type === "wall")))
  );
  const activeWardrobeArrangementId =
    activeModule && supportsGuidedWardrobeArrangements
      ? getMatchingCabinetWardrobeArrangementId(definition, activeModule.id)
      : null;
  const propertyResults = useMemo(() => {
    const context = {
      activeModule,
      assemblyType: definition.millworkAssemblyType,
    };
    const contextualResults = filterCabinetProperties(propertyQuery, context);
    if (!propertyQuery.trim()) return contextualResults.slice(0, 8);
    const contextualIds = new Set(contextualResults.map((property) => property.id));
    const explicitlyRevealableResults = filterCabinetProperties(
      propertyQuery,
      context,
      { includeInapplicable: true }
    ).filter(
      (property) =>
        !contextualIds.has(property.id) &&
        getCabinetModuleOptionGroupIdForControlTestId(property.controlTestId) !==
          undefined
    );
    return [...contextualResults, ...explicitlyRevealableResults].slice(0, 20);
  }, [activeModule, definition.millworkAssemblyType, propertyQuery]);
  const semanticSelectionLabel =
    semanticSelection.scope === "part"
      ? `${labelize(semanticSelection.partType ?? "part")} · Module ${Math.max(1, activeModuleIndex + 1)}`
      : semanticSelection.scope === "module"
        ? `Module ${Math.max(1, activeModuleIndex + 1)}`
        : "Complete assembly";
  const activeComponentType = activeModule?.millworkComponentType ?? "cabinet";
  const activeIsCabinetComponent = activeComponentType === "cabinet";
  const specialtyNumberFields = activeIsCabinetComponent
    ? []
    : getSpecialtyNumberFields(activeComponentType);
  const activeHasDoorFront = Boolean(
    activeModule && ["single_door", "double_door", "door_and_drawer"].includes(activeModule.frontType)
  );
  const activeHasDrawerFront = Boolean(
    activeModule && ["drawer_stack", "door_and_drawer"].includes(activeModule.frontType)
  );
  const activeHardware = activeModule
    ? definition.hardware.find((hardware) => hardware.id === activeModule.hardwareId)
    : undefined;
  const activeDoorLayoutMode = activeModule
    ? getCabinetDoorLayoutMode(definition, activeModule)
    : "recommended";
  const activeDoorCount = activeModule
    ? getCabinetEffectiveDoorCount(definition, activeModule)
    : 0;
  const activeDrawerHeightMode = activeModule
    ? getCabinetDrawerHeightMode(activeModule)
    : "equal";
  const activeDrawerHeightProportions = activeModule
    ? getCabinetDrawerHeightProportions(definition, activeModule)
    : [];
  const activeHandlePlacementMode = activeModule
    ? getCabinetHandlePlacementMode(activeModule)
    : "automatic";
  const activeHandlePlacementAvailable = Boolean(
    activeModule &&
      activeHardware &&
      isCabinetFrontHandleType(activeHardware.type) &&
      (activeHasDoorFront || activeHasDrawerFront)
  );
  const activeHardwareCompatibility =
    activeModule && activeHardware
      ? resolveCabinetHardwareCompatibility(activeHardware, activeModule)
      : null;
  const compatibleFrontHardware = activeModule
    ? getCompatibleCabinetFrontHardware(activeModule, CABINET_HARDWARE, {
        includeReviewRequired: true,
      })
    : [];
  const activeHardwareOptions =
    activeHardware && !compatibleFrontHardware.some((hardware) => hardware.id === activeHardware.id)
      ? [activeHardware, ...compatibleFrontHardware]
      : compatibleFrontHardware;
  const guidedOperableModules = definition.modules.filter((module) => module.frontType !== "open");
  const guidedHardwareOptions = GUIDED_HARDWARE.filter((hardware) =>
    guidedOperableModules.length === 0
      ? hardware.type === "none"
      : guidedOperableModules.every(
          (module) => resolveCabinetHardwareCompatibility(hardware, module).status !== "incompatible"
        )
  );
  const isGuidedHardwareSelected = (hardwareId: string) =>
    guidedOperableModules.length === 0
      ? hardwareId === "none"
      : guidedOperableModules.every((module) => (module.hardwareId ?? "none") === hardwareId);
  const visibleTemplates = useMemo(() => {
    const query = templateQuery.trim().toLowerCase();
    const roomTerms = getCabinetTemplateRoomTerms(
      selectedSpace ?? allAvailableSpaces[0]
    );

    return CABINET_PRESET_OPTIONS.map((preset, originalIndex) => ({
      preset,
      originalIndex,
      searchable: getCabinetPresetSearchText(preset),
    }))
      .filter(({ preset }) =>
        cabinetPresetMatchesCatalogFilters(preset, query, templateCategory)
      )
      .sort((left, right) => {
        const leftScore = roomTerms.reduce(
          (score, term) => score + (left.searchable.includes(term) ? 1 : 0),
          0
        );
        const rightScore = roomTerms.reduce(
          (score, term) => score + (right.searchable.includes(term) ? 1 : 0),
          0
        );
        return rightScore - leftScore || left.originalIndex - right.originalIndex;
      })
      .map(({ preset }) => preset);
  }, [allAvailableSpaces, selectedSpace, templateCategory, templateQuery]);
  const visibleSavedTemplates = useMemo(() => {
    const query = templateQuery.trim().toLowerCase();
    if (!query && templateCategory !== "Featured" && templateCategory !== "All") {
      return [];
    }
    return savedTemplates.filter(
      (template) =>
        !query ||
        `${template.name} ${template.definition.name}`.toLowerCase().includes(query)
    );
  }, [savedTemplates, templateCategory, templateQuery]);

  useEffect(() => {
    if (selectedSpaceId || !preferredSpaceId) return;
    if (availableSpaces.some((space) => space.id === preferredSpaceId)) {
      setSelectedSpaceId(preferredSpaceId);
    }
  }, [availableSpaces, preferredSpaceId, selectedSpaceId]);

  useEffect(() => {
    const currentDefinition = definitionRef.current;
    const fitState = currentDefinition.fitState;
    if (!fitState) return;
    const currentHost = availableSpaces.find((space) => space.id === fitState.host.id);
    if (!currentHost || JSON.stringify(currentHost) === JSON.stringify(fitState.host)) return;
    const refreshedDefinition = {
      ...currentDefinition,
      fitState: {
        ...fitState,
        host: {
          ...currentHost,
          mountingHeightMm:
            currentHost.mountingHeightMm ?? fitState.host.mountingHeightMm,
        },
      },
    };
    const numericIntegrityIssue = findCabinetNonFiniteNumbers(refreshedDefinition)[0];
    if (numericIntegrityIssue) {
      setActionSuccess(null);
      setActionError(
        `Updated room measurements contained a non-finite number at ${numericIntegrityIssue.path}. The last valid cabinetry model was kept.`
      );
      return;
    }
    definitionRef.current = refreshedDefinition;
    setDefinition(refreshedDefinition);
    setFitFeedback(null);
  }, [availableSpaces]);

  useEffect(() => {
    setSavedTemplates(readSavedCabinetTemplates());
  }, []);

  useEffect(() => {
    if (!isProWorkspace) return;
    const storedSpaces = readStoredCabinetCustomSpaces();
    setCustomSpaces((current) =>
      capCabinetCustomSpaces(
        [...storedSpaces, ...current],
        definitionRef.current.fitState?.host.id
      )
    );
    setCustomSpacesStorageReady(true);
  }, [isProWorkspace]);

  useEffect(() => {
    if (!isProWorkspace || !customSpacesStorageReady) return;
    writeStoredCabinetCustomSpaces(customSpaces);
  }, [customSpaces, customSpacesStorageReady, isProWorkspace]);

  useEffect(() => {
    if (!isProWorkspace) return;
    const preferences = readCabinetInspectorPreferences();
    if (preferences) {
      setModuleOptionsOpen(preferences.moduleOptionsOpen);
      setAdvancedOpen(preferences.advancedOpen);
      setFabricationOpen(preferences.fabricationOpen);
    }
    setInspectorPreferencesStorageReady(true);
  }, [isProWorkspace]);

  useEffect(() => {
    if (!isProWorkspace || !inspectorPreferencesStorageReady) return;
    try {
      window.localStorage.setItem(
        CABINET_INSPECTOR_PREFERENCES_STORAGE_KEY,
        JSON.stringify({
          version: CABINET_STUDIO_STORAGE_VERSION,
          moduleOptionsOpen,
          advancedOpen,
          fabricationOpen,
        })
      );
    } catch {
      // Browser persistence is optional; expansion state still works this session.
    }
  }, [
    advancedOpen,
    fabricationOpen,
    inspectorPreferencesStorageReady,
    isProWorkspace,
    moduleOptionsOpen,
  ]);

  useEffect(() => {
    if (mode !== "create") {
      setShowOnboarding(false);
      return;
    }
    setShowOnboarding(
      !isCabinetOnboardingDismissed(window.localStorage)
    );
  }, [mode]);

  useEffect(() => {
    setSemanticSelection((current) => {
      const moduleStillExists =
        !current.moduleId || definition.modules.some((module) => module.id === current.moduleId);
      const partStillExists = !current.partId || generatedPartIds.has(current.partId);
      if (
        current.cabinetDefinitionId === definition.id &&
        moduleStillExists &&
        partStillExists
      ) {
        return current;
      }
      const fallbackModuleId = definition.modules.some((module) => module.id === activeModuleId)
        ? activeModuleId
        : definition.modules[0]?.id;
      return {
        scope: fallbackModuleId ? "module" : "assembly",
        cabinetDefinitionId: definition.id,
        moduleId: fallbackModuleId,
        additive: false,
      };
    });
  }, [activeModuleId, definition.id, definition.modules, generatedPartIds]);

  useEffect(() => {
    definitionRef.current = definition;
  }, [definition]);

  const selectStudioModule = (moduleId: string) => {
    setActiveModuleId(moduleId);
    setSemanticSelection({
      scope: "module",
      cabinetDefinitionId: definitionRef.current.id,
      moduleId,
      additive: false,
    });
  };

  const handleSemanticPreviewSelection = (selection: CabinetSemanticSelection) => {
    setSemanticSelection(selection);
    if (selection.moduleId) setActiveModuleId(selection.moduleId);
  };

  const handleOutputTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentTab: CabinetOutputTab
  ) => {
    const currentIndex = OUTPUT_TABS.findIndex(([value]) => value === currentTab);
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % OUTPUT_TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + OUTPUT_TABS.length) % OUTPUT_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = OUTPUT_TABS.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = OUTPUT_TABS[nextIndex][0];
    setOutputTab(nextTab);
    window.setTimeout(() => {
      document.getElementById(`cabinet-output-tab-${nextTab}`)?.focus();
    }, 0);
  };

  const focusPropertyControl = (controlTestId: string) => {
    setExplicitlyRevealedModuleOptionGroupId(
      getCabinetModuleOptionGroupIdForControlTestId(controlTestId) ?? null
    );
    setModuleOptionsOpen(true);
    setAdvancedOpen(true);
    setFabricationOpen(true);
    trackStudioInteraction("millwork_advanced_controls_opened", {
      section: "property_search",
      control_id: controlTestId,
    });
    setPendingPropertyControlFocus(controlTestId);
  };

  useEffect(() => {
    if (!pendingPropertyControlFocus) return;

    let animationFrame = 0;
    let attempts = 0;
    let cancelled = false;
    const focusWhenMounted = () => {
      if (cancelled) return;
      const element = document.querySelector<HTMLElement>(
        `[data-testid="${pendingPropertyControlFocus}"]`
      );
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.focus();
        setPendingPropertyControlFocus(null);
        return;
      }
      attempts += 1;
      if (attempts < 60) {
        animationFrame = window.requestAnimationFrame(focusWhenMounted);
      } else {
        setPendingPropertyControlFocus(null);
      }
    };

    animationFrame = window.requestAnimationFrame(focusWhenMounted);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [
    advancedOpen,
    explicitlyRevealedModuleOptionGroupId,
    fabricationOpen,
    moduleOptionsOpen,
    pendingPropertyControlFocus,
  ]);

  const dismissOnboarding = () => {
    setShowOnboarding(false);
    persistCabinetOnboardingDismissal(window.localStorage);
  };

  const chooseExperienceMode = (nextExperience: CabinetStudioExperience) => {
    setExperienceMode(nextExperience);
    if (isProWorkspace) {
      writeCabinetExperiencePreference(window.localStorage, nextExperience);
    }
  };

  const setTemplateSourceIdentity = (
    presetId: CabinetPresetId | null,
    savedTemplateId: string | null
  ) => {
    templateSourceRef.current = { presetId, savedTemplateId };
    setActivePresetId(presetId);
    setActiveSavedTemplateId(savedTemplateId);
  };

  const rejectNonFiniteDefinition = (candidate: CabinetDefinition) => {
    const issue = findCabinetNonFiniteNumbers(candidate)[0];
    if (!issue) return false;
    const field = issue.path.replace(/^definition\.?/, "").replace(/\[(\d+)\]/g, ".$1");
    setActionSuccess(null);
    setActionError(
      `The value for ${field || "this design"} is not a finite number. Finish the numeric entry or restore the previous valid value.`
    );
    return true;
  };

  const replaceDefinition = (nextDefinition: CabinetDefinition, recordHistory = true) => {
    if (rejectNonFiniteDefinition(nextDefinition)) return false;
    const previousDefinition = definitionRef.current;
    if (recordHistory) {
      historyRef.current = {
        past: [
          ...historyRef.current.past,
          { definition: previousDefinition, ...templateSourceRef.current },
        ].slice(-60),
        future: [],
      };
    }
    definitionRef.current = nextDefinition;
    setSemanticEditPreview(null);
    setDefinition(nextDefinition);
    return true;
  };

  const updateDefinition = (updater: (draft: CabinetDefinition) => CabinetDefinition) => {
    setActionError(null);
    setActionSuccess(null);
    const current = definitionRef.current;
    const candidate = updater(current);
    if (rejectNonFiniteDefinition(candidate)) return false;
    const next = touchDefinition(candidate);
    if (rejectNonFiniteDefinition(next)) return false;
    if (
      isCabinetOverallWidthLocked(current) &&
      Math.abs(getCabinetOverallWidth(next) - getCabinetOverallWidth(current)) > 0.5
    ) {
      setActionError(
        "Overall width is locked. Unlock it before changing modules, fitting panels, end panels, or side overhangs."
      );
      return false;
    }
    return replaceDefinition(next);
  };

  const updateModule = (moduleId: string, patch: Partial<CabinetModuleDefinition>) => {
    const current = definitionRef.current;
    const patchFields = Object.keys(patch) as (keyof CabinetModuleDefinition)[];
    if (
      typeof patch.width === "number" &&
      isCabinetOverallWidthLocked(current)
    ) {
      setActionSuccess(null);
      setActionError("Overall width is locked. Unlock it before changing an individual bay width.");
      return false;
    }
    if (
      typeof patch.width === "number" &&
      (isCabinetModuleWidthLocked(current, moduleId) ||
        getCabinetAutomationState(current).equalModuleSizing)
    ) {
      setActionSuccess(null);
      setActionError(
        getCabinetAutomationState(current).equalModuleSizing
          ? "Equal module sizing is locked. Release it before changing one bay width."
          : "This module width is locked. Unlock it before changing the bay width."
      );
      return false;
    }
    if (
      patchFields.some((field) => CABINET_SHELF_LAYOUT_FIELDS.includes(
        field as (typeof CABINET_SHELF_LAYOUT_FIELDS)[number]
      )) &&
      getCabinetParameterState(
        current,
        cabinetShelfLayoutParameterPath(moduleId)
      ).locked
    ) {
      setActionSuccess(null);
      setActionError("Shelf layout is locked. Unlock it before changing shelf settings.");
      return false;
    }
    const lockedField = patchFields.find((field) =>
      getCabinetParameterState(current, `modules.${moduleId}.${String(field)}`).locked
    );
    if (lockedField) {
      setActionSuccess(null);
      setActionError(`${labelize(String(lockedField))} is locked. Unlock it before changing this value.`);
      return false;
    }
    const currentModule = current.modules.find((module) => module.id === moduleId);
    let safePatch: Partial<CabinetModuleDefinition> =
      typeof patch.width === "number" && currentModule
        ? {
            ...patch,
            width: Math.max(
              getCabinetMinimumModuleWidthMm(currentModule, current),
              Math.min(CABINET_MAX_MODULE_WIDTH_MM, patch.width)
            ),
          }
        : patch;
    if (
      currentModule &&
      typeof patch.shelfCount === "number" &&
      getCabinetShelfSpacingMode(current, currentModule) === "custom"
    ) {
      const nextModule = {
        ...currentModule,
        ...safePatch,
        shelfCount: Math.max(0, Math.round(patch.shelfCount)),
      };
      safePatch = {
        ...safePatch,
        shelfCount: nextModule.shelfCount,
        shelfPositionsMm: getCabinetEvenShelfCenterHeights(
          current,
          nextModule
        ),
      };
    }
    if (
      currentModule &&
      typeof patch.drawerCount === "number" &&
      getCabinetDrawerHeightMode(currentModule) === "custom"
    ) {
      const drawerCount = Math.max(0, Math.round(patch.drawerCount));
      safePatch = {
        ...safePatch,
        drawerCount,
        drawerHeightProportions: resizeCabinetDrawerHeightProportions(
          getCabinetDrawerHeightProportions(current, currentModule),
          drawerCount
        ),
      };
    }
    return updateDefinition((prev) => {
      const nextDefinition: CabinetDefinition = {
        ...prev,
        modules: prev.modules.map((module) => {
        if (module.id !== moduleId) return module;

        const nextModule = {
          ...module,
          ...safePatch,
        };
        const drawerFrontCount = getCabinetDrawerFrontLayouts(prev, nextModule).length;

        if (drawerFrontCount === 0 && hasCabinetDrawerSlides(nextModule)) {
          return {
            ...nextModule,
            drawerSlideHardwareEnabled: undefined,
            drawerSlideLength: undefined,
            drawerSlideClearance: undefined,
            drawerBoxEnabled: hasCabinetDrawerBoxes(nextModule) ? undefined : nextModule.drawerBoxEnabled,
            drawerBoxSideThickness: hasCabinetDrawerBoxes(nextModule) ? undefined : nextModule.drawerBoxSideThickness,
            drawerBoxBottomThickness: hasCabinetDrawerBoxes(nextModule) ? undefined : nextModule.drawerBoxBottomThickness,
            drawerBoxHeightClearance: hasCabinetDrawerBoxes(nextModule) ? undefined : nextModule.drawerBoxHeightClearance,
            drawerBoxBackClearance: hasCabinetDrawerBoxes(nextModule) ? undefined : nextModule.drawerBoxBackClearance,
          };
        }

        if (drawerFrontCount === 0 && hasCabinetDrawerBoxes(nextModule)) {
          return {
            ...nextModule,
            drawerBoxEnabled: undefined,
            drawerBoxSideThickness: undefined,
            drawerBoxBottomThickness: undefined,
            drawerBoxHeightClearance: undefined,
            drawerBoxBackClearance: undefined,
          };
        }

        if (
          drawerFrontCount > 0 &&
          module.drawerSlideHardwareEnabled !== false &&
          !hasCabinetDrawerSlides(nextModule) &&
          (safePatch.frontType !== undefined || safePatch.drawerCount !== undefined)
        ) {
          return {
            ...nextModule,
            drawerSlideHardwareEnabled: true,
            drawerSlideLength: CABINET_DEFAULT_DRAWER_SLIDE_LENGTH,
            drawerSlideClearance: CABINET_DEFAULT_DRAWER_SLIDE_CLEARANCE,
            ...(module.drawerBoxEnabled !== false && !hasCabinetDrawerBoxes(nextModule)
              ? {
                  drawerBoxEnabled: true,
                  drawerBoxSideThickness: CABINET_DEFAULT_DRAWER_BOX_SIDE_THICKNESS,
                  drawerBoxBottomThickness: CABINET_DEFAULT_DRAWER_BOX_BOTTOM_THICKNESS,
                  drawerBoxHeightClearance: CABINET_DEFAULT_DRAWER_BOX_HEIGHT_CLEARANCE,
                  drawerBoxBackClearance: CABINET_DEFAULT_DRAWER_BOX_BACK_CLEARANCE,
                }
              : {}),
          };
        }

        if (
          drawerFrontCount > 0 &&
          module.drawerBoxEnabled !== false &&
          !hasCabinetDrawerBoxes(nextModule) &&
          (safePatch.frontType !== undefined || safePatch.drawerCount !== undefined)
        ) {
          return {
            ...nextModule,
            drawerBoxEnabled: true,
            drawerBoxSideThickness: CABINET_DEFAULT_DRAWER_BOX_SIDE_THICKNESS,
            drawerBoxBottomThickness: CABINET_DEFAULT_DRAWER_BOX_BOTTOM_THICKNESS,
            drawerBoxHeightClearance: CABINET_DEFAULT_DRAWER_BOX_HEIGHT_CLEARANCE,
            drawerBoxBackClearance: CABINET_DEFAULT_DRAWER_BOX_BACK_CLEARANCE,
          };
        }

          return nextModule;
        }),
      };
      let nextWithProvenance = Object.keys(safePatch).reduce(
        (current, field) =>
          setCabinetParameterState(current, `modules.${moduleId}.${field}`, {
            source: "user_overridden",
        }),
        nextDefinition
      );
      if (safePatch.doorLayoutMode === "recommended") {
        nextWithProvenance = setCabinetParameterState(
          nextWithProvenance,
          `modules.${moduleId}.doorCount`,
          { source: "automatic" }
        );
      }
      if (
        safePatch.drawerHeightMode === "equal" ||
        safePatch.drawerHeightMode === "recommended"
      ) {
        nextWithProvenance = setCabinetParameterState(
          nextWithProvenance,
          `modules.${moduleId}.drawerHeightProportions`,
          { source: "automatic" }
        );
      }
      if (safePatch.handlePlacementMode === "automatic") {
        nextWithProvenance = setCabinetParameterState(
          nextWithProvenance,
          `modules.${moduleId}.handleOffsetX`,
          { source: "automatic" }
        );
        nextWithProvenance = setCabinetParameterState(
          nextWithProvenance,
          `modules.${moduleId}.handleOffsetY`,
          { source: "automatic" }
        );
      }
      return nextWithProvenance;
    });
  };

  const detailedModuleNumberFieldProps = (
    field: Extract<keyof CabinetModuleDefinition, string>,
    value: number
  ) => ({
    fieldPath: field,
    issues: activeModule ? getIssuesForField(field, activeModule.id) : [],
    value,
    onCommit: (nextValue: number) =>
      activeModule
        ? updateModule(activeModule.id, {
            [field]: nextValue,
          } as Partial<CabinetModuleDefinition>)
        : false,
  });

  const detailedDefinitionNumberFieldProps = (
    field: Extract<keyof CabinetDefinition, string>,
    value: number
  ) => ({
    fieldPath: field,
    issues: getIssuesForField(field),
    value,
    onCommit: (nextValue: number) =>
      updateDefinition((previous) => ({
        ...previous,
        [field]: nextValue,
      })),
  });

  const applyPreset = (presetId: CabinetPresetId) => {
    setActionError(null);
    setActionSuccess(null);
    const next = createCabinetPreset(presetId, `cabinet-${Date.now()}`);
    replaceDefinition(next);
    setTemplateSourceIdentity(presetId, null);
    setActiveModuleId(next.modules[0]?.id ?? "");
    setMountingHeightDraft(
      String(
        toProjectMeasurementValue(
          next.modules.every((module) => module.type === "wall") ? 1400 : 0
        )
      )
    );
    setFitFeedback(null);
    trackStudioInteraction("millwork_template_selected", {
      preset_id: presetId,
      template_source: "curated",
    });
  };

  const persistSavedTemplates = (templates: SavedCabinetTemplate[]) => {
    try {
      window.localStorage.setItem(
        CABINET_CUSTOM_TEMPLATE_STORAGE_KEY,
        JSON.stringify(templates)
      );
    } catch {
      throw new Error("This browser could not store the reusable template locally.");
    }
    setSavedTemplates(templates);
  };

  const applySavedTemplate = (template: SavedCabinetTemplate) => {
    const now = new Date().toISOString();
    const cloned = JSON.parse(
      JSON.stringify(template.definition)
    ) as CabinetDefinition;
    const migratedPresetId = cabinetPresetIdFromDefinition(cloned);
    const migratedPreset = CABINET_PRESET_OPTIONS.find(
      (preset) => preset.id === migratedPresetId
    );
    const candidate = {
      ...cloned,
      sourcePresetId: migratedPreset?.id,
      requiredHostType: cloned.requiredHostType ?? migratedPreset?.requiredHostType,
      id: `cabinet-${Date.now()}`,
      name: template.name,
      fitState: undefined,
      createdAt: now,
      updatedAt: now,
    };
    if (rejectNonFiniteDefinition(candidate)) return;
    const next = touchDefinition(candidate);
    if (!replaceDefinition(next)) return;
    setTemplateSourceIdentity(null, template.id);
    setActiveModuleId(next.modules[0]?.id ?? "");
    setMountingHeightDraft(
      String(
        toProjectMeasurementValue(
          next.modules.every((module) => module.type === "wall") ? 1400 : 0
        )
      )
    );
    setFitFeedback(null);
    setActionError(null);
    setActionSuccess(`${template.name} loaded from your reusable templates.`);
    trackStudioInteraction("millwork_template_selected", {
      template_source: "saved",
    });
  };

  const saveCurrentAsTemplate = () => {
    const now = new Date().toISOString();
    const id = `custom-template-${Date.now()}`;
    const template: SavedCabinetTemplate = {
      id,
      name: definitionRef.current.name,
      savedAt: now,
      definition: {
        ...definitionRef.current,
        fitState: undefined,
        updatedAt: now,
      },
    };
    persistSavedTemplates([template, ...savedTemplates].slice(0, 50));
    historyRef.current = {
      past: [
        ...historyRef.current.past,
        { definition: definitionRef.current, ...templateSourceRef.current },
      ].slice(-60),
      future: [],
    };
    setTemplateSourceIdentity(null, id);
    setActionError(null);
    setActionSuccess("Reusable template saved to this browser.");
    trackStudioInteraction("millwork_reusable_template_saved");
  };

  const deleteSavedTemplate = (templateId: string) => {
    try {
      const deletedIndex = savedTemplates.findIndex(
        (template) => template.id === templateId
      );
      const deletedTemplate = savedTemplates[deletedIndex];
      if (!deletedTemplate) return;
      persistSavedTemplates(
        savedTemplates.filter((template) => template.id !== templateId)
      );
      historyRef.current = {
        past: historyRef.current.past.map((entry) =>
          entry.savedTemplateId === templateId
            ? { ...entry, savedTemplateId: null }
            : entry
        ),
        future: historyRef.current.future.map((entry) =>
          entry.savedTemplateId === templateId
            ? { ...entry, savedTemplateId: null }
            : entry
        ),
      };
      const wasActiveSource = templateSourceRef.current.savedTemplateId === templateId;
      if (wasActiveSource) {
        setTemplateSourceIdentity(templateSourceRef.current.presetId, null);
      }
      setDeletedTemplateUndo({
        template: deletedTemplate,
        index: Math.max(0, deletedIndex),
        restoreSourceForDefinitionId: wasActiveSource
          ? definitionRef.current.id
          : null,
      });
      setActionError(null);
      setActionSuccess("Reusable template removed. You can restore it below.");
    } catch (error) {
      setActionSuccess(null);
      setActionError(
        error instanceof Error ? error.message : "Unable to remove the reusable template."
      );
    }
  };

  const restoreDeletedTemplate = () => {
    if (!deletedTemplateUndo) return;
    try {
      const next = [...savedTemplates];
      next.splice(
        Math.min(deletedTemplateUndo.index, next.length),
        0,
        deletedTemplateUndo.template
      );
      persistSavedTemplates(next.slice(0, 50));
      if (
        deletedTemplateUndo.restoreSourceForDefinitionId === definitionRef.current.id &&
        !templateSourceRef.current.presetId &&
        !templateSourceRef.current.savedTemplateId
      ) {
        setTemplateSourceIdentity(null, deletedTemplateUndo.template.id);
      }
      setDeletedTemplateUndo(null);
      setActionError(null);
      setActionSuccess("Reusable template restored.");
      trackStudioInteraction("millwork_reusable_template_delete_undone");
    } catch (error) {
      setActionSuccess(null);
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to restore the reusable template."
      );
    }
  };

  const undoDefinition = () => {
    const previous = historyRef.current.past[historyRef.current.past.length - 1];
    if (!previous) return;
    historyRef.current = {
      past: historyRef.current.past.slice(0, -1),
      future: [
        { definition: definitionRef.current, ...templateSourceRef.current },
        ...historyRef.current.future,
      ].slice(0, 60),
    };
    definitionRef.current = previous.definition;
    setDefinition(previous.definition);
    setTemplateSourceIdentity(previous.presetId, previous.savedTemplateId);
    if (!previous.definition.modules.some((module) => module.id === activeModuleId)) {
      setActiveModuleId(previous.definition.modules[0]?.id ?? "");
    }
    setActionError(null);
    setActionSuccess("Undid the last change.");
    trackStudioInteraction("millwork_history_used", { direction: "undo" });
  };

  const redoDefinition = () => {
    const next = historyRef.current.future[0];
    if (!next) return;
    historyRef.current = {
      past: [
        ...historyRef.current.past,
        { definition: definitionRef.current, ...templateSourceRef.current },
      ].slice(-60),
      future: historyRef.current.future.slice(1),
    };
    definitionRef.current = next.definition;
    setDefinition(next.definition);
    setTemplateSourceIdentity(next.presetId, next.savedTemplateId);
    if (!next.definition.modules.some((module) => module.id === activeModuleId)) {
      setActiveModuleId(next.definition.modules[0]?.id ?? "");
    }
    setActionError(null);
    setActionSuccess("Redid the last change.");
    trackStudioInteraction("millwork_history_used", { direction: "redo" });
  };

  const getCurrentTemplateSource = (): CabinetDefinition => {
    const { presetId, savedTemplateId } = templateSourceRef.current;
    if (presetId) {
      return createCabinetPreset(presetId, definitionRef.current.id);
    }
    const savedTemplate = savedTemplateId
      ? savedTemplates.find((template) => template.id === savedTemplateId) ??
        readSavedCabinetTemplates().find((template) => template.id === savedTemplateId)
      : undefined;
    if (savedTemplate) return savedTemplate.definition;
    const durablePresetId = cabinetPresetIdFromDefinition(definitionRef.current);
    if (durablePresetId) {
      return createCabinetPreset(durablePresetId, definitionRef.current.id);
    }
    if (deletedTemplateUndo?.restoreSourceForDefinitionId === definitionRef.current.id) {
      return deletedTemplateUndo.template.definition;
    }
    return initialDefinitionRef.current;
  };

  const restoreTemplateDefaults = () => {
    const source = getCurrentTemplateSource();
    const candidate = {
      ...source,
      id: definitionRef.current.id,
      createdAt: definitionRef.current.createdAt,
    };
    if (rejectNonFiniteDefinition(candidate)) return;
    const next = touchDefinition(candidate);
    if (!replaceDefinition(next)) return;
    setActiveModuleId(next.modules[0]?.id ?? "");
    setActionError(null);
    setActionSuccess(
      templateSourceRef.current.presetId || templateSourceRef.current.savedTemplateId
        ? "Template defaults restored."
        : "Original design restored."
    );
  };

  const resetActiveModule = () => {
    if (!activeModule || activeModuleIndex < 0) return;
    const source = getCurrentTemplateSource();
    const indexedDefaultModule = source.modules[activeModuleIndex];
    const defaultModule =
      indexedDefaultModule ??
      source.modules.find(
        (module) =>
          module.type === activeModule.type &&
          (module.millworkComponentType ?? "cabinet") ===
            (activeModule.millworkComponentType ?? "cabinet")
      ) ??
      source.modules[0];
    if (!defaultModule) {
      setActionError("This template does not contain a module baseline to restore.");
      return;
    }
    const usesFallbackBaseline = !indexedDefaultModule;
    const updated = updateDefinition((previous) => ({
      ...previous,
      modules: previous.modules.map((module) => {
        if (module.id !== activeModule.id) return module;
        const resetModule = {
          ...defaultModule,
          id: module.id,
        } as CabinetModuleDefinition;
        const resetRecord = resetModule as unknown as Record<string, unknown>;
        const currentRecord = module as unknown as Record<string, unknown>;
        const fields = new Set([
          ...Object.keys(defaultModule),
          ...Object.keys(module),
        ]);
        const preserveField = (field: string) => {
          if (Object.prototype.hasOwnProperty.call(currentRecord, field)) {
            resetRecord[field] = currentRecord[field];
          } else {
            delete resetRecord[field];
          }
        };
        fields.forEach((field) => {
          if (field === "id") return;
          const fieldLocked = getCabinetParameterState(
            previous,
            `modules.${module.id}.${field}`
          ).locked;
          const shelfLayoutLocked =
            CABINET_SHELF_LAYOUT_FIELDS.includes(
              field as (typeof CABINET_SHELF_LAYOUT_FIELDS)[number]
            ) &&
            getCabinetParameterState(
              previous,
              cabinetShelfLayoutParameterPath(module.id)
            ).locked;
          const widthLocked =
            field === "width" &&
            (usesFallbackBaseline ||
              isCabinetOverallWidthLocked(previous) ||
              isCabinetModuleWidthLocked(previous, module.id) ||
              getCabinetAutomationState(previous).equalModuleSizing);
          if (fieldLocked || shelfLayoutLocked || widthLocked) {
            preserveField(field);
          }
        });
        return resetModule;
      }),
    }));
    if (updated) {
      setActionSuccess(
        usesFallbackBaseline
          ? "Added module reset from the closest template baseline; its reconciled width and locked values were preserved."
          : "Selected module reset; locked values were preserved."
      );
    }
  };

  const buildTemplateSizeResetCandidate = (
    source: CabinetDefinition
  ): CabinetDefinition | null => {
    const current = definitionRef.current;
    const targetHeightMm = getCabinetOverallHeight(source);
    const targetDepthMm = getCabinetOverallDepth(source);
    const heightLocked = Boolean(
      getCabinetParameterState(current, "overall.height").locked ||
        current.modules.some((module) =>
          getCabinetParameterState(current, `modules.${module.id}.height`).locked
        )
    );
    const depthLocked = Boolean(
      getCabinetParameterState(current, "overall.depth").locked ||
        current.modules.some((module) =>
          getCabinetParameterState(current, `modules.${module.id}.depth`).locked
        )
    );
    if (
      heightLocked &&
      Math.abs(getCabinetOverallHeight(current) - targetHeightMm) > 0.5
    ) {
      setActionSuccess(null);
      setActionError(
        "Height is locked. Unlock the overall or affected module height before restoring template sizing."
      );
      return null;
    }
    if (
      depthLocked &&
      Math.abs(getCabinetOverallDepth(current) - targetDepthMm) > 0.5
    ) {
      setActionSuccess(null);
      setActionError(
        "Depth is locked. Unlock the overall or affected module depth before restoring template sizing."
      );
      return null;
    }
    const widthResult = resizeCabinetToOverallWidth(
      current,
      getCabinetOverallWidth(source),
      { source: "template_defined" }
    );
    if (!widthResult.ok) {
      setActionError(
        widthResult.issues[0]?.message ??
          "Unlock the affected widths before restoring the template size."
      );
      return null;
    }
    let candidate = widthResult.definition;
    if (Math.abs(getCabinetOverallHeight(current) - targetHeightMm) > 0.5) {
      candidate = resizeCabinetDefinition(candidate, "height", targetHeightMm);
    }
    if (Math.abs(getCabinetOverallDepth(current) - targetDepthMm) > 0.5) {
      candidate = resizeCabinetDefinition(candidate, "depth", targetDepthMm);
    }
    if (!heightLocked) {
      candidate = setCabinetParameterState(candidate, "overall.height", {
        source: "template_defined",
      });
    }
    if (!depthLocked) {
      candidate = setCabinetParameterState(candidate, "overall.depth", {
        source: "template_defined",
      });
    }
    return syncCabinetDefinitionDimensions(candidate);
  };

  const resetSizeSection = () => {
    const source = getCurrentTemplateSource();
    const candidate = buildTemplateSizeResetCandidate(source);
    if (!candidate || !replaceDefinition(touchDefinition(candidate))) return;
    setFitFeedback(null);
    setActionError(null);
    setActionSuccess("Size section restored to its template values.");
  };

  const resetSpaceSection = () => {
    const source = getCurrentTemplateSource();
    const sizeCandidate = buildTemplateSizeResetCandidate(source);
    if (!sizeCandidate) return;
    const candidate: CabinetDefinition = {
      ...sizeCandidate,
      fitState: source.fitState
        ? {
            ...source.fitState,
            host: {
              ...source.fitState.host,
              openings: [...source.fitState.host.openings],
            },
            segment: { ...source.fitState.segment },
          }
        : undefined,
    };
    if (!replaceDefinition(touchDefinition(candidate))) return;

    const defaultHostId = source.fitState?.host.id ?? preferredSpaceId ?? null;
    setSelectedSpaceId(defaultHostId);
    setFitMode(source.fitState?.mode ?? "fit_width");
    setFitAlignment(source.fitState?.alignment ?? "center");
    setMountingHeightDraft(
      String(toProjectMeasurementValue(
        source.fitState?.host.mountingHeightMm ??
          (source.modules.every((module) => module.type === "wall") ? 1400 : 0)
      ))
    );
    setFitFeedback(null);
    setActionError(null);
    setActionSuccess(
      source.fitState
        ? "Space and Fit settings restored to the saved template placement."
        : "Space and Fit settings restored to template defaults; style and layout choices were preserved."
    );
  };

  const resetConstructionSection = () => {
    const source = getCurrentTemplateSource();
    let preservedLockedFields = 0;
    const widthSensitiveFields = new Set<keyof CabinetDefinition>([
      "leftFillerWidth",
      "rightFillerWidth",
      "includeLeftEndPanel",
      "includeRightEndPanel",
      "leftEndPanelThickness",
      "rightEndPanelThickness",
      "includeCountertop",
      "countertopOverhangLeft",
      "countertopOverhangRight",
    ]);
    const heightSensitiveFields = new Set<keyof CabinetDefinition>([
      "includeCountertop",
      "countertopThickness",
      "includeBacksplash",
      "backsplashHeight",
    ]);
    const depthSensitiveFields = new Set<keyof CabinetDefinition>([
      "includeCountertop",
      "countertopOverhangFront",
      "countertopOverhangBack",
    ]);
    const updated = updateDefinition((previous) => {
      let next: CabinetDefinition = { ...previous };
      const sourceRecord = source as unknown as Record<string, unknown>;
      const overallHeightLocked = Boolean(
        getCabinetParameterState(previous, "overall.height").locked
      );
      const overallDepthLocked = Boolean(
        getCabinetParameterState(previous, "overall.depth").locked
      );
      for (const field of CABINET_CONSTRUCTION_RESET_FIELDS) {
        const locked = Boolean(getCabinetParameterState(previous, String(field)).locked);
        const dimensionLocked =
          (isCabinetOverallWidthLocked(previous) && widthSensitiveFields.has(field)) ||
          (overallHeightLocked && heightSensitiveFields.has(field)) ||
          (overallDepthLocked && depthSensitiveFields.has(field));
        if (locked || dimensionLocked) {
          preservedLockedFields += 1;
          continue;
        }
        const nextRecord = next as unknown as Record<string, unknown>;
        if (Object.prototype.hasOwnProperty.call(sourceRecord, field)) {
          nextRecord[field] = sourceRecord[field];
        } else {
          delete nextRecord[field];
        }
        next = setCabinetParameterState(next, String(field), {
          source: "template_defined",
        });
      }
      return next;
    });
    if (!updated) return;
    setActionError(null);
    setActionSuccess(
      preservedLockedFields
        ? `Construction defaults restored; ${preservedLockedFields} locked ${preservedLockedFields === 1 ? "value was" : "values were"} preserved.`
        : "Construction defaults restored without changing module layout or style assignments."
    );
  };

  const handleApplyFit = () => {
    if (!selectedSpace) {
      setFitFeedback(null);
      setActionError("Choose a measured wall or continue with manual dimensions.");
      return;
    }
    const mountingHeightMm = parseProjectMeasurementDraft(
      mountingHeightDraft,
      0,
      30_000
    );
    if (mountingHeightMm === null) {
      setActionError("Enter a valid non-negative mounting height.");
      return;
    }
    const fittedSpace: CabinetHostSpace = {
      ...selectedSpace,
      mountingHeightMm: Math.round(mountingHeightMm),
    };
    const result = fitCabinetToSpace(definitionRef.current, fittedSpace, {
      mode: fitMode,
      alignment: fitAlignment,
      requiredHostType,
    });
    setFitFeedback(result);
    if (!result.ok) {
      setActionError(result.issues[0]?.message ?? "This design cannot fit the selected space yet.");
      return;
    }
    replaceDefinition(result.definition);
    setActionError(null);
    setActionSuccess(
      `Fitted to ${fittedSpace.label}. ${result.moduleAdjustments.length} module ${result.moduleAdjustments.length === 1 ? "width was" : "widths were"} adjusted.`
    );
  };

  const addCustomMeasuredSpace = () => {
    const widthMm = parseProjectMeasurementDraft(customSpaceDraft.width, 1, 100_000);
    const heightMm = parseProjectMeasurementDraft(customSpaceDraft.height, 1, 30_000);
    const depthMm = parseProjectMeasurementDraft(customSpaceDraft.depth, 1, 30_000);
    const baseboardOffsetMm = parseProjectMeasurementDraft(
      customSpaceDraft.baseboard,
      0,
      5_000
    );
    if (
      widthMm === null ||
      heightMm === null ||
      depthMm === null ||
      baseboardOffsetMm === null ||
      !isStoredCabinetCustomSpaceKind(customSpaceDraft.kind)
    ) {
      setActionError("Enter valid positive measurements within the supported measured-area limits.");
      return;
    }
    const label = customSpaceDraft.label.trim() || "Measured area";
    if (label.length > 80) {
      setActionError("Keep the measured area name to 80 characters or fewer.");
      return;
    }
    const id = `custom-space-${Date.now()}`;
    const referenceRoom = availableSpaces[0];
    const space: CabinetHostSpace = {
      id,
      kind: customSpaceDraft.kind,
      label,
      roomId:
        referenceRoom?.roomId && referenceRoom.roomId.trim().length <= 160
          ? referenceRoom.roomId.trim()
          : undefined,
      roomName:
        referenceRoom?.roomName && referenceRoom.roomName.trim().length <= 160
          ? referenceRoom.roomName.trim()
          : undefined,
      roomType: referenceRoom?.roomType,
      availableWidthMm: Math.round(widthMm),
      availableHeightMm: Math.round(heightMm),
      availableDepthMm: Math.round(depthMm),
      baseboardOffsetMm: Math.round(baseboardOffsetMm),
      installationClearanceLeftMm: 10,
      installationClearanceRightMm: 10,
      installationClearanceTopMm: 20,
      openings: [],
    };
    setCustomSpaces((current) =>
      capCabinetCustomSpaces(
        [...current, space],
        definitionRef.current.fitState?.host.id
      )
    );
    setSelectedSpaceId(id);
    setCustomSpaceFormOpen(false);
    setFitFeedback(null);
    setActionError(null);
    setActionSuccess(`${space.label} added as a measured ${labelize(space.kind)}.`);
  };

  const removeCustomMeasuredSpace = (space: CabinetHostSpace) => {
    if (definitionRef.current.fitState?.host.id === space.id) {
      setActionSuccess(null);
      setActionError(
        "This measured host is used by the current fit. Apply a different host before deleting it."
      );
      return;
    }
    setCustomSpaces((current) => current.filter((candidate) => candidate.id !== space.id));
    if (selectedSpaceId === space.id) {
      setSelectedSpaceId(null);
      setFitFeedback(null);
    }
    setActionError(null);
    setActionSuccess(`${space.label} removed from saved measured hosts.`);
  };

  const handleGuidedOverallWidth = (value: number) => {
    const result = resizeCabinetToOverallWidth(definitionRef.current, value, {
      source: "user_overridden",
    });
    if (!result.ok) {
      setActionError(result.issues[0]?.message ?? "The locked module widths cannot fit this overall width.");
      return;
    }
    replaceDefinition(result.definition);
    setFitFeedback(null);
    setActionError(null);
    setActionSuccess(
      result.adjustments.length
        ? `Distributed ${formatProjectMeasurement(value)} across ${result.adjustments.length} unlocked ${result.adjustments.length === 1 ? "module" : "modules"}.`
        : "Overall width updated."
    );
  };

  const handleOverallHeightOrDepth = (
    field: "height" | "depth",
    valueMm: number
  ) => {
    updateDefinition((previous) =>
      setCabinetParameterState(
        resizeCabinetDefinition(previous, field, valueMm),
        `overall.${field}`,
        { source: "user_overridden" }
      )
    );
  };

  const handleDimensionHandleCommit = (
    field: CabinetOverallDimensionField,
    valueMm: number
  ) => {
    setDimensionPreview(null);
    if (field === "totalWidth") {
      handleGuidedOverallWidth(valueMm);
      return;
    }
    handleOverallHeightOrDepth(field, valueMm);
    setActionSuccess(`Overall ${field} resized to ${formatProjectMeasurement(valueMm)}.`);
  };

  const toggleActiveModuleWidthLock = () => {
    if (!activeModule) return;
    const nextLocked = !isCabinetModuleWidthLocked(definitionRef.current, activeModule.id);
    updateDefinition((previous) =>
      setCabinetModuleWidthLocked(previous, activeModule.id, nextLocked)
    );
    setActionSuccess(nextLocked ? "Module width locked." : "Module width unlocked.");
  };

  const toggleOverallWidthLock = () => {
    const nextLocked = !isCabinetOverallWidthLocked(definitionRef.current);
    updateDefinition((previous) => setCabinetOverallWidthLocked(previous, nextLocked));
    setActionSuccess(nextLocked ? "Overall width locked." : "Overall width unlocked.");
  };

  const toggleEqualModuleSizing = () => {
    const enabled = !getCabinetAutomationState(definitionRef.current).equalModuleSizing;
    let candidate = setCabinetEqualModuleSizing(definitionRef.current, enabled);
    if (enabled) {
      const equalized = resizeCabinetToOverallWidth(
        candidate,
        getCabinetOverallWidth(candidate),
        { source: "user_overridden" }
      );
      if (!equalized.ok) {
        setActionError(equalized.issues[0]?.message ?? "The current width locks prevent equal module sizing.");
        return;
      }
      candidate = equalized.definition;
    }
    replaceDefinition(candidate);
    setActionError(null);
    setActionSuccess(enabled ? "Equal module widths locked together." : "Equal module sizing released.");
  };

  const toggleActiveShelfSpacingLock = () => {
    if (!activeModule) return;
    const nextLocked = !activeShelfSpacingLocked;
    const paths = [
      cabinetShelfLayoutParameterPath(activeModule.id),
      ...CABINET_SHELF_LAYOUT_FIELDS.map(
        (field) => `modules.${activeModule.id}.${field}`
      ),
    ];
    const updated = updateDefinition((previous) =>
      paths.reduce(
        (next, path) => setCabinetParameterState(next, path, { locked: nextLocked }),
        previous
      )
    );
    if (updated) {
      setActionSuccess(nextLocked ? "Shelf layout locked." : "Shelf layout unlocked.");
    }
  };

  const setActiveShelfSpacingMode = (mode: "even" | "custom") => {
    if (!activeModule) return;
    if (activeShelfSpacingLocked) {
      setActionSuccess(null);
      setActionError("Shelf layout is locked. Unlock it before changing spacing mode.");
      return;
    }
    const updated = updateDefinition((previous) => {
      const sourceModule = previous.modules.find(
        (module) => module.id === activeModule.id
      );
      if (!sourceModule) return previous;
      let next: CabinetDefinition = {
        ...previous,
        modules: previous.modules.map((module) =>
          module.id === activeModule.id
            ? {
                ...module,
                shelfSpacingMode: mode,
                shelfPositionsMm:
                  mode === "custom"
                    ? getCabinetEvenShelfCenterHeights(previous, module)
                    : undefined,
              }
            : module
        ),
      };
      next = setCabinetAutomationMode(next, { shelfSpacingMode: mode });
      next = setCabinetParameterState(
        next,
        `modules.${activeModule.id}.shelfSpacingMode`,
        { source: "user_overridden" }
      );
      next = setCabinetParameterState(
        next,
        `modules.${activeModule.id}.shelfPositionsMm`,
        { source: mode === "custom" ? "user_overridden" : "automatic" }
      );
      return next;
    });
    if (updated) {
      setActionSuccess(
        mode === "custom"
          ? "Custom shelf spacing started from the current even layout."
          : "Even shelf spacing restored; custom shelf heights were replaced."
      );
    }
  };

  const updateActiveShelfPosition = (index: number, valueMm: number) => {
    if (!activeModule || activeShelfSpacingMode !== "custom") return;
    const positions = [...activeShelfPositions];
    if (typeof positions[index] !== "number") return;
    const minimumCenter =
      index === 0
        ? definition.toeKickHeight + definition.boardThickness
        : positions[index - 1] + definition.boardThickness;
    const maximumCenter =
      index === positions.length - 1
        ? activeModule.height - definition.boardThickness
        : positions[index + 1] - definition.boardThickness;
    positions[index] = Math.max(
      minimumCenter,
      Math.min(maximumCenter, Math.round(valueMm))
    );
    updateModule(activeModule.id, { shelfPositionsMm: positions });
  };

  const commitModuleDividerResize = (input: {
    leftModuleId: string;
    rightModuleId: string;
    leftWidthMm: number;
    rightWidthMm: number;
  }) => {
    const current = definitionRef.current;
    const leftIndex = current.modules.findIndex((module) => module.id === input.leftModuleId);
    const rightIndex = current.modules.findIndex((module) => module.id === input.rightModuleId);
    if (leftIndex < 0 || rightIndex !== leftIndex + 1) return;
    if (
      getCabinetAutomationState(current).equalModuleSizing ||
      isCabinetModuleWidthLocked(current, input.leftModuleId) ||
      isCabinetModuleWidthLocked(current, input.rightModuleId)
    ) {
      setActionSuccess(null);
      setActionError("Unlock both adjacent modules and release equal sizing before moving this divider.");
      return;
    }
    const leftModule = current.modules[leftIndex];
    const rightModule = current.modules[rightIndex];
    const pairWidthMm = leftModule.width + rightModule.width;
    const minimumLeftMm = getCabinetMinimumModuleWidthMm(leftModule, current);
    const minimumRightMm = getCabinetMinimumModuleWidthMm(rightModule, current);
    const leftWidthMm = Math.max(
      minimumLeftMm,
      Math.min(pairWidthMm - minimumRightMm, Math.round(input.leftWidthMm))
    );
    const rightWidthMm = pairWidthMm - leftWidthMm;
    const updated = updateDefinition((previous) => {
      let next = syncCabinetDefinitionDimensions({
        ...previous,
        modules: previous.modules.map((module) =>
          module.id === input.leftModuleId
            ? { ...module, width: leftWidthMm }
            : module.id === input.rightModuleId
              ? { ...module, width: rightWidthMm }
              : module
        ),
      });
      next = setCabinetParameterState(
        next,
        `modules.${input.leftModuleId}.width`,
        { source: "user_overridden" }
      );
      return setCabinetParameterState(
        next,
        `modules.${input.rightModuleId}.width`,
        { source: "user_overridden" }
      );
    });
    if (updated) {
      setActionSuccess(`Divider moved: ${formatProjectMeasurement(leftWidthMm)} / ${formatProjectMeasurement(rightWidthMm)}.`);
    }
  };

  const setActiveDoorLayoutMode = (mode: "recommended" | "manual") => {
    if (!activeModule || mode === activeDoorLayoutMode) return;
    const updated = updateDefinition((previous) =>
      setCabinetDoorLayoutMode(previous, activeModule.id, mode)
    );
    if (updated) {
      setActionSuccess(
        mode === "manual"
          ? `Manual door count started from the current recommendation of ${activeDoorCount}.`
          : "Recommended door layout restored; the manual count was replaced and will now follow bay width."
      );
    }
  };

  const setActiveDrawerHeightMode = (
    mode: "equal" | "recommended" | "custom"
  ) => {
    if (!activeModule || mode === activeDrawerHeightMode) return;
    const updated = updateDefinition((previous) =>
      setCabinetDrawerHeightMode(previous, activeModule.id, mode)
    );
    if (updated) {
      setActionSuccess(
        mode === "custom"
          ? "Custom drawer proportions started from the currently generated stack."
          : `${mode === "equal" ? "Equal" : "Recommended"} drawer heights restored; custom proportions were replaced.`
      );
    }
  };

  const updateActiveDrawerProportion = (index: number, percentage: number) => {
    if (!activeModule || activeDrawerHeightMode !== "custom") return;
    const proportions = [...activeDrawerHeightProportions];
    if (typeof proportions[index] !== "number") return;
    proportions[index] = Math.max(0.01, percentage / 100);
    updateModule(activeModule.id, { drawerHeightProportions: proportions });
  };

  const setActiveHandlePlacementMode = (mode: "automatic" | "custom") => {
    if (!activeModule || mode === activeHandlePlacementMode) return;
    const updated = updateDefinition((previous) =>
      setCabinetHandlePlacementMode(previous, activeModule.id, mode)
    );
    if (updated) {
      setActionSuccess(
        mode === "custom"
          ? "Custom handle placement started from the current automatic position with zero shift."
          : "Automatic handle placement restored; custom offsets were removed."
      );
    }
  };

  const updateWallBedSize = (
    mattressSize: CabinetWallBedMattressSize,
    orientation: CabinetWallBedOrientation
  ) => {
    if (!activeModule || !isCabinetWallBedPanel(activeModule)) return;
    const geometry = getCabinetWallBedRecommendedGeometry(
      mattressSize,
      orientation
    );
    const updated = updateModule(activeModule.id, {
      wallBedMattressSize: mattressSize,
      wallBedOrientation: orientation,
      width: geometry.moduleWidthMm,
      convertiblePanelHeight: Math.min(
        activeModule.height,
        geometry.panelHeightMm
      ),
      convertibleOpenDepth: geometry.openDepthMm,
    });
    if (updated) {
      setActionSuccess(
        `${labelize(mattressSize)} mattress and ${orientation} opening applied with coordinated cabinet clearances.`
      );
    }
  };

  const updateWallBedSideStorage = (sideStorage: CabinetWallBedSideStorage) => {
    if (!activeModule || !isCabinetWallBedPanel(activeModule)) return;
    const updated = updateDefinition((previous) => {
      const wallBedIndex = previous.modules.findIndex(
        (module) => module.id === activeModule.id
      );
      if (wallBedIndex < 0) return previous;
      const wallBedModule = {
        ...previous.modules[wallBedIndex],
        wallBedSideStorage: sideStorage,
      };
      if (previous.millworkAssemblyType !== "murphy_bed") {
        return {
          ...previous,
          modules: previous.modules.map((module) =>
            module.id === wallBedModule.id ? wallBedModule : module
          ),
        };
      }

      const template = createCabinetPreset("murphy_bed", previous.id);
      const currentLeft = previous.modules[wallBedIndex - 1];
      const currentRight = previous.modules[wallBedIndex + 1];
      const createSide = (side: "left" | "right") => {
        const existing = side === "left" ? currentLeft : currentRight;
        if (existing && !isCabinetWallBedPanel(existing)) return existing;
        const source = template.modules[side === "left" ? 0 : 2];
        return {
          ...source,
          id: `${wallBedModule.id}-side-${side}-${Date.now()}`,
        };
      };
      return {
        ...previous,
        modules: [
          ...(sideStorage === "left" || sideStorage === "both"
            ? [createSide("left")]
            : []),
          wallBedModule,
          ...(sideStorage === "right" || sideStorage === "both"
            ? [createSide("right")]
            : []),
        ],
      };
    });
    if (updated) {
      setActionSuccess(`${labelize(sideStorage)} wall-bed side storage applied.`);
    }
  };

  const toggleActiveMaterialLock = () => {
    if (!activeModule) return;
    const paths = [
      `modules.${activeModule.id}.materialId`,
      `modules.${activeModule.id}.frontMaterialId`,
    ];
    const nextLocked = !getCabinetParameterState(definitionRef.current, paths[0]).locked;
    updateDefinition((previous) =>
      paths.reduce(
        (current, path) => setCabinetParameterState(current, path, { locked: nextLocked }),
        previous
      )
    );
    setActionSuccess(nextLocked ? "Material assignment locked." : "Material assignment unlocked.");
  };

  const resetParameterToAutomatic = (path: string) => {
    const updated = updateDefinition((previous) => {
      let next = setCabinetParameterState(previous, path, {
        source: "automatic",
        locked: false,
      });
      if (
        [
          "leftFillerWidth",
          "rightFillerWidth",
          "leftFillerScribeAllowance",
          "rightFillerScribeAllowance",
        ].includes(path)
      ) {
        next = setCabinetAutomationMode(next, { fillerSizingMode: "automatic" });
      }
      return next;
    });
    if (updated) {
      setActionSuccess("Automatic control restored. Apply Fit to Space to recalculate this value.");
    }
  };

  const applyGuidedMaterial = (materialId: string) => {
    updateDefinition((previous) => {
      let next: CabinetDefinition = {
        ...previous,
        modules: previous.modules.map((module) => {
          const materialPath = `modules.${module.id}.materialId`;
          const frontMaterialPath = `modules.${module.id}.frontMaterialId`;
          if (
            getCabinetParameterState(previous, materialPath).locked ||
            getCabinetParameterState(previous, frontMaterialPath).locked
          ) {
            return module;
          }
          return { ...module, materialId, frontMaterialId: materialId };
        }),
      };
      previous.modules.forEach((module) => {
        const materialPath = `modules.${module.id}.materialId`;
        const frontMaterialPath = `modules.${module.id}.frontMaterialId`;
        if (
          getCabinetParameterState(previous, materialPath).locked ||
          getCabinetParameterState(previous, frontMaterialPath).locked
        ) {
          return;
        }
        next = setCabinetParameterState(next, materialPath, { source: "user_overridden" });
        next = setCabinetParameterState(next, frontMaterialPath, { source: "user_overridden" });
      });
      return next;
    });
  };

  const resetStyleSection = () => {
    const source = getCurrentTemplateSource();
    const styleFields = [
      "materialId",
      "frontMaterialId",
      "doorStyle",
      "hardwareId",
      "handlePlacementMode",
      "handleOffsetX",
      "handleOffsetY",
    ] as const satisfies readonly (keyof CabinetModuleDefinition)[];
    const updated = updateDefinition((previous) => {
      let next: CabinetDefinition = {
        ...previous,
        modules: previous.modules.map((module, index) => {
          const templateModule =
            source.modules[index] ?? source.modules[source.modules.length - 1];
          if (!templateModule) return module;
          const resetModule = { ...module } as CabinetModuleDefinition;
          const resetRecord = resetModule as unknown as Record<string, unknown>;
          const templateRecord = templateModule as unknown as Record<string, unknown>;
          styleFields.forEach((field) => {
            const path = `modules.${module.id}.${String(field)}`;
            if (getCabinetParameterState(previous, path).locked) return;
            if (Object.prototype.hasOwnProperty.call(templateRecord, field)) {
              resetRecord[field] = templateRecord[field];
            } else {
              delete resetRecord[field];
            }
          });
          return resetModule;
        }),
      };
      previous.modules.forEach((module) => {
        styleFields.forEach((field) => {
          const path = `modules.${module.id}.${String(field)}`;
          if (getCabinetParameterState(previous, path).locked) return;
          next = setCabinetParameterState(next, path, {
            source: "template_defined",
          });
        });
      });
      return next;
    });
    if (updated) {
      setActionSuccess("Style section restored; locked module assignments were preserved.");
    }
  };

  const updateSelectedPartMaterial = (materialId: string) => {
    if (!activeModule || !selectedPart || !selectedPartMaterialTarget) return;
    if (selectedPartMaterialTarget === "front") {
      updateModule(activeModule.id, { frontMaterialId: materialId });
      return;
    }
    if (selectedPartMaterialTarget === "carcass") {
      updateModule(activeModule.id, { materialId });
      return;
    }

    const field = selectedPartMaterialTarget === "countertop"
      ? "countertopMaterialId"
      : selectedPartMaterialTarget === "backsplash"
        ? "backsplashMaterialId"
        : "faceFrameMaterialId";
    if (getCabinetParameterState(definitionRef.current, field).locked) {
      setActionSuccess(null);
      setActionError(`${labelize(field)} is locked. Unlock it before changing this material.`);
      return;
    }
    updateDefinition((previous) => ({ ...previous, [field]: materialId }));
  };

  const applyGuidedWardrobeArrangement = (
    arrangementId: CabinetWardrobeArrangementId
  ) => {
    setActionError(null);
    setActionSuccess(null);
    if (!activeModule) {
      setActionError("Choose a wardrobe bay before applying an arrangement.");
      return;
    }

    const option = CABINET_WARDROBE_ARRANGEMENTS.find(
      (candidate) => candidate.id === arrangementId
    );
    const result = applyCabinetWardrobeArrangement(
      definitionRef.current,
      activeModule.id,
      arrangementId
    );
    if (!result.ok) {
      setActionError(
        result.issues[0]?.message ??
          `${option?.label ?? "This wardrobe arrangement"} cannot be applied to the selected bay.`
      );
      return;
    }
    if (result.changedPaths.length === 0) {
      setActionSuccess(`${option?.label ?? "This wardrobe arrangement"} is already applied.`);
      return;
    }
    if (!replaceDefinition(touchDefinition(result.definition))) return;

    setActionError(null);
    setActionSuccess(
      `${option?.label ?? "Wardrobe arrangement"} applied to Bay ${activeModuleIndex + 1}. You can undo this change.`
    );
  };

  const unlockModules = (moduleIds: string[]) => {
    updateDefinition((previous) =>
      moduleIds.reduce(
        (next, moduleId) => setCabinetModuleWidthLocked(next, moduleId, false),
        previous
      )
    );
    setActionSuccess(`${moduleIds.length} ${moduleIds.length === 1 ? "module" : "modules"} unlocked.`);
  };

  const buildValidationFixCandidate = (
    fix: CabinetValidationAutoFix,
    current: CabinetDefinition
  ): CabinetDefinition => {
    const action = fix.action;
    if (action.type === "patch_module") {
      return syncCabinetDefinitionDimensions({
        ...current,
        modules: current.modules.map((module) =>
          module.id === action.moduleId ? { ...module, ...action.patch } : module
        ),
      });
    }
    if (action.type === "patch_definition") {
      return syncCabinetDefinitionDimensions({ ...current, ...action.patch });
    }
    if (action.type === "sync_dimensions") {
      return syncCabinetDefinitionDimensions(current);
    }
    if (action.type === "resize_overall_width") {
      const result = resizeCabinetToOverallWidth(current, action.widthMm, {
        source: "automatic",
      });
      return result.ok ? result.definition : current;
    }
    if (action.type === "set_width_locks") {
      return action.moduleIds.reduce(
        (next, moduleId) => setCabinetModuleWidthLocked(next, moduleId, action.locked),
        current
      );
    }
    const host =
      allAvailableSpaces.find((space) => space.id === action.hostId) ??
      (current.fitState?.host.id === action.hostId ? current.fitState.host : null);
    if (!host) return current;
    const result = fitCabinetToSpace(current, host, {
      mode: action.mode,
      alignment: current.fitState?.alignment ?? fitAlignment,
      requiredHostType: activePreset?.requiredHostType ?? current.requiredHostType,
    });
    return result.ok ? result.definition : current;
  };

  const commitValidationFix = (fix: CabinetValidationAutoFix) => {
    const action = fix.action;
    let applied = false;
    if (action.type === "patch_module") {
      applied = updateModule(action.moduleId, action.patch);
    } else {
      const candidate = buildValidationFixCandidate(fix, definitionRef.current);
      if (candidate === definitionRef.current) {
        setActionError("The suggested change cannot be applied while the current widths are locked.");
        return;
      }
      if (
        isCabinetOverallWidthLocked(definitionRef.current) &&
        Math.abs(
          getCabinetOverallWidth(candidate) -
            getCabinetOverallWidth(definitionRef.current)
        ) > 0.5
      ) {
        setActionError(
          "Overall width is locked. Unlock it before applying a fix that changes the assembly width."
        );
        return;
      }
      replaceDefinition(candidate);
      applied = true;
    }
    if (!applied) return;
    setPendingValidationFix(null);
    setActionError(null);
    setActionSuccess(`${fix.label} applied. You can undo this change.`);
    trackStudioInteraction("millwork_validation_fix_applied", {
      fix_action: fix.action.type,
      confirmation: fix.confirmation,
    });
  };

  const requestValidationFix = (
    issue: CabinetValidationIssue,
    fix: CabinetValidationAutoFix
  ) => {
    if (fix.confirmation === "none") {
      commitValidationFix(fix);
      return;
    }
    const candidate = buildValidationFixCandidate(fix, definitionRef.current);
    setPendingValidationFix({ issue, fix, candidate });
  };

  const focusValidationIssue = (issue: CabinetValidationIssue) => {
    const moduleId = issue.target.moduleIds?.[0];
    if (moduleId) setActiveModuleId(moduleId);
    if (effectiveExperienceMode === "guided") {
      const stepId =
        issue.target.scope === "fit"
          ? "space"
          : issue.target.scope === "module"
            ? "layout"
            : ["totalWidth", "height", "depth"].includes(issue.field ?? "")
              ? "size"
              : "review";
      const nextStep = GUIDED_STEPS.findIndex((step) => step.id === stepId);
      if (nextStep >= 0) setGuidedStep(nextStep);
    } else if (issue.target.scope === "assembly") {
      setSemanticSelection({
        scope: "assembly",
        cabinetDefinitionId: definitionRef.current.id,
        additive: false,
      });
    } else {
      setAdvancedOpen(true);
      setModuleOptionsOpen(true);
    }
    window.setTimeout(() => {
      const field = issue.target.field;
      if (!field) return;
      const fieldLeaf = field.split(".").at(-1) ?? field;
      const property = CABINET_PROPERTY_REGISTRY.find(
        (candidate) => candidate.field === fieldLeaf
      );
      const element =
        document.querySelector<HTMLElement>(`[data-validation-field="${field}"]`) ??
        (property
          ? document.querySelector<HTMLElement>(
              `[data-testid="${property.controlTestId}"]`
            )
          : null);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      element?.focus();
    }, 50);
  };

  const commitModuleSizingResult = (
    result: ReturnType<typeof reconcileCabinetModuleSizing>,
    nextActiveModuleId?: string
  ) => {
    setActionError(null);
    setActionSuccess(null);
    if (!result.ok) {
      setActionError(result.explanation);
      return false;
    }
    const next = touchDefinition(result.definition);
    if (!replaceDefinition(next)) return false;
    if (nextActiveModuleId) setActiveModuleId(nextActiveModuleId);
    setFitFeedback(null);
    setActionSuccess(result.explanation);
    return true;
  };

  const changeModuleSizingMode = (mode: "automatic" | "manual") => {
    const current = definitionRef.current;
    if (getCabinetAutomationState(current).moduleSizingMode === mode) return;
    commitModuleSizingResult(
      reconcileCabinetModuleSizing(current, { operation: "set_mode", mode })
    );
  };

  const addModule = () => {
    const current = definitionRef.current;
    const base = current.modules.find((module) => module.id === activeModuleId) ?? current.modules[0];
    if (!base) return;
    const nextModule: CabinetModuleDefinition = {
      ...base,
      id: `module-${current.modules.length + 1}-${Date.now()}`,
    };
    commitModuleSizingResult(
      reconcileCabinetModuleSizing(current, {
        operation: "add",
        modules: [...current.modules, nextModule],
      }),
      nextModule.id
    );
  };

  const duplicateModule = () => {
    const current = definitionRef.current;
    const source = current.modules.find((module) => module.id === activeModuleId);
    if (!source) return;
    const nextModule: CabinetModuleDefinition = {
      ...source,
      id: `module-${current.modules.length + 1}-${Date.now()}`,
    };
    const sourceIndex = current.modules.findIndex((module) => module.id === source.id);
    const nextModules = [...current.modules];
    nextModules.splice(sourceIndex + 1, 0, nextModule);
    commitModuleSizingResult(
      reconcileCabinetModuleSizing(current, {
        operation: "duplicate",
        modules: nextModules,
      }),
      nextModule.id
    );
  };

  const deleteModule = () => {
    const current = definitionRef.current;
    const currentIndex = current.modules.findIndex((module) => module.id === activeModuleId);
    if (currentIndex < 0 || current.modules.length <= 1) return;
    const nextModules = current.modules.filter((module) => module.id !== activeModuleId);
    const nextActiveId = nextModules[Math.min(currentIndex, nextModules.length - 1)]?.id;
    commitModuleSizingResult(
      reconcileCabinetModuleSizing(current, {
        operation: "delete",
        modules: nextModules,
      }),
      nextActiveId
    );
  };

  const moveActiveModule = (direction: -1 | 1) => {
    const current = definitionRef.current;
    const currentIndex = current.modules.findIndex((module) => module.id === activeModuleId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= current.modules.length) return;
    const modules = [...current.modules];
    const [movedModule] = modules.splice(currentIndex, 1);
    modules.splice(targetIndex, 0, movedModule);
    commitModuleSizingResult(
      reconcileCabinetModuleSizing(current, { operation: "reorder", modules }),
      activeModuleId
    );
  };

  const reorderModule = (sourceModuleId: string, targetModuleId: string) => {
    if (sourceModuleId === targetModuleId) return;
    const current = definitionRef.current;
    const sourceIndex = current.modules.findIndex((module) => module.id === sourceModuleId);
    const targetIndex = current.modules.findIndex((module) => module.id === targetModuleId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const modules = [...current.modules];
    const [movedModule] = modules.splice(sourceIndex, 1);
    modules.splice(targetIndex, 0, movedModule);
    commitModuleSizingResult(
      reconcileCabinetModuleSizing(current, { operation: "reorder", modules }),
      sourceModuleId
    );
  };

  const recordExportSuccess = (artifact: string, message: string) => {
    setActionSuccess(message);
    trackStudioInteraction("millwork_export_completed", { artifact });
  };

  const handleDownload = async () => {
    setActionError(null);
    setActionSuccess(null);
    setBusyAction("download");
    try {
      await downloadCabinetGlb(definition);
      recordExportSuccess("glb", "Millwork GLB exported.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to export cabinet GLB.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadDocumentation = () => {
    setActionError(null);
    setActionSuccess(null);
    setBusyAction("docs");
    try {
      downloadCabinetDocumentationCsv(definition);
      recordExportSuccess("documentation_csv", "Millwork documentation exported.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to export documentation.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadSourceDefinition = () => {
    setActionError(null);
    setActionSuccess(null);
    setBusyAction("source");
    try {
      downloadCabinetSourceDefinitionJson(definition);
      recordExportSuccess("source_definition_json", "Source definition exported.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to export source definition.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleImportSourceDefinition = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setActionError(null);
    setActionSuccess(null);
    setBusyAction("import");
    try {
      const text = await file.text();
      const parsedDefinition = parseCabinetSourceDefinitionJson(text);
      if (rejectNonFiniteDefinition(parsedDefinition)) return;
      const importedPresetId = cabinetPresetIdFromDefinition(parsedDefinition);
      const importedPreset = CABINET_PRESET_OPTIONS.find(
        (preset) => preset.id === importedPresetId
      );
      const importedDefinition = touchDefinition({
        ...parsedDefinition,
        sourcePresetId: importedPreset?.id,
        requiredHostType:
          importedPreset?.requiredHostType ?? parsedDefinition.requiredHostType,
      });
      if (!replaceDefinition(importedDefinition)) return;
      setTemplateSourceIdentity(
        importedPresetId,
        null
      );
      setActiveModuleId(importedDefinition.modules[0]?.id ?? "");
      setActionSuccess("Source definition imported.");
      trackStudioInteraction("millwork_source_definition_imported", {
        source_preset_id: importedDefinition.sourcePresetId ?? null,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to import source definition.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadShopDrawing = () => {
    setActionError(null);
    setActionSuccess(null);
    setBusyAction("shopDrawing");
    try {
      downloadCabinetShopDrawingSvg(definition);
      recordExportSuccess("shop_drawing_svg", "Shop drawing SVG exported.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to export shop drawing SVG.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadDxf = () => {
    setActionError(null);
    setActionSuccess(null);
    setBusyAction("dxf");
    try {
      downloadCabinetFabricationDxf(definition);
      recordExportSuccess("fabrication_dxf", "Fabrication DXF exported.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to export fabrication DXF.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadRfq = () => {
    setActionError(null);
    setActionSuccess(null);
    setBusyAction("rfq");
    try {
      downloadCabinetFabricationQuoteRequestJson(definition);
      recordExportSuccess("fabrication_rfq_json", "Fabrication RFQ exported.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to export fabrication RFQ.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadPackage = () => {
    setActionError(null);
    setActionSuccess(null);
    setBusyAction("package");
    try {
      downloadCabinetDocumentationPackageJson(definition);
      recordExportSuccess("millwork_package_json", "Millwork package exported.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to export millwork package.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleSave = async () => {
    setActionError(null);
    setActionSuccess(null);
    setBusyAction("save");
    try {
      if (mode === "create") {
        saveCurrentAsTemplate();
        return;
      }
      if (!onSave) {
        throw new Error("Saving is unavailable for this placed millwork asset.");
      }
      const saved = await onSave(definition);
      if (!saved) {
        throw new Error(
          mode === "edit"
            ? "The placed millwork could not be updated."
            : "Save is unavailable until this design is placed or stored as a reusable template."
        );
      }
      setActionSuccess(mode === "edit" ? "Millwork definition updated." : "Millwork definition saved.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to save cabinet definition.");
    } finally {
      setBusyAction(null);
    }
  };

  const handlePlace = async () => {
    if (!onPlaceInPlan) return;
    setActionError(null);
    setActionSuccess(null);
    setBusyAction("place");
    try {
      const glbBlob = await exportCabinetAsGlb(definition);
      const placed = await onPlaceInPlan({
        definition,
        glbBlob,
        bom: generateCabinetBOM(definition),
      });
      if (!placed) {
        throw new Error("Add or select a room before placing this millwork in the plan.");
      }
      setActionSuccess(mode === "edit" ? "Millwork placement updated." : "Millwork placed in plan.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to place cabinet.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveAsCopy = async () => {
    if (!onPlaceInPlan) return;
    setActionError(null);
    setActionSuccess(null);
    setBusyAction("copy");
    try {
      const now = new Date().toISOString();
      const copyDefinition: CabinetDefinition = {
        ...definition,
        id: `cabinet-${Date.now()}`,
        name: `${definition.name} copy`,
        createdAt: now,
        updatedAt: now,
      };
      const copyBom = generateCabinetBOM(copyDefinition);
      const glbBlob = await exportCabinetAsGlb(copyDefinition);
      const placed = await onPlaceInPlan({
        definition: copyDefinition,
        glbBlob,
        bom: copyBom,
        placeAsCopy: true,
      });
      if (!placed) {
        throw new Error("Add or select a room before placing a millwork copy.");
      }
      setActionSuccess("A separate millwork copy was placed in the plan.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to save this design as a copy.");
    } finally {
      setBusyAction(null);
    }
  };

  if (effectiveExperienceMode === "guided") {
    const currentStep = GUIDED_STEPS[guidedStep];
    const currentMaterial = CABINET_MATERIALS.find(
      (material) => material.id === (activeModule?.frontMaterialId ?? activeModule?.materialId)
    );
    const currentHardware = CABINET_HARDWARE.find(
      (hardware) => hardware.id === (activeModule?.hardwareId ?? "none")
    );
    const supportsGuidedLayout = (activeModule?.millworkComponentType ?? "cabinet") === "cabinet";
    const consumerEstimate = documentation.quoteSummary;
    const formatEstimate = (value: number) =>
      value.toLocaleString("en-US", {
        style: "currency",
        currency: consumerEstimate.currency,
        maximumFractionDigits: 0,
      });

    return (
      <div
        data-testid="custom-millwork-studio"
        data-mode={mode}
        data-access-level={accessLevel}
        data-experience="guided"
        data-measurement-unit={projectMeasurementUnit}
        data-required-host={requiredHostType ?? ""}
        data-busy-action={busyAction ?? ""}
        className="h-full"
      >
        <div
          key={projectMeasurementUnit}
          data-testid="cabinetry-studio"
          className="flex h-full min-h-[680px] flex-col overflow-hidden bg-[#f6f4ef] text-neutral-950"
        >
          <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-2 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-950 text-white shadow-sm">
                <Box className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">Custom Millwork Studio</h2>
                <p className="truncate text-xs text-neutral-500">Simple to start, powerful when needed.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div role="group" className="hidden items-center rounded-xl bg-neutral-100 p-1 sm:flex" aria-label="Editor workspace">
                <button
                  type="button"
                  data-testid="cabinet-experience-guided"
                  aria-pressed="true"
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-neutral-950 shadow-sm"
                >
                  Guided setup
                </button>
                {isProWorkspace ? (
                  <button
                    type="button"
                    data-testid="cabinet-experience-detailed"
                    aria-pressed="false"
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-950"
                    onClick={() => chooseExperienceMode("detailed")}
                  >
                    Detailed editor
                  </button>
                ) : null}
              </div>
              <div className="flex items-center rounded-xl border border-neutral-200 bg-white p-1">
                <button
                  type="button"
                  data-testid="cabinet-undo"
                  aria-label="Undo last millwork change"
                  title="Undo"
                  className="grid h-8 w-8 place-items-center rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
                  disabled={historyRef.current.past.length === 0}
                  onClick={undoDefinition}
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  data-testid="cabinet-redo"
                  aria-label="Redo last millwork change"
                  title="Redo"
                  className="grid h-8 w-8 place-items-center rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
                  disabled={historyRef.current.future.length === 0}
                  onClick={redoDefinition}
                >
                  <Redo2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  data-testid="cabinet-restore-template"
                  aria-label="Restore template defaults"
                  title="Restore template defaults"
                  className="grid h-8 w-8 place-items-center rounded-lg text-neutral-600 hover:bg-neutral-100"
                  onClick={restoreTemplateDefaults}
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                data-testid="cabinetry-studio-close"
                aria-label="Close cabinetry studio"
                className="grid h-9 w-9 place-items-center rounded-xl text-neutral-600 hover:bg-neutral-100"
                onClick={onCancel}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(560px,1.08fr)_minmax(380px,0.92fr)]">
            <section className="min-h-0 overflow-y-auto border-r border-neutral-200 px-4 py-5 sm:px-6 lg:px-8">
              <nav aria-label="Guided millwork steps" className="mb-7 grid grid-cols-6 gap-1 sm:gap-2">
                {GUIDED_STEPS.map((step, index) => {
                  const StepIcon = step.icon;
                  const isActive = index === guidedStep;
                  const isComplete = index < guidedStep;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      data-testid={`cabinet-guided-step-${step.id}`}
                      aria-current={isActive ? "step" : undefined}
                      className={`group grid min-w-0 gap-1 rounded-xl px-1.5 py-2 text-center transition sm:px-3 ${
                        isActive
                          ? "bg-neutral-950 text-white shadow-sm"
                          : "text-neutral-500 hover:bg-white hover:text-neutral-950"
                      }`}
                      onClick={() => setGuidedStep(index)}
                    >
                      <span
                        className={`mx-auto grid h-6 w-6 place-items-center rounded-full ${
                          isActive ? "bg-white/15" : isComplete ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200/70"
                        }`}
                      >
                        {isComplete ? <Check className="h-3.5 w-3.5" /> : <StepIcon className="h-3.5 w-3.5" />}
                      </span>
                      <span className="truncate text-[11px] font-semibold sm:text-xs">{step.label}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="mb-6 lg:hidden">
                <button
                  type="button"
                  data-testid="cabinet-mobile-preview-toggle"
                  aria-expanded={mobilePreviewOpen}
                  aria-controls="cabinet-mobile-preview"
                  className="flex min-h-11 w-full items-center justify-between rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                  onClick={() => setMobilePreviewOpen((open) => !open)}
                >
                  <span>{mobilePreviewOpen ? "Hide 3D preview" : "View 3D preview"}</span>
                  <span className="text-xs font-medium text-neutral-500">
                    {formatProjectMeasurement(definition.totalWidth)} × {formatProjectMeasurement(definition.height)} × {formatProjectMeasurement(definition.depth)}
                  </span>
                </button>
                {mobilePreviewOpen ? (
                  <div
                    id="cabinet-mobile-preview"
                    data-testid="cabinet-mobile-preview"
                    className="relative mt-3 h-72 overflow-hidden rounded-2xl border border-neutral-200 bg-[#e5e7e1]"
                  >
                    <CabinetPreview3D
                      definition={deferredDefinition}
                      generatedParts={previewParts}
                      view={previewView}
                      showClearances={showClearances}
                      selection={semanticSelection}
                      onSemanticSelect={handleSemanticPreviewSelection}
                    />
                    <div className="absolute right-3 top-3 z-30">
                      <CabinetPreviewViewSelector value={previewView} onChange={setPreviewView} />
                    </div>
                    <span
                      role="status"
                      aria-live="polite"
                      className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-neutral-700 shadow-sm"
                    >
                      {previewStatus === "regenerating" ? "Updating preview…" : "Preview ready"}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="mx-auto w-full max-w-4xl">
                <div className="mb-6">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                    Step {guidedStep + 1} of {GUIDED_STEPS.length}
                  </p>
                  <h1 className="text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
                    {currentStep.hint}
                  </h1>
                </div>

                {guidedStep === 0 ? (
                  <div className="grid gap-5" data-testid="cabinet-guided-type-panel">
                    <CabinetContextualOnboarding
                      step="type"
                      visible={showOnboarding}
                      onDismiss={dismissOnboarding}
                      onShow={() => setShowOnboarding(true)}
                    />
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                      <input
                        data-testid="cabinet-template-search"
                        aria-label="Search millwork templates"
                        className="h-12 w-full rounded-2xl border border-neutral-300 bg-white pl-10 pr-4 text-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
                        type="search"
                        value={templateQuery}
                        placeholder="Search wardrobe, media wall, drawers…"
                        onChange={(event) => setTemplateQuery(event.target.value)}
                      />
                    </div>

                    <div role="group" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Template categories">
                      {(["Featured", "All", ...GUIDED_TEMPLATE_CATEGORIES] as const).map((category) => (
                        <button
                          key={category}
                          type="button"
                          data-testid={`cabinet-template-category-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                          aria-pressed={templateCategory === category}
                          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            templateCategory === category
                              ? "border-neutral-950 bg-neutral-950 text-white"
                              : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-600 hover:text-neutral-950"
                          }`}
                          onClick={() => setTemplateCategory(category)}
                        >
                          {category === "Featured" ? "Recommended" : category === "All" ? "All templates" : category}
                        </button>
                      ))}
                    </div>

                    {visibleTemplates.length ? (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {visibleTemplates.map((preset) => {
                          const previewDefinition = createCabinetPreset(preset.id, `preview-${preset.id}`);
                          const isSelected = preset.id === activePresetId;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              data-testid={`cabinet-preset-${preset.id}`}
                              data-required-host={preset.requiredHostType}
                              data-safety-classification={preset.safetyClassification}
                              data-applicable-room-types={preset.applicableRoomTypes.join(",")}
                              data-supported-options={preset.supportedCustomizationOptions.join(",")}
                              aria-pressed={isSelected}
                              className={`group grid gap-3 rounded-2xl border bg-white p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                                isSelected
                                  ? "border-neutral-950 ring-2 ring-neutral-950/10"
                                  : "border-neutral-200 hover:border-neutral-400"
                              }`}
                              onClick={() => applyPreset(preset.id)}
                            >
                              <CabinetTemplateDiagram
                                definition={previewDefinition}
                                thumbnailKind={preset.visualThumbnail.kind}
                                testId={`cabinet-template-thumbnail-${preset.id}`}
                              />
                              <span className="grid gap-1">
                                <span className="flex items-start justify-between gap-2">
                                  <span className="text-sm font-semibold text-neutral-950">{preset.label}</span>
                                  {isSelected ? (
                                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-neutral-950 text-white">
                                      <Check className="h-3 w-3" />
                                    </span>
                                  ) : null}
                                </span>
                                <span className="line-clamp-2 text-xs leading-5 text-neutral-500">{preset.description}</span>
                              </span>
                              <span className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                <span className="rounded-full bg-neutral-100 px-2 py-1">{preset.difficulty}</span>
                                <span className="inline-flex items-center gap-1">
                                  <Clock3 className="h-3 w-3" /> {preset.estimatedMinutes} min
                                </span>
                                <span>{preset.host}</span>
                                <span className={preset.safetyClassification === "standard" ? "" : "text-amber-700"}>
                                  {labelize(preset.safetyClassification)}
                                </span>
                              </span>
                              <span className="line-clamp-1 text-[10px] text-neutral-400" title={preset.applicableRoomTypes.map(labelize).join(", ")}>
                                Best for {preset.applicableRoomTypes.slice(0, 3).map(labelize).join(", ")}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : visibleSavedTemplates.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
                        <p className="text-sm font-semibold text-neutral-800">No templates match that search.</p>
                        <button
                          type="button"
                          className="mt-3 text-sm font-semibold text-amber-700 hover:text-amber-800"
                          onClick={() => {
                            setTemplateQuery("");
                            setTemplateCategory("All");
                          }}
                        >
                          Show all templates
                        </button>
                      </div>
                    ) : null}
                    {visibleSavedTemplates.length ? (
                      <section className="grid gap-3" data-testid="cabinet-custom-templates">
                        <div>
                          <h3 className="text-sm font-semibold text-neutral-950">My reusable templates</h3>
                          <p className="mt-1 text-xs text-neutral-500">
                            Designs saved in this browser. Placement and room host data are excluded.
                          </p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {visibleSavedTemplates.map((template) => (
                            <div
                              key={template.id}
                              className={`grid gap-2 rounded-2xl border bg-white p-3 ${
                                activeSavedTemplateId === template.id
                                  ? "border-blue-600 ring-2 ring-blue-600/10"
                                  : "border-neutral-200"
                              }`}
                            >
                              <button
                                type="button"
                                data-testid={`cabinet-custom-template-${template.id}`}
                                className="grid gap-3 text-left"
                                onClick={() => applySavedTemplate(template)}
                              >
                                <CabinetTemplateDiagram definition={template.definition} />
                                <span>
                                  <span className="block text-sm font-semibold text-neutral-950">
                                    {template.name}
                                  </span>
                                  <span className="mt-1 block text-[10px] uppercase tracking-wide text-neutral-400">
                                    Saved {new Date(template.savedAt).toLocaleDateString()}
                                  </span>
                                </span>
                              </button>
                              <button
                                type="button"
                                className="justify-self-end text-xs font-semibold text-red-700 hover:text-red-900"
                                aria-label={`Delete reusable template ${template.name}`}
                                onClick={() => deleteSavedTemplate(template.id)}
                              >
                                Delete
                              </button>
                            </div>
                          ))}
                        </div>
                      </section>
                    ) : null}
                    {deletedTemplateUndo ? (
                      <div
                        data-testid="cabinet-template-delete-undo"
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                      >
                        <span role="status" aria-live="polite">
                          <span className="font-semibold">{deletedTemplateUndo.template.name}</span>{" "}
                          was removed.
                        </span>
                        <button
                          type="button"
                          className="rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-900 focus-visible:ring-offset-2"
                          onClick={restoreDeletedTemplate}
                        >
                          Undo delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {guidedStep === 1 ? (
                  <div className="grid gap-5" data-testid="cabinet-guided-space-panel">
                    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-base font-semibold">Measured room surfaces</h3>
                          <p className="mt-1 text-sm leading-6 text-neutral-500">
                            Choose a wall from the current room. Doors and windows divide it into usable fitting segments automatically.
                          </p>
                        </div>
                        <button
                          type="button"
                          data-testid="cabinet-reset-space-section"
                          className="shrink-0 text-xs font-semibold text-neutral-500 underline hover:text-neutral-900"
                          onClick={resetSpaceSection}
                        >
                          Reset Space &amp; Fit
                        </button>
                      </div>

                      {allAvailableSpaces.length ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {allAvailableSpaces.map((space) => {
                            const isSelected = selectedSpaceId === space.id;
                            const isSavedCustomSpace = Boolean(
                              parseStoredCabinetCustomSpace(space) &&
                                customSpaces.some((candidate) => candidate.id === space.id) &&
                                !availableSpaces.some((candidate) => candidate.id === space.id)
                            );
                            const customSpaceDeleteDisabled =
                              definition.fitState?.host.id === space.id;
                            const hostCompatibility = requiredHostType
                              ? resolveCabinetTemplateHostCompatibility(
                                  requiredHostType,
                                  space
                                )
                              : null;
                            const segments = getCabinetAvailableSegments(
                              space,
                              getCabinetOverallHeight(definition),
                              Math.max(
                                0,
                                parseProjectMeasurementDraft(
                                  mountingHeightDraft,
                                  0,
                                  30_000
                                ) ?? 0
                              )
                            );
                            const largestSegmentMm = segments.reduce(
                              (largest, segment) => Math.max(largest, segment.widthMm),
                              0
                            );
                            return (
                              <div key={space.id} className="grid gap-2">
                                <button
                                  type="button"
                                  data-testid={`cabinet-space-${space.wallId ?? space.id}`}
                                  aria-pressed={isSelected}
                                  data-host-compatibility={hostCompatibility?.status ?? "unknown"}
                                  className={`grid h-full w-full gap-3 rounded-2xl border p-4 text-left transition ${
                                    isSelected
                                      ? "border-neutral-950 bg-neutral-950 text-white ring-2 ring-neutral-950/10"
                                      : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-500"
                                  }`}
                                  onClick={() => {
                                    setSelectedSpaceId(space.id);
                                    setMountingHeightDraft(
                                      String(toProjectMeasurementValue(
                                        space.mountingHeightMm ??
                                          (definition.modules.every((module) => module.type === "wall")
                                            ? 1400
                                            : 0)
                                      ))
                                    );
                                    setFitFeedback(null);
                                    setActionError(
                                      hostCompatibility?.status === "incompatible"
                                        ? hostCompatibility.message
                                        : null
                                    );
                                  }}
                                >
                                <span className="flex items-start justify-between gap-3">
                                  <span>
                                    <span className="block text-sm font-semibold">{space.label}</span>
                                    <span className={`mt-1 block text-xs ${isSelected ? "text-white/65" : "text-neutral-500"}`}>
                                      {space.roomName ?? "Current room"}
                                    </span>
                                  </span>
                                  {isSelected ? (
                                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-neutral-950">
                                      <Check className="h-3.5 w-3.5" />
                                    </span>
                                  ) : null}
                                </span>
                                <span className="grid grid-cols-2 gap-2 text-xs">
                                  <span className={`rounded-lg px-2.5 py-2 ${isSelected ? "bg-white/10" : "bg-white"}`}>
                                    <span className="block text-[10px] uppercase tracking-wide opacity-60">Wall</span>
                                    <span className="mt-0.5 block font-semibold">{formatProjectMeasurement(space.availableWidthMm)} × {formatProjectMeasurement(space.availableHeightMm)}</span>
                                  </span>
                                  <span className={`rounded-lg px-2.5 py-2 ${isSelected ? "bg-white/10" : "bg-white"}`}>
                                    <span className="block text-[10px] uppercase tracking-wide opacity-60">Usable segment</span>
                                    <span className="mt-0.5 block font-semibold">{formatProjectMeasurement(largestSegmentMm)}</span>
                                  </span>
                                </span>
                                <span className={`text-[11px] ${isSelected ? "text-white/65" : "text-neutral-500"}`}>
                                  {space.openings.length
                                    ? `${space.openings.length} ${space.openings.length === 1 ? "opening" : "openings"} considered`
                                    : "Clear wall · no recorded openings"}
                                </span>
                                {hostCompatibility ? (
                                  <span
                                    className={`rounded-lg px-2.5 py-2 text-[11px] font-medium ${
                                      isSelected
                                        ? "bg-white/10 text-white"
                                        : hostCompatibility.status === "incompatible"
                                          ? "bg-red-50 text-red-800"
                                          : hostCompatibility.status === "review_required"
                                            ? "bg-amber-50 text-amber-800"
                                            : "bg-emerald-50 text-emerald-800"
                                    }`}
                                  >
                                    {hostCompatibility.status === "compatible"
                                      ? "Compatible host"
                                      : hostCompatibility.status === "review_required"
                                        ? "Support review needed"
                                        : "Choose another host"}
                                    {hostCompatibility.status !== "compatible"
                                      ? ` · ${formatProjectFeedback(hostCompatibility.message)}`
                                      : ""}
                                  </span>
                                ) : null}
                                </button>
                                {isProWorkspace && isSavedCustomSpace ? (
                                  <button
                                    type="button"
                                    data-testid={`cabinet-custom-space-delete-${space.id}`}
                                    disabled={customSpaceDeleteDisabled}
                                    title={
                                      customSpaceDeleteDisabled
                                        ? "Apply a different host before deleting this active fitted host"
                                        : `Remove ${space.label} from saved measured hosts`
                                    }
                                    className="flex min-h-9 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-600 hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    onClick={() => removeCustomMeasuredSpace(space)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Remove saved host
                                  </button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-sm text-neutral-600">
                          Add or select a measured room to enable Fit to Space. You can still configure the assembly manually.
                        </div>
                      )}

                      <button
                        type="button"
                        data-testid="cabinet-space-manual"
                        aria-pressed={selectedSpaceId === null}
                        className={`mt-3 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm ${
                          selectedSpaceId === null
                            ? "border-neutral-950 bg-neutral-950 text-white"
                            : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500"
                        }`}
                        onClick={() => {
                          setSelectedSpaceId(null);
                          setFitFeedback(null);
                          setActionError(null);
                        }}
                      >
                        <span>
                          <span className="font-semibold">Enter dimensions manually</span>
                          <span className={`mt-0.5 block text-xs ${selectedSpaceId === null ? "text-white/65" : "text-neutral-500"}`}>
                            Create without a host and place it freely later.
                          </span>
                        </span>
                        {selectedSpaceId === null ? <Check className="h-4 w-4" /> : null}
                      </button>

                      {isProWorkspace ? (
                        <button
                          type="button"
                          data-testid="cabinet-custom-space-toggle"
                          aria-expanded={customSpaceFormOpen}
                          className="mt-3 flex w-full items-center justify-between rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-left text-sm text-blue-900"
                          onClick={() => setCustomSpaceFormOpen((value) => !value)}
                        >
                          <span>
                            <span className="font-semibold">Add a measured niche or area</span>
                            <span className="mt-0.5 block text-xs text-blue-700">
                              Use field measurements when the room model does not contain this host yet.
                            </span>
                          </span>
                          <Plus className="h-4 w-4" />
                        </button>
                      ) : null}

                      {isProWorkspace && customSpaceFormOpen ? (
                        <div data-testid="cabinet-custom-space-form" className="mt-3 grid gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 sm:grid-cols-2">
                          <label className="grid gap-1.5 text-xs font-semibold text-blue-950">
                            Host type
                            <select
                              data-testid="cabinet-custom-space-kind"
                              className="h-10 rounded-lg border border-blue-200 bg-white px-3 text-sm"
                              value={customSpaceDraft.kind}
                              onChange={(event) =>
                                setCustomSpaceDraft((current) => ({
                                  ...current,
                                  kind: event.target.value as typeof current.kind,
                                }))
                              }
                            >
                              <option value="niche">Niche</option>
                              <option value="opening">Opening</option>
                              <option value="rectangular_area">Rectangular area</option>
                            </select>
                          </label>
                          <label className="grid gap-1.5 text-xs font-semibold text-blue-950">
                            Name
                            <input
                              data-testid="cabinet-custom-space-label"
                              className="h-10 rounded-lg border border-blue-200 bg-white px-3 text-sm"
                              maxLength={80}
                              value={customSpaceDraft.label}
                              onChange={(event) =>
                                setCustomSpaceDraft((current) => ({ ...current, label: event.target.value }))
                              }
                            />
                          </label>
                          {([
                            ["width", "Width", 1],
                            ["height", "Height", 1],
                            ["depth", "Depth", 1],
                            ["baseboard", "Baseboard stand-off", 0],
                          ] as const).map(([field, label, min]) => (
                            <label key={field} className="grid gap-1.5 text-xs font-semibold text-blue-950">
                              {label} ({projectMeasurementUnit})
                              <input
                                data-testid={`cabinet-custom-space-${field}`}
                                type="number"
                                inputMode="decimal"
                                min={toProjectMeasurementValue(min)}
                                max={toProjectMeasurementValue(
                                  field === "width"
                                    ? 100000
                                    : field === "baseboard"
                                      ? 5000
                                      : 30000
                                )}
                                step={
                                  projectMeasurementUnit === "in"
                                    ? 0.125
                                    : toProjectMeasurementValue(10)
                                }
                                className="h-10 rounded-lg border border-blue-200 bg-white px-3 text-sm"
                                value={customSpaceDraft[field]}
                                onChange={(event) =>
                                  setCustomSpaceDraft((current) => ({
                                    ...current,
                                    [field]: event.target.value,
                                  }))
                                }
                              />
                            </label>
                          ))}
                          <button
                            type="button"
                            data-testid="cabinet-custom-space-add"
                            className="min-h-10 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white sm:self-end"
                            onClick={addCustomMeasuredSpace}
                          >
                            Use this measured area
                          </button>
                          <p className="text-[11px] leading-5 text-blue-700 sm:col-span-2">
                            Custom areas coordinate dimensions and clearances. Without a modeled wall face, final plan position remains manual.
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {selectedSpace ? (
                      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                        <div className="mb-5 flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-base font-semibold">Fit settings</h3>
                            <p className="mt-1 text-sm text-neutral-500">Review the automatic change before applying it.</p>
                          </div>
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            Undoable
                          </span>
                        </div>
                        <div className="grid gap-5 sm:grid-cols-3">
                          <fieldset className="grid gap-2">
                            <legend className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Fit</legend>
                            <div className="grid grid-cols-2 rounded-xl bg-neutral-100 p-1">
                              {([
                                ["fit_width", "Width only"],
                                ["fit_height", "Height only"],
                                ["fit_both", "Width & height"],
                                ["between_boundaries", "Between boundaries"],
                              ] as const).map(([value, label]) => (
                                <button
                                  key={value}
                                  type="button"
                                  data-testid={`cabinet-fit-mode-${value}`}
                                  aria-pressed={fitMode === value}
                                  className={`rounded-lg px-2 py-2 text-xs font-semibold ${fitMode === value ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500"}`}
                                  onClick={() => setFitMode(value)}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </fieldset>
                          <fieldset className="grid gap-2">
                            <legend className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Alignment</legend>
                            <div className="grid grid-cols-3 rounded-xl bg-neutral-100 p-1">
                              {(["left", "center", "right"] as const).map((value) => (
                                <button
                                  key={value}
                                  type="button"
                                  data-testid={`cabinet-fit-align-${value}`}
                                  aria-pressed={fitAlignment === value}
                                  className={`rounded-lg px-2 py-2 text-xs font-semibold ${fitAlignment === value ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500"}`}
                                  onClick={() => setFitAlignment(value)}
                                >
                                  {labelize(value)}
                                </button>
                              ))}
                            </div>
                          </fieldset>
                          <label className="grid gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                            Bottom above floor
                            <span className="relative block">
                              <input
                                data-testid="cabinet-fit-mounting-height"
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step={
                                  projectMeasurementUnit === "in"
                                    ? 0.125
                                    : toProjectMeasurementValue(10)
                                }
                                className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 pr-10 text-sm font-medium normal-case tracking-normal text-neutral-900 outline-none focus:border-neutral-900"
                                value={mountingHeightDraft}
                                onChange={(event) => setMountingHeightDraft(event.target.value)}
                              />
                              <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-[10px] normal-case tracking-normal text-neutral-400">{projectMeasurementUnit}</span>
                            </span>
                          </label>
                        </div>

                        <button
                          type="button"
                          data-testid="cabinet-fit-to-space"
                          disabled={selectedSpaceHostCompatibility?.status === "incompatible"}
                          title={
                            selectedSpaceHostCompatibility?.status === "incompatible"
                              ? formatProjectFeedback(selectedSpaceHostCompatibility.message)
                              : undefined
                          }
                          className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-600"
                          onClick={handleApplyFit}
                        >
                          <MapPin className="h-4 w-4" /> Fit to {selectedSpace.label}
                        </button>

                        <p className="mt-3 text-xs leading-5 text-neutral-500">
                          The current plan provides wall, ceiling, door, and window measurements. Outlet and baseboard locations are only considered when recorded.
                        </p>
                      </div>
                    ) : null}

                    {fitFeedback ? (
                      <div
                        data-testid="cabinet-fit-feedback"
                        data-fit-status={fitFeedback.ok ? "success" : "error"}
                        className={`rounded-2xl border p-5 ${fitFeedback.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}
                      >
                        <h3 className={`text-sm font-semibold ${fitFeedback.ok ? "text-emerald-950" : "text-red-950"}`}>
                          {fitFeedback.ok ? "Fit applied" : "This layout cannot fit yet"}
                        </h3>
                        <div className="mt-3 grid gap-2">
                          {fitFeedback.issues.map((issue) => (
                            <div key={`${issue.code}-${issue.message}`} className="rounded-xl bg-white/70 px-3 py-2 text-xs leading-5">
                              <span className="font-semibold">{labelize(issue.severity)}:</span> {formatProjectFeedback(issue.message)}
                              {issue.moduleIds?.length && issue.suggestedAction === "unlock_modules" ? (
                                <button
                                  type="button"
                                  className="ml-2 font-semibold text-blue-700 underline"
                                  onClick={() => unlockModules(issue.moduleIds ?? [])}
                                >
                                  Unlock affected modules
                                </button>
                              ) : null}
                              {issue.suggestedAction === "unlock_overall_width" ? (
                                <button
                                  type="button"
                                  className="ml-2 font-semibold text-blue-700 underline"
                                  onClick={() =>
                                    updateDefinition((previous) =>
                                      setCabinetOverallWidthLocked(previous, false)
                                    )
                                  }
                                >
                                  Unlock overall width
                                </button>
                              ) : null}
                            </div>
                          ))}
                          {fitFeedback.adjustments.length ? (
                            <div className="rounded-xl bg-white/70 p-3 text-xs">
                              <p className="font-semibold">Automatic assembly changes</p>
                              <ul className="mt-2 grid gap-1.5 text-neutral-700">
                                {fitFeedback.adjustments.map((adjustment) => (
                                  <li key={`${adjustment.field}-${adjustment.previousValue}-${adjustment.nextValue}`}>
                                    {formatProjectFeedback(adjustment.reason)}: {formatProjectMeasurement(adjustment.previousValue)} → {formatProjectMeasurement(adjustment.nextValue)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {fitFeedback.moduleAdjustments.length ? (
                            <div className="rounded-xl bg-white/70 p-3 text-xs">
                              <p className="font-semibold">Module widths</p>
                              <ul className="mt-2 grid gap-1.5 text-neutral-700">
                                {fitFeedback.moduleAdjustments.map((adjustment) => (
                                  <li key={adjustment.moduleId}>
                                    {adjustment.moduleId}: {formatProjectMeasurement(adjustment.previousWidthMm)} → {formatProjectMeasurement(adjustment.nextWidthMm)} ({labelize(adjustment.source)})
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {fitFeedback.ok && !fitFeedback.issues.length ? (
                            <p className="text-xs text-emerald-800">
                              Widths, fitting panels, clearances, and placement host are coordinated.
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {guidedStep === 2 ? (
                  <div className="grid gap-5" data-testid="cabinet-guided-size-panel">
                    <CabinetContextualOnboarding
                      step="size"
                      visible={showOnboarding}
                      onDismiss={dismissOnboarding}
                      onShow={() => setShowOnboarding(true)}
                    />
                    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                      <div className="mb-5 flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-base font-semibold">Overall size</h3>
                          <p className="mt-1 text-sm leading-6 text-neutral-500">
                            Enter the available size. Module proportions stay coordinated automatically.
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                          {activePreset?.host ?? "Flexible"} placement
                        </span>
                        <button
                          type="button"
                          data-testid="cabinet-reset-size-section"
                          className="shrink-0 text-xs font-semibold text-neutral-500 underline hover:text-neutral-900"
                          onClick={resetSizeSection}
                        >
                          Reset size
                        </button>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <GuidedNumberField
                          label="Overall width"
                          value={getCabinetOverallWidth(definition)}
                          min={overallWidthLimits.minMm}
                          max={overallWidthLimits.maxMm}
                          suffix="mm"
                          testId="cabinet-guided-width"
                          fieldPath="totalWidth"
                          issues={getIssuesForField("totalWidth")}
                          disabled={!overallWidthCanResize}
                          onCommit={handleGuidedOverallWidth}
                        />
                        <GuidedNumberField
                          label="Overall height"
                          value={getCabinetOverallHeight(definition)}
                          min={200}
                          max={5000}
                          suffix="mm"
                          testId="cabinet-guided-height"
                          fieldPath="height"
                          issues={getIssuesForField("height")}
                          onCommit={(value) => handleOverallHeightOrDepth("height", value)}
                        />
                        <GuidedNumberField
                          label="Overall depth"
                          value={getCabinetOverallDepth(definition)}
                          min={120}
                          max={2500}
                          suffix="mm"
                          testId="cabinet-guided-depth"
                          fieldPath="depth"
                          issues={getIssuesForField("depth")}
                          onCommit={(value) => handleOverallHeightOrDepth("depth", value)}
                        />
                      </div>
                      {isProWorkspace ? (
                        <>
                          <button
                            type="button"
                            data-testid="cabinet-overall-width-lock"
                            aria-pressed={overallWidthLocked}
                            className={`mt-4 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${overallWidthLocked ? "border-blue-200 bg-blue-50 text-blue-800" : "border-neutral-300 text-neutral-600"}`}
                            onClick={toggleOverallWidthLock}
                          >
                            {overallWidthLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                            {overallWidthLocked ? "Overall width locked" : "Lock overall width"}
                          </button>
                          {overallWidthBlockedByModuleLocks ? (
                            <p className="mt-2 text-xs text-amber-700">
                              All bay widths are constrained by locks. Unlock a bay or release equal sizing before resizing the assembly.
                            </p>
                          ) : null}
                        </>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold">
                            {automation.moduleSizingMode === "automatic" ? "Automatic module distribution" : "Manual module sizing"}
                          </h3>
                          <p className="mt-1 text-xs leading-5 text-neutral-500">
                            {automation.moduleSizingMode === "automatic"
                              ? "Width changes are shared proportionally across unlocked modules. Fine-tune or lock an individual bay in Layout."
                              : "Each bay keeps its entered width. Switch back to Automatic when you want the system to distribute remaining space."}
                          </p>
                        </div>
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          {definition.modules.length} {definition.modules.length === 1 ? "module" : "modules"}
                        </span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {definition.modules.map((module, index) => (
                          <button
                            key={module.id}
                            type="button"
                            className={`flex items-center justify-between rounded-xl border px-3 py-3 text-left text-sm ${
                              module.id === activeModule?.id
                                ? "border-neutral-950 bg-neutral-950 text-white"
                                : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-400"
                            }`}
                            onClick={() => selectStudioModule(module.id)}
                          >
                            <span className="font-semibold">Bay {index + 1}</span>
                            <span className={module.id === activeModule?.id ? "text-white/70" : "text-neutral-500"}>
                              {formatProjectMeasurement(module.width)}
                            </span>
                            <ModuleIssueBadges issues={getIssuesForModule(module.id)} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {guidedStep === 3 && activeModule ? (
                  <div className="grid gap-5" data-testid="cabinet-guided-layout-panel">
                    <CabinetContextualOnboarding
                      step="layout"
                      visible={showOnboarding}
                      onDismiss={dismissOnboarding}
                      onShow={() => setShowOnboarding(true)}
                    />
                    {isProWorkspace ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
                      <div>
                        <h3 className="text-sm font-semibold">Module sizing</h3>
                        <p className="mt-1 text-xs text-neutral-500">
                          Automatic mode preserves the overall target and shares available width across unlocked bays. Returning to it can replace unlocked manual width overrides.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 rounded-xl bg-neutral-100 p-1">
                        {(["automatic", "manual"] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            data-testid={`cabinet-module-sizing-${value}`}
                            aria-pressed={automation.moduleSizingMode === value}
                            className={`rounded-lg px-3 py-2 text-xs font-semibold ${automation.moduleSizingMode === value ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500"}`}
                            onClick={() => changeModuleSizingMode(value)}
                          >
                            {labelize(value)}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        data-testid="cabinet-equal-module-sizing"
                        aria-pressed={automation.equalModuleSizing}
                        className={`inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold ${automation.equalModuleSizing ? "border-blue-200 bg-blue-50 text-blue-800" : "border-neutral-300 bg-white text-neutral-600"}`}
                        onClick={toggleEqualModuleSizing}
                      >
                        {equalModuleSizingLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                        Equal widths
                      </button>
                    </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2">
                      {definition.modules.map((module, index) => (
                        <button
                          key={module.id}
                          type="button"
                          data-testid={`cabinet-guided-module-${index + 1}`}
                          aria-pressed={module.id === activeModule.id}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                            module.id === activeModule.id
                              ? "border-neutral-950 bg-neutral-950 text-white"
                              : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-600"
                          }`}
                          onClick={() => selectStudioModule(module.id)}
                        >
                          <span className="flex items-center gap-1.5">
                            Bay {index + 1} · {formatProjectMeasurement(module.width)}
                            <ModuleIssueBadges issues={getIssuesForModule(module.id)} />
                          </span>
                        </button>
                      ))}
                      {isProWorkspace ? (
                        <>
                          <button
                            type="button"
                            data-testid="cabinet-guided-add-module"
                            className="inline-flex items-center gap-1 rounded-full border border-dashed border-neutral-400 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={structuralModuleChangeDisabled}
                            title={structuralModuleChangeTitle}
                            onClick={addModule}
                          >
                            <Plus className="h-3.5 w-3.5" /> Add bay
                          </button>
                          <button
                            type="button"
                            data-testid="cabinet-guided-module-width-lock"
                            aria-pressed={isCabinetModuleWidthLocked(definition, activeModule.id)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                              isCabinetModuleWidthLocked(definition, activeModule.id)
                                ? "border-amber-400 bg-amber-50 text-amber-900"
                                : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-600"
                            }`}
                            onClick={toggleActiveModuleWidthLock}
                          >
                            {isCabinetModuleWidthLocked(definition, activeModule.id) ? (
                              <Lock className="h-3.5 w-3.5" />
                            ) : (
                              <Unlock className="h-3.5 w-3.5" />
                            )}
                            {isCabinetModuleWidthLocked(definition, activeModule.id) ? "Width locked" : "Lock width"}
                          </button>
                        </>
                      ) : null}
                    </div>

                    {supportsGuidedLayout ? (
                      <>
                        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-base font-semibold">
                                Bay {activeModuleIndex + 1}{" "}
                                {supportsGuidedWardrobeArrangements
                                  ? "wardrobe arrangement"
                                  : "arrangement"}
                              </h3>
                              <p className="mt-1 text-sm text-neutral-500">
                                {supportsGuidedWardrobeArrangements
                                  ? "Choose a complete hanging and storage arrangement for this wardrobe bay."
                                  : "Choose a recognizable starting layout."}
                              </p>
                            </div>
                            <button
                              type="button"
                              data-testid="cabinet-reset-module"
                              className="text-xs font-semibold text-neutral-500 hover:text-neutral-950"
                              onClick={resetActiveModule}
                            >
                              Reset bay
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {supportsGuidedWardrobeArrangements
                              ? CABINET_WARDROBE_ARRANGEMENTS.map((option) => {
                                  const isSelected = activeWardrobeArrangementId === option.id;
                                  return (
                                    <button
                                      key={option.id}
                                      type="button"
                                      data-testid={`cabinet-guided-wardrobe-${option.id}`}
                                      aria-label={`${option.label}. ${option.accessibilityLabel}. ${option.description}`}
                                      aria-pressed={isSelected}
                                      className={`grid gap-2 rounded-xl border p-2.5 text-left transition ${
                                        isSelected
                                          ? "border-neutral-950 bg-neutral-50 ring-2 ring-neutral-950/10"
                                          : "border-neutral-200 hover:border-neutral-500"
                                      }`}
                                      onClick={() => applyGuidedWardrobeArrangement(option.id)}
                                    >
                                      <CabinetWardrobeArrangementDiagram option={option} />
                                      <span className="text-xs font-semibold text-neutral-800">
                                        {option.label}
                                      </span>
                                      <span className="text-[11px] leading-4 text-neutral-500">
                                        {option.description}
                                      </span>
                                    </button>
                                  );
                                })
                              : frontTypes.map((frontType) => {
                                  const isSelected = activeModule.frontType === frontType;
                                  const previewModule = {
                                    ...activeModule,
                                    ...guidedFrontPatch(frontType),
                                  };
                                  return (
                                    <button
                                      key={frontType}
                                      type="button"
                                      data-testid={`cabinet-guided-layout-${frontType}`}
                                      aria-pressed={isSelected}
                                      className={`grid gap-2 rounded-xl border p-2.5 text-left transition ${
                                        isSelected
                                          ? "border-neutral-950 bg-neutral-50 ring-2 ring-neutral-950/10"
                                          : "border-neutral-200 hover:border-neutral-500"
                                      }`}
                                      onClick={() =>
                                        updateModule(activeModule.id, guidedFrontPatch(frontType))
                                      }
                                    >
                                      <CabinetTemplateDiagram
                                        definition={{ ...definition, modules: [previewModule] }}
                                      />
                                      <span className="text-xs font-semibold text-neutral-800">
                                        {labelize(frontType)}
                                      </span>
                                    </button>
                                  );
                                })}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                          <div className="mb-4 flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold">Storage details</h3>
                            {isProWorkspace ? (
                            <button
                              type="button"
                              data-testid="cabinet-shelf-spacing-lock"
                              aria-pressed={activeShelfSpacingLocked}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${activeShelfSpacingLocked ? "border-blue-200 bg-blue-50 text-blue-800" : "border-neutral-300 text-neutral-600"}`}
                              onClick={toggleActiveShelfSpacingLock}
                            >
                              {activeShelfSpacingLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                              {activeShelfSpacingLocked ? "Shelf layout locked" : "Lock shelf layout"}
                            </button>
                            ) : null}
                          </div>
                          {isProWorkspace ? (
                          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-neutral-50 p-3">
                            <div>
                              <p className="text-xs font-semibold text-neutral-800">Shelf spacing</p>
                              <p className="mt-0.5 text-[11px] text-neutral-500">
                                Custom starts from the current even layout. Returning to Even replaces custom heights.
                              </p>
                            </div>
                            <div className="grid grid-cols-2 rounded-lg bg-neutral-200/70 p-1">
                              {(["even", "custom"] as const).map((spacingMode) => (
                                <button
                                  key={spacingMode}
                                  type="button"
                                  data-testid={`cabinet-shelf-spacing-${spacingMode}`}
                                  aria-pressed={activeShelfSpacingMode === spacingMode}
                                  disabled={activeShelfSpacingLocked}
                                  className={`rounded-md px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                                    activeShelfSpacingMode === spacingMode
                                      ? "bg-white text-neutral-950 shadow-sm"
                                      : "text-neutral-500"
                                  }`}
                                  onClick={() => setActiveShelfSpacingMode(spacingMode)}
                                >
                                  {spacingMode === "even" ? "Even" : "Custom"}
                                </button>
                              ))}
                            </div>
                          </div>
                          ) : null}
                          <div className={`grid gap-4 ${isProWorkspace ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
                            {isProWorkspace ? (
                            <GuidedNumberField
                              label="Bay width"
                              value={activeModule.width}
                              min={getCabinetMinimumModuleWidthMm(activeModule, definition)}
                              max={4000}
                              suffix="mm"
                              testId="cabinet-guided-module-width"
                              fieldPath="width"
                              issues={getIssuesForField("width", activeModule.id)}
                              disabled={
                                overallWidthLocked ||
                                automation.equalModuleSizing ||
                                isCabinetModuleWidthLocked(definition, activeModule.id)
                              }
                              onCommit={(value) =>
                                updateDefinition((previous) =>
                                  setCabinetModuleWidth(previous, activeModule.id, value)
                                )
                              }
                            />
                            ) : null}
                            <GuidedNumberField
                              label="Shelves"
                              value={activeModule.shelfCount}
                              min={0}
                              max={20}
                              step={1}
                              integer
                              testId="cabinet-guided-shelves"
                              fieldPath="shelfCount"
                              issues={getIssuesForField("shelfCount", activeModule.id)}
                              disabled={activeShelfSpacingLocked}
                              onCommit={(value) => updateModule(activeModule.id, { shelfCount: Math.round(value) })}
                            />
                            {activeHasDoorFront && activeDoorLayoutMode === "recommended" ? (
                              <div
                                data-testid="cabinet-guided-recommended-doors"
                                data-door-count={String(activeDoorCount)}
                                className="grid gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
                              >
                                <span className="font-medium">Recommended doors</span>
                                <span className="text-sm font-semibold">
                                  {activeDoorCount} · sized automatically
                                </span>
                              </div>
                            ) : isProWorkspace && activeHasDoorFront ? (
                              <GuidedNumberField
                                label="Doors"
                                value={activeDoorCount}
                                min={activeModule.frontType === "double_door" ? 2 : 1}
                                max={12}
                                step={1}
                                integer
                                testId="cabinet-guided-doors"
                                fieldPath="doorCount"
                                issues={getIssuesForField("doorCount", activeModule.id)}
                                onCommit={(value) => updateModule(activeModule.id, { doorCount: Math.round(value) })}
                              />
                            ) : null}
                            <GuidedNumberField
                              label="Drawers"
                              value={activeModule.drawerCount}
                              min={0}
                              max={12}
                              step={1}
                              integer
                              testId="cabinet-guided-drawers"
                              fieldPath="drawerCount"
                              issues={getIssuesForField("drawerCount", activeModule.id)}
                              onCommit={(value) => updateModule(activeModule.id, { drawerCount: Math.round(value) })}
                            />
                          </div>
                          {isProWorkspace && activeHasDoorFront ? (
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3">
                              <div>
                                <p className="text-xs font-semibold text-neutral-800">Door layout</p>
                                <p className="mt-0.5 text-[11px] text-neutral-500">
                                  Manual starts with the current recommendation. Returning to Recommended replaces the manual count.
                                </p>
                              </div>
                              <div className="grid grid-cols-2 rounded-lg bg-neutral-100 p-1">
                                {(["recommended", "manual"] as const).map((mode) => (
                                  <button
                                    key={mode}
                                    type="button"
                                    data-testid={`cabinet-door-layout-${mode}`}
                                    aria-pressed={activeDoorLayoutMode === mode}
                                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${activeDoorLayoutMode === mode ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500"}`}
                                    onClick={() => setActiveDoorLayoutMode(mode)}
                                  >
                                    {mode === "recommended" ? `Recommended · ${activeDoorCount}` : "Manual count"}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {isProWorkspace && activeHasDrawerFront ? (
                            <div className="mt-4 grid gap-3 rounded-xl border border-neutral-200 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold text-neutral-800">Drawer heights</p>
                                  <p className="mt-0.5 text-[11px] text-neutral-500">
                                    Custom starts from the visible stack. Equal or Recommended replaces custom proportions.
                                  </p>
                                </div>
                                <div
                                  role="group"
                                  aria-label="Drawer-height configuration"
                                  className="grid grid-cols-3 gap-2"
                                >
                                  {(["equal", "recommended", "custom"] as const).map((mode) => (
                                    <button
                                      key={mode}
                                      type="button"
                                      data-testid={`cabinet-drawer-heights-${mode}`}
                                      aria-pressed={activeDrawerHeightMode === mode}
                                      className={`grid gap-1 rounded-lg border p-2 text-xs font-semibold transition ${activeDrawerHeightMode === mode ? "border-neutral-950 bg-white text-neutral-950 shadow-sm" : "border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-neutral-400"}`}
                                      onClick={() => setActiveDrawerHeightMode(mode)}
                                    >
                                      <CabinetDrawerConfigurationPreview
                                        mode={mode}
                                        drawerCount={Math.max(1, activeModule.drawerCount)}
                                        proportions={
                                          mode === "custom" ? activeDrawerHeightProportions : undefined
                                        }
                                      />
                                      {labelize(mode)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {activeDrawerHeightMode === "custom" ? (
                                <div className="grid gap-3 sm:grid-cols-3">
                                  {activeDrawerHeightProportions.map((proportion, index) => (
                                    <GuidedNumberField
                                      key={index}
                                      label={`Drawer ${index + 1} · ${index === 0 ? "bottom" : index === activeDrawerHeightProportions.length - 1 ? "top" : "middle"}`}
                                      value={Math.round(proportion * 1000) / 10}
                                      min={1}
                                      max={1000}
                                      step={1}
                                      suffix="%"
                                      testId={`cabinet-drawer-proportion-${index + 1}`}
                                      fieldPath="drawerHeightProportions"
                                      issues={getIssuesForField("drawerHeightProportions", activeModule.id)}
                                      onCommit={(value) => updateActiveDrawerProportion(index, value)}
                                    />
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {isProWorkspace && activeShelfSpacingMode === "custom" && activeShelfPositions.length ? (
                            <div className="mt-4 grid gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3 sm:grid-cols-2">
                              {activeShelfPositions.map((position, index) => (
                                <GuidedNumberField
                                  key={index}
                                  label={`Shelf ${index + 1} height`}
                                  value={position}
                                  min={
                                    index === 0
                                      ? definition.toeKickHeight + definition.boardThickness
                                      : activeShelfPositions[index - 1] + definition.boardThickness
                                  }
                                  max={
                                    index === activeShelfPositions.length - 1
                                      ? activeModule.height - definition.boardThickness
                                      : activeShelfPositions[index + 1] - definition.boardThickness
                                  }
                                  step={5}
                                  suffix="mm"
                                  testId={`cabinet-guided-shelf-position-${index + 1}`}
                                  fieldPath="shelfPositionsMm"
                                  issues={getIssuesForField("shelfPositionsMm", activeModule.id)}
                                  disabled={activeShelfSpacingLocked}
                                  onCommit={(value) => updateActiveShelfPosition(index, value)}
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
                        <h3 className="text-base font-semibold text-amber-950">Specialized layout included</h3>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900/75">
                          {activePreset?.label ?? "This template"} already includes a professionally configured {labelize(activeModule.millworkComponentType ?? "component")} layout. {isProWorkspace
                            ? "Use the detailed editor only if you need to change its construction-specific settings."
                            : "Its internal arrangement stays coordinated automatically while you choose the size and finish."}
                        </p>
                        {isProWorkspace ? (
                          <button
                            type="button"
                            className="mt-4 rounded-xl bg-amber-900 px-4 py-2 text-sm font-semibold text-white"
                            onClick={() => chooseExperienceMode("detailed")}
                          >
                            Open detailed controls
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}

                {guidedStep === 4 && activeModule ? (
                  <div className="grid gap-5" data-testid="cabinet-guided-style-panel">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs leading-5 text-neutral-500">
                        Finish, fronts, and opening hardware are one reversible style section.
                      </p>
                      <button
                        type="button"
                        data-testid="cabinet-reset-style-section"
                        className="shrink-0 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:border-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        onClick={resetStyleSection}
                      >
                        Reset style
                      </button>
                    </div>
                    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-base font-semibold">Main finish</h3>
                          <p className="mt-1 text-sm text-neutral-500">
                            {isProWorkspace
                              ? "Applied to unlocked modules. Individual overrides remain available in Detailed editor."
                              : "Applied consistently across the complete design."}
                          </p>
                        </div>
                        {isProWorkspace ? (
                          <button
                            type="button"
                            data-testid="cabinet-material-lock"
                            aria-pressed={activeMaterialLocked}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${activeMaterialLocked ? "border-blue-200 bg-blue-50 text-blue-800" : "border-neutral-300 text-neutral-600"}`}
                            onClick={toggleActiveMaterialLock}
                          >
                            {activeMaterialLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                            {activeMaterialLocked ? "Finish locked" : "Lock this finish"}
                          </button>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {GUIDED_MATERIALS.map((material) => {
                          const isSelected = activeModule.frontMaterialId === material.id;
                          return (
                            <button
                              key={material.id}
                              type="button"
                              data-testid={`cabinet-guided-material-${material.id}`}
                              aria-pressed={isSelected}
                              className={`flex items-center gap-3 rounded-xl border p-3 text-left text-sm font-semibold transition ${
                                isSelected
                                  ? "border-neutral-950 bg-neutral-50 ring-2 ring-neutral-950/10"
                                  : "border-neutral-200 hover:border-neutral-500"
                              }`}
                              onClick={() => applyGuidedMaterial(material.id)}
                            >
                              <span
                                className="h-9 w-9 shrink-0 rounded-lg border border-black/10 shadow-inner"
                                style={{ backgroundColor: material.color ?? "#d6d3d1" }}
                              />
                              <span>{material.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {supportsGuidedLayout ? (
                      <div className="grid gap-5 xl:grid-cols-2">
                        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                          <h3 className="mb-4 text-sm font-semibold">Door style</h3>
                          <div className="grid grid-cols-2 gap-2">
                            {doorStyles.map((doorStyle) => (
                              <button
                                key={doorStyle}
                                type="button"
                                data-testid={`cabinet-guided-door-style-${doorStyle}`}
                                aria-pressed={activeModule.doorStyle === doorStyle}
                                className={`grid gap-2 rounded-xl border px-3 py-3 text-left text-xs font-semibold ${
                                  activeModule.doorStyle === doorStyle
                                    ? "border-neutral-950 bg-neutral-950 text-white"
                                    : "border-neutral-200 text-neutral-700 hover:border-neutral-500"
                                }`}
                                onClick={() =>
                                  updateDefinition((previous) => ({
                                    ...previous,
                                    modules: previous.modules.map((module) => ({ ...module, doorStyle })),
                                  }))
                                }
                              >
                                <CabinetDoorStylePreview
                                  doorStyle={doorStyle}
                                  className="h-16 w-full"
                                />
                                <span>{labelize(doorStyle)}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                          <h3 className="mb-4 text-sm font-semibold">Handles & opening</h3>
                          <div className="grid gap-2">
                            {guidedHardwareOptions.map((hardware) => (
                              <button
                                key={hardware.id}
                                type="button"
                                data-testid={`cabinet-guided-hardware-${hardware.id}`}
                                aria-pressed={isGuidedHardwareSelected(hardware.id)}
                                className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-xs font-semibold ${
                                  isGuidedHardwareSelected(hardware.id)
                                    ? "border-neutral-950 bg-neutral-950 text-white"
                                    : "border-neutral-200 text-neutral-700 hover:border-neutral-500"
                                }`}
                                onClick={() =>
                                  updateDefinition((previous) => ({
                                    ...previous,
                                    modules: previous.modules.map((module) => ({
                                      ...module,
                                      hardwareId: module.frontType === "open" ? "none" : hardware.id,
                                    })),
                                  }))
                                }
                              >
                                <span className="flex min-w-0 items-center gap-3">
                                  {isCabinetFrontHardwareType(hardware.type) ? (
                                    <CabinetHandleTypePreview
                                      handleType={hardware.type}
                                      className="h-10 w-14 shrink-0"
                                    />
                                  ) : null}
                                  <span>{hardware.name}</span>
                                </span>
                                {isGuidedHardwareSelected(hardware.id) ? <Check className="h-3.5 w-3.5" /> : null}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {guidedStep === 5 ? (
                  <div className="grid gap-5" data-testid="cabinet-guided-review-panel">
                    <CabinetContextualOnboarding
                      step="review"
                      visible={showOnboarding}
                      onDismiss={dismissOnboarding}
                      onShow={() => setShowOnboarding(true)}
                    />
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        ["Template", activePreset?.label ?? definition.name],
                        ["Overall size", `${formatProjectMeasurement(definition.totalWidth)} × ${formatProjectMeasurement(definition.height)} × ${formatProjectMeasurement(definition.depth)}`],
                        ["Layout", `${definition.modules.length} ${definition.modules.length === 1 ? "bay" : "bays"}`],
                        ["Finish", currentMaterial?.name ?? "Custom finish"],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-2xl border border-neutral-200 bg-white p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{label}</p>
                          <p className="mt-2 text-sm font-semibold text-neutral-900">{value}</p>
                        </div>
                      ))}
                    </div>

                    {!isProWorkspace ? (
                      <div
                        data-testid="cabinet-consumer-estimate"
                        data-currency={consumerEstimate.currency}
                        data-estimated-total={String(consumerEstimate.estimatedTotal)}
                        className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-950"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                              Preliminary estimate
                            </p>
                            <p
                              data-testid="cabinet-consumer-estimate-total"
                              className="mt-1 text-3xl font-semibold tracking-tight"
                            >
                              {formatEstimate(consumerEstimate.estimatedTotal)}
                            </p>
                          </div>
                          <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-blue-800">
                            Updates with your design
                          </span>
                        </div>
                        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-4">
                          {[
                            ["Materials", consumerEstimate.materialCost],
                            ["Hardware", consumerEstimate.hardwareCost],
                            ["Build & installation", consumerEstimate.fabricationCost + consumerEstimate.installationAllowance],
                            ["Planning allowance", consumerEstimate.contingency],
                          ].map(([label, value]) => (
                            <div key={String(label)} className="rounded-xl bg-white/75 p-3">
                              <p className="text-blue-700">{label}</p>
                              <p className="mt-1 font-semibold text-blue-950">{formatEstimate(Number(value))}</p>
                            </div>
                          ))}
                        </div>
                        <p className="mt-4 text-xs leading-5 text-blue-800">
                          {consumerEstimate.assumptions[0]} Final materials, site conditions, delivery, and local services can change the price.
                        </p>
                      </div>
                    ) : null}

                    <div className={`rounded-2xl border p-5 ${errors.length ? "border-red-200 bg-red-50" : warnings.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className={`text-base font-semibold ${errors.length ? "text-red-950" : warnings.length ? "text-amber-950" : "text-emerald-950"}`}>
                            {errors.length
                              ? `${errors.length} ${errors.length === 1 ? "issue needs" : "issues need"} attention`
                              : warnings.length
                                ? "Ready with recommendations"
                                : "Ready to place"}
                          </h3>
                          <p className={`mt-1 text-sm ${errors.length ? "text-red-800" : warnings.length ? "text-amber-800" : "text-emerald-800"}`}>
                            {errors.length
                              ? isProWorkspace
                                ? "Open the affected step or Detailed editor to make the suggested correction."
                                : "Open the affected step or apply the suggested correction."
                              : warnings.length
                                ? isProWorkspace
                                  ? "The design is valid. Review these recommendations before fabrication."
                                  : "The design is valid. Review these recommendations before placing it."
                                : isProWorkspace
                                  ? "The geometry, materials, hardware, and project data are valid."
                                  : "The size, layout, finish, and hardware are ready."}
                          </p>
                        </div>
                        {isProWorkspace ? (
                          <span className="shrink-0 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold">
                            {bom.length} BOM rows
                          </span>
                        ) : null}
                      </div>
                      {validation.issues.length ? (
                        <div className="mt-4 grid gap-2">
                          {validation.issues.map((issue) => (
                            <ValidationIssueCard
                              key={issue.id}
                              issue={issue}
                              onFocus={focusValidationIssue}
                              onRequestFix={requestValidationFix}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {pendingValidationFix ? (
                      <ValidationFixPreview
                        pending={pendingValidationFix}
                        current={definition}
                        onCancel={() => setPendingValidationFix(null)}
                        onApply={() => commitValidationFix(pendingValidationFix.fix)}
                      />
                    ) : null}

                    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                      <h3 className="text-base font-semibold">What happens next</h3>
                      <div className="mt-4 grid gap-3 text-sm text-neutral-600 sm:grid-cols-3">
                        <div className="rounded-xl bg-neutral-50 p-3"><span className="font-semibold text-neutral-900">1. Place</span><br />Add this intelligent assembly to the current room.</div>
                        <div className="rounded-xl bg-neutral-50 p-3"><span className="font-semibold text-neutral-900">2. Position</span><br />Move, rotate, or snap the completed asset to a wall.</div>
                        <div className="rounded-xl bg-neutral-50 p-3"><span className="font-semibold text-neutral-900">3. Reopen</span><br />Edit it later without losing its plan position.</div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <aside className="relative hidden min-h-0 overflow-hidden bg-[#e5e7e1] lg:block">
              <div className="absolute inset-0">
                <CabinetPreview3D
                  definition={deferredDefinition}
                  generatedParts={previewParts}
                  view={previewView}
                  showClearances={showClearances}
                  selection={semanticSelection}
                  onSemanticSelect={handleSemanticPreviewSelection}
                  dimensionPreview={dimensionPreview}
                />
              </div>
              {guidedStep === 2 || guidedStep === 3 ? (
                <CabinetOverallDimensionHandles
                  widthMm={getCabinetOverallWidth(definition)}
                  heightMm={getCabinetOverallHeight(definition)}
                  depthMm={getCabinetOverallDepth(definition)}
                  limits={{
                    totalWidth: overallWidthLimits,
                    depth: { minMm: 120, maxMm: 2500 },
                  }}
                  disabledFields={{ totalWidth: !overallWidthCanResize }}
                  onPreviewChange={setDimensionPreview}
                  onCommit={handleDimensionHandleCommit}
                />
              ) : null}
              {isProWorkspace && guidedStep === 3 ? (
                <CabinetSemanticEditOverlays
                  definition={definition}
                  activeModuleId={activeModule?.id}
                  onPreviewChange={setSemanticEditPreview}
                  onDividerCommit={commitModuleDividerResize}
                  onShelfCommit={(input) => {
                    if (input.moduleId === activeModule?.id) {
                      updateActiveShelfPosition(input.shelfIndex, input.heightMm);
                    }
                  }}
                />
              ) : null}
              <div className="absolute right-5 top-5 z-30 flex items-center gap-2">
                <CabinetPreviewViewSelector value={previewView} onChange={setPreviewView} />
                {isProWorkspace ? (
                  <button
                    type="button"
                    data-testid="cabinet-preview-clearance-toggle"
                    aria-pressed={showClearances}
                    className={`inline-flex items-center gap-1.5 rounded-lg border border-white/60 px-2.5 py-2 text-[11px] font-semibold shadow-sm backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 ${showClearances ? "bg-blue-600 text-white" : "bg-white/90 text-neutral-700"}`}
                    onClick={() => setShowClearances((value) => !value)}
                  >
                    {showClearances ? <Check aria-hidden="true" className="h-3 w-3" /> : null}
                    Clearances
                  </button>
                ) : null}
              </div>
              <div className="pointer-events-none absolute left-5 top-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-sm backdrop-blur">
                  {activePreset?.label ?? definition.name}
                </span>
                <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs text-neutral-600 shadow-sm backdrop-blur">
                  W {formatProjectMeasurement(definition.totalWidth)} · H {formatProjectMeasurement(definition.height)} · D {formatProjectMeasurement(definition.depth)}
                </span>
                <span className="rounded-full bg-blue-600/90 px-3 py-1.5 text-xs font-semibold text-white shadow-sm backdrop-blur">
                  Selected: {semanticSelectionLabel}
                </span>
              </div>
              <div className="absolute inset-x-5 bottom-5 grid gap-3">
                <div
                  data-testid="cabinet-validation"
                  data-validation-policy="errors_block_warnings_allow"
                  data-error-count={String(errors.length)}
                  data-warning-count={String(warnings.length)}
                  data-info-count={String(infos.length)}
                  className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-lg backdrop-blur"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-neutral-900">
                        {errors.length ? "Needs attention" : warnings.length ? "Valid with recommendations" : "Design is valid"}
                      </p>
                      <p className="mt-1 text-[11px] text-neutral-500">
                        {currentMaterial?.name ?? "Custom finish"} · {currentHardware?.name ?? "No handles"}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${errors.length ? "bg-red-100 text-red-700" : warnings.length ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {errors.length ? `${errors.length} errors` : warnings.length ? `${warnings.length} notes` : "Ready"}
                    </span>
                  </div>
                </div>
                {isProWorkspace ? (
                  <div data-testid="cabinet-bom" data-bom-count={String(bom.length)} className="sr-only" />
                ) : null}
              </div>
            </aside>
          </div>

          <footer className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-t border-neutral-200 bg-white px-4 py-2 sm:px-6">
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="cabinet-guided-back"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-neutral-300 px-3 text-sm font-semibold text-neutral-700 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-35"
                disabled={guidedStep === 0}
                onClick={() => setGuidedStep((step) => Math.max(0, step - 1))}
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              {isProWorkspace ? (
                <button
                  type="button"
                  className="min-h-10 rounded-xl px-3 text-sm font-semibold text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 sm:hidden"
                  onClick={() => chooseExperienceMode("detailed")}
                >
                  Detailed editor
                </button>
              ) : null}
            </div>

            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              {actionError ? <span data-testid="cabinet-action-error" role="alert" className="max-w-full text-xs font-medium leading-5 text-red-700">{formatProjectFeedback(actionError)}</span> : null}
              {actionSuccess ? <span data-testid="cabinet-action-success" role="status" className="max-w-full text-xs font-medium leading-5 text-emerald-700">{formatProjectFeedback(actionSuccess)}</span> : null}
              {guidedStep < GUIDED_STEPS.length - 1 ? (
                <button
                  type="button"
                  data-testid="cabinet-guided-next"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800"
                  onClick={() => setGuidedStep((step) => Math.min(GUIDED_STEPS.length - 1, step + 1))}
                >
                  Continue <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <>
                  {isProWorkspace ? (
                    <button
                      type="button"
                      data-testid="cabinet-open-outputs"
                      className="min-h-10 rounded-xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-700"
                      onClick={() => {
                        setOutputTab("outputs");
                        chooseExperienceMode("detailed");
                      }}
                    >
                      Export…
                    </button>
                  ) : null}
                  {onPlaceInPlan ? (
                    <button
                      type="button"
                      data-testid="cabinet-save-as-copy"
                      className="min-h-10 rounded-xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!validation.valid || busyAction !== null}
                      onClick={handleSaveAsCopy}
                    >
                      {busyAction === "copy" ? "Copying…" : "Save as copy"}
                    </button>
                  ) : null}
                  {mode === "create" || (!onPlaceInPlan && onSave) ? (
                    <button
                      type="button"
                      data-testid="cabinet-save-definition"
                      className="min-h-10 rounded-xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!validation.valid || busyAction !== null}
                      onClick={handleSave}
                    >
                      {busyAction === "save"
                        ? "Saving…"
                        : mode === "create"
                          ? "Save as template"
                          : "Save design"}
                    </button>
                  ) : null}
                  {onPlaceInPlan ? (
                    <button
                      type="button"
                      data-testid={mode === "edit" ? "cabinet-update-placement" : "cabinet-place-in-plan"}
                      className="min-h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!validation.valid || busyAction !== null}
                      onClick={handlePlace}
                    >
                      {busyAction === "place" ? "Generating…" : mode === "edit" ? "Update in plan" : "Place in plan"}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="custom-millwork-studio"
      data-mode={mode}
      data-access-level={accessLevel}
      data-experience="detailed"
      data-measurement-unit={projectMeasurementUnit}
      data-required-host={requiredHostType ?? ""}
      data-busy-action={busyAction ?? ""}
      className="h-full"
    >
      <div
        key={projectMeasurementUnit}
        data-testid="cabinetry-studio"
        data-mode={mode}
        data-busy-action={busyAction ?? ""}
        className="flex h-full min-h-[680px] flex-col bg-neutral-50 text-neutral-950"
      >
      <div className="flex min-h-14 items-center justify-between border-b border-neutral-200 bg-white px-4">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-neutral-900 text-white">
            <Box className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Custom Millwork Studio</h2>
            <p className="text-xs text-neutral-500">{mode === "edit" ? "Edit custom cabinetry" : "Create custom cabinetry"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" className="hidden items-center rounded-lg bg-neutral-100 p-1 sm:flex" aria-label="Editor workspace">
            <button
              type="button"
              data-testid="cabinet-experience-guided"
              aria-pressed="false"
              className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-950"
              onClick={() => chooseExperienceMode("guided")}
            >
              Guided setup
            </button>
            <button
              type="button"
              data-testid="cabinet-experience-detailed"
              aria-pressed="true"
              className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-neutral-950 shadow-sm"
            >
              Detailed editor
            </button>
          </div>
          <div className="flex items-center rounded-lg border border-neutral-200 p-0.5">
            <button
              type="button"
              data-testid="cabinet-undo"
              aria-label="Undo last millwork change"
              title="Undo"
              className="grid h-7 w-7 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
              disabled={historyRef.current.past.length === 0}
              onClick={undoDefinition}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              data-testid="cabinet-redo"
              aria-label="Redo last millwork change"
              title="Redo"
              className="grid h-7 w-7 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
              disabled={historyRef.current.future.length === 0}
              onClick={redoDefinition}
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              data-testid="cabinet-restore-template"
              aria-label="Restore template defaults"
              title="Restore template defaults"
              className="grid h-7 w-7 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100"
              onClick={restoreTemplateDefaults}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            data-testid="cabinetry-studio-close"
            aria-label="Close cabinetry studio"
            className="grid h-8 w-8 place-items-center rounded-lg text-neutral-600 hover:bg-neutral-100"
            onClick={onCancel}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 lg:hidden">
        <span>Detailed controls work best on a larger screen.</span>
        <button type="button" className="shrink-0 rounded px-1 font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-800" onClick={() => chooseExperienceMode("guided")}>
          Use guided setup
        </button>
      </div>

      <div
        data-testid="cabinet-detailed-compact-preview"
        className="relative min-h-0 flex-1 overflow-hidden bg-[#e8ece7] lg:hidden"
      >
        <CabinetPreview3D
          definition={deferredDefinition}
          generatedParts={previewParts}
          view={previewView}
          showClearances={showClearances}
          selection={semanticSelection}
          onSemanticSelect={handleSemanticPreviewSelection}
        />
        <div className="absolute right-3 top-3 z-30">
          <CabinetPreviewViewSelector value={previewView} onChange={setPreviewView} />
        </div>
        <div className="absolute inset-x-3 bottom-3 z-30 rounded-xl border border-white/70 bg-white/95 p-3 shadow-lg backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-neutral-900">Select a module</span>
            <span role="status" aria-live="polite" className="text-neutral-500">
              {previewStatus === "regenerating" ? "Updating preview…" : "Preview ready"}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {definition.modules.map((module, index) => (
              <button
                key={module.id}
                type="button"
                data-testid={`cabinet-compact-module-${index + 1}`}
                aria-pressed={module.id === activeModule?.id}
                className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  module.id === activeModule?.id
                    ? "border-neutral-950 bg-neutral-950 text-white"
                    : "border-neutral-300 bg-white text-neutral-700"
                }`}
                onClick={() => selectStudioModule(module.id)}
              >
                Bay {index + 1} · {formatProjectMeasurement(module.width)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden flex-1 grid-cols-[290px_minmax(360px,1fr)_310px] overflow-hidden lg:grid">
        <aside className="overflow-auto border-r border-neutral-200 bg-white p-4">
          <div className="grid gap-5">
            <div className="grid gap-2">
              {sectionTitle("Built-in type")}
              <div className="grid grid-cols-2 gap-2">
                {CABINET_PRESET_OPTIONS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`cabinet-preset-${preset.id}`}
                    aria-pressed={preset.id === activePresetId}
                    className={`min-h-9 rounded-md border px-2 text-left text-xs font-medium ${
                      preset.id === activePresetId
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 text-neutral-700 hover:border-neutral-900"
                    }`}
                    onClick={() => applyPreset(preset.id)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              {savedTemplates.length ? (
                <div className="mt-2 grid gap-1 border-t border-neutral-200 pt-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                    My templates
                  </span>
                  {savedTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className={`min-h-8 rounded-md border px-2 text-left text-xs font-medium ${
                        activeSavedTemplateId === template.id
                          ? "border-blue-700 bg-blue-700 text-white"
                          : "border-neutral-200 text-neutral-700 hover:border-blue-500"
                      }`}
                      onClick={() => applySavedTemplate(template)}
                    >
                      {template.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid gap-2">
              {sectionTitle("Modules")}
              <div className="grid gap-2">
                {definition.modules.map((module, index) => (
                  <button
                    key={module.id}
                    type="button"
                    draggable={definition.modules.length > 1}
                    data-testid={`cabinet-module-${index + 1}`}
                    data-module-id={module.id}
                    data-module-index={String(index)}
                    className={`min-h-9 rounded-md border px-2 text-left text-xs ${
                      module.id === activeModule?.id
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 text-neutral-700 hover:border-neutral-500"
                    } ${draggedModuleId === module.id ? "opacity-50" : ""}`}
                    title="Select this module, or drag it to reorder the run"
                    onClick={() => selectStudioModule(module.id)}
                    onDragStart={(event) => {
                      setDraggedModuleId(module.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", module.id);
                    }}
                    onDragEnd={() => setDraggedModuleId(null)}
                    onDragOver={(event) => {
                      if (!draggedModuleId || draggedModuleId === module.id) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceModuleId =
                        draggedModuleId || event.dataTransfer.getData("text/plain");
                      setDraggedModuleId(null);
                      if (sourceModuleId) reorderModule(sourceModuleId, module.id);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span>Module {index + 1} · {formatProjectMeasurement(module.width)}</span>
                      <ModuleIssueBadges issues={getIssuesForModule(module.id)} />
                    </span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-2">
                <button type="button" data-testid="cabinet-module-add" className="grid h-8 place-items-center rounded-md bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40" onClick={addModule} disabled={structuralModuleChangeDisabled} title={structuralModuleChangeTitle} aria-label="Add module">
                  <Plus className="h-4 w-4" />
                </button>
                <button type="button" data-testid="cabinet-module-duplicate" className="grid h-8 place-items-center rounded-md bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40" onClick={duplicateModule} disabled={structuralModuleChangeDisabled} title={structuralModuleChangeTitle} aria-label="Duplicate selected module">
                  <Copy className="h-4 w-4" />
                </button>
                <button type="button" data-testid="cabinet-module-move-left" aria-label="Move selected module left" className="grid h-8 place-items-center rounded-md bg-neutral-100 disabled:opacity-40" onClick={() => moveActiveModule(-1)} disabled={activeModuleIndex <= 0} title="Move module left">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button type="button" data-testid="cabinet-module-move-right" aria-label="Move selected module right" className="grid h-8 place-items-center rounded-md bg-neutral-100 disabled:opacity-40" onClick={() => moveActiveModule(1)} disabled={activeModuleIndex < 0 || activeModuleIndex >= definition.modules.length - 1} title="Move module right">
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button type="button" data-testid="cabinet-module-delete" className="grid h-8 place-items-center rounded-md bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40" onClick={deleteModule} disabled={structuralModuleChangeDisabled || definition.modules.length <= 1} title={definition.modules.length <= 1 ? "An assembly needs at least one module" : structuralModuleChangeTitle} aria-label="Delete selected module">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2">
                <div role="group" className="grid grid-cols-2 rounded-md bg-neutral-200/70 p-0.5" aria-label="Module sizing mode">
                  {(["automatic", "manual"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      data-testid={`cabinet-module-sizing-${value}`}
                      aria-pressed={automation.moduleSizingMode === value}
                      className={`rounded px-2 py-1.5 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                        automation.moduleSizingMode === value
                          ? "bg-white text-neutral-950 shadow-sm"
                          : "text-neutral-600"
                      }`}
                      onClick={() => changeModuleSizingMode(value)}
                    >
                      {labelize(value)}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] leading-4 text-neutral-500">
                  {automation.moduleSizingMode === "automatic"
                    ? "Structural changes preserve the overall target and redistribute unlocked bays."
                    : "Structural changes preserve entered bay widths and derive the overall width."}
                </p>
              </div>
            </div>

            <div className="grid gap-2" data-testid="cabinet-selection-breadcrumb">
              {sectionTitle("Editing")}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  className={`rounded-md px-2 py-1.5 font-semibold ${semanticSelection.scope === "assembly" ? "bg-blue-600 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
                  onClick={() =>
                    setSemanticSelection({
                      scope: "assembly",
                      cabinetDefinitionId: definition.id,
                      additive: false,
                    })
                  }
                >
                  Complete assembly
                </button>
                {activeModule ? (
                  <>
                    <span aria-hidden="true" className="text-neutral-300">/</span>
                    <button
                      type="button"
                      className={`rounded-md px-2 py-1.5 font-semibold ${semanticSelection.scope === "module" ? "bg-blue-600 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
                      onClick={() => selectStudioModule(activeModule.id)}
                    >
                      Module {activeModuleIndex + 1}
                    </button>
                  </>
                ) : null}
                {semanticSelection.scope === "part" ? (
                  <>
                    <span aria-hidden="true" className="text-neutral-300">/</span>
                    <span className="rounded-md bg-blue-600 px-2 py-1.5 font-semibold text-white">
                      {labelize(semanticSelection.partType ?? "part")}
                    </span>
                  </>
                ) : null}
              </div>
              <p className="text-[11px] leading-5 text-neutral-500">
                Select a generated part in the preview to open its parent module and relevant properties.
              </p>
            </div>

            <div className="grid gap-2" data-testid="cabinet-property-search">
              {sectionTitle("Find a property")}
              <label className="relative block">
                <span className="sr-only">Search millwork properties</span>
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
                <input
                  data-testid="cabinet-property-search-input"
                  type="search"
                  className="h-9 w-full rounded-md border border-neutral-300 bg-white pl-8 pr-3 text-xs outline-none focus:border-neutral-900"
                  placeholder="Filler, scribe, hinge, clearance…"
                  value={propertyQuery}
                  onChange={(event) => {
                    setPropertyQuery(event.target.value);
                    setExplicitlyRevealedModuleOptionGroupId(null);
                  }}
                />
              </label>
              {propertyQuery.trim() ? (
                <div className="grid max-h-64 gap-1 overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-1">
                  {propertyResults.length ? propertyResults.map((property) => (
                    <button
                      key={property.id}
                      type="button"
                      data-testid="cabinet-property-search-result"
                      data-property-id={property.id}
                      className="rounded-md bg-white px-2.5 py-2 text-left hover:bg-blue-50"
                      onClick={() => {
                        const targetsAssemblyInspector =
                          property.scope === "definition" &&
                          ["totalWidth", "height", "depth"].includes(property.field);
                        if (targetsAssemblyInspector) {
                          setSemanticSelection({
                            scope: "assembly",
                            cabinetDefinitionId: definition.id,
                            additive: false,
                          });
                        } else if (activeModule) {
                          selectStudioModule(activeModule.id);
                        }
                        focusPropertyControl(property.controlTestId);
                      }}
                    >
                      <span className="block text-xs font-semibold text-neutral-900">{property.label}</span>
                      <span className="mt-0.5 block text-[10px] text-neutral-500">
                        {labelize(property.section)} · {property.description}
                      </span>
                    </button>
                  )) : (
                    <p className="px-2 py-3 text-xs text-neutral-500">No relevant properties match this selection.</p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] leading-5 text-neutral-500">
                  Search friendly or trade terms without opening every construction section.
                </p>
              )}
            </div>

            {semanticSelection.scope === "assembly" ? (
              <div className="grid gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3" data-testid="cabinet-assembly-inspector">
                {sectionTitle("Complete assembly size")}
                <GuidedNumberField
                  label="Overall width"
                  value={getCabinetOverallWidth(definition)}
                  min={overallWidthLimits.minMm}
                  max={overallWidthLimits.maxMm}
                  suffix="mm"
                  testId="cabinet-guided-width"
                  fieldPath="totalWidth"
                  issues={getIssuesForField("totalWidth")}
                  disabled={!overallWidthCanResize}
                  onCommit={handleGuidedOverallWidth}
                />
                <GuidedNumberField
                  label="Overall height"
                  value={getCabinetOverallHeight(definition)}
                  min={200}
                  max={5000}
                  suffix="mm"
                  testId="cabinet-guided-height"
                  fieldPath="height"
                  issues={getIssuesForField("height")}
                  onCommit={(value) => handleOverallHeightOrDepth("height", value)}
                />
                <GuidedNumberField
                  label="Overall depth"
                  value={getCabinetOverallDepth(definition)}
                  min={120}
                  max={2500}
                  suffix="mm"
                  testId="cabinet-guided-depth"
                  fieldPath="depth"
                  issues={getIssuesForField("depth")}
                  onCommit={(value) => handleOverallHeightOrDepth("depth", value)}
                />
                <button
                  type="button"
                  data-testid="cabinet-overall-width-lock"
                  aria-pressed={overallWidthLocked}
                  className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${overallWidthLocked ? "border-blue-200 bg-blue-100 text-blue-800" : "border-blue-200 bg-white text-blue-800"}`}
                  onClick={toggleOverallWidthLock}
                >
                  {overallWidthLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                  {overallWidthLocked ? "Overall width locked" : "Lock overall width"}
                </button>
                {overallWidthBlockedByModuleLocks ? (
                  <p className="text-[11px] leading-5 text-amber-700">
                    Unlock a bay or release equal sizing before resizing the complete assembly.
                  </p>
                ) : null}
                <button
                  type="button"
                  className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-800"
                  onClick={() => chooseExperienceMode("guided")}
                >
                  Open guided Fit to Space
                </button>
              </div>
            ) : null}

            {activeModule && semanticSelection.scope === "part" ? (
              <div
                className="grid gap-4 rounded-xl border border-blue-200 bg-blue-50/50 p-3"
                data-testid="cabinet-part-inspector"
                data-part-type={selectedPart?.type ?? semanticSelection.partType ?? "unknown"}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {sectionTitle(selectedPart ? labelize(selectedPart.type) : "Selected part")}
                    <p className="mt-1 text-[11px] leading-5 text-blue-800">
                      These controls update the selected part&apos;s parent module without exposing unrelated module settings.
                    </p>
                  </div>
                  <ModuleIssueBadges issues={activeModuleIssues} />
                </div>

                {!selectedPart ? (
                  <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] leading-5 text-amber-800">
                    This generated part is updating. Open its parent module if you need the full controls now.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-2" data-testid="cabinet-part-material-control">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-neutral-700">
                          {selectedPartMaterialTarget === "front" ? "Front material" : "Part material"}
                        </span>
                        {selectedPartMaterialTarget === "front" || selectedPartMaterialTarget === "carcass" ? (
                          <button
                            type="button"
                            data-testid="cabinet-part-material-lock"
                            aria-pressed={activeMaterialLocked || activeFrontMaterialLocked}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700"
                            onClick={toggleActiveMaterialLock}
                          >
                            {activeMaterialLocked || activeFrontMaterialLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                            {activeMaterialLocked || activeFrontMaterialLocked ? "Locked" : "Lock"}
                          </button>
                        ) : null}
                      </div>
                      {selectedPartMaterialTarget ? (
                        <select
                          data-testid="cabinet-part-material"
                          aria-label={`Material for selected ${labelize(selectedPart.type)}`}
                          className={selectClass()}
                          value={selectedPartMaterialId}
                          disabled={
                            (selectedPartMaterialTarget === "front" && activeFrontMaterialLocked) ||
                            (selectedPartMaterialTarget === "carcass" && activeMaterialLocked) ||
                            (["countertop", "backsplash", "face_frame"] as const).includes(
                              selectedPartMaterialTarget as "countertop" | "backsplash" | "face_frame"
                            ) &&
                              Boolean(
                                getCabinetParameterState(
                                  definition,
                                  selectedPartMaterialTarget === "countertop"
                                    ? "countertopMaterialId"
                                    : selectedPartMaterialTarget === "backsplash"
                                      ? "backsplashMaterialId"
                                      : "faceFrameMaterialId"
                                ).locked
                              )
                          }
                          onChange={(event) => updateSelectedPartMaterial(event.target.value)}
                        >
                          {!CABINET_MATERIALS.some((material) => material.id === selectedPartMaterialId) ? (
                            <option value={selectedPartMaterialId}>{selectedPartMaterialName}</option>
                          ) : null}
                          {CABINET_MATERIALS.map((material) => (
                            <option key={material.id} value={material.id}>{material.name}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-xs text-neutral-700">
                          <span className="block font-semibold">{selectedPartMaterialName}</span>
                          <span className="mt-0.5 block text-[10px] text-neutral-500">
                            This generated or hardware finish is controlled by its parent system.
                          </span>
                        </div>
                      )}
                    </div>

                    {selectedPartIsDoorFront ? (
                      <div className="grid gap-3" data-testid="cabinet-part-door-front-controls">
                        <Field label="Door style">
                          <select
                            data-testid="cabinet-part-door-style"
                            className={selectClass()}
                            value={activeModule.doorStyle}
                            disabled={Boolean(getCabinetParameterState(definition, `modules.${activeModule.id}.doorStyle`).locked)}
                            onChange={(event) => updateModule(activeModule.id, { doorStyle: event.target.value as DoorStyle })}
                          >
                            {doorStyles.map((doorStyle) => <option key={doorStyle} value={doorStyle}>{labelize(doorStyle)}</option>)}
                          </select>
                        </Field>
                        <Field label="Compatible handle">
                          <select
                            data-testid="cabinet-part-hardware"
                            className={selectClass()}
                            value={activeModule.hardwareId ?? "none"}
                            disabled={Boolean(getCabinetParameterState(definition, `modules.${activeModule.id}.hardwareId`).locked)}
                            onChange={(event) => updateModule(activeModule.id, { hardwareId: event.target.value })}
                          >
                            {activeHardwareOptions.map((hardware) => <option key={hardware.id} value={hardware.id}>{hardware.name}</option>)}
                          </select>
                        </Field>
                        <Field label="Hinge side">
                          <select
                            data-testid="cabinet-part-hinge-side"
                            className={selectClass()}
                            value={activeModule.hingeSide ?? "left"}
                            disabled={Boolean(getCabinetParameterState(definition, `modules.${activeModule.id}.hingeSide`).locked)}
                            onChange={(event) => updateModule(activeModule.id, { hingeSide: event.target.value as NonNullable<CabinetModuleDefinition["hingeSide"]> })}
                          >
                            {hingeSides.map((hingeSide) => <option key={hingeSide} value={hingeSide}>{labelize(hingeSide)}</option>)}
                          </select>
                        </Field>
                      </div>
                    ) : null}

                    {selectedPartIsDrawerOrHandle ? (
                      <div className="grid gap-3" data-testid="cabinet-part-drawer-handle-controls">
                        <Field label="Compatible hardware">
                          <select
                            data-testid="cabinet-part-hardware"
                            className={selectClass()}
                            value={activeModule.hardwareId ?? "none"}
                            disabled={Boolean(getCabinetParameterState(definition, `modules.${activeModule.id}.hardwareId`).locked)}
                            onChange={(event) => updateModule(activeModule.id, { hardwareId: event.target.value })}
                          >
                            {activeHardwareOptions.map((hardware) => <option key={hardware.id} value={hardware.id}>{hardware.name}</option>)}
                          </select>
                        </Field>
                        <fieldset className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                          <legend className="px-1 text-xs font-semibold text-neutral-700">Handle placement</legend>
                          <div className="grid grid-cols-2 gap-1 rounded-md bg-neutral-100 p-1">
                            {(["automatic", "custom"] as const).map((placementMode) => (
                              <button
                                key={placementMode}
                                type="button"
                                data-testid={`cabinet-part-handle-placement-${placementMode}`}
                                aria-pressed={activeHandlePlacementMode === placementMode}
                                disabled={
                                  Boolean(getCabinetParameterState(definition, `modules.${activeModule.id}.handlePlacementMode`).locked) ||
                                  (placementMode === "custom" && !activeHandlePlacementAvailable)
                                }
                                className={`rounded px-2 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${activeHandlePlacementMode === placementMode ? "bg-white shadow-sm" : "text-neutral-500"}`}
                                onClick={() => setActiveHandlePlacementMode(placementMode)}
                              >
                                {labelize(placementMode)}
                              </button>
                            ))}
                          </div>
                          {activeHandlePlacementMode === "custom" && activeHandlePlacementAvailable ? (
                            <div className="grid grid-cols-2 gap-2">
                              <GuidedNumberField
                                label="Horizontal shift"
                                value={activeModule.handleOffsetX ?? 0}
                                min={-4000}
                                max={4000}
                                step={5}
                                suffix="mm"
                                testId="cabinet-part-handle-offset-x"
                                fieldPath="handleOffsetX"
                                issues={getIssuesForField("handleOffsetX", activeModule.id)}
                                disabled={Boolean(getCabinetParameterState(definition, `modules.${activeModule.id}.handleOffsetX`).locked)}
                                onCommit={(value) => updateModule(activeModule.id, { handleOffsetX: value })}
                              />
                              <GuidedNumberField
                                label="Vertical shift"
                                value={activeModule.handleOffsetY ?? 0}
                                min={-4000}
                                max={4000}
                                step={5}
                                suffix="mm"
                                testId="cabinet-part-handle-offset-y"
                                fieldPath="handleOffsetY"
                                issues={getIssuesForField("handleOffsetY", activeModule.id)}
                                disabled={Boolean(getCabinetParameterState(definition, `modules.${activeModule.id}.handleOffsetY`).locked)}
                                onCommit={(value) => updateModule(activeModule.id, { handleOffsetY: value })}
                              />
                            </div>
                          ) : null}
                        </fieldset>
                      </div>
                    ) : null}

                    {(selectedPartIsDoorFront || selectedPartIsDrawerOrHandle) && activeHardwareCompatibility ? (
                      <div
                        data-testid="cabinet-part-hardware-compatibility"
                        data-status={activeHardwareCompatibility.status}
                        role={activeHardwareCompatibility.status === "incompatible" ? "alert" : "status"}
                        className={`rounded-md border p-2 text-[11px] leading-5 ${
                          activeHardwareCompatibility.status === "compatible"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : activeHardwareCompatibility.status === "review_required"
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : "border-red-200 bg-red-50 text-red-800"
                        }`}
                      >
                        <span className="block font-semibold">
                          {activeHardwareCompatibility.status === "compatible"
                            ? "Compatible with this front"
                            : activeHardwareCompatibility.status === "review_required"
                              ? "Compatibility review needed"
                              : "Not compatible with this front"}
                        </span>
                        {activeHardwareCompatibility.reasons
                          .filter((reason) => reason.code !== "compatible")
                          .map((reason) => <span key={reason.code} className="mt-1 block">{formatProjectFeedback(reason.message)}</span>)}
                      </div>
                    ) : null}

                    {selectedPartIsShelf ? (
                      <div className="grid gap-3" data-testid="cabinet-part-shelf-controls">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-neutral-700">Shelf layout</span>
                          <button
                            type="button"
                            data-testid="cabinet-part-shelf-spacing-lock"
                            aria-pressed={activeShelfSpacingLocked}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700"
                            onClick={toggleActiveShelfSpacingLock}
                          >
                            {activeShelfSpacingLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                            {activeShelfSpacingLocked ? "Locked" : "Lock"}
                          </button>
                        </div>
                        <CabinetNumberField
                          label="Shelf count"
                          testId="cabinet-part-shelf-count"
                          fieldPath="shelfCount"
                          min={0}
                          step={1}
                          integer
                          disabled={activeShelfSpacingLocked}
                          disabledReason={activeShelfSpacingLocked ? "Unlock the shelf layout before changing the shelf count." : undefined}
                          issues={getIssuesForField("shelfCount", activeModule.id)}
                          value={activeModule.shelfCount}
                          onCommit={(value) => updateModule(activeModule.id, { shelfCount: value })}
                        />
                        <div className="grid grid-cols-2 gap-1 rounded-md bg-neutral-100 p-1">
                          {(["even", "custom"] as const).map((spacingMode) => (
                            <button
                              key={spacingMode}
                              type="button"
                              data-testid={`cabinet-part-shelf-spacing-${spacingMode}`}
                              aria-pressed={activeShelfSpacingMode === spacingMode}
                              disabled={activeShelfSpacingLocked}
                              className={`rounded px-2 py-1.5 text-xs font-semibold disabled:opacity-40 ${activeShelfSpacingMode === spacingMode ? "bg-white shadow-sm" : "text-neutral-500"}`}
                              onClick={() => setActiveShelfSpacingMode(spacingMode)}
                            >
                              {spacingMode === "even" ? "Even spacing" : "Custom heights"}
                            </button>
                          ))}
                        </div>
                        {activeShelfSpacingMode === "custom" ? (
                          <div className="grid grid-cols-2 gap-2">
                            {activeShelfPositions.map((position, index) => (
                              <CabinetNumberField
                                key={index}
                                label={`Shelf ${index + 1} height`}
                                testId={`cabinet-part-shelf-position-${index + 1}`}
                                fieldPath="shelfPositionsMm"
                                min={index === 0 ? definition.toeKickHeight + definition.boardThickness : activeShelfPositions[index - 1] + definition.boardThickness}
                                max={index === activeShelfPositions.length - 1 ? activeModule.height - definition.boardThickness : activeShelfPositions[index + 1] - definition.boardThickness}
                                step={1}
                                keyboardStep={5}
                                unit="mm"
                                disabled={activeShelfSpacingLocked}
                                disabledReason={activeShelfSpacingLocked ? "Unlock the shelf layout before moving this shelf." : undefined}
                                issues={getIssuesForField("shelfPositionsMm", activeModule.id)}
                                value={Math.round(position)}
                                onCommit={(value) => updateActiveShelfPosition(index, value)}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {selectedPartIsHangingRod ? (
                      <div className="grid gap-2" data-testid="cabinet-part-hanging-rod-controls">
                        <CabinetNumberField
                          label="Rod count"
                          testId="cabinet-part-hanging-rod-count"
                          fieldPath="hangingRodCount"
                          min={0}
                          step={1}
                          integer
                          disabled={Boolean(getCabinetParameterState(definition, `modules.${activeModule.id}.hangingRodCount`).locked)}
                          issues={getIssuesForField("hangingRodCount", activeModule.id)}
                          value={activeModule.hangingRodCount ?? 0}
                          onCommit={(value) => updateModule(activeModule.id, { hangingRodCount: value })}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <CabinetNumberField
                            label="Rod height"
                            testId="cabinet-part-hanging-rod-height"
                            fieldPath="hangingRodHeight"
                            min={0}
                            max={activeModule.height}
                            step={1}
                            keyboardStep={10}
                            unit="mm"
                            disabled={Boolean(getCabinetParameterState(definition, `modules.${activeModule.id}.hangingRodHeight`).locked)}
                            issues={getIssuesForField("hangingRodHeight", activeModule.id)}
                            value={activeModule.hangingRodHeight ?? 0}
                            onCommit={(value) => updateModule(activeModule.id, { hangingRodHeight: value })}
                          />
                          <CabinetNumberField
                            label="Rod spacing"
                            testId="cabinet-part-hanging-rod-spacing"
                            fieldPath="hangingRodSpacing"
                            min={0}
                            max={activeModule.height}
                            step={1}
                            keyboardStep={10}
                            unit="mm"
                            disabled={Boolean(getCabinetParameterState(definition, `modules.${activeModule.id}.hangingRodSpacing`).locked)}
                            issues={getIssuesForField("hangingRodSpacing", activeModule.id)}
                            value={activeModule.hangingRodSpacing ?? 0}
                            onCommit={(value) => updateModule(activeModule.id, { hangingRodSpacing: value })}
                          />
                        </div>
                      </div>
                    ) : null}

                    <dl className="grid grid-cols-3 gap-2 rounded-md border border-neutral-200 bg-white p-2 text-[11px]" data-testid="cabinet-part-dimensions">
                      {(["width", "height", "depth"] as const).map((axis) => (
                        <div key={axis}>
                          <dt className="text-neutral-500">{labelize(axis)}</dt>
                          <dd className="mt-0.5 font-semibold text-neutral-900">{formatProjectMeasurement(selectedPart.size[axis])}</dd>
                        </div>
                      ))}
                    </dl>

                    {selectedPartFabrication ? (
                      <div className="grid gap-1 rounded-md border border-blue-200 bg-white p-2 text-[11px] leading-5 text-blue-900" data-testid="cabinet-selected-part-fabrication">
                        <span className="font-semibold">Resolved fabrication</span>
                        <span>Cut face: {labelize(selectedPartFabrication.cutFace.widthAxis)} × {labelize(selectedPartFabrication.cutFace.heightAxis)}; thickness {labelize(selectedPartFabrication.cutFace.thicknessAxis)}</span>
                        <span>Grain: {labelize(selectedPartFabrication.grainDirection)} ({labelize(selectedPartFabrication.grainAxis)})</span>
                        <span>Edges: {labelize(selectedPartFabrication.edgeTreatment)} · {formatProjectMeasurement(selectedPartFabrication.treatedLengthMm)} · {selectedPartFabrication.treatedEdges.length ? selectedPartFabrication.treatedEdges.map(labelize).join(", ") : "none"}</span>
                        <span>Exposed faces: {selectedPartFabrication.exposedFaces.length ? selectedPartFabrication.exposedFaces.map(labelize).join(", ") : "none"}</span>
                      </div>
                    ) : (
                      <p className="rounded-md border border-neutral-200 bg-white p-2 text-[11px] leading-5 text-neutral-500">
                        This generated marker has no cut-sheet fabrication treatment.
                      </p>
                    )}

                    {activeModuleIssues.length ? (
                      <div className="grid gap-1" data-testid="cabinet-part-validation">
                        <span className="text-xs font-semibold text-neutral-700">Parent module validation</span>
                        {activeModuleIssues.slice(0, 3).map((issue) => (
                          <button
                            key={issue.id}
                            type="button"
                            className="rounded-md border border-neutral-200 bg-white p-2 text-left text-[11px] leading-5 text-neutral-700"
                            onClick={() => focusValidationIssue(issue)}
                          >
                            <span className="font-semibold">{labelize(issue.severity)}:</span> {formatProjectFeedback(issue.message)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}

                <button
                  type="button"
                  data-testid="cabinet-part-open-parent-module"
                  className="min-h-9 rounded-md border border-blue-300 bg-white px-3 text-xs font-semibold text-blue-800 hover:border-blue-600"
                  onClick={() => selectStudioModule(activeModule.id)}
                >
                  Open parent Module {activeModuleIndex + 1}
                </button>
              </div>
            ) : null}

            {activeModule && semanticSelection.scope === "module" ? (
              <>
                <div className="grid gap-3">
                  {sectionTitle("Dimensions")}
                  <div className="grid grid-cols-3 gap-2">
                    {(["width", "height", "depth"] as const).map((field) => (
                      <Field key={field} label={labelize(field)}>
                        <CabinetNumberField
                          label={labelize(field)}
                          hideLabel
                          compact
                          testId={`cabinet-dimension-${field}`}
                          fieldPath={field}
                          min={
                            field === "width"
                              ? getCabinetMinimumModuleWidthMm(activeModule, definition)
                              : field === "height"
                                ? 200
                                : 120
                          }
                          step={1}
                          keyboardStep={10}
                          unit="mm"
                          issues={getIssuesForField(field, activeModule.id)}
                          disabled={
                            field === "width" &&
                            (overallWidthLocked ||
                              automation.equalModuleSizing ||
                              isCabinetModuleWidthLocked(definition, activeModule.id))
                          }
                          disabledReason={
                            field === "width" &&
                            (overallWidthLocked ||
                              automation.equalModuleSizing ||
                              isCabinetModuleWidthLocked(definition, activeModule.id))
                              ? "Unlock the overall or module width before editing this value."
                              : undefined
                          }
                          value={activeModule[field]}
                          onCommit={(nextValue) =>
                            updateModule(activeModule.id, {
                              [field]: nextValue,
                            } as Partial<CabinetModuleDefinition>)
                          }
                        />
                      </Field>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="cabinet-module-width-lock"
                      aria-pressed={isCabinetModuleWidthLocked(definition, activeModule.id)}
                      className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-neutral-300 px-2 text-xs font-semibold text-neutral-600"
                      onClick={toggleActiveModuleWidthLock}
                    >
                      {isCabinetModuleWidthLocked(definition, activeModule.id) ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                      {isCabinetModuleWidthLocked(definition, activeModule.id) ? "Width locked" : "Lock width"}
                    </button>
                    <button
                      type="button"
                      data-testid="cabinet-equal-module-sizing"
                      aria-pressed={automation.equalModuleSizing}
                      className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-neutral-300 px-2 text-xs font-semibold text-neutral-600"
                      onClick={toggleEqualModuleSizing}
                    >
                      {automation.equalModuleSizing ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                      Equal widths
                    </button>
                  </div>
                  <button
                    type="button"
                    data-testid="cabinet-reset-module"
                    className="min-h-8 rounded-md border border-neutral-300 px-2 text-xs font-semibold text-neutral-600"
                    onClick={resetActiveModule}
                  >
                    Reset selected module
                  </button>
                </div>

                <div className="grid gap-3">
                  {sectionTitle("Structure")}
                  {activeIsCabinetComponent ? (
                  <Field label="Module type">
                    <select
                      data-testid="cabinet-input-module-type"
                      className={selectClass()}
                      value={activeModule.type}
                      onChange={(event) => updateModule(activeModule.id, { type: event.target.value as CabinetUnitType })}
                    >
                      {unitTypes.map((unitType) => <option key={unitType} value={unitType}>{labelize(unitType)}</option>)}
                    </select>
                  </Field>
                  ) : null}
                  <Field label="Component">
                    <select
                      data-testid="cabinet-input-component-type"
                      className={selectClass()}
                      value={activeModule.millworkComponentType ?? "cabinet"}
                      onChange={(event) => updateModule(activeModule.id, { millworkComponentType: event.target.value as CabinetMillworkComponentType })}
                    >
                      {componentTypes.map((componentType) => <option key={componentType} value={componentType}>{labelize(componentType)}</option>)}
                    </select>
                  </Field>
                  {activeIsCabinetComponent ? (
                  <>
                    <div className="grid grid-cols-4 gap-2">
                      <Field label="Shelves">
                        <CabinetNumberField label="Shelves" hideLabel compact testId="cabinet-input-shelves" fieldPath="shelfCount" min={0} step={1} integer disabled={activeShelfSpacingLocked} disabledReason={activeShelfSpacingLocked ? "Unlock the shelf layout before changing the shelf count." : undefined} issues={getIssuesForField("shelfCount", activeModule.id)} value={activeModule.shelfCount} onCommit={(nextValue) => updateModule(activeModule.id, { shelfCount: nextValue })} />
                      </Field>
                      <Field label="Dividers">
                        <CabinetNumberField label="Dividers" hideLabel compact testId="cabinet-input-dividers" fieldPath="verticalDividerCount" min={0} step={1} integer issues={getIssuesForField("verticalDividerCount", activeModule.id)} value={activeModule.verticalDividerCount ?? 0} onCommit={(nextValue) => updateModule(activeModule.id, { verticalDividerCount: nextValue })} />
                      </Field>
                      <Field label="Doors">
                        <CabinetNumberField label="Doors" hideLabel compact testId="cabinet-input-doors" fieldPath="doorCount" min={activeModule.frontType === "double_door" ? 2 : 1} step={1} integer disabled={!activeHasDoorFront || activeDoorLayoutMode === "recommended"} disabledReason={!activeHasDoorFront ? "Choose a door front before setting a count." : activeDoorLayoutMode === "recommended" ? "Switch the door layout to Manual before editing its count." : undefined} issues={getIssuesForField("doorCount", activeModule.id)} value={activeDoorCount} onCommit={(nextValue) => updateModule(activeModule.id, { doorCount: nextValue })} />
                      </Field>
                      <Field label="Drawers">
                        <CabinetNumberField label="Drawers" hideLabel compact testId="cabinet-input-drawers" fieldPath="drawerCount" min={0} step={1} integer issues={getIssuesForField("drawerCount", activeModule.id)} value={activeModule.drawerCount} onCommit={(nextValue) => updateModule(activeModule.id, { drawerCount: nextValue })} />
                      </Field>
                    </div>
                    <div className="grid gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-neutral-700">Shelf spacing</span>
                        <button
                          type="button"
                          data-testid="cabinet-shelf-spacing-lock"
                          aria-pressed={activeShelfSpacingLocked}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700"
                          onClick={toggleActiveShelfSpacingLock}
                        >
                          {activeShelfSpacingLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                          {activeShelfSpacingLocked ? "Locked" : "Lock layout"}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1 rounded-md bg-neutral-200 p-1">
                        {(["even", "custom"] as const).map((spacingMode) => (
                          <button
                            key={spacingMode}
                            type="button"
                            data-testid={`cabinet-shelf-spacing-${spacingMode}`}
                            aria-pressed={activeShelfSpacingMode === spacingMode}
                            disabled={activeShelfSpacingLocked}
                            className={`rounded px-2 py-1.5 text-xs font-semibold disabled:opacity-40 ${activeShelfSpacingMode === spacingMode ? "bg-white shadow-sm" : "text-neutral-500"}`}
                            onClick={() => setActiveShelfSpacingMode(spacingMode)}
                          >
                            {spacingMode === "even" ? "Even" : "Custom heights"}
                          </button>
                        ))}
                      </div>
                      {activeShelfSpacingMode === "custom" ? (
                        <div className="grid grid-cols-2 gap-2">
                          {activeShelfPositions.map((position, index) => (
                            <Field key={index} label={`Shelf ${index + 1} h`}>
                              <CabinetNumberField
                                label={`Shelf ${index + 1} height`}
                                hideLabel
                                compact
                                testId={`cabinet-input-shelf-position-${index + 1}`}
                                fieldPath="shelfPositionsMm"
                                min={index === 0 ? definition.toeKickHeight + definition.boardThickness : activeShelfPositions[index - 1] + definition.boardThickness}
                                max={index === activeShelfPositions.length - 1 ? activeModule.height - definition.boardThickness : activeShelfPositions[index + 1] - definition.boardThickness}
                                step={5}
                                unit="mm"
                                disabled={activeShelfSpacingLocked}
                                disabledReason={activeShelfSpacingLocked ? "Unlock the shelf layout before moving a shelf." : undefined}
                                issues={getIssuesForField("shelfPositionsMm", activeModule.id)}
                                value={Math.round(position)}
                                onCommit={(nextValue) => updateActiveShelfPosition(index, nextValue)}
                              />
                            </Field>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </>
                  ) : null}
                  {!activeIsCabinetComponent ? (
                    <div className="grid gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3" data-testid="cabinet-specialty-inspector">
                      <div>
                        <p className="text-xs font-semibold text-blue-950">{labelize(activeComponentType)} properties</p>
                        <p className="mt-1 text-[11px] leading-5 text-blue-700">
                          Only controls that generate this specialty component are shown.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {specialtyNumberFields.map((field) => (
                          <Field key={field.field} label={field.label}>
                            <CabinetNumberField
                              label={field.label}
                              hideLabel
                              compact
                              testId={field.testId}
                              fieldPath={field.field}
                              min={field.min ?? 0}
                              max={field.max}
                              step={field.step}
                              integer={field.field.endsWith("Count")}
                              unit={field.field === "trimMiterAngle" ? "°" : field.field.endsWith("Count") ? undefined : "mm"}
                              issues={getIssuesForField(field.field, activeModule.id)}
                              value={getSpecialtyNumberValue(activeModule, field.field)}
                              onCommit={(nextValue) =>
                                updateModule(activeModule.id, {
                                  [field.field]: nextValue,
                                } as Partial<CabinetModuleDefinition>)
                              }
                            />
                          </Field>
                        ))}
                      </div>
                      {isCabinetWallBedPanel(activeModule) ? (
                        <div className="grid gap-3 rounded-lg border border-blue-200 bg-white p-3" data-testid="cabinet-wall-bed-controls">
                          <div>
                            <p className="text-xs font-semibold text-blue-950">Mattress and opening</p>
                            <p className="mt-1 text-[11px] leading-5 text-blue-700">
                              The preview can show either the closed front or deployed bed, plus its required floor clearance.
                            </p>
                          </div>
                          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-2 text-blue-950">
                            <CabinetWallBedConfigurationPreview
                              mattressSize={getCabinetWallBedMattressSize(activeModule)}
                              orientation={getCabinetWallBedOrientation(activeModule)}
                              displayState={getCabinetWallBedDisplayState(activeModule)}
                              sideStorage={getCabinetWallBedSideStorage(activeModule)}
                              ariaLabel={`${labelize(getCabinetWallBedMattressSize(activeModule))} ${labelize(getCabinetWallBedOrientation(activeModule))} wall bed shown ${getCabinetWallBedDisplayState(activeModule)} with ${labelize(getCabinetWallBedSideStorage(activeModule))} side storage`}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {(Object.keys(CABINET_WALL_BED_MATTRESS_DIMENSIONS) as CabinetWallBedMattressSize[]).map((size) => {
                              const dimensions = CABINET_WALL_BED_MATTRESS_DIMENSIONS[size];
                              const selected = getCabinetWallBedMattressSize(activeModule) === size;
                              return (
                                <button
                                  key={size}
                                  type="button"
                                  data-testid={`cabinet-wall-bed-mattress-${size}`}
                                  aria-pressed={selected}
                                  className={`rounded-md border p-2 text-left text-xs ${selected ? "border-blue-700 bg-blue-50 text-blue-950" : "border-neutral-200 text-neutral-600"}`}
                                  onClick={() => updateWallBedSize(size, getCabinetWallBedOrientation(activeModule))}
                                >
                                  <CabinetWallBedConfigurationPreview
                                    mattressSize={size}
                                    orientation={getCabinetWallBedOrientation(activeModule)}
                                    displayState={getCabinetWallBedDisplayState(activeModule)}
                                    sideStorage={getCabinetWallBedSideStorage(activeModule)}
                                    className="h-14 w-full"
                                  />
                                  <span className="block font-semibold">{labelize(size)}</span>
                                  <span className="mt-1 block text-[10px]">{formatProjectMeasurement(dimensions.widthMm)} × {formatProjectMeasurement(dimensions.lengthMm)}</span>
                                </button>
                              );
                            })}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {(["vertical", "horizontal"] as CabinetWallBedOrientation[]).map((orientation) => (
                              <button
                                key={orientation}
                                type="button"
                                data-testid={`cabinet-wall-bed-orientation-${orientation}`}
                                aria-pressed={getCabinetWallBedOrientation(activeModule) === orientation}
                                className={`grid gap-1 rounded-md border p-2 text-xs font-semibold ${getCabinetWallBedOrientation(activeModule) === orientation ? "border-blue-700 bg-blue-50 text-blue-950" : "border-neutral-200 text-neutral-600"}`}
                                onClick={() => updateWallBedSize(getCabinetWallBedMattressSize(activeModule), orientation)}
                              >
                                <CabinetWallBedConfigurationPreview
                                  mattressSize={getCabinetWallBedMattressSize(activeModule)}
                                  orientation={orientation}
                                  displayState={getCabinetWallBedDisplayState(activeModule)}
                                  sideStorage={getCabinetWallBedSideStorage(activeModule)}
                                  className="h-14 w-full"
                                />
                                {labelize(orientation)} opening
                              </button>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {(["closed", "open"] as CabinetWallBedDisplayState[]).map((displayState) => (
                              <button
                                key={displayState}
                                type="button"
                                data-testid={`cabinet-wall-bed-state-${displayState}`}
                                aria-pressed={getCabinetWallBedDisplayState(activeModule) === displayState}
                                className={`grid gap-1 rounded-md border p-2 text-xs font-semibold ${getCabinetWallBedDisplayState(activeModule) === displayState ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-neutral-200 text-neutral-600"}`}
                                onClick={() => updateModule(activeModule.id, { wallBedDisplayState: displayState })}
                              >
                                <CabinetWallBedConfigurationPreview
                                  mattressSize={getCabinetWallBedMattressSize(activeModule)}
                                  orientation={getCabinetWallBedOrientation(activeModule)}
                                  displayState={displayState}
                                  sideStorage={getCabinetWallBedSideStorage(activeModule)}
                                  className="h-14 w-full"
                                />
                                Show {displayState}
                              </button>
                            ))}
                          </div>
                          <label className="flex items-start gap-2 rounded-md bg-sky-50 p-2 text-xs text-sky-900">
                            <input
                              data-testid="cabinet-wall-bed-clearance-visible"
                              type="checkbox"
                              checked={Boolean(activeModule.wallBedClearanceVisible)}
                              onChange={(event) => updateModule(activeModule.id, { wallBedClearanceVisible: event.target.checked })}
                            />
                            <span>
                              <span className="block font-semibold">Show deployed clearance</span>
                              <span className="mt-0.5 block text-[10px]">{formatProjectMeasurement(getCabinetConvertibleOpenDepth(activeModule))} projection from the cabinet.</span>
                            </span>
                          </label>
                          <div className="grid gap-2">
                            <span className="text-xs font-medium text-neutral-600">Side storage</span>
                            <div role="group" aria-label="Wall-bed side-storage configuration" className="grid grid-cols-2 gap-2">
                              {(["none", "left", "right", "both"] as CabinetWallBedSideStorage[]).map((sideStorage) => {
                                const selected = getCabinetWallBedSideStorage(activeModule) === sideStorage;
                                return (
                                  <button
                                    key={sideStorage}
                                    type="button"
                                    data-testid={`cabinet-wall-bed-side-storage-${sideStorage}`}
                                    aria-pressed={selected}
                                    className={`grid gap-1 rounded-md border p-2 text-xs font-semibold ${selected ? "border-blue-700 bg-blue-50 text-blue-950" : "border-neutral-200 text-neutral-600"}`}
                                    onClick={() => updateWallBedSideStorage(sideStorage)}
                                  >
                                    <CabinetWallBedConfigurationPreview
                                      mattressSize={getCabinetWallBedMattressSize(activeModule)}
                                      orientation={getCabinetWallBedOrientation(activeModule)}
                                      displayState={getCabinetWallBedDisplayState(activeModule)}
                                      sideStorage={sideStorage}
                                      className="h-14 w-full"
                                    />
                                    {labelize(sideStorage)}
                                  </button>
                                );
                              })}
                            </div>
                            <select
                              data-testid="cabinet-wall-bed-side-storage"
                              aria-label="Wall-bed side storage compact list"
                              className={selectClass()}
                              value={getCabinetWallBedSideStorage(activeModule)}
                              onChange={(event) =>
                                updateWallBedSideStorage(event.target.value as CabinetWallBedSideStorage)
                              }
                            >
                              {(["none", "left", "right", "both"] as CabinetWallBedSideStorage[]).map((sideStorage) => (
                                <option key={sideStorage} value={sideStorage}>{labelize(sideStorage)}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ) : null}
                      {activeComponentType === "ceiling_beam_array" || activeComponentType === "coffered_ceiling_grid" ? (
                        <Field label="Beam direction">
                          <select
                            data-testid="cabinet-input-ceiling-beam-orientation"
                            className={selectClass()}
                            value={activeModule.ceilingBeamOrientation ?? "z"}
                            onChange={(event) =>
                              updateModule(activeModule.id, {
                                ceilingBeamOrientation: event.target.value as NonNullable<CabinetModuleDefinition["ceilingBeamOrientation"]>,
                              })
                            }
                          >
                            <option value="z">Along room depth</option>
                            <option value="x">Along room width</option>
                          </select>
                        </Field>
                      ) : null}
                      {activeComponentType === "trim_run" ? (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <Field label="Trim placement">
                              <select data-testid="cabinet-input-trim-placement" className={selectClass()} value={activeModule.trimPlacement ?? "generic_trim"} onChange={(event) => updateModule(activeModule.id, { trimPlacement: event.target.value as CabinetTrimPlacement })}>
                                {trimPlacements.map((placement) => <option key={placement} value={placement}>{labelize(placement)}</option>)}
                              </select>
                            </Field>
                            <Field label="Run direction">
                              <select data-testid="cabinet-input-trim-orientation" className={selectClass()} value={activeModule.trimOrientation ?? "x"} onChange={(event) => updateModule(activeModule.id, { trimOrientation: event.target.value as NonNullable<CabinetModuleDefinition["trimOrientation"]> })}>
                                <option value="x">Horizontal</option>
                                <option value="z">Perpendicular</option>
                              </select>
                            </Field>
                            <Field label="Left end">
                              <select data-testid="cabinet-input-trim-left-end-treatment" className={selectClass()} value={activeModule.trimLeftEndTreatment ?? "butt"} onChange={(event) => updateModule(activeModule.id, { trimLeftEndTreatment: event.target.value as CabinetTrimEndTreatment })}>
                                {trimEndTreatments.map((treatment) => <option key={treatment} value={treatment}>{labelize(treatment)}</option>)}
                              </select>
                            </Field>
                            <Field label="Right end">
                              <select data-testid="cabinet-input-trim-right-end-treatment" className={selectClass()} value={activeModule.trimRightEndTreatment ?? "butt"} onChange={(event) => updateModule(activeModule.id, { trimRightEndTreatment: event.target.value as CabinetTrimEndTreatment })}>
                                {trimEndTreatments.map((treatment) => <option key={treatment} value={treatment}>{labelize(treatment)}</option>)}
                              </select>
                            </Field>
                          </div>
                          <label className="flex items-center gap-2 text-xs font-semibold text-blue-950">
                            <input
                              data-testid="cabinet-input-trim-reveal-strip-enabled"
                              type="checkbox"
                              checked={hasCabinetTrimRevealStrip(activeModule)}
                              onChange={(event) =>
                                updateModule(activeModule.id, {
                                  trimRevealStripEnabled: event.target.checked,
                                  trimRevealStripHeight: event.target.checked ? activeModule.trimRevealStripHeight ?? CABINET_DEFAULT_TRIM_REVEAL_STRIP_HEIGHT : undefined,
                                  trimRevealStripDepth: event.target.checked ? activeModule.trimRevealStripDepth ?? CABINET_DEFAULT_TRIM_REVEAL_STRIP_DEPTH : undefined,
                                  trimRevealStripInsetFromTop: event.target.checked ? activeModule.trimRevealStripInsetFromTop ?? CABINET_DEFAULT_TRIM_REVEAL_STRIP_INSET_FROM_TOP : undefined,
                                })
                              }
                            />
                            <span title="Trade term: reveal / backing strip">Add shadow-gap backing strip</span>
                          </label>
                          {hasCabinetTrimRevealStrip(activeModule) ? (
                            <div className="grid grid-cols-3 gap-2">
                              {([
                                ["trimRevealStripHeight", "Height", "cabinet-input-trim-reveal-strip-height"],
                                ["trimRevealStripDepth", "Depth", "cabinet-input-trim-reveal-strip-depth"],
                                ["trimRevealStripInsetFromTop", "Top inset", "cabinet-input-trim-reveal-strip-inset"],
                              ] as const).map(([field, label, testId]) => (
                                <Field key={field} label={label}>
                                  <CabinetNumberField label={label} hideLabel compact testId={testId} min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps(field, activeModule[field] ?? 0)} />
                                </Field>
                              ))}
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {activeIsCabinetComponent ? (
                  <button
                    type="button"
                    data-testid="cabinet-module-options-toggle"
                    aria-expanded={moduleOptionsOpen}
                    className="flex min-h-9 items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 px-3 text-left text-xs font-semibold text-neutral-700 hover:border-neutral-400"
                    onClick={() => {
                      const nextOpen = !moduleOptionsOpen;
                      setModuleOptionsOpen(nextOpen);
                      if (nextOpen) {
                        trackStudioInteraction("millwork_advanced_controls_opened", {
                          section: "module_options",
                        });
                      }
                    }}
                  >
                    <span>{moduleOptionsOpen ? "Hide module options" : "More module options"}</span>
                    <span className="text-[10px] font-medium text-neutral-400">
                      {labelize(activeModule.millworkComponentType ?? "cabinet")}
                    </span>
                  </button>
                  ) : null}
                  {moduleOptionsOpen && activeIsCabinetComponent ? (
                    <div className="grid gap-3" data-testid="cabinet-module-options">
                  <CabinetModuleOptionGroup
                    id="installation_cleat"
                    visible={visibleModuleOptionGroupIds.has("installation_cleat")}
                  >
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-installation-cleat-enabled"
                        type="checkbox"
                        checked={hasCabinetInstallationCleat(activeModule)}
                        onChange={(event) =>
                          updateModule(activeModule.id, {
                            installationCleatEnabled: event.target.checked,
                            installationCleatHeight: event.target.checked ? activeModule.installationCleatHeight ?? CABINET_DEFAULT_INSTALLATION_CLEAT_HEIGHT : undefined,
                            installationCleatThickness: event.target.checked ? activeModule.installationCleatThickness ?? CABINET_DEFAULT_INSTALLATION_CLEAT_THICKNESS : undefined,
                            installationCleatInsetFromTop: event.target.checked ? activeModule.installationCleatInsetFromTop ?? CABINET_DEFAULT_INSTALLATION_CLEAT_INSET_FROM_TOP : undefined,
                          })
                        }
                      />
                      Installation cleat
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Height">
                        <CabinetNumberField label="Height" hideLabel compact testId="cabinet-input-installation-cleat-height" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("installationCleatHeight", activeModule.installationCleatHeight ?? 0)} />
                      </Field>
                      <Field label="Depth">
                        <CabinetNumberField label="Depth" hideLabel compact testId="cabinet-input-installation-cleat-thickness" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("installationCleatThickness", activeModule.installationCleatThickness ?? 0)} />
                      </Field>
                      <Field label="Top inset">
                        <CabinetNumberField label="Top inset" hideLabel compact testId="cabinet-input-installation-cleat-inset" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("installationCleatInsetFromTop", activeModule.installationCleatInsetFromTop ?? 0)} />
                      </Field>
                    </div>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="anti_tip"
                    visible={visibleModuleOptionGroupIds.has("anti_tip")}
                  >
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-anti-tip-anchor-enabled"
                        type="checkbox"
                        checked={hasCabinetAntiTipAnchors(activeModule)}
                        onChange={(event) =>
                          updateModule(activeModule.id, {
                            antiTipAnchorEnabled: event.target.checked,
                            antiTipAnchorCount: event.target.checked ? activeModule.antiTipAnchorCount ?? CABINET_DEFAULT_ANTI_TIP_ANCHOR_COUNT : undefined,
                            antiTipAnchorHeight: event.target.checked ? activeModule.antiTipAnchorHeight ?? getCabinetAntiTipAnchorHeight({ ...activeModule, antiTipAnchorEnabled: true }) : undefined,
                            antiTipAnchorInsetFromSides: event.target.checked ? activeModule.antiTipAnchorInsetFromSides ?? CABINET_DEFAULT_ANTI_TIP_ANCHOR_INSET_FROM_SIDES : undefined,
                          })
                        }
                      />
                      Anti-tip anchors
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Count">
                        <CabinetNumberField label="Count" hideLabel compact testId="cabinet-input-anti-tip-anchor-count" min={0} step={1} integer {...detailedModuleNumberFieldProps("antiTipAnchorCount", activeModule.antiTipAnchorCount ?? 0)} />
                      </Field>
                      <Field label="Height">
                        <CabinetNumberField label="Height" hideLabel compact testId="cabinet-input-anti-tip-anchor-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("antiTipAnchorHeight", activeModule.antiTipAnchorHeight ?? 0)} />
                      </Field>
                      <Field label="Side inset">
                        <CabinetNumberField label="Side inset" hideLabel compact testId="cabinet-input-anti-tip-anchor-inset" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("antiTipAnchorInsetFromSides", activeModule.antiTipAnchorInsetFromSides ?? 0)} />
                      </Field>
                    </div>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="hanging_rods"
                    visible={visibleModuleOptionGroupIds.has("hanging_rods")}
                  >
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Rods">
                      <CabinetNumberField label="Rods" hideLabel compact testId="cabinet-input-hanging-rods" min={0} step={1} integer {...detailedModuleNumberFieldProps("hangingRodCount", activeModule.hangingRodCount ?? 0)} />
                    </Field>
                    <Field label="Rod height">
                      <CabinetNumberField label="Rod height" hideLabel compact testId="cabinet-input-hanging-rod-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("hangingRodHeight", activeModule.hangingRodHeight ?? 0)} />
                    </Field>
                    <Field label="Rod spacing">
                      <CabinetNumberField label="Rod spacing" hideLabel compact testId="cabinet-input-hanging-rod-spacing" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("hangingRodSpacing", activeModule.hangingRodSpacing ?? 0)} />
                    </Field>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="shelf_pins"
                    visible={visibleModuleOptionGroupIds.has("shelf_pins")}
                  >
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-shelf-pin-rows-enabled"
                        type="checkbox"
                        disabled={activeShelfSpacingLocked}
                        checked={hasCabinetShelfPinRows(activeModule)}
                        onChange={(event) =>
                          updateModule(activeModule.id, {
                            shelfPinRowsEnabled: event.target.checked,
                            shelfPinRowPairCount: event.target.checked ? activeModule.shelfPinRowPairCount ?? CABINET_DEFAULT_SHELF_PIN_ROW_PAIR_COUNT : undefined,
                            shelfPinHoleCount: event.target.checked ? activeModule.shelfPinHoleCount ?? CABINET_DEFAULT_SHELF_PIN_HOLE_COUNT : undefined,
                            shelfPinHoleSpacing: event.target.checked ? activeModule.shelfPinHoleSpacing ?? CABINET_DEFAULT_SHELF_PIN_HOLE_SPACING : undefined,
                            shelfPinInsetFromFront: event.target.checked ? activeModule.shelfPinInsetFromFront ?? CABINET_DEFAULT_SHELF_PIN_INSET_FROM_FRONT : undefined,
                            shelfPinStartHeight: event.target.checked ? activeModule.shelfPinStartHeight ?? CABINET_DEFAULT_SHELF_PIN_START_HEIGHT : undefined,
                          })
                        }
                      />
                      Adjustable shelf pins
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      <Field label="Row pairs">
                        <CabinetNumberField label="Row pairs" hideLabel compact testId="cabinet-input-shelf-pin-row-pairs" min={0} step={1} integer disabled={activeShelfSpacingLocked} disabledReason={activeShelfSpacingLocked ? "Unlock the shelf layout before editing shelf-pin rows." : undefined} {...detailedModuleNumberFieldProps("shelfPinRowPairCount", activeModule.shelfPinRowPairCount ?? 0)} />
                      </Field>
                      <Field label="Holes">
                        <CabinetNumberField label="Holes" hideLabel compact testId="cabinet-input-shelf-pin-holes" min={0} step={1} integer disabled={activeShelfSpacingLocked} disabledReason={activeShelfSpacingLocked ? "Unlock the shelf layout before editing shelf-pin holes." : undefined} {...detailedModuleNumberFieldProps("shelfPinHoleCount", activeModule.shelfPinHoleCount ?? 0)} />
                      </Field>
                      <Field label="Spacing">
                        <CabinetNumberField label="Spacing" hideLabel compact testId="cabinet-input-shelf-pin-spacing" min={0} step={1} unit="mm" disabled={activeShelfSpacingLocked} disabledReason={activeShelfSpacingLocked ? "Unlock the shelf layout before editing shelf-pin spacing." : undefined} {...detailedModuleNumberFieldProps("shelfPinHoleSpacing", activeModule.shelfPinHoleSpacing ?? 0)} />
                      </Field>
                      <Field label="Front inset">
                        <CabinetNumberField label="Front inset" hideLabel compact testId="cabinet-input-shelf-pin-inset" min={0} step={5} unit="mm" disabled={activeShelfSpacingLocked} disabledReason={activeShelfSpacingLocked ? "Unlock the shelf layout before editing the shelf-pin inset." : undefined} {...detailedModuleNumberFieldProps("shelfPinInsetFromFront", activeModule.shelfPinInsetFromFront ?? 0)} />
                      </Field>
                      <Field label="Start h">
                        <CabinetNumberField label="Start height" hideLabel compact testId="cabinet-input-shelf-pin-start-height" min={0} step={10} unit="mm" disabled={activeShelfSpacingLocked} disabledReason={activeShelfSpacingLocked ? "Unlock the shelf layout before editing the shelf-pin start height." : undefined} {...detailedModuleNumberFieldProps("shelfPinStartHeight", activeModule.shelfPinStartHeight ?? 0)} />
                      </Field>
                    </div>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="hamper"
                    visible={visibleModuleOptionGroupIds.has("hamper")}
                  >
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-hamper-pullout-enabled"
                        type="checkbox"
                        checked={hasCabinetHamperPullOut(activeModule)}
                        onChange={(event) =>
                          updateModule(activeModule.id, {
                            hamperPullOutEnabled: event.target.checked,
                            hamperBasketCount: event.target.checked ? activeModule.hamperBasketCount ?? CABINET_DEFAULT_HAMPER_BASKET_COUNT : undefined,
                            hamperBasketDepth: event.target.checked ? activeModule.hamperBasketDepth ?? CABINET_DEFAULT_HAMPER_BASKET_DEPTH : undefined,
                            hamperBasketHeight: event.target.checked ? activeModule.hamperBasketHeight ?? CABINET_DEFAULT_HAMPER_BASKET_HEIGHT : undefined,
                            hamperSlideClearance: event.target.checked ? activeModule.hamperSlideClearance ?? CABINET_DEFAULT_HAMPER_SLIDE_CLEARANCE : undefined,
                          })
                        }
                      />
                      Pull-out hamper
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      <Field label="Baskets">
                        <CabinetNumberField label="Baskets" hideLabel compact testId="cabinet-input-hamper-baskets" min={0} step={1} integer {...detailedModuleNumberFieldProps("hamperBasketCount", activeModule.hamperBasketCount ?? 0)} />
                      </Field>
                      <Field label="Depth">
                        <CabinetNumberField label="Depth" hideLabel compact testId="cabinet-input-hamper-basket-depth" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("hamperBasketDepth", activeModule.hamperBasketDepth ?? 0)} />
                      </Field>
                      <Field label="Height">
                        <CabinetNumberField label="Height" hideLabel compact testId="cabinet-input-hamper-basket-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("hamperBasketHeight", activeModule.hamperBasketHeight ?? 0)} />
                      </Field>
                      <Field label="Slide clr">
                        <CabinetNumberField label="Slide clearance" hideLabel compact testId="cabinet-input-hamper-slide-clearance" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("hamperSlideClearance", activeModule.hamperSlideClearance ?? 0)} />
                      </Field>
                    </div>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="slat"
                    visible={visibleModuleOptionGroupIds.has("slat")}
                  >
                  <div className="grid grid-cols-4 gap-2">
                    <Field label="Slats">
                      <CabinetNumberField label="Slats" hideLabel compact testId="cabinet-input-slats" min={0} step={1} integer {...detailedModuleNumberFieldProps("slatCount", activeModule.slatCount ?? 0)} />
                    </Field>
                    <Field label="Slat width">
                      <CabinetNumberField label="Slat width" hideLabel compact testId="cabinet-input-slat-width" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("slatWidth", activeModule.slatWidth ?? 0)} />
                    </Field>
                    <Field label="Slat depth">
                      <CabinetNumberField label="Slat depth" hideLabel compact testId="cabinet-input-slat-depth" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("slatDepth", activeModule.slatDepth ?? 0)} />
                    </Field>
                    <Field label="Slat gap">
                      <CabinetNumberField label="Slat gap" hideLabel compact testId="cabinet-input-slat-spacing" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("slatSpacing", activeModule.slatSpacing ?? 0)} />
                    </Field>
                  </div>
                  </CabinetModuleOptionGroup>
                  {definition.millworkAssemblyType === "wall_paneling" ? (
                    <div className="grid gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-neutral-800" data-testid="cabinet-wall-panel-pattern-preview">
                      <div>
                        <p className="text-xs font-semibold text-neutral-800">Panel pattern</p>
                        <p className="mt-1 text-[11px] text-neutral-500">
                          Start with a visual arrangement, then refine rows and columns numerically.
                        </p>
                      </div>
                      <div role="group" aria-label="Wall-panel pattern choices" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {([
                          [2, 1, "Two wide panels"],
                          [3, 1, "Three tall panels"],
                          [4, 1, "Four tall panels"],
                          [2, 2, "Two by two grid"],
                          [3, 2, "Three by two grid"],
                          [4, 2, "Four by two grid"],
                        ] as const).map(([columns, rows, label]) => {
                          const selected =
                            (activeModule.panelColumnCount ?? 1) === columns &&
                            (activeModule.panelRowCount ?? 1) === rows;
                          return (
                            <button
                              key={`${columns}x${rows}`}
                              type="button"
                              data-testid={`cabinet-wall-panel-pattern-${columns}x${rows}`}
                              aria-pressed={selected}
                              className={`grid gap-1 rounded-lg border p-2 text-left text-[10px] font-semibold transition ${selected ? "border-neutral-950 bg-white text-neutral-950 shadow-sm" : "border-neutral-200 bg-white/70 text-neutral-600 hover:border-neutral-400"}`}
                              onClick={() =>
                                updateModule(activeModule.id, {
                                  panelColumnCount: columns,
                                  panelRowCount: rows,
                                })
                              }
                            >
                              <CabinetWallPanelPatternPreview
                                columns={columns}
                                rows={rows}
                                className="h-14 w-full"
                              />
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  <CabinetModuleOptionGroup
                    id="panel"
                    visible={visibleModuleOptionGroupIds.has("panel")}
                  >
                  <div className="grid grid-cols-4 gap-2">
                    <Field label="Panel cols">
                      <CabinetNumberField label="Panel columns" hideLabel compact testId="cabinet-input-panel-columns" min={0} step={1} integer {...detailedModuleNumberFieldProps("panelColumnCount", activeModule.panelColumnCount ?? 0)} />
                    </Field>
                    <Field label="Panel rows">
                      <CabinetNumberField label="Panel rows" hideLabel compact testId="cabinet-input-panel-rows" min={0} step={1} integer {...detailedModuleNumberFieldProps("panelRowCount", activeModule.panelRowCount ?? 0)} />
                    </Field>
                    <Field label="Rail/stile">
                      <CabinetNumberField label="Rail and stile width" hideLabel compact testId="cabinet-input-panel-frame-width" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("panelFrameWidth", activeModule.panelFrameWidth ?? 0)} />
                    </Field>
                    <Field label="Frame depth">
                      <CabinetNumberField label="Frame depth" hideLabel compact testId="cabinet-input-panel-frame-depth" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("panelFrameDepth", activeModule.panelFrameDepth ?? 0)} />
                    </Field>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="ceiling"
                    visible={visibleModuleOptionGroupIds.has("ceiling")}
                  >
                  <div className="grid grid-cols-4 gap-2">
                    <Field label="Beams">
                      <CabinetNumberField label="Beams" hideLabel compact testId="cabinet-input-ceiling-beams" min={0} step={1} integer {...detailedModuleNumberFieldProps("ceilingBeamCount", activeModule.ceilingBeamCount ?? 0)} />
                    </Field>
                    <Field label="Beam width">
                      <CabinetNumberField label="Beam width" hideLabel compact testId="cabinet-input-ceiling-beam-width" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("ceilingBeamWidth", activeModule.ceilingBeamWidth ?? 0)} />
                    </Field>
                    <Field label="Beam depth">
                      <CabinetNumberField label="Beam depth" hideLabel compact testId="cabinet-input-ceiling-beam-depth" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("ceilingBeamDepth", activeModule.ceilingBeamDepth ?? 0)} />
                    </Field>
                    <Field label="Beam dir">
                      <select data-testid="cabinet-input-ceiling-beam-orientation" className={selectClass()} value={activeModule.ceilingBeamOrientation ?? "z"} onChange={(event) => updateModule(activeModule.id, { ceilingBeamOrientation: event.target.value as NonNullable<CabinetModuleDefinition["ceilingBeamOrientation"]> })}>
                        <option value="z">Z</option>
                        <option value="x">X</option>
                      </select>
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Coffer cols">
                      <CabinetNumberField label="Coffer columns" hideLabel compact testId="cabinet-input-ceiling-grid-columns" min={0} step={1} integer {...detailedModuleNumberFieldProps("ceilingGridColumnCount", activeModule.ceilingGridColumnCount ?? 0)} />
                    </Field>
                    <Field label="Coffer rows">
                      <CabinetNumberField label="Coffer rows" hideLabel compact testId="cabinet-input-ceiling-grid-rows" min={0} step={1} integer {...detailedModuleNumberFieldProps("ceilingGridRowCount", activeModule.ceilingGridRowCount ?? 0)} />
                    </Field>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="trim"
                    visible={visibleModuleOptionGroupIds.has("trim")}
                  >
                  <div className="grid grid-cols-4 gap-2">
                    <Field label="Trim pcs">
                      <CabinetNumberField label="Trim pieces" hideLabel compact testId="cabinet-input-trim-members" min={0} step={1} integer {...detailedModuleNumberFieldProps("trimMemberCount", activeModule.trimMemberCount ?? 0)} />
                    </Field>
                    <Field label="Trim width">
                      <CabinetNumberField label="Trim width" hideLabel compact testId="cabinet-input-trim-profile-width" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("trimProfileWidth", activeModule.trimProfileWidth ?? 0)} />
                    </Field>
                    <Field label="Trim depth">
                      <CabinetNumberField label="Trim depth" hideLabel compact testId="cabinet-input-trim-profile-depth" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("trimProfileDepth", activeModule.trimProfileDepth ?? 0)} />
                    </Field>
                    <Field label="Trim dir">
                      <select data-testid="cabinet-input-trim-orientation" className={selectClass()} value={activeModule.trimOrientation ?? "x"} onChange={(event) => updateModule(activeModule.id, { trimOrientation: event.target.value as NonNullable<CabinetModuleDefinition["trimOrientation"]> })}>
                        <option value="x">X</option>
                        <option value="z">Z</option>
                      </select>
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Trim type">
                      <select data-testid="cabinet-input-trim-placement" className={selectClass()} value={activeModule.trimPlacement ?? "generic_trim"} onChange={(event) => updateModule(activeModule.id, { trimPlacement: event.target.value as CabinetTrimPlacement })}>
                        {trimPlacements.map((placement) => <option key={placement} value={placement}>{labelize(placement)}</option>)}
                      </select>
                    </Field>
                    <Field label="Trim height">
                      <CabinetNumberField label="Trim height" hideLabel compact testId="cabinet-input-trim-setout-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("trimSetoutHeight", activeModule.trimSetoutHeight ?? 0)} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <Field label="Left end">
                      <select data-testid="cabinet-input-trim-left-end-treatment" className={selectClass()} value={activeModule.trimLeftEndTreatment ?? "butt"} onChange={(event) => updateModule(activeModule.id, { trimLeftEndTreatment: event.target.value as CabinetTrimEndTreatment })}>
                        {trimEndTreatments.map((treatment) => <option key={treatment} value={treatment}>{labelize(treatment)}</option>)}
                      </select>
                    </Field>
                    <Field label="Right end">
                      <select data-testid="cabinet-input-trim-right-end-treatment" className={selectClass()} value={activeModule.trimRightEndTreatment ?? "butt"} onChange={(event) => updateModule(activeModule.id, { trimRightEndTreatment: event.target.value as CabinetTrimEndTreatment })}>
                        {trimEndTreatments.map((treatment) => <option key={treatment} value={treatment}>{labelize(treatment)}</option>)}
                      </select>
                    </Field>
                    <Field label="Return d">
                      <CabinetNumberField label="Return depth" hideLabel compact testId="cabinet-input-trim-return-depth" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("trimReturnDepth", activeModule.trimReturnDepth ?? 0)} />
                    </Field>
                    <Field label="Miter deg">
                      <CabinetNumberField label="Miter angle" hideLabel compact testId="cabinet-input-trim-miter-angle" min={1} max={89} step={1} unit="°" {...detailedModuleNumberFieldProps("trimMiterAngle", activeModule.trimMiterAngle ?? 45)} />
                    </Field>
                  </div>
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-trim-reveal-strip-enabled"
                        type="checkbox"
                        checked={hasCabinetTrimRevealStrip(activeModule)}
                        onChange={(event) =>
                          updateModule(activeModule.id, {
                            trimRevealStripEnabled: event.target.checked,
                            trimRevealStripHeight: event.target.checked
                              ? activeModule.trimRevealStripHeight ?? CABINET_DEFAULT_TRIM_REVEAL_STRIP_HEIGHT
                              : undefined,
                            trimRevealStripDepth: event.target.checked
                              ? activeModule.trimRevealStripDepth ?? CABINET_DEFAULT_TRIM_REVEAL_STRIP_DEPTH
                              : undefined,
                            trimRevealStripInsetFromTop: event.target.checked
                              ? activeModule.trimRevealStripInsetFromTop ?? CABINET_DEFAULT_TRIM_REVEAL_STRIP_INSET_FROM_TOP
                              : undefined,
                          })
                        }
                      />
                      <span title="Trade term: trim reveal / backing strip">Shadow-gap backing strip</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Gap height">
                        <CabinetNumberField label="Shadow-gap height (reveal height)" hideLabel compact testId="cabinet-input-trim-reveal-strip-height" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("trimRevealStripHeight", activeModule.trimRevealStripHeight ?? 0)} />
                      </Field>
                      <Field label="Gap depth">
                        <CabinetNumberField label="Shadow-gap depth (reveal depth)" hideLabel compact testId="cabinet-input-trim-reveal-strip-depth" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("trimRevealStripDepth", activeModule.trimRevealStripDepth ?? 0)} />
                      </Field>
                      <Field label="Top inset">
                        <CabinetNumberField label="Top inset" hideLabel compact testId="cabinet-input-trim-reveal-strip-inset" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("trimRevealStripInsetFromTop", activeModule.trimRevealStripInsetFromTop ?? 0)} />
                      </Field>
                    </div>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="fireplace"
                    visible={visibleModuleOptionGroupIds.has("fireplace")}
                  >
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Opening W">
                      <CabinetNumberField label="Opening width" hideLabel compact testId="cabinet-input-fireplace-opening-width" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("fireplaceOpeningWidth", activeModule.fireplaceOpeningWidth ?? 0)} />
                    </Field>
                    <Field label="Opening H">
                      <CabinetNumberField label="Opening height" hideLabel compact testId="cabinet-input-fireplace-opening-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("fireplaceOpeningHeight", activeModule.fireplaceOpeningHeight ?? 0)} />
                    </Field>
                    <Field label="Leg width">
                      <CabinetNumberField label="Leg width" hideLabel compact testId="cabinet-input-fireplace-leg-width" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("fireplaceLegWidth", activeModule.fireplaceLegWidth ?? 0)} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Header H">
                      <CabinetNumberField label="Header height" hideLabel compact testId="cabinet-input-fireplace-header-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("fireplaceHeaderHeight", activeModule.fireplaceHeaderHeight ?? 0)} />
                    </Field>
                    <Field label="Mantel H">
                      <CabinetNumberField label="Mantel height" hideLabel compact testId="cabinet-input-fireplace-mantel-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("fireplaceMantelHeight", activeModule.fireplaceMantelHeight ?? 0)} />
                    </Field>
                    <Field label="Mantel D">
                      <CabinetNumberField label="Mantel depth" hideLabel compact testId="cabinet-input-fireplace-mantel-depth" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("fireplaceMantelDepth", activeModule.fireplaceMantelDepth ?? 0)} />
                    </Field>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="convertible"
                    visible={visibleModuleOptionGroupIds.has("convertible")}
                  >
                  <div className="grid grid-cols-4 gap-2">
                    <Field label="Panel thick">
                      <CabinetNumberField label="Panel thickness" hideLabel compact testId="cabinet-input-convertible-panel-thickness" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("convertiblePanelThickness", activeModule.convertiblePanelThickness ?? 0)} />
                    </Field>
                    <Field label="Panel height">
                      <CabinetNumberField label="Panel height" hideLabel compact testId="cabinet-input-convertible-panel-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("convertiblePanelHeight", activeModule.convertiblePanelHeight ?? 0)} />
                    </Field>
                    <Field label="Open depth">
                      <CabinetNumberField label="Open depth" hideLabel compact testId="cabinet-input-convertible-open-depth" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("convertibleOpenDepth", activeModule.convertibleOpenDepth ?? 0)} />
                    </Field>
                    <Field label="Hinge H">
                      <CabinetNumberField label="Hinge height" hideLabel compact testId="cabinet-input-convertible-hinge-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("convertibleHingeHeight", activeModule.convertibleHingeHeight ?? 0)} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Legs">
                      <CabinetNumberField label="Legs" hideLabel compact testId="cabinet-input-convertible-support-legs" min={0} step={1} integer {...detailedModuleNumberFieldProps("convertibleSupportLegCount", activeModule.convertibleSupportLegCount ?? 0)} />
                    </Field>
                    <Field label="Leg width">
                      <CabinetNumberField label="Leg width" hideLabel compact testId="cabinet-input-convertible-support-leg-width" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("convertibleSupportLegWidth", activeModule.convertibleSupportLegWidth ?? 0)} />
                    </Field>
                    <Field label="Leg depth">
                      <CabinetNumberField label="Leg depth" hideLabel compact testId="cabinet-input-convertible-support-leg-depth" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("convertibleSupportLegDepth", activeModule.convertibleSupportLegDepth ?? 0)} />
                    </Field>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="platform_bed"
                    visible={visibleModuleOptionGroupIds.has("platform_bed")}
                  >
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Deck thick">
                      <CabinetNumberField label="Deck thickness" hideLabel compact testId="cabinet-input-platform-deck-thickness" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("platformDeckThickness", activeModule.platformDeckThickness ?? 0)} />
                    </Field>
                    <Field label="Front ovh">
                      <CabinetNumberField label="Front overhang" hideLabel compact testId="cabinet-input-platform-deck-overhang-front" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("platformDeckOverhangFront", activeModule.platformDeckOverhangFront ?? 0)} />
                    </Field>
                    <Field label="Back ovh">
                      <CabinetNumberField label="Back overhang" hideLabel compact testId="cabinet-input-platform-deck-overhang-back" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("platformDeckOverhangBack", activeModule.platformDeckOverhangBack ?? 0)} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Deck ribs">
                      <CabinetNumberField label="Deck ribs" hideLabel compact testId="cabinet-input-platform-support-ribs" min={0} step={1} integer {...detailedModuleNumberFieldProps("platformSupportRibCount", activeModule.platformSupportRibCount ?? 0)} />
                    </Field>
                    <Field label="Rib width">
                      <CabinetNumberField label="Rib width" hideLabel compact testId="cabinet-input-platform-support-rib-width" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("platformSupportRibWidth", activeModule.platformSupportRibWidth ?? 0)} />
                    </Field>
                    <Field label="Rib height">
                      <CabinetNumberField label="Rib height" hideLabel compact testId="cabinet-input-platform-support-rib-height" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("platformSupportRibHeight", activeModule.platformSupportRibHeight ?? 0)} />
                    </Field>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="stair"
                    visible={visibleModuleOptionGroupIds.has("stair")}
                  >
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Stair steps">
                      <CabinetNumberField label="Stair steps" hideLabel compact testId="cabinet-input-stair-scribe-steps" min={0} step={1} integer {...detailedModuleNumberFieldProps("stairScribeStepCount", activeModule.stairScribeStepCount ?? 0)} />
                    </Field>
                    <Field label="Stair high">
                      <CabinetNumberField label="Stair high point" hideLabel compact testId="cabinet-input-stair-scribe-high-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("stairScribeHighHeight", activeModule.stairScribeHighHeight ?? 0)} />
                    </Field>
                    <Field label="Stair low">
                      <CabinetNumberField label="Stair low point" hideLabel compact testId="cabinet-input-stair-scribe-low-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("stairScribeLowHeight", activeModule.stairScribeLowHeight ?? 0)} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Wall-fit depth">
                      <CabinetNumberField label="Wall-fit depth (scribe depth)" hideLabel compact testId="cabinet-input-stair-scribe-depth" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("stairScribeDepth", activeModule.stairScribeDepth ?? 0)} />
                    </Field>
                    <Field label="Stair dir">
                      <select data-testid="cabinet-input-stair-scribe-direction" className={selectClass()} value={activeModule.stairScribeDirection ?? "rises_left"} onChange={(event) => updateModule(activeModule.id, { stairScribeDirection: event.target.value as CabinetStairScribeDirection })}>
                        {stairScribeDirections.map((direction) => <option key={direction} value={direction}>{labelize(direction)}</option>)}
                      </select>
                    </Field>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="room_divider"
                    visible={visibleModuleOptionGroupIds.has("room_divider")}
                  >
                  <label className="flex min-h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-700">
                    <input
                      data-testid="cabinet-input-room-divider-finished-back"
                      type="checkbox"
                      checked={Boolean(activeModule.roomDividerFinishedBack)}
                      onChange={(event) => updateModule(activeModule.id, { roomDividerFinishedBack: event.target.checked })}
                    />
                    Finished back
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Rear panels">
                      <CabinetNumberField label="Rear panels" hideLabel compact testId="cabinet-input-room-divider-back-panels" min={0} step={1} integer {...detailedModuleNumberFieldProps("roomDividerBackPanelCount", activeModule.roomDividerBackPanelCount ?? 0)} />
                    </Field>
                    <Field label="Rear thick">
                      <CabinetNumberField label="Rear thickness" hideLabel compact testId="cabinet-input-room-divider-back-panel-thickness" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("roomDividerBackPanelThickness", activeModule.roomDividerBackPanelThickness ?? 0)} />
                    </Field>
                    <Field label="Feet">
                      <CabinetNumberField label="Feet" hideLabel compact testId="cabinet-input-room-divider-stabilizer-feet" min={0} step={1} integer {...detailedModuleNumberFieldProps("roomDividerStabilizerFootCount", activeModule.roomDividerStabilizerFootCount ?? 0)} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Foot width">
                      <CabinetNumberField label="Foot width" hideLabel compact testId="cabinet-input-room-divider-stabilizer-foot-width" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("roomDividerStabilizerFootWidth", activeModule.roomDividerStabilizerFootWidth ?? 0)} />
                    </Field>
                    <Field label="Foot height">
                      <CabinetNumberField label="Foot height" hideLabel compact testId="cabinet-input-room-divider-stabilizer-foot-height" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("roomDividerStabilizerFootHeight", activeModule.roomDividerStabilizerFootHeight ?? 0)} />
                    </Field>
                    <Field label="Foot depth">
                      <CabinetNumberField label="Foot depth" hideLabel compact testId="cabinet-input-room-divider-stabilizer-foot-depth" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("roomDividerStabilizerFootDepth", activeModule.roomDividerStabilizerFootDepth ?? 0)} />
                    </Field>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="lifestyle"
                    visible={visibleModuleOptionGroupIds.has("lifestyle")}
                  >
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Insert kind">
                      <select data-testid="cabinet-input-lifestyle-insert-kind" className={selectClass()} value={activeModule.lifestyleInsertKind ?? "toy_bin"} onChange={(event) => updateModule(activeModule.id, { lifestyleInsertKind: event.target.value as CabinetLifestyleInsertKind })}>
                        {lifestyleInsertKinds.map((kind) => <option key={kind} value={kind}>{labelize(kind)}</option>)}
                      </select>
                    </Field>
                    <Field label="Inserts">
                      <CabinetNumberField label="Inserts" hideLabel compact testId="cabinet-input-lifestyle-insert-count" min={0} step={1} integer {...detailedModuleNumberFieldProps("lifestyleInsertCount", activeModule.lifestyleInsertCount ?? 0)} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Insert depth">
                      <CabinetNumberField label="Insert depth" hideLabel compact testId="cabinet-input-lifestyle-insert-depth" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("lifestyleInsertDepth", activeModule.lifestyleInsertDepth ?? 0)} />
                    </Field>
                    <Field label="Deck height">
                      <CabinetNumberField label="Deck height" hideLabel compact testId="cabinet-input-lifestyle-insert-deck-height" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("lifestyleInsertDeckHeight", activeModule.lifestyleInsertDeckHeight ?? 0)} />
                    </Field>
                    <Field label="Lip height">
                      <CabinetNumberField label="Lip height" hideLabel compact testId="cabinet-input-lifestyle-insert-lip-height" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("lifestyleInsertLipHeight", activeModule.lifestyleInsertLipHeight ?? 0)} />
                    </Field>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="pantry"
                    visible={visibleModuleOptionGroupIds.has("pantry")}
                  >
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-pantry-pullouts-enabled"
                        type="checkbox"
                        checked={Boolean(activeModule.pantryPullOutTrayEnabled)}
                        onChange={(event) =>
                          updateModule(activeModule.id, {
                            pantryPullOutTrayEnabled: event.target.checked,
                            pantryPullOutTrayCount: event.target.checked
                              ? activeModule.pantryPullOutTrayCount ?? CABINET_DEFAULT_PANTRY_PULL_OUT_TRAY_COUNT
                              : undefined,
                            pantryPullOutTrayDepth: event.target.checked
                              ? activeModule.pantryPullOutTrayDepth ?? CABINET_DEFAULT_PANTRY_PULL_OUT_TRAY_DEPTH
                              : undefined,
                            pantryPullOutTrayFrontHeight: event.target.checked
                              ? activeModule.pantryPullOutTrayFrontHeight ?? CABINET_DEFAULT_PANTRY_PULL_OUT_TRAY_FRONT_HEIGHT
                              : undefined,
                            pantryPullOutSlideClearance: event.target.checked
                              ? activeModule.pantryPullOutSlideClearance ?? CABINET_DEFAULT_PANTRY_PULL_OUT_SLIDE_CLEARANCE
                              : undefined,
                          })
                        }
                      />
                      Pantry pull-outs
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      <Field label="Trays">
                        <CabinetNumberField label="Trays" hideLabel compact testId="cabinet-input-pantry-pullout-trays" min={0} step={1} integer {...detailedModuleNumberFieldProps("pantryPullOutTrayCount", activeModule.pantryPullOutTrayCount ?? 0)} />
                      </Field>
                      <Field label="Tray D">
                        <CabinetNumberField label="Tray depth" hideLabel compact testId="cabinet-input-pantry-pullout-tray-depth" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("pantryPullOutTrayDepth", activeModule.pantryPullOutTrayDepth ?? 0)} />
                      </Field>
                      <Field label="Front H">
                        <CabinetNumberField label="Front height" hideLabel compact testId="cabinet-input-pantry-pullout-front-height" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("pantryPullOutTrayFrontHeight", activeModule.pantryPullOutTrayFrontHeight ?? 0)} />
                      </Field>
                      <Field label="Slide clr">
                        <CabinetNumberField label="Slide clearance" hideLabel compact testId="cabinet-input-pantry-pullout-slide-clearance" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("pantryPullOutSlideClearance", activeModule.pantryPullOutSlideClearance ?? 0)} />
                      </Field>
                    </div>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="wine"
                    visible={visibleModuleOptionGroupIds.has("wine")}
                  >
                  <div className="grid grid-cols-4 gap-2">
                    <Field label="Wine cols">
                      <CabinetNumberField label="Wine columns" hideLabel compact testId="cabinet-input-wine-rack-columns" min={0} step={1} integer {...detailedModuleNumberFieldProps("wineRackColumnCount", activeModule.wineRackColumnCount ?? 0)} />
                    </Field>
                    <Field label="Wine rows">
                      <CabinetNumberField label="Wine rows" hideLabel compact testId="cabinet-input-wine-rack-rows" min={0} step={1} integer {...detailedModuleNumberFieldProps("wineRackRowCount", activeModule.wineRackRowCount ?? 0)} />
                    </Field>
                    <Field label="Rack depth">
                      <CabinetNumberField label="Rack depth" hideLabel compact testId="cabinet-input-wine-rack-depth" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("wineRackDepth", activeModule.wineRackDepth ?? 0)} />
                    </Field>
                    <Field label="Rack thick">
                      <CabinetNumberField label="Rack thickness" hideLabel compact testId="cabinet-input-wine-rack-divider-thickness" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("wineRackDividerThickness", activeModule.wineRackDividerThickness ?? 0)} />
                    </Field>
                  </div>
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-stemware-rack-enabled"
                        type="checkbox"
                        checked={hasCabinetStemwareRack(activeModule)}
                        onChange={(event) =>
                          updateModule(activeModule.id, {
                            stemwareRackEnabled: event.target.checked,
                            stemwareRackLaneCount: event.target.checked ? activeModule.stemwareRackLaneCount ?? CABINET_DEFAULT_STEMWARE_RACK_LANE_COUNT : undefined,
                            stemwareRackDepth: event.target.checked ? activeModule.stemwareRackDepth ?? CABINET_DEFAULT_STEMWARE_RACK_DEPTH : undefined,
                            stemwareRackRailWidth: event.target.checked ? activeModule.stemwareRackRailWidth ?? CABINET_DEFAULT_STEMWARE_RACK_RAIL_WIDTH : undefined,
                            stemwareRackLaneSpacing: event.target.checked ? activeModule.stemwareRackLaneSpacing ?? CABINET_DEFAULT_STEMWARE_RACK_LANE_SPACING : undefined,
                            stemwareRackMountHeight: event.target.checked ? activeModule.stemwareRackMountHeight ?? CABINET_DEFAULT_STEMWARE_RACK_MOUNT_HEIGHT : undefined,
                          })
                        }
                      />
                      Stemware rack
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      <Field label="Lanes">
                        <CabinetNumberField label="Lanes" hideLabel compact testId="cabinet-input-stemware-rack-lanes" min={0} step={1} integer {...detailedModuleNumberFieldProps("stemwareRackLaneCount", activeModule.stemwareRackLaneCount ?? 0)} />
                      </Field>
                      <Field label="Rack D">
                        <CabinetNumberField label="Rack depth" hideLabel compact testId="cabinet-input-stemware-rack-depth" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("stemwareRackDepth", activeModule.stemwareRackDepth ?? 0)} />
                      </Field>
                      <Field label="Rail W">
                        <CabinetNumberField label="Rail width" hideLabel compact testId="cabinet-input-stemware-rack-rail-width" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("stemwareRackRailWidth", activeModule.stemwareRackRailWidth ?? 0)} />
                      </Field>
                      <Field label="Lane gap">
                        <CabinetNumberField label="Lane gap" hideLabel compact testId="cabinet-input-stemware-rack-lane-spacing" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("stemwareRackLaneSpacing", activeModule.stemwareRackLaneSpacing ?? 0)} />
                      </Field>
                      <Field label="Mount H">
                        <CabinetNumberField label="Mount height" hideLabel compact testId="cabinet-input-stemware-rack-mount-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("stemwareRackMountHeight", activeModule.stemwareRackMountHeight ?? 0)} />
                      </Field>
                    </div>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="seating"
                    visible={visibleModuleOptionGroupIds.has("seating")}
                  >
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Seat deck">
                      <CabinetNumberField label="Seat deck" hideLabel compact testId="cabinet-input-seat-deck-thickness" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("seatDeckThickness", activeModule.seatDeckThickness ?? 0)} />
                    </Field>
                    <Field label="Cushion H">
                      <CabinetNumberField label="Cushion height" hideLabel compact testId="cabinet-input-seat-cushion-thickness" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("seatCushionThickness", activeModule.seatCushionThickness ?? 0)} />
                    </Field>
                    <Field label="Cushion D">
                      <CabinetNumberField label="Cushion depth" hideLabel compact testId="cabinet-input-seat-cushion-depth" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("seatCushionDepth", activeModule.seatCushionDepth ?? 0)} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Seat ovh">
                      <CabinetNumberField label="Seat overhang" hideLabel compact testId="cabinet-input-seat-cushion-overhang-front" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("seatCushionOverhangFront", activeModule.seatCushionOverhangFront ?? 0)} />
                    </Field>
                    <Field label="Back H">
                      <CabinetNumberField label="Back height" hideLabel compact testId="cabinet-input-seat-back-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("seatBackHeight", activeModule.seatBackHeight ?? 0)} />
                    </Field>
                    <Field label="Back thick">
                      <CabinetNumberField label="Back thickness" hideLabel compact testId="cabinet-input-seat-back-thickness" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("seatBackThickness", activeModule.seatBackThickness ?? 0)} />
                    </Field>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="mudroom"
                    visible={visibleModuleOptionGroupIds.has("mudroom")}
                  >
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Hooks">
                      <CabinetNumberField label="Hooks" hideLabel compact testId="cabinet-input-mudroom-hooks" min={0} step={1} integer {...detailedModuleNumberFieldProps("mudroomHookCount", activeModule.mudroomHookCount ?? 0)} />
                    </Field>
                    <Field label="Hook H">
                      <CabinetNumberField label="Hook rail height" hideLabel compact testId="cabinet-input-mudroom-hook-rail-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("mudroomHookRailHeight", activeModule.mudroomHookRailHeight ?? 0)} />
                    </Field>
                    <Field label="Hook proj">
                      <CabinetNumberField label="Hook projection" hideLabel compact testId="cabinet-input-mudroom-hook-projection" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("mudroomHookProjection", activeModule.mudroomHookProjection ?? 0)} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <Field label="Shoe cubbies">
                      <CabinetNumberField label="Shoe cubbies" hideLabel compact testId="cabinet-input-shoe-cubbies" min={0} step={1} integer {...detailedModuleNumberFieldProps("shoeCubbyCount", activeModule.shoeCubbyCount ?? 0)} />
                    </Field>
                    <Field label="Cubby H">
                      <CabinetNumberField label="Cubby height" hideLabel compact testId="cabinet-input-shoe-cubby-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("shoeCubbyHeight", activeModule.shoeCubbyHeight ?? 0)} />
                    </Field>
                    <Field label="Cubby D">
                      <CabinetNumberField label="Cubby depth" hideLabel compact testId="cabinet-input-shoe-cubby-depth" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("shoeCubbyDepth", activeModule.shoeCubbyDepth ?? 0)} />
                    </Field>
                    <Field label="Cubby thick">
                      <CabinetNumberField label="Cubby thickness" hideLabel compact testId="cabinet-input-shoe-cubby-divider-thickness" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("shoeCubbyDividerThickness", activeModule.shoeCubbyDividerThickness ?? 0)} />
                    </Field>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="sink"
                    visible={visibleModuleOptionGroupIds.has("sink")}
                  >
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-sink-cutout-enabled"
                        type="checkbox"
                        checked={Boolean(activeModule.sinkCutoutEnabled)}
                        onChange={(event) =>
                          updateModule(activeModule.id, {
                            sinkCutoutEnabled: event.target.checked,
                            sinkCutoutWidth: event.target.checked ? activeModule.sinkCutoutWidth ?? CABINET_DEFAULT_SINK_CUTOUT_WIDTH : undefined,
                            sinkCutoutDepth: event.target.checked ? activeModule.sinkCutoutDepth ?? CABINET_DEFAULT_SINK_CUTOUT_DEPTH : undefined,
                            sinkCutoutOffsetX: event.target.checked ? activeModule.sinkCutoutOffsetX ?? CABINET_DEFAULT_SINK_CUTOUT_OFFSET_X : undefined,
                            sinkCutoutOffsetZ: event.target.checked ? activeModule.sinkCutoutOffsetZ ?? CABINET_DEFAULT_SINK_CUTOUT_OFFSET_Z : undefined,
                            plumbingChaseWidth: event.target.checked ? activeModule.plumbingChaseWidth ?? CABINET_DEFAULT_PLUMBING_CHASE_WIDTH : undefined,
                            plumbingChaseHeight: event.target.checked ? activeModule.plumbingChaseHeight ?? CABINET_DEFAULT_PLUMBING_CHASE_HEIGHT : undefined,
                            plumbingChaseDepth: event.target.checked ? activeModule.plumbingChaseDepth ?? CABINET_DEFAULT_PLUMBING_CHASE_DEPTH : undefined,
                          })
                        }
                      />
                      Sink service zone
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      <Field label="Sink W">
                        <CabinetNumberField label="Sink width" hideLabel compact testId="cabinet-input-sink-cutout-width" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("sinkCutoutWidth", activeModule.sinkCutoutWidth ?? 0)} />
                      </Field>
                      <Field label="Sink D">
                        <CabinetNumberField label="Sink depth" hideLabel compact testId="cabinet-input-sink-cutout-depth" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("sinkCutoutDepth", activeModule.sinkCutoutDepth ?? 0)} />
                      </Field>
                      <Field label="Sink X">
                        <CabinetNumberField label="Sink horizontal offset" hideLabel compact testId="cabinet-input-sink-cutout-offset-x" step={10} unit="mm" {...detailedModuleNumberFieldProps("sinkCutoutOffsetX", activeModule.sinkCutoutOffsetX ?? 0)} />
                      </Field>
                      <Field label="Sink Z">
                        <CabinetNumberField label="Sink depth offset" hideLabel compact testId="cabinet-input-sink-cutout-offset-z" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("sinkCutoutOffsetZ", activeModule.sinkCutoutOffsetZ ?? 0)} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Chase W">
                        <CabinetNumberField label="Chase width" hideLabel compact testId="cabinet-input-plumbing-chase-width" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("plumbingChaseWidth", activeModule.plumbingChaseWidth ?? 0)} />
                      </Field>
                      <Field label="Chase H">
                        <CabinetNumberField label="Chase height" hideLabel compact testId="cabinet-input-plumbing-chase-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("plumbingChaseHeight", activeModule.plumbingChaseHeight ?? 0)} />
                      </Field>
                      <Field label="Chase D">
                        <CabinetNumberField label="Chase depth" hideLabel compact testId="cabinet-input-plumbing-chase-depth" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("plumbingChaseDepth", activeModule.plumbingChaseDepth ?? 0)} />
                      </Field>
                    </div>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="laundry"
                    visible={visibleModuleOptionGroupIds.has("laundry")}
                  >
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-laundry-appliance-bay-enabled"
                        type="checkbox"
                        checked={Boolean(activeModule.laundryApplianceBayEnabled)}
                        onChange={(event) =>
                          updateModule(activeModule.id, {
                            laundryApplianceBayEnabled: event.target.checked,
                            laundryApplianceKind: event.target.checked ? activeModule.laundryApplianceKind ?? CABINET_DEFAULT_LAUNDRY_APPLIANCE_KIND : undefined,
                            laundryApplianceCount: event.target.checked ? activeModule.laundryApplianceCount ?? CABINET_DEFAULT_LAUNDRY_APPLIANCE_COUNT : undefined,
                            laundryApplianceWidth: event.target.checked ? activeModule.laundryApplianceWidth ?? CABINET_DEFAULT_LAUNDRY_APPLIANCE_WIDTH : undefined,
                            laundryApplianceHeight: event.target.checked ? activeModule.laundryApplianceHeight ?? CABINET_DEFAULT_LAUNDRY_APPLIANCE_HEIGHT : undefined,
                            laundryApplianceDepth: event.target.checked ? activeModule.laundryApplianceDepth ?? CABINET_DEFAULT_LAUNDRY_APPLIANCE_DEPTH : undefined,
                            laundryApplianceSideClearance: event.target.checked ? activeModule.laundryApplianceSideClearance ?? CABINET_DEFAULT_LAUNDRY_APPLIANCE_SIDE_CLEARANCE : undefined,
                            laundryApplianceTopClearance: event.target.checked ? activeModule.laundryApplianceTopClearance ?? CABINET_DEFAULT_LAUNDRY_APPLIANCE_TOP_CLEARANCE : undefined,
                            laundryApplianceBackClearance: event.target.checked ? activeModule.laundryApplianceBackClearance ?? CABINET_DEFAULT_LAUNDRY_APPLIANCE_BACK_CLEARANCE : undefined,
                            laundryUtilityChaseHeight: event.target.checked ? activeModule.laundryUtilityChaseHeight ?? CABINET_DEFAULT_LAUNDRY_UTILITY_CHASE_HEIGHT : undefined,
                            laundryUtilityChaseDepth: event.target.checked ? activeModule.laundryUtilityChaseDepth ?? CABINET_DEFAULT_LAUNDRY_UTILITY_CHASE_DEPTH : undefined,
                          })
                        }
                      />
                      Laundry appliance bay
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      <Field label="Appliance">
                        <select data-testid="cabinet-input-laundry-appliance-kind" className={selectClass()} value={activeModule.laundryApplianceKind ?? CABINET_DEFAULT_LAUNDRY_APPLIANCE_KIND} onChange={(event) => updateModule(activeModule.id, { laundryApplianceKind: event.target.value as CabinetLaundryApplianceKind })}>
                          {laundryApplianceKinds.map((kind) => <option key={kind} value={kind}>{labelize(kind)}</option>)}
                        </select>
                      </Field>
                      <Field label="Count">
                        <CabinetNumberField label="Appliance count" hideLabel compact testId="cabinet-input-laundry-appliances" min={0} step={1} integer {...detailedModuleNumberFieldProps("laundryApplianceCount", activeModule.laundryApplianceCount ?? 0)} />
                      </Field>
                      <Field label="App W">
                        <CabinetNumberField label="Appliance width" hideLabel compact testId="cabinet-input-laundry-appliance-width" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("laundryApplianceWidth", activeModule.laundryApplianceWidth ?? 0)} />
                      </Field>
                      <Field label="App H">
                        <CabinetNumberField label="Appliance height" hideLabel compact testId="cabinet-input-laundry-appliance-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("laundryApplianceHeight", activeModule.laundryApplianceHeight ?? 0)} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <Field label="App D">
                        <CabinetNumberField label="Appliance depth" hideLabel compact testId="cabinet-input-laundry-appliance-depth" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("laundryApplianceDepth", activeModule.laundryApplianceDepth ?? 0)} />
                      </Field>
                      <Field label="Side clr">
                        <CabinetNumberField label="Appliance side clearance" hideLabel compact testId="cabinet-input-laundry-appliance-side-clearance" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("laundryApplianceSideClearance", activeModule.laundryApplianceSideClearance ?? 0)} />
                      </Field>
                      <Field label="Top clr">
                        <CabinetNumberField label="Appliance top clearance" hideLabel compact testId="cabinet-input-laundry-appliance-top-clearance" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("laundryApplianceTopClearance", activeModule.laundryApplianceTopClearance ?? 0)} />
                      </Field>
                      <Field label="Back clr">
                        <CabinetNumberField label="Appliance back clearance" hideLabel compact testId="cabinet-input-laundry-appliance-back-clearance" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("laundryApplianceBackClearance", activeModule.laundryApplianceBackClearance ?? 0)} />
                      </Field>
                    </div>
                    {Boolean(activeModule.laundryApplianceBayEnabled) ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Utility H">
                        <CabinetNumberField label="Laundry utility chase height" hideLabel compact testId="cabinet-input-laundry-utility-chase-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("laundryUtilityChaseHeight", activeModule.laundryUtilityChaseHeight ?? 0)} />
                      </Field>
                      <Field label="Utility D">
                        <CabinetNumberField label="Laundry utility chase depth" hideLabel compact testId="cabinet-input-laundry-utility-chase-depth" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("laundryUtilityChaseDepth", activeModule.laundryUtilityChaseDepth ?? 0)} />
                      </Field>
                    </div>
                    ) : (
                      <p className="text-[11px] leading-5 text-neutral-500">Enable the laundry appliance bay to edit utility chase dimensions.</p>
                    )}
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="office"
                    visible={visibleModuleOptionGroupIds.has("office")}
                  >
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-office-worksurface-enabled"
                        type="checkbox"
                        checked={Boolean(activeModule.officeWorksurfaceEnabled)}
                        onChange={(event) =>
                          updateModule(activeModule.id, {
                            officeWorksurfaceEnabled: event.target.checked,
                            officeWorksurfaceThickness: event.target.checked ? activeModule.officeWorksurfaceThickness ?? CABINET_DEFAULT_OFFICE_WORKSURFACE_THICKNESS : undefined,
                            officeWorksurfaceDepth: event.target.checked ? activeModule.officeWorksurfaceDepth ?? CABINET_DEFAULT_OFFICE_WORKSURFACE_DEPTH : undefined,
                            officeWorksurfaceOverhangFront: event.target.checked ? activeModule.officeWorksurfaceOverhangFront ?? CABINET_DEFAULT_OFFICE_WORKSURFACE_OVERHANG_FRONT : undefined,
                            cableGrommetCount: event.target.checked ? activeModule.cableGrommetCount ?? CABINET_DEFAULT_CABLE_GROMMET_COUNT : undefined,
                            cableGrommetDiameter: event.target.checked ? activeModule.cableGrommetDiameter ?? CABINET_DEFAULT_CABLE_GROMMET_DIAMETER : undefined,
                            cableGrommetOffsetFromBack: event.target.checked ? activeModule.cableGrommetOffsetFromBack ?? CABINET_DEFAULT_CABLE_GROMMET_OFFSET_FROM_BACK : undefined,
                            deskPowerChaseHeight: event.target.checked ? activeModule.deskPowerChaseHeight ?? CABINET_DEFAULT_DESK_POWER_CHASE_HEIGHT : undefined,
                            deskPowerChaseDepth: event.target.checked ? activeModule.deskPowerChaseDepth ?? CABINET_DEFAULT_DESK_POWER_CHASE_DEPTH : undefined,
                          })
                        }
                      />
                      Office workstation
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Surface thick">
                        <CabinetNumberField label="Office worksurface thickness" hideLabel compact testId="cabinet-input-office-worksurface-thickness" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("officeWorksurfaceThickness", activeModule.officeWorksurfaceThickness ?? 0)} />
                      </Field>
                      <Field label="Surface D">
                        <CabinetNumberField label="Office worksurface depth" hideLabel compact testId="cabinet-input-office-worksurface-depth" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("officeWorksurfaceDepth", activeModule.officeWorksurfaceDepth ?? 0)} />
                      </Field>
                      <Field label="Front ovh">
                        <CabinetNumberField label="Office worksurface front overhang" hideLabel compact testId="cabinet-input-office-worksurface-overhang-front" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("officeWorksurfaceOverhangFront", activeModule.officeWorksurfaceOverhangFront ?? 0)} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Grommets">
                        <CabinetNumberField label="Cable grommet count" hideLabel compact testId="cabinet-input-cable-grommets" min={0} step={1} integer {...detailedModuleNumberFieldProps("cableGrommetCount", activeModule.cableGrommetCount ?? 0)} />
                      </Field>
                      <Field label="Grommet dia">
                        <CabinetNumberField label="Cable grommet diameter" hideLabel compact testId="cabinet-input-cable-grommet-diameter" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("cableGrommetDiameter", activeModule.cableGrommetDiameter ?? 0)} />
                      </Field>
                      <Field label="Back offset">
                        <CabinetNumberField label="Cable grommet offset from back" hideLabel compact testId="cabinet-input-cable-grommet-offset-from-back" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("cableGrommetOffsetFromBack", activeModule.cableGrommetOffsetFromBack ?? 0)} />
                      </Field>
                    </div>
                    {Boolean(activeModule.officeWorksurfaceEnabled) ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Power H">
                        <CabinetNumberField label="Desk power chase height" hideLabel compact testId="cabinet-input-desk-power-chase-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("deskPowerChaseHeight", activeModule.deskPowerChaseHeight ?? 0)} />
                      </Field>
                      <Field label="Power D">
                        <CabinetNumberField label="Desk power chase depth" hideLabel compact testId="cabinet-input-desk-power-chase-depth" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("deskPowerChaseDepth", activeModule.deskPowerChaseDepth ?? 0)} />
                      </Field>
                    </div>
                    ) : (
                      <p className="text-[11px] leading-5 text-neutral-500">Enable the office workstation to edit power chase dimensions.</p>
                    )}
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="media"
                    visible={visibleModuleOptionGroupIds.has("media")}
                  >
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-media-wall-enabled"
                        type="checkbox"
                        checked={hasCabinetMediaWallDetails(activeModule)}
                        onChange={(event) =>
                          updateModule(activeModule.id, {
                            mediaWallEnabled: event.target.checked,
                            mediaTvOpeningWidth: event.target.checked ? activeModule.mediaTvOpeningWidth ?? CABINET_DEFAULT_MEDIA_TV_OPENING_WIDTH : undefined,
                            mediaTvOpeningHeight: event.target.checked ? activeModule.mediaTvOpeningHeight ?? CABINET_DEFAULT_MEDIA_TV_OPENING_HEIGHT : undefined,
                            mediaTvMountHeight: event.target.checked ? activeModule.mediaTvMountHeight ?? CABINET_DEFAULT_MEDIA_TV_MOUNT_HEIGHT : undefined,
                            mediaTvBlockingThickness: event.target.checked ? activeModule.mediaTvBlockingThickness ?? CABINET_DEFAULT_MEDIA_TV_BLOCKING_THICKNESS : undefined,
                            mediaCableChaseWidth: event.target.checked ? activeModule.mediaCableChaseWidth ?? CABINET_DEFAULT_MEDIA_CABLE_CHASE_WIDTH : undefined,
                            mediaCableChaseHeight: event.target.checked ? activeModule.mediaCableChaseHeight ?? CABINET_DEFAULT_MEDIA_CABLE_CHASE_HEIGHT : undefined,
                            mediaCableChaseDepth: event.target.checked ? activeModule.mediaCableChaseDepth ?? CABINET_DEFAULT_MEDIA_CABLE_CHASE_DEPTH : undefined,
                            mediaVentSlotCount: event.target.checked ? activeModule.mediaVentSlotCount ?? CABINET_DEFAULT_MEDIA_VENT_SLOT_COUNT : undefined,
                            mediaVentSlotWidth: event.target.checked ? activeModule.mediaVentSlotWidth ?? CABINET_DEFAULT_MEDIA_VENT_SLOT_WIDTH : undefined,
                            mediaVentSlotHeight: event.target.checked ? activeModule.mediaVentSlotHeight ?? CABINET_DEFAULT_MEDIA_VENT_SLOT_HEIGHT : undefined,
                            mediaVentSlotSpacing: event.target.checked ? activeModule.mediaVentSlotSpacing ?? CABINET_DEFAULT_MEDIA_VENT_SLOT_SPACING : undefined,
                          })
                        }
                      />
                      Media wall service zone
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      <Field label="TV W">
                        <CabinetNumberField label="Media TV opening width" hideLabel compact testId="cabinet-input-media-tv-opening-width" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("mediaTvOpeningWidth", activeModule.mediaTvOpeningWidth ?? 0)} />
                      </Field>
                      <Field label="TV H">
                        <CabinetNumberField label="Media TV opening height" hideLabel compact testId="cabinet-input-media-tv-opening-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("mediaTvOpeningHeight", activeModule.mediaTvOpeningHeight ?? 0)} />
                      </Field>
                      <Field label="Mount H">
                        <CabinetNumberField label="Media TV mount height" hideLabel compact testId="cabinet-input-media-tv-mount-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("mediaTvMountHeight", activeModule.mediaTvMountHeight ?? 0)} />
                      </Field>
                      <Field label="Block thick">
                        <CabinetNumberField label="Media TV blocking thickness" hideLabel compact testId="cabinet-input-media-tv-blocking-thickness" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("mediaTvBlockingThickness", activeModule.mediaTvBlockingThickness ?? 0)} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Chase W">
                        <CabinetNumberField label="Media cable chase width" hideLabel compact testId="cabinet-input-media-cable-chase-width" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("mediaCableChaseWidth", activeModule.mediaCableChaseWidth ?? 0)} />
                      </Field>
                      <Field label="Chase H">
                        <CabinetNumberField label="Media cable chase height" hideLabel compact testId="cabinet-input-media-cable-chase-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("mediaCableChaseHeight", activeModule.mediaCableChaseHeight ?? 0)} />
                      </Field>
                      <Field label="Chase D">
                        <CabinetNumberField label="Media cable chase depth" hideLabel compact testId="cabinet-input-media-cable-chase-depth" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("mediaCableChaseDepth", activeModule.mediaCableChaseDepth ?? 0)} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <Field label="Vent slots">
                        <CabinetNumberField label="Media vent slot count" hideLabel compact testId="cabinet-input-media-vent-slots" min={0} step={1} integer {...detailedModuleNumberFieldProps("mediaVentSlotCount", activeModule.mediaVentSlotCount ?? 0)} />
                      </Field>
                      <Field label="Vent W">
                        <CabinetNumberField label="Media vent slot width" hideLabel compact testId="cabinet-input-media-vent-slot-width" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("mediaVentSlotWidth", activeModule.mediaVentSlotWidth ?? 0)} />
                      </Field>
                      <Field label="Vent H">
                        <CabinetNumberField label="Media vent slot height" hideLabel compact testId="cabinet-input-media-vent-slot-height" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("mediaVentSlotHeight", activeModule.mediaVentSlotHeight ?? 0)} />
                      </Field>
                      <Field label="Vent gap">
                        <CabinetNumberField label="Media vent slot spacing" hideLabel compact testId="cabinet-input-media-vent-slot-spacing" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("mediaVentSlotSpacing", activeModule.mediaVentSlotSpacing ?? 0)} />
                      </Field>
                    </div>
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="library"
                    visible={visibleModuleOptionGroupIds.has("library")}
                  >
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-library-ladder-rail-enabled"
                        type="checkbox"
                        checked={hasCabinetLibraryLadderRail(activeModule)}
                        onChange={(event) =>
                          updateModule(activeModule.id, {
                            libraryLadderRailEnabled: event.target.checked,
                            libraryLadderRailHeight: event.target.checked ? activeModule.libraryLadderRailHeight ?? CABINET_DEFAULT_LIBRARY_LADDER_RAIL_HEIGHT : undefined,
                            libraryLadderRailDiameter: event.target.checked ? activeModule.libraryLadderRailDiameter ?? CABINET_DEFAULT_LIBRARY_LADDER_RAIL_DIAMETER : undefined,
                            libraryLadderRailProjection: event.target.checked ? activeModule.libraryLadderRailProjection ?? CABINET_DEFAULT_LIBRARY_LADDER_RAIL_PROJECTION : undefined,
                            libraryLadderStandoffCount: event.target.checked ? activeModule.libraryLadderStandoffCount ?? CABINET_DEFAULT_LIBRARY_LADDER_STANDOFF_COUNT : undefined,
                            libraryLadderStandoffDiameter: event.target.checked ? activeModule.libraryLadderStandoffDiameter ?? CABINET_DEFAULT_LIBRARY_LADDER_STANDOFF_DIAMETER : undefined,
                          })
                        }
                      />
                      Library ladder rail
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Rail H">
                        <CabinetNumberField label="Library ladder rail height" hideLabel compact testId="cabinet-input-library-ladder-rail-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("libraryLadderRailHeight", activeModule.libraryLadderRailHeight ?? 0)} />
                      </Field>
                      <Field label="Rail dia">
                        <CabinetNumberField label="Library ladder rail diameter" hideLabel compact testId="cabinet-input-library-ladder-rail-diameter" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("libraryLadderRailDiameter", activeModule.libraryLadderRailDiameter ?? 0)} />
                      </Field>
                      <Field label="Projection">
                        <CabinetNumberField label="Library ladder rail projection" hideLabel compact testId="cabinet-input-library-ladder-rail-projection" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("libraryLadderRailProjection", activeModule.libraryLadderRailProjection ?? 0)} />
                      </Field>
                    </div>
                    {hasCabinetLibraryLadderRail(activeModule) ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Standoffs">
                        <CabinetNumberField label="Library ladder standoff count" hideLabel compact testId="cabinet-input-library-ladder-standoffs" min={0} step={1} integer {...detailedModuleNumberFieldProps("libraryLadderStandoffCount", activeModule.libraryLadderStandoffCount ?? 0)} />
                      </Field>
                      <Field label="Standoff dia">
                        <CabinetNumberField label="Library ladder standoff diameter" hideLabel compact testId="cabinet-input-library-ladder-standoff-diameter" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("libraryLadderStandoffDiameter", activeModule.libraryLadderStandoffDiameter ?? 0)} />
                      </Field>
                    </div>
                    ) : (
                      <p className="text-[11px] leading-5 text-neutral-500">Enable the ladder rail to edit standoff details.</p>
                    )}
                  </div>
                  </CabinetModuleOptionGroup>
                  <CabinetModuleOptionGroup
                    id="lighting"
                    visible={visibleModuleOptionGroupIds.has("lighting")}
                  >
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-lighting-channel-enabled"
                        type="checkbox"
                        checked={hasCabinetLightingChannels(activeModule)}
                        onChange={(event) =>
                          updateModule(activeModule.id, {
                            lightingChannelEnabled: event.target.checked,
                            lightingChannelCount: event.target.checked ? activeModule.lightingChannelCount ?? CABINET_DEFAULT_LIGHTING_CHANNEL_COUNT : undefined,
                            lightingChannelDepth: event.target.checked ? activeModule.lightingChannelDepth ?? CABINET_DEFAULT_LIGHTING_CHANNEL_DEPTH : undefined,
                            lightingChannelHeight: event.target.checked ? activeModule.lightingChannelHeight ?? CABINET_DEFAULT_LIGHTING_CHANNEL_HEIGHT : undefined,
                            lightingChannelInsetFromFront: event.target.checked ? activeModule.lightingChannelInsetFromFront ?? CABINET_DEFAULT_LIGHTING_CHANNEL_INSET_FROM_FRONT : undefined,
                          })
                        }
                      />
                      Integrated lighting
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      <Field label="Channels">
                        <CabinetNumberField label="Lighting channel count" hideLabel compact testId="cabinet-input-lighting-channel-count" min={0} step={1} integer {...detailedModuleNumberFieldProps("lightingChannelCount", activeModule.lightingChannelCount ?? 0)} />
                      </Field>
                      <Field label="Depth">
                        <CabinetNumberField label="Lighting channel depth" hideLabel compact testId="cabinet-input-lighting-channel-depth" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("lightingChannelDepth", activeModule.lightingChannelDepth ?? 0)} />
                      </Field>
                      <Field label="Height">
                        <CabinetNumberField label="Lighting channel height" hideLabel compact testId="cabinet-input-lighting-channel-height" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("lightingChannelHeight", activeModule.lightingChannelHeight ?? 0)} />
                      </Field>
                      <Field label="Front inset">
                        <CabinetNumberField label="Lighting channel front inset" hideLabel compact testId="cabinet-input-lighting-channel-inset" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("lightingChannelInsetFromFront", activeModule.lightingChannelInsetFromFront ?? 0)} />
                      </Field>
                    </div>
                  </div>
                  </CabinetModuleOptionGroup>
                    </div>
                  ) : null}
                </div>

                {activeIsCabinetComponent ? (
                <div className="grid gap-3">
                  {sectionTitle("Fronts")}
                  <Field label="Front type">
                    <select data-testid="cabinet-input-front-type" className={selectClass()} value={activeModule.frontType} onChange={(event) => updateModule(activeModule.id, guidedFrontPatch(event.target.value as CabinetFrontType))}>
                      {frontTypes.map((frontType) => <option key={frontType} value={frontType}>{labelize(frontType)}</option>)}
                    </select>
                  </Field>
                  <Field label="Door style">
                    <select data-testid="cabinet-input-door-style" className={selectClass()} value={activeModule.doorStyle} onChange={(event) => updateModule(activeModule.id, { doorStyle: event.target.value as DoorStyle })}>
                      {doorStyles.map((doorStyle) => <option key={doorStyle} value={doorStyle}>{labelize(doorStyle)}</option>)}
                    </select>
                  </Field>
                  {activeHasDoorFront ? (
                    <>
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <span className="text-xs font-semibold text-neutral-700">Door count</span>
                    <div className="grid grid-cols-2 gap-1 rounded-md bg-neutral-100 p-1">
                      {(["recommended", "manual"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          data-testid={`cabinet-door-layout-${mode}`}
                          aria-pressed={activeDoorLayoutMode === mode}
                          className={`rounded px-2 py-1.5 text-xs font-semibold ${activeDoorLayoutMode === mode ? "bg-white shadow-sm" : "text-neutral-500"}`}
                          onClick={() => setActiveDoorLayoutMode(mode)}
                        >
                          {mode === "recommended" ? `Recommended · ${activeDoorCount}` : "Manual"}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] leading-5 text-neutral-500">
                      Manual preserves the current recommendation. Returning to Recommended replaces the override as width changes.
                    </p>
                  </div>
                  <Field label="Hinge side">
                    <select
                      data-testid="cabinet-input-hinge-side"
                      className={selectClass()}
                      value={activeModule.hingeSide ?? "left"}
                      onChange={(event) =>
                        updateModule(activeModule.id, {
                          hingeSide: event.target.value as NonNullable<CabinetModuleDefinition["hingeSide"]>,
                        })
                      }
                    >
                      {hingeSides.map((hingeSide) => <option key={hingeSide} value={hingeSide}>{labelize(hingeSide)}</option>)}
                    </select>
                  </Field>
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-door-hinge-hardware-enabled"
                        type="checkbox"
                        checked={hasCabinetDoorHinges(activeModule)}
                        onChange={(event) =>
                          updateModule(activeModule.id, {
                            doorHingeHardwareEnabled: event.target.checked,
                            doorHingeCountPerDoor: event.target.checked ? activeModule.doorHingeCountPerDoor ?? CABINET_DEFAULT_DOOR_HINGE_COUNT_PER_DOOR : undefined,
                            doorHingeInsetFromTopBottom: event.target.checked ? activeModule.doorHingeInsetFromTopBottom ?? CABINET_DEFAULT_DOOR_HINGE_INSET_FROM_TOP_BOTTOM : undefined,
                          })
                        }
                      />
                      Concealed hinges
                    </label>
                    {hasCabinetDoorHinges(activeModule) ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Pairs/door">
                        <CabinetNumberField label="Hinge pairs per door" hideLabel compact testId="cabinet-input-door-hinge-count" min={0} step={1} integer {...detailedModuleNumberFieldProps("doorHingeCountPerDoor", activeModule.doorHingeCountPerDoor ?? 0)} />
                      </Field>
                      <Field label="Top/bottom inset">
                        <CabinetNumberField label="Door hinge top and bottom inset" hideLabel compact testId="cabinet-input-door-hinge-inset" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("doorHingeInsetFromTopBottom", activeModule.doorHingeInsetFromTopBottom ?? 0)} />
                      </Field>
                    </div>
                    ) : (
                      <p className="text-[11px] leading-5 text-neutral-500">Enable concealed hinges to edit count and inset.</p>
                    )}
                  </div>
                    </>
                  ) : null}
                  {activeHasDrawerFront ? (
                    <>
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <span className="text-xs font-semibold text-neutral-700">Drawer-front heights</span>
                    <div
                      role="group"
                      aria-label="Drawer-front height configuration"
                      className="grid grid-cols-3 gap-2"
                    >
                      {(["equal", "recommended", "custom"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          data-testid={`cabinet-drawer-heights-${mode}`}
                          aria-pressed={activeDrawerHeightMode === mode}
                          className={`grid gap-1 rounded-lg border p-2 text-xs font-semibold transition ${activeDrawerHeightMode === mode ? "border-neutral-950 bg-white text-neutral-950 shadow-sm" : "border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-neutral-400"}`}
                          onClick={() => setActiveDrawerHeightMode(mode)}
                        >
                          <CabinetDrawerConfigurationPreview
                            mode={mode}
                            drawerCount={Math.max(1, activeModule.drawerCount)}
                            proportions={mode === "custom" ? activeDrawerHeightProportions : undefined}
                          />
                          {labelize(mode)}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] leading-5 text-neutral-500">
                      Custom starts from the generated stack. Switching back replaces custom proportions.
                    </p>
                    {activeDrawerHeightMode === "custom" ? (
                      <div className="grid grid-cols-2 gap-2">
                        {activeDrawerHeightProportions.map((proportion, index) => (
                          <GuidedNumberField
                            key={index}
                            label={`Drawer ${index + 1} (${index === 0 ? "bottom" : index === activeDrawerHeightProportions.length - 1 ? "top" : "middle"})`}
                            value={Math.round(proportion * 1000) / 10}
                            min={1}
                            max={1000}
                            step={1}
                            suffix="%"
                            testId={`cabinet-drawer-proportion-${index + 1}`}
                            fieldPath="drawerHeightProportions"
                            issues={getIssuesForField("drawerHeightProportions", activeModule.id)}
                            onCommit={(value) => updateActiveDrawerProportion(index, value)}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-drawer-box-enabled"
                        type="checkbox"
                        checked={hasCabinetDrawerBoxes(activeModule)}
                        onChange={(event) =>
                          updateModule(activeModule.id, {
                            drawerBoxEnabled: event.target.checked,
                            drawerBoxSideThickness: event.target.checked ? activeModule.drawerBoxSideThickness ?? CABINET_DEFAULT_DRAWER_BOX_SIDE_THICKNESS : undefined,
                            drawerBoxBottomThickness: event.target.checked ? activeModule.drawerBoxBottomThickness ?? CABINET_DEFAULT_DRAWER_BOX_BOTTOM_THICKNESS : undefined,
                            drawerBoxHeightClearance: event.target.checked ? activeModule.drawerBoxHeightClearance ?? CABINET_DEFAULT_DRAWER_BOX_HEIGHT_CLEARANCE : undefined,
                            drawerBoxBackClearance: event.target.checked ? activeModule.drawerBoxBackClearance ?? CABINET_DEFAULT_DRAWER_BOX_BACK_CLEARANCE : undefined,
                          })
                        }
                      />
                      Drawer boxes
                    </label>
                    {hasCabinetDrawerBoxes(activeModule) ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Side thick">
                        <CabinetNumberField label="Drawer box side thickness" hideLabel compact testId="cabinet-input-drawer-box-side-thickness" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("drawerBoxSideThickness", activeModule.drawerBoxSideThickness ?? 0)} />
                      </Field>
                      <Field label="Bottom thick">
                        <CabinetNumberField label="Drawer box bottom thickness" hideLabel compact testId="cabinet-input-drawer-box-bottom-thickness" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("drawerBoxBottomThickness", activeModule.drawerBoxBottomThickness ?? 0)} />
                      </Field>
                      <Field label="Height clr">
                        <CabinetNumberField label="Drawer box height clearance" hideLabel compact testId="cabinet-input-drawer-box-height-clearance" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("drawerBoxHeightClearance", activeModule.drawerBoxHeightClearance ?? 0)} />
                      </Field>
                      <Field label="Back clr">
                        <CabinetNumberField label="Drawer box back clearance" hideLabel compact testId="cabinet-input-drawer-box-back-clearance" min={0} step={5} unit="mm" {...detailedModuleNumberFieldProps("drawerBoxBackClearance", activeModule.drawerBoxBackClearance ?? 0)} />
                      </Field>
                    </div>
                    ) : (
                      <p className="text-[11px] leading-5 text-neutral-500">Enable drawer boxes to edit construction clearances.</p>
                    )}
                  </div>
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-drawer-slide-hardware-enabled"
                        type="checkbox"
                        checked={hasCabinetDrawerSlides(activeModule)}
                        onChange={(event) =>
                          updateModule(activeModule.id, {
                            drawerSlideHardwareEnabled: event.target.checked,
                            drawerSlideLength: event.target.checked ? activeModule.drawerSlideLength ?? CABINET_DEFAULT_DRAWER_SLIDE_LENGTH : undefined,
                            drawerSlideClearance: event.target.checked ? activeModule.drawerSlideClearance ?? CABINET_DEFAULT_DRAWER_SLIDE_CLEARANCE : undefined,
                          })
                        }
                      />
                      Drawer slides
                    </label>
                    {hasCabinetDrawerSlides(activeModule) ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Length">
                        <CabinetNumberField label="Drawer slide length" hideLabel compact testId="cabinet-input-drawer-slide-length" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("drawerSlideLength", activeModule.drawerSlideLength ?? 0)} />
                      </Field>
                      <Field label="Side clr">
                        <CabinetNumberField label="Drawer slide side clearance" hideLabel compact testId="cabinet-input-drawer-slide-clearance" min={0} step={1} unit="mm" {...detailedModuleNumberFieldProps("drawerSlideClearance", activeModule.drawerSlideClearance ?? 0)} />
                      </Field>
                    </div>
                    ) : (
                      <p className="text-[11px] leading-5 text-neutral-500">Enable drawer slides to edit length and side clearance.</p>
                    )}
                  </div>
                    </>
                  ) : null}
                </div>
                ) : null}

                <div className="grid gap-3">
                  {sectionTitle("Materials")}
                  <button
                    type="button"
                    data-testid="cabinet-material-lock"
                    aria-pressed={activeMaterialLocked}
                    className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-semibold ${activeMaterialLocked ? "border-blue-200 bg-blue-50 text-blue-800" : "border-neutral-300 text-neutral-600"}`}
                    onClick={toggleActiveMaterialLock}
                  >
                    {activeMaterialLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    {activeMaterialLocked ? "Material assignment locked" : "Lock material assignment"}
                  </button>
                  <Field label="Cabinet structure" helper="Professional term: carcass.">
                    <select data-testid="cabinet-input-material" className={selectClass()} disabled={activeMaterialLocked} value={activeModule.materialId} onChange={(event) => updateModule(activeModule.id, { materialId: event.target.value })}>
                      {CABINET_MATERIALS.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Front">
                    <select data-testid="cabinet-input-front-material" className={selectClass()} disabled={activeMaterialLocked} value={activeModule.frontMaterialId ?? activeModule.materialId} onChange={(event) => updateModule(activeModule.id, { frontMaterialId: event.target.value })}>
                      {CABINET_MATERIALS.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
                    </select>
                  </Field>
                  <div className="flex gap-1.5">
                    {CABINET_MATERIALS.map((material) => (
                      <button
                        key={material.id}
                        type="button"
                        disabled={activeMaterialLocked}
                        className="h-6 w-6 rounded-full border border-neutral-300"
                        style={{ background: material.color }}
                        title={material.name}
                        aria-label={`Use ${material.name} as the front material`}
                        onClick={() => updateModule(activeModule.id, { frontMaterialId: material.id })}
                      />
                    ))}
                  </div>
                </div>

                <div hidden={!activeIsCabinetComponent} className="grid gap-3">
                  {sectionTitle("Hardware")}
                  <Field label="Handle">
                    <select data-testid="cabinet-input-hardware" className={selectClass()} value={activeModule.hardwareId ?? "none"} onChange={(event) => updateModule(activeModule.id, { hardwareId: event.target.value })}>
                      {activeHardwareOptions.map((hardware) => <option key={hardware.id} value={hardware.id}>{hardware.name}</option>)}
                    </select>
                  </Field>
                  {activeHandlePlacementAvailable || activeHandlePlacementMode === "custom" ? (
                    <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                      <span className="text-xs font-semibold text-neutral-700">Handle placement</span>
                      <div className="grid grid-cols-2 gap-1 rounded-md bg-neutral-100 p-1">
                        {(["automatic", "custom"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            data-testid={`cabinet-handle-placement-${mode}`}
                            aria-pressed={activeHandlePlacementMode === mode}
                            disabled={mode === "custom" && !activeHandlePlacementAvailable}
                            className={`rounded px-2 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${activeHandlePlacementMode === mode ? "bg-white shadow-sm" : "text-neutral-500"}`}
                            onClick={() => setActiveHandlePlacementMode(mode)}
                          >
                            {labelize(mode)}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] leading-5 text-neutral-500">
                        Custom shifts every generated handle from its safe automatic position. Returning to Automatic removes both offsets.
                      </p>
                      {activeHandlePlacementMode === "custom" && activeHandlePlacementAvailable ? (
                        <div className="grid grid-cols-2 gap-2">
                          <GuidedNumberField
                            label="Horizontal shift"
                            value={activeModule.handleOffsetX ?? 0}
                            min={-4000}
                            max={4000}
                            step={5}
                            suffix="mm"
                            testId="cabinet-input-handle-offset-x"
                            fieldPath="handlePlacementMode"
                            issues={getIssuesForField("handlePlacementMode", activeModule.id)}
                            onCommit={(value) => updateModule(activeModule.id, { handleOffsetX: value })}
                          />
                          <GuidedNumberField
                            label="Vertical shift"
                            value={activeModule.handleOffsetY ?? 0}
                            min={-4000}
                            max={4000}
                            step={5}
                            suffix="mm"
                            testId="cabinet-input-handle-offset-y"
                            fieldPath="handlePlacementMode"
                            issues={getIssuesForField("handlePlacementMode", activeModule.id)}
                            onCommit={(value) => updateModule(activeModule.id, { handleOffsetY: value })}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {activeHardwareCompatibility ? (
                    <div
                      data-testid="cabinet-hardware-compatibility"
                      data-status={activeHardwareCompatibility.status}
                      role={activeHardwareCompatibility.status === "incompatible" ? "alert" : "status"}
                      className={`rounded-md border p-2 text-[11px] leading-5 ${
                        activeHardwareCompatibility.status === "compatible"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : activeHardwareCompatibility.status === "review_required"
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-red-200 bg-red-50 text-red-800"
                      }`}
                    >
                      <span className="block font-semibold">
                        {activeHardwareCompatibility.status === "compatible"
                          ? "Compatible with this front"
                          : activeHardwareCompatibility.status === "review_required"
                            ? "Compatibility review needed"
                            : "Not compatible with this front"}
                      </span>
                      {activeHardwareCompatibility.reasons
                        .filter((reason) => reason.code !== "compatible")
                        .map((reason) => (
                          <span key={reason.code} className="mt-1 block">{formatProjectFeedback(reason.message)}</span>
                        ))}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3" data-testid="cabinet-fabrication-details">
                  <button
                    type="button"
                    className="flex items-center justify-between text-left text-xs font-semibold text-neutral-800"
                    aria-expanded={fabricationOpen}
                    onClick={() => {
                      const nextOpen = !fabricationOpen;
                      setFabricationOpen(nextOpen);
                      if (nextOpen) {
                        trackStudioInteraction("millwork_advanced_controls_opened", {
                          section: "fabrication",
                        });
                      }
                    }}
                  >
                    <span>Fabrication details</span>
                    <span aria-hidden="true">{fabricationOpen ? "−" : "+"}</span>
                  </button>
                  {!fabricationOpen ? (
                    <p className="text-[11px] leading-5 text-neutral-500">
                      Grain, finished edges, exposed faces, and selected-part cut information.
                    </p>
                  ) : (
                    <div className="grid gap-3">
                      <Field label="Grain direction">
                        <select
                          data-testid="cabinet-input-grain-direction"
                          className={selectClass()}
                          value={activeModule.grainDirection ?? "automatic"}
                          onChange={(event) =>
                            updateModule(activeModule.id, {
                              grainDirection:
                                event.target.value === "automatic"
                                  ? undefined
                                  : (event.target.value as CabinetGrainDirection),
                            })
                          }
                        >
                          {grainDirectionOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Edge treatment">
                        <select
                          data-testid="cabinet-input-edge-treatment"
                          className={selectClass()}
                          value={activeModule.edgeTreatment ?? "automatic"}
                          onChange={(event) => {
                            const value = event.target.value;
                            updateModule(activeModule.id, {
                              edgeTreatment:
                                value === "automatic" ? undefined : (value as CabinetEdgeTreatment),
                              edgeMaterialId:
                                value === "contrasting_edge_band"
                                  ? activeModule.edgeMaterialId ?? CABINET_MATERIALS.find((material) => material.id !== activeModule.materialId)?.id
                                  : activeModule.edgeMaterialId,
                            });
                          }}
                        >
                          {edgeTreatmentOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </Field>
                      {activeModule.edgeTreatment === "contrasting_edge_band" || activeModule.edgeTreatment === "solid_lipping" ? (
                        <Field label={activeModule.edgeTreatment === "contrasting_edge_band" ? "Contrasting edge finish" : "Lipping material"}>
                          <select
                            data-testid="cabinet-input-edge-material"
                            className={selectClass()}
                            value={activeModule.edgeMaterialId ?? ""}
                            onChange={(event) => updateModule(activeModule.id, { edgeMaterialId: event.target.value || undefined })}
                          >
                            <option value="">Choose a material</option>
                            {CABINET_MATERIALS.filter((material) => !["service_zone_marker", "upholstery_neutral", "glass"].includes(material.id)).map((material) => (
                              <option key={material.id} value={material.id}>{material.name}</option>
                            ))}
                          </select>
                        </Field>
                      ) : null}
                      <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                        <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                          <input
                            data-testid="cabinet-input-exposed-faces-automatic"
                            type="checkbox"
                            checked={activeModule.exposedFaces === undefined}
                            onChange={(event) =>
                              updateModule(activeModule.id, {
                                exposedFaces: event.target.checked
                                  ? undefined
                                  : resolveCabinetModuleExposedFaces(definition, activeModule),
                              })
                            }
                          />
                          Determine exposed faces automatically
                        </label>
                        {activeModule.exposedFaces !== undefined ? (
                          <fieldset className="grid grid-cols-2 gap-1.5">
                            <legend className="mb-1 text-[11px] font-semibold text-neutral-600">Finished faces</legend>
                            {exposedFaceOptions.map((option) => (
                              <label key={option.value} className="flex min-h-7 items-center gap-2 text-[11px] text-neutral-700">
                                <input
                                  data-testid={`cabinet-input-exposed-face-${option.value}`}
                                  type="checkbox"
                                  checked={activeModule.exposedFaces?.includes(option.value) ?? false}
                                  onChange={(event) => {
                                    const current = activeModule.exposedFaces ?? [];
                                    updateModule(activeModule.id, {
                                      exposedFaces: event.target.checked
                                        ? Array.from(new Set([...current, option.value]))
                                        : current.filter((face) => face !== option.value),
                                    });
                                  }}
                                />
                                {option.label}
                              </label>
                            ))}
                          </fieldset>
                        ) : (
                          <p className="text-[11px] leading-5 text-neutral-500">
                            Resolved for this module: {resolveCabinetModuleExposedFaces(definition, activeModule).map(labelize).join(", ")}.
                          </p>
                        )}
                      </div>
                      {selectedPart && selectedPartFabrication ? (
                        <div className="grid gap-1 rounded-md border border-blue-200 bg-blue-50 p-2 text-[11px] leading-5 text-blue-900" data-testid="cabinet-selected-part-fabrication">
                          <span className="font-semibold">Selected {labelize(selectedPart.type)}</span>
                          <span>Cut face: {labelize(selectedPartFabrication.cutFace.widthAxis)} × {labelize(selectedPartFabrication.cutFace.heightAxis)}; thickness {labelize(selectedPartFabrication.cutFace.thicknessAxis)}</span>
                          <span>Grain: {labelize(selectedPartFabrication.grainDirection)} ({labelize(selectedPartFabrication.grainAxis)})</span>
                          <span>Edges: {labelize(selectedPartFabrication.edgeTreatment)} · {formatProjectMeasurement(selectedPartFabrication.treatedLengthMm)} · {selectedPartFabrication.treatedEdges.length ? selectedPartFabrication.treatedEdges.map(labelize).join(", ") : "none"}</span>
                          <span>Exposed faces: {selectedPartFabrication.exposedFaces.length ? selectedPartFabrication.exposedFaces.map(labelize).join(", ") : "none"}</span>
                        </div>
                      ) : (
                        <p className="text-[11px] leading-5 text-neutral-500">
                          Select a generated panel in the preview to inspect its resolved cut face, grain, and edges.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : null}

            {semanticSelection.scope === "module" && activeIsCabinetComponent ? (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="text-left text-xs font-semibold text-neutral-700 underline-offset-2 hover:underline"
                  onClick={() => {
                    const nextOpen = !advancedOpen;
                    setAdvancedOpen(nextOpen);
                    if (nextOpen) {
                      trackStudioInteraction("millwork_advanced_controls_opened", {
                        section: "construction",
                      });
                    }
                  }}
                >
                  Advanced {advancedOpen ? "−" : "+"}
                </button>
                {advancedOpen ? (
                  <button
                    type="button"
                    data-testid="cabinet-reset-construction-section"
                    className="text-xs font-semibold text-neutral-500 underline hover:text-neutral-900"
                    onClick={resetConstructionSection}
                  >
                    Reset construction
                  </button>
                ) : null}
              </div>
              {advancedOpen ? (
                <div className="grid gap-3">
                  <p className="text-[11px] leading-5 text-neutral-500">
                    Construction reset restores template geometry and options only. Module layout, finish assignments, and locked values remain unchanged.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["boardThickness", "Cabinet structure thickness", 1, "Professional term: carcass panel thickness."],
                      ["backPanelThickness", "Back panel thickness", 1, "Thickness of the cabinet back."],
                      ["toeKickHeight", "Floor base height", 5, "Professional term: toe kick or plinth."],
                      ["toeKickSetback", "Floor base setback", 5, "Professional term: toe-kick setback."],
                      ["toeKickDepth", "Floor base depth", 5, "Professional term: toe-kick depth."],
                      ["revealGap", "Door and drawer spacing", 1, "Professional term: reveal gap."],
                      ["leftFillerWidth", "Left wall fitting panel", 5, "Also called a filler or scribe panel."],
                      ["rightFillerWidth", "Right wall fitting panel", 5, "Also called a filler or scribe panel."],
                      ["leftFillerScribeAllowance", "Left wall-fit trimming allowance", 1, "Professional term: scribe allowance."],
                      ["rightFillerScribeAllowance", "Right wall-fit trimming allowance", 1, "Professional term: scribe allowance."],
                      ["leftEndPanelThickness", "Left finished side thickness", 1, "Professional term: applied end panel."],
                      ["rightEndPanelThickness", "Right finished side thickness", 1, "Professional term: applied end panel."],
                    ].map(([field, label, step, helper]) => {
                      const parameterPath = String(field);
                      const hasAutomaticProvenance = [
                        "leftFillerWidth",
                        "rightFillerWidth",
                        "leftFillerScribeAllowance",
                        "rightFillerScribeAllowance",
                      ].includes(parameterPath);
                      const parameterState = getCabinetParameterState(
                        definition,
                        parameterPath
                      );
                      const changesOverallWidth = [
                        "leftFillerWidth",
                        "rightFillerWidth",
                        "leftEndPanelThickness",
                        "rightEndPanelThickness",
                      ].includes(parameterPath);
                      return (
                        <div key={parameterPath} className="grid gap-1">
                          <Field label={String(label)} helper={String(helper)}>
                            <CabinetNumberField
                              label={String(label)}
                              hideLabel
                              compact
                              testId={
                                field === "boardThickness"
                                  ? "cabinet-input-board-thickness"
                                  : field === "backPanelThickness"
                                    ? "cabinet-input-back-panel-thickness"
                                    : field === "toeKickHeight"
                                      ? "cabinet-input-toe-kick-height"
                                      : field === "revealGap"
                                        ? "cabinet-input-reveal-gap"
                                : field === "leftFillerWidth"
                                  ? "cabinet-input-left-filler"
                                  : field === "rightFillerWidth"
                                    ? "cabinet-input-right-filler"
                                    : field === "toeKickSetback"
                                      ? "cabinet-input-toe-kick-setback"
                                      : field === "toeKickDepth"
                                        ? "cabinet-input-toe-kick-depth"
                                        : field === "leftFillerScribeAllowance"
                                          ? "cabinet-input-left-filler-scribe-allowance"
                                          : field === "rightFillerScribeAllowance"
                                            ? "cabinet-input-right-filler-scribe-allowance"
                                            : field === "leftEndPanelThickness"
                                              ? "cabinet-input-left-end-panel-thickness"
                                              : field === "rightEndPanelThickness"
                                                ? "cabinet-input-right-end-panel-thickness"
                                                : undefined
                              }
                              fieldPath={parameterPath}
                              issues={getIssuesForField(parameterPath)}
                              min={0}
                              step={Number(step)}
                              unit="mm"
                              disabled={overallWidthLocked && changesOverallWidth}
                              disabledReason={
                                overallWidthLocked && changesOverallWidth
                                  ? "Unlock overall width to edit this value."
                                  : undefined
                              }
                              value={Number(
                                definition[field as keyof CabinetDefinition] ??
                                  (field === "leftEndPanelThickness" || field === "rightEndPanelThickness"
                                    ? CABINET_DEFAULT_END_PANEL_THICKNESS
                                    : field === "toeKickSetback"
                                      ? getCabinetToeKickSetback(definition)
                                      : field === "toeKickDepth"
                                        ? activeModule
                                          ? getCabinetToeKickDepth(definition, activeModule)
                                          : 0
                                    : 0)
                              )}
                              onCommit={(value) =>
                                updateDefinition((prev) =>
                                  setCabinetParameterState(
                                    {
                                      ...prev,
                                      [field]: value,
                                    },
                                    parameterPath,
                                    { source: "user_overridden" }
                                  )
                                )
                              }
                            />
                          </Field>
                          {hasAutomaticProvenance ? (
                            <div className="flex items-center justify-between gap-2 text-[10px] font-medium text-neutral-400">
                              <span
                                data-testid={`cabinet-parameter-source-${parameterPath}`}
                                data-parameter-path={parameterPath}
                              >
                                {labelize(parameterState.source)}
                              </span>
                              {parameterState.source === "user_overridden" || parameterState.locked ? (
                                <button
                                  type="button"
                                  data-testid={`cabinet-reset-parameter-${parameterPath}`}
                                  className="font-semibold text-blue-700 hover:text-blue-900"
                                  onClick={() => resetParameterToAutomatic(parameterPath)}
                                >
                                  Reset to auto
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex min-h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-left-end-panel"
                        type="checkbox"
                        disabled={overallWidthLocked}
                        checked={Boolean(definition.includeLeftEndPanel)}
                        onChange={(event) =>
                          updateDefinition((prev) => ({
                            ...prev,
                            includeLeftEndPanel: event.target.checked,
                          }))
                        }
                      />
                      Left finished side panel
                    </label>
                    <label className="flex min-h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-right-end-panel"
                        type="checkbox"
                        disabled={overallWidthLocked}
                        checked={Boolean(definition.includeRightEndPanel)}
                        onChange={(event) =>
                          updateDefinition((prev) => ({
                            ...prev,
                            includeRightEndPanel: event.target.checked,
                          }))
                        }
                      />
                      Right finished side panel
                    </label>
                  </div>
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-leveling-feet-enabled"
                        type="checkbox"
                        checked={Boolean(definition.levelingFeetEnabled)}
                        onChange={(event) =>
                          updateDefinition((prev) => ({
                            ...prev,
                            levelingFeetEnabled: event.target.checked,
                            levelingFootCount: event.target.checked
                              ? prev.levelingFootCount ?? CABINET_DEFAULT_LEVELING_FOOT_COUNT
                              : prev.levelingFootCount,
                            levelingFootHeight: event.target.checked
                              ? prev.levelingFootHeight ?? CABINET_DEFAULT_LEVELING_FOOT_HEIGHT
                              : prev.levelingFootHeight,
                            levelingFootDiameter: event.target.checked
                              ? prev.levelingFootDiameter ?? CABINET_DEFAULT_LEVELING_FOOT_DIAMETER
                              : prev.levelingFootDiameter,
                            levelingFootInsetFromSides: event.target.checked
                              ? prev.levelingFootInsetFromSides ?? CABINET_DEFAULT_LEVELING_FOOT_INSET_FROM_SIDES
                              : prev.levelingFootInsetFromSides,
                            levelingFootInsetFromFrontBack: event.target.checked
                              ? prev.levelingFootInsetFromFrontBack ?? CABINET_DEFAULT_LEVELING_FOOT_INSET_FROM_FRONT_BACK
                              : prev.levelingFootInsetFromFrontBack,
                          }))
                        }
                      />
                      Leveling feet
                    </label>
                    {definition.levelingFeetEnabled ? (
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ["levelingFootCount", "Feet / module", "cabinet-input-leveling-foot-count", 1, CABINET_DEFAULT_LEVELING_FOOT_COUNT],
                          ["levelingFootHeight", "Foot height", "cabinet-input-leveling-foot-height", 5, CABINET_DEFAULT_LEVELING_FOOT_HEIGHT],
                          ["levelingFootDiameter", "Foot dia", "cabinet-input-leveling-foot-diameter", 1, CABINET_DEFAULT_LEVELING_FOOT_DIAMETER],
                          ["levelingFootInsetFromSides", "Side inset", "cabinet-input-leveling-foot-side-inset", 5, CABINET_DEFAULT_LEVELING_FOOT_INSET_FROM_SIDES],
                          ["levelingFootInsetFromFrontBack", "Front/back inset", "cabinet-input-leveling-foot-front-back-inset", 5, CABINET_DEFAULT_LEVELING_FOOT_INSET_FROM_FRONT_BACK],
                        ].map(([field, label, testId, step, fallback]) => (
                          <Field key={field} label={String(label)}>
                            <CabinetNumberField
                              label={String(label)}
                              hideLabel
                              compact
                              testId={String(testId)}
                              min={0}
                              step={Number(step)}
                              integer={field === "levelingFootCount"}
                              unit={field === "levelingFootCount" ? undefined : "mm"}
                              value={Number(definition[field as keyof CabinetDefinition] ?? fallback)}
                              fieldPath={String(field)}
                              issues={getIssuesForField(String(field))}
                              onCommit={(value) => updateDefinition((prev) => ({ ...prev, [field]: value }))}
                            />
                          </Field>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-face-frame-enabled"
                        type="checkbox"
                        checked={Boolean(definition.faceFrameEnabled)}
                        onChange={(event) =>
                          updateDefinition((prev) => ({
                            ...prev,
                            faceFrameEnabled: event.target.checked,
                            faceFrameStileWidth: event.target.checked
                              ? prev.faceFrameStileWidth ?? CABINET_DEFAULT_FACE_FRAME_STILE_WIDTH
                              : prev.faceFrameStileWidth,
                            faceFrameRailHeight: event.target.checked
                              ? prev.faceFrameRailHeight ?? CABINET_DEFAULT_FACE_FRAME_RAIL_HEIGHT
                              : prev.faceFrameRailHeight,
                            faceFrameDepth: event.target.checked
                              ? prev.faceFrameDepth ?? CABINET_DEFAULT_FACE_FRAME_DEPTH
                              : prev.faceFrameDepth,
                            faceFrameMaterialId: event.target.checked
                              ? prev.faceFrameMaterialId ??
                                activeModule?.frontMaterialId ??
                                activeModule?.materialId ??
                                CABINET_MATERIALS[0]?.id
                              : prev.faceFrameMaterialId,
                          }))
                        }
                      />
                      Face frame
                    </label>
                    {definition.faceFrameEnabled ? (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            ["faceFrameStileWidth", "Stile width", "cabinet-input-face-frame-stile-width", 1, CABINET_DEFAULT_FACE_FRAME_STILE_WIDTH],
                            ["faceFrameRailHeight", "Rail height", "cabinet-input-face-frame-rail-height", 1, CABINET_DEFAULT_FACE_FRAME_RAIL_HEIGHT],
                            ["faceFrameDepth", "Frame depth", "cabinet-input-face-frame-depth", 1, CABINET_DEFAULT_FACE_FRAME_DEPTH],
                          ].map(([field, label, testId, step, fallback]) => (
                            <Field key={field} label={String(label)}>
                              <CabinetNumberField
                                label={String(label)}
                                hideLabel
                                compact
                                testId={String(testId)}
                                min={0}
                                step={Number(step)}
                                unit="mm"
                                value={Number(definition[field as keyof CabinetDefinition] ?? fallback)}
                                fieldPath={String(field)}
                                issues={getIssuesForField(String(field))}
                                onCommit={(value) => updateDefinition((prev) => ({ ...prev, [field]: value }))}
                              />
                            </Field>
                          ))}
                        </div>
                        <Field label="Frame material">
                          <select
                            data-testid="cabinet-input-face-frame-material"
                            className={selectClass()}
                            value={
                              definition.faceFrameMaterialId ??
                              activeModule?.frontMaterialId ??
                              activeModule?.materialId ??
                              CABINET_MATERIALS[0]?.id ??
                              ""
                            }
                            onChange={(event) =>
                              updateDefinition((prev) => ({
                                ...prev,
                                faceFrameMaterialId: event.target.value,
                              }))
                            }
                          >
                            {CABINET_MATERIALS.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
                          </select>
                        </Field>
                      </>
                    ) : null}
                  </div>
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-countertop-enabled"
                        type="checkbox"
                        disabled={overallWidthLocked}
                        checked={Boolean(definition.includeCountertop)}
                        onChange={(event) =>
                          updateDefinition((prev) => ({
                            ...prev,
                            includeCountertop: event.target.checked,
                            includeBacksplash: event.target.checked ? prev.includeBacksplash : false,
                            countertopThickness: event.target.checked
                              ? prev.countertopThickness ?? CABINET_DEFAULT_COUNTERTOP_THICKNESS
                              : prev.countertopThickness,
                            countertopOverhangLeft: event.target.checked
                              ? prev.countertopOverhangLeft ?? CABINET_DEFAULT_COUNTERTOP_SIDE_OVERHANG
                              : prev.countertopOverhangLeft,
                            countertopOverhangRight: event.target.checked
                              ? prev.countertopOverhangRight ?? CABINET_DEFAULT_COUNTERTOP_SIDE_OVERHANG
                              : prev.countertopOverhangRight,
                            countertopOverhangFront: event.target.checked
                              ? prev.countertopOverhangFront ?? CABINET_DEFAULT_COUNTERTOP_FRONT_OVERHANG
                              : prev.countertopOverhangFront,
                            countertopOverhangBack: event.target.checked
                              ? prev.countertopOverhangBack ?? 0
                              : prev.countertopOverhangBack,
                            countertopMaterialId: event.target.checked
                              ? prev.countertopMaterialId ?? activeModule?.frontMaterialId ?? activeModule?.materialId ?? CABINET_MATERIALS[0]?.id
                              : prev.countertopMaterialId,
                          }))
                        }
                      />
                      Countertop / worktop
                    </label>
                    {definition.includeCountertop ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            ["countertopThickness", "Top thickness", "cabinet-input-countertop-thickness", 1],
                            ["countertopOverhangLeft", "Left overhang", "cabinet-input-countertop-overhang-left", 5],
                            ["countertopOverhangRight", "Right overhang", "cabinet-input-countertop-overhang-right", 5],
                            ["countertopOverhangFront", "Front overhang", "cabinet-input-countertop-overhang-front", 5],
                            ["countertopOverhangBack", "Back overhang", "cabinet-input-countertop-overhang-back", 5],
                          ].map(([field, label, testId, step]) => (
                            <Field key={field} label={String(label)}>
                              <CabinetNumberField
                                label={String(label)}
                                hideLabel
                                compact
                                testId={String(testId)}
                                min={0}
                                step={Number(step)}
                                unit="mm"
                                disabled={
                                  overallWidthLocked &&
                                  ["countertopOverhangLeft", "countertopOverhangRight"].includes(
                                    String(field)
                                  )
                                }
                                disabledReason={
                                  overallWidthLocked &&
                                  ["countertopOverhangLeft", "countertopOverhangRight"].includes(String(field))
                                    ? "Unlock overall width to edit side overhangs."
                                    : undefined
                                }
                                value={Number(definition[field as keyof CabinetDefinition] ?? 0)}
                                fieldPath={String(field)}
                                issues={getIssuesForField(String(field))}
                                onCommit={(value) => updateDefinition((prev) => ({ ...prev, [field]: value }))}
                              />
                            </Field>
                          ))}
                        </div>
                        <Field label="Top material">
                          <select
                            data-testid="cabinet-input-countertop-material"
                            className={selectClass()}
                            value={definition.countertopMaterialId ?? activeModule?.frontMaterialId ?? activeModule?.materialId ?? CABINET_MATERIALS[0]?.id ?? ""}
                            onChange={(event) =>
                              updateDefinition((prev) => ({
                                ...prev,
                                countertopMaterialId: event.target.value,
                              }))
                            }
                          >
                            {CABINET_MATERIALS.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
                          </select>
                        </Field>
                        <div className="grid gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-2">
                          <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                            <input
                              data-testid="cabinet-input-backsplash-enabled"
                              type="checkbox"
                              checked={Boolean(definition.includeBacksplash)}
                              onChange={(event) =>
                                updateDefinition((prev) => ({
                                  ...prev,
                                  includeBacksplash: event.target.checked,
                                  backsplashHeight: event.target.checked
                                    ? prev.backsplashHeight ?? CABINET_DEFAULT_BACKSPLASH_HEIGHT
                                    : prev.backsplashHeight,
                                  backsplashThickness: event.target.checked
                                    ? prev.backsplashThickness ?? CABINET_DEFAULT_BACKSPLASH_THICKNESS
                                    : prev.backsplashThickness,
                                  backsplashMaterialId: event.target.checked
                                    ? prev.backsplashMaterialId ??
                                      prev.countertopMaterialId ??
                                      activeModule?.frontMaterialId ??
                                      activeModule?.materialId ??
                                      CABINET_MATERIALS[0]?.id
                                    : prev.backsplashMaterialId,
                                }))
                              }
                            />
                            Backsplash / upstand
                          </label>
                          {definition.includeBacksplash ? (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <Field label="Splash height">
                                  <CabinetNumberField
                                    label="Backsplash height"
                                    hideLabel
                                    compact
                                    testId="cabinet-input-backsplash-height"
                                    min={0}
                                    step={5}
                                    unit="mm"
                                    {...detailedDefinitionNumberFieldProps("backsplashHeight", definition.backsplashHeight ?? CABINET_DEFAULT_BACKSPLASH_HEIGHT)}
                                  />
                                </Field>
                                <Field label="Splash thick">
                                  <CabinetNumberField
                                    label="Backsplash thickness"
                                    hideLabel
                                    compact
                                    testId="cabinet-input-backsplash-thickness"
                                    min={0}
                                    step={1}
                                    unit="mm"
                                    {...detailedDefinitionNumberFieldProps("backsplashThickness", definition.backsplashThickness ?? CABINET_DEFAULT_BACKSPLASH_THICKNESS)}
                                  />
                                </Field>
                              </div>
                              <Field label="Splash material">
                                <select
                                  data-testid="cabinet-input-backsplash-material"
                                  className={selectClass()}
                                  value={
                                    definition.backsplashMaterialId ??
                                    definition.countertopMaterialId ??
                                    activeModule?.frontMaterialId ??
                                    activeModule?.materialId ??
                                    CABINET_MATERIALS[0]?.id ??
                                    ""
                                  }
                                  onChange={(event) =>
                                    updateDefinition((prev) => ({
                                      ...prev,
                                      backsplashMaterialId: event.target.value,
                                    }))
                                  }
                                >
                                  {CABINET_MATERIALS.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
                                </select>
                              </Field>
                            </>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                  <div className="grid gap-2 rounded-md border border-neutral-200 bg-white p-2">
                    <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-neutral-700">
                      <input
                        data-testid="cabinet-input-island-seating-enabled"
                        type="checkbox"
                        checked={Boolean(definition.islandSeatingOverhangEnabled)}
                        onChange={(event) =>
                          updateDefinition((prev) => ({
                            ...prev,
                            includeCountertop: event.target.checked ? true : prev.includeCountertop,
                            countertopThickness: event.target.checked
                              ? prev.countertopThickness ?? CABINET_DEFAULT_COUNTERTOP_THICKNESS
                              : prev.countertopThickness,
                            countertopOverhangBack: event.target.checked
                              ? Math.max(
                                  prev.countertopOverhangBack ?? 0,
                                  prev.islandSeatingOverhangDepth ?? CABINET_DEFAULT_ISLAND_SEATING_OVERHANG_DEPTH
                                )
                              : prev.countertopOverhangBack,
                            countertopMaterialId: event.target.checked
                              ? prev.countertopMaterialId ??
                                activeModule?.frontMaterialId ??
                                activeModule?.materialId ??
                                CABINET_MATERIALS[0]?.id
                              : prev.countertopMaterialId,
                            islandSeatingOverhangEnabled: event.target.checked,
                            islandSeatingOverhangDepth: event.target.checked
                              ? prev.islandSeatingOverhangDepth ?? CABINET_DEFAULT_ISLAND_SEATING_OVERHANG_DEPTH
                              : prev.islandSeatingOverhangDepth,
                            islandSupportPanelCount: event.target.checked
                              ? prev.islandSupportPanelCount ?? CABINET_DEFAULT_ISLAND_SUPPORT_PANEL_COUNT
                              : prev.islandSupportPanelCount,
                            islandSupportPanelThickness: event.target.checked
                              ? prev.islandSupportPanelThickness ?? CABINET_DEFAULT_ISLAND_SUPPORT_PANEL_THICKNESS
                              : prev.islandSupportPanelThickness,
                            islandSupportPanelDepth: event.target.checked
                              ? prev.islandSupportPanelDepth ?? CABINET_DEFAULT_ISLAND_SUPPORT_PANEL_DEPTH
                              : prev.islandSupportPanelDepth,
                            islandSupportPanelEndInset: event.target.checked
                              ? prev.islandSupportPanelEndInset ?? CABINET_DEFAULT_ISLAND_SUPPORT_PANEL_END_INSET
                              : prev.islandSupportPanelEndInset,
                          }))
                        }
                      />
                      Island seating overhang
                    </label>
                    {definition.islandSeatingOverhangEnabled ? (
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ["islandSeatingOverhangDepth", "Overhang depth", "cabinet-input-island-seating-overhang-depth", 10],
                          ["islandSupportPanelCount", "Support panels", "cabinet-input-island-support-panels", 1],
                          ["islandSupportPanelThickness", "Panel thickness", "cabinet-input-island-support-panel-thickness", 1],
                          ["islandSupportPanelDepth", "Panel depth", "cabinet-input-island-support-panel-depth", 10],
                          ["islandSupportPanelEndInset", "End inset", "cabinet-input-island-support-panel-end-inset", 10],
                        ].map(([field, label, testId, step]) => (
                          <Field key={field} label={String(label)}>
                            <CabinetNumberField
                              label={String(label)}
                              hideLabel
                              compact
                              testId={String(testId)}
                              min={0}
                              step={Number(step)}
                              integer={field === "islandSupportPanelCount"}
                              unit={field === "islandSupportPanelCount" ? undefined : "mm"}
                              value={Number(definition[field as keyof CabinetDefinition] ?? 0)}
                              fieldPath={String(field)}
                              issues={getIssuesForField(String(field))}
                              onCommit={(value) => {
                                updateDefinition((prev) => ({
                                  ...prev,
                                  [field]: value,
                                  countertopOverhangBack:
                                    field === "islandSeatingOverhangDepth"
                                      ? Math.max(prev.countertopOverhangBack ?? 0, value)
                                      : prev.countertopOverhangBack,
                                }));
                              }}
                            />
                          </Field>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            ) : null}
          </div>
        </aside>

        <main data-testid="cabinet-preview" className="relative min-h-0 bg-[#e8ece7]">
          <CabinetPreview3D
            definition={deferredDefinition}
            generatedParts={previewParts}
            view={previewView}
            showClearances={showClearances}
            selection={semanticSelection}
            onSemanticSelect={handleSemanticPreviewSelection}
            dimensionPreview={dimensionPreview}
          />
          <CabinetOverallDimensionHandles
            widthMm={getCabinetOverallWidth(definition)}
            heightMm={getCabinetOverallHeight(definition)}
            depthMm={getCabinetOverallDepth(definition)}
            limits={{
              totalWidth: overallWidthLimits,
              depth: { minMm: 120, maxMm: 2500 },
            }}
            disabledFields={{ totalWidth: !overallWidthCanResize }}
            onPreviewChange={setDimensionPreview}
            onCommit={handleDimensionHandleCommit}
          />
          <CabinetSemanticEditOverlays
            definition={definition}
            activeModuleId={activeModule?.id}
            onPreviewChange={setSemanticEditPreview}
            onDividerCommit={commitModuleDividerResize}
            onShelfCommit={(input) => {
              if (input.moduleId === activeModule?.id) {
                updateActiveShelfPosition(input.shelfIndex, input.heightMm);
              }
            }}
          />
          <div className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2">
            <CabinetPreviewViewSelector value={previewView} onChange={setPreviewView} />
            <button
              type="button"
              data-testid="cabinet-preview-clearance-toggle"
              aria-pressed={showClearances}
              className={`inline-flex items-center gap-1.5 rounded-lg border border-white/60 px-2.5 py-2 text-[11px] font-semibold shadow-sm backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 ${showClearances ? "bg-blue-600 text-white" : "bg-white/90 text-neutral-700"}`}
              onClick={() => setShowClearances((value) => !value)}
            >
              {showClearances ? <Check aria-hidden="true" className="h-3 w-3" /> : null}
              Clearances
            </button>
          </div>
          {activeModuleIssues.length ? (
            <button
              type="button"
              data-testid="cabinet-preview-issue-marker"
              className="absolute bottom-4 left-4 z-30 rounded-full border border-white/60 bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-lg"
              onClick={() => {
                setOutputTab("issues");
                focusValidationIssue(activeModuleIssues[0]);
              }}
            >
              Module {activeModuleIndex + 1} · {activeModuleIssues.length}{" "}
              {activeModuleIssues.length === 1 ? "issue" : "issues"}
            </button>
          ) : null}
          <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-white/90 px-3 py-2 text-xs text-neutral-700 shadow-sm">
            <span className="block">W {formatProjectMeasurement(definition.totalWidth)} · H {formatProjectMeasurement(definition.height)} · D {formatProjectMeasurement(definition.depth)}</span>
            <span className="mt-1 block font-semibold text-blue-700">Selected: {semanticSelectionLabel}</span>
          </div>
          <div
            data-testid="cabinet-preview-status"
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute right-4 top-4 rounded-md bg-white/90 px-3 py-2 text-xs text-neutral-700 shadow-sm"
          >
            {previewStatus === "regenerating" ? "Regenerating preview..." : "Preview ready"}
          </div>
        </main>

        <aside className="flex min-h-0 flex-col border-l border-neutral-200 bg-white">
          <div className="grid min-h-0 flex-1 gap-5 overflow-auto p-4">
            <div
              role="tablist"
              aria-label="Millwork outputs"
              data-testid="cabinet-output-tabs"
              className="sticky top-0 z-10 grid grid-cols-3 gap-1 rounded-xl border border-neutral-200 bg-white/95 p-1 shadow-sm backdrop-blur"
            >
              {OUTPUT_TABS.map(([value, label]) => (
                <button
                  key={value}
                  id={`cabinet-output-tab-${value}`}
                  type="button"
                  role="tab"
                  data-testid={`cabinet-output-tab-${value}`}
                  aria-selected={outputTab === value}
                  aria-controls="cabinet-output-panel"
                  tabIndex={outputTab === value ? 0 : -1}
                  className={`rounded-lg px-2 py-2 text-[10px] font-semibold ${outputTab === value ? "bg-neutral-950 text-white" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"}`}
                  onClick={() => setOutputTab(value)}
                  onKeyDown={(event) => handleOutputTabKeyDown(event, value)}
                >
                  {value === "issues"
                    ? `${label} ${errors.length + warnings.length + infos.length || ""}`
                    : label}
                </button>
              ))}
            </div>
            <div
              id="cabinet-output-panel"
              role="tabpanel"
              aria-labelledby={`cabinet-output-tab-${outputTab}`}
              tabIndex={0}
              className="grid gap-5"
            >
            <div
              hidden={outputTab !== "issues"}
              data-testid="cabinet-validation"
              data-validation-policy="errors_block_warnings_allow"
              data-error-count={String(errors.length)}
              data-warning-count={String(warnings.length)}
              data-info-count={String(infos.length)}
              className="grid gap-2"
            >
              {sectionTitle("Validation")}
              {errors.length === 0 && warnings.length === 0 && infos.length === 0 ? (
                <p data-testid="cabinet-validation-success" className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Cabinet parameters are valid.</p>
              ) : (
                <div className="grid gap-2">
                  {[...errors, ...warnings, ...infos].map((issue) => (
                    <ValidationIssueCard
                      key={issue.id}
                      issue={issue}
                      onFocus={focusValidationIssue}
                      onRequestFix={requestValidationFix}
                    />
                  ))}
                </div>
              )}
              {pendingValidationFix ? (
                <ValidationFixPreview
                  pending={pendingValidationFix}
                  current={definition}
                  onCancel={() => setPendingValidationFix(null)}
                  onApply={() => commitValidationFix(pendingValidationFix.fix)}
                />
              ) : null}
            </div>

            <div hidden={outputTab !== "bom"} data-testid="cabinet-bom" data-bom-count={String(bom.length)} className="grid gap-2">
              {sectionTitle("BOM")}
              <div className="max-h-72 overflow-auto rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Part</th>
                      <th className="px-2 py-2 font-medium">Qty</th>
                      <th className="px-2 py-2 font-medium">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bom.map((item) => (
                      <tr key={item.id} data-testid="cabinet-bom-row" className="border-t border-neutral-100">
                        <td className="px-2 py-2">{item.name}</td>
                        <td className="px-2 py-2">{item.quantity}</td>
                        <td className="px-2 py-2 text-neutral-500">
                          {item.width}×{item.height}×{item.depth}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              hidden={outputTab !== "overview"}
              data-testid="cabinet-assembly-profile"
              data-assembly-profile-schema={documentation.assemblyProfile.schema}
              data-assembly-profile-label={documentation.assemblyProfile.label}
              data-assembly-profile-phase={documentation.assemblyProfile.projectPhase}
              data-assembly-profile-placement-kind={documentation.assemblyProfile.placementKind}
              data-assembly-profile-complexity={documentation.assemblyProfile.fabricationComplexity}
              className="grid gap-2"
            >
              {sectionTitle("Assembly Profile")}
              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
                <div className="flex items-center justify-between gap-3 text-sm font-semibold text-neutral-900">
                  <span>{documentation.assemblyProfile.label}</span>
                  <span>{documentation.assemblyProfile.fabricationComplexity}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  <span>Phase</span>
                  <span className="text-right">{documentation.assemblyProfile.projectPhase.replace(/_/g, " ")}</span>
                  <span>Placement</span>
                  <span className="text-right">{documentation.assemblyProfile.placementKind.replace(/_/g, " ")}</span>
                </div>
                <p className="mt-2 text-[11px] leading-4 text-neutral-500">
                  {documentation.assemblyProfile.quoteDrivers.join(", ")}
                </p>
              </div>
            </div>

            <div
              hidden={outputTab !== "overview"}
              data-testid="cabinet-quote-summary"
              data-quote-total={String(documentation.quoteSummary.estimatedTotal)}
              data-quote-line-count={String(documentation.quoteSummary.lineItems.length)}
              className="grid gap-2"
            >
              {sectionTitle("Preliminary Quote")}
              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
                <div className="flex items-center justify-between text-sm font-semibold text-neutral-900">
                  <span>Estimated total</span>
                  <span>
                    {documentation.quoteSummary.currency} {documentation.quoteSummary.estimatedTotal.toLocaleString()}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  <span>Materials</span>
                  <span className="text-right">{documentation.quoteSummary.materialCost.toLocaleString()}</span>
                  <span>Hardware</span>
                  <span className="text-right">{documentation.quoteSummary.hardwareCost.toLocaleString()}</span>
                  <span>Fabrication</span>
                  <span className="text-right">{documentation.quoteSummary.fabricationCost.toLocaleString()}</span>
                  <span>Install allowance</span>
                  <span className="text-right">{documentation.quoteSummary.installationAllowance.toLocaleString()}</span>
                  <span>Contingency</span>
                  <span className="text-right">{documentation.quoteSummary.contingency.toLocaleString()}</span>
                </div>
                <p className="mt-2 text-[11px] leading-4 text-neutral-500">
                  Preliminary only; supplier pricing and fabrication quotes are not connected yet.
                </p>
              </div>
            </div>

            <div
              hidden={outputTab !== "overview"}
              data-testid="cabinet-supplier-readiness"
              data-supplier-readiness-status={documentation.supplierReadiness.status}
              data-supplier-sku-mapping-count={String(documentation.supplierSkuMappings.length)}
              data-mapped-sku-count={String(documentation.supplierReadiness.mappedSkuCount)}
              data-missing-sku-count={String(documentation.supplierReadiness.missingSkuCount)}
              data-custom-quote-required-count={String(documentation.supplierReadiness.customQuoteRequiredCount)}
              data-release-blocker-count={String(documentation.supplierReadiness.releaseBlockerCount)}
              className="grid gap-2"
            >
              {sectionTitle("Supplier Readiness")}
              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
                <div className="flex items-center justify-between gap-3 text-sm font-semibold text-neutral-900">
                  <span>RFQ status</span>
                  <span className="text-right text-xs uppercase text-neutral-600">
                    {documentation.supplierReadiness.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  <span>Mapped SKUs</span>
                  <span className="text-right">{documentation.supplierReadiness.mappedSkuCount}</span>
                  <span>Missing SKUs</span>
                  <span className="text-right">{documentation.supplierReadiness.missingSkuCount}</span>
                  <span>Custom quote rows</span>
                  <span className="text-right">{documentation.supplierReadiness.customQuoteRequiredCount}</span>
                  <span>Release blockers</span>
                  <span className="text-right">{documentation.supplierReadiness.releaseBlockerCount}</span>
                </div>
              </div>
              <div className="max-h-44 overflow-auto rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Item</th>
                      <th className="px-2 py-2 font-medium">SKU</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentation.supplierSkuMappings.map((item) => (
                      <tr
                        key={item.id}
                        data-testid="cabinet-supplier-sku-row"
                        data-source-type={item.sourceType}
                        data-status={item.status}
                        className="border-t border-neutral-100"
                      >
                        <td className="px-2 py-2">{item.displayName}</td>
                        <td className="px-2 py-2 text-neutral-500">{item.skuId ?? "Quote"}</td>
                        <td className="px-2 py-2 text-neutral-500">{item.status.replace(/_/g, " ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              hidden={outputTab !== "overview"}
              data-testid="cabinet-fabrication-release-readiness"
              data-fabrication-release-status={documentation.fabricationReleaseReadiness.status}
              data-fabrication-release-required-count={String(documentation.fabricationReleaseReadiness.requiredGateCount)}
              data-fabrication-release-recommended-count={String(documentation.fabricationReleaseReadiness.recommendedGateCount)}
              data-fabrication-release-blocker-count={String(documentation.fabricationReleaseReadiness.blockerCount)}
              data-fabrication-release-gate-count={String(documentation.fabricationReleaseReadiness.fabricationReleaseGateCount)}
              data-installation-gate-count={String(documentation.fabricationReleaseReadiness.installationGateCount)}
              className="grid gap-2"
            >
              {sectionTitle("Fabrication Release")}
              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
                <div className="flex items-center justify-between gap-3 text-sm font-semibold text-neutral-900">
                  <span>Release status</span>
                  <span className="text-right text-xs uppercase text-neutral-600">
                    {documentation.fabricationReleaseReadiness.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  <span>Required gates</span>
                  <span className="text-right">{documentation.fabricationReleaseReadiness.requiredGateCount}</span>
                  <span>Blockers</span>
                  <span className="text-right">{documentation.fabricationReleaseReadiness.blockerCount}</span>
                  <span>Fabrication gates</span>
                  <span className="text-right">{documentation.fabricationReleaseReadiness.fabricationReleaseGateCount}</span>
                  <span>Install gates</span>
                  <span className="text-right">{documentation.fabricationReleaseReadiness.installationGateCount}</span>
                </div>
              </div>
            </div>

            <div
              hidden={outputTab !== "outputs"}
              data-testid="cabinet-dimension-schedule"
              data-dimension-schedule-count={String(documentation.dimensionSchedule.length)}
              className="grid gap-2"
            >
              {sectionTitle("Dimension Schedule")}
              <div className="max-h-40 overflow-auto rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Scope</th>
                      <th className="px-2 py-2 font-medium">Size</th>
                      <th className="px-2 py-2 font-medium">Offset</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentation.dimensionSchedule.map((item) => (
                      <tr key={item.id} data-testid="cabinet-dimension-schedule-row" className="border-t border-neutral-100">
                        <td className="px-2 py-2">{item.label}</td>
                        <td className="px-2 py-2 text-neutral-500">
                          {item.width}×{item.height}×{item.depth}
                        </td>
                        <td className="px-2 py-2 text-neutral-500">
                          {typeof item.frontOffsetX === "number" ? item.frontOffsetX : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              hidden={outputTab !== "outputs"}
              data-testid="cabinet-drawing-view-schedule"
              data-drawing-view-schedule-count={String(documentation.drawingViewSchedule.length)}
              className="grid gap-2"
            >
              {sectionTitle("Drawing Views")}
              <div className="max-h-40 overflow-auto rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">View</th>
                      <th className="px-2 py-2 font-medium">Sheet</th>
                      <th className="px-2 py-2 font-medium">Scale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentation.drawingViewSchedule.map((item) => (
                      <tr key={item.id} data-testid="cabinet-drawing-view-schedule-row" className="border-t border-neutral-100">
                        <td className="px-2 py-2">{item.label}</td>
                        <td className="px-2 py-2 text-neutral-500">{item.sheetRef}</td>
                        <td className="px-2 py-2 text-neutral-500">{item.scale}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              hidden={outputTab !== "materials"}
              data-testid="cabinet-material-schedule"
              data-material-schedule-count={String(documentation.materialSchedule.length)}
              className="grid gap-2"
            >
              {sectionTitle("Material Schedule")}
              <div className="max-h-44 overflow-auto rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Material</th>
                      <th className="px-2 py-2 font-medium">Parts</th>
                      <th className="px-2 py-2 font-medium">Area</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentation.materialSchedule.map((item) => (
                      <tr key={item.id} data-testid="cabinet-material-schedule-row" className="border-t border-neutral-100">
                        <td className="px-2 py-2">{item.materialName}</td>
                        <td className="px-2 py-2">{item.partCount}</td>
                        <td className="px-2 py-2 text-neutral-500">{item.areaSqM} m²</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              hidden={outputTab !== "hardware"}
              data-testid="cabinet-hardware-schedule"
              data-hardware-schedule-count={String(documentation.hardwareSchedule.length)}
              className="grid gap-2"
            >
              {sectionTitle("Hardware Schedule")}
              <div className="max-h-36 overflow-auto rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Hardware</th>
                      <th className="px-2 py-2 font-medium">Qty</th>
                      <th className="px-2 py-2 font-medium">Compatibility</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentation.hardwareSchedule.length ? (
                      documentation.hardwareSchedule.map((item) => (
                        <tr key={item.id} data-testid="cabinet-hardware-schedule-row" className="border-t border-neutral-100">
                          <td className="px-2 py-2">{item.hardwareName}</td>
                          <td className="px-2 py-2">{item.quantity}</td>
                          <td className="px-2 py-2 text-neutral-500">{labelize(item.compatibilityStatus ?? "compatible")}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-2 py-2 text-neutral-500" colSpan={3}>
                          No hardware scheduled.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              hidden={outputTab !== "materials"}
              data-testid="cabinet-edge-banding-schedule"
              data-edge-banding-schedule-count={String(documentation.edgeBandingSchedule.length)}
              data-edge-banding-total-m={String(
                Math.round(documentation.edgeBandingSchedule.reduce((sum, item) => sum + item.totalLengthM, 0) * 100) / 100
              )}
              className="grid gap-2"
            >
              {sectionTitle("Edge Banding")}
              <div className="max-h-36 overflow-auto rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Material</th>
                      <th className="px-2 py-2 font-medium">Treatment</th>
                      <th className="px-2 py-2 font-medium">Length</th>
                      <th className="px-2 py-2 font-medium">Parts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentation.edgeBandingSchedule.length ? (
                      documentation.edgeBandingSchedule.map((item) => (
                        <tr key={item.id} data-testid="cabinet-edge-banding-row" className="border-t border-neutral-100">
                          <td className="px-2 py-2">{item.edgeMaterialName}</td>
                          <td className="px-2 py-2 text-neutral-500">{labelize(item.edgeTreatment ?? "matching_edge_band")}</td>
                          <td className="px-2 py-2 text-neutral-500">{item.totalLengthM} m</td>
                          <td className="px-2 py-2">{item.partCount}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-2 py-2 text-neutral-500" colSpan={4}>
                          No edge banding scheduled.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              hidden={outputTab !== "bom"}
              data-testid="cabinet-cut-list"
              data-cut-list-count={String(documentation.cutList.length)}
              className="grid gap-2"
            >
              {sectionTitle("Cut List")}
              <div className="max-h-48 overflow-auto rounded-md border border-neutral-200">
                <table className="min-w-[760px] w-full text-left text-xs">
                  <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Part</th>
                      <th className="px-2 py-2 font-medium">Module</th>
                      <th className="px-2 py-2 font-medium">Size</th>
                      <th className="px-2 py-2 font-medium">Grain</th>
                      <th className="px-2 py-2 font-medium">Edge</th>
                      <th className="px-2 py-2 font-medium">Exposed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentation.cutList.slice(0, 40).map((item) => (
                      <tr key={item.id} data-testid="cabinet-cut-list-row" className="border-t border-neutral-100">
                        <td className="px-2 py-2">{item.name}</td>
                        <td className="px-2 py-2">{item.moduleId.replace("module-", "")}</td>
                        <td className="px-2 py-2 text-neutral-500">
                          {item.width}×{item.height}×{item.depth}
                        </td>
                        <td className="px-2 py-2 text-neutral-500">{labelize(item.grainDirection ?? "none")}</td>
                        <td className="px-2 py-2 text-neutral-500">{labelize(item.edgeTreatment ?? "none")}</td>
                        <td className="px-2 py-2 text-neutral-500">{item.exposedFaces?.map(labelize).join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              hidden={outputTab !== "outputs"}
              data-testid="cabinet-installer-notes"
              data-installer-note-count={String(documentation.installerNotes.length)}
              className="grid gap-2"
            >
              {sectionTitle("Installer Notes")}
              <div className="grid max-h-40 gap-2 overflow-auto rounded-md border border-neutral-200 p-2">
                {documentation.installerNotes.map((item) => (
                  <div key={item.id} data-testid="cabinet-installer-note-row" className="rounded-md bg-neutral-50 px-2 py-1.5 text-xs text-neutral-700">
                    <span className="font-semibold">{item.category}:</span> {formatProjectFeedback(item.message)}
                  </div>
                ))}
              </div>
            </div>

            <div
              hidden={outputTab !== "issues"}
              data-testid="cabinet-release-checklist"
              data-release-checklist-count={String(documentation.releaseChecklist.length)}
              data-release-blocker-count={String(
                documentation.releaseChecklist.filter((item) => item.status === "blocked").length
              )}
              className="grid gap-2"
            >
              {sectionTitle("Release Checklist")}
              <div className="grid max-h-44 gap-2 overflow-auto rounded-md border border-neutral-200 p-2">
                {documentation.releaseChecklist.map((item) => (
                  <div
                    key={item.id}
                    data-testid="cabinet-release-checklist-row"
                    className="rounded-md bg-neutral-50 px-2 py-1.5 text-xs text-neutral-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{item.label}</span>
                      <span className="shrink-0 rounded-sm bg-white px-1.5 py-0.5 text-[10px] uppercase text-neutral-500">
                        {item.status}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-neutral-500">
                      {item.owner} · {item.dueBefore.replace(/_/g, " ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {busyAction ? (
              <div data-testid="cabinet-action-status" className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
                {busyAction === "download"
                  ? "Exporting GLB..."
                  : busyAction === "source"
                    ? "Exporting source definition..."
                  : busyAction === "import"
                    ? "Importing source definition..."
                  : busyAction === "docs"
                    ? "Exporting documentation..."
                  : busyAction === "shopDrawing"
                    ? "Exporting shop drawing..."
                  : busyAction === "dxf"
                    ? "Exporting fabrication DXF..."
                  : busyAction === "rfq"
                    ? "Exporting fabrication RFQ..."
                  : busyAction === "package"
                    ? "Exporting package..."
                  : busyAction === "copy"
                    ? "Creating a separate millwork copy..."
                  : busyAction === "save"
                    ? "Saving millwork..."
                    : mode === "edit"
                      ? "Updating placed millwork..."
                      : "Generating millwork asset..."}
              </div>
            ) : null}

            {actionError ? (
              <div data-testid="cabinet-action-error" role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{formatProjectFeedback(actionError)}</div>
            ) : null}

            {actionSuccess ? (
              <div data-testid="cabinet-action-success" role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{formatProjectFeedback(actionSuccess)}</div>
            ) : null}

            <div className="grid gap-2">
              <input
                ref={sourceImportInputRef}
                type="file"
                accept="application/json,.json"
                data-testid="cabinet-import-source-definition-input"
                className="sr-only"
                onChange={handleImportSourceDefinition}
              />
              <div hidden={outputTab !== "outputs"} className="grid gap-2">
              <button
                type="button"
                data-testid="cabinet-download-glb"
                className="flex min-h-10 items-center justify-center gap-2 rounded-md bg-neutral-900 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!validation.valid || busyAction !== null}
                onClick={handleDownload}
              >
                <Download className="h-4 w-4" />
                {busyAction === "download" ? "Exporting..." : "Download GLB"}
              </button>
              <button
                type="button"
                data-testid="cabinet-download-source-definition"
                className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-neutral-300 px-3 text-sm font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!validation.valid || busyAction !== null}
                onClick={handleDownloadSourceDefinition}
              >
                <FileText className="h-4 w-4" />
                {busyAction === "source" ? "Exporting..." : "Download Source JSON"}
              </button>
              <button
                type="button"
                data-testid="cabinet-import-source-definition"
                className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-neutral-300 px-3 text-sm font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={busyAction !== null}
                onClick={() => sourceImportInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {busyAction === "import" ? "Importing..." : "Import Source JSON"}
              </button>
              <button
                type="button"
                data-testid="cabinet-download-documentation"
                className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-neutral-300 px-3 text-sm font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!validation.valid || busyAction !== null}
                onClick={handleDownloadDocumentation}
              >
                <FileText className="h-4 w-4" />
                {busyAction === "docs" ? "Exporting..." : "Download Docs CSV"}
              </button>
              <button
                type="button"
                data-testid="cabinet-download-shop-drawing-svg"
                className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-neutral-300 px-3 text-sm font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!validation.valid || busyAction !== null}
                onClick={handleDownloadShopDrawing}
              >
                <FileText className="h-4 w-4" />
                {busyAction === "shopDrawing" ? "Exporting..." : "Download Shop Drawing SVG"}
              </button>
              <button
                type="button"
                data-testid="cabinet-download-fabrication-dxf"
                className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-neutral-300 px-3 text-sm font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!validation.valid || busyAction !== null}
                onClick={handleDownloadDxf}
              >
                <FileText className="h-4 w-4" />
                {busyAction === "dxf" ? "Exporting..." : "Download Fabrication DXF"}
              </button>
              <button
                type="button"
                data-testid="cabinet-download-fabrication-rfq"
                className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-neutral-300 px-3 text-sm font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!validation.valid || busyAction !== null}
                onClick={handleDownloadRfq}
              >
                <FileText className="h-4 w-4" />
                {busyAction === "rfq" ? "Exporting..." : "Download RFQ JSON"}
              </button>
              <button
                type="button"
                data-testid="cabinet-download-package-json"
                className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-neutral-300 px-3 text-sm font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!validation.valid || busyAction !== null}
                onClick={handleDownloadPackage}
              >
                <FileText className="h-4 w-4" />
                {busyAction === "package" ? "Exporting..." : "Download Package JSON"}
              </button>
              </div>
            </div>
            </div>
          </div>
          <div className="grid shrink-0 gap-2 border-t border-neutral-200 bg-white/95 px-4 pb-4 pt-3 backdrop-blur">
            <button
              type="button"
              data-testid="cabinet-open-outputs"
              className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-neutral-300 px-3 text-sm font-semibold text-neutral-700"
              onClick={() => setOutputTab("outputs")}
            >
              <Download className="h-4 w-4" />
              Export…
            </button>
            {onPlaceInPlan ? (
              <button
                type="button"
                data-testid="cabinet-save-as-copy"
                className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-neutral-300 px-3 text-sm font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!validation.valid || busyAction !== null}
                onClick={handleSaveAsCopy}
              >
                <Copy className="h-4 w-4" />
                {busyAction === "copy" ? "Copying..." : "Save as copy"}
              </button>
            ) : null}
            {mode === "create" || (!onPlaceInPlan && onSave) ? (
              <button
                type="button"
                data-testid="cabinet-save-definition"
                className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-neutral-900 px-3 text-sm font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={(mode === "edit" && !onSave) || !validation.valid || busyAction !== null}
                onClick={handleSave}
              >
                <Save className="h-4 w-4" />
                {busyAction === "save"
                  ? "Saving..."
                  : mode === "create"
                    ? "Save as Reusable Template"
                    : "Save Definition"}
              </button>
            ) : null}
            {onPlaceInPlan ? (
              <button
                type="button"
                data-testid={mode === "edit" ? "cabinet-update-placement" : "cabinet-place-in-plan"}
                className="min-h-10 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!validation.valid || busyAction !== null}
                onClick={handlePlace}
              >
                {busyAction === "place" ? "Generating..." : mode === "edit" ? "Update Placed Millwork" : "Place in Plan"}
              </button>
            ) : null}
          </div>
        </aside>
      </div>
      </div>
    </div>
  );
}
