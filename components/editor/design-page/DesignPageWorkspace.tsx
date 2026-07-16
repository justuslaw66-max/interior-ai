"use client";

import * as THREE from "three";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { signIn, useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LightingPreset } from "@/lib/lightingPresets";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { isPro, type Plan } from "@/lib/plan";
import { useEditorMode } from "@/hooks/useEditorMode";
import { track } from "@/lib/analytics";
import { preloadCoreAssets } from "@/lib/preloadAssets";
import { initializeCatalog } from "@/lib/catalog-init";
import type { DesignItem } from "@/lib/room-types";
import { getWallFaceLabel } from "@/lib/surface-settings";
import type { ShoppingReadinessFilter } from "@/lib/shopping-readiness";
import { getAllRoomNames } from "@/lib/room-hooks";
import type { PlanStartMode } from "@/components/editor/DesignControlsPlanPanel";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { Plan2DCameraDiagnostics } from "@/components/editor/camera/Plan2DCameraInvariantGuard";
import { DesignPageComposition } from "@/components/editor/design-page/DesignPageComposition";
import { DesignPageEditorChrome } from "@/components/editor/design-page/DesignPageEditorChrome";
import { DesignPageDialogLayer } from "@/components/editor/design-page/DesignPageDialogLayer";
import { DesignPagePanelRegion } from "@/components/editor/design-page/DesignPagePanelRegion";
import { DesignPageSceneRegion } from "@/components/editor/design-page/DesignPageSceneRegion";
import {
  DesignPageProjectQaMarkers,
  DesignPageRuntimeQaMarkers,
} from "@/components/editor/design-page/DesignPageQaMarkers";
import { EditorCommandPalette } from "@/components/editor/design-page/EditorCommandPalette";
import { PlacedCabinetAssetMarkers } from "@/components/editor/design-page/PlacedCabinetAssetMarkers";
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
import { useDesignPageAiNotes } from "@/lib/useDesignPageAiNotes";
import { useDesignPageSceneItemDrag } from "@/lib/useDesignPageSceneItemDrag";
import { useDesignPageRoomGeometry } from "@/lib/useDesignPageRoomGeometry";
import { useDesignPageTransientFeedback } from "@/lib/useDesignPageTransientFeedback";
import { useDesignPageSurfaceStateController } from "@/lib/useDesignPageSurfaceStateController";
import { useDesignPageSurfaceWorkspaceFacade } from "@/lib/useDesignPageSurfaceWorkspaceFacade";
import { useDesignPageSurfaceTargetingFacade } from "@/lib/useDesignPageSurfaceTargetingFacade";
import {
  useDesignPagePanelMode,
  type DesignPageEditorMode,
} from "@/lib/useDesignPagePanelMode";
import { useDesignPageOnboarding } from "@/lib/useDesignPageOnboarding";
import {
  type FloorActionAdapters,
  useFloorManager,
} from "@/lib/useFloorManager";
import { buildDesignPageSceneRegionAdapter } from "@/lib/design-page-scene-region-adapter";
import { buildDesignPageViewportRegionAdapter } from "@/lib/design-page-viewport-region-adapter";
import { composeDesignPageSceneRegionModel } from "@/lib/design-page-viewport-region-model";
import { buildDesignPageDialogLayerAdapter } from "@/lib/design-page-dialog-layer-adapter";
import { buildDesignPagePanelRegionAdapter } from "@/lib/design-page-panel-region-adapter";
import { buildDesignPageBetaFeedbackContext } from "@/lib/design-page-beta-feedback";
import { buildDesignControlsPanelModel } from "@/lib/design-page-controls-panel-model";
import { buildDesignPageDialogLayerModel } from "@/lib/design-page-dialog-layer-model";
import { buildDesignPageSelectionPanelModels } from "@/lib/design-page-selection-panel-model";
import { buildDesignPageShoppingPanelModel } from "@/lib/design-page-shopping-panel-model";
import {
  type Style,
  type CameraView,
  type NamedCameraView,
} from "@/lib/design-page-types";
import type { PendingAiLayoutProposal } from "@/lib/design-page-ai-layout-proposal";
import type {
  PricingLayoutVariant,
  UpgradeCtaVariant,
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
import { useDesignPageBetaStartController } from "@/lib/useDesignPageBetaStartController";
import { useDesignPageCanvasInteractionController } from "@/lib/useDesignPageCanvasInteractionController";
import { useDesignPageEditorChromeController } from "@/lib/useDesignPageEditorChromeController";
import { useDesignPagePlanCanvasActionsController } from "@/lib/useDesignPagePlanCanvasActionsController";
import { useDesignPagePanelActions } from "@/lib/useDesignPagePanelActions";
import { useDesignPagePresentExportController } from "@/lib/useDesignPagePresentExportController";
import {
  useDesignPagePaywallTelemetryController,
  type DesignPageUpgradeReason,
} from "@/lib/useDesignPagePaywallTelemetryController";
import { useDesignPagePaywallTelemetryLifecycle } from "@/lib/useDesignPagePaywallTelemetryLifecycle";
import {
  isParametricCabinetItem,
} from "@/features/cabinetry/designItemAdapters";
import { useDesignPageCabinetry } from "@/features/cabinetry/useDesignPageCabinetry";

const STORAGE_KEY = "interior-ai:v1:livingroom-design";
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
  const [upgradeReason, setUpgradeReason] =
    useState<DesignPageUpgradeReason>(null);
  const [upgradeCtaVariant, setUpgradeCtaVariant] = useState<UpgradeCtaVariant>("unlock_pro_exports");
  const [pricingLayoutVariant, setPricingLayoutVariant] = useState<PricingLayoutVariant>("default");
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
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
  const {
    state: {
      floorFinishPanelOpenSignal,
      activeSurfaceTarget,
      selectedWallSurfaceTarget,
      selectedRendererSurfaceTarget,
      surfaceBrushActive,
      surfaceBrushMaterialId,
      surfaceBrushPaint,
    },
    actions: surfaceStateActions,
  } = useDesignPageSurfaceStateController();
  const {
    setActiveSurfaceTarget,
    setSelectedWallSurfaceTarget,
    setSelectedRendererSurfaceTarget,
  } = surfaceStateActions;
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
  const seatingZoneAutoDisabledRef = useRef(false);
  const itemsRef = useRef<DesignItem[]>([]);
  const resetSelectionStateRef = useRef<() => void>(() => undefined);
  const {
    state: {
      qaPaywallHooksEnabled,
      paywallVariant,
      resolvedPricingLayout,
    },
    derived: {
      primaryUpgradeCtaLabel,
      annualPlanSavingsLabel,
      upgradeDialogDescription,
      upgradeDialogExportWorkflowBenefit,
      upgradeDialogPricingGuidance,
      paywallContextMeta,
    },
    actions: { logFunnelEvent, trackFirstInteraction, setUrlMode },
  } = useDesignPagePaywallTelemetryController({
    state: {
      identity: {
        designId,
        shareToken,
        userId: session?.user?.id ?? null,
      },
      paywall: {
        variantOverride: paywallVariantOverride,
        upgradeReason,
        ctaVariant: upgradeCtaVariant,
        pricingLayout: pricingLayoutVariant,
      },
      editor: {
        canUseDesigner,
        simplePlanControls,
        mode,
        isAuthenticated: Boolean(session?.user),
      },
      navigation: {
        currentSearch: searchParams.toString(),
        pathname,
      },
    },
    refs: { items: itemsRef },
    actions: {
      setSimplePlanControls,
      replaceUrl: (url) => router.replace(url, { scroll: false }),
    },
    configuration: {
      environment: {
        nodeEnv: process.env.NODE_ENV,
        enableQaHooks: process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS,
        paywallWinnerDefault:
          process.env.NEXT_PUBLIC_PAYWALL_WINNER_DEFAULT,
        paywallFallbackVariant:
          process.env.NEXT_PUBLIC_PAYWALL_FALLBACK_VARIANT,
        paywallForceFallback:
          process.env.NEXT_PUBLIC_PAYWALL_FORCE_FALLBACK,
        paywallExperimentSlot:
          process.env.NEXT_PUBLIC_PAYWALL_EXPERIMENT_SLOT,
      },
    },
  });

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

  const signInWithReturn = useCallback(() => {
    const callbackUrl =
      typeof window !== "undefined" ? window.location.href : "/design";
    signIn("google", { callbackUrl });
  }, []);

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
  const {
    state: { visible: showBetaStart },
    actions: betaStartActions,
  } = useDesignPageBetaStartController({
    state: {
      isClientPreview,
      planRoomCount: housePlan2D.rooms.length,
      itemCount: items.length,
    },
    actions: {
      setGuidedPlanStartMode,
      goPlan,
      goAiDesign,
      setViewMode,
      setDesignPanelOpen,
      activateFloorPlanRoomTrace,
      showToast: showRuleToast,
    },
  });

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
  } = useDesignPagePaywallTelemetryLifecycle({
    billing: {
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
    },
    state: {
      telemetry: {
        designId,
        mode,
        isAuthenticated: Boolean(session?.user),
      },
      access: { wantsDesigner, canUseDesigner, showUpgrade },
      synchronization: {
        paywallVariant,
        pricingLayout: resolvedPricingLayout,
      },
      qa: {
        hooksEnabled: qaPaywallHooksEnabled,
        paywallOpenParam,
        plansOpenParam,
      },
    },
    actions: {
      setMode,
      setUpgradeCtaVariant,
      setPricingLayoutVariant,
    },
  });

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
      modelControls: productModelControlActions,
      finishControls: productFinishControlActions,
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
  const {
    derived: surfaceWorkspaceDerived,
    actions: surfaceWorkspaceActions,
  } = useDesignPageSurfaceWorkspaceFacade({
    state: {
      document: { activeRoomId: designSnapshot.activeRoomId },
      selection: { selectedPlanRoomId },
      surface: { selectedWallSurfaceTarget, surfaceBrushPaint },
    },
    configuration: { isClientPreview, liveCatalogReady },
    refs: { designSnapshot: designSnapshotRef },
    actions: {
      document: {
        setDesignSnapshot,
        runHistoryTransaction,
        runCoalescedHistoryTransaction,
      },
      selection: { clearNonRoomSelection, setSelectedPlanRoomId },
      surfaceState: surfaceStateActions,
      navigation: { switchRoom: handleSwitchRoom, goPlan },
      panels: {
        setDesignPanelOpen,
        setDesignPanelCollapsed,
        inspectorUi: surfaceInspectorUiActions,
      },
      feedback: { showToast: showRuleToast, track },
    },
  });
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
    state: {
      controlsEnabled: canvasControlsEnabled,
      gridPulse,
    },
    refs: { itemDragCommit: dragCommitRef },
    actions: {
      changeCatalogObjectDragging: setSofaDragging,
      changeSceneItemDragging: handleDraggingChange,
      changePlanRoomDragging: handlePlanRoomDragStateChange,
      changePlanRoomResizing: handlePlanRoomResizeStateChange,
      changePlanOverlayDragging: handlePlanOverlayDragStateChange,
      changePlanOpeningDragging: handlePlanOpeningDragStateChange3D,
      pulseSnapGrid: triggerGridPulse,
      handleOrbitChange: handleOrbitControlsChange,
    },
  } = useDesignPageCanvasInteractionController({
    state: { showGrid, snapEnabled, isDesigner },
    refs: {
      orbitControls: orbitControlsRef,
      cameraAnimating: isCameraAnimatingRef,
    },
    actions: { history, updateCameraViewFromScene },
  });

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
  const { actions: panelActions } = useDesignPagePanelActions({
    state: {
      activeRoomId: activeRoom?.id ?? null,
      activeSurfaceTarget,
      selectedWallFaceId: activeSelectedWallFaceId,
      items,
    },
    refs: { selectedIds: selectedIdsRef, primaryId: primaryIdRef },
    actions: {
      setClientPreview, setDesignPanelCollapsed, setDesignPanelOpen,
      setShowGrid, setSnapEnabled, setItemCartOpen,
      changeViewMode: handleEditorViewModeChange,
      runAiLayout, regenerateAiLayout,
      changeWallSurfaceSettings:
        surfaceWorkspaceActions.changeActiveWallSurfaceSettings,
      resetWallSurface: surfaceWorkspaceActions.resetActiveWallSurface,
      resetCeilingSurface: surfaceWorkspaceActions.resetActiveCeilingSurface,
      commitItems, updateSelection,
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

  const presentExportDialog = useDesignPagePresentExportController({
    state: {
      dialog: {
        exportReadiness: { items: exportReadinessItems, readyCount: exportReadinessReadyCount, score: exportReadinessScore },
        rooms: getAllRoomNames(designSnapshot), currentRoomId: presentModeRoomId ?? designSnapshot.activeRoomId ?? null,
        viewMode, cameraViewNameInput, activeRoom: activeRoom ?? null, layoutVersionNameInput, simplePlanControls,
        planLayerPreset, planLayers, planMeasurementUnit, planTheme, annotationToolKind, selectedPlanOverlayId,
        visiblePlanOpening, visiblePlanOpeningRoomName, visiblePlanOpeningWallSpanMeters, visiblePlanOpeningMaxHeightMeters,
        lightingPreset, sharingDesign, designId, shareToken, exportStylePreset, isExporting, isPdfExporting,
        sceneReady, aiNotesLoading, hasItems: items.length > 0,
      },
      document: { snapshot: designSnapshot },
    },
    configuration: { open: editorMode === "present" && showPresentModal, designerTheme: showDesignerTheme, canUseDesigner,
      eyeLevelTransitionDurationMs: 500, focusTransitionDurationMs: 460 },
    actions: {
      shell: { setPresentModalOpen: setShowPresentModal, setEditorMode, setPresentModeRoomId, setDesignSnapshot,
        changeViewMode: handleEditorViewModeChange, setUpgradeReason, setUpgradeOpen: setShowUpgrade },
      camera: { getEyeLevelView, getFocusView, transitionToView: transitionToCameraView, setName: setCameraViewNameInput,
        save: saveCurrentNamedView, open: openSavedCameraView, delete: deleteSavedCameraView },
      layoutVersions: { setName: setLayoutVersionNameInput, save: saveCurrentLayoutVersion,
        restore: restoreRoomLayoutVersion, delete: deleteRoomLayoutVersion },
      history: { runTransaction: runHistoryTransaction },
      plan: { setSimpleControls: setSimplePlanControls, runOverlayCommand: runPlanOverlayCommand, setTheme: setPlanTheme,
        setLayers: setPlanLayers, setMeasurementUnit: setPlanMeasurementUnit, setOpenings: setPlanOpenings,
        setFixedElements: setPlanFixedElements, selectOverlay: handleSelectPlanOverlay, selectAnnotationTool,
        deleteOverlay: deletePlanOverlayById, changeOpening: handleUpdateOpeningMetrics2D,
        applyLayerPresetInTransaction: applyPlanLayerPresetInTransaction },
      presentation: { changeLightingPreset: setLightingPreset, createShareLink: createShareLinkAndCopy, setExportStylePreset,
        exportImages, exportPdf, generateAiNotes: generateAINotes },
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

  const canEditPlanGeometry = !isClientPreview;
  const {
    state: { surfaceInspector: selectedSurfaceInspectorState },
    actions: {
      targetPendingCatalogPlacementToRoom,
      handlePlacementAwareRoomSelect,
      handleRendererSurfaceTargetSelect,
      surfaceInspector: selectedSurfaceInspectorActions,
    },
  } = useDesignPageSurfaceTargetingFacade({
    state: {
      targeting: { editorMode, surfaceBrush: {
        active: surfaceBrushActive, materialId: surfaceBrushMaterialId, paint: surfaceBrushPaint,
      } },
      inspector: {
        context: surfaceInspectorContext, selectedPlanRoom: selectedPlanRoomContext,
        hasSelectedItem: Boolean(selectedItem), hasVisiblePlanOpening: Boolean(visiblePlanOpening),
        hasSelectedPlanFixedElement: Boolean(selectedPlanFixedElement), hasSelectedPlanAnnotation: Boolean(selectedPlanAnnotation),
        planMeasurementUnit,
      },
    },
    configuration: { targeting: {
      canApplySurfaceBrush: surfaceWorkspaceDerived.canApplySurfaceBrush,
    },
      inspector: { canEdit, canEditPlanGeometry, isDesigner },
    },
    refs: { designSnapshot: designSnapshotRef },
    actions: {
      targetPendingCatalogPlacementToRoom:
        targetPendingCatalogPlacementToRoomAction,
      clearNonRoomSelection,
      setSelectedPlanRoomId,
      setSelectedRendererSurfaceTarget,
      setSelectedWallSurfaceTarget,
      preserveCameraAfterPlanOverlaySelection,
      resetFloorPlanTraceRoomPoints: handleResetFloorPlanTraceRoomPoints,
      switchRoom: handleSwitchRoom,
      setEditorMode,
      setActiveSurfaceTarget,
      surfaceWorkspace: surfaceWorkspaceActions,
      track,
      inspectorUi: surfaceInspectorUiActions,
      changeSelectedWallHeight: handleSelectedWallHeightChange,
      resetSelectedWallHeight: handleResetSelectedWallHeight,
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

  const activePlacementTargetValid = pendingCatalogPlacement
    ? !pendingCatalogPlacementHardInvalid
    : crossRoomDragTarget?.valid ?? true;
  const activePlacementTargetLabel = pendingCatalogPlacementRoom?.name ??
    crossRoomDragTarget?.label ?? placementTargetRoom?.name ?? null;
  const betaFeedbackContext = buildDesignPageBetaFeedbackContext({
    identity: { designId, shareToken },
    editor: { mode, viewMode, plan, saveStatus: saveStatus.kind, shareEnabled: Boolean(shareToken) },
    project: { activeRoomName: activeRoom?.name ?? "Current room", roomCount: housePlan2D.rooms.length,
      itemCount: items.length, openingCount: planOpenings.length, exportReadinessScore },
    selection: { itemId: selectedItem?.instanceId ?? null, productId: selectedItem?.productId ?? null },
    placement: { score: pendingCatalogPlacementScore?.score ?? null, kind: pendingCatalogPlacementScore?.kind ?? null,
      targetRoomName: pendingCatalogPlacementRoom?.name ?? null, fallbackRoomName: activeRoom?.name ?? null },
    shopping: { readyCount: wholeHomeShoppingSummary.shoppableCount,
      needsReviewCount: wholeHomeShoppingSummary.needsReviewCount },
    viewport: { width: viewportSize.width, height: viewportSize.height },
  });
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
  const { actions: planCanvasActions } =
    useDesignPagePlanCanvasActionsController({
      actions: {
        setGuidedActionsChoiceSeen: setPlanGuidedActionsChoiceSeen,
        chooseGuidedActionsMode: choosePlanGuidedActionsMode,
        selectFloorPlanTool: handleSelectFloorPlanTool,
        setGuidedPlanStartMode,
        changeCalibrationMode: handleFloorPlanCalibrationModeChange,
        changeDrawRoomMode: handleFloorPlanDrawRoomModeChange,
        addFloorPlanOpening: handleAddFloorPlanOpeningFromTool,
        fitPlanView: handleFitPlanView,
        setGuidedActionsEnabled: setPlanGuidedActionsEnabled,
        undoFloorPlanTraceRoomPoint: handleUndoFloorPlanTraceRoomPoint,
        clearPlanFocusPoints,
        setDesignPanelOpen,
        setPlanFocusPanelRevealed,
        goPlan,
        goFurnish,
        dismissPlanCanvasGuidance: setDismissedPlanCanvasGuidanceKey,
      },
    });
  const sceneCanvasRegionModel = buildDesignPageSceneRegionAdapter({
    state: {
      editor: { viewMode, editorMode, isClientPreview, isDesigner, canEdit },
      scene: {
        liteEnabled: liteSceneEnabled,
        loadingVisible: showSceneLoadingVeil,
        performanceMode: scenePerformanceMode,
        renderQuality: sceneRenderQuality,
        controlsEnabled: canvasControlsEnabled,
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
        cursor: planCanvasCursor,
        backgroundColor: sceneBackgroundColor,
        lightConfig,
        showGrid,
        gridPulse,
      },
      plan: {
        fit: plan2DWholeHomeViewFit,
        orientation: plan2DWholeHomeViewFit.orientation,
        fitBounds: {
          widthMeters: plan2DFitBounds.widthMeters, depthMeters: plan2DFitBounds.depthMeters,
          centerX: plan2DFitBounds.centerX, centerZ: plan2DFitBounds.centerZ,
        },
        safeArea: { leftPx: plan2DSafeAreaLeftPx, rightPx: plan2DSafeAreaRightPx, bottomPx: plan2DSafeAreaBottomPx },
        rooms: housePlan2D.rooms,
        underlay: floorPlanUnderlay,
        calibration: { enabled: floorPlanCalibrationMode, points: floorPlanCalibrationPoints },
        roomTrace: {
          enabled: floorPlanTraceRoomMode,
          interactionMode: floorPlanDrawRoomMode,
          points: floorPlanTraceRoomPoints,
          previewPoint: blankGridRoomPreviewPoint,
          drawOnBlankGrid: blankGridRoomDrawActive,
        },
        openingTrace: { enabled: floorPlanTraceOpeningMode, points: floorPlanTraceOpeningPoints, kind: floorPlanTraceOpeningKind },
        width: planViewWidth,
        depth: planViewDepth,
        selectedRoomId: selectedPlanRoomId,
        selectedOverlayId: selectedPlanOverlayId,
        suppressedDoorwaySuggestionKeys,
        editorScene: editorScene2D,
        zones: planZones2D,
        qualityIssues: floorPlanQualityReport.issues,
        measurementUnit: planMeasurementUnit,
        theme: effectivePlanTheme,
        layers: effectivePlanLayers,
      },
      room: {
        activeId: designSnapshot.activeRoomId,
        guidanceActiveId: activeRoom?.id ?? null,
        activePlanOffset: activeRoomPlanOffset,
        activeFloorLevel, stackedFloors: stackedFloorView,
        wholeHomeEnabled: usesHousePlanScene,
        wholeHomeRooms: sceneHousePlanRooms3D,
        selectedSurfaceTarget: selectedRendererSurfaceTarget,
        width: roomWidth, depth: roomDepth, height: roomHeight, wallThickness,
        slabThickness: activeRoom?.geometry.slabThickness,
        wallOpacity: activeRoomWallOpacity,
        floorOpacity: activeRoomFloorOpacity,
        ceilingOpacity: activeRoomCeilingOpacity,
        ceilingVisible: activeRoomCeilingVisible, ceilingColor: activeRoomCeilingColor,
        walls,
      },
      placement: {
        targetRoom: placementTargetPlanRoom,
        showTargetRoom: Boolean(
          pendingCatalogPlacement || crossRoomDragTarget
        ),
        targetValid: activePlacementTargetValid,
        supportSurface: activeCatalogPlacementSurfaceHighlight,
        compatibleZoneIds: activePlacementCompatibleZoneIds,
        pending: pendingCatalogPlacement !== null,
        hover: hoverCatalogPlacement !== null,
        pendingScene: pendingCatalogPlacementScene,
        hoverScene: hoverCatalogPlacementScene,
        hardInvalid: pendingCatalogPlacementHardInvalid,
        pendingRoomSize: pendingCatalogPlacementRoom
          ? {
              width: pendingCatalogPlacementRoom.geometry.width,
              depth: pendingCatalogPlacementRoom.geometry.depth,
            }
          : null,
      },
      zones: {
        entries: zones,
        selectedId: selectedZoneId,
        circulationHeatmap: circulationHeatmap
          ? {
              cells: circulationHeatmap.analysis.heatmap,
              roomOffset: circulationHeatmap.roomOffset,
            }
          : null,
      },
      items: {
        entries: sceneRoomItems, selectedIds, selectedInstanceId,
        previewVariantId, previewMaterialPresetId, hoveredCartInstanceId,
        activeSceneItemsForGuides, itemPlanningBoundsByInstanceId,
      },
      aiLayout: { footprints: aiLayoutPreviewFootprints, tone: aiLayoutPreviewTone },
    },
    configuration: {
      initialCameraView: DEFAULT_EDITOR_CAMERA_VIEW,
      orbit: {
        minDistance: EDITOR_3D_MIN_CAMERA_DISTANCE,
        maxDistance: Math.max(
          24,
          Math.max(planViewWidth, planViewDepth) * 6
        ),
        minPolarAngle: EDITOR_3D_MIN_POLAR_ANGLE,
        maxPolarAngle: EDITOR_3D_MAX_POLAR_ANGLE,
      },
      snapEnabled, rotationSnapStepRadians,
      rotationSnapStepDegrees, rotationSnapEnabled,
    },
    references: {
      canvas: { canvas: canvasRef, camera: cameraRef, controls: orbitControlsRef, renderer: rendererRef, scene: sceneRef },
    },
    resolvers: {
      guidance: { getZoneBounds },
      items: {
        resolveItemConfigurationEntry, resolveConfiguredVisualDimsMm,
        resolveConfiguredPlanningDimsMm, resolveConfiguredModelUrl,
        resolveConfiguredNodeTransforms,
        getRoomItems: (roomId) =>
          roomSnapshotById.get(roomId)?.items ?? [],
      },
    },
    actions: {
      shell: { onDragOver: handleCatalogCanvasDragOver, onDrop: handleCatalogCanvasDrop, onDragLeave: handleCatalogCanvasDragLeave },
      canvas: {
        onClearSelection: clearAllSelection,
        onPlanDiagnosticsChange: handlePlan2DCameraDiagnosticsChange,
        updateProjection, onSceneProgressReadyChange: setSceneProgressReady,
        onFpsSample: handleScenePerformanceSample, onSustainedLowFps: handleSustainedLowFps,
        onOrbitChange: handleOrbitControlsChange,
      },
      structure: {
        underlay: {
          addCalibrationPoint: handleFloorPlanCalibrationPoint, addRoomTracePoint: handleFloorPlanTraceRoomPoint,
          addOpeningTracePoint: handleFloorPlanTraceOpeningPoint,
        },
        rooms: {
          select: handlePlacementAwareRoomSelect,
          selectSurfaceTarget: handleRendererSurfaceTargetSelect,
          clearSelection: clearAllSelection, rename: handleRenameSelectedPlanRoom,
          duplicate: handleDuplicateSelectedPlanRoom, delete: handleDeleteSelectedPlanRoom,
          editFloor: surfaceWorkspaceActions.openFloorEditorForRoom,
          fit: handleFitSelectedPlanRoom,
          move: handleMoveRoom2D, resize: handleResizeRoom2D,
          setDragging: handlePlanRoomDragStateChange,
          setResizing: handlePlanRoomResizeStateChange,
        },
        overlays: {
          select: handleSelectPlanOverlay, delete: deletePlanOverlayById,
          moveOpening: handleMoveOpening2D, resizeOpening: handleResizeOpening2D,
          addDoorwaySuggestion: handleAddSuggestedDoorway,
          moveFixedElement: handleMoveFixedElement2D, moveAnnotation: handleMoveAnnotation2D,
          setDragging: handlePlanOverlayDragStateChange,
        },
        drawing: {
          addRoomPoint: handleBlankGridRoomDrawPoint, previewRoomPoint: handleBlankGridRoomDrawPreviewPoint,
          commitRoomDimension: handleCommitRoomDimensionEdit2D,
          commitWallSegmentLength: handleCommitWallDrawSegmentLength2D,
          drawRoom: handleBlankGridRoomDrawDrag, addOpeningPoint: handleBlankGridTraceOpeningPoint,
        },
        wholeHome: { setOpeningDragging: handlePlanOpeningDragStateChange3D },
        reportPlanMetrics: handlePlanDebugMetricsChange,
      },
      guidance: {
        showToast: showRuleToast, targetPendingPlacementToRoom: targetPendingCatalogPlacementToRoom,
        selectZone: setSelectedZoneId,
        clearSelection,
      },
      items: {
        onDraggingChange: handleDraggingChange, onRenderReadyChange: handleSceneRenderItemReadyChange,
        selectItem: handleSelect, trackFirstInteraction,
        onDuplicateSelectedItem: duplicateSelectedItem, onDeleteSelectedItem: deleteSelectedItem,
        onMove: handleSceneItemMove,
        onDragPointerMove: hasWholeHousePlan
          ? nudgeWholeHomeCameraForDrag
          : undefined,
        applyItemRotation, onSnapPulse: triggerGridPulse, onDragEnd: handleSceneItemDragEnd,
      },
      preview: {
        onPlacementPointerDown: handleCatalogPlacementPointerDown, onPlacementPointerMove: handleCatalogPlacementPointerMove,
        onPlacementPointerUp: handleCatalogPlacementPointerUp,
      },
    },
  });
  const viewportRegionModel = buildDesignPageViewportRegionAdapter({
    state: {
      visibility: {
        rail: floatingPlanOverlayStackVisible, sceneLoading: showSceneLoadingVeil,
        selectionInspector: floatingSelectionInspectorVisible, planQuality: plan2DQualityReviewPanelVisible,
        floorProperties: floatingFloorPropertiesPanelVisible,
        isClientPreview,
      },
      opening: {
        selectedId: selectedPlanOverlayId,
        value: visiblePlanOpening
          ? {
              kind: visiblePlanOpening.kind, wall: visiblePlanOpening.wall,
              widthMm: visiblePlanOpening.widthMm,
            }
          : null,
      },
      selectionInspector: {
        summary: selectedObjectInspector, selectedRoom: selectedPlanRoomContext,
        hasSelectedItem: Boolean(selectedItem), hasVisiblePlanOpening: Boolean(visiblePlanOpening),
        hasSelectedPlanFixedElement: Boolean(selectedPlanFixedElement),
        hasSelectedPlanAnnotation: Boolean(selectedPlanAnnotation),
        surfaceInspectorIsWall, surfaceInspectorIsCeiling,
        surfaceInspector: selectedSurfaceInspectorState,
        measurementUnit: planMeasurementUnit,
        activeRoomHeightMm, activeFloorRoomCount,
        designRoomCount: designSnapshot.rooms.length,
      },
      planQuality: { report: floorPlanQualityReport, collapsed: planQualityReviewCollapsed },
      planCanvas: planCanvasOverlaysState,
      aiLayoutPreview: { proposal: pendingAiLayoutProposal, toneText: aiLayoutPreviewTone.text },
      crossRoomDragTarget,
      navigator: {
        enabled: viewMode === "3d" && hasWholeHousePlan, rooms: housePlan2D.rooms,
        activeRoomId: designSnapshot.activeRoomId,
        cameraPosition: cameraView.pos, cameraTarget: cameraView.target,
        itemCountsByRoomId: roomItemCountsById,
        targetRoomId: placementTargetRoomId, targetRoomValid: activePlacementTargetValid,
      },
      floorProperties: {
        roomWidth, roomDepth, floorOptions, hiddenFloorLevels,
        activeFloorLevel, activeFloorRoomCount,
        measurementUnit: planMeasurementUnit,
        activeRoomHeightMm, activeRoomWallThicknessMm,
        activeRoomSlabThicknessMm, activeRoomBaseboardDepthMm,
        activeRoomWallOpacity, activeRoomFloorOpacity, activeRoomCeilingOpacity,
        activeRoomCeilingVisible,
        activeRoomCeilingColor,
        stackedFloorView, canRedo,
      },
      selectionControls: {
        viewMode, stackedFloorView, floorOptions, activeFloorLevel, hiddenFloorLevels,
        selectedCount: selectedIds.size,
        pendingZoneType, selectedZone, isClientPreview,
      },
    },
    configuration: {
      dark: showDesignerTheme,
      sceneBackgroundColor,
      canEditPlanGeometry,
      selectionInspectorDockedWithRightRail,
      floatingOverlayStackWidthPx: PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX,
      selectionInspectorRightPx,
      selectionInspectorTopPx,
      selectionInspectorWidthPx,
      planQualityReviewTopPx: plan2DQualityReviewPanelTopPx,
      editorMode,
    },
    references: {
      planQuality: { setPanel: setPlanQualityReviewPanelNode },
    },
    actions: {
      deletePlanOverlay: deletePlanOverlayById,
      showToast: showRuleToast,
      selectionInspector: {
        clearSelection: clearAllSelection, setMeasurementUnit: setPlanMeasurementUnit,
        commitRoomDimensionMeters: handleCommitRoomDimensionEdit2D,
        commitActiveFloorWallHeightMm: handleActiveRoomHeightMmChange,
        item: {
          center: centerSelectedItemInRoom, snapToWall: snapSelectedItemToNearestWall,
          duplicate: duplicateSelectedItem, delete: deleteSelectedItem,
        },
        room: {
          editFloor: surfaceWorkspaceActions.openFloorEditorForRoom,
          fit: handleFitSelectedPlanRoom,
          duplicate: handleDuplicateSelectedPlanRoom, delete: handleDeleteSelectedPlanRoom,
        },
        surfaceInspector: selectedSurfaceInspectorActions,
      },
      planQuality: { toggleCollapsed: togglePlanQualityReviewPanel, activateIssue: handlePlanQualityAction },
      planCanvas: planCanvasActions,
      aiLayoutPreview: { apply: applyPendingAiLayoutProposal, dismiss: dismissPendingAiLayoutProposal },
      navigator: {
        onMoveCamera: handleWholeHomeMoveCamera, onMoveTarget: handleWholeHomeMoveTarget,
        onFocusRoom: handleWholeHomeFocusRoom,
        onZoom: handleWholeHomeNavigatorZoom, onResetView: handleFitPlanView,
      },
      floorProperties: {
        addFloor: handleAddFloor,
        onToggleFloorVisibility: handleToggleFloorVisibility, onRenameFloor: handleRenameFloor,
        onDuplicateFloor: handleDuplicateFloor, onDeleteFloor: handleDeleteFloor,
        onSwitchFloor: handleSwitchFloor,
        onStackedFloorViewChange: setStackedFloorView,
        onRedo: redoSafe, onActiveRoomHeightMmChange: handleActiveRoomHeightMmChange,
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
        onActiveRoomCeilingColorChange: handleActiveRoomCeilingColorChange,
      },
      selectionControls: {
        floorStack: { switchFloor: handleSwitchFloor },
        multiSelection: {
          alignX: alignSelectionX, alignZ: alignSelectionZ,
          changeZoneType: setPendingZoneType, createZone: createZoneFromSelection,
          clear: clearAllSelection,
        },
        selectedZone: { autoLayout: autoLayoutZone, rotateZone, ungroup: ungroupZone },
      },
    },
  });
  const sceneRegionModel = composeDesignPageSceneRegionModel({
    scene: sceneCanvasRegionModel,
    viewport: viewportRegionModel,
  });
  const editorChromeModel = useDesignPageEditorChromeController({
    state: {
      commandBar: {
        commandBar: {
          isClientPreview, editorMode, viewMode, isDesigner,
          isAuthed: Boolean(session?.user),
          isPro: plan === "pro",
          isOpeningBillingPortal: openingBillingPortal,
          aiDesignEnabled, canUndo, canRedo, undoName, redoName,
          millworkActive: cabinetryStudioState !== null,
          showLoadDesign: Boolean(session?.user),
          isSaving, saveStatus,
        },
        room: activeRoom
          ? {
              id: activeRoom.id,
              roomName: activeRoom.name,
              roomTypeLabel: getRoomTypeLabel(activeRoom.roomType),
              roomCount: designSnapshot.rooms.length,
              widthMeters: roomWidth, depthMeters: roomDepth, viewMode,
              health: activeRoomHealthSummary
                ? {
                    level: activeRoomHealthSummary.level,
                    score: activeRoomHealthSummary.placementScore,
                    nextAction: activeRoomHealthSummary.nextAction,
                  }
                : null,
            }
          : null,
        scenePerformance: { mode: scenePerformanceMode, liteEnabled: liteSceneEnabled },
      },
      betaStart: {
        visible: showBetaStart,
        panel: {
          nextStepLabel: firstRunActivationState.nextStep?.label ?? null,
          progressPercent: firstRunActivationState.progressPercent,
        },
      },
      designPanelOpen,
    },
    configuration: {
      commandBar: {
        dark: showDesignerTheme,
        compactRoomStatus: compactRoomPlanStatusBar,
        showRoomHealth: showRoomPlanStatusHealth,
      },
      toolRail: { dark: showDesignerTheme, aiDesignEnabled },
      canUseDesigner, canUseCabinetryStudio,
    },
    actions: {
      navigation: {
        plan: goPlan, furnish: goFurnish, aiDesign: goAiDesign, shop: goShop,
        changeViewMode: handleEditorViewModeChange,
        fitPlan: handleFitPlanView,
      },
      history: { undo: undoSafe, redo: redoSafe },
      editor: {
        setMode: setEditorMode,
        setDesignPanelOpen,
        setItemCartOpen,
        setClientPreview,
        setUrlMode,
      },
      dialogs: {
        setPlansOpen: setShowPlans,
        openNewPlan: openNewPlanPicker,
        setFeedbackOpen,
        setPresentOpen: setShowPresentModal,
        setUpgradeReason,
        setUpgradeOpen: setShowUpgrade,
      },
      billing: { openPortal: openBillingPortal },
      persistence: {
        toggleMyDesigns,
        saveDesignToCloud,
        retrySaveStatus,
        openGuestPrompt,
      },
      cabinetry: { openStudio: openCabinetryStudio },
      room: {
        reviewHealth: reviewActiveRoomHealth,
        rename: handleRenameSelectedPlanRoom,
      },
      scenePerformance: {
        changeMode: handleScenePerformanceModeChange,
      },
      betaStart: betaStartActions,
      showToast: showRuleToast,
    },
  });
  const shoppingPanelModel = buildDesignPageShoppingPanelModel({
    configuration: { designerTheme: showDesignerTheme },
    state: {
      overview: { activeRoom: activeRoomShoppingSummary, activeRoomItems: activeRoomShoppingItems, catalogItems,
        rooms: roomShoppingSummaries, wholeHome: wholeHomeShoppingSummary, activeFilter: shoppingReadinessFilter },
      cart: { items, designId: designId ?? null, plan, isGuest: !session?.user },
    },
    actions: {
      overview: { onSelectRoom: handleSwitchRoom, onGoFurnish: goFurnish, onAddActiveRoomCartReadyItems: addActiveRoomCartReadyItems,
        onSetItemInclude: setShoppingItemInclude, onSwapShoppingItem: swapShoppingItemReplacement,
        onPreviewReplacement: previewShoppingReplacement, onFilterChange: setShoppingReadinessFilter },
      cart: { onRemove: panelActions.removeShoppingItem, onSetQty: setSelectedItemQuantity, onSetInclude: setShoppingItemInclude,
        onBulkSwap, onShowUpgrade: () => setShowUpgrade(true), openGuestPrompt },
    },
  });
  const selectionPanelModels = buildDesignPageSelectionPanelModels({
    cabinet: {
      state: { cabinet: selectedCabinet!, project: { handoffPackage: projectCabinetHandoffPackage, hasAssets: projectCabinetAssets.length > 0 } },
      configuration: { canEdit, canUseStudio: canUseCabinetryStudio, isDesigner, isClientPreview, designerTheme: showDesignerTheme },
      actions: { center: centerSelectedCabinetInRoom, snapToWall: snapSelectedCabinetToNearestWall, nudge: nudgeSelectedCabinet,
        rotateByDegrees: rotateSelectedCabinetByDegrees, resetRotation: resetSelectedCabinetRotation,
        export: handleSelectedCabinetExport, edit: handleEditSelectedCabinet, delete: deleteSelectedItem },
    },
    item: {
      state: {
        document: { rooms: designSnapshot.rooms.map((room) => ({ id: room.id, name: room.name })), activeRoomId: designSnapshot.activeRoomId },
        details: { product: selectedProduct!, item: selectedItem, measurementUnit: planMeasurementUnit,
          planningDimensionsMm: selectedItemPlanningDimensionsMm, selectedBrand, selectedModelTitle, selectedCategoryDebugLabel,
          activeVariantLabel, productDetailSections: selectedProductDetailSections, fullDimensionsDetails,
          selectedDimensionImageUrl, styleConsistencyReport: selectedStyleConsistencyReport },
        inspectionController: { state: selectedItemPanelControllerState,
          adjustableHangingHeight: selectedAdjustablePendantHeight
            ? { valueCm: selectedAdjustablePendantHeight.currentCm, minCm: selectedAdjustablePendantHeight.minCm,
                maxCm: selectedAdjustablePendantHeight.maxCm, stepCm: 1 }
            : null },
        rotation: { enabled: Boolean(selectedItem), state: { selectedRotationDegrees, rotationSnapEnabled, rotationSnapStepDegrees,
          rotationSnapPresetDegrees, rotationInputValue, disabled: rotateControlsDisabled } },
        productModelVariants: productModelVariantControlsState, productFinishes: productFinishControlsState,
      },
      configuration: { dark: showDesignerTheme, isDesigner, isClientPreview, canEdit },
      actions: {
        inspectionController: selectedItemPanelControllerActions,
        placement: { onMoveToRoom: moveSelectedItemToRoom, onDuplicate: duplicateSelectedItem, onDelete: deleteSelectedItem,
          onCenterInRoom: centerSelectedItemInRoom, onSnapToWall: snapSelectedItemToNearestWall,
          onNudge: nudgeSelectedItem, onAdjustHangingHeight: adjustSelectedPendantHeight },
        rotation: { onSnapPresetChange: setRotationSnapPresetDegrees, onRotateByDegrees: rotateSelectedByDegrees,
          onResetRotation: resetSelectedRotation, onRotationInputChange: setRotationInputValue, onApplyRotationInput: applyRotationInputValue },
        productConfiguration: { model: productModelControlActions, finish: productFinishControlActions,
          selectVariant: handleSelectProductVariant },
      },
    },
  });
  const designControlsPanelModel = buildDesignControlsPanelModel({
    access: { dark: showDesignerTheme, isClientPreview, isAuthed: Boolean(session?.user), isDesigner, canEdit, canEditPlanGeometry, aiDesignEnabled },
    panel: { mode: designControlsPanelMode,
      state: { collapsed: designPanelCollapsed, selectionContext: selectedObjectContext, viewMode, style, budget, showGrid, snapEnabled } },
    room: {
      state: { newRoomType, newRoomShape, activeRoomPresetId, roomWidthInput, roomDepthInput, roomWidth, roomDepth,
        activeRoomName: activeRoom?.name ?? "Current room", activeRoomId: designSnapshot.activeRoomId,
        rooms: designSnapshot.rooms.map((room) => ({ id: room.id, name: room.name })), activeRoomType: activeRoom?.roomType ?? "living",
        activeRoomTypeLabel: activeRoom ? getRoomTypeLabel(activeRoom.roomType) : "Room", activeFloorLevel, activeFloorRoomCount,
        activeRoomHeightMm, activeRoomWallThicknessMm, activeRoomSlabThicknessMm, activeRoomBaseboardDepthMm,
        activeRoomWallOpacity, activeRoomFloorOpacity, activeRoomCeilingOpacity, activeRoomCeilingVisible, activeRoomCeilingColor, stackedFloorView },
      actions: { addDesignerRoom: handleAddRoom, onAddRoomTemplate: handleAddRoom, onNewRoomTypeChange: setNewRoomType,
        onNewRoomShapeChange: setNewRoomShape, onRoomPresetChange: handleRoomPresetChange, onRoomWidthInputChange: setRoomWidthInput,
        onRoomDepthInputChange: setRoomDepthInput, onCommitRoomDimension: handleCommitActiveRoomDimension,
        onActiveRoomHeightMmChange: handleActiveRoomHeightMmChange, onActiveRoomWallThicknessMmChange: handleActiveRoomWallThicknessMmChange,
        onActiveRoomSlabThicknessMmChange: handleActiveRoomSlabThicknessMmChange,
        onActiveRoomBaseboardDepthMmChange: handleActiveRoomBaseboardDepthMmChange,
        onActiveRoomSurfaceOpacityChange: handleActiveRoomSurfaceOpacityChange,
        onActiveRoomCeilingVisibleChange: handleActiveRoomCeilingVisibleChange, onActiveRoomCeilingColorChange: handleActiveRoomCeilingColorChange },
    },
    floorPlan: {
      state: { measurementUnit: planMeasurementUnit, floorPlanUnderlay, floorPlanCalibrationMode,
        floorPlanCalibrationPointCount: floorPlanCalibrationPoints.length, floorPlanCalibrationDistanceInput, floorPlanCalibrationSummary,
        floorPlanTraceRoomMode, floorPlanDrawRoomMode, floorPlanDrawAngleLockMode, floorPlanExactWallLengthInput,
        floorPlanTraceRoomPointCount: floorPlanTraceRoomPoints.length, floorPlanTraceRoomType, floorPlanTraceOpeningMode,
        floorPlanTraceOpeningPointCount: floorPlanTraceOpeningPoints.length, floorPlanTraceOpeningKind, floorPlanPdfSourceReady,
        floorPlanPdfRenderingPage, roomConnectionChecklistItems, visiblePlanOpening, visiblePlanOpeningRoomName,
        visiblePlanOpeningWallSpanMeters, visiblePlanOpeningMaxHeightMeters, planRoomCount: housePlan2D.rooms.length,
        planItemCount: items.length, planOpeningCount: planOpenings.length, activeFloorPlanTool, simplePlanControls,
        planGuidedActionsEnabled, planStartMode: guidedPlanStartMode, planCompletionSignal: consumerPlanCompletionSignal, floorPlanQualityReport },
      actions: { onPlanCompletionHandled: handleConsumerPlanCompletionHandled, onPlanStartModeChange: setGuidedPlanStartMode,
        onPlanQualityAction: handlePlanQualityAction, onSimplePlanControlsChange: setSimplePlanControls,
        onPlanGuidedActionsEnabledChange: setPlanGuidedActionsEnabled, onSelectFloorPlanTool: handleSelectFloorPlanTool,
        onAddFloorPlanOpeningFromTool: handleAddFloorPlanOpeningFromTool, onApplyPlanTemplate: handleApplyPlanTemplate,
        onFloorPlanUpload: handleFloorPlanUnderlayUpload, onFloorPlanPdfPageChange: handleFloorPlanPdfPageChange,
        onFloorPlanOpacityChange: handleFloorPlanUnderlayOpacityChange, onFloorPlanLockChange: handleFloorPlanUnderlayLockChange,
        onFloorPlanCalibrationModeChange: handleFloorPlanCalibrationModeChange,
        onFloorPlanCalibrationDistanceChange: setFloorPlanCalibrationDistanceInput, onApplyFloorPlanCalibration: handleApplyFloorPlanCalibration,
        onResetFloorPlanCalibrationPoints: handleResetFloorPlanCalibrationPoints, onFloorPlanTraceRoomModeChange: handleFloorPlanTraceRoomModeChange,
        onFloorPlanTraceRoomDrawModeChange: handleFloorPlanDrawRoomModeChange,
        onFloorPlanDrawAngleLockModeChange: setFloorPlanDrawAngleLockMode,
        onFloorPlanExactWallLengthInputChange: setFloorPlanExactWallLengthInput,
        onApplyFloorPlanExactWallLength: handleApplyFloorPlanExactWallLength, onFloorPlanTraceRoomTypeChange: setFloorPlanTraceRoomType,
        onUndoFloorPlanTraceRoomPoint: handleUndoFloorPlanTraceRoomPoint, onResetFloorPlanTraceRoomPoints: handleResetFloorPlanTraceRoomPoints,
        onFloorPlanTraceOpeningModeChange: handleFloorPlanTraceOpeningModeChange,
        onFloorPlanTraceOpeningKindChange: setFloorPlanTraceOpeningKind,
        onResetFloorPlanTraceOpeningPoints: handleResetFloorPlanTraceOpeningPoints, onClearFloorPlan: handleClearFloorPlanUnderlay,
        onAddSuggestedDoorway: handleAddSuggestedDoorway, onUpdateOpeningMetrics: handleUpdateOpeningMetrics2D },
    },
    surfaces: {
      state: { activeRoomFloorMaterialId, activeRoomFloorRotationDeg, activeRoomFloorScale,
        activeRoomFloorPattern: activeRoomFloorSettings.floorPattern, activeRoomFloorPatternOffset: activeRoomFloorSettings.floorPatternOffset,
        activeRoomFloorJointSizeMm: activeRoomFloorSettings.floorJointSizeMm, activeRoomFloorJointColor: activeRoomFloorSettings.floorJointColor,
        activeSurfaceTarget, selectedWallFaceId: activeSelectedWallFaceId, selectedWallLabel: getWallFaceLabel(activeSelectedWallFaceId),
        activeRoomWallSettings, activeRoomSelectedWallSettings, activeRoomCeilingSettings, surfaceBrushActive, surfaceBrushMaterialId,
        surfaceBrushPaintColorHex: surfaceBrushPaint?.colorHex ?? null, surfaceBrushPaintName: surfaceBrushPaint?.name ?? null,
        surfaceRooms: surfaceRoomSummaries, floorFinishPanelOpenSignal, floorOptions, showFloorPropertiesPanel: inlineFloorPropertiesPanelVisible },
      actions: {
        onApplyFloorMaterialToRoom: surfaceWorkspaceActions.applyFloorMaterialToRoom, onApplyFloorMaterialToAllRooms: surfaceWorkspaceActions.applyFloorMaterialToAllRooms,
        onRotateActiveFloorMaterial: surfaceWorkspaceActions.rotateActiveFloorMaterial, onResetActiveFloorMaterialPattern: surfaceWorkspaceActions.resetActiveFloorMaterialPattern,
        onActiveFloorMaterialScaleChange: surfaceWorkspaceActions.changeActiveFloorMaterialScale,
        onActiveFloorSurfaceSettingsChange: surfaceWorkspaceActions.changeActiveFloorSurfaceSettings, onSurfaceTargetChange: surfaceWorkspaceActions.changeSurfaceTargetMode,
        onSurfaceBrushActiveChange: surfaceWorkspaceActions.changeSurfaceBrushActive, onSurfaceMaterialSelected: surfaceWorkspaceActions.selectSurfaceMaterialForBrush,
        onSurfacePaintSelected: surfaceWorkspaceActions.selectSurfacePaintForBrush, onApplyWallMaterialToRoom: surfaceWorkspaceActions.applyWallMaterialToRoom,
        onApplyWallMaterialToAllRooms: surfaceWorkspaceActions.applyWallMaterialToAllRooms, onApplyWallPaintToRoom: surfaceWorkspaceActions.applyWallPaintToRoom,
        onApplyWallPaintToAllRooms: surfaceWorkspaceActions.applyWallPaintToAllRooms, onApplyCeilingPaintToRoom: surfaceWorkspaceActions.applyCeilingPaintToRoom,
        onApplyCeilingPaintToAllRooms: surfaceWorkspaceActions.applyCeilingPaintToAllRooms,
      },
    },
    shopping: {
      state: { catalogItems, selectedImportedFamilyKey, selectedImportedProductId, importedFamilyOptions, importedModelOptions,
        visibleImportedModelOptions, activeRoomShoppableCount: activeRoomShoppingSummary?.shoppableCount ?? 0,
        activeRoomNeedsReviewCount: activeRoomShoppingSummary?.needsReviewCount ?? 0, activeRoomCategoryCounts,
        activeRoomShoppingSubtotal: activeRoomShoppingSummary?.subtotal ?? 0,
        activeRoomPreviewNames: activeRoomShoppingSummary?.previewNames ?? [], activeRoomShoppingItems,
        activeRoomProductQuantities, activeRoomVariantQuantities, placementAddMode },
      actions: { onAddImportedToRoom: addSelectedImportedToRoom, onAddCatalogItemToRoom: addCatalogItemToRoom,
        onAutoPlaceCatalogItemInRoom: autoPlaceCatalogItemInRoom, onPreviewCatalogPlacementIntent: previewCatalogPlacementIntent,
        onCatalogDragStart: handleCatalogDragStart, onCatalogDragEnd: handleCatalogDragEnd,
        onAddActiveRoomCartReadyItems: addActiveRoomCartReadyItems, onReviewShoppingIssue: reviewShoppingIssue,
        onSelectedImportedFamilyChange: setSelectedImportedFamilyKey, onSelectedImportedProductChange: setSelectedImportedProductId },
    },
    ai: { state: { aiLayoutProposal: pendingAiLayoutProposal },
      actions: { onApplyAiLayoutProposal: applyPendingAiLayoutProposal, onClearAiLayoutProposal: dismissPendingAiLayoutProposal } },
    actions: {
      navigation: { onSignIn: signInWithReturn, onGoFurnish: goFurnish, onGoAiDesign: goAiDesign, onGoShop: goShop,
        onSelectRoom: handleSwitchRoom, onPlacementAddModeChange: setPlacementAddMode, onStyleChange: setStyle, onBudgetChange: setBudget },
      panel: panelActions,
    },
  });
  const panelRegionModel = buildDesignPagePanelRegionAdapter({
    state: { editorMode, shoppingVisible: shoppingPanelVisibleForLayout, controlsVisible: designControlsPanelVisibleForLayout,
      hasSelectedCabinet: Boolean(selectedCabinet), hasSelectedProduct: Boolean(selectedProduct) },
    configuration: { designerTheme: showDesignerTheme, isDesigner, isClientPreview },
    panels: { shopping: shoppingPanelModel, selectedCabinet: selectionPanelModels.selectedCabinet,
      selectedItem: selectionPanelModels.selectedItem, controls: designControlsPanelModel },
    actions: { exitClientPreview: panelActions.exitClientPreview },
  });
  const dialogLayerModel = buildDesignPageDialogLayerAdapter(buildDesignPageDialogLayerModel({
    access: { isClientPreview, isAuthenticated: Boolean(session?.user), isPro: isPro(plan), designerTheme: showDesignerTheme },
    billing: {
      upgrade: { open: showUpgrade, variantLabel: upgradeCtaVariant, contentVariant: upgradeCtaVariant,
        description: upgradeDialogDescription, exportWorkflowBenefit: upgradeDialogExportWorkflowBenefit,
        pricingGuidance: upgradeDialogPricingGuidance, primaryCtaLabel: primaryUpgradeCtaLabel },
      plans: { open: showPlans, layout: pricingLayoutVariant, openingBillingPortal, monthlyLabel: PRO_PLAN_PRICING.monthly.label,
        yearlyLabel: PRO_PLAN_PRICING.yearly.label, yearlyEffectiveMonthlyLabel: PRO_PLAN_PRICING.yearly.effectiveMonthlyLabel },
      startingCheckout, annualSavingsLabel: annualPlanSavingsLabel,
      upgradeActions: { onSeePlans: openPlansFromUpgrade, onSignIn: signInFromUpgrade, onClose: closeUpgradeDialog },
      plansActions: { onClose: closePlansDialog, onManageBilling: manageBillingFromPlans, onStartCheckout: startCheckoutFromPlans },
    },
    persistence: {
      guestSave: { open: Boolean(guestPromptReason), onNotNow: handleGuestPromptNotNow, onSaveAndContinue: handleGuestSaveAndContinue },
      myDesigns: {
        data: { open: showMyDesigns, designs: myDesigns, loading: loadingDesigns, allDesignIds: allSavedDesignIds,
          selectedDesignIds: selectedSavedDesignIds, selectedDesignCount: selectedSavedDesignCount,
          allDesignsSelected: allSavedDesignsSelected, deletingDesignIds, pendingDeleteDesign },
        actions: { onClose: closeMyDesigns, onOpenTemplates: openNewPlanPicker, onToggleAll: toggleAllSavedDesignSelection,
          onToggleSelection: toggleSavedDesignSelection, onLoadDesign: handleLoadDesign, onRequestDelete: requestDeleteSavedDesigns,
          onCancelDelete: cancelDeleteSavedDesigns, onConfirmDelete: handleDeleteSavedDesign },
      },
      templateChoice: {
        data: { open: Boolean(pendingPlanTemplateReplacement), templateLabel: pendingPlanTemplateReplacement?.template.label ?? "this floor plan",
          busy: startingNewPlan, errorMessage: newPlanStartError },
        actions: { onCancel: cancelPendingPlanChoice, onReplaceCurrent: replaceCurrentPlanFromChoice,
          onSaveCurrentAndStartNew: saveCurrentAndStartNewPlan, onSignIn: signInWithReturn },
      },
    },
    ai: { notes: { open: showAINotes, data: aiNotesData, onApplySuggestion: applySuggestion, onClose: closeAiNotes } },
    presentation: { presentExport: presentExportDialog },
    editing: {
      roomRename: { pendingRoomId: pendingRoomRenameId, value: pendingRoomRenameValue,
        onValueChange: setPendingRoomRenameValue, onCancel: cancelRoomRename, onSave: commitRoomRename },
      annotation: { kind: pendingAnnotationKind, text: pendingAnnotationText, onTextChange: setPendingAnnotationText,
        onCancel: cancelPlanAnnotation, onAdd: commitPlanAnnotation },
    },
    placement: {
      identity: { scene: pendingCatalogPlacementScene, roomName: pendingCatalogPlacementRoom?.name ?? null },
      assessment: { hardInvalid: pendingCatalogPlacementHardInvalid, statusLabel: pendingCatalogPlacementStatusLabel,
        targetLabel: activePlacementTargetLabel ?? null, targetValid: activePlacementTargetValid, quality: pendingCatalogPlacementQuality,
        score: pendingCatalogPlacementScore, improvement: pendingCatalogPlacementImprovement,
        bestRoomPlacement: pendingCatalogBestRoomPlacement, bestVariantPlacement: pendingCatalogBestVariantPlacement,
        blocked: pendingCatalogPlacementBlocked, hasRestorablePlacement: Boolean(restorableCatalogPlacement),
        shouldConfirmImprovedPlacement: shouldConfirmImprovedCatalogPlacement,
        shouldConfirmRestoredPlacement: shouldConfirmRestoredCatalogPlacement },
      activeRoomName: activeRoom?.name ?? null,
      actions: { onAutoPlace: autoPlacePendingCatalogPlacement, onMoveToBestRoom: movePendingCatalogPlacementToBestRoom,
        onSwitchToBestOption: switchPendingCatalogPlacementToBestOption, onImprovePlacement: improvePendingCatalogPlacement,
        onRestoreValidPlacement: restoreLastValidCatalogPlacement, onSelectBlocker: selectPendingCatalogPlacementBlocker,
        onSwapWithBlocker: swapPendingCatalogWithBlocker, onMoveBlockerAside: movePendingCatalogBlockerAside,
        onPlaceBesideBlocker: placePendingCatalogBesideBlocker, onTrySmallerVariant: trySmallerPendingCatalogVariant,
        onCenter: centerPendingCatalogPlacement, onNudge: nudgePendingCatalogPlacement, onRotate: rotatePendingCatalogPlacement,
        onCancel: cancelPendingCatalogPlacement, onConfirm: confirmPendingCatalogPlacement },
    },
    feedback: {
      beta: { open: feedbackOpen, context: betaFeedbackContext, onOpenChange: setFeedbackOpen },
      toasts: { ruleMessage: ruleToast, nudgeMessage: nextBestActionNudge, shareCopied: shareSuccessToast, shareErrorMessage: shareErrorToast },
      validation: { constraints: visibleConstraints, confidence: layoutConfidence },
    },
    sharing: { url: shareLinkFallback, onClose: closeShareLinkFallback, onCopy: copyFallbackShareLink, onOpen: openFallbackShareLink },
    cabinetry: {
      state: cabinetryStudioState, access: { enabled: canUseCabinetryStudio, accessLevel: cabinetryAccessLevel },
      configuration: { measurementUnit: planMeasurementUnit, availableSpaces: cabinetryAvailableSpaces,
        preferredSpaceId: cabinetryPreferredSpaceId },
      refs: { openedAt: cabinetryStudioOpenedAtRef },
      actions: { onSave: handleSaveCabinetDefinition, onPlaceInPlan: handlePlaceCabinetInPlan, onDismiss: dismissCabinetryStudio },
    },
    cart: { items: itemCart, isOpen: itemCartOpen, controlsPanelVisible: designControlsPanelVisibleForLayout,
      onRemove: removeFromCart, onUpdateQty: updateCartQty, onClear: clearCart,
      onAddAllToRoom: addAllToRoom, onToggle: panelActions.toggleItemCart },
  }));
  return (
    <DesignPageComposition configuration={{ designerTheme: showDesignerTheme }}>
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
        <DesignPageSceneRegion {...sceneRegionModel} />
        <DesignPageEditorChrome {...editorChromeModel} />
      </div>
      <DesignPagePanelRegion {...panelRegionModel} />
      <DesignPageDialogLayer {...dialogLayerModel} />
    </DesignPageComposition>
  );
}
