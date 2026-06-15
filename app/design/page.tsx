"use client";

import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, MapControls, Environment, Lightformer } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { signIn, useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DesignerGrid } from "@/components/scene/DesignerGrid";
import { LoadingOverlay } from "@/components/scene/LoadingOverlay";
import { RoomSkeleton } from "@/components/scene/RoomSkeleton";
import { SceneProgressBridge } from "@/components/scene/SceneProgressBridge";
import { ZoneOutline as SceneZoneOutline } from "@/components/scene/ZoneOutline";
import CartSidebar from "@/components/CartSidebar";
import ItemCartDrawer from "@/components/ItemCartDrawer";
import { LightingPresetsUI } from "@/components/LightingPresetsUI";
import { LIGHTING_PRESETS, type LightingPreset } from "@/lib/lightingPresets";
import { CATALOG_ITEMS, CATALOG_ITEMS_MAP } from "@/lib/catalog";
import { bulkSwapItems } from "@/lib/bulkSwap";
import { isPro, type Plan } from "@/lib/plan";
import { useEditorMode } from "@/hooks/useEditorMode";
import { useUndoRedoHotkeys } from "@/hooks/useUndoRedoHotkeys";
import { HistoryManager } from "@/lib/historyManager";
import { track } from "@/lib/analytics";
import { getAnonId } from "@/lib/anon";
import { preloadCoreAssets } from "@/lib/preloadAssets";
import { canAddToCart, reconcileCart, getNonBuyableReason } from "@/lib/commerce-helpers";
import { evaluateConstraints, type ConstraintResult } from "@/lib/constraints/evaluate";
import { initializeCatalog } from "@/lib/catalog-init";
import {
  isOnboardingEligible,
  checkActivation,
  getNextBestActionNudge,
  EventDedup,
  type OnboardingState,
} from "@/lib/onboarding";
import { applyAISuggestionAction, type AISuggestionAction } from "@/lib/ai/applySuggestion";
import {
  computeAABB,
} from "@/lib/snapGuides";
import {
  saveGuestDesign,
  loadGuestDesigns,
  markGuestDesignClaimed,
} from "@/lib/guestDesigns";
import { findSwapOptions } from "@/lib/swap";
import type {
  DesignSnapshot as MultiRoomSnapshot,
  DesignItem,
  ZoneMin,
  RoomType,
} from "@/lib/room-types";
import {
  getActiveRoom,
  switchRoom,
  updateRoom,
  migrateToV3,
} from "@/lib/room-types";
import { getAllRoomNames } from "@/lib/room-hooks";
import EditorCommandBar from "@/components/editor/EditorCommandBar";
import DesignControlsPanel from "@/components/editor/DesignControlsPanel";
import EditorViewToggle, { type EditorViewMode } from "@/components/editor/EditorViewToggle";
import EditorCamera2D from "@/components/editor/camera/EditorCamera2D";
import HousePlanRenderer3D from "@/components/editor/renderers/HousePlanRenderer3D";
import PlanUnderlayRenderer2D from "@/components/editor/renderers/PlanUnderlayRenderer2D";
import RoomRenderer2D from "@/components/editor/renderers/RoomRenderer2D";
import PlanOpeningInspector from "@/components/editor/PlanOpeningInspector";
import FloorPlanToolStrip from "@/components/editor/FloorPlanToolStrip";
import RoomPlanStatusBar from "@/components/editor/RoomPlanStatusBar";
import RoomPanNavigator from "@/components/editor/RoomPanNavigator";
import EditorToolRail from "@/components/editor/EditorToolRail";
import ShoppingOverviewPanel from "@/components/editor/ShoppingOverviewPanel";
import SelectedItemDetailsPanel from "@/components/editor/SelectedItemDetailsPanel";
import SelectedItemRotationControls from "@/components/editor/SelectedItemRotationControls";
import { CanvasErrorBoundary } from "@/components/CanvasErrorBoundary";
import { metersToMm, radiansToDeg, type EditorAnnotation2D, type FixedElement2D, type RoomOpening2D } from "@/lib/editorScene";
import { applyFloorPlanScaleCalibration } from "@/lib/floor-plan-calibration";
import {
  resolveArcWallDrawPreview,
  resolveTracedOpening,
  resolveClosedWallDrawRoom,
  resolveTracedRoomRectangle,
  isClosingWallDrawPoint,
  snapFloorPlanPointForRoomDraw,
  snapFloorPlanPointForWallDraw,
  snapFloorPlanPointToGrid,
  type ResolvedWallDrawRoom,
  type TracedRoomRectangle,
} from "@/lib/floor-plan-tracing";
import type {
  FloorPlanDrawRoomMode,
  FloorPlanPoint,
  FloorPlanUnderlay,
} from "@/lib/floor-plan-types";
import {
  legacyApiToSnapshot,
  snapshotToLegacyApi,
  snapshotToStored,
  storedToSnapshot,
  type StoredDesign,
} from "@/lib/room-persistence";
import {
  clampRoomDimension,
  ROOM_DIMENSION_DEFAULTS,
  ROOM_SIZE_PRESETS,
  buildHouseRoomConnectionChecklist,
  doesHouseRoomOverlap,
  getRoomTypeLabel,
  resolvePlanFitZoom,
  roundPlanCoordinate,
  type HouseRoomDoorwaySuggestion,
  type RoomSizePresetId,
} from "@/lib/design-page-house-plan";
import { useDesignPageHousePlanState } from "@/lib/useDesignPageHousePlanState";
import {
  useDesignPagePanelMode,
  type DesignPageEditorMode,
} from "@/lib/useDesignPagePanelMode";
import {
  buildImportedModelOptions,
  normalizeImportedFamilyName,
  shouldRefreshImportedCatalogItem,
  type ImportedModelEntry,
  type ImportedModelOption,
  upsertImportedCatalogItem,
} from "@/lib/catalog/imported-model-assembly";
import {
} from "@/lib/catalog/variant-normalization";
import { mapToTopCategory } from "@/lib/catalog/view-builders";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import {
  formatTimeAgo,
  getDimensions,
  getItemPrice,
  getRotatedFootprint,
  normalizeRotationDegrees,
  snapRotationRadians,
} from "@/lib/design-page-utils";
import { buildProductInfoSections } from "@/lib/design-page-product-info";
import {
  JARON_CONFIGURATION_GROUPS,
  JARON_CONFIGURATION_PRODUCT_IDS,
  MODEL_FAMILY_BY_PRODUCT_ID,
  MODEL_SELECTOR_PRODUCT_IDS_BY_PRODUCT_ID,
  ARM_STYLE_OPTIONS_BY_PRODUCT_ID,
  LENGTH_OPTIONS_BY_PRODUCT_ID,
  ORIENTATION_OPTIONS_BY_PRODUCT_ID,
  type JaronConfigurationArmKey,
  type JaronConfigurationDiagramKey,
} from "@/lib/design-page-model-maps";
import {
  IMPORTED_VARIANT_BY_PRODUCT_ID,
  IMPORTED_VARIANTS_BY_PRODUCT_ID,
  IMPORTED_PRODUCT_CONFIG_BY_ID,
  getSloaneBenchProductId,
  CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE,
  HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE,
  PRODUCT_DETAIL_SECTIONS_BY_PRODUCT_ID,
  resolveFabricDetailProfile,
} from "@/lib/design-page-product-data";
import {
  STYLES,
  type Style,
  type CameraView,
  type NamedCameraView,
  type LayoutPlan,
  type AINotesResponse,
  type PlanLayerPresetId,
  PLAN_LAYER_PRESETS,
  type PlanMeasurementUnit,
} from "@/lib/design-page-types";
import {
  buildPendingAiLayoutProposal,
  collectAiLayoutValidationSummary,
  type PendingAiLayoutProposal,
} from "@/lib/design-page-ai-layout-proposal";
import { catalogMatchesAiLayoutRole } from "@/lib/ai/layout-planner";
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
import {
  buildAlignedSelectionItems as _buildAlignedSelectionItems,
  buildAutoLayoutZoneItems as _buildAutoLayoutZoneItems,
  buildAutoZones as _buildAutoZones,
  buildRotatedZoneItems as _buildRotatedZoneItems,
  buildPlanZones2D as _buildPlanZones2D,
  getZoneBounds as _getZoneBounds,
  getZoneLabel as _getZoneLabel,
  normalizeItemsToRoom as _normalizeItemsToRoom,
  normalizeZones as _normalizeZones,
  zonesEqual as _zonesEqual,
} from "@/lib/design-page-zone-layout";
import { buildAutoSeatingZone, buildManualZoneFromSelection } from "@/lib/design-page-zone-orchestration";
import { useDesignPageConfigState } from "@/lib/design-page-config-state";
import {
  aabbIntersects,
  footprintRadius,
  separateIfOverlapping,
} from "@/lib/design-page-geometry";
import { pickBestRugForSofa } from "@/lib/design-page-rug-sizing";
import { useDesignPageProductSelectorState } from "@/lib/useDesignPageProductSelectorState";
import { buildEditorScene2D, createPlanAnnotation } from "@/lib/design-page-plan-scene";
import {
  mapPlanAnnotationsToRoomRenderer,
  mapPlanFixedElementsToRoomRenderer,
  mapPlanOpeningsToRoomRenderer,
  getPlanOpeningWallSpanMeters,
  movePlanAnnotation,
  movePlanFixedElement,
  movePlanOpening,
  updatePlanOpeningMetrics,
} from "@/lib/design-page-plan-overlays";

import { Room } from "@/components/scene/RoomEnvironment";
import { Furniture, CameraCapture } from "@/components/scene/FurnitureItem";

const STORAGE_KEY = "interior-ai:v1:livingroom-design";
const DEFAULT_EDITOR_CAMERA_VIEW: CameraView = {
  pos: [6.2, 3.6, 7.2],
  target: [0, 1.0, 0],
  fov: 45,
};

const SUPPORTED_FLOOR_PLAN_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);
const PDF_UNDERLAY_MAX_RENDERED_DIMENSION_PX = 1800;
const PDF_UNDERLAY_MAX_RENDER_SCALE = 2;

function resolveFloorPlanUploadMimeType(file: File): string {
  if (file.type) return file.type;

  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".pdf")) return "application/pdf";
  return "";
}

function loadImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => reject(new Error("Unable to read image dimensions"));
    image.src = src;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unable to read floor plan file"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read floor plan file"));
    reader.readAsDataURL(file);
  });
}

function isPersistableFloorPlanAssetUrl(assetUrl: string): boolean {
  return (
    assetUrl.startsWith("data:") ||
    assetUrl.startsWith("/") ||
    assetUrl.startsWith("http://") ||
    assetUrl.startsWith("https://")
  );
}

async function renderPdfPageToImageDataUrl(pdfData: ArrayBuffer, pageNumber: number): Promise<{
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  pageCount: number;
}> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url
  ).toString();

  const data = new Uint8Array(pdfData.slice(0));
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  try {
    const targetPage = Math.min(Math.max(1, pageNumber), pdf.numPages);
    const page = await pdf.getPage(targetPage);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(
      PDF_UNDERLAY_MAX_RENDER_SCALE,
      PDF_UNDERLAY_MAX_RENDERED_DIMENSION_PX / baseViewport.width,
      PDF_UNDERLAY_MAX_RENDERED_DIMENSION_PX / baseViewport.height
    );
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas is unavailable");
    }

    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvas,
      viewport,
    }).promise;

    return {
      dataUrl: canvas.toDataURL("image/png"),
      widthPx: canvas.width,
      heightPx: canvas.height,
      pageCount: pdf.numPages,
    };
  } finally {
    await loadingTask.destroy();
  }
}

function resolveUnderlayWorldSize(params: {
  widthPx?: number;
  heightPx?: number;
  planWidthMeters: number;
  planDepthMeters: number;
}): { widthMeters: number; depthMeters: number } {
  const availableWidth = Math.max(params.planWidthMeters, 3);
  const availableDepth = Math.max(params.planDepthMeters, 3);

  if (!params.widthPx || !params.heightPx || params.widthPx <= 0 || params.heightPx <= 0) {
    return { widthMeters: availableWidth, depthMeters: availableDepth };
  }

  const aspect = params.widthPx / params.heightPx;
  let widthMeters = availableWidth;
  let depthMeters = widthMeters / aspect;

  if (depthMeters > availableDepth) {
    depthMeters = availableDepth;
    widthMeters = depthMeters * aspect;
  }

  return {
    widthMeters: Number(widthMeters.toFixed(3)),
    depthMeters: Number(depthMeters.toFixed(3)),
  };
}

function JaronConfigurationDiagram({
  diagram,
  active,
}: {
  diagram: JaronConfigurationDiagramKey;
  active: boolean;
}) {
  const iconClass = `h-14 w-20 shrink-0 ${active ? "text-white" : "text-[#5a1327]"}`;
  const lineProps = {
    stroke: "currentColor",
    strokeWidth: 2,
    vectorEffect: "non-scaling-stroke" as const,
  };

  if (diagram === "chaise-sectional") {
    return (
      <svg
        aria-hidden="true"
        className={iconClass}
        viewBox="0 0 96 64"
        fill="none"
      >
        <path d="M16 16h60v28H16z" {...lineProps} />
        <path d="M16 16h9v40h-9zM67 16h9v28h-9z" {...lineProps} />
        <path d="M25 30h42M46 16v28M16 44h9" {...lineProps} />
      </svg>
    );
  }

  if (diagram === "l-shaped-sectional") {
    return (
      <svg
        aria-hidden="true"
        className={iconClass}
        viewBox="0 0 96 64"
        fill="none"
      >
        <path d="M16 14h62v24H16z" {...lineProps} />
        <path d="M16 14h24v42H16z" {...lineProps} />
        <path d="M25 14v42M40 26h38M55 14v24M16 38h24" {...lineProps} />
      </svg>
    );
  }

  const dividers = diagram === "standard-extended-3-seater" ? [35, 50, 65] : [48];

  return (
    <svg
      aria-hidden="true"
      className={iconClass}
      viewBox="0 0 96 64"
      fill="none"
    >
      <path d="M16 18h64v28H16z" {...lineProps} />
      <path d="M16 18h9v28h-9zM71 18h9v28h-9z" {...lineProps} />
      <path d="M25 31h46" {...lineProps} />
      {dividers.map((x) => (
        <path key={x} d={`M${x} 18v28`} {...lineProps} />
      ))}
    </svg>
  );
}

function PageContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlMode = searchParams.get("mode");
  const stripeSessionId = searchParams.get("session_id");
  const paywallVariantOverride = searchParams.get("paywall_variant");
  const paywallOpenParam = searchParams.get("paywall_open");
  const plansOpenParam = searchParams.get("plans_open");
  const [sofaDragging, setSofaDragging] = useState(false);
  const [designId, setDesignId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [, setShareOrigin] = useState("");
  const [style, setStyle] = useState<Style>("Modern");
  const [budget, setBudget] = useState<"$" | "$$" | "$$$">("$$");
  const [mode, setMode] = useState<"homeowner" | "designer">(
    urlMode === "designer" ? "designer" : "homeowner"
  );
  const [notes, setNotes] = useState("");
  const [aiSeed, setAiSeed] = useState<number>(Date.now());
  const [plan, setPlan] = useState<Plan>("free");
  const [, setRefreshingPlan] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<"designer" | "export_images" | "export_pdf" | null>(null);
  const [upgradeCtaVariant, setUpgradeCtaVariant] = useState<UpgradeCtaVariant>("unlock_pro_exports");
  const [pricingLayoutVariant, setPricingLayoutVariant] = useState<PricingLayoutVariant>("default");
  const [showAINotes, setShowAINotes] = useState(false);
  const [aiNotesLoading, setAiNotesLoading] = useState(false);
  const [aiNotesData, setAiNotesData] = useState<AINotesResponse | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridPulse, setGridPulse] = useState(false);
  const [clientPreview, setClientPreview] = useState(false);
  const [itemCartOpen, setItemCartOpen] = useState(false);
  const [itemCart, setItemCart] = useState<Array<{ id: string; productId: string; title: string; qty: number; thumbUrl?: string }>>([]);
  const [selectedImportedFamilyKey, setSelectedImportedFamilyKey] = useState<string>("");
  const [selectedImportedProductId, setSelectedImportedProductId] = useState<string>("");
  const [importedModelOptions, setImportedModelOptions] = useState<ImportedModelOption[]>([]);
  const [importedModelUrlByAssetId, setImportedModelUrlByAssetId] = useState<Record<string, string>>({});
  
  // Onboarding state model (new system)
  const [onboardingState, setOnboardingState] = useState<OnboardingState>({
    enabled: false,
    step: "idle",
    startedAtMs: Date.now(),
    lastInteractionAtMs: Date.now(),
    dismissedHints: {},
  });
  
  // Onboarding timings and UI state
  const [_sofaNudgeVisible, setSofaNudgeVisible] = useState(false);
  const [_sofaReinforceMessage, setSofaReinforceMessage] = useState<string | null>(null);
  const [nextBestActionNudge, setNextBestActionNudge] = useState<string | null>(null);
  const [_ghostSuggestions, setGhostSuggestions] = useState<
    Array<{
      id: string;
      productId: string;
      position: [number, number, number];
      rotationY?: number;
    }>
  >([]);
  const [_showGhostHint, setShowGhostHint] = useState(false);
  const [lastLocalAutosaveAt, setLastLocalAutosaveAt] = useState<number | null>(
    null
  );
  const [lastDbSaveAt, setLastDbSaveAt] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [snapToast, setSnapToast] = useState(false);
  const [ruleToast, setRuleToast] = useState<string | null>(null);
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>("studio");
  const [viewMode, setViewMode] = useState<EditorViewMode>("3d");
  const [designPanelOpen, setDesignPanelOpen] = useState(true);
  const [planTheme, setPlanTheme] = useState<"consumer" | "pro">("consumer");
  const [planLayers, setPlanLayers] = useState({
    grid: true,
    dimensions: true,
    labels: true,
    openings: true,
    builtIns: true,
    zones: true,
    annotations: true,
  });
  const [planAnnotations, setPlanAnnotations] = useState<EditorAnnotation2D[]>([]);
  const [planOpenings, setPlanOpenings] = useState<RoomOpening2D[]>([]);
  const [planFixedElements, setPlanFixedElements] = useState<FixedElement2D[]>([]);
  const [floorPlanUnderlay, setFloorPlanUnderlay] = useState<FloorPlanUnderlay | null>(null);
  const [floorPlanCalibrationMode, setFloorPlanCalibrationMode] = useState(false);
  const [floorPlanCalibrationPoints, setFloorPlanCalibrationPoints] = useState<FloorPlanPoint[]>([]);
  const [floorPlanCalibrationDistanceInput, setFloorPlanCalibrationDistanceInput] = useState("");
  const [floorPlanTraceRoomMode, setFloorPlanTraceRoomMode] = useState(false);
  const [floorPlanDrawRoomMode, setFloorPlanDrawRoomMode] =
    useState<FloorPlanDrawRoomMode>("straight_wall");
  const [floorPlanTraceRoomPoints, setFloorPlanTraceRoomPoints] = useState<FloorPlanPoint[]>([]);
  const [blankGridRoomPreviewPoint, setBlankGridRoomPreviewPoint] = useState<FloorPlanPoint | null>(null);
  const [floorPlanTraceRoomType, setFloorPlanTraceRoomType] = useState<RoomType>("living");
  const [floorPlanTraceOpeningMode, setFloorPlanTraceOpeningMode] = useState(false);
  const [floorPlanTraceOpeningPoints, setFloorPlanTraceOpeningPoints] = useState<FloorPlanPoint[]>([]);
  const [floorPlanTraceOpeningKind, setFloorPlanTraceOpeningKind] =
    useState<RoomOpening2D["kind"]>("door");
  const [floorPlanPdfSourceReady, setFloorPlanPdfSourceReady] = useState(false);
  const [floorPlanPdfRenderingPage, setFloorPlanPdfRenderingPage] = useState<number | null>(null);
  const [selectedPlanOverlayId, setSelectedPlanOverlayId] = useState<string | null>(null);
  const [annotationToolKind, setAnnotationToolKind] = useState<"note" | "callout" | "room_tag">("note");
  const [simplePlanControls, setSimplePlanControls] = useState(true);
  const [planLayerPreset, setPlanLayerPreset] = useState<PlanLayerPresetId>("technical");
  const [planMeasurementUnit, setPlanMeasurementUnit] = useState<PlanMeasurementUnit>("mm");
  const [exportStylePreset, setExportStylePreset] = useState<"consumer" | "pro">("consumer");
  const [planSettingsLoaded, setPlanSettingsLoaded] = useState(false);
  const [cameraView, setCameraView] = useState<CameraView>({
    pos: [...DEFAULT_EDITOR_CAMERA_VIEW.pos],
    target: [...DEFAULT_EDITOR_CAMERA_VIEW.target],
    fov: DEFAULT_EDITOR_CAMERA_VIEW.fov,
  });
  const [savedViews, setSavedViews] = useState<NamedCameraView[]>([]);
  const [hoveredCartInstanceId, setHoveredCartInstanceId] = useState<string | null>(null);
  const [showPresentModal, setShowPresentModal] = useState(false);
  const [presentModeRoomId, setPresentModeRoomId] = useState<string | null>(null);
  const [sharingDesign, setSharingDesign] = useState(false);
  const [shareSuccessToast, setShareSuccessToast] = useState(false);
  const [shareErrorToast, setShareErrorToast] = useState<string | null>(null);
  const [shareLinkFallback, setShareLinkFallback] = useState<string | null>(null);
  const [showMyDesigns, setShowMyDesigns] = useState(false);
  const [myDesigns, setMyDesigns] = useState<Array<{ id: string; title: string; createdAt: string }>>([]);
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const aiDesignEnabled = false;
  
  // Editor Modes
  const [editorMode, setEditorMode] = useState<DesignPageEditorMode>("design");
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
  const wantsDesigner = urlMode === "designer";
  const canUseDesigner = plan === "pro";
  const { isDesigner, isClientPreview } = useEditorMode(plan, clientPreview);
  const showDesignerTheme = isDesigner && !isClientPreview;
  const gridPulseTimerRef = useRef<number | null>(null);
  const firstInteractionRef = useRef(false);
  const firstSaveRef = useRef(false);
  const upgradeShownRef = useRef(false);
  const designerAttemptRef = useRef(false);
  const editorOpenedRef = useRef(false);
  const landingTrackedRef = useRef(false);
  const designStartedTrackedRef = useRef(false);
  const firstItemFunnelTrackedRef = useRef(false);
  const thirdItemTrackedRef = useRef(false);
  const guestPromptActionRef = useRef<null | (() => void)>(null);
  const [guestPromptReason, setGuestPromptReason] = useState<string | null>(null);
  const dragCommitRef = useRef(false);
  const snapToastTimerRef = useRef<number | null>(null);
  const ruleToastTimerRef = useRef<number | null>(null);
  const onboardingStartedAtRef = useRef<number | null>(null);
  const firstItemTrackedRef = useRef(false);
  const seatingZoneAutoDisabledRef = useRef(false);
  const _sofaNudgeTimerRef = useRef<number | null>(null);
  const ghostTimerRef = useRef<number | null>(null);
  const firstSofaHandledRef = useRef(false);
  const nudgeShownCountRef = useRef(0);
  const lastActionTimeRef = useRef<number>(Date.now());
  const stallDetectionTimerRef = useRef<number | null>(null);
  const eventDedupRef = useRef(EventDedup.createSession());
  const floorPlanUnderlayUrlRef = useRef<string | null>(null);
  const floorPlanPdfSourceDataRef = useRef<ArrayBuffer | null>(null);
  
  // Smart Constraints + Visual Feedback state
  const [constraintResults, setConstraintResults] = useState<ConstraintResult[]>([]);
  const [layoutConfidence, setLayoutConfidence] = useState<string | null>(null);
  const constraintTimerRef = useRef<number | null>(null);
  const confidenceTimerRef = useRef<number | null>(null);

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
      const stored = localStorage.getItem("onboarded");
      if (stored === "1") {
        setOnboardingState((prev) => ({
          ...prev,
          enabled: false,
          step: "completed",
        }));
      }
      const seatingDisabled = localStorage.getItem("seating_zone_auto_disabled");
      seatingZoneAutoDisabledRef.current = seatingDisabled === "1";
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedTheme = localStorage.getItem("plan_theme");
      if (storedTheme === "consumer" || storedTheme === "pro") {
        setPlanTheme(storedTheme);
      }

      const storedLayerPreset = localStorage.getItem("plan_layer_preset");
      if (storedLayerPreset === "presentation" || storedLayerPreset === "technical" || storedLayerPreset === "staging") {
        setPlanLayerPreset(storedLayerPreset);
      }

      const storedExportPreset = localStorage.getItem("plan_export_preset");
      if (storedExportPreset === "consumer" || storedExportPreset === "pro") {
        setExportStylePreset(storedExportPreset);
      }
      const storedMeasurementUnit = localStorage.getItem("plan_measurement_unit");
      if (storedMeasurementUnit === "mm" || storedMeasurementUnit === "cm" || storedMeasurementUnit === "in") {
        setPlanMeasurementUnit(storedMeasurementUnit);
      }

      const storedLayers = localStorage.getItem("plan_layers");
      if (storedLayers) {
        const parsed = JSON.parse(storedLayers) as Partial<typeof planLayers>;
        setPlanLayers((prev) => ({ ...prev, ...parsed }));
      }

      const storedAnnotations = localStorage.getItem("plan_annotations");
      if (storedAnnotations) {
        const parsed = JSON.parse(storedAnnotations) as Array<Partial<EditorAnnotation2D> & { id?: string; xMm?: number; zMm?: number; text?: string }>;
        if (Array.isArray(parsed)) {
          const normalized: EditorAnnotation2D[] = [];
          for (let i = 0; i < parsed.length; i += 1) {
            const entry = parsed[i];
            if (typeof entry.id !== "string" || typeof entry.xMm !== "number" || typeof entry.zMm !== "number") {
              continue;
            }
            const kind: EditorAnnotation2D["kind"] =
              entry.kind === "callout" || entry.kind === "room_tag" ? entry.kind : "note";
            normalized.push({
              id: entry.id || `note-${i}`,
              xMm: Number(entry.xMm),
              zMm: Number(entry.zMm),
              text: String(entry.text ?? "Note"),
              kind,
              anchorXMm: typeof entry.anchorXMm === "number" ? entry.anchorXMm : undefined,
              anchorZMm: typeof entry.anchorZMm === "number" ? entry.anchorZMm : undefined,
            });
          }
          setPlanAnnotations(normalized);
        }
      }

      const storedOpenings = localStorage.getItem("plan_openings");
      if (storedOpenings) {
        const parsed = JSON.parse(storedOpenings) as RoomOpening2D[];
        if (Array.isArray(parsed)) {
          setPlanOpenings(parsed);
        }
      }

      const storedFixed = localStorage.getItem("plan_fixed_elements");
      if (storedFixed) {
        const parsed = JSON.parse(storedFixed) as FixedElement2D[];
        if (Array.isArray(parsed)) {
          setPlanFixedElements(parsed);
        }
      }
    } catch {
      // ignore malformed storage payloads
    } finally {
      setPlanSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!planSettingsLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("plan_theme", planTheme);
    } catch {
      // ignore storage errors
    }
  }, [planSettingsLoaded, planTheme]);

  useEffect(() => {
    if (!planSettingsLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("plan_layers", JSON.stringify(planLayers));
    } catch {
      // ignore storage errors
    }
  }, [planLayers, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("plan_layer_preset", planLayerPreset);
    } catch {
      // ignore storage errors
    }
  }, [planLayerPreset, planSettingsLoaded]);
  useEffect(() => {
    if (!planSettingsLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("plan_measurement_unit", planMeasurementUnit);
    } catch {
      // ignore storage errors
    }
  }, [planMeasurementUnit, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("plan_export_preset", exportStylePreset);
    } catch {
      // ignore storage errors
    }
  }, [exportStylePreset, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("plan_annotations", JSON.stringify(planAnnotations));
    } catch {
      // ignore storage errors
    }
  }, [planAnnotations, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("plan_openings", JSON.stringify(planOpenings));
    } catch {
      // ignore storage errors
    }
  }, [planOpenings, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("plan_fixed_elements", JSON.stringify(planFixedElements));
    } catch {
      // ignore storage errors
    }
  }, [planFixedElements, planSettingsLoaded]);

  useEffect(() => {
    preloadCoreAssets();
  }, []);

  // Check onboarding eligibility and enable if needed
  useEffect(() => {
    const eligible = isOnboardingEligible({
      isNewUser: !onboardingState.enabled && onboardingState.step === "idle",
      isPro: plan === "pro",
      isShared: !!shareToken,
      isClientPreview,
      mode: editorMode === "ai" ? "design" : editorMode,
    });

    if (eligible && !onboardingState.enabled) {
      const now = Date.now();
      setOnboardingState({
        enabled: true,
        step: "prompt_add_sofa",
        startedAtMs: now,
        lastInteractionAtMs: now,
        dismissedHints: {},
      });
      setSofaNudgeVisible(true);
      onboardingStartedAtRef.current = now;
      track("onboarding_started", {
        design_id: designId,
        plan,
        isGuest: !session?.user,
      });
    }
  }, [plan, shareToken, isClientPreview, editorMode, session?.user, designId, onboardingState.enabled, onboardingState.step]);

  // Auto-open present modal when entering present mode
  useEffect(() => {
    if (editorMode === "present") {
      setShowPresentModal(true);
      // Reset present mode room (will default to activeRoomId in render)
      setPresentModeRoomId(null);
    } else if (editorMode === "buy") {
      // Clear selection when entering BUY mode
      setSelectedIds(new Set());
      setPrimaryId(null);
      setSelectedZoneId(null);
    }
  }, [editorMode]);

  const showSnapToastOnce = useCallback(() => {
    if (isClientPreview) return;
    try {
      if (sessionStorage.getItem("snap_toast_shown")) return;
      sessionStorage.setItem("snap_toast_shown", "1");
    } catch {
      // ignore storage errors
    }
    setSnapToast(true);
    if (snapToastTimerRef.current) {
      window.clearTimeout(snapToastTimerRef.current);
    }
    snapToastTimerRef.current = window.setTimeout(() => {
      setSnapToast(false);
      snapToastTimerRef.current = null;
    }, 1200);
  }, [isClientPreview]);

  const showRuleToast = useCallback(
    (message: string) => {
      if (isClientPreview) return;
      setRuleToast(message);
      if (ruleToastTimerRef.current) {
        window.clearTimeout(ruleToastTimerRef.current);
      }
      ruleToastTimerRef.current = window.setTimeout(() => {
        setRuleToast(null);
        ruleToastTimerRef.current = null;
      }, 1500);
    },
    [isClientPreview]
  );

  // Show constraint results (auto-dismiss after 1.8 seconds)
  const showConstraintsForMoment = useCallback(
    (results: ConstraintResult[]) => {
      if (isClientPreview || editorMode !== "design") return;
      setConstraintResults(results);

      if (constraintTimerRef.current) {
        window.clearTimeout(constraintTimerRef.current);
      }

      constraintTimerRef.current = window.setTimeout(() => {
        setConstraintResults([]);
        constraintTimerRef.current = null;
      }, 1800);
    },
    [isClientPreview, editorMode]
  );

  const showConfidenceSummary = useCallback(
    (results: ConstraintResult[]) => {
      if (isClientPreview || editorMode !== "design") return;
      const issueCount = results.filter((item) => item.level !== "ok").length;
      const message =
        issueCount === 0
          ? "Layout looks good"
          : issueCount === 1
          ? "1 spacing issue detected"
          : `${issueCount} spacing issues detected`;

      if (confidenceTimerRef.current) {
        window.clearTimeout(confidenceTimerRef.current);
      }

      confidenceTimerRef.current = window.setTimeout(() => {
        setLayoutConfidence(message);
        window.setTimeout(() => {
          setLayoutConfidence(null);
        }, 1500);
      }, 700);
    },
    [isClientPreview, editorMode]
  );

  const pickTopConstraints = (items: ConstraintResult[]) => {
    const errors = items.filter((item) => item.level === "error");
    if (errors.length) return [errors[0]];
    const warns = items.filter((item) => item.level === "warn");
    if (warns.length) return warns.slice(0, 2);
    const oks = items.filter((item) => item.level === "ok");
    return oks.slice(0, 1);
  };


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

  const openGuestPrompt = (reason: string, onContinue: () => void) => {
    guestPromptActionRef.current = onContinue;
    setGuestPromptReason(reason);
  };

  const signInWithReturn = () => {
    const callbackUrl =
      typeof window !== "undefined" ? window.location.href : "/design";
    signIn("google", { callbackUrl });
  };

  const claimGuestDesign = async () => {
    if (session?.user) return;
    const anonId = getAnonId();
    const existing = loadGuestDesigns().find((d) => d.localId === "current");
    if (existing?.dbDesignId) return;

    const payload = {
      anonymousId: anonId,
      roomType: "living_room",
      itemsCount: items.length,
      designSnapshot: {
        title: "Guest Design",
        roomWidth,
        roomDepth,
        items,
        zones,
        snapshot: getStoredDesignForPersistence(),
        style,
        budget,
        mode,
        notes,
      },
    };

    const res = await fetch("/api/designs/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.designId) {
      markGuestDesignClaimed("current", data.designId);
    }
  };

  const saveDesignToCloud = async () => {
    try {
      // NEW: Convert to legacy API format for backward compatibility
      const legacyData = snapshotToLegacyApi(buildDesignSnapshotForPersistence());
      
      const payload = {
        title: "My Living Room",
        ...legacyData,
        savedViews,
        style,
        budget,
        mode,
        notes,
      };

      const res = await fetch("/api/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errorMessage = "Unknown error";
        try {
          const textResponse = await res.text();
          if (textResponse) {
            try {
              const errorData = JSON.parse(textResponse);
              errorMessage = errorData?.error || "Unknown error";
            } catch {
              errorMessage = `Server error (${res.status}): ${textResponse}`;
            }
          } else {
            errorMessage = `Server error (${res.status}): No response body`;
          }
        } catch {
          errorMessage = `Server error (${res.status}): Unable to read response`;
        }
        if (res.status === 403) {
          setShowUpgrade(true);
          track("upgrade_prompt_shown", { reason: "max_designs" });
        }
        alert(`Save failed: ${errorMessage}`);
        return null;
      }

      const data = await res.json();
      if (data?.id) {
        setDesignId(data.id);
        setLastDbSaveAt(Date.now());
        fetchShareStatus(data.id);
        if (isDesigner) {
          void enableShare(data.id);
        }
        if (!firstSaveRef.current) {
          track("design_saved_db", {
            design_id: data.id,
            items_count: items.length,
            room_type: "living_room",
            mode,
            is_guest: !session?.user,
          });
          firstSaveRef.current = true;
        }
        return data.id as string;
      }

      alert("Save failed: No ID returned from server.");
      return null;
    } catch (err) {
      alert(
        `Error saving to cloud: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  };

  const fetchMyDesigns = async () => {
    if (!session?.user) return;
    setLoadingDesigns(true);
    try {
      const res = await fetch("/api/designs");
      if (!res.ok) {
        console.error("Failed to fetch designs:", res.status);
        return;
      }
      const data = await res.json();
      setMyDesigns(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching designs:", err);
    } finally {
      setLoadingDesigns(false);
    }
  };

  const handleLoadDesign = async (id: string) => {
    await loadDesign(id);
    setShowMyDesigns(false);
  };

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

  type PlacedItem = DesignItem;

  const [pendingAiLayoutProposal, setPendingAiLayoutProposal] =
    useState<PendingAiLayoutProposal | null>(null);

  type Zone = ZoneMin;

  type DesignSnapshot = MultiRoomSnapshot;

  const fetchShareStatus = async (id?: string) => {
    const targetId = id ?? designId;
    if (!targetId) return;

    try {
      const res = await fetch(`/api/designs/${targetId}`);
      if (!res.ok) return;
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : null;
      setShareToken(data?.shareToken ?? null);
      setShareEnabled(Boolean(data?.shareEnabled));
    } catch {
      // ignore share status errors
    }
  };

  const enableShare = async (id: string) => {
    try {
      const res = await fetch(`/api/designs/${id}/share`, { method: "POST" });
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : null;
      if (res.ok) {
        setShareToken(data?.shareToken ?? null);
        setShareEnabled(true);
        if (data?.shareToken) {
          track("share_link_created", {
            design_id: id,
            share_token: data.shareToken,
          });
        }
      }
    } catch (err) {
      console.error("Share enable error:", err);
    }
  };

  const createShareLinkAndCopy = async () => {
    if (!designId) return;
    setSharingDesign(true);
    try {
      const res = await fetch(`/api/designs/${designId}/share`, { method: "POST" });
      const raw = await res.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch (parseErr) {
        console.error("Failed to parse share response:", parseErr, raw);
        setShareErrorToast("Failed to create share link (invalid response)");
        setTimeout(() => setShareErrorToast(null), 3000);
        return;
      }
      
      if (!res.ok) {
        const errorMsg = data?.error || `Server error (${res.status})`;
        console.error("Share creation failed:", errorMsg);
        setShareErrorToast(`Failed to create share link: ${errorMsg}`);
        setTimeout(() => setShareErrorToast(null), 3000);
        return;
      }
      
      if (!data?.shareToken) {
        console.error("No share token in response:", data);
        setShareErrorToast("Failed to create share link (no token)");
        setTimeout(() => setShareErrorToast(null), 3000);
        return;
      }
      
      setShareToken(data.shareToken);
      setShareEnabled(true);
      const shareUrl = `${window.location.origin}/share/${data.shareToken}`;
      
      // Try to copy to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareSuccessToast(true);
        setTimeout(() => setShareSuccessToast(false), 3000);
        track("share_link_copied", {
          design_id: designId,
          share_token: data.shareToken,
        });
      } catch (clipboardErr) {
        // Clipboard failed - show fallback modal
        console.warn("Clipboard access denied, showing fallback modal:", clipboardErr);
        setShareLinkFallback(shareUrl);
        track("share_link_created_fallback", {
          design_id: designId,
          share_token: data.shareToken,
          error: clipboardErr instanceof Error ? clipboardErr.name : String(clipboardErr),
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Share error:", err);
      setShareErrorToast(`Failed to create share link: ${errorMsg}`);
      setTimeout(() => setShareErrorToast(null), 3000);
    } finally {
      setSharingDesign(false);
    }
  };



  const loadDesign = async (id: string) => {
    try {
      const res = await fetch(`/api/designs/${id}`);
      if (!res.ok) {
        alert("Design not found");
        return;
      }

      const data = await res.json();
      
      // NEW: Use migration helper to support legacy format
      // This automatically converts single-room designs to multi-room
      const snapshot = legacyApiToSnapshot(data);
      setDesignSnapshot(snapshot);
      hydratePersistedFloorPlanState(snapshot, true);
      history.clear();
      setDesignId(data.id);
      const nextMode = data?.mode === "designer" ? "designer" : "homeowner";
      setMode(nextMode);
      setNotes(typeof data?.notes === "string" ? data.notes : "");
      const nextSavedViews = Array.isArray(data?.savedViews)
        ? (data.savedViews as NamedCameraView[])
            .filter(
              (entry) =>
                entry &&
                typeof entry.name === "string" &&
                Array.isArray(entry.view?.pos) &&
                entry.view.pos.length === 3 &&
                Array.isArray(entry.view?.target) &&
                entry.view.target.length === 3
            )
            .slice(0, 6)
        : [];
      setSavedViews(nextSavedViews);
      if (typeof data?.style === "string" && STYLES.includes(data.style)) {
        setStyle(data.style);
      }
      if (typeof data?.budget === "string" && ["$", "$$", "$$$"] .includes(data.budget)) {
        setBudget(data.budget);
      }
      fetchShareStatus(data.id);
      if (nextMode === "designer" && !data?.shareEnabled) {
        void enableShare(data.id);
      }
      alert(`Loaded design: ${data.title}`);
    } catch (err) {
      console.error("Load error:", err);
      alert("Failed to load design");
    }
  };

  // State for design snapshot with ref for synchronous access
  // NEW: Initialize with v3 multi-room format using migrateToV3
  const defaultSnapshot: DesignSnapshot = migrateToV3({
    items: [],
    zones: [],
    roomBounds: {
      width: ROOM_DIMENSION_DEFAULTS.width,
      depth: ROOM_DIMENSION_DEFAULTS.depth,
      wallThickness: ROOM_DIMENSION_DEFAULTS.wallThickness,
      height: ROOM_DIMENSION_DEFAULTS.roomHeight,
    },
  } as unknown as DesignSnapshot);

  const [designSnapshot, setDesignSnapshot] = useState<DesignSnapshot>(
    defaultSnapshot
  );
  const designSnapshotRef = useRef(designSnapshot);
  const [liveCatalogReady, setLiveCatalogReady] = useState(false);

  useEffect(() => {
    designSnapshotRef.current = designSnapshot;
  }, [designSnapshot]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/catalog/live", { cache: "no-store" });
        const payload = (await res.json().catch(() => ({ ids: [], itemIds: [], assetIds: [] }))) as {
          ids?: string[];
          itemIds?: string[];
          assetIds?: string[];
        };
        const allowedItemIds = new Set(
          Array.isArray(payload.itemIds)
            ? payload.itemIds
            : Array.isArray(payload.ids)
              ? payload.ids
              : []
        );
        const allowedAssetIds = new Set(Array.isArray(payload.assetIds) ? payload.assetIds : []);

        if (cancelled) return;

        // If live gate currently yields no eligible items, keep the local catalog so
        // starter flows and manual placement remain usable.
        if (allowedItemIds.size === 0 && allowedAssetIds.size === 0) {
          console.warn("Live catalog returned zero eligible IDs; using local catalog fallback.");
          return;
        }

        let keptCount = 0;
        const idsToRemove: string[] = [];
        const totalCatalogCount = Object.keys(CATALOG_ITEMS).length;
        for (const id of Object.keys(CATALOG_ITEMS)) {
          const catalogItem = CATALOG_ITEMS[id];
          const assetId = catalogItem?.assets?.assetId;
          const allowed =
            allowedItemIds.has(id) ||
            allowedAssetIds.has(id) ||
            (typeof assetId === "string" && allowedAssetIds.has(assetId));

          if (!allowed) {
            idsToRemove.push(id);
          } else {
            keptCount += 1;
          }
        }

        // Guard against accidental full-prune when IDs are in a different domain.
        if (keptCount === 0 && (allowedItemIds.size > 0 || allowedAssetIds.size > 0)) {
          console.warn("Live catalog IDs did not match local catalog IDs; skipping prune.", {
            itemIds: allowedItemIds.size,
            assetIds: allowedAssetIds.size,
          });
        } else if (
          keptCount > 0 &&
          totalCatalogCount > 0 &&
          keptCount <= Math.max(3, Math.floor(totalCatalogCount * 0.05))
        ) {
          // Safety valve: avoid collapsing the editor catalog to a handful of items
          // when the live gate returns an incomplete or stale subset.
          console.warn("Live catalog prune kept suspiciously few items; using local catalog fallback.", {
            keptCount,
            totalCatalogCount,
            itemIds: allowedItemIds.size,
            assetIds: allowedAssetIds.size,
          });
        } else {
          for (const id of idsToRemove) {
            delete CATALOG_ITEMS[id];
            CATALOG_ITEMS_MAP.delete(id);
          }
        }
      } catch {
        // If live catalog fetch fails, keep local catalog so editor remains usable.
        console.warn("Live catalog fetch failed; using local catalog fallback.");
      } finally {
        if (!cancelled) setLiveCatalogReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize HistoryManager (once)
  const historyRef = useRef<HistoryManager<DesignSnapshot> | null>(null);
  if (!historyRef.current) {
    historyRef.current = new HistoryManager(
      () => designSnapshotRef.current,
      (snapshot) => {
        designSnapshotRef.current = snapshot;
        setDesignSnapshot(snapshot);
      }
    );
  }
  const history = historyRef.current!;

  const revokeFloorPlanUnderlayUrl = useCallback(() => {
    if (floorPlanUnderlayUrlRef.current && typeof URL !== "undefined") {
      URL.revokeObjectURL(floorPlanUnderlayUrlRef.current);
      floorPlanUnderlayUrlRef.current = null;
    }
  }, []);

  const buildPersistedFloorPlanState = useCallback((): DesignSnapshot["floorPlan"] => {
    const underlay =
      floorPlanUnderlay && isPersistableFloorPlanAssetUrl(floorPlanUnderlay.assetUrl)
        ? floorPlanUnderlay
        : null;

    if (!underlay && planOpenings.length === 0) {
      return undefined;
    }

    return {
      underlay,
      openings: planOpenings,
    };
  }, [floorPlanUnderlay, planOpenings]);

  const buildDesignSnapshotForPersistence = useCallback(
    (snapshot: DesignSnapshot = designSnapshotRef.current): DesignSnapshot => {
      const floorPlan = buildPersistedFloorPlanState();
      const nextSnapshot: DesignSnapshot = { ...snapshot };

      if (floorPlan) {
        nextSnapshot.floorPlan = floorPlan;
      } else {
        delete nextSnapshot.floorPlan;
      }

      return nextSnapshot;
    },
    [buildPersistedFloorPlanState]
  );

  const getStoredDesignForPersistence = useCallback(
    (snapshot: DesignSnapshot = designSnapshotRef.current) =>
      snapshotToStored(buildDesignSnapshotForPersistence(snapshot)),
    [buildDesignSnapshotForPersistence]
  );

  const hydratePersistedFloorPlanState = useCallback(
    (snapshot: DesignSnapshot, clearWhenMissing = false) => {
      const floorPlan = snapshot.floorPlan;

      if (!floorPlan) {
        if (clearWhenMissing) {
          revokeFloorPlanUnderlayUrl();
          floorPlanPdfSourceDataRef.current = null;
          setFloorPlanPdfSourceReady(false);
          setFloorPlanUnderlay(null);
          setPlanOpenings([]);
        }
        return;
      }

      revokeFloorPlanUnderlayUrl();
      floorPlanPdfSourceDataRef.current = null;
      setFloorPlanPdfSourceReady(false);
      setFloorPlanUnderlay(
        floorPlan.underlay && isPersistableFloorPlanAssetUrl(floorPlan.underlay.assetUrl)
          ? {
              ...floorPlan.underlay,
              opacity:
                typeof floorPlan.underlay.opacity === "number"
                  ? floorPlan.underlay.opacity
                  : 0.45,
              locked: floorPlan.underlay.locked ?? true,
            }
          : null
      );
      setPlanOpenings(Array.isArray(floorPlan.openings) ? floorPlan.openings : []);
      setFloorPlanCalibrationMode(false);
      setFloorPlanCalibrationPoints([]);
      setFloorPlanCalibrationDistanceInput("");
      setFloorPlanTraceRoomMode(false);
      setFloorPlanTraceRoomPoints([]);
      setBlankGridRoomPreviewPoint(null);
      setFloorPlanTraceOpeningMode(false);
      setFloorPlanTraceOpeningPoints([]);
    },
    [revokeFloorPlanUnderlayUrl]
  );

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
    handleAddRoom,
    handleRenameRoom,
    handleMoveRoom2D,
  } = useDesignPageHousePlanState({
    designSnapshot,
    setDesignSnapshot,
    isPlanView2D: viewMode === "2d",
  });
  const hasWholeHousePlan = housePlan2D.rooms.length > 1;
  const usesHousePlanScene =
    hasWholeHousePlan || housePlan2D.rooms.some((room) => room.shape !== "rectangle");
  const wholeHomeNavigationBounds = useMemo(() => {
    if (!housePlan2D.rooms.length) {
      return { minX: -2, maxX: 2, minZ: -2, maxZ: 2 };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    housePlan2D.rooms.forEach((room) => {
      minX = Math.min(minX, room.x - room.w / 2);
      maxX = Math.max(maxX, room.x + room.w / 2);
      minZ = Math.min(minZ, room.z - room.d / 2);
      maxZ = Math.max(maxZ, room.z + room.d / 2);
    });

    const buffer = Math.max(1.5, Math.max(maxX - minX, maxZ - minZ) * 0.2);
    return {
      minX: minX - buffer,
      maxX: maxX + buffer,
      minZ: minZ - buffer,
      maxZ: maxZ + buffer,
    };
  }, [housePlan2D.rooms]);
  const houseRoomById = useMemo(
    () => new Map(housePlan2D.rooms.map((room) => [room.id, room])),
    [housePlan2D.rooms]
  );
  const selectedPlanOpening = useMemo(
    () =>
      selectedPlanOverlayId
        ? planOpenings.find((opening) => opening.id === selectedPlanOverlayId) ?? null
        : null,
    [planOpenings, selectedPlanOverlayId]
  );
  const getPlanOpeningRoomName = (opening: RoomOpening2D | null) =>
    opening?.roomId ? houseRoomById.get(opening.roomId)?.name ?? "Room" : "Whole plan";
  const getPlanOpeningWallSpan = (opening: RoomOpening2D | null) =>
    opening
      ? getPlanOpeningWallSpanMeters(opening, {
          rooms: housePlan2D.rooms,
          planWidthMeters: planViewWidth,
          planDepthMeters: planViewDepth,
        })
      : 0;
  const sceneRoomItems = useMemo(() => {
    if (!hasWholeHousePlan) {
      const room = activeRoom;
      if (!room) return [];
      const planRoom = houseRoomById.get(room.id);
      return room.items.map((item) => ({
        item,
        roomId: room.id,
        roomOffset: { x: planRoom?.x ?? 0, z: planRoom?.z ?? 0 },
        roomWidth: room.geometry.width,
        roomDepth: room.geometry.depth,
        roomPlanShape: room.planShape ?? "rectangle",
        roomPlanPolygon: room.planPolygon,
        roomWallThickness: room.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness,
        isActiveRoom: true,
      }));
    }

    return designSnapshot.rooms.flatMap((room) => {
      const planRoom = houseRoomById.get(room.id);
      const roomOffset = { x: planRoom?.x ?? 0, z: planRoom?.z ?? 0 };
      const roomWallThickness =
        room.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness;
      return room.items.map((item) => ({
        item,
        roomId: room.id,
        roomOffset,
        roomWidth: room.geometry.width,
        roomDepth: room.geometry.depth,
        roomPlanShape: room.planShape ?? "rectangle",
        roomPlanPolygon: room.planPolygon,
        roomWallThickness,
        isActiveRoom: room.id === designSnapshot.activeRoomId,
      }));
    });
  }, [
    activeRoom,
    designSnapshot.activeRoomId,
    designSnapshot.rooms,
    hasWholeHousePlan,
    houseRoomById,
  ]);
  const roomShoppingSummaries = useMemo(() => {
    return designSnapshot.rooms.map((room) => {
      let subtotal = 0;
      let shoppableCount = 0;
      let needsReviewCount = 0;
      let includedCount = 0;
      const previewNames: string[] = [];

      for (const item of room.items) {
        const product = CATALOG_ITEMS[item.productId];
        if (!product) {
          needsReviewCount += 1;
          continue;
        }

        const qty = Math.max(1, Math.min(99, item.qty ?? 1));
        const resolved = resolveCatalogVariant(product, item.variantId);
        const unitPrice =
          resolved.commerce.type === "affiliate"
            ? resolved.commerce.priceHint ?? 0
            : getItemPrice(product);
        subtotal += unitPrice * qty;

        if (item.includeInCheckout ?? true) {
          includedCount += qty;
        }

        const isShoppable =
          resolved.commerce.type === "affiliate"
            ? Boolean(resolved.commerce.url)
            : resolved.commerce.type === "shopify"
              ? Boolean(resolved.commerce.variantId && resolved.commerce.available)
              : false;

        if (isShoppable) {
          shoppableCount += qty;
        } else {
          needsReviewCount += qty;
        }

        if (previewNames.length < 3) {
          previewNames.push(product.title);
        }
      }

      return {
        roomId: room.id,
        roomName: room.name,
        roomType: room.roomType,
        itemCount: room.items.length,
        includedCount,
        shoppableCount,
        needsReviewCount,
        subtotal,
        previewNames,
        isActive: room.id === designSnapshot.activeRoomId,
      };
    });
  }, [designSnapshot.activeRoomId, designSnapshot.rooms]);
  const activeRoomShoppingSummary =
    roomShoppingSummaries.find((room) => room.roomId === designSnapshot.activeRoomId) ??
    roomShoppingSummaries[0] ??
    null;
  const wholeHomeShoppingSummary = useMemo(
    () =>
      roomShoppingSummaries.reduce(
        (summary, room) => ({
          itemCount: summary.itemCount + room.itemCount,
          includedCount: summary.includedCount + room.includedCount,
          shoppableCount: summary.shoppableCount + room.shoppableCount,
          needsReviewCount: summary.needsReviewCount + room.needsReviewCount,
          subtotal: summary.subtotal + room.subtotal,
        }),
        {
          itemCount: 0,
          includedCount: 0,
          shoppableCount: 0,
          needsReviewCount: 0,
          subtotal: 0,
        }
      ),
    [roomShoppingSummaries]
  );
  const activeSceneItemsForGuides = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        position: [
          item.position[0] + activeRoomPlanOffset.x,
          item.position[1] ?? 0,
          item.position[2] + activeRoomPlanOffset.z,
        ] as [number, number, number],
      })),
    [activeRoomPlanOffset.x, activeRoomPlanOffset.z, items]
  );
  const itemsRef = useRef(items);
  const zonesRef = useRef(zones);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);

  // Action: Commit items with transaction tracking
  // Used for user-initiated actions that should be undoable
  // Step 8: Reconcile cart to remove invalid items
  const commitItems = useCallback(
    (updater: PlacedItem[] | ((prev: PlacedItem[]) => PlacedItem[]), actionName: string = "Edit") => {
      history.begin(actionName);
      const nextItems =
        typeof updater === "function" ? updater(itemsRef.current) : updater;
      
      // Reconcile cart: removes items that can't be purchased
      const { valid: validItems, invalid } = reconcileCart(
        nextItems,
        CATALOG_ITEMS_MAP
      );
      if (invalid.length > 0) {
        console.warn(`Removed ${invalid.length} invalid items from cart`);
        track("commerce_invalid_items_removed", {
          count: invalid.length,
          items: invalid,
        });
      }

      // NEW: Update only the active room (items stored in room.items[])
      const room = getActiveRoom(designSnapshotRef.current);
      if (!room) {
        history.commit();
        return;
      }

      const updatedRoom = { ...room, items: validItems };
      const nextSnapshot = {
        ...designSnapshotRef.current,
        rooms: designSnapshotRef.current.rooms.map((r) =>
          r.id === room.id ? updatedRoom : r
        ),
      };

      itemsRef.current = validItems;
      setDesignSnapshot(nextSnapshot);
      history.commit();
    },
    [history]
  );

  // Action: Update items without transaction (for drag in-progress)
  // Used during dragging or continuous operations
  // Step 8: Check items can be added to cart before allowing
  const setItemsPresent = useCallback(
    (updater: PlacedItem[] | ((prev: PlacedItem[]) => PlacedItem[])) => {
      const nextItems =
        typeof updater === "function" ? updater(itemsRef.current) : updater;
      
      // Validate items can be added to cart
      const validItems = nextItems.filter(item => {
        const catalogItem = CATALOG_ITEMS[item.productId];
        if (!catalogItem) {
          console.warn(`Item ${item.productId} not found in catalog`);
          return false;
        }
        if (!canAddToCart(catalogItem)) {
          console.warn(
            `Item ${item.productId} cannot be added to cart: ${getNonBuyableReason(catalogItem)}`
          );
          return false;
        }
        return true;
      });

      // NEW: Update only the active room (items stored in room.items[])
      const room = getActiveRoom(designSnapshotRef.current);
      if (!room) return;

      const updatedRoom = { ...room, items: validItems };
      const nextSnapshot = {
        ...designSnapshotRef.current,
        rooms: designSnapshotRef.current.rooms.map((r) =>
          r.id === room.id ? updatedRoom : r
        ),
      };

      itemsRef.current = validItems;
      setDesignSnapshot(nextSnapshot);
    },
    []
  );

  // Getters for undo/redo state
  const canUndo = history.canUndo();
  const canRedo = history.canRedo();
  const undoName = history.getUndoName();
  const redoName = history.getRedoName();

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

  const undoSafe = useCallback(() => {
    if (isClientPreview) return;
    history.undo();
  }, [isClientPreview, history]);

  const redoSafe = useCallback(() => {
    if (isClientPreview) return;
    history.redo();
  }, [isClientPreview, history]);

  // Hotkeys for undo/redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z)
  useUndoRedoHotkeys({ undo: undoSafe, redo: redoSafe });

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
  const isCameraAnimatingRef = useRef(false);
  const last3DViewRef = useRef<CameraView | null>(null);
  const cartHoverCameraBaselineRef = useRef<CameraView | null>(null);
  const cartHoverFocusTimerRef = useRef<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const updateProjection = useCallback((cam: THREE.Camera | null) => {
    if (!cam) return;
    if (cam instanceof THREE.PerspectiveCamera || cam instanceof THREE.OrthographicCamera) {
      cam.updateProjectionMatrix();
    }
  }, []);

  const updateCameraViewFromScene = useCallback(() => {
    const camera = cameraRef.current;
    const controls = orbitControlsRef.current;
    if (!camera || !controls) return;

    const target = controls.target as THREE.Vector3;
    const perspectiveFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : undefined;
    const next: CameraView = {
      pos: [camera.position.x, camera.position.y, camera.position.z],
      target: [target.x, target.y, target.z],
      fov: perspectiveFov,
    };

    setCameraView((prev) => {
      const [px, py, pz] = prev.pos;
      const [tx, ty, tz] = prev.target;
      const changed =
        Math.abs(px - next.pos[0]) > 0.001 ||
        Math.abs(py - next.pos[1]) > 0.001 ||
        Math.abs(pz - next.pos[2]) > 0.001 ||
        Math.abs(tx - next.target[0]) > 0.001 ||
        Math.abs(ty - next.target[1]) > 0.001 ||
        Math.abs(tz - next.target[2]) > 0.001 ||
        Math.abs((prev.fov ?? 45) - (next.fov ?? 45)) > 0.01;
      return changed ? next : prev;
    });
  }, []);

  const transitionToCameraView = useCallback((nextView: CameraView, durationMs = 520) => {
    const camera = cameraRef.current;
    const controls = orbitControlsRef.current;
    if (!camera || !controls) return;

    isCameraAnimatingRef.current = true;
    const fromPos = camera.position.clone();
    const fromTarget = (controls.target as THREE.Vector3).clone();
    const toPos = new THREE.Vector3(...nextView.pos);
    const toTarget = new THREE.Vector3(...nextView.target);
    const isPerspective = camera instanceof THREE.PerspectiveCamera;
    const fromFov = isPerspective ? camera.fov : cameraView.fov ?? 45;
    const toFov = nextView.fov ?? fromFov;
    const start = performance.now();

    const tick = (ts: number) => {
      const t = Math.min(1, (ts - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);

      camera.position.lerpVectors(fromPos, toPos, eased);
      (controls.target as THREE.Vector3).lerpVectors(fromTarget, toTarget, eased);
      if (isPerspective) {
        camera.fov = fromFov + (toFov - fromFov) * eased;
      }
      updateProjection(camera);
      controls.update();

      if (t < 1) {
        requestAnimationFrame(tick);
        return;
      }

      isCameraAnimatingRef.current = false;
      updateCameraViewFromScene();
    };

    requestAnimationFrame(tick);
  }, [cameraView.fov, updateCameraViewFromScene, updateProjection]);

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

  const waitForFrames = (count: number) =>
    new Promise<void>((resolve) => {
      let frames = 0;
      const tick = () => {
        frames += 1;
        if (frames >= count) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

  const _addWatermark = (canvas: HTMLCanvasElement, isFree: boolean): HTMLCanvasElement => {
    if (!isFree) return canvas;

    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.font = "24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      "INTERIOR AI - FREE TIER",
      canvas.width / 2,
      canvas.height / 2
    );

    return canvas;
  };

  const captureCanvasImage = (): string | null => {
    if (!cameraRef.current || !rendererRef.current || !sceneRef.current) return null;

    rendererRef.current.render(sceneRef.current, cameraRef.current);

    const canvas = rendererRef.current.domElement ?? canvasRef.current;
    if (!canvas) return null;

    const width = canvas.width;
    const height = canvas.height;

    // Create off-screen canvas at 2x DPR
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = width * 2;
    offscreenCanvas.height = height * 2;

    const offscreenCtx = offscreenCanvas.getContext("2d");
    if (!offscreenCtx) return null;

    // Scale and draw
    offscreenCtx.scale(2, 2);
    offscreenCtx.drawImage(canvas, 0, 0);

    // Add watermark if free tier
    const isFree = plan !== "pro";
    if (isFree) {
      // Scale context back for text rendering
      offscreenCtx.resetTransform();
      offscreenCtx.fillStyle = "rgba(0, 0, 0, 0.6)";
      offscreenCtx.font = "bold 32px sans-serif";
      offscreenCtx.textAlign = "center";
      offscreenCtx.textBaseline = "middle";
      offscreenCtx.fillText(
        "Free Tier - Interior AI",
        (width * 2) / 2,
        (height * 2) / 2
      );
    }

    return offscreenCanvas.toDataURL("image/png");
  };

  const captureCanvasImageForPdf = (): string | null => {
    if (!cameraRef.current || !rendererRef.current || !sceneRef.current) return null;

    rendererRef.current.render(sceneRef.current, cameraRef.current);

    const canvas = rendererRef.current.domElement ?? canvasRef.current;
    if (!canvas) return null;

    const width = Math.max(1, Math.floor(canvas.width * 0.6));
    const height = Math.max(1, Math.floor(canvas.height * 0.6));

    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = width;
    offscreenCanvas.height = height;

    const offscreenCtx = offscreenCanvas.getContext("2d");
    if (!offscreenCtx) return null;

    offscreenCtx.drawImage(canvas, 0, 0, width, height);

    return offscreenCanvas.toDataURL("image/jpeg", 0.8);
  };

  const exportImages = async () => {
    track("export_clicked", {
      design_id: designId,
      channel: "images",
      is_pro: isPro(plan),
      export_style: exportStylePreset,
    });
    logFunnelEvent("export_clicked", {
      channel: "images",
      plan,
      export_style: exportStylePreset,
    });

    if (!canvasRef.current || !cameraRef.current || !sceneReady) {
      alert("Scene not ready for export");
      return;
    }

    if (!isPro(plan)) {
      track("export_attempted", { is_pro: false });
    }

    setIsExporting(true);

    try {
      // Store original camera state
      const originalPos = cameraRef.current.position.clone();
      const originalTarget = new THREE.Vector3(...cameraView.target);

      // Activate client preview to hide UI
      setClientPreview(true);
      await waitForFrames(2);

      const angles =
        exportStylePreset === "pro"
          ? [
              { name: "hero", yaw: 0 },
              { name: "left", yaw: Math.PI / 9 },
              { name: "right", yaw: -Math.PI / 9 },
              { name: "overview", yaw: Math.PI / 4 },
            ]
          : [
              { name: "hero", yaw: 0 },
              { name: "left", yaw: Math.PI / 9 },
              { name: "right", yaw: -Math.PI / 9 },
            ];

      const images: Array<{ name: string; url: string }> = [];

      for (const angle of angles) {
        // Position camera at angle
        const distance = 8;
        const height = 3.5;
        const x = Math.sin(angle.yaw) * distance;
        const z = Math.cos(angle.yaw) * distance;

        cameraRef.current.position.set(x, height, z);
        cameraRef.current.lookAt(originalTarget);
        updateProjection(cameraRef.current);

        // Wait for render
        await waitForFrames(2);

        // Capture image
        const imageUrl = captureCanvasImage();
        if (imageUrl) {
          images.push({ name: angle.name, url: imageUrl });
        } else {
          console.warn(`Failed to capture ${angle.name} image`);
        }
      }
      

      // Restore original camera state
      cameraRef.current.position.copy(originalPos);
      if (orbitControlsRef.current) {
        (orbitControlsRef.current.target as THREE.Vector3).copy(originalTarget);
      }
      cameraRef.current.lookAt(originalTarget);
      updateProjection(cameraRef.current);

      // Deactivate client preview
      setClientPreview(false);

      // Create download links with delays to prevent browser throttling
      images.forEach(({ name, url }, index) => {
        setTimeout(() => {
          const link = document.createElement("a");
          link.href = url;
          link.download = `room-${exportStylePreset}-${name}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, index * 300); // 300ms delay between downloads
      });

      track("images_exported", {
        design_id: designId,
        count: images.length,
        is_pro: isPro(plan),
        export_style: exportStylePreset,
      });

      if (!isPro(plan)) {
        track("upgrade_prompt_shown", { source: "export_images" });
        setUpgradeReason("export_images");
        setShowUpgrade(true);
      }

      alert(`Exported ${images.length} ${exportStylePreset} images! Check your downloads.`);
    } catch (err) {
      console.error("Export error:", err);
      alert("Export failed. See console for details.");
      setClientPreview(false);
    } finally {
      setIsExporting(false);
    }
  };

  const [isPdfExporting, setIsPdfExporting] = useState(false);

  const captureExportImages = async () => {
    if (!canvasRef.current || !cameraRef.current || !sceneReady) {
      throw new Error("Scene not ready for export");
    }

    const originalPos = cameraRef.current.position.clone();
    const originalTarget = new THREE.Vector3(...cameraView.target);
    const previousPreview = clientPreview;

    setClientPreview(true);
    await waitForFrames(2);

    const angles =
      exportStylePreset === "pro"
        ? [
            { name: "hero", yaw: 0 },
            { name: "left", yaw: Math.PI / 9 },
            { name: "right", yaw: -Math.PI / 9 },
            { name: "overview", yaw: Math.PI / 4 },
          ]
        : [
            { name: "hero", yaw: 0 },
            { name: "left", yaw: Math.PI / 9 },
            { name: "right", yaw: -Math.PI / 9 },
          ];

    const images: string[] = [];
    for (const angle of angles) {
      const distance = 8;
      const height = 3.5;
      const x = Math.sin(angle.yaw) * distance;
      const z = Math.cos(angle.yaw) * distance;

      cameraRef.current.position.set(x, height, z);
      cameraRef.current.lookAt(originalTarget);
      updateProjection(cameraRef.current);

      await waitForFrames(2);

      const imageUrl = captureCanvasImageForPdf();
      if (imageUrl) images.push(imageUrl);
    }

    cameraRef.current.position.copy(originalPos);
    if (orbitControlsRef.current) {
      (orbitControlsRef.current.target as THREE.Vector3).copy(originalTarget);
    }
    cameraRef.current.lookAt(originalTarget);
    updateProjection(cameraRef.current);
    setClientPreview(previousPreview);

    return images;
  };

  const exportPdf = async () => {
    track("export_clicked", {
      design_id: designId,
      channel: "pdf",
      is_pro: isPro(plan),
      export_style: exportStylePreset,
    });
    logFunnelEvent("export_clicked", {
      channel: "pdf",
      plan,
      export_style: exportStylePreset,
    });

    const isProPlan = isPro(plan);
    if (!isProPlan) {
      track("pdf_export_attempted", { is_pro: false, tier: "free" });
    }

    if (items.length === 0) {
      alert("Add some items before exporting to PDF");
      return;
    }

    setIsPdfExporting(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);

    try {
      const images = await captureExportImages();
      const tierImages = isProPlan ? images : images.slice(0, 1);

      const pdfPayload = {
        title:
          isProPlan
            ? exportStylePreset === "pro"
              ? "Interior AI Room Design - Technical Set"
              : "Interior AI Room Design - Presentation Set"
            : "Interior AI Room Design - Free Preview",
        images: tierImages,
        exportStylePreset,
        requestedTier: isProPlan ? "pro" : "free",
        items: items
          .map((item) => {
            const product = CATALOG_ITEMS[item.productId];
            if (!product) return null;
            return {
              name: product.title,
              price: getItemPrice(product),
              qty: item.qty || 1,
              retailer: product.commerce.type === "affiliate" ? product.commerce.data.retailer : null,
              buyUrl: product.commerce.type === "affiliate" ? product.commerce.data.url : null,
            };
          })
          .filter(Boolean),
      };

      const res = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pdfPayload),
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`PDF export failed: ${res.status} ${text}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `room-design-${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      track("pdf_exported", {
        design_id: designId,
        items_count: items.length,
        is_pro: isProPlan,
        tier: isProPlan ? "pro" : "free",
        export_style: exportStylePreset,
      });

      if (!isProPlan) {
        track("upgrade_prompt_shown", { source: "export_pdf_free_completion" });
        setUpgradeReason("export_pdf");
        setShowUpgrade(true);
      }
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "PDF generation timed out. Please try again."
          : err instanceof Error
            ? err.message
            : "PDF export failed";
      console.error("PDF export error:", err);
      alert(message);
    } finally {
      window.clearTimeout(timeoutId);
      setIsPdfExporting(false);
    }
  };

  const generateAINotes = async () => {
    if (!items.length) {
      alert("Add some items to your design first");
      return;
    }

    setAiNotesLoading(true);
    const startTime = Date.now();
    const timeoutId = setTimeout(() => {
      setAiNotesLoading(false);
      alert(
        "AI generation is taking longer than expected. Please check that OPENAI_API_KEY is set in .env.local and restart the dev server."
      );
    }, 45000); // 45s timeout warning

    try {
      const response = await fetch("/api/ai/design-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          design: {
            items: items.map((item) => ({
              productId: item.productId,
              quantity: item.qty || 1,
              price: getItemPrice(CATALOG_ITEMS[item.productId]) || 0,
            })),
            categories: [...new Set(items.map((i) => CATALOG_ITEMS[i.productId]?.category))],
          },
          budget: items.reduce((sum, i) => sum + (getItemPrice(CATALOG_ITEMS[i.productId]) || 0) * (i.qty || 1), 0),
          mode: isDesigner ? "designer" : "homeowner",
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || `API error: ${response.statusText}`);
      }

      const data = (await response.json()) as AINotesResponse & { error?: string };

      if (data?.error) {
        throw new Error(data.error);
      }

      const ms = Date.now() - startTime;
      
      // Track analytics with cache info
      if (data?.cached) {
        track("ai_notes_cached_hit", {
          design_id: designId,
          ms,
        });
      } else {
        track("ai_notes_generated", {
          design_id: designId,
          mode: isDesigner ? "designer" : "homeowner",
          item_count: items.length,
          ms,
        });
      }

      setAiNotesData(data);
      setShowAINotes(true);
    } catch (error) {
      clearTimeout(timeoutId);
      console.error("AI notes error:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to generate AI notes. See console for details.";
      
      // Track error/rate-limit
      if (message.includes("Too many AI requests")) {
        track("ai_rate_limited", { keyType: session?.user ? "user" : "anon" });
      }
      showRuleToast(message);
    } finally {
      setAiNotesLoading(false);
    }
  };

  const applySuggestion = async (action: AISuggestionAction) => {
    try {
      await applyAISuggestionAction({
        action,
        editor: {
          getItemById: (id: string) =>
            itemsRef.current.find((item) => item.instanceId === id) ?? null,
          findFirstByCategory: (category: string) =>
            itemsRef.current.find(
              (item) => CATALOG_ITEMS[item.productId]?.category === category
            ) ?? null,
          resizeRugToSofaRule,
          makeRoomCheaper: () => {
            onBulkSwap("cheaper");
          },
          addLampNearReadingCorner: async () => {
            const lamp = Object.values(CATALOG_ITEMS).find((item) => item.category === "floor_lamp");
            if (!lamp) {
              showRuleToast("No floor lamp is available in the catalog yet");
              return;
            }
            addItem(lamp.id, itemsRef.current.length > 0 ? [2, 0, 2] : [1.5, 0, 1.5]);
          },
          commitDesignSnapshot: (next) => {
            if (next?.items) {
              const actionName = action?.type ? `AI: ${action.type}` : "AI suggestion";
              commitItems(next.items as PlacedItem[], actionName);
            }
          },
          getDesignSnapshot: () => ({
            items: itemsRef.current,
            zones: zonesRef.current,
          }),
        },
      });

      // Track successful suggestion application
      track("ai_suggestion_applied", {
        action_type: action?.type,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not apply suggestion";
      showRuleToast(message);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        items: PlacedItem[];
        zones?: Zone[];
        savedViews?: NamedCameraView[];
        roomWidth?: number;
        roomDepth?: number;
        rooms?: StoredDesign["rooms"];
        activeRoomId?: string;
        version?: number;
      };

      const hydrateSavedViews = (value: unknown) =>
        Array.isArray(value)
          ? value
              .filter(
                (entry) =>
                  entry &&
                  typeof entry.name === "string" &&
                  Array.isArray(entry.view?.pos) &&
                  entry.view.pos.length === 3 &&
                  Array.isArray(entry.view?.target) &&
                  entry.view.target.length === 3
              )
              .slice(0, 6)
          : [];

      if (parsed.version === 3 && Array.isArray(parsed.rooms)) {
        const restored = storedToSnapshot(parsed as StoredDesign);
        const restoredRooms = restored.rooms.map((room) => {
          const nextWidth =
            typeof room.geometry.width === "number" && Number.isFinite(room.geometry.width)
              ? room.geometry.width
              : ROOM_DIMENSION_DEFAULTS.width;
          const nextDepth =
            typeof room.geometry.depth === "number" && Number.isFinite(room.geometry.depth)
              ? room.geometry.depth
              : ROOM_DIMENSION_DEFAULTS.depth;
          const nextWall =
            typeof room.geometry.wallThickness === "number" && Number.isFinite(room.geometry.wallThickness)
              ? room.geometry.wallThickness
              : ROOM_DIMENSION_DEFAULTS.wallThickness;
          const cleanedRoomItems = (room.items || [])
            .filter((it) => CATALOG_ITEMS[it.productId])
            .map((it) => {
              const product = CATALOG_ITEMS[it.productId];
              const validVariant = product.variants.some((v) => v.id === it.variantId)
                ? it.variantId
                : product.defaultVariantId;

              return {
                ...it,
                variantId: validVariant,
                position: it.position ?? [0, 0, 0],
                qty: typeof it.qty === "number" && it.qty > 0 ? it.qty : 1,
                includeInCheckout: it.includeInCheckout ?? true,
                locked: Boolean(it.locked),
              } as PlacedItem;
            });

          return {
            ...room,
            geometry: {
              ...room.geometry,
              width: nextWidth,
              depth: nextDepth,
              wallThickness: nextWall,
            },
            items: _normalizeItemsToRoom({
              items: cleanedRoomItems,
              width: nextWidth,
              depth: nextDepth,
              wall: nextWall,
              catalogItems: CATALOG_ITEMS,
              resolveConfiguredPlanningDimsMm,
            }),
            zones: Array.isArray(room.zones) ? room.zones : [],
            savedViews: Array.isArray(room.savedViews) ? room.savedViews : [],
          };
        });

        if (restoredRooms.length) {
          const activeRoomExists = restoredRooms.some((room) => room.id === restored.activeRoomId);
          const nextSnapshot = {
            ...restored,
            rooms: restoredRooms,
            activeRoomId: activeRoomExists ? restored.activeRoomId : restoredRooms[0].id,
          };
          setDesignSnapshot(nextSnapshot);
          hydratePersistedFloorPlanState(nextSnapshot);
          history.clear();
        }

        setSavedViews(hydrateSavedViews(parsed.savedViews));
        return;
      }

      const cleaned = (parsed.items || [])
        .filter((it) => CATALOG_ITEMS[it.productId])
        .map((it) => {
          const product = CATALOG_ITEMS[it.productId];
          const validVariant = product.variants.some((v) => v.id === it.variantId)
            ? it.variantId
            : product.defaultVariantId;

          return {
            ...it,
            variantId: validVariant,
            position: it.position ?? [0, 0, 0],
            qty: typeof it.qty === "number" && it.qty > 0 ? it.qty : 1,
            includeInCheckout: it.includeInCheckout ?? true,
            locked: Boolean(it.locked),
          } as PlacedItem;
        });

      const persistedRoomWidth =
        typeof parsed.roomWidth === "number" && Number.isFinite(parsed.roomWidth)
          ? parsed.roomWidth
          : roomWidth;
      const persistedRoomDepth =
        typeof parsed.roomDepth === "number" && Number.isFinite(parsed.roomDepth)
          ? parsed.roomDepth
          : roomDepth;

      if (cleaned.length) {
        const normalized = _normalizeItemsToRoom({
          items: cleaned,
          width: persistedRoomWidth,
          depth: persistedRoomDepth,
          wall: wallThickness,
          catalogItems: CATALOG_ITEMS,
          resolveConfiguredPlanningDimsMm,
        });
        // NEW: Use migration helper for localStorage items too
        const snapshot = migrateToV3({
          items: normalized,
          zones: parsed.zones ?? [],
          roomBounds: {
            width: persistedRoomWidth,
            depth: persistedRoomDepth,
            wallThickness,
          },
        } as unknown as DesignSnapshot);
        setDesignSnapshot(snapshot);
        history.clear();
      }
      setSavedViews(hydrateSavedViews(parsed.savedViews));
    } catch {
      // ignore invalid saved data
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShareOrigin(window.location.origin);
  }, []);

  const refreshPlan = async () => {
    setRefreshingPlan(true);
    try {
      const res = await fetch("/api/me");
      const data = await res.json().catch(() => ({}));
      const newPlan = data?.plan === "pro" ? "pro" : "free";
      setPlan(newPlan);
      showRuleToast(`Plan status: ${newPlan === "pro" ? "Pro" : "Free"}`);
      track("plan_refreshed", { plan: newPlan });
    } catch {
      showRuleToast("Failed to refresh plan status");
      setPlan("free");
    } finally {
      setRefreshingPlan(false);
    }
  };

  const _openBillingPortal = async () => {
    if (!session?.user) {
      signInWithReturn();
      return;
    }

    try {
      showRuleToast("Opening billing portal...");
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok || !data?.url) {
        const errorMsg = data?.error || "Unable to open billing portal. Please try again.";
        showRuleToast(errorMsg);
        console.error("Portal error:", errorMsg);
        return;
      }
      
      // Redirect to portal
      window.location.href = data.url as string;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to open billing portal";
      showRuleToast(msg);
      console.error("Billing portal error:", err);
    }
  };

  const startCheckout = async (interval: "monthly" | "yearly" = "monthly") => {
    if (!session?.user) {
      signInWithReturn();
      return;
    }

    setStartingCheckout(true);
    try {
      track("checkout_started", {
        source: "upgrade_modal",
        interval,
        design_id: designId ?? null,
        reason: upgradeReason ?? "unknown",
        ...paywallContextMeta,
      });
      logFunnelEvent("checkout_started", {
        source: "upgrade_modal",
        interval,
        reason: upgradeReason ?? "unknown",
        ...paywallContextMeta,
      });
      showRuleToast("Opening checkout...");
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.error || "Unable to start checkout right now.";
        showRuleToast(msg);
        console.error("Checkout error:", msg);
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      showRuleToast("No checkout URL returned. Please try again.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to start checkout right now.";
      console.error("Failed to start checkout:", err);
      showRuleToast(msg);
    } finally {
      setStartingCheckout(false);
    }
  };

  useEffect(() => {
    refreshPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!stripeSessionId) return;
    let alive = true;

    const syncPlanAfterCheckout = async () => {
      try {
        const res = await fetch("/api/me");
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        const nextPlan: Plan = data?.plan === "pro" ? "pro" : "free";
        setPlan(nextPlan);
        if (nextPlan === "pro") {
          setShowUpgrade(false);
        }
      } catch {
        return;
      } finally {
        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.delete("session_id");
        const qs = nextParams.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    };

    void syncPlanAfterCheckout();

    return () => {
      alive = false;
    };
  }, [pathname, router, searchParams, stripeSessionId]);

  useEffect(() => {
    // Auto-refresh plan after returning from Stripe portal
    const refreshPlanParam = searchParams.get("refresh_plan");
    if (!refreshPlanParam) return;

    let alive = true;

    const syncPlanAfterPortal = async () => {
      try {
        const res = await fetch("/api/me");
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        const nextPlan: Plan = data?.plan === "pro" ? "pro" : "free";
        setPlan(nextPlan);
        
        // Show success toast
        showRuleToast(
          nextPlan === "pro"
            ? "Plan updated! You now have Pro access."
            : "Plan information refreshed."
        );
      } catch {
        console.warn("Failed to sync plan after portal return");
      } finally {
        // Clean up URL param
        if (alive) {
          const nextParams = new URLSearchParams(searchParams.toString());
          nextParams.delete("refresh_plan");
          const qs = nextParams.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }
      }
    };

    syncPlanAfterPortal();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router, searchParams]);

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
    if (!isDesigner) return;
    if (!designId || shareEnabled) return;
    void enableShare(designId);
  }, [isDesigner, designId, shareEnabled]);

  useEffect(() => {
    if (!designId) {
      setIsSaving(false);
    }
  }, [designId]);

  useEffect(() => {
    return () => {
      if (gridPulseTimerRef.current) {
        window.clearTimeout(gridPulseTimerRef.current);
      }
      if (snapToastTimerRef.current) {
        window.clearTimeout(snapToastTimerRef.current);
      }
      if (ruleToastTimerRef.current) {
        window.clearTimeout(ruleToastTimerRef.current);
      }
      if (floorPlanUnderlayUrlRef.current && typeof URL !== "undefined") {
        URL.revokeObjectURL(floorPlanUnderlayUrlRef.current);
        floorPlanUnderlayUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!planSettingsLoaded) return;
    if (planOpenings.length > 0) return;
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
  }, [planOpenings.length, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded) return;
    if (planFixedElements.length > 0) return;
    setPlanFixedElements([
      {
        id: "kitchen-run-top",
        kind: "kitchen_counter",
        xMm: 0,
        zMm: -metersToMm(roomDepth / 2) + 300,
        widthMm: 2600,
        depthMm: 600,
        rotationDeg: 0,
        label: "Kitchen run",
      },
      {
        id: "kitchen-island",
        kind: "island",
        xMm: -1050,
        zMm: -300,
        widthMm: 1200,
        depthMm: 600,
        rotationDeg: 0,
        label: "Island",
      },
    ]);
  }, [planFixedElements.length, planSettingsLoaded, roomDepth]);


  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const selectedIdsRef = useRef(selectedIds);
  const primaryIdRef = useRef(primaryId);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    primaryIdRef.current = primaryId;
  }, [primaryId]);

  const updateSelection = useCallback(
    (next: Set<string>, nextPrimary: string | null) => {
      setSelectedIds(next);
      setPrimaryId(nextPrimary);
      
      // Auto mode switching: ADJUST when item selected, DESIGN when cleared
      if (next.size > 0 && editorMode === "design") {
        setEditorMode("adjust");
      } else if (next.size === 0 && editorMode === "adjust") {
        setEditorMode("design");
      }
    },
    [editorMode]
  );

  const clearSelection = useCallback(() => {
    updateSelection(new Set(), null);
  }, [updateSelection]);

  const clearZoneSelection = useCallback(() => {
    setSelectedZoneId(null);
  }, []);

  const clearAllSelection = useCallback(() => {
    clearSelection();
    clearZoneSelection();
    setSelectedPlanOverlayId(null);
  }, [clearSelection, clearZoneSelection]);

  // Global keyboard shortcut for Delete/Backspace
  useEffect(() => {
    const handleDeleteKey = (e: KeyboardEvent) => {
      if (isClientPreview) return;
      // Check if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const selectedIds = Array.from(selectedIdsRef.current);
        if (selectedIds.length === 0) return;

        // Get names of items being deleted for better action label
        const itemNames = selectedIds
          .map(id => {
            const item = items.find(x => x.instanceId === id);
            return item ? CATALOG_ITEMS[item.productId]?.title || "Item" : "Item";
          })
          .filter((name, index, arr) => arr.indexOf(name) === index);
        
        const actionLabel = selectedIds.length === 1 
          ? `Delete ${itemNames[0]}`
          : `Delete ${selectedIds.length} items`;

        commitItems(
          (prev) => prev.filter((x) => !selectedIds.includes(x.instanceId)),
          actionLabel
        );
        clearSelection();
      }
    };

    window.addEventListener("keydown", handleDeleteKey);
    return () => window.removeEventListener("keydown", handleDeleteKey);
  }, [isClientPreview, items, commitItems, clearSelection]);

  const handleSelect = useCallback(
    (id: string, additive: boolean) => {
      if (selectedZoneId) setSelectedZoneId(null);
      const current = new Set(selectedIdsRef.current);
      if (additive) {
        if (current.has(id)) {
          current.delete(id);
          const nextPrimary =
            primaryIdRef.current === id
              ? current.size
                ? Array.from(current)[current.size - 1]
                : null
              : primaryIdRef.current;
          updateSelection(current, nextPrimary);
          return;
        }
        current.add(id);
        updateSelection(current, id);
        return;
      }
      updateSelection(new Set([id]), id);
    },
    [selectedZoneId, updateSelection]
  );

  // NEW: Handle room switching with proper state cleanup
  const handleSwitchRoom = useCallback((roomId: string) => {
    // Switch room
    setDesignSnapshot((prev) => switchRoom(prev, roomId));

    // Clear selection when switching rooms (keeps UI calm)
    clearAllSelection();

    // Only reset the perspective camera in room view. In 2D, forcing a 3D
    // camera angle makes the plan render edge-on as a thin line.
    if (viewMode !== "2d" && cameraRef.current) {
      cameraRef.current.position.set(0, 3, 3);
      cameraRef.current.lookAt(0, 0, 0);
    }

    track("editor_room_switched", { roomId });
  }, [clearAllSelection, viewMode]);

  const selectedInstanceId = primaryId;

  const selectedItem = selectedInstanceId
    ? items.find((i) => i.instanceId === selectedInstanceId) ?? null
    : null;

  useEffect(() => {
    setItemConfigurationByInstanceId((prev) => {
      const next: Record<string, string> = {};
      let changed = false;

      for (const item of items) {
        const explicit = item.configurationCode?.trim();
        const tracked = prev[item.instanceId];
        const value = explicit || tracked;
        if (value) next[item.instanceId] = value;
      }

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) changed = true;
      if (!changed) {
        for (const key of nextKeys) {
          if (next[key] !== prev[key]) {
            changed = true;
            break;
          }
        }
      }

      return changed ? next : prev;
    });
  }, [items]);

  const [showInspectorDetails, setShowInspectorDetails] = useState(false);
  const [showFullDimensions, setShowFullDimensions] = useState(false);
  const [showDeliveryWarranty, setShowDeliveryWarranty] = useState(false);
  const [showRotationControls, setShowRotationControls] = useState(false);
  const [previewVariantId, setPreviewVariantId] = useState<string | null>(null);
  const [previewMaterialPresetId, setPreviewMaterialPresetId] = useState<string | null>(null);
  const [hoveredColourVariantId, setHoveredColourVariantId] = useState<string | null>(null);
  const [hoveredColourPreview, setHoveredColourPreview] = useState<{
    variantId: string;
    x: number;
    y: number;
  } | null>(null);
  const [hoveredColourPreviewVisible, setHoveredColourPreviewVisible] = useState(false);
  const hoveredColourPreviewHideTimerRef = useRef<number | null>(null);
  const [itemConfigurationByInstanceId, setItemConfigurationByInstanceId] = useState<Record<string, string>>({});
    useEffect(() => {
      return () => {
        if (hoveredColourPreviewHideTimerRef.current) {
          window.clearTimeout(hoveredColourPreviewHideTimerRef.current);
          hoveredColourPreviewHideTimerRef.current = null;
        }
      };
    }, []);

  const [rotationInputValue, setRotationInputValue] = useState("0");
  const [rotationSnapPresetDegrees, setRotationSnapPresetDegrees] = useState<15 | 5 | 0>(15);

  const rotationSnapEnabled = rotationSnapPresetDegrees > 0;
  const rotationSnapStepDegrees = rotationSnapEnabled
    ? rotationSnapPresetDegrees
    : 1;
  const rotationSnapStepRadians = (rotationSnapStepDegrees * Math.PI) / 180;

  const selectedZone = selectedZoneId
    ? zones.find((zone) => zone.id === selectedZoneId) ?? null
    : null;

  const [pendingZoneType, setPendingZoneType] = useState<Zone["type"]>(
    "seating"
  );

  const createZoneFromSelection = useCallback(() => {
    const selectedSet = selectedIdsRef.current;
    if (!selectedSet.size) return;
    const selectedItems = itemsRef.current.filter((item) =>
      selectedSet.has(item.instanceId)
    );
    if (!selectedItems.length) return;
    const existing = zonesRef.current ?? [];
    const next = buildManualZoneFromSelection({
      selectedSet,
      selectedItems,
      pendingZoneType,
      existingZones: existing,
    });
    if (!next) return;

    setDesignSnapshot({
      ...designSnapshotRef.current,
      zones: next.zones,
    });
    setSelectedZoneId(next.zoneId);
    clearSelection();
  }, [clearSelection, pendingZoneType]);

  const autoCreateSeatingZone = useCallback(
    (sofaItem: PlacedItem) => {
      if (editorMode !== "design" || isClientPreview) return;
      if (seatingZoneAutoDisabledRef.current) return;
      const existing = zonesRef.current ?? [];
      const next = buildAutoSeatingZone({ sofaItem, existingZones: existing });
      if (!next) return;

      history.begin("auto_create_seating_zone");

      // NEW: Update only the active room
      const room = getActiveRoom(designSnapshotRef.current);
      if (room) {
        const updatedRoom = {
          ...room,
          zones: next.zones,
        };
        const nextSnapshot = {
          ...designSnapshotRef.current,
          rooms: designSnapshotRef.current.rooms.map((r) =>
            r.id === room.id ? updatedRoom : r
          ),
        };
        setDesignSnapshot(nextSnapshot);
      }

      history.commit();
      setSelectedZoneId(next.zoneId);
      track("seating_zone_auto_created", { zoneId: next.zoneId, trigger: "first_sofa" });
    },
    [editorMode, history, isClientPreview]
  );

  useEffect(() => {
    if (!isClientPreview) return;
    clearAllSelection();
  }, [clearAllSelection, isClientPreview]);

  const {
    importedModelById,
    resolveItemConfigurationCode: _resolveItemConfigurationCode,
    resolveItemConfigurationEntry,
    resolveConfiguredVisualDimsMm,
    resolveConfiguredPlanningDimsMm,
    resolveConfiguredNodeTransforms,
    resolveConfiguredModelUrl,
    selectedProduct,
    selectedImportedCatalog,
    selectedConfigurationCode,
    selectedConfigUi,
    selectedConfigOptions,
    selectedConfigEntry,
    selectedConfigBehavior,
    fullDimensionsDetails,
    itemPlanningBoundsByInstanceId,
  } = useDesignPageConfigState({
    importedModelOptions,
    itemConfigurationByInstanceId,
    importedModelUrlByAssetId,
    selectedItem,
    items,
    catalogItems: CATALOG_ITEMS,
  });
  const {
    selectedBrand,
    selectedModelTitle,
    modelOptionProductIds: _modelOptionProductIds,
    armStyleOptions,
    hasStructuredVariantLabels,
    modelSelectorProductIds,
    selectedModelProductId,
    lengthOptions,
    shapeOptions,
    orientationOptions,
    structuredVariants,
    activeStructuredVariant,
    activeMaterialLabel,
    activeMaterialType,
    activeVariantLabel,
    activeVariantColorHex,
    activeColourLabel,
    showFabricGroupingDebug: _showFabricGroupingDebug,
    selectedModelLabel: _selectedModelLabel,
    selectedCategoryDebugLabel,
    isCasaTvConsoleSelected: _isCasaTvConsoleSelected,
    isSebTvConsoleSelected: _isSebTvConsoleSelected,
    isSloaneTvConsoleSelected: _isSloaneTvConsoleSelected,
    isSloaneBenchSelected,
    activeSelectedBenchSize,
    activeSelectedBenchCushion,
    groupedVisibleColourVariants,
    hideColourSelector,
    materialOptions,
    useModelOptionsAsVariants,
    useLengthOptionsAsVariants,
    useShapeOptionsAsVariants,
    showVariantsSection,
    showFinishSection,
    sizeOptionsForActiveSelection,
    showSizeSection,
    hasWoodColourOptions,
  } = useDesignPageProductSelectorState({
    selectedProduct,
    selectedItem,
    catalogItems: CATALOG_ITEMS,
  });

  const handleResizeRoom2D = useCallback(
    (roomId: string, next: { x: number; z: number; w: number; d: number }) => {
      const width = clampRoomDimension(next.w);
      const depth = clampRoomDimension(next.d);

      if (!Number.isFinite(width) || !Number.isFinite(depth)) return;
      if (doesHouseRoomOverlap(roomId, next.x, next.z, width, depth, housePlan2D.rooms)) {
        showRuleToast("Rooms cannot overlap");
        return;
      }

      setDesignSnapshot((prev) => {
        const target = prev.rooms.find((room) => room.id === roomId);
        if (!target) return prev;

        const currentWall =
          typeof target.geometry.wallThickness === "number" && Number.isFinite(target.geometry.wallThickness)
            ? target.geometry.wallThickness
            : ROOM_DIMENSION_DEFAULTS.wallThickness;

        const normalizedItems = _normalizeItemsToRoom({
          items: target.items,
          width,
          depth,
          wall: currentWall,
          catalogItems: CATALOG_ITEMS,
          resolveConfiguredPlanningDimsMm,
        });

        return updateRoom(prev, {
          ...target,
          geometry: {
            ...target.geometry,
            width,
            depth,
            wallThickness: currentWall,
          },
          planPosition: {
            x: roundPlanCoordinate(next.x),
            z: roundPlanCoordinate(next.z),
          },
          items: normalizedItems,
        });
      });
    },
    [housePlan2D.rooms, resolveConfiguredPlanningDimsMm, showRuleToast]
  );

  const applyRoomSize = useCallback(
    (nextWidth: number, nextDepth: number) => {
      const room = activeRoom;
      if (!room) return;

      const width = clampRoomDimension(nextWidth);
      const depth = clampRoomDimension(nextDepth);

      if (!Number.isFinite(width) || !Number.isFinite(depth)) return;

      const currentWall =
        typeof room.geometry.wallThickness === "number" && Number.isFinite(room.geometry.wallThickness)
          ? room.geometry.wallThickness
          : ROOM_DIMENSION_DEFAULTS.wallThickness;

      const normalizedItems = _normalizeItemsToRoom({
        items: room.items,
        width,
        depth,
        wall: currentWall,
        catalogItems: CATALOG_ITEMS,
        resolveConfiguredPlanningDimsMm,
      });

      const nextRoom = {
        ...room,
        geometry: {
          ...room.geometry,
          width,
          depth,
          wallThickness: currentWall,
        },
        items: normalizedItems,
      };

      if (room.geometry.width === width && room.geometry.depth === depth) return;

      history.begin("Resize room");
      setDesignSnapshot((prev) => updateRoom(prev, nextRoom));
      history.commit();
      track("editor_room_resized", {
        roomId: room.id,
        width,
        depth,
      });

      setRoomWidthInput(width.toFixed(2));
      setRoomDepthInput(depth.toFixed(2));
    },
    [activeRoom, history, resolveConfiguredPlanningDimsMm, setRoomDepthInput, setRoomWidthInput]
  );

  const handleApplyRoomSize = useCallback(() => {
    const width = Number(roomWidthInput);
    const depth = Number(roomDepthInput);
    applyRoomSize(width, depth);
  }, [applyRoomSize, roomWidthInput, roomDepthInput]);

  const handleRoomPresetChange = useCallback(
    (presetId: RoomSizePresetId) => {
      const preset = ROOM_SIZE_PRESETS.find((item) => item.id === presetId);
      if (!preset) return;
      applyRoomSize(preset.width, preset.depth);
    },
    [applyRoomSize]
  );

  const isHuggWithWoodOptions =
    Boolean(selectedProduct?.id.includes("hugg")) && hasWoodColourOptions;

  const selectedResolvedVariant = useMemo(() => {
    if (!selectedProduct) return null;
    return resolveCatalogVariant(selectedProduct, selectedItem?.variantId);
  }, [selectedItem?.variantId, selectedProduct]);

  const selectedProductDetailSections = useMemo(
    () =>
      buildProductInfoSections({
        selectedProduct,
        selectedItem,
        selectedImportedCatalog,
        override: selectedProduct
          ? PRODUCT_DETAIL_SECTIONS_BY_PRODUCT_ID[selectedProduct.id] ?? null
          : null,
      }),
    [selectedImportedCatalog, selectedItem, selectedProduct]
  );
  const selectedDimensionImageUrl = useMemo(() => {
    if (!selectedProduct) return null;
    const activeVariant =
      selectedProduct.variants.find((variant) => variant.id === selectedItem?.variantId) ??
      selectedProduct.variants[0];
    const images = [
      ...(activeVariant?.galleryImages ?? []),
      ...(selectedProduct.metadata?.galleryImages ?? []),
    ];
    return images.find((url) => /(?:-|_)dim(?:-|_|\.)/i.test(url)) ?? null;
  }, [selectedItem?.variantId, selectedProduct]);

  const huggFabricSwatchOptions = useMemo(() => {
    if (!isHuggWithWoodOptions || !selectedProduct) {
      return [] as Array<{
        key: string;
        label: string;
        colorHex: string;
        productId: string;
        swatchTextureUrl: string | null;
        active: boolean;
      }>;
    }

    const currentId = selectedProduct.id;
    const huggPrefixMatch = currentId.match(
      /^(coffee-real-castlery-hugg-nesting-(?:square|rectangular|side-table)-performance-)/
    );
    const huggPrefix = huggPrefixMatch?.[1];
    if (!huggPrefix) {
      return [];
    }
    const familyIds = Object.keys(CATALOG_ITEMS).filter((id) => id.startsWith(huggPrefix));
    const suffix = currentId.endsWith("-opened")
      ? "-opened"
      : currentId.endsWith("-closed")
        ? "-closed"
        : "";

    const resolveProductIdForFabric = (code: "dune" | "basalt") => {
      const preferred = familyIds.find(
        (id) =>
          id.includes(`performance-${code}`) &&
          (!suffix || id.endsWith(suffix))
      );
      return preferred ?? familyIds.find((id) => id.includes(`performance-${code}`)) ?? "";
    };

    const duneProductId = resolveProductIdForFabric("dune");
    const basaltProductId = resolveProductIdForFabric("basalt");
    const options: Array<{
      key: string;
      label: string;
      colorHex: string;
      productId: string;
      swatchTextureUrl: string | null;
      active: boolean;
    }> = [];

    if (duneProductId) {
      options.push({
        key: "performance-dune",
        label: "Performance Dune",
        colorHex: "#ede8de",
        productId: duneProductId,
        swatchTextureUrl:
          CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE["performance-dune"] ?? null,
        active: currentId === duneProductId,
      });
    }

    if (basaltProductId) {
      options.push({
        key: "performance-basalt",
        label: "Performance Basalt",
        colorHex: "#8a8f96",
        productId: basaltProductId,
        swatchTextureUrl:
          CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE["performance-basalt"] ?? null,
        active: currentId === basaltProductId,
      });
    }

    return options;
  }, [isHuggWithWoodOptions, selectedProduct]);

  const singleWoodFinishSwatch = useMemo(() => {
    if (!selectedProduct || !activeStructuredVariant) return null;
    if (showFinishSection || huggFabricSwatchOptions.length > 1) return null;

    const visibleSwatchCount = groupedVisibleColourVariants.reduce(
      (count, group) => count + group.entries.length,
      0
    );
    if (visibleSwatchCount > 1) return null;

    const { variant } = activeStructuredVariant;
    const swatchGroup = String(variant.swatchGroup ?? "").trim().toLowerCase();
    const isWoodFinish =
      swatchGroup.includes("wood") || activeStructuredVariant.materialType === "Wood";
    if (!isWoodFinish) return null;

    const normalizeSwatchKey = (value?: string | null) =>
      String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/_/g, "-")
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const finishKey = normalizeSwatchKey(variant.finishCode);
    const finishLabelKey = normalizeSwatchKey(
      variant.finishLabel ?? activeStructuredVariant.colourLabel
    );
    const colourLabelKey = normalizeSwatchKey(activeStructuredVariant.colourLabel);
    const sourceSwatches = selectedProduct.id.toLowerCase().includes("hugg")
      ? HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE
      : CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE;
    const swatchTextureUrl =
      sourceSwatches[finishKey] ??
      sourceSwatches[finishLabelKey] ??
      sourceSwatches[colourLabelKey] ??
      null;
    if (!swatchTextureUrl) return null;

    const colorHex = variant.swatchHex ?? variant.colorHex ?? activeVariantColorHex ?? "#c8b79f";
    const selectedProductIdLower = selectedProduct.id.toLowerCase();
    const isSloaneLegFinish =
      selectedProductIdLower.includes("sloane-travertine") ||
      selectedProductIdLower.includes("sloane-dining-table") ||
      selectedProductIdLower.includes("sloane-bench");

    return {
      sectionLabel: isSloaneLegFinish ? "Leg" : "Wood colour",
      label:
        variant.finishLabel?.trim() ||
        activeStructuredVariant.colourLabel.trim() ||
        variant.label.trim(),
      colorHex,
      swatchTextureUrl,
    };
  }, [
    activeStructuredVariant,
    activeVariantColorHex,
    groupedVisibleColourVariants,
    huggFabricSwatchOptions.length,
    selectedProduct,
    showFinishSection,
  ]);

  const sloaneBenchMaterialSwatch = useMemo(() => {
    if (!selectedProduct || !isSloaneBenchSelected || activeSelectedBenchCushion !== "leather") {
      return null;
    }

    return {
      label: "Caramel",
      colorHex: "#8a643f",
      swatchTextureUrl:
        CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE["top-grain-leather-tan"] ??
        CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE["top_grain_leather_tan"] ??
        CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE["caramel_leather"] ??
        null,
    };
  }, [activeSelectedBenchCushion, isSloaneBenchSelected, selectedProduct]);

  const huggModelOptions = useMemo(() => {
    if (!isHuggWithWoodOptions || !selectedProduct) {
      return [] as Array<{
        key: "square" | "rectangular" | "side-table";
        label: string;
        productId: string;
        active: boolean;
      }>;
    }

    const match = selectedProduct.id.match(
      /^coffee-real-castlery-hugg-nesting-(square|rectangular|side-table)-performance-(dune|basalt)-(closed|opened)$/
    );
    if (!match) return [];

    const currentModel = match[1] as "square" | "rectangular" | "side-table";
    const fabric = match[2] as "dune" | "basalt";
    const layoutState = match[3] as "closed" | "opened";
    const options = [
      { key: "square" as const, label: "Square" },
      { key: "rectangular" as const, label: "Rectangular" },
      { key: "side-table" as const, label: "Side table" },
    ];

    return options
      .map((option) => {
        const productId = `coffee-real-castlery-hugg-nesting-${option.key}-performance-${fabric}-${layoutState}`;
        return {
          ...option,
          productId,
          active: option.key === currentModel,
        };
      })
      .filter((option) => Boolean(CATALOG_ITEMS[option.productId]));
  }, [isHuggWithWoodOptions, selectedProduct]);

  const sebCoffeeTableModelOptions = useMemo(() => {
    if (!selectedProduct) {
      return [] as Array<{
        key: "small-lift-top" | "large-lift-top" | "with-storage";
        label: string;
        productId: string;
        active: boolean;
      }>;
    }

    const currentId = selectedProduct.id;
    const isSebCoffeeTable =
      currentId === "coffee-real-castlery-seb-lift-top-small" ||
      currentId === "coffee-real-castlery-seb-lift-top-large" ||
      currentId === "coffee-real-castlery-seb-storage-90" ||
      currentId === "coffee-real-castlery-seb-storage-120";
    if (!isSebCoffeeTable) return [];

    const storageTargetProductId =
      currentId === "coffee-real-castlery-seb-storage-120" ||
      currentId === "coffee-real-castlery-seb-lift-top-large"
        ? "coffee-real-castlery-seb-storage-120"
        : "coffee-real-castlery-seb-storage-90";

    return [
      {
        key: "small-lift-top" as const,
        label: "Small lift top",
        productId: "coffee-real-castlery-seb-lift-top-small",
        active: currentId === "coffee-real-castlery-seb-lift-top-small",
      },
      {
        key: "large-lift-top" as const,
        label: "Large lift top",
        productId: "coffee-real-castlery-seb-lift-top-large",
        active: currentId === "coffee-real-castlery-seb-lift-top-large",
      },
      {
        key: "with-storage" as const,
        label: "With storage",
        productId: storageTargetProductId,
        active:
          currentId === "coffee-real-castlery-seb-storage-90" ||
          currentId === "coffee-real-castlery-seb-storage-120",
      },
    ].filter((option) => Boolean(CATALOG_ITEMS[option.productId] ?? importedModelById.get(option.productId)));
  }, [importedModelById, selectedProduct]);

  const isJaronConfigurationSelected = Boolean(
    selectedProduct && JARON_CONFIGURATION_PRODUCT_IDS.includes(selectedProduct.id)
  );

  const activeJaronArmKey = useMemo<JaronConfigurationArmKey>(() => {
    if (!selectedProduct) return "slim";
    return selectedProduct.id.endsWith("-wide-arm") ? "wide" : "slim";
  }, [selectedProduct]);

  const jaronConfigurationGroups = useMemo(
    () =>
      JARON_CONFIGURATION_GROUPS.map((group) => ({
        ...group,
        options: group.options.filter(
          (option) =>
            Boolean(CATALOG_ITEMS[option.slimProductId] ?? importedModelById.get(option.slimProductId)) ||
            Boolean(CATALOG_ITEMS[option.wideProductId] ?? importedModelById.get(option.wideProductId))
        ),
      })).filter((group) => group.options.length > 0),
    [importedModelById]
  );

  const activeJaronConfigurationGroup = useMemo(() => {
    if (!selectedProduct || !isJaronConfigurationSelected) return null;
    return (
      jaronConfigurationGroups.find((group) =>
        group.options.some(
          (option) =>
            option.slimProductId === selectedProduct.id ||
            option.wideProductId === selectedProduct.id
        )
      ) ?? null
    );
  }, [isJaronConfigurationSelected, jaronConfigurationGroups, selectedProduct]);

  const activeJaronConfigurationOption = useMemo(() => {
    if (!selectedProduct || !isJaronConfigurationSelected) return null;
    return (
      jaronConfigurationGroups
        .flatMap((group) => group.options)
        .find(
          (option) =>
            option.slimProductId === selectedProduct.id ||
            option.wideProductId === selectedProduct.id
      ) ?? null
    );
  }, [isJaronConfigurationSelected, jaronConfigurationGroups, selectedProduct]);

  const visibleJaronConfigurationGroup =
    activeJaronConfigurationGroup ?? jaronConfigurationGroups[0] ?? null;
  const visibleJaronConfigurationOption =
    activeJaronConfigurationOption ?? visibleJaronConfigurationGroup?.options[0] ?? null;
  const showJaronConfigurationSelector = Boolean(
    isJaronConfigurationSelected && visibleJaronConfigurationGroup
  );

  useEffect(() => {
    setPreviewVariantId(null);
    setPreviewMaterialPresetId(null);
    setShowInspectorDetails(false);
    setShowFullDimensions(false);
    setShowDeliveryWarranty(false);
    setShowRotationControls(false);
  }, [selectedInstanceId]);

  useEffect(() => {
    if (editorMode !== "buy") {
      setHoveredCartInstanceId(null);
    }
  }, [editorMode]);

  const getItemAABB = useCallback(
    (
      item: PlacedItem,
      positionOverride?: [number, number, number],
      rotationOverride?: number
    ) => {
      const product = CATALOG_ITEMS[item.productId];
      if (!product) return null;
      const configuredDims = resolveConfiguredPlanningDimsMm(item, product);
      const rotationY = rotationOverride ?? item.rotationY ?? 0;
      const [w, d] = getRotatedFootprint(
        configuredDims.w / 1000,
        configuredDims.d / 1000,
        rotationY
      );
      const pos = positionOverride ?? item.position;
      return computeAABB(pos, w, d);
    },
    [resolveConfiguredPlanningDimsMm]
  );

  const getSelectionBounds = useCallback(
    (selected: PlacedItem[]) => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const item of selected) {
        const aabb = getItemAABB(item);
        if (!aabb) continue;
        minX = Math.min(minX, aabb.minX);
        maxX = Math.max(maxX, aabb.maxX);
        minZ = Math.min(minZ, aabb.minZ);
        maxZ = Math.max(maxZ, aabb.maxZ);
      }
      if (!Number.isFinite(minX)) return null;
      return {
        minX,
        maxX,
        minZ,
        maxZ,
        centerX: (minX + maxX) / 2,
        centerZ: (minZ + maxZ) / 2,
      };
    },
    [getItemAABB]
  );

  const alignSelectionX = useCallback(() => {
    const nextItems = _buildAlignedSelectionItems({
      axis: "x",
      currentItems: itemsRef.current,
      selectedIds: selectedIdsRef.current,
      isDesigner,
      catalogItems: CATALOG_ITEMS,
      roomWidth,
      roomDepth,
      wallThickness,
      clampToRoom: clampToActiveRoom,
      getSelectionBounds,
      getItemAABB,
      aabbIntersects,
    });
    if (!nextItems) return;
    commitItems(nextItems, "Align X center");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitItems, isDesigner, roomDepth, roomWidth, wallThickness]);

  const alignSelectionZ = useCallback(() => {
    const nextItems = _buildAlignedSelectionItems({
      axis: "z",
      currentItems: itemsRef.current,
      selectedIds: selectedIdsRef.current,
      isDesigner,
      catalogItems: CATALOG_ITEMS,
      roomWidth,
      roomDepth,
      wallThickness,
      clampToRoom: clampToActiveRoom,
      getSelectionBounds,
      getItemAABB,
      aabbIntersects,
    });
    if (!nextItems) return;
    commitItems(nextItems, "Align Z center");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitItems, isDesigner, roomDepth, roomWidth, wallThickness]);

  const autoLayoutZone = useCallback(
    (zoneId: string) => {
      try {
        const autoLayout = _buildAutoLayoutZoneItems({
          zoneId,
          zones: zonesRef.current,
          currentItems: itemsRef.current,
          isDesigner,
          catalogItems: CATALOG_ITEMS,
          roomWidth,
          roomDepth,
          wallThickness,
          clampToRoom: clampToActiveRoom,
        });
        if (!autoLayout) return;
        commitItems(autoLayout.nextItems, `Auto-layout ${autoLayout.zoneType} zone`);
      } catch (error) {
        console.error("[Zone] Auto-layout failed", { zoneId, error });
      }
    },
    [clampToActiveRoom, commitItems, isDesigner, roomDepth, roomWidth, wallThickness]
  );

  const rotateZone = useCallback(
    (zoneId: string, deltaRot: number) => {
      try {
        const nextItems = _buildRotatedZoneItems({
          zoneId,
          deltaRot,
          zones: zonesRef.current,
          currentItems: itemsRef.current,
          isDesigner,
          catalogItems: CATALOG_ITEMS,
          roomWidth,
          roomDepth,
          wallThickness,
          clampToRoom: clampToActiveRoom,
          getSelectionBounds,
          getItemAABB,
          aabbIntersects,
        });
        if (!nextItems) return;
        commitItems(nextItems, "Rotate zone");
      } catch (error) {
        console.error("[Zone] Rotate failed", { zoneId, deltaRot, error });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitItems, isDesigner, roomDepth, roomWidth, wallThickness]
  );

  const ungroupZone = useCallback((zoneId: string) => {
    const zoneToRemove = (zonesRef.current ?? []).find((z) => z.id === zoneId);
    if (zoneToRemove?.type === "seating") {
      seatingZoneAutoDisabledRef.current = true;
      try {
        localStorage.setItem("seating_zone_auto_disabled", "1");
      } catch {
        // ignore storage errors
      }
    }
    const nextZones = (zonesRef.current ?? []).filter((z) => z.id !== zoneId);
    setDesignSnapshot({
      ...designSnapshotRef.current,
      zones: nextZones,
    });
    setSelectedZoneId(null);
  }, []);

  const getZoneBounds = useCallback(
    (zone: Zone) => {
      return _getZoneBounds(zone, items, getSelectionBounds);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items]
  );

  const getZoneLabel = (zoneType: Zone["type"]) => {
    return _getZoneLabel(zoneType);
  };

  const planZones2D = useMemo(() => {
    return _buildPlanZones2D(zones, items, getSelectionBounds);
  }, [getSelectionBounds, items, zones]);

  const editorScene2D = useMemo(
    () =>
      buildEditorScene2D({
        roomWidth,
        roomDepth,
        items,
        catalogItems: CATALOG_ITEMS,
        itemPlanningBoundsByInstanceId,
        selectedInstanceId,
        planAnnotations,
        planOpenings,
        planFixedElements,
      }),
    [
      itemPlanningBoundsByInstanceId,
      items,
      planAnnotations,
      planFixedElements,
      planOpenings,
      roomDepth,
      roomWidth,
      selectedInstanceId,
    ]
  );

  const applyPlanLayerPreset = useCallback((presetId: PlanLayerPresetId) => {
    const selectedPreset = PLAN_LAYER_PRESETS[presetId];
    setPlanLayerPreset(presetId);
    setPlanTheme(selectedPreset.theme);
    setPlanLayers({ ...selectedPreset.layers });
  }, []);

  const addPlanAnnotation = useCallback(
    (kind: "note" | "callout" | "room_tag") => {
      const defaultText =
        kind === "room_tag" ? "Living Room" : kind === "callout" ? "Keep clear" : "Main circulation";
      const text = window.prompt(
        kind === "room_tag" ? "Room tag" : kind === "callout" ? "Callout text" : "Annotation text",
        defaultText
      );
      if (!text) return;
      const id = `note-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const nextAnnotation = createPlanAnnotation({ id, kind, text });
      setPlanAnnotations((prev) => [...prev, nextAnnotation]);
      setSelectedPlanOverlayId(id);
    },
    []
  );

  const handleMoveOpening2D = useCallback(
    (id: string, offsetMeters: number) => {
      setPlanOpenings((prev) =>
        movePlanOpening(prev, id, offsetMeters, {
          rooms: housePlan2D.rooms,
          planWidthMeters: planViewWidth,
          planDepthMeters: planViewDepth,
        })
      );
    },
    [housePlan2D.rooms, planViewDepth, planViewWidth]
  );

  const handleUpdateOpeningMetrics2D = useCallback(
    (
      id: string,
      metrics: {
        widthMeters?: number;
        offsetMeters?: number;
      }
    ) => {
      setPlanOpenings((prev) =>
        updatePlanOpeningMetrics(prev, id, metrics, {
          rooms: housePlan2D.rooms,
          planWidthMeters: planViewWidth,
          planDepthMeters: planViewDepth,
        })
      );
    },
    [housePlan2D.rooms, planViewDepth, planViewWidth]
  );

  const handleAddSuggestedDoorway = useCallback(
    (suggestion: HouseRoomDoorwaySuggestion) => {
      const id = `opening-${Date.now()}`;
      const offsetMm = metersToMm(suggestion.offsetMeters);
      const widthMm = metersToMm(suggestion.widthMeters);
      const alreadyExists = planOpenings.some(
        (opening) =>
          opening.kind === "door" &&
          opening.roomId === suggestion.roomId &&
          opening.wall === suggestion.wall &&
          Math.abs(opening.offsetMm - offsetMm) <= Math.max(150, widthMm / 2)
      );

      if (alreadyExists) {
        showRuleToast("Doorway already exists");
        return;
      }

      setPlanOpenings((prev) => {
        const existing = prev.some(
          (opening) =>
            opening.kind === "door" &&
            opening.roomId === suggestion.roomId &&
            opening.wall === suggestion.wall &&
            Math.abs(opening.offsetMm - offsetMm) <= Math.max(150, widthMm / 2)
        );

        if (existing) return prev;

        return [
          ...prev,
          {
            id,
            roomId: suggestion.roomId,
            wall: suggestion.wall,
            kind: "door",
            offsetMm,
            widthMm,
          },
        ];
      });

      setSelectedPlanOverlayId(id);
      showRuleToast("Doorway added");
      track("floor_plan_suggested_doorway_added", {
        roomId: suggestion.roomId,
        adjacentRoomId: suggestion.adjacentRoomId,
        wall: suggestion.wall,
        widthMm,
      });
    },
    [planOpenings, showRuleToast]
  );

  const roomConnectionChecklistItems = useMemo(
    () =>
      buildHouseRoomConnectionChecklist(
        housePlan2D.rooms,
        planOpenings,
        designSnapshot.activeRoomId
    ),
    [designSnapshot.activeRoomId, housePlan2D.rooms, planOpenings]
  );
  const visiblePlanOpening = useMemo(() => {
    if (selectedPlanOpening) return selectedPlanOpening;
    if (selectedPlanOverlayId) return null;

    const connectedRoomIds = new Set(
      roomConnectionChecklistItems.flatMap((item) =>
        item.status === "connected" ? item.roomIds : []
      )
    );
    const recentOpenings = [...planOpenings].reverse();

    return (
      recentOpenings.find(
        (opening) =>
          opening.kind === "door" &&
          opening.roomId === designSnapshot.activeRoomId &&
          connectedRoomIds.has(opening.roomId)
      ) ??
      recentOpenings.find(
        (opening) =>
          opening.kind === "door" &&
          Boolean(opening.roomId) &&
          connectedRoomIds.has(opening.roomId!)
      ) ??
      null
    );
  }, [
    designSnapshot.activeRoomId,
    planOpenings,
    roomConnectionChecklistItems,
    selectedPlanOpening,
    selectedPlanOverlayId,
  ]);
  const visiblePlanOpeningRoomName = getPlanOpeningRoomName(visiblePlanOpening);
  const visiblePlanOpeningWallSpanMeters = getPlanOpeningWallSpan(visiblePlanOpening);

  const handleSelectFloorPlanTool = useCallback(() => {
    setViewMode("2d");
    setFloorPlanCalibrationMode(false);
    setFloorPlanCalibrationPoints([]);
    setFloorPlanTraceRoomMode(false);
    setFloorPlanTraceRoomPoints([]);
    setBlankGridRoomPreviewPoint(null);
    setFloorPlanTraceOpeningMode(false);
    setFloorPlanTraceOpeningPoints([]);
  }, []);

  const handleAddFloorPlanOpeningFromTool = useCallback(
    (kind: RoomOpening2D["kind"]) => {
      setViewMode("2d");
      setFloorPlanCalibrationMode(false);
      setFloorPlanCalibrationPoints([]);
      setFloorPlanTraceRoomMode(false);
      setFloorPlanTraceRoomPoints([]);
      setBlankGridRoomPreviewPoint(null);
      setFloorPlanTraceOpeningMode(false);
      setFloorPlanTraceOpeningPoints([]);

      if (kind === "door") {
        const suggestion =
          roomConnectionChecklistItems.find(
            (item) =>
              item.status === "needs_doorway" &&
              item.doorwaySuggestion &&
              item.roomIds.includes(designSnapshot.activeRoomId)
          )?.doorwaySuggestion ??
          roomConnectionChecklistItems.find(
            (item) => item.status === "needs_doorway" && item.doorwaySuggestion
          )?.doorwaySuggestion;

        if (suggestion) {
          handleAddSuggestedDoorway(suggestion);
          return;
        }
      }

      if (!activeRoom) {
        showRuleToast("Add a room first");
        return;
      }

      const id = `opening-${Date.now()}-${kind}`;
      const nextOpening: RoomOpening2D = {
        id,
        roomId: activeRoom.id,
        wall: kind === "door" ? "south" : "north",
        kind,
        offsetMm: 0,
        widthMm: kind === "door" ? 900 : 1200,
      };

      setPlanOpenings((prev) => [...prev, nextOpening]);
      setSelectedPlanOverlayId(id);
      showRuleToast(kind === "door" ? "Door added" : "Window added");
      track("floor_plan_quick_opening_added", {
        kind,
        roomId: activeRoom.id,
        wall: nextOpening.wall,
        widthMm: nextOpening.widthMm,
      });
    },
    [
      activeRoom,
      designSnapshot.activeRoomId,
      handleAddSuggestedDoorway,
      roomConnectionChecklistItems,
      showRuleToast,
    ]
  );

  const handleMoveFixedElement2D = useCallback((id: string, xMeters: number, zMeters: number) => {
    setPlanFixedElements((prev) => movePlanFixedElement(prev, id, xMeters, zMeters));
  }, []);

  const handleMoveAnnotation2D = useCallback((id: string, xMeters: number, zMeters: number) => {
    setPlanAnnotations((prev) => movePlanAnnotation(prev, id, xMeters, zMeters));
  }, []);

  const _getTopDownView = useCallback((): CameraView => {
    const height = Math.max(roomWidth, roomDepth) + roomHeight + 0.8;
    return {
      target: [0, roomHeight * 0.5, 0],
      pos: [0.001, height, 0.001],
      fov: 45,
    };
  }, [roomDepth, roomHeight, roomWidth]);

  const getPlan2DView = useCallback((): CameraView => {
    const span = Math.max(planViewWidth, planViewDepth);
    const height = span * 2.4 + roomHeight;
    return {
      target: [0, 0, 0],
      pos: [0, height, 0],
      // Wider FOV plus higher camera keeps the full room visible in plan mode.
      fov: 30,
    };
  }, [planViewDepth, planViewWidth, roomHeight]);

  const getWholeHome3DView = useCallback((): CameraView => {
    const span = Math.max(planViewWidth, planViewDepth, 4);
    const height = Math.max(5.2, span * 0.78 + roomHeight);
    const distance = Math.max(8, span * 1.18);

    return {
      target: [0, Math.min(1.1, roomHeight * 0.42), 0],
      pos: [distance * 0.72, height, distance],
      fov: 46,
    };
  }, [planViewDepth, planViewWidth, roomHeight]);

  const handleEditorViewModeChange = useCallback(
    (next: EditorViewMode) => {
      setViewMode(next);
      if (next === "3d") {
        setFloorPlanCalibrationMode(false);
        setFloorPlanCalibrationPoints([]);
        setFloorPlanTraceRoomMode(false);
        setFloorPlanTraceRoomPoints([]);
        setBlankGridRoomPreviewPoint(null);
        setFloorPlanTraceOpeningMode(false);
        setFloorPlanTraceOpeningPoints([]);
        transitionToCameraView(hasWholeHousePlan ? getWholeHome3DView() : DEFAULT_EDITOR_CAMERA_VIEW, 420);
      }
    },
    [getWholeHome3DView, hasWholeHousePlan, transitionToCameraView]
  );

  const handleFitPlanView = useCallback(() => {
    if (viewMode === "2d") {
      const camera = cameraRef.current;
      const controls = orbitControlsRef.current;

      if (camera instanceof THREE.OrthographicCamera && controls) {
        const canvas = canvasRef.current;
        camera.zoom = resolvePlanFitZoom({
          viewportWidthPx: canvas?.clientWidth ?? window.innerWidth,
          viewportHeightPx: canvas?.clientHeight ?? window.innerHeight,
          planWidthMeters: planViewWidth,
          planDepthMeters: planViewDepth,
        });
        camera.position.set(0, Math.max(planViewWidth, planViewDepth) + roomHeight + 6, 0);
        camera.up.set(0, 0, -1);
        (controls.target as THREE.Vector3).set(0, 0, 0);
        updateProjection(camera);
        controls.update();
        updateCameraViewFromScene();
      } else {
        transitionToCameraView(getPlan2DView(), 260);
      }
      showRuleToast("Plan fitted");
    } else {
      transitionToCameraView(hasWholeHousePlan ? getWholeHome3DView() : DEFAULT_EDITOR_CAMERA_VIEW, 420);
      showRuleToast(hasWholeHousePlan ? "Home fitted" : "Room fitted");
    }

    track("floor_plan_fit_clicked", {
      viewMode,
      roomCount: designSnapshot.rooms.length,
      planWidth: planViewWidth,
      planDepth: planViewDepth,
    });
  }, [
    designSnapshot.rooms.length,
    getPlan2DView,
    getWholeHome3DView,
    hasWholeHousePlan,
    planViewDepth,
    planViewWidth,
    roomHeight,
    showRuleToast,
    transitionToCameraView,
    updateCameraViewFromScene,
    updateProjection,
    viewMode,
  ]);

  const focusWholeHomeCameraPoint = useCallback(
    (x: number, z: number, durationMs = 280) => {
      const camera = cameraRef.current;
      const controls = orbitControlsRef.current;
      if (!camera || !controls) return;

      const currentTarget = controls.target as THREE.Vector3;
      const nextX = Math.max(
        wholeHomeNavigationBounds.minX,
        Math.min(wholeHomeNavigationBounds.maxX, x)
      );
      const nextZ = Math.max(
        wholeHomeNavigationBounds.minZ,
        Math.min(wholeHomeNavigationBounds.maxZ, z)
      );
      const deltaX = nextX - currentTarget.x;
      const deltaZ = nextZ - currentTarget.z;
      const perspectiveFov = camera instanceof THREE.PerspectiveCamera
        ? camera.fov
        : cameraView.fov ?? DEFAULT_EDITOR_CAMERA_VIEW.fov;

      transitionToCameraView(
        {
          pos: [
            camera.position.x + deltaX,
            camera.position.y,
            camera.position.z + deltaZ,
          ],
          target: [nextX, currentTarget.y, nextZ],
          fov: perspectiveFov,
        },
        durationMs
      );
    },
    [cameraView.fov, transitionToCameraView, wholeHomeNavigationBounds]
  );

  const clampWholeHomeNavigatorPoint = useCallback(
    (x: number, z: number) => {
      return {
        x: Math.max(
          wholeHomeNavigationBounds.minX,
          Math.min(wholeHomeNavigationBounds.maxX, x)
        ),
        z: Math.max(
          wholeHomeNavigationBounds.minZ,
          Math.min(wholeHomeNavigationBounds.maxZ, z)
        ),
      };
    },
    [wholeHomeNavigationBounds]
  );

  const handleWholeHomeMoveTarget = useCallback(
    (x: number, z: number) => {
      const camera = cameraRef.current;
      const controls = orbitControlsRef.current;
      if (!camera || !controls) return;

      const target = controls.target as THREE.Vector3;
      const next = clampWholeHomeNavigatorPoint(x, z);
      const deltaX = next.x - target.x;
      const deltaZ = next.z - target.z;
      target.set(next.x, target.y, next.z);
      camera.position.set(camera.position.x + deltaX, camera.position.y, camera.position.z + deltaZ);
      updateProjection(camera);
      controls.update();
      updateCameraViewFromScene();
    },
    [clampWholeHomeNavigatorPoint, updateCameraViewFromScene, updateProjection]
  );

  const handleWholeHomeMoveCamera = useCallback(
    (x: number, z: number) => {
      const camera = cameraRef.current;
      const controls = orbitControlsRef.current;
      if (!camera || !controls) return;

      const next = clampWholeHomeNavigatorPoint(x, z);
      camera.position.set(next.x, camera.position.y, next.z);
      updateProjection(camera);
      controls.update();
      updateCameraViewFromScene();
    },
    [clampWholeHomeNavigatorPoint, updateCameraViewFromScene, updateProjection]
  );

  const handleWholeHomeNavigatorZoom = useCallback(
    (direction: "in" | "out") => {
      const camera = cameraRef.current;
      const controls = orbitControlsRef.current;
      if (!camera || !controls) return;

      const target = controls.target as THREE.Vector3;
      const offset = camera.position.clone().sub(target);
      const currentDistance = Math.max(0.001, offset.length());
      const nextDistance = Math.max(
        2.5,
        Math.min(80, currentDistance * (direction === "in" ? 0.82 : 1.18))
      );
      offset.setLength(nextDistance);
      camera.position.copy(target).add(offset);
      updateProjection(camera);
      controls.update();
      updateCameraViewFromScene();
      track("floor_plan_navigator_zoom_clicked", {
        direction,
        roomCount: housePlan2D.rooms.length,
      });
    },
    [housePlan2D.rooms.length, updateCameraViewFromScene, updateProjection]
  );

  const handleWholeHomeFocusRoom = useCallback(
    (roomId: string) => {
      const room = housePlan2D.rooms.find((entry) => entry.id === roomId);
      if (!room) return;
      handleSwitchRoom(roomId);
      focusWholeHomeCameraPoint(room.x, room.z, 320);
      track("floor_plan_navigator_room_clicked", {
        roomId,
        roomType: room.roomType,
        roomCount: housePlan2D.rooms.length,
      });
    },
    [focusWholeHomeCameraPoint, handleSwitchRoom, housePlan2D.rooms]
  );

  const handleFloorPlanUnderlayUpload = useCallback(
    async (file: File) => {
      const mimeType = resolveFloorPlanUploadMimeType(file);
      if (!SUPPORTED_FLOOR_PLAN_MIME_TYPES.has(mimeType)) {
        showRuleToast("Upload a PNG, JPG, WebP, or PDF floor plan");
        return;
      }

      let assetUrl: string;
      let renderedMimeType = mimeType;
      let widthPx: number | undefined;
      let heightPx: number | undefined;
      let renderedPage: number | undefined;
      let pageCount: number | undefined;

      if (mimeType.startsWith("image/")) {
        floorPlanPdfSourceDataRef.current = null;
        setFloorPlanPdfSourceReady(false);
        try {
          assetUrl = await readFileAsDataUrl(file);
          const dimensions = await loadImageDimensions(assetUrl);
          widthPx = dimensions.width;
          heightPx = dimensions.height;
        } catch {
          showRuleToast("Floor plan image could not be read");
          return;
        }
      } else if (mimeType === "application/pdf") {
        try {
          const pdfData = await file.arrayBuffer();
          const rendered = await renderPdfPageToImageDataUrl(pdfData, 1);
          floorPlanPdfSourceDataRef.current = pdfData;
          setFloorPlanPdfSourceReady(true);
          assetUrl = rendered.dataUrl;
          renderedMimeType = "image/png";
          widthPx = rendered.widthPx;
          heightPx = rendered.heightPx;
          renderedPage = 1;
          pageCount = rendered.pageCount;
        } catch {
          floorPlanPdfSourceDataRef.current = null;
          setFloorPlanPdfSourceReady(false);
          showRuleToast("PDF floor plan could not be rendered");
          return;
        }
      } else {
        showRuleToast("Upload a PNG, JPG, WebP, or PDF floor plan");
        return;
      }

      revokeFloorPlanUnderlayUrl();
      floorPlanUnderlayUrlRef.current = null;

      const { widthMeters, depthMeters } = resolveUnderlayWorldSize({
        widthPx,
        heightPx,
        planWidthMeters: planViewWidth,
        planDepthMeters: planViewDepth,
      });

      setFloorPlanUnderlay({
        id: `underlay_${Date.now()}`,
        floorId: "floor_1",
        name: file.name || "Uploaded floor plan",
        assetUrl,
        mimeType: renderedMimeType,
        sourceMimeType: mimeType,
        renderedPage,
        pageCount,
        widthPx,
        heightPx,
        position: { x: 0, z: 0 },
        widthMeters,
        depthMeters,
        opacity: 0.45,
        rotationDeg: 0,
        locked: true,
      });
      setFloorPlanCalibrationMode(false);
      setFloorPlanCalibrationPoints([]);
      setFloorPlanCalibrationDistanceInput("");
      setFloorPlanTraceRoomMode(false);
      setFloorPlanTraceRoomPoints([]);
      setBlankGridRoomPreviewPoint(null);
      setFloorPlanTraceOpeningMode(false);
      setFloorPlanTraceOpeningPoints([]);
      setViewMode("2d");
      track("floor_plan_underlay_uploaded", {
        mimeType,
        renderedMimeType,
        renderedPage,
        pageCount,
        hasImagePreview: renderedMimeType.startsWith("image/"),
      });
    },
    [planViewDepth, planViewWidth, revokeFloorPlanUnderlayUrl, showRuleToast]
  );

  const handleFloorPlanUnderlayOpacityChange = useCallback((opacity: number) => {
    setFloorPlanUnderlay((prev) =>
      prev ? { ...prev, opacity: Math.max(0.15, Math.min(0.85, opacity)) } : prev
    );
  }, []);

  const handleFloorPlanUnderlayLockChange = useCallback((locked: boolean) => {
    setFloorPlanUnderlay((prev) => (prev ? { ...prev, locked } : prev));
  }, []);

  const handleFloorPlanPdfPageChange = useCallback(
    async (pageNumber: number) => {
      if (!floorPlanUnderlay || floorPlanUnderlay.sourceMimeType !== "application/pdf") {
        return;
      }

      const pdfData = floorPlanPdfSourceDataRef.current;
      if (!pdfData) {
        showRuleToast("Re-upload the PDF to switch pages");
        return;
      }

      const pageCount = floorPlanUnderlay.pageCount ?? 1;
      const nextPage = Math.min(Math.max(1, Math.round(pageNumber)), pageCount);
      setFloorPlanPdfRenderingPage(nextPage);

      try {
        const rendered = await renderPdfPageToImageDataUrl(pdfData, nextPage);
        const { widthMeters, depthMeters } = resolveUnderlayWorldSize({
          widthPx: rendered.widthPx,
          heightPx: rendered.heightPx,
          planWidthMeters: planViewWidth,
          planDepthMeters: planViewDepth,
        });

        setFloorPlanUnderlay((prev) =>
          prev
            ? {
                ...prev,
                assetUrl: rendered.dataUrl,
                mimeType: "image/png",
                widthPx: rendered.widthPx,
                heightPx: rendered.heightPx,
                widthMeters,
                depthMeters,
                renderedPage: nextPage,
                pageCount: rendered.pageCount,
                calibration: undefined,
              }
            : prev
        );
        setFloorPlanCalibrationMode(false);
        setFloorPlanCalibrationPoints([]);
        setFloorPlanCalibrationDistanceInput("");
        setFloorPlanTraceRoomMode(false);
        setFloorPlanTraceRoomPoints([]);
        setBlankGridRoomPreviewPoint(null);
        setFloorPlanTraceOpeningMode(false);
        setFloorPlanTraceOpeningPoints([]);
        showRuleToast(`PDF page ${nextPage} rendered`);
        track("floor_plan_pdf_page_rendered", {
          page: nextPage,
          pageCount: rendered.pageCount,
        });
      } catch {
        showRuleToast("PDF page could not be rendered");
      } finally {
        setFloorPlanPdfRenderingPage(null);
      }
    },
    [floorPlanUnderlay, planViewDepth, planViewWidth, showRuleToast]
  );

  const handleFloorPlanCalibrationModeChange = useCallback((enabled: boolean) => {
    setFloorPlanCalibrationMode(enabled);
    if (enabled) {
      setFloorPlanCalibrationPoints([]);
      setFloorPlanTraceRoomMode(false);
      setFloorPlanTraceRoomPoints([]);
      setBlankGridRoomPreviewPoint(null);
      setFloorPlanTraceOpeningMode(false);
      setFloorPlanTraceOpeningPoints([]);
    }
  }, []);

  const handleFloorPlanCalibrationPoint = useCallback((point: FloorPlanPoint) => {
    setFloorPlanCalibrationPoints((prev) => {
      if (prev.length >= 2) {
        return [point];
      }
      return [...prev, point];
    });
  }, []);

  const handleResetFloorPlanCalibrationPoints = useCallback(() => {
    setFloorPlanCalibrationPoints([]);
  }, []);

  const floorPlanCalibrationSummary = useMemo(() => {
    if (!floorPlanUnderlay?.calibration) return null;
    return `${floorPlanUnderlay.calibration.referenceLengthMeters}m set (${floorPlanUnderlay.widthMeters} x ${floorPlanUnderlay.depthMeters}m)`;
  }, [floorPlanUnderlay]);

  const handleApplyFloorPlanCalibration = useCallback(() => {
    if (!floorPlanUnderlay) return;
    if (floorPlanCalibrationPoints.length !== 2) {
      showRuleToast("Click two scale points first");
      return;
    }

    const referenceLengthMeters = Number(floorPlanCalibrationDistanceInput);
    const nextUnderlay = applyFloorPlanScaleCalibration({
      underlay: floorPlanUnderlay,
      points: [floorPlanCalibrationPoints[0], floorPlanCalibrationPoints[1]],
      referenceLengthMeters,
    });

    if (!nextUnderlay) {
      showRuleToast("Enter a valid scale distance");
      return;
    }

    setFloorPlanUnderlay(nextUnderlay);
    setFloorPlanCalibrationPoints([]);
    setFloorPlanCalibrationMode(false);
    setFloorPlanTraceRoomPoints([]);
    setBlankGridRoomPreviewPoint(null);
    setFloorPlanTraceOpeningPoints([]);
    track("floor_plan_underlay_calibrated", {
      referenceLengthMeters: nextUnderlay.calibration?.referenceLengthMeters,
      pixelsPerMeter: nextUnderlay.calibration?.pixelsPerMeter,
    });
  }, [
    floorPlanCalibrationDistanceInput,
    floorPlanCalibrationPoints,
    floorPlanUnderlay,
    showRuleToast,
  ]);

  const applyTracedRoomRectangle = useCallback(
    (bounds: TracedRoomRectangle) => {
      const isBlankGridRoomDraw = !floorPlanUnderlay?.mimeType.startsWith("image/");
      const canReplaceStarterRoom =
        Boolean(activeRoom) &&
        designSnapshot.rooms.length === 1 &&
        (isBlankGridRoomDraw ||
          ((activeRoom?.items.length ?? 0) === 0 &&
            (activeRoom?.zones.length ?? 0) === 0));
      const overlapRoomId = canReplaceStarterRoom && activeRoom ? activeRoom.id : "__new_traced_room__";

      if (
        doesHouseRoomOverlap(
          overlapRoomId,
          bounds.x,
          bounds.z,
          bounds.width,
          bounds.depth,
          housePlan2D.rooms
        )
      ) {
        showRuleToast("Traced room overlaps another room");
        return false;
      }

      if (canReplaceStarterRoom && activeRoom) {
        setDesignSnapshot((prev) => {
          const target = prev.rooms.find((room) => room.id === activeRoom.id);
          if (!target) return prev;

          return updateRoom(prev, {
            ...target,
            name: getRoomTypeLabel(floorPlanTraceRoomType),
            roomType: floorPlanTraceRoomType,
            geometry: {
              ...target.geometry,
              width: bounds.width,
              depth: bounds.depth,
              wallThickness:
                typeof target.geometry.wallThickness === "number" &&
                Number.isFinite(target.geometry.wallThickness)
                  ? target.geometry.wallThickness
                  : ROOM_DIMENSION_DEFAULTS.wallThickness,
            },
            planPosition: {
              x: bounds.x,
              z: bounds.z,
            },
            planShape: "rectangle",
          });
        });
      } else {
        handleAddRoom({
          roomType: floorPlanTraceRoomType,
          shape: "rectangle",
          width: bounds.width,
          depth: bounds.depth,
          planPosition: {
            x: bounds.x,
            z: bounds.z,
          },
        });
      }

      showRuleToast("Room drawn");
      track("floor_plan_room_drawn", {
        roomType: floorPlanTraceRoomType,
        width: bounds.width,
        depth: bounds.depth,
        replacedStarterRoom: canReplaceStarterRoom,
      });
      return true;
    },
    [
      activeRoom,
      designSnapshot.rooms.length,
      floorPlanUnderlay,
      floorPlanTraceRoomType,
      handleAddRoom,
      housePlan2D.rooms,
      setDesignSnapshot,
      showRuleToast,
    ]
  );

  const applyResolvedWallDrawRoom = useCallback(
    (resolvedRoom: ResolvedWallDrawRoom) => {
      if (resolvedRoom.shape === "rectangle") {
        return applyTracedRoomRectangle(resolvedRoom.bounds);
      }

      const { bounds } = resolvedRoom;
      const isBlankGridRoomDraw = !floorPlanUnderlay?.mimeType.startsWith("image/");
      const canReplaceStarterRoom =
        Boolean(activeRoom) &&
        designSnapshot.rooms.length === 1 &&
        (isBlankGridRoomDraw ||
          ((activeRoom?.items.length ?? 0) === 0 &&
            (activeRoom?.zones.length ?? 0) === 0));
      const overlapRoomId = canReplaceStarterRoom && activeRoom ? activeRoom.id : "__new_wall_room__";

      if (
        doesHouseRoomOverlap(
          overlapRoomId,
          bounds.x,
          bounds.z,
          bounds.width,
          bounds.depth,
          housePlan2D.rooms
        )
      ) {
        showRuleToast("Traced room overlaps another room");
        return false;
      }

      if (canReplaceStarterRoom && activeRoom) {
        setDesignSnapshot((prev) => {
          const target = prev.rooms.find((room) => room.id === activeRoom.id);
          if (!target) return prev;

          return updateRoom(prev, {
            ...target,
            name: getRoomTypeLabel(floorPlanTraceRoomType),
            roomType: floorPlanTraceRoomType,
            geometry: {
              ...target.geometry,
              width: bounds.width,
              depth: bounds.depth,
              wallThickness:
                typeof target.geometry.wallThickness === "number" &&
                Number.isFinite(target.geometry.wallThickness)
                  ? target.geometry.wallThickness
                  : ROOM_DIMENSION_DEFAULTS.wallThickness,
            },
            planPosition: {
              x: bounds.x,
              z: bounds.z,
            },
            planShape: resolvedRoom.shape,
            planPolygon: resolvedRoom.planPolygon,
          });
        });
      } else {
        handleAddRoom({
          roomType: floorPlanTraceRoomType,
          shape: resolvedRoom.shape,
          width: bounds.width,
          depth: bounds.depth,
          planPosition: {
            x: bounds.x,
            z: bounds.z,
          },
          planPolygon: resolvedRoom.planPolygon,
        });
      }

      showRuleToast("Custom room drawn");
      track("floor_plan_room_drawn", {
        roomType: floorPlanTraceRoomType,
        width: bounds.width,
        depth: bounds.depth,
        shape: resolvedRoom.shape,
        replacedStarterRoom: canReplaceStarterRoom,
      });
      return true;
    },
    [
      activeRoom,
      applyTracedRoomRectangle,
      designSnapshot.rooms.length,
      floorPlanTraceRoomType,
      floorPlanUnderlay,
      handleAddRoom,
      housePlan2D.rooms,
      setDesignSnapshot,
      showRuleToast,
    ]
  );

  const handleFloorPlanTraceRoomModeChange = useCallback((enabled: boolean) => {
    setFloorPlanTraceRoomMode(enabled);
    if (enabled) {
      setFloorPlanCalibrationMode(false);
      setFloorPlanCalibrationPoints([]);
      setFloorPlanTraceRoomPoints([]);
      setBlankGridRoomPreviewPoint(null);
      setFloorPlanTraceOpeningMode(false);
      setFloorPlanTraceOpeningPoints([]);
      setViewMode("2d");
    } else {
      setFloorPlanTraceRoomPoints([]);
      setBlankGridRoomPreviewPoint(null);
    }
  }, []);

  const handleFloorPlanDrawRoomModeChange = useCallback(
    (mode: FloorPlanDrawRoomMode) => {
      setFloorPlanDrawRoomMode(mode);
      setFloorPlanTraceRoomMode(true);
      setFloorPlanCalibrationMode(false);
      setFloorPlanCalibrationPoints([]);
      setFloorPlanTraceRoomPoints([]);
      setBlankGridRoomPreviewPoint(null);
      setFloorPlanTraceOpeningMode(false);
      setFloorPlanTraceOpeningPoints([]);
      setViewMode("2d");
    },
    []
  );

  useEffect(() => {
    if (isClientPreview || editorMode === "present" || viewMode !== "2d") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        handleFloorPlanDrawRoomModeChange("straight_wall");
      } else if (key === "f") {
        event.preventDefault();
        handleFloorPlanDrawRoomModeChange("rectangle_wall");
      } else if (key === "h") {
        event.preventDefault();
        handleFloorPlanDrawRoomModeChange("arc_wall");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editorMode, handleFloorPlanDrawRoomModeChange, isClientPreview, viewMode]);

  const handleResetFloorPlanTraceRoomPoints = useCallback(() => {
    setFloorPlanTraceRoomPoints([]);
    setBlankGridRoomPreviewPoint(null);
  }, []);

  const handleFloorPlanTraceRoomPoint = useCallback(
    (point: FloorPlanPoint) => {
      if (floorPlanDrawRoomMode === "straight_wall") {
        const snappedPoint = snapFloorPlanPointForWallDraw(
          {
            x: roundPlanCoordinate(point.x),
            z: roundPlanCoordinate(point.z),
          },
          {
            rooms: housePlan2D.rooms,
            previousPoint:
              floorPlanTraceRoomPoints.length > 0
                ? floorPlanTraceRoomPoints[floorPlanTraceRoomPoints.length - 1]
                : null,
            firstPoint: floorPlanTraceRoomPoints.length > 0 ? floorPlanTraceRoomPoints[0] : null,
            pointCount: floorPlanTraceRoomPoints.length,
          }
        );
        const lastPoint = floorPlanTraceRoomPoints[floorPlanTraceRoomPoints.length - 1];

        if (
          lastPoint &&
          Math.abs(lastPoint.x - snappedPoint.x) <= 0.001 &&
          Math.abs(lastPoint.z - snappedPoint.z) <= 0.001
        ) {
          setBlankGridRoomPreviewPoint(null);
          return;
        }

        const closingPath = isClosingWallDrawPoint(
          snappedPoint,
          floorPlanTraceRoomPoints[0],
          floorPlanTraceRoomPoints.length
        );

        if (closingPath) {
          const resolvedRoom = resolveClosedWallDrawRoom([
            ...floorPlanTraceRoomPoints,
            snappedPoint,
          ]);
          if (!resolvedRoom) {
            setFloorPlanTraceRoomPoints([]);
            setBlankGridRoomPreviewPoint(null);
            showRuleToast("Close straight wall segments into a valid room.");
            return;
          }

          if (applyResolvedWallDrawRoom(resolvedRoom)) {
            setFloorPlanTraceRoomPoints([]);
            setBlankGridRoomPreviewPoint(null);
          }
          return;
        }

        setFloorPlanTraceRoomPoints([...floorPlanTraceRoomPoints, snappedPoint]);
        setBlankGridRoomPreviewPoint(null);
        return;
      }

      const snappedPoint = floorPlanUnderlay
        ? snapFloorPlanPointToGrid(point)
        : snapFloorPlanPointForRoomDraw(point, { rooms: housePlan2D.rooms });
      const nextPoints =
        floorPlanTraceRoomPoints.length >= 2
          ? [snappedPoint]
          : [...floorPlanTraceRoomPoints, snappedPoint];

      setFloorPlanTraceRoomPoints(nextPoints);
      if (nextPoints.length !== 2) return;

      if (floorPlanDrawRoomMode === "arc_wall") {
        const arcRoom = resolveArcWallDrawPreview(nextPoints[0], nextPoints[1], {
          rooms: housePlan2D.rooms,
        }).resolvedRoom;
        if (!arcRoom) {
          setFloorPlanTraceRoomPoints([]);
          setBlankGridRoomPreviewPoint(null);
          showRuleToast("Draw a larger arc wall");
          return;
        }

        if (applyResolvedWallDrawRoom(arcRoom)) {
          setFloorPlanTraceRoomPoints([]);
          setBlankGridRoomPreviewPoint(null);
        }
        return;
      }

      const bounds = resolveTracedRoomRectangle([nextPoints[0], nextPoints[1]]);
      if (!bounds) {
        setFloorPlanTraceRoomPoints([]);
        setBlankGridRoomPreviewPoint(null);
        showRuleToast("Draw a larger room area");
        return;
      }

      if (applyTracedRoomRectangle(bounds)) {
        setFloorPlanTraceRoomPoints([]);
        setBlankGridRoomPreviewPoint(null);
      }
    },
    [
      applyTracedRoomRectangle,
      applyResolvedWallDrawRoom,
      floorPlanDrawRoomMode,
      floorPlanTraceRoomPoints,
      floorPlanUnderlay,
      housePlan2D.rooms,
      showRuleToast,
    ]
  );

  const handleFloorPlanTraceOpeningModeChange = useCallback((enabled: boolean) => {
    setFloorPlanTraceOpeningMode(enabled);
    if (enabled) {
      setFloorPlanCalibrationMode(false);
      setFloorPlanCalibrationPoints([]);
      setFloorPlanTraceRoomMode(false);
      setFloorPlanTraceRoomPoints([]);
      setBlankGridRoomPreviewPoint(null);
      setFloorPlanTraceOpeningPoints([]);
      setViewMode("2d");
    }
  }, []);

  const handleResetFloorPlanTraceOpeningPoints = useCallback(() => {
    setFloorPlanTraceOpeningPoints([]);
  }, []);

  const handleFloorPlanTraceOpeningPoint = useCallback(
    (point: FloorPlanPoint) => {
      const nextPoints =
        floorPlanTraceOpeningPoints.length >= 2
          ? [point]
          : [...floorPlanTraceOpeningPoints, point];

      setFloorPlanTraceOpeningPoints(nextPoints);
      if (nextPoints.length !== 2) return;

      const opening = resolveTracedOpening(
        [nextPoints[0], nextPoints[1]],
        housePlan2D.rooms,
        floorPlanTraceOpeningKind
      );

      if (!opening) {
        setFloorPlanTraceOpeningPoints([]);
        showRuleToast("Trace along a room wall");
        return;
      }

      const id = `opening-${Date.now()}`;
      setPlanOpenings((prev) => [
        ...prev,
        {
          id,
          ...opening,
        },
      ]);
      setSelectedPlanOverlayId(id);
      setFloorPlanTraceOpeningPoints([]);
      showRuleToast(opening.kind === "door" ? "Door traced" : "Window traced");
      track("floor_plan_opening_traced", {
        kind: opening.kind,
        roomId: opening.roomId,
        wall: opening.wall,
        widthMm: opening.widthMm,
      });
    },
    [floorPlanTraceOpeningKind, floorPlanTraceOpeningPoints, housePlan2D.rooms, showRuleToast]
  );

  const handleClearFloorPlanUnderlay = useCallback(() => {
    revokeFloorPlanUnderlayUrl();
    floorPlanPdfSourceDataRef.current = null;
    setFloorPlanPdfSourceReady(false);
    setFloorPlanUnderlay(null);
    setFloorPlanCalibrationMode(false);
    setFloorPlanCalibrationPoints([]);
    setFloorPlanCalibrationDistanceInput("");
    setFloorPlanTraceRoomMode(false);
    setFloorPlanTraceRoomPoints([]);
    setBlankGridRoomPreviewPoint(null);
    setFloorPlanTraceOpeningMode(false);
    setFloorPlanTraceOpeningPoints([]);
  }, [revokeFloorPlanUnderlayUrl]);

  useEffect(() => {
    if (!sceneReady) return;

    if (viewMode === "2d") {
      if (!last3DViewRef.current) {
        last3DViewRef.current = cameraView;
      }
      transitionToCameraView(getPlan2DView(), 420);
      return;
    }

    if (last3DViewRef.current) {
      const restore = last3DViewRef.current;
      last3DViewRef.current = null;
      transitionToCameraView(restore, 420);
    }
  }, [cameraView, getPlan2DView, sceneReady, transitionToCameraView, viewMode]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = orbitControlsRef.current;
    if (!camera || !controls) return;

    if (viewMode === "2d") {
      // For a true plan view, avoid up-vector singularity when looking straight down.
      camera.up.set(0, 0, -1);
      (controls.target as THREE.Vector3).set(0, 0, 0);
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = 0;
      controls.minAzimuthAngle = 0;
      controls.maxAzimuthAngle = 0;
    } else {
      camera.up.set(0, 1, 0);
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
    }

    updateProjection(camera);
    controls.update();
  }, [updateProjection, viewMode]);

  const getEyeLevelView = useCallback((): CameraView => {
    const sofa =
      items.find((it) => {
        const catalogItem = CATALOG_ITEMS[it.productId];
        return catalogItem ? mapToTopCategory(catalogItem.category, catalogItem) === "sofa" : false;
      }) ?? null;
    if (!sofa) {
      return {
        target: [...DEFAULT_EDITOR_CAMERA_VIEW.target],
        pos: [...DEFAULT_EDITOR_CAMERA_VIEW.pos],
        fov: DEFAULT_EDITOR_CAMERA_VIEW.fov,
      };
    }

    const product = CATALOG_ITEMS[sofa.productId];
    const sofaX = sofa.position?.[0] ?? 0;
    const sofaZ = sofa.position?.[2] ?? 0;
    const targetY = Math.max(0.8, product.dimsMm.h / 1000 * 0.5);
    const offsetBack = Math.max(2.2, product.dimsMm.d / 1000 * 2.8);

    return {
      target: [sofaX, targetY, sofaZ],
      pos: [sofaX, 1.5, sofaZ + offsetBack],
      fov: 45,
    };
  }, [items]);

  const getFocusView = useCallback((): CameraView => {
    if (!selectedItem || !selectedProduct) {
      return getEyeLevelView();
    }

    const rotation = selectedItem.rotationY ?? 0;
    const normalizedQuarterTurns =
      ((Math.round(rotation / (Math.PI / 2)) % 4) + 4) % 4;
    const isOddRot = normalizedQuarterTurns % 2 !== 0;
    const width = isOddRot ? selectedProduct.dimsMm.d / 1000 : selectedProduct.dimsMm.w / 1000;
    const depth = isOddRot ? selectedProduct.dimsMm.w / 1000 : selectedProduct.dimsMm.d / 1000;
    const centerX = selectedItem.position?.[0] ?? 0;
    const centerZ = selectedItem.position?.[2] ?? 0;
    const centerY = Math.max(0.4, selectedProduct.dimsMm.h / 1000 * 0.52);
    const itemSize = Math.max(width, depth, selectedProduct.dimsMm.h / 1000);
    const distance = Math.max(1.8, Math.min(4.4, itemSize * 2.4));

    return {
      target: [centerX, centerY, centerZ],
      pos: [
        centerX + distance * 0.42,
        centerY + Math.max(0.5, itemSize * 0.45),
        centerZ + distance,
      ],
      fov: 45,
    };
  }, [getEyeLevelView, selectedItem, selectedProduct]);

  const _saveCurrentView = useCallback(() => {
    const label = `View ${savedViews.length + 1}`;
    const next = [...savedViews, { name: label, view: cameraView }].slice(-6);
    setSavedViews(next);
    showRuleToast("Camera view saved");
  }, [cameraView, savedViews, showRuleToast]);

  useEffect(() => {
    const existing = new Set(items.map((it) => it.instanceId));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => existing.has(id)));
      const primary = primaryIdRef.current;
      const hasPrimary = primary ? next.has(primary) : false;
      if (!hasPrimary) {
        setPrimaryId(next.size ? Array.from(next)[0] : null);
      }
      if (next.size !== prev.size) return next;
      return prev;
    });
  }, [items]);

  useEffect(() => {
    if (!selectedZoneId) return;
    if (!zones.some((zone) => zone.id === selectedZoneId)) {
      setSelectedZoneId(null);
    }
  }, [selectedZoneId, zones]);

  useEffect(() => {
    const currentZones = zonesRef.current ?? [];
    const manualZones = _normalizeZones(
      currentZones.filter((zone) => zone.source === "manual"),
      items
    );
    const autoZones = _buildAutoZones({
      allItems: items,
      manualZones,
      catalogItems: CATALOG_ITEMS,
    });
    const nextZones = [...manualZones, ...autoZones];
    if (!_zonesEqual(nextZones, currentZones)) {
      setDesignSnapshot((prev) => {
        const room = getActiveRoom(prev);
        if (!room) return prev;
        return updateRoom(prev, {
          ...room,
          zones: nextZones,
        });
      });
    }
  }, [items]);

  useEffect(() => {
    if (!sceneReady) return;
    const t = window.setTimeout(() => {
      updateCameraViewFromScene();
    }, 0);
    return () => window.clearTimeout(t);
  }, [sceneReady, updateCameraViewFromScene]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...getStoredDesignForPersistence(designSnapshot),
          savedViews,
        })
      );
      setLastLocalAutosaveAt(Date.now());
    } catch {
      // ignore quota errors for now
    }
  }, [designSnapshot, getStoredDesignForPersistence, savedViews]);

  useEffect(() => {
    if (!designId) return;
    let cancelled = false;
    setIsSaving(true);
    const t = setTimeout(async () => {
      try {
        await fetch(`/api/designs/${designId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items,
            zones,
            savedViews,
            roomWidth,
            roomDepth,
            snapshot: getStoredDesignForPersistence(),
          }),
        });
        if (!cancelled) {
          setLastDbSaveAt(Date.now());
        }
      } catch {
        // ignore autosave errors
      } finally {
        if (!cancelled) {
          setIsSaving(false);
        }
      }
    }, 900);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [designId, getStoredDesignForPersistence, items, roomDepth, roomWidth, savedViews, zones]);

  useEffect(() => {
    if (designId || session?.user) return;
    const t = setTimeout(() => {
      saveGuestDesign({
        localId: "current",
        updatedAt: Date.now(),
        roomType: "living_room",
        itemsCount: items.length,
        snapshot: {
          title: "Guest Design",
          roomWidth,
          roomDepth,
          items,
          designSnapshot: getStoredDesignForPersistence(),
          style: style ?? null,
          budget: budget ?? null,
          mode: mode ?? null,
          notes: notes ?? null,
        },
      });
    }, 800);

    return () => clearTimeout(t);
  }, [
    budget,
    designId,
    getStoredDesignForPersistence,
    items,
    mode,
    notes,
    roomDepth,
    roomWidth,
    session?.user,
    style,
  ]);
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

  const instanceCounterRef = useRef(0);
  const newInstanceId = useCallback(() => {
    instanceCounterRef.current += 1;
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `i-${crypto.randomUUID()}`;
    }
    return `i-${Date.now()}-${instanceCounterRef.current}`;
  }, []);

  const resizeRugToSofaRule = (sofaItem: PlacedItem) => {
    const sofaProduct = CATALOG_ITEMS[sofaItem.productId];
    if (!sofaProduct) {
      throw new Error("No sofa found to size rug against.");
    }

    const bestRug = pickBestRugForSofa({
      sofaWidth: sofaProduct.dimsMm.w / 1000,
      style,
      budget,
    });

    if (!bestRug) {
      throw new Error("No rug available for this style and budget.");
    }

    const sofaX = sofaItem.position?.[0] ?? 0;
    const sofaZ = sofaItem.position?.[2] ?? -1.4;
    const sofaDepth = sofaProduct.dimsMm.d / 1000;
    const rugZ = sofaZ + sofaDepth * 0.35;

    let hasRug = false;
    const nextItems = itemsRef.current.map((item) => {
      if (CATALOG_ITEMS[item.productId]?.category !== "rug") return item;
      hasRug = true;
      return {
        ...item,
        productId: bestRug.id,
        variantId: bestRug.defaultVariantId,
      };
    });

    if (!hasRug) {
      const [safeX, safeZ] = clampToActiveRoom(
        sofaX,
        rugZ,
        bestRug.dimsMm.w / 1000,
        bestRug.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness,
        0
      );
      nextItems.push({
        instanceId: newInstanceId(),
        productId: bestRug.id,
        variantId: bestRug.defaultVariantId,
        position: [safeX, 0, safeZ],
        rotationY: 0,
        qty: 1,
        includeInCheckout: true,
      });
    }

    showRuleToast("Rug sized to sofa width");
    track("rule_applied", { rule: "rug_size", design_id: designId ?? null });

    return { items: nextItems } as DesignSnapshot;
  };

  const buildLayoutItemsFromPlan = (plan: LayoutPlan) => {
    const picks = plan?.picks ?? {};

    const backWallZ = -roomDepth / 2 + wallThickness + 0.2;
    const frontWallZ = roomDepth / 2 - wallThickness - 0.2;
    const centerX = 0;
    const WALKWAY = 0.6;

    const sofaId = picks.sofa as string | undefined;
    let rugId = picks.rug as string | undefined;
    const coffeeId = picks.coffee_table as string | undefined;
    const tvId = picks.tv_console as string | undefined;
    const chairId = picks.accent_chair as string | undefined;
    const lampId = picks.floor_lamp as string | undefined;

    const next: PlacedItem[] = [];

    const sofaP = sofaId ? CATALOG_ITEMS[sofaId] : null;
    let appliedRugRule = false;

    let sofaX = 0;
    let sofaZ = backWallZ;
    let coffeeX = centerX;
    let coffeeZ = backWallZ + 1.4;
    let lampX = 0;
    let lampZ = 0;

    if (sofaId && sofaP) {
      const p = sofaP;
      sofaX = 0;
      sofaZ = backWallZ;
      const [safeX, safeZ] = clampToActiveRoom(
        sofaX,
        sofaZ,
        p.dimsMm.w / 1000,
        p.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness
      );
      sofaX = safeX;
      sofaZ = safeZ;
      next.push({
        instanceId: newInstanceId(),
        productId: p.id,
        variantId: p.defaultVariantId,
        position: [sofaX, 0, sofaZ],
        rotationY: 0,
        qty: 1,
        includeInCheckout: true,
      });
    }

    if (sofaP) {
      const bestRug = pickBestRugForSofa({
        sofaWidth: sofaP.dimsMm.w / 1000,
        style,
        budget,
      });
      if (bestRug) {
        rugId = bestRug.id;
        appliedRugRule = true;
      }
    }

    if (rugId && sofaP && CATALOG_ITEMS[rugId]) {
      const rugP = CATALOG_ITEMS[rugId];
      let rugX = sofaX;
      let rugZ = sofaZ + sofaP.dimsMm.d / 1000 * 0.35;
      const [safeX, safeZ] = clampToActiveRoom(
        rugX,
        rugZ,
        rugP.dimsMm.w / 1000,
        rugP.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness
      );
      rugX = safeX;
      rugZ = safeZ;
      next.push({
        instanceId: newInstanceId(),
        productId: rugP.id,
        variantId: rugP.defaultVariantId,
        position: [rugX, 0, rugZ],
        rotationY: 0,
        qty: 1,
        includeInCheckout: true,
      });
    }

    if (coffeeId && sofaP && CATALOG_ITEMS[coffeeId]) {
      const coffeeP = CATALOG_ITEMS[coffeeId];

      const sofaDepth = sofaP.dimsMm.d / 1000;
      const coffeeDepth = coffeeP.dimsMm.d / 1000;
      const sofaFrontZ = sofaZ + sofaDepth / 2;

      coffeeX = sofaX;
      coffeeZ = sofaFrontZ + WALKWAY + coffeeDepth / 2;
      const [safeX, safeZ] = clampToActiveRoom(
        coffeeX,
        coffeeZ,
        coffeeP.dimsMm.w / 1000,
        coffeeP.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness
      );
      coffeeX = safeX;
      coffeeZ = safeZ;
      next.push({
        instanceId: newInstanceId(),
        productId: coffeeP.id,
        variantId: coffeeP.defaultVariantId,
        position: [coffeeX, 0, coffeeZ],
        rotationY: 0,
        qty: 1,
        includeInCheckout: true,
      });
    }

    if (tvId && CATALOG_ITEMS[tvId]) {
      const p = CATALOG_ITEMS[tvId];
      let tvX = centerX;
      let tvZ = frontWallZ;
      const [safeX, safeZ] = clampToActiveRoom(
        tvX,
        tvZ,
        p.dimsMm.w / 1000,
        p.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness
      );
      tvX = safeX;
      tvZ = safeZ;
      next.push({
        instanceId: newInstanceId(),
        productId: p.id,
        variantId: p.defaultVariantId,
        position: [tvX, 0, tvZ],
        qty: 1,
        includeInCheckout: true,
      });
    }

    let chairX = -1.1;
    let chairZ = backWallZ + 1.2;
    lampX = chairX + 0.45;
    lampZ = chairZ + 0.25;

    if (chairId && CATALOG_ITEMS[chairId]) {
      const p = CATALOG_ITEMS[chairId];
      const chairR = footprintRadius(p.dimsMm.w / 1000, p.dimsMm.d / 1000);

      if (sofaP) {
        const sofaR = footprintRadius(sofaP.dimsMm.w / 1000, sofaP.dimsMm.d / 1000);
        [chairX, chairZ] = separateIfOverlapping(
          chairX,
          chairZ,
          chairR,
          sofaX,
          sofaZ,
          sofaR,
          0.25
        );
      }

      if (coffeeId && CATALOG_ITEMS[coffeeId]) {
        const coffeeP = CATALOG_ITEMS[coffeeId];
        const coffeeR = footprintRadius(
          coffeeP.dimsMm.w / 1000,
          coffeeP.dimsMm.d / 1000
        );
        [chairX, chairZ] = separateIfOverlapping(
          chairX,
          chairZ,
          chairR,
          coffeeX,
          coffeeZ,
          coffeeR,
          0.25
        );
      }

      if (lampId && CATALOG_ITEMS[lampId]) {
        const lampP = CATALOG_ITEMS[lampId];
        const lampR = footprintRadius(lampP.dimsMm.w / 1000, lampP.dimsMm.d / 1000);
        [chairX, chairZ] = separateIfOverlapping(
          chairX,
          chairZ,
          chairR,
          lampX,
          lampZ,
          lampR,
          0.2
        );
      }

      const targetX = 0;
      const targetZ = coffeeZ;
      const preRotY = Math.atan2(targetX - chairX, targetZ - chairZ);

      const [safeX, safeZ] = clampToActiveRoom(
        chairX,
        chairZ,
        p.dimsMm.w / 1000,
        p.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness,
        preRotY
      );

      chairX = safeX;
      chairZ = safeZ;

      const rotationY = Math.atan2(targetX - chairX, targetZ - chairZ);

      next.push({
        instanceId: newInstanceId(),
        productId: p.id,
        variantId: p.defaultVariantId,
        position: [chairX, 0, chairZ],
        rotationY,
        qty: 1,
        includeInCheckout: true,
      });
    }

    if (lampId && CATALOG_ITEMS[lampId]) {
      const p = CATALOG_ITEMS[lampId];
      lampX = chairX + 0.45;
      lampZ = chairZ + 0.25;

      const preLampRotY = Math.atan2(chairX - lampX, chairZ - lampZ);
      const [safeX, safeZ] = clampToActiveRoom(
        lampX,
        lampZ,
        p.dimsMm.w / 1000,
        p.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness,
        preLampRotY
      );

      lampX = safeX;
      lampZ = safeZ;

      const lampRotY = Math.atan2(chairX - lampX, chairZ - lampZ);

      next.push({
        instanceId: newInstanceId(),
        productId: p.id,
        variantId: p.defaultVariantId,
        position: [lampX, 0, lampZ],
        rotationY: lampRotY,
        qty: 1,
        includeInCheckout: true,
      });
    }

    return { items: next, appliedRugRule };
  };

  const queueAiLayoutProposal = (plan: LayoutPlan, sourceLabel: string) => {
    const { items: proposedItems, appliedRugRule } = buildLayoutItemsFromPlan(plan);
    if (proposedItems.length === 0) {
      alert("Starter layout unavailable. Please add items manually.");
      return;
    }
    const validationResults = proposedItems.map((item) =>
      evaluateConstraints({
        design: { items: proposedItems },
        movedItemId: item.instanceId,
        room: { width: roomWidth, depth: roomDepth, wallThickness },
      })
    );
    const { warnings: validationWarnings, validationRisk } =
      collectAiLayoutValidationSummary(validationResults);
    const proposal = buildPendingAiLayoutProposal({
      plan,
      items: proposedItems,
      appliedRugRule,
      sourceLabel,
      style,
      budget,
      validationWarnings,
      validationRisk,
      itemNameByProductId: (productId) => CATALOG_ITEMS[productId]?.title,
    });

    setPendingAiLayoutProposal(proposal);
    setEditorMode("ai");
    setDesignPanelOpen(true);
    showRuleToast("Review AI layout before applying");
    track("ai_layout_proposed", {
      source: sourceLabel,
      seed: plan.meta?.seed ?? null,
      style,
      budget,
      item_count: proposedItems.length,
      fit_risk: proposal.fitRisk ?? null,
    });
  };

  const applyPendingAiLayoutProposal = () => {
    if (!pendingAiLayoutProposal) return;
    commitItems(pendingAiLayoutProposal.items, "Apply AI layout proposal");
    clearAllSelection();
    if (pendingAiLayoutProposal.appliedRugRule) {
      showRuleToast("Rug sized to sofa width");
      track("rule_applied", { rule: "rug_size", design_id: designId ?? null });
    } else {
      showRuleToast("AI layout applied");
    }
    track("ai_layout_applied", {
      source: pendingAiLayoutProposal.sourceLabel,
      seed: pendingAiLayoutProposal.seed ?? null,
      style: pendingAiLayoutProposal.style ?? style,
      budget: pendingAiLayoutProposal.budget ?? budget,
      item_count: pendingAiLayoutProposal.items.length,
      fit_risk: pendingAiLayoutProposal.fitRisk ?? null,
    });
    setPendingAiLayoutProposal(null);
  };

  const _getRandomSeed = () => {
    if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return Number(buf[0]);
    }
    return Math.floor(Math.random() * 1_000_000_000);
  };

  const buildLocalStarterPlan = (seedNum: number) => {
    const all = Object.values(CATALOG_ITEMS);
    const styleNorm = String(style ?? "Modern").toLowerCase();
    const budgetNorm = String(budget ?? "$$");

    const seeded = (offset: number) => {
      const x = Math.sin(seedNum + offset) * 10000;
      return x - Math.floor(x);
    };

    const pickLocalByCategory = (category: string, offset: number) => {
      const styleItems = all
        .filter(
          (p) =>
            mapToTopCategory(p.category, p) === category &&
            p.styleTags?.some((t) => String(t).toLowerCase() === styleNorm)
        )
        .sort((a, b) => getItemPrice(a) - getItemPrice(b));

      const allItems = all
        .filter((p) => mapToTopCategory(p.category, p) === category)
        .sort((a, b) => getItemPrice(a) - getItemPrice(b));

      const items = styleItems.length >= 2 ? styleItems : allItems;
      if (!items.length) return null;

      if (budgetNorm === "$") return items[0];
      if (budgetNorm === "$$$") return items[items.length - 1];

      const idx = Math.floor(seeded(offset) * items.length);
      return items[Math.max(0, Math.min(items.length - 1, idx))];
    };

    return {
      picks: {
        sofa: pickLocalByCategory("sofa", 11)?.id,
        rug: pickLocalByCategory("rug", 22)?.id,
        coffee_table: pickLocalByCategory("coffee_table", 33)?.id,
        tv_console:
          pickLocalByCategory("tv_console", 44)?.id ??
          pickLocalByCategory("sideboard", 444)?.id ??
          null,
        accent_chair: pickLocalByCategory("accent_chair", 55)?.id ?? null,
        floor_lamp: pickLocalByCategory("floor_lamp", 66)?.id ?? null,
      },
      meta: { style: styleNorm, budget: budgetNorm, seed: seedNum, source: "local_fallback" },
    };
  };

  const runAiLayout = async (nextSeed?: number) => {
    if (!session?.user) {
      openGuestPrompt("ai_layout", () => {});
      return;
    }
    const seedToUse = nextSeed ?? aiSeed;

    if (nextSeed !== undefined) {
      setAiSeed(nextSeed);
    }
    setPendingAiLayoutProposal(null);

    const catalogList = Object.values(CATALOG_ITEMS).map((p) => ({
      id: p.id,
      category: p.category,
      price: getItemPrice(p),
      styleTags: p.styleTags,
      dimensions: getDimensions(p),
      defaultVariantId: p.defaultVariantId,
    }));

    const applyFallbackLayout = (reason: string) => {
      const fallback = buildLocalStarterPlan(seedToUse);
      const hasCoreStarter = Boolean(fallback.picks.sofa && fallback.picks.coffee_table && fallback.picks.rug);
      if (!hasCoreStarter) {
        alert(reason || "Starter layout unavailable. Please add items manually.");
        return;
      }
      queueAiLayoutProposal(fallback, "Local starter");
      track("ai_layout_fallback_used", { reason, seed: seedToUse, style, budget });
    };

    if (activeRoom?.roomType && activeRoom.roomType !== "living") {
      showRuleToast("AI layout currently supports living rooms first");
      track("ai_layout_unsupported_room_type", {
        room_type: activeRoom.roomType,
        seed: seedToUse,
        style,
        budget,
      });
      return;
    }

    const describeStarterValidationIssues = (plan: LayoutPlan): string[] => {
      const issues: string[] = [];
      const picks = plan?.picks ?? {};
      const requiredRoles: Array<"sofa" | "rug" | "coffee_table"> = ["sofa", "rug", "coffee_table"];

      for (const role of requiredRoles) {
        const pickId = picks?.[role];
        if (!pickId || typeof pickId !== "string") {
          issues.push(`${role} missing catalog item`);
          continue;
        }
        if (!CATALOG_ITEMS[pickId]) {
          issues.push(`${role} catalog item not found: ${pickId}`);
        }
      }

      return issues;
    };

    const requiredCategoryCounts = {
      sofa: catalogList.filter((p) => catalogMatchesAiLayoutRole("sofa", p.category)).length,
      rug: catalogList.filter((p) => catalogMatchesAiLayoutRole("rug", p.category)).length,
      coffee_table: catalogList.filter((p) =>
        catalogMatchesAiLayoutRole("coffee_table", p.category)
      ).length,
    };

    if (!requiredCategoryCounts.sofa || !requiredCategoryCounts.rug || !requiredCategoryCounts.coffee_table) {
      const reasons: string[] = [];
      if (!requiredCategoryCounts.sofa) reasons.push("no live-approved sofa available");
      if (!requiredCategoryCounts.rug) reasons.push("no live-approved rug available");
      if (!requiredCategoryCounts.coffee_table) reasons.push("no live-approved coffee_table available");
      applyFallbackLayout(`Starter plan failed validation: ${reasons.join(", ")}`);
      return;
    }

    try {
      const res = await fetch("/api/ai/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomWidth,
          roomDepth,
          roomType: activeRoom?.roomType ?? "living",
          style,
          budget,
          seed: seedToUse,
          catalog: catalogList,
        }),
      });

      const plan = await res.json();

      if (!res.ok) {
        if (plan?.code === "unsupported_room_type") {
          showRuleToast("AI layout currently supports living rooms first");
          track("ai_layout_unsupported_room_type", {
            room_type: plan?.meta?.roomType ?? activeRoom?.roomType ?? "unknown",
            seed: seedToUse,
            style,
            budget,
          });
          return;
        }
        applyFallbackLayout(plan?.error ?? "AI failed");
        return;
      }

      const issues = describeStarterValidationIssues(plan);
      if (issues.length > 0) {
        applyFallbackLayout(`Starter plan failed validation: ${issues.join("; ")}`);
        return;
      }

      queueAiLayoutProposal(plan, "AI starter");
      if (plan?.quality?.fitRisk && plan.quality.fitRisk !== "low") {
        showRuleToast(
          plan.quality.fitRisk === "high"
            ? "AI layout needs fit review"
            : "AI layout fits tightly"
        );
        track("ai_layout_fit_warning", {
          fit_risk: plan.quality.fitRisk,
          warnings: plan.quality.warnings ?? [],
          seed: seedToUse,
          style,
          budget,
        });
      }
    } catch (err) {
      applyFallbackLayout(err instanceof Error ? err.message : "AI failed");
    }
  };

  const onBulkSwap = (direction: "cheaper" | "premium") => {
    const actionName = direction === "cheaper" ? "Make room cheaper" : "Make room premium";
    commitItems((prev) => bulkSwapItems({ items: prev, style, direction }), actionName);
  };

  const addItem = useCallback((
    productId: string,
    position: [number, number, number],
    rotationY?: number,
    variantId?: string
  ) => {
    const product = CATALOG_ITEMS[productId];
    if (!product) return;

    const instanceId = newInstanceId();
    const [safeX, safeZ] = clampToActiveRoom(
      position[0],
      position[2],
      product.dimsMm.w / 1000,
      product.dimsMm.d / 1000,
      roomWidth,
      roomDepth,
      wallThickness,
      rotationY ?? 0
    );

    commitItems(
      (prev) => [
        ...prev,
        {
          instanceId,
          productId,
          variantId: variantId ?? product.defaultVariantId,
          position: [safeX, position[1], safeZ],
          rotationY,
          qty: 1,
          includeInCheckout: true,
        },
      ],
      `Add ${product.title || "Item"}`
    );
    updateSelection(new Set([instanceId]), instanceId);
  }, [
    clampToActiveRoom,
    commitItems,
    newInstanceId,
    roomDepth,
    roomWidth,
    updateSelection,
    wallThickness,
  ]);

  const addCatalogItemToRoom = useCallback((productId: string, variantId?: string) => {
    const itemCount = itemsRef.current.length;
    const column = itemCount % 3;
    const row = Math.floor(itemCount / 3);
    const position: [number, number, number] =
      itemCount === 0
        ? [0, 0, -1.4]
        : [(column - 1) * 0.9, 0, Math.min(1.6, -0.4 + row * 0.9)];

    addItem(productId, position, undefined, variantId);
  }, [addItem]);

  const canEdit = !isClientPreview && liveCatalogReady;
  const _isSharedLink = Boolean(shareToken) || pathname?.includes("/share/");
  const catalogItems = useMemo(() => {
    const allItems = Object.values(CATALOG_ITEMS);
    const importedIds = new Set(importedModelOptions.map((option) => option.id));
    const dedupedByFamily = new Map<string, (typeof allItems)[number]>();

    for (const item of allItems) {
      const brand = String(item.metadata?.brand ?? "").trim().toLowerCase();
      const family = String(item.metadata?.productFamily ?? "").trim().toLowerCase();
      const productName = String(item.metadata?.productName ?? item.title ?? "")
        .trim()
        .toLowerCase();
      const dedupeKey = `${brand}|${item.category}|${family}|${productName}`;

      const existing = dedupedByFamily.get(dedupeKey);
      if (!existing) {
        dedupedByFamily.set(dedupeKey, item);
        continue;
      }

      const itemIsImported = importedIds.has(item.id);
      const existingIsImported = importedIds.has(existing.id);
      if (itemIsImported && !existingIsImported) {
        dedupedByFamily.set(dedupeKey, item);
        continue;
      }
      if (!itemIsImported && existingIsImported) {
        continue;
      }

      const currentVariants = item.variants.length;
      const existingVariants = existing.variants.length;
      if (currentVariants > existingVariants) {
        dedupedByFamily.set(dedupeKey, item);
      }
    }

    return Array.from(dedupedByFamily.values());
  }, [importedModelOptions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/models/imported", { cache: "no-store" });
        const payload = (await res.json().catch(() => ({ models: [] }))) as {
          models?: ImportedModelEntry[];
        };
        if (cancelled) return;
        const { options, modelUrlByAssetId } = buildImportedModelOptions({
          models: payload.models ?? [],
          importedProductConfigById: IMPORTED_PRODUCT_CONFIG_BY_ID,
        });

        setImportedModelUrlByAssetId(modelUrlByAssetId);
        setImportedModelOptions(options);
      } catch {
        if (!cancelled) {
          setImportedModelUrlByAssetId({});
          setImportedModelOptions([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const isCuratedHuggNestingProductId = useCallback((productId: string) => {
    return /^coffee-real-castlery-hugg-nesting-(square|rectangular|side-table)-performance-/.test(productId);
  }, []);

  const ensureImportedCatalogItem = useCallback((productId: string) => {
    const existing = CATALOG_ITEMS[productId];
    const imported = importedModelById.get(productId);
    if (!imported) return;

    const isImportedExisting = Boolean(
      existing && String(existing.defaultVariantId ?? "").startsWith("imported-")
    );
    const importedSupportsConfigurableStates = Boolean(
      imported.catalog?.configurableMetadata?.is_configurable ||
      (imported.catalog?.configurations?.length ?? 0) > 0
    );
    if (
      existing &&
      !isImportedExisting &&
      isCuratedHuggNestingProductId(productId) &&
      !importedSupportsConfigurableStates
    ) {
      // Preserve curated Hugg variants (fabric x wood) and avoid replacing them
      // with incomplete imported payloads.
      return;
    }
    if (existing && !isImportedExisting && !importedSupportsConfigurableStates) {
      return;
    }

    upsertImportedCatalogItem({
      productId,
      imported,
      importedProductConfigById: IMPORTED_PRODUCT_CONFIG_BY_ID,
      importedVariantByProductId: IMPORTED_VARIANT_BY_PRODUCT_ID,
      importedVariantsByProductId: IMPORTED_VARIANTS_BY_PRODUCT_ID,
    });
  }, [importedModelById, isCuratedHuggNestingProductId]);

  const switchSelectedProductModel = useCallback(
    (targetProductId: string, historyLabel: string) => {
      if (!selectedItem || !selectedProduct || targetProductId === selectedProduct.id) return;

      ensureImportedCatalogItem(targetProductId);
      const optionProduct = CATALOG_ITEMS[targetProductId];
      if (!optionProduct) return;

      commitItems(
        (prev) => {
          const current = prev.find((it) => it.instanceId === selectedItem.instanceId);
          const currentVariant = selectedProduct.variants.find(
            (variant) => variant.id === current?.variantId
          );
          const currentFinishCode = String(currentVariant?.finishCode ?? "")
            .trim()
            .toLowerCase();
          const currentMaterialType = String(currentVariant?.materialType ?? "")
            .trim()
            .toLowerCase();
          const currentLabel = String(currentVariant?.label ?? "")
            .trim()
            .toLowerCase();
          const nextVariant =
            optionProduct.variants.find((variant) =>
              currentFinishCode
                ? String(variant.finishCode ?? "").trim().toLowerCase() === currentFinishCode
                : false
            ) ??
            optionProduct.variants.find((variant) =>
              currentMaterialType
                ? String(variant.materialType ?? "").trim().toLowerCase() ===
                  currentMaterialType
                : false
            ) ??
            optionProduct.variants.find(
              (variant) => String(variant.label ?? "").trim().toLowerCase() === currentLabel
            ) ??
            optionProduct.variants[0];

          return prev.map((it) =>
            it.instanceId === selectedItem.instanceId
              ? {
                  ...it,
                  productId: optionProduct.id,
                  variantId: nextVariant?.id ?? optionProduct.defaultVariantId,
                }
              : it
          );
        },
        historyLabel
      );
    },
    [commitItems, ensureImportedCatalogItem, selectedItem, selectedProduct]
  );

  const importedFamilyOptions = useMemo(() => {
    const seen = new Set<string>();
    return importedModelOptions
      .filter((option) => {
        if (!option.familyKey || seen.has(option.familyKey)) {
          return false;
        }
        seen.add(option.familyKey);
        return true;
      })
      .map((option) => ({
        familyKey: option.familyKey,
        familyLabel: option.familyLabel,
      }));
  }, [importedModelOptions]);

  const visibleImportedModelOptions = useMemo(() => {
    if (!selectedImportedFamilyKey) {
      return importedModelOptions;
    }

    const matchingOptions = importedModelOptions.filter(
      (option) => option.familyKey === selectedImportedFamilyKey
    );

    return matchingOptions.length > 0 ? matchingOptions : importedModelOptions;
  }, [importedModelOptions, selectedImportedFamilyKey]);

  useEffect(() => {
    if (importedFamilyOptions.length === 0) {
      if (selectedImportedFamilyKey !== "") {
        setSelectedImportedFamilyKey("");
      }
      if (selectedImportedProductId !== "") {
        setSelectedImportedProductId("");
      }
      return;
    }

    const familyExists = importedFamilyOptions.some(
      (option) => option.familyKey === selectedImportedFamilyKey
    );
    const nextFamilyKey = familyExists
      ? selectedImportedFamilyKey
      : importedFamilyOptions[0]?.familyKey ?? "";

    if (nextFamilyKey !== selectedImportedFamilyKey) {
      setSelectedImportedFamilyKey(nextFamilyKey);
    }

    const matchingOptions = importedModelOptions.filter(
      (option) => option.familyKey === nextFamilyKey
    );
    const nextVisibleOptions =
      matchingOptions.length > 0 ? matchingOptions : importedModelOptions;
    const productExists = nextVisibleOptions.some(
      (option) => option.id === selectedImportedProductId
    );
    const nextProductId = productExists
      ? selectedImportedProductId
      : nextVisibleOptions[0]?.id ?? "";

    if (nextProductId !== selectedImportedProductId) {
      setSelectedImportedProductId(nextProductId);
    }
  }, [
    importedFamilyOptions,
    importedModelOptions,
    selectedImportedFamilyKey,
    selectedImportedProductId,
  ]);

  useEffect(() => {
    if (importedModelOptions.length === 0) return;

    let injectedAny = false;
    for (const option of importedModelOptions) {
      const existing = CATALOG_ITEMS[option.id];
      const isImportedExisting = Boolean(
        existing && String(existing.defaultVariantId ?? "").startsWith("imported-")
      );
      const optionSupportsConfigurableStates = Boolean(
        option.catalog?.configurableMetadata?.is_configurable ||
        (option.catalog?.configurations?.length ?? 0) > 0
      );
      if (
        existing &&
        !isImportedExisting &&
        isCuratedHuggNestingProductId(option.id) &&
        !optionSupportsConfigurableStates
      ) {
        continue;
      }
      if (existing && !isImportedExisting && !optionSupportsConfigurableStates) {
        continue;
      }
      if (!shouldRefreshImportedCatalogItem(existing, option)) {
        continue;
      }
      ensureImportedCatalogItem(option.id);
      injectedAny = true;
    }

    // Force a render pass so catalog selectors reflect newly injected items.
    if (injectedAny) {
      setImportedModelOptions((prev) => [...prev]);
    }
  }, [ensureImportedCatalogItem, importedModelOptions, isCuratedHuggNestingProductId]);

  const getRelatedImportedProductIds = useCallback((productId: string) => {
    const related = new Set<string>([productId]);

    const family = MODEL_FAMILY_BY_PRODUCT_ID[productId] ?? [];
    for (const id of family) related.add(id);

    const armOptions = ARM_STYLE_OPTIONS_BY_PRODUCT_ID[productId] ?? [];
    for (const option of armOptions) {
      if (option.productId) related.add(option.productId);
    }

    const lengthOpts = LENGTH_OPTIONS_BY_PRODUCT_ID[productId] ?? [];
    for (const option of lengthOpts) {
      if (option.productId) related.add(option.productId);
    }

    const modelSelector = MODEL_SELECTOR_PRODUCT_IDS_BY_PRODUCT_ID[productId] ?? [];
    for (const id of modelSelector) related.add(id);

    const orientationOpts = ORIENTATION_OPTIONS_BY_PRODUCT_ID[productId] ?? [];
    for (const option of orientationOpts) {
      if (option.productId) related.add(option.productId);
    }

    const source = importedModelOptions.find((opt) => opt.id === productId);
    const sourceFamilyRaw = source?.catalog?.productFamily ?? "";
    const sourceFamily = normalizeImportedFamilyName(sourceFamilyRaw).toLowerCase();
    const linkedProducts = source?.catalog?.compatibility?.related_products ?? [];
    const linkedNames = linkedProducts
      .map((entry) => String(entry?.product_name ?? "").trim().toLowerCase())
      .filter(Boolean);
    for (const option of importedModelOptions) {
      const optionFamilyRaw = option.catalog?.productFamily ?? "";
      const optionFamily = normalizeImportedFamilyName(optionFamilyRaw).toLowerCase();
      const optionName = option.catalog?.productName?.trim().toLowerCase();
      if (sourceFamily && optionFamily === sourceFamily) {
        related.add(option.id);
        continue;
      }
      if (optionName && linkedNames.includes(optionName)) {
        related.add(option.id);
      }
    }

    return Array.from(related);
  }, [importedModelOptions]);

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
    itemCart.forEach((cartItem) => {
      for (let i = 0; i < cartItem.qty; i++) {
        addCatalogItemToRoom(cartItem.productId);
      }
    });
    clearCart();
    setItemCartOpen(false);
  }, [itemCart, addCatalogItemToRoom, clearCart]);

  const pickBestByCategory = useCallback(
    (category: string, targetWidth?: number) => {
      const candidates = Object.values(CATALOG_ITEMS).filter(
        (product) => product.category === category
      );
      if (!candidates.length) return null;
      if (!targetWidth) return candidates[0];
      let best = candidates[0];
      let bestDelta = Math.abs(candidates[0].dimsMm.w / 1000 - targetWidth);
      for (const candidate of candidates) {
        const delta = Math.abs(candidate.dimsMm.w / 1000 - targetWidth);
        if (delta < bestDelta) {
          best = candidate;
          bestDelta = delta;
        }
      }
      return best;
    },
    []
  );

  const buildGhostSuggestions = useCallback(
    (sofaItem: PlacedItem) => {
      const sofaProduct = CATALOG_ITEMS[sofaItem.productId];
      if (!sofaProduct) return [];

      const suggestions: Array<{
        id: string;
        productId: string;
        position: [number, number, number];
        rotationY?: number;
      }> = [];

      const targetRugWidth = sofaProduct.dimsMm.w / 1000 * 0.72;
      const rugProduct = pickBestByCategory("rug", targetRugWidth);
      if (rugProduct) {
        const rugZ = sofaItem.position[2] + sofaProduct.dimsMm.d / 1000 * 0.35;
        const [safeX, safeZ] = clampToActiveRoom(
          sofaItem.position[0],
          rugZ,
          rugProduct.dimsMm.w / 1000,
          rugProduct.dimsMm.d / 1000,
          roomWidth,
          roomDepth,
          wallThickness
        );
        suggestions.push({
          id: "ghost-rug",
          productId: rugProduct.id,
          position: [safeX, 0, safeZ],
        });
      }

      const coffeeProduct = pickBestByCategory("coffee_table");
      if (coffeeProduct) {
        const sofaFrontZ = sofaItem.position[2] + sofaProduct.dimsMm.d / 1000 / 2;
        const coffeeZ = sofaFrontZ + 0.45 + coffeeProduct.dimsMm.d / 1000 / 2;
        const [safeX, safeZ] = clampToActiveRoom(
          sofaItem.position[0],
          coffeeZ,
          coffeeProduct.dimsMm.w / 1000,
          coffeeProduct.dimsMm.d / 1000,
          roomWidth,
          roomDepth,
          wallThickness
        );
        suggestions.push({
          id: "ghost-coffee",
          productId: coffeeProduct.id,
          position: [safeX, 0, safeZ],
        });
      }

      const nearLeft = sofaItem.position[0] < -roomWidth * 0.25;
      const nearRight = sofaItem.position[0] > roomWidth * 0.25;
      const nearBack = sofaItem.position[2] < -roomDepth * 0.25;
      const nearFront = sofaItem.position[2] > roomDepth * 0.25;
      const isCorner = (nearLeft || nearRight) && (nearBack || nearFront);
      const lampProduct = pickBestByCategory("floor_lamp");

      if (isCorner && lampProduct) {
        const side = nearLeft ? -1 : 1;
        const depth = nearBack ? -1 : 1;
        const lampX =
          sofaItem.position[0] +
          side * (sofaProduct.dimsMm.w / 1000 / 2 + lampProduct.dimsMm.w / 1000 / 2 + 0.2);
        const lampZ =
          sofaItem.position[2] +
          depth * (sofaProduct.dimsMm.d / 1000 / 2 + lampProduct.dimsMm.d / 1000 / 2 + 0.2);
        const [safeX, safeZ] = clampToActiveRoom(
          lampX,
          lampZ,
          lampProduct.dimsMm.w / 1000,
          lampProduct.dimsMm.d / 1000,
          roomWidth,
          roomDepth,
          wallThickness
        );
        suggestions.push({
          id: "ghost-lamp",
          productId: lampProduct.id,
          position: [safeX, 0, safeZ],
        });
      }

      return suggestions;
    },
    [clampToActiveRoom, pickBestByCategory, roomDepth, roomWidth, wallThickness]
  );

  // Step 1: Track first item added
  useEffect(() => {
    if (!onboardingState.enabled || onboardingState.step === "completed") return;
    if (!items.length || firstItemTrackedRef.current) return;

    const firstItem = items[items.length - 1];
    const firstProduct = CATALOG_ITEMS[firstItem.productId];

    const eventKey = EventDedup.makeKey("first_item_added", designId);
    if (!eventDedupRef.current.has(eventKey)) {
      eventDedupRef.current.mark(eventKey);
      const startedAt = onboardingStartedAtRef.current ?? Date.now();
      track("first_item_added", {
        design_id: designId,
        isGuest: !session?.user,
        itemType: firstProduct?.category ?? "unknown",
        timeSinceStartMs: Date.now() - startedAt,
      });
    }
    firstItemTrackedRef.current = true;
  }, [items, onboardingState.enabled, onboardingState.step, designId, session?.user]);

  useEffect(() => {
    if (items.length < 1 || firstItemFunnelTrackedRef.current) return;

    const firstItem = items[items.length - 1];
    const firstProduct = CATALOG_ITEMS[firstItem.productId];
    const meta = {
      itemType: firstProduct?.category ?? "unknown",
      isGuest: !session?.user,
      mode,
    };

    if (!onboardingState.enabled) {
      track("first_item_added", {
        design_id: designId,
        ...meta,
      });
    }

    logFunnelEvent("first_item_added", meta);
    firstItemFunnelTrackedRef.current = true;
  }, [items, onboardingState.enabled, session?.user, mode, designId, logFunnelEvent]);

  useEffect(() => {
    if (items.length < 3 || thirdItemTrackedRef.current) return;

    track("third_item_added", {
      design_id: designId,
      isGuest: !session?.user,
      mode,
      items_count: items.length,
    });
    logFunnelEvent("third_item_added", {
      isGuest: !session?.user,
      mode,
      items_count: items.length,
    });
    thirdItemTrackedRef.current = true;
  }, [items.length, designId, logFunnelEvent, mode, session?.user]);

  // Step 2: First sofa placed → auto-create seating zone + show affirmation + queue ghosts
  useEffect(() => {
    if (!onboardingState.enabled || onboardingState.step !== "prompt_add_sofa") return;

    const sofaItem = items.find((item) => {
      const catalogItem = CATALOG_ITEMS[item.productId];
      return catalogItem ? mapToTopCategory(catalogItem.category, catalogItem) === "sofa" : false;
    });
    if (!sofaItem || firstSofaHandledRef.current) return;

    firstSofaHandledRef.current = true;

    // Hide nudge, show affirmation
    setSofaNudgeVisible(false);
    setSofaReinforceMessage("Nice. This defines your seating area.");
    window.setTimeout(() => setSofaReinforceMessage(null), 2000);

    // Auto-create seating zone
    autoCreateSeatingZone(sofaItem);

    // Evaluate constraints and show feedback
    const results = evaluateConstraints({
      design: { items },
      movedItemId: sofaItem.instanceId,
      room: { width: roomWidth, depth: roomDepth, wallThickness },
    });
    showConstraintsForMoment(results);
    showConfidenceSummary(results);

    // Fire event
    track("seating_zone_auto_created", {
      design_id: designId,
      isGuest: !session?.user,
      timeSinceStartMs: Date.now() - (onboardingStartedAtRef.current ?? Date.now()),
    });

    // Transition to sofa_placed
    setOnboardingState((prev) => ({
      ...prev,
      step: "sofa_placed",
      lastInteractionAtMs: Date.now(),
    }));

    // Queue ghost suggestions after 600ms
    if (ghostTimerRef.current) {
      window.clearTimeout(ghostTimerRef.current);
    }
    ghostTimerRef.current = window.setTimeout(() => {
      const suggestions = buildGhostSuggestions(sofaItem);
      if (suggestions.length > 0) {
        setGhostSuggestions(suggestions);
        setShowGhostHint(true);

        // Track ghost shown
        track("ghost_suggestion_shown", {
          design_id: designId,
          isGuest: !session?.user,
          suggestionCount: suggestions.length,
        });

        // Auto-hide after 8s
        if (ghostTimerRef.current) {
          window.clearTimeout(ghostTimerRef.current);
        }
        ghostTimerRef.current = window.setTimeout(() => {
          setGhostSuggestions([]);
          setShowGhostHint(false);

          // Transition to ghosts_shown
          setOnboardingState((prev) => ({
            ...prev,
            step: "ghosts_shown",
            lastInteractionAtMs: Date.now(),
          }));
        }, 8000);
      } else {
        // No ghosts, skip to ghosts_shown
        setOnboardingState((prev) => ({
          ...prev,
          step: "ghosts_shown",
          lastInteractionAtMs: Date.now(),
        }));
      }
    }, 600);
  }, [
    autoCreateSeatingZone,
    buildGhostSuggestions,
    items,
    onboardingState.enabled,
    onboardingState.step,
    designId,
    roomDepth,
    roomWidth,
    showConfidenceSummary,
    showConstraintsForMoment,
    wallThickness,
    session?.user,
  ]);

  // Step 3: Detect activation (valid layout) → auto-complete onboarding
  useEffect(() => {
    if (!onboardingState.enabled || onboardingState.step === "completed") return;

    const sofaItem = items.find((item) => {
      const catalogItem = CATALOG_ITEMS[item.productId];
      return catalogItem ? mapToTopCategory(catalogItem.category, catalogItem) === "sofa" : false;
    });
    const rugItem = items.find((item) => CATALOG_ITEMS[item.productId]?.category === "rug");
    const coffeeItem = items.find((item) => CATALOG_ITEMS[item.productId]?.category === "coffee_table");
    const hasSeatingZone = zones.some((zone) => zone.type === "seating");

    // Evaluate activation condition
    const isActivated = checkActivation({
      constraintResults,
      hasSofa: !!sofaItem,
      hasRug: !!rugItem,
      hasCoffeeTable: !!coffeeItem,
      hasSeatingZone,
    });

    if (isActivated && onboardingState.step !== "activated") {
      // Transition to activated
      setOnboardingState((prev) => ({
        ...prev,
        step: "activated",
        lastInteractionAtMs: Date.now(),
      }));

      // Show affirmation
      setSofaReinforceMessage("This room already works.");
      window.setTimeout(() => setSofaReinforceMessage(null), 2000);

      // Fire event
      const eventKey = EventDedup.makeKey("first_valid_layout", designId);
      if (!eventDedupRef.current.has(eventKey)) {
        eventDedupRef.current.mark(eventKey);
        track("first_valid_layout", {
          design_id: designId,
          isGuest: !session?.user,
          has: {
            sofa: !!sofaItem,
            rug: !!rugItem,
            coffee_table: !!coffeeItem,
            seating_zone: hasSeatingZone,
          },
          timeSinceStartMs: Date.now() - (onboardingStartedAtRef.current ?? Date.now()),
        });
      }

      // Schedule auto-complete in 2.5s
      window.setTimeout(() => {
        setOnboardingState((prev) => ({
          ...prev,
          step: "completed",
        }));
        try {
          localStorage.setItem("onboarded", "1");
        } catch {
          // ignore
        }
        track("onboarding_completed", {
          design_id: designId,
          isGuest: !session?.user,
          completionReason: "valid_layout",
          timeSinceStartMs: Date.now() - (onboardingStartedAtRef.current ?? Date.now()),
        });
      }, 2500);
    }
  }, [
    onboardingState.enabled,
    onboardingState.step,
    items,
    zones,
    constraintResults,
    designId,
    session?.user,
  ]);

  const _findByCategory = (category: string) => {
    return (
      items.find((i) => CATALOG_ITEMS[i.productId]?.category === category) ?? null
    );
  };

  // Stall detection: show nudge if idle for 12-15s and onboarding enabled or < 5 actions
  useEffect(() => {
    if (!onboardingState.enabled || editorMode === "present" || isClientPreview) return;

    if (stallDetectionTimerRef.current) {
      window.clearTimeout(stallDetectionTimerRef.current);
    }

    const stallThresholdMs = 13000; // 13 seconds
    stallDetectionTimerRef.current = window.setTimeout(() => {
      const timeSinceLastAction = Date.now() - lastActionTimeRef.current;

      if (timeSinceLastAction >= stallThresholdMs && nudgeShownCountRef.current < 2) {
        // Calculate context
        const sofaItem = items.find((item) => {
          const catalogItem = CATALOG_ITEMS[item.productId];
          return catalogItem ? mapToTopCategory(catalogItem.category, catalogItem) === "sofa" : false;
        });
        const rugItem = items.find((item) => CATALOG_ITEMS[item.productId]?.category === "rug");
        const coffeeItem = items.find((item) => CATALOG_ITEMS[item.productId]?.category === "coffee_table");

        const nudgeText = getNextBestActionNudge({
          hasItems: items.length > 0,
          hasSofa: !!sofaItem,
          hasRug: !!rugItem,
          hasCoffeeTable: !!coffeeItem,
          contentWarningCount: constraintResults.filter((r) => r.level === "warn" || r.level === "error").length,
          cartCount: items.filter((i) => i.includeInCheckout).length,
          mode: editorMode === "ai" ? "design" : editorMode,
        });

        if (nudgeText) {
          setNextBestActionNudge(nudgeText);
          nudgeShownCountRef.current += 1;

          // Auto-dismiss after 5s
          window.setTimeout(() => {
            setNextBestActionNudge(null);
          }, 5000);

          track("stall_nudge_shown", {
            design_id: designId,
            nudge_text: nudgeText,
            nudge_count: nudgeShownCountRef.current,
          });
        }
      }
    }, stallThresholdMs);

    return () => {
      if (stallDetectionTimerRef.current) {
        window.clearTimeout(stallDetectionTimerRef.current);
      }
    };
  }, [onboardingState.enabled, editorMode, isClientPreview, items, constraintResults, designId]);

  const _saveStatusText = useMemo(() => {
    if (isSaving) return "Saving...";
    if (designId && lastDbSaveAt) {
      return `Saved ${formatTimeAgo(lastDbSaveAt)}`;
    }
    if (!designId && lastLocalAutosaveAt) return "Offline (saved locally)";
    return designId ? "Not saved yet" : "Offline (saved locally)";
  }, [designId, isSaving, lastDbSaveAt, lastLocalAutosaveAt]);

  const applyItemRotation = useCallback(
    (
      id: string,
      targetRotationY: number,
      options?: {
        snap?: boolean;
        actionLabel?: string;
        source?: "keyboard" | "handle" | "inspector" | "canvas";
      }
    ) => {
      try {
        trackFirstInteraction();
        const shouldSnap = options?.snap ?? true;
        const resolvedRotationY = shouldSnap && rotationSnapEnabled
          ? snapRotationRadians(targetRotationY, rotationSnapStepRadians)
          : targetRotationY;
        const selectedSet = selectedIdsRef.current;
        const isGroupRotate = selectedSet.size > 1 && selectedSet.has(id);
        const source = options?.source ?? "canvas";
        if (!isGroupRotate) {
          const previous = itemsRef.current.find((x) => x.instanceId === id)?.rotationY ?? 0;
          commitItems(
            (prev: PlacedItem[]) =>
              prev.map((x) =>
                x.instanceId === id ? { ...x, rotationY: resolvedRotationY } : x
              ),
            options?.actionLabel ?? "Rotate item"
          );
          track("editor_item_rotated", {
            source,
            snapped: shouldSnap,
            selectionType: "single",
            deltaDeg: Number(radiansToDeg(resolvedRotationY - previous).toFixed(2)),
          });
          const results = evaluateConstraints({
            design: { items: itemsRef.current },
            movedItemId: id,
            room: { width: roomWidth, depth: roomDepth, wallThickness },
          });
          showConstraintsForMoment(results);
          showConfidenceSummary(results);
          return true;
        }

        const currentItems = itemsRef.current;
        const mover = currentItems.find((x) => x.instanceId === id);
        if (!mover) return false;
        const deltaRot = resolvedRotationY - (mover.rotationY ?? 0);

        const movable = currentItems.filter(
          (x) => selectedSet.has(x.instanceId) && !(isDesigner && x.locked)
        );
        if (!movable.length) return false;
        const movableIds = new Set(movable.map((x) => x.instanceId));
        const blockers = currentItems.filter((x) => !movableIds.has(x.instanceId));
        const bounds = getSelectionBounds(movable);
        if (!bounds) return false;

        const pivotX = bounds.centerX;
        const pivotZ = bounds.centerZ;
        const cos = Math.cos(deltaRot);
        const sin = Math.sin(deltaRot);

        const nextItems = currentItems.map((item) => {
          if (!movableIds.has(item.instanceId)) return item;
          const product = CATALOG_ITEMS[item.productId];
          if (!product) return item;
          const offsetX = item.position[0] - pivotX;
          const offsetZ = item.position[2] - pivotZ;
          const rotatedX = offsetX * cos - offsetZ * sin;
          const rotatedZ = offsetX * sin + offsetZ * cos;
          const nextRot = (item.rotationY ?? 0) + deltaRot;
          const [safeX, safeZ] = clampToActiveRoom(
            pivotX + rotatedX,
            pivotZ + rotatedZ,
            product.dimsMm.w / 1000,
            product.dimsMm.d / 1000,
            roomWidth,
            roomDepth,
            wallThickness,
            nextRot
          );
          const nextPos: [number, number, number] = [safeX, item.position[1] ?? 0, safeZ];
          return {
            ...item,
            position: nextPos,
            rotationY: nextRot,
          };
        });

        let collision = false;
        for (const moved of nextItems) {
          if (!movableIds.has(moved.instanceId)) continue;
          const movedProduct = CATALOG_ITEMS[moved.productId];
          if (movedProduct?.category === "rug") continue;
          const movedAABB = getItemAABB(moved);
          if (!movedAABB) continue;
          for (const blocker of blockers) {
            const blockerProduct = CATALOG_ITEMS[blocker.productId];
            if (blockerProduct?.category === "rug") continue;
            const blockerAABB = getItemAABB(blocker);
            if (!blockerAABB) continue;
            if (aabbIntersects(movedAABB, blockerAABB)) {
              collision = true;
              break;
            }
          }
          if (collision) break;
        }
        if (collision) return false;

        commitItems(nextItems, options?.actionLabel ?? "Rotate group");
        track("editor_item_rotated", {
          source,
          snapped: shouldSnap,
          selectionType: "group",
          selectionSize: movableIds.size,
          deltaDeg: Number(radiansToDeg(deltaRot).toFixed(2)),
        });
        const results = evaluateConstraints({
          design: { items: itemsRef.current },
          movedItemId: id,
          room: { width: roomWidth, depth: roomDepth, wallThickness },
        });
        showConstraintsForMoment(results);
        showConfidenceSummary(results);
        return true;
      } catch (error) {
        console.error("[Editor] applyItemRotation failed", {
          id,
          targetRotationY,
          options,
          error,
        });
        return false;
      }
    },
    [
      commitItems,
      clampToActiveRoom,
      getItemAABB,
      getSelectionBounds,
      isDesigner,
      rotationSnapEnabled,
      rotationSnapStepRadians,
      roomDepth,
      roomWidth,
      showConfidenceSummary,
      showConstraintsForMoment,
      trackFirstInteraction,
      wallThickness,
    ]
  );

  const selectedRotationDegrees = useMemo(() => {
    if (!selectedItem) return 0;
    return normalizeRotationDegrees(radiansToDeg(selectedItem.rotationY ?? 0));
  }, [selectedItem]);
  const rotateControlsDisabled =
    !canEdit || (isDesigner && selectedIds.size <= 1 && Boolean(selectedItem?.locked));

  useEffect(() => {
    if (!selectedItem) {
      setRotationInputValue("0");
      return;
    }
    setRotationInputValue(String(selectedRotationDegrees));
  }, [selectedItem, selectedRotationDegrees]);

  const rotateSelectedByDegrees = useCallback(
    (deltaDegrees: number) => {
      if (!selectedItem) return;
      const deltaRadians = (deltaDegrees * Math.PI) / 180;
      applyItemRotation(
        selectedItem.instanceId,
        (selectedItem.rotationY ?? 0) + deltaRadians,
        {
          actionLabel: `Rotate ${deltaDegrees > 0 ? "+" : ""}${deltaDegrees}°`,
          source: "inspector",
        }
      );
    },
    [applyItemRotation, selectedItem]
  );

  const resetSelectedRotation = useCallback(() => {
    if (!selectedItem) return;
    applyItemRotation(selectedItem.instanceId, 0, {
      actionLabel: "Reset rotation",
      source: "inspector",
    });
  }, [applyItemRotation, selectedItem]);

  const setSelectedRotationDegrees = useCallback(
    (degrees: number, snap: boolean, actionLabel: string) => {
      if (!selectedItem) return;
      const radians = (degrees * Math.PI) / 180;
      const accepted = applyItemRotation(selectedItem.instanceId, radians, {
        snap,
        actionLabel,
        source: "inspector",
      });
      if (accepted !== false) {
        setRotationInputValue(String(normalizeRotationDegrees(degrees)));
      }
    },
    [applyItemRotation, selectedItem]
  );

  const applyRotationInputValue = useCallback(() => {
    if (!selectedItem) return;
    const parsed = Number(rotationInputValue);
    if (!Number.isFinite(parsed)) {
      setRotationInputValue(String(selectedRotationDegrees));
      return;
    }
    setSelectedRotationDegrees(parsed, false, `Set rotation to ${parsed}°`);
  }, [rotationInputValue, selectedItem, selectedRotationDegrees, setSelectedRotationDegrees]);

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

  const _handleSnapSuccess = () => {
    triggerGridPulse();
    showSnapToastOnce();
  };

  const visibleConstraints = pickTopConstraints(constraintResults);
  const lightConfig = LIGHTING_PRESETS[lightingPreset];
  const blankGridRoomDrawActive = floorPlanTraceRoomMode && !floorPlanUnderlay;
  const activeFloorPlanTool =
    floorPlanTraceRoomMode
      ? "draw_room"
      : floorPlanTraceOpeningMode
        ? floorPlanTraceOpeningKind
        : "select";
  const snapBlankGridRoomDrawPoint = useCallback((point: FloorPlanPoint): FloorPlanPoint => {
    const roundedPoint = {
      x: roundPlanCoordinate(point.x),
      z: roundPlanCoordinate(point.z),
    };

    if (floorPlanDrawRoomMode === "straight_wall") {
      return snapFloorPlanPointForRoomDraw(roundedPoint, { rooms: housePlan2D.rooms });
    }

    return snapFloorPlanPointForRoomDraw(roundedPoint, {
      rooms: housePlan2D.rooms,
      edgeSnapDistanceMeters: 0,
    });
  }, [floorPlanDrawRoomMode, housePlan2D.rooms]);
  const snapBlankGridWallDrawPoint = useCallback(
    (point: FloorPlanPoint, points: FloorPlanPoint[]): FloorPlanPoint => {
      return snapFloorPlanPointForWallDraw(
        {
          x: roundPlanCoordinate(point.x),
          z: roundPlanCoordinate(point.z),
        },
        {
          rooms: housePlan2D.rooms,
          previousPoint: points.length > 0 ? points[points.length - 1] : null,
          firstPoint: points.length > 0 ? points[0] : null,
          pointCount: points.length,
        }
      );
    },
    [housePlan2D.rooms]
  );
  const handleBlankGridRoomDrawPoint = useCallback((point: FloorPlanPoint) => {
    if (!blankGridRoomDrawActive) return;

    if (floorPlanDrawRoomMode !== "straight_wall") {
      const snappedPoint = snapBlankGridRoomDrawPoint(point);
      const nextPoints =
        floorPlanTraceRoomPoints.length >= 2
          ? [snappedPoint]
          : [...floorPlanTraceRoomPoints, snappedPoint];

      setFloorPlanTraceRoomPoints(nextPoints);
      setBlankGridRoomPreviewPoint(null);
      if (nextPoints.length !== 2) return;

      if (floorPlanDrawRoomMode === "arc_wall") {
        const arcRoom = resolveArcWallDrawPreview(nextPoints[0], nextPoints[1]).resolvedRoom;
        if (!arcRoom) {
          setFloorPlanTraceRoomPoints([]);
          setBlankGridRoomPreviewPoint(null);
          showRuleToast("Draw a larger arc wall");
          return;
        }

        if (applyResolvedWallDrawRoom(arcRoom)) {
          setFloorPlanTraceRoomPoints([]);
          setBlankGridRoomPreviewPoint(null);
        }
        return;
      }

      const bounds = resolveTracedRoomRectangle([nextPoints[0], nextPoints[1]]);
      if (!bounds) {
        setFloorPlanTraceRoomPoints([]);
        setBlankGridRoomPreviewPoint(null);
        showRuleToast("Draw a larger room area");
        return;
      }

      if (applyTracedRoomRectangle(bounds)) {
        setFloorPlanTraceRoomPoints([]);
        setBlankGridRoomPreviewPoint(null);
      }
      return;
    }

    const snappedPoint = snapBlankGridWallDrawPoint(point, floorPlanTraceRoomPoints);
    const lastPoint = floorPlanTraceRoomPoints[floorPlanTraceRoomPoints.length - 1];

    if (
      lastPoint &&
      Math.abs(lastPoint.x - snappedPoint.x) <= 0.001 &&
      Math.abs(lastPoint.z - snappedPoint.z) <= 0.001
    ) {
      setBlankGridRoomPreviewPoint(null);
      return;
    }

    const closingPath = isClosingWallDrawPoint(
      snappedPoint,
      floorPlanTraceRoomPoints[0],
      floorPlanTraceRoomPoints.length
    );

    if (closingPath) {
      const resolvedRoom = resolveClosedWallDrawRoom([
        ...floorPlanTraceRoomPoints,
        snappedPoint,
      ]);
      if (!resolvedRoom) {
        setFloorPlanTraceRoomPoints([]);
        setBlankGridRoomPreviewPoint(null);
        showRuleToast("Close straight wall segments into a valid room.");
        return;
      }

      if (applyResolvedWallDrawRoom(resolvedRoom)) {
        setFloorPlanTraceRoomPoints([]);
        setBlankGridRoomPreviewPoint(null);
      }
      return;
    }

    setFloorPlanTraceRoomPoints([...floorPlanTraceRoomPoints, snappedPoint]);
    setBlankGridRoomPreviewPoint(null);
  }, [
    applyResolvedWallDrawRoom,
    applyTracedRoomRectangle,
    blankGridRoomDrawActive,
    floorPlanDrawRoomMode,
    floorPlanTraceRoomPoints,
    showRuleToast,
    snapBlankGridRoomDrawPoint,
    snapBlankGridWallDrawPoint,
  ]);
  const handleBlankGridRoomDrawPreviewPoint = useCallback((point: FloorPlanPoint | null) => {
    if (!blankGridRoomDrawActive || floorPlanTraceRoomPoints.length < 1 || !point) {
      setBlankGridRoomPreviewPoint(null);
      return;
    }
    if (floorPlanDrawRoomMode !== "straight_wall") {
      setBlankGridRoomPreviewPoint(snapBlankGridRoomDrawPoint(point));
      return;
    }
    setBlankGridRoomPreviewPoint(
      snapBlankGridWallDrawPoint(point, floorPlanTraceRoomPoints)
    );
  }, [
    blankGridRoomDrawActive,
    floorPlanDrawRoomMode,
    floorPlanTraceRoomPoints,
    snapBlankGridRoomDrawPoint,
    snapBlankGridWallDrawPoint,
  ]);
  const handleBlankGridRoomDrawDrag = useCallback(
    (start: FloorPlanPoint, end: FloorPlanPoint) => {
      if (!blankGridRoomDrawActive) return;
      if (floorPlanDrawRoomMode === "straight_wall") return;

      const snappedStart = snapBlankGridRoomDrawPoint(start);
      const snappedEnd = snapBlankGridRoomDrawPoint(end);
      if (floorPlanDrawRoomMode === "arc_wall") {
        const arcRoom = resolveArcWallDrawPreview(snappedStart, snappedEnd).resolvedRoom;
        if (!arcRoom) {
          setFloorPlanTraceRoomPoints([]);
          setBlankGridRoomPreviewPoint(null);
          showRuleToast("Draw a larger arc wall");
          return;
        }

        if (applyResolvedWallDrawRoom(arcRoom)) {
          setFloorPlanTraceRoomPoints([]);
          setBlankGridRoomPreviewPoint(null);
        }
        return;
      }

      const bounds = resolveTracedRoomRectangle([snappedStart, snappedEnd]);
      if (!bounds) {
        setFloorPlanTraceRoomPoints([]);
        setBlankGridRoomPreviewPoint(null);
        showRuleToast("Draw a larger room area");
        return;
      }

      if (applyTracedRoomRectangle(bounds)) {
        setFloorPlanTraceRoomPoints([]);
        setBlankGridRoomPreviewPoint(null);
      }
    },
    [
      applyResolvedWallDrawRoom,
      applyTracedRoomRectangle,
      blankGridRoomDrawActive,
      floorPlanDrawRoomMode,
      showRuleToast,
      snapBlankGridRoomDrawPoint,
    ]
  );

  return (
    <main
      className="appShell relative min-h-screen w-screen"
      data-theme={showDesignerTheme ? "designer" : "default"}
      style={{ transition: "background 200ms ease, color 200ms ease" }}
    >
      <div className="absolute inset-0">
        <div className="relative h-full w-full">
          <CanvasErrorBoundary>
          <Canvas
            data-testid="scene-canvas"
            shadows={false}
            dpr={[1, 2]}
            gl={{
              antialias: true,
              outputColorSpace: THREE.SRGBColorSpace,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: lightConfig.exposure ?? 1,
            }}
            camera={{
              position: [...DEFAULT_EDITOR_CAMERA_VIEW.pos],
              fov: DEFAULT_EDITOR_CAMERA_VIEW.fov,
              near: 0.1,
              far: 300,
            }}
            onCreated={({ gl }) => {
              (gl as THREE.WebGLRenderer & { physicallyCorrectLights?: boolean }).physicallyCorrectLights = true;
            }}
            onPointerMissed={() => clearAllSelection()}
          >
            <EditorCamera2D
              active={viewMode === "2d"}
              roomWidth={planViewWidth}
              roomDepth={planViewDepth}
              roomHeight={roomHeight}
            />
            <color attach="background" args={["#ffffff"]} />
            <LoadingOverlay />
            <SceneProgressBridge onReadyChange={setSceneReady} />
            <Suspense fallback={null}>
              <Environment resolution={128}>
                <Lightformer
                  intensity={0.9}
                  color={lightConfig.keyColor ?? "#ffffff"}
                  position={[5, 6, 4]}
                  rotation={[0, Math.PI / 4, 0]}
                  scale={[8, 8, 1]}
                />
                <Lightformer
                  intensity={0.45}
                  color={lightConfig.fillColor ?? "#f1f4f8"}
                  position={[-4, 3, -3]}
                  rotation={[0, -Math.PI / 6, 0]}
                  scale={[6, 6, 1]}
                />
              </Environment>
            </Suspense>
            {/* Apply lighting preset */}
            <ambientLight
              color={lightConfig.ambientColor ?? "#f6f6f4"}
              intensity={lightConfig.ambientIntensity}
            />
            <ambientLight
              color="#ffffff"
              intensity={0.24}
            />
            <directionalLight
              position={[5, 7, 4]}
              color={lightConfig.keyColor ?? "#ffffff"}
              intensity={lightConfig.keyIntensity ?? lightConfig.directionalIntensity}
            />
            <directionalLight
              position={[-4, 4, -3]}
              color={lightConfig.fillColor ?? "#f1f4f8"}
              intensity={lightConfig.fillIntensity ?? lightConfig.directionalIntensity * 0.5}
            />

            <Suspense fallback={<RoomSkeleton />}>
              {viewMode === "2d" ? (
                <>
                  <PlanUnderlayRenderer2D
                    underlay={floorPlanUnderlay}
                    calibrationMode={floorPlanCalibrationMode}
                    calibrationPoints={floorPlanCalibrationPoints}
	                    onCalibrationPoint={handleFloorPlanCalibrationPoint}
	                    traceRoomMode={floorPlanTraceRoomMode}
	                    traceRoomDrawMode={floorPlanDrawRoomMode}
	                    traceRoomPoints={floorPlanTraceRoomPoints}
                    onTraceRoomPoint={handleFloorPlanTraceRoomPoint}
                    traceOpeningMode={floorPlanTraceOpeningMode}
                    traceOpeningPoints={floorPlanTraceOpeningPoints}
                    onTraceOpeningPoint={handleFloorPlanTraceOpeningPoint}
                  />
                  <RoomRenderer2D
                    width={planViewWidth}
                    depth={planViewDepth}
                    rooms={housePlan2D.rooms}
                    activeRoomId={designSnapshot.activeRoomId}
                    onSelectRoom={handleSwitchRoom}
                    onMoveRoom={handleMoveRoom2D}
                    onResizeRoom={handleResizeRoom2D}
                    measurementUnit={planMeasurementUnit}
                    theme={planTheme}
                    showGrid={planLayers.grid}
                    showDimensions={planLayers.dimensions}
                    showOpenings={planLayers.openings}
                    showBuiltIns={planLayers.builtIns}
                    showAnnotations={planLayers.annotations}
                    showZones={planLayers.zones}
                    interactive={editorMode !== "present"}
                    selectedOverlayId={selectedPlanOverlayId}
                    onSelectOverlay={setSelectedPlanOverlayId}
                    onMoveOpening={handleMoveOpening2D}
                    onAddDoorwaySuggestion={handleAddSuggestedDoorway}
                    onMoveFixedElement={handleMoveFixedElement2D}
                    onMoveAnnotation={handleMoveAnnotation2D}
                    drawRoomMode={blankGridRoomDrawActive}
                    drawRoomPoints={floorPlanTraceRoomPoints}
                    drawRoomPreviewPoint={blankGridRoomPreviewPoint}
                    onDrawRoomPoint={handleBlankGridRoomDrawPoint}
                    onDrawRoomPreviewPoint={handleBlankGridRoomDrawPreviewPoint}
	                    onDrawRoomDrag={handleBlankGridRoomDrawDrag}
	                    drawRoomInteractionMode={floorPlanDrawRoomMode}
                    openings={mapPlanOpeningsToRoomRenderer(editorScene2D.openings)}
                    fixedElements={mapPlanFixedElementsToRoomRenderer(editorScene2D.fixedElements)}
                    annotations={mapPlanAnnotationsToRoomRenderer(editorScene2D.annotations)}
                    zones={planZones2D}
                  />
                </>
              ) : (
                usesHousePlanScene ? (
                  <HousePlanRenderer3D
                    rooms={housePlan2D.rooms}
                    openings={mapPlanOpeningsToRoomRenderer(editorScene2D.openings)}
                    activeRoomId={designSnapshot.activeRoomId}
                    wallThickness={wallThickness}
                    wallHeight={Math.min(roomHeight, 1.55)}
                    interactive={editorMode !== "present" && !isClientPreview}
                    onSelectRoom={handleSwitchRoom}
                  />
                ) : (
                  <Room
                    width={roomWidth}
                    depth={roomDepth}
                    height={roomHeight}
                    wallThickness={wallThickness}
                  />
                )
              )}

              <DesignerGrid
                visible={isDesigner && showGrid && !isClientPreview && (editorMode === "design" || editorMode === "adjust")}
                pulse={gridPulse}
              />

              {!isClientPreview &&
                editorMode !== "present" &&
                zones.map((zone) => {
                  const bounds = getZoneBounds(zone);
                  if (!bounds) return null;
                  return (
                    <SceneZoneOutline
                      key={zone.id}
                      data-testid={zone.type === "seating" ? "seating-zone" : `${zone.type}-zone`}
                      bounds={bounds}
                      label={getZoneLabel(zone.type)}
                      selected={zone.id === selectedZoneId}
                      onSelect={() => {
                        setSelectedZoneId(zone.id);
                        clearSelection();
                      }}
                    />
                  );
                })}

              {sceneRoomItems.map((sceneEntry) => {
                const it = sceneEntry.item;
                const isActiveSceneRoom = sceneEntry.isActiveRoom;
                const roomOffset = sceneEntry.roomOffset;
                const product = CATALOG_ITEMS[it.productId];
                if (!product) return null;
                const effectiveVariantId =
                  isActiveSceneRoom && it.instanceId === selectedInstanceId && previewVariantId
                    ? previewVariantId
                    : it.variantId;
                const variant =
                  product.variants.find((v) => v.id === effectiveVariantId) ??
                  product.variants[0];
                const configurationEntry = resolveItemConfigurationEntry(it);
                const configuredVisualDimsBase = resolveConfiguredVisualDimsMm(it, product);
                const configuredPlanningDimsBase = resolveConfiguredPlanningDimsMm(it, product);
                const variantDims = variant?.dimensionsMm;
                const useVariantDims = Boolean(
                  !configurationEntry &&
                    variantDims &&
                    Number(variantDims.w) > 0 &&
                    Number(variantDims.d) > 0
                );
                const configuredVisualDims = useVariantDims
                  ? {
                      w: variantDims!.w,
                      d: variantDims!.d,
                      h: Number(variantDims!.h) > 0 ? variantDims!.h : configuredVisualDimsBase.h,
                    }
                  : configuredVisualDimsBase;
                const configuredPlanningDims = useVariantDims
                  ? {
                      w: variantDims!.w,
                      d: variantDims!.d,
                      h: Number(variantDims!.h) > 0 ? variantDims!.h : configuredPlanningDimsBase.h,
                    }
                  : configuredPlanningDimsBase;
                const configuredModelUrl = resolveConfiguredModelUrl(
                  it,
                  product.assets.modelUrl,
                  variant.id
                );
                const configuredNodeTransforms = resolveConfiguredNodeTransforms(it);
                const effectiveProduct =
                  configuredVisualDims.w === product.dimsMm.w &&
                  configuredVisualDims.d === product.dimsMm.d &&
                  configuredVisualDims.h === product.dimsMm.h &&
                  configuredModelUrl === product.assets.modelUrl
                    ? product
                    : {
                        ...product,
                        dimsMm: configuredVisualDims,
                        dimensionsMm: configuredVisualDims,
                        bounds: {
                          type: "aabb" as const,
                          size: {
                            w: configuredVisualDims.w / 1000,
                            d: configuredVisualDims.d / 1000,
                            h: configuredVisualDims.h / 1000,
                          },
                          center: [0, configuredVisualDims.h / 2000, 0] as [number, number, number],
                        },
                        assets: {
                          ...product.assets,
                          modelUrl: configuredModelUrl ?? product.assets.modelUrl,
                        },
                      };
                const effectiveMaterialPreset =
                  isActiveSceneRoom && it.instanceId === selectedInstanceId && previewMaterialPresetId
                    ? previewMaterialPresetId
                    : it.materialPreset;
                const scenePosition: [number, number, number] = [
                  it.position[0] + roomOffset.x,
                  it.position[1] ?? 0,
                  it.position[2] + roomOffset.z,
                ];

                return (
                  <Furniture
                    key={`${sceneEntry.roomId}:${it.instanceId}`}
                    data-testid="item-in-scene"
                    product={effectiveProduct}
                    variantColor={variant.colorHex}
                    variantName={variant.label}
                    variantId={variant.id}
                    variantRenderAssets={variant.renderAssets}
                    planningBoundsMm={configuredPlanningDims}
                    nodeTransforms={configuredNodeTransforms ?? undefined}
                    initialPosition={scenePosition}
                    initialRotationY={it.rotationY ?? 0}
                    roomWidth={sceneEntry.roomWidth}
                    roomDepth={sceneEntry.roomDepth}
                    roomOriginX={roomOffset.x}
                    roomOriginZ={roomOffset.z}
                    roomPlanShape={sceneEntry.roomPlanShape}
                    roomPlanPolygon={sceneEntry.roomPlanPolygon}
                    wallThickness={sceneEntry.roomWallThickness}
                    onDraggingChange={handleDraggingChange}
                    walls={isActiveSceneRoom ? walls : []}
                    instanceId={it.instanceId}
                    isSelected={
                      isActiveSceneRoom &&
                      editorMode !== "present" &&
                      selectedIds.has(it.instanceId)
                    }
                    isPrimarySelected={isActiveSceneRoom && it.instanceId === selectedInstanceId}
                    rotationSnapStepRadians={rotationSnapStepRadians}
                    rotationSnapStepDegrees={rotationSnapStepDegrees}
                    rotationSnapEnabled={rotationSnapEnabled}
                    showGuidesAndMeasurements={
                      isActiveSceneRoom && (editorMode === "design" || editorMode === "adjust")
                    }
                    cartPreviewed={
                      isActiveSceneRoom &&
                      editorMode === "buy" &&
                      hoveredCartInstanceId === it.instanceId
                    }
                    viewMode={viewMode}
                    planShowLabels={planLayers.labels}
                    planShowDimensions={planLayers.dimensions}
                    planMeasurementUnit={planMeasurementUnit}
                    onSelect={(id: string, additive: boolean) => {
                      if (!isActiveSceneRoom) return;
                      if (editorMode === "buy" || editorMode === "present") return;
                      trackFirstInteraction();
                      handleSelect(id, additive);
                    }}
                    onMove={(id: string, pos: [number, number, number]) => {
                      try {
                        if (!isActiveSceneRoom) return false;
                        trackFirstInteraction();
                        const localPos: [number, number, number] = [
                          pos[0] - roomOffset.x,
                          pos[1] ?? 0,
                          pos[2] - roomOffset.z,
                        ];
                        const selectedSet = selectedIdsRef.current;
                        const isGroupMove = selectedSet.size > 1 && selectedSet.has(id);

                        if (!isGroupMove) {
                          const currentItems = itemsRef.current;
                          const mover = currentItems.find((x) => x.instanceId === id);
                          if (!mover) return false;
                          const moverProduct = CATALOG_ITEMS[mover.productId];
                          if (moverProduct?.category === "rug") {
                            return true;
                          }
                          const candidate = { ...mover, position: localPos };
                          const moverAABB = getItemAABB(candidate);
                          if (moverAABB) {
                            for (const blocker of currentItems) {
                              if (blocker.instanceId === id) continue;
                              const blockerProduct = CATALOG_ITEMS[blocker.productId];
                              if (blockerProduct?.category === "rug") continue;
                              const blockerAABB = getItemAABB(blocker);
                              if (!blockerAABB) continue;
                              if (aabbIntersects(moverAABB, blockerAABB)) {
                                showRuleToast("Overlapping item — move blocked");
                                return false;
                              }
                            }
                          }
                          const updater = (prev: PlacedItem[]) =>
                            prev.map((x) =>
                              x.instanceId === id ? { ...x, position: localPos } : x
                            );
                          if (!dragCommitRef.current) {
                            // First move: start transaction and update state
                            history.begin("Move item");
                            const nextItems = updater(itemsRef.current);
                            setItemsPresent(nextItems);
                            dragCommitRef.current = true;
                          } else {
                            // Subsequent moves: just update state (transaction continues)
                            setItemsPresent(updater);
                          }
                          return true;
                        }

                        const currentItems = itemsRef.current;
                        const mover = currentItems.find((x) => x.instanceId === id);
                        if (!mover) return false;

                        const deltaX = localPos[0] - mover.position[0];
                        const deltaZ = localPos[2] - mover.position[2];

                        const movable = currentItems.filter(
                          (x) => selectedSet.has(x.instanceId) && !(isDesigner && x.locked)
                        );
                        if (!movable.length) return false;
                        const movableIds = new Set(movable.map((x) => x.instanceId));
                        const blockers = currentItems.filter((x) => !movableIds.has(x.instanceId));

                        const nextItems = currentItems.map((item) => {
                          if (!movableIds.has(item.instanceId)) return item;
                          const product = CATALOG_ITEMS[item.productId];
                          if (!product) return item;
                          const nextX = item.position[0] + deltaX;
                          const nextZ = item.position[2] + deltaZ;
                          const [safeX, safeZ] = clampToActiveRoom(
                            nextX,
                            nextZ,
                            product.dimsMm.w / 1000,
                            product.dimsMm.d / 1000,
                            roomWidth,
                            roomDepth,
                            wallThickness,
                            item.rotationY ?? 0
                          );
                          const nextPos: [number, number, number] = [
                            safeX,
                            item.position[1] ?? 0,
                            safeZ,
                          ];
                          return { ...item, position: nextPos };
                        });

                        let collision = false;
                        for (const moved of nextItems) {
                          if (!movableIds.has(moved.instanceId)) continue;
                          const movedProduct = CATALOG_ITEMS[moved.productId];
                          if (movedProduct?.category === "rug") continue;
                          const movedAABB = getItemAABB(moved);
                          if (!movedAABB) continue;
                          for (const blocker of blockers) {
                            const blockerProduct = CATALOG_ITEMS[blocker.productId];
                            if (blockerProduct?.category === "rug") continue;
                            const blockerAABB = getItemAABB(blocker);
                            if (!blockerAABB) continue;
                            if (aabbIntersects(movedAABB, blockerAABB)) {
                              collision = true;
                              break;
                            }
                          }
                          if (collision) break;
                        }
                        if (collision) return false;

                        if (!dragCommitRef.current) {
                          history.begin("Move group");
                          setItemsPresent(nextItems);
                          dragCommitRef.current = true;
                        } else {
                          setItemsPresent(nextItems);
                        }
                        return true;
                      } catch (error) {
                        console.error("[Editor] onMove handler failed", { id, pos, error });
                        return false;
                      }
                    }}
                    onRotate={(id: string, rotY: number, meta) =>
                      applyItemRotation(id, rotY, {
                        source: meta?.source ?? "canvas",
                        snap: meta?.snap,
                      })
                    }
                    locked={it.locked}
                    interactive={canEdit && isActiveSceneRoom}
                    showSelection={canEdit && isActiveSceneRoom}
                    showLocks={isDesigner && !isClientPreview && isActiveSceneRoom}
                    onSnapPulse={triggerGridPulse}
                    enableSnap={snapEnabled && !isClientPreview && isActiveSceneRoom}
                    items={isActiveSceneRoom ? activeSceneItemsForGuides : []}
                    itemPlanningBoundsByInstanceId={itemPlanningBoundsByInstanceId}
                    materialPreset={effectiveMaterialPreset}
                    materialOverrides={it.materialOverrides}
                    onDragEnd={(id: string, pos: [number, number, number]) => {
                      try {
                        if (!isActiveSceneRoom) return;
                        const localPos: [number, number, number] = [
                          pos[0] - roomOffset.x,
                          pos[1] ?? 0,
                          pos[2] - roomOffset.z,
                        ];
                        const nextItems = itemsRef.current.map((item) =>
                          item.instanceId === id ? { ...item, position: localPos } : item
                        );
                        const results = evaluateConstraints({
                          design: { items: nextItems },
                          movedItemId: id,
                          room: { width: roomWidth, depth: roomDepth, wallThickness },
                        });
                        showConstraintsForMoment(results);
                        showConfidenceSummary(results);
                      } catch (error) {
                        console.error("[Editor] onDragEnd handler failed", { id, pos, error });
                      }
                    }}
                  />
                );
              })}
            </Suspense>

            <CameraCapture
              cameraRef={cameraRef}
              canvasRef={canvasRef}
              rendererRef={rendererRef}
              sceneRef={sceneRef}
            />

            {viewMode === "2d" ? (
              <MapControls
                ref={orbitControlsRef}
                target={[0, 0, 0]}
                enableDamping
                dampingFactor={0.08}
                enablePan={!isClientPreview}
                enableZoom={!isClientPreview}
                enableRotate={false}
                screenSpacePanning
                enabled={!sofaDragging}
              />
            ) : (
              <OrbitControls
                ref={orbitControlsRef}
                target={[...DEFAULT_EDITOR_CAMERA_VIEW.target]}
                enableDamping
                dampingFactor={0.08}
                enablePan={!isClientPreview}
                enableZoom={!isClientPreview}
                enableRotate={!isClientPreview}
                rotateSpeed={0.8}
                minDistance={2.5}
                maxDistance={Math.max(24, Math.max(planViewWidth, planViewDepth) * 6)}
                minPolarAngle={0.02}
                maxPolarAngle={Math.PI - 0.02}
                enabled={!sofaDragging}
                onChange={() => {
                  if (!isCameraAnimatingRef.current) {
                    updateCameraViewFromScene();
                  }
                }}
              />
            )}
          </Canvas>
          </CanvasErrorBoundary>

          {activeRoom && !isClientPreview && (
            <div className="absolute left-1/2 top-20 z-30 -translate-x-1/2">
              <RoomPlanStatusBar
                roomName={activeRoom.name}
                roomTypeLabel={getRoomTypeLabel(activeRoom.roomType)}
                roomCount={designSnapshot.rooms.length}
                widthMeters={roomWidth}
                depthMeters={roomDepth}
                viewMode={viewMode}
                disabled={editorMode === "present"}
                dark={showDesignerTheme}
                onViewModeChange={handleEditorViewModeChange}
                onFitPlan={handleFitPlanView}
              />
            </div>
          )}

          {viewMode === "3d" && hasWholeHousePlan && !isClientPreview && (
            <div className="absolute bottom-24 right-6 z-30">
              <RoomPanNavigator
                rooms={housePlan2D.rooms}
                activeRoomId={designSnapshot.activeRoomId}
                cameraPosition={cameraView.pos}
                cameraTarget={cameraView.target}
                disabled={editorMode === "present"}
                dark={showDesignerTheme}
                onMoveCamera={handleWholeHomeMoveCamera}
                onMoveTarget={handleWholeHomeMoveTarget}
                onFocusRoom={handleWholeHomeFocusRoom}
                onZoom={handleWholeHomeNavigatorZoom}
                onResetView={handleFitPlanView}
              />
            </div>
          )}

          {viewMode === "2d" && activeRoom && !isClientPreview && (
            <div className="absolute left-1/2 top-36 z-30 -translate-x-1/2">
              <FloorPlanToolStrip
                activeTool={activeFloorPlanTool}
                disabled={editorMode === "present"}
                dark={showDesignerTheme}
                canAddOpening={Boolean(activeRoom)}
                onSelect={handleSelectFloorPlanTool}
                onDrawRoom={() => handleFloorPlanTraceRoomModeChange(true)}
                onAddDoor={() => handleAddFloorPlanOpeningFromTool("door")}
                onAddWindow={() => handleAddFloorPlanOpeningFromTool("window")}
                onFitPlan={handleFitPlanView}
              />
            </div>
          )}

          {selectedIds.size > 1 && !isClientPreview && (
            <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2">
              <div
                className={
                  showDesignerTheme
                    ? "designer-panel flex items-center gap-2 rounded-full px-3 py-2"
                    : "flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow"
                }
              >
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-xs font-semibold"
                      : "text-xs font-semibold text-neutral-900"
                  }
                >
                  Group ({selectedIds.size})
                </div>
                <button
                  className={
                    showDesignerTheme
                      ? "rounded-full border px-2 py-1 text-xs"
                      : "rounded-full border border-neutral-200 px-2 py-1 text-xs text-neutral-900"
                  }
                  onClick={alignSelectionX}
                >
                  Align X center
                </button>
                <button
                  className={
                    showDesignerTheme
                      ? "rounded-full border px-2 py-1 text-xs"
                      : "rounded-full border border-neutral-200 px-2 py-1 text-xs text-neutral-900"
                  }
                  onClick={alignSelectionZ}
                >
                  Align Z center
                </button>
                <select
                  className={
                    showDesignerTheme
                      ? "rounded-full border bg-transparent px-2 py-1 text-xs"
                      : "rounded-full border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-900"
                  }
                  value={pendingZoneType}
                  onChange={(e) =>
                    setPendingZoneType(e.target.value as Zone["type"])
                  }
                >
                  <option value="seating">Seating</option>
                  <option value="reading">Reading</option>
                  <option value="tv">TV</option>
                  <option value="dining">Dining</option>
                </select>
                <button
                  className={
                    showDesignerTheme
                      ? "rounded-full border px-2 py-1 text-xs"
                      : "rounded-full border border-neutral-200 px-2 py-1 text-xs text-neutral-900"
                  }
                  onClick={createZoneFromSelection}
                >
                  Create zone
                </button>
                <button
                  className={
                    showDesignerTheme
                      ? "rounded-full border px-2 py-1 text-xs"
                      : "rounded-full border border-neutral-200 px-2 py-1 text-xs text-neutral-900"
                  }
                  onClick={() => clearAllSelection()}
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {selectedZone && !isClientPreview && (
            <div className="absolute left-1/2 top-16 z-30 -translate-x-1/2">
              <div
                className={
                  showDesignerTheme
                    ? "designer-panel flex items-center gap-2 rounded-full px-3 py-2"
                    : "flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow"
                }
              >
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-xs font-semibold"
                      : "text-xs font-semibold text-neutral-900"
                  }
                >
                  {getZoneLabel(selectedZone.type)}
                </div>
                <button
                  className={
                    showDesignerTheme
                      ? "rounded-full border px-2 py-1 text-xs"
                      : "rounded-full border border-neutral-200 px-2 py-1 text-xs text-neutral-900"
                  }
                  onClick={() => autoLayoutZone(selectedZone.id)}
                >
                  Auto-layout
                </button>
                <button
                  className={
                    showDesignerTheme
                      ? "rounded-full border px-2 py-1 text-xs"
                      : "rounded-full border border-neutral-200 px-2 py-1 text-xs text-neutral-900"
                  }
                  onClick={() => rotateZone(selectedZone.id, Math.PI / 2)}
                >
                  Rotate zone
                </button>
                <button
                  className={
                    showDesignerTheme
                      ? "rounded-full border px-2 py-1 text-xs"
                      : "rounded-full border border-neutral-200 px-2 py-1 text-xs text-neutral-900"
                  }
                  onClick={() => ungroupZone(selectedZone.id)}
                >
                  Ungroup
                </button>
              </div>
            </div>
          )}
        </div>

        <EditorCommandBar
          isClientPreview={isClientPreview}
          dark={showDesignerTheme}
          editorMode={editorMode}
          viewMode={viewMode}
          isDesigner={isDesigner}
          isAuthed={!!session?.user}
          aiDesignEnabled={aiDesignEnabled}
          canUndo={canUndo}
          canRedo={canRedo}
          undoName={undoName}
          redoName={redoName}
          designSnapshot={designSnapshot}
          onPlan={goPlan}
          onFurnish={goFurnish}
          onAiDesign={() => {
            if (aiDesignEnabled) {
              goAiDesign();
            }
          }}
          onShop={goShop}
          onExport={() => {
            if (editorMode === "present") {
              setShowPresentModal(false);
              setEditorMode("design");
            } else {
              setEditorMode("present");
            }
          }}
          onUndo={undoSafe}
          onRedo={redoSafe}
          onViewModeChange={handleEditorViewModeChange}
          onSwitchRoom={handleSwitchRoom}
          onAddDesignerRoom={() => handleAddRoom()}
          onRenameRoom={handleRenameRoom}
          onToggleDesignerMode={() => {
            if (!canUseDesigner && !isDesigner) {
              setUpgradeReason("designer");
              setShowUpgrade(true);
              return;
            }
            setUrlMode(isDesigner ? "homeowner" : "designer");
          }}
          onToggleClientPreview={() => setClientPreview((value) => !value)}
          showLoadDesign={!!session?.user}
          onToggleLoadDesign={() => {
            if (!showMyDesigns) {
              fetchMyDesigns();
            }
            setShowMyDesigns(!showMyDesigns);
          }}
          onSave={async () => {
            if (!session?.user) {
              openGuestPrompt("save", () => {});
              return;
            }
            const savedId = await saveDesignToCloud();
            if (savedId) {
              alert(`Saved to cloud! Design ID: ${savedId}`);
            }
          }}
          onOpenPresentExport={() => setShowPresentModal(true)}
        />

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
            onCart={() => setEditorMode("buy")}
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

      {/* Layer 2C: Commerce Panel (visible in BUY mode) */}
      {editorMode === "buy" && (
        <div
          className={`absolute right-4 top-20 z-20 w-85 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 space-y-4 transition-opacity duration-300 ${
            isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          aria-hidden={isClientPreview}
        >
          <div
            className={
              showDesignerTheme
                ? "sticky top-0 z-30 rounded-lg border border-white/15 bg-[#12151dcc] px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-200 backdrop-blur"
                : "sticky top-0 z-30 rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-700 backdrop-blur"
            }
          >
            Shopping List
          </div>
          <ShoppingOverviewPanel
            dark={showDesignerTheme}
            activeRoom={activeRoomShoppingSummary}
            rooms={roomShoppingSummaries}
            wholeHome={wholeHomeShoppingSummary}
            onSelectRoom={handleSwitchRoom}
            onGoFurnish={goFurnish}
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
          onSetQty={(instanceId, qty) => {
            commitItems((prev) =>
              prev.map((x) => (x.instanceId === instanceId ? { ...x, qty } : x)),
              "Change quantity"
            );
          }}
          onSetInclude={(instanceId, includeInCheckout) => {
            commitItems((prev) =>
              prev.map((x) =>
                x.instanceId === instanceId ? { ...x, includeInCheckout } : x
              ),
              includeInCheckout ? "Include in checkout" : "Exclude from checkout"
            );
          }}
          onBulkSwap={onBulkSwap}
          onShowUpgrade={() => setShowUpgrade(true)}
          theme={showDesignerTheme ? "designer" : "default"}
        />
        </div>
      )}

      {/* Layer 2B: Inspector Panel (visible in ADJUST mode when item selected) */}
      {editorMode === "adjust" && selectedProduct && (
        <div
          className={`absolute right-4 top-20 z-20 w-[320px] md:w-85 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 transition-opacity duration-300 ${
            isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          aria-hidden={isClientPreview}
        >
        {selectedProduct && (
          <div
            data-testid="selected-item-panel"
            className={
              showDesignerTheme
                ? "designer-panel designer-panel-strong w-85 rounded-xl p-4"
                : "w-85 rounded-xl bg-white p-4 shadow"
            }
          >
            <div
              className={
                  showDesignerTheme
                    ? "designer-text-primary text-sm font-semibold"
                    : "text-sm font-semibold text-neutral-900"
              }
            >
              <div
                className={
                  showDesignerTheme
                    ? "sticky top-0 z-20 -mx-4 mb-2 border-b border-white/15 bg-[#12151dcc] px-4 py-2 backdrop-blur"
                    : "sticky top-0 z-20 -mx-4 mb-2 border-b border-neutral-200 bg-white/95 px-4 py-2 backdrop-blur"
                }
              >
                Selected Item
              </div>
            </div>

            <SelectedItemDetailsPanel
              dark={showDesignerTheme}
              isDesigner={isDesigner}
              product={selectedProduct}
              item={selectedItem}
              selectedBrand={selectedBrand}
              selectedModelTitle={selectedModelTitle}
              selectedCategoryDebugLabel={selectedCategoryDebugLabel}
              activeVariantLabel={activeVariantLabel}
              productDetailSections={selectedProductDetailSections}
              fullDimensionsDetails={fullDimensionsDetails}
              selectedDimensionImageUrl={selectedDimensionImageUrl}
              showInspectorDetails={showInspectorDetails}
              showFullDimensions={showFullDimensions}
              showDeliveryWarranty={showDeliveryWarranty}
              showRotationControls={showRotationControls}
              onToggleInspectorDetails={() => setShowInspectorDetails((value) => !value)}
              onToggleFullDimensions={() => setShowFullDimensions((value) => !value)}
              onToggleDeliveryWarranty={() => setShowDeliveryWarranty((value) => !value)}
              onToggleRotationControls={() => setShowRotationControls((value) => !value)}
            />

            {selectedItem ? (
              <SelectedItemRotationControls
                dark={showDesignerTheme}
                isDesigner={isDesigner}
                expanded={showRotationControls}
                selectedRotationDegrees={selectedRotationDegrees}
                rotationSnapEnabled={rotationSnapEnabled}
                rotationSnapStepDegrees={rotationSnapStepDegrees}
                rotationSnapPresetDegrees={rotationSnapPresetDegrees}
                rotationInputValue={rotationInputValue}
                disabled={rotateControlsDisabled}
                onSnapPresetChange={setRotationSnapPresetDegrees}
                onRotateByDegrees={rotateSelectedByDegrees}
                onResetRotation={resetSelectedRotation}
                onRotationInputChange={setRotationInputValue}
                onApplyRotationInput={applyRotationInputValue}
              />
            ) : null}

            {orientationOptions?.length ? (
              <div className="pt-3">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  Orientation
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  {orientationOptions.map((option) => {
                    const active = option.productId === selectedProduct.id;
                    const disabled = !option.productId || !canEdit;

                    return (
                      <button
                        key={`orientation-${option.label}`}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          showDesignerTheme
                            ? "designer-text-primary"
                            : "text-neutral-900"
                        } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                        disabled={disabled}
                        onClick={() => {
                          if (!selectedItem || !option.productId) return;
                          if (option.productId === selectedProduct.id) return;

                          ensureImportedCatalogItem(option.productId);
                          const optionProduct = CATALOG_ITEMS[option.productId];
                          if (!optionProduct) return;

                          commitItems(
                            (prev) => {
                              const current = prev.find(
                                (it) => it.instanceId === selectedItem.instanceId
                              );
                              const currentVariant = selectedProduct.variants.find(
                                (variant) => variant.id === current?.variantId
                              );
                              const currentFinishCode = String(
                                currentVariant?.finishCode ?? ""
                              )
                                .trim()
                                .toLowerCase();
                              const currentLabel = String(currentVariant?.label ?? "")
                                .trim()
                                .toLowerCase();
                              const nextVariant =
                                optionProduct.variants.find((variant) =>
                                  currentFinishCode
                                    ? String(variant.finishCode ?? "")
                                        .trim()
                                        .toLowerCase() === currentFinishCode
                                    : false
                                ) ??
                                optionProduct.variants.find(
                                  (variant) =>
                                    String(variant.label ?? "")
                                      .trim()
                                      .toLowerCase() === currentLabel
                                ) ??
                                optionProduct.variants[0];

                              return prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? {
                                      ...it,
                                      productId: optionProduct.id,
                                      variantId: nextVariant?.id ?? optionProduct.defaultVariantId,
                                    }
                                  : it
                              );
                            },
                            `Change orientation to ${option.label}`
                          );
                        }}
                        title={option.label}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {showJaronConfigurationSelector && visibleJaronConfigurationGroup ? (
              <div className="pt-3" data-testid="jaron-configuration-selector">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  Configuration
                </div>

                <div className="mt-2 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
                  <div className="grid grid-cols-2 border-b border-neutral-200">
                    {jaronConfigurationGroups.map((group) => {
                      const firstOption = group.options[0];
                      const targetProductId =
                        activeJaronArmKey === "wide"
                          ? firstOption?.wideProductId
                          : firstOption?.slimProductId;
                      const active = group.key === visibleJaronConfigurationGroup.key;
                      const disabled = !targetProductId || !canEdit;

                      return (
                        <button
                          key={group.key}
                          data-testid={`jaron-config-tab-${group.key}`}
                          data-active={active ? "true" : "false"}
                          className={`px-3 py-2 text-xs font-semibold ${
                            active
                              ? "bg-neutral-900 text-white"
                              : showDesignerTheme
                                ? "designer-text-primary bg-white"
                                : "bg-white text-neutral-900"
                          }`}
                          disabled={disabled}
                          onClick={() => {
                            if (!targetProductId) return;
                            switchSelectedProductModel(
                              targetProductId,
                              `Change Jaron configuration to ${group.label}`
                            );
                          }}
                        >
                          {group.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-2 p-2">
                    {visibleJaronConfigurationGroup.options.map((option) => {
                      const targetProductId =
                        activeJaronArmKey === "wide"
                          ? option.wideProductId
                          : option.slimProductId;
                      const active = option.key === visibleJaronConfigurationOption?.key;
                      const disabled = !targetProductId || !canEdit;

                      return (
                        <button
                          key={option.key}
                          data-testid={`jaron-config-option-${option.key}`}
                          data-active={active ? "true" : "false"}
                          className={`block w-full rounded-lg border px-3 py-3 text-left ${
                            active
                              ? "bg-neutral-900 text-white"
                              : showDesignerTheme
                                ? "designer-text-primary border-neutral-200 bg-white"
                                : "border-neutral-200 bg-white text-neutral-900"
                          }`}
                          disabled={disabled}
                          onClick={() => {
                            switchSelectedProductModel(
                              targetProductId,
                              `Change Jaron model to ${option.label}`
                            );
                          }}
                        >
                          <span className="flex items-center gap-3">
                            <span className="flex h-14 w-20 shrink-0 items-center justify-center">
                              <JaronConfigurationDiagram
                                diagram={option.diagram}
                                active={active}
                              />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold">
                                {option.label}
                              </span>
                              <span
                                className={`mt-1 block text-xs ${
                                  active ? "text-white/80" : "text-neutral-500"
                                }`}
                              >
                                {option.description}
                              </span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {visibleJaronConfigurationOption ? (
                  <div className="mt-3">
                    <div
                      className={
                        showDesignerTheme
                          ? "designer-text-primary text-sm font-semibold"
                          : "text-sm font-semibold text-neutral-900"
                      }
                    >
                      Arm style
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {[
                        { key: "slim" as const, label: "Slim arm" },
                        { key: "wide" as const, label: "Wide arm" },
                      ].map((option) => {
                        const targetProductId =
                          option.key === "wide"
                            ? visibleJaronConfigurationOption.wideProductId
                            : visibleJaronConfigurationOption.slimProductId;
                        const active = option.key === activeJaronArmKey;
                        const disabled = !targetProductId || !canEdit;

                        return (
                          <button
                            key={option.key}
                            data-testid={`jaron-arm-${option.key}`}
                            data-active={active ? "true" : "false"}
                            className={`rounded-lg border px-3 py-2 text-sm ${
                              showDesignerTheme
                                ? "designer-text-primary"
                                : "text-neutral-900"
                            } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                            disabled={disabled}
                            onClick={() => {
                              switchSelectedProductModel(
                                targetProductId,
                                `Change Jaron arm style to ${option.label}`
                              );
                            }}
                            title={option.label}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {!showJaronConfigurationSelector && armStyleOptions?.length ? (
              <div className="pt-3">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  Variant
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {armStyleOptions.map((option) => {
                    const active = option.productId === selectedProduct.id;
                    const disabled = !option.productId || !canEdit;

                    return (
                      <button
                        key={option.label}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          showDesignerTheme
                            ? "designer-text-primary"
                            : "text-neutral-900"
                        } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                        disabled={disabled}
                        onClick={() => {
                          if (!selectedItem || !option.productId) return;
                          if (option.productId === selectedProduct.id) return;

                          ensureImportedCatalogItem(option.productId);
                          const optionProduct = CATALOG_ITEMS[option.productId];
                          if (!optionProduct) return;

                          commitItems(
                            (prev) => {
                              const current = prev.find(
                                (it) => it.instanceId === selectedItem.instanceId
                              );
                              const currentVariantId = current?.variantId;
                              const nextVariant =
                                optionProduct.variants.find((v) => v.id === currentVariantId) ??
                                optionProduct.variants[0];

                              return prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? {
                                      ...it,
                                      productId: optionProduct.id,
                                      variantId: nextVariant?.id ?? optionProduct.defaultVariantId,
                                    }
                                  : it
                              );
                            },
                            `Change variant to ${option.label}`
                          );
                        }}
                        title={
                          option.productId
                            ? option.label
                            : `${option.label} (model not added yet)`
                        }
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {!showJaronConfigurationSelector && showVariantsSection ? (
              <div className="pt-2">
              <div
                className={
                  showDesignerTheme
                    ? "designer-text-primary text-sm font-semibold"
                    : "text-sm font-semibold text-neutral-900"
                }
              >
                {hasStructuredVariantLabels ? "Model" : "Variants"}
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {hasStructuredVariantLabels || useModelOptionsAsVariants ? (
                  modelSelectorProductIds.map((productId) => {
                    const optionProduct = CATALOG_ITEMS[productId];
                    if (!optionProduct) return null;
                    const active = optionProduct.id === selectedModelProductId;
                    const casaWidthMatch = optionProduct.id.match(/(?:casa|seb|sloane)-tv-console-(\d+)/i);
                    const optionProductIdLower = optionProduct.id.toLowerCase();
                    const averyModelLabel =
                      optionProductIdLower ===
                      "armchair-real-castlery-avery-performance-swivel-armchair-with-ottoman"
                        ? "Swivel Armchair with Ottoman"
                        : optionProductIdLower ===
                            "armchair-real-castlery-avery-performance-armchair-with-ottoman"
                          ? "Armchair with Ottoman"
                          : optionProductIdLower ===
                              "armchair-real-castlery-avery-performance-swivel-armchair"
                            ? "Swivel Armchair"
                            : optionProductIdLower ===
                                "armchair-real-castlery-avery-performance-armchair"
                              ? "Armchair"
                              : null;
                    const optionLabel =
                      (optionProductIdLower.includes("sloane-dining-table")
                        ? "Dining table"
                        : optionProductIdLower.includes("sloane-travertine")
                          ? "Travertine dining table"
                          : optionProductIdLower.includes("sloane-bench")
                            ? "Bench"
                          : null) ??
                      averyModelLabel ??
                      (casaWidthMatch ? `${casaWidthMatch[1]}CM` : null) ??
                      optionProduct.metadata?.modelLabel ??
                      optionProduct.title.match(/(\d+\s*Seater)/i)?.[1] ??
                      "Standard";

                    return (
                      <button
                        key={optionProduct.id}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          showDesignerTheme
                            ? "designer-text-primary"
                            : "text-neutral-900"
                        } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                        disabled={!canEdit}
                        onClick={() => {
                          if (!selectedItem) return;
                          if (optionProduct.id === selectedProduct.id) return;

                          ensureImportedCatalogItem(optionProduct.id);

                          commitItems(
                            (prev) => {
                              const current = prev.find(
                                (it) => it.instanceId === selectedItem.instanceId
                              );
                              const currentVariantId = current?.variantId;
                              const nextVariant =
                                optionProduct.variants.find((v) => v.id === currentVariantId) ??
                                optionProduct.variants[0];

                              return prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? {
                                      ...it,
                                      productId: optionProduct.id,
                                      variantId: nextVariant?.id ?? optionProduct.defaultVariantId,
                                    }
                                  : it
                              );
                            },
                            `Change model to ${optionLabel}`
                          );
                        }}
                        title={optionLabel}
                      >
                        {optionLabel}
                      </button>
                    );
                  })
                ) : useShapeOptionsAsVariants ? (
                  (shapeOptions ?? []).map((option) => {
                    const active = option.productId === selectedProduct?.id;
                    const disabled = !option.productId || !canEdit;

                    return (
                      <button
                        key={`variant-shape-${option.label}`}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          showDesignerTheme
                            ? "designer-text-primary"
                            : "text-neutral-900"
                        } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                        disabled={disabled}
                        onClick={() => {
                          if (!selectedItem || !option.productId) return;
                          if (option.productId === selectedProduct?.id) return;

                          const optionProduct = CATALOG_ITEMS[option.productId];
                          if (!optionProduct) return;

                          commitItems(
                            (prev) => {
                              const current = prev.find(
                                (it) => it.instanceId === selectedItem.instanceId
                              );
                              const currentVariantId = current?.variantId;
                              const nextVariant =
                                optionProduct.variants.find((v) => v.id === currentVariantId) ??
                                optionProduct.variants[0];

                              return prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? {
                                      ...it,
                                      productId: optionProduct.id,
                                      variantId: nextVariant?.id ?? optionProduct.defaultVariantId,
                                    }
                                  : it
                              );
                            },
                            `Change variant to ${option.label}`
                          );
                        }}
                        title={option.label}
                      >
                        {option.label}
                      </button>
                    );
                  })
                ) : useLengthOptionsAsVariants ? (
                  (lengthOptions ?? []).map((option) => {
                    const active = option.productId === selectedProduct?.id;
                    const disabled = !option.productId || !canEdit;

                    return (
                      <button
                        key={`variant-length-${option.label}`}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          showDesignerTheme
                            ? "designer-text-primary"
                            : "text-neutral-900"
                        } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                        disabled={disabled}
                        onClick={() => {
                          if (!selectedItem || !option.productId) return;
                          if (option.productId === selectedProduct?.id) return;

                          const optionProduct = CATALOG_ITEMS[option.productId];
                          if (!optionProduct) return;

                          commitItems(
                            (prev) => {
                              const current = prev.find(
                                (it) => it.instanceId === selectedItem.instanceId
                              );
                              const currentVariantId = current?.variantId;
                              const nextVariant =
                                optionProduct.variants.find((v) => v.id === currentVariantId) ??
                                optionProduct.variants[0];

                              return prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? {
                                      ...it,
                                      productId: optionProduct.id,
                                      variantId: nextVariant?.id ?? optionProduct.defaultVariantId,
                                    }
                                  : it
                              );
                            },
                            `Change variant to ${option.label}`
                          );
                        }}
                        title={option.label}
                      >
                        {option.label}
                      </button>
                    );
                  })
                ) : (
                  isSloaneBenchSelected ? (
                    [
                      { key: "no" as const, label: "No Cushion", colorHex: "#9c9c9c" },
                      { key: "leather" as const, label: "Leather Cushion", colorHex: "#8a643f" },
                    ].map((option) => {
                      const active = activeSelectedBenchCushion === option.key;
                      return (
                        <button
                          key={`variant-swatch-sloane-bench-${option.key}`}
                          data-testid={`variant-swatch-sloane-bench-${option.key}`}
                          data-active={active ? "true" : "false"}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                            showDesignerTheme
                              ? "designer-text-primary"
                              : "text-neutral-900"
                          } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                          onClick={() => {
                            if (!selectedItem) return;
                            const targetProductId = getSloaneBenchProductId(activeSelectedBenchSize, option.key);
                            ensureImportedCatalogItem(targetProductId);
                            const optionProduct = CATALOG_ITEMS[targetProductId];
                            if (!optionProduct) return;

                            commitItems(
                              (prev) =>
                                prev.map((it) =>
                                  it.instanceId === selectedItem.instanceId
                                    ? {
                                        ...it,
                                        productId: optionProduct.id,
                                        variantId: optionProduct.defaultVariantId,
                                      }
                                    : it
                                ),
                              `Change variant to ${option.label}`
                            );
                          }}
                        >
                          <span
                            className="h-5 w-5 rounded-full border"
                            style={{ background: option.colorHex }}
                          />
                          {option.label}
                        </button>
                      );
                    })
                  ) : (
                    selectedProduct.variants.map((v) => {
                      const active = v.id === selectedItem?.variantId;
                      return (
                        <button
                          key={v.id}
                          data-testid={`variant-swatch-${v.id}`}
                          data-active={active ? "true" : "false"}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                            showDesignerTheme
                              ? "designer-text-primary"
                              : "text-neutral-900"
                          } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                          onClick={() => {
                            if (!selectedItem) return;
                            commitItems((prev) =>
                              prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? { ...it, variantId: v.id }
                                  : it
                              )
                            );
                          }}
                        >
                          <span
                            className="h-5 w-5 rounded-full border"
                            style={{ background: v.colorHex }}
                          />
                          {v.label.replace(/^\s*\d+\s*(?:cm)?\s*/i, "").trim()}
                        </button>
                      );
                    })
                  )
                )}
              </div>
              </div>
            ) : null}

            {sloaneBenchMaterialSwatch ? (
              <div className="pt-3" data-testid="selected-sloane-bench-material-section">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  Material
                </div>
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-secondary mt-2 text-xs"
                      : "mt-2 text-xs text-neutral-600"
                  }
                  data-testid="selected-sloane-bench-material-label"
                >
                  Selected: {sloaneBenchMaterialSwatch.label}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <div
                    className="shrink-0 h-20 w-20 rounded-sm bg-cover bg-center"
                    data-testid="selected-sloane-bench-material-swatch"
                    role="img"
                    aria-label={`${sloaneBenchMaterialSwatch.label} leather swatch`}
                    style={{
                      backgroundColor: sloaneBenchMaterialSwatch.colorHex,
                      backgroundImage: sloaneBenchMaterialSwatch.swatchTextureUrl
                        ? `url(${sloaneBenchMaterialSwatch.swatchTextureUrl})`
                        : undefined,
                      boxShadow: "0 0 0 2px #fff, 0 0 0 4px #5a2135",
                    }}
                  />
                </div>
              </div>
            ) : null}

            {lengthOptions?.length && !useLengthOptionsAsVariants ? (
              <div className="pt-3">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  Length
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {lengthOptions.map((option) => {
                    const active = option.productId === selectedProduct.id;
                    const disabled = !option.productId || !canEdit;

                    return (
                      <button
                        key={option.label}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          showDesignerTheme
                            ? "designer-text-primary"
                            : "text-neutral-900"
                        } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                        disabled={disabled}
                        onClick={() => {
                          if (!selectedItem || !option.productId) return;
                          if (option.productId === selectedProduct.id) return;

                          const optionProduct = CATALOG_ITEMS[option.productId];
                          if (!optionProduct) return;

                          commitItems(
                            (prev) => {
                              const current = prev.find(
                                (it) => it.instanceId === selectedItem.instanceId
                              );
                              const currentVariantId = current?.variantId;
                              const nextVariant =
                                optionProduct.variants.find((v) => v.id === currentVariantId) ??
                                optionProduct.variants[0];

                              return prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? {
                                      ...it,
                                      productId: optionProduct.id,
                                      variantId: nextVariant?.id ?? optionProduct.defaultVariantId,
                                    }
                                  : it
                              );
                            },
                            `Change length to ${option.label}`
                          );
                        }}
                        title={option.label}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {huggModelOptions.length > 1 ? (
              <div className="pt-3">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  Model
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {huggModelOptions.map((option) => (
                    <button
                      key={option.key}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        showDesignerTheme
                          ? "designer-text-primary"
                          : "text-neutral-900"
                      } ${option.active ? "designer-accent-border" : "border-neutral-200"}`}
                      data-testid={`hugg-model-option-${option.key}`}
                      disabled={!canEdit}
                      onClick={() => {
                        if (!selectedItem || option.active) return;

                        ensureImportedCatalogItem(option.productId);
                        const optionProduct = CATALOG_ITEMS[option.productId];
                        if (!optionProduct) return;

                        const currentVariant = selectedProduct.variants.find(
                          (variant) => variant.id === selectedItem.variantId
                        );
                        const currentFinishCode = currentVariant?.finishCode
                          ?.trim()
                          .toLowerCase();
                        const currentFinishLabel = (
                          currentVariant?.finishLabel ??
                          currentVariant?.label ??
                          ""
                        )
                          .trim()
                          .toLowerCase();
                        const nextVariant =
                          optionProduct.variants.find(
                            (variant) =>
                              currentVariant?.id && variant.id === currentVariant.id
                          ) ??
                          optionProduct.variants.find(
                            (variant) =>
                              currentFinishCode &&
                              variant.finishCode?.trim().toLowerCase() ===
                                currentFinishCode
                          ) ??
                          optionProduct.variants.find((variant) => {
                            const label = (
                              variant.finishLabel ??
                              variant.label ??
                              ""
                            )
                              .trim()
                              .toLowerCase();
                            return Boolean(currentFinishLabel && label === currentFinishLabel);
                          }) ??
                          optionProduct.variants[0];

                        commitItems(
                          (prev) =>
                            prev.map((it) =>
                              it.instanceId === selectedItem.instanceId
                                ? {
                                    ...it,
                                    productId: optionProduct.id,
                                    variantId:
                                      nextVariant?.id ?? optionProduct.defaultVariantId,
                                  }
                                : it
                            ),
                          `Change Hugg model to ${option.label}`
                        );
                      }}
                      title={option.label}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {sebCoffeeTableModelOptions.length > 1 ? (
              <div className="pt-3">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  Model
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {sebCoffeeTableModelOptions.map((option) => (
                    <button
                      key={option.key}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        showDesignerTheme
                          ? "designer-text-primary"
                          : "text-neutral-900"
                      } ${option.active ? "designer-accent-border" : "border-neutral-200"}`}
                      data-testid={`seb-model-option-${option.key}`}
                      data-active={option.active ? "true" : "false"}
                      disabled={!canEdit}
                      onClick={() => {
                        if (!selectedItem || option.active) return;

                        ensureImportedCatalogItem(option.productId);
                        const optionProduct = CATALOG_ITEMS[option.productId];
                        if (!optionProduct) return;

                        const currentVariant = selectedProduct.variants.find(
                          (variant) => variant.id === selectedItem.variantId
                        );
                        const currentFinishCode = currentVariant?.finishCode
                          ?.trim()
                          .toLowerCase();
                        const nextVariant =
                          optionProduct.variants.find(
                            (variant) =>
                              currentFinishCode &&
                              variant.finishCode?.trim().toLowerCase() ===
                                currentFinishCode
                          ) ?? optionProduct.variants[0];

                        commitItems(
                          (prev) =>
                            prev.map((it) =>
                              it.instanceId === selectedItem.instanceId
                                ? {
                                    ...it,
                                    productId: optionProduct.id,
                                    variantId:
                                      nextVariant?.id ?? optionProduct.defaultVariantId,
                                  }
                                : it
                            ),
                          `Change Seb model to ${option.label}`
                        );
                      }}
                      title={option.label}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedItem && selectedConfigOptions.length > 1 ? (
              <div className="pt-3">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  {selectedConfigUi?.label ?? "Layout"}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedConfigOptions.map((code) => {
                    const active = code === selectedConfigurationCode;
                    const optionLabel = selectedConfigUi?.option_labels?.[code] ?? code;
                    return (
                      <button
                        key={`config-${code}`}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          showDesignerTheme
                            ? "designer-text-primary"
                            : "text-neutral-900"
                        } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                        disabled={!canEdit}
                        onClick={() => {
                          if (!selectedItem) return;
                          setItemConfigurationByInstanceId((prev) => ({
                            ...prev,
                            [selectedItem.instanceId]: code,
                          }));
                          commitItems(
                            (prev) =>
                              prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? { ...it, configurationCode: code }
                                  : it
                              ),
                            `Change layout to ${optionLabel}`
                          );
                        }}
                      >
                        {optionLabel}
                      </button>
                    );
                  })}
                </div>

                {selectedConfigUi?.helper_text ? (
                  <div
                    className={
                      showDesignerTheme
                        ? "designer-text-secondary mt-2 text-xs"
                        : "mt-2 text-xs text-neutral-600"
                    }
                  >
                    {selectedConfigUi.helper_text}
                  </div>
                ) : null}

                {selectedConfigEntry ? (
                  <div
                    className={
                      showDesignerTheme
                        ? "designer-text-secondary mt-2 text-xs"
                        : "mt-2 text-xs text-neutral-600"
                    }
                  >
                    Recommended planning size: {Math.round(Number(selectedConfigEntry.planning_bounds_cm?.width ?? selectedConfigEntry.dimensions_recommended_planning?.width_cm ?? selectedConfigEntry.placement_footprint?.planning_width_cm ?? 0))} x {Math.round(Number(selectedConfigEntry.planning_bounds_cm?.depth ?? selectedConfigEntry.dimensions_recommended_planning?.depth_cm ?? selectedConfigEntry.placement_footprint?.planning_depth_cm ?? 0))} cm
                  </div>
                ) : null}

                {selectedConfigBehavior?.affects_visual_footprint && selectedConfigEntry?.visual_bounds_cm ? (
                  <div
                    className={
                      showDesignerTheme
                        ? "designer-text-secondary mt-1 text-xs"
                        : "mt-1 text-xs text-neutral-600"
                    }
                  >
                    Visual footprint: {Math.round(Number(selectedConfigEntry.visual_bounds_cm.width ?? 0))} x {Math.round(Number(selectedConfigEntry.visual_bounds_cm.depth ?? 0))} cm
                  </div>
                ) : null}

                {selectedConfigEntry?.estimation_note ? (
                  <div
                    className={
                      showDesignerTheme
                        ? "designer-text-secondary mt-2 text-xs"
                        : "mt-2 text-xs text-neutral-600"
                    }
                  >
                    {selectedConfigEntry.estimation_note}
                  </div>
                ) : null}
              </div>
            ) : null}

            {(showFinishSection || huggFabricSwatchOptions.length > 1) ? (
              <div className="pt-3">
              <div className="flex items-center justify-between gap-2">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  {hasWoodColourOptions ? "Fabric colour" : "Material"}
                </div>
              </div>

              {hasWoodColourOptions && activeMaterialLabel ? (
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-secondary mt-2 text-xs"
                      : "mt-2 text-xs text-neutral-600"
                  }
                >
                  Selected: {huggFabricSwatchOptions.length > 0
                    ? (huggFabricSwatchOptions.find((option) => option.active)?.label ?? huggFabricSwatchOptions[0].label)
                    : activeMaterialLabel}
                </div>
              ) : null}

              <div
                className={
                  hasWoodColourOptions
                    ? "mt-2 flex flex-wrap gap-2"
                    : "mt-2 grid grid-cols-2 gap-3"
                }
              >
                {(huggFabricSwatchOptions.length > 0
                  ? huggFabricSwatchOptions.map((entry) => ({
                      key: entry.key,
                      label: entry.label,
                      variantId: "",
                      colorHex: entry.colorHex,
                      productId: entry.productId,
                      swatchTextureUrl: entry.swatchTextureUrl,
                      isActive: entry.active,
                    }))
                  : materialOptions.map((entry) => ({
                      key: entry.key,
                      label: entry.label,
                      variantId: entry.variantId,
                      colorHex: entry.colorHex,
                      productId: "",
                      swatchTextureUrl: null,
                      isActive: false,
                    }))
                ).map((option) => {
                  const active =
                    option.isActive ||
                    option.variantId === activeStructuredVariant?.variant.id ||
                    option.label.toLowerCase() === String(activeMaterialLabel ?? "").trim().toLowerCase();
                  if (!hasWoodColourOptions) {
                    return (
                      <button
                        key={option.key}
                        className={`w-full rounded-2xl border px-4 py-1 text-base transition ${
                          active
                            ? "border-[#4b1427] bg-[#4b1427] text-white"
                            : "border-neutral-300 bg-white text-[#4b2635]"
                        }`}
                        onClick={() => {
                          if (!selectedItem) return;
                          const target =
                            structuredVariants.find((entry) => entry.materialType === option.label) ??
                            structuredVariants.find((entry) => entry.variant.id === option.variantId);
                          if (!target) return;
                          commitItems(
                            (prev) =>
                              prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? { ...it, variantId: target.variant.id }
                                  : it
                              ),
                            `Change material to ${option.label}`
                          );
                        }}
                        title={option.label}
                      >
                        {option.label}
                      </button>
                    );
                  }

                  const sampleEntry =
                    structuredVariants.find(
                      (entry) =>
                        entry.materialDisplayLabel.trim().toLowerCase() ===
                        option.label.trim().toLowerCase()
                    ) ?? structuredVariants.find((entry) => entry.variant.id === option.variantId);
                  const finishKey = String(sampleEntry?.variant.finishCode ?? option.label)
                    .trim()
                    .toLowerCase()
                    .replace(/_/g, "-")
                    .replace(/[^a-z0-9-]+/g, "-");
                  const swatchTextureUrl =
                    option.swatchTextureUrl ??
                    CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[finishKey] ??
                    CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[
                      option.label
                        .trim()
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                    ] ??
                    null;

                  return (
                    <button
                      key={option.key}
                      className="shrink-0 h-20 w-20 rounded-sm bg-cover bg-center transition-all"
                      style={{
                        backgroundColor: option.colorHex,
                        backgroundImage: swatchTextureUrl ? `url(${swatchTextureUrl})` : undefined,
                        boxShadow: active
                          ? "0 0 0 2px #fff, 0 0 0 4px #5a2135"
                          : "none",
                      }}
                      onClick={() => {
                        if (!selectedItem) return;
                        if (option.productId) {
                          const targetProduct = CATALOG_ITEMS[option.productId];
                          if (!targetProduct) return;
                          commitItems(
                            (prev) =>
                              prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? (() => {
                                      const normalizeMatchValue = (value?: string | null) =>
                                        String(value ?? "")
                                          .trim()
                                          .toLowerCase()
                                          .replace(/_/g, "-")
                                          .replace(/[^a-z0-9-]+/g, "-");
                                      const activeVariant = selectedProduct.variants.find(
                                        (variant) => variant.id === it.variantId
                                      );
                                      const activeFinishCode = normalizeMatchValue(activeVariant?.finishCode);
                                      const activeFinishLabel = normalizeMatchValue(
                                        activeVariant?.finishLabel ?? activeVariant?.label
                                      );
                                      const preservedVariant =
                                        targetProduct.variants.find((variant) => variant.id === it.variantId) ??
                                        targetProduct.variants.find(
                                          (variant) =>
                                            activeFinishCode.length > 0 &&
                                            normalizeMatchValue(variant.finishCode) === activeFinishCode
                                        ) ??
                                        targetProduct.variants.find(
                                          (variant) =>
                                            activeFinishLabel.length > 0 &&
                                            normalizeMatchValue(variant.finishLabel ?? variant.label) ===
                                              activeFinishLabel
                                        ) ??
                                        targetProduct.variants[0];
                                      return {
                                        ...it,
                                        productId: targetProduct.id,
                                        variantId: preservedVariant?.id ?? targetProduct.defaultVariantId,
                                      };
                                    })()
                                  : it
                              ),
                            `Change fabric colour to ${option.label}`
                          );
                          return;
                        }

                        const target =
                          structuredVariants.find(
                            (entry) =>
                              entry.materialDisplayLabel.trim().toLowerCase() === option.label.trim().toLowerCase() &&
                              entry.colourLabel === activeColourLabel
                          ) ??
                          structuredVariants.find(
                            (entry) =>
                              entry.materialDisplayLabel.trim().toLowerCase() === option.label.trim().toLowerCase()
                          ) ??
                          structuredVariants.find((entry) => entry.variant.id === option.variantId);
                        if (!target) return;
                        commitItems(
                          (prev) =>
                            prev.map((it) =>
                              it.instanceId === selectedItem.instanceId
                                ? { ...it, variantId: target.variant.id }
                                : it
                            ),
                          `Change fabric colour to ${option.label}`
                        );
                      }}
                      title={option.label}
                      aria-label={`Select fabric colour ${option.label}`}
                    />
                  );
                })}
              </div>
              </div>
            ) : null}

            {singleWoodFinishSwatch ? (
              <div className="pt-3" data-testid="selected-single-finish-section">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  {singleWoodFinishSwatch.sectionLabel}
                </div>
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-secondary mt-2 text-xs"
                      : "mt-2 text-xs text-neutral-600"
                  }
                  data-testid="selected-single-finish-label"
                >
                  Selected: {singleWoodFinishSwatch.label}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <div
                    className="shrink-0 h-20 w-20 rounded-sm bg-cover bg-center"
                    data-testid="selected-single-finish-swatch"
                    role="img"
                    aria-label={`${singleWoodFinishSwatch.label} wood swatch`}
                    style={{
                      backgroundColor: singleWoodFinishSwatch.colorHex,
                      backgroundImage: singleWoodFinishSwatch.swatchTextureUrl
                        ? `url(${singleWoodFinishSwatch.swatchTextureUrl})`
                        : undefined,
                      boxShadow: "0 0 0 2px #fff, 0 0 0 4px #5a2135",
                    }}
                  />
                </div>
              </div>
            ) : null}

            {isSloaneBenchSelected ? (
              <div className="pt-3" data-testid="selected-sloane-bench-variant-section">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  Variant
                </div>
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-secondary mt-2 text-xs"
                      : "mt-2 text-xs text-neutral-600"
                  }
                >
                  Selected: {activeSelectedBenchCushion === "leather" ? "With cushion" : "No cushion"}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    { key: "leather" as const, label: "With cushion" },
                    { key: "no" as const, label: "No cushion" },
                  ].map((option) => {
                    const active = activeSelectedBenchCushion === option.key;
                    return (
                      <button
                        key={`variant-swatch-sloane-bench-${option.key}`}
                        data-testid={`variant-swatch-sloane-bench-${option.key}`}
                        data-active={active ? "true" : "false"}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          showDesignerTheme
                            ? "designer-text-primary"
                            : "text-neutral-900"
                        } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                        disabled={!canEdit}
                        onClick={() => {
                          if (!selectedItem) return;
                          const targetProductId = getSloaneBenchProductId(activeSelectedBenchSize, option.key);
                          ensureImportedCatalogItem(targetProductId);
                          const optionProduct = CATALOG_ITEMS[targetProductId];
                          if (!optionProduct) return;

                          commitItems(
                            (prev) =>
                              prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? {
                                      ...it,
                                      productId: optionProduct.id,
                                      variantId: optionProduct.defaultVariantId,
                                    }
                                  : it
                              ),
                            `Change variant to ${option.label}`
                          );
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {showSizeSection ? (
              <div className="pt-3">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  Size
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {sizeOptionsForActiveSelection.map((option) => {
                    const active = option.variantId === selectedItem?.variantId;
                    return (
                      <button
                        key={option.key}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          showDesignerTheme ? "designer-text-primary" : "text-neutral-900"
                        } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                        disabled={!canEdit}
                        onClick={() => {
                          if (!selectedItem) return;
                          if (option.variantId === selectedItem.variantId) return;
                          commitItems(
                            (prev) =>
                              prev.map((it) =>
                                it.instanceId === selectedItem.instanceId
                                  ? { ...it, variantId: option.variantId }
                                  : it
                              ),
                            `Change size to ${option.label}`
                          );
                        }}
                        title={option.label}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {hasStructuredVariantLabels &&
              !hideColourSelector &&
              groupedVisibleColourVariants.reduce(
                (count, group) => count + group.entries.length,
                0
              ) >= (hasWoodColourOptions ? 2 : 1) && (
              <div className="pt-3">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  {hasWoodColourOptions
                    ? "Wood colour"
                    : activeMaterialType === "Leather"
                    ? "Stocked Leathers:"
                    : "Stocked Fabrics:"}
                </div>

                {activeStructuredVariant ? (
                  <div
                    className={
                      showDesignerTheme
                        ? "designer-text-secondary mt-2 text-xs"
                        : "mt-2 text-xs text-neutral-600"
                    }
                  >
                    Selected: {(() => {
                      if (!hasWoodColourOptions) return activeStructuredVariant.colourLabel;
                      const woodEntries = groupedVisibleColourVariants.flatMap((group) => group.entries);
                      const activeWoodEntry =
                        woodEntries.find((entry) => entry.variant.id === selectedItem?.variantId) ??
                        woodEntries[0];
                      return activeWoodEntry?.colourLabel ?? activeStructuredVariant.colourLabel;
                    })()}
                  </div>
                ) : null}

                {(() => {
                  const previewEntry = hoveredColourPreview
                    ? structuredVariants.find((x) => x.variant.id === hoveredColourPreview.variantId)
                    : null;
                  const previewGroup = previewEntry
                    ? groupedVisibleColourVariants.find((g) => g.entries.some((e) => e.variant.id === previewEntry.variant.id))
                    : null;
                  if (!previewEntry || !hoveredColourPreview) return null;

                  const previewFinishKey = String(previewEntry.variant.finishCode ?? "")
                    .trim()
                    .toLowerCase()
                    .replace(/_/g, "-");
                  const previewSwatchGroup = String(previewEntry.variant.swatchGroup ?? "")
                    .trim()
                    .toLowerCase();
                  const previewFinishLabelKey = String(
                    previewEntry.variant.finishLabel ?? previewEntry.colourLabel
                  )
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-");
                  const previewColourKey = String(previewEntry.colourLabel)
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-");
                  const isHuggWoodPreview =
                    Boolean(selectedProduct?.id.includes("hugg")) &&
                    (hasWoodColourOptions || previewSwatchGroup.includes("wood"));
                  const useWoodPreviewSwatch = previewSwatchGroup.includes("wood") || isHuggWoodPreview;
                  const previewSwatchUrl = useWoodPreviewSwatch
                    ? (selectedProduct?.id.includes("hugg")
                        ? HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE[previewFinishKey] ??
                          HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE[previewFinishLabelKey] ??
                          HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE[previewColourKey]
                        : CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[previewFinishKey] ??
                          CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[previewFinishLabelKey] ??
                          CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[previewColourKey]) ??
                      null
                    : CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[previewFinishKey] ??
                      CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[
                        `${String(previewEntry.materialType).toLowerCase()}-${previewEntry.colourLabel
                          .trim()
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")}`
                      ] ??
                      null;
                  const previewTitle =
                    previewEntry.variant.finishLabel?.trim() ||
                    (previewFinishKey
                      ? previewFinishKey
                          .split("-")
                          .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
                          .join(" ")
                      : previewEntry.colourLabel);
                  const previewSubtitle = isHuggWoodPreview
                    ? "Wood finish"
                    : [previewEntry.materialType, previewGroup?.label].filter(Boolean).join(" • ");
                  const previewProfile = isHuggWoodPreview
                    ? null
                    : resolveFabricDetailProfile({
                    finishCode: previewFinishKey,
                    finishLabel: previewEntry.variant.finishLabel?.trim() || "",
                    colourLabel: previewEntry.colourLabel,
                    materialType: previewEntry.materialType,
                  });

                  return (
                    <div
                      className="pointer-events-none fixed z-90 overflow-hidden rounded-sm shadow-2xl transition-opacity duration-150 ease-out"
                      style={{
                        left: hoveredColourPreview.x,
                        top: hoveredColourPreview.y,
                        width: 320,
                        opacity: hoveredColourPreviewVisible ? 1 : 0,
                      }}
                    >
                      <div
                        className="h-44 w-full bg-cover bg-center"
                        style={{
                          backgroundColor: previewEntry.variant.swatchHex ?? previewEntry.variant.colorHex,
                          backgroundImage: previewSwatchUrl ? `url(${previewSwatchUrl})` : undefined,
                        }}
                      />
                      <div className="space-y-1 bg-white px-4 py-3">
                        <div className="font-serif text-[18px] leading-snug text-[#4b2635]">{previewTitle}</div>
                        {previewSubtitle ? (
                          <div className="text-[12px] text-neutral-600">{previewSubtitle}</div>
                        ) : null}
                        {previewProfile ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {previewProfile.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-sm bg-[#f4f1eb] px-2 py-1 text-[11px] text-[#5b2d3c]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {previewEntry.variant.finishCode ? (
                          <div className="text-[11px] uppercase tracking-[0.18em] text-[#8f4b31]">
                            {previewEntry.variant.finishCode.replace(/_/g, " ")}
                          </div>
                        ) : null}
                        {previewProfile ? (
                          <>
                            <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-[#8f4b31]">
                              {String(previewEntry.materialType).toLowerCase() === "leather"
                                ? "Leather composition"
                                : "Fabric composition"}
                            </div>
                            <div className="text-[12px] leading-snug text-neutral-700">
                              {previewProfile.composition}
                            </div>
                            <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[#8f4b31]">
                              Care
                            </div>
                            <div className="text-[12px] leading-snug text-neutral-700">
                              {previewProfile.care}
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })()}

                <div className="mt-2 space-y-3">
                  {groupedVisibleColourVariants.map((group) => (
                    <div key={group.key}>
                      {!hasWoodColourOptions && group.label ? (
                        <div
                          className={
                            showDesignerTheme
                              ? "designer-text-secondary mb-2 text-[15px] font-medium tracking-tight"
                              : "mb-2 text-[15px] font-medium tracking-tight text-[#4b2635]"
                          }
                        >
                          {group.label === "Stocked" ? "Stocked fabrics:" : "Custom fabrics:"}
                        </div>
                      ) : null}
                      {!hasWoodColourOptions && group.key === "custom" ? (
                        <div className="mb-2 text-[13px] text-neutral-600">
                          Create a piece made just for you in one of our custom fabrics.
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {group.entries.map((entry) => {
                          const { variant, colourLabel } = entry;
                          const active = variant.id === selectedItem?.variantId;
                          const isHovered = variant.id === hoveredColourVariantId;
                          const finishKey = String(variant.finishCode ?? "")
                            .trim()
                            .toLowerCase()
                            .replace(/_/g, "-");
                          const swatchGroup = String(variant.swatchGroup ?? "")
                            .trim()
                            .toLowerCase();
                          const finishLabelKey = String(variant.finishLabel ?? colourLabel)
                            .trim()
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-");
                          const colourLabelKey = String(colourLabel)
                            .trim()
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-");
                          const isHuggWoodSwatch =
                            Boolean(selectedProduct?.id.includes("hugg")) &&
                            (hasWoodColourOptions || swatchGroup.includes("wood"));
                          const useWoodSwatchTexture = swatchGroup.includes("wood") || isHuggWoodSwatch;
                          const swatchTextureUrl = useWoodSwatchTexture
                            ? (selectedProduct?.id.includes("hugg")
                                ? HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE[finishKey] ??
                                  HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE[finishLabelKey] ??
                                  HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE[colourLabelKey]
                                : CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[finishKey] ??
                                  CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[finishLabelKey] ??
                                  CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[colourLabelKey]) ??
                              null
                            : CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[finishKey] ??
                              CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[
                                `${String(entry.materialType).toLowerCase()}-${colourLabel
                                  .trim()
                                  .toLowerCase()
                                  .replace(/[^a-z0-9]+/g, "-")}`
                              ] ??
                              null;
                          return (
                            <button
                              key={variant.id}
                              className="shrink-0 h-20 w-20 rounded-sm bg-cover bg-center transition-all"
                              style={{
                                backgroundColor: variant.swatchHex ?? variant.colorHex,
                                backgroundImage: swatchTextureUrl ? `url(${swatchTextureUrl})` : undefined,
                                boxShadow: active
                                  ? "0 0 0 2px #fff, 0 0 0 4px #5a2135"
                                  : isHovered
                                  ? "0 0 0 2px #fff, 0 0 0 3px #a0a0a0"
                                  : "none",
                              }}
                              onClick={() => {
                                if (!selectedItem) return;
                                commitItems((prev) =>
                                  prev.map((it) =>
                                    it.instanceId === selectedItem.instanceId
                                      ? { ...it, variantId: variant.id }
                                      : it
                                  ),
                                  `Change colour to ${colourLabel}`
                                );
                              }}
                              onMouseEnter={(event) => {
                                if (hoveredColourPreviewHideTimerRef.current) {
                                  window.clearTimeout(hoveredColourPreviewHideTimerRef.current);
                                  hoveredColourPreviewHideTimerRef.current = null;
                                }
                                const rect = event.currentTarget.getBoundingClientRect();
                                const cardWidth = 320;
                                const offset = 12;
                                let x = rect.right + offset;
                                if (x + cardWidth > window.innerWidth - 8) {
                                  x = Math.max(8, rect.left - cardWidth - offset);
                                }
                                const hoverProfile = resolveFabricDetailProfile({
                                  finishCode: finishKey,
                                  finishLabel: variant.finishLabel?.trim() || "",
                                  colourLabel,
                                  materialType: entry.materialType,
                                });
                                const isHuggWoodSwatch =
                                  Boolean(selectedProduct?.id.includes("hugg")) &&
                                  (hasWoodColourOptions || swatchGroup.includes("wood"));
                                const estimatedCardHeight = isHuggWoodSwatch ? 200 : hoverProfile ? 560 : 340;
                                const y = Math.max(
                                  8,
                                  Math.min(rect.top - 40, window.innerHeight - estimatedCardHeight - 8)
                                );
                                setHoveredColourVariantId(variant.id);
                                setHoveredColourPreview({ variantId: variant.id, x, y });
                                window.requestAnimationFrame(() => {
                                  setHoveredColourPreviewVisible(true);
                                });
                              }}
                              onMouseLeave={() => {
                                setHoveredColourVariantId((current) => (current === variant.id ? null : current));
                                setHoveredColourPreviewVisible(false);
                                if (hoveredColourPreviewHideTimerRef.current) {
                                  window.clearTimeout(hoveredColourPreviewHideTimerRef.current);
                                }
                                hoveredColourPreviewHideTimerRef.current = window.setTimeout(() => {
                                  setHoveredColourPreview((current) =>
                                    current?.variantId === variant.id ? null : current
                                  );
                                  hoveredColourPreviewHideTimerRef.current = null;
                                }, 140);
                              }}
                              onFocus={() => {
                                setHoveredColourVariantId(variant.id);
                                setHoveredColourPreviewVisible(false);
                                setHoveredColourPreview(null);
                              }}
                              onBlur={() => {
                                setHoveredColourVariantId((current) => (current === variant.id ? null : current));
                                setHoveredColourPreviewVisible(false);
                                setHoveredColourPreview((current) =>
                                  current?.variantId === variant.id ? null : current
                                );
                              }}
                              aria-label={`Select ${colourLabel.trim() || variant.finishLabel?.trim() || "finish"}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              className={
                showDesignerTheme
                  ? "mt-2 w-full rounded-lg bg-[#1b2030] px-3 py-2 text-sm text-white"
                  : "mt-2 w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white"
              }
              disabled={!canEdit}
              onClick={() => {
                if (!selectedInstanceId || !selectedProduct) return;

                const options = findSwapOptions({
                  productId: selectedProduct.id,
                  style,
                  direction: "cheaper",
                });

                const best = options[0];
                if (!best) return alert("No cheaper alternatives found.");

                commitItems((prev) =>
                  prev.map((x) =>
                    x.instanceId === selectedInstanceId
                      ? { ...x, productId: best.id, variantId: best.defaultVariantId }
                      : x
                  )
                );
              }}
            >
              Swap to cheaper
            </button>

            <button
              className={
                showDesignerTheme
                  ? "mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                  : "mt-2 w-full rounded-lg border px-3 py-2 text-sm"
              }
              disabled={!canEdit}
              onClick={() => {
                if (!selectedInstanceId || !selectedProduct) return;

                const options = findSwapOptions({
                  productId: selectedProduct.id,
                  style,
                  direction: "premium",
                });

                const best = options[0];
                if (!best) return alert("No premium alternatives found.");

                commitItems((prev) =>
                  prev.map((x) =>
                    x.instanceId === selectedInstanceId
                      ? { ...x, productId: best.id, variantId: best.defaultVariantId }
                      : x
                  )
                );
              }}
            >
              Upgrade this item
            </button>

            <div className="pt-2 flex gap-2">
              {(selectedResolvedVariant?.commerce.type === "affiliate" || selectedResolvedVariant?.commerce.type === "shopify") ? (
                <button
                  className="mt-3 w-full rounded-lg bg-green-600 px-3 py-2 text-sm text-white"
                  onClick={async () => {
                    if (!selectedResolvedVariant) return;
                    const buyUrl = selectedResolvedVariant.commerce.type === "affiliate"
                      ? selectedResolvedVariant.commerce.url ?? ""
                      : selectedResolvedVariant.commerce.type === "shopify"
                      ? `https://yoursite.com/products/${selectedProduct.id}`
                      : "";
                    if (!buyUrl) return;
                    const retailer =
                      selectedResolvedVariant.commerce.type === "affiliate"
                        ? selectedResolvedVariant.commerce.retailer
                        : null;
                    try {
                      const res = await fetch("/api/track/click", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          designId: designId ?? null,
                          productId: selectedProduct.id,
                          price: getItemPrice(selectedProduct),
                          retailer: retailer,
                          buyUrl: buyUrl,
                        }),
                      });
                      const data = await res.json();
                      const clickKey = data?.clickKey as string | undefined;

                      const url = new URL(buyUrl);
                      if (clickKey) url.searchParams.set("clickKey", clickKey);
                      url.searchParams.set("utm_source", "interior-ai");
                      url.searchParams.set("utm_medium", "affiliate");

                      window.open(url.toString(), "_blank", "noopener,noreferrer");
                    } catch {
                      window.open(buyUrl, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  {selectedResolvedVariant?.commerce.type === "affiliate" ? "View retailer" : "Buy now"}
                </button>
              ) : (
                <button
                  className="mt-3 w-full rounded-lg bg-neutral-200 px-3 py-2 text-sm text-neutral-700"
                  disabled
                >
                  Buy link coming soon
                </button>
              )}

              {isDesigner && (
                <button
                  className={
                    showDesignerTheme
                      ? "rounded-lg border px-3 py-2 text-sm"
                      : "rounded-lg border px-3 py-2 text-sm text-neutral-900"
                  }
                  disabled={!canEdit}
                  onClick={() => {
                    const selectedSet = selectedIdsRef.current;
                    if (selectedSet.size > 1) {
                      const selectedItems = itemsRef.current.filter((x) =>
                        selectedSet.has(x.instanceId)
                      );
                      if (!selectedItems.length) return;
                      const shouldLock = selectedItems.some((x) => !x.locked);
                      commitItems(
                        (prev) =>
                          prev.map((x) =>
                            selectedSet.has(x.instanceId)
                              ? { ...x, locked: shouldLock }
                              : x
                          ),
                        shouldLock ? "Lock selected" : "Unlock selected"
                      );
                      return;
                    }

                    if (!selectedItem) return;
                    const nextLocked = !selectedItem.locked;
                    commitItems(
                      (prev) =>
                        prev.map((x) =>
                          x.instanceId === selectedItem.instanceId
                            ? { ...x, locked: nextLocked }
                            : x
                        ),
                      nextLocked ? "Lock item" : "Unlock item"
                    );
                  }}
                >
                  {selectedIds.size > 1
                    ? itemsRef.current
                        .filter((x) => selectedIdsRef.current.has(x.instanceId))
                        .every((x) => x.locked)
                      ? "Unlock selected"
                      : "Lock selected"
                    : selectedItem?.locked
                      ? "Unlock"
                      : "Lock"}
                </button>
              )}

              <button
                className={
                  showDesignerTheme
                    ? "rounded-lg bg-[#1b2030] px-3 py-2 text-sm text-white hover:bg-[#232b3f]"
                    : "rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-900 hover:bg-neutral-200"
                }
                disabled={!canEdit}
                onClick={() => {
                  if (!selectedItem) return;

                  commitItems((prev) =>
                    prev.filter((x) => x.instanceId !== selectedItem.instanceId)
                  );
                  if (selectedIdsRef.current.has(selectedItem.instanceId)) {
                    const next = new Set(selectedIdsRef.current);
                    next.delete(selectedItem.instanceId);
                    const nextPrimary =
                      primaryIdRef.current === selectedItem.instanceId
                        ? next.size
                          ? Array.from(next)[next.size - 1]
                          : null
                        : primaryIdRef.current;
                    updateSelection(next, nextPrimary);
                  }
                }}
              >
                Remove
              </button>
            </div>
          </div>
        )}
        </div>
      )}

      {/* Layer 2A: Design Panel (visible in DESIGN mode) */}
      {designControlsPanelVisible && (
        <DesignControlsPanel
          dark={showDesignerTheme}
          panelMode={designControlsPanelMode}
          isClientPreview={isClientPreview}
          isAuthed={!!session?.user}
          isDesigner={isDesigner}
          canEdit={canEdit}
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
          planRoomCount={housePlan2D.rooms.length}
          planItemCount={items.length}
          planOpeningCount={planOpenings.length}
          activeRoomName={activeRoom?.name ?? "Current room"}
          activeRoomTypeLabel={activeRoom ? getRoomTypeLabel(activeRoom.roomType) : "Room"}
          activeRoomShoppableCount={activeRoomShoppingSummary?.shoppableCount ?? 0}
          activeRoomNeedsReviewCount={activeRoomShoppingSummary?.needsReviewCount ?? 0}
          aiLayoutProposal={pendingAiLayoutProposal}
          onHide={() => setDesignPanelOpen(false)}
          onSignIn={signInWithReturn}
          onGoFurnish={goFurnish}
          onGoAiDesign={goAiDesign}
          onGoShop={goShop}
          onStyleChange={setStyle}
          onBudgetChange={setBudget}
          onRunAiLayout={() => {
            void runAiLayout();
          }}
          onApplyAiLayoutProposal={applyPendingAiLayoutProposal}
          onTryAiLayoutAgain={() => {
            void runAiLayout(_getRandomSeed());
          }}
          onClearAiLayoutProposal={() => setPendingAiLayoutProposal(null)}
          onAddDesignerRoom={() => handleAddRoom()}
          onAddRoomTemplate={handleAddRoom}
          onNewRoomTypeChange={setNewRoomType}
          onNewRoomShapeChange={setNewRoomShape}
          onRoomPresetChange={handleRoomPresetChange}
          onRoomWidthInputChange={setRoomWidthInput}
          onRoomDepthInputChange={setRoomDepthInput}
          onApplyRoomSize={handleApplyRoomSize}
          onAddImportedToRoom={addSelectedImportedToRoom}
          onAddCatalogItemToRoom={addCatalogItemToRoom}
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
          onFloorPlanTraceRoomTypeChange={setFloorPlanTraceRoomType}
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

      {showUpgrade && !isClientPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-lg">
            <div className="text-lg font-semibold">Upgrade to Pro</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-neutral-400" data-testid="upgrade-variant-label">
              Variant: {upgradeCtaVariant}
            </div>
            <div className="mt-2 text-sm text-neutral-600">
              {upgradeReason === "export_images" &&
                "Free gives you a preview. Pro unlocks clean HD room images, multiple camera angles, and presentation-ready exports."}
              {upgradeReason === "export_pdf" &&
                "Free includes a watermarked one-page preview. Pro unlocks clean PDFs, branded covers, room summaries, and client-ready boards."}
              {upgradeReason === "designer" &&
                "Designer mode, presentation tools, and polished export workflows are available on the Pro plan."}
              {!upgradeReason &&
                "Unlock clean exports, designer tools, and a faster client presentation workflow."}
            </div>
            <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
              {upgradeCtaVariant === "unlock_pro_exports" ? (
                <div data-testid="upgrade-variant-unlock-pro-exports">
                  <div className="font-medium text-neutral-900">Best for active projects</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-neutral-600">
                    <li>Clean PDF exports without watermark</li>
                    <li>Multi-angle image exports and branded presentation packs</li>
                    <li>
                      {paywallExperimentSlot === "value_stack_v2"
                        ? "Client-ready exports in minutes with less manual formatting"
                        : "Room summaries and smoother designer workflow"}
                    </li>
                  </ul>
                  <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                    {annualPlanSavingsLabel}
                  </div>
                </div>
              ) : (
                <div data-testid="upgrade-variant-see-pricing">
                  <div className="font-medium text-neutral-900">Free vs Pro at a glance</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-600">
                    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                      <div className="font-semibold text-neutral-900">Free</div>
                      <div className="mt-1">Watermarked preview export</div>
                      <div>Basic sharing</div>
                    </div>
                    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                      <div className="font-semibold text-neutral-900">Pro</div>
                      <div className="mt-1">Clean branded exports</div>
                      <div>Presentation-ready workflow</div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    {paywallExperimentSlot === "value_stack_v2"
                      ? "Teams with weekly client reviews usually recover yearly pricing within the first month."
                      : "Use yearly if you expect to export for more than 2 active projects this quarter."}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                data-testid="upgrade-see-plans"
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-60"
                disabled={startingCheckout}
                onClick={() => {
                  track("upgrade_clicked", {
                    source: "upgrade_modal",
                    cta: "see_plans",
                    reason: upgradeReason || "unknown",
                    cta_position: "primary",
                    ...paywallContextMeta,
                  });
                  logFunnelEvent("upgrade_clicked", {
                    source: "upgrade_modal",
                    cta: "see_plans",
                    reason: upgradeReason || "unknown",
                    cta_position: "primary",
                    ...paywallContextMeta,
                  });
                  setShowPlans(true);
                }}
              >
                {primaryUpgradeCtaLabel}
              </button>
              {!session?.user && (
                <button
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700"
                  onClick={() => {
                    track("upgrade_clicked", {
                      source: "upgrade_modal",
                      cta: "sign_in_google",
                      reason: upgradeReason || "unknown",
                      cta_position: "secondary",
                      ...paywallContextMeta,
                    });
                    logFunnelEvent("upgrade_clicked", {
                      source: "upgrade_modal",
                      cta: "sign_in_google",
                      reason: upgradeReason || "unknown",
                      cta_position: "secondary",
                      ...paywallContextMeta,
                    });
                    track("upgrade_prompt_clicked", { reason: upgradeReason || "unknown" });
                    signInWithReturn();
                  }}
                >
                  Sign in to save progress
                </button>
              )}
              <button
                className="rounded-xl bg-neutral-200 px-4 py-2 text-sm"
                onClick={() => {
                  setShowUpgrade(false);
                  setUpgradeReason(null);
                }}
              >
                {upgradeCtaVariant === "see_pricing" ? "Maybe later" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {guestPromptReason && !isClientPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-lg">
            <div className="text-lg font-semibold">Save and sync this design?</div>
            <div className="mt-2 text-sm text-neutral-600">
              We will save this design so it shows up on your account after login.
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                className="rounded-xl bg-neutral-200 px-4 py-2 text-sm"
                onClick={() => {
                  const action = guestPromptActionRef.current;
                  guestPromptActionRef.current = null;
                  setGuestPromptReason(null);
                  action?.();
                }}
              >
                Not now
              </button>
              <button
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white"
                onClick={async () => {
                  setGuestPromptReason(null);
                  await claimGuestDesign();
                  signInWithReturn();
                }}
              >
                Save and continue
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlans && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setShowPlans(false)}
        >
          <div
            className="panel"
            style={{ width: 420, padding: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700 }}>Plans</div>
              <button onClick={() => setShowPlans(false)}>✕</button>
            </div>

            <div style={{ marginTop: 12, fontSize: 13, opacity: 0.85 }}>
              {pricingLayoutVariant === "annual_highlight" ? (
                <>
                  <div data-testid="plans-layout-annual-highlight" style={{ marginBottom: 8 }}><b>Pro Yearly</b> — best for ongoing client work, cleaner exports, and the lowest effective monthly cost</div>
                  <div style={{ marginBottom: 8 }}><b>Pro Monthly</b> — flexible access for short project bursts</div>
                  <div style={{ marginBottom: 12, color: "#047857", fontWeight: 600 }}>{annualPlanSavingsLabel}</div>
                </>
              ) : (
                <>
                  <div data-testid="plans-layout-default" style={{ marginBottom: 8 }}><b>Free</b> — design, save, share, and export a watermarked preview</div>
                  <div style={{ marginBottom: 12 }}><b>Pro</b> — clean exports, multi-angle images, branded PDF cover pages, and client workflow</div>
                  <div style={{ marginBottom: 12, color: "#047857", fontWeight: 600 }}>{annualPlanSavingsLabel}</div>
                </>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              {pricingLayoutVariant === "annual_highlight" ? (
                <>
                  <button
                    data-testid="checkout-yearly"
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid #059669", background: "#ecfdf5", fontWeight: 600 }}
                    onClick={() => {
                      setShowPlans(false);
                      track("upgrade_clicked", {
                        source: "plans_sheet",
                        cta: "yearly",
                        reason: upgradeReason || "unknown",
                        cta_position: "plans_primary_left",
                        ...paywallContextMeta,
                      });
                      logFunnelEvent("upgrade_clicked", {
                        source: "plans_sheet",
                        cta: "yearly",
                        reason: upgradeReason || "unknown",
                        cta_position: "plans_primary_left",
                        ...paywallContextMeta,
                      });
                      void startCheckout("yearly");
                    }}
                  >
                    Start yearly and save
                  </button>

                  <button
                    data-testid="checkout-monthly"
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border-subtle)" }}
                    onClick={() => {
                      setShowPlans(false);
                      track("upgrade_clicked", {
                        source: "plans_sheet",
                        cta: "monthly",
                        reason: upgradeReason || "unknown",
                        cta_position: "plans_primary_right",
                        ...paywallContextMeta,
                      });
                      logFunnelEvent("upgrade_clicked", {
                        source: "plans_sheet",
                        cta: "monthly",
                        reason: upgradeReason || "unknown",
                        cta_position: "plans_primary_right",
                        ...paywallContextMeta,
                      });
                      void startCheckout("monthly");
                    }}
                  >
                    Or start monthly
                  </button>
                </>
              ) : (
                <>
                  <button
                    data-testid="checkout-monthly"
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border-subtle)" }}
                    onClick={() => {
                      setShowPlans(false);
                      track("upgrade_clicked", {
                        source: "plans_sheet",
                        cta: "monthly",
                        reason: upgradeReason || "unknown",
                        cta_position: "plans_primary_left",
                        ...paywallContextMeta,
                      });
                      logFunnelEvent("upgrade_clicked", {
                        source: "plans_sheet",
                        cta: "monthly",
                        reason: upgradeReason || "unknown",
                        cta_position: "plans_primary_left",
                        ...paywallContextMeta,
                      });
                      void startCheckout("monthly");
                    }}
                  >
                    Start Pro monthly
                  </button>

                  <button
                    data-testid="checkout-yearly"
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border-subtle)" }}
                    onClick={() => {
                      setShowPlans(false);
                      track("upgrade_clicked", {
                        source: "plans_sheet",
                        cta: "yearly",
                        reason: upgradeReason || "unknown",
                        cta_position: "plans_primary_right",
                        ...paywallContextMeta,
                      });
                      logFunnelEvent("upgrade_clicked", {
                        source: "plans_sheet",
                        cta: "yearly",
                        reason: upgradeReason || "unknown",
                        cta_position: "plans_primary_right",
                        ...paywallContextMeta,
                      });
                      void startCheckout("yearly");
                    }}
                  >
                    Save with yearly
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Notes Panel */}
      {showAINotes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-lg dark:bg-[#1e2839]">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold">AI Design Notes</h2>
                {aiNotesData?.cached && (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                    ✓ Instant (cached)
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowAINotes(false)}
                className="text-2xl font-bold text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            {aiNotesData && (
              <div className="space-y-4">
                {/* Summary */}
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Summary</h3>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
                    {aiNotesData.summary?.map((point: string, idx: number) => (
                      <li key={idx}>{point}</li>
                    ))}
                  </ul>
                </div>

                {/* Rationale */}
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Rationale</h3>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    {aiNotesData.rationale}
                  </p>
                </div>

                {/* Suggestions */}
                {aiNotesData.suggestions && aiNotesData.suggestions.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Suggestions</h3>
                    <div className="mt-2 space-y-2">
                      {aiNotesData.suggestions.map((suggestion, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                        >
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {suggestion.label}
                          </p>
                          {isPro(plan) ? (
                            <button
                              onClick={() => applySuggestion(suggestion.action)}
                              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                            >
                              Apply
                            </button>
                          ) : (
                            <button
                              disabled
                              className="rounded bg-gray-400 px-3 py-1 text-sm text-white"
                              title="Upgrade to pro to apply suggestions"
                            >
                              Pro Only
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!isPro(plan) && (
                  <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    Upgrade to Pro to apply AI suggestions to your design.
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowAINotes(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Layer 3: Present Modal (visible in PRESENT mode) */}
      {editorMode === "present" && showPresentModal && !isClientPreview && (
        <div 
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" 
          onClick={() => {
            setShowPresentModal(false);
            setEditorMode("design");
          }}
        >
          <div 
            className={
              showDesignerTheme
                ? "designer-panel max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl p-6 shadow-2xl"
                : "max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className={
                showDesignerTheme
                  ? "designer-text-primary text-xl font-bold"
                  : "text-xl font-bold"
              }>
                Present & Export
              </h2>
              <button
                aria-label="Close export panel"
                onClick={() => {
                  setShowPresentModal(false);
                  setEditorMode("design");
                }}
                className={
                  showDesignerTheme
                    ? "designer-text-secondary text-2xl hover:text-white"
                    : "text-2xl text-gray-500 hover:text-gray-700"
                }
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Room Switcher Section */}
              {(() => {
                const rooms = getAllRoomNames(designSnapshot);
                if (rooms.length > 1) {
                  const currentRoomId = presentModeRoomId ?? designSnapshot.activeRoomId;
                  return (
                    <div>
                      <h3 className={
                        showDesignerTheme
                          ? "designer-text-primary mb-2 text-sm font-semibold"
                          : "mb-2 text-sm font-semibold text-gray-800"
                      }>
                        Room
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {rooms.map((room) => (
                          <button
                            key={room.id}
                            data-testid="room-select"
                            className={
                              room.id === currentRoomId
                                ? showDesignerTheme
                                  ? "rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white"
                                  : "rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white"
                                : showDesignerTheme
                                  ? "rounded-lg bg-[#151820] px-3 py-2 text-sm text-neutral-200 hover:bg-[#1b2030]"
                                  : "rounded-lg bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
                            }
                            onClick={() => {
                              setPresentModeRoomId(room.id);
                              // Switch the active room in the design snapshot
                              setDesignSnapshot(switchRoom(designSnapshot, room.id));
                            }}
                          >
                            {room.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Camera Views Section */}
              <div>
                <h3 className={
                  showDesignerTheme
                    ? "designer-text-primary mb-2 text-sm font-semibold"
                    : "mb-2 text-sm font-semibold text-gray-800"
                }>
                  Camera Views
                </h3>
                <div className="space-y-2">
                  <EditorViewToggle
                    value={viewMode}
                    onChange={(next) => {
                      handleEditorViewModeChange(next);
                      if (next === "3d") {
                        transitionToCameraView(getEyeLevelView(), 500);
                      }
                    }}
                    dark={showDesignerTheme}
                  />
                  <div className="grid grid-cols-1 gap-2">
                  <button
                    className={
                      showDesignerTheme
                        ? "rounded-lg bg-[#151820] px-3 py-2 text-sm text-neutral-200"
                        : "rounded-lg bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
                    }
                    onClick={() => {
                      handleEditorViewModeChange("3d");
                      transitionToCameraView(getFocusView(), 460);
                    }}
                  >
                    Focus
                  </button>
                </div>
                </div>
                {viewMode === "2d" && (
                  <div className="mt-2 space-y-2">
                    <p className={showDesignerTheme ? "text-xs text-neutral-400" : "text-xs text-gray-500"}>
                      Pan and zoom are enabled; rotation is locked for plan editing.
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className={
                          simplePlanControls
                            ? "rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white"
                            : showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                              : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                        }
                        onClick={() => setSimplePlanControls(true)}
                      >
                        Simple controls
                      </button>
                      <button
                        className={
                          !simplePlanControls
                            ? "rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white"
                            : showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                              : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                        }
                        onClick={() => setSimplePlanControls(false)}
                      >
                        Advanced controls
                      </button>
                    </div>

                    {simplePlanControls ? (
                      <div
                        className={
                          showDesignerTheme
                            ? "rounded-lg bg-[#151820] p-3 text-xs text-neutral-300"
                            : "rounded-lg bg-gray-100 p-3 text-xs text-gray-600"
                        }
                      >
                        Basic mode keeps things simple. Use Advanced controls for layer details, openings, and theme tuning.
                      </div>
                    ) : (
                      <>
                        <div className="rounded-lg border border-gray-200/70 p-2">
                          <div className={showDesignerTheme ? "mb-2 text-[11px] text-neutral-400" : "mb-2 text-[11px] text-gray-500"}>
                            Layer Presets
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              className={
                                planLayerPreset === "presentation"
                                  ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                                  : showDesignerTheme
                                    ? "rounded-lg bg-[#151820] px-2 py-2 text-[11px] text-neutral-200"
                                    : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                              }
                              onClick={() => applyPlanLayerPreset("presentation")}
                            >
                              {PLAN_LAYER_PRESETS.presentation.label}
                            </button>
                            <button
                              className={
                                planLayerPreset === "technical"
                                  ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                                  : showDesignerTheme
                                    ? "rounded-lg bg-[#151820] px-2 py-2 text-[11px] text-neutral-200"
                                    : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                              }
                              onClick={() => applyPlanLayerPreset("technical")}
                            >
                              {PLAN_LAYER_PRESETS.technical.label}
                            </button>
                            <button
                              className={
                                planLayerPreset === "staging"
                                  ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                                  : showDesignerTheme
                                    ? "rounded-lg bg-[#151820] px-2 py-2 text-[11px] text-neutral-200"
                                    : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                              }
                              onClick={() => applyPlanLayerPreset("staging")}
                            >
                              {PLAN_LAYER_PRESETS.staging.label}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            className={
                              planTheme === "consumer"
                                ? "rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white"
                                : showDesignerTheme
                                  ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                                  : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                            }
                            onClick={() => setPlanTheme("consumer")}
                          >
                            Consumer Theme
                          </button>
                          <button
                            className={
                              planTheme === "pro"
                                ? "rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white"
                                : showDesignerTheme
                                  ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                                  : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                            }
                            onClick={() => setPlanTheme("pro")}
                          >
                            Pro Theme
                          </button>
                        </div>
                      </>
                    )}

                    {!simplePlanControls && (
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ["grid", "Grid"],
                          ["dimensions", "Dimensions"],
                          ["labels", "Labels"],
                          ["openings", "Openings"],
                          ["builtIns", "Built-ins"],
                          ["zones", "Zones"],
                          ["annotations", "Annotations"],
                        ].map(([rawKey, label]) => {
                          const key = rawKey as keyof typeof planLayers;
                          return (
                            <button
                              key={rawKey}
                              className={
                                planLayers[key]
                                  ? "rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white"
                                  : showDesignerTheme
                                    ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                                    : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                              }
                              onClick={() =>
                                setPlanLayers((prev) => ({
                                  ...prev,
                                  [key]: !prev[key],
                                }))
                              }
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="rounded-lg border border-gray-200/70 p-2">
                      <div className={showDesignerTheme ? "mb-2 text-[11px] text-neutral-400" : "mb-2 text-[11px] text-gray-500"}>
                        Measurement units
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          ["mm", "Millimeters"],
                          ["cm", "Centimeters"],
                          ["in", "Inches"],
                        ] as const).map(([unit, label]) => (
                          <button
                            key={unit}
                            className={
                              planMeasurementUnit === unit
                                ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                                : showDesignerTheme
                                  ? "rounded-lg bg-[#151820] px-2 py-2 text-[11px] text-neutral-200"
                                  : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                            }
                            onClick={() => setPlanMeasurementUnit(unit)}
                            title={label}
                          >
                            {unit.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        className={
                          annotationToolKind === "note"
                            ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                            : showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-2 py-2 text-[11px] text-neutral-200"
                              : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                        }
                        onClick={() => {
                          setAnnotationToolKind("note");
                          addPlanAnnotation("note");
                        }}
                      >
                        + Note
                      </button>
                      {!simplePlanControls && (
                        <button
                          className={
                            annotationToolKind === "callout"
                              ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                              : showDesignerTheme
                                ? "rounded-lg bg-[#151820] px-2 py-2 text-[11px] text-neutral-200"
                                : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                          }
                          onClick={() => {
                            setAnnotationToolKind("callout");
                            addPlanAnnotation("callout");
                          }}
                        >
                          + Callout
                        </button>
                      )}
                      {!simplePlanControls && (
                        <button
                          className={
                            annotationToolKind === "room_tag"
                              ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                              : showDesignerTheme
                                ? "rounded-lg bg-[#151820] px-2 py-2 text-[11px] text-neutral-200"
                                : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                          }
                          onClick={() => {
                            setAnnotationToolKind("room_tag");
                            addPlanAnnotation("room_tag");
                          }}
                        >
                          + Room Tag
                        </button>
                      )}
                    </div>

                    {!simplePlanControls && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          className={
                            showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                              : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                          }
                          onClick={() => {
                            const id = `opening-${Date.now()}`;
                            setPlanOpenings((prev) => [
                              ...prev,
                              {
                                id,
                                wall: "south",
                                kind: "door",
                                offsetMm: 0,
                                widthMm: 900,
                              },
                            ]);
                            setSelectedPlanOverlayId(id);
                          }}
                        >
                          + Door
                        </button>
                        <button
                          className={
                            showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                              : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                          }
                          onClick={() => {
                            const id = `opening-${Date.now()}`;
                            setPlanOpenings((prev) => [
                              ...prev,
                              {
                                id,
                                wall: "north",
                                kind: "window",
                                offsetMm: 0,
                                widthMm: 1200,
                              },
                            ]);
                            setSelectedPlanOverlayId(id);
                          }}
                        >
                          + Window
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      {!simplePlanControls ? (
                        <button
                          className={
                            showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                              : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                          }
                          onClick={() => {
                            const id = `fixed-${Date.now()}`;
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
                            ]);
                            setSelectedPlanOverlayId(id);
                          }}
                        >
                          + Built-in
                        </button>
                      ) : (
                        <div
                          className={
                            showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-3 py-2 text-center text-xs text-neutral-400"
                              : "rounded-lg bg-gray-100 px-3 py-2 text-center text-xs text-gray-500"
                          }
                        >
                          Built-ins in Advanced
                        </div>
                      )}
                      <button
                        className={
                          selectedPlanOverlayId
                            ? "rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white"
                            : "rounded-lg bg-gray-200 px-3 py-2 text-xs text-gray-500"
                        }
                        disabled={!selectedPlanOverlayId}
                        onClick={() => {
                          const selectedId = selectedPlanOverlayId;
                          if (!selectedId) return;
                          setPlanOpenings((prev) => prev.filter((entry) => entry.id !== selectedId));
                          setPlanFixedElements((prev) => prev.filter((entry) => entry.id !== selectedId));
                          setPlanAnnotations((prev) => prev.filter((entry) => entry.id !== selectedId));
                          setSelectedPlanOverlayId(null);
                        }}
                      >
                        Delete Selected
                      </button>
                    </div>

                    {visiblePlanOpening && (
                      <PlanOpeningInspector
                        opening={visiblePlanOpening}
                        roomName={visiblePlanOpeningRoomName}
                        wallSpanMeters={visiblePlanOpeningWallSpanMeters}
                        dark={showDesignerTheme}
                        onChange={handleUpdateOpeningMetrics2D}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Lighting Section */}
              <div>
                <h3 className={
                  showDesignerTheme
                    ? "designer-text-primary mb-2 text-sm font-semibold"
                    : "mb-2 text-sm font-semibold text-gray-800"
                }>
                  Lighting
                </h3>
                <LightingPresetsUI 
                  current={lightingPreset} 
                  onChange={setLightingPreset}
                  theme={showDesignerTheme ? "designer" : "default"}
                />
              </div>

              {/* Client Handoff Section */}
              <div className="space-y-2 border-t pt-4">
                <h3 className={
                  showDesignerTheme
                    ? "designer-text-primary mb-2 text-sm font-semibold"
                    : "mb-2 text-sm font-semibold text-gray-800"
                }>
                  Client Handoff
                </h3>
                <button
                  data-testid="create-share"
                  className={
                    showDesignerTheme
                      ? "w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                      : "w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                  }
                  disabled={sharingDesign || !designId}
                  onClick={createShareLinkAndCopy}
                  title={!designId ? "Save your design first to create a share link" : ""}
                >
                  {sharingDesign ? "Creating link..." : shareToken ? "🔗 Copy Share Link" : "🔗 Create Share Link"}
                </button>
                {!designId && (
                  <div className={
                    showDesignerTheme
                      ? "text-xs text-neutral-400"
                      : "text-xs text-gray-500"
                  }>
                    💡 Save your design first to create a share link
                  </div>
                )}
                {shareToken && (
                  <a
                    href={`/share/${shareToken}/export`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={
                      showDesignerTheme
                        ? "block w-full rounded-lg bg-[#1b2030] px-4 py-3 text-center text-sm font-medium text-white hover:bg-[#232938]"
                        : "block w-full rounded-lg bg-blue-600 px-4 py-3 text-center text-sm font-medium text-white hover:bg-blue-700"
                    }
                  >
                    📦 View Export Pack
                  </a>
                )}
              </div>

              {/* Export Section */}
              <div className="space-y-2 border-t pt-4">
                {!simplePlanControls && (
                  <>
                    <div className={showDesignerTheme ? "text-xs text-neutral-400" : "text-xs text-gray-500"}>
                      Export style preset
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className={
                          exportStylePreset === "consumer"
                            ? "rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white"
                            : showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                              : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                        }
                        onClick={() => {
                          setExportStylePreset("consumer");
                          applyPlanLayerPreset("presentation");
                        }}
                      >
                        Consumer
                      </button>
                      <button
                        className={
                          exportStylePreset === "pro"
                            ? "rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white"
                            : showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-3 py-2 text-xs text-neutral-200"
                              : "rounded-lg bg-gray-100 px-3 py-2 text-xs hover:bg-gray-200"
                        }
                        onClick={() => {
                          setExportStylePreset("pro");
                          applyPlanLayerPreset("technical");
                        }}
                      >
                        Pro
                      </button>
                    </div>
                  </>
                )}
                <button
                  className={
                    showDesignerTheme
                      ? "w-full rounded-lg bg-[#1b2030] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                      : "w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                  }
                  disabled={isExporting || !sceneReady}
                  onClick={() => {
                    exportImages();
                    setShowPresentModal(false);
                    setEditorMode("design");
                  }}
                >
                  {isExporting ? "Exporting..." : "📸 Export Images"}
                </button>
                <button
                  className={
                    showDesignerTheme
                      ? "w-full rounded-lg bg-[#1b2030] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                      : "w-full rounded-lg bg-orange-600 px-4 py-3 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                  }
                  disabled={isPdfExporting || !sceneReady}
                  onClick={() => {
                    exportPdf();
                    setShowPresentModal(false);
                    setEditorMode("design");
                  }}
                >
                  {isPdfExporting ? "Generating..." : "📄 Export PDF"}
                </button>
                <button
                  className={
                    showDesignerTheme
                      ? "w-full rounded-lg bg-[#1b2030] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                      : "w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  }
                  disabled={aiNotesLoading || !items.length}
                  onClick={() => {
                    generateAINotes();
                    setShowPresentModal(false);
                    setEditorMode("design");
                  }}
                >
                  {aiNotesLoading ? "Generating..." : "✨ AI Notes"}
                </button>
              </div>

              {/* Exit Present Mode Button */}
              <div className="border-t pt-4">
                <button
                  className={
                    showDesignerTheme
                      ? "w-full rounded-lg border border-neutral-600 px-4 py-3 text-sm font-medium text-neutral-200 hover:bg-[#151820]"
                      : "w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  }
                  onClick={() => {
                    setShowPresentModal(false);
                    setEditorMode("design");
                  }}
                >
                  ← Back to Design Mode
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* My Designs Modal */}
      {showMyDesigns && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" 
          onClick={() => setShowMyDesigns(false)}
        >
          <div 
            data-testid="load-designs-modal"
            className={
              showDesignerTheme
                ? "designer-panel w-full max-w-2xl max-h-[80vh] rounded-xl p-6 shadow-2xl overflow-y-auto"
                : "w-full max-w-2xl max-h-[80vh] rounded-xl bg-white p-6 shadow-2xl overflow-y-auto"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className={
                showDesignerTheme
                  ? "designer-text-primary text-xl font-bold"
                  : "text-xl font-bold"
              }>
                My Designs
              </h2>
              <button
                onClick={() => setShowMyDesigns(false)}
                className={
                  showDesignerTheme
                    ? "designer-text-secondary text-2xl hover:text-white"
                    : "text-2xl text-gray-500 hover:text-gray-700"
                }
              >
                ✕
              </button>
            </div>

            {loadingDesigns ? (
              <div className={
                showDesignerTheme
                  ? "text-center text-neutral-400"
                  : "text-center text-gray-500"
              }>
                Loading your designs...
              </div>
            ) : myDesigns.length === 0 ? (
              <div className={
                showDesignerTheme
                  ? "text-center text-neutral-400"
                  : "text-center text-gray-500"
              }>
                <p className="mb-2">No saved designs yet</p>
                <p className="text-sm">Click &quot;Save&quot; to save your current design</p>
              </div>
            ) : (
              <div className="space-y-2">
                {myDesigns.map((design) => (
                  <button
                    key={design.id}
                    onClick={() => handleLoadDesign(design.id)}
                    className={
                      showDesignerTheme
                        ? "w-full rounded-lg border border-neutral-600 bg-[#151820] p-4 text-left hover:bg-[#1b2838] transition-colors"
                        : "w-full rounded-lg border border-gray-200 bg-gray-50 p-4 text-left hover:bg-gray-100 transition-colors"
                    }
                  >
                    <div className={
                      showDesignerTheme
                        ? "font-medium text-neutral-200"
                        : "font-medium text-gray-900"
                    }>
                      {design.title}
                    </div>
                    <div className={
                      showDesignerTheme
                        ? "text-xs text-neutral-500"
                        : "text-xs text-gray-500"
                    }>
                      {new Date(design.createdAt).toLocaleDateString()} {new Date(design.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Snap to Wall Toast */}
      {snapToast && (
        <div data-testid="snap-toast" className="fixed top-6 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
          <div className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            📍 Snapped to wall!
          </div>
        </div>
      )}

      {/* Collision/Rule Toast */}
      {ruleToast && (
        <div data-testid="collision-toast" className="fixed top-16 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
          <div className="rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            ⚠️ {ruleToast}
          </div>
        </div>
      )}

      {/* Onboarding/Nudge Toast */}
      {nextBestActionNudge && (
        <div data-testid="sofa-nudge" className="fixed top-28 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
          <div className="rounded-lg bg-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            💡 {nextBestActionNudge}
          </div>
        </div>
      )}

      {/* Share Success Toast */}
      {shareSuccessToast && (
        <div className="fixed top-6 right-6 z-50 animate-fade-in">
          <div className="rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            ✅ Share link copied to clipboard!
          </div>
        </div>
      )}

      {/* Share Error Toast */}
      {shareErrorToast && (
        <div className="fixed top-6 right-6 z-50 animate-fade-in">
          <div className="rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            ❌ {shareErrorToast}
          </div>
        </div>
      )}

      {/* Share Link Fallback Modal */}
      {shareLinkFallback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div 
            data-testid="share-fallback-modal"
            className={
            showDesignerTheme
              ? "designer-panel w-full max-w-md rounded-xl p-6 shadow-2xl"
              : "w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
          }>
            <button
              onClick={() => setShareLinkFallback(null)}
              className={
                showDesignerTheme
                  ? "designer-text-secondary absolute right-4 top-4 text-2xl hover:text-white"
                  : "absolute right-4 top-4 text-2xl text-gray-500 hover:text-gray-700"
              }
            >
              ✕
            </button>

            <h2 className={
              showDesignerTheme
                ? "designer-text-primary mb-4 text-xl font-bold"
                : "mb-4 text-xl font-bold text-gray-900"
            }>
              Share Link
            </h2>

            <p className={
              showDesignerTheme
                ? "designer-text-secondary mb-4 text-sm"
                : "mb-4 text-sm text-gray-600"
            }>
              Copy this link to share your design:
            </p>

            <div className="mb-4 flex gap-2">
              <input
                type="text"
                readOnly
                data-testid="share-url-input"
                value={shareLinkFallback}
                className={
                  showDesignerTheme
                    ? "flex-1 rounded-lg border border-neutral-600 bg-[#1b2030] px-3 py-2 text-sm text-neutral-200 font-mono"
                    : "flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-gray-700"
                }
              />
              <button
                data-testid="share-copy-button"
                onClick={() => {
                  navigator.clipboard.writeText(shareLinkFallback);
                  setShareSuccessToast(true);
                  setTimeout(() => setShareSuccessToast(false), 3000);
                }}
                className={
                  showDesignerTheme
                    ? "rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
                    : "rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
                }
              >
                Copy
              </button>
            </div>

            <div className="flex gap-2">
              <button
                data-testid="share-open-button"
                onClick={() => {
                  window.open(shareLinkFallback, "_blank");
                  setShareLinkFallback(null);
                }}
                className={
                  showDesignerTheme
                    ? "flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    : "flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                }
              >
                Open Link
              </button>
              <button
                data-testid="share-done-button"
                onClick={() => setShareLinkFallback(null)}
                className={
                  showDesignerTheme
                    ? "flex-1 rounded-lg border border-neutral-600 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-[#151820]"
                    : "flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                }
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Constraint Feedback */}
      {!isClientPreview && visibleConstraints.length > 0 && (
        <div data-testid="constraint-feedback" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 transform animate-fade-in">
          <div className="flex items-center gap-2">
            {visibleConstraints.map((item: ConstraintResult) => (
              <div
                key={item.id}
                className={`rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${
                  item.level === "ok"
                    ? "bg-green-600 text-white"
                    : item.level === "warn"
                    ? "bg-orange-500 text-white"
                    : "bg-red-600 text-white"
                }`}
              >
                {item.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Item Cart Drawer */}
      <ItemCartDrawer
        items={itemCart}
        onRemove={removeFromCart}
        onUpdateQty={updateCartQty}
        onClear={clearCart}
        onAddAllToRoom={addAllToRoom}
        isOpen={itemCartOpen}
        onToggle={() => setItemCartOpen((v) => !v)}
      />

      {/* Layout Confidence Summary */}
      {layoutConfidence && !isClientPreview && (
        <div data-testid="layout-confidence" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transform animate-fade-in">
          <div className="rounded-full bg-neutral-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur">
            {layoutConfidence}
          </div>
        </div>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <PageContent />
    </Suspense>
  );
}
