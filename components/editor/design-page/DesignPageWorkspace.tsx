"use client";

import * as THREE from "three";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { signIn, useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import CartSidebar from "@/components/CartSidebar";
import ItemCartDrawer from "@/components/ItemCartDrawer";
import type { LightingPreset } from "@/lib/lightingPresets";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { isPro, type Plan } from "@/lib/plan";
import { useEditorMode } from "@/hooks/useEditorMode";
import { track } from "@/lib/analytics";
import { getAnonId } from "@/lib/anon";
import { preloadCoreAssets } from "@/lib/preloadAssets";
import { initializeCatalog } from "@/lib/catalog-init";
import type {
  DesignItem,
} from "@/lib/room-types";
import {
  switchRoom,
} from "@/lib/room-types";
import { getWallFaceLabel } from "@/lib/surface-settings";
import type { ShoppingReadinessFilter } from "@/lib/shopping-readiness";
import { getAllRoomNames } from "@/lib/room-hooks";
import BetaFeedbackWidget from "@/components/BetaFeedbackWidget";
import DesignControlsPanel from "@/components/editor/DesignControlsPanel";
import type { PlanStartMode } from "@/components/editor/DesignControlsPlanPanel";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { Plan2DCameraDiagnostics } from "@/components/editor/camera/Plan2DCameraInvariantGuard";
import EditorToolRail from "@/components/editor/EditorToolRail";
import ShoppingOverviewPanel from "@/components/editor/ShoppingOverviewPanel";
import { CatalogPlacementConfirmPanel } from "@/components/editor/design-page/CatalogPlacementConfirmPanel";
import { AiNotesDialog } from "@/components/editor/design-page/AiNotesDialog";
import { BetaStartPanel } from "@/components/editor/design-page/BetaStartPanel";
import { DesignPageToasts } from "@/components/editor/design-page/DesignPageToasts";
import { DesignPageComposition } from "@/components/editor/design-page/DesignPageComposition";
import { DesignPageEditorCommandBar } from "@/components/editor/design-page/DesignPageEditorCommandBar";
import { DesignValidationFeedback } from "@/components/editor/design-page/DesignValidationFeedback";
import { CabinetryStudioOverlay } from "@/components/editor/design-page/CabinetryStudioOverlay";
import { DesignSceneCanvas } from "@/components/editor/design-page/DesignSceneCanvas";
import { DesignSceneGuidanceLayer } from "@/components/editor/design-page/DesignSceneGuidanceLayer";
import { DesignScenePreviewLayer } from "@/components/editor/design-page/DesignScenePreviewLayer";
import { DesignSceneStructureLayer } from "@/components/editor/design-page/DesignSceneStructureLayer";
import { DesignPageViewportOverlayLayer } from "@/components/editor/design-page/DesignPageViewportOverlayLayer";
import {
  DesignPageProjectQaMarkers,
  DesignPageRuntimeQaMarkers,
} from "@/components/editor/design-page/DesignPageQaMarkers";
import { EditorCommandPalette } from "@/components/editor/design-page/EditorCommandPalette";
import { GuestSavePromptDialog } from "@/components/editor/design-page/GuestSavePromptDialog";
import { PlacedCabinetAssetMarkers } from "@/components/editor/design-page/PlacedCabinetAssetMarkers";
import { PlansDialog } from "@/components/editor/design-page/PlansDialog";
import { PlanTemplateChoiceDialog } from "@/components/editor/design-page/PlanTemplateChoiceDialog";
import { PlanAnnotationDialog } from "@/components/editor/design-page/PlanAnnotationDialog";
import { MyDesignsDialog } from "@/components/editor/design-page/MyDesignsDialog";
import { PresentExportDialog } from "@/components/editor/design-page/PresentExportDialog";
import { RoomRenameDialog } from "@/components/editor/design-page/RoomRenameDialog";
import {
  SceneItemsLayer,
} from "@/components/editor/design-page/SceneItemsLayer";
import { ShareLinkFallbackDialog } from "@/components/editor/design-page/ShareLinkFallbackDialog";
import {
  SelectedCabinetPanel,
} from "@/components/editor/design-page/SelectedCabinetPanel";
import { SelectedItemPanel } from "@/components/editor/design-page/SelectedItemPanel";
import { UpgradeDialog } from "@/components/editor/design-page/UpgradeDialog";
import {
  getRoomTypeLabel,
} from "@/lib/design-page-house-plan";
import { useDesignPageHousePlanState } from "@/lib/useDesignPageHousePlanState";
import { useDesignPageFloorPlanUnderlayController } from "@/lib/useDesignPageFloorPlanUnderlayController";
import { useDesignPageFloorPlanTracing } from "@/lib/useDesignPageFloorPlanTracing";
import {
  useDesignPageCatalogPlacement,
  type CatalogPlacementPreviewTarget,
} from "@/lib/useDesignPageCatalogPlacement";
import {
  useDesignPageCameraNavigation,
  type DesignPageCameraNavigationActions,
} from "@/lib/useDesignPageCameraNavigation";
import { useDesignPageExport } from "@/lib/useDesignPageExport";
import { useDesignPageBilling } from "@/lib/useDesignPageBilling";
import { useDesignPageAiNotes } from "@/lib/useDesignPageAiNotes";
import { useDesignPageSceneItemDrag } from "@/lib/useDesignPageSceneItemDrag";
import { useDesignPageRoomGeometry } from "@/lib/useDesignPageRoomGeometry";
import { useDesignPageTransientFeedback } from "@/lib/useDesignPageTransientFeedback";
import {
  useDesignPageSurfaceActions,
  type RendererSurfaceTarget,
  type SelectedWallSurfaceTarget,
  type SurfaceTargetMode,
} from "@/lib/useDesignPageSurfaceActions";
import { useDesignPageSurfaceInspector } from "@/lib/useDesignPageSurfaceInspector";
import {
  useDesignPagePanelMode,
  type DesignPageEditorMode,
} from "@/lib/useDesignPagePanelMode";
import { useDesignPageOnboarding } from "@/lib/useDesignPageOnboarding";
import {
  type FloorActionAdapters,
  useFloorManager,
} from "@/lib/useFloorManager";
import { resolveDesignPageViewportSelectionControlsState } from "@/lib/design-page-viewport-selection-controls";
import {
  getPlanOverlayMoveHistoryLabel,
  type PlanOverlayDragKind,
} from "@/lib/design-page-floor-plan-utils";
import {
  type Style,
  type CameraView,
  type NamedCameraView,
} from "@/lib/design-page-types";
import type { PendingAiLayoutProposal } from "@/lib/design-page-ai-layout-proposal";
import {
  ANNUAL_PLAN_SAVINGS_LABEL,
  buildPaywallContextMeta,
  getPaywallExperimentEnvConfig,
  getPrimaryUpgradeCtaLabel,
  resolvePaywallVariant,
  resolvePricingLayoutVariant,
  type FunnelEventName,
  type UpgradeCtaVariant,
  type PricingLayoutVariant,
} from "@/lib/design-page-paywall";
import { PRO_PLAN_PRICING } from "@/lib/pro-plan-catalog";
import { useDesignPageLiveCatalog } from "@/lib/useDesignPageLiveCatalog";
import { useDesignPageImportedModels } from "@/lib/useDesignPageImportedModels";
import { useDesignPageLayoutVersionsController } from "@/lib/useDesignPageLayoutVersionsController";
import { useDesignPageNamedCameraViewsController } from "@/lib/useDesignPageNamedCameraViewsController";
import { useDesignPageAiLayout } from "@/lib/useDesignPageAiLayout";
import { useDesignPageCommandPalette } from "@/lib/useDesignPageCommandPalette";
import { useDesignPageZoneController } from "@/lib/useDesignPageZoneController";
import { useDesignPagePlacementRoomQueries } from "@/lib/useDesignPagePlacementRoomQueries";
import { useDesignPagePlacementTargetController } from "@/lib/useDesignPagePlacementTargetController";
import { useDesignPageCrossRoomItemTransfer } from "@/lib/useDesignPageCrossRoomItemTransfer";
import { useDesignPageItemDocumentController } from "@/lib/useDesignPageItemDocumentController";
import { useDesignPageItemSelectionController } from "@/lib/useDesignPageItemSelectionController";
import { useDesignPageSceneReadModel } from "@/lib/useDesignPageSceneReadModel";
import { useDesignPageRoomReadModel } from "@/lib/useDesignPageRoomReadModel";
import { useDesignPagePlanPresentationModel } from "@/lib/useDesignPagePlanPresentationModel";
import { useDesignPageQaReadModel } from "@/lib/useDesignPageQaReadModel";
import { useDesignPageSelectionCoordinator } from "@/lib/useDesignPageSelectionCoordinator";
import { useDesignPageProductInspectionController } from "@/lib/useDesignPageProductInspectionController";
import { useDesignPageItemGeometry } from "@/lib/useDesignPageItemGeometry";
import { useDesignPagePlanEditingFacade } from "@/lib/useDesignPagePlanEditingFacade";
import { useDesignPageItemInteractionFacade } from "@/lib/useDesignPageItemInteractionFacade";
import { normalizeDesignPageLocalBackup } from "@/lib/design-page-local-backup";
import {
  useDesignPageDocumentRefSynchronization,
  useDesignPageFloorPlanDocumentState,
  useDesignPagePlanDocumentState,
  useDesignPageSnapshotDocumentState,
} from "@/lib/useDesignPageDocumentStateController";
import {
  useDesignPageDocumentHistoryController,
  useDesignPageHistoryRevision,
  useDesignPageHistoryShortcuts,
} from "@/lib/useDesignPageDocumentHistoryController";
import { useDesignPagePersistenceNewPlanFacade } from "@/lib/useDesignPagePersistenceNewPlanFacade";
import {
  isParametricCabinetItem,
} from "@/features/cabinetry/designItemAdapters";
import { formatCabinetMeasurement } from "@/features/cabinetry/measurementUnits";
import { useDesignPageCabinetry } from "@/features/cabinetry/useDesignPageCabinetry";

const STORAGE_KEY = "interior-ai:v1:livingroom-design";
const BETA_START_DISMISSED_KEY = "interior-ai:beta-start-dismissed";
const DEFAULT_EDITOR_CAMERA_VIEW: CameraView = {
  pos: [6.2, 3.6, 7.2],
  target: [0, 1.0, 0],
  fov: 45,
};
const EDITOR_3D_MIN_CAMERA_DISTANCE = 1.4;
const EDITOR_3D_MIN_POLAR_ANGLE = 0.02;
const EDITOR_3D_MAX_POLAR_ANGLE = Math.PI - 0.02;
const PLAN_FLOATING_OVERLAY_DESKTOP_MIN_WIDTH = 1024;
const PLAN_FLOATING_OVERLAY_STACK_RIGHT_PX = 4;
const PLAN_FLOATING_OVERLAY_INSPECTOR_STACK_TOP_PX = 324;
const PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX = 264;
const PLAN_FLOATING_OVERLAY_STACK_GAP_PX = 8;
type PlacementAddMode = "preview" | "auto";
const SIMPLE_PLAN_LAYERS = {
  grid: false,
  dimensions: true,
  labels: true,
  openings: true,
  builtIns: true,
  zones: false,
  annotations: false,
};


export function DesignPageWorkspace() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlMode = searchParams.get("mode");
  const stripeSessionId = searchParams.get("session_id");
  const paywallVariantOverride = searchParams.get("paywall_variant");
  const paywallOpenParam = searchParams.get("paywall_open");
  const plansOpenParam = searchParams.get("plans_open");
  const debugLayoutParam = searchParams.get("debug_layout");
  const [sofaDragging, setSofaDragging] = useState(false);
  const [planRoomDragging, setPlanRoomDragging] = useState(false);
  const [planRoomResizing, setPlanRoomResizing] = useState(false);
  const [planOverlayDragging, setPlanOverlayDragging] = useState(false);
  const planRoomDragHistoryActiveRef = useRef(false);
  const planRoomResizeHistoryActiveRef = useRef(false);
  const planOverlayDragHistoryActiveRef = useRef(false);
  const [designId, setDesignId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [style, setStyle] = useState<Style>("Modern");
  const [budget, setBudget] = useState<"$" | "$$" | "$$$">("$$");
  const [mode, setMode] = useState<"homeowner" | "designer">(
    urlMode === "designer" ? "designer" : "homeowner"
  );
  const [notes, setNotes] = useState("");
  const [aiSeed, setAiSeed] = useState<number>(Date.now());
  const [plan, setPlan] = useState<Plan>("free");
  const [showPlans, setShowPlans] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<"designer" | "export_images" | "export_pdf" | null>(null);
  const [upgradeCtaVariant, setUpgradeCtaVariant] = useState<UpgradeCtaVariant>("unlock_pro_exports");
  const [pricingLayoutVariant, setPricingLayoutVariant] = useState<PricingLayoutVariant>("default");
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridPulse, setGridPulse] = useState(false);
  const [clientPreview, setClientPreview] = useState(false);
  const [itemCartOpen, setItemCartOpen] = useState(false);
  const [itemCart, setItemCart] = useState<Array<{ id: string; productId: string; title: string; qty: number; thumbUrl?: string }>>([]);
  const {
    state: {
      selectedFamilyKey: selectedImportedFamilyKey,
      selectedProductId: selectedImportedProductId,
      modelOptions: importedModelOptions,
      catalogByProductId: importedCatalogByProductId,
      modelUrlByAssetId: importedModelUrlByAssetId,
      familyOptions: importedFamilyOptions,
      visibleModelOptions: visibleImportedModelOptions,
      catalogItems,
    },
    actions: {
      setSelectedFamilyKey: setSelectedImportedFamilyKey,
      setSelectedProductId: setSelectedImportedProductId,
      ensureCatalogItem: ensureImportedCatalogItem,
      getRelatedProductIds: getRelatedImportedProductIds,
    },
  } = useDesignPageImportedModels();
  const [placementAddMode, setPlacementAddMode] = useState<PlacementAddMode>("preview");
  const [placementPreferencesLoaded, setPlacementPreferencesLoaded] = useState(false);
  const [, bumpHistoryRevision] = useDesignPageHistoryRevision();
  const [showBetaStart, setShowBetaStart] = useState(false);
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>("studio");
  const [viewMode, setViewMode] = useState<EditorViewMode>("3d");
  const [designPanelOpen, setDesignPanelOpen] = useState(true);
  const [designPanelCollapsed, setDesignPanelCollapsed] = useState(false);
  const [planFocusPanelRevealed, setPlanFocusPanelRevealed] = useState(false);
  const [dismissedPlanCanvasGuidanceKey, setDismissedPlanCanvasGuidanceKey] = useState<string | null>(null);
  const [planDebugMetrics, setPlanDebugMetrics] = useState({
    zoom: 0,
    visibleLabelCount: 0,
    projectedRoomMinWidthPx: 0,
    projectedRoomMinHeightPx: 0,
    projectedRoomMinAreaPx: 0,
    cameraValid: true,
    cameraRecoveries: 0,
    cameraTargetX: 0,
    cameraTargetZ: 0,
  });
  const [showLayoutDebugOverlay, setShowLayoutDebugOverlay] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const {
    state: {
      planTheme,
      planLayers,
      planAnnotations,
      planOpenings,
      planFixedElements,
      simplePlanControls,
      planLayerPreset,
      planMeasurementUnit,
      exportStylePreset,
      planGuidedActionsEnabled,
      planGuidedActionsChoiceSeen,
      planOpeningsStorageState,
      planSettingsLoaded,
    },
    actions: {
      setPlanTheme,
      setPlanLayers,
      setPlanAnnotations,
      setPlanOpenings,
      setPlanFixedElements,
      setSimplePlanControls,
      setPlanLayerPreset,
      setPlanMeasurementUnit,
      setExportStylePreset,
      setPlanGuidedActionsEnabled,
      setPlanGuidedActionsChoiceSeen,
    },
    refs: {
      planOpeningsRef,
      planAnnotationsRef,
      planFixedElementsRef,
      planThemeRef,
      planLayersRef,
      planLayerPresetRef,
      planMeasurementUnitRef,
      exportStylePresetRef,
      defaultPlanOpeningsSeededRef,
    },
    restoreActions: {
      setPlanThemeState,
      setPlanLayersState,
      setPlanAnnotationsState,
      setPlanOpeningsState,
      setPlanFixedElementsState,
      setPlanLayerPresetState,
      setPlanMeasurementUnitState,
      setExportStylePresetState,
    },
  } = useDesignPagePlanDocumentState();
  const {
    state: {
      floorPlanUnderlay,
      floorPlanCalibrationMode,
      floorPlanCalibrationPoints,
      floorPlanCalibrationDistanceInput,
      floorPlanTraceRoomMode,
      floorPlanDrawRoomMode,
      floorPlanDrawAngleLockMode,
      floorPlanExactWallLengthInput,
      floorPlanTraceRoomPoints,
      blankGridRoomPreviewPoint,
      floorPlanTraceRoomType,
      floorPlanTraceOpeningMode,
      floorPlanTraceOpeningPoints,
      floorPlanTraceOpeningKind,
      floorPlanPdfSourceReady,
      floorPlanPdfRenderingPage,
      floorPlanCalibrationSummary,
      blankGridRoomDrawActive,
      activeFloorPlanTool,
    },
    actions: {
      setFloorPlanUnderlay,
      setFloorPlanCalibrationPoints,
      setFloorPlanCalibrationDistanceInput,
      setFloorPlanTraceRoomMode,
      setFloorPlanDrawAngleLockMode,
      setFloorPlanExactWallLengthInput,
      setFloorPlanTraceRoomPoints,
      setBlankGridRoomPreviewPoint,
      setFloorPlanTraceRoomType,
      setFloorPlanTraceOpeningMode,
      setFloorPlanTraceOpeningPoints,
      setFloorPlanTraceOpeningKind,
      setFloorPlanPdfSourceReady,
      setFloorPlanPdfRenderingPage,
      resetFloorPlanCalibration,
      resetFloorPlanInteraction,
      activateFloorPlanSelectTool,
      activateFloorPlanCalibrationMode,
      activateFloorPlanRoomTrace,
      activateFloorPlanRoomDrawMode,
      activateFloorPlanOpeningTrace,
      clearFloorPlanTraceBuffers,
      revokeFloorPlanUnderlayUrl,
    },
    refs: {
      floorPlanUnderlayRef,
      floorPlanUnderlayUrlRef,
      floorPlanPdfSourceDataRef,
    },
    restoreActions: { setFloorPlanUnderlayState },
  } = useDesignPageFloorPlanDocumentState();
  const [selectedPlanOverlayId, setSelectedPlanOverlayId] = useState<string | null>(null);
  const [suppressedDoorwaySuggestionKeys, setSuppressedDoorwaySuggestionKeys] = useState<string[]>([]);
  const [selectedPlanRoomId, setSelectedPlanRoomId] = useState<string | null>(null);
  const [cameraView, setCameraView] = useState<CameraView>({
    pos: [...DEFAULT_EDITOR_CAMERA_VIEW.pos],
    target: [...DEFAULT_EDITOR_CAMERA_VIEW.target],
    fov: DEFAULT_EDITOR_CAMERA_VIEW.fov,
  });
  const cameraViewRef = useRef(cameraView);
  const floorCameraViewsRef = useRef<Record<number, CameraView>>({});
  const floorActionAdaptersRef = useRef<FloorActionAdapters>({
    clearNonRoomSelection: () => undefined,
    transitionToCameraView: () => undefined,
    updateCameraViewFromScene: () => undefined,
  });
  const [savedViews, setSavedViews] = useState<NamedCameraView[]>([]);
  const [hoveredCartInstanceId, setHoveredCartInstanceId] = useState<string | null>(null);
  const [showPresentModal, setShowPresentModal] = useState(false);
  const [presentModeRoomId, setPresentModeRoomId] = useState<string | null>(null);
  const [shoppingReadinessFilter, setShoppingReadinessFilter] =
    useState<ShoppingReadinessFilter>("all");
  const [floorFinishPanelOpenSignal, setFloorFinishPanelOpenSignal] = useState(0);
  const [activeSurfaceTarget, setActiveSurfaceTarget] = useState<SurfaceTargetMode>("floor");
  const [selectedWallSurfaceTarget, setSelectedWallSurfaceTarget] =
    useState<SelectedWallSurfaceTarget | null>(null);
  const [selectedRendererSurfaceTarget, setSelectedRendererSurfaceTarget] =
    useState<RendererSurfaceTarget | null>(null);
  const [surfaceBrushActive, setSurfaceBrushActive] = useState(false);
  const [surfaceBrushMaterialId, setSurfaceBrushMaterialId] = useState<string | null>(null);
  const [surfaceBrushPaint, setSurfaceBrushPaint] = useState<{
    colorHex: string;
    name: string;
  } | null>(null);
  const aiDesignEnabled = true;

  // Editor Modes
  const [editorMode, setEditorMode] = useState<DesignPageEditorMode>("design");
  const [guidedPlanStartMode, setGuidedPlanStartMode] = useState<PlanStartMode>("start");
  const {
    designControlsPanelMode,
    designControlsPanelVisible,
    goPlan,
    goFurnish,
    goAiDesign,
    goShop,
  } = useDesignPagePanelMode({
    editorMode,
    setEditorMode,
    designPanelOpen,
    setDesignPanelOpen,
    setItemCartOpen,
  });
  useEffect(() => {
    const updateViewportSize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };

    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);
    return () => window.removeEventListener("resize", updateViewportSize);
  }, []);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    let storedPreference = false;
    try {
      storedPreference = window.localStorage.getItem("design_layout_debug") === "1";
    } catch {
      storedPreference = false;
    }

    setShowLayoutDebugOverlay(debugLayoutParam === "1" || storedPreference);
  }, [debugLayoutParam]);
  const handlePlanDebugMetricsChange = useCallback(
    (next: { zoom: number; visibleLabelCount: number }) => {
      setPlanDebugMetrics((current) =>
        current.zoom === next.zoom && current.visibleLabelCount === next.visibleLabelCount
          ? current
          : { ...current, ...next }
      );
    },
    []
  );
  const handlePlan2DCameraDiagnosticsChange = useCallback((next: Plan2DCameraDiagnostics) => {
    setPlanDebugMetrics((current) =>
      current.projectedRoomMinWidthPx === next.projectedRoomMinWidthPx &&
      current.projectedRoomMinHeightPx === next.projectedRoomMinHeightPx &&
      current.projectedRoomMinAreaPx === next.projectedRoomMinAreaPx &&
      current.cameraValid === next.valid &&
      current.cameraRecoveries === next.recoveries &&
      current.cameraTargetX === next.targetX &&
      current.cameraTargetZ === next.targetZ
        ? current
        : {
            ...current,
            projectedRoomMinWidthPx: next.projectedRoomMinWidthPx,
            projectedRoomMinHeightPx: next.projectedRoomMinHeightPx,
            projectedRoomMinAreaPx: next.projectedRoomMinAreaPx,
            cameraValid: next.valid,
            cameraRecoveries: next.recoveries,
            cameraTargetX: next.targetX,
            cameraTargetZ: next.targetZ,
          }
    );
  }, []);
  useEffect(() => {
    if (!designPanelOpen) {
      setDesignPanelCollapsed(false);
    }
  }, [designPanelOpen]);

  const wantsDesigner = urlMode === "designer";
  const canUseDesigner = plan === "pro";
  const { isDesigner, isClientPreview } = useEditorMode(plan, clientPreview);
  const showDesignerTheme = isDesigner && !isClientPreview;
  const {
    state: {
      toast: ruleToast,
      confidence: layoutConfidence,
      constraintResults,
      visibleConstraints,
    },
    actions: {
      showToast: showRuleToast,
      showConstraints: showConstraintsForMoment,
      showConfidence: showConfidenceSummary,
    },
  } = useDesignPageTransientFeedback({ isClientPreview, editorMode });
  useEffect(() => {
    if (!canUseDesigner && !simplePlanControls) {
      setSimplePlanControls(true);
    }
  }, [canUseDesigner, setSimplePlanControls, simplePlanControls]);
  const gridPulseTimerRef = useRef<number | null>(null);
  const firstInteractionRef = useRef(false);
  const upgradeShownRef = useRef(false);
  const designerAttemptRef = useRef(false);
  const editorOpenedRef = useRef(false);
  const landingTrackedRef = useRef(false);
  const designStartedTrackedRef = useRef(false);
  const dragCommitRef = useRef(false);
  const seatingZoneAutoDisabledRef = useRef(false);
  const itemsRef = useRef<DesignItem[]>([]);
  const resetSelectionStateRef = useRef<() => void>(() => undefined);
  const {
    qaPaywallHooksEnabled,
    paywallWinnerDefault,
    paywallFallbackVariant,
    paywallForceFallback,
    paywallExperimentSlot,
  } = getPaywallExperimentEnvConfig({
    nodeEnv: process.env.NODE_ENV,
    enableQaHooks: process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS,
    paywallWinnerDefault: process.env.NEXT_PUBLIC_PAYWALL_WINNER_DEFAULT,
    paywallFallbackVariant: process.env.NEXT_PUBLIC_PAYWALL_FALLBACK_VARIANT,
    paywallForceFallback: process.env.NEXT_PUBLIC_PAYWALL_FORCE_FALLBACK,
    paywallExperimentSlot: process.env.NEXT_PUBLIC_PAYWALL_EXPERIMENT_SLOT,
  });

  const paywallVariant = useMemo(() => {
    if (typeof window === "undefined") return "unlock_pro_exports" as UpgradeCtaVariant;
    return resolvePaywallVariant({
      qaPaywallHooksEnabled,
      paywallVariantOverride,
      storageVariantOverride: window.localStorage.getItem("paywall_variant_override"),
      paywallForceFallback,
      paywallFallbackVariant,
      paywallWinnerDefault,
      seed: session?.user?.id ?? designId ?? getAnonId(),
    });
  }, [
    designId,
    paywallFallbackVariant,
    paywallForceFallback,
    paywallVariantOverride,
    paywallWinnerDefault,
    qaPaywallHooksEnabled,
    session?.user?.id,
  ]);

  const resolvedPricingLayout = useMemo<PricingLayoutVariant>(() => {
    return resolvePricingLayoutVariant(paywallVariant);
  }, [paywallVariant]);

  const primaryUpgradeCtaLabel = getPrimaryUpgradeCtaLabel(upgradeCtaVariant);
  const annualPlanSavingsLabel = ANNUAL_PLAN_SAVINGS_LABEL;
  const upgradeDialogDescription =
    upgradeReason === "export_images"
      ? "Free gives you a preview. Pro unlocks clean HD room images, multiple camera angles, and presentation-ready exports."
      : upgradeReason === "export_pdf"
        ? "Free includes a watermarked one-page preview. Pro unlocks clean PDFs, room summaries, and client-ready export packs."
        : upgradeReason === "designer"
          ? "Designer mode, presentation tools, and polished export workflows are available on the Pro plan."
          : "Unlock clean exports, designer tools, and a faster client presentation workflow.";
  const upgradeDialogExportWorkflowBenefit =
    paywallExperimentSlot === "value_stack_v2"
      ? "Client-ready exports in minutes with less manual formatting"
      : "Room summaries and smoother designer workflow";
  const upgradeDialogPricingGuidance =
    paywallExperimentSlot === "value_stack_v2"
      ? "Teams with weekly client reviews usually recover yearly pricing within the first month."
      : "Use yearly if you expect to export for more than 2 active projects this quarter.";
  const paywallContextMeta = buildPaywallContextMeta({
    ctaVariant: upgradeCtaVariant,
    pricingLayout: pricingLayoutVariant,
    experimentSlot: paywallExperimentSlot,
    forceFallback: paywallForceFallback,
  });

  const logFunnelEvent = useCallback(
    (eventType: FunnelEventName, meta?: Record<string, unknown>) => {
      fetch("/api/track/app-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType,
          designId,
          shareToken,
          meta,
        }),
      }).catch(() => undefined);
    },
    [designId, shareToken]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seatingDisabled = localStorage.getItem("seating_zone_auto_disabled");
      seatingZoneAutoDisabledRef.current = seatingDisabled === "1";
      const storedPlacementAddMode = localStorage.getItem("placement_add_mode");
      if (storedPlacementAddMode === "preview" || storedPlacementAddMode === "auto") {
        setPlacementAddMode(storedPlacementAddMode);
      }
    } catch {
      // ignore storage errors
    } finally {
      setPlacementPreferencesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!placementPreferencesLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("placement_add_mode", placementAddMode);
    } catch {
      // ignore storage errors
    }
  }, [placementAddMode, placementPreferencesLoaded]);

  useEffect(() => {
    preloadCoreAssets();
  }, []);

  // Auto-open present modal when entering present mode
  useEffect(() => {
    if (editorMode === "present") {
      setShowPresentModal(true);
      // Reset present mode room (will default to activeRoomId in render)
      setPresentModeRoomId(null);
    } else if (editorMode === "buy") {
      resetSelectionStateRef.current();
    }
  }, [editorMode]);

  const setUrlMode = (nextMode: "designer" | "homeowner") => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextMode === "designer") {
      params.set("mode", "designer");
    } else {
      params.delete("mode");
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const signInWithReturn = useCallback(() => {
    const callbackUrl =
      typeof window !== "undefined" ? window.location.href : "/design";
    signIn("google", { callbackUrl });
  }, []);

  const trackFirstInteraction = useCallback(() => {
    if (firstInteractionRef.current) return;
    track("editor_first_interaction", {
      design_id: designId ?? null,
      items_count: itemsRef.current.length,
      room_type: "living_room",
      mode,
      is_guest: !session?.user,
    });

    if (!designStartedTrackedRef.current) {
      track("design_started", {
        design_id: designId ?? null,
        mode,
        is_guest: !session?.user,
      });
      logFunnelEvent("design_started", {
        mode,
        is_guest: !session?.user,
      });
      designStartedTrackedRef.current = true;
    }

    firstInteractionRef.current = true;
  }, [designId, logFunnelEvent, mode, session?.user]);

  const [pendingAiLayoutProposal, setPendingAiLayoutProposal] =
    useState<PendingAiLayoutProposal | null>(null);

  const [crossRoomDragTarget, setCrossRoomDragTarget] = useState<{
    roomId: string;
    label: string;
    valid: boolean;
    kind: "preview" | "item";
  } | null>(null);
  const {
    state: { designSnapshot, localBackupHydrated },
    actions: { setDesignSnapshot, setLocalBackupHydrated },
    refs: { designSnapshotRef },
  } = useDesignPageSnapshotDocumentState();
  const liveCatalogReady = useDesignPageLiveCatalog();
  const canEdit = !isClientPreview && liveCatalogReady;

  useEffect(() => {
    cameraViewRef.current = cameraView;
  }, [cameraView]);

  const {
    adapters: { captureHistorySnapshot, restoreHistorySnapshot },
  } = useDesignPageDocumentRefSynchronization({
    state: {
      designSnapshot,
      planOpenings,
      planAnnotations,
      planFixedElements,
      planTheme,
      planLayers,
      planLayerPreset,
      planMeasurementUnit,
      exportStylePreset,
      floorPlanUnderlay,
    },
    actions: {
      setDesignSnapshot,
      setPlanAnnotationsState,
      setPlanFixedElementsState,
      setPlanOpeningsState,
      setPlanThemeState,
      setPlanLayersState,
      setPlanLayerPresetState,
      setPlanMeasurementUnitState,
      setExportStylePresetState,
      setFloorPlanUnderlayState,
    },
    refs: {
      designSnapshotRef,
      planOpeningsRef,
      planAnnotationsRef,
      planFixedElementsRef,
      planThemeRef,
      planLayersRef,
      planLayerPresetRef,
      planMeasurementUnitRef,
      exportStylePresetRef,
      floorPlanUnderlayRef,
    },
  });
  const {
    state: { currentStoredDesignFingerprint },
    actions: {
      flushCoalescedHistoryTransaction,
      runHistoryTransaction,
      runCoalescedHistoryTransaction,
      hydratePersistedFloorPlanState,
    },
    refs: {
      history,
      getStoredDesignForPersistence,
      fingerprintStoredDesign,
    },
  } = useDesignPageDocumentHistoryController({
    state: {
      designSnapshot,
      floorPlanUnderlay,
      planOpenings,
      planFixedElements,
    },
    adapters: {
      captureSnapshot: captureHistorySnapshot,
      restoreSnapshot: restoreHistorySnapshot,
      onHistoryChange: () => bumpHistoryRevision((revision) => revision + 1),
    },
    actions: {
      setFloorPlanUnderlay,
      setPlanOpenings,
      setPlanFixedElements,
      setFloorPlanPdfSourceReady,
      resetFloorPlanInteraction,
      revokeFloorPlanUnderlayUrl,
    },
    refs: { designSnapshotRef, floorPlanPdfSourceDataRef },
  });

  const {
    activeRoom,
    roomWidth,
    roomDepth,
    roomHeight,
    wallThickness,
    clampToActiveRoom,
    roomWidthInput,
    setRoomWidthInput,
    roomDepthInput,
    setRoomDepthInput,
    newRoomType,
    setNewRoomType,
    newRoomShape,
    setNewRoomShape,
    activeRoomPresetId,
    items,
    zones,
    housePlan2D,
    activeRoomPlanOffset,
    planViewWidth,
    planViewDepth,
    handleAddRoom: handleAddRoomFromHousePlanState,
    handleRenameRoom: handleRenameRoomFromHousePlanState,
    handleMoveRoom2D,
  } = useDesignPageHousePlanState({
    designSnapshot,
    setDesignSnapshot,
    isPlanView2D: viewMode === "2d",
  });
  const handleAddRoom = useCallback(
    (...args: Parameters<typeof handleAddRoomFromHousePlanState>) => {
      runHistoryTransaction("Add room", () => {
        handleAddRoomFromHousePlanState(...args);
      });
    },
    [handleAddRoomFromHousePlanState, runHistoryTransaction]
  );
  const handleRenameRoom = useCallback(
    (...args: Parameters<typeof handleRenameRoomFromHousePlanState>) => {
      runHistoryTransaction("Rename room", () => {
        handleRenameRoomFromHousePlanState(...args);
      });
    },
    [handleRenameRoomFromHousePlanState, runHistoryTransaction]
  );
  const activePlanCanvasInteraction =
    !isDesigner &&
    !isClientPreview &&
    viewMode === "2d" &&
    editorMode === "design" &&
    (floorPlanCalibrationMode || floorPlanTraceRoomMode || floorPlanTraceOpeningMode);
  useEffect(() => {
    if (!activePlanCanvasInteraction) {
      setPlanFocusPanelRevealed(false);
    }
  }, [activePlanCanvasInteraction]);
  const planCanvasFocusActive = activePlanCanvasInteraction && !planFocusPanelRevealed;
  const designControlsPanelVisibleForLayout =
    designControlsPanelVisible && !planCanvasFocusActive;
  const commercePanelVisibleForLayout = editorMode === "buy" && !isClientPreview;
  const shoppingPanelVisibleForLayout = commercePanelVisibleForLayout;
  const {
    activeFloorLevel,
    activeFloorRoomCount,
    floorOptions,
    handleAddFloor,
    handleDeleteFloor,
    handleDuplicateFloor,
    handleRenameFloor,
    handleSwitchFloor,
    handleToggleFloorVisibility,
    hiddenFloorLevels,
    setStackedFloorView,
    stackedFloorView,
  } = useFloorManager({
    actionAdaptersRef: floorActionAdaptersRef,
    activeRoom,
    cameraViewRef,
    designSnapshot,
    designSnapshotRef,
    floorCameraViewsRef,
    history,
    roomDepth,
    roomHeight,
    roomWidth,
    setDesignSnapshot,
    setPlanOpenings,
    setSelectedPlanRoomId,
    showRuleToast,
    viewMode,
    wallThickness,
  });
  const {
    state: {
      sceneReady,
      showSceneLoadingVeil,
      scenePerformanceMode,
      autoLiteScene,
      scenePerformanceSample,
      liteSceneEnabled,
      sceneRenderQuality,
    },
    derived: {
      hasWholeHousePlan,
      usesHousePlanScene,
      sceneHousePlanRooms3D,
      houseRoomById,
      selectedPlanRoomContext,
      roomSnapshotById,
      sceneRoomItems,
      aiLayoutPreviewFootprints,
      aiLayoutPreviewTone,
    },
    actions: {
      setSceneProgressReady,
      handleSceneRenderItemReadyChange,
      handleScenePerformanceModeChange,
      handleScenePerformanceSample,
      handleSustainedLowFps,
    },
    queries: { findPlanRoomAtWorldPoint },
  } = useDesignPageSceneReadModel({
    state: {
      document: { designSnapshot, activeRoom, items },
      plan: {
        housePlanRooms: housePlan2D.rooms,
        activeRoomPlanOffset,
        roomWidth,
        roomDepth,
        stackedFloorView,
        hiddenFloorLevels,
        selectedPlanRoomId,
      },
      editor: { viewMode, activeSurfaceTarget, surfaceBrushActive },
      ai: { pendingProposal: pendingAiLayoutProposal },
    },
    actions: {
      setSelectedPlanRoomId,
      showToast: showRuleToast,
    },
  });
  const {
    state: {
      activeRoomHealthSummary,
      surfaceInspectorContext,
      surfaceInspectorUiActions,
    },
    derived: {
      roomItemCountsById,
      roomShoppingSummaries,
      activeRoomShoppingSummary,
      activeRoomFloorMaterialId,
      activeRoomFloorRotationDeg,
      activeRoomFloorScale,
      activeRoomFloorSettings,
      activeRoomCeilingSettings,
      activeSelectedWallFaceId,
      activeRoomWallSettings,
      activeRoomSelectedWallSettings,
      surfaceRoomSummaries,
      wallInspectorFaceId,
      wallInspectorDefaultHeight,
      wallInspectorHeight,
      surfaceInspectorIsWall,
      surfaceInspectorIsCeiling,
      surfaceInspectorDisplayName,
      activeRoomHeightMm,
      activeRoomWallThicknessMm,
      activeRoomSlabThicknessMm,
      activeRoomBaseboardDepthMm,
      activeRoomWallOpacity,
      activeRoomFloorOpacity,
      activeRoomCeilingOpacity,
      activeRoomCeilingVisible,
      activeRoomCeilingColor,
      activeRoomCategoryCounts,
      activeRoomProductQuantities,
      activeRoomVariantQuantities,
      activeRoomShoppingItems,
      wholeHomeShoppingSummary,
      activeSceneItemsForGuides,
    },
    actions: { reviewActiveRoomHealth },
  } = useDesignPageRoomReadModel({
    state: {
      document: { designSnapshot, activeRoom, items },
      plan: {
        planOpenings,
        selectedPlanRoomId,
        activeRoomPlanOffset,
        roomHeight,
        wallThickness,
      },
      surface: { activeSurfaceTarget, selectedWallSurfaceTarget },
    },
    configuration: { isClientPreview, isDesigner },
    derived: { roomSnapshotById },
    actions: {
      setDesignPanelOpen,
      setEditorMode,
      setShoppingReadinessFilter,
      goPlan,
      goFurnish,
      goShop,
      showToast: showRuleToast,
    },
  });
  const zonesRef = useRef(zones);

  useEffect(() => {
    if (isClientPreview) return;
    try {
      const dismissed = window.localStorage.getItem(BETA_START_DISMISSED_KEY) === "1";
      setShowBetaStart(!dismissed && housePlan2D.rooms.length === 0 && items.length === 0);
    } catch {
      setShowBetaStart(housePlan2D.rooms.length === 0 && items.length === 0);
    }
  }, [housePlan2D.rooms.length, isClientPreview, items.length]);

  const dismissBetaStart = useCallback(() => {
    setShowBetaStart(false);
    try {
      window.localStorage.setItem(BETA_START_DISMISSED_KEY, "1");
    } catch {
      // Ignore preference storage failures.
    }
  }, []);

  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const {
    state: {
      selectedIds,
      selectedInstanceId,
      selectedItem,
    },
    refs: {
      selectedIds: selectedIdsRef,
      primaryId: primaryIdRef,
    },
    actions: {
      resetSelectionState,
      updateSelection,
      clearSelection,
      selectItem: handleSelect,
    },
  } = useDesignPageItemSelectionController({
    state: { items, editorMode, selectedZoneId },
    actions: { setEditorMode, setSelectedZoneId },
  });
  resetSelectionStateRef.current = resetSelectionState;
  const {
    queries: {
      getActiveItems: getActiveCatalogPlacementItems,
      getActiveRoomId: getActiveCatalogPlacementRoomId,
      getRooms: getCatalogPlacementRooms,
    },
    actions: {
      commitItems,
      commitItemsToRoom,
      setItemsPresent,
      createInstanceId: newInstanceId,
      addItem,
      selectItemsInRoom: selectCatalogPlacementItems,
    },
  } = useDesignPageItemDocumentController({
    state: { activeItems: items },
    configuration: {
      roomWidth,
      roomDepth,
      wallThickness,
      clampToActiveRoom,
    },
    refs: {
      designSnapshot: designSnapshotRef,
      activeItems: itemsRef,
    },
    actions: { setDesignSnapshot, updateSelection, history },
  });

  const swapShoppingItemReplacement = useCallback(
    (
      instanceId: string,
      replacement: {
        productId: string;
        variantId: string;
        purchaseOptionId?: string;
      }
    ) => {
      const replacementProduct = CATALOG_ITEMS[replacement.productId];
      commitItems(
        (prev) =>
          prev.map((item) =>
            item.instanceId === instanceId
              ? {
                  ...item,
                  productId: replacement.productId,
                  variantId: replacement.variantId,
                  purchaseOptionId: replacement.purchaseOptionId,
                  includeInCheckout: true,
                  configurationCode: undefined,
                  bundleGroupId: undefined,
                  bundleRole: undefined,
                  bundleQuantity: undefined,
                  materialPreset: undefined,
                  materialOverrides: undefined,
                }
              : item
          ),
        `Swap to ${replacementProduct?.title ?? "shoppable replacement"}`
      );
      showRuleToast("Swapped in a shoppable replacement");
    },
    [commitItems, showRuleToast]
  );

  const reviewShoppingIssue = useCallback(
    (filter: ShoppingReadinessFilter) => {
      setShoppingReadinessFilter(filter);
      goShop();
    },
    [goShop]
  );

  // ========================================================================
  // Step 7: Validate Catalog on Startup
  // ========================================================================
  useEffect(() => {
    const validation = initializeCatalog();

    track("catalog_initialized", {
      total_items: validation.summary.total,
      valid_items: validation.summary.valid,
      has_errors: !validation.valid,
    });
  }, []);

  const {
    state: {
      canUndo,
      canRedo,
      undoName,
      redoName,
      historyDebugSnapshot,
    },
    actions: { undoSafe, redoSafe },
  } = useDesignPageHistoryShortcuts({
    state: { isClientPreview },
    actions: { flushCoalescedHistoryTransaction },
    refs: { history },
  });

  // Global keyboard shortcut for Present Mode toggle (P key)
  useEffect(() => {
    const handlePresentModeHotkey = (e: KeyboardEvent) => {
      if (!isDesigner) return;
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        setClientPreview((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handlePresentModeHotkey);
    return () => window.removeEventListener("keydown", handlePresentModeHotkey);
  }, [isDesigner]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const orbitControlsRef = useRef<OrbitControlsImpl | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const handlePlanRoomDragStateChange = useCallback(
    (isDragging: boolean) => {
      if (isDragging && !planRoomDragHistoryActiveRef.current) {
        history.begin("Move room");
        planRoomDragHistoryActiveRef.current = true;
      } else if (!isDragging && planRoomDragHistoryActiveRef.current) {
        history.commit();
        planRoomDragHistoryActiveRef.current = false;
      }
      setPlanRoomDragging(isDragging);
      if (orbitControlsRef.current) {
        orbitControlsRef.current.enabled =
          !isDragging && !sofaDragging && !planRoomResizing && !planOverlayDragging;
      }
    },
    [history, planOverlayDragging, planRoomResizing, sofaDragging]
  );
  const handlePlanOverlayDragStateChange = useCallback(
    (isDragging: boolean, kind?: PlanOverlayDragKind) => {
      if (isDragging && !planOverlayDragHistoryActiveRef.current) {
        history.begin(getPlanOverlayMoveHistoryLabel(kind));
        planOverlayDragHistoryActiveRef.current = true;
      } else if (!isDragging && planOverlayDragHistoryActiveRef.current) {
        history.commit();
        planOverlayDragHistoryActiveRef.current = false;
      }
      setPlanOverlayDragging(isDragging);
      if (orbitControlsRef.current) {
        orbitControlsRef.current.enabled =
          !isDragging && !sofaDragging && !planRoomDragging && !planRoomResizing;
      }
    },
    [history, planRoomDragging, planRoomResizing, sofaDragging]
  );
  const handlePlanOpeningDragStateChange3D = useCallback(
    (isDragging: boolean) => {
      handlePlanOverlayDragStateChange(isDragging, "opening");
    },
    [handlePlanOverlayDragStateChange]
  );
  const handlePlanRoomResizeStateChange = useCallback(
    (isResizing: boolean) => {
      if (isResizing && !planRoomResizeHistoryActiveRef.current) {
        history.begin("Resize room");
        planRoomResizeHistoryActiveRef.current = true;
      } else if (!isResizing && planRoomResizeHistoryActiveRef.current) {
        history.commit();
        planRoomResizeHistoryActiveRef.current = false;
      }
      setPlanRoomResizing(isResizing);
      if (orbitControlsRef.current) {
        orbitControlsRef.current.enabled =
          !isResizing && !sofaDragging && !planRoomDragging && !planOverlayDragging;
      }
    },
    [history, planOverlayDragging, planRoomDragging, sofaDragging]
  );
  const resolveGroundPointFromClient = useCallback((clientX: number, clientY: number) => {
    const canvas = rendererRef.current?.domElement ?? canvasRef.current;
    const camera = cameraRef.current;
    if (!canvas || !camera) return null;
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1)
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const point = new THREE.Vector3();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    return raycaster.ray.intersectPlane(groundPlane, point)
      ? ([point.x, 0, point.z] as [number, number, number])
      : null;
  }, []);
  const cameraNavigationActionsRef = useRef<DesignPageCameraNavigationActions | null>(null);
  const cartHoverCameraBaselineRef = useRef<CameraView | null>(null);
  const cartHoverFocusTimerRef = useRef<number | null>(null);
  const updateProjection = useCallback((camera: THREE.Camera | null) => {
    cameraNavigationActionsRef.current?.updateProjection(camera);
  }, []);
  const updateCameraViewFromScene = useCallback(() => {
    cameraNavigationActionsRef.current?.updateCameraViewFromScene();
  }, []);
  const preserveCameraAfterPlanOverlaySelection = useCallback(() => {
    cameraNavigationActionsRef.current?.preserveCameraAfterPlanOverlaySelection();
  }, []);
  const transitionToCameraView = useCallback((nextView: CameraView, durationMs = 520) => {
    cameraNavigationActionsRef.current?.transitionToCameraView(nextView, durationMs);
  }, []);
  const prepareCameraForPlanTemplate = useCallback(() => {
    cameraNavigationActionsRef.current?.prepareForPlanTemplate();
  }, []);

  useEffect(() => {
    const controls = orbitControlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;

    if (cartHoverFocusTimerRef.current) {
      window.clearTimeout(cartHoverFocusTimerRef.current);
      cartHoverFocusTimerRef.current = null;
    }

    if (editorMode !== "buy" || viewMode === "2d") {
      cartHoverCameraBaselineRef.current = null;
      return;
    }

    if (!hoveredCartInstanceId) {
      if (cartHoverCameraBaselineRef.current) {
        transitionToCameraView(cartHoverCameraBaselineRef.current, 260);
        cartHoverCameraBaselineRef.current = null;
      }
      return;
    }

    const hoveredItem = items.find((it) => it.instanceId === hoveredCartInstanceId);
    if (!hoveredItem) return;
    const hoveredProduct = CATALOG_ITEMS[hoveredItem.productId];
    if (!hoveredProduct) return;

    const currentTarget = (controls.target as THREE.Vector3).clone();
    const currentPos = camera.position.clone();

    const perspectiveFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : cameraView.fov ?? 45;

    if (!cartHoverCameraBaselineRef.current) {
      cartHoverCameraBaselineRef.current = {
        pos: [currentPos.x, currentPos.y, currentPos.z],
        target: [currentTarget.x, currentTarget.y, currentTarget.z],
        fov: perspectiveFov,
      };
    }

    const itemX = hoveredItem.position?.[0] ?? 0;
    const itemZ = hoveredItem.position?.[2] ?? 0;
    const itemY = Math.max(0.45, hoveredProduct.dimsMm.h / 1000 * 0.52);

    const deltaX = itemX - currentTarget.x;
    const deltaZ = itemZ - currentTarget.z;

    cartHoverFocusTimerRef.current = window.setTimeout(() => {
      transitionToCameraView(
        {
          pos: [
            currentPos.x + deltaX * 0.22,
            currentPos.y,
            currentPos.z + deltaZ * 0.22,
          ],
          target: [
            currentTarget.x + deltaX * 0.45,
            itemY,
            currentTarget.z + deltaZ * 0.45,
          ],
          fov: perspectiveFov,
        },
        260
      );
      cartHoverFocusTimerRef.current = null;
    }, 120);

    return () => {
      if (cartHoverFocusTimerRef.current) {
        window.clearTimeout(cartHoverFocusTimerRef.current);
        cartHoverFocusTimerRef.current = null;
      }
    };
  }, [cameraView.fov, editorMode, hoveredCartInstanceId, items, transitionToCameraView, viewMode]);

  const {
    state: { isExporting, isPdfExporting },
    actions: { exportImages, exportPdf },
  } = useDesignPageExport({
    state: {
      designId,
      plan,
      exportStylePreset,
      sceneReady,
      cameraView,
      clientPreview,
      items,
    },
    actions: {
      setClientPreview,
      setUpgradeReason,
      setShowUpgrade,
      updateProjection,
      showToast: showRuleToast,
      logFunnelEvent,
    },
    refs: {
      canvasRef,
      cameraRef,
      controlsRef: orbitControlsRef,
      rendererRef,
      sceneRef,
      designSnapshotRef,
    },
  });
  useEffect(() => {
    if (typeof window === "undefined") {
      setLocalBackupHydrated(true);
      return;
    }
    let deferLocalBackupHydrated = false;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const restored = normalizeDesignPageLocalBackup({
        rawBackup: raw,
        state: {
          activeRoomId: designSnapshotRef.current.activeRoomId,
          roomWidth,
          roomDepth,
          wallThickness,
        },
        configuration: {
          catalogItems: CATALOG_ITEMS,
          resolveConfiguredPlanningDimsMm,
        },
      });

      if (restored.snapshot) {
        setDesignSnapshot(restored.snapshot);
        if (restored.format === "v3") {
          if (restored.cloudDesignId) {
            deferLocalBackupHydrated = true;
            void loadDesign(restored.cloudDesignId, {
              notFoundMessage: "Cloud design not found; restored local backup",
            })
              .then((loaded) => {
                if (!loaded) {
                  setDesignId(null);
                  setShareToken(null);
                  setShareEnabled(false);
                  clearPersistedSnapshotFingerprint();
                }
              })
              .finally(() => {
                setLocalBackupHydrated(true);
              });
          }
          hydratePersistedFloorPlanState(restored.snapshot);
        }
        history.clear();
      }
      setSavedViews(restored.savedViews);
    } catch {
      // ignore invalid saved data
    } finally {
      if (!deferLocalBackupHydrated) {
        setLocalBackupHydrated(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replaceDesignUrl = useCallback(
    (url: string) => router.replace(url, { scroll: false }),
    [router]
  );
  const {
    state: { startingCheckout, openingBillingPortal },
    actions: {
      openBillingPortal,
      openPlansFromUpgrade,
      signInFromUpgrade,
      closeUpgradeDialog,
      closePlansDialog,
      manageBillingFromPlans,
      startCheckoutFromPlans,
    },
  } = useDesignPageBilling({
    state: {
      authenticated: Boolean(session?.user),
      designId,
      stripeSessionId,
      refreshPlanRequested: searchParams.get("refresh_plan") !== null,
      currentSearch: searchParams.toString(),
      pathname,
      upgradeReason,
      pricingLayoutVariant,
    },
    actions: {
      setPlan,
      setShowUpgrade,
      setUpgradeReason,
      setShowPlans,
      requestSignIn: signInWithReturn,
      replaceUrl: replaceDesignUrl,
      showToast: showRuleToast,
      logFunnelEvent,
    },
    configuration: { paywallContextMeta },
  });
  useEffect(() => {
    if (editorOpenedRef.current) return;
    track("editor_opened", {
      design_id: designId ?? null,
      room_type: "living_room",
      mode,
      is_guest: !session?.user,
    });
    editorOpenedRef.current = true;
  }, [designId, mode, session?.user]);

  useEffect(() => {
    if (landingTrackedRef.current) return;
    track("landing_viewed", {
      design_id: designId ?? null,
      mode,
      is_guest: !session?.user,
    });
    logFunnelEvent("landing_viewed", {
      mode,
      is_guest: !session?.user,
    });
    landingTrackedRef.current = true;
  }, [designId, logFunnelEvent, mode, session?.user]);

  useEffect(() => {
    if (session?.user) return;
    try {
      const key = "ph_guest_started";
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      track("guest_session_start", { is_guest: true });
    } catch {
      // ignore sessionStorage errors
    }
  }, [session?.user]);


  useEffect(() => {
    if (!wantsDesigner) return;
    if (!canUseDesigner) {
      if (!designerAttemptRef.current) {
        track("mode_designer_attempted", { is_pro: false });
        designerAttemptRef.current = true;
      }
      setShowUpgrade(true);
      setMode("homeowner");
      return;
    }
    setMode("designer");
  }, [wantsDesigner, canUseDesigner]);

  useEffect(() => {
    if (!showUpgrade) {
      upgradeShownRef.current = false;
      return;
    }
    if (upgradeShownRef.current) return;
    track("upgrade_prompt_shown", { reason: "mode_designer" });
    upgradeShownRef.current = true;
  }, [showUpgrade]);

  useEffect(() => {
    setUpgradeCtaVariant(paywallVariant);
  }, [paywallVariant]);

  useEffect(() => {
    setPricingLayoutVariant(resolvedPricingLayout);
  }, [resolvedPricingLayout]);

  useEffect(() => {
    if (!qaPaywallHooksEnabled) return;
    if (paywallOpenParam !== "1") return;
    setUpgradeReason((current) => current ?? "designer");
    setShowUpgrade(true);
  }, [paywallOpenParam, qaPaywallHooksEnabled]);

  useEffect(() => {
    if (!qaPaywallHooksEnabled) return;
    if (plansOpenParam !== "1") return;
    setShowPlans(true);
  }, [plansOpenParam, qaPaywallHooksEnabled]);

  useEffect(() => {
    return () => {
      if (gridPulseTimerRef.current) {
        window.clearTimeout(gridPulseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!planSettingsLoaded) return;
    if (defaultPlanOpeningsSeededRef.current) return;
    if (planOpeningsStorageState === "pending") return;
    if (planOpeningsStorageState !== "missing" || planOpenings.length > 0) {
      defaultPlanOpeningsSeededRef.current = true;
      return;
    }
    defaultPlanOpeningsSeededRef.current = true;
    setPlanOpenings([
      {
        id: "door-east-main",
        wall: "east",
        offsetMm: 0,
        widthMm: 900,
        kind: "door",
      },
      {
        id: "window-west-main",
        wall: "west",
        offsetMm: 0,
        widthMm: 1200,
        kind: "window",
      },
    ]);
  }, [
    defaultPlanOpeningsSeededRef,
    planOpenings.length,
    planOpeningsStorageState,
    planSettingsLoaded,
    setPlanOpenings,
  ]);

  const {
    actions: {
      clearNonRoomSelection,
      clearAllSelection,
      deletePlanOverlayById,
      handleSelectPlanOverlay,
    },
  } = useDesignPageSelectionCoordinator({
    state: {
      editorMode,
      housePlanRooms: housePlan2D.rooms,
      isClientPreview,
      items,
      selectedPlanOverlayId,
    },
    configuration: { catalogItems: CATALOG_ITEMS },
    refs: {
      planAnnotations: planAnnotationsRef,
      planFixedElements: planFixedElementsRef,
      planOpenings: planOpeningsRef,
      selectedIds: selectedIdsRef,
    },
    actions: {
      clearSelection,
      commitItems,
      history,
      preserveCameraAfterPlanOverlaySelection,
      setEditorMode,
      setPlanAnnotations,
      setPlanFixedElements,
      setPlanOpenings,
      setSelectedPlanOverlayId,
      setSelectedPlanRoomId,
      setSelectedRendererSurfaceTarget,
      setSelectedZoneId,
      setSuppressedDoorwaySuggestionKeys,
    },
  });

  useEffect(() => {
    floorActionAdaptersRef.current = {
      clearNonRoomSelection,
      transitionToCameraView,
      updateCameraViewFromScene,
    };
  }, [clearNonRoomSelection, transitionToCameraView, updateCameraViewFromScene]);

  const {
    actions: {
      changeActiveRoomHeightMm: handleActiveRoomHeightMmChange,
      changeSelectedWallHeight: handleSelectedWallHeightChange,
      resetSelectedWallHeight: handleResetSelectedWallHeight,
      changeActiveRoomSlabThicknessMm: handleActiveRoomSlabThicknessMmChange,
      changeActiveRoomBaseboardDepthMm: handleActiveRoomBaseboardDepthMmChange,
      changeActiveRoomWallThicknessMm: handleActiveRoomWallThicknessMmChange,
      changeActiveRoomSurfaceOpacity: handleActiveRoomSurfaceOpacityChange,
      changeActiveRoomCeilingVisible: handleActiveRoomCeilingVisibleChange,
      changeActiveRoomCeilingColor: handleActiveRoomCeilingColorChange,
    },
  } = useDesignPageRoomGeometry({
    state: { activeFloorLevel },
    refs: { designSnapshot: designSnapshotRef },
    actions: {
      setDesignSnapshot,
      history,
      runHistoryTransaction,
      runCoalescedHistoryTransaction,
      showToast: showRuleToast,
    },
  });
  const {
    state: {
      showInspectorDetails,
      showFullDimensions,
      showDeliveryWarranty,
      showRotationControls,
      rotationInputValue,
      rotationSnapPresetDegrees,
      rotationSnapEnabled,
      rotationSnapStepDegrees,
      rotationSnapStepRadians,
      previewVariantId,
      previewMaterialPresetId,
      productModelVariantControlsState,
      productFinishControlsState,
    },
    derived: {
      selectedProduct,
      selectedBrand,
      selectedModelTitle,
      activeVariantLabel,
      selectedCategoryDebugLabel,
      selectedResolvedVariant,
      selectedItemPlanningDimensionsMm,
      selectedAdjustablePendantHeight,
      selectedStyleConsistencyReport,
      selectedProductDetailSections,
      selectedDimensionImageUrl,
      fullDimensionsDetails,
      itemPlanningBoundsByInstanceId,
    },
    actions: {
      setShowInspectorDetails,
      setShowFullDimensions,
      setShowDeliveryWarranty,
      setShowRotationControls,
      setRotationInputValue,
      setRotationSnapPresetDegrees,
      adjustSelectedPendantHeight,
      switchSelectedProductModel,
      modelControls: {
        handleSelectProductOrientation,
        handleSelectJaronConfigurationGroup,
        handleSelectJaronConfigurationOption,
        handleSelectJaronArm,
        handleSelectAuburnConfigurationGroup,
        handleSelectAuburnConfigurationOption,
        handleSelectAuburnOrientation,
        handleSelectArmStyleVariant,
        handleSelectProductModelVariant,
        handleSelectProductShapeVariant,
        handleSelectProductLengthVariant,
        handleSelectSloaneBenchCushion,
        handleSelectProductLength,
        handleSelectHuggModel,
        handleSelectSebModel,
        handleSelectProductConfiguration,
      },
      finishControls: {
        handleSelectFinishButton,
        handleSelectFinishSwatch,
        handleSelectLegFinish,
        handleSelectProductSize,
        handleSelectStructuredColour,
        handleShowStructuredColourPreview,
        handleHideStructuredColourPreview,
        handleBlurStructuredColourPreview,
      },
    },
    resolvers: {
      resolveItemConfigurationEntry,
      resolveConfiguredVisualDimsMm,
      resolveConfiguredPlanningDimsMm,
      resolveConfiguredNodeTransforms,
      resolveConfiguredModelUrl,
    },
  } = useDesignPageProductInspectionController({
    state: {
      items,
      selectedItem,
      selectedInstanceId,
      activeRoom: activeRoom ?? null,
      editorMode,
    },
    configuration: {
      catalogItems: CATALOG_ITEMS,
      importedModelOptions,
      importedCatalogByProductId,
      importedModelUrlByAssetId,
      canEdit,
      isClientPreview,
      liveCatalogReady,
    },
    actions: {
      clearAllSelection,
      commitItems,
      ensureImportedCatalogItem,
      setHoveredCartInstanceId,
    },
  });

  const {
    actions: { getItemAABB, getSelectionBounds },
  } = useDesignPageItemGeometry({
    configuration: {
      catalogItems: CATALOG_ITEMS,
      resolveConfiguredPlanningDimsMm,
    },
  });

  const {
    state: {
      room: { pendingRoomRenameId, pendingRoomRenameValue },
      overlay: {
        editorScene2D,
        roomConnectionChecklistItems,
        annotationToolKind,
        pendingAnnotationKind,
        pendingAnnotationText,
      },
      quality: {
        report: floorPlanQualityReport,
        reviewPanelCollapsed: planQualityReviewCollapsed,
        reviewPanelVisible: plan2DQualityReviewPanelVisible,
        reviewPanelTopPx: plan2DQualityReviewPanelTopPx,
        reviewPanelReservedBottomPx: plan2DQualityReviewPanelReservedBottomPx,
      },
      inspector: {
        floatingSelectionInspectorVisible,
        selectedObjectContext,
        selectedObjectInspector,
        selectedPlanAnnotation,
        selectedPlanFixedElement,
        visiblePlanOpening,
        visiblePlanOpeningMaxHeightMeters,
        visiblePlanOpeningRoomName,
        visiblePlanOpeningWallSpanMeters,
      },
    },
    refs: {
      quality: { setReviewPanelNode: setPlanQualityReviewPanelNode },
    },
    actions: {
      room: {
        switchRoom: handleSwitchRoom,
        startRoomRename: handleRenameSelectedPlanRoom,
        setPendingRoomRenameValue,
        cancelRoomRename,
        commitRoomRename,
        duplicateRoom: handleDuplicateSelectedPlanRoom,
        deleteRoom: handleDeleteSelectedPlanRoom,
        resizeRoom2D: handleResizeRoom2D,
        commitRoomDimensionEdit2D: handleCommitRoomDimensionEdit2D,
        commitActiveRoomDimension: handleCommitActiveRoomDimension,
        changeRoomPreset: handleRoomPresetChange,
        nudgeSelectedPlanRoom,
      },
      overlay: {
        setPendingAnnotationText,
        cancelPlanAnnotation,
        commitPlanAnnotation,
        handleMoveOpening2D,
        handleResizeOpening2D,
        handleUpdateOpeningMetrics2D,
        handleAddSuggestedDoorway,
        handleMoveFixedElement2D,
        handleMoveAnnotation2D,
        runPlanOverlayCommand,
        applyPlanLayerPresetInTransaction,
        selectAnnotationTool,
      },
      quality: {
        toggleReviewPanel: togglePlanQualityReviewPanel,
        activateIssue: handlePlanQualityAction,
      },
    },
  } = useDesignPagePlanEditingFacade({
    state: {
      document: {
        designSnapshot,
        activeRoom: activeRoom ?? null,
        items,
      },
      plan: {
        housePlanRooms: housePlan2D.rooms,
        selectedPlanRoomId,
        selectedPlanRoom: selectedPlanRoomContext,
        annotations: planAnnotations,
        openings: planOpenings,
        fixedElements: planFixedElements,
        suppressedDoorwaySuggestionKeys,
        selectedPlanOverlayId,
        canvasInteractionActive: activePlanCanvasInteraction,
      },
      selection: {
        selectedIds,
        selectedInstanceId,
        selectedItem,
        selectedItemPlanningDimensionsMm,
        selectedProduct,
      },
      editor: {
        editorMode,
        isClientPreview,
        viewMode,
      },
      surfaceInspector: {
        displayName: surfaceInspectorDisplayName,
        isCeiling: surfaceInspectorIsCeiling,
        isWall: surfaceInspectorIsWall,
        wallDefaultHeight: wallInspectorDefaultHeight,
        wallFaceId: wallInspectorFaceId,
        wallHeight: wallInspectorHeight,
      },
    },
    derived: { itemPlanningBoundsByInstanceId },
    configuration: {
      canEdit,
      catalogItems: CATALOG_ITEMS,
      resolveConfiguredPlanningDimsMm,
      roomWidth,
      roomDepth,
      roomHeight,
      planViewWidth,
      planViewDepth,
      planMeasurementUnit,
      houseRoomById,
      qualityReviewPanel: {
        reviewPanelTopPx: 76,
        collapsedReviewPanelFallbackHeightPx: 56,
        expandedReviewPanelFallbackHeightPx: 252,
      },
    },
    refs: {
      designSnapshot: designSnapshotRef,
      planOpenings: planOpeningsRef,
    },
    actions: {
      document: {
        setDesignSnapshot,
        setPlanOpenings,
        setPlanTheme,
        setPlanLayers,
        setPlanLayerPreset,
        setPlanAnnotations,
        setPlanFixedElements,
      },
      selection: {
        clearNonRoomSelection,
        selectPlanOverlay: handleSelectPlanOverlay,
        selectPlanRoom: setSelectedPlanRoomId,
        updateSelection,
      },
      room: {
        setSelectedPlanRoomId,
        setRoomWidthInput,
        setRoomDepthInput,
        renameRoom: handleRenameRoom,
        moveRoom2D: handleMoveRoom2D,
      },
      navigation: {
        goPlan,
        goFurnish,
        setViewMode,
        setTraceOpeningKind: setFloorPlanTraceOpeningKind,
      },
      history: { history, runHistoryTransaction },
      feedback: { showToast: showRuleToast, track },
    },
  });
  const {
    derived: {
      floatingPlanOverlayStackVisible,
      floatingFloorPropertiesPanelVisible,
      inlineFloorPropertiesPanelVisible,
      plan2DSafeAreaLeftPx,
      selectionInspectorDockedWithRightRail,
      selectionInspectorRightPx,
      selectionInspectorTopPx,
      selectionInspectorWidthPx,
      plan2DSafeAreaRightPx,
      plan2DSafeAreaBottomPx,
      plan2DFitBounds,
      exportReadinessItems,
      exportReadinessReadyCount,
      exportReadinessScore,
      lightConfig,
      sceneBackgroundColor,
      effectivePlanLayers,
      effectivePlanTheme,
      planCanvasCursor,
      compactRoomPlanStatusBar,
      showRoomPlanStatusHealth,
      planCanvasOverlaysState,
    },
    actions: { clearPlanFocusPoints },
  } = useDesignPagePlanPresentationModel({
    state: {
      layout: {
        designControlsPanelVisible: designControlsPanelVisibleForLayout,
        designControlsPanelMode,
        shoppingPanelVisible: shoppingPanelVisibleForLayout,
        commercePanelVisible: commercePanelVisibleForLayout,
        designPanelCollapsed,
        isClientPreview,
        isDesigner,
        floorCount: floorOptions.length,
        viewportWidth: viewportSize.width,
        viewMode,
        hasWholeHousePlan,
        planQualityReviewVisible: plan2DQualityReviewPanelVisible,
        planQualityReviewReservedBottomPx:
          plan2DQualityReviewPanelReservedBottomPx,
        housePlanRooms: housePlan2D.rooms,
        roomWidth,
        roomDepth,
      },
      export: {
        openingCount: planOpenings.length,
        itemCount: items.length,
        shoppableCount: wholeHomeShoppingSummary.shoppableCount,
        roomConnectionChecklistItems,
        sceneReady,
        exportStylePreset,
      },
      presentation: {
        lightingPreset,
        showDesignerTheme,
        simplePlanControls,
        planLayers,
        planTheme,
        planGuidedActionsEnabled,
        editorMode,
        guidedPlanStartMode,
        floorPlanUnderlay,
        floorPlanCalibrationMode,
        floorPlanCalibrationPointCount:
          floorPlanCalibrationPoints.length,
        floorPlanTraceRoomMode,
        floorPlanDrawRoomMode,
        floorPlanTraceRoomPointCount: floorPlanTraceRoomPoints.length,
        floorPlanTraceOpeningMode,
        floorPlanTraceOpeningKind,
        floorPlanTraceOpeningPointCount:
          floorPlanTraceOpeningPoints.length,
        activeFloorPlanTool,
        activePlanCanvasInteraction,
        planCanvasFocusActive,
        planSettingsLoaded,
        planGuidedActionsChoiceSeen,
        showBetaStart,
        dismissedPlanCanvasGuidanceKey,
      },
    },
    configuration: {
      simplePlanLayers: SIMPLE_PLAN_LAYERS,
      floatingOverlayDesktopMinWidthPx:
        PLAN_FLOATING_OVERLAY_DESKTOP_MIN_WIDTH,
      floatingOverlayStackRightPx: PLAN_FLOATING_OVERLAY_STACK_RIGHT_PX,
      floatingOverlayInspectorStackTopPx:
        PLAN_FLOATING_OVERLAY_INSPECTOR_STACK_TOP_PX,
      floatingOverlayStackWidthPx: PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX,
      floatingOverlayStackGapPx: PLAN_FLOATING_OVERLAY_STACK_GAP_PX,
    },
    actions: {
      resetFloorPlanCalibrationPoints: () =>
        setFloorPlanCalibrationPoints([]),
      resetFloorPlanTraceOpeningPoints: () =>
        setFloorPlanTraceOpeningPoints([]),
      resetFloorPlanTraceRoomPoints: () => {
        setFloorPlanTraceRoomPoints([]);
        setBlankGridRoomPreviewPoint(null);
      },
    },
  });
  const handleOpenFloorEditorForRoom = useCallback(
    (roomId?: string | null) => {
      const targetRoomId = roomId ?? selectedPlanRoomId ?? designSnapshot.activeRoomId;
      if (!targetRoomId) return;

      if (designSnapshot.activeRoomId !== targetRoomId) {
        handleSwitchRoom(targetRoomId);
      }

      clearNonRoomSelection();
      setSelectedPlanRoomId(targetRoomId);
      setActiveSurfaceTarget("floor");
      goPlan();
      setDesignPanelOpen(true);
      setDesignPanelCollapsed(false);
      surfaceInspectorUiActions.closeMaterialPicker();
      setFloorFinishPanelOpenSignal((signal) => signal + 1);
      showRuleToast("Choose a floor material from Surfaces");
      track("floor_finish_editor_opened", {
        roomId: targetRoomId,
        source: "selected_room",
      });
    },
    [
      clearNonRoomSelection,
      designSnapshot.activeRoomId,
      goPlan,
      handleSwitchRoom,
      selectedPlanRoomId,
      showRuleToast,
      surfaceInspectorUiActions,
    ]
  );
  const handleOpenWallMaterialEditorForRoom = useCallback(
    (roomId: string, faceId: string) => {
      if (designSnapshot.activeRoomId !== roomId) {
        handleSwitchRoom(roomId);
      }

      clearNonRoomSelection();
      setSelectedPlanRoomId(roomId);
      setSelectedWallSurfaceTarget({ roomId, faceId });
      setActiveSurfaceTarget("selected_wall");
      goPlan();
      setDesignPanelOpen(true);
      setDesignPanelCollapsed(false);
      surfaceInspectorUiActions.closeMaterialPicker();
      setFloorFinishPanelOpenSignal((signal) => signal + 1);
      showRuleToast("Choose a wall finish from Surfaces");
      track("wall_finish_editor_opened", {
        roomId,
        faceId,
        source: "selected_room",
      });
    },
    [
      clearNonRoomSelection,
      designSnapshot.activeRoomId,
      goPlan,
      handleSwitchRoom,
      showRuleToast,
      surfaceInspectorUiActions,
    ]
  );
  const handleOpenCeilingEditorForRoom = useCallback(
    (roomId: string) => {
      if (designSnapshot.activeRoomId !== roomId) {
        handleSwitchRoom(roomId);
      }

      clearNonRoomSelection();
      setSelectedPlanRoomId(roomId);
      setSelectedWallSurfaceTarget(null);
      setActiveSurfaceTarget("ceiling");
      goPlan();
      setDesignPanelOpen(true);
      setDesignPanelCollapsed(false);
      surfaceInspectorUiActions.closeMaterialPicker();
      setFloorFinishPanelOpenSignal((signal) => signal + 1);
      showRuleToast("Choose a ceiling paint from Surfaces");
      track("ceiling_finish_editor_opened", {
        roomId,
        source: "selected_ceiling",
      });
    },
    [
      clearNonRoomSelection,
      designSnapshot.activeRoomId,
      goPlan,
      handleSwitchRoom,
      showRuleToast,
      surfaceInspectorUiActions,
    ]
  );
  const {
    state: {
      pendingTemplateReplacement: pendingPlanTemplateReplacement,
    },
    actions: {
      applyPlanTemplate: handleApplyPlanTemplate,
      cancelPendingTemplateReplacement:
        handleCancelPendingPlanTemplateReplacement,
      confirmPendingTemplateReplacement:
        handleConfirmPendingPlanTemplateReplacement,
      uploadUnderlay: handleFloorPlanUnderlayUpload,
      changeUnderlayOpacity: handleFloorPlanUnderlayOpacityChange,
      changeUnderlayLock: handleFloorPlanUnderlayLockChange,
      changePdfPage: handleFloorPlanPdfPageChange,
      addCalibrationPoint: handleFloorPlanCalibrationPoint,
      resetCalibrationPoints: handleResetFloorPlanCalibrationPoints,
      applyCalibration: handleApplyFloorPlanCalibration,
      clearUnderlay: handleClearFloorPlanUnderlay,
    },
  } = useDesignPageFloorPlanUnderlayController({
    state: {
      floorPlanUnderlay,
      calibrationPoints: floorPlanCalibrationPoints,
      calibrationDistanceInput: floorPlanCalibrationDistanceInput,
      planOpenings,
    },
    configuration: {
      planViewWidth,
      planViewDepth,
      roomHeight,
      wallThickness,
    },
    refs: {
      designSnapshotRef,
      floorCameraViewsRef,
      underlayObjectUrlRef: floorPlanUnderlayUrlRef,
      pdfSourceDataRef: floorPlanPdfSourceDataRef,
    },
    actions: {
      history,
      setDesignSnapshot,
      setFloorPlanUnderlay,
      setFloorPlanPdfSourceReady,
      setFloorPlanPdfRenderingPage,
      setFloorPlanCalibrationPoints,
      setPlanOpenings,
      setPlanFixedElements,
      setSelectedPlanOverlayId,
      setViewMode,
      resetFloorPlanInteraction,
      resetFloorPlanCalibration,
      clearFloorPlanTraceBuffers,
      clearAllSelection,
      prepareCameraForPlanTemplate,
      revokeUnderlayObjectUrl: revokeFloorPlanUnderlayUrl,
      runHistoryTransaction,
      runCoalescedHistoryTransaction,
      showRuleToast,
    },
  });
  const {
    canApplySurfaceBrush,
    actions: {
      applyFloorMaterialToRoom: handleApplyFloorMaterialToRoom,
      applyFloorSizeVariantToRoom: handleApplyFloorSizeVariantToRoom,
      applyFloorMaterialToAllRooms: handleApplyFloorMaterialToAllRooms,
      applyWallMaterialToRoom: handleApplyWallMaterialToRoom,
      applyWallMaterialToAllRooms: handleApplyWallMaterialToAllRooms,
      applyWallPaintToRoom: handleApplyWallPaintToRoom,
      applyWallPaintToAllRooms: handleApplyWallPaintToAllRooms,
      applyCeilingPaintToRoom: handleApplyCeilingPaintToRoom,
      applyCeilingPaintToAllRooms: handleApplyCeilingPaintToAllRooms,
      resetActiveCeilingSurface: handleResetActiveCeilingSurface,
      changeActiveWallSurfaceSettings: handleActiveWallSurfaceSettingsChange,
      resetActiveWallSurface: handleResetActiveWallSurface,
      changeSurfaceTargetMode: handleSurfaceTargetModeChange,
      changeSurfaceBrushActive: handleSurfaceBrushActiveChange,
      selectSurfaceMaterialForBrush: handleSurfaceMaterialSelectedForBrush,
      selectSurfacePaintForBrush: handleSurfacePaintSelectedForBrush,
      rotateActiveFloorMaterial: handleRotateActiveFloorMaterial,
      resetActiveFloorMaterialPattern: handleResetActiveFloorMaterialPattern,
      changeActiveFloorMaterialScale: handleActiveFloorMaterialScaleChange,
      changeActiveFloorSurfaceSettings: handleActiveFloorSurfaceSettingsChange,
    },
  } = useDesignPageSurfaceActions({
    state: {
      selectedWallSurfaceTarget,
      surfaceBrushPaint,
    },
    configuration: {
      isClientPreview,
      liveCatalogReady,
    },
    adapters: {
      designSnapshotRef,
      setDesignSnapshot,
      runHistoryTransaction,
      runCoalescedHistoryTransaction,
      showRuleToast,
      setActiveSurfaceTarget,
      setSelectedRendererSurfaceTarget,
      setSelectedWallSurfaceTarget,
      setSurfaceBrushActive,
      setSurfaceBrushMaterialId,
      setSurfaceBrushPaint,
    },
  });
  const cameraNavigation = useDesignPageCameraNavigation({
    refs: {
      canvasRef,
      cameraRef,
      controlsRef: orbitControlsRef,
      cameraViewRef,
    },
    state: {
      cameraView,
      viewMode,
      sceneReady,
      hasWholeHousePlan,
      designRoomCount: designSnapshot.rooms.length,
      rooms: housePlan2D.rooms,
      items,
      selectedItem: selectedItem ?? null,
      selectedProduct: selectedProduct ?? null,
    },
    configuration: {
      defaultCameraView: DEFAULT_EDITOR_CAMERA_VIEW,
      designId,
      viewportSize,
      planFitBounds: plan2DFitBounds,
      planSafeAreaLeftPx: plan2DSafeAreaLeftPx,
      planSafeAreaRightPx: plan2DSafeAreaRightPx,
      planSafeAreaBottomPx: plan2DSafeAreaBottomPx,
      floatingPlanOverlayStackVisible,
      floatingPlanOverlayStackWidthPx: PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX,
      roomHeight,
      planViewWidth,
      planViewDepth,
      min3DPolarAngle: EDITOR_3D_MIN_POLAR_ANGLE,
      max3DPolarAngle: EDITOR_3D_MAX_POLAR_ANGLE,
    },
    actions: {
      setCameraView,
      setViewMode,
      resetFloorPlanInteraction,
      showRuleToast,
      switchRoom: handleSwitchRoom,
    },
  });
  cameraNavigationActionsRef.current = cameraNavigation.actions;
  const { plan2DWholeHomeViewFit } = cameraNavigation.state;
  const {
    isCameraAnimatingRef,
  } = cameraNavigation.refs;
  const {
    handleEditorViewModeChange,
    handleFitPlanView,
    handleFitSelectedPlanRoom,
    handleWholeHomeMoveTarget,
    handleWholeHomeMoveCamera,
    nudgeWholeHomeCameraForDrag,
    handleWholeHomeNavigatorZoom,
    handleWholeHomeFocusRoom,
    getEyeLevelView,
    getFocusView,
  } = cameraNavigation.actions;

  const {
    state: { consumerPlanCompletionSignal },
    actions: {
      choosePlanGuidedActionsMode,
      handleConsumerPlanCompletionHandled,
      selectFloorPlanTool: handleSelectFloorPlanTool,
      changeCalibrationMode: handleFloorPlanCalibrationModeChange,
      addFloorPlanOpeningFromTool: handleAddFloorPlanOpeningFromTool,
      changeTraceRoomMode: handleFloorPlanTraceRoomModeChange,
      changeDrawRoomMode: handleFloorPlanDrawRoomModeChange,
      changeTraceOpeningMode: handleFloorPlanTraceOpeningModeChange,
      resetTraceOpeningPoints: handleResetFloorPlanTraceOpeningPoints,
      traceOpeningPoint: handleFloorPlanTraceOpeningPoint,
      traceBlankGridOpeningPoint: handleBlankGridTraceOpeningPoint,
      handleApplyFloorPlanExactWallLength,
      handleBlankGridRoomDrawDrag,
      handleBlankGridRoomDrawPoint,
      handleBlankGridRoomDrawPreviewPoint,
      handleCommitWallDrawSegmentLength2D,
      handleFloorPlanTraceRoomPoint,
      handleResetFloorPlanTraceRoomPoints,
      handleUndoFloorPlanTraceRoomPoint,
    },
  } = useDesignPageFloorPlanTracing({
    state: {
      activeRoom,
      housePlanRooms: housePlan2D.rooms,
      roomCount: designSnapshot.rooms.length,
      floorPlanUnderlay,
      floorPlanTraceRoomType,
      floorPlanTraceRoomMode,
      floorPlanDrawRoomMode,
      floorPlanDrawAngleLockMode,
      floorPlanExactWallLengthInput,
      floorPlanTraceRoomPoints,
      blankGridRoomDrawActive,
      blankGridRoomPreviewPoint,
      floorPlanTraceOpeningMode,
      floorPlanTraceOpeningPoints,
      floorPlanTraceOpeningKind,
      planOpenings,
      planGuidedActionsEnabled,
      isDesigner,
      isClientPreview,
      editorMode,
      viewMode,
      selectedPlanRoomId,
      selectedPlanOverlayId,
      selectedZoneId,
    },
    refs: {
      selectedIdsRef,
    },
    actions: {
      history,
      handleAddRoom,
      setDesignSnapshot,
      setPlanOpenings,
      setViewMode,
      setDesignPanelOpen,
      setPlanFocusPanelRevealed,
      setPlanGuidedActionsEnabled,
      setPlanGuidedActionsChoiceSeen,
      setBlankGridRoomPreviewPoint,
      setFloorPlanTraceRoomMode,
      setFloorPlanTraceRoomPoints,
      setFloorPlanTraceOpeningMode,
      setFloorPlanTraceOpeningPoints,
      activateFloorPlanSelectTool,
      activateFloorPlanCalibrationMode,
      activateFloorPlanRoomTrace,
      activateFloorPlanRoomDrawMode,
      activateFloorPlanOpeningTrace,
      handleSelectPlanOverlay,
      clearAllSelection,
      showRuleToast,
    },
  });
  const {
    state: { cameraViewNameInput },
    actions: {
      setCameraViewNameInput,
      saveCurrentNamedView,
      deleteSavedCameraView,
      openSavedCameraView,
    },
  } = useDesignPageNamedCameraViewsController({
    state: { cameraView },
    configuration: {
      maximumSavedViews: 6,
      openTransitionDurationMs: 460,
    },
    refs: { designSnapshot: designSnapshotRef },
    actions: {
      setDesignSnapshot,
      setLegacySavedViews: setSavedViews,
      showToast: showRuleToast,
      handleEditorViewModeChange,
      transitionToCameraView,
    },
  });
  const {
    state: { layoutVersionNameInput },
    actions: {
      setLayoutVersionNameInput,
      saveCurrentLayoutVersion,
      restoreRoomLayoutVersion,
      deleteRoomLayoutVersion,
    },
  } = useDesignPageLayoutVersionsController({
    refs: { designSnapshot: designSnapshotRef },
    actions: {
      setDesignSnapshot,
      history,
      updateSelection,
      showToast: showRuleToast,
    },
  });

  const {
    state: { selectedZone, pendingZoneType, planZones2D },
    actions: {
      setPendingZoneType,
      createZoneFromSelection,
      autoCreateSeatingZone,
      autoLayoutZone,
      rotateZone,
      ungroupZone,
    },
    resolvers: { getZoneBounds },
  } = useDesignPageZoneController({
    state: {
      items,
      zones,
      selectedZoneId,
    },
    configuration: {
      editorMode,
      isClientPreview,
      isDesigner,
      catalogItems: CATALOG_ITEMS,
      roomWidth,
      roomDepth,
      wallThickness,
    },
    refs: {
      selectedIds: selectedIdsRef,
      items: itemsRef,
      zones: zonesRef,
      seatingZoneAutoDisabled: seatingZoneAutoDisabledRef,
    },
    actions: {
      setDesignSnapshot,
      setSelectedZoneId,
      clearSelection,
      commitItems,
      history,
      clampToRoom: clampToActiveRoom,
      getSelectionBounds,
      getItemAABB,
    },
  });

  useEffect(() => {
    if (!sceneReady) return;
    const t = window.setTimeout(() => {
      updateCameraViewFromScene();
    }, 0);
    return () => window.clearTimeout(t);
  }, [sceneReady, updateCameraViewFromScene]);

  const {
    state: {
      persistence: {
        lastPersistedSnapshotFingerprint,
        isSaving,
        saveStatus,
        sharingDesign,
        shareSuccessToast,
        shareErrorToast,
        shareLinkFallback,
        showMyDesigns,
        myDesigns,
        loadingDesigns,
        selectedSavedDesignIds,
        deletingDesignIds,
        pendingDeleteDesign,
        allSavedDesignIds,
        selectedSavedDesignCount,
        allSavedDesignsSelected,
        guestPromptReason,
      },
      newPlan: { startingNewPlan, newPlanStartError },
    },
    actions: {
      persistence: {
        saveDesignToCloud,
        retrySaveStatus,
        loadDesign,
        clearPersistedSnapshotFingerprint,
        createShareLinkAndCopy,
        closeShareLinkFallback,
        copyFallbackShareLink,
        openFallbackShareLink,
        toggleMyDesigns,
        closeMyDesigns,
        handleLoadDesign,
        toggleSavedDesignSelection,
        toggleAllSavedDesignSelection,
        requestDeleteSavedDesigns,
        cancelDeleteSavedDesigns,
        handleDeleteSavedDesign,
        openGuestPrompt,
        handleGuestPromptNotNow,
        handleGuestSaveAndContinue,
      },
      newPlan: {
        openNewPlanPicker,
        cancelPendingPlanChoice,
        replaceCurrentPlanFromChoice,
        saveCurrentAndStartNewPlan,
      },
    },
  } = useDesignPagePersistenceNewPlanFacade({
    state: {
      identity: {
        designId,
        shareEnabled,
      },
      document: {
        designSnapshot,
        currentStoredDesignFingerprint,
        items,
        zones,
        savedViews,
        roomWidth,
        roomDepth,
        style,
        budget,
        mode,
        notes,
      },
      session: {
        isAuthenticated: Boolean(session?.user),
        isDesigner,
      },
      lifecycle: {
        localBackupHydrated,
      },
      newPlan: {
        pendingReplacement: pendingPlanTemplateReplacement,
      },
    },
    actions: {
      persistence: {
        setDesignId,
        setShareToken,
        setShareEnabled,
        setDesignSnapshot,
        hydratePersistedFloorPlanState,
        clearHistory: () => history.clear(),
        setMode,
        setNotes,
        setSavedViews,
        setStyle,
        setBudget,
        showRuleToast,
        showMaxDesignUpgrade: () => setShowUpgrade(true),
        requestSignIn: signInWithReturn,
      },
      newPlan: {
        setGuidedPlanStartMode,
        goPlan,
        setViewMode,
        setDesignPanelOpen,
        setDesignPanelCollapsed,
        cancelPendingReplacement: handleCancelPendingPlanTemplateReplacement,
        confirmPendingReplacement: handleConfirmPendingPlanTemplateReplacement,
        clearHistory: () => history.clear(),
        clearPlanAnnotations: () => setPlanAnnotations([]),
        requestSignIn: signInWithReturn,
        showToast: showRuleToast,
      },
    },
    configuration: {
      storageKey: STORAGE_KEY,
      cloudSaveDelayMs: 900,
      guestSaveDelayMs: 800,
    },
    refs: {
      getStoredDesignForPersistence,
      fingerprintStoredDesign,
    },
  });

  // Precompute wall descriptors for Furniture to snap against (inner face coords)
  const halfW = roomWidth / 2;
  const halfD = roomDepth / 2;
  const halfLong = 2.2 / 2; // default sofa long half (adjusts per item via product.dimensions)

  const walls = [
    // left wall (inner face X)
    {
      axis: "x" as const,
      coord: -halfW + wallThickness / 2,
      // allowed range along Z when sofa long side is parallel to wall
      min: -halfD + wallThickness / 2 + halfLong,
      max: halfD - wallThickness / 2 - halfLong,
    },
    // right wall
    {
      axis: "x" as const,
      coord: halfW - wallThickness / 2,
      min: -halfD + wallThickness / 2 + halfLong,
      max: halfD - wallThickness / 2 - halfLong,
    },
    // front wall (negative Z)
    {
      axis: "z" as const,
      coord: -halfD + wallThickness / 2,
      min: -halfW + wallThickness / 2 + halfLong,
      max: halfW - wallThickness / 2 - halfLong,
    },
    // back wall (positive Z)
    {
      axis: "z" as const,
      coord: halfD - wallThickness / 2,
      min: -halfW + wallThickness / 2 + halfLong,
      max: halfW - wallThickness / 2 - halfLong,
    },
  ];

  const {
    actions: {
      applyPendingProposal: applyPendingAiLayoutProposal,
      dismissPendingProposal: dismissPendingAiLayoutProposal,
      runAiLayout,
      regenerateAiLayout,
      bulkSwap: onBulkSwap,
      resizeRugToSofaRule,
    },
  } = useDesignPageAiLayout({
    state: {
      seed: aiSeed,
      pendingProposal: pendingAiLayoutProposal,
    },
    actions: {
      setSeed: setAiSeed,
      setPendingProposal: setPendingAiLayoutProposal,
      commitItems,
      clearAllSelection,
      setEditorMode,
      setDesignPanelOpen,
      openGuestPrompt,
      showRuleToast,
    },
    configuration: {
      isAuthenticated: Boolean(session?.user),
      designId,
      style,
      budget,
      room: {
        width: roomWidth,
        depth: roomDepth,
        wallThickness,
        type: activeRoom?.roomType,
      },
      floorPlanQualityContext: floorPlanQualityReport.aiPlanningContext,
    },
    refs: {
      getItems: () => itemsRef.current,
      createInstanceId: newInstanceId,
      clampToRoom: clampToActiveRoom,
    },
  });

  const getAiNotesItems = useCallback(() => itemsRef.current, []);
  const {
    state: {
      open: showAINotes,
      loading: aiNotesLoading,
      data: aiNotesData,
    },
    actions: {
      generate: generateAINotes,
      applySuggestion,
      close: closeAiNotes,
    },
  } = useDesignPageAiNotes({
    state: {
      items,
      designId,
      designerMode: isDesigner,
      authenticated: Boolean(session?.user),
    },
    actions: {
      getItems: getAiNotesItems,
      resizeRugToSofa: resizeRugToSofaRule,
      makeRoomCheaper: () => onBulkSwap("cheaper"),
      addItem,
      commitItems: (nextItems, actionName) => commitItems(nextItems, actionName),
      showToast: showRuleToast,
    },
  });

  const {
    queries: {
      clampToCatalogPlacementRoom,
      catalogPlacementCollidesInRoom,
      findCatalogPlacementBlockerInRoom,
      isCatalogPlacementContainedInRoom,
    },
  } = useDesignPagePlacementRoomQueries({
    configuration: { houseRoomById },
    actions: { getItemAABB },
  });

  const getItemDisplayName = useCallback((item: DesignItem | null | undefined) => {
    if (!item) return null;
    if (isParametricCabinetItem(item)) return item.name ?? item.cabinetDefinition.name;
    return CATALOG_ITEMS[item.productId]?.title ?? "another item";
  }, []);

  const setCatalogPlacementPreviewTarget = useCallback(
    (target: CatalogPlacementPreviewTarget | null) => {
      setCrossRoomDragTarget((current) => {
        if (target) return target;
        return current?.kind === "preview" ? null : current;
      });
    },
    []
  );
  const {
    state: {
      pendingPlacement: pendingCatalogPlacement,
      hoverPlacement: hoverCatalogPlacement,
    },
    scene: {
      pendingCatalogPlacementScene,
      hoverCatalogPlacementScene,
      activeCatalogPlacementSurfaceHighlight,
      pendingCatalogPlacementRoom,
      activePlacementCompatibleZoneIds,
      circulationHeatmap,
    },
    assessment: {
      pendingCatalogPlacementBlocked,
      restorableCatalogPlacement,
      pendingCatalogPlacementScore,
      pendingCatalogPlacementQuality,
      pendingCatalogPlacementImprovement,
      pendingCatalogBestRoomPlacement,
      pendingCatalogBestVariantPlacement,
      pendingCatalogPlacementHardInvalid,
      pendingCatalogPlacementStatusLabel,
      shouldConfirmImprovedCatalogPlacement,
      shouldConfirmRestoredCatalogPlacement,
    },
    actions: {
      targetPendingCatalogPlacementToRoom: targetPendingCatalogPlacementToRoomAction,
      rotatePendingCatalogPlacement,
      nudgePendingCatalogPlacement,
      centerPendingCatalogPlacement,
      autoPlacePendingCatalogPlacement,
      improvePendingCatalogPlacement,
      restoreLastValidCatalogPlacement,
      movePendingCatalogPlacementToBestRoom:
        movePendingCatalogPlacementToBestRoomAction,
      switchPendingCatalogPlacementToBestOption,
      addCatalogItemDirectlyToRoom,
      addCatalogItemToRoom,
      autoPlaceCatalogItemInRoom,
      previewCatalogPlacementIntent,
      selectPendingCatalogPlacementBlocker,
      placePendingCatalogBesideBlocker,
      trySmallerPendingCatalogVariant,
      movePendingCatalogBlockerAside,
      swapPendingCatalogWithBlocker,
      confirmPendingCatalogPlacement,
      cancelPendingCatalogPlacement,
      handleCatalogPlacementPointerDown,
      handleCatalogPlacementPointerMove,
      handleCatalogPlacementPointerUp,
      handleCatalogDragStart,
      handleCatalogDragEnd,
      handleCatalogCanvasDragOver,
      handleCatalogCanvasDrop,
      handleCatalogCanvasDragLeave,
    },
  } = useDesignPageCatalogPlacement({
    configuration: {
      activeRoom,
      activeRoomId: designSnapshot.activeRoomId,
      rooms: designSnapshot.rooms,
      roomSnapshotById,
      houseRoomById,
      planOpenings,
      roomWidth,
      roomDepth,
      wallThickness,
      placementAddMode,
      hasWholeHousePlan,
      catalogCanvasDragDisabled: isClientPreview || editorMode === "present",
    },
    adapters: {
      getActiveItems: getActiveCatalogPlacementItems,
      getActiveRoomId: getActiveCatalogPlacementRoomId,
      getRooms: getCatalogPlacementRooms,
      getItemAABB,
      getItemDisplayName,
      getPlanningDimensions: resolveConfiguredPlanningDimsMm,
      commitItemsToRoom,
      selectItems: selectCatalogPlacementItems,
      createInstanceId: newInstanceId,
      showToast: showRuleToast,
      clampToActiveRoom,
      clampToCatalogPlacementRoom,
      catalogPlacementCollidesInRoom,
      findCatalogPlacementBlockerInRoom,
      isCatalogPlacementContainedInRoom,
      resolveGroundPointFromClient,
      findPlanRoomAtWorldPoint,
      nudgeCameraForDrag: nudgeWholeHomeCameraForDrag,
      setCanvasObjectDragging: setSofaDragging,
      setPreviewTarget: setCatalogPlacementPreviewTarget,
    },
  });

  const placementTargetRoomId =
    pendingCatalogPlacement?.roomId ?? crossRoomDragTarget?.roomId ?? null;
  const placementTargetPlanRoom = useMemo(
    () =>
      placementTargetRoomId
        ? houseRoomById.get(placementTargetRoomId) ?? null
        : null,
    [houseRoomById, placementTargetRoomId]
  );
  const placementTargetRoom = placementTargetRoomId
    ? roomSnapshotById.get(placementTargetRoomId) ?? null
    : null;

  const {
    actions: { transferItemToRoom },
  } = useDesignPageCrossRoomItemTransfer({
    configuration: { houseRoomById },
    refs: {
      designSnapshot: designSnapshotRef,
      activeItems: itemsRef,
      dragCommit: dragCommitRef,
    },
    actions: {
      getPlanningDimensions: resolveConfiguredPlanningDimsMm,
      clampToCatalogPlacementRoom,
      isCatalogPlacementContainedInRoom,
      findCatalogPlacementBlockerInRoom,
      getItemDisplayName,
      setDesignSnapshot,
      updateSelection,
      history,
      showToast: showRuleToast,
    },
  });

  const {
    actions: {
      targetPendingCatalogPlacementToRoom,
      handlePlacementAwareRoomSelect,
      handleRendererSurfaceTargetSelect,
    },
  } = useDesignPagePlacementTargetController({
    state: {
      editorMode,
      surfaceBrush: {
        active: surfaceBrushActive,
        materialId: surfaceBrushMaterialId,
        paint: surfaceBrushPaint,
      },
    },
    configuration: { canApplySurfaceBrush },
    refs: { designSnapshot: designSnapshotRef },
    actions: {
      placement: {
        targetPendingCatalogPlacementToRoom:
          targetPendingCatalogPlacementToRoomAction,
      },
      selection: {
        clearNonRoomSelection,
        setSelectedPlanRoomId,
        setSelectedRendererSurfaceTarget,
        setSelectedWallSurfaceTarget,
      },
      navigation: {
        preserveCameraAfterPlanOverlaySelection,
        resetFloorPlanTraceRoomPoints:
          handleResetFloorPlanTraceRoomPoints,
        switchRoom: handleSwitchRoom,
        setEditorMode,
      },
      surface: {
        setActiveSurfaceTarget,
        applyFloorMaterialToRoom: handleApplyFloorMaterialToRoom,
        applyCeilingPaintToRoom: handleApplyCeilingPaintToRoom,
        applyWallPaintToRoom: handleApplyWallPaintToRoom,
        applyWallMaterialToRoom: handleApplyWallMaterialToRoom,
      },
      telemetry: { track },
    },
  });

  const movePendingCatalogPlacementToBestRoom = useCallback(() => {
    movePendingCatalogPlacementToBestRoomAction();
  }, [movePendingCatalogPlacementToBestRoomAction]);

  const previewShoppingReplacement = useCallback(
    (productId: string, variantId: string) => {
      goFurnish();
      previewCatalogPlacementIntent(productId, variantId);
      showRuleToast("Previewing replacement placement");
    },
    [goFurnish, previewCatalogPlacementIntent, showRuleToast]
  );

  const canEditPlanGeometry = !isClientPreview;

  const {
    state: selectedSurfaceInspectorState,
    actions: selectedSurfaceInspectorActions,
  } = useDesignPageSurfaceInspector({
    state: {
      context: surfaceInspectorContext,
      selectedPlanRoom: selectedPlanRoomContext,
      hasSelectedItem: Boolean(selectedItem),
      hasVisiblePlanOpening: Boolean(visiblePlanOpening),
      hasSelectedPlanFixedElement: Boolean(selectedPlanFixedElement),
      hasSelectedPlanAnnotation: Boolean(selectedPlanAnnotation),
      planMeasurementUnit,
    },
    configuration: {
      canEdit,
      canEditPlanGeometry,
      isDesigner,
    },
    actions: {
      surface: {
        applyFloorMaterialToRoom: handleApplyFloorMaterialToRoom,
        applyFloorSizeVariantToRoom: handleApplyFloorSizeVariantToRoom,
        applyFloorMaterialToAllRooms: handleApplyFloorMaterialToAllRooms,
        applyWallMaterialToRoom: handleApplyWallMaterialToRoom,
        applyWallMaterialToAllRooms: handleApplyWallMaterialToAllRooms,
        applyWallPaintToRoom: handleApplyWallPaintToRoom,
        applyWallPaintToAllRooms: handleApplyWallPaintToAllRooms,
        applyCeilingPaintToRoom: handleApplyCeilingPaintToRoom,
        applyCeilingPaintToAllRooms: handleApplyCeilingPaintToAllRooms,
        resetActiveCeilingSurface: handleResetActiveCeilingSurface,
        changeActiveWallSurfaceSettings:
          handleActiveWallSurfaceSettingsChange,
        resetActiveWallSurface: handleResetActiveWallSurface,
        changeSurfaceTargetMode: handleSurfaceTargetModeChange,
        changeSurfaceBrushActive: handleSurfaceBrushActiveChange,
        selectSurfaceMaterialForBrush: handleSurfaceMaterialSelectedForBrush,
        selectSurfacePaintForBrush: handleSurfacePaintSelectedForBrush,
        rotateActiveFloorMaterial: handleRotateActiveFloorMaterial,
        resetActiveFloorMaterialPattern:
          handleResetActiveFloorMaterialPattern,
        changeActiveFloorMaterialScale:
          handleActiveFloorMaterialScaleChange,
        changeActiveFloorSurfaceSettings:
          handleActiveFloorSurfaceSettingsChange,
      },
      inspectorUi: surfaceInspectorUiActions,
      changeSelectedWallHeight: handleSelectedWallHeightChange,
      resetSelectedWallHeight: handleResetSelectedWallHeight,
      openFloorEditorForRoom: handleOpenFloorEditorForRoom,
      openWallMaterialEditorForRoom: handleOpenWallMaterialEditorForRoom,
      openCeilingEditorForRoom: handleOpenCeilingEditorForRoom,
    },
  });
  const addSelectedImportedToRoom = useCallback(() => {
    if (!selectedImportedProductId) return;
    const related = getRelatedImportedProductIds(selectedImportedProductId);
    related.forEach((id) => ensureImportedCatalogItem(id));
    addCatalogItemToRoom(selectedImportedProductId);
  }, [
    addCatalogItemToRoom,
    ensureImportedCatalogItem,
    getRelatedImportedProductIds,
    selectedImportedProductId,
  ]);

  const removeFromCart = useCallback((productId: string) => {
    setItemCart((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const updateCartQty = useCallback((productId: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(productId);
    } else {
      setItemCart((prev) =>
        prev.map((i) =>
          i.productId === productId ? { ...i, qty } : i
        )
      );
    }
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    setItemCart([]);
  }, []);

  const addAllToRoom = useCallback(() => {
    // Add all items from cart to the room
    let addedCount = 0;
    itemCart.forEach((cartItem) => {
      for (let i = 0; i < cartItem.qty; i++) {
        if (addCatalogItemDirectlyToRoom(cartItem.productId)) {
          addedCount += 1;
        }
      }
    });
    if (addedCount < itemCart.reduce((sum, item) => sum + item.qty, 0)) {
      showRuleToast("Some cart items could not fit in this room.");
    }
    clearCart();
    setItemCartOpen(false);
  }, [addCatalogItemDirectlyToRoom, clearCart, itemCart, showRuleToast]);

  const {
    state: { firstRunActivationState, nextBestActionNudge },
  } = useDesignPageOnboarding({
    state: {
      designId,
      shareToken,
      plan,
      editorMode,
      viewMode,
      mode,
      isClientPreview,
      isGuest: !session?.user,
      items,
      zones,
      constraintResults,
      showBetaStart,
      designRoomCount: designSnapshot.rooms.length,
      planRoomCount: housePlan2D.rooms.length,
      saveStatusKind: saveStatus.kind,
      planGuidedActionsEnabled,
      viewportSize,
    },
    actions: {
      autoCreateSeatingZone,
      clampToRoom: clampToActiveRoom,
      showConstraintsForMoment,
      showConfidenceSummary,
      logFunnelEvent,
    },
    configuration: {
      roomWidth,
      roomDepth,
      wallThickness,
    },
  });

  const {
    state: {
      studio: cabinetryStudioState,
      canUseStudio: canUseCabinetryStudio,
      accessLevel: cabinetryAccessLevel,
      availableSpaces: cabinetryAvailableSpaces,
      preferredSpaceId: cabinetryPreferredSpaceId,
      selected: selectedCabinet,
      project: {
        assets: projectCabinetAssets,
        schedulePackage: projectCabinetSchedulePackage,
        handoffPackage: projectCabinetHandoffPackage,
      },
    },
    refs: { openedAt: cabinetryStudioOpenedAtRef },
    actions: {
      openCreateStudio: openCabinetryStudio,
      dismissStudio: dismissCabinetryStudio,
      saveDefinition: handleSaveCabinetDefinition,
      placeInPlan: handlePlaceCabinetInPlan,
      centerSelected: centerSelectedCabinetInRoom,
      snapSelectedToWall: snapSelectedCabinetToNearestWall,
      nudgeSelected: nudgeSelectedCabinet,
      rotateSelectedByDegrees: rotateSelectedCabinetByDegrees,
      resetSelectedRotation: resetSelectedCabinetRotation,
      exportSelected: handleSelectedCabinetExport,
      editSelected: handleEditSelectedCabinet,
    },
  } = useDesignPageCabinetry({
    state: {
      activeRoom: activeRoom ?? null,
      activePlanRoom: activeRoom
        ? houseRoomById.get(activeRoom.id) ?? null
        : null,
      planRoomCount: housePlan2D.rooms.length,
      planOpenings,
      preferredWallFaceId:
        activeSurfaceTarget === "selected_wall"
          ? activeSelectedWallFaceId
          : null,
      selectedItem: selectedItem ?? null,
      designSnapshot,
    },
    configuration: {
      isClientPreview,
      isDesigner,
      canEdit,
      designId,
      roomWidth,
      roomDepth,
      wallThickness,
      rotationSnapEnabled,
      rotationSnapStepRadians,
    },
    refs: {
      getDesignSnapshot: () => designSnapshotRef.current,
      replaceActiveItemsSnapshot: (nextItems) => {
        itemsRef.current = nextItems;
      },
    },
    actions: {
      setDesignSnapshot,
      commitItems,
      commitItemsToRoom,
      updateSelection,
      createInstanceId: newInstanceId,
      clampToActiveRoom,
      clampToCatalogPlacementRoom,
      isCatalogPlacementContainedInRoom,
      getItemAABB,
      getItemDisplayName,
      showToast: showRuleToast,
    },
  });
  const selectedCabinetItem = selectedCabinet?.item ?? null;

  const {
    state: {
      selectedRotationDegrees,
      rotateControlsDisabled,
      selectedItemPanelControllerState,
    },
    actions: {
      alignSelectionX,
      alignSelectionZ,
      applyItemRotation,
      rotateSelectedByDegrees,
      resetSelectedRotation,
      applyRotationInputValue,
      duplicateSelectedItem,
      deleteSelectedItem,
      centerSelectedItemInRoom,
      snapSelectedItemToNearestWall,
      moveSelectedItemToRoom,
      nudgeSelectedItem,
      setSelectedItemQuantity,
      setShoppingItemInclude,
      addActiveRoomCartReadyItems,
      selectProductVariant: handleSelectProductVariant,
      selectedItemPanelControllerActions,
    },
  } = useDesignPageItemInteractionFacade({
    state: {
      selection: {
        selectedItem: selectedItem ?? null,
        selectedProduct: selectedProduct ?? null,
        selectedIds,
        selectedInstanceId,
        selectedItemPlanningDimensionsMm,
        selectedItemDeleteLabel:
          selectedCabinetItem?.name ??
          selectedCabinetItem?.cabinetDefinition.name ??
          selectedProduct?.title ??
          "Item",
      },
      room: {
        activeRoom: activeRoom ?? null,
        activeRoomShoppingItems,
      },
      editor: { editorMode, isClientPreview, viewMode },
      plan: {
        selectedPlanOverlayId,
        selectedPlanRoomId: selectedPlanRoomContext?.id ?? null,
        selectedZoneId,
      },
      placement: {
        hasPendingCatalogPlacement: Boolean(pendingCatalogPlacement),
      },
      productInspection: {
        rotationInputValue,
        selectedResolvedVariant,
        showInspectorDetails,
        showFullDimensions,
        showDeliveryWarranty,
        showRotationControls,
      },
      presentation: { style, designId },
    },
    configuration: {
      canEdit,
      isDesigner,
      roomWidth,
      roomDepth,
      wallThickness,
      rotationSnapEnabled,
      rotationSnapStepRadians,
      catalogItems: CATALOG_ITEMS,
    },
    derived: { activeRoomPlanOffset, roomSnapshotById },
    refs: {
      items: itemsRef,
      selectedIds: selectedIdsRef,
      primaryId: primaryIdRef,
      designSnapshot: designSnapshotRef,
    },
    actions: {
      document: {
        commitItems,
        createInstanceId: newInstanceId,
        setDesignSnapshot,
        replaceActiveItemsSnapshot: (nextItems) => {
          itemsRef.current = nextItems;
        },
      },
      selection: { updateSelection, clearAllSelection },
      geometry: {
        getItemAABB,
        getSelectionBounds,
        getPlanningDimensions: resolveConfiguredPlanningDimsMm,
      },
      placement: {
        clampToActiveRoom,
        clampToCatalogPlacementRoom,
        findCatalogPlacementBlockerInRoom,
        isCatalogPlacementContainedInRoom,
        getItemDisplayName,
        cancel: cancelPendingCatalogPlacement,
        confirm: confirmPendingCatalogPlacement,
        rotate: rotatePendingCatalogPlacement,
        nudge: nudgePendingCatalogPlacement,
      },
      room: {
        transferItemToRoom,
        keyboard: {
          delete: handleDeleteSelectedPlanRoom,
          duplicate: handleDuplicateSelectedPlanRoom,
          nudge: nudgeSelectedPlanRoom,
        },
      },
      history,
      feedback: {
        showToast: showRuleToast,
        showConstraintsForMoment,
        showConfidenceSummary,
        trackFirstInteraction,
      },
      productInspection: {
        setRotationInputValue,
        switchSelectedProductModel,
        setShowInspectorDetails,
        setShowFullDimensions,
        setShowDeliveryWarranty,
        setShowRotationControls,
      },
    },
  });

  const handleDraggingChange = (isDragging: boolean) => {
    setSofaDragging(isDragging);
    if (isDragging) {
      dragCommitRef.current = false;
      return;
    }
    // On drag end, commit the transaction if one was started
    if (dragCommitRef.current) {
      history.commit();
      dragCommitRef.current = false;
    }
  };

  const triggerGridPulse = () => {
    if (!showGrid || !snapEnabled || !isDesigner) return;
    setGridPulse(true);
    if (gridPulseTimerRef.current) {
      window.clearTimeout(gridPulseTimerRef.current);
    }
    gridPulseTimerRef.current = window.setTimeout(() => {
      setGridPulse(false);
    }, 240);
  };

  const activePlacementTargetValid = pendingCatalogPlacement
    ? !pendingCatalogPlacementHardInvalid
    : crossRoomDragTarget?.valid ?? true;
  const activePlacementTargetLabel =
    pendingCatalogPlacementRoom?.name ??
    crossRoomDragTarget?.label ??
    placementTargetRoom?.name ??
    null;
  const {
    derived: {
      qaSnapshotFingerprint,
      qaScenePerformanceSnapshot,
      qaDesignLayoutSnapshot,
    },
  } = useDesignPageQaReadModel({
    state: {
      persistence: {
        designId,
        lastPersistedSnapshotFingerprint,
      },
      scene: {
        mode: scenePerformanceMode,
        liteEnabled: liteSceneEnabled,
        renderQuality: sceneRenderQuality,
        autoLite: autoLiteScene,
        sceneReady,
        roomCount: designSnapshot.rooms.length,
        activeRoomItemCount: items.length,
        sceneItemCount: sceneRoomItems.length,
        lastFps: scenePerformanceSample.lastFps,
        fpsSamples: scenePerformanceSample.samples,
      },
      layout: {
        viewMode,
        editorMode,
        designSnapshot,
        activeRoom,
        planDebugMetrics,
        selectedPlanRoomId,
      },
    },
    actions: { getStoredDesignForPersistence },
  });
  const {
    state: {
      open: commandPaletteOpen,
      query: commandPaletteQuery,
      actions: commandPaletteActions,
    },
    actions: {
      close: closeCommandPalette,
      setQuery: setCommandPaletteQuery,
    },
  } = useDesignPageCommandPalette({
    state: {
      isClientPreview,
      canUndo,
      canRedo,
      undoName,
      redoName,
      viewMode,
      planRoomCount: housePlan2D.rooms.length,
      designRoomCount: designSnapshot.rooms.length,
      selectedPlanOverlayId,
      selectedPlanRoomId: selectedPlanRoomContext?.id ?? null,
      hasSelectedItem: Boolean(selectedItem),
      planLayerPreset,
    },
    actions: {
      undo: undoSafe,
      redo: redoSafe,
      fitPlanView: handleFitPlanView,
      changeViewMode: handleEditorViewModeChange,
      addFloorPlanOpening: handleAddFloorPlanOpeningFromTool,
      runHistoryTransaction,
      setPlanOpenings,
      selectPlanOverlay: handleSelectPlanOverlay,
      deletePlanOverlay: deletePlanOverlayById,
      duplicateRoom: handleDuplicateSelectedPlanRoom,
      deleteRoom: handleDeleteSelectedPlanRoom,
      duplicateItem: duplicateSelectedItem,
      deleteItem: deleteSelectedItem,
      runPlanPreset: (preset) => runPlanOverlayCommand(`preset:${preset}`),
    },
  });

  const {
    actions: {
      handleMove: handleSceneItemMove,
      handleDragEnd: handleSceneItemDragEnd,
    },
  } = useDesignPageSceneItemDrag({
    state: {
      hasWholeHousePlan,
      designerMode: isDesigner,
      activeRoom,
      roomWidth,
      roomDepth,
      wallThickness,
      roomSnapshotById,
    },
    refs: {
      items: itemsRef,
      selectedIds: selectedIdsRef,
      dragCommit: dragCommitRef,
    },
    actions: {
      findPlanRoomAtWorldPoint,
      setCrossRoomDragTarget: (target) => setCrossRoomDragTarget(target),
      findPlacementBlocker: findCatalogPlacementBlockerInRoom,
      isPlacementContained: isCatalogPlacementContainedInRoom,
      clampToRoom: clampToActiveRoom,
      getItemBounds: getItemAABB,
      getItemDisplayName,
      setItems: setItemsPresent,
      history,
      trackFirstInteraction,
      showToast: showRuleToast,
      moveSelectionToRoom: moveSelectedItemToRoom,
      transferItemToRoom,
      showConstraints: showConstraintsForMoment,
      showConfidence: showConfidenceSummary,
    },
  });
  const handleOrbitControlsChange = () => {
    if (!isCameraAnimatingRef.current) {
      updateCameraViewFromScene();
    }
  };

  return (
    <DesignPageComposition
      configuration={{ designerTheme: showDesignerTheme }}
    >
      <DesignPageProjectQaMarkers
        snapshotFingerprint={qaSnapshotFingerprint}
        activeRoomId={designSnapshot.activeRoomId}
        activeRoomZones={zones}
        cabinetSchedule={projectCabinetSchedulePackage}
        cabinetHandoff={projectCabinetHandoffPackage}
      />
      <PlacedCabinetAssetMarkers rooms={designSnapshot.rooms} />
      <DesignPageRuntimeQaMarkers
        qaHooksEnabled={process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS === "1"}
        firstRunActivation={firstRunActivationState}
        scenePerformance={qaScenePerformanceSnapshot}
        layout={qaDesignLayoutSnapshot}
        showLayoutDebugOverlay={showLayoutDebugOverlay}
        history={{
          pastCount: historyDebugSnapshot.past.length,
          futureCount: historyDebugSnapshot.future.length,
          transactionName: historyDebugSnapshot.txn?.name ?? null,
        }}
      />
      <EditorCommandPalette
        open={!isClientPreview && commandPaletteOpen}
        query={commandPaletteQuery}
        actions={commandPaletteActions}
        designerTheme={showDesignerTheme}
        onClose={closeCommandPalette}
        onQueryChange={setCommandPaletteQuery}
      />
      <div className="absolute inset-0">
        <div
          className="relative h-full w-full"
          onDragOver={handleCatalogCanvasDragOver}
          onDrop={handleCatalogCanvasDrop}
          onDragLeave={handleCatalogCanvasDragLeave}
        >
          <DesignSceneCanvas
            state={{
              viewMode,
              isClientPreview,
              liteSceneEnabled,
              showSceneLoadingVeil,
              scenePerformanceMode,
              controlsEnabled:
                !sofaDragging &&
                !planRoomDragging &&
                !planRoomResizing &&
                !planOverlayDragging,
              cameraY: cameraView.pos[1],
              planDiagnostics: {
                valid: planDebugMetrics.cameraValid,
                recoveries: planDebugMetrics.cameraRecoveries,
                targetX: planDebugMetrics.cameraTargetX,
                targetZ: planDebugMetrics.cameraTargetZ,
                projectedRoomMinWidthPx: planDebugMetrics.projectedRoomMinWidthPx,
                projectedRoomMinHeightPx: planDebugMetrics.projectedRoomMinHeightPx,
                projectedRoomMinAreaPx: planDebugMetrics.projectedRoomMinAreaPx,
              },
            }}
            configuration={{
              cursor: planCanvasCursor,
              backgroundColor: sceneBackgroundColor,
              lightConfig,
              initialCameraView: DEFAULT_EDITOR_CAMERA_VIEW,
              planFit: plan2DWholeHomeViewFit,
              planBounds: {
                widthMeters: plan2DFitBounds.widthMeters,
                depthMeters: plan2DFitBounds.depthMeters,
                centerX: plan2DFitBounds.centerX,
                centerZ: plan2DFitBounds.centerZ,
                roomHeight,
              },
              planSafeArea: {
                leftPx: plan2DSafeAreaLeftPx,
                rightPx: plan2DSafeAreaRightPx,
                bottomPx: plan2DSafeAreaBottomPx,
              },
              planRooms: housePlan2D.rooms,
              orbit: {
                minDistance: EDITOR_3D_MIN_CAMERA_DISTANCE,
                maxDistance: Math.max(24, Math.max(planViewWidth, planViewDepth) * 6),
                minPolarAngle: EDITOR_3D_MIN_POLAR_ANGLE,
                maxPolarAngle: EDITOR_3D_MAX_POLAR_ANGLE,
              },
            }}
            sceneRefs={{
              canvas: canvasRef,
              camera: cameraRef,
              controls: orbitControlsRef,
              renderer: rendererRef,
              scene: sceneRef,
            }}
            actions={{
              onClearSelection: clearAllSelection,
              onPlanDiagnosticsChange: handlePlan2DCameraDiagnosticsChange,
              updateProjection,
              onSceneProgressReadyChange: setSceneProgressReady,
              onFpsSample: handleScenePerformanceSample,
              onSustainedLowFps: handleSustainedLowFps,
              onOrbitChange: handleOrbitControlsChange,
            }}
          >
              <DesignSceneStructureLayer
                state={{
                  viewMode,
                  plan: {
                    underlay: floorPlanUnderlay,
                    calibration: {
                      enabled: floorPlanCalibrationMode,
                      points: floorPlanCalibrationPoints,
                    },
                    roomTrace: {
                      enabled: floorPlanTraceRoomMode,
                      interactionMode: floorPlanDrawRoomMode,
                      points: floorPlanTraceRoomPoints,
                      previewPoint: blankGridRoomPreviewPoint,
                      drawOnBlankGrid: blankGridRoomDrawActive,
                    },
                    openingTrace: {
                      enabled: floorPlanTraceOpeningMode,
                      points: floorPlanTraceOpeningPoints,
                      kind: floorPlanTraceOpeningKind,
                    },
                    width: planViewWidth,
                    depth: planViewDepth,
                    rooms: housePlan2D.rooms,
                    activeRoomId: selectedPlanRoomId,
                    selectedOverlayId: selectedPlanOverlayId,
                    suppressedDoorwaySuggestionKeys,
                    scene: editorScene2D,
                    zones: planZones2D,
                    qualityIssues: floorPlanQualityReport.issues,
                  },
                  wholeHome: {
                    enabled: usesHousePlanScene,
                    rooms: sceneHousePlanRooms3D,
                    activeRoomId: designSnapshot.activeRoomId,
                    activeFloorLevel,
                    wallHeight: roomHeight,
                    stackedFloors: stackedFloorView,
                    selectedOpeningId: selectedPlanOverlayId,
                    selectedSurfaceTarget: selectedRendererSurfaceTarget,
                  },
                  singleRoom: {
                    width: roomWidth,
                    depth: roomDepth,
                    height: roomHeight,
                    wallThickness,
                    slabThickness: activeRoom?.geometry.slabThickness,
                    wallOpacity: activeRoomWallOpacity,
                    floorOpacity: activeRoomFloorOpacity,
                    ceilingOpacity: activeRoomCeilingOpacity,
                    ceilingVisible: activeRoomCeilingVisible,
                    ceilingColor: activeRoomCeilingColor,
                  },
                }}
                configuration={{
                  editorMode,
                  isClientPreview,
                  plan: {
                    measurementUnit: planMeasurementUnit,
                    theme: effectivePlanTheme,
                    layers: effectivePlanLayers,
                    orientation: plan2DWholeHomeViewFit.orientation,
                  },
                  renderQuality: sceneRenderQuality,
                }}
                actions={{
                  underlay: {
                    addCalibrationPoint: handleFloorPlanCalibrationPoint,
                    addRoomTracePoint: handleFloorPlanTraceRoomPoint,
                    addOpeningTracePoint: handleFloorPlanTraceOpeningPoint,
                  },
                  rooms: {
                    select: handlePlacementAwareRoomSelect,
                    selectSurfaceTarget: handleRendererSurfaceTargetSelect,
                    clearSelection: clearAllSelection,
                    rename: handleRenameSelectedPlanRoom,
                    duplicate: handleDuplicateSelectedPlanRoom,
                    delete: handleDeleteSelectedPlanRoom,
                    editFloor: handleOpenFloorEditorForRoom,
                    fit: handleFitSelectedPlanRoom,
                    move: handleMoveRoom2D,
                    resize: handleResizeRoom2D,
                    setDragging: handlePlanRoomDragStateChange,
                    setResizing: handlePlanRoomResizeStateChange,
                  },
                  overlays: {
                    select: handleSelectPlanOverlay,
                    delete: deletePlanOverlayById,
                    moveOpening: handleMoveOpening2D,
                    resizeOpening: handleResizeOpening2D,
                    addDoorwaySuggestion: handleAddSuggestedDoorway,
                    moveFixedElement: handleMoveFixedElement2D,
                    moveAnnotation: handleMoveAnnotation2D,
                    setDragging: handlePlanOverlayDragStateChange,
                  },
                  drawing: {
                    addRoomPoint: handleBlankGridRoomDrawPoint,
                    previewRoomPoint: handleBlankGridRoomDrawPreviewPoint,
                    commitRoomDimension: handleCommitRoomDimensionEdit2D,
                    commitWallSegmentLength:
                      handleCommitWallDrawSegmentLength2D,
                    drawRoom: handleBlankGridRoomDrawDrag,
                    addOpeningPoint: handleBlankGridTraceOpeningPoint,
                  },
                  wholeHome: {
                    setOpeningDragging:
                      handlePlanOpeningDragStateChange3D,
                  },
                  reportPlanMetrics: handlePlanDebugMetricsChange,
                }}
              />

              <DesignSceneGuidanceLayer
                state={{
                  placement: {
                    targetRoom: placementTargetPlanRoom,
                    showTargetRoom: Boolean(
                      pendingCatalogPlacement || crossRoomDragTarget
                    ),
                    targetValid: activePlacementTargetValid,
                    supportSurface: activeCatalogPlacementSurfaceHighlight,
                  },
                  circulationHeatmap: circulationHeatmap
                    ? {
                        cells: circulationHeatmap.analysis.heatmap,
                        roomOffset: circulationHeatmap.roomOffset,
                      }
                    : null,
                  zones: {
                    entries: zones,
                    selectedId: selectedZoneId,
                    compatibleIds: activePlacementCompatibleZoneIds,
                    pendingPlacement: pendingCatalogPlacement !== null,
                    hoverPlacement: hoverCatalogPlacement !== null,
                  },
                }}
                configuration={{
                  grid: {
                    visible:
                      isDesigner &&
                      showGrid &&
                      !isClientPreview &&
                      (editorMode === "design" || editorMode === "adjust"),
                    pulse: gridPulse,
                  },
                  zonesVisible:
                    !isClientPreview && editorMode !== "present",
                  activeRoomOffset: activeRoomPlanOffset,
                  activeRoomId: activeRoom?.id ?? null,
                }}
                resolvers={{ getZoneBounds }}
                actions={{
                  showToast: showRuleToast,
                  targetPendingPlacementToRoom:
                    targetPendingCatalogPlacementToRoom,
                  selectZone: setSelectedZoneId,
                  clearSelection,
                }}
              />

              <SceneItemsLayer
                state={{
                  entries: sceneRoomItems,
                  selectedIds,
                  selectedInstanceId,
                  previewVariantId,
                  previewMaterialPresetId,
                  hoveredCartInstanceId,
                  activeSceneItemsForGuides,
                  itemPlanningBoundsByInstanceId,
                }}
                configuration={{
                  editorMode,
                  viewMode,
                  isClientPreview,
                  canEdit,
                  isDesigner,
                  hasWholeHousePlan,
                  renderQuality: sceneRenderQuality,
                  walls,
                  snapEnabled,
                  rotationSnapStepRadians,
                  rotationSnapStepDegrees,
                  rotationSnapEnabled,
                  planShowLabels: effectivePlanLayers.labels,
                  planShowDimensions: effectivePlanLayers.dimensions,
                  planMeasurementUnit,
                }}
                resolvers={{
                  resolveItemConfigurationEntry,
                  resolveConfiguredVisualDimsMm,
                  resolveConfiguredPlanningDimsMm,
                  resolveConfiguredModelUrl,
                  resolveConfiguredNodeTransforms,
                  getRoomItems: (roomId) => roomSnapshotById.get(roomId)?.items ?? [],
                }}
                actions={{
                  onDraggingChange: handleDraggingChange,
                  onRenderReadyChange: handleSceneRenderItemReadyChange,
                  onSelect: (id, additive) => {
                    trackFirstInteraction();
                    handleSelect(id, additive);
                  },
                  onDuplicateSelectedItem: duplicateSelectedItem,
                  onDeleteSelectedItem: deleteSelectedItem,
                  onMove: handleSceneItemMove,
                  onDragPointerMove: hasWholeHousePlan
                    ? nudgeWholeHomeCameraForDrag
                    : undefined,
                  onRotate: (id, rotationY, meta) =>
                    applyItemRotation(id, rotationY, {
                      source: meta?.source ?? "canvas",
                      snap: meta?.snap,
                    }),
                  onSnapPulse: triggerGridPulse,
                  onDragEnd: handleSceneItemDragEnd,
                }}
              />
              <DesignScenePreviewLayer
                state={{
                  aiLayout: {
                    footprints: aiLayoutPreviewFootprints,
                    tone: aiLayoutPreviewTone,
                  },
                  placement: {
                    pending: pendingCatalogPlacementScene,
                    hover: hoverCatalogPlacementScene,
                    hardInvalid: pendingCatalogPlacementHardInvalid,
                  },
                }}
                configuration={{
                  hasWholeHousePlan,
                  planWidth: planViewWidth,
                  planDepth: planViewDepth,
                  activeRoomWidth: roomWidth,
                  activeRoomDepth: roomDepth,
                  pendingRoomSize: pendingCatalogPlacementRoom
                    ? {
                        width: pendingCatalogPlacementRoom.geometry.width,
                        depth: pendingCatalogPlacementRoom.geometry.depth,
                      }
                    : null,
                }}
                actions={{
                  onPlacementPointerDown: handleCatalogPlacementPointerDown,
                  onPlacementPointerMove: handleCatalogPlacementPointerMove,
                  onPlacementPointerUp: handleCatalogPlacementPointerUp,
                }}
              />
          </DesignSceneCanvas>

          <DesignPageViewportOverlayLayer
            state={{
              railVisible: floatingPlanOverlayStackVisible,
              sceneLoadingVisible: showSceneLoadingVeil,
              selectedOpening:
                !isClientPreview && visiblePlanOpening && selectedPlanOverlayId
                  ? {
                      kind: visiblePlanOpening.kind,
                      wall: visiblePlanOpening.wall,
                      widthLabel: formatCabinetMeasurement(
                        visiblePlanOpening.widthMm,
                        planMeasurementUnit
                      ),
                    }
                  : null,
              selectionInspector:
                floatingSelectionInspectorVisible && selectedObjectInspector
                  ? {
                      summary: selectedObjectInspector,
                      selectedRoom: selectedPlanRoomContext,
                      hasSelectedItem: Boolean(selectedItem),
                      hasVisiblePlanOpening: Boolean(visiblePlanOpening),
                      hasSelectedPlanFixedElement: Boolean(
                        selectedPlanFixedElement
                      ),
                      hasSelectedPlanAnnotation: Boolean(selectedPlanAnnotation),
                      hasSelectedPlanOverlay: Boolean(selectedPlanOverlayId),
                      surfaceInspectorIsWall,
                      surfaceInspectorIsCeiling,
                      surfaceInspector: selectedSurfaceInspectorState,
                      measurementUnit: planMeasurementUnit,
                      activeRoomHeightMm,
                      activeFloorRoomCount,
                      canDeleteSelectedRoom: designSnapshot.rooms.length > 1,
                    }
                  : null,
              planQuality: plan2DQualityReviewPanelVisible
                ? {
                    report: floorPlanQualityReport,
                    collapsed: planQualityReviewCollapsed,
                  }
                : null,
              planCanvas: planCanvasOverlaysState,
              aiLayoutPreview:
                pendingAiLayoutProposal && !isClientPreview
                  ? {
                      itemCount: pendingAiLayoutProposal.items.length,
                      itemNames: pendingAiLayoutProposal.itemNames,
                      toneText: aiLayoutPreviewTone.text,
                    }
                  : null,
              crossRoomDragTarget:
                crossRoomDragTarget?.kind === "item"
                  ? {
                      valid: crossRoomDragTarget.valid,
                      label: crossRoomDragTarget.label,
                    }
                  : null,
              navigator:
                viewMode === "3d" && hasWholeHousePlan
                  ? {
                      rooms: housePlan2D.rooms,
                      activeRoomId: designSnapshot.activeRoomId,
                      cameraPosition: cameraView.pos,
                      cameraTarget: cameraView.target,
                      itemCountsByRoomId: roomItemCountsById,
                      targetRoomId: placementTargetRoomId,
                      targetRoomValid: activePlacementTargetValid,
                    }
                  : null,
              floorProperties: floatingFloorPropertiesPanelVisible
                ? {
                    roomWidth,
                    roomDepth,
                    floorOptions,
                    hiddenFloorLevels,
                    activeFloorLevel,
                    activeFloorRoomCount,
                    measurementUnit: planMeasurementUnit,
                    activeRoomHeightMm,
                    activeRoomWallThicknessMm,
                    activeRoomSlabThicknessMm,
                    activeRoomBaseboardDepthMm,
                    activeRoomWallOpacity,
                    activeRoomFloorOpacity,
                    activeRoomCeilingOpacity,
                    activeRoomCeilingVisible,
                    activeRoomCeilingColor,
                    stackedFloorView,
                    canRedo,
                  }
                : null,
              selectionControls:
                resolveDesignPageViewportSelectionControlsState({
                  viewMode,
                  stackedFloorView,
                  floorOptions,
                  activeFloorLevel,
                  hiddenFloorLevels,
                  selectedCount: selectedIds.size,
                  pendingZoneType,
                  selectedZone,
                  isClientPreview,
                }),
            }}
            configuration={{
              sceneLoading: {
                dark: showDesignerTheme,
                backgroundColor: sceneBackgroundColor,
              },
              selectedOpening: { dark: showDesignerTheme },
              selectionInspector: {
                dark: showDesignerTheme,
                canEditPlanGeometry,
                dockWhenPortalAvailable:
                  selectionInspectorDockedWithRightRail,
                dockedWidthPx: PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX,
                floatingRightPx: selectionInspectorRightPx,
                floatingTopPx: selectionInspectorTopPx,
                floatingWidthPx: selectionInspectorWidthPx,
              },
              planQuality: {
                dark: showDesignerTheme,
                dockedWidthPx: PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX,
                floatingRightPx: selectionInspectorRightPx,
                floatingTopPx: plan2DQualityReviewPanelTopPx,
                floatingWidthPx: selectionInspectorWidthPx,
              },
              aiLayoutPreview: { dark: showDesignerTheme },
              navigator: {
                disabled: editorMode === "present",
                dark: showDesignerTheme,
              },
              floorProperties: {
                dark: showDesignerTheme,
                canEdit: canEditPlanGeometry,
              },
              selectionControls: { dark: showDesignerTheme },
            }}
            references={{
              planQuality: { setPanel: setPlanQualityReviewPanelNode },
            }}
            actions={{
              selectedOpening: {
                deleteOpening: () => {
                  deletePlanOverlayById(selectedPlanOverlayId);
                  showRuleToast("Opening deleted");
                },
              },
              selectionInspector: {
                clearSelection: clearAllSelection,
                setMeasurementUnit: setPlanMeasurementUnit,
                commitRoomDimensionMm: (roomId, dimension, valueMm) =>
                  handleCommitRoomDimensionEdit2D(
                    roomId,
                    dimension,
                    valueMm / 1000
                  ),
                commitActiveFloorWallHeightMm:
                  handleActiveRoomHeightMmChange,
                item: {
                  center: centerSelectedItemInRoom,
                  snapToWall: snapSelectedItemToNearestWall,
                  duplicate: duplicateSelectedItem,
                  delete: deleteSelectedItem,
                },
                room: {
                  editFloor: handleOpenFloorEditorForRoom,
                  fit: handleFitSelectedPlanRoom,
                  duplicate: handleDuplicateSelectedPlanRoom,
                  delete: handleDeleteSelectedPlanRoom,
                },
                deleteSelectedPlanOverlay: () =>
                  deletePlanOverlayById(selectedPlanOverlayId),
                surfaceInspector: selectedSurfaceInspectorActions,
              },
              planQuality: {
                toggleCollapsed: togglePlanQualityReviewPanel,
                activateIssue: handlePlanQualityAction,
              },
              planCanvas: {
                guidedActionsChoice: {
                  close: () => setPlanGuidedActionsChoiceSeen(true),
                  choose: choosePlanGuidedActionsMode,
                },
                manualQuickActions: {
                  select: handleSelectFloorPlanTool,
                  startScale: () => {
                    setGuidedPlanStartMode("upload");
                    handleFloorPlanCalibrationModeChange(true);
                  },
                  startRoomDraw: () => {
                    setGuidedPlanStartMode("draw");
                    handleFloorPlanDrawRoomModeChange("rectangle_wall");
                  },
                  addOpening: handleAddFloorPlanOpeningFromTool,
                  fit: handleFitPlanView,
                },
                guidedActionsToggle: {
                  toggle: () =>
                    setPlanGuidedActionsEnabled((enabled) => !enabled),
                },
                focusControl: {
                  undo: handleUndoFloorPlanTraceRoomPoint,
                  clear: clearPlanFocusPoints,
                  togglePanel: () => {
                    setDesignPanelOpen(true);
                    setPlanFocusPanelRevealed((value) => !value);
                  },
                  finish: () => {
                    handleSelectFloorPlanTool();
                    setPlanFocusPanelRevealed(false);
                  },
                },
                guidance: {
                  startScale: () =>
                    handleFloorPlanCalibrationModeChange(true),
                  addOpening: handleAddFloorPlanOpeningFromTool,
                  furnish: goFurnish,
                  dismiss: setDismissedPlanCanvasGuidanceKey,
                },
                emptyPrompt: {
                  startRoom: () => {
                    setDesignPanelOpen(true);
                    goPlan();
                    setGuidedPlanStartMode("start");
                  },
                },
                restoreTools: {
                  restore: () => {
                    setDesignPanelOpen(true);
                    setPlanFocusPanelRevealed(false);
                  },
                },
              },
              aiLayoutPreview: {
                apply: applyPendingAiLayoutProposal,
                dismiss: dismissPendingAiLayoutProposal,
              },
              navigator: {
                onMoveCamera: handleWholeHomeMoveCamera,
                onMoveTarget: handleWholeHomeMoveTarget,
                onFocusRoom: handleWholeHomeFocusRoom,
                onZoom: handleWholeHomeNavigatorZoom,
                onResetView: handleFitPlanView,
              },
              floorProperties: {
                onAddUpperFloor: (mode) => handleAddFloor("upper", mode),
                onAddLowerFloor: (mode) => handleAddFloor("lower", mode),
                onToggleFloorVisibility: handleToggleFloorVisibility,
                onRenameFloor: handleRenameFloor,
                onDuplicateFloor: handleDuplicateFloor,
                onDeleteFloor: handleDeleteFloor,
                onSwitchFloor: handleSwitchFloor,
                onStackedFloorViewChange: setStackedFloorView,
                onRedo: redoSafe,
                onActiveRoomHeightMmChange:
                  handleActiveRoomHeightMmChange,
                onActiveRoomWallThicknessMmChange:
                  handleActiveRoomWallThicknessMmChange,
                onActiveRoomSlabThicknessMmChange:
                  handleActiveRoomSlabThicknessMmChange,
                onActiveRoomBaseboardDepthMmChange:
                  handleActiveRoomBaseboardDepthMmChange,
                onActiveRoomSurfaceOpacityChange:
                  handleActiveRoomSurfaceOpacityChange,
                onActiveRoomCeilingVisibleChange:
                  handleActiveRoomCeilingVisibleChange,
                onActiveRoomCeilingColorChange:
                  handleActiveRoomCeilingColorChange,
              },
              selectionControls: {
                floorStack: { switchFloor: handleSwitchFloor },
                multiSelection: {
                  alignX: alignSelectionX,
                  alignZ: alignSelectionZ,
                  changeZoneType: setPendingZoneType,
                  createZone: createZoneFromSelection,
                  clear: clearAllSelection,
                },
                selectedZone: {
                  autoLayout: autoLayoutZone,
                  rotateQuarterTurn: (zoneId) =>
                    rotateZone(zoneId, Math.PI / 2),
                  ungroup: ungroupZone,
                },
              },
            }}
          />
        </div>

        <DesignPageEditorCommandBar
          state={{
            commandBar: {
              isClientPreview,
              editorMode,
              viewMode,
              isDesigner,
              isAuthed: Boolean(session?.user),
              isPro: plan === "pro",
              isOpeningBillingPortal: openingBillingPortal,
              aiDesignEnabled,
              canUndo,
              canRedo,
              undoName,
              redoName,
              millworkActive: cabinetryStudioState !== null,
              showLoadDesign: Boolean(session?.user),
              isSaving,
              saveStatus,
            },
            room: activeRoom
              ? {
                  id: activeRoom.id,
                  roomName: activeRoom.name,
                  roomTypeLabel: getRoomTypeLabel(activeRoom.roomType),
                  roomCount: designSnapshot.rooms.length,
                  widthMeters: roomWidth,
                  depthMeters: roomDepth,
                  viewMode,
                  health: activeRoomHealthSummary
                    ? {
                        level: activeRoomHealthSummary.level,
                        score: activeRoomHealthSummary.placementScore,
                        nextAction: activeRoomHealthSummary.nextAction,
                      }
                    : null,
                }
              : null,
            scenePerformance: {
              mode: scenePerformanceMode,
              liteEnabled: liteSceneEnabled,
            },
          }}
          configuration={{
            dark: showDesignerTheme,
            compactRoomStatus: compactRoomPlanStatusBar,
            showRoomHealth: showRoomPlanStatusHealth,
          }}
          actions={{
            commandBar: {
              onPlan: goPlan,
              onMillwork: canUseCabinetryStudio
                ? openCabinetryStudio
                : undefined,
              onFurnish: goFurnish,
              onAiDesign: () => {
                if (aiDesignEnabled) {
                  goAiDesign();
                }
              },
              onShop: goShop,
              onExport: () => {
                if (editorMode === "present") {
                  setShowPresentModal(false);
                  setEditorMode("design");
                } else {
                  setEditorMode("present");
                }
              },
              onUndo: undoSafe,
              onRedo: redoSafe,
              onViewModeChange: handleEditorViewModeChange,
              onToggleDesignerMode: () => {
                if (!canUseDesigner && !isDesigner) {
                  setUpgradeReason("designer");
                  setShowUpgrade(true);
                  return;
                }
                setUrlMode(isDesigner ? "homeowner" : "designer");
              },
              onToggleClientPreview: () =>
                setClientPreview((value) => !value),
              onViewPlans: () => setShowPlans(true),
              onNewPlan: openNewPlanPicker,
              onManageBilling: () => {
                void openBillingPortal();
              },
              onFeedback: () => setFeedbackOpen(true),
              onToggleLoadDesign: toggleMyDesigns,
              onSave: async () => {
                if (!session?.user) {
                  openGuestPrompt("save", () => {});
                  return;
                }
                const savedId = await saveDesignToCloud();
                if (savedId) {
                  showRuleToast("Saved to cloud");
                }
              },
              onRetrySaveStatus: retrySaveStatus,
              onOpenPresentExport: () => setShowPresentModal(true),
            },
            room: {
              onViewModeChange: handleEditorViewModeChange,
              onReviewHealth: reviewActiveRoomHealth,
              onFitPlan: handleFitPlanView,
              rename: handleRenameSelectedPlanRoom,
            },
            scenePerformance: {
              changeMode: handleScenePerformanceModeChange,
            },
          }}
        />
        {!isClientPreview && showBetaStart && !designPanelOpen && (
          <BetaStartPanel
            state={{
              nextStepLabel: firstRunActivationState.nextStep?.label ?? null,
              progressPercent: firstRunActivationState.progressPercent,
            }}
            actions={{
              dismiss: dismissBetaStart,
              chooseTemplate: () => {
                setGuidedPlanStartMode("template");
                goPlan();
                setViewMode("2d");
                setDesignPanelOpen(true);
                showRuleToast("Choose a room template in the Plan panel");
                dismissBetaStart();
              },
              drawRoom: () => {
                setGuidedPlanStartMode("draw");
                goPlan();
                setViewMode("2d");
                activateFloorPlanRoomTrace(true);
                setDesignPanelOpen(true);
                showRuleToast("Draw room walls in 2D plan mode");
                dismissBetaStart();
              },
              uploadPlan: () => {
                setGuidedPlanStartMode("upload");
                goPlan();
                setViewMode("2d");
                setDesignPanelOpen(true);
                showRuleToast("Upload a plan from the Plan panel, then calibrate and trace");
                dismissBetaStart();
              },
              generateAiLayout: () => {
                goAiDesign();
                setDesignPanelOpen(true);
                showRuleToast("Complete the AI brief, then generate a layout");
                dismissBetaStart();
              },
            }}
          />
        )}

        {!isClientPreview && isDesigner && (
          <EditorToolRail
            mode={editorMode}
            dark={showDesignerTheme}
            aiDesignEnabled={aiDesignEnabled}
            onDesign={() => {
              setEditorMode("design");
              setDesignPanelOpen(true);
            }}
            onAdjust={() => {
              setEditorMode("adjust");
              setDesignPanelOpen(true);
            }}
            onAi={() => {
              setEditorMode("ai");
              setDesignPanelOpen(true);
            }}
            onCart={() => {
              setEditorMode("buy");
              setItemCartOpen(false);
            }}
            onPresent={() => {
              if (editorMode === "present") {
                setShowPresentModal(false);
                setEditorMode("design");
              } else {
                setEditorMode("present");
              }
            }}
            onFitPlan={handleFitPlanView}
          />
        )}
      </div>

      {/* Exit Client Preview Button - Always Visible */}
      {isClientPreview && (
        <div className="fixed left-1/2 top-4 z-60 -translate-x-1/2 transform">
          <button
            className="rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-red-700"
            onClick={() => setClientPreview(false)}
            title="Exit Presentation Mode (P)"
          >
            ✕ Exit Presentation
          </button>
        </div>
      )}

      {/* Layer 2C: Shopping Panel (visible in BUY mode) */}
      {shoppingPanelVisibleForLayout && (
        <div
          data-testid="shopping-dock"
          className={`absolute bottom-3 left-3 right-3 top-auto z-20 w-auto max-h-[64vh] space-y-3 overflow-y-auto pb-[calc(0.75rem+env(safe-area-inset-bottom))] pr-1 transition-opacity duration-300 md:bottom-auto md:right-auto md:top-20 md:w-[18.15rem] md:max-h-[calc(100vh-6rem)] md:pb-4 ${
            isDesigner ? "md:left-20" : "md:left-4"
          } ${
            isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          aria-hidden={isClientPreview}
        >
          <div
            className={
              showDesignerTheme
                ? "designer-dock rounded-xl p-3 text-neutral-100"
                : "rounded-xl border border-neutral-200 bg-white/95 p-3 text-neutral-900 shadow-lg backdrop-blur"
            }
          >
            <div className={showDesignerTheme ? "text-lg font-semibold text-white" : "text-lg font-semibold text-neutral-950"}>
              Shop
            </div>
            <div className={showDesignerTheme ? "mt-1 text-xs text-neutral-400" : "mt-1 text-xs text-neutral-500"}>
              Review shopping list and checkout readiness.
            </div>
          </div>
          <ShoppingOverviewPanel
            dark={showDesignerTheme}
            activeRoom={activeRoomShoppingSummary}
            activeRoomItems={activeRoomShoppingItems}
            catalogItems={catalogItems}
            rooms={roomShoppingSummaries}
            wholeHome={wholeHomeShoppingSummary}
            activeFilter={shoppingReadinessFilter}
            onSelectRoom={handleSwitchRoom}
            onGoFurnish={goFurnish}
            onAddActiveRoomCartReadyItems={addActiveRoomCartReadyItems}
            onSetItemInclude={setShoppingItemInclude}
            onSwapShoppingItem={swapShoppingItemReplacement}
            onPreviewReplacement={previewShoppingReplacement}
            onFilterChange={setShoppingReadinessFilter}
          />
          <CartSidebar
            items={items}
            designId={designId ?? null}
            plan={plan}
            isGuest={!session?.user}
            onGuestCapture={(reason, onContinue) => openGuestPrompt(reason, onContinue)}
            onRemove={(instanceId) => {
              const removedItem = items.find(x => x.instanceId === instanceId);
              const productName = removedItem ? CATALOG_ITEMS[removedItem.productId]?.title || "Item" : "Item";
              commitItems((prev) => prev.filter((x) => x.instanceId !== instanceId), `Delete ${productName}`);
              if (selectedIdsRef.current.has(instanceId)) {
                const next = new Set(selectedIdsRef.current);
                next.delete(instanceId);
                const nextPrimary =
                  primaryIdRef.current === instanceId
                    ? next.size
                      ? Array.from(next)[next.size - 1]
                      : null
                    : primaryIdRef.current;
                updateSelection(next, nextPrimary);
              }
            }}
            onSetQty={setSelectedItemQuantity}
            onSetInclude={setShoppingItemInclude}
            onBulkSwap={onBulkSwap}
            onShowUpgrade={() => setShowUpgrade(true)}
            theme={showDesignerTheme ? "designer" : "default"}
          />
        </div>
      )}

      {editorMode === "adjust" && selectedCabinet && (
        <SelectedCabinetPanel
          cabinet={selectedCabinet}
          project={{
            handoffPackage: projectCabinetHandoffPackage,
            hasAssets: projectCabinetAssets.length > 0,
          }}
          access={{
            canEdit,
            canUseStudio: canUseCabinetryStudio,
            isDesigner,
            isClientPreview,
            designerTheme: showDesignerTheme,
          }}
          actions={{
            center: centerSelectedCabinetInRoom,
            snapToWall: snapSelectedCabinetToNearestWall,
            nudge: nudgeSelectedCabinet,
            rotateByDegrees: rotateSelectedCabinetByDegrees,
            resetRotation: resetSelectedCabinetRotation,
            export: handleSelectedCabinetExport,
            edit: handleEditSelectedCabinet,
            delete: deleteSelectedItem,
          }}
        />
      )}

      {/* Layer 2B: Inspector Panel (visible in ADJUST mode when item selected) */}
      {editorMode === "adjust" && selectedProduct && (
        <SelectedItemPanel
          state={{
            details: {
              product: selectedProduct,
              item: selectedItem,
              rooms: designSnapshot.rooms.map((room) => ({
                id: room.id,
                name: room.name,
              })),
              activeRoomId: designSnapshot.activeRoomId,
              measurementUnit: planMeasurementUnit,
              planningDimensionsMm: selectedItemPlanningDimensionsMm,
              selectedBrand,
              selectedModelTitle,
              selectedCategoryDebugLabel,
              activeVariantLabel,
              productDetailSections: selectedProductDetailSections,
              fullDimensionsDetails,
              selectedDimensionImageUrl,
              showInspectorDetails:
                selectedItemPanelControllerState.showInspectorDetails,
              showFullDimensions:
                selectedItemPanelControllerState.showFullDimensions,
              showDeliveryWarranty:
                selectedItemPanelControllerState.showDeliveryWarranty,
              showRotationControls:
                selectedItemPanelControllerState.showRotationControls,
              styleConsistencyReport: selectedStyleConsistencyReport,
              adjustableHangingHeight: selectedAdjustablePendantHeight
                ? {
                    valueCm: selectedAdjustablePendantHeight.currentCm,
                    minCm: selectedAdjustablePendantHeight.minCm,
                    maxCm: selectedAdjustablePendantHeight.maxCm,
                    stepCm: 1,
                  }
                : null,
            },
            rotation: selectedItem
              ? {
                  expanded:
                    selectedItemPanelControllerState.showRotationControls,
                  selectedRotationDegrees,
                  rotationSnapEnabled,
                  rotationSnapStepDegrees,
                  rotationSnapPresetDegrees,
                  rotationInputValue,
                  disabled: rotateControlsDisabled,
                }
              : null,
            productModelVariants: productModelVariantControlsState,
            productFinishes: productFinishControlsState,
            commerceType:
              selectedItemPanelControllerState.selectedItemCommerceType,
            lockLabel: selectedItemPanelControllerState.selectedItemLockLabel,
          }}
          configuration={{
            dark: showDesignerTheme,
            isDesigner,
            isClientPreview,
            canEdit,
          }}
          actions={{
            details: {
              onToggleInspectorDetails:
                selectedItemPanelControllerActions.toggleSelectedItemDetails,
              onToggleFullDimensions:
                selectedItemPanelControllerActions.toggleSelectedItemDimensions,
              onToggleDeliveryWarranty:
                selectedItemPanelControllerActions.toggleSelectedItemDeliveryWarranty,
              onToggleRotationControls:
                selectedItemPanelControllerActions.toggleSelectedItemRotationControls,
              onMoveToRoom: moveSelectedItemToRoom,
              onDuplicate: duplicateSelectedItem,
              onDelete: deleteSelectedItem,
              onCenterInRoom: centerSelectedItemInRoom,
              onSnapToWall: snapSelectedItemToNearestWall,
              onNudge: nudgeSelectedItem,
              onSetPosition:
                selectedItemPanelControllerActions.setSelectedItemPosition,
              onAdjustHangingHeight: adjustSelectedPendantHeight,
              onApplyStyleAlternative:
                selectedItemPanelControllerActions.applySelectedItemStyleAlternative,
            },
            rotation: {
              onSnapPresetChange: setRotationSnapPresetDegrees,
              onRotateByDegrees: rotateSelectedByDegrees,
              onResetRotation: resetSelectedRotation,
              onRotationInputChange: setRotationInputValue,
              onApplyRotationInput: applyRotationInputValue,
            },
            productModelVariants: {
              onSelectOrientation: handleSelectProductOrientation,
              jaron: {
                onSelectGroup: handleSelectJaronConfigurationGroup,
                onSelectOption: handleSelectJaronConfigurationOption,
                onSelectArm: handleSelectJaronArm,
              },
              auburn: {
                onSelectGroup: handleSelectAuburnConfigurationGroup,
                onSelectOption: handleSelectAuburnConfigurationOption,
                onSelectOrientation: handleSelectAuburnOrientation,
              },
              onSelectArmStyle: handleSelectArmStyleVariant,
              onSelectModel: handleSelectProductModelVariant,
              onSelectShape: handleSelectProductShapeVariant,
              onSelectLengthVariant: handleSelectProductLengthVariant,
              onSelectSloaneBenchCushion: handleSelectSloaneBenchCushion,
              onSelectVariant: handleSelectProductVariant,
              onSelectLength: handleSelectProductLength,
              onSelectHuggModel: handleSelectHuggModel,
              onSelectSebModel: handleSelectSebModel,
              onSelectLayout: handleSelectProductConfiguration,
            },
            productFinishes: {
              onSelectFinishButton: handleSelectFinishButton,
              onSelectFinishSwatch: handleSelectFinishSwatch,
              onSelectLegFinish: handleSelectLegFinish,
              onSelectSloaneBenchCushion: handleSelectSloaneBenchCushion,
              onSelectSize: handleSelectProductSize,
              onSelectStructuredColour: handleSelectStructuredColour,
              onShowStructuredColourPreview: handleShowStructuredColourPreview,
              onHideStructuredColourPreview: handleHideStructuredColourPreview,
              onBlurStructuredColourPreview: handleBlurStructuredColourPreview,
            },
            onSwapToCheaper:
              selectedItemPanelControllerActions.swapSelectedItemToCheaper,
            onUpgradeItem:
              selectedItemPanelControllerActions.upgradeSelectedItem,
            onOpenCommerce:
              selectedItemPanelControllerActions.openSelectedItemCommerce,
            onToggleLock:
              selectedItemPanelControllerActions.toggleSelectedItemLock,
            onRemove:
              selectedItemPanelControllerActions.removeSelectedItemFromDesign,
          }}
        />
      )}
      {/* Layer 2A: Design Panel (visible in DESIGN mode) */}
      {designControlsPanelVisibleForLayout && (
        <DesignControlsPanel
          dark={showDesignerTheme}
          panelMode={designControlsPanelMode}
          selectionContext={selectedObjectContext}
          isClientPreview={isClientPreview}
          isAuthed={!!session?.user}
          isDesigner={isDesigner}
          canEdit={canEdit}
          canEditPlanGeometry={canEditPlanGeometry}
          collapsed={designPanelCollapsed}
          onCollapsedChange={(collapsed) => {
            setDesignPanelCollapsed(collapsed);
            if (!collapsed) {
              setDesignPanelOpen(true);
            }
          }}
          aiDesignEnabled={aiDesignEnabled}
          viewMode={viewMode}
          style={style}
          budget={budget}
          showGrid={showGrid}
          snapEnabled={snapEnabled}
          newRoomType={newRoomType}
          newRoomShape={newRoomShape}
          activeRoomPresetId={activeRoomPresetId}
          roomWidthInput={roomWidthInput}
          roomDepthInput={roomDepthInput}
          roomWidth={roomWidth}
          roomDepth={roomDepth}
          measurementUnit={planMeasurementUnit}
          catalogItems={catalogItems}
          selectedImportedFamilyKey={selectedImportedFamilyKey}
          selectedImportedProductId={selectedImportedProductId}
          importedFamilyOptions={importedFamilyOptions}
          importedModelOptions={importedModelOptions}
          visibleImportedModelOptions={visibleImportedModelOptions}
          floorPlanUnderlay={floorPlanUnderlay}
          floorPlanCalibrationMode={floorPlanCalibrationMode}
          floorPlanCalibrationPointCount={floorPlanCalibrationPoints.length}
          floorPlanCalibrationDistanceInput={floorPlanCalibrationDistanceInput}
          floorPlanCalibrationSummary={floorPlanCalibrationSummary}
          floorPlanTraceRoomMode={floorPlanTraceRoomMode}
          floorPlanDrawRoomMode={floorPlanDrawRoomMode}
          floorPlanDrawAngleLockMode={floorPlanDrawAngleLockMode}
          floorPlanExactWallLengthInput={floorPlanExactWallLengthInput}
          floorPlanTraceRoomPointCount={floorPlanTraceRoomPoints.length}
          floorPlanTraceRoomType={floorPlanTraceRoomType}
          floorPlanTraceOpeningMode={floorPlanTraceOpeningMode}
          floorPlanTraceOpeningPointCount={floorPlanTraceOpeningPoints.length}
          floorPlanTraceOpeningKind={floorPlanTraceOpeningKind}
          canTraceOpenings={Boolean(
            floorPlanUnderlay?.mimeType.startsWith("image/") &&
              floorPlanUnderlay.calibration &&
              housePlan2D.rooms.length > 0
          )}
          floorPlanPdfSourceReady={floorPlanPdfSourceReady}
          floorPlanPdfRenderingPage={floorPlanPdfRenderingPage}
          roomConnectionChecklistItems={roomConnectionChecklistItems}
          visiblePlanOpening={visiblePlanOpening}
          visiblePlanOpeningRoomName={visiblePlanOpeningRoomName}
          visiblePlanOpeningWallSpanMeters={visiblePlanOpeningWallSpanMeters}
          visiblePlanOpeningMaxHeightMeters={visiblePlanOpeningMaxHeightMeters}
          planRoomCount={housePlan2D.rooms.length}
          planItemCount={items.length}
          planOpeningCount={planOpenings.length}
          activeRoomName={activeRoom?.name ?? "Current room"}
          activeRoomId={designSnapshot.activeRoomId}
          rooms={designSnapshot.rooms.map((room) => ({ id: room.id, name: room.name }))}
          activeRoomType={activeRoom?.roomType ?? "living"}
          activeRoomTypeLabel={activeRoom ? getRoomTypeLabel(activeRoom.roomType) : "Room"}
          activeRoomFloorMaterialId={activeRoomFloorMaterialId}
          activeRoomFloorRotationDeg={activeRoomFloorRotationDeg}
          activeRoomFloorScale={activeRoomFloorScale}
          activeRoomFloorPattern={activeRoomFloorSettings.floorPattern}
          activeRoomFloorPatternOffset={activeRoomFloorSettings.floorPatternOffset}
          activeRoomFloorJointSizeMm={activeRoomFloorSettings.floorJointSizeMm}
          activeRoomFloorJointColor={activeRoomFloorSettings.floorJointColor}
          activeSurfaceTarget={activeSurfaceTarget}
          selectedWallFaceId={activeSelectedWallFaceId}
          selectedWallLabel={getWallFaceLabel(activeSelectedWallFaceId)}
          activeRoomWallSettings={activeRoomWallSettings}
          activeRoomSelectedWallSettings={activeRoomSelectedWallSettings}
          activeRoomCeilingSettings={activeRoomCeilingSettings}
          surfaceBrushActive={surfaceBrushActive}
          surfaceBrushMaterialId={surfaceBrushMaterialId}
          surfaceBrushPaintColorHex={surfaceBrushPaint?.colorHex ?? null}
          surfaceBrushPaintName={surfaceBrushPaint?.name ?? null}
          surfaceRooms={surfaceRoomSummaries}
          floorFinishPanelOpenSignal={floorFinishPanelOpenSignal}
          floorOptions={floorOptions}
          showFloorPropertiesPanel={inlineFloorPropertiesPanelVisible}
          activeFloorLevel={activeFloorLevel}
          activeFloorRoomCount={activeFloorRoomCount}
          activeRoomHeightMm={activeRoomHeightMm}
          activeRoomWallThicknessMm={activeRoomWallThicknessMm}
          activeRoomSlabThicknessMm={activeRoomSlabThicknessMm}
          activeRoomBaseboardDepthMm={activeRoomBaseboardDepthMm}
          activeRoomWallOpacity={activeRoomWallOpacity}
          activeRoomFloorOpacity={activeRoomFloorOpacity}
          activeRoomCeilingOpacity={activeRoomCeilingOpacity}
          activeRoomCeilingVisible={activeRoomCeilingVisible}
          activeRoomCeilingColor={activeRoomCeilingColor}
          stackedFloorView={stackedFloorView}
          activeRoomShoppableCount={activeRoomShoppingSummary?.shoppableCount ?? 0}
          activeRoomNeedsReviewCount={activeRoomShoppingSummary?.needsReviewCount ?? 0}
          activeRoomCategoryCounts={activeRoomCategoryCounts}
          activeRoomShoppingSubtotal={activeRoomShoppingSummary?.subtotal ?? 0}
          activeRoomPreviewNames={activeRoomShoppingSummary?.previewNames ?? []}
          activeRoomShoppingItems={activeRoomShoppingItems}
          activeRoomProductQuantities={activeRoomProductQuantities}
          activeRoomVariantQuantities={activeRoomVariantQuantities}
          placementAddMode={placementAddMode}
          aiLayoutProposal={pendingAiLayoutProposal}
          activeFloorPlanTool={activeFloorPlanTool}
          simplePlanControls={simplePlanControls}
          planGuidedActionsEnabled={planGuidedActionsEnabled}
          planStartMode={guidedPlanStartMode}
          planCompletionSignal={consumerPlanCompletionSignal}
          floorPlanQualityReport={floorPlanQualityReport}
          onPlanCompletionHandled={handleConsumerPlanCompletionHandled}
          onPlanStartModeChange={setGuidedPlanStartMode}
          onPlanQualityAction={handlePlanQualityAction}
          onSimplePlanControlsChange={setSimplePlanControls}
          onPlanGuidedActionsEnabledChange={setPlanGuidedActionsEnabled}
          onSelectFloorPlanTool={handleSelectFloorPlanTool}
          onDrawFloorPlanRoom={() => handleFloorPlanDrawRoomModeChange("rectangle_wall")}
          onAddFloorPlanOpeningFromTool={handleAddFloorPlanOpeningFromTool}
          onSignIn={signInWithReturn}
          onGoFurnish={goFurnish}
          onGoAiDesign={goAiDesign}
          onGoShop={goShop}
          onGoView3D={() => handleEditorViewModeChange("3d")}
          onSelectRoom={handleSwitchRoom}
          onPlacementAddModeChange={setPlacementAddMode}
          onStyleChange={setStyle}
          onBudgetChange={setBudget}
          onRunAiLayout={(requestedRoles) => {
            void runAiLayout({ requestedRoles });
          }}
          onApplyAiLayoutProposal={applyPendingAiLayoutProposal}
          onTryAiLayoutAgain={(requestedRoles) => {
            void regenerateAiLayout(requestedRoles);
          }}
          onClearAiLayoutProposal={dismissPendingAiLayoutProposal}
          onApplyPlanTemplate={handleApplyPlanTemplate}
          onApplyFloorMaterialToRoom={handleApplyFloorMaterialToRoom}
          onApplyFloorMaterialToAllRooms={handleApplyFloorMaterialToAllRooms}
          onRotateActiveFloorMaterial={handleRotateActiveFloorMaterial}
          onResetActiveFloorMaterialPattern={handleResetActiveFloorMaterialPattern}
          onActiveFloorMaterialScaleChange={handleActiveFloorMaterialScaleChange}
          onActiveFloorSurfaceSettingsChange={handleActiveFloorSurfaceSettingsChange}
          onSurfaceTargetChange={handleSurfaceTargetModeChange}
          onSurfaceBrushActiveChange={handleSurfaceBrushActiveChange}
          onSurfaceMaterialSelected={handleSurfaceMaterialSelectedForBrush}
          onSurfacePaintSelected={handleSurfacePaintSelectedForBrush}
          onApplyWallMaterialToRoom={handleApplyWallMaterialToRoom}
          onApplyWallMaterialToAllRooms={handleApplyWallMaterialToAllRooms}
          onApplyWallPaintToRoom={handleApplyWallPaintToRoom}
          onApplyWallPaintToAllRooms={handleApplyWallPaintToAllRooms}
          onApplyCeilingPaintToRoom={handleApplyCeilingPaintToRoom}
          onApplyCeilingPaintToAllRooms={handleApplyCeilingPaintToAllRooms}
          onActiveWallSurfaceSettingsChange={(patch) =>
            handleActiveWallSurfaceSettingsChange(
              patch,
              activeRoom?.id ?? null,
              activeSurfaceTarget === "selected_wall" ? activeSelectedWallFaceId : null
            )
          }
          onResetActiveWallSurface={() =>
            handleResetActiveWallSurface(
              activeRoom?.id ?? null,
              activeSurfaceTarget === "selected_wall" ? activeSelectedWallFaceId : null
            )
          }
          onResetActiveCeilingSurface={() => handleResetActiveCeilingSurface(activeRoom?.id ?? null)}
          onAddDesignerRoom={() => handleAddRoom()}
          onAddRoomTemplate={handleAddRoom}
          onNewRoomTypeChange={setNewRoomType}
          onNewRoomShapeChange={setNewRoomShape}
          onRoomPresetChange={handleRoomPresetChange}
          onRoomWidthInputChange={setRoomWidthInput}
          onRoomDepthInputChange={setRoomDepthInput}
          onCommitRoomDimension={handleCommitActiveRoomDimension}
          onActiveRoomHeightMmChange={handleActiveRoomHeightMmChange}
          onActiveRoomWallThicknessMmChange={handleActiveRoomWallThicknessMmChange}
          onActiveRoomSlabThicknessMmChange={handleActiveRoomSlabThicknessMmChange}
          onActiveRoomBaseboardDepthMmChange={handleActiveRoomBaseboardDepthMmChange}
          onActiveRoomSurfaceOpacityChange={handleActiveRoomSurfaceOpacityChange}
          onActiveRoomCeilingVisibleChange={handleActiveRoomCeilingVisibleChange}
          onActiveRoomCeilingColorChange={handleActiveRoomCeilingColorChange}
          onAddImportedToRoom={addSelectedImportedToRoom}
          onAddCatalogItemToRoom={addCatalogItemToRoom}
          onAutoPlaceCatalogItemInRoom={autoPlaceCatalogItemInRoom}
          onPreviewCatalogPlacementIntent={previewCatalogPlacementIntent}
          onCatalogDragStart={handleCatalogDragStart}
          onCatalogDragEnd={handleCatalogDragEnd}
          onAddActiveRoomCartReadyItems={addActiveRoomCartReadyItems}
          onReviewShoppingIssue={reviewShoppingIssue}
          onSelectedImportedFamilyChange={setSelectedImportedFamilyKey}
          onSelectedImportedProductChange={setSelectedImportedProductId}
          onGridToggle={() => setShowGrid((value) => !value)}
          onSnapToggle={() => setSnapEnabled((value) => !value)}
          onFloorPlanUpload={handleFloorPlanUnderlayUpload}
          onFloorPlanPdfPageChange={handleFloorPlanPdfPageChange}
          onFloorPlanOpacityChange={handleFloorPlanUnderlayOpacityChange}
          onFloorPlanLockChange={handleFloorPlanUnderlayLockChange}
          onFloorPlanCalibrationModeChange={handleFloorPlanCalibrationModeChange}
          onFloorPlanCalibrationDistanceChange={setFloorPlanCalibrationDistanceInput}
          onApplyFloorPlanCalibration={handleApplyFloorPlanCalibration}
          onResetFloorPlanCalibrationPoints={handleResetFloorPlanCalibrationPoints}
          onFloorPlanTraceRoomModeChange={handleFloorPlanTraceRoomModeChange}
          onFloorPlanTraceRoomDrawModeChange={handleFloorPlanDrawRoomModeChange}
          onFloorPlanDrawAngleLockModeChange={setFloorPlanDrawAngleLockMode}
          onFloorPlanExactWallLengthInputChange={setFloorPlanExactWallLengthInput}
          onApplyFloorPlanExactWallLength={handleApplyFloorPlanExactWallLength}
          onFloorPlanTraceRoomTypeChange={setFloorPlanTraceRoomType}
          onUndoFloorPlanTraceRoomPoint={handleUndoFloorPlanTraceRoomPoint}
          onResetFloorPlanTraceRoomPoints={handleResetFloorPlanTraceRoomPoints}
          onFloorPlanTraceOpeningModeChange={handleFloorPlanTraceOpeningModeChange}
          onFloorPlanTraceOpeningKindChange={setFloorPlanTraceOpeningKind}
          onResetFloorPlanTraceOpeningPoints={handleResetFloorPlanTraceOpeningPoints}
          onClearFloorPlan={handleClearFloorPlanUnderlay}
          onAddSuggestedDoorway={handleAddSuggestedDoorway}
          onUpdateOpeningMetrics={handleUpdateOpeningMetrics2D}
        />
      )}

      {isClientPreview && (
        <div className="absolute right-6 top-6 z-30 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs text-white">
          Client-safe view - nothing editable
        </div>
      )}

      {isClientPreview && (
        <div className="absolute bottom-5 right-6 z-30 text-xs text-white/40">
          beta preview
        </div>
      )}

      <UpgradeDialog
        state={{
          open: showUpgrade && !isClientPreview,
          variantLabel: upgradeCtaVariant,
          contentVariant: upgradeCtaVariant,
          description: upgradeDialogDescription,
          exportWorkflowBenefit: upgradeDialogExportWorkflowBenefit,
          pricingGuidance: upgradeDialogPricingGuidance,
          annualSavingsLabel: annualPlanSavingsLabel,
          primaryCtaLabel: primaryUpgradeCtaLabel,
          dismissLabel: upgradeCtaVariant === "see_pricing" ? "Maybe later" : "Close",
          startingCheckout,
          showSignIn: !session?.user,
        }}
        actions={{
          onSeePlans: openPlansFromUpgrade,
          onSignIn: signInFromUpgrade,
          onClose: closeUpgradeDialog,
        }}
      />

      <GuestSavePromptDialog
        open={Boolean(guestPromptReason) && !isClientPreview}
        onNotNow={handleGuestPromptNotNow}
        onSaveAndContinue={handleGuestSaveAndContinue}
      />

      <PlansDialog
        state={{
          open: showPlans,
          layout: pricingLayoutVariant,
          proActive: plan === "pro",
          startingCheckout,
          openingBillingPortal,
          monthlyLabel: PRO_PLAN_PRICING.monthly.label,
          yearlyLabel: PRO_PLAN_PRICING.yearly.label,
          yearlyEffectiveMonthlyLabel: PRO_PLAN_PRICING.yearly.effectiveMonthlyLabel,
          annualSavingsLabel: annualPlanSavingsLabel,
        }}
        actions={{
          onClose: closePlansDialog,
          onManageBilling: manageBillingFromPlans,
          onStartCheckout: startCheckoutFromPlans,
        }}
      />

      <AiNotesDialog
        open={showAINotes}
        data={aiNotesData}
        canApplySuggestions={isPro(plan)}
        onApplySuggestion={applySuggestion}
        onClose={closeAiNotes}
      />
      {/* Layer 3: Present Modal (visible in PRESENT mode) */}
      <PresentExportDialog
        configuration={{
          open: editorMode === "present" && showPresentModal && !isClientPreview,
          designerTheme: showDesignerTheme,
          canUseDesigner,
        }}
        state={{
          exportReadiness: {
            items: exportReadinessItems,
            readyCount: exportReadinessReadyCount,
            score: exportReadinessScore,
          },
          rooms: getAllRoomNames(designSnapshot),
          currentRoomId: presentModeRoomId ?? designSnapshot.activeRoomId ?? null,
          viewMode,
          cameraViewNameInput,
          activeRoom: activeRoom ?? null,
          layoutVersionNameInput,
          simplePlanControls,
          planLayerPreset,
          planLayers,
          planMeasurementUnit,
          planTheme,
          annotationToolKind,
          selectedPlanOverlayId,
          visiblePlanOpening,
          visiblePlanOpeningRoomName,
          visiblePlanOpeningWallSpanMeters,
          visiblePlanOpeningMaxHeightMeters,
          lightingPreset,
          sharingDesign,
          designId,
          shareToken,
          exportStylePreset,
          isExporting,
          isPdfExporting,
          sceneReady,
          aiNotesLoading,
          hasItems: items.length > 0,
        }}
        actions={{
          onClose: () => {
            setShowPresentModal(false);
            setEditorMode("design");
          },
          onSelectRoom: (roomId) => {
            setPresentModeRoomId(roomId);
            setDesignSnapshot(switchRoom(designSnapshot, roomId));
          },
          onViewModeChange: (next) => {
            handleEditorViewModeChange(next);
            if (next === "3d") {
              transitionToCameraView(getEyeLevelView(), 500);
            }
          },
          onFocusCamera: () => {
            handleEditorViewModeChange("3d");
            transitionToCameraView(getFocusView(), 460);
          },
          onCameraViewNameChange: setCameraViewNameInput,
          onSaveCameraView: saveCurrentNamedView,
          onOpenCameraView: openSavedCameraView,
          onDeleteCameraView: deleteSavedCameraView,
          onLayoutVersionNameChange: setLayoutVersionNameInput,
          onSaveLayoutVersion: saveCurrentLayoutVersion,
          onRestoreLayoutVersion: restoreRoomLayoutVersion,
          onDeleteLayoutVersion: deleteRoomLayoutVersion,
          onEnableSimplePlanControls: () => setSimplePlanControls(true),
          onEnableProPlanControls: () => {
            if (!canUseDesigner) {
              setUpgradeReason("designer");
              setShowUpgrade(true);
              return;
            }
            setSimplePlanControls(false);
          },
          onPlanLayerPresetChange: (preset) => runPlanOverlayCommand(`preset:${preset}`),
          onPlanThemeChange: (theme) => {
            runHistoryTransaction("Change plan theme", () => setPlanTheme(theme));
          },
          onTogglePlanLayer: (key) => {
            runHistoryTransaction("Toggle plan layer", () =>
              setPlanLayers((prev) => ({
                ...prev,
                [key]: !prev[key],
              }))
            );
          },
          onMeasurementUnitChange: (unit) => {
            runHistoryTransaction("Change measurement unit", () => setPlanMeasurementUnit(unit));
          },
          onSelectAnnotationTool: selectAnnotationTool,
          onAddOpening: (kind) => {
            const id = `opening-${Date.now()}`;
            runHistoryTransaction(kind === "door" ? "Add door" : "Add window", () =>
              setPlanOpenings((prev) => [
                ...prev,
                {
                  id,
                  wall: kind === "door" ? "south" : "north",
                  kind,
                  offsetMm: 0,
                  widthMm: kind === "door" ? 900 : 1200,
                },
              ])
            );
            handleSelectPlanOverlay(id);
          },
          onAddBuiltIn: () => {
            const id = `fixed-${Date.now()}`;
            runHistoryTransaction("Add plan fixture", () =>
              setPlanFixedElements((prev) => [
                ...prev,
                {
                  id,
                  kind: "wardrobe",
                  xMm: 0,
                  zMm: 0,
                  widthMm: 1200,
                  depthMm: 600,
                  rotationDeg: 0,
                  label: "Wardrobe",
                },
              ])
            );
            handleSelectPlanOverlay(id);
          },
          onDeleteSelectedPlanOverlay: () => {
            deletePlanOverlayById(selectedPlanOverlayId);
          },
          onOpeningChange: handleUpdateOpeningMetrics2D,
          onLightingPresetChange: (preset) => setLightingPreset(preset),
          onCreateShareLink: createShareLinkAndCopy,
          onExportStyleChange: (preset) => {
            if (preset === "pro" && !canUseDesigner) {
              setUpgradeReason("export_images");
              setShowUpgrade(true);
              return;
            }
            runHistoryTransaction("Change export style", () => {
              setExportStylePreset(preset);
              applyPlanLayerPresetInTransaction(
                preset === "pro" ? "technical" : "presentation"
              );
            });
          },
          onExportImages: () => {
            exportImages();
            setShowPresentModal(false);
            setEditorMode("design");
          },
          onExportPdf: () => {
            exportPdf();
            setShowPresentModal(false);
            setEditorMode("design");
          },
          onGenerateAiNotes: () => {
            generateAINotes();
            setShowPresentModal(false);
            setEditorMode("design");
          },
        }}
      />

      <MyDesignsDialog
        open={showMyDesigns}
        designerTheme={showDesignerTheme}
        designs={myDesigns}
        loading={loadingDesigns}
        allDesignIds={allSavedDesignIds}
        selectedDesignIds={selectedSavedDesignIds}
        selectedDesignCount={selectedSavedDesignCount}
        allDesignsSelected={allSavedDesignsSelected}
        deletingDesignIds={deletingDesignIds}
        pendingDeleteDesign={pendingDeleteDesign}
        onClose={closeMyDesigns}
        onOpenTemplates={openNewPlanPicker}
        onToggleAll={toggleAllSavedDesignSelection}
        onToggleSelection={toggleSavedDesignSelection}
        onLoadDesign={handleLoadDesign}
        onRequestDelete={requestDeleteSavedDesigns}
        onCancelDelete={cancelDeleteSavedDesigns}
        onConfirmDelete={handleDeleteSavedDesign}
      />

      <RoomRenameDialog
        open={Boolean(pendingRoomRenameId)}
        value={pendingRoomRenameValue}
        onValueChange={setPendingRoomRenameValue}
        onCancel={cancelRoomRename}
        onSave={commitRoomRename}
      />

      <PlanAnnotationDialog
        kind={pendingAnnotationKind}
        text={pendingAnnotationText}
        onTextChange={setPendingAnnotationText}
        onCancel={cancelPlanAnnotation}
        onAdd={commitPlanAnnotation}
      />

      <CatalogPlacementConfirmPanel
        state={{
          scene: pendingCatalogPlacementScene,
          roomName: pendingCatalogPlacementRoom?.name ?? null,
          hardInvalid: pendingCatalogPlacementHardInvalid,
          statusLabel: pendingCatalogPlacementStatusLabel,
          targetLabel: activePlacementTargetLabel ?? null,
          targetValid: activePlacementTargetValid,
          quality: pendingCatalogPlacementQuality,
          score: pendingCatalogPlacementScore,
          improvement: pendingCatalogPlacementImprovement,
          bestRoomPlacement: pendingCatalogBestRoomPlacement,
          bestVariantPlacement: pendingCatalogBestVariantPlacement,
          blocked: pendingCatalogPlacementBlocked,
          hasRestorablePlacement: Boolean(restorableCatalogPlacement),
          shouldConfirmImprovedPlacement: shouldConfirmImprovedCatalogPlacement,
          shouldConfirmRestoredPlacement: shouldConfirmRestoredCatalogPlacement,
        }}
        configuration={{
          activeRoomName: activeRoom?.name ?? null,
          nudgeStepMeters: 0.25,
        }}
        actions={{
          onAutoPlace: autoPlacePendingCatalogPlacement,
          onMoveToBestRoom: movePendingCatalogPlacementToBestRoom,
          onSwitchToBestOption: switchPendingCatalogPlacementToBestOption,
          onImprovePlacement: improvePendingCatalogPlacement,
          onRestoreValidPlacement: restoreLastValidCatalogPlacement,
          onSelectBlocker: selectPendingCatalogPlacementBlocker,
          onSwapWithBlocker: swapPendingCatalogWithBlocker,
          onMoveBlockerAside: movePendingCatalogBlockerAside,
          onPlaceBesideBlocker: placePendingCatalogBesideBlocker,
          onTrySmallerVariant: trySmallerPendingCatalogVariant,
          onCenter: centerPendingCatalogPlacement,
          onNudge: nudgePendingCatalogPlacement,
          onRotate: rotatePendingCatalogPlacement,
          onCancel: cancelPendingCatalogPlacement,
          onConfirm: confirmPendingCatalogPlacement,
        }}
      />

      <PlanTemplateChoiceDialog
        open={Boolean(pendingPlanTemplateReplacement)}
        templateLabel={pendingPlanTemplateReplacement?.template.label ?? "this floor plan"}
        busy={startingNewPlan}
        errorMessage={newPlanStartError}
        isAuthenticated={Boolean(session?.user)}
        onCancel={cancelPendingPlanChoice}
        onReplaceCurrent={replaceCurrentPlanFromChoice}
        onSaveCurrentAndStartNew={saveCurrentAndStartNewPlan}
        onSignIn={signInWithReturn}
      />

      {!isClientPreview && (
        <BetaFeedbackWidget
          open={feedbackOpen}
          onOpenChange={setFeedbackOpen}
          showTrigger={false}
          context={{
            designId,
            shareToken,
            mode,
            viewMode,
            plan,
            activeRoomName: activeRoom?.name ?? "Current room",
            roomCount: housePlan2D.rooms.length,
            itemCount: items.length,
            openingCount: planOpenings.length,
            exportReadinessScore,
            selectedItemId: selectedItem?.instanceId ?? null,
            selectedItemProductId: selectedItem?.productId ?? null,
            placementScore: pendingCatalogPlacementScore?.score ?? null,
            placementKind: pendingCatalogPlacementScore?.kind ?? null,
            shoppingReadyCount: wholeHomeShoppingSummary.shoppableCount,
            shoppingNeedsReviewCount: wholeHomeShoppingSummary.needsReviewCount,
            saveStatus: saveStatus.kind,
            shareEnabled: Boolean(shareToken),
            activePlacementTarget: pendingCatalogPlacementRoom?.name ?? activeRoom?.name ?? null,
            viewportWidth: viewportSize.width,
            viewportHeight: viewportSize.height,
          }}
        />
      )}

      <DesignPageToasts
        ruleMessage={ruleToast}
        nudgeMessage={nextBestActionNudge}
        shareCopied={shareSuccessToast}
        shareErrorMessage={shareErrorToast}
      />

      <ShareLinkFallbackDialog
        url={shareLinkFallback}
        dark={showDesignerTheme}
        onClose={closeShareLinkFallback}
        onCopy={copyFallbackShareLink}
        onOpen={openFallbackShareLink}
      />

      <DesignValidationFeedback
        hidden={isClientPreview}
        constraints={visibleConstraints}
        confidence={layoutConfidence}
      />

      <CabinetryStudioOverlay
        state={cabinetryStudioState}
        enabled={canUseCabinetryStudio}
        accessLevel={cabinetryAccessLevel}
        measurementUnit={planMeasurementUnit}
        availableSpaces={cabinetryAvailableSpaces}
        preferredSpaceId={cabinetryPreferredSpaceId}
        openedAtRef={cabinetryStudioOpenedAtRef}
        onSave={handleSaveCabinetDefinition}
        onPlaceInPlan={handlePlaceCabinetInPlan}
        onDismiss={dismissCabinetryStudio}
      />

      {/* Item Cart Drawer */}
      <ItemCartDrawer
        items={itemCart}
        onRemove={removeFromCart}
        onUpdateQty={updateCartQty}
        onClear={clearCart}
        onAddAllToRoom={addAllToRoom}
        isOpen={itemCartOpen}
        onToggle={() => setItemCartOpen((v) => !v)}
        triggerClassName={
          designControlsPanelVisibleForLayout
            ? "bottom-[calc(64vh+1.25rem)] right-4 md:bottom-4"
            : "bottom-4 right-4"
        }
      />

    </DesignPageComposition>
  );
}
