"use client";

import { Check, Clock3, Lock, MapPin, Plus, Search, Trash2, Unlock } from "lucide-react";
import { CABINET_HARDWARE, isCabinetFrontHardwareType } from "../catalog/hardware";
import { CABINET_MATERIALS } from "../catalog/materials";
import {
  isCabinetModuleWidthLocked,
  setCabinetModuleWidth,
  setCabinetOverallWidthLocked,
} from "../automation";
import { getCabinetAvailableSegments, type CabinetFitResult } from "../fitToSpace";
import { formatCabinetLabel } from "../formatCabinetLabel";
import { getCabinetOverallDepth, getCabinetOverallHeight, getCabinetOverallWidth } from "../layout";
import { getCabinetMinimumModuleWidthMm } from "../moduleWidthRules";
import { resolveCabinetTemplateHostCompatibility } from "../hostCompatibility";
import { createCabinetPreset, type CabinetPresetId, type CabinetTemplateCategory } from "../presets";
import { CABINET_WARDROBE_ARRANGEMENTS, type CabinetWardrobeArrangementId } from "../wardrobeArrangements";
import type { CabinetCustomSpaceDraft } from "../hooks/useCabinetStudioMeasurementDrafts";
import type {
  CabinetAutomationState,
  CabinetBOMItem,
  CabinetDefinition,
  CabinetDocumentationSnapshot,
  CabinetDrawerHeightMode,
  CabinetFrontLayoutMode,
  CabinetFitAlignment,
  CabinetFitMode,
  CabinetHostSpace,
  CabinetModuleDefinition,
  CabinetPart,
  CabinetValidationAutoFix,
  CabinetValidationIssue,
  CabinetRequiredHostType,
  CabinetShelfSpacingMode,
  CabinetValidationResult,
} from "../types";
import type { CabinetOverallDimensionField } from "./CabinetOverallDimensionHandles";
import { CabinetPreviewViewSelector, type CabinetPreviewView } from "./CabinetPreviewCameraController";
import { CabinetPreview3D } from "./CabinetPreview3D";
import { CabinetTemplateDiagram, CabinetWardrobeArrangementDiagram } from "./CabinetTemplateDiagrams";
import { ModuleIssueBadges } from "./CabinetValidationFeedback";
import { GuidedNumberField } from "./CabinetStudioFormPrimitives";
import { CABINET_GUIDED_STEPS, CabinetGuidedStepNavigation } from "./CabinetGuidedStepNavigation";
import { CabinetStudioHeader } from "./CabinetStudioHeader";
import { CabinetGuidedActionFooter } from "./CabinetGuidedActionFooter";
import { CabinetGuidedPreviewPanel } from "./CabinetGuidedPreviewPanel";
import { CabinetGuidedReviewPanel } from "./CabinetGuidedReviewPanel";
import { CabinetDoorStylePreview, CabinetHandleTypePreview } from "./CabinetChoicePreviews";
import { CabinetDrawerConfigurationPreview } from "./CabinetConfigurationPreviews";
import { CabinetContextualOnboarding } from "./CabinetContextualOnboarding";
import {
  GUIDED_MATERIALS,
  GUIDED_TEMPLATE_CATEGORIES,
  doorStyles,
  frontTypes,
} from "./CabinetryStudio.config";
import { guidedFrontPatch } from "./CabinetryStudio.selectors";
import type { SavedCabinetTemplate } from "./CabinetryStudio.types";
import type { Dispatch, SetStateAction } from "react";
import type { CabinetHardwareCatalogItem } from "../catalog/hardware";
import type { CabinetTemplateHostCompatibility } from "../hostCompatibility";
import type { CabinetOverallWidthLimits } from "../moduleWidthConstraints";
import type { CabinetPresetOption } from "../presets";
import type { CabinetStudioExperience } from "../studioOnboarding";
import type { CabinetMeasurementUnit } from "../measurementUnits";
import type { CabinetSemanticSelection } from "./CabinetSceneItem";

export type CabinetryStudioGuidedViewBindings = readonly [
  accessLevel: "consumer" | "pro",
  actionError: string | null,
  actionSuccess: string | null,
  activeDoorCount: number,
  activeDoorLayoutMode: CabinetFrontLayoutMode,
  activeDrawerHeightMode: CabinetDrawerHeightMode,
  activeDrawerHeightProportions: number[],
  activeHasDoorFront: boolean,
  activeHasDrawerFront: boolean,
  activeMaterialLocked: boolean,
  activeModule: CabinetModuleDefinition,
  activeModuleIndex: number,
  activePreset: CabinetPresetOption | null,
  activePresetId: CabinetPresetId | null,
  activeSavedTemplateId: string | null,
  activeShelfPositions: number[],
  activeShelfSpacingLocked: boolean,
  activeShelfSpacingMode: CabinetShelfSpacingMode,
  activeWardrobeArrangementId: CabinetWardrobeArrangementId | null,
  addCustomMeasuredSpace: () => void,
  addModule: () => void,
  allAvailableSpaces: CabinetHostSpace[],
  applyGuidedMaterial: (materialId: string) => void,
  applyGuidedWardrobeArrangement: (arrangementId: CabinetWardrobeArrangementId) => void,
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
  customSpaceDraft: CabinetCustomSpaceDraft,
  customSpaceFormOpen: boolean,
  deferredDefinition: CabinetDefinition,
  definition: CabinetDefinition,
  deletedTemplateUndo: { template: SavedCabinetTemplate; index: number; restoreSourceForDefinitionId: string | null; } | null,
  deleteSavedTemplate: (templateId: string) => void,
  desktopPreviewActive: boolean | null,
  dismissOnboarding: () => void,
  documentation: CabinetDocumentationSnapshot,
  equalModuleSizingLocked: boolean,
  errors: CabinetValidationIssue[],
  fitAlignment: CabinetFitAlignment,
  fitFeedback: CabinetFitResult | null,
  fitMode: CabinetFitMode,
  focusValidationIssue: (issue: CabinetValidationIssue) => void,
  formatProjectFeedback: (message: string) => string,
  formatProjectMeasurement: (valueMm: number) => string,
  generatedParts: CabinetPart[],
  getIssuesForField: (field: string, moduleId?: string) => CabinetValidationIssue[],
  getIssuesForModule: (moduleId: string) => CabinetValidationIssue[],
  guidedHardwareOptions: CabinetHardwareCatalogItem[],
  guidedStep: number,
  handleApplyFit: () => void,
  handleDimensionHandleCommit: (field: CabinetOverallDimensionField, valueMm: number) => void,
  handleGuidedOverallWidth: (value: number) => void,
  handleOverallHeightOrDepth: (field: "height" | "depth", valueMm: number) => void,
  handlePlace: () => Promise<void>,
  handleSave: () => Promise<void>,
  handleSaveAsCopy: () => Promise<void>,
  handleSemanticPreviewSelection: (selection: CabinetSemanticSelection) => void,
  infos: CabinetValidationIssue[],
  isGuidedHardwareSelected: (hardwareId: string) => boolean,
  isSavedCustomSpace: (space: CabinetHostSpace) => boolean,
  isProWorkspace: boolean,
  mode: "create" | "edit",
  mobilePreviewOpen: boolean,
  mountingHeightDraft: string,
  onCancel: (() => void) | undefined,
  onPlaceInPlan: ((payload: { definition: CabinetDefinition; glbBlob: Blob; bom: CabinetBOMItem[]; placeAsCopy?: boolean; }) => boolean | Promise<boolean>) | undefined,
  onSave: ((definition: CabinetDefinition) => boolean | Promise<boolean>) | undefined,
  overallWidthBlockedByModuleLocks: boolean,
  overallWidthCanResize: boolean,
  overallWidthLimits: CabinetOverallWidthLimits,
  overallWidthLocked: boolean,
  parseProjectMeasurementDraft: (draft: string, minimumMm: number, maximumMm: number) => number | null,
  pendingValidationFix: { issue: CabinetValidationIssue; fix: CabinetValidationAutoFix; candidate: CabinetDefinition; } | null,
  previewStatus: "regenerating" | "ready",
  previewView: CabinetPreviewView,
  projectMeasurementUnit: CabinetMeasurementUnit,
  redoDefinition: () => void,
  removeCustomMeasuredSpace: (space: CabinetHostSpace) => void,
  requestValidationFix: (issue: CabinetValidationIssue, fix: CabinetValidationAutoFix) => void,
  requiredHostType: CabinetRequiredHostType | undefined,
  resetActiveModule: () => void,
  resetSizeSection: () => void,
  resetSpaceSection: () => void,
  resetStyleSection: () => void,
  restoreDeletedTemplate: () => void,
  restoreTemplateDefaults: () => void,
  selectedSpace: CabinetHostSpace | null,
  selectedSpaceHostCompatibility: CabinetTemplateHostCompatibility | null,
  selectedSpaceId: string | null,
  selectStudioModule: (moduleId: string) => void,
  semanticSelection: CabinetSemanticSelection,
  semanticSelectionLabel: string,
  setActionError: Dispatch<SetStateAction<string | null>>,
  setActiveDoorLayoutMode: (mode: "recommended" | "manual") => void,
  setActiveDrawerHeightMode: (mode: "equal" | "recommended" | "custom") => void,
  setActiveShelfSpacingMode: (mode: "even" | "custom") => void,
  setCustomSpaceDraft: Dispatch<SetStateAction<CabinetCustomSpaceDraft>>,
  setCustomSpaceFormOpen: Dispatch<SetStateAction<boolean>>,
  setFitAlignment: Dispatch<SetStateAction<CabinetFitAlignment>>,
  setFitFeedback: Dispatch<SetStateAction<CabinetFitResult | null>>,
  setFitMode: Dispatch<SetStateAction<CabinetFitMode>>,
  setGuidedStep: Dispatch<SetStateAction<number>>,
  setMobilePreviewOpen: Dispatch<SetStateAction<boolean>>,
  setMountingHeightDraft: Dispatch<SetStateAction<string>>,
  setOutputTab: Dispatch<SetStateAction<"materials" | "hardware" | "overview" | "issues" | "bom" | "outputs">>,
  setPendingValidationFix: Dispatch<SetStateAction<{ issue: CabinetValidationIssue; fix: CabinetValidationAutoFix; candidate: CabinetDefinition; } | null>>,
  setPreviewView: Dispatch<SetStateAction<CabinetPreviewView>>,
  setSelectedSpaceId: Dispatch<SetStateAction<string | null>>,
  setShowClearances: Dispatch<SetStateAction<boolean>>,
  setTemplateCategory: Dispatch<SetStateAction<CabinetTemplateCategory | "Featured" | "All">>,
  setTemplateQuery: Dispatch<SetStateAction<string>>,
  showClearances: boolean,
  showOnboarding: boolean,
  showOnboardingHelp: () => void,
  structuralModuleChangeDisabled: boolean,
  structuralModuleChangeTitle: "Manual sizing cannot change the module total while overall width is locked" | "Preserve the overall target and redistribute unlocked module widths" | "Preserve entered module widths and derive the new overall width",
  supportsGuidedWardrobeArrangements: boolean,
  templateCategory: CabinetTemplateCategory | "Featured" | "All",
  templateQuery: string,
  toggleActiveMaterialLock: () => void,
  toggleActiveModuleWidthLock: () => void,
  toggleActiveShelfSpacingLock: () => void,
  toggleEqualModuleSizing: () => void,
  toggleOverallWidthLock: () => void,
  toProjectMeasurementValue: (valueMm: number) => number,
  undoDefinition: () => void,
  unlockModules: (moduleIds: string[]) => void,
  updateActiveDrawerProportion: (index: number, percentage: number) => void,
  updateActiveShelfPosition: (index: number, valueMm: number) => void,
  updateDefinition: (updater: (draft: CabinetDefinition) => CabinetDefinition) => boolean,
  updateModule: (moduleId: string, patch: Partial<CabinetModuleDefinition>) => boolean,
  validation: CabinetValidationResult,
  visibleSavedTemplates: SavedCabinetTemplate[],
  visibleTemplates: CabinetPresetOption[],
  warnings: CabinetValidationIssue[],
];

export function CabinetryStudioGuidedView({
  bindings,
}: {
  bindings: CabinetryStudioGuidedViewBindings;
}) {
  const [
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
  ] = bindings;

    const currentStep = CABINET_GUIDED_STEPS[guidedStep];
    const currentMaterial = CABINET_MATERIALS.find(
      (material) => material.id === (activeModule?.frontMaterialId ?? activeModule?.materialId)
    );
    const currentHardware = CABINET_HARDWARE.find(
      (hardware) => hardware.id === (activeModule?.hardwareId ?? "none")
    );
    const supportsGuidedLayout = (activeModule?.millworkComponentType ?? "cabinet") === "cabinet";
    const consumerEstimate = documentation.quoteSummary;

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
          <CabinetStudioHeader
            experience="guided"
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

          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(560px,1.08fr)_minmax(380px,0.92fr)]">
            <section className="min-h-0 overflow-y-auto border-r border-neutral-200 px-4 py-5 sm:px-6 lg:px-8">
              <CabinetGuidedStepNavigation
                currentStepIndex={guidedStep}
                onStepChange={setGuidedStep}
              />

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
                {mobilePreviewOpen && desktopPreviewActive === false ? (
                  <div
                    id="cabinet-mobile-preview"
                    data-testid="cabinet-mobile-preview"
                    className="relative mt-3 h-72 overflow-hidden rounded-2xl border border-neutral-200 bg-[#e5e7e1]"
                  >
                    <CabinetPreview3D
                      definition={deferredDefinition}
                      generatedParts={generatedParts}
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
                    Step {guidedStep + 1} of {CABINET_GUIDED_STEPS.length}
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
                      onShow={showOnboardingHelp}
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
                                  {formatCabinetLabel(preset.safetyClassification)}
                                </span>
                              </span>
                              <span className="line-clamp-1 text-[10px] text-neutral-400" title={preset.applicableRoomTypes.map(formatCabinetLabel).join(", ")}>
                                Best for {preset.applicableRoomTypes.slice(0, 3).map(formatCabinetLabel).join(", ")}
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
                            const savedCustomSpace = isSavedCustomSpace(space);
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
                                {isProWorkspace && savedCustomSpace ? (
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
                                  {formatCabinetLabel(value)}
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
                              <span className="font-semibold">{formatCabinetLabel(issue.severity)}:</span> {formatProjectFeedback(issue.message)}
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
                                    {adjustment.moduleId}: {formatProjectMeasurement(adjustment.previousWidthMm)} → {formatProjectMeasurement(adjustment.nextWidthMm)} ({formatCabinetLabel(adjustment.source)})
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
                      onShow={showOnboardingHelp}
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
                      onShow={showOnboardingHelp}
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
                            {formatCabinetLabel(value)}
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
                                        {formatCabinetLabel(frontType)}
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
                                      {formatCabinetLabel(mode)}
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
                          {activePreset?.label ?? "This template"} already includes a professionally configured {formatCabinetLabel(activeModule.millworkComponentType ?? "component")} layout. {isProWorkspace
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
                                <span>{formatCabinetLabel(doorStyle)}</span>
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
                  <CabinetGuidedReviewPanel
                    showOnboarding={showOnboarding}
                    isProWorkspace={isProWorkspace}
                    templateLabel={activePreset?.label ?? definition.name}
                    overallSizeLabel={`${formatProjectMeasurement(definition.totalWidth)} × ${formatProjectMeasurement(definition.height)} × ${formatProjectMeasurement(definition.depth)}`}
                    moduleCount={definition.modules.length}
                    finishLabel={currentMaterial?.name ?? "Custom finish"}
                    quoteSummary={consumerEstimate}
                    definition={definition}
                    errors={errors}
                    warnings={warnings}
                    issues={validation.issues}
                    bomCount={bom.length}
                    pendingValidationFix={pendingValidationFix}
                    onDismissOnboarding={dismissOnboarding}
                    onShowOnboarding={showOnboardingHelp}
                    onFocusIssue={focusValidationIssue}
                    onRequestFix={requestValidationFix}
                    onCancelFix={() => setPendingValidationFix(null)}
                    onApplyFix={() => {
                      if (pendingValidationFix) {
                        commitValidationFix(pendingValidationFix.fix);
                      }
                    }}
                  />
                ) : null}
              </div>
            </section>

            <CabinetGuidedPreviewPanel
              interaction={{
                previewDefinition: deferredDefinition,
                interactionDefinition: definition,
                generatedParts,
                desktopPreviewActive: desktopPreviewActive === true,
                view: previewView,
                showClearances,
                selection: semanticSelection,
                onSemanticSelect: handleSemanticPreviewSelection,
                previewContainerClassName: "absolute inset-0",
                showDimensionHandles: guidedStep === 2 || guidedStep === 3,
                dimensionLimits: {
                  totalWidth: overallWidthLimits,
                  depth: { minMm: 120, maxMm: 2500 },
                },
                disabledDimensionFields: {
                  totalWidth: !overallWidthCanResize,
                },
                onDimensionCommit: handleDimensionHandleCommit,
                showSemanticEditOverlays: isProWorkspace && guidedStep === 3,
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
              isProWorkspace={isProWorkspace}
              presetLabel={activePreset?.label ?? definition.name}
              dimensionsLabel={`W ${formatProjectMeasurement(definition.totalWidth)} · H ${formatProjectMeasurement(definition.height)} · D ${formatProjectMeasurement(definition.depth)}`}
              selectionLabel={semanticSelectionLabel}
              materialLabel={currentMaterial?.name ?? "Custom finish"}
              hardwareLabel={currentHardware?.name ?? "No handles"}
              errorCount={errors.length}
              warningCount={warnings.length}
              infoCount={infos.length}
              bomCount={bom.length}
              onViewChange={setPreviewView}
              onToggleClearances={() => setShowClearances((value) => !value)}
            />
          </div>

          <CabinetGuidedActionFooter
            currentStep={guidedStep}
            lastStep={CABINET_GUIDED_STEPS.length - 1}
            isProWorkspace={isProWorkspace}
            valid={validation.valid}
            busyAction={busyAction}
            mode={mode}
            actionError={actionError}
            actionSuccess={actionSuccess}
            canPlaceInPlan={Boolean(onPlaceInPlan)}
            canSaveDefinition={Boolean(onSave)}
            formatFeedback={formatProjectFeedback}
            onBack={() => setGuidedStep((step) => Math.max(0, step - 1))}
            onOpenDetailed={() => chooseExperienceMode("detailed")}
            onNext={() =>
              setGuidedStep((step) =>
                Math.min(CABINET_GUIDED_STEPS.length - 1, step + 1)
              )
            }
            onOpenOutputs={() => {
              setOutputTab("outputs");
              chooseExperienceMode("detailed");
            }}
            onSaveAsCopy={handleSaveAsCopy}
            onSaveDefinition={handleSave}
            onPlaceInPlan={handlePlace}
          />
        </div>
      </div>
    );
}
