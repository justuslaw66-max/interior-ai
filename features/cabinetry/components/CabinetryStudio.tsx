"use client";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import "../cabinetry-tailwind.css";
import { CABINET_HARDWARE } from "../catalog/hardware";
import { CABINET_MATERIALS } from "../catalog/materials";
import {
  CABINET_EQUAL_MODULE_WIDTHS_PARAMETER_PATH,
  getCabinetAutomationState,
  getCabinetParameterState,
  isCabinetModuleWidthLocked,
  isCabinetOverallWidthLocked,
  resizeCabinetToOverallWidth,
  setCabinetAutomationMode,
  setCabinetEqualModuleSizing,
  setCabinetModuleWidthLocked,
  setCabinetOverallWidthLocked,
  setCabinetParameterState,
  syncCabinetDefinitionDimensions,
} from "../automation";
import { fitCabinetToSpace, type CabinetFitResult } from "../fitToSpace";
import { formatCabinetLabel } from "../formatCabinetLabel";
import { generateCabinetBOM } from "../generateCabinetBOM";
import { generateCabinetParts } from "../generateCabinetParts";
import { getCabinetOverallDepth, getCabinetOverallHeight, getCabinetOverallWidth } from "../layout";
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
import { getCabinetVisiblePreviewParts } from "../previewParts";
import { useDelayedCabinetPreviewRegenerationIndicator } from "../previewRegenerationIndicator";
import { resolveCabinetPartFabricationSpec } from "../fabricationSemantics";
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
  getCabinetDoorLayoutMode,
  getCabinetDrawerHeightMode,
  getCabinetDrawerHeightProportions,
  getCabinetEffectiveDoorCount,
  getCabinetHandlePlacementMode,
  isCabinetFrontHandleType,
  setCabinetDoorLayoutMode,
  setCabinetDrawerHeightMode,
  setCabinetHandlePlacementMode,
} from "../frontBehavior";
import { getCabinetWallBedRecommendedGeometry, isCabinetWallBedPanel } from "../convertibleLayout";
import { generateCabinetDocumentation } from "../generateCabinetDocumentation";
import { emitCabinetStudioAnalytics } from "../infrastructure/CabinetStudioAnalytics";
import {
  createCabinetStudioCopyDefinition,
  createCabinetStudioPlacementPayload,
  downloadCabinetStudioArtifact,
  getCabinetStudioExportDescriptor,
  readCabinetStudioSourceDefinition,
  type CabinetStudioExportArtifact,
} from "../infrastructure/CabinetStudioDocumentIO";
import {
  CABINET_PRESET_OPTIONS,
  cabinetPresetMatchesCatalogFilters,
  createCabinetPreset,
  getCabinetPresetSearchText,
  type CabinetPresetId,
  type CabinetTemplateCategory,
} from "../presets";
import { CABINET_PROPERTY_REGISTRY, filterCabinetProperties } from "../propertyRegistry";
import { findCabinetNonFiniteNumbers, validateCabinetNumberDraft } from "../numericInput";
import { validateCabinetDefinition } from "../validation";
import {
  applyCabinetWardrobeArrangement,
  CABINET_WARDROBE_ARRANGEMENTS,
  getMatchingCabinetWardrobeArrangementId,
  type CabinetWardrobeArrangementId,
} from "../wardrobeArrangements";
import {
  capCabinetCustomSpaces,
  isStoredCabinetCustomSpaceKind,
  parseStoredCabinetCustomSpace,
  readSavedCabinetTemplates,
  writeSavedCabinetTemplates,
} from "../storage/CabinetStudioLocalStorage";
import { useCabinetModuleReorderDrag } from "../hooks/useCabinetModuleReorderDrag";
import { useCabinetStudioCustomSpaces } from "../hooks/useCabinetStudioCustomSpaces";
import {
  useCabinetStudioMeasurementDrafts,
  type CabinetCustomSpaceDraft,
} from "../hooks/useCabinetStudioMeasurementDrafts";
import { useCabinetStudioPreferences } from "../hooks/useCabinetStudioPreferences";
import { useCabinetStudioPropertyFocus } from "../hooks/useCabinetStudioPropertyFocus";
import { useCabinetStudioSelectionController } from "../hooks/useCabinetStudioSelectionController";
import { useCabinetStudioValidationExposure } from "../hooks/useCabinetStudioValidationExposure";
import { applyCabinetModulePatchCommand } from "../state/CabinetStudioDefinitionCommands";
import {
  canRedoCabinetStudioHistory,
  canUndoCabinetStudioHistory,
  clearSavedTemplateFromCabinetStudioHistory,
  createCabinetHistoryEntry,
  createCabinetStudioHistory,
  recordCabinetStudioHistory,
  redoCabinetStudioHistory,
  undoCabinetStudioHistory,
} from "../state/CabinetStudioHistory";
import type {
  CabinetDefinition,
  CabinetFitAlignment,
  CabinetFitMode,
  CabinetHostSpace,
  CabinetModuleDefinition,
  CabinetValidationAutoFix,
  CabinetValidationIssue,
  CabinetWallBedMattressSize,
  CabinetWallBedOrientation,
  CabinetWallBedSideStorage,
} from "../types";
import type { CabinetryStudioProps } from "./CabinetryStudio.contract";
import type { CabinetTemplateSourceIdentity, SavedCabinetTemplate } from "./CabinetryStudio.types";
import type { CabinetOverallDimensionField } from "./CabinetOverallDimensionHandles";
import type { CabinetPreviewView } from "./CabinetPreviewCameraController";
import { useCabinetDesktopPreviewActive } from "./CabinetPreview3D";
import { CABINET_GUIDED_STEPS } from "./CabinetGuidedStepNavigation";
import type { CabinetOutputTab } from "./CabinetOutputTabs";
import { CabinetryStudioGuidedView } from "./CabinetryStudioGuidedView";
import { CabinetryStudioDetailedView } from "./CabinetryStudioDetailedView";
import { useCabinetMeasurementUnit } from "./CabinetMeasurementUnitContext";
import {
  CABINET_CONSTRUCTION_RESET_FIELDS,
  CABINET_SHELF_LAYOUT_FIELDS,
  GUIDED_HARDWARE,
} from "./CabinetryStudio.config";
import { resizeCabinetDefinition } from "./CabinetryStudio.calculations";
import {
  cabinetPresetIdFromDefinition,
  cabinetShelfLayoutParameterPath,
  getSpecialtyNumberFields,
} from "./CabinetryStudio.selectors";

export type { CabinetryStudioProps } from "./CabinetryStudio.contract";

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
  const desktopPreviewActive = useCabinetDesktopPreviewActive();
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
  const [showClearances, setShowClearances] = useState(isProWorkspace);
  const {
    experienceMode,
    chooseExperienceMode,
    showOnboarding,
    showOnboardingHelp,
    dismissOnboarding,
    moduleOptionsOpen,
    setModuleOptionsOpen,
    advancedOpen,
    setAdvancedOpen,
    fabricationOpen,
    setFabricationOpen,
  } = useCabinetStudioPreferences({
    isProWorkspace,
    mode,
    setShowClearances,
  });
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
  const [propertyQuery, setPropertyQuery] = useState("");
  const [outputTab, setOutputTab] = useState<CabinetOutputTab>("issues");
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(
    hydratedInitialDefinition?.fitState?.host.id ?? preferredSpaceId ?? null
  );
  const { customSpaces, setCustomSpaces } = useCabinetStudioCustomSpaces(
    isProWorkspace,
    hydratedInitialDefinition?.fitState?.host.kind !== "wall" &&
      hydratedInitialDefinition?.fitState?.host
      ? [hydratedInitialDefinition.fitState.host]
      : [],
    definition.fitState?.host.id
  );
  const [customSpaceDraft, setCustomSpaceDraft] =
    useState<CabinetCustomSpaceDraft>({
      kind: "rectangular_area",
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
  const [previewView, setPreviewView] = useState<CabinetPreviewView>("perspective");
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(true);
  const [pendingValidationFix, setPendingValidationFix] = useState<{
    issue: CabinetValidationIssue;
    fix: CabinetValidationAutoFix;
    candidate: CabinetDefinition;
  } | null>(null);
  const [explicitlyRevealedModuleOptionGroupId, setExplicitlyRevealedModuleOptionGroupId] =
    useState<CabinetModuleOptionGroupId | null>(null);
  const [busyAction, setBusyAction] = useState<"download" | "source" | "import" | "docs" | "shopDrawing" | "dxf" | "rfq" | "package" | "place" | "copy" | "save" | null>(null);
  const [actionError, setActionError] = useState<string | null>(() =>
    initialNumericIntegrityIssue
      ? `Stored design data contained a non-finite number at ${initialNumericIntegrityIssue.path}. A safe Base layout was opened instead; cancel to avoid replacing the stored design, or restore a valid template.`
      : null
  );
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const initialDefinitionRef = useRef(definition);
  const definitionRef = useRef(definition);
  const templateSourceRef = useRef<CabinetTemplateSourceIdentity>({
    presetId: activePresetId,
    savedTemplateId: activeSavedTemplateId,
  });
  const trackStudioInteraction = useCallback(
    (event: string, details: Record<string, unknown> = {}) => {
      emitCabinetStudioAnalytics(
        event,
        {
          accessLevel,
          mode,
          definition: definitionRef.current,
        },
        details
      );
    },
    [accessLevel, mode]
  );

  useCabinetStudioMeasurementDrafts({
    measurementUnit: projectMeasurementUnit,
    setMountingHeightDraft,
    setCustomSpaceDraft,
  });
  const focusPropertyControl = useCabinetStudioPropertyFocus({
    advancedOpen,
    fabricationOpen,
    moduleOptionsOpen,
    explicitlyRevealedModuleOptionGroupId,
    setAdvancedOpen,
    setFabricationOpen,
    setModuleOptionsOpen,
    setExplicitlyRevealedModuleOptionGroupId,
    trackStudioInteraction,
  });
  const historyRef = useRef(createCabinetStudioHistory());
  const deferredDefinition = useDeferredValue(definition);
  const previewRegenerationPending = deferredDefinition !== definition;
  const previewRegenerationIndicatorVisible =
    useDelayedCabinetPreviewRegenerationIndicator(previewRegenerationPending);
  const previewStatus = previewRegenerationIndicatorVisible ? "regenerating" : "ready";
  const generatedParts = useMemo(
    () => generateCabinetParts(deferredDefinition),
    [deferredDefinition]
  );
  const validation = useMemo(() => validateCabinetDefinition(definition), [definition]);
  useCabinetStudioValidationExposure({
    definitionId: definition.id,
    moduleCount: definition.modules.length,
    issues: validation.issues,
    trackStudioInteraction,
  });
  const bom = useMemo(
    () => generateCabinetBOM(deferredDefinition, generatedParts),
    [deferredDefinition, generatedParts]
  );
  const visiblePreviewParts = useMemo(
    () =>
      getCabinetVisiblePreviewParts(deferredDefinition, generatedParts, {
        showClearances,
      }),
    [deferredDefinition, generatedParts, showClearances]
  );
  const generatedPartIds = useMemo(
    () => new Set(visiblePreviewParts.map((part) => part.id)),
    [visiblePreviewParts]
  );
  const {
    activeModuleId,
    setActiveModuleId,
    semanticSelection,
    setSemanticSelection,
    selectStudioModule,
    selectSemanticPreview: handleSemanticPreviewSelection,
  } = useCabinetStudioSelectionController(definition, generatedPartIds);
  const activeModule =
    definition.modules.find((module) => module.id === activeModuleId) ??
    definition.modules[0];
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
    formatCabinetLabel(selectedPartMaterialId || "not assigned");
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
  const isSavedCustomSpace = (space: CabinetHostSpace) =>
    Boolean(
      parseStoredCabinetCustomSpace(space) &&
        customSpaces.some((candidate) => candidate.id === space.id) &&
        !availableSpaces.some((candidate) => candidate.id === space.id)
    );
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
      ? `${formatCabinetLabel(semanticSelection.partType ?? "part")} · Module ${Math.max(1, activeModuleIndex + 1)}`
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
    definitionRef.current = definition;
  }, [definition]);

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
      historyRef.current = recordCabinetStudioHistory(
        historyRef.current,
        createCabinetHistoryEntry(previousDefinition, templateSourceRef.current)
      );
    }
    definitionRef.current = nextDefinition;
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
    const result = applyCabinetModulePatchCommand(
      definitionRef.current,
      moduleId,
      patch
    );
    if (!result.ok) {
      setActionSuccess(null);
      setActionError(result.error);
      return false;
    }
    return updateDefinition(() => result.definition);
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
    writeSavedCabinetTemplates(templates);
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
    historyRef.current = recordCabinetStudioHistory(
      historyRef.current,
      createCabinetHistoryEntry(
        definitionRef.current,
        templateSourceRef.current
      )
    );
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
      historyRef.current = clearSavedTemplateFromCabinetStudioHistory(
        historyRef.current,
        templateId
      );
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
    const transition = undoCabinetStudioHistory(
      historyRef.current,
      createCabinetHistoryEntry(
        definitionRef.current,
        templateSourceRef.current
      )
    );
    if (!transition) return;
    historyRef.current = transition.history;
    const previous = transition.entry;
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
    const transition = redoCabinetStudioHistory(
      historyRef.current,
      createCabinetHistoryEntry(
        definitionRef.current,
        templateSourceRef.current
      )
    );
    if (!transition) return;
    historyRef.current = transition.history;
    const next = transition.entry;
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
    setActionSuccess(`${space.label} added as a measured ${formatCabinetLabel(space.kind)}.`);
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
        `${formatCabinetLabel(mattressSize)} mattress and ${orientation} opening applied with coordinated cabinet clearances.`
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
      setActionSuccess(`${formatCabinetLabel(sideStorage)} wall-bed side storage applied.`);
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
      setActionError(`${formatCabinetLabel(field)} is locked. Unlock it before changing this material.`);
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
      const nextStep = CABINET_GUIDED_STEPS.findIndex((step) => step.id === stepId);
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
  const {
    draggedModuleId,
    onModuleDragStart,
    onModuleDragEnd,
    onModuleDragOver,
    onModuleDrop,
  } = useCabinetModuleReorderDrag(reorderModule);

  const recordExportSuccess = (artifact: string, message: string) => {
    setActionSuccess(message);
    trackStudioInteraction("millwork_export_completed", { artifact });
  };

  const handleArtifactDownload = async (
    artifact: CabinetStudioExportArtifact
  ) => {
    const descriptor = getCabinetStudioExportDescriptor(artifact);
    setActionError(null);
    setActionSuccess(null);
    setBusyAction(descriptor.busyAction);
    try {
      const completed = await downloadCabinetStudioArtifact(definition, artifact);
      recordExportSuccess(completed.artifact, completed.successMessage);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : descriptor.fallbackError
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownload = () => void handleArtifactDownload("glb");
  const handleDownloadDocumentation = () =>
    void handleArtifactDownload("documentation_csv");
  const handleDownloadSourceDefinition = () =>
    void handleArtifactDownload("source_definition_json");

  const handleImportSourceDefinition = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setActionError(null);
    setActionSuccess(null);
    setBusyAction("import");
    try {
      const parsedDefinition = await readCabinetStudioSourceDefinition(file);
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

  const handleDownloadShopDrawing = () =>
    void handleArtifactDownload("shop_drawing_svg");
  const handleDownloadDxf = () =>
    void handleArtifactDownload("fabrication_dxf");
  const handleDownloadRfq = () =>
    void handleArtifactDownload("fabrication_rfq_json");
  const handleDownloadPackage = () =>
    void handleArtifactDownload("millwork_package_json");

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
      const payload = await createCabinetStudioPlacementPayload(definition);
      const placed = await onPlaceInPlan(payload);
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
      const copyDefinition = createCabinetStudioCopyDefinition(definition);
      const copyBom = generateCabinetBOM(copyDefinition);
      const payload = await createCabinetStudioPlacementPayload(copyDefinition, {
        placeAsCopy: true,
        bom: copyBom,
      });
      const placed = await onPlaceInPlan(payload);
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
  const canUndo = canUndoCabinetStudioHistory(historyRef.current);
  const canRedo = canRedoCabinetStudioHistory(historyRef.current);

  if (effectiveExperienceMode === "guided") {
    return (
      <CabinetryStudioGuidedView
        bindings={[
        accessLevel,
        actionError,
        actionSuccess,
        activeDoorCount,
        activeDoorLayoutMode,
        activeDrawerHeightMode,
        activeDrawerHeightProportions,
        activeHasDoorFront,
        activeHasDrawerFront,
        activeMaterialLocked,
        activeModule,
        activeModuleIndex,
        activePreset,
        activePresetId,
        activeSavedTemplateId,
        activeShelfPositions,
        activeShelfSpacingLocked,
        activeShelfSpacingMode,
        activeWardrobeArrangementId,
        addCustomMeasuredSpace,
        addModule,
        allAvailableSpaces,
        applyGuidedMaterial,
        applyGuidedWardrobeArrangement,
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
        customSpaceDraft,
        customSpaceFormOpen,
        deferredDefinition,
        definition,
        deletedTemplateUndo,
        deleteSavedTemplate,
        desktopPreviewActive,
        dismissOnboarding,
        documentation,
        equalModuleSizingLocked,
        errors,
        fitAlignment,
        fitFeedback,
        fitMode,
        focusValidationIssue,
        formatProjectFeedback,
        formatProjectMeasurement,
        generatedParts,
        getIssuesForField,
        getIssuesForModule,
        guidedHardwareOptions,
        guidedStep,
        handleApplyFit,
        handleDimensionHandleCommit,
        handleGuidedOverallWidth,
        handleOverallHeightOrDepth,
        handlePlace,
        handleSave,
        handleSaveAsCopy,
        handleSemanticPreviewSelection,
        infos,
        isGuidedHardwareSelected,
        isSavedCustomSpace,
        isProWorkspace,
        mode,
        mobilePreviewOpen,
        mountingHeightDraft,
        onCancel,
        onPlaceInPlan,
        onSave,
        overallWidthBlockedByModuleLocks,
        overallWidthCanResize,
        overallWidthLimits,
        overallWidthLocked,
        parseProjectMeasurementDraft,
        pendingValidationFix,
        previewStatus,
        previewView,
        projectMeasurementUnit,
        redoDefinition,
        removeCustomMeasuredSpace,
        requestValidationFix,
        requiredHostType,
        resetActiveModule,
        resetSizeSection,
        resetSpaceSection,
        resetStyleSection,
        restoreDeletedTemplate,
        restoreTemplateDefaults,
        selectedSpace,
        selectedSpaceHostCompatibility,
        selectedSpaceId,
        selectStudioModule,
        semanticSelection,
        semanticSelectionLabel,
        setActionError,
        setActiveDoorLayoutMode,
        setActiveDrawerHeightMode,
        setActiveShelfSpacingMode,
        setCustomSpaceDraft,
        setCustomSpaceFormOpen,
        setFitAlignment,
        setFitFeedback,
        setFitMode,
        setGuidedStep,
        setMobilePreviewOpen,
        setMountingHeightDraft,
        setOutputTab,
        setPendingValidationFix,
        setPreviewView,
        setSelectedSpaceId,
        setShowClearances,
        setTemplateCategory,
        setTemplateQuery,
        showClearances,
        showOnboarding,
        showOnboardingHelp,
        structuralModuleChangeDisabled,
        structuralModuleChangeTitle,
        supportsGuidedWardrobeArrangements,
        templateCategory,
        templateQuery,
        toggleActiveMaterialLock,
        toggleActiveModuleWidthLock,
        toggleActiveShelfSpacingLock,
        toggleEqualModuleSizing,
        toggleOverallWidthLock,
        toProjectMeasurementValue,
        undoDefinition,
        unlockModules,
        updateActiveDrawerProportion,
        updateActiveShelfPosition,
        updateDefinition,
        updateModule,
        validation,
        visibleSavedTemplates,
        visibleTemplates,
        warnings,
      ]}
      />
    );
  }

  return (
    <CabinetryStudioDetailedView
      bindings={[
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
      ]}
    />
  );
}
