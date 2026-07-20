"use client";

import { Lock, Unlock } from "lucide-react";
import { CABINET_MATERIALS } from "../catalog/materials";
import {
  getCabinetParameterState,
  isCabinetModuleWidthLocked,
  setCabinetParameterState,
} from "../automation";
import {
  CABINET_DEFAULT_BACKSPLASH_HEIGHT,
  CABINET_DEFAULT_BACKSPLASH_THICKNESS,
  CABINET_DEFAULT_COUNTERTOP_FRONT_OVERHANG,
  CABINET_DEFAULT_END_PANEL_THICKNESS,
  CABINET_DEFAULT_COUNTERTOP_SIDE_OVERHANG,
  CABINET_DEFAULT_COUNTERTOP_THICKNESS,
  getCabinetToeKickDepth,
  getCabinetToeKickSetback,
} from "../layout";
import { getCabinetMinimumModuleWidthMm } from "../moduleWidthRules";
import { resolveCabinetModuleExposedFaces } from "../fabricationSemantics";
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
  hasCabinetTrimRevealStrip,
} from "../trimLayout";
import {
  CABINET_WALL_BED_MATTRESS_DIMENSIONS,
  getCabinetConvertibleOpenDepth,
  getCabinetWallBedDisplayState,
  getCabinetWallBedMattressSize,
  getCabinetWallBedOrientation,
  getCabinetWallBedSideStorage,
  isCabinetWallBedPanel,
} from "../convertibleLayout";
import type { CabinetPresetId } from "../presets";
import type {
  CabinetAutomationState,
  CabinetBOMItem,
  CabinetDefinition,
  CabinetDocumentationSnapshot,
  CabinetDrawerHeightMode,
  CabinetFrontLayoutMode,
  CabinetFrontType,
  CabinetHardwareRef,
  CabinetHandlePlacementMode,
  CabinetLaundryApplianceKind,
  CabinetLifestyleInsertKind,
  CabinetMillworkComponentType,
  CabinetModuleDefinition,
  CabinetPart,
  CabinetPartFabricationSpec,
  CabinetGrainDirection,
  CabinetEdgeTreatment,
  CabinetValidationAutoFix,
  CabinetValidationIssue,
  CabinetStairScribeDirection,
  CabinetTrimEndTreatment,
  CabinetTrimPlacement,
  CabinetRequiredHostType,
  CabinetShelfSpacingMode,
  CabinetUnitType,
  CabinetWallBedDisplayState,
  CabinetWallBedMattressSize,
  CabinetWallBedOrientation,
  CabinetWallBedSideStorage,
  CabinetValidationResult,
  DoorStyle,
} from "../types";
import type { CabinetOverallDimensionField } from "./CabinetOverallDimensionHandles";
import { CabinetAssemblyInspector } from "./CabinetAssemblyInspector";
import { CabinetPartInspector } from "./CabinetPartInspector";
import type { CabinetPreviewView } from "./CabinetPreviewCameraController";
import {
  CabinetModuleOptionGroup,
  Field,
  GuidedNumberField,
  sectionTitle,
  selectClass,
} from "./CabinetStudioFormPrimitives";
import { CabinetStudioHeader } from "./CabinetStudioHeader";
import { CabinetStudioNavigator } from "./CabinetStudioNavigator";
import { CabinetStudioOutputsPanel } from "./CabinetStudioOutputsPanel";
import { CabinetDetailedCompactPreview, CabinetDetailedPreviewPanel } from "./CabinetStudioDetailedPreviews";
import { CabinetNumberField } from "./CabinetNumberField";
import {
  CabinetDrawerConfigurationPreview,
  CabinetWallBedConfigurationPreview,
  CabinetWallPanelPatternPreview,
} from "./CabinetConfigurationPreviews";
import {
  componentTypes,
  doorStyles,
  edgeTreatmentOptions,
  exposedFaceOptions,
  frontTypes,
  grainDirectionOptions,
  hingeSides,
  laundryApplianceKinds,
  lifestyleInsertKinds,
  stairScribeDirections,
  trimEndTreatments,
  trimPlacements,
  unitTypes,
} from "./CabinetryStudio.config";
import { getSpecialtyNumberValue, guidedFrontPatch } from "./CabinetryStudio.selectors";
import type { SavedCabinetTemplate } from "./CabinetryStudio.types";
import type { Dispatch, DragEvent, SetStateAction } from "react";
import type { CabinetHardwareCompatibilityResult } from "../hardwareCompatibility";
import { formatCabinetLabel } from "../formatCabinetLabel";
import type { CabinetOverallWidthLimits } from "../moduleWidthConstraints";
import type { CabinetPropertyMetadata } from "../propertyRegistry";
import type { CabinetStudioExperience } from "../studioOnboarding";
import type { CabinetMeasurementUnit } from "../measurementUnits";
import type { CabinetSemanticSelection } from "./CabinetSceneItem";
import type { SpecialtyNumberFieldDefinition } from "./CabinetryStudio.types";

export type CabinetryStudioDetailedViewBindings = readonly [
  accessLevel: "consumer" | "pro",
  actionError: string | null,
  actionSuccess: string | null,
  activeComponentType: CabinetMillworkComponentType,
  activeDoorCount: number,
  activeDoorLayoutMode: CabinetFrontLayoutMode,
  activeDrawerHeightMode: CabinetDrawerHeightMode,
  activeDrawerHeightProportions: number[],
  activeFrontMaterialLocked: boolean,
  activeHandlePlacementAvailable: boolean,
  activeHandlePlacementMode: CabinetHandlePlacementMode,
  activeHardwareCompatibility: CabinetHardwareCompatibilityResult | null,
  activeHardwareOptions: CabinetHardwareRef[],
  activeHasDoorFront: boolean,
  activeHasDrawerFront: boolean,
  activeIsCabinetComponent: boolean,
  activeMaterialLocked: boolean,
  activeModule: CabinetModuleDefinition,
  activeModuleIndex: number,
  activeModuleIssues: CabinetValidationIssue[],
  activePresetId: CabinetPresetId | null,
  activeSavedTemplateId: string | null,
  activeShelfPositions: number[],
  activeShelfSpacingLocked: boolean,
  activeShelfSpacingMode: CabinetShelfSpacingMode,
  addModule: () => void,
  advancedOpen: boolean,
  applyPreset: (presetId: CabinetPresetId) => void,
  applySavedTemplate: (template: SavedCabinetTemplate) => void,
  automation: CabinetAutomationState,
  bom: CabinetBOMItem[],
  busyAction: "source" | "download" | "import" | "docs" | "shopDrawing" | "dxf" | "rfq" | "package" | "place" | "copy" | "save" | null,
  canRedo: boolean,
  canUndo: boolean,
  changeModuleSizingMode: (mode: "automatic" | "manual") => void,
  chooseExperienceMode: (experience: CabinetStudioExperience) => void,
  commitModuleDividerResize: (input: { leftModuleId: string; rightModuleId: string; leftWidthMm: number; rightWidthMm: number; }) => void,
  commitValidationFix: (fix: CabinetValidationAutoFix) => void,
  deferredDefinition: CabinetDefinition,
  definition: CabinetDefinition,
  deleteModule: () => void,
  desktopPreviewActive: boolean | null,
  detailedDefinitionNumberFieldProps: (field: Extract<keyof CabinetDefinition, string>, value: number) => { fieldPath: keyof CabinetDefinition; issues: CabinetValidationIssue[]; value: number; onCommit: (nextValue: number) => boolean; },
  detailedModuleNumberFieldProps: (field: Extract<keyof CabinetModuleDefinition, string>, value: number) => { fieldPath: keyof CabinetModuleDefinition; issues: CabinetValidationIssue[]; value: number; onCommit: (nextValue: number) => boolean; },
  documentation: CabinetDocumentationSnapshot,
  draggedModuleId: string | null,
  duplicateModule: () => void,
  errors: CabinetValidationIssue[],
  fabricationOpen: boolean,
  focusPropertyControl: (controlTestId: string) => void,
  focusValidationIssue: (issue: CabinetValidationIssue) => void,
  formatProjectFeedback: (message: string) => string,
  formatProjectMeasurement: (valueMm: number) => string,
  generatedParts: CabinetPart[],
  getIssuesForField: (field: string, moduleId?: string) => CabinetValidationIssue[],
  getIssuesForModule: (moduleId: string) => CabinetValidationIssue[],
  handleDimensionHandleCommit: (field: CabinetOverallDimensionField, valueMm: number) => void,
  handleDownload: () => undefined,
  handleDownloadDocumentation: () => undefined,
  handleDownloadDxf: () => undefined,
  handleDownloadPackage: () => undefined,
  handleDownloadRfq: () => undefined,
  handleDownloadShopDrawing: () => undefined,
  handleDownloadSourceDefinition: () => undefined,
  handleGuidedOverallWidth: (value: number) => void,
  handleImportSourceDefinition: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>,
  handleOverallHeightOrDepth: (field: "height" | "depth", valueMm: number) => void,
  handlePlace: () => Promise<void>,
  handleSave: () => Promise<void>,
  handleSaveAsCopy: () => Promise<void>,
  handleSemanticPreviewSelection: (selection: CabinetSemanticSelection) => void,
  infos: CabinetValidationIssue[],
  isProWorkspace: boolean,
  mode: "create" | "edit",
  moduleOptionsOpen: boolean,
  moveActiveModule: (direction: -1 | 1) => void,
  onCancel: (() => void) | undefined,
  onModuleDragEnd: () => void,
  onModuleDragOver: (targetModuleId: string, event: DragEvent<HTMLButtonElement>) => void,
  onModuleDragStart: (moduleId: string, event: DragEvent<HTMLButtonElement>) => void,
  onModuleDrop: (targetModuleId: string, event: DragEvent<HTMLButtonElement>) => void,
  onPlaceInPlan: ((payload: { definition: CabinetDefinition; glbBlob: Blob; bom: CabinetBOMItem[]; placeAsCopy?: boolean; }) => boolean | Promise<boolean>) | undefined,
  onSave: ((definition: CabinetDefinition) => boolean | Promise<boolean>) | undefined,
  outputTab: "materials" | "hardware" | "overview" | "issues" | "bom" | "outputs",
  overallWidthBlockedByModuleLocks: boolean,
  overallWidthCanResize: boolean,
  overallWidthLimits: CabinetOverallWidthLimits,
  overallWidthLocked: boolean,
  pendingValidationFix: { issue: CabinetValidationIssue; fix: CabinetValidationAutoFix; candidate: CabinetDefinition; } | null,
  previewStatus: "regenerating" | "ready",
  previewView: CabinetPreviewView,
  projectMeasurementUnit: CabinetMeasurementUnit,
  propertyQuery: string,
  propertyResults: CabinetPropertyMetadata[],
  redoDefinition: () => void,
  requestValidationFix: (issue: CabinetValidationIssue, fix: CabinetValidationAutoFix) => void,
  requiredHostType: CabinetRequiredHostType | undefined,
  resetActiveModule: () => void,
  resetConstructionSection: () => void,
  resetParameterToAutomatic: (path: string) => void,
  restoreTemplateDefaults: () => void,
  savedTemplates: SavedCabinetTemplate[],
  selectedPart: CabinetPart | null,
  selectedPartFabrication: CabinetPartFabricationSpec | null,
  selectedPartIsDoorFront: boolean,
  selectedPartIsDrawerOrHandle: boolean,
  selectedPartIsHangingRod: boolean,
  selectedPartIsShelf: boolean,
  selectedPartMaterialId: string,
  selectedPartMaterialName: string,
  selectedPartMaterialTarget: "countertop" | "front" | "backsplash" | "face_frame" | "carcass" | null,
  selectStudioModule: (moduleId: string) => void,
  semanticSelection: CabinetSemanticSelection,
  semanticSelectionLabel: string,
  setActiveDoorLayoutMode: (mode: "recommended" | "manual") => void,
  setActiveDrawerHeightMode: (mode: "equal" | "recommended" | "custom") => void,
  setActiveHandlePlacementMode: (mode: "automatic" | "custom") => void,
  setActiveShelfSpacingMode: (mode: "even" | "custom") => void,
  setAdvancedOpen: Dispatch<SetStateAction<boolean>>,
  setExplicitlyRevealedModuleOptionGroupId: Dispatch<SetStateAction<"lighting" | "mudroom" | "laundry" | "pantry" | "library" | "trim" | "installation_cleat" | "slat" | "anti_tip" | "hanging_rods" | "shelf_pins" | "hamper" | "panel" | "ceiling" | "fireplace" | "convertible" | "platform_bed" | "stair" | "room_divider" | "lifestyle" | "wine" | "seating" | "sink" | "office" | "media" | null>>,
  setFabricationOpen: Dispatch<SetStateAction<boolean>>,
  setModuleOptionsOpen: Dispatch<SetStateAction<boolean>>,
  setOutputTab: Dispatch<SetStateAction<"materials" | "hardware" | "overview" | "issues" | "bom" | "outputs">>,
  setPendingValidationFix: Dispatch<SetStateAction<{ issue: CabinetValidationIssue; fix: CabinetValidationAutoFix; candidate: CabinetDefinition; } | null>>,
  setPreviewView: Dispatch<SetStateAction<CabinetPreviewView>>,
  setPropertyQuery: Dispatch<SetStateAction<string>>,
  setSemanticSelection: Dispatch<SetStateAction<CabinetSemanticSelection>>,
  setShowClearances: Dispatch<SetStateAction<boolean>>,
  showClearances: boolean,
  specialtyNumberFields: SpecialtyNumberFieldDefinition[],
  structuralModuleChangeDisabled: boolean,
  structuralModuleChangeTitle: "Manual sizing cannot change the module total while overall width is locked" | "Preserve the overall target and redistribute unlocked module widths" | "Preserve entered module widths and derive the new overall width",
  toggleActiveMaterialLock: () => void,
  toggleActiveModuleWidthLock: () => void,
  toggleActiveShelfSpacingLock: () => void,
  toggleEqualModuleSizing: () => void,
  toggleOverallWidthLock: () => void,
  trackStudioInteraction: (event: string, details?: Record<string, unknown>) => void,
  undoDefinition: () => void,
  updateActiveDrawerProportion: (index: number, percentage: number) => void,
  updateActiveShelfPosition: (index: number, valueMm: number) => void,
  updateDefinition: (updater: (draft: CabinetDefinition) => CabinetDefinition) => boolean,
  updateModule: (moduleId: string, patch: Partial<CabinetModuleDefinition>) => boolean,
  updateSelectedPartMaterial: (materialId: string) => void,
  updateWallBedSideStorage: (sideStorage: CabinetWallBedSideStorage) => void,
  updateWallBedSize: (mattressSize: CabinetWallBedMattressSize, orientation: CabinetWallBedOrientation) => void,
  validation: CabinetValidationResult,
  visibleModuleOptionGroupIds: Set<"lighting" | "mudroom" | "laundry" | "pantry" | "library" | "trim" | "installation_cleat" | "slat" | "anti_tip" | "hanging_rods" | "shelf_pins" | "hamper" | "panel" | "ceiling" | "fireplace" | "convertible" | "platform_bed" | "stair" | "room_divider" | "lifestyle" | "wine" | "seating" | "sink" | "office" | "media">,
  warnings: CabinetValidationIssue[],
];

export function CabinetryStudioDetailedView({
  bindings,
}: {
  bindings: CabinetryStudioDetailedViewBindings;
}) {
  const [
    accessLevel,
    actionError,
    actionSuccess,
    activeComponentType,
    activeDoorCount,
    activeDoorLayoutMode,
    activeDrawerHeightMode,
    activeDrawerHeightProportions,
    activeFrontMaterialLocked,
    activeHandlePlacementAvailable,
    activeHandlePlacementMode,
    activeHardwareCompatibility,
    activeHardwareOptions,
    activeHasDoorFront,
    activeHasDrawerFront,
    activeIsCabinetComponent,
    activeMaterialLocked,
    activeModule,
    activeModuleIndex,
    activeModuleIssues,
    activePresetId,
    activeSavedTemplateId,
    activeShelfPositions,
    activeShelfSpacingLocked,
    activeShelfSpacingMode,
    addModule,
    advancedOpen,
    applyPreset,
    applySavedTemplate,
    automation,
    bom,
    busyAction,
    canRedo,
    canUndo,
    changeModuleSizingMode,
    chooseExperienceMode,
    commitModuleDividerResize,
    commitValidationFix,
    deferredDefinition,
    definition,
    deleteModule,
    desktopPreviewActive,
    detailedDefinitionNumberFieldProps,
    detailedModuleNumberFieldProps,
    documentation,
    draggedModuleId,
    duplicateModule,
    errors,
    fabricationOpen,
    focusPropertyControl,
    focusValidationIssue,
    formatProjectFeedback,
    formatProjectMeasurement,
    generatedParts,
    getIssuesForField,
    getIssuesForModule,
    handleDimensionHandleCommit,
    handleDownload,
    handleDownloadDocumentation,
    handleDownloadDxf,
    handleDownloadPackage,
    handleDownloadRfq,
    handleDownloadShopDrawing,
    handleDownloadSourceDefinition,
    handleGuidedOverallWidth,
    handleImportSourceDefinition,
    handleOverallHeightOrDepth,
    handlePlace,
    handleSave,
    handleSaveAsCopy,
    handleSemanticPreviewSelection,
    infos,
    isProWorkspace,
    mode,
    moduleOptionsOpen,
    moveActiveModule,
    onCancel,
    onModuleDragEnd,
    onModuleDragOver,
    onModuleDragStart,
    onModuleDrop,
    onPlaceInPlan,
    onSave,
    outputTab,
    overallWidthBlockedByModuleLocks,
    overallWidthCanResize,
    overallWidthLimits,
    overallWidthLocked,
    pendingValidationFix,
    previewStatus,
    previewView,
    projectMeasurementUnit,
    propertyQuery,
    propertyResults,
    redoDefinition,
    requestValidationFix,
    requiredHostType,
    resetActiveModule,
    resetConstructionSection,
    resetParameterToAutomatic,
    restoreTemplateDefaults,
    savedTemplates,
    selectedPart,
    selectedPartFabrication,
    selectedPartIsDoorFront,
    selectedPartIsDrawerOrHandle,
    selectedPartIsHangingRod,
    selectedPartIsShelf,
    selectedPartMaterialId,
    selectedPartMaterialName,
    selectedPartMaterialTarget,
    selectStudioModule,
    semanticSelection,
    semanticSelectionLabel,
    setActiveDoorLayoutMode,
    setActiveDrawerHeightMode,
    setActiveHandlePlacementMode,
    setActiveShelfSpacingMode,
    setAdvancedOpen,
    setExplicitlyRevealedModuleOptionGroupId,
    setFabricationOpen,
    setModuleOptionsOpen,
    setOutputTab,
    setPendingValidationFix,
    setPreviewView,
    setPropertyQuery,
    setSemanticSelection,
    setShowClearances,
    showClearances,
    specialtyNumberFields,
    structuralModuleChangeDisabled,
    structuralModuleChangeTitle,
    toggleActiveMaterialLock,
    toggleActiveModuleWidthLock,
    toggleActiveShelfSpacingLock,
    toggleEqualModuleSizing,
    toggleOverallWidthLock,
    trackStudioInteraction,
    undoDefinition,
    updateActiveDrawerProportion,
    updateActiveShelfPosition,
    updateDefinition,
    updateModule,
    updateSelectedPartMaterial,
    updateWallBedSideStorage,
    updateWallBedSize,
    validation,
    visibleModuleOptionGroupIds,
    warnings,
  ] = bindings;


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
      <CabinetStudioHeader
        experience="detailed"
        isProWorkspace={isProWorkspace}
        mode={mode}
        canUndo={canUndo}
        canRedo={canRedo}
        onChooseExperience={chooseExperienceMode}
        onUndo={undoDefinition}
        onRedo={redoDefinition}
        onRestoreTemplate={restoreTemplateDefaults}
        onClose={onCancel}
      />

      <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 lg:hidden">
        <span>Detailed controls work best on a larger screen.</span>
        <button type="button" className="shrink-0 rounded px-1 font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-800" onClick={() => chooseExperienceMode("guided")}>
          Use guided setup
        </button>
      </div>

      <CabinetDetailedCompactPreview
        definition={deferredDefinition}
        generatedParts={generatedParts}
        desktopPreviewActive={desktopPreviewActive === true}
        view={previewView}
        showClearances={showClearances}
        selection={semanticSelection}
        activeModuleId={activeModule?.id ?? null}
        status={previewStatus}
        formatMeasurement={formatProjectMeasurement}
        onViewChange={setPreviewView}
        onSemanticSelect={handleSemanticPreviewSelection}
        onSelectModule={selectStudioModule}
      />

      <div className="hidden flex-1 grid-cols-[290px_minmax(360px,1fr)_310px] overflow-hidden lg:grid">
        <aside className="overflow-auto border-r border-neutral-200 bg-white p-4">
          <div className="grid gap-5">
            <CabinetStudioNavigator
              activePresetId={activePresetId}
              activeSavedTemplateId={activeSavedTemplateId}
              savedTemplates={savedTemplates}
              modules={definition.modules}
              activeModuleId={activeModule?.id ?? null}
              activeModuleIndex={activeModuleIndex}
              draggedModuleId={draggedModuleId}
              moduleSizingMode={automation.moduleSizingMode}
              structuralModuleChangeDisabled={structuralModuleChangeDisabled}
              structuralModuleChangeTitle={structuralModuleChangeTitle}
              selection={semanticSelection}
              propertyQuery={propertyQuery}
              propertyResults={propertyResults}
              formatMeasurement={formatProjectMeasurement}
              getIssuesForModule={getIssuesForModule}
              onApplyPreset={applyPreset}
              onApplySavedTemplate={(templateId) => {
                const template = savedTemplates.find(
                  (candidate) => candidate.id === templateId
                );
                if (template) applySavedTemplate(template);
              }}
              onSelectModule={selectStudioModule}
              onSelectAssembly={() =>
                setSemanticSelection({
                  scope: "assembly",
                  cabinetDefinitionId: definition.id,
                  additive: false,
                })
              }
              onModuleDragStart={onModuleDragStart}
              onModuleDragEnd={onModuleDragEnd}
              onModuleDragOver={onModuleDragOver}
              onModuleDrop={onModuleDrop}
              onAddModule={addModule}
              onDuplicateModule={duplicateModule}
              onMoveActiveModule={moveActiveModule}
              onDeleteModule={deleteModule}
              onChangeModuleSizingMode={changeModuleSizingMode}
              onPropertyQueryChange={(query) => {
                setPropertyQuery(query);
                setExplicitlyRevealedModuleOptionGroupId(null);
              }}
              onSelectProperty={(property) => {
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
            />

            {semanticSelection.scope === "assembly" ? (
              <CabinetAssemblyInspector
                definition={definition}
                widthLimits={overallWidthLimits}
                widthCanResize={overallWidthCanResize}
                widthLocked={overallWidthLocked}
                widthBlockedByModuleLocks={overallWidthBlockedByModuleLocks}
                getIssuesForField={getIssuesForField}
                onWidthCommit={handleGuidedOverallWidth}
                onDimensionCommit={handleOverallHeightOrDepth}
                onToggleWidthLock={toggleOverallWidthLock}
                onOpenGuidedFit={() => chooseExperienceMode("guided")}
              />
            ) : null}

            {activeModule && semanticSelection.scope === "part" ? (
              <CabinetPartInspector
                definition={definition}
                module={activeModule}
                moduleIndex={activeModuleIndex}
                selectedPart={selectedPart}
                selectedPartType={semanticSelection.partType ?? null}
                materialTarget={selectedPartMaterialTarget}
                materialId={selectedPartMaterialId}
                materialName={selectedPartMaterialName}
                materialLocked={activeMaterialLocked}
                frontMaterialLocked={activeFrontMaterialLocked}
                isDoorFront={selectedPartIsDoorFront}
                isDrawerOrHandle={selectedPartIsDrawerOrHandle}
                isShelf={selectedPartIsShelf}
                isHangingRod={selectedPartIsHangingRod}
                hardwareOptions={activeHardwareOptions}
                hardwareCompatibility={activeHardwareCompatibility}
                handlePlacementMode={activeHandlePlacementMode}
                handlePlacementAvailable={activeHandlePlacementAvailable}
                shelfSpacingLocked={activeShelfSpacingLocked}
                shelfSpacingMode={activeShelfSpacingMode}
                shelfPositions={activeShelfPositions}
                fabrication={selectedPartFabrication}
                issues={activeModuleIssues}
                formatMeasurement={formatProjectMeasurement}
                formatFeedback={formatProjectFeedback}
                getIssuesForField={getIssuesForField}
                onToggleMaterialLock={toggleActiveMaterialLock}
                onUpdatePartMaterial={updateSelectedPartMaterial}
                onUpdateModule={updateModule}
                onSetHandlePlacementMode={setActiveHandlePlacementMode}
                onToggleShelfSpacingLock={toggleActiveShelfSpacingLock}
                onSetShelfSpacingMode={setActiveShelfSpacingMode}
                onShelfPositionCommit={updateActiveShelfPosition}
                onFocusIssue={focusValidationIssue}
                onOpenParentModule={() => selectStudioModule(activeModule.id)}
              />
            ) : null}

            {activeModule && semanticSelection.scope === "module" ? (
              <>
                <div className="grid gap-3">
                  {sectionTitle("Dimensions")}
                  <div className="grid grid-cols-3 gap-2">
                    {(["width", "height", "depth"] as const).map((field) => (
                      <Field key={field} label={formatCabinetLabel(field)}>
                        <CabinetNumberField
                          label={formatCabinetLabel(field)}
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
                      {unitTypes.map((unitType) => <option key={unitType} value={unitType}>{formatCabinetLabel(unitType)}</option>)}
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
                      {componentTypes.map((componentType) => <option key={componentType} value={componentType}>{formatCabinetLabel(componentType)}</option>)}
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
                        <p className="text-xs font-semibold text-blue-950">{formatCabinetLabel(activeComponentType)} properties</p>
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
                              ariaLabel={`${formatCabinetLabel(getCabinetWallBedMattressSize(activeModule))} ${formatCabinetLabel(getCabinetWallBedOrientation(activeModule))} wall bed shown ${getCabinetWallBedDisplayState(activeModule)} with ${formatCabinetLabel(getCabinetWallBedSideStorage(activeModule))} side storage`}
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
                                  <span className="block font-semibold">{formatCabinetLabel(size)}</span>
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
                                {formatCabinetLabel(orientation)} opening
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
                                    {formatCabinetLabel(sideStorage)}
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
                                <option key={sideStorage} value={sideStorage}>{formatCabinetLabel(sideStorage)}</option>
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
                                {trimPlacements.map((placement) => <option key={placement} value={placement}>{formatCabinetLabel(placement)}</option>)}
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
                                {trimEndTreatments.map((treatment) => <option key={treatment} value={treatment}>{formatCabinetLabel(treatment)}</option>)}
                              </select>
                            </Field>
                            <Field label="Right end">
                              <select data-testid="cabinet-input-trim-right-end-treatment" className={selectClass()} value={activeModule.trimRightEndTreatment ?? "butt"} onChange={(event) => updateModule(activeModule.id, { trimRightEndTreatment: event.target.value as CabinetTrimEndTreatment })}>
                                {trimEndTreatments.map((treatment) => <option key={treatment} value={treatment}>{formatCabinetLabel(treatment)}</option>)}
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
                      {formatCabinetLabel(activeModule.millworkComponentType ?? "cabinet")}
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
                        {trimPlacements.map((placement) => <option key={placement} value={placement}>{formatCabinetLabel(placement)}</option>)}
                      </select>
                    </Field>
                    <Field label="Trim height">
                      <CabinetNumberField label="Trim height" hideLabel compact testId="cabinet-input-trim-setout-height" min={0} step={10} unit="mm" {...detailedModuleNumberFieldProps("trimSetoutHeight", activeModule.trimSetoutHeight ?? 0)} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <Field label="Left end">
                      <select data-testid="cabinet-input-trim-left-end-treatment" className={selectClass()} value={activeModule.trimLeftEndTreatment ?? "butt"} onChange={(event) => updateModule(activeModule.id, { trimLeftEndTreatment: event.target.value as CabinetTrimEndTreatment })}>
                        {trimEndTreatments.map((treatment) => <option key={treatment} value={treatment}>{formatCabinetLabel(treatment)}</option>)}
                      </select>
                    </Field>
                    <Field label="Right end">
                      <select data-testid="cabinet-input-trim-right-end-treatment" className={selectClass()} value={activeModule.trimRightEndTreatment ?? "butt"} onChange={(event) => updateModule(activeModule.id, { trimRightEndTreatment: event.target.value as CabinetTrimEndTreatment })}>
                        {trimEndTreatments.map((treatment) => <option key={treatment} value={treatment}>{formatCabinetLabel(treatment)}</option>)}
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
                        {stairScribeDirections.map((direction) => <option key={direction} value={direction}>{formatCabinetLabel(direction)}</option>)}
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
                        {lifestyleInsertKinds.map((kind) => <option key={kind} value={kind}>{formatCabinetLabel(kind)}</option>)}
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
                          {laundryApplianceKinds.map((kind) => <option key={kind} value={kind}>{formatCabinetLabel(kind)}</option>)}
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
                      {frontTypes.map((frontType) => <option key={frontType} value={frontType}>{formatCabinetLabel(frontType)}</option>)}
                    </select>
                  </Field>
                  <Field label="Door style">
                    <select data-testid="cabinet-input-door-style" className={selectClass()} value={activeModule.doorStyle} onChange={(event) => updateModule(activeModule.id, { doorStyle: event.target.value as DoorStyle })}>
                      {doorStyles.map((doorStyle) => <option key={doorStyle} value={doorStyle}>{formatCabinetLabel(doorStyle)}</option>)}
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
                      {hingeSides.map((hingeSide) => <option key={hingeSide} value={hingeSide}>{formatCabinetLabel(hingeSide)}</option>)}
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
                          {formatCabinetLabel(mode)}
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
                            {formatCabinetLabel(mode)}
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
                            Resolved for this module: {resolveCabinetModuleExposedFaces(definition, activeModule).map(formatCabinetLabel).join(", ")}.
                          </p>
                        )}
                      </div>
                      {selectedPart && selectedPartFabrication ? (
                        <div className="grid gap-1 rounded-md border border-blue-200 bg-blue-50 p-2 text-[11px] leading-5 text-blue-900" data-testid="cabinet-selected-part-fabrication">
                          <span className="font-semibold">Selected {formatCabinetLabel(selectedPart.type)}</span>
                          <span>Cut face: {formatCabinetLabel(selectedPartFabrication.cutFace.widthAxis)} × {formatCabinetLabel(selectedPartFabrication.cutFace.heightAxis)}; thickness {formatCabinetLabel(selectedPartFabrication.cutFace.thicknessAxis)}</span>
                          <span>Grain: {formatCabinetLabel(selectedPartFabrication.grainDirection)} ({formatCabinetLabel(selectedPartFabrication.grainAxis)})</span>
                          <span>Edges: {formatCabinetLabel(selectedPartFabrication.edgeTreatment)} · {formatProjectMeasurement(selectedPartFabrication.treatedLengthMm)} · {selectedPartFabrication.treatedEdges.length ? selectedPartFabrication.treatedEdges.map(formatCabinetLabel).join(", ") : "none"}</span>
                          <span>Exposed faces: {selectedPartFabrication.exposedFaces.length ? selectedPartFabrication.exposedFaces.map(formatCabinetLabel).join(", ") : "none"}</span>
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
                                {formatCabinetLabel(parameterState.source)}
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

        <CabinetDetailedPreviewPanel
          interaction={{
            previewDefinition: deferredDefinition,
            interactionDefinition: definition,
            generatedParts,
            desktopPreviewActive: desktopPreviewActive === true,
            view: previewView,
            showClearances,
            selection: semanticSelection,
            onSemanticSelect: handleSemanticPreviewSelection,
            showDimensionHandles: true,
            dimensionLimits: {
              totalWidth: overallWidthLimits,
              depth: { minMm: 120, maxMm: 2500 },
            },
            disabledDimensionFields: {
              totalWidth: !overallWidthCanResize,
            },
            onDimensionCommit: handleDimensionHandleCommit,
            showSemanticEditOverlays: true,
            activeModuleId: activeModule?.id,
            onDividerCommit: commitModuleDividerResize,
            onShelfCommit: (input) => {
              if (input.moduleId === activeModule?.id) {
                updateActiveShelfPosition(input.shelfIndex, input.heightMm);
              }
            },
          }}
          view={previewView}
          showClearances={showClearances}
          activeModuleIndex={activeModuleIndex}
          activeModuleIssues={activeModuleIssues}
          dimensionsLabel={`W ${formatProjectMeasurement(definition.totalWidth)} · H ${formatProjectMeasurement(definition.height)} · D ${formatProjectMeasurement(definition.depth)}`}
          selectionLabel={semanticSelectionLabel}
          status={previewStatus}
          onViewChange={setPreviewView}
          onToggleClearances={() => setShowClearances((value) => !value)}
          onSelectIssue={(issue) => {
            setOutputTab("issues");
            focusValidationIssue(issue);
          }}
        />

        <CabinetStudioOutputsPanel
          outputTab={outputTab}
          definition={definition}
          bom={bom}
          documentation={documentation}
          errors={errors}
          warnings={warnings}
          infos={infos}
          pendingValidationFix={pendingValidationFix}
          valid={validation.valid}
          busyAction={busyAction}
          mode={mode}
          actionError={actionError}
          actionSuccess={actionSuccess}
          canSaveDefinition={Boolean(onSave)}
          canPlaceInPlan={Boolean(onPlaceInPlan)}
          formatFeedback={formatProjectFeedback}
          onTabChange={setOutputTab}
          onFocusIssue={focusValidationIssue}
          onRequestFix={requestValidationFix}
          onCancelFix={() => setPendingValidationFix(null)}
          onApplyFix={() => {
            if (pendingValidationFix) {
              commitValidationFix(pendingValidationFix.fix);
            }
          }}
          onImportSource={handleImportSourceDefinition}
          onDownloadGlb={handleDownload}
          onDownloadSource={handleDownloadSourceDefinition}
          onDownloadDocumentation={handleDownloadDocumentation}
          onDownloadShopDrawing={handleDownloadShopDrawing}
          onDownloadDxf={handleDownloadDxf}
          onDownloadRfq={handleDownloadRfq}
          onDownloadPackage={handleDownloadPackage}
          onSaveAsCopy={handleSaveAsCopy}
          onSaveDefinition={handleSave}
          onPlaceInPlan={handlePlace}
        />
      </div>
      </div>
    </div>
  );
}
