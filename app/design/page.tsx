"use client";

import * as THREE from "three";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { MapControls } from "@react-three/drei/core/MapControls";
import { Environment } from "@react-three/drei/core/Environment";
import { Lightformer } from "@react-three/drei/core/Lightformer";
import { Line } from "@react-three/drei/core/Line";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
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
import ConfirmDialog from "@/components/ConfirmDialog";
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
import { buildFirstRunActivationState } from "@/lib/first-run-activation";
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
  LayoutVersion,
  RoomSnapshot,
  SavedView,
  ZoneMin,
} from "@/lib/room-types";
import {
  getActiveRoom,
  createRoom,
  deleteRoom,
  switchRoom,
  updateRoom,
  migrateToV3,
} from "@/lib/room-types";
import {
  DEFAULT_FLOOR_MATERIAL_ID,
  DEFAULT_FLOOR_PATTERN_SCALE,
  clampFloorPatternScale,
  getFloorMaterialById,
  normalizeFloorRotationDeg,
} from "@/lib/floor-materials";
import {
  countRoomCategories,
  countRoomProductQuantities,
  countRoomVariantQuantities,
  resolveRoomShoppingItems,
  summarizeShoppingRooms,
  summarizeWholeHomeShopping,
} from "@/lib/room-shopping";
import type { ShoppingReadinessFilter } from "@/lib/shopping-readiness";
import {
  buildCatalogFallbackPlacement,
  buildCatalogPlacementPreview as resolveCatalogPlacementPreview,
  buildPendingCatalogPlacementScene,
  doesCatalogPlacementCollide,
  findCatalogPlacementCollision,
  findCatalogPlacementPlanRoomAtWorldPoint,
  updatePendingCatalogPlacementDraft as resolvePendingCatalogPlacementDraft,
  type PendingCatalogPlacement,
} from "@/lib/catalog-placement";
import { computeCirculationAnalysis, type CirculationHeatCell } from "@/lib/circulation-analysis";
import { buildRoomHealthSummary } from "@/lib/room-health-summary";
import { getAllRoomNames } from "@/lib/room-hooks";
import EditorCommandBar from "@/components/editor/EditorCommandBar";
import type { EditorSaveStatus } from "@/components/editor/EditorCommandBar";
import BetaFeedbackWidget from "@/components/BetaFeedbackWidget";
import DesignControlsPanel from "@/components/editor/DesignControlsPanel";
import type { PlanStartMode } from "@/components/editor/DesignControlsPlanPanel";
import EditorHistoryFeedback from "@/components/editor/EditorHistoryFeedback";
import ExportReadinessPreview from "@/components/editor/ExportReadinessPreview";
import FloorPropertiesPanel from "@/components/editor/FloorPropertiesPanel";
import EditorViewToggle, { type EditorViewMode } from "@/components/editor/EditorViewToggle";
import EditorCamera2D from "@/components/editor/camera/EditorCamera2D";
import HousePlanRenderer3D from "@/components/editor/renderers/HousePlanRenderer3D";
import PlanUnderlayRenderer2D from "@/components/editor/renderers/PlanUnderlayRenderer2D";
import RoomRenderer2D from "@/components/editor/renderers/RoomRenderer2D";
import PlanOpeningInspector from "@/components/editor/PlanOpeningInspector";
import RoomPlanStatusBar from "@/components/editor/RoomPlanStatusBar";
import RoomPanNavigator from "@/components/editor/RoomPanNavigator";
import DraggableFloatingPanel from "@/components/editor/DraggableFloatingPanel";
import EditorToolRail from "@/components/editor/EditorToolRail";
import ShoppingOverviewPanel from "@/components/editor/ShoppingOverviewPanel";
import SelectedItemDetailsPanel from "@/components/editor/SelectedItemDetailsPanel";
import SelectedItemRotationControls from "@/components/editor/SelectedItemRotationControls";
import { CanvasErrorBoundary } from "@/components/CanvasErrorBoundary";
import { metersToMm, radiansToDeg, type RoomOpening2D } from "@/lib/editorScene";
import { applyFloorPlanScaleCalibration } from "@/lib/floor-plan-calibration";
import {
  resolveOpeningPlacementFromPoint,
  resolveTracedOpening,
  validateTracedOpeningPlacement,
} from "@/lib/floor-plan-tracing";
import type {
  FloorPlanDrawRoomMode,
  FloorPlanPoint,
} from "@/lib/floor-plan-types";
import {
  legacyApiToSnapshot,
  snapshotToLegacyApi,
  snapshotToStored,
  storedToSnapshot,
  type StoredDesign,
} from "@/lib/room-persistence";
import { fingerprintDesignSnapshot } from "@/lib/snapshot-fingerprint";
import {
  clampRoomDimension,
  ROOM_DIMENSION_DEFAULTS,
  ROOM_SIZE_PRESETS,
  buildHousePlan2D,
  buildHouseRoomConnectionChecklist,
  doesHouseRoomOverlap,
  getRoomTypeLabel,
  resolveNewRoomName,
  resolveFloorPlanDrawCancelDecision,
  resolveFloorPlanOpeningCancelDecision,
  resolvePlanFitZoom,
  roundPlanCoordinate,
  type HousePlanTemplate,
  type HousePlanTemplateApplyOptions,
  type HousePlanTemplateFurnishingIntent,
  type RoomSizePresetId,
} from "@/lib/design-page-house-plan";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { resolvePlanCanvasGuidance } from "@/lib/plan-canvas-guidance";
import { useDesignPageHousePlanState } from "@/lib/useDesignPageHousePlanState";
import { useDesignPageFloorPlanWorkflowState } from "@/lib/useDesignPageFloorPlanWorkflowState";
import { useDesignPagePlanActions } from "@/lib/useDesignPagePlanActions";
import { useDesignPagePlanState } from "@/lib/useDesignPagePlanState";
import { useFloorPlanRoomCreation } from "@/lib/useFloorPlanRoomCreation";
import { useFloorPlanRoomDrawing } from "@/lib/useFloorPlanRoomDrawing";
import {
  useDesignPagePanelMode,
  type DesignPageEditorMode,
} from "@/lib/useDesignPagePanelMode";
import {
  type FloorActionAdapters,
  getFloorAccentColor,
  useFloorManager,
} from "@/lib/useFloorManager";
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
  buildExportReadinessItems,
  getExportReadinessScore,
} from "@/lib/design-page-export-readiness";
import { buildDesignSelectionContext } from "@/lib/design-page-selection-context";
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
  PLAN_LAYER_PRESETS,
} from "@/lib/design-page-types";
import {
  buildPendingAiLayoutProposal,
  collectAiLayoutValidationSummary,
  type PendingAiLayoutProposal,
} from "@/lib/design-page-ai-layout-proposal";
import { buildAiLayoutPreviewFootprints } from "@/lib/design-page-ai-layout-preview";
import { catalogMatchesAiLayoutRole, type AiLayoutRole } from "@/lib/ai/layout-planner";
import { scoreManualPlacement, type ManualPlacementScore } from "@/lib/manual-placement-scoring";
import {
  appendLayoutVersion,
  compareLayoutVersion,
  createLayoutVersion,
  restoreLayoutVersion,
  summarizeLayoutVersionComparison,
} from "@/lib/layout-versions";
import { evaluateStyleConsistency } from "@/lib/style-consistency";
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
  clampToRoom,
  footprintRadius,
  separateIfOverlapping,
} from "@/lib/design-page-geometry";
import { pickBestRugForSofa } from "@/lib/design-page-rug-sizing";
import { useDesignPageProductSelectorState } from "@/lib/useDesignPageProductSelectorState";
import { buildEditorScene2D } from "@/lib/design-page-plan-scene";
import {
  mapPlanAnnotationsToRoomRenderer,
  mapPlanFixedElementsToRoomRenderer,
  mapPlanOpeningsToRoomRenderer,
  getPlanOpeningWallSpanMeters,
} from "@/lib/design-page-plan-overlays";

import { Room } from "@/components/scene/RoomEnvironment";
import { Furniture, CameraCapture } from "@/components/scene/FurnitureItem";

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
type ScenePerformanceMode = "auto" | "quality" | "lite";
type SceneRenderQuality = "standard" | "lite";
type PlacementAddMode = "preview" | "auto";
const SIMPLE_PLAN_LAYERS = {
  grid: false,
  dimensions: true,
  labels: false,
  openings: true,
  builtIns: true,
  zones: false,
  annotations: false,
};

const SUPPORTED_FLOOR_PLAN_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);
const PDF_UNDERLAY_MAX_RENDERED_DIMENSION_PX = 1800;
const PDF_UNDERLAY_MAX_RENDER_SCALE = 2;

function hasTemplateFurnishingCommerce(product: CatalogItemSchema): boolean {
  const resolved = resolveCatalogVariant(product, product.defaultVariantId);
  const price = resolved.priceReference.amount ?? getItemPrice(product);
  if (!resolved.media.thumbUrl || !product.assets.modelUrl || !product.assets.thumbUrl) return false;
  if (!Number.isFinite(price) || price <= 0) return false;
  if (resolved.commerce.type === "affiliate") return Boolean(resolved.commerce.url);
  if (resolved.commerce.type === "shopify") {
    return Boolean(resolved.commerce.variantId && resolved.commerce.available);
  }
  return false;
}

function resolveTemplateFurnishingProduct(
  intent: HousePlanTemplateFurnishingIntent
): CatalogItemSchema | null {
  return (
    Object.values(CATALOG_ITEMS)
      .filter((product) => product.category === intent.category)
      .filter(hasTemplateFurnishingCommerce)
      .sort((a, b) => getItemPrice(a) - getItemPrice(b))[0] ?? null
  );
}

function isTemplateFurnishingNearDoorway(
  template: HousePlanTemplate,
  intent: HousePlanTemplateFurnishingIntent
): boolean {
  const room = template.rooms.find((entry) => entry.id === intent.roomId);
  if (!room) return true;

  return template.doorways.some((doorway) => {
    if (doorway.fromRoomId !== intent.roomId && doorway.toRoomId !== intent.roomId) return false;
    const wall = doorway.fromRoomId === intent.roomId
      ? doorway.wall
      : doorway.wall === "north"
        ? "south"
        : doorway.wall === "south"
          ? "north"
          : doorway.wall === "east"
            ? "west"
            : "east";
    const doorwayOffset = doorway.offsetMeters ?? 0;
    const doorwayX =
      wall === "east"
        ? room.width / 2
        : wall === "west"
          ? -room.width / 2
          : doorwayOffset;
    const doorwayZ =
      wall === "south"
        ? room.depth / 2
        : wall === "north"
          ? -room.depth / 2
          : doorwayOffset;
    const dx = intent.x - doorwayX;
    const dz = intent.z - doorwayZ;
    return Math.hypot(dx, dz) < 0.95;
  });
}

function shouldConfirmPlanTemplateReplacement(
  snapshot: MultiRoomSnapshot,
  openings: RoomOpening2D[]
): boolean {
  const rooms = snapshot.rooms ?? [];
  const itemCount = rooms.reduce((count, room) => count + room.items.length, 0);
  if (itemCount > 0) return true;
  if (rooms.length !== 1) return rooms.length > 0;

  const [room] = rooms;
  if (!room) return false;

  const isDefaultStarterLivingRoom =
    room.roomType === "living" &&
    Math.abs(room.geometry.width - ROOM_DIMENSION_DEFAULTS.width) < 0.001 &&
    Math.abs(room.geometry.depth - ROOM_DIMENSION_DEFAULTS.depth) < 0.001;

  return !isDefaultStarterLivingRoom || openings.length > 2;
}

function ScenePerformanceBridge({
  enabled,
  onFpsSample,
  onSustainedLowFps,
}: {
  enabled: boolean;
  onFpsSample: (fps: number) => void;
  onSustainedLowFps: (fps: number) => void;
}) {
  const frameCountRef = useRef(0);
  const lastSampleAtRef = useRef<number | null>(null);
  const lowFpsStartedAtRef = useRef<number | null>(null);
  const degradedRef = useRef(false);

  useEffect(() => {
    frameCountRef.current = 0;
    lastSampleAtRef.current = null;
    lowFpsStartedAtRef.current = null;
    degradedRef.current = false;
  }, [enabled]);

  useFrame(() => {
    if (!enabled) return;
    const now = performance.now();
    frameCountRef.current += 1;

    if (lastSampleAtRef.current === null) {
      lastSampleAtRef.current = now;
      return;
    }

    const elapsedMs = now - lastSampleAtRef.current;
    if (elapsedMs < 1000) return;

    const fps = Math.round((frameCountRef.current * 1000) / elapsedMs);
    frameCountRef.current = 0;
    lastSampleAtRef.current = now;
    onFpsSample(fps);

    if (fps >= 28) {
      lowFpsStartedAtRef.current = null;
      return;
    }

    if (lowFpsStartedAtRef.current === null) {
      lowFpsStartedAtRef.current = now;
      return;
    }

    if (!degradedRef.current && now - lowFpsStartedAtRef.current >= 4000) {
      degradedRef.current = true;
      onSustainedLowFps(fps);
    }
  });

  return null;
}

function CirculationHeatmapOverlay({
  cells,
  roomOffset,
}: {
  cells: CirculationHeatCell[];
  roomOffset: { x: number; z: number };
}) {
  return (
    <group data-testid="circulation-heatmap" position={[roomOffset.x, 0.075, roomOffset.z]}>
      {cells.map((cell) => {
        const color =
          cell.level === "blocked"
            ? "#ef4444"
            : cell.level === "tight"
              ? "#f97316"
              : "#facc15";
        const opacity =
          cell.level === "blocked" ? 0.24 : cell.level === "tight" ? 0.18 : 0.12;
        return (
          <mesh
            key={`${cell.x.toFixed(2)}:${cell.z.toFixed(2)}:${cell.level}`}
            position={[cell.x, 0, cell.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.42, 0.42]} />
            <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function clampEditorOpacity(value: number): number {
  return Math.max(0.05, Math.min(1, Number.isFinite(value) ? value : 1));
}

function clampRoomHeightMeters(value: number): number {
  return Math.max(
    ROOM_DIMENSION_DEFAULTS.minRoomHeight,
    Math.min(ROOM_DIMENSION_DEFAULTS.maxRoomHeight, Number.isFinite(value) ? value : ROOM_DIMENSION_DEFAULTS.roomHeight)
  );
}

function clampSlabThicknessMeters(value: number): number {
  return Math.max(
    ROOM_DIMENSION_DEFAULTS.minSlabThickness,
    Math.min(ROOM_DIMENSION_DEFAULTS.maxSlabThickness, Number.isFinite(value) ? value : ROOM_DIMENSION_DEFAULTS.slabThickness)
  );
}

function clampWallThicknessMeters(value: number): number {
  return Math.max(0.04, Math.min(0.8, Number.isFinite(value) ? value : ROOM_DIMENSION_DEFAULTS.wallThickness));
}

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

  if (diagram === "recliner-armchair") {
    return (
      <svg
        aria-hidden="true"
        className={iconClass}
        viewBox="0 0 96 64"
        fill="none"
      >
        <path d="M30 20h36v28H30z" {...lineProps} />
        <path d="M22 20h8v28h-8zM66 20h8v28h-8z" {...lineProps} />
        <path d="M30 34h36M36 48v6M60 48v6" {...lineProps} />
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

type ManualPlanActionIconName = "select" | "scale" | "draw" | "door" | "window" | "fit";

function ManualPlanActionIcon({ name }: { name: ManualPlanActionIconName }) {
  const lineProps = {
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
  };

  if (name === "select") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path d="M6 4l10 8-5 1.5 3 5-2.5 1.5-3-5-3.5 4V4z" {...lineProps} />
      </svg>
    );
  }

  if (name === "scale") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path d="M4 16l12-12 4 4L8 20l-4-4zM8 16l-2-2M11 13l-2-2M14 10l-2-2" {...lineProps} />
      </svg>
    );
  }

  if (name === "draw") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path d="M5 19h14M7 15l8.5-8.5 2 2L9 17H7v-2z" {...lineProps} />
      </svg>
    );
  }

  if (name === "door") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path d="M7 20V5h9v15M10 12h.01M16 20H5" {...lineProps} />
      </svg>
    );
  }

  if (name === "window") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path d="M5 6h14v12H5zM12 6v12M5 12h14" {...lineProps} />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
      <path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4M8 4L4 8M16 4l4 4M20 16l-4 4M4 16l4 4" {...lineProps} />
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
  const [lastLocalSaveError, setLastLocalSaveError] = useState<string | null>(null);
  const [lastCloudSaveError, setLastCloudSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [scenePerformanceMode, setScenePerformanceMode] = useState<ScenePerformanceMode>("auto");
  const [scenePerformanceModeLoaded, setScenePerformanceModeLoaded] = useState(false);
  const [autoLiteScene, setAutoLiteScene] = useState(false);
  const [scenePerformanceSample, setScenePerformanceSample] = useState<{
    lastFps: number | null;
    samples: number;
  }>({ lastFps: null, samples: 0 });
  const [placementAddMode, setPlacementAddMode] = useState<PlacementAddMode>("preview");
  const [placementPreferencesLoaded, setPlacementPreferencesLoaded] = useState(false);
  const [snapToast, setSnapToast] = useState(false);
  const [ruleToast, setRuleToast] = useState<string | null>(null);
  const [undoToast, setUndoToast] = useState<{ label: string } | null>(null);
  const [historyFeedback, setHistoryFeedback] = useState<string | null>(null);
  const [showBetaStart, setShowBetaStart] = useState(false);
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>("studio");
  const [viewMode, setViewMode] = useState<EditorViewMode>("3d");
  const [designPanelOpen, setDesignPanelOpen] = useState(true);
  const [planFocusPanelRevealed, setPlanFocusPanelRevealed] = useState(false);
  const [dismissedPlanCanvasGuidanceKey, setDismissedPlanCanvasGuidanceKey] = useState<string | null>(null);
  const [consumerPlanCompletionSignal, setConsumerPlanCompletionSignal] = useState<{
    id: number;
    kind: "room" | "opening";
  } | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const {
    planTheme,
    setPlanTheme,
    planLayers,
    setPlanLayers,
    planAnnotations,
    setPlanAnnotations,
    planOpenings,
    setPlanOpenings,
    planFixedElements,
    setPlanFixedElements,
    simplePlanControls,
    setSimplePlanControls,
    planLayerPreset,
    setPlanLayerPreset,
    planMeasurementUnit,
    setPlanMeasurementUnit,
    exportStylePreset,
    setExportStylePreset,
    planGuidedActionsEnabled,
    setPlanGuidedActionsEnabled,
    planGuidedActionsChoiceSeen,
    setPlanGuidedActionsChoiceSeen,
    planSettingsLoaded,
  } = useDesignPagePlanState();
  const {
    floorPlanUnderlay,
    setFloorPlanUnderlay,
    floorPlanCalibrationMode,
    floorPlanCalibrationPoints,
    setFloorPlanCalibrationPoints,
    floorPlanCalibrationDistanceInput,
    setFloorPlanCalibrationDistanceInput,
    floorPlanTraceRoomMode,
    setFloorPlanTraceRoomMode,
    floorPlanDrawRoomMode,
    floorPlanDrawAngleLockMode,
    setFloorPlanDrawAngleLockMode,
    floorPlanExactWallLengthInput,
    setFloorPlanExactWallLengthInput,
    floorPlanTraceRoomPoints,
    setFloorPlanTraceRoomPoints,
    blankGridRoomPreviewPoint,
    setBlankGridRoomPreviewPoint,
    floorPlanTraceRoomType,
    setFloorPlanTraceRoomType,
    floorPlanTraceOpeningMode,
    setFloorPlanTraceOpeningMode,
    floorPlanTraceOpeningPoints,
    setFloorPlanTraceOpeningPoints,
    floorPlanTraceOpeningKind,
    setFloorPlanTraceOpeningKind,
    floorPlanPdfSourceReady,
    setFloorPlanPdfSourceReady,
    floorPlanPdfRenderingPage,
    setFloorPlanPdfRenderingPage,
    floorPlanCalibrationSummary,
    blankGridRoomDrawActive,
    activeFloorPlanTool,
    resetFloorPlanCalibration,
    resetFloorPlanInteraction,
    activateFloorPlanSelectTool,
    activateFloorPlanCalibrationMode,
    activateFloorPlanRoomTrace,
    activateFloorPlanRoomDrawMode,
    activateFloorPlanOpeningTrace,
    clearFloorPlanTraceBuffers,
  } = useDesignPageFloorPlanWorkflowState();
  const [selectedPlanOverlayId, setSelectedPlanOverlayId] = useState<string | null>(null);
  const [selectedPlanRoomId, setSelectedPlanRoomId] = useState<string | null>(null);
  const [pendingRoomRenameId, setPendingRoomRenameId] = useState<string | null>(null);
  const [pendingRoomRenameValue, setPendingRoomRenameValue] = useState("");
  const [annotationToolKind, setAnnotationToolKind] = useState<"note" | "callout" | "room_tag">("note");
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
  const [cameraViewNameInput, setCameraViewNameInput] = useState("");
  const [layoutVersionNameInput, setLayoutVersionNameInput] = useState("");
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
  const [shoppingReadinessFilter, setShoppingReadinessFilter] =
    useState<ShoppingReadinessFilter>("all");
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

  const wantsDesigner = urlMode === "designer";
  const canUseDesigner = plan === "pro";
  const { isDesigner, isClientPreview } = useEditorMode(plan, clientPreview);
  const showDesignerTheme = isDesigner && !isClientPreview;
  const liteSceneEnabled =
    scenePerformanceMode === "lite" || (scenePerformanceMode === "auto" && autoLiteScene);
  const sceneRenderQuality: SceneRenderQuality = liteSceneEnabled ? "lite" : "standard";
  const scenePerformanceUserChangedRef = useRef(false);
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
      const storedScenePerformanceMode = localStorage.getItem("scene_performance_mode");
      if (
        storedScenePerformanceMode === "auto" ||
        storedScenePerformanceMode === "quality" ||
        storedScenePerformanceMode === "lite"
      ) {
        if (!scenePerformanceUserChangedRef.current) {
          setScenePerformanceMode(storedScenePerformanceMode);
        }
      }
      const storedPlacementAddMode = localStorage.getItem("placement_add_mode");
      if (storedPlacementAddMode === "preview" || storedPlacementAddMode === "auto") {
        setPlacementAddMode(storedPlacementAddMode);
      }
    } catch {
      // ignore storage errors
    } finally {
      setScenePerformanceModeLoaded(true);
      setPlacementPreferencesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!undoToast) return;
    const timer = window.setTimeout(() => setUndoToast(null), 4800);
    return () => window.clearTimeout(timer);
  }, [undoToast]);

  useEffect(() => {
    if (!historyFeedback) return;
    const timer = window.setTimeout(() => setHistoryFeedback(null), 2600);
    return () => window.clearTimeout(timer);
  }, [historyFeedback]);

  useEffect(() => {
    if (!scenePerformanceModeLoaded || typeof window === "undefined") return;
    try {
      localStorage.setItem("scene_performance_mode", scenePerformanceMode);
    } catch {
      // ignore storage errors
    }
  }, [scenePerformanceMode, scenePerformanceModeLoaded]);

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

  const handleScenePerformanceModeChange = useCallback(
    (nextMode: ScenePerformanceMode) => {
      scenePerformanceUserChangedRef.current = true;
      setScenePerformanceMode(nextMode);
      setAutoLiteScene(false);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("scene_performance_mode", nextMode);
        } catch {
          // ignore storage errors
        }
      }
      if (nextMode === "lite") {
        showRuleToast("Lite scene mode enabled");
      } else if (nextMode === "quality") {
        showRuleToast("Quality scene mode enabled");
      } else {
        showRuleToast("Auto scene performance enabled");
      }
    },
    [showRuleToast]
  );

  const handleScenePerformanceSample = useCallback((fps: number) => {
    setScenePerformanceSample((current) => ({
      lastFps: fps,
      samples: current.samples + 1,
    }));
  }, []);

  const handleSustainedLowFps = useCallback(
    (fps: number) => {
      setAutoLiteScene((current) => {
        if (current || scenePerformanceMode !== "auto") return current;
        track("scene_performance_auto_lite_enabled", {
          fps,
          item_count: itemsRef.current.length,
          view_mode: viewMode,
        });
        showRuleToast("Lite scene mode enabled for smoother editing");
        return true;
      });
    },
    [scenePerformanceMode, showRuleToast, viewMode]
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
    setIsSaving(true);
    setLastCloudSaveError(null);
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
        setLastCloudSaveError(errorMessage);
        showRuleToast(`Save failed: ${errorMessage}`);
        return null;
      }

      const data = await res.json();
      if (data?.id) {
        setDesignId(data.id);
        setLastDbSaveAt(Date.now());
        setLastCloudSaveError(null);
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

      showRuleToast("Save failed: no design ID returned");
      setLastCloudSaveError("No design ID returned");
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLastCloudSaveError(message);
      showRuleToast(`Save failed: ${message}`);
      return null;
    } finally {
      setIsSaving(false);
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

  const [pendingCatalogPlacement, setPendingCatalogPlacement] =
    useState<PendingCatalogPlacement | null>(null);
  const [lastValidCatalogPlacement, setLastValidCatalogPlacement] =
    useState<PendingCatalogPlacement | null>(null);
  const [hoverCatalogPlacement, setHoverCatalogPlacement] =
    useState<PendingCatalogPlacement | null>(null);
  const [dragCatalogIntent, setDragCatalogIntent] = useState<{
    productId: string;
    variantId?: string;
    purchaseOptionId?: string;
  } | null>(null);
  const [catalogPlacementDragging, setCatalogPlacementDragging] = useState(false);
  const [crossRoomDragTarget, setCrossRoomDragTarget] = useState<{
    roomId: string;
    label: string;
    valid: boolean;
    kind: "preview" | "item";
  } | null>(null);
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
        showRuleToast(res.status === 403 ? "You do not have access to that design" : "Design not found");
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
      showRuleToast(`Loaded ${data.title}`);
    } catch (err) {
      console.error("Load error:", err);
      showRuleToast("Failed to load design");
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
  const previousSelectedPlanActiveRoomIdRef = useRef<string | null>(null);
  const [localBackupHydrated, setLocalBackupHydrated] = useState(false);
  const [liveCatalogReady, setLiveCatalogReady] = useState(false);

  useEffect(() => {
    cameraViewRef.current = cameraView;
  }, [cameraView]);

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
      resetFloorPlanInteraction();
    },
    [
      resetFloorPlanInteraction,
      revokeFloorPlanUnderlayUrl,
      setFloorPlanPdfSourceReady,
      setFloorPlanUnderlay,
      setPlanOpenings,
    ]
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
  const plan2DSafeAreaLeftPx =
    designControlsPanelVisibleForLayout && !isClientPreview && viewportSize.width >= 768
      ? isDesigner
        ? 460
        : 380
      : 0;
  const plan2DSafeAreaBottomPx =
    designControlsPanelVisibleForLayout &&
    !isClientPreview &&
    viewportSize.width > 0 &&
    viewportSize.width < 768
      ? 360
      : 0;
  const plan2DFitZoom = resolvePlanFitZoom({
    viewportWidthPx: Math.max(320, (viewportSize.width || 1440) - plan2DSafeAreaLeftPx),
    viewportHeightPx: Math.max(260, (viewportSize.height || 900) - plan2DSafeAreaBottomPx),
    planWidthMeters: planViewWidth,
    planDepthMeters: planViewDepth,
  });
  const plan2DCameraTarget = {
    x: plan2DSafeAreaLeftPx > 0 ? -plan2DSafeAreaLeftPx / plan2DFitZoom / 2 : 0,
    z: plan2DSafeAreaBottomPx > 0 ? -plan2DSafeAreaBottomPx / plan2DFitZoom / 2 : 0,
  };
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
  const hasWholeHousePlan = housePlan2D.rooms.length > 1;
  const usesHousePlanScene =
    stackedFloorView || hasWholeHousePlan || housePlan2D.rooms.some((room) => room.shape !== "rectangle");
  const sceneHousePlanRooms3D = useMemo(
    () =>
      stackedFloorView
        ? buildHousePlan2D(
            designSnapshot.rooms.filter(
              (room) => !hiddenFloorLevels.includes(room.floorLevel ?? 1)
            ),
            roomWidth,
            roomDepth
          ).rooms
        : housePlan2D.rooms,
    [designSnapshot.rooms, hiddenFloorLevels, housePlan2D.rooms, roomDepth, roomWidth, stackedFloorView]
  );
  useEffect(() => {
    const activeRoomId = designSnapshot.activeRoomId ?? null;
    const activeRoomChanged = previousSelectedPlanActiveRoomIdRef.current !== activeRoomId;
    const roomIds = new Set(housePlan2D.rooms.map((room) => room.id));

    if (activeRoomChanged) {
      previousSelectedPlanActiveRoomIdRef.current = activeRoomId;
      setSelectedPlanRoomId(activeRoomId && roomIds.has(activeRoomId) ? activeRoomId : null);
      return;
    }

    setSelectedPlanRoomId((currentRoomId) =>
      currentRoomId && !roomIds.has(currentRoomId) ? null : currentRoomId
    );
  }, [designSnapshot.activeRoomId, housePlan2D.rooms]);

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
  const roomSnapshotById = useMemo(
    () => new Map(designSnapshot.rooms.map((room) => [room.id, room])),
    [designSnapshot.rooms]
  );
  const findPlanRoomAtWorldPoint = useCallback(
    (x: number, z: number) =>
      findCatalogPlacementPlanRoomAtWorldPoint(sceneHousePlanRooms3D, x, z),
    [sceneHousePlanRooms3D]
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

    const visibleRoomIds = new Set(housePlan2D.rooms.map((room) => room.id));
    return designSnapshot.rooms.filter((room) => visibleRoomIds.has(room.id)).flatMap((room) => {
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
    housePlan2D.rooms,
    houseRoomById,
  ]);
  const pendingCatalogPlacementScene = useMemo(() => {
    const planRoom = houseRoomById.get(
      pendingCatalogPlacement?.roomId ?? designSnapshot.activeRoomId
    );
    return buildPendingCatalogPlacementScene({
      placement: pendingCatalogPlacement,
      roomOffset: { x: planRoom?.x ?? 0, z: planRoom?.z ?? 0 },
    });
  }, [designSnapshot.activeRoomId, houseRoomById, pendingCatalogPlacement]);
  const hoverCatalogPlacementScene = useMemo(() => {
    if (pendingCatalogPlacement) return null;
    const planRoom = houseRoomById.get(
      hoverCatalogPlacement?.roomId ?? designSnapshot.activeRoomId
    );
    return buildPendingCatalogPlacementScene({
      placement: hoverCatalogPlacement,
      roomOffset: { x: planRoom?.x ?? 0, z: planRoom?.z ?? 0 },
    });
  }, [designSnapshot.activeRoomId, hoverCatalogPlacement, houseRoomById, pendingCatalogPlacement]);
  const aiLayoutPreviewFootprints = useMemo(
    () =>
      pendingAiLayoutProposal
        ? buildAiLayoutPreviewFootprints({
            items: pendingAiLayoutProposal.items,
            roomOffset: activeRoomPlanOffset,
          })
        : [],
    [activeRoomPlanOffset, pendingAiLayoutProposal]
  );
  const aiLayoutPreviewTone = pendingAiLayoutProposal?.fitRisk === "high"
    ? {
        fill: "#f59e0b",
        line: "#d97706",
        text: "Needs review",
      }
    : pendingAiLayoutProposal?.fitRisk === "medium"
      ? {
          fill: "#38bdf8",
          line: "#0284c7",
          text: "Check clearances",
        }
      : {
          fill: "#10b981",
          line: "#059669",
          text: "Ready to apply",
        };
  const pendingCatalogPlacementRoom = useMemo(
    () =>
      pendingCatalogPlacement?.roomId
        ? roomSnapshotById.get(pendingCatalogPlacement.roomId) ?? activeRoom
        : activeRoom,
    [activeRoom, pendingCatalogPlacement?.roomId, roomSnapshotById]
  );
  const placementTargetRoomId =
    pendingCatalogPlacement?.roomId ?? crossRoomDragTarget?.roomId ?? null;
  const placementTargetPlanRoom = useMemo(
    () => (placementTargetRoomId ? houseRoomById.get(placementTargetRoomId) ?? null : null),
    [houseRoomById, placementTargetRoomId]
  );
  const placementTargetRoom =
    placementTargetRoomId ? roomSnapshotById.get(placementTargetRoomId) ?? null : null;
  const roomItemCountsById = useMemo(
    () =>
      Object.fromEntries(
        designSnapshot.rooms.map((room) => [room.id, room.items.length])
      ) as Record<string, number>,
    [designSnapshot.rooms]
  );
  const roomShoppingSummaries = useMemo(
    () => summarizeShoppingRooms(designSnapshot.rooms, designSnapshot.activeRoomId),
    [designSnapshot.activeRoomId, designSnapshot.rooms]
  );
  const activeRoomShoppingSummary =
    roomShoppingSummaries.find((room) => room.roomId === designSnapshot.activeRoomId) ??
    roomShoppingSummaries[0] ??
    null;
  const activeRoomHealthSummary = useMemo(
    () =>
      activeRoom
        ? buildRoomHealthSummary({
            room: activeRoom,
            catalogItems: CATALOG_ITEMS,
            openings: planOpenings,
            shoppingNeedsReviewCount: activeRoomShoppingSummary?.needsReviewCount ?? 0,
          })
        : null,
    [activeRoom, activeRoomShoppingSummary?.needsReviewCount, planOpenings]
  );
  const reviewActiveRoomHealth = useCallback(() => {
    if (!activeRoomHealthSummary || activeRoomHealthSummary.level === "ready") return;
    setDesignPanelOpen(true);

    if (activeRoomHealthSummary.shoppingNeedsReviewCount > 0) {
      goShop();
      setShoppingReadinessFilter("all");
      showRuleToast("Review shopping readiness for this room");
      return;
    }

    if (activeRoomHealthSummary.exportIssueCount > 0) {
      setEditorMode("present");
      showRuleToast("Review export readiness for this room");
      return;
    }

    if (
      activeRoomHealthSummary.blockedPlacementCount > 0 ||
      activeRoomHealthSummary.crampedPlacementCount > 0
    ) {
      goFurnish();
      showRuleToast("Review placement issues in this room");
      return;
    }

    goPlan();
    showRuleToast("Review room anchors and plan details");
  }, [activeRoomHealthSummary, goFurnish, goPlan, goShop, showRuleToast]);
  const activeRoomFloorMaterialId =
    activeRoom?.surfaceFinishes?.floorMaterialId ?? DEFAULT_FLOOR_MATERIAL_ID;
  const activeRoomFloorRotationDeg = normalizeFloorRotationDeg(
    activeRoom?.surfaceFinishes?.floorRotationDeg
  );
  const activeRoomFloorScale = clampFloorPatternScale(
    activeRoom?.surfaceFinishes?.floorScale
  );
  const activeRoomHeightMm = Math.round(roomHeight * 1000);
  const activeRoomWallThicknessMm = Math.round(wallThickness * 1000);
  const activeRoomSlabThicknessMm = Math.round(
    (activeRoom?.geometry.slabThickness ?? ROOM_DIMENSION_DEFAULTS.slabThickness) * 1000
  );
  const activeRoomWallOpacity = clampEditorOpacity(activeRoom?.surfaceOpacity?.wall ?? 1);
  const activeRoomFloorOpacity = clampEditorOpacity(activeRoom?.surfaceOpacity?.floor ?? 1);
  const activeRoomCeilingOpacity = clampEditorOpacity(activeRoom?.surfaceOpacity?.ceiling ?? 1);
  const activeRoomCeilingVisible = activeRoom?.ceilingVisible ?? true;
  const activeRoomCeilingColor = activeRoom?.surfaceFinishes?.ceilingColor ?? "#f8f8f6";
  const activeRoomCategoryCounts = useMemo(
    () => countRoomCategories(activeRoom),
    [activeRoom]
  );
  const activeRoomProductQuantities = useMemo(
    () => countRoomProductQuantities(activeRoom),
    [activeRoom]
  );
  const activeRoomVariantQuantities = useMemo(
    () => countRoomVariantQuantities(activeRoom),
    [activeRoom]
  );
  const activeRoomShoppingItems = useMemo(
    () => resolveRoomShoppingItems(activeRoom),
    [activeRoom]
  );
  const wholeHomeShoppingSummary = useMemo(
    () => summarizeWholeHomeShopping(roomShoppingSummaries),
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

  const addActiveRoomCartReadyItems = useCallback(() => {
    const readyInstanceIds = new Set(
      activeRoomShoppingItems
        .filter((item) => item.commerceMode === "shopify" && item.hasValidCommerce)
        .map((item) => item.instanceId)
    );

    if (readyInstanceIds.size === 0) {
      showRuleToast("No cart-ready checkout items in this room yet.");
      return;
    }

    let changedCount = 0;
    commitItems((prev) =>
      prev.map((item) => {
        if (!readyInstanceIds.has(item.instanceId)) return item;
        if (item.includeInCheckout ?? true) return item;
        changedCount += 1;
        return { ...item, includeInCheckout: true };
      }),
      "Add room cart-ready items"
    );

    if (changedCount > 0) {
      showRuleToast(
        `${changedCount} cart-ready item${changedCount === 1 ? "" : "s"} added to checkout.`
      );
    } else {
      showRuleToast("All cart-ready items in this room are already included.");
    }
  }, [activeRoomShoppingItems, commitItems, showRuleToast]);

  const setShoppingItemInclude = useCallback(
    (instanceId: string, includeInCheckout: boolean) => {
      commitItems(
        (prev) =>
          prev.map((item) =>
            item.instanceId === instanceId ? { ...item, includeInCheckout } : item
          ),
        includeInCheckout ? "Include in checkout" : "Exclude from checkout"
      );
      showRuleToast(includeInCheckout ? "Added to checkout" : "Excluded from checkout");
    },
    [commitItems, showRuleToast]
  );

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
    const label = history.getUndoName();
    history.undo();
    setUndoToast(null);
    setHistoryFeedback(`Undid ${label ?? "last edit"}`);
  }, [isClientPreview, history]);

  const redoSafe = useCallback(() => {
    if (isClientPreview) return;
    const label = history.getRedoName();
    history.redo();
    setUndoToast(null);
    setHistoryFeedback(`Redid ${label ?? "last edit"}`);
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
      showRuleToast("Scene not ready for export");
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

      showRuleToast(`Exported ${images.length} ${exportStylePreset} images`);
    } catch (err) {
      console.error("Export error:", err);
      setClientPreview(false);
      showRuleToast("Export failed. Please try again.");
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
      showRuleToast("Add some items before exporting to PDF");
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
      showRuleToast(message);
    } finally {
      window.clearTimeout(timeoutId);
      setIsPdfExporting(false);
    }
  };

  const generateAINotes = async () => {
    if (!items.length) {
      showRuleToast("Add some items to your design first");
      return;
    }

    setAiNotesLoading(true);
    const startTime = Date.now();
    const timeoutId = setTimeout(() => {
      setAiNotesLoading(false);
      showRuleToast(
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
    if (typeof window === "undefined") {
      setLocalBackupHydrated(true);
      return;
    }
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
        designId?: string | null;
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
          if (typeof parsed.designId === "string" && parsed.designId.trim()) {
            const restoredDesignId = parsed.designId;
            setDesignId(restoredDesignId);
            fetchShareStatus(restoredDesignId);
            void (async () => {
              try {
                const legacyData = snapshotToLegacyApi(nextSnapshot);
                const res = await fetch(`/api/designs/${restoredDesignId}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(legacyData),
                });
                if (res.ok) {
                  setLastDbSaveAt(Date.now());
                  setLastCloudSaveError(null);
                }
              } catch {
                // The regular autosave path will surface persistent cloud errors.
              }
            })();
          }
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
    } finally {
      setLocalBackupHydrated(true);
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
  }, [planOpenings.length, planSettingsLoaded, setPlanOpenings]);

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
  }, [planFixedElements.length, planSettingsLoaded, roomDepth, setPlanFixedElements]);


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

  const clearNonRoomSelection = useCallback(() => {
    clearSelection();
    clearZoneSelection();
    setSelectedPlanOverlayId(null);
  }, [clearSelection, clearZoneSelection]);

  const clearAllSelection = useCallback(() => {
    clearNonRoomSelection();
    setSelectedPlanRoomId(null);
  }, [clearNonRoomSelection]);

  const deletePlanOverlayById = useCallback((overlayId: string | null) => {
    if (!overlayId) return false;

    let removed = false;
    setPlanOpenings((prev) => {
      const next = prev.filter((entry) => entry.id !== overlayId);
      if (next.length !== prev.length) removed = true;
      return next;
    });
    setPlanFixedElements((prev) => {
      const next = prev.filter((entry) => entry.id !== overlayId);
      if (next.length !== prev.length) removed = true;
      return next;
    });
    setPlanAnnotations((prev) => {
      const next = prev.filter((entry) => entry.id !== overlayId);
      if (next.length !== prev.length) removed = true;
      return next;
    });
    setSelectedPlanOverlayId(null);
    return removed;
  }, [setPlanAnnotations, setPlanFixedElements, setPlanOpenings]);

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
        if (selectedPlanOverlayId) {
          e.preventDefault();
          deletePlanOverlayById(selectedPlanOverlayId);
          return;
        }

        const selectedIds = Array.from(selectedIdsRef.current);
        if (selectedIds.length === 0) return;
        e.preventDefault();

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
  }, [clearSelection, commitItems, deletePlanOverlayById, isClientPreview, items, selectedPlanOverlayId]);

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

  // Keep room selection separate from camera navigation. Normal room clicks
  // should not pull users out of their whole-home overview.
  const handleSwitchRoom = useCallback((roomId: string) => {
    setDesignSnapshot((prev) => switchRoom(prev, roomId));
    clearNonRoomSelection();
    track("editor_room_switched", { roomId });
  }, [clearNonRoomSelection]);

  useEffect(() => {
    floorActionAdaptersRef.current = {
      clearNonRoomSelection,
      transitionToCameraView,
      updateCameraViewFromScene,
    };
  }, [clearNonRoomSelection, transitionToCameraView, updateCameraViewFromScene]);

  const updateActiveRoomGeometry = useCallback(
    (
      actionName: string,
      geometryUpdate: (geometry: RoomSnapshot["geometry"]) => RoomSnapshot["geometry"]
    ) => {
      const room = getActiveRoom(designSnapshotRef.current);
      if (!room) return;
      const nextSnapshot = updateRoom(designSnapshotRef.current, {
        ...room,
        geometry: geometryUpdate(room.geometry),
      });

      history.begin(actionName);
      designSnapshotRef.current = nextSnapshot;
      setDesignSnapshot(nextSnapshot);
      history.commit();
    },
    [history]
  );

  const handleActiveRoomHeightMmChange = useCallback(
    (valueMm: number) => {
      const height = clampRoomHeightMeters(valueMm / 1000);
      updateActiveRoomGeometry("Edit room height", (geometry) => ({ ...geometry, height }));
      track("editor_room_height_changed", { height });
    },
    [updateActiveRoomGeometry]
  );

  const handleActiveRoomSlabThicknessMmChange = useCallback(
    (valueMm: number) => {
      const slabThickness = clampSlabThicknessMeters(valueMm / 1000);
      updateActiveRoomGeometry("Edit slab thickness", (geometry) => ({
        ...geometry,
        slabThickness,
      }));
      track("editor_slab_thickness_changed", { slabThickness });
    },
    [updateActiveRoomGeometry]
  );

  const handleActiveRoomWallThicknessMmChange = useCallback(
    (valueMm: number) => {
      const wallThickness = clampWallThicknessMeters(valueMm / 1000);
      updateActiveRoomGeometry("Edit wall thickness", (geometry) => ({
        ...geometry,
        wallThickness,
      }));
      track("editor_wall_thickness_changed", { wallThickness });
    },
    [updateActiveRoomGeometry]
  );

  const handleActiveRoomSurfaceOpacityChange = useCallback(
    (kind: "wall" | "floor" | "ceiling", opacity: number) => {
      const nextOpacity = clampEditorOpacity(opacity);
      const room = getActiveRoom(designSnapshotRef.current);
      if (!room) return;
      const nextSnapshot = updateRoom(designSnapshotRef.current, {
        ...room,
        surfaceOpacity: {
          wall: room.surfaceOpacity?.wall ?? 1,
          floor: room.surfaceOpacity?.floor ?? 1,
          ceiling: room.surfaceOpacity?.ceiling ?? 1,
          [kind]: nextOpacity,
        },
      });

      history.begin(kind === "wall" ? "Edit wall opacity" : "Edit floor opacity");
      designSnapshotRef.current = nextSnapshot;
      setDesignSnapshot(nextSnapshot);
      history.commit();
      track("editor_surface_opacity_changed", { kind, opacity: nextOpacity });
    },
    [history]
  );

  const handleActiveRoomCeilingVisibleChange = useCallback((visible: boolean) => {
    const room = getActiveRoom(designSnapshotRef.current);
    if (!room) return;
    const nextSnapshot = updateRoom(designSnapshotRef.current, {
      ...room,
      ceilingVisible: visible,
    });
    history.begin(visible ? "Show ceiling" : "Hide ceiling");
    designSnapshotRef.current = nextSnapshot;
    setDesignSnapshot(nextSnapshot);
    history.commit();
    track("editor_ceiling_visibility_changed", { visible });
  }, [history]);

  const handleActiveRoomCeilingColorChange = useCallback((color: string) => {
    const safeColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#f8f8f6";
    const room = getActiveRoom(designSnapshotRef.current);
    if (!room) return;
    const nextSnapshot = updateRoom(designSnapshotRef.current, {
      ...room,
      surfaceFinishes: {
        ...room.surfaceFinishes,
        ceilingColor: safeColor,
      },
    });
    history.begin("Edit ceiling color");
    designSnapshotRef.current = nextSnapshot;
    setDesignSnapshot(nextSnapshot);
    history.commit();
    track("editor_ceiling_color_changed");
  }, [history]);

  const handleSelectPlanOverlay = useCallback((id: string | null) => {
    setSelectedPlanOverlayId(id);
    if (id) {
      clearSelection();
      clearZoneSelection();
      setSelectedPlanRoomId(null);
      if (editorMode !== "present") setEditorMode("design");
    }
  }, [clearSelection, clearZoneSelection, editorMode]);

  const handleRenameSelectedPlanRoom = useCallback(
    (roomId: string) => {
      const room = designSnapshotRef.current.rooms.find((entry) => entry.id === roomId);
      if (!room) return;

      setPendingRoomRenameId(roomId);
      setPendingRoomRenameValue(room.name);
    },
    []
  );

  const cancelRoomRename = useCallback(() => {
    setPendingRoomRenameId(null);
    setPendingRoomRenameValue("");
  }, []);

  const commitRoomRename = useCallback(() => {
    if (!pendingRoomRenameId) return;

    const room = designSnapshotRef.current.rooms.find(
      (entry) => entry.id === pendingRoomRenameId
    );
    const trimmed = pendingRoomRenameValue.trim();
    if (!room || !trimmed || trimmed === room.name) {
      cancelRoomRename();
      return;
    }

    handleRenameRoom(pendingRoomRenameId, trimmed);
    showRuleToast(`Renamed to ${trimmed}`);
    cancelRoomRename();
  }, [
    cancelRoomRename,
    handleRenameRoom,
    pendingRoomRenameId,
    pendingRoomRenameValue,
    showRuleToast,
  ]);

  const handleDuplicateSelectedPlanRoom = useCallback(
    (roomId: string) => {
      const source = designSnapshotRef.current.rooms.find((room) => room.id === roomId);
      const sourcePlanRoom = housePlan2D.rooms.find((room) => room.id === roomId);
      if (!source || !sourcePlanRoom) return;

      const newRoom = createRoom(
        `room_${Date.now()}`,
        resolveNewRoomName(designSnapshotRef.current.rooms, source.roomType),
        source.roomType,
        {
          ...source.geometry,
        }
      );

      newRoom.floorLevel = source.floorLevel ?? 1;
      const offsetCandidates = [
        { x: sourcePlanRoom.w + 0.3, z: 0 },
        { x: 0, z: sourcePlanRoom.d + 0.3 },
        { x: -sourcePlanRoom.w - 0.3, z: 0 },
        { x: 0, z: -sourcePlanRoom.d - 0.3 },
        { x: sourcePlanRoom.w + 0.8, z: sourcePlanRoom.d + 0.8 },
      ];
      const fallbackOffset = offsetCandidates[offsetCandidates.length - 1];
      const placement =
        offsetCandidates.find((offset) => {
          const x = roundPlanCoordinate(sourcePlanRoom.x + offset.x);
          const z = roundPlanCoordinate(sourcePlanRoom.z + offset.z);
          return !doesHouseRoomOverlap(
            "__duplicate_room__",
            x,
            z,
            sourcePlanRoom.w,
            sourcePlanRoom.d,
            housePlan2D.rooms
          );
        }) ?? fallbackOffset;

      newRoom.planPosition = {
        x: roundPlanCoordinate(sourcePlanRoom.x + placement.x),
        z: roundPlanCoordinate(sourcePlanRoom.z + placement.z),
      };
      newRoom.planShape = source.planShape;
      newRoom.planPolygon = source.planPolygon?.map((point) => ({ ...point }));
      newRoom.surfaceFinishes = source.surfaceFinishes ? { ...source.surfaceFinishes } : undefined;

      setDesignSnapshot((prev) => switchRoom({ ...prev, rooms: [...prev.rooms, newRoom] }, newRoom.id));
      setSelectedPlanRoomId(newRoom.id);
      clearNonRoomSelection();
      showRuleToast(`${newRoom.name} duplicated`);
      track("floor_plan_room_duplicated", { roomId, duplicatedRoomId: newRoom.id });
    },
    [clearNonRoomSelection, housePlan2D.rooms, setDesignSnapshot, showRuleToast]
  );

  const handleDeleteSelectedPlanRoom = useCallback(
    (roomId: string) => {
      if (designSnapshotRef.current.rooms.length <= 1) {
        showRuleToast("Keep at least one room");
        return;
      }

      const room = designSnapshotRef.current.rooms.find((entry) => entry.id === roomId);
      setDesignSnapshot((prev) => deleteRoom(prev, roomId));
      setPlanOpenings((prev) => prev.filter((opening) => opening.roomId !== roomId));
      setSelectedPlanRoomId(null);
      clearNonRoomSelection();
      showRuleToast(`${room?.name ?? "Room"} deleted`);
      track("floor_plan_room_deleted", { roomId });
    },
    [clearNonRoomSelection, setDesignSnapshot, setPlanOpenings, showRuleToast]
  );

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
    legFinishOptions,
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

  const handleCommitRoomDimensionEdit2D = useCallback(
    (roomId: string, axis: "width" | "depth", valueMeters: number) => {
      const targetRoom = designSnapshot.rooms.find((room) => room.id === roomId);
      const planRoom = housePlan2D.rooms.find((room) => room.id === roomId);
      if (!targetRoom || !planRoom) return;

      const width = clampRoomDimension(axis === "width" ? valueMeters : targetRoom.geometry.width);
      const depth = clampRoomDimension(axis === "depth" ? valueMeters : targetRoom.geometry.depth);
      if (!Number.isFinite(width) || !Number.isFinite(depth)) return;
      if (doesHouseRoomOverlap(roomId, planRoom.x, planRoom.z, width, depth, housePlan2D.rooms)) {
        showRuleToast("Rooms cannot overlap");
        return;
      }

      const currentWall =
        typeof targetRoom.geometry.wallThickness === "number" &&
        Number.isFinite(targetRoom.geometry.wallThickness)
          ? targetRoom.geometry.wallThickness
          : ROOM_DIMENSION_DEFAULTS.wallThickness;

      const normalizedItems = _normalizeItemsToRoom({
        items: targetRoom.items,
        width,
        depth,
        wall: currentWall,
        catalogItems: CATALOG_ITEMS,
        resolveConfiguredPlanningDimsMm,
      });

      history.begin("Edit room dimension");
      setDesignSnapshot((prev) =>
        updateRoom(prev, {
          ...targetRoom,
          geometry: {
            ...targetRoom.geometry,
            width,
            depth,
            wallThickness: currentWall,
          },
          items: normalizedItems,
        })
      );
      history.commit();

      if (designSnapshot.activeRoomId === roomId) {
        setRoomWidthInput(width.toFixed(2));
        setRoomDepthInput(depth.toFixed(2));
      }

      track("editor_room_dimension_edited", {
        roomId,
        axis,
        width,
        depth,
      });
    },
    [
      designSnapshot.activeRoomId,
      designSnapshot.rooms,
      history,
      housePlan2D.rooms,
      resolveConfiguredPlanningDimsMm,
      setRoomDepthInput,
      setRoomWidthInput,
      showRuleToast,
    ]
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
  const selectedItemPlanningDimensionsMm = useMemo(() => {
    if (!selectedItem || !selectedProduct) return null;
    return resolveConfiguredPlanningDimsMm(selectedItem, selectedProduct);
  }, [resolveConfiguredPlanningDimsMm, selectedItem, selectedProduct]);
  const selectedStyleConsistencyReport = useMemo(() => {
    if (!selectedItem || !activeRoom) return null;
    return evaluateStyleConsistency({
      room: activeRoom,
      selectedItem,
      catalogItems: CATALOG_ITEMS,
    });
  }, [activeRoom, selectedItem]);

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

  const {
    pendingAnnotationKind,
    pendingAnnotationText,
    setPendingAnnotationText,
    cancelPlanAnnotation,
    commitPlanAnnotation,
    handleMoveOpening2D,
    handleUpdateOpeningMetrics2D,
    handleAddSuggestedDoorway,
    handleMoveFixedElement2D,
    handleMoveAnnotation2D,
    runPlanOverlayCommand,
  } = useDesignPagePlanActions({
    activeRoomName: activeRoom?.name,
    housePlanRooms: housePlan2D.rooms,
    planOpenings,
    planViewWidth,
    planViewDepth,
    setPlanTheme,
    setPlanLayers,
    setPlanLayerPreset,
    setPlanAnnotations,
    setPlanOpenings,
    setPlanFixedElements,
    onSelectPlanOverlay: handleSelectPlanOverlay,
    showRuleToast,
    track,
  });

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
  const selectedPlanRoomContext = selectedPlanRoomId
    ? houseRoomById.get(selectedPlanRoomId) ?? null
    : null;
  const selectedObjectContext = useMemo(() => {
    return buildDesignSelectionContext({
      selectedFurniture:
        selectedItem && selectedProduct
          ? { title: selectedProduct.title, category: selectedProduct.category }
          : null,
      activeRoomName: activeRoom?.name ?? "Room",
      visiblePlanOpening,
      visiblePlanOpeningRoomName,
      selectedPlanRoom: selectedPlanRoomContext,
    });
  }, [
    activeRoom?.name,
    selectedItem,
    selectedPlanRoomContext,
    selectedProduct,
    visiblePlanOpening,
    visiblePlanOpeningRoomName,
  ]);
  const exportReadinessItems = useMemo(() => {
    return buildExportReadinessItems({
      roomCount: housePlan2D.rooms.length,
      openingCount: planOpenings.length,
      itemCount: items.length,
      shoppableCount: wholeHomeShoppingSummary.shoppableCount,
      hasRoomConnectionBlockers: roomConnectionChecklistItems.some(
        (item) => item.status === "needs_doorway"
      ),
      sceneReady,
      exportStylePreset,
    });
  }, [
    exportStylePreset,
    housePlan2D.rooms.length,
    items.length,
    planOpenings.length,
    roomConnectionChecklistItems,
    sceneReady,
    wholeHomeShoppingSummary.shoppableCount,
  ]);
  const { readyCount: exportReadinessReadyCount, score: exportReadinessScore } = useMemo(
    () => getExportReadinessScore(exportReadinessItems),
    [exportReadinessItems]
  );

  const handleSelectFloorPlanTool = useCallback(() => {
    setViewMode("2d");
    activateFloorPlanSelectTool();
  }, [activateFloorPlanSelectTool]);

  const handleAddFloorPlanOpeningFromTool = useCallback(
    (kind: RoomOpening2D["kind"]) => {
      setViewMode("2d");
      activateFloorPlanOpeningTrace(true, kind);

      if (!activeRoom) {
        showRuleToast("Add a room first");
        return;
      }

      showRuleToast(kind === "door" ? "Click a wall to place a door" : "Click a wall to place a window");
    },
    [activateFloorPlanOpeningTrace, activeRoom, showRuleToast]
  );
  const skipNextTemplateReplacementConfirmRef = useRef(false);
  const [pendingPlanTemplateReplacement, setPendingPlanTemplateReplacement] = useState<{
    template: HousePlanTemplate;
    options?: HousePlanTemplateApplyOptions;
  } | null>(null);

  const handleApplyPlanTemplate = useCallback(
    (template: HousePlanTemplate, options?: HousePlanTemplateApplyOptions) => {
      if (
        !skipNextTemplateReplacementConfirmRef.current &&
        shouldConfirmPlanTemplateReplacement(designSnapshotRef.current, planOpenings)
      ) {
        setPendingPlanTemplateReplacement({ template, options });
        track("floor_plan_template_replacement_prompted", {
          templateId: template.id,
          furnishingPackId: options?.furnishingPackId ?? null,
          roomCount: designSnapshotRef.current.rooms.length,
          openingCount: planOpenings.length,
        });
        return;
      }
      skipNextTemplateReplacementConfirmRef.current = false;

      const timestamp = Date.now();
      const templateRoomIdMap = new Map<string, string>();
      const rooms = template.rooms.map((templateRoom, index) => {
        const room = createRoom(
          `template_${template.id}_${templateRoom.id}_${timestamp}_${index}`,
          templateRoom.name,
          templateRoom.roomType,
          {
            width: templateRoom.width,
            depth: templateRoom.depth,
            wallThickness,
            height: roomHeight,
          }
        );

        room.planPosition = {
          x: roundPlanCoordinate(templateRoom.x),
          z: roundPlanCoordinate(templateRoom.z),
        };
        room.planShape = templateRoom.shape;
        room.surfaceFinishes = {
          floorMaterialId:
            templateRoom.roomType === "kitchen" || templateRoom.roomType === "toilet"
              ? "light_stone_tile"
              : DEFAULT_FLOOR_MATERIAL_ID,
        };
        templateRoomIdMap.set(templateRoom.id, room.id);
        return room;
      });
      const activeTemplateRoom = rooms[0];
      if (!activeTemplateRoom) return;
      const templateOpenings: RoomOpening2D[] = template.doorways.flatMap((doorway, index) => {
        const roomId = templateRoomIdMap.get(doorway.fromRoomId);
        const adjacentRoomId = templateRoomIdMap.get(doorway.toRoomId);
        const sourceRoom = template.rooms.find((entry) => entry.id === doorway.fromRoomId);
        if (!roomId || !adjacentRoomId || !sourceRoom) return [];
        const spanMeters =
          doorway.wall === "north" || doorway.wall === "south"
            ? sourceRoom.width
            : sourceRoom.depth;
        const widthMeters = Math.min(doorway.widthMeters ?? 0.9, Math.max(0.7, spanMeters - 0.6));
        const maxOffsetMeters = Math.max(0, spanMeters / 2 - widthMeters / 2 - 0.25);
        const requestedOffsetMeters = doorway.offsetMeters ?? 0;
        const offsetMeters = Math.max(
          -maxOffsetMeters,
          Math.min(maxOffsetMeters, requestedOffsetMeters)
        );

        return [{
          id: `template-opening-${template.id}-${timestamp}-${index}`,
          roomId,
          wall: doorway.wall,
          kind: "door" as const,
          offsetMm: metersToMm(offsetMeters),
          widthMm: metersToMm(widthMeters),
        }];
      });
      const selectedFurnishingPack = options?.furnishingPackId
        ? template.furnishingPacks.find((pack) => pack.id === options.furnishingPackId) ?? null
        : null;
      let furnishedItemCount = 0;
      let skippedFurnishingCount = 0;

      if (selectedFurnishingPack) {
        for (const intent of selectedFurnishingPack.intents) {
          const roomId = templateRoomIdMap.get(intent.roomId);
          const targetRoom = roomId ? rooms.find((room) => room.id === roomId) : null;
          const product = resolveTemplateFurnishingProduct(intent);

          if (!targetRoom || !product || isTemplateFurnishingNearDoorway(template, intent)) {
            skippedFurnishingCount += 1;
            continue;
          }

          const resolved = resolveCatalogVariant(product, product.defaultVariantId);
          targetRoom.items = [
            ...targetRoom.items,
            {
              instanceId: `template-furnishing-${template.id}-${intent.id}-${timestamp}-${furnishedItemCount}`,
              productId: product.id,
              variantId: resolved.variantId,
              position: [intent.x, 0, intent.z],
              rotationY:
                intent.rotationDeg === undefined
                  ? product.defaultRotation
                  : (intent.rotationDeg * Math.PI) / 180,
              qty: 1,
              includeInCheckout: true,
            },
          ];
          furnishedItemCount += 1;
        }
      }

      revokeFloorPlanUnderlayUrl();
      floorPlanPdfSourceDataRef.current = null;
      setFloorPlanPdfSourceReady(false);
      setFloorPlanUnderlay(null);
      resetFloorPlanInteraction();
      setPlanOpenings(templateOpenings);
      setSelectedPlanOverlayId(null);
      clearAllSelection();
      setViewMode("2d");

      setDesignSnapshot((prev) => ({
        ...prev,
        version: 3,
        rooms,
        activeRoomId: activeTemplateRoom.id,
      }));

      if (selectedFurnishingPack && skippedFurnishingCount > 0) {
        showRuleToast(`Some starter items were skipped`);
      } else {
        showRuleToast(
          selectedFurnishingPack
            ? `${template.label} furnished starter added`
            : `${template.label} added`
        );
      }
      track("floor_plan_template_applied", {
        templateId: template.id,
        furnishingPackId: selectedFurnishingPack?.id ?? null,
        furnishedItemCount,
        skippedFurnishingCount,
        roomCount: rooms.length,
        openingCount: templateOpenings.length,
      });
    },
    [
      clearAllSelection,
      resetFloorPlanInteraction,
      revokeFloorPlanUnderlayUrl,
      planOpenings,
      roomHeight,
      setDesignSnapshot,
      setFloorPlanPdfSourceReady,
      setFloorPlanUnderlay,
      setPlanOpenings,
      showRuleToast,
      wallThickness,
    ]
  );

  const handleCancelPendingPlanTemplateReplacement = useCallback(() => {
    const pending = pendingPlanTemplateReplacement;
    setPendingPlanTemplateReplacement(null);
    if (!pending) return;
    track("floor_plan_template_apply_cancelled", {
      templateId: pending.template.id,
      furnishingPackId: pending.options?.furnishingPackId ?? null,
      roomCount: designSnapshotRef.current.rooms.length,
      openingCount: planOpenings.length,
    });
  }, [pendingPlanTemplateReplacement, planOpenings]);

  const handleConfirmPendingPlanTemplateReplacement = useCallback(() => {
    const pending = pendingPlanTemplateReplacement;
    if (!pending) return;
    setPendingPlanTemplateReplacement(null);
    skipNextTemplateReplacementConfirmRef.current = true;
    handleApplyPlanTemplate(pending.template, pending.options);
  }, [handleApplyPlanTemplate, pendingPlanTemplateReplacement]);

  const handleApplyFloorMaterialToRoom = useCallback(
    (materialId: string) => {
      const material = getFloorMaterialById(materialId);
      const room = getActiveRoom(designSnapshotRef.current);
      if (!room) return;

      setDesignSnapshot((prev) => {
        const target = prev.rooms.find((entry) => entry.id === room.id);
        if (!target) return prev;

        return updateRoom(prev, {
          ...target,
          surfaceFinishes: {
            ...target.surfaceFinishes,
            floorMaterialId: material.id,
          },
        });
      });

      showRuleToast(`${material.name} applied to ${room.name}`);
      track("floor_finish_applied", {
        materialId: material.id,
        roomId: room.id,
        scope: "room",
      });
    },
    [setDesignSnapshot, showRuleToast]
  );

  const handleApplyFloorMaterialToAllRooms = useCallback(
    (materialId: string) => {
      const material = getFloorMaterialById(materialId);

      setDesignSnapshot((prev) => {
        if (prev.rooms.length === 0) return prev;

        return {
          ...prev,
          rooms: prev.rooms.map((room) => ({
            ...room,
            surfaceFinishes: {
              ...room.surfaceFinishes,
              floorMaterialId: material.id,
            },
          })),
        };
      });

      showRuleToast(`${material.name} applied to all rooms`);
      track("floor_finish_applied", {
        materialId: material.id,
        scope: "home",
      });
    },
    [setDesignSnapshot, showRuleToast]
  );

  const handleRotateActiveFloorMaterial = useCallback(() => {
    const room = getActiveRoom(designSnapshotRef.current);
    if (!room) return;

    setDesignSnapshot((prev) => {
      const target = prev.rooms.find((entry) => entry.id === room.id);
      if (!target) return prev;

      return updateRoom(prev, {
        ...target,
        surfaceFinishes: {
          ...target.surfaceFinishes,
          floorRotationDeg: normalizeFloorRotationDeg(
            (target.surfaceFinishes?.floorRotationDeg ?? 0) + 90
          ),
        },
      });
    });

    showRuleToast(`Floor direction rotated in ${room.name}`);
    track("floor_finish_pattern_changed", {
      roomId: room.id,
      action: "rotate_90",
    });
  }, [setDesignSnapshot, showRuleToast]);

  const handleResetActiveFloorMaterialPattern = useCallback(() => {
    const room = getActiveRoom(designSnapshotRef.current);
    if (!room) return;

    setDesignSnapshot((prev) => {
      const target = prev.rooms.find((entry) => entry.id === room.id);
      if (!target) return prev;

      return updateRoom(prev, {
        ...target,
        surfaceFinishes: {
          ...target.surfaceFinishes,
          floorRotationDeg: 0,
          floorScale: DEFAULT_FLOOR_PATTERN_SCALE,
        },
      });
    });

    showRuleToast(`Floor pattern reset in ${room.name}`);
    track("floor_finish_pattern_changed", {
      roomId: room.id,
      action: "reset",
    });
  }, [setDesignSnapshot, showRuleToast]);

  const handleActiveFloorMaterialScaleChange = useCallback(
    (scale: number) => {
      const room = getActiveRoom(designSnapshotRef.current);
      if (!room) return;
      const nextScale = clampFloorPatternScale(scale);

      setDesignSnapshot((prev) => {
        const target = prev.rooms.find((entry) => entry.id === room.id);
        if (!target) return prev;

        return updateRoom(prev, {
          ...target,
          surfaceFinishes: {
            ...target.surfaceFinishes,
            floorScale: nextScale,
          },
        });
      });
    },
    [setDesignSnapshot]
  );

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
      pos: [0, height, 0.001],
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
        resetFloorPlanInteraction({ resetCalibrationDistance: false });
        transitionToCameraView(hasWholeHousePlan ? getWholeHome3DView() : DEFAULT_EDITOR_CAMERA_VIEW, 420);
      }
    },
    [getWholeHome3DView, hasWholeHousePlan, resetFloorPlanInteraction, transitionToCameraView]
  );

  const applyPlan2DCameraView = useCallback(
    ({
      centerX = 0,
      centerZ = 0,
      widthMeters = planViewWidth,
      depthMeters = planViewDepth,
    }: {
      centerX?: number;
      centerZ?: number;
      widthMeters?: number;
      depthMeters?: number;
    } = {}) => {
      const camera = cameraRef.current;
      const controls = orbitControlsRef.current;
      if (!(camera instanceof THREE.OrthographicCamera) || !controls) return false;

      const canvas = canvasRef.current;
      const span = Math.max(widthMeters, depthMeters);
      const viewportWidthPx = canvas?.clientWidth ?? window.innerWidth;
      const viewportHeightPx = canvas?.clientHeight ?? window.innerHeight;
      const leftInsetPx = viewportWidthPx >= 768 ? plan2DSafeAreaLeftPx : 0;
      const bottomInsetPx = viewportWidthPx < 768 ? plan2DSafeAreaBottomPx : 0;

      camera.zoom = resolvePlanFitZoom({
        viewportWidthPx: Math.max(320, viewportWidthPx - leftInsetPx),
        viewportHeightPx: Math.max(260, viewportHeightPx - bottomInsetPx),
        planWidthMeters: widthMeters,
        planDepthMeters: depthMeters,
      });
      const targetX = centerX + (leftInsetPx > 0 ? -leftInsetPx / camera.zoom / 2 : 0);
      const targetZ = centerZ + (bottomInsetPx > 0 ? -bottomInsetPx / camera.zoom / 2 : 0);
      camera.up.set(0, 0, -1);
      camera.position.set(targetX, span + roomHeight + 6, targetZ);
      (controls.target as THREE.Vector3).set(targetX, 0, targetZ);
      camera.lookAt(targetX, 0, targetZ);
      updateProjection(camera);
      controls.update();
      updateCameraViewFromScene();
      return true;
    },
    [
      planViewDepth,
      planViewWidth,
      plan2DSafeAreaBottomPx,
      plan2DSafeAreaLeftPx,
      roomHeight,
      updateCameraViewFromScene,
      updateProjection,
    ]
  );

  const handleFitPlanView = useCallback(() => {
    if (viewMode === "2d") {
      if (!applyPlan2DCameraView()) {
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
    applyPlan2DCameraView,
    getPlan2DView,
    getWholeHome3DView,
    hasWholeHousePlan,
    planViewDepth,
    planViewWidth,
    showRuleToast,
    transitionToCameraView,
    viewMode,
  ]);

  const handleFitSelectedPlanRoom = useCallback(
    (roomId: string) => {
      const room = housePlan2D.rooms.find((entry) => entry.id === roomId);
      if (!room) return;

      const paddedWidth = room.w + 1.4;
      const paddedDepth = room.d + 1.4;

      if (
        !applyPlan2DCameraView({
          centerX: room.x,
          centerZ: room.z,
          widthMeters: paddedWidth,
          depthMeters: paddedDepth,
        })
      ) {
        transitionToCameraView(
          {
            target: [room.x, 0, room.z],
            pos: [room.x, Math.max(paddedWidth, paddedDepth) + roomHeight + 6, room.z + 0.001],
            fov: 45,
          },
          260
        );
      }

      showRuleToast(`${room.name} fitted`);
      track("floor_plan_fit_selected_room_clicked", { roomId });
    },
    [
      applyPlan2DCameraView,
      housePlan2D.rooms,
      roomHeight,
      showRuleToast,
      transitionToCameraView,
    ]
  );

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

  const nudgeWholeHomeCameraForDrag = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!hasWholeHousePlan) return;
      const camera = cameraRef.current;
      const controls = orbitControlsRef.current;
      if (!camera || !controls) return;

      const nativeEvent = event.nativeEvent as PointerEvent | undefined;
      const element = nativeEvent?.target instanceof Element ? nativeEvent.target : null;
      const canvas = element?.closest("canvas");
      if (!nativeEvent || !canvas) return;

      const bounds = canvas.getBoundingClientRect();
      const edge = 72;
      let xDir = 0;
      let zDir = 0;
      if (nativeEvent.clientX < bounds.left + edge) xDir = -1;
      if (nativeEvent.clientX > bounds.right - edge) xDir = 1;
      if (nativeEvent.clientY < bounds.top + edge) zDir = -1;
      if (nativeEvent.clientY > bounds.bottom - edge) zDir = 1;
      if (xDir === 0 && zDir === 0) return;

      const target = controls.target as THREE.Vector3;
      const distance = Math.max(1, camera.position.distanceTo(target));
      const step = Math.max(0.05, Math.min(0.35, distance * 0.012));
      const next = clampWholeHomeNavigatorPoint(
        target.x + xDir * step,
        target.z + zDir * step
      );
      const deltaX = next.x - target.x;
      const deltaZ = next.z - target.z;
      if (Math.abs(deltaX) < 0.001 && Math.abs(deltaZ) < 0.001) return;

      target.set(next.x, target.y, next.z);
      camera.position.set(
        camera.position.x + deltaX,
        camera.position.y,
        camera.position.z + deltaZ
      );
      updateProjection(camera);
      controls.update();
      updateCameraViewFromScene();
    },
    [
      clampWholeHomeNavigatorPoint,
      hasWholeHousePlan,
      updateCameraViewFromScene,
      updateProjection,
    ]
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
      resetFloorPlanInteraction();
      setViewMode("2d");
      track("floor_plan_underlay_uploaded", {
        mimeType,
        renderedMimeType,
        renderedPage,
        pageCount,
        hasImagePreview: renderedMimeType.startsWith("image/"),
      });
    },
    [
      planViewDepth,
      planViewWidth,
      resetFloorPlanInteraction,
      revokeFloorPlanUnderlayUrl,
      setFloorPlanPdfSourceReady,
      setFloorPlanUnderlay,
      showRuleToast,
    ]
  );

  const handleFloorPlanUnderlayOpacityChange = useCallback((opacity: number) => {
    setFloorPlanUnderlay((prev) =>
      prev ? { ...prev, opacity: Math.max(0.15, Math.min(0.85, opacity)) } : prev
    );
  }, [setFloorPlanUnderlay]);

  const handleFloorPlanUnderlayLockChange = useCallback((locked: boolean) => {
    setFloorPlanUnderlay((prev) => (prev ? { ...prev, locked } : prev));
  }, [setFloorPlanUnderlay]);

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
        resetFloorPlanInteraction();
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
    [
      floorPlanUnderlay,
      planViewDepth,
      planViewWidth,
      resetFloorPlanInteraction,
      setFloorPlanPdfRenderingPage,
      setFloorPlanUnderlay,
      showRuleToast,
    ]
  );

  const handleFloorPlanCalibrationModeChange = useCallback((enabled: boolean) => {
    activateFloorPlanCalibrationMode(enabled);
  }, [activateFloorPlanCalibrationMode]);

  const handleFloorPlanCalibrationPoint = useCallback((point: FloorPlanPoint) => {
    setFloorPlanCalibrationPoints((prev) => {
      if (prev.length >= 2) {
        return [point];
      }
      return [...prev, point];
    });
  }, [setFloorPlanCalibrationPoints]);

  const handleResetFloorPlanCalibrationPoints = useCallback(() => {
    setFloorPlanCalibrationPoints([]);
  }, [setFloorPlanCalibrationPoints]);

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
    resetFloorPlanCalibration(false);
    clearFloorPlanTraceBuffers();
    track("floor_plan_underlay_calibrated", {
      referenceLengthMeters: nextUnderlay.calibration?.referenceLengthMeters,
      pixelsPerMeter: nextUnderlay.calibration?.pixelsPerMeter,
    });
  }, [
    floorPlanCalibrationDistanceInput,
    floorPlanCalibrationPoints,
    floorPlanUnderlay,
    clearFloorPlanTraceBuffers,
    resetFloorPlanCalibration,
    setFloorPlanUnderlay,
    showRuleToast,
  ]);

  const emitConsumerPlanCompletion = useCallback((kind: "room" | "opening") => {
    if (!planGuidedActionsEnabled) return;
    setConsumerPlanCompletionSignal((current) => ({
      id: (current?.id ?? 0) + 1,
      kind,
    }));
  }, [planGuidedActionsEnabled]);

  const handleConsumerPlanCompletionHandled = useCallback((id: number) => {
    setConsumerPlanCompletionSignal((current) =>
      current?.id === id ? null : current
    );
  }, []);

  useEffect(() => {
    if (planGuidedActionsEnabled) return;
    setConsumerPlanCompletionSignal(null);
  }, [planGuidedActionsEnabled]);

  const choosePlanGuidedActionsMode = useCallback(
    (enabled: boolean) => {
      setPlanGuidedActionsEnabled(enabled);
      setPlanGuidedActionsChoiceSeen(true);
    },
    [setPlanGuidedActionsChoiceSeen, setPlanGuidedActionsEnabled]
  );

  const {
    applyResolvedWallDrawRoom,
    applyTracedRoomRectangle,
  } = useFloorPlanRoomCreation({
    activeRoom,
    floorPlanTraceRoomType,
    handleAddRoom,
    housePlanRooms: housePlan2D.rooms,
    roomCount: designSnapshot.rooms.length,
    setDesignSnapshot,
    showRuleToast,
  });

  const completeConsumerRoomDraw = useCallback(
    (applied: boolean) => {
      if (applied && !isDesigner) {
        setFloorPlanTraceRoomMode(false);
        setPlanFocusPanelRevealed(false);
        setDesignPanelOpen(true);
        emitConsumerPlanCompletion("room");
      }
      return applied;
    },
    [emitConsumerPlanCompletion, isDesigner, setFloorPlanTraceRoomMode]
  );

  const applyResolvedWallDrawRoomWithCompletion = useCallback(
    (...args: Parameters<typeof applyResolvedWallDrawRoom>) =>
      completeConsumerRoomDraw(applyResolvedWallDrawRoom(...args)),
    [applyResolvedWallDrawRoom, completeConsumerRoomDraw]
  );

  const applyTracedRoomRectangleWithCompletion = useCallback(
    (...args: Parameters<typeof applyTracedRoomRectangle>) =>
      completeConsumerRoomDraw(applyTracedRoomRectangle(...args)),
    [applyTracedRoomRectangle, completeConsumerRoomDraw]
  );

  const handleFloorPlanTraceRoomModeChange = useCallback((enabled: boolean) => {
    activateFloorPlanRoomTrace(enabled);
    if (enabled) {
      setViewMode("2d");
    }
  }, [activateFloorPlanRoomTrace]);

  const handleFloorPlanDrawRoomModeChange = useCallback(
    (mode: FloorPlanDrawRoomMode) => {
      activateFloorPlanRoomDrawMode(mode);
      setViewMode("2d");
    },
    [activateFloorPlanRoomDrawMode]
  );

  const {
    handleApplyFloorPlanExactWallLength,
    handleBlankGridRoomDrawDrag,
    handleBlankGridRoomDrawPoint,
    handleBlankGridRoomDrawPreviewPoint,
    handleCommitWallDrawSegmentLength2D,
    handleFloorPlanTraceRoomPoint,
    handleResetFloorPlanTraceRoomPoints,
    handleUndoFloorPlanTraceRoomPoint,
  } = useFloorPlanRoomDrawing({
    blankGridRoomDrawActive,
    blankGridRoomPreviewPoint,
    floorPlanDrawAngleLockMode,
    floorPlanDrawRoomMode,
    floorPlanExactWallLengthInput,
    floorPlanTraceRoomMode,
    floorPlanTraceRoomPoints,
    floorPlanUnderlay,
    housePlanRooms: housePlan2D.rooms,
    isDesigner,
    setBlankGridRoomPreviewPoint,
    setFloorPlanTraceRoomPoints,
    applyResolvedWallDrawRoom: applyResolvedWallDrawRoomWithCompletion,
    applyTracedRoomRectangle: applyTracedRoomRectangleWithCompletion,
    showRuleToast,
  });

  const cancelActiveFloorPlanDraw = useCallback(() => {
    const openingDecision = resolveFloorPlanOpeningCancelDecision({
      traceOpeningMode: floorPlanTraceOpeningMode,
      pointCount: floorPlanTraceOpeningPoints.length,
    });

    if (openingDecision.shouldHandle) {
      if (openingDecision.clearOpeningPoints) setFloorPlanTraceOpeningPoints([]);
      if (openingDecision.exitOpeningMode) setFloorPlanTraceOpeningMode(false);
      return true;
    }

    const decision = resolveFloorPlanDrawCancelDecision({
      traceRoomMode: floorPlanTraceRoomMode,
      drawMode: floorPlanDrawRoomMode,
      pointCount: floorPlanTraceRoomPoints.length,
    });

    if (!decision.shouldHandle) return false;
    if (decision.clearRoomPoints) setFloorPlanTraceRoomPoints([]);
    if (decision.clearRoomPreview) setBlankGridRoomPreviewPoint(null);
    if (decision.exitRoomDrawMode) setFloorPlanTraceRoomMode(false);
    return true;
  }, [
    floorPlanDrawRoomMode,
    floorPlanTraceOpeningMode,
    floorPlanTraceOpeningPoints.length,
    floorPlanTraceRoomMode,
    floorPlanTraceRoomPoints.length,
    setBlankGridRoomPreviewPoint,
    setFloorPlanTraceOpeningMode,
    setFloorPlanTraceOpeningPoints,
    setFloorPlanTraceRoomMode,
    setFloorPlanTraceRoomPoints,
  ]);

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

      if (event.key === "Escape") {
        const cancelledDraw = cancelActiveFloorPlanDraw();
        const hasSelection =
          selectedPlanRoomId ||
          selectedPlanOverlayId ||
          selectedZoneId ||
          selectedIdsRef.current.size > 0;

        if (hasSelection) {
          clearAllSelection();
        }

        if (cancelledDraw || hasSelection) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && handleUndoFloorPlanTraceRoomPoint()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "v" || key === "s") {
        event.preventDefault();
        handleSelectFloorPlanTool();
      } else if (key === "r") {
        event.preventDefault();
        handleFloorPlanDrawRoomModeChange("rectangle_wall");
      } else if (key === "d" && !floorPlanTraceRoomMode) {
        event.preventDefault();
        handleAddFloorPlanOpeningFromTool("door");
      } else if (key === "w" && !floorPlanTraceRoomMode) {
        event.preventDefault();
        handleAddFloorPlanOpeningFromTool("window");
      } else if (key === "b") {
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
  }, [
    cancelActiveFloorPlanDraw,
    clearAllSelection,
    editorMode,
    floorPlanTraceRoomMode,
    handleAddFloorPlanOpeningFromTool,
    handleFloorPlanDrawRoomModeChange,
    handleFloorPlanTraceRoomModeChange,
    handleSelectFloorPlanTool,
    handleUndoFloorPlanTraceRoomPoint,
    isClientPreview,
    selectedPlanOverlayId,
    selectedPlanRoomId,
    selectedZoneId,
    viewMode,
  ]);

  const handleFloorPlanTraceOpeningModeChange = useCallback((enabled: boolean) => {
    activateFloorPlanOpeningTrace(enabled);
    if (enabled) {
      setViewMode("2d");
    }
  }, [activateFloorPlanOpeningTrace]);

  const handleResetFloorPlanTraceOpeningPoints = useCallback(() => {
    setFloorPlanTraceOpeningPoints([]);
  }, [setFloorPlanTraceOpeningPoints]);

  const completeConsumerOpeningPlacement = useCallback(() => {
    if (isDesigner) return;
    setFloorPlanTraceOpeningMode(false);
    setFloorPlanTraceOpeningPoints([]);
    setPlanFocusPanelRevealed(false);
    setDesignPanelOpen(true);
    emitConsumerPlanCompletion("opening");
  }, [
    emitConsumerPlanCompletion,
    isDesigner,
    setFloorPlanTraceOpeningMode,
    setFloorPlanTraceOpeningPoints,
  ]);

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

      const validation = validateTracedOpeningPlacement(
        opening,
        housePlan2D.rooms,
        planOpenings
      );
      if (!validation.valid) {
        setFloorPlanTraceOpeningPoints([]);
        showRuleToast(validation.label);
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
      handleSelectPlanOverlay(id);
      setFloorPlanTraceOpeningPoints([]);
      completeConsumerOpeningPlacement();
      showRuleToast(opening.kind === "door" ? "Door traced" : "Window traced");
      track("floor_plan_opening_traced", {
        kind: opening.kind,
        roomId: opening.roomId,
        wall: opening.wall,
        widthMm: opening.widthMm,
      });
    },
    [
      floorPlanTraceOpeningKind,
      floorPlanTraceOpeningPoints,
      completeConsumerOpeningPlacement,
      handleSelectPlanOverlay,
      housePlan2D.rooms,
      planOpenings,
      setFloorPlanTraceOpeningPoints,
      setPlanOpenings,
      showRuleToast,
    ]
  );

  const handleBlankGridTraceOpeningPoint = useCallback(
    (point: FloorPlanPoint) => {
      if (!floorPlanTraceOpeningMode || floorPlanUnderlay) return;

      const preview = resolveOpeningPlacementFromPoint(
        point,
        housePlan2D.rooms,
        floorPlanTraceOpeningKind,
        planOpenings
      );
      if (preview.status !== "valid" || !preview.opening) {
        showRuleToast(preview.label);
        return;
      }

      const opening = preview.opening;
      const id = `opening-${Date.now()}`;
      setPlanOpenings((prev) => [
        ...prev,
        {
          id,
          ...opening,
        },
      ]);
      handleSelectPlanOverlay(id);
      completeConsumerOpeningPlacement();
      showRuleToast(opening.kind === "door" ? "Door placed" : "Window placed");
      track("floor_plan_opening_placed", {
        kind: opening.kind,
        roomId: opening.roomId,
        wall: opening.wall,
        widthMm: opening.widthMm,
      });
    },
    [
      floorPlanTraceOpeningKind,
      floorPlanTraceOpeningMode,
      floorPlanUnderlay,
      completeConsumerOpeningPlacement,
      handleSelectPlanOverlay,
      housePlan2D.rooms,
      planOpenings,
      setPlanOpenings,
      showRuleToast,
    ]
  );

  const handleClearFloorPlanUnderlay = useCallback(() => {
    revokeFloorPlanUnderlayUrl();
    floorPlanPdfSourceDataRef.current = null;
    setFloorPlanPdfSourceReady(false);
    setFloorPlanUnderlay(null);
    resetFloorPlanInteraction();
  }, [
    resetFloorPlanInteraction,
    revokeFloorPlanUnderlayUrl,
    setFloorPlanPdfSourceReady,
    setFloorPlanUnderlay,
  ]);

  useEffect(() => {
    if (!sceneReady) return;

    if (viewMode === "2d") {
      if (!last3DViewRef.current) {
        last3DViewRef.current = cameraViewRef.current;
      }
      window.requestAnimationFrame(() => {
        applyPlan2DCameraView();
      });
      return;
    }

    if (last3DViewRef.current) {
      const restore = last3DViewRef.current;
      last3DViewRef.current = null;
      transitionToCameraView(restore, 420);
    }
  }, [applyPlan2DCameraView, sceneReady, transitionToCameraView, viewMode]);

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

  const activeRoomSavedViews = activeRoom?.savedViews ?? [];
  const activeRoomLayoutVersions = activeRoom?.layoutVersions ?? [];
  const latestManualLayoutVersion = activeRoomLayoutVersions.find(
    (version) => version.source === "manual" && version.name.toLowerCase().startsWith("before")
  ) ?? activeRoomLayoutVersions.find((version) => version.source === "manual") ?? null;

  const saveRoomLayoutVersion = useCallback(
    (
      requestedName?: string,
      source: LayoutVersion["source"] = "manual",
      roomId?: string,
      options: { showToast?: boolean } = {}
    ): LayoutVersion | null => {
      const snapshot = designSnapshotRef.current;
      const room = snapshot.rooms.find((entry) => entry.id === (roomId ?? snapshot.activeRoomId));
      if (!room) {
        if (options.showToast !== false) showRuleToast("Add a room before saving layouts");
        return null;
      }

      const name = requestedName?.trim() || `Layout ${(room.layoutVersions?.length ?? 0) + 1}`;
      const version = createLayoutVersion(room, { name, source });
      setDesignSnapshot((prev) => {
        const currentRoom = prev.rooms.find((entry) => entry.id === room.id);
        if (!currentRoom) return prev;
        return updateRoom(prev, appendLayoutVersion(currentRoom, version));
      });
      if (options.showToast !== false) showRuleToast(`${version.name} saved`);
      return version;
    },
    [showRuleToast]
  );

  const saveCurrentLayoutVersion = useCallback(() => {
    const saved = saveRoomLayoutVersion(layoutVersionNameInput, "manual", undefined, { showToast: true });
    if (saved) setLayoutVersionNameInput("");
  }, [layoutVersionNameInput, saveRoomLayoutVersion]);

  const restoreRoomLayoutVersion = useCallback(
    (versionId: string) => {
      const snapshot = designSnapshotRef.current;
      const room = getActiveRoom(snapshot);
      const version = room?.layoutVersions?.find((entry) => entry.id === versionId);
      if (!room || !version) {
        showRuleToast("Layout version not found");
        return;
      }

      history.begin(`Restore ${version.name}`);
      setDesignSnapshot((prev) => {
        const currentRoom = getActiveRoom(prev);
        const currentVersion = currentRoom?.layoutVersions?.find((entry) => entry.id === versionId);
        if (!currentRoom || !currentVersion) return prev;
        const beforeRestore = createLayoutVersion(currentRoom, {
          name: `Before ${currentVersion.name}`,
          source: "manual",
        });
        return updateRoom(
          prev,
          appendLayoutVersion(restoreLayoutVersion(currentRoom, currentVersion), beforeRestore)
        );
      });
      updateSelection(new Set(), null);
      history.commit();
      showRuleToast(`${version.name} restored`);
    },
    [history, showRuleToast, updateSelection]
  );

  const deleteRoomLayoutVersion = useCallback(
    (versionId: string) => {
      setDesignSnapshot((prev) => {
        const currentRoom = getActiveRoom(prev);
        if (!currentRoom) return prev;
        return updateRoom(prev, {
          ...currentRoom,
          layoutVersions: (currentRoom.layoutVersions ?? []).filter((entry) => entry.id !== versionId),
        });
      });
      showRuleToast("Layout version removed");
    },
    [showRuleToast]
  );

  const saveCurrentNamedView = useCallback(() => {
    const room = getActiveRoom(designSnapshotRef.current);
    if (!room) {
      showRuleToast("Add a room before saving camera views");
      return;
    }

    const fallbackName = `View ${(room.savedViews?.length ?? 0) + 1}`;
    const name = cameraViewNameInput.trim() || fallbackName;
    const savedView: SavedView = {
      id: `view-${Date.now()}`,
      name,
      cameraPosition: [...cameraView.pos],
      cameraTarget: [...cameraView.target],
      timestamp: Date.now(),
    };
    const nextRoomViews = [...(room.savedViews ?? []), savedView].slice(-6);
    const nextLegacyViews = nextRoomViews.map((view) => ({
      name: view.name,
      view: {
        pos: view.cameraPosition,
        target: view.cameraTarget,
        fov: cameraView.fov,
      },
    }));

    setDesignSnapshot((prev) => {
      const currentRoom = getActiveRoom(prev);
      if (!currentRoom) return prev;
      return updateRoom(prev, {
        ...currentRoom,
        savedViews: nextRoomViews,
      });
    });
    setSavedViews(nextLegacyViews);
    setCameraViewNameInput("");
    showRuleToast(`${name} saved`);
  }, [cameraView.fov, cameraView.pos, cameraView.target, cameraViewNameInput, showRuleToast]);

  const deleteSavedCameraView = useCallback(
    (viewId: string) => {
      const room = getActiveRoom(designSnapshotRef.current);
      if (!room) return;
      const nextRoomViews = (room.savedViews ?? []).filter((view) => view.id !== viewId);
      const nextLegacyViews = nextRoomViews.map((view) => ({
        name: view.name,
        view: {
          pos: view.cameraPosition,
          target: view.cameraTarget,
          fov: cameraView.fov,
        },
      }));

      setDesignSnapshot((prev) => {
        const currentRoom = getActiveRoom(prev);
        if (!currentRoom) return prev;
        return updateRoom(prev, {
          ...currentRoom,
          savedViews: nextRoomViews,
        });
      });
      setSavedViews(nextLegacyViews);
      showRuleToast("Camera view removed");
    },
    [cameraView.fov, showRuleToast]
  );

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

  const writeLocalDesignBackup = useCallback(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...getStoredDesignForPersistence(designSnapshot),
          savedViews,
          designId,
        })
      );
      setLastLocalAutosaveAt(Date.now());
      setLastLocalSaveError(null);
      return true;
    } catch (error) {
      setLastLocalSaveError(
        error instanceof Error ? error.message : "Local backup failed"
      );
      return false;
    }
  }, [designId, designSnapshot, getStoredDesignForPersistence, savedViews]);

  useEffect(() => {
    if (!localBackupHydrated) return;
    writeLocalDesignBackup();
  }, [localBackupHydrated, writeLocalDesignBackup]);

  useEffect(() => {
    if (!designId) return;
    let cancelled = false;
    setIsSaving(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/designs/${designId}`, {
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
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || `Autosave failed (${res.status})`);
        }
        if (!cancelled) {
          setLastDbSaveAt(Date.now());
          setLastCloudSaveError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLastCloudSaveError(error instanceof Error ? error.message : "Autosave failed");
        }
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
    const requestedRoles = plan.meta?.requestedRoles;
    const rugRequested = !requestedRoles || requestedRoles.includes("rug");
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

    if (sofaP && rugRequested) {
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
      showRuleToast("Starter layout unavailable. Please add items manually.");
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

  const buildLocalStarterPlan = (seedNum: number, requestedRoles?: AiLayoutRole[]) => {
    const all = Object.values(CATALOG_ITEMS);
    const styleNorm = String(style ?? "Modern").toLowerCase();
    const budgetNorm = String(budget ?? "$$");
    const normalizedRequestedRoles = Array.from(
      new Set<AiLayoutRole>(["sofa", "coffee_table", ...(requestedRoles ?? [])])
    );
    const roleRequested = (role: AiLayoutRole) => normalizedRequestedRoles.includes(role);

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
        rug: roleRequested("rug") ? pickLocalByCategory("rug", 22)?.id : null,
        coffee_table: pickLocalByCategory("coffee_table", 33)?.id,
        tv_console:
          roleRequested("tv_console")
            ? pickLocalByCategory("tv_console", 44)?.id ??
              pickLocalByCategory("sideboard", 444)?.id ??
              null
            : null,
        accent_chair: roleRequested("accent_chair")
          ? pickLocalByCategory("accent_chair", 55)?.id ?? null
          : null,
        floor_lamp: roleRequested("floor_lamp")
          ? pickLocalByCategory("floor_lamp", 66)?.id ?? null
          : null,
      },
      meta: {
        style: styleNorm,
        budget: budgetNorm,
        seed: seedNum,
        source: "local_fallback",
        requestedRoles: normalizedRequestedRoles,
      },
    };
  };

  const runAiLayout = async ({
    nextSeed,
    requestedRoles,
  }: {
    nextSeed?: number;
    requestedRoles?: AiLayoutRole[];
  } = {}) => {
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
      const fallback = buildLocalStarterPlan(seedToUse, requestedRoles);
      const hasCoreStarter = Boolean(fallback.picks.sofa && fallback.picks.coffee_table);
      if (!hasCoreStarter) {
        showRuleToast(reason || "Starter layout unavailable. Please add items manually.");
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
      const requiredRoles: Array<"sofa" | "coffee_table"> = ["sofa", "coffee_table"];

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
      coffee_table: catalogList.filter((p) =>
        catalogMatchesAiLayoutRole("coffee_table", p.category)
      ).length,
    };

    if (!requiredCategoryCounts.sofa || !requiredCategoryCounts.coffee_table) {
      const reasons: string[] = [];
      if (!requiredCategoryCounts.sofa) reasons.push("no live-approved sofa available");
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
          requestedRoles,
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
    variantId?: string,
    overrides: Partial<
      Pick<
        PlacedItem,
        | "qty"
        | "includeInCheckout"
        | "purchaseOptionId"
        | "bundleGroupId"
        | "bundleRole"
        | "bundleQuantity"
      >
    > = {}
  ) => {
    const product = CATALOG_ITEMS[productId];
    if (!product) return;

    const resolved = resolveCatalogVariant(product, variantId ?? product.defaultVariantId);
    const instanceId = newInstanceId();
    const [safeX, safeZ] = clampToActiveRoom(
      position[0],
      position[2],
      resolved.dimsMm.w / 1000,
      resolved.dimsMm.d / 1000,
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
          variantId: resolved.variantId,
          position: [safeX, position[1], safeZ],
          rotationY,
          qty: 1,
          includeInCheckout: true,
          ...overrides,
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

  const catalogPlacementCollides = useCallback(
    (
      productId: string,
      position: [number, number, number],
      rotationY: number,
      dimsMm: { w: number; d: number }
    ) => {
      return doesCatalogPlacementCollide({
        productId,
        position,
        rotationY,
        dimsMm,
        items: itemsRef.current,
        getItemAABB,
      });
    },
    [getItemAABB]
  );

  const catalogPlacementCollidesAgainst = useCallback(
    (
      productId: string,
      position: [number, number, number],
      rotationY: number,
      dimsMm: { w: number; d: number },
      candidateItems: PlacedItem[]
    ) => {
      return doesCatalogPlacementCollide({
        productId,
        position,
        rotationY,
        dimsMm,
        items: candidateItems,
        getItemAABB,
      });
    },
    [getItemAABB]
  );

  const clampToCatalogPlacementRoom = useCallback(
    (
      room: RoomSnapshot,
      x: number,
      z: number,
      itemWidth: number,
      itemDepth: number,
      rotationY: number = 0
    ) =>
      clampToRoom(
        x,
        z,
        itemWidth,
        itemDepth,
        room.geometry.width,
        room.geometry.depth,
        room.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness,
        rotationY,
        room.planShape ?? "rectangle",
        room.planPolygon
      ),
    []
  );

  const catalogPlacementCollidesInRoom = useCallback(
    (
      room: RoomSnapshot,
      productId: string,
      position: [number, number, number],
      rotationY: number,
      dimsMm: { w: number; d: number }
    ) =>
      doesCatalogPlacementCollide({
        productId,
        position,
        rotationY,
        dimsMm,
        items: room.items,
        getItemAABB,
      }),
    [getItemAABB]
  );

  const findCatalogPlacementBlockerInRoom = useCallback(
    (
      room: RoomSnapshot,
      productId: string,
      position: [number, number, number],
      rotationY: number,
      dimsMm: { w: number; d: number },
      excludedInstanceId?: string
    ) =>
      findCatalogPlacementCollision({
        productId,
        position,
        rotationY,
        dimsMm,
        items: room.items,
        getItemAABB,
        excludedInstanceId,
      }),
    [getItemAABB]
  );

  const getItemDisplayName = useCallback((item: DesignItem | null | undefined) => {
    if (!item) return null;
    return CATALOG_ITEMS[item.productId]?.title ?? "another item";
  }, []);

  const commitItemsToRoom = useCallback(
    (
      roomId: string,
      updater: PlacedItem[] | ((prev: PlacedItem[]) => PlacedItem[]),
      actionName: string = "Edit",
      options: { activateRoom?: boolean; beforeLayoutVersion?: LayoutVersion } = {}
    ): PlacedItem[] | null => {
      const snapshot = designSnapshotRef.current;
      const room = snapshot.rooms.find((entry) => entry.id === roomId);
      if (!room) return null;

      history.begin(actionName);
      const nextItems = typeof updater === "function" ? updater(room.items) : updater;
      const { valid: validItems, invalid } = reconcileCart(nextItems, CATALOG_ITEMS_MAP);

      if (invalid.length > 0) {
        console.warn(`Removed ${invalid.length} invalid items from cart`);
        track("commerce_invalid_items_removed", {
          count: invalid.length,
          items: invalid,
        });
      }

      const nextSnapshot = {
        ...snapshot,
        activeRoomId: options.activateRoom ? room.id : snapshot.activeRoomId,
        rooms: snapshot.rooms.map((entry) =>
          entry.id === room.id
            ? {
                ...entry,
                items: validItems,
                layoutVersions: options.beforeLayoutVersion
                  ? appendLayoutVersion(entry, options.beforeLayoutVersion).layoutVersions
                  : entry.layoutVersions,
              }
            : entry
        ),
      };

      if (nextSnapshot.activeRoomId === room.id) {
        itemsRef.current = validItems;
      }
      setDesignSnapshot(nextSnapshot);
      history.commit();
      return validItems;
    },
    [history]
  );

  const transferItemToRoom = useCallback(
    (
      instanceId: string,
      sourceRoomId: string,
      targetRoom: RoomSnapshot,
      worldPosition: [number, number, number]
    ): boolean => {
      if (sourceRoomId === targetRoom.id) return false;

      const snapshot = designSnapshotRef.current;
      const sourceRoom = snapshot.rooms.find((room) => room.id === sourceRoomId);
      const sourcePlanRoom = houseRoomById.get(sourceRoomId);
      const targetPlanRoom = houseRoomById.get(targetRoom.id);
      if (!sourceRoom || !sourcePlanRoom || !targetPlanRoom) return false;

      const item = sourceRoom.items.find((entry) => entry.instanceId === instanceId);
      if (!item) return false;
      const product = CATALOG_ITEMS[item.productId];
      if (!product) return false;

      const configuredDims = resolveConfiguredPlanningDimsMm(item, product);
      const localTargetPosition: [number, number, number] = [
        worldPosition[0] - targetPlanRoom.x,
        worldPosition[1] ?? 0,
        worldPosition[2] - targetPlanRoom.z,
      ];
      const [safeX, safeZ] = clampToCatalogPlacementRoom(
        targetRoom,
        localTargetPosition[0],
        localTargetPosition[2],
        configuredDims.w / 1000,
        configuredDims.d / 1000,
        item.rotationY ?? 0
      );
      const movedItem: PlacedItem = {
        ...item,
        position: [safeX, localTargetPosition[1], safeZ],
      };

      const blocker = findCatalogPlacementBlockerInRoom(
        targetRoom,
        movedItem.productId,
        movedItem.position,
        movedItem.rotationY ?? 0,
        configuredDims
      );
      if (blocker) {
        showRuleToast(`Blocked by ${getItemDisplayName(blocker) ?? "another item"}`);
        return false;
      }

      const sourceItems = sourceRoom.items.filter((entry) => entry.instanceId !== instanceId);
      const sourceZones = sourceRoom.zones
        .map((zone) => ({
          ...zone,
          itemIds: zone.itemIds.filter((itemId) => itemId !== instanceId),
        }))
        .filter((zone) => zone.itemIds.length > 0);
      const targetItems = [...targetRoom.items, movedItem];

      if (dragCommitRef.current) {
        history.commit();
        dragCommitRef.current = false;
      }
      history.begin(`Move item to ${targetRoom.name}`);
      const nextSnapshot = {
        ...snapshot,
        activeRoomId: targetRoom.id,
        rooms: snapshot.rooms.map((room) => {
          if (room.id === sourceRoom.id) {
            return { ...room, items: sourceItems, zones: sourceZones };
          }
          if (room.id === targetRoom.id) {
            return { ...room, items: targetItems };
          }
          return room;
        }),
      };
      itemsRef.current = targetItems;
      setDesignSnapshot(nextSnapshot);
      history.commit();
      updateSelection(new Set([instanceId]), instanceId);
      showRuleToast(`Moved to ${targetRoom.name}`);
      setUndoToast({ label: `Moved to ${targetRoom.name}` });
      return true;
    },
    [
      clampToCatalogPlacementRoom,
      findCatalogPlacementBlockerInRoom,
      getItemDisplayName,
      history,
      houseRoomById,
      resolveConfiguredPlanningDimsMm,
      showRuleToast,
      updateSelection,
    ]
  );

  const findBundleCompanionPlacement = useCallback(
    (
      targetRoom: RoomSnapshot,
      productId: string,
      variantId: string,
      position: [number, number, number],
      rotationY: number,
      candidateItems: PlacedItem[]
    ): [number, number, number] | null => {
      const product = CATALOG_ITEMS[productId];
      if (!product) return null;
      const resolved = resolveCatalogVariant(product, variantId);
      const widthMeters = resolved.dimsMm.w / 1000;
      const depthMeters = resolved.dimsMm.d / 1000;
      const spacing = Math.max(0.75, Math.max(widthMeters, depthMeters) + 0.3);
      const side: [number, number] = [Math.cos(rotationY), -Math.sin(rotationY)];
      const front: [number, number] = [Math.sin(rotationY), Math.cos(rotationY)];
      const offsets: [number, number][] = [
        [side[0] * spacing, side[1] * spacing],
        [-side[0] * spacing, -side[1] * spacing],
        [front[0] * spacing, front[1] * spacing],
        [-front[0] * spacing, -front[1] * spacing],
      ];

      for (const [offsetX, offsetZ] of offsets) {
        const [safeX, safeZ] = clampToCatalogPlacementRoom(
          targetRoom,
          position[0] + offsetX,
          position[2] + offsetZ,
          widthMeters,
          depthMeters,
          rotationY
        );
        const candidatePosition: [number, number, number] = [safeX, position[1], safeZ];
        if (
          !catalogPlacementCollidesAgainst(
            productId,
            candidatePosition,
            rotationY,
            resolved.dimsMm,
            candidateItems
          )
        ) {
          return candidatePosition;
        }
      }

      return null;
    },
    [
      catalogPlacementCollidesAgainst,
      clampToCatalogPlacementRoom,
    ]
  );

  const addCatalogPlacementToRoom = useCallback(
    (placement: PendingCatalogPlacement): boolean => {
      const product = CATALOG_ITEMS[placement.productId];
      if (!product) return false;
      const targetRoomId = placement.roomId ?? designSnapshotRef.current.activeRoomId;
      const targetRoom = designSnapshotRef.current.rooms.find((room) => room.id === targetRoomId);
      if (!targetRoom) return false;
      const resolved = resolveCatalogVariant(product, placement.variantId);
      const purchaseOption = placement.purchaseOptionId
        ? resolved.variant.purchaseOptions?.find((option) => option.id === placement.purchaseOptionId) ?? null
        : null;
      const bundleQuantity = purchaseOption?.quantity ?? 1;

      if (bundleQuantity <= 1) {
        const instanceId = newInstanceId();
        const [safeX, safeZ] = clampToCatalogPlacementRoom(
          targetRoom,
          placement.position[0],
          placement.position[2],
          resolved.dimsMm.w / 1000,
          resolved.dimsMm.d / 1000,
          placement.rotationY
        );
        const nextItem: PlacedItem = {
          instanceId,
          productId: placement.productId,
          variantId: resolved.variantId,
          position: [safeX, placement.position[1], safeZ],
          rotationY: placement.rotationY,
          qty: 1,
          includeInCheckout: true,
          purchaseOptionId: purchaseOption?.id,
        };
        const nextItems = commitItemsToRoom(
          targetRoom.id,
          (prev) => [...prev, nextItem],
          `Add ${product.title || "Item"}`,
          { activateRoom: true }
        );
        if (!nextItems) return false;
        updateSelection(new Set([instanceId]), instanceId);
        return true;
      }

      const bundleGroupId = newInstanceId();
      const primaryId = newInstanceId();
      const companionId = newInstanceId();
      const primaryItem: PlacedItem = {
        instanceId: primaryId,
        productId: placement.productId,
        variantId: resolved.variantId,
        position: placement.position,
        rotationY: placement.rotationY,
        qty: 1,
        includeInCheckout: true,
        purchaseOptionId: purchaseOption?.id,
        bundleGroupId,
        bundleRole: "primary",
        bundleQuantity,
      };
      const companionPosition = findBundleCompanionPlacement(
        targetRoom,
        placement.productId,
        resolved.variantId,
        placement.position,
        placement.rotationY,
        [...targetRoom.items, primaryItem]
      );
      if (!companionPosition) {
        showRuleToast(
          `Set of ${bundleQuantity} needs space for both chairs. Move an item or choose Single.`
        );
        return false;
      }

      const companionItem: PlacedItem = {
        ...primaryItem,
        instanceId: companionId,
        position: companionPosition,
        includeInCheckout: false,
        bundleRole: "component",
      };

      const nextItems = commitItemsToRoom(
        targetRoom.id,
        (prev) => [...prev, primaryItem, companionItem],
        `Add ${product.title} set`,
        { activateRoom: true }
      );
      if (!nextItems) return false;
      updateSelection(new Set([primaryId, companionId]), primaryId);
      showRuleToast(`Added official ${purchaseOption?.label ?? `set of ${bundleQuantity}`} to room`);
      return true;
    },
    [
      clampToCatalogPlacementRoom,
      commitItemsToRoom,
      findBundleCompanionPlacement,
      newInstanceId,
      showRuleToast,
      updateSelection,
    ]
  );

  const updatePendingCatalogPlacementDraft = useCallback(
    (
      placement: PendingCatalogPlacement,
      rawPosition: [number, number, number],
      rotationY: number,
      fallbackReason: string,
      targetRoom?: RoomSnapshot | null
    ): PendingCatalogPlacement | null => {
      const placementRoom =
        targetRoom ??
        roomSnapshotById.get(placement.roomId ?? designSnapshotRef.current.activeRoomId) ??
        activeRoom;
      if (!placementRoom) return null;

      return resolvePendingCatalogPlacementDraft({
        placement: {
          ...placement,
          roomId: placementRoom.id,
        },
        rawPosition,
        rotationY,
        fallbackReason,
        roomWidth: placementRoom.geometry.width,
        roomDepth: placementRoom.geometry.depth,
        wallThickness: placementRoom.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness,
        clampToActiveRoom: (
          x,
          z,
          itemWidth,
          itemDepth,
          _targetRoomWidth,
          _targetRoomDepth,
          _targetWallThickness,
          nextRotationY
        ) =>
          clampToCatalogPlacementRoom(
            placementRoom,
            x,
            z,
            itemWidth,
            itemDepth,
            nextRotationY
          ),
      });
    },
    [activeRoom, clampToCatalogPlacementRoom, roomSnapshotById]
  );

  const pendingCatalogPlacementBlocked = useMemo(() => {
    if (!pendingCatalogPlacement) return false;
    const product = CATALOG_ITEMS[pendingCatalogPlacement.productId];
    if (!product) return true;
    const targetRoom =
      pendingCatalogPlacement.roomId
        ? roomSnapshotById.get(pendingCatalogPlacement.roomId)
        : activeRoom;
    if (!targetRoom) return true;
    const resolved = resolveCatalogVariant(product, pendingCatalogPlacement.variantId);
    return catalogPlacementCollidesInRoom(
      targetRoom,
      pendingCatalogPlacement.productId,
      pendingCatalogPlacement.position,
      pendingCatalogPlacement.rotationY,
      resolved.dimsMm
    );
  }, [activeRoom, catalogPlacementCollidesInRoom, pendingCatalogPlacement, roomSnapshotById]);
  const pendingCatalogPlacementBlocker = useMemo(() => {
    if (!pendingCatalogPlacement) return null;
    const product = CATALOG_ITEMS[pendingCatalogPlacement.productId];
    const targetRoom =
      pendingCatalogPlacement.roomId
        ? roomSnapshotById.get(pendingCatalogPlacement.roomId)
        : activeRoom;
    if (!product || !targetRoom) return null;
    const resolved = resolveCatalogVariant(product, pendingCatalogPlacement.variantId);
    return findCatalogPlacementBlockerInRoom(
      targetRoom,
      pendingCatalogPlacement.productId,
      pendingCatalogPlacement.position,
      pendingCatalogPlacement.rotationY,
      resolved.dimsMm
    );
  }, [
    activeRoom,
    findCatalogPlacementBlockerInRoom,
    pendingCatalogPlacement,
    roomSnapshotById,
  ]);
  const pendingCatalogPlacementBlockerLabel = useMemo(() => {
    if (!pendingCatalogPlacementBlocker) return null;
    return getItemDisplayName(pendingCatalogPlacementBlocker);
  }, [getItemDisplayName, pendingCatalogPlacementBlocker]);
  const restorableCatalogPlacement = useMemo(() => {
    if (!pendingCatalogPlacement || !lastValidCatalogPlacement) return null;
    if (pendingCatalogPlacement.productId !== lastValidCatalogPlacement.productId) return null;
    if (pendingCatalogPlacement.variantId !== lastValidCatalogPlacement.variantId) return null;
    if (pendingCatalogPlacement.purchaseOptionId !== lastValidCatalogPlacement.purchaseOptionId) return null;
    const distance = Math.hypot(
      pendingCatalogPlacement.position[0] - lastValidCatalogPlacement.position[0],
      pendingCatalogPlacement.position[2] - lastValidCatalogPlacement.position[2]
    );
    const rotationDelta = Math.abs(
      pendingCatalogPlacement.rotationY - lastValidCatalogPlacement.rotationY
    );
    if (distance < 0.08 && rotationDelta < 0.01) return null;
    return lastValidCatalogPlacement;
  }, [lastValidCatalogPlacement, pendingCatalogPlacement]);
  const pendingCatalogPlacementScore = useMemo<ManualPlacementScore | null>(() => {
    if (!pendingCatalogPlacement) return null;
    const product = CATALOG_ITEMS[pendingCatalogPlacement.productId];
    const targetRoom =
      pendingCatalogPlacement.roomId
        ? roomSnapshotById.get(pendingCatalogPlacement.roomId)
        : activeRoom;
    if (!product || !targetRoom) return null;
    const resolved = resolveCatalogVariant(product, pendingCatalogPlacement.variantId);
    return scoreManualPlacement({
      room: targetRoom,
      item: {
        instanceId: "pending-catalog-placement",
        productId: pendingCatalogPlacement.productId,
        variantId: resolved.variantId,
        position: pendingCatalogPlacement.position,
        rotationY: pendingCatalogPlacement.rotationY,
      },
      dimsMm: resolved.dimsMm,
      catalogItems: CATALOG_ITEMS,
      openings: planOpenings,
      blocker: pendingCatalogPlacementBlocker,
      variant: resolved.variant,
      existingItems: targetRoom.items,
    });
  }, [
    activeRoom,
    pendingCatalogPlacement,
    pendingCatalogPlacementBlocker,
    planOpenings,
    roomSnapshotById,
  ]);
  const isCatalogPlacementTargetAcceptable = useCallback(
    (placement: PendingCatalogPlacement, targetRoom: RoomSnapshot): boolean => {
      const product = CATALOG_ITEMS[placement.productId];
      if (!product) return false;
      const resolved = resolveCatalogVariant(product, placement.variantId);
      if (
        catalogPlacementCollidesInRoom(
          targetRoom,
          placement.productId,
          placement.position,
          placement.rotationY,
          resolved.dimsMm
        )
      ) {
        return false;
      }
      const score = scoreManualPlacement({
        room: targetRoom,
        item: {
          instanceId: "catalog-placement-target-check",
          productId: placement.productId,
          variantId: resolved.variantId,
          position: placement.position,
          rotationY: placement.rotationY,
        },
        dimsMm: resolved.dimsMm,
        catalogItems: CATALOG_ITEMS,
        openings: planOpenings,
        variant: resolved.variant,
        existingItems: targetRoom.items,
      });
      return score.kind !== "blocks_path" && score.kind !== "cramped";
    },
    [catalogPlacementCollidesInRoom, planOpenings]
  );
  const hoverCatalogPlacementScore = useMemo<ManualPlacementScore | null>(() => {
    if (!hoverCatalogPlacement || pendingCatalogPlacement) return null;
    const product = CATALOG_ITEMS[hoverCatalogPlacement.productId];
    const targetRoom =
      hoverCatalogPlacement.roomId
        ? roomSnapshotById.get(hoverCatalogPlacement.roomId)
        : activeRoom;
    if (!product || !targetRoom) return null;
    const resolved = resolveCatalogVariant(product, hoverCatalogPlacement.variantId);
    const blocker = findCatalogPlacementBlockerInRoom(
      targetRoom,
      hoverCatalogPlacement.productId,
      hoverCatalogPlacement.position,
      hoverCatalogPlacement.rotationY,
      resolved.dimsMm
    );
    return scoreManualPlacement({
      room: targetRoom,
      item: {
        instanceId: "hover-catalog-placement",
        productId: hoverCatalogPlacement.productId,
        variantId: resolved.variantId,
        position: hoverCatalogPlacement.position,
        rotationY: hoverCatalogPlacement.rotationY,
      },
      dimsMm: resolved.dimsMm,
      catalogItems: CATALOG_ITEMS,
      openings: planOpenings,
      blocker,
      variant: resolved.variant,
      existingItems: targetRoom.items,
    });
  }, [
    activeRoom,
    findCatalogPlacementBlockerInRoom,
    hoverCatalogPlacement,
    pendingCatalogPlacement,
    planOpenings,
    roomSnapshotById,
  ]);
  const activePlacementCompatibleZoneIds = useMemo(
    () =>
      new Set(
        pendingCatalogPlacementScore?.compatibleZoneIds ??
          hoverCatalogPlacementScore?.compatibleZoneIds ??
          []
      ),
    [hoverCatalogPlacementScore, pendingCatalogPlacementScore]
  );
  const circulationHeatmap = useMemo(() => {
    const placement = pendingCatalogPlacement ?? hoverCatalogPlacement;
    if (!placement) return null;
    const targetRoom =
      placement.roomId
        ? roomSnapshotById.get(placement.roomId)
        : activeRoom;
    const planRoom = placement.roomId ? houseRoomById.get(placement.roomId) : null;
    if (!targetRoom) return null;
    const product = CATALOG_ITEMS[placement.productId];
    if (!product) return null;
    const resolved = resolveCatalogVariant(product, placement.variantId);
    const analysis = computeCirculationAnalysis({
      room: targetRoom,
      items: [
        ...targetRoom.items,
        {
          instanceId: "placement-circulation-preview",
          productId: placement.productId,
          variantId: resolved.variantId,
          position: placement.position,
          rotationY: placement.rotationY,
        } as DesignItem,
      ],
      catalogItems: CATALOG_ITEMS,
      openings: planOpenings,
      zones: targetRoom.zones,
    });
    const shouldShow =
      pendingCatalogPlacementScore?.kind === "blocks_path" ||
      hoverCatalogPlacementScore?.kind === "blocks_path" ||
      analysis.warnings.length > 0;
    if (!shouldShow) return null;
    return {
      roomOffset: { x: planRoom?.x ?? 0, z: planRoom?.z ?? 0 },
      analysis,
    };
  }, [
    activeRoom,
    hoverCatalogPlacement,
    hoverCatalogPlacementScore?.kind,
    houseRoomById,
    pendingCatalogPlacement,
    pendingCatalogPlacementScore?.kind,
    planOpenings,
    roomSnapshotById,
  ]);
  const pendingCatalogPlacementQuality = useMemo(() => {
    if (!pendingCatalogPlacement) return null;
    if (pendingCatalogPlacementScore) {
      return {
        label: `${pendingCatalogPlacementScore.label} (${pendingCatalogPlacementScore.score})`,
        tone:
          pendingCatalogPlacementScore.kind === "great"
            ? ("good" as const)
            : pendingCatalogPlacementScore.kind === "okay"
              ? ("warn" as const)
              : ("bad" as const),
      };
    }
    if (pendingCatalogPlacementBlocked) {
      return {
        label: pendingCatalogPlacementBlockerLabel
          ? `Blocked by ${pendingCatalogPlacementBlockerLabel}`
          : "Blocked",
        tone: "bad" as const,
      };
    }
    const targetRoom =
      pendingCatalogPlacement.roomId
        ? roomSnapshotById.get(pendingCatalogPlacement.roomId)
        : activeRoom;
    const product = CATALOG_ITEMS[pendingCatalogPlacement.productId];
    if (!targetRoom || !product) return null;
    const resolved = resolveCatalogVariant(product, pendingCatalogPlacement.variantId);
    const [effectiveWidth, effectiveDepth] = getRotatedFootprint(
      resolved.dimsMm.w / 1000,
      resolved.dimsMm.d / 1000,
      pendingCatalogPlacement.rotationY
    );
    const wallThickness =
      targetRoom.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness;
    const clearX =
      targetRoom.geometry.width / 2 -
      wallThickness -
      effectiveWidth / 2 -
      Math.abs(pendingCatalogPlacement.position[0]);
    const clearZ =
      targetRoom.geometry.depth / 2 -
      wallThickness -
      effectiveDepth / 2 -
      Math.abs(pendingCatalogPlacement.position[2]);
    const nearestClearance = Math.min(clearX, clearZ);
    const topCategory = mapToTopCategory(product.category, product);
    const zoneFit =
      targetRoom.zones.length === 0 ||
      (topCategory === "dining_table" || topCategory === "dining_bench"
        ? targetRoom.zones.some((zone) => zone.type === "dining")
        : topCategory === "tv_console"
          ? targetRoom.zones.some((zone) => zone.type === "tv")
          : true);
    if (nearestClearance < 0.12) {
      return { label: "Tight to wall", tone: "warn" as const };
    }
    if (!zoneFit) {
      return { label: "No matching zone", tone: "warn" as const };
    }
    return {
      label: nearestClearance > 0.55 ? "Good spacing" : "Usable spacing",
      tone: "good" as const,
    };
  }, [
    activeRoom,
    pendingCatalogPlacement,
    pendingCatalogPlacementBlocked,
    pendingCatalogPlacementBlockerLabel,
    pendingCatalogPlacementScore,
    roomSnapshotById,
  ]);

  const rotatePendingCatalogPlacement = useCallback(
    (direction: "left" | "right") => {
      setPendingCatalogPlacement((prev) => {
        if (!prev) return prev;
        const delta = direction === "left" ? Math.PI / 2 : -Math.PI / 2;
        const fullTurn = Math.PI * 2;
        const nextRotation = ((prev.rotationY + delta) % fullTurn + fullTurn) % fullTurn;
        return updatePendingCatalogPlacementDraft(
          prev,
          prev.position,
          nextRotation,
          "Rotated preview"
        );
      });
    },
    [updatePendingCatalogPlacementDraft]
  );

  const handleCatalogPlacementPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!pendingCatalogPlacement) return;
      event.stopPropagation();
      (event.target as unknown as HTMLElement).setPointerCapture?.(event.pointerId);
      setCatalogPlacementDragging(true);
      setSofaDragging(true);
    },
    [pendingCatalogPlacement]
  );

  const handleCatalogPlacementPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!catalogPlacementDragging || !pendingCatalogPlacement) return;
      event.stopPropagation();
      nudgeWholeHomeCameraForDrag(event);
      const pointerRoom = findPlanRoomAtWorldPoint(event.point.x, event.point.z);
      const targetRoomId =
        pointerRoom?.id ?? pendingCatalogPlacement.roomId ?? designSnapshot.activeRoomId;
      const planRoom = houseRoomById.get(targetRoomId);
      const targetRoom = roomSnapshotById.get(targetRoomId) ?? activeRoom;
      if (!targetRoom) return;
      const nextPlacement = updatePendingCatalogPlacementDraft(
        {
          ...pendingCatalogPlacement,
          roomId: targetRoom.id,
        },
        [
          event.point.x - (planRoom?.x ?? 0),
          0,
          event.point.z - (planRoom?.z ?? 0),
        ],
        pendingCatalogPlacement.rotationY,
        pointerRoom && pointerRoom.id !== pendingCatalogPlacement.roomId
          ? `Moved to ${targetRoom.name}`
          : "Custom placement",
        targetRoom
      );
      if (nextPlacement) {
        setPendingCatalogPlacement(nextPlacement);
        const acceptable = isCatalogPlacementTargetAcceptable(nextPlacement, targetRoom);
        setCrossRoomDragTarget({
          roomId: targetRoom.id,
          label: targetRoom.name,
          valid: acceptable,
          kind: "preview",
        });
      }
    },
    [
      activeRoom,
      catalogPlacementDragging,
      designSnapshot.activeRoomId,
      findPlanRoomAtWorldPoint,
      houseRoomById,
      isCatalogPlacementTargetAcceptable,
      nudgeWholeHomeCameraForDrag,
      pendingCatalogPlacement,
      roomSnapshotById,
      updatePendingCatalogPlacementDraft,
    ]
  );

  const handleCatalogPlacementPointerUp = useCallback((event?: ThreeEvent<PointerEvent>) => {
    event?.stopPropagation();
    if (event?.target) {
      (event.target as unknown as HTMLElement).releasePointerCapture?.(event.pointerId);
    }
    setCatalogPlacementDragging(false);
    setSofaDragging(false);
  }, []);

  const buildCatalogPlacementPreview = useCallback(
    (
      productId: string,
      variantId?: string,
      purchaseOptionId?: string
    ): PendingCatalogPlacement | null => {
      return resolveCatalogPlacementPreview({
        productId,
        variantId,
        purchaseOptionId,
        canPlace: Boolean(activeRoom),
        roomWidth,
        roomDepth,
        wallThickness,
        clampToActiveRoom,
        collides: catalogPlacementCollides,
      });
    },
    [
      activeRoom,
      catalogPlacementCollides,
      clampToActiveRoom,
      roomDepth,
      roomWidth,
      wallThickness,
    ]
  );

  const findSmartCatalogPlacement = useCallback(
    (
      productId: string,
      variantId?: string,
      purchaseOptionId?: string,
      targetRoom: RoomSnapshot | null = activeRoom
    ): PendingCatalogPlacement | null => {
      const product = CATALOG_ITEMS[productId];
      if (!product || !targetRoom) return null;
      const resolved = resolveCatalogVariant(product, variantId ?? product.defaultVariantId);
      const widthMeters = resolved.dimsMm.w / 1000;
      const depthMeters = resolved.dimsMm.d / 1000;
      const targetWidth = targetRoom.geometry.width;
      const targetDepth = targetRoom.geometry.depth;
      const targetWallThickness =
        targetRoom.geometry.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness;
      const [effectiveWidth, effectiveDepth] = getRotatedFootprint(widthMeters, depthMeters, 0);
      const inset = Math.max(0.2, targetWallThickness + 0.18);
      const maxX = Math.max(0, targetWidth / 2 - effectiveWidth / 2 - inset);
      const maxZ = Math.max(0, targetDepth / 2 - effectiveDepth / 2 - inset);
      const topCategory = mapToTopCategory(product.category, product);
      const wallFirst = new Set(["sofa", "tv_console", "sideboard", "floor_lamp", "dining_bench"]);
      const preferredZoneTypes: Zone["type"][] =
        topCategory === "dining_table" || topCategory === "dining_bench" || topCategory === "sideboard"
          ? ["dining"]
          : topCategory === "tv_console"
            ? ["tv"]
            : topCategory === "floor_lamp" || topCategory === "accent_chair" || topCategory === "side_table"
              ? ["seating", "reading"]
              : topCategory === "sofa" || topCategory === "coffee_table" || topCategory === "rug"
                ? ["seating"]
                : [];
      const zoneCandidates = targetRoom.zones
        .filter((zone) => preferredZoneTypes.includes(zone.type) && zone.anchor)
        .map((zone) => ({
          x: zone.anchor?.[0] ?? 0,
          z: zone.anchor?.[2] ?? 0,
          rotationY: 0,
          reason:
            zone.type === "dining"
              ? "Auto placed in dining zone"
              : zone.type === "tv"
                ? "Auto placed in TV zone"
                : zone.type === "reading"
                  ? "Auto placed in reading zone"
                  : "Auto placed in seating zone",
        }));
      const candidates: Array<{ x: number; z: number; rotationY: number; reason: string }> = [
        ...zoneCandidates,
        { x: 0, z: 0, rotationY: 0, reason: "Auto placed at room center" },
        { x: 0, z: -maxZ, rotationY: 0, reason: "Auto placed near back wall" },
        { x: 0, z: maxZ, rotationY: Math.PI, reason: "Auto placed near front wall" },
        { x: -maxX, z: 0, rotationY: Math.PI / 2, reason: "Auto placed near left wall" },
        { x: maxX, z: 0, rotationY: -Math.PI / 2, reason: "Auto placed near right wall" },
      ];

      const gridSteps = 5;
      for (let xIndex = 0; xIndex < gridSteps; xIndex += 1) {
        for (let zIndex = 0; zIndex < gridSteps; zIndex += 1) {
          const x = maxX === 0 ? 0 : -maxX + (maxX * 2 * xIndex) / (gridSteps - 1);
          const z = maxZ === 0 ? 0 : -maxZ + (maxZ * 2 * zIndex) / (gridSteps - 1);
          candidates.push({ x, z, rotationY: 0, reason: "Auto found open floor space" });
          candidates.push({ x, z, rotationY: Math.PI / 2, reason: "Auto found open rotated space" });
        }
      }

      const orderedCandidates = wallFirst.has(topCategory)
        ? [...candidates.slice(1, 5), candidates[0], ...candidates.slice(5)]
        : candidates;

      let bestPlacement: PendingCatalogPlacement | null = null;
      let bestScore = -Infinity;
      for (const candidate of orderedCandidates) {
        const [safeX, safeZ] = clampToCatalogPlacementRoom(
          targetRoom,
          candidate.x,
          candidate.z,
          widthMeters,
          depthMeters,
          candidate.rotationY
        );
        const position: [number, number, number] = [safeX, 0, safeZ];
        if (
          catalogPlacementCollidesInRoom(
            targetRoom,
            productId,
            position,
            candidate.rotationY,
            resolved.dimsMm
          )
        ) {
          continue;
        }
        const placement: PendingCatalogPlacement = {
          productId,
          variantId: resolved.variantId,
          purchaseOptionId,
          roomId: targetRoom.id,
          position,
          rotationY: candidate.rotationY,
          reason: candidate.reason,
        };
        const score = scoreManualPlacement({
          room: targetRoom,
          item: {
            instanceId: "smart-catalog-placement",
            productId,
            variantId: resolved.variantId,
            position,
            rotationY: candidate.rotationY,
          },
          dimsMm: resolved.dimsMm,
          catalogItems: CATALOG_ITEMS,
          openings: planOpenings,
          variant: resolved.variant,
          existingItems: targetRoom.items,
        }).score;
        if (score > bestScore) {
          bestScore = score;
          bestPlacement = placement;
        }
      }

      return bestPlacement;
    },
    [activeRoom, catalogPlacementCollidesInRoom, clampToCatalogPlacementRoom, planOpenings]
  );

  const pendingCatalogPlacementImprovement = useMemo(() => {
    if (!pendingCatalogPlacement || !pendingCatalogPlacementScore) return null;
    const targetRoom =
      roomSnapshotById.get(pendingCatalogPlacement.roomId ?? designSnapshotRef.current.activeRoomId) ??
      activeRoom;
    if (!targetRoom) return null;
    const product = CATALOG_ITEMS[pendingCatalogPlacement.productId];
    if (!product) return null;
    const bestPlacement = findSmartCatalogPlacement(
      pendingCatalogPlacement.productId,
      pendingCatalogPlacement.variantId,
      pendingCatalogPlacement.purchaseOptionId,
      targetRoom
    );
    if (!bestPlacement) return null;
    const resolved = resolveCatalogVariant(product, bestPlacement.variantId);
    const bestScore = scoreManualPlacement({
      room: targetRoom,
      item: {
        instanceId: "pending-catalog-placement-improvement",
        productId: bestPlacement.productId,
        variantId: resolved.variantId,
        position: bestPlacement.position,
        rotationY: bestPlacement.rotationY,
      },
      dimsMm: resolved.dimsMm,
      catalogItems: CATALOG_ITEMS,
      openings: planOpenings,
      variant: resolved.variant,
      existingItems: targetRoom.items,
    }).score;
    const positionDelta = Math.hypot(
      bestPlacement.position[0] - pendingCatalogPlacement.position[0],
      bestPlacement.position[2] - pendingCatalogPlacement.position[2]
    );
    const rotationDelta = Math.abs(bestPlacement.rotationY - pendingCatalogPlacement.rotationY);
    const scoreDelta = bestScore - pendingCatalogPlacementScore.score;
    if (scoreDelta < 4 || (positionDelta < 0.08 && rotationDelta < 0.01)) return null;
    return {
      placement: {
        ...bestPlacement,
        reason: `Improved placement (${bestScore}/100)`,
      },
      score: bestScore,
      scoreDelta,
    };
  }, [
    activeRoom,
    findSmartCatalogPlacement,
    pendingCatalogPlacement,
    pendingCatalogPlacementScore,
    planOpenings,
    roomSnapshotById,
  ]);
  const pendingCatalogBestRoomPlacement = useMemo(() => {
    if (!pendingCatalogPlacement || !pendingCatalogPlacementScore || designSnapshot.rooms.length < 2) {
      return null;
    }
    const product = CATALOG_ITEMS[pendingCatalogPlacement.productId];
    if (!product) return null;
    const currentRoomId =
      pendingCatalogPlacement.roomId ?? activeRoom?.id ?? designSnapshot.activeRoomId;
    let best:
      | {
          placement: PendingCatalogPlacement;
          roomName: string;
          score: number;
          scoreDelta: number;
        }
      | null = null;

    for (const room of designSnapshot.rooms) {
      if (room.id === currentRoomId) continue;
      const placement = findSmartCatalogPlacement(
        pendingCatalogPlacement.productId,
        pendingCatalogPlacement.variantId,
        pendingCatalogPlacement.purchaseOptionId,
        room
      );
      if (!placement) continue;
      const resolved = resolveCatalogVariant(product, placement.variantId);
      const score = scoreManualPlacement({
        room,
        item: {
          instanceId: "pending-catalog-best-room",
          productId: placement.productId,
          variantId: resolved.variantId,
          position: placement.position,
          rotationY: placement.rotationY,
        },
        dimsMm: resolved.dimsMm,
        catalogItems: CATALOG_ITEMS,
        openings: planOpenings,
        variant: resolved.variant,
        existingItems: room.items,
      });
      if (score.kind === "blocks_path" || score.kind === "cramped") continue;
      const scoreDelta = score.score - pendingCatalogPlacementScore.score;
      if (!best || score.score > best.score) {
        best = {
          placement: {
            ...placement,
            reason: `Best room: ${room.name} (${score.score}/100)`,
          },
          roomName: room.name,
          score: score.score,
          scoreDelta,
        };
      }
    }

    if (!best || best.scoreDelta < 4) return null;
    return best;
  }, [
    activeRoom?.id,
    designSnapshot.activeRoomId,
    designSnapshot.rooms,
    findSmartCatalogPlacement,
    pendingCatalogPlacement,
    pendingCatalogPlacementScore,
    planOpenings,
  ]);
  const pendingCatalogBestVariantPlacement = useMemo(() => {
    if (!pendingCatalogPlacement || !pendingCatalogPlacementScore) return null;
    const targetRoom =
      roomSnapshotById.get(pendingCatalogPlacement.roomId ?? designSnapshotRef.current.activeRoomId) ??
      activeRoom;
    const product = CATALOG_ITEMS[pendingCatalogPlacement.productId];
    if (!targetRoom || !product || product.variants.length < 2) return null;
    const currentVariant = resolveCatalogVariant(product, pendingCatalogPlacement.variantId);
    let best:
      | {
          placement: PendingCatalogPlacement;
          variantLabel: string;
          score: number;
          scoreDelta: number;
        }
      | null = null;

    for (const variant of product.variants) {
      if (variant.id === currentVariant.variantId) continue;
      const placement = findSmartCatalogPlacement(
        pendingCatalogPlacement.productId,
        variant.id,
        pendingCatalogPlacement.purchaseOptionId,
        targetRoom
      );
      if (!placement) continue;
      const resolved = resolveCatalogVariant(product, variant.id);
      const score = scoreManualPlacement({
        room: targetRoom,
        item: {
          instanceId: "pending-catalog-best-option",
          productId: placement.productId,
          variantId: resolved.variantId,
          position: placement.position,
          rotationY: placement.rotationY,
        },
        dimsMm: resolved.dimsMm,
        catalogItems: CATALOG_ITEMS,
        openings: planOpenings,
        variant: resolved.variant,
        existingItems: targetRoom.items,
      });
      if (score.kind === "blocks_path" || score.kind === "cramped") continue;
      const scoreDelta = score.score - pendingCatalogPlacementScore.score;
      if (!best || score.score > best.score) {
        best = {
          placement: {
            ...placement,
            reason: `Best option: ${resolved.variant.label} (${score.score}/100)`,
          },
          variantLabel: resolved.variant.label,
          score: score.score,
          scoreDelta,
        };
      }
    }

    if (!best || best.scoreDelta < 4) return null;
    return best;
  }, [
    activeRoom,
    findSmartCatalogPlacement,
    pendingCatalogPlacement,
    pendingCatalogPlacementScore,
    planOpenings,
    roomSnapshotById,
  ]);
  const pendingCatalogPlacementScoreHardInvalid =
    pendingCatalogPlacementScore?.kind === "blocks_path" ||
    pendingCatalogPlacementScore?.kind === "cramped";
  const pendingCatalogPlacementHardInvalid = Boolean(
    pendingCatalogPlacement &&
      (pendingCatalogPlacementBlocked || pendingCatalogPlacementScoreHardInvalid)
  );
  const pendingCatalogPlacementStatusLabel = pendingCatalogPlacementBlocked
    ? pendingCatalogPlacementBlockerLabel
      ? `Blocked by ${pendingCatalogPlacementBlockerLabel}`
      : `Blocked in ${pendingCatalogPlacementRoom?.name ?? "target room"}`
    : pendingCatalogPlacementScore?.kind === "blocks_path"
      ? "Blocks walking path"
      : pendingCatalogPlacementScore?.kind === "cramped"
        ? "Cramped placement"
        : "Valid placement";
  const shouldConfirmImprovedCatalogPlacement = Boolean(
    pendingCatalogPlacementImprovement && pendingCatalogPlacementHardInvalid
  );
  const shouldConfirmRestoredCatalogPlacement = Boolean(
    !shouldConfirmImprovedCatalogPlacement &&
      pendingCatalogPlacementHardInvalid &&
      restorableCatalogPlacement
  );

  const targetPendingCatalogPlacementToRoom = useCallback(
    (roomId: string, options: { source: "room" | "zone"; localPosition?: [number, number, number]; zoneLabel?: string }) => {
      if (!pendingCatalogPlacement) return false;
      const targetRoom = roomSnapshotById.get(roomId);
      if (!targetRoom) return false;

      const smartPlacement =
        options.localPosition === undefined
          ? findSmartCatalogPlacement(
              pendingCatalogPlacement.productId,
              pendingCatalogPlacement.variantId,
              pendingCatalogPlacement.purchaseOptionId,
              targetRoom
            )
          : null;
      const nextPlacement =
        smartPlacement ??
        updatePendingCatalogPlacementDraft(
          {
            ...pendingCatalogPlacement,
            roomId: targetRoom.id,
          },
          options.localPosition ?? [0, 0, 0],
          pendingCatalogPlacement.rotationY,
          options.source === "zone" && options.zoneLabel
            ? `Tapped ${options.zoneLabel}`
            : `Tapped ${targetRoom.name}`,
          targetRoom
        );

      if (!nextPlacement) {
        showRuleToast(`Could not place in ${targetRoom.name}`);
        return true;
      }

      const acceptable = isCatalogPlacementTargetAcceptable(nextPlacement, targetRoom);

      setPendingCatalogPlacement({
        ...nextPlacement,
        roomId: targetRoom.id,
        reason:
          options.source === "zone" && options.zoneLabel
            ? `Tapped ${options.zoneLabel}`
            : nextPlacement.reason,
      });
      setCrossRoomDragTarget({
        roomId: targetRoom.id,
        label: targetRoom.name,
        valid: acceptable,
        kind: "preview",
      });
      showRuleToast(
        options.source === "zone" && options.zoneLabel
          ? `Moved preview to ${options.zoneLabel}`
          : `Moved preview to ${targetRoom.name}`
      );
      return true;
    },
    [
      findSmartCatalogPlacement,
      isCatalogPlacementTargetAcceptable,
      pendingCatalogPlacement,
      roomSnapshotById,
      showRuleToast,
      updatePendingCatalogPlacementDraft,
    ]
  );

  const handlePlacementAwareRoomSelect = useCallback(
    (roomId: string) => {
      if (targetPendingCatalogPlacementToRoom(roomId, { source: "room" })) {
        clearNonRoomSelection();
        setSelectedPlanRoomId(roomId);
        if (editorMode !== "present") setEditorMode("design");
        return;
      }

      if (viewMode === "2d") {
        clearNonRoomSelection();
        setSelectedPlanRoomId(roomId);
        if (editorMode !== "present") setEditorMode("design");
      }

      if (designSnapshotRef.current.activeRoomId === roomId) {
        return;
      }

      handleSwitchRoom(roomId);
    },
    [clearNonRoomSelection, editorMode, handleSwitchRoom, targetPendingCatalogPlacementToRoom, viewMode]
  );

  const nudgePendingCatalogPlacement = useCallback(
    (deltaX: number, deltaZ: number) => {
      setPendingCatalogPlacement((prev) => {
        if (!prev) return prev;
        return (
          updatePendingCatalogPlacementDraft(
            prev,
            [prev.position[0] + deltaX, prev.position[1] ?? 0, prev.position[2] + deltaZ],
            prev.rotationY,
            "Adjusted placement"
          ) ?? prev
        );
      });
    },
    [updatePendingCatalogPlacementDraft]
  );

  const centerPendingCatalogPlacement = useCallback(() => {
    setPendingCatalogPlacement((prev) => {
      if (!prev) return prev;
      return updatePendingCatalogPlacementDraft(prev, [0, 0, 0], prev.rotationY, "Centered in room") ?? prev;
    });
  }, [updatePendingCatalogPlacementDraft]);

  const autoPlacePendingCatalogPlacement = useCallback(() => {
    setPendingCatalogPlacement((prev) => {
      if (!prev) return prev;
      const targetRoom =
        roomSnapshotById.get(prev.roomId ?? designSnapshotRef.current.activeRoomId) ?? activeRoom;
      const next = findSmartCatalogPlacement(
        prev.productId,
        prev.variantId,
        prev.purchaseOptionId,
        targetRoom
      );
      if (!next) {
        showRuleToast("No open auto placement found in this room.");
        return prev;
      }
      return next;
    });
  }, [activeRoom, findSmartCatalogPlacement, roomSnapshotById, showRuleToast]);

  const improvePendingCatalogPlacement = useCallback(() => {
    if (!pendingCatalogPlacementImprovement) {
      showRuleToast("This is already the best scored spot nearby.");
      return;
    }
    setPendingCatalogPlacement(pendingCatalogPlacementImprovement.placement);
    showRuleToast(`Improved placement to ${pendingCatalogPlacementImprovement.score}/100`);
  }, [pendingCatalogPlacementImprovement, showRuleToast]);

  const restoreLastValidCatalogPlacement = useCallback(() => {
    if (!restorableCatalogPlacement) {
      showRuleToast("No earlier valid spot to restore.");
      return;
    }
    setPendingCatalogPlacement({
      ...restorableCatalogPlacement,
      reason: "Restored last valid spot",
    });
    showRuleToast("Restored last valid placement");
  }, [restorableCatalogPlacement, showRuleToast]);

  const movePendingCatalogPlacementToBestRoom = useCallback(() => {
    if (!pendingCatalogBestRoomPlacement) {
      showRuleToast("No better room found for this item.");
      return;
    }
    setPendingCatalogPlacement(pendingCatalogBestRoomPlacement.placement);
    setCrossRoomDragTarget({
      roomId: pendingCatalogBestRoomPlacement.placement.roomId ?? designSnapshotRef.current.activeRoomId,
      label: pendingCatalogBestRoomPlacement.roomName,
      valid: true,
      kind: "preview",
    });
    showRuleToast(
      `Moved preview to ${pendingCatalogBestRoomPlacement.roomName} (${pendingCatalogBestRoomPlacement.score}/100)`
    );
  }, [pendingCatalogBestRoomPlacement, showRuleToast]);

  const switchPendingCatalogPlacementToBestOption = useCallback(() => {
    if (!pendingCatalogBestVariantPlacement) {
      showRuleToast("No better option found for this spot.");
      return;
    }
    setPendingCatalogPlacement(pendingCatalogBestVariantPlacement.placement);
    showRuleToast(
      `Switched to ${pendingCatalogBestVariantPlacement.variantLabel} (${pendingCatalogBestVariantPlacement.score}/100)`
    );
  }, [pendingCatalogBestVariantPlacement, showRuleToast]);

  const addCatalogItemDirectlyToRoom = useCallback(
    (productId: string, variantId?: string, purchaseOptionId?: string) => {
      const placement = buildCatalogPlacementPreview(productId, variantId, purchaseOptionId);
      if (placement) {
        return addCatalogPlacementToRoom({
          ...placement,
          roomId: activeRoom?.id ?? designSnapshotRef.current.activeRoomId,
        });
      }

      const fallback = buildCatalogFallbackPlacement({
        productId,
        variantId,
        purchaseOptionId,
        itemCount: itemsRef.current.length,
        roomWidth,
        roomDepth,
        wallThickness,
        clampToActiveRoom,
        collides: catalogPlacementCollides,
      });
      if (!fallback) {
        return false;
      }
      return addCatalogPlacementToRoom({
        ...fallback,
        roomId: activeRoom?.id ?? designSnapshotRef.current.activeRoomId,
      });
    },
    [
      addCatalogPlacementToRoom,
      activeRoom?.id,
      buildCatalogPlacementPreview,
      catalogPlacementCollides,
      clampToActiveRoom,
      roomDepth,
      roomWidth,
      wallThickness,
    ]
  );

  const addCatalogItemToRoom = useCallback((productId: string, variantId?: string, purchaseOptionId?: string) => {
    if (placementAddMode === "auto") {
      const placement = findSmartCatalogPlacement(productId, variantId, purchaseOptionId);
      if (!placement) {
        showRuleToast("No open auto placement found in this room.");
        return;
      }
      if (addCatalogPlacementToRoom(placement)) {
        showRuleToast(`Added to ${activeRoom?.name ?? "room"}`);
      }
      return;
    }
    const placement = buildCatalogPlacementPreview(productId, variantId, purchaseOptionId);
    if (!placement) {
      showRuleToast("No clear placement found in this room. Move an item or choose another spot.");
      return;
    }

    setPendingCatalogPlacement({
      ...placement,
      roomId: activeRoom?.id ?? designSnapshotRef.current.activeRoomId,
    });
    showRuleToast(`Previewing placement in ${activeRoom?.name ?? "room"}`);
  }, [
    activeRoom?.id,
    activeRoom?.name,
    addCatalogPlacementToRoom,
    buildCatalogPlacementPreview,
    findSmartCatalogPlacement,
    placementAddMode,
    showRuleToast,
  ]);

  const autoPlaceCatalogItemInRoom = useCallback(
    (productId: string, variantId?: string, purchaseOptionId?: string) => {
      const placement = findSmartCatalogPlacement(productId, variantId, purchaseOptionId);
      if (!placement) {
        showRuleToast("No open auto placement found in this room.");
        return;
      }
      setPendingCatalogPlacement(placement);
      setHoverCatalogPlacement(null);
      showRuleToast(`Auto placement ready in ${activeRoom?.name ?? "room"}`);
    },
    [activeRoom?.name, findSmartCatalogPlacement, showRuleToast]
  );

  const previewCatalogPlacementIntent = useCallback(
    (productId: string | null, variantId?: string) => {
      if (!productId || pendingCatalogPlacement) {
        setHoverCatalogPlacement(null);
        return;
      }
      setHoverCatalogPlacement(findSmartCatalogPlacement(productId, variantId));
    },
    [findSmartCatalogPlacement, pendingCatalogPlacement]
  );

  const previewShoppingReplacement = useCallback(
    (productId: string, variantId: string) => {
      goFurnish();
      previewCatalogPlacementIntent(productId, variantId);
      showRuleToast("Previewing replacement placement");
    },
    [goFurnish, previewCatalogPlacementIntent, showRuleToast]
  );

  const resolveCatalogDragPlacement = useCallback(
    (
      intent: { productId: string; variantId?: string; purchaseOptionId?: string },
      clientX: number,
      clientY: number
    ): PendingCatalogPlacement | null => {
      const worldPoint = resolveGroundPointFromClient(clientX, clientY);
      if (!worldPoint) return null;
      const pointerPlanRoom = hasWholeHousePlan
        ? findPlanRoomAtWorldPoint(worldPoint[0], worldPoint[2])
        : null;
      const targetRoomId = pointerPlanRoom?.id ?? activeRoom?.id ?? designSnapshotRef.current.activeRoomId;
      const targetRoom = roomSnapshotById.get(targetRoomId) ?? activeRoom;
      if (!targetRoom) return null;
      const targetPlanRoom = houseRoomById.get(targetRoom.id);
      const product = CATALOG_ITEMS[intent.productId];
      if (!product) return null;
      const resolved = resolveCatalogVariant(product, intent.variantId ?? product.defaultVariantId);
      const smartPlacement = findSmartCatalogPlacement(
        intent.productId,
        resolved.variantId,
        intent.purchaseOptionId,
        targetRoom
      );
      const basePlacement: PendingCatalogPlacement = {
        productId: intent.productId,
        variantId: resolved.variantId,
        purchaseOptionId: intent.purchaseOptionId,
        roomId: targetRoom.id,
        position: smartPlacement?.position ?? [0, 0, 0],
        rotationY: smartPlacement?.rotationY ?? 0,
        reason: "Dropped from catalog",
      };
      return updatePendingCatalogPlacementDraft(
        basePlacement,
        [
          worldPoint[0] - (targetPlanRoom?.x ?? 0),
          0,
          worldPoint[2] - (targetPlanRoom?.z ?? 0),
        ],
        basePlacement.rotationY,
        `Dropped in ${targetRoom.name}`,
        targetRoom
      );
    },
    [
      activeRoom,
      findPlanRoomAtWorldPoint,
      findSmartCatalogPlacement,
      hasWholeHousePlan,
      houseRoomById,
      resolveGroundPointFromClient,
      roomSnapshotById,
      updatePendingCatalogPlacementDraft,
    ]
  );

  const handleCatalogDragStart = useCallback(
    (productId: string, variantId?: string) => {
      const intent = { productId, variantId };
      setDragCatalogIntent(intent);
      setHoverCatalogPlacement(findSmartCatalogPlacement(productId, variantId));
    },
    [findSmartCatalogPlacement]
  );

  const handleCatalogDragEnd = useCallback(() => {
    setDragCatalogIntent(null);
    setHoverCatalogPlacement(null);
    setCrossRoomDragTarget((current) => (current?.kind === "preview" ? null : current));
  }, []);

  const handleCatalogCanvasDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!dragCatalogIntent || isClientPreview || editorMode === "present") return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      const placement = resolveCatalogDragPlacement(
        dragCatalogIntent,
        event.clientX,
        event.clientY
      );
      if (!placement) return;
      setHoverCatalogPlacement(placement);
      const targetRoom = roomSnapshotById.get(placement.roomId ?? "") ?? activeRoom;
      if (targetRoom) {
        const acceptable = isCatalogPlacementTargetAcceptable(placement, targetRoom);
        setCrossRoomDragTarget({
          roomId: targetRoom.id,
          label: targetRoom.name,
          valid: acceptable,
          kind: "preview",
        });
      }
    },
    [
      activeRoom,
      dragCatalogIntent,
      editorMode,
      isCatalogPlacementTargetAcceptable,
      isClientPreview,
      resolveCatalogDragPlacement,
      roomSnapshotById,
    ]
  );

  const handleCatalogCanvasDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!dragCatalogIntent || isClientPreview || editorMode === "present") return;
      event.preventDefault();
      const placement = resolveCatalogDragPlacement(
        dragCatalogIntent,
        event.clientX,
        event.clientY
      );
      setDragCatalogIntent(null);
      setHoverCatalogPlacement(null);
      setCrossRoomDragTarget(null);
      if (!placement) {
        showRuleToast("Drop over a room to place this item.");
        return;
      }
      if (placementAddMode === "auto") {
        const targetRoom = roomSnapshotById.get(placement.roomId ?? "") ?? activeRoom;
        const smartPlacement =
          findSmartCatalogPlacement(
            placement.productId,
            placement.variantId,
            placement.purchaseOptionId,
            targetRoom
          ) ?? placement;
        if (!addCatalogPlacementToRoom(smartPlacement)) {
          setPendingCatalogPlacement(smartPlacement);
        }
        return;
      }
      setPendingCatalogPlacement(placement);
      showRuleToast(`Drop preview ready in ${roomSnapshotById.get(placement.roomId ?? "")?.name ?? "room"}`);
    },
    [
      activeRoom,
      addCatalogPlacementToRoom,
      dragCatalogIntent,
      editorMode,
      findSmartCatalogPlacement,
      isClientPreview,
      placementAddMode,
      resolveCatalogDragPlacement,
      roomSnapshotById,
      showRuleToast,
    ]
  );

  const selectPendingCatalogPlacementBlocker = useCallback(() => {
    if (!pendingCatalogPlacement) return;
    const targetRoom =
      roomSnapshotById.get(pendingCatalogPlacement.roomId ?? designSnapshotRef.current.activeRoomId) ??
      activeRoom;
    const product = CATALOG_ITEMS[pendingCatalogPlacement.productId];
    if (!targetRoom || !product) return;
    const resolved = resolveCatalogVariant(product, pendingCatalogPlacement.variantId);
    const blocker = findCatalogPlacementBlockerInRoom(
      targetRoom,
      pendingCatalogPlacement.productId,
      pendingCatalogPlacement.position,
      pendingCatalogPlacement.rotationY,
      resolved.dimsMm
    );
    if (!blocker) return;
    setDesignSnapshot((prev) =>
      prev.activeRoomId === targetRoom.id ? prev : switchRoom(prev, targetRoom.id)
    );
    updateSelection(new Set([blocker.instanceId]), blocker.instanceId);
    showRuleToast(`Selected ${getItemDisplayName(blocker) ?? "blocking item"}`);
  }, [
    activeRoom,
    findCatalogPlacementBlockerInRoom,
    getItemDisplayName,
    pendingCatalogPlacement,
    roomSnapshotById,
    showRuleToast,
    updateSelection,
  ]);

  const placePendingCatalogBesideBlocker = useCallback(() => {
    if (!pendingCatalogPlacement || !pendingCatalogPlacementBlocker) return;
    const targetRoom =
      roomSnapshotById.get(pendingCatalogPlacement.roomId ?? designSnapshotRef.current.activeRoomId) ??
      activeRoom;
    const product = CATALOG_ITEMS[pendingCatalogPlacement.productId];
    if (!targetRoom || !product) return;
    const resolved = resolveCatalogVariant(product, pendingCatalogPlacement.variantId);
    const blockerProduct = CATALOG_ITEMS[pendingCatalogPlacementBlocker.productId];
    const blockerDims = blockerProduct
      ? resolveConfiguredPlanningDimsMm(pendingCatalogPlacementBlocker, blockerProduct)
      : { w: 800, d: 800, h: 500 };
    const spacing =
      Math.max(resolved.dimsMm.w, resolved.dimsMm.d, blockerDims.w, blockerDims.d) / 1000 / 2 + 0.35;
    const offsets: Array<[number, number]> = [
      [spacing, 0],
      [-spacing, 0],
      [0, spacing],
      [0, -spacing],
    ];

    for (const [deltaX, deltaZ] of offsets) {
      const next = updatePendingCatalogPlacementDraft(
        pendingCatalogPlacement,
        [
          pendingCatalogPlacementBlocker.position[0] + deltaX,
          0,
          pendingCatalogPlacementBlocker.position[2] + deltaZ,
        ],
        pendingCatalogPlacement.rotationY,
        "Placed beside blocker",
        targetRoom
      );
      if (
        next &&
        !catalogPlacementCollidesInRoom(
          targetRoom,
          next.productId,
          next.position,
          next.rotationY,
          resolved.dimsMm
        )
      ) {
        setPendingCatalogPlacement(next);
        showRuleToast("Placed beside blocker");
        return;
      }
    }
    showRuleToast("No open spot beside blocker.");
  }, [
    activeRoom,
    catalogPlacementCollidesInRoom,
    pendingCatalogPlacement,
    pendingCatalogPlacementBlocker,
    resolveConfiguredPlanningDimsMm,
    roomSnapshotById,
    showRuleToast,
    updatePendingCatalogPlacementDraft,
  ]);

  const trySmallerPendingCatalogVariant = useCallback(() => {
    if (!pendingCatalogPlacement) return;
    const product = CATALOG_ITEMS[pendingCatalogPlacement.productId];
    if (!product) return;
    const current = resolveCatalogVariant(product, pendingCatalogPlacement.variantId);
    const currentArea = current.dimsMm.w * current.dimsMm.d;
    const smaller = product.variants
      .map((variant) => ({
        variant,
        dims: variant.dimensionsMm ?? product.dimsMm,
      }))
      .filter(({ variant, dims }) => variant.id !== current.variantId && dims.w * dims.d < currentArea)
      .sort((a, b) => b.dims.w * b.dims.d - a.dims.w * a.dims.d)[0];
    if (!smaller) {
      showRuleToast("No smaller variant available.");
      return;
    }
    const next = updatePendingCatalogPlacementDraft(
      {
        ...pendingCatalogPlacement,
        variantId: smaller.variant.id,
      },
      pendingCatalogPlacement.position,
      pendingCatalogPlacement.rotationY,
      "Smaller variant preview"
    );
    if (next) {
      setPendingCatalogPlacement(next);
      showRuleToast(`Trying smaller variant: ${smaller.variant.label}`);
    }
  }, [pendingCatalogPlacement, showRuleToast, updatePendingCatalogPlacementDraft]);

  const movePendingCatalogBlockerAside = useCallback(() => {
    if (!pendingCatalogPlacementBlocker || !pendingCatalogPlacement) return;
    const targetRoom =
      roomSnapshotById.get(pendingCatalogPlacement.roomId ?? designSnapshotRef.current.activeRoomId) ??
      activeRoom;
    if (!targetRoom) return;
    const placement = findSmartCatalogPlacement(
      pendingCatalogPlacementBlocker.productId,
      pendingCatalogPlacementBlocker.variantId,
      pendingCatalogPlacementBlocker.purchaseOptionId,
      targetRoom
    );
    if (!placement) {
      showRuleToast("No open spot found for blocker.");
      return;
    }
    const blockerName = getItemDisplayName(pendingCatalogPlacementBlocker) ?? "blocker";
    const beforeLayoutVersion = createLayoutVersion(targetRoom, {
      name: `Before moving ${blockerName}`,
      source: "make_space",
    });
    commitItemsToRoom(
      targetRoom.id,
      (prev) =>
        prev.map((item) =>
          item.instanceId === pendingCatalogPlacementBlocker.instanceId
            ? { ...item, position: placement.position, rotationY: placement.rotationY }
            : item
        ),
      `Move ${blockerName} aside`,
      { activateRoom: true, beforeLayoutVersion }
    );
    showRuleToast(`Moved ${blockerName} aside`);
  }, [
    activeRoom,
    commitItemsToRoom,
    findSmartCatalogPlacement,
    getItemDisplayName,
    pendingCatalogPlacement,
    pendingCatalogPlacementBlocker,
    roomSnapshotById,
    showRuleToast,
  ]);

  const swapPendingCatalogWithBlocker = useCallback(() => {
    if (!pendingCatalogPlacement || !pendingCatalogPlacementBlocker) return;
    const targetRoom =
      roomSnapshotById.get(pendingCatalogPlacement.roomId ?? designSnapshotRef.current.activeRoomId) ??
      activeRoom;
    if (!targetRoom) return;
    const blockerName = getItemDisplayName(pendingCatalogPlacementBlocker) ?? "blocker";
    const blockerPosition = pendingCatalogPlacementBlocker.position;
    const previewPosition = pendingCatalogPlacement.position;
    const beforeLayoutVersion = createLayoutVersion(targetRoom, {
      name: `Before swapping ${blockerName}`,
      source: "make_space",
    });
    commitItemsToRoom(
      targetRoom.id,
      (prev) =>
        prev.map((item) =>
          item.instanceId === pendingCatalogPlacementBlocker.instanceId
            ? { ...item, position: previewPosition }
            : item
        ),
      `Swap with ${blockerName}`,
      { activateRoom: true, beforeLayoutVersion }
    );
    setPendingCatalogPlacement((prev) =>
      prev
        ? {
            ...prev,
            position: [blockerPosition[0], blockerPosition[1] ?? 0, blockerPosition[2]],
            reason: `Swapped with ${blockerName}`,
          }
        : prev
    );
    showRuleToast(`Swapped with ${blockerName}`);
  }, [
    activeRoom,
    commitItemsToRoom,
    getItemDisplayName,
    pendingCatalogPlacement,
    pendingCatalogPlacementBlocker,
    roomSnapshotById,
    showRuleToast,
  ]);

  const cancelPendingCatalogPlacement = useCallback(() => {
    setPendingCatalogPlacement(null);
    setLastValidCatalogPlacement(null);
    setHoverCatalogPlacement(null);
    setCatalogPlacementDragging(false);
    setCrossRoomDragTarget(null);
    setSofaDragging(false);
  }, []);

  const confirmPendingCatalogPlacement = useCallback(() => {
    if (!pendingCatalogPlacement) return;
    const placementToConfirm =
      shouldConfirmImprovedCatalogPlacement && pendingCatalogPlacementImprovement
        ? pendingCatalogPlacementImprovement.placement
        : shouldConfirmRestoredCatalogPlacement && restorableCatalogPlacement
          ? restorableCatalogPlacement
        : pendingCatalogPlacement;
    const product = CATALOG_ITEMS[placementToConfirm.productId];
    if (!product) {
      setPendingCatalogPlacement(null);
      return;
    }
    if (
      pendingCatalogPlacementHardInvalid &&
      !shouldConfirmImprovedCatalogPlacement &&
      !shouldConfirmRestoredCatalogPlacement
    ) {
      showRuleToast(
        pendingCatalogPlacementScoreHardInvalid && pendingCatalogPlacementScore?.summary
          ? pendingCatalogPlacementScore.summary
          : pendingCatalogPlacementBlockerLabel
            ? `Blocked by ${pendingCatalogPlacementBlockerLabel}`
            : "Placement blocked by another item. Move it or choose a different item."
      );
      return;
    }

    if (!addCatalogPlacementToRoom(placementToConfirm)) {
      return;
    }
    if (shouldConfirmImprovedCatalogPlacement && pendingCatalogPlacementImprovement) {
      showRuleToast(`Added improved placement (${pendingCatalogPlacementImprovement.score}/100)`);
    } else if (shouldConfirmRestoredCatalogPlacement) {
      showRuleToast("Added last valid placement");
    }
    setPendingCatalogPlacement(null);
    setCatalogPlacementDragging(false);
    setCrossRoomDragTarget(null);
    setSofaDragging(false);
  }, [
    addCatalogPlacementToRoom,
    pendingCatalogPlacement,
    pendingCatalogPlacementBlockerLabel,
    pendingCatalogPlacementHardInvalid,
    pendingCatalogPlacementImprovement,
    pendingCatalogPlacementScore?.summary,
    pendingCatalogPlacementScoreHardInvalid,
    restorableCatalogPlacement,
    shouldConfirmImprovedCatalogPlacement,
    shouldConfirmRestoredCatalogPlacement,
    showRuleToast,
  ]);

  useEffect(() => {
    setPendingCatalogPlacement(null);
    setLastValidCatalogPlacement(null);
    setHoverCatalogPlacement(null);
    setCrossRoomDragTarget(null);
  }, [designSnapshot.activeRoomId]);

  useEffect(() => {
    if (pendingCatalogPlacement) {
      if (!pendingCatalogPlacementHardInvalid) {
        setLastValidCatalogPlacement(pendingCatalogPlacement);
      }
      return;
    }
    setLastValidCatalogPlacement(null);
    setCatalogPlacementDragging(false);
    setCrossRoomDragTarget((current) => (current?.kind === "preview" ? null : current));
    setSofaDragging(false);
  }, [pendingCatalogPlacement, pendingCatalogPlacementHardInvalid]);

  useEffect(() => {
    if (!catalogPlacementDragging) return;
    const stopDragging = () => {
      setCatalogPlacementDragging(false);
      setSofaDragging(false);
    };
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [catalogPlacementDragging]);

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

  const saveStatus = useMemo<EditorSaveStatus>(() => {
    if (isSaving) {
      return {
        kind: "saving",
        source: designId ? "cloud" : "local",
        label: designId ? "Saving to cloud" : "Saving locally",
        detail: designId ? "Syncing this design to your account." : "Writing a browser backup.",
        tone: "saving",
        canRetry: false,
      };
    }

    if (lastCloudSaveError) {
      return {
        kind: "failed",
        source: "cloud",
        label: "Cloud save failed",
        detail: lastLocalAutosaveAt
          ? `Local backup ${formatTimeAgo(lastLocalAutosaveAt)}. ${lastCloudSaveError}`
          : lastCloudSaveError,
        tone: "error",
        canRetry: Boolean(session?.user),
      };
    }

    if (lastLocalSaveError) {
      return {
        kind: "failed",
        source: "local",
        label: "Local backup failed",
        detail: lastLocalSaveError,
        tone: "error",
        canRetry: true,
      };
    }

    if (designId && lastDbSaveAt) {
      return {
        kind: "saved",
        source: "cloud",
        label: "Cloud saved",
        detail: formatTimeAgo(lastDbSaveAt),
        tone: "saved",
        canRetry: false,
      };
    }

    if (lastLocalAutosaveAt) {
      return {
        kind: "saved",
        source: "local",
        label: "Local saved",
        detail: session?.user ? "Cloud save pending" : formatTimeAgo(lastLocalAutosaveAt),
        tone: "saved",
        canRetry: false,
      };
    }

    return {
      kind: "pending",
      source: designId ? "cloud" : "local",
      label: designId ? "Cloud save pending" : "Local backup pending",
      detail: "Autosave will run after your next edit.",
      tone: "pending",
      canRetry: false,
    };
  }, [
    designId,
    isSaving,
    lastCloudSaveError,
    lastDbSaveAt,
    lastLocalAutosaveAt,
    lastLocalSaveError,
    session?.user,
  ]);

  const firstRunActivationState = useMemo(
    () =>
      buildFirstRunActivationState({
        templateChosen: !showBetaStart || designSnapshot.rooms.length > 1 || items.length > 0,
        itemCount: items.length,
        saveState:
          saveStatus.kind === "saved"
            ? "saved"
            : saveStatus.kind === "saving"
              ? "saving"
              : saveStatus.kind === "failed"
                ? "failed"
                : "idle",
        shareToken,
        exportOpened: editorMode === "present",
      }),
    [designSnapshot.rooms.length, editorMode, items.length, saveStatus.kind, shareToken, showBetaStart]
  );

  const retrySaveStatus = async () => {
    if (lastCloudSaveError && session?.user) {
      const savedId = await saveDesignToCloud();
      if (savedId) {
        showRuleToast("Cloud save restored");
      }
      return;
    }

    if (writeLocalDesignBackup()) {
      showRuleToast("Local backup restored");
    } else {
      showRuleToast("Local backup failed");
    }
  };

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

  const duplicateSelectedItem = useCallback(() => {
    if (!selectedItem || !selectedProduct || !canEdit) return;
    if (isDesigner && selectedItem.locked) return;

    const resolved = resolveCatalogVariant(selectedProduct, selectedItem.variantId);
    const instanceId = newInstanceId();
    const [safeX, safeZ] = clampToActiveRoom(
      selectedItem.position[0] + 0.35,
      selectedItem.position[2] + 0.35,
      resolved.dimsMm.w / 1000,
      resolved.dimsMm.d / 1000,
      roomWidth,
      roomDepth,
      wallThickness,
      selectedItem.rotationY ?? 0
    );
    const duplicate: PlacedItem = {
      ...selectedItem,
      instanceId,
      position: [safeX, selectedItem.position[1] ?? 0, safeZ],
    };
    commitItems((prev) => [...prev, duplicate], `Duplicate ${selectedProduct.title}`);
    updateSelection(new Set([instanceId]), instanceId);
  }, [
    canEdit,
    clampToActiveRoom,
    commitItems,
    isDesigner,
    newInstanceId,
    roomDepth,
    roomWidth,
    selectedItem,
    selectedProduct,
    updateSelection,
    wallThickness,
  ]);

  const deleteSelectedItem = useCallback(() => {
    if (!selectedItem || !canEdit) return;
    if (isDesigner && selectedItem.locked) return;
    const productName = selectedProduct?.title ?? "Item";
    commitItems(
      (prev) => prev.filter((item) => item.instanceId !== selectedItem.instanceId),
      `Delete ${productName}`
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
  }, [canEdit, commitItems, isDesigner, selectedItem, selectedProduct?.title, updateSelection]);

  const centerSelectedItemInRoom = useCallback(() => {
    if (!selectedItem || !selectedProduct || !canEdit) return;
    if (isDesigner && selectedItem.locked) return;
    const resolved = resolveCatalogVariant(selectedProduct, selectedItem.variantId);
    const [safeX, safeZ] = clampToActiveRoom(
      0,
      0,
      resolved.dimsMm.w / 1000,
      resolved.dimsMm.d / 1000,
      roomWidth,
      roomDepth,
      wallThickness,
      selectedItem.rotationY ?? 0
    );
    commitItems(
      (prev) =>
        prev.map((item) =>
          item.instanceId === selectedItem.instanceId
            ? { ...item, position: [safeX, item.position[1] ?? 0, safeZ] }
            : item
        ),
      "Center item"
    );
  }, [
    canEdit,
    clampToActiveRoom,
    commitItems,
    isDesigner,
    roomDepth,
    roomWidth,
    selectedItem,
    selectedProduct,
    wallThickness,
  ]);

  const snapSelectedItemToNearestWall = useCallback(() => {
    if (!selectedItem || !selectedProduct || !canEdit) return;
    if (isDesigner && selectedItem.locked) return;
    const resolved = resolveCatalogVariant(selectedProduct, selectedItem.variantId);
    const [effectiveWidth, effectiveDepth] = getRotatedFootprint(
      resolved.dimsMm.w / 1000,
      resolved.dimsMm.d / 1000,
      selectedItem.rotationY ?? 0
    );
    const wallX = Math.max(0, roomWidth / 2 - wallThickness - effectiveWidth / 2);
    const wallZ = Math.max(0, roomDepth / 2 - wallThickness - effectiveDepth / 2);
    const candidates: Array<[number, number]> = [
      [-wallX, selectedItem.position[2]],
      [wallX, selectedItem.position[2]],
      [selectedItem.position[0], -wallZ],
      [selectedItem.position[0], wallZ],
    ];
    const [targetX, targetZ] = candidates.reduce((best, candidate) => {
      const bestDistance = Math.hypot(
        best[0] - selectedItem.position[0],
        best[1] - selectedItem.position[2]
      );
      const candidateDistance = Math.hypot(
        candidate[0] - selectedItem.position[0],
        candidate[1] - selectedItem.position[2]
      );
      return candidateDistance < bestDistance ? candidate : best;
    }, candidates[0]);
    const [safeX, safeZ] = clampToActiveRoom(
      targetX,
      targetZ,
      resolved.dimsMm.w / 1000,
      resolved.dimsMm.d / 1000,
      roomWidth,
      roomDepth,
      wallThickness,
      selectedItem.rotationY ?? 0
    );
    commitItems(
      (prev) =>
        prev.map((item) =>
          item.instanceId === selectedItem.instanceId
            ? { ...item, position: [safeX, item.position[1] ?? 0, safeZ] }
            : item
        ),
      "Snap item to wall"
    );
  }, [
    canEdit,
    clampToActiveRoom,
    commitItems,
    isDesigner,
    roomDepth,
    roomWidth,
    selectedItem,
    selectedProduct,
    wallThickness,
  ]);

  const moveSelectedItemToRoom = useCallback(
    (targetRoomId: string) => {
      if (!selectedItem || !activeRoom || !canEdit) return;
      if (isDesigner && selectedItem.locked) return;
      if (targetRoomId === activeRoom.id) return;
      const targetRoom = roomSnapshotById.get(targetRoomId);
      if (!targetRoom) return;
      const selectedIds = selectedIdsRef.current;
      const movableSelectedItems = activeRoom.items.filter(
        (item) => selectedIds.has(item.instanceId) && !(isDesigner && item.locked)
      );
      if (movableSelectedItems.length > 1) {
        const groupCenter = movableSelectedItems.reduce(
          (sum, item) => ({
            x: sum.x + item.position[0],
            z: sum.z + item.position[2],
          }),
          { x: 0, z: 0 }
        );
        groupCenter.x /= movableSelectedItems.length;
        groupCenter.z /= movableSelectedItems.length;

        const movedItems: PlacedItem[] = [];
        for (const item of movableSelectedItems) {
          const product = CATALOG_ITEMS[item.productId];
          if (!product) continue;
          const dims = resolveConfiguredPlanningDimsMm(item, product);
          const [safeX, safeZ] = clampToCatalogPlacementRoom(
            targetRoom,
            item.position[0] - groupCenter.x,
            item.position[2] - groupCenter.z,
            dims.w / 1000,
            dims.d / 1000,
            item.rotationY ?? 0
          );
          const nextItem: PlacedItem = {
            ...item,
            position: [safeX, item.position[1] ?? 0, safeZ],
          };
          const blocker = findCatalogPlacementBlockerInRoom(
            targetRoom,
            nextItem.productId,
            nextItem.position,
            nextItem.rotationY ?? 0,
            dims
          );
          if (blocker) {
            showRuleToast(`Blocked by ${getItemDisplayName(blocker) ?? "another item"}`);
            return;
          }
          movedItems.push(nextItem);
        }

        for (let i = 0; i < movedItems.length; i += 1) {
          const aabb = getItemAABB(movedItems[i]);
          if (!aabb) continue;
          for (let j = i + 1; j < movedItems.length; j += 1) {
            const blockerAabb = getItemAABB(movedItems[j]);
            if (blockerAabb && aabbIntersects(aabb, blockerAabb)) {
              showRuleToast("Selected items overlap in the target room.");
              return;
            }
          }
        }

        const movedIds = new Set(movedItems.map((item) => item.instanceId));
        const snapshot = designSnapshotRef.current;
        history.begin(`Move ${movedItems.length} items to ${targetRoom.name}`);
        const nextSnapshot = {
          ...snapshot,
          activeRoomId: targetRoom.id,
          rooms: snapshot.rooms.map((room) => {
            if (room.id === activeRoom.id) {
              return {
                ...room,
                items: room.items.filter((item) => !movedIds.has(item.instanceId)),
                zones: room.zones
                  .map((zone) => ({
                    ...zone,
                    itemIds: zone.itemIds.filter((itemId) => !movedIds.has(itemId)),
                  }))
                  .filter((zone) => zone.itemIds.length > 0),
              };
            }
            if (room.id === targetRoom.id) {
              return { ...room, items: [...room.items, ...movedItems] };
            }
            return room;
          }),
        };
        itemsRef.current = [...targetRoom.items, ...movedItems];
        setDesignSnapshot(nextSnapshot);
        history.commit();
        updateSelection(movedIds, movedItems[0]?.instanceId ?? null);
        showRuleToast(`Moved ${movedItems.length} items to ${targetRoom.name}`);
        setUndoToast({ label: `Moved ${movedItems.length} items to ${targetRoom.name}` });
        return;
      }
      transferItemToRoom(selectedItem.instanceId, activeRoom.id, targetRoom, [
        selectedItem.position[0] + activeRoomPlanOffset.x,
        selectedItem.position[1] ?? 0,
        selectedItem.position[2] + activeRoomPlanOffset.z,
      ]);
    },
    [
      activeRoom,
      activeRoomPlanOffset.x,
      activeRoomPlanOffset.z,
      canEdit,
      clampToCatalogPlacementRoom,
      findCatalogPlacementBlockerInRoom,
      getItemAABB,
      getItemDisplayName,
      history,
      isDesigner,
      resolveConfiguredPlanningDimsMm,
      roomSnapshotById,
      selectedItem,
      showRuleToast,
      transferItemToRoom,
      updateSelection,
    ]
  );

  const moveSelectedItemToPosition = useCallback(
    (targetX: number, targetZ: number, actionLabel = "Move item") => {
      if (!selectedItem || !selectedProduct || !activeRoom || !canEdit) return;
      if (isDesigner && selectedItem.locked) return;
      const dims = selectedItemPlanningDimensionsMm ?? resolveCatalogVariant(selectedProduct, selectedItem.variantId).dimsMm;
      const [safeX, safeZ] = clampToActiveRoom(
        targetX,
        targetZ,
        dims.w / 1000,
        dims.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness,
        selectedItem.rotationY ?? 0
      );
      const nextPosition: [number, number, number] = [
        safeX,
        selectedItem.position[1] ?? 0,
        safeZ,
      ];
      const blocker = getItemDisplayName(
        findCatalogPlacementBlockerInRoom(
          activeRoom,
          selectedItem.productId,
          nextPosition,
          selectedItem.rotationY ?? 0,
          dims,
          selectedItem.instanceId
        )
      );
      if (blocker) {
        showRuleToast(`Blocked by ${blocker}`);
        return;
      }
      commitItems(
        (prev) =>
          prev.map((item) =>
            item.instanceId === selectedItem.instanceId
              ? { ...item, position: nextPosition }
              : item
          ),
        actionLabel
      );
    },
    [
      activeRoom,
      canEdit,
      clampToActiveRoom,
      commitItems,
      findCatalogPlacementBlockerInRoom,
      getItemDisplayName,
      isDesigner,
      roomDepth,
      roomWidth,
      selectedItem,
      selectedItemPlanningDimensionsMm,
      selectedProduct,
      showRuleToast,
      wallThickness,
    ]
  );

  const nudgeSelectedItem = useCallback(
    (deltaX: number, deltaZ: number) => {
      if (!selectedItem) return;
      moveSelectedItemToPosition(
        selectedItem.position[0] + deltaX,
        selectedItem.position[2] + deltaZ,
        "Nudge item"
      );
    },
    [moveSelectedItemToPosition, selectedItem]
  );

  useEffect(() => {
    if (isClientPreview) return;
    const handleSelectedItemShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (event.key === "Escape" && pendingCatalogPlacement) {
        event.preventDefault();
        cancelPendingCatalogPlacement();
        return;
      }

      if (pendingCatalogPlacement && canEdit) {
        if (event.key === "Enter") {
          event.preventDefault();
          confirmPendingCatalogPlacement();
          return;
        }

        if (
          event.key.toLowerCase() === "r" &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey
        ) {
          event.preventDefault();
          rotatePendingCatalogPlacement(event.shiftKey ? "left" : "right");
          return;
        }

        const placementNudgeStep = event.shiftKey ? 0.25 : 0.1;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          nudgePendingCatalogPlacement(-placementNudgeStep, 0);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          nudgePendingCatalogPlacement(placementNudgeStep, 0);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          nudgePendingCatalogPlacement(0, -placementNudgeStep);
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          nudgePendingCatalogPlacement(0, placementNudgeStep);
          return;
        }
      }

      if (!selectedItem || !canEdit) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelectedItem();
        return;
      }

      if (
        event.key.toLowerCase() === "r" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        rotateSelectedByDegrees(90);
        return;
      }

      const nudgeStep = event.shiftKey ? 0.25 : 0.05;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        nudgeSelectedItem(-nudgeStep, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        nudgeSelectedItem(nudgeStep, 0);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        nudgeSelectedItem(0, -nudgeStep);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        nudgeSelectedItem(0, nudgeStep);
      }
    };

    window.addEventListener("keydown", handleSelectedItemShortcut);
    return () => window.removeEventListener("keydown", handleSelectedItemShortcut);
  }, [
    canEdit,
    cancelPendingCatalogPlacement,
    confirmPendingCatalogPlacement,
    duplicateSelectedItem,
    isClientPreview,
    nudgePendingCatalogPlacement,
    nudgeSelectedItem,
    pendingCatalogPlacement,
    rotateSelectedByDegrees,
    rotatePendingCatalogPlacement,
    selectedItem,
  ]);

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
  const effectivePlanLayers = simplePlanControls ? SIMPLE_PLAN_LAYERS : planLayers;
  const effectivePlanTheme = simplePlanControls ? "consumer" : planTheme;
  const planCanvasCursor =
    viewMode !== "2d"
      ? undefined
      : activeFloorPlanTool === "select"
        ? "default"
        : activeFloorPlanTool === "draw_room"
          ? "crosshair"
          : "copy";
  const planCanvasGuidance = useMemo(
    () => {
      if (!planGuidedActionsEnabled) return null;

      return resolvePlanCanvasGuidance({
        viewMode,
        editorMode,
        isClientPreview,
        isDesigner,
        planStartMode: guidedPlanStartMode,
        floorPlanUnderlay,
        floorPlanCalibrationMode,
        floorPlanCalibrationPointCount: floorPlanCalibrationPoints.length,
        floorPlanTraceRoomMode,
        floorPlanDrawRoomMode,
        floorPlanTraceRoomPointCount: floorPlanTraceRoomPoints.length,
        floorPlanTraceOpeningMode,
        floorPlanTraceOpeningKind,
        floorPlanTraceOpeningPointCount: floorPlanTraceOpeningPoints.length,
        hasRooms: housePlan2D.rooms.length > 0,
        hasOpenings: planOpenings.length > 0,
        hasConnectionBlockers: roomConnectionChecklistItems.some(
          (item) => item.status === "needs_doorway"
        ),
        hasFurniture: items.length > 0,
      });
    },
    [
      editorMode,
      floorPlanCalibrationMode,
      floorPlanCalibrationPoints.length,
      floorPlanDrawRoomMode,
      floorPlanTraceOpeningKind,
      floorPlanTraceOpeningMode,
      floorPlanTraceOpeningPoints.length,
      floorPlanTraceRoomMode,
      floorPlanTraceRoomPoints.length,
      floorPlanUnderlay,
      guidedPlanStartMode,
      housePlan2D.rooms.length,
      isClientPreview,
      isDesigner,
      items.length,
      planGuidedActionsEnabled,
      planOpenings.length,
      roomConnectionChecklistItems,
      viewMode,
    ]
  );
  const showPlanGuidedActionsToggle =
    !isClientPreview && !isDesigner && viewMode === "2d" && editorMode === "design";
  const compactRoomPlanStatusBar = showPlanGuidedActionsToggle;
  const showRoomPlanStatusHealth = !showPlanGuidedActionsToggle;
  const showPlanManualQuickActions =
    showPlanGuidedActionsToggle && !planGuidedActionsEnabled && !activePlanCanvasInteraction;
  const showPlanGuidedActionsChoice =
    showPlanGuidedActionsToggle &&
    planSettingsLoaded &&
    !planGuidedActionsChoiceSeen &&
    !activePlanCanvasInteraction &&
    !showBetaStart;
  const showEmptyPlanCanvasPrompt =
    !isClientPreview &&
    viewMode === "2d" &&
    housePlan2D.rooms.length === 0 &&
    !floorPlanTraceRoomMode &&
    !showBetaStart &&
    !showPlanGuidedActionsChoice &&
    !showPlanManualQuickActions &&
    !designControlsPanelVisibleForLayout;
  const hiddenDesignToolsLabel =
    designControlsPanelMode === "ai"
      ? "AI tools"
      : designControlsPanelMode === "furnish"
        ? "Furnish tools"
        : "Plan tools";
  const showDesignToolsRestoreButton =
    !isClientPreview &&
    !isDesigner &&
    !designControlsPanelVisibleForLayout &&
    !planCanvasFocusActive &&
    !showBetaStart &&
    !showEmptyPlanCanvasPrompt &&
    (editorMode === "design" || editorMode === "adjust" || editorMode === "ai");
  const planCanvasGuidanceKey = planCanvasGuidance
    ? `${planCanvasGuidance.tone}:${planCanvasGuidance.title}:${planCanvasGuidance.action ?? "none"}`
    : null;
  const planCanvasGuidanceDismissed =
    Boolean(planCanvasGuidanceKey) && dismissedPlanCanvasGuidanceKey === planCanvasGuidanceKey;
  const visiblePlanCanvasGuidance =
    showPlanGuidedActionsChoice || planCanvasGuidanceDismissed ? null : planCanvasGuidance;
  const planCanvasGuidanceDismissible =
    Boolean(visiblePlanCanvasGuidance) &&
    visiblePlanCanvasGuidance?.tone === "ready" &&
    !activePlanCanvasInteraction;
  const canManualScalePlan = Boolean(floorPlanUnderlay?.mimeType.startsWith("image/"));
  const planGuidedActionsToggleClass = [
    "pointer-events-auto absolute z-30 flex items-center rounded-xl border text-xs font-semibold shadow-xl backdrop-blur transition",
    showPlanManualQuickActions
      ? "bottom-20 left-28 gap-1.5 px-2 py-1.5"
      : `left-4 ${visiblePlanCanvasGuidance ? "bottom-40 sm:bottom-20" : "bottom-20"} gap-2 px-3 py-2`,
    planGuidedActionsEnabled
      ? "border-emerald-200 bg-white/95 text-neutral-950 hover:border-emerald-300"
      : "border-neutral-200 bg-white/95 text-neutral-600 hover:border-neutral-300",
  ].join(" ");
  const manualPlanQuickActionButtonClass = (active: boolean, disabled = false) =>
    [
      "group relative grid h-10 w-10 shrink-0 place-items-center rounded-lg border text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-neutral-900/20",
      active
        ? "border-neutral-950 bg-neutral-950 text-white shadow-sm"
        : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
      disabled ? "cursor-not-allowed opacity-45 hover:bg-white" : "",
    ].join(" ");
  const manualPlanQuickActionTooltipClass =
    "pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-950 px-2 py-1 text-[10px] font-semibold text-white shadow-lg group-hover:block group-focus:block group-focus-visible:block";
  const planCanvasGuidanceAccentClass =
    visiblePlanCanvasGuidance?.tone === "blocked"
      ? "bg-amber-500"
      : visiblePlanCanvasGuidance?.tone === "ready"
        ? "bg-emerald-500"
        : "bg-blue-500";
  const planCanvasGuidanceLabelClass =
    visiblePlanCanvasGuidance?.tone === "blocked"
      ? "bg-amber-50 text-amber-800"
      : visiblePlanCanvasGuidance?.tone === "ready"
        ? "bg-emerald-50 text-emerald-800"
        : "bg-blue-50 text-blue-800";
  const planCanvasGuidanceAction = (() => {
    if (!visiblePlanCanvasGuidance?.action || activePlanCanvasInteraction) return null;

    if (visiblePlanCanvasGuidance.action === "scale") {
      return {
        label: "Set scale",
        ariaLabel: "Start plan scale calibration",
        onClick: () => handleFloorPlanCalibrationModeChange(true),
      };
    }

    if (visiblePlanCanvasGuidance.action === "addOpening") {
      return {
        label: "Add door",
        ariaLabel: "Add a door to the floor plan",
        onClick: () => handleAddFloorPlanOpeningFromTool("door"),
      };
    }

    return {
      label: "Furnish",
      ariaLabel: "Open furnishing tools",
      onClick: goFurnish,
    };
  })();
  const planFocusPointCount = floorPlanCalibrationMode
    ? floorPlanCalibrationPoints.length
    : floorPlanTraceOpeningMode
      ? floorPlanTraceOpeningPoints.length
      : floorPlanTraceRoomPoints.length;
  const planFocusCanUndo =
    floorPlanTraceRoomMode &&
    floorPlanDrawRoomMode === "straight_wall" &&
    floorPlanTraceRoomPoints.length > 0;
  const planFocusCanClear = !planFocusCanUndo && planFocusPointCount > 0;
  const planFocusProgressLabel = floorPlanCalibrationMode
    ? `${Math.min(floorPlanCalibrationPoints.length, 2)}/2 points`
    : floorPlanTraceOpeningMode
      ? floorPlanUnderlay
        ? `${Math.min(floorPlanTraceOpeningPoints.length, 2)}/2 points`
        : "Pick wall"
      : floorPlanDrawRoomMode === "straight_wall"
        ? `${floorPlanTraceRoomPoints.length} corner${floorPlanTraceRoomPoints.length === 1 ? "" : "s"}`
        : floorPlanTraceRoomPoints.length > 0
          ? "Corner picked"
          : "Ready";
  const clearPlanFocusPoints = useCallback(() => {
    if (floorPlanCalibrationMode) {
      handleResetFloorPlanCalibrationPoints();
      return;
    }
    if (floorPlanTraceOpeningMode) {
      handleResetFloorPlanTraceOpeningPoints();
      return;
    }
    if (floorPlanTraceRoomMode) {
      handleResetFloorPlanTraceRoomPoints();
    }
  }, [
    floorPlanCalibrationMode,
    floorPlanTraceOpeningMode,
    floorPlanTraceRoomMode,
    handleResetFloorPlanCalibrationPoints,
    handleResetFloorPlanTraceOpeningPoints,
    handleResetFloorPlanTraceRoomPoints,
  ]);
  const activePlacementTargetValid = pendingCatalogPlacement
    ? !pendingCatalogPlacementHardInvalid
    : crossRoomDragTarget?.valid ?? true;
  const activePlacementTargetLabel =
    pendingCatalogPlacementRoom?.name ??
    crossRoomDragTarget?.label ??
    placementTargetRoom?.name ??
    null;
  const qaSnapshotFingerprint = useMemo(
    () =>
      process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS === "1"
        ? fingerprintDesignSnapshot(storedToSnapshot(getStoredDesignForPersistence()))
        : null,
    [getStoredDesignForPersistence]
  );
  const qaScenePerformanceSnapshot = useMemo(
    () =>
      process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS === "1"
        ? {
            mode: scenePerformanceMode,
            effectiveMode: liteSceneEnabled ? "lite" : "quality",
            renderQuality: sceneRenderQuality,
            autoLite: autoLiteScene,
            sceneReady,
            roomCount: designSnapshot.rooms.length,
            activeRoomItemCount: items.length,
            sceneItemCount: sceneRoomItems.length,
            lastFps: scenePerformanceSample.lastFps,
            fpsSamples: scenePerformanceSample.samples,
          }
        : null,
    [
      autoLiteScene,
      designSnapshot.rooms.length,
      items.length,
      liteSceneEnabled,
      scenePerformanceMode,
      scenePerformanceSample.lastFps,
      scenePerformanceSample.samples,
      sceneReady,
      sceneRenderQuality,
      sceneRoomItems.length,
    ]
  );

  return (
    <main
      className="appShell relative min-h-screen w-screen"
      data-theme={showDesignerTheme ? "designer" : "default"}
      style={{ transition: "background 200ms ease, color 200ms ease" }}
    >
      {qaSnapshotFingerprint ? (
        <div
          data-testid="qa-editor-snapshot-fingerprint"
          data-fingerprint={qaSnapshotFingerprint}
          hidden
        />
      ) : null}
      {process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS === "1" ? (
        <div
          data-testid="qa-first-run-activation"
          data-progress={String(firstRunActivationState.progressPercent)}
          data-complete={firstRunActivationState.complete ? "true" : "false"}
          data-next-step={firstRunActivationState.nextStep?.id ?? "complete"}
          data-steps={firstRunActivationState.steps
            .map((step) => `${step.id}:${step.complete ? "done" : "todo"}`)
            .join(",")}
          hidden
        />
      ) : null}
      {qaScenePerformanceSnapshot ? (
        <div
          data-testid="qa-scene-performance"
          data-mode={qaScenePerformanceSnapshot.mode}
          data-effective-mode={qaScenePerformanceSnapshot.effectiveMode}
          data-render-quality={qaScenePerformanceSnapshot.renderQuality}
          data-auto-lite={qaScenePerformanceSnapshot.autoLite ? "true" : "false"}
          data-scene-ready={qaScenePerformanceSnapshot.sceneReady ? "true" : "false"}
          data-room-count={String(qaScenePerformanceSnapshot.roomCount)}
          data-active-room-item-count={String(qaScenePerformanceSnapshot.activeRoomItemCount)}
          data-scene-item-count={String(qaScenePerformanceSnapshot.sceneItemCount)}
          data-last-fps={
            qaScenePerformanceSnapshot.lastFps === null
              ? ""
              : String(qaScenePerformanceSnapshot.lastFps)
          }
          data-fps-samples={String(qaScenePerformanceSnapshot.fpsSamples)}
          hidden
        />
      ) : null}
      <div className="absolute inset-0">
        <div
          className="relative h-full w-full"
          onDragOver={handleCatalogCanvasDragOver}
          onDrop={handleCatalogCanvasDrop}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            if (!dragCatalogIntent) return;
            setHoverCatalogPlacement(null);
            setCrossRoomDragTarget((current) => (current?.kind === "preview" ? null : current));
          }}
        >
          <CanvasErrorBoundary>
          <Canvas
            data-testid="scene-canvas"
            style={{ cursor: planCanvasCursor }}
            shadows={false}
            dpr={liteSceneEnabled ? [1, 1] : [1, 2]}
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
              safeAreaLeftPx={plan2DSafeAreaLeftPx}
              safeAreaBottomPx={plan2DSafeAreaBottomPx}
            />
            <color attach="background" args={["#ffffff"]} />
            <LoadingOverlay />
            <SceneProgressBridge onReadyChange={setSceneReady} />
            <ScenePerformanceBridge
              enabled={viewMode === "3d" && scenePerformanceMode === "auto" && !liteSceneEnabled}
              onFpsSample={handleScenePerformanceSample}
              onSustainedLowFps={handleSustainedLowFps}
            />
            <Suspense fallback={null}>
              <Environment resolution={liteSceneEnabled ? 32 : 128}>
                <Lightformer
                  intensity={liteSceneEnabled ? 0.55 : 0.9}
                  color={lightConfig.keyColor ?? "#ffffff"}
                  position={[5, 6, 4]}
                  rotation={[0, Math.PI / 4, 0]}
                  scale={[8, 8, 1]}
                />
                <Lightformer
                  intensity={liteSceneEnabled ? 0.2 : 0.45}
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
                    traceOpeningKind={floorPlanTraceOpeningKind}
                    rooms={housePlan2D.rooms}
                    existingOpenings={editorScene2D.openings}
                    onTraceOpeningPoint={handleFloorPlanTraceOpeningPoint}
                  />
                  <RoomRenderer2D
                    width={planViewWidth}
                    depth={planViewDepth}
                    rooms={housePlan2D.rooms}
                    activeRoomId={selectedPlanRoomId}
                    onSelectRoom={handlePlacementAwareRoomSelect}
                    onClearRoomSelection={
                      floorPlanCalibrationMode ? undefined : clearAllSelection
                    }
                    onRenameRoom={handleRenameSelectedPlanRoom}
                    onDuplicateRoom={handleDuplicateSelectedPlanRoom}
                    onDeleteRoom={handleDeleteSelectedPlanRoom}
                    onFitRoom={handleFitSelectedPlanRoom}
                    onMoveRoom={handleMoveRoom2D}
                    onResizeRoom={handleResizeRoom2D}
                    measurementUnit={planMeasurementUnit}
                    theme={effectivePlanTheme}
                    showGrid={effectivePlanLayers.grid}
                    showDimensions={effectivePlanLayers.dimensions}
                    showLabels={effectivePlanLayers.labels}
                    showOpenings={effectivePlanLayers.openings}
                    showBuiltIns={effectivePlanLayers.builtIns}
                    showAnnotations={effectivePlanLayers.annotations}
                    showZones={effectivePlanLayers.zones}
                    interactive={editorMode !== "present"}
                    selectedOverlayId={selectedPlanOverlayId}
                    onSelectOverlay={handleSelectPlanOverlay}
                    onDeleteOverlay={deletePlanOverlayById}
                    onMoveOpening={handleMoveOpening2D}
                    onAddDoorwaySuggestion={handleAddSuggestedDoorway}
                    onMoveFixedElement={handleMoveFixedElement2D}
                    onMoveAnnotation={handleMoveAnnotation2D}
                    drawRoomMode={blankGridRoomDrawActive}
                    drawRoomPoints={floorPlanTraceRoomPoints}
                    drawRoomPreviewPoint={blankGridRoomPreviewPoint}
                    onDrawRoomPoint={handleBlankGridRoomDrawPoint}
                    onDrawRoomPreviewPoint={handleBlankGridRoomDrawPreviewPoint}
                    onCommitRoomDimensionEdit={handleCommitRoomDimensionEdit2D}
                    onCommitWallDrawSegmentLength={handleCommitWallDrawSegmentLength2D}
	                    onDrawRoomDrag={handleBlankGridRoomDrawDrag}
	                    drawRoomInteractionMode={floorPlanDrawRoomMode}
                    traceOpeningMode={floorPlanTraceOpeningMode && !floorPlanUnderlay}
                    traceOpeningKind={floorPlanTraceOpeningKind}
                    onTraceOpeningPoint={handleBlankGridTraceOpeningPoint}
                    cameraNavigation={{
                      enabled: isDesigner && !floorPlanTraceRoomMode && !floorPlanTraceOpeningMode,
                      cameraPosition: cameraView.pos,
                      cameraTarget: cameraView.target,
                      onMoveCamera: handleWholeHomeMoveCamera,
                      onMoveTarget: handleWholeHomeMoveTarget,
                    }}
                    openings={mapPlanOpeningsToRoomRenderer(editorScene2D.openings)}
                    fixedElements={mapPlanFixedElementsToRoomRenderer(editorScene2D.fixedElements)}
                    annotations={mapPlanAnnotationsToRoomRenderer(editorScene2D.annotations)}
                    zones={planZones2D}
                  />
                </>
              ) : (
                usesHousePlanScene ? (
                  <HousePlanRenderer3D
                    rooms={sceneHousePlanRooms3D}
                    openings={mapPlanOpeningsToRoomRenderer(editorScene2D.openings)}
                    activeRoomId={designSnapshot.activeRoomId}
                    activeFloorLevel={activeFloorLevel}
                    wallHeight={Math.min(roomHeight, 1.55)}
                    stackedFloors={stackedFloorView}
                    fadeInactiveFloors
                    interactive={editorMode !== "present" && !isClientPreview}
                    onSelectRoom={handlePlacementAwareRoomSelect}
                  />
                ) : (
                  <Room
                    width={roomWidth}
                    depth={roomDepth}
                    height={roomHeight}
                    wallThickness={wallThickness}
                    slabThickness={activeRoom?.geometry.slabThickness ?? ROOM_DIMENSION_DEFAULTS.slabThickness}
                    wallOpacity={activeRoomWallOpacity}
                    floorOpacity={activeRoomFloorOpacity}
                    ceilingOpacity={activeRoomCeilingOpacity}
                    ceilingVisible={activeRoomCeilingVisible}
                    ceilingColor={activeRoomCeilingColor}
                    renderQuality={sceneRenderQuality}
                  />
                )
              )}

              {placementTargetPlanRoom && (pendingCatalogPlacement || crossRoomDragTarget) && (
                <group
                  position={[placementTargetPlanRoom.x, 0.062, placementTargetPlanRoom.z]}
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  <mesh>
                    <planeGeometry args={[placementTargetPlanRoom.w, placementTargetPlanRoom.d]} />
                    <meshBasicMaterial
                      color={activePlacementTargetValid ? "#10b981" : "#ef4444"}
                      transparent
                      opacity={activePlacementTargetValid ? 0.13 : 0.16}
                      depthWrite={false}
                    />
                  </mesh>
                  <Line
                    points={[
                      [-placementTargetPlanRoom.w / 2, -placementTargetPlanRoom.d / 2, 0.01],
                      [placementTargetPlanRoom.w / 2, -placementTargetPlanRoom.d / 2, 0.01],
                      [placementTargetPlanRoom.w / 2, placementTargetPlanRoom.d / 2, 0.01],
                      [-placementTargetPlanRoom.w / 2, placementTargetPlanRoom.d / 2, 0.01],
                      [-placementTargetPlanRoom.w / 2, -placementTargetPlanRoom.d / 2, 0.01],
                    ]}
                    color={activePlacementTargetValid ? "#059669" : "#dc2626"}
                    lineWidth={3}
                  />
                </group>
              )}

              <DesignerGrid
                visible={isDesigner && showGrid && !isClientPreview && (editorMode === "design" || editorMode === "adjust")}
                pulse={gridPulse}
              />

              {circulationHeatmap && (
                <CirculationHeatmapOverlay
                  cells={circulationHeatmap.analysis.heatmap}
                  roomOffset={circulationHeatmap.roomOffset}
                />
              )}

              {!isClientPreview &&
                editorMode !== "present" &&
                zones.map((zone) => {
                  const bounds = getZoneBounds(zone);
                  if (!bounds) return null;
                  const compatible = activePlacementCompatibleZoneIds.has(zone.id);
                  const showingPlacementZones =
                    pendingCatalogPlacement !== null || hoverCatalogPlacement !== null;
                  return (
                    <SceneZoneOutline
                      key={zone.id}
                      data-testid={zone.type === "seating" ? "seating-zone" : `${zone.type}-zone`}
                      bounds={bounds}
                      label={getZoneLabel(zone.type)}
                      selected={zone.id === selectedZoneId}
                      highlighted={compatible}
                      dimmed={showingPlacementZones && !compatible}
                      helperLabel={compatible ? `Tap to place in ${getZoneLabel(zone.type)}` : undefined}
                      onSelect={() => {
                        if (pendingCatalogPlacement) {
                          if (!compatible || !activeRoom) {
                            showRuleToast(`${getZoneLabel(zone.type)} is not a recommended zone for this item`);
                            return;
                          }
                          targetPendingCatalogPlacementToRoom(activeRoom.id, {
                            source: "zone",
                            localPosition: [bounds.centerX, 0, bounds.centerZ],
                            zoneLabel: getZoneLabel(zone.type),
                          });
                          return;
                        }
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
                    onDuplicate={() => {
                      if (it.instanceId !== selectedInstanceId) return;
                      duplicateSelectedItem();
                    }}
                    onDelete={() => {
                      if (it.instanceId !== selectedInstanceId) return;
                      deleteSelectedItem();
                    }}
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
                    planShowLabels={effectivePlanLayers.labels}
                    planShowDimensions={effectivePlanLayers.dimensions}
                    planMeasurementUnit={planMeasurementUnit}
                    renderQuality={sceneRenderQuality}
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
                        const pointerRoom = hasWholeHousePlan
                          ? findPlanRoomAtWorldPoint(pos[0], pos[2])
                          : null;
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

                          if (
                            pointerRoom &&
                            pointerRoom.id !== sceneEntry.roomId &&
                            hasWholeHousePlan
                          ) {
                            const targetRoom = roomSnapshotById.get(pointerRoom.id);
                            const targetPlanRoom = houseRoomById.get(pointerRoom.id);
                            if (!targetRoom || !targetPlanRoom) {
                              setCrossRoomDragTarget(null);
                              return true;
                            }
                            const targetLocalPos: [number, number, number] = [
                              pos[0] - targetPlanRoom.x,
                              pos[1] ?? 0,
                              pos[2] - targetPlanRoom.z,
                            ];
                            const [safeX, safeZ] = clampToCatalogPlacementRoom(
                              targetRoom,
                              targetLocalPos[0],
                              targetLocalPos[2],
                              configuredPlanningDims.w / 1000,
                              configuredPlanningDims.d / 1000,
                              mover.rotationY ?? 0
                            );
                            const blocker = findCatalogPlacementBlockerInRoom(
                              targetRoom,
                              mover.productId,
                              [safeX, targetLocalPos[1], safeZ],
                              mover.rotationY ?? 0,
                              configuredPlanningDims
                            );
                            setCrossRoomDragTarget({
                              roomId: targetRoom.id,
                              label: blocker
                                ? getItemDisplayName(blocker) ?? targetRoom.name
                                : targetRoom.name,
                              valid: !blocker,
                              kind: "item",
                            });
                            return true;
                          }

                          if (hasWholeHousePlan) {
                            setCrossRoomDragTarget({
                              roomId: sceneEntry.roomId,
                              label: roomSnapshotById.get(sceneEntry.roomId)?.name ?? "Current room",
                              valid: true,
                              kind: "item",
                            });
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

                        if (
                          pointerRoom &&
                          pointerRoom.id !== sceneEntry.roomId &&
                          hasWholeHousePlan
                        ) {
                          const targetRoom = roomSnapshotById.get(pointerRoom.id);
                          setCrossRoomDragTarget({
                            roomId: pointerRoom.id,
                            label: targetRoom?.name ?? "Target room",
                            valid: Boolean(targetRoom),
                            kind: "item",
                          });
                          return true;
                        }

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
                    onDragPointerMove={hasWholeHousePlan ? nudgeWholeHomeCameraForDrag : undefined}
                    onRotate={(id: string, rotY: number, meta) =>
                      applyItemRotation(id, rotY, {
                        source: meta?.source ?? "canvas",
                        snap: meta?.snap,
                      })
                    }
                    locked={it.locked}
                    interactive={canEdit && isActiveSceneRoom}
                    allowCrossRoomDrag={hasWholeHousePlan && isActiveSceneRoom}
                    showSelection={canEdit && isActiveSceneRoom}
                    showLocks={isDesigner && !isClientPreview && isActiveSceneRoom}
                    onSnapPulse={triggerGridPulse}
                    enableSnap={
                      snapEnabled && !isClientPreview && isActiveSceneRoom && !hasWholeHousePlan
                    }
                    items={isActiveSceneRoom ? activeSceneItemsForGuides : []}
                    itemPlanningBoundsByInstanceId={itemPlanningBoundsByInstanceId}
                    materialPreset={effectiveMaterialPreset}
                    materialOverrides={it.materialOverrides}
                    onDragEnd={(id: string, pos: [number, number, number]) => {
                      try {
                        if (!isActiveSceneRoom) return;
                        const pointerRoom = hasWholeHousePlan
                          ? findPlanRoomAtWorldPoint(pos[0], pos[2])
                          : null;
                        if (hasWholeHousePlan) {
                          setCrossRoomDragTarget(null);
                          if (!pointerRoom) return;
                          const targetRoom = roomSnapshotById.get(pointerRoom.id);
                          if (targetRoom && pointerRoom.id !== sceneEntry.roomId) {
                            const selectedSet = selectedIdsRef.current;
                            if (selectedSet.size > 1 && selectedSet.has(id)) {
                              moveSelectedItemToRoom(targetRoom.id);
                              return;
                            }
                            transferItemToRoom(id, sceneEntry.roomId, targetRoom, pos);
                            return;
                          }
                        }
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
              {aiLayoutPreviewFootprints.length > 0 && (
                <group name="ai-layout-preview-layer">
                  {aiLayoutPreviewFootprints.map((preview, index) => (
                    <group
                      key={preview.id}
                      name={`ai-layout-preview-${preview.id}`}
                      position={preview.position}
                      rotation={[0, preview.rotationY, 0]}
                    >
                      <mesh position={[0, 0.018 + index * 0.001, 0]}>
                        <boxGeometry args={[preview.width, 0.035, preview.depth]} />
                        <meshBasicMaterial
                          color={aiLayoutPreviewTone.fill}
                          transparent
                          opacity={0.2}
                          depthWrite={false}
                        />
                      </mesh>
                      <Line
                        points={preview.outlinePoints}
                        color={aiLayoutPreviewTone.line}
                        lineWidth={3}
                        transparent
                        opacity={0.86}
                      />
                    </group>
                  ))}
                </group>
              )}
              {pendingCatalogPlacementScene && (
                <>
                  <mesh
                    position={[
                      hasWholeHousePlan ? 0 : pendingCatalogPlacementScene.roomOffset.x,
                      0.055,
                      hasWholeHousePlan ? 0 : pendingCatalogPlacementScene.roomOffset.z,
                    ]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    onPointerDown={handleCatalogPlacementPointerDown}
                    onPointerMove={handleCatalogPlacementPointerMove}
                    onPointerUp={handleCatalogPlacementPointerUp}
                    onPointerCancel={handleCatalogPlacementPointerUp}
                  >
                    <planeGeometry
                      args={[
                        hasWholeHousePlan
                          ? Math.max(planViewWidth, 1)
                          : pendingCatalogPlacementRoom?.geometry.width ?? roomWidth,
                        hasWholeHousePlan
                          ? Math.max(planViewDepth, 1)
                          : pendingCatalogPlacementRoom?.geometry.depth ?? roomDepth,
                      ]}
                    />
                    <meshBasicMaterial
                      color="#ffffff"
                      transparent
                      opacity={0.002}
                      depthWrite={false}
                    />
                  </mesh>
                  <group
                    position={pendingCatalogPlacementScene.position}
                    rotation={[0, pendingCatalogPlacementScene.rotationY, 0]}
                    onPointerDown={handleCatalogPlacementPointerDown}
                    onPointerMove={handleCatalogPlacementPointerMove}
                    onPointerUp={handleCatalogPlacementPointerUp}
                    onPointerCancel={handleCatalogPlacementPointerUp}
                  >
                    <mesh position={[0, 0.015, 0]}>
                      <boxGeometry
                        args={[
                          pendingCatalogPlacementScene.width,
                          0.03,
                          pendingCatalogPlacementScene.depth,
                        ]}
                      />
                      <meshBasicMaterial
                        color={pendingCatalogPlacementHardInvalid ? "#ef4444" : "#22c55e"}
                        transparent
                        opacity={pendingCatalogPlacementHardInvalid ? 0.28 : 0.24}
                        depthWrite={false}
                      />
                    </mesh>
                  <Line
                    points={pendingCatalogPlacementScene.outlinePoints}
                    color={pendingCatalogPlacementHardInvalid ? "#dc2626" : "#16a34a"}
                    lineWidth={4}
                  />
                </group>
              </>
            )}
              {!pendingCatalogPlacementScene && hoverCatalogPlacementScene && (
                <group
                  data-testid="catalog-placement-hover-ghost"
                  position={hoverCatalogPlacementScene.position}
                  rotation={[0, hoverCatalogPlacementScene.rotationY, 0]}
                >
                  <mesh position={[0, 0.01, 0]}>
                    <boxGeometry
                      args={[
                        hoverCatalogPlacementScene.width,
                        0.02,
                        hoverCatalogPlacementScene.depth,
                      ]}
                    />
                    <meshBasicMaterial
                      color="#2563eb"
                      transparent
                      opacity={0.12}
                      depthWrite={false}
                    />
                  </mesh>
                  <Line
                    points={hoverCatalogPlacementScene.outlinePoints}
                    color="#2563eb"
                    lineWidth={2}
                    transparent
                    opacity={0.55}
                  />
                </group>
              )}
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
                target={[plan2DCameraTarget.x, 0, plan2DCameraTarget.z]}
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
                minDistance={EDITOR_3D_MIN_CAMERA_DISTANCE}
                maxDistance={Math.max(24, Math.max(planViewWidth, planViewDepth) * 6)}
                minPolarAngle={EDITOR_3D_MIN_POLAR_ANGLE}
                maxPolarAngle={EDITOR_3D_MAX_POLAR_ANGLE}
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
            <div
              className={
                compactRoomPlanStatusBar
                  ? "absolute left-1/2 top-[4.5rem] z-30 -translate-x-1/2"
                  : "absolute left-1/2 top-20 z-30 -translate-x-1/2"
              }
            >
              <RoomPlanStatusBar
                roomName={activeRoom.name}
                roomTypeLabel={getRoomTypeLabel(activeRoom.roomType)}
                roomCount={designSnapshot.rooms.length}
                widthMeters={roomWidth}
                depthMeters={roomDepth}
                healthLevel={showRoomPlanStatusHealth ? activeRoomHealthSummary?.level : undefined}
                healthScore={showRoomPlanStatusHealth ? activeRoomHealthSummary?.placementScore : undefined}
                healthNextAction={showRoomPlanStatusHealth ? activeRoomHealthSummary?.nextAction : undefined}
                viewMode={viewMode}
                disabled={editorMode === "present"}
                dark={showDesignerTheme}
                compact={compactRoomPlanStatusBar}
                onViewModeChange={handleEditorViewModeChange}
                onReviewHealth={reviewActiveRoomHealth}
                onFitPlan={handleFitPlanView}
                onRenameRoom={() => handleRenameSelectedPlanRoom(activeRoom.id)}
              />
            </div>
          )}

          {showPlanGuidedActionsChoice && (
            <div
              data-testid="plan-guided-actions-choice"
              className="pointer-events-auto absolute bottom-32 left-4 z-30 w-[min(calc(100vw-2rem),360px)] rounded-xl border border-neutral-200 bg-white/95 p-3 shadow-xl backdrop-blur"
              role="group"
              aria-label="Choose plan action mode"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-neutral-950">Plan mode</div>
                  <div className="mt-0.5 text-xs leading-5 text-neutral-600">
                    Pick a starting style. Change it anytime.
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="plan-guided-actions-choice-dismiss"
                  className="shrink-0 rounded-lg border border-neutral-200 px-2 py-1 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-50"
                  onClick={() => setPlanGuidedActionsChoiceSeen(true)}
                >
                  Close
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="plan-guided-actions-choice-guided"
                  className="min-h-10 rounded-lg bg-neutral-950 px-3 text-xs font-semibold text-white hover:bg-neutral-800"
                  onClick={() => choosePlanGuidedActionsMode(true)}
                >
                  Guided setup
                </button>
                <button
                  type="button"
                  data-testid="plan-guided-actions-choice-manual"
                  className="min-h-10 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
                  onClick={() => choosePlanGuidedActionsMode(false)}
                >
                  Manual editing
                </button>
              </div>
            </div>
          )}

          {showPlanManualQuickActions && (
            <div
              data-testid="plan-manual-quick-actions"
              className="pointer-events-auto absolute bottom-32 left-4 z-30 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1 rounded-xl border border-neutral-200 bg-white/95 p-1 shadow-xl backdrop-blur"
              role="toolbar"
              aria-label="Manual plan actions"
            >
              <button
                type="button"
                data-testid="manual-plan-action-select"
                className={manualPlanQuickActionButtonClass(activeFloorPlanTool === "select")}
                aria-label="Select plan objects"
                aria-pressed={activeFloorPlanTool === "select"}
                title="Select"
                onClick={handleSelectFloorPlanTool}
              >
                <ManualPlanActionIcon name="select" />
                <span className="sr-only">Select</span>
                <span
                  data-testid="manual-plan-action-select-tooltip"
                  className={manualPlanQuickActionTooltipClass}
                  aria-hidden="true"
                >
                  Select
                </span>
              </button>
              {floorPlanUnderlay && (
                <button
                  type="button"
                  data-testid="manual-plan-action-scale"
                  className={manualPlanQuickActionButtonClass(floorPlanCalibrationMode, !canManualScalePlan)}
                  disabled={!canManualScalePlan}
                  aria-label="Set plan scale"
                  aria-pressed={floorPlanCalibrationMode}
                  title={canManualScalePlan ? "Set scale" : "Scale is unavailable for this upload"}
                  onClick={() => {
                    setGuidedPlanStartMode("upload");
                    handleFloorPlanCalibrationModeChange(true);
                  }}
                >
                  <ManualPlanActionIcon name="scale" />
                  <span className="sr-only">Set scale</span>
                  <span
                    data-testid="manual-plan-action-scale-tooltip"
                    className={manualPlanQuickActionTooltipClass}
                    aria-hidden="true"
                  >
                    {canManualScalePlan ? "Set scale" : "Scale unavailable"}
                  </span>
                </button>
              )}
              <button
                type="button"
                data-testid="manual-plan-action-draw"
                className={manualPlanQuickActionButtonClass(activeFloorPlanTool === "draw_room")}
                aria-label="Draw room"
                aria-pressed={activeFloorPlanTool === "draw_room"}
                title="Draw room"
                onClick={() => {
                  setGuidedPlanStartMode("draw");
                  handleFloorPlanDrawRoomModeChange("rectangle_wall");
                }}
              >
                <ManualPlanActionIcon name="draw" />
                <span className="sr-only">Draw room</span>
                <span
                  data-testid="manual-plan-action-draw-tooltip"
                  className={manualPlanQuickActionTooltipClass}
                  aria-hidden="true"
                >
                  Draw room
                </span>
              </button>
              <button
                type="button"
                data-testid="manual-plan-action-door"
                className={manualPlanQuickActionButtonClass(activeFloorPlanTool === "door", housePlan2D.rooms.length === 0)}
                disabled={housePlan2D.rooms.length === 0}
                aria-label={housePlan2D.rooms.length === 0 ? "Draw a room first to add a door" : "Add door"}
                aria-pressed={activeFloorPlanTool === "door"}
                title={housePlan2D.rooms.length === 0 ? "Draw a room first" : "Add door"}
                onClick={() => handleAddFloorPlanOpeningFromTool("door")}
              >
                <ManualPlanActionIcon name="door" />
                <span className="sr-only">Add door</span>
                <span
                  data-testid="manual-plan-action-door-tooltip"
                  className={manualPlanQuickActionTooltipClass}
                  aria-hidden="true"
                >
                  {housePlan2D.rooms.length === 0 ? "Draw room first" : "Add door"}
                </span>
              </button>
              <button
                type="button"
                data-testid="manual-plan-action-window"
                className={manualPlanQuickActionButtonClass(activeFloorPlanTool === "window", housePlan2D.rooms.length === 0)}
                disabled={housePlan2D.rooms.length === 0}
                aria-label={housePlan2D.rooms.length === 0 ? "Draw a room first to add a window" : "Add window"}
                aria-pressed={activeFloorPlanTool === "window"}
                title={housePlan2D.rooms.length === 0 ? "Draw a room first" : "Add window"}
                onClick={() => handleAddFloorPlanOpeningFromTool("window")}
              >
                <ManualPlanActionIcon name="window" />
                <span className="sr-only">Add window</span>
                <span
                  data-testid="manual-plan-action-window-tooltip"
                  className={manualPlanQuickActionTooltipClass}
                  aria-hidden="true"
                >
                  {housePlan2D.rooms.length === 0 ? "Draw room first" : "Add window"}
                </span>
              </button>
              <button
                type="button"
                data-testid="manual-plan-action-fit"
                className={manualPlanQuickActionButtonClass(false)}
                aria-label="Fit plan to screen"
                title="Fit plan"
                onClick={handleFitPlanView}
              >
                <ManualPlanActionIcon name="fit" />
                <span className="sr-only">Fit plan</span>
                <span
                  data-testid="manual-plan-action-fit-tooltip"
                  className={manualPlanQuickActionTooltipClass}
                  aria-hidden="true"
                >
                  Fit plan
                </span>
              </button>
            </div>
          )}

          {showPlanGuidedActionsToggle && (
            <button
              type="button"
              data-testid="plan-guided-actions-toggle"
              data-enabled={planGuidedActionsEnabled ? "true" : "false"}
              data-compact={showPlanManualQuickActions ? "true" : "false"}
              role="switch"
              aria-checked={planGuidedActionsEnabled}
              aria-label={
                planGuidedActionsEnabled
                  ? "Turn guided actions off"
                  : "Turn guided actions on"
              }
              className={planGuidedActionsToggleClass}
              onClick={() => {
                setPlanGuidedActionsEnabled((enabled) => !enabled);
              }}
            >
              <span>{showPlanManualQuickActions ? "Guided" : "Guided actions"}</span>
              <span
                className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                  planGuidedActionsEnabled ? "bg-emerald-500" : "bg-neutral-300"
                }`}
                aria-hidden="true"
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${
                    planGuidedActionsEnabled ? "left-4" : "left-0.5"
                  }`}
                />
              </span>
              <span className={planGuidedActionsEnabled ? "text-emerald-700" : "text-neutral-500"}>
                {planGuidedActionsEnabled ? "On" : "Off"}
              </span>
            </button>
          )}

          {activePlanCanvasInteraction && (
            <div
              data-testid="plan-focus-control"
              data-focused={planCanvasFocusActive ? "true" : "false"}
              className="absolute left-4 top-20 z-30 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white/95 px-2.5 py-2 shadow-xl backdrop-blur"
              role="toolbar"
              aria-label="Plan focus controls"
            >
              <span className="flex min-w-0 items-center gap-2 pr-1">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                <span className="truncate text-xs font-semibold text-neutral-800">
                  {floorPlanCalibrationMode
                    ? "Scaling plan"
                    : floorPlanTraceOpeningMode
                      ? floorPlanTraceOpeningKind === "window"
                        ? "Placing window"
                        : "Placing door"
                      : "Drawing room"}
                </span>
                <span
                  data-testid="plan-focus-progress"
                  className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600"
                >
                  {planFocusProgressLabel}
                </span>
                {!planGuidedActionsEnabled && (
                  <span
                    data-testid="plan-focus-manual-mode"
                    className="shrink-0 rounded-full bg-neutral-950 px-2 py-0.5 text-[11px] font-semibold text-white"
                  >
                    Manual
                  </span>
                )}
              </span>
              {planFocusCanUndo && (
                <button
                  type="button"
                  data-testid="plan-focus-undo"
                  className="shrink-0 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                  onClick={() => {
                    handleUndoFloorPlanTraceRoomPoint();
                  }}
                >
                  Undo
                </button>
              )}
              {planFocusCanClear && (
                <button
                  type="button"
                  data-testid="plan-focus-clear"
                  className="shrink-0 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                  onClick={clearPlanFocusPoints}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                data-testid="plan-focus-panel-toggle"
                className="shrink-0 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                onClick={() => {
                  setDesignPanelOpen(true);
                  setPlanFocusPanelRevealed((value) => !value);
                }}
              >
                {planCanvasFocusActive ? "Panel" : "Focus"}
              </button>
              <button
                type="button"
                data-testid="plan-focus-done"
                aria-label={planGuidedActionsEnabled ? "Finish plan focus mode" : "Cancel manual plan tool"}
                className="shrink-0 rounded-lg bg-neutral-950 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
                onClick={() => {
                  handleSelectFloorPlanTool();
                  setPlanFocusPanelRevealed(false);
                }}
              >
                {planGuidedActionsEnabled ? "Done" : "Cancel"}
              </button>
            </div>
          )}

          {visiblePlanCanvasGuidance && (
            <div
              data-testid="plan-canvas-guidance"
              data-tone={visiblePlanCanvasGuidance.tone}
              className="pointer-events-none absolute bottom-20 left-1/2 z-30 w-[min(92vw,390px)] -translate-x-1/2 rounded-xl border border-neutral-200 bg-white/95 px-3 py-2.5 shadow-xl backdrop-blur sm:bottom-6"
              role={planCanvasGuidanceAction ? "group" : "status"}
              aria-label={planCanvasGuidanceAction ? visiblePlanCanvasGuidance.title : undefined}
              aria-live="polite"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${planCanvasGuidanceAccentClass}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-semibold text-neutral-950">
                      {visiblePlanCanvasGuidance.title}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {planCanvasGuidanceAction ? (
                        <button
                          type="button"
                          data-testid="plan-canvas-guidance-action"
                          aria-label={planCanvasGuidanceAction.ariaLabel}
                          className="pointer-events-auto rounded-lg bg-neutral-950 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
                          onClick={(event) => {
                            event.stopPropagation();
                            planCanvasGuidanceAction.onClick();
                          }}
                        >
                          {planCanvasGuidanceAction.label}
                        </button>
                      ) : (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${planCanvasGuidanceLabelClass}`}
                        >
                          {visiblePlanCanvasGuidance.label}
                        </span>
                      )}
                      {planCanvasGuidanceDismissible && planCanvasGuidanceKey && (
                        <button
                          type="button"
                          data-testid="plan-canvas-guidance-dismiss"
                          aria-label="Hide plan tip"
                          className="pointer-events-auto rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDismissedPlanCanvasGuidanceKey(planCanvasGuidanceKey);
                          }}
                        >
                          Hide
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-0.5 text-xs leading-5 text-neutral-600">
                    {visiblePlanCanvasGuidance.detail}
                  </div>
                </div>
              </div>
            </div>
          )}

          {showEmptyPlanCanvasPrompt && (
            <div
              data-testid="empty-plan-canvas-prompt"
              className="absolute left-1/2 top-1/2 z-20 w-[min(90vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-200 bg-white/95 p-4 text-center shadow-2xl backdrop-blur"
            >
              <div className="text-base font-semibold text-neutral-950">Create your first room</div>
              <div className="mt-1 text-sm text-neutral-500">
                Start with a room size, then add doors, windows, and furniture.
              </div>
              <button
                type="button"
                className="mt-4 min-h-11 rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white hover:bg-neutral-800"
                onClick={() => {
                  setDesignPanelOpen(true);
                  goPlan();
                  setGuidedPlanStartMode("start");
                }}
              >
                Start room
              </button>
            </div>
          )}

          {showDesignToolsRestoreButton && (
            <button
              type="button"
              data-testid="design-tools-restore"
              className="pointer-events-auto absolute bottom-4 left-4 z-30 rounded-xl border border-neutral-200 bg-white/95 px-3 py-2 text-xs font-semibold text-neutral-800 shadow-xl backdrop-blur hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
              aria-label={`Show ${hiddenDesignToolsLabel.toLowerCase()}`}
              onClick={() => {
                setDesignPanelOpen(true);
                setPlanFocusPanelRevealed(false);
              }}
            >
              {hiddenDesignToolsLabel}
            </button>
          )}

          {pendingAiLayoutProposal && !isClientPreview && (
            <div
              data-testid="ai-layout-preview-banner"
              className={
                showDesignerTheme
                  ? "absolute left-1/2 top-36 z-30 flex w-[min(92vw,620px)] -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-300/25 bg-[#151820]/95 px-4 py-3 text-sm text-neutral-100 shadow-xl backdrop-blur"
                  : "absolute left-1/2 top-36 z-30 flex w-[min(92vw,620px)] -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-white/95 px-4 py-3 text-sm text-neutral-800 shadow-xl backdrop-blur"
              }
            >
              <div className="min-w-0">
                <div className="font-semibold">
                  Previewing AI proposal
                  <span className={showDesignerTheme ? "ml-2 text-emerald-200" : "ml-2 text-emerald-700"}>
                    {aiLayoutPreviewTone.text}
                  </span>
                </div>
                <div className={showDesignerTheme ? "mt-0.5 truncate text-xs text-neutral-300" : "mt-0.5 truncate text-xs text-neutral-600"}>
                  {pendingAiLayoutProposal.items.length} item
                  {pendingAiLayoutProposal.items.length === 1 ? "" : "s"} shown on canvas
                  {pendingAiLayoutProposal.itemNames.length > 0
                    ? `: ${pendingAiLayoutProposal.itemNames.slice(0, 3).join(", ")}`
                    : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  data-testid="ai-layout-preview-apply"
                  className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                  onClick={applyPendingAiLayoutProposal}
                >
                  Apply
                </button>
                <button
                  type="button"
                  data-testid="ai-layout-preview-dismiss"
                  className={
                    showDesignerTheme
                      ? "rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-neutral-100 hover:bg-white/10"
                      : "rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                  }
                  onClick={() => setPendingAiLayoutProposal(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {viewMode === "3d" && !isClientPreview && (
            <div
              data-testid="scene-performance-control"
              className={
                showDesignerTheme
                  ? `absolute left-4 top-20 z-30 flex items-center gap-2 rounded-lg border border-white/10 bg-[#151820]/90 p-1.5 text-xs font-semibold text-neutral-200 shadow-xl backdrop-blur ${
                      designControlsPanelVisibleForLayout
                        ? isDesigner
                          ? "md:left-[28rem] md:top-56"
                          : "md:left-[23.5rem] md:top-56"
                        : ""
                    }`
                  : `absolute left-4 top-20 z-30 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white/90 p-1.5 text-xs font-semibold text-neutral-700 shadow-xl backdrop-blur ${
                      designControlsPanelVisibleForLayout
                        ? isDesigner
                          ? "md:left-[28rem] md:top-56"
                          : "md:left-[23.5rem] md:top-56"
                        : ""
                    }`
              }
              aria-label="Scene quality"
            >
              <span
                className={
                  showDesignerTheme
                    ? "hidden px-1 text-neutral-400 sm:inline"
                    : "hidden px-1 text-neutral-500 sm:inline"
                }
              >
                Scene
              </span>
              {(["auto", "quality", "lite"] as const).map((option) => {
                const active = scenePerformanceMode === option;
                const label =
                  option === "auto"
                    ? liteSceneEnabled
                      ? "Auto Lite"
                      : "Auto"
                    : option === "quality"
                      ? "Quality"
                      : "Lite";
                return (
                  <button
                    key={option}
                    type="button"
                    data-testid={`scene-performance-${option}`}
                    data-active={active ? "true" : "false"}
                    className={
                      active
                        ? showDesignerTheme
                          ? "rounded-md bg-blue-500 px-2.5 py-1.5 text-white"
                          : "rounded-md bg-neutral-950 px-2.5 py-1.5 text-white"
                        : showDesignerTheme
                          ? "rounded-md px-2.5 py-1.5 text-neutral-300 hover:bg-white/10"
                          : "rounded-md px-2.5 py-1.5 text-neutral-600 hover:bg-neutral-100"
                    }
                    onClick={() => handleScenePerformanceModeChange(option)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {crossRoomDragTarget?.kind === "item" && (
            <div
              data-testid="cross-room-drag-target"
              className={`pointer-events-none absolute left-1/2 top-36 z-30 -translate-x-1/2 rounded-full border px-4 py-2 text-sm font-semibold shadow-xl backdrop-blur ${
                crossRoomDragTarget.valid
                  ? "border-emerald-200 bg-white/95 text-emerald-800"
                  : "border-red-200 bg-white/95 text-red-700"
              }`}
            >
              {crossRoomDragTarget.valid
                ? `Drop in ${crossRoomDragTarget.label}`
                : `Blocked by ${crossRoomDragTarget.label}`}
            </div>
          )}

          {viewMode === "3d" && hasWholeHousePlan && !isClientPreview && (
            <DraggableFloatingPanel
              defaultPosition={{ right: 4, y: 64, width: 264 }}
              positionPresets={[
                { label: "Coohom stack", right: 4, y: 64 },
                { label: "Dock top", right: 4, y: 64 },
                { label: "Above floor", right: 4, y: 64 },
              ]}
              ariaLabel="Movable room navigator"
              storageKey="design-room-navigator"
              mobilePlacement="top"
            >
              <RoomPanNavigator
                rooms={housePlan2D.rooms}
                activeRoomId={designSnapshot.activeRoomId}
                cameraPosition={cameraView.pos}
                cameraTarget={cameraView.target}
                itemCountsByRoomId={roomItemCountsById}
                targetRoomId={placementTargetRoomId}
                targetRoomValid={activePlacementTargetValid}
                disabled={editorMode === "present"}
                dark={showDesignerTheme}
                onMoveCamera={handleWholeHomeMoveCamera}
                onMoveTarget={handleWholeHomeMoveTarget}
                onFocusRoom={handleWholeHomeFocusRoom}
                onZoom={handleWholeHomeNavigatorZoom}
                onResetView={handleFitPlanView}
              />
            </DraggableFloatingPanel>
          )}

          {designControlsPanelVisibleForLayout &&
            designControlsPanelMode === "plan" &&
            !isClientPreview &&
            (isDesigner || floorOptions.length > 1 || viewMode === "3d") && (
            <DraggableFloatingPanel
              defaultPosition={{ right: 4, y: viewMode === "3d" && hasWholeHousePlan ? 246 : 88, width: 264 }}
              positionPresets={[
                {
                  label: "Coohom stack",
                  right: 4,
                  y: viewMode === "3d" && hasWholeHousePlan ? 246 : 88,
                },
                { label: "Dock top", right: 4, y: 64 },
                { label: "Below map", right: 4, y: viewMode === "3d" && hasWholeHousePlan ? 246 : 320 },
              ]}
              ariaLabel="Movable floor properties"
              storageKey="design-floor-properties"
              mobilePlacement="bottom"
            >
              <FloorPropertiesPanel
                dark={showDesignerTheme}
                canEdit={canEdit}
                roomWidth={roomWidth}
                roomDepth={roomDepth}
                floorOptions={floorOptions}
                hiddenFloorLevels={hiddenFloorLevels}
                activeFloorLevel={activeFloorLevel}
                activeFloorRoomCount={activeFloorRoomCount}
                activeRoomHeightMm={activeRoomHeightMm}
                activeRoomWallThicknessMm={activeRoomWallThicknessMm}
                activeRoomSlabThicknessMm={activeRoomSlabThicknessMm}
                activeRoomWallOpacity={activeRoomWallOpacity}
                activeRoomFloorOpacity={activeRoomFloorOpacity}
                activeRoomCeilingOpacity={activeRoomCeilingOpacity}
                activeRoomCeilingVisible={activeRoomCeilingVisible}
                activeRoomCeilingColor={activeRoomCeilingColor}
                stackedFloorView={stackedFloorView}
                onAddUpperFloor={(mode) => handleAddFloor("upper", mode)}
                onAddLowerFloor={(mode) => handleAddFloor("lower", mode)}
                onToggleFloorVisibility={handleToggleFloorVisibility}
                onRenameFloor={handleRenameFloor}
                onDuplicateFloor={handleDuplicateFloor}
                onDeleteFloor={handleDeleteFloor}
                onSwitchFloor={handleSwitchFloor}
                onStackedFloorViewChange={setStackedFloorView}
                onRedo={redoSafe}
                canRedo={canRedo}
                onActiveRoomHeightMmChange={handleActiveRoomHeightMmChange}
                onActiveRoomWallThicknessMmChange={handleActiveRoomWallThicknessMmChange}
                onActiveRoomSlabThicknessMmChange={handleActiveRoomSlabThicknessMmChange}
                onActiveRoomSurfaceOpacityChange={handleActiveRoomSurfaceOpacityChange}
                onActiveRoomCeilingVisibleChange={handleActiveRoomCeilingVisibleChange}
                onActiveRoomCeilingColorChange={handleActiveRoomCeilingColorChange}
              />
            </DraggableFloatingPanel>
          )}

          {viewMode === "3d" && stackedFloorView && floorOptions.length > 1 && !isClientPreview && (
            <div
              className={
                showDesignerTheme
                  ? "absolute right-[17.5rem] top-24 z-30 hidden flex-col gap-1 rounded-lg border border-white/10 bg-[#151820]/90 p-1 shadow-xl backdrop-blur md:flex"
                  : "absolute right-[17.5rem] top-24 z-30 hidden flex-col gap-1 rounded-lg border border-neutral-200 bg-white/90 p-1 shadow-xl backdrop-blur md:flex"
              }
              data-testid="floor-stack-control"
              aria-label="Floor stack"
            >
              {floorOptions
                .slice()
                .sort((first, second) => second.level - first.level)
                .map((option) => {
                  const isActive = option.level === activeFloorLevel;
                  const isHidden = hiddenFloorLevels.includes(option.level);
                  const accentColor = getFloorAccentColor(option.level);
                  return (
                    <button
                      key={option.level}
                      type="button"
                      className={
                        showDesignerTheme
                          ? `grid min-w-12 grid-cols-[auto_1fr] items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition ${
                              isActive
                                ? "bg-blue-500 text-white"
                                : isHidden
                                  ? "text-neutral-500 hover:bg-white/5"
                                  : "text-neutral-200 hover:bg-white/10"
                            }`
                          : `grid min-w-12 grid-cols-[auto_1fr] items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition ${
                              isActive
                                ? "bg-blue-600 text-white"
                                : isHidden
                                  ? "text-neutral-400 hover:bg-neutral-100"
                                  : "text-neutral-700 hover:bg-neutral-100"
                            }`
                      }
                      title={isHidden ? `${option.label} hidden` : option.label}
                      onClick={() => handleSwitchFloor(option.level)}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full ring-1 ring-white/50"
                        style={{ backgroundColor: accentColor }}
                        aria-hidden="true"
                      />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
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
          isSaving={isSaving}
          saveStatus={saveStatus}
          onRetrySaveStatus={retrySaveStatus}
          onSave={async () => {
            if (!session?.user) {
              openGuestPrompt("save", () => {});
              return;
            }
            const savedId = await saveDesignToCloud();
            if (savedId) {
              showRuleToast("Saved to cloud");
            }
          }}
          onOpenPresentExport={() => setShowPresentModal(true)}
        />

        {!isClientPreview && showBetaStart && !designPanelOpen && (
          <div
            data-testid="beta-start-panel"
            className="fixed bottom-4 left-1/2 z-30 max-h-[calc(100vh-7rem)] w-[min(92vw,760px)] -translate-x-1/2 overflow-y-auto rounded-2xl border border-neutral-200 bg-white/95 p-4 shadow-2xl backdrop-blur"
            role="region"
            aria-label="Public beta fast start"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Public beta fast start
                </div>
                <h2 className="mt-1 text-xl font-semibold text-neutral-950">
                  Start with the path that matches your room
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-neutral-600">
                  Pick a template, draw in measured 2D, upload a floor plan, or let AI propose the first furniture layout.
                </p>
              </div>
              <button
                type="button"
                className="self-start rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                onClick={() => {
                  dismissBetaStart();
                }}
              >
                Dismiss
              </button>
            </div>

            <div
              data-testid="beta-start-activation-progress"
              className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    First run progress
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-neutral-950">
                    {firstRunActivationState.nextStep?.label ?? "Ready to share"}
                  </div>
                </div>
                <div className="text-sm font-semibold text-neutral-700">
                  {firstRunActivationState.progressPercent}%
                </div>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${firstRunActivationState.progressPercent}%` }}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <button
                type="button"
                data-testid="beta-start-template"
                className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-left transition hover:border-neutral-300 hover:bg-white"
                onClick={() => {
                  setGuidedPlanStartMode("template");
                  goPlan();
                  setViewMode("2d");
                  setDesignPanelOpen(true);
                  showRuleToast("Choose a room template in the Plan panel");
                  dismissBetaStart();
                }}
              >
                <div className="text-sm font-semibold text-neutral-950">Choose template</div>
                <div className="mt-1 text-xs text-neutral-600">Living room now; bedroom, dining, office, and whole-home beta paths are visible in Plan.</div>
              </button>
              <button
                type="button"
                data-testid="beta-start-draw-room"
                className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-left transition hover:border-neutral-300 hover:bg-white"
                onClick={() => {
                  setGuidedPlanStartMode("draw");
                  goPlan();
                  setViewMode("2d");
                  activateFloorPlanRoomTrace(true);
                  setDesignPanelOpen(true);
                  showRuleToast("Draw room walls in 2D plan mode");
                  dismissBetaStart();
                }}
              >
                <div className="text-sm font-semibold text-neutral-950">Draw room</div>
                <div className="mt-1 text-xs text-neutral-600">Use measured 2D editing with snapping, dimensions, doors, and windows.</div>
              </button>
              <button
                type="button"
                data-testid="beta-start-upload-plan"
                className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-left transition hover:border-neutral-300 hover:bg-white"
                onClick={() => {
                  setGuidedPlanStartMode("upload");
                  goPlan();
                  setViewMode("2d");
                  setDesignPanelOpen(true);
                  showRuleToast("Upload a plan from the Plan panel, then calibrate and trace");
                  dismissBetaStart();
                }}
              >
                <div className="text-sm font-semibold text-neutral-950">Upload floor plan</div>
                <div className="mt-1 text-xs text-neutral-600">Import an image or PDF, calibrate scale, then trace rooms and openings.</div>
              </button>
              <button
                type="button"
                data-testid="beta-start-ai-layout"
                className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left transition hover:border-emerald-300 hover:bg-white"
                onClick={() => {
                  goAiDesign();
                  setDesignPanelOpen(true);
                  showRuleToast("Complete the AI brief, then generate a layout");
                  dismissBetaStart();
                }}
              >
                <div className="text-sm font-semibold text-neutral-950">Generate AI layout</div>
                <div className="mt-1 text-xs text-neutral-600">Review an AI starter proposal before anything is applied.</div>
              </button>
            </div>
          </div>
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
          onSetQty={(instanceId, qty) => {
            commitItems((prev) =>
              prev.map((x) => (x.instanceId === instanceId ? { ...x, qty } : x)),
              "Change quantity"
            );
          }}
          onSetInclude={setShoppingItemInclude}
          onBulkSwap={onBulkSwap}
          onShowUpgrade={() => setShowUpgrade(true)}
          theme={showDesignerTheme ? "designer" : "default"}
        />
        </div>
      )}

      {/* Layer 2B: Inspector Panel (visible in ADJUST mode when item selected) */}
      {editorMode === "adjust" && selectedProduct && (
        <div
          className={`absolute right-4 top-20 z-40 w-[320px] md:w-85 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 transition-opacity duration-300 ${
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
              canEdit={canEdit}
              rooms={designSnapshot.rooms.map((room) => ({ id: room.id, name: room.name }))}
              activeRoomId={designSnapshot.activeRoomId}
              planningDimensionsMm={selectedItemPlanningDimensionsMm}
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
              styleConsistencyReport={selectedStyleConsistencyReport}
              onToggleInspectorDetails={() => setShowInspectorDetails((value) => !value)}
              onToggleFullDimensions={() => setShowFullDimensions((value) => !value)}
              onToggleDeliveryWarranty={() => setShowDeliveryWarranty((value) => !value)}
              onToggleRotationControls={() => setShowRotationControls((value) => !value)}
              onMoveToRoom={moveSelectedItemToRoom}
              onDuplicate={duplicateSelectedItem}
              onDelete={deleteSelectedItem}
              onCenterInRoom={centerSelectedItemInRoom}
              onSnapToWall={snapSelectedItemToNearestWall}
              onNudge={nudgeSelectedItem}
              onSetPosition={(x, z) => moveSelectedItemToPosition(x, z, "Set item position")}
              onApplyStyleAlternative={(productId) => {
                const alternative = CATALOG_ITEMS[productId];
                switchSelectedProductModel(
                  productId,
                  `Switch to ${alternative?.title ?? "style alternative"}`
                );
                if (alternative) showRuleToast(`Switched to ${alternative.title}`);
              }}
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
                  <div
                    className="grid border-b border-neutral-200"
                    style={{
                      gridTemplateColumns: `repeat(${jaronConfigurationGroups.length}, minmax(0, 1fr))`,
                    }}
                  >
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
                      swatchTextureUrl: entry.swatchTextureUrl ?? null,
                      isActive: false,
                    }))
                ).map((option) => {
                  const active =
                    option.isActive ||
                    option.variantId === activeStructuredVariant?.variant.id ||
                    option.label.toLowerCase() === String(activeMaterialType ?? "").trim().toLowerCase() ||
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
                          const normalizeLegVariantKey = (value?: string | null) =>
                            String(value ?? "")
                              .trim()
                              .toLowerCase()
                              .replace(/_/g, "-")
                              .replace(/[^a-z0-9-]+/g, "-")
                              .replace(/^-+|-+$/g, "");
                          const activeLegFinishKey = normalizeLegVariantKey(activeStructuredVariant?.variant.legFinishCode);
                          const target =
                            structuredVariants.find(
                              (entry) =>
                                entry.materialType === option.label &&
                                activeLegFinishKey &&
                                normalizeLegVariantKey(entry.variant.legFinishCode) === activeLegFinishKey
                            ) ??
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

            {legFinishOptions.length > 1 ? (
              <div className="pt-3" data-testid="selected-leg-finish-section">
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-primary text-sm font-semibold"
                      : "text-sm font-semibold text-neutral-900"
                  }
                >
                  Wood colour
                </div>
                <div
                  className={
                    showDesignerTheme
                      ? "designer-text-secondary mt-2 text-xs"
                      : "mt-2 text-xs text-neutral-600"
                  }
                  data-testid="selected-leg-finish-label"
                >
                  Selected: {legFinishOptions.find((option) => option.variantId === selectedItem?.variantId)?.label ?? activeStructuredVariant?.variant.legFinishLabel ?? legFinishOptions[0]?.label}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {legFinishOptions.map((option) => {
                    const active =
                      option.variantId === selectedItem?.variantId ||
                      option.key ===
                        String(activeStructuredVariant?.variant.legFinishCode ?? "")
                          .trim()
                          .toLowerCase()
                          .replace(/_/g, "-")
                          .replace(/[^a-z0-9-]+/g, "-")
                          .replace(/^-+|-+$/g, "");
                    const labelKey = option.label
                      .trim()
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-+|-+$/g, "");
                    const swatchTextureUrl =
                      CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[option.key] ??
                      CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[labelKey] ??
                      null;

                    return (
                      <button
                        key={`leg-finish-${option.key}`}
                        data-testid={`leg-finish-swatch-${option.key}`}
                        data-active={active ? "true" : "false"}
                        className="shrink-0 h-20 w-20 rounded-sm bg-cover bg-center transition-all"
                        disabled={!canEdit}
                        style={{
                          backgroundColor: option.colorHex,
                          backgroundImage: swatchTextureUrl ? `url(${swatchTextureUrl})` : undefined,
                          boxShadow: active
                            ? "0 0 0 2px #fff, 0 0 0 4px #5a2135"
                            : "none",
                        }}
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
                            `Change wood colour to ${option.label}`
                          );
                        }}
                        title={option.label}
                        aria-label={`Select wood colour ${option.label}`}
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
                          const importedSwatchTextureUrl = variant.swatchTextureUrl?.trim() || null;
                          const swatchTextureUrl = importedSwatchTextureUrl ??
                            (useWoodSwatchTexture
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
                              null);
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
                                const normalizeLegVariantKey = (value?: string | null) =>
                                  String(value ?? "")
                                    .trim()
                                    .toLowerCase()
                                    .replace(/_/g, "-")
                                    .replace(/[^a-z0-9-]+/g, "-")
                                    .replace(/^-+|-+$/g, "");
                                const getBaseFinishKey = (candidate: typeof variant) => {
                                  const finishCode = normalizeLegVariantKey(candidate.finishCode);
                                  const legKey = normalizeLegVariantKey(
                                    candidate.legFinishCode ?? candidate.legFinishLabel
                                  );
                                  if (!finishCode || !legKey) return finishCode;
                                  return finishCode
                                    .replace(new RegExp(`-${legKey}(?:-wood)?-legs$`, "i"), "")
                                    .replace(new RegExp(`-${legKey}$`, "i"), "");
                                };
                                const activeLegFinishKey = normalizeLegVariantKey(activeStructuredVariant?.variant.legFinishCode);
                                const targetBaseFinishKey = getBaseFinishKey(variant);
                                const targetVariant =
                                  activeLegFinishKey && selectedProduct
                                    ? selectedProduct.variants.find(
                                        (candidate) =>
                                          getBaseFinishKey(candidate) === targetBaseFinishKey &&
                                          normalizeLegVariantKey(candidate.legFinishCode) === activeLegFinishKey
                                      ) ?? variant
                                    : variant;
                                commitItems((prev) =>
                                  prev.map((it) =>
                                    it.instanceId === selectedItem.instanceId
                                      ? { ...it, variantId: targetVariant.id }
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
                if (!best) {
                  showRuleToast("No cheaper alternatives found");
                  return;
                }

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
                if (!best) {
                  showRuleToast("No premium alternatives found");
                  return;
                }

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
                  className="mt-3 w-full rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 ring-1 ring-amber-100"
                  disabled
                >
                  Needs commerce review
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
      {designControlsPanelVisibleForLayout && (
        <DesignControlsPanel
          dark={showDesignerTheme}
          panelMode={designControlsPanelMode}
          selectionContext={selectedObjectContext}
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
          floorOptions={floorOptions}
          activeFloorLevel={activeFloorLevel}
          activeFloorRoomCount={activeFloorRoomCount}
          activeRoomHeightMm={activeRoomHeightMm}
          activeRoomWallThicknessMm={activeRoomWallThicknessMm}
          activeRoomSlabThicknessMm={activeRoomSlabThicknessMm}
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
          onPlanCompletionHandled={handleConsumerPlanCompletionHandled}
          onPlanStartModeChange={setGuidedPlanStartMode}
          onSimplePlanControlsChange={setSimplePlanControls}
          onPlanGuidedActionsEnabledChange={setPlanGuidedActionsEnabled}
          onSelectFloorPlanTool={handleSelectFloorPlanTool}
          onDrawFloorPlanRoom={() => handleFloorPlanDrawRoomModeChange("rectangle_wall")}
          onAddFloorPlanOpeningFromTool={handleAddFloorPlanOpeningFromTool}
          onHide={() => {
            setDesignPanelOpen(false);
            setPlanFocusPanelRevealed(false);
          }}
          onSignIn={signInWithReturn}
          onGoFurnish={goFurnish}
          onGoAiDesign={goAiDesign}
          onGoShop={goShop}
          onGoView3D={() => setViewMode("3d")}
          onSelectRoom={handleSwitchRoom}
          onPlacementAddModeChange={setPlacementAddMode}
          onStyleChange={setStyle}
          onBudgetChange={setBudget}
          onRunAiLayout={(requestedRoles) => {
            void runAiLayout({ requestedRoles });
          }}
          onApplyAiLayoutProposal={applyPendingAiLayoutProposal}
          onTryAiLayoutAgain={(requestedRoles) => {
            void runAiLayout({ nextSeed: _getRandomSeed(), requestedRoles });
          }}
          onClearAiLayoutProposal={() => setPendingAiLayoutProposal(null)}
          onApplyPlanTemplate={handleApplyPlanTemplate}
          onApplyFloorMaterialToRoom={handleApplyFloorMaterialToRoom}
          onApplyFloorMaterialToAllRooms={handleApplyFloorMaterialToAllRooms}
          onRotateActiveFloorMaterial={handleRotateActiveFloorMaterial}
          onResetActiveFloorMaterialPattern={handleResetActiveFloorMaterialPattern}
          onActiveFloorMaterialScaleChange={handleActiveFloorMaterialScaleChange}
          onAddDesignerRoom={() => handleAddRoom()}
          onAddRoomTemplate={handleAddRoom}
          onNewRoomTypeChange={setNewRoomType}
          onNewRoomShapeChange={setNewRoomShape}
          onRoomPresetChange={handleRoomPresetChange}
          onRoomWidthInputChange={setRoomWidthInput}
          onRoomDepthInputChange={setRoomDepthInput}
          onApplyRoomSize={handleApplyRoomSize}
          onActiveRoomHeightMmChange={handleActiveRoomHeightMmChange}
          onActiveRoomWallThicknessMmChange={handleActiveRoomWallThicknessMmChange}
          onActiveRoomSlabThicknessMmChange={handleActiveRoomSlabThicknessMmChange}
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
              <ExportReadinessPreview
                dark={showDesignerTheme}
                items={exportReadinessItems}
                readyCount={exportReadinessReadyCount}
                score={exportReadinessScore}
              />

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
                  <div
                    className={
                      showDesignerTheme
                        ? "mt-3 rounded-lg border border-neutral-700 bg-[#151820] p-3"
                        : "mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
                    }
                  >
                    <label
                      htmlFor="camera-view-name"
                      className={
                        showDesignerTheme
                          ? "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400"
                          : "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500"
                      }
                    >
                      Named camera view
                    </label>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <input
                        id="camera-view-name"
                        data-testid="camera-view-name-input"
                        value={cameraViewNameInput}
                        onChange={(event) => setCameraViewNameInput(event.target.value)}
                        placeholder={`View ${activeRoomSavedViews.length + 1}`}
                        className={
                          showDesignerTheme
                            ? "min-h-10 rounded-lg border border-neutral-700 bg-[#0f1218] px-3 text-sm text-neutral-100 placeholder:text-neutral-500"
                            : "min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400"
                        }
                      />
                      <button
                        type="button"
                        data-testid="save-named-camera-view"
                        onClick={saveCurrentNamedView}
                        className="min-h-10 rounded-lg bg-neutral-900 px-3 text-xs font-semibold text-white hover:bg-neutral-800"
                      >
                        Save
                      </button>
                    </div>
                    {activeRoomSavedViews.length > 0 ? (
                      <div className="mt-3 space-y-2" data-testid="saved-camera-view-list">
                        {activeRoomSavedViews.map((view) => (
                          <div
                            key={view.id}
                            className={
                              showDesignerTheme
                                ? "flex items-center justify-between gap-2 rounded-lg bg-[#0f1218] px-3 py-2"
                                : "flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2"
                            }
                          >
                            <button
                              type="button"
                              data-testid={`saved-camera-view-open-${view.id}`}
                              className={
                                showDesignerTheme
                                  ? "min-w-0 flex-1 truncate text-left text-xs font-semibold text-neutral-100"
                                  : "min-w-0 flex-1 truncate text-left text-xs font-semibold text-gray-800"
                              }
                              onClick={() => {
                                handleEditorViewModeChange("3d");
                                transitionToCameraView(
                                  {
                                    pos: view.cameraPosition,
                                    target: view.cameraTarget,
                                    fov: cameraView.fov,
                                  },
                                  460
                                );
                              }}
                            >
                              {view.name}
                            </button>
                            <button
                              type="button"
                              data-testid={`saved-camera-view-delete-${view.id}`}
                              className={
                                showDesignerTheme
                                  ? "rounded px-2 py-1 text-[11px] font-semibold text-neutral-400 hover:bg-[#151820] hover:text-white"
                                  : "rounded px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                              }
                              onClick={() => deleteSavedCameraView(view.id)}
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={showDesignerTheme ? "mt-2 text-xs text-neutral-400" : "mt-2 text-xs text-gray-500"}>
                        Saved views appear on share links and export packs.
                      </div>
                    )}
                  </div>
                  <div
                    className={
                      showDesignerTheme
                        ? "mt-3 rounded-lg border border-neutral-700 bg-[#151820] p-3"
                        : "mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
                    }
                    data-testid="layout-versions-panel"
                  >
                    <label
                      htmlFor="layout-version-name"
                      className={
                        showDesignerTheme
                          ? "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400"
                          : "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500"
                      }
                    >
                      Layout versions
                    </label>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <input
                        id="layout-version-name"
                        data-testid="layout-version-name-input"
                        value={layoutVersionNameInput}
                        onChange={(event) => setLayoutVersionNameInput(event.target.value)}
                        placeholder={`Layout ${activeRoomLayoutVersions.length + 1}`}
                        className={
                          showDesignerTheme
                            ? "min-h-10 rounded-lg border border-neutral-700 bg-[#0f1218] px-3 text-sm text-neutral-100 placeholder:text-neutral-500"
                            : "min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400"
                        }
                      />
                      <button
                        type="button"
                        data-testid="save-layout-version"
                        onClick={saveCurrentLayoutVersion}
                        className="min-h-10 rounded-lg bg-teal-600 px-3 text-xs font-semibold text-white hover:bg-teal-500"
                      >
                        Save
                      </button>
                    </div>
                    {latestManualLayoutVersion ? (
                      <button
                        type="button"
                        data-testid="layout-version-restore-latest-manual"
                        className={
                          showDesignerTheme
                            ? "mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-teal-400/20 bg-teal-400/10 px-3 py-2 text-left text-xs font-semibold text-teal-100 hover:bg-teal-400/15"
                            : "mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-left text-xs font-semibold text-teal-800 hover:bg-teal-100"
                        }
                        onClick={() => restoreRoomLayoutVersion(latestManualLayoutVersion.id)}
                      >
                        <span className="min-w-0 truncate">
                          Restore previous manual layout
                        </span>
                        <span className={showDesignerTheme ? "shrink-0 text-teal-200" : "shrink-0 text-teal-700"}>
                          {formatTimeAgo(latestManualLayoutVersion.timestamp)}
                        </span>
                      </button>
                    ) : null}
                    {activeRoomLayoutVersions.length > 0 && activeRoom ? (
                      <div className="mt-3 space-y-2" data-testid="layout-version-list">
                        {activeRoomLayoutVersions.map((version) => {
                          const comparison = compareLayoutVersion(activeRoom, version);
                          const comparisonSummary = summarizeLayoutVersionComparison(comparison);
                          const sourceLabel =
                            version.source === "make_space"
                              ? "Make space"
                              : version.source === "auto_place"
                                ? "Auto"
                                : version.source === "ai"
                                  ? "AI"
                                  : "Manual";

                          return (
                            <div
                              key={version.id}
                              className={
                                showDesignerTheme
                                  ? "rounded-lg bg-[#0f1218] px-3 py-2"
                                  : "rounded-lg bg-white px-3 py-2"
                              }
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div
                                    className={
                                      showDesignerTheme
                                        ? "truncate text-xs font-semibold text-neutral-100"
                                        : "truncate text-xs font-semibold text-gray-800"
                                    }
                                  >
                                    {version.name}
                                  </div>
                                  <div
                                    className={
                                      showDesignerTheme
                                        ? "mt-0.5 text-[11px] text-neutral-400"
                                        : "mt-0.5 text-[11px] text-gray-500"
                                    }
                                  >
                                    {sourceLabel} · {formatTimeAgo(version.timestamp)}
                                  </div>
                                  <div data-testid="layout-version-comparison" className="mt-2 grid grid-cols-2 gap-1.5">
                                    <div className={showDesignerTheme ? "rounded-md bg-[#151820] px-2 py-1.5" : "rounded-md bg-gray-50 px-2 py-1.5"}>
                                      <div className={showDesignerTheme ? "text-[10px] font-semibold uppercase text-neutral-500" : "text-[10px] font-semibold uppercase text-gray-400"}>
                                        Saved
                                      </div>
                                      <div className={showDesignerTheme ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-gray-900"}>
                                        {comparison.savedItemCount} item{comparison.savedItemCount === 1 ? "" : "s"}
                                      </div>
                                    </div>
                                    <div className={showDesignerTheme ? "rounded-md bg-[#151820] px-2 py-1.5" : "rounded-md bg-gray-50 px-2 py-1.5"}>
                                      <div className={showDesignerTheme ? "text-[10px] font-semibold uppercase text-neutral-500" : "text-[10px] font-semibold uppercase text-gray-400"}>
                                        Current
                                      </div>
                                      <div className={showDesignerTheme ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-gray-900"}>
                                        {comparison.currentItemCount} item{comparison.currentItemCount === 1 ? "" : "s"}
                                      </div>
                                    </div>
                                  </div>
                                  <div className={showDesignerTheme ? "mt-2 text-[11px] text-neutral-400" : "mt-2 text-[11px] text-gray-500"}>
                                    {comparisonSummary.itemDeltaLabel} · {comparisonSummary.movementLabel}
                                  </div>
                                  <div className={showDesignerTheme ? "mt-0.5 text-[11px] text-neutral-500" : "mt-0.5 text-[11px] text-gray-500"}>
                                    {comparisonSummary.zoneDeltaLabel}
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    type="button"
                                    data-testid={`layout-version-restore-${version.id}`}
                                    className={
                                      showDesignerTheme
                                        ? "rounded px-2 py-1 text-[11px] font-semibold text-teal-200 hover:bg-[#151820] hover:text-white"
                                        : "rounded px-2 py-1 text-[11px] font-semibold text-teal-700 hover:bg-teal-50"
                                    }
                                    onClick={() => restoreRoomLayoutVersion(version.id)}
                                  >
                                    {comparisonSummary.restoreLabel}
                                  </button>
                                  <button
                                    type="button"
                                    data-testid={`layout-version-delete-${version.id}`}
                                    className={
                                      showDesignerTheme
                                        ? "rounded px-2 py-1 text-[11px] font-semibold text-neutral-400 hover:bg-[#151820] hover:text-white"
                                        : "rounded px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                                    }
                                    onClick={() => deleteRoomLayoutVersion(version.id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className={showDesignerTheme ? "mt-2 text-xs text-neutral-400" : "mt-2 text-xs text-gray-500"}>
                        No saved layouts yet.
                      </div>
                    )}
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
                        Pro controls
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
                        Simple mode keeps the plan clean. Use Pro controls for layers, doors/windows, and theme tuning.
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
                              onClick={() => runPlanOverlayCommand("preset:presentation")}
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
                              onClick={() => runPlanOverlayCommand("preset:technical")}
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
                              onClick={() => runPlanOverlayCommand("preset:staging")}
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
                          ["openings", "Doors/windows"],
                          ["builtIns", "Built-ins"],
                          ["zones", "Zones"],
                          ["annotations", "Notes"],
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
                        type="button"
                        data-testid="plan-add-note"
                        className={
                          annotationToolKind === "note"
                            ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                            : showDesignerTheme
                              ? "rounded-lg bg-[#151820] px-2 py-2 text-[11px] text-neutral-200"
                              : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                        }
                        onClick={() => {
                          setAnnotationToolKind("note");
                          runPlanOverlayCommand("annotation:note");
                        }}
                      >
                        + Note
                      </button>
                      {!simplePlanControls && (
                        <button
                          type="button"
                          data-testid="plan-add-callout"
                          className={
                            annotationToolKind === "callout"
                              ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                              : showDesignerTheme
                                ? "rounded-lg bg-[#151820] px-2 py-2 text-[11px] text-neutral-200"
                                : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                          }
                          onClick={() => {
                            setAnnotationToolKind("callout");
                            runPlanOverlayCommand("annotation:callout");
                          }}
                        >
                          + Callout
                        </button>
                      )}
                      {!simplePlanControls && (
                        <button
                          type="button"
                          data-testid="plan-add-room-tag"
                          className={
                            annotationToolKind === "room_tag"
                              ? "rounded-lg bg-teal-600 px-2 py-2 text-[11px] font-medium text-white"
                              : showDesignerTheme
                                ? "rounded-lg bg-[#151820] px-2 py-2 text-[11px] text-neutral-200"
                                : "rounded-lg bg-gray-100 px-2 py-2 text-[11px] hover:bg-gray-200"
                          }
                          onClick={() => {
                            setAnnotationToolKind("room_tag");
                            runPlanOverlayCommand("annotation:room_tag");
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
                            handleSelectPlanOverlay(id);
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
                            handleSelectPlanOverlay(id);
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
                            handleSelectPlanOverlay(id);
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
                          Built-ins in Pro
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
                          deletePlanOverlayById(selectedPlanOverlayId);
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
                          runPlanOverlayCommand("preset:presentation");
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
                          runPlanOverlayCommand("preset:technical");
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
                    data-testid={`load-design-${design.id}`}
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

      {pendingRoomRenameId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4 backdrop-blur-[1px]"
          data-testid="room-rename-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Rename room"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) cancelRoomRename();
          }}
        >
          <div className="w-[min(360px,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-neutral-950">Rename room</h3>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Update the selected room label in the plan.
                </p>
              </div>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm font-semibold text-neutral-500 hover:bg-neutral-100"
                aria-label="Close rename room dialog"
                onClick={cancelRoomRename}
              >
                x
              </button>
            </div>
            <label className="mt-3 block">
              <span className="text-xs font-semibold text-neutral-700">Room name</span>
              <input
                data-testid="room-rename-input"
                className="mt-1 h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                value={pendingRoomRenameValue}
                autoFocus
                onChange={(event) => setPendingRoomRenameValue(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRoomRename();
                  if (event.key === "Escape") cancelRoomRename();
                }}
              />
            </label>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                onClick={cancelRoomRename}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="room-rename-save"
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
                disabled={!pendingRoomRenameValue.trim()}
                onClick={commitRoomRename}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingAnnotationKind && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4 backdrop-blur-[1px]"
          data-testid="plan-annotation-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Add plan annotation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) cancelPlanAnnotation();
          }}
        >
          <div className="w-[min(380px,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-neutral-950">
                  {pendingAnnotationKind === "room_tag"
                    ? "Add room tag"
                    : pendingAnnotationKind === "callout"
                      ? "Add callout"
                      : "Add note"}
                </h3>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Place a draggable label on the 2D plan.
                </p>
              </div>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm font-semibold text-neutral-500 hover:bg-neutral-100"
                aria-label="Close annotation dialog"
                onClick={cancelPlanAnnotation}
              >
                x
              </button>
            </div>
            <label className="mt-3 block">
              <span className="text-xs font-semibold text-neutral-700">
                {pendingAnnotationKind === "room_tag" ? "Tag text" : "Annotation text"}
              </span>
              <textarea
                data-testid="plan-annotation-input"
                className="mt-1 min-h-20 w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                value={pendingAnnotationText}
                autoFocus
                onChange={(event) => setPendingAnnotationText(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    commitPlanAnnotation();
                  }
                  if (event.key === "Escape") cancelPlanAnnotation();
                }}
              />
            </label>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                onClick={cancelPlanAnnotation}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="plan-annotation-save"
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
                disabled={!pendingAnnotationText.trim()}
                onClick={commitPlanAnnotation}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingCatalogPlacementScene && (
        <div
          data-testid="catalog-placement-confirm-panel"
          role="dialog"
          aria-modal="false"
          aria-label="Preview catalog placement"
          className={`fixed inset-x-0 bottom-0 z-[95] max-h-[82vh] overflow-y-auto rounded-t-2xl border bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl md:inset-x-auto md:bottom-5 md:right-5 md:max-h-[min(48vh,420px)] md:w-[min(460px,calc(100vw-2rem))] md:rounded-xl md:p-3 md:pb-3 ${
            pendingCatalogPlacementHardInvalid ? "border-red-200" : "border-emerald-200"
          }`}
        >
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-neutral-200 md:hidden" aria-hidden="true" />
          <div className="flex flex-col gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Preview placement
              </p>
              <h3 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-neutral-950 md:line-clamp-1 md:text-sm">
                {pendingCatalogPlacementScene.productTitle}
              </h3>
              <p className="mt-1 line-clamp-2 text-sm text-neutral-600 md:line-clamp-1 md:text-xs">
                {pendingCatalogPlacementScene.variantLabel} · {pendingCatalogPlacementScene.reason}
                {pendingCatalogPlacementRoom?.name ? ` · ${pendingCatalogPlacementRoom.name}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span
                  data-testid="catalog-placement-status"
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    pendingCatalogPlacementHardInvalid
                      ? "bg-red-50 text-red-700"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {pendingCatalogPlacementStatusLabel}
                </span>
                <span className="text-xs text-neutral-500 md:hidden">
                  Drag the preview or tap a room/highlighted zone, then confirm.
                </span>
                {activePlacementTargetLabel && (
                  <span
                    data-testid="catalog-placement-target-room"
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      activePlacementTargetValid
                        ? "bg-blue-50 text-blue-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    Target: {activePlacementTargetLabel}
                  </span>
                )}
                {pendingCatalogPlacementQuality && (
                  <span
                    data-testid="catalog-placement-quality"
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      pendingCatalogPlacementQuality.tone === "good"
                        ? "bg-blue-50 text-blue-700"
                        : pendingCatalogPlacementQuality.tone === "warn"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-red-50 text-red-700"
                    }`}
                  >
                    {pendingCatalogPlacementQuality.label}
                  </span>
                )}
              </div>
              {pendingCatalogPlacementScore && (
                <div
                  data-testid="catalog-placement-score-card"
                  className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 md:p-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Placement score
                      </div>
                      <div className="mt-0.5 text-sm font-semibold text-neutral-950">
                        {pendingCatalogPlacementScore.label} · {pendingCatalogPlacementScore.score}/100
                      </div>
                    </div>
                    <div
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        pendingCatalogPlacementScore.relationship === "good"
                          ? "bg-emerald-100 text-emerald-800"
                          : pendingCatalogPlacementScore.relationship === "wrong"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-white text-neutral-700"
                      }`}
                    >
                      {pendingCatalogPlacementScore.relationship === "good"
                        ? "Good relationship"
                        : pendingCatalogPlacementScore.relationship === "wrong"
                          ? "Check relationship"
                          : pendingCatalogPlacementScore.relationship === "missing"
                            ? "Needs anchor"
                            : "Neutral"}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-neutral-600">
                    {pendingCatalogPlacementScore.summary}
                  </div>
                  {pendingCatalogPlacementScore.warnings.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-amber-800 md:mt-1">
                      {pendingCatalogPlacementScore.warnings.slice(0, 3).map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                  {pendingCatalogPlacementScore.suggestions.length > 0 && (
                    <div className="mt-2 text-xs text-neutral-600 md:hidden">
                      {pendingCatalogPlacementScore.suggestions[0]}
                    </div>
                  )}
                  {pendingCatalogPlacementImprovement && (
                    <div
                      data-testid="catalog-placement-improvement-hint"
                      className="mt-2 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800"
                    >
                      Better nearby spot available: +{pendingCatalogPlacementImprovement.scoreDelta} to{" "}
                      {pendingCatalogPlacementImprovement.score}/100.
                    </div>
                  )}
                  {pendingCatalogBestRoomPlacement && (
                    <div
                      data-testid="catalog-placement-best-room-hint"
                      className="mt-2 rounded-md bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-800"
                    >
                      Best room: {pendingCatalogBestRoomPlacement.roomName} · +
                      {pendingCatalogBestRoomPlacement.scoreDelta} to {pendingCatalogBestRoomPlacement.score}/100.
                    </div>
                  )}
                  {pendingCatalogBestVariantPlacement && (
                    <div
                      data-testid="catalog-placement-best-option-hint"
                      className="mt-2 rounded-md bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-800"
                    >
                      Best option: {pendingCatalogBestVariantPlacement.variantLabel} · +
                      {pendingCatalogBestVariantPlacement.scoreDelta} to{" "}
                      {pendingCatalogBestVariantPlacement.score}/100.
                    </div>
                  )}
                  {pendingCatalogPlacementScore.compatibleZoneIds.length > 0 && (
                    <div className="mt-2 text-xs font-semibold text-emerald-700 md:hidden">
                      Compatible zones are highlighted on the canvas.
                    </div>
                  )}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2 md:mt-2">
                <button
                  type="button"
                  data-testid="catalog-placement-auto-place"
                  className="min-h-11 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                  onClick={autoPlacePendingCatalogPlacement}
                >
                  Find open spot
                </button>
                {pendingCatalogBestRoomPlacement ? (
                  <button
                    type="button"
                    data-testid="catalog-placement-best-room"
                    className="min-h-11 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                    onClick={movePendingCatalogPlacementToBestRoom}
                  >
                    Best room
                  </button>
                ) : null}
                {pendingCatalogBestVariantPlacement ? (
                  <button
                    type="button"
                    data-testid="catalog-placement-best-option"
                    className="min-h-11 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                    onClick={switchPendingCatalogPlacementToBestOption}
                  >
                    Best option
                  </button>
                ) : null}
                {pendingCatalogPlacementImprovement ? (
                  <button
                    type="button"
                    data-testid="catalog-placement-improve"
                    className="min-h-11 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                    onClick={improvePendingCatalogPlacement}
                  >
                    Improve placement
                  </button>
                ) : null}
                {pendingCatalogPlacementBlocked && restorableCatalogPlacement ? (
                  <button
                    type="button"
                    data-testid="catalog-placement-restore-valid"
                    className="min-h-11 rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                    onClick={restoreLastValidCatalogPlacement}
                  >
                    Back to valid spot
                  </button>
                ) : null}
                {pendingCatalogPlacementBlocked ? (
                  <button
                    type="button"
                    data-testid="catalog-placement-select-blocker"
                    className="min-h-11 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                    onClick={selectPendingCatalogPlacementBlocker}
                  >
                    Select blocker
                  </button>
                ) : null}
                {pendingCatalogPlacementScore?.actions.includes("swap_with_blocker") ? (
                  <button
                    type="button"
                    data-testid="catalog-placement-swap-blocker"
                    className="min-h-11 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                    onClick={swapPendingCatalogWithBlocker}
                  >
                    Swap with blocker
                  </button>
                ) : null}
                {pendingCatalogPlacementScore?.actions.includes("move_blocker_aside") ? (
                  <button
                    type="button"
                    data-testid="catalog-placement-move-blocker"
                    className="min-h-11 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                    onClick={movePendingCatalogBlockerAside}
                  >
                    Move blocker aside
                  </button>
                ) : null}
                {pendingCatalogPlacementScore?.actions.includes("place_beside_blocker") ? (
                  <button
                    type="button"
                    data-testid="catalog-placement-beside-blocker"
                    className="min-h-11 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                    onClick={placePendingCatalogBesideBlocker}
                  >
                    Place beside blocker
                  </button>
                ) : null}
                {pendingCatalogPlacementScore?.actions.includes("try_smaller_variant") ? (
                  <button
                    type="button"
                    data-testid="catalog-placement-smaller-variant"
                    className="min-h-11 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                    onClick={trySmallerPendingCatalogVariant}
                  >
                    Try smaller variant
                  </button>
                ) : null}
                <button
                  type="button"
                  data-testid="catalog-placement-center"
                  className="min-h-11 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                  onClick={centerPendingCatalogPlacement}
                >
                  Center
                </button>
                <button
                  type="button"
                  data-testid="catalog-placement-nudge-left"
                  className="h-11 w-11 rounded-lg border border-neutral-200 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:h-8 md:w-8 md:text-xs"
                  aria-label="Nudge placement left"
                  onClick={() => nudgePendingCatalogPlacement(-0.25, 0)}
                >
                  ←
                </button>
                <button
                  type="button"
                  data-testid="catalog-placement-nudge-up"
                  className="h-11 w-11 rounded-lg border border-neutral-200 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:h-8 md:w-8 md:text-xs"
                  aria-label="Nudge placement back"
                  onClick={() => nudgePendingCatalogPlacement(0, -0.25)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  data-testid="catalog-placement-nudge-down"
                  className="h-11 w-11 rounded-lg border border-neutral-200 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:h-8 md:w-8 md:text-xs"
                  aria-label="Nudge placement front"
                  onClick={() => nudgePendingCatalogPlacement(0, 0.25)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  data-testid="catalog-placement-nudge-right"
                  className="h-11 w-11 rounded-lg border border-neutral-200 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:h-8 md:w-8 md:text-xs"
                  aria-label="Nudge placement right"
                  onClick={() => nudgePendingCatalogPlacement(0.25, 0)}
                >
                  →
                </button>
              </div>
            </div>
            <div className="sticky bottom-0 -mx-4 grid shrink-0 grid-cols-2 gap-2 border-t border-neutral-200 bg-white/95 px-4 pb-1 pt-3 backdrop-blur md:-mx-3 md:px-3 md:pb-0 md:pt-2">
              <button
                type="button"
                data-testid="catalog-placement-rotate-left"
                className="min-h-11 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:min-h-9 md:text-xs"
                onClick={() => rotatePendingCatalogPlacement("left")}
              >
                Rotate left
              </button>
              <button
                type="button"
                data-testid="catalog-placement-rotate-right"
                className="min-h-11 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:min-h-9 md:text-xs"
                onClick={() => rotatePendingCatalogPlacement("right")}
              >
                Rotate right
              </button>
              <button
                type="button"
                data-testid="catalog-placement-cancel"
                className="min-h-11 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:min-h-9 md:text-xs"
                onClick={cancelPendingCatalogPlacement}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="catalog-placement-confirm"
                disabled={
                  pendingCatalogPlacementHardInvalid &&
                  !shouldConfirmImprovedCatalogPlacement &&
                  !shouldConfirmRestoredCatalogPlacement
                }
                className={`min-h-11 rounded-lg px-3 py-2 text-sm font-semibold text-white md:min-h-9 md:text-xs ${
                  pendingCatalogPlacementHardInvalid &&
                  !shouldConfirmImprovedCatalogPlacement &&
                  !shouldConfirmRestoredCatalogPlacement
                    ? "cursor-not-allowed bg-neutral-300"
                    : "bg-neutral-950 hover:bg-neutral-800"
                }`}
                onClick={confirmPendingCatalogPlacement}
              >
                {shouldConfirmImprovedCatalogPlacement
                  ? "Add best spot to"
                  : shouldConfirmRestoredCatalogPlacement
                    ? "Add valid spot to"
                    : "Add to"}{" "}
                {pendingCatalogPlacementRoom?.name ?? activeRoom?.name ?? "room"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingPlanTemplateReplacement)}
        title="Replace current plan?"
        description={
          pendingPlanTemplateReplacement
            ? `Applying ${pendingPlanTemplateReplacement.template.label} will replace your current rooms, doors, and furniture.`
            : "Applying this template will replace your current rooms, doors, and furniture."
        }
        confirmLabel="Replace plan"
        destructive
        onCancel={handleCancelPendingPlanTemplateReplacement}
        onConfirm={handleConfirmPendingPlanTemplateReplacement}
      />

      {!isClientPreview && (
        <BetaFeedbackWidget
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

      {!isClientPreview && (
        <EditorHistoryFeedback
          canUndo={canUndo}
          canRedo={canRedo}
          undoName={undoName}
          redoName={redoName}
          feedback={historyFeedback}
          onUndo={undoSafe}
          onRedo={redoSafe}
        />
      )}

      {undoToast && (
        <div
          data-testid="undo-action-toast"
          className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 shadow-2xl"
        >
          <span>{undoToast.label}</span>
          <button
            type="button"
            className="rounded-md bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
            onClick={undoSafe}
          >
            Undo
          </button>
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
        <div data-testid="collision-toast" className="pointer-events-none fixed top-16 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
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
        triggerClassName={
          designControlsPanelVisibleForLayout
            ? "bottom-[calc(64vh+1.25rem)] right-4 md:bottom-4"
            : "bottom-4 right-4"
        }
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
