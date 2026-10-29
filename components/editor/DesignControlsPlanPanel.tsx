"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { track } from "@/lib/analytics";
import type { RoomSizePresetId } from "@/lib/design-page-house-plan";
import {
  HOUSE_ROOM_SHAPES,
  HOUSE_ROOM_TYPES,
  ROOM_DIMENSION_DEFAULTS,
  ROOM_SIZE_PRESETS,
} from "@/lib/design-page-house-plan";
import type { RoomOpening2D } from "@/lib/editorScene";
import type {
  FloorPlanQualityAction,
  FloorPlanQualityIssue,
} from "@/lib/floor-plan-quality";
import type { FloorPlanDrawRoomMode } from "@/lib/floor-plan-types";
import {
  DEFAULT_FLOOR_PATTERN_SCALE,
  clampFloorPatternScale,
  getFloorMaterialById,
  normalizeFloorRotationDeg,
} from "@/lib/floor-materials";
import type { RoomPlanShape, RoomType } from "@/lib/room-types";
import {
  getSurfaceMaterialTextureSource,
  getRuntimeSurfaceMaterialById,
} from "@/lib/surface-material-runtime";
import { useSurfaceMaterialCatalog } from "@/lib/useSurfaceMaterialCatalog";
import {
  FLOOR_PLAN_CONSUMER_IMPORT_ACTION_ID,
  FLOOR_PLAN_WORKSPACE_FALLBACK_ACTION_ID,
} from "@/lib/floor-plan-upload-dialog-focus";
import {
  FLOOR_PLAN_UPLOAD_REQUESTED_EVENT, floorPlanUploadRequestOf, requestFloorPlanUpload,
} from "@/lib/floor-plan-upload-request";
import { openFloorPlanUploadWorkspace } from "@/lib/open-floor-plan-upload-workspace";
import { PLAN_START_TEMPLATE_ACTION_ID, PLAN_TEMPLATE_LIBRARY_ACTION_ID, requestStartTemplates } from "@/lib/start-templates-request";
import { isConnectionBlocker } from "@/lib/room-connection-checklist";
import { FloorPlanImportArrivalNote } from "./FloorPlanImportArrivalNote";
import { SurfaceMaterialCardActions } from "./design-controls-plan/SurfaceMaterialCardActions";
import { AddRoomTemplateTiles } from "./design-controls-plan/AddRoomTemplateTiles";
import {
  DEFAULT_FLOOR_JOINT_COLOR,
  DEFAULT_FLOOR_JOINT_SIZE_MM,
  DEFAULT_FLOOR_PATTERN_OFFSET,
  getFloorPatternLabel,
  normalizeFloorSurfaceSettings,
  type NormalizedSurfaceSettings,
} from "@/lib/surface-settings";
import {
  DEFAULT_WALL_PAINT_SWATCH,
  getWallPaintDisplayName,
  getWallPaintSwatchSearchText,
  normalizeWallPaintColorHex,
  type WallPaintFamilyFilterId,
  type WallPaintSwatch,
} from "@/lib/wall-paint";
import FloorPlanAddressSearch from "./FloorPlanAddressSearch";
import FloorPlanUploadPanel from "./FloorPlanUploadPanel";
import FloorPlanToolStrip from "./FloorPlanToolStrip";
import PlanOpeningInspector from "./PlanOpeningInspector";
import MeasurementField from "./MeasurementField";
import { ConsumerRoomSetupCard } from "./ConsumerRoomSetupCard";
import { RoomSetupProgressChips } from "./RoomSetupProgressChips";
import FloorPlanPropertyEvidenceControl from "./FloorPlanPropertyEvidenceControl";
import { formatCabinetMeasurement } from "@/features/cabinetry/measurementUnits";
import RoomConnectionChecklist from "./RoomConnectionChecklist";
import type { PlanToolIconName } from "./design-controls-plan/PlanToolIcon";
import {
  CollapsiblePlanHeader,
  PlanToolSection,
  PlanToolTile,
  type CollapsiblePlanSection,
} from "./design-controls-plan/PlanToolComponents";
import {
  EmptyFloorPlanProUploadAction,
  EmptyFloorPlanSurfacesActions,
} from "./design-controls-plan/EmptyFloorPlanSurfacesActions";
import { WallPaintPicker } from "./design-controls-plan/WallPaintPicker";
import { SurfaceMaterialCatalogBoundary } from "./design-controls-plan/SurfaceMaterialCatalogBoundary";
import { SurfaceBrowserFilterBar } from "./design-controls-plan/SurfaceBrowserFilterBar";
import { SurfaceBrowserHeader } from "./design-controls-plan/SurfaceBrowserHeader";
import { RoomSurfaceRows, openRoomSurfaceTarget, roomSurfaceRowsOf, surfaceBrowserHolderOf, type RoomSurfaceTarget } from "./design-controls-plan/RoomSurfaceRows";
import {
  SURFACE_MATERIAL_INITIAL_VISIBLE_COUNT,
  SURFACE_MATERIAL_VISIBLE_INCREMENT,
  WALL_PAINT_INITIAL_VISIBLE_COUNT,
  buildSurfaceMaterialProductGroups,
  getFloorMaterialSwatchStyle,
  getSurfaceMaterialCollectionLabel,
  getSurfaceMaterialGroupMetaLabel,
  getSurfaceMaterialGroupSizeLabels,
  getSurfaceMaterialPrimaryId,
  getSurfaceMaterialProductDisplayName,
  getSurfaceMaterialModelName,
  getSurfaceMaterialSampleUrl,
  getSurfaceMaterialSizeOptionLabel,
  getSurfaceMaterialSupplierLabel,
  getSurfaceMaterialSwatchStyle,
  type SurfaceBrowserTab,
  type SurfaceBrowserViewMode,
  type SurfaceFilterKey,
  type SurfaceFilterState,
  type SurfaceMaterialProductGroup,
  type WallSurfaceMode,
} from "./design-controls-plan/surfaceCatalog";
import { buildSurfaceSummaryRows, getActiveSurfaceRoomFloorAreaSqm } from "./design-controls-plan/surfaceSummaryRows";
import {
  buildSurfaceFilterOptions,
  filterSurfaceMaterialGroups,
  hasActiveSurfaceFilters,
  withSurfaceFilter,
} from "./design-controls-plan/surfaceMaterialFilters";
import { formatDisplayArea, formatDisplayLength } from "@/lib/display-units";
import { formatPlanDimensionsLabel } from "@/lib/plan-room-summary";

export type { FloorPlanLifecycleIdentity, PlanStartMode } from "./design-controls-plan/DesignControlsPlanPanel.types";
import type {
  DesignControlsPlanPanelProps,
  PlanStartMode,
} from "./design-controls-plan/DesignControlsPlanPanel.types";
import { planPaletteOpeningSummary } from "@/lib/consumer-room-setup-copy";
import { Button, buttonClassName } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

const WALL_SURFACE_MODE_OPTIONS: ReadonlyArray<{ value: WallSurfaceMode; label: string; testId: string }> = [
  { value: "paint", label: "Paint", testId: "wall-surface-mode-paint" },
  { value: "materials", label: "Materials", testId: "wall-surface-mode-materials" },
];

export default function DesignControlsPlanPanel({
  floorPlanLifecycleIdentity,
  isClientPreview,
  isDesigner,
  canEdit,
  canEditPlanGeometry,
  showFloorPropertiesPanel = false,
  viewMode,
  snapEnabled,
  newRoomType,
  newRoomShape,
  activeRoomPresetId,
  roomWidthInput,
  roomDepthInput,
  roomWidth,
  roomDepth,
  measurementUnit, measurementUnitReady,
  floorPlanUnderlay,
  floorPlanCalibrationMode,
  floorPlanCalibrationPointCount,
  floorPlanCalibrationDistanceInput,
  floorPlanCalibrationSummary,
  floorPlanTraceRoomMode,
  floorPlanDrawRoomMode,
  floorPlanDrawAngleLockMode,
  floorPlanExactWallLengthInput,
  floorPlanTraceRoomPointCount,
  floorPlanTraceRoomType,
  floorPlanTraceOpeningMode,
  floorPlanTraceOpeningPointCount,
  floorPlanTraceOpeningKind,
  canTraceOpenings,
  floorPlanPdfSourceReady,
  floorPlanPdfRenderingPage,
  roomConnectionChecklistItems,
  visiblePlanOpening,
  visiblePlanOpeningRoomName,
  visiblePlanOpeningWallSpanMeters,
  visiblePlanOpeningMaxHeightMeters,
  planRoomCount,
  planItemCount,
  planOpeningCount, roomIsDraft = false,
  activeRoomName,
  activeRoomId,
  activeRoomType,
  activeRoomFloorMaterialId,
  activeRoomFloorRotationDeg,
  activeRoomFloorScale,
  activeRoomFloorPattern,
  activeRoomFloorPatternOffset,
  activeRoomFloorJointSizeMm,
  activeRoomFloorJointColor,
  activeSurfaceTarget,
  selectedWallFaceId,
  selectedWallLabel,
  activeRoomWallSettings,
  activeRoomSelectedWallSettings,
  activeRoomCeilingSettings,
  surfaceBrushActive,
  surfaceBrushMaterialId,
  surfaceBrushPaintColorHex,
  surfaceBrushPaintName,
  surfaceRooms,
  floorFinishPanelOpenSignal,
  floorOptions,
  activeFloorLevel,
  activeFloorRoomCount,
  activeRoomHeightMm,
  activeRoomWallHeightEvidence = null,
  canEditActiveRoomWallHeight = canEditPlanGeometry,
  activeRoomWallThicknessMm,
  activeRoomSlabThicknessMm,
  activeRoomSlabThicknessEvidence = null,
  canEditActiveRoomSlabThickness = canEditPlanGeometry,
  activeRoomBaseboardDepthMm,
  activeRoomWallOpacity,
  activeRoomFloorOpacity,
  activeRoomCeilingOpacity,
  activeRoomCeilingVisible,
  activeRoomCeilingColor,
  stackedFloorView,
  activeFloorPlanTool,
  simplePlanControls,
  planGuidedActionsEnabled: _planGuidedActionsEnabled,
  planStartMode: controlledPlanStartMode,
  planCompletionSignal,
  floorPlanQualityReport,
  onPlanCompletionHandled,
  onPlanStartModeChange,
  onPlanQualityAction,
  onSimplePlanControlsChange,
  onPlanGuidedActionsEnabledChange: _onPlanGuidedActionsEnabledChange,
  onSelectFloorPlanTool,
  onDrawFloorPlanRoom,
  onAddFloorPlanOpeningFromTool,
  onGoFurnish,
  onGoShop,
  onGoView3D,
  onApplyPlanTemplate,
  onAddDesignerRoom,
  onAddRoomTemplate,
  onSelectRoom,
  onApplyFloorMaterialToRoom,
  onApplyFloorMaterialToAllRooms,
  onRotateActiveFloorMaterial,
  onResetActiveFloorMaterialPattern,
  onActiveFloorMaterialScaleChange,
  onActiveFloorSurfaceSettingsChange: _onActiveFloorSurfaceSettingsChange,
  onSurfaceTargetChange,
  onSurfaceBrushActiveChange,
  onSurfaceMaterialSelected,
  onSurfacePaintSelected,
  onApplyWallMaterialToRoom,
  onApplyWallMaterialToAllRooms,
  onApplyWallPaintToRoom,
  onApplyWallPaintToAllRooms,
  onApplyCeilingPaintToRoom,
  onApplyCeilingPaintToAllRooms,
  onActiveWallSurfaceSettingsChange: _onActiveWallSurfaceSettingsChange,
  onResetActiveWallSurface,
  onResetActiveCeilingSurface,
  onNewRoomTypeChange,
  onNewRoomShapeChange,
  onRoomPresetChange,
  onRoomWidthInputChange,
  onRoomDepthInputChange,
  onMeasurementUnitChange,
  onCommitRoomDimension,
  onActiveRoomHeightMmChange,
  onActiveRoomWallThicknessMmChange,
  onActiveRoomSlabThicknessMmChange,
  onActiveRoomBaseboardDepthMmChange,
  onActiveRoomSurfaceOpacityChange,
  onActiveRoomCeilingVisibleChange,
  onActiveRoomCeilingColorChange,
  onFloorPlanPdfPageChange,
  onFloorPlanOpacityChange,
  onFloorPlanLockChange,
  onFloorPlanCalibrationModeChange,
  onFloorPlanCalibrationDistanceChange,
  onApplyFloorPlanCalibration,
  onResetFloorPlanCalibrationPoints,
  onFloorPlanTraceRoomModeChange,
  onFloorPlanTraceRoomDrawModeChange,
  onFloorPlanDrawAngleLockModeChange,
  onFloorPlanExactWallLengthInputChange,
  onApplyFloorPlanExactWallLength,
  onFloorPlanTraceRoomTypeChange,
  onUndoFloorPlanTraceRoomPoint,
  onResetFloorPlanTraceRoomPoints,
  onFloorPlanTraceOpeningModeChange,
  onFloorPlanTraceOpeningKindChange,
  onResetFloorPlanTraceOpeningPoints,
  onClearFloorPlan,
  onAddSuggestedDoorway,
  onUpdateOpeningMetrics,
}: DesignControlsPlanPanelProps) {
  const [localPlanStartMode, setLocalPlanStartMode] = useState<PlanStartMode>("start");
  const [roomFinishPanelOpen, setRoomFinishPanelOpen] = useState(false);
  const [flooringSearch, setFlooringSearch] = useState("");
  const [surfaceTab, setSurfaceTab] = useState<SurfaceBrowserTab>("tiles");
  const [wallSurfaceMode, setWallSurfaceMode] = useState<WallSurfaceMode>("paint");
  const [wallPaintSearch, setWallPaintSearch] = useState("");
  const [wallPaintFamilyFilter, setWallPaintFamilyFilter] = useState<WallPaintFamilyFilterId>("all");
  const [wallPaintVisibleLimit, setWallPaintVisibleLimit] = useState(WALL_PAINT_INITIAL_VISIBLE_COUNT);
  const [customWallPaintHex, setCustomWallPaintHex] = useState(DEFAULT_WALL_PAINT_SWATCH.hex);
  const [wallPaintApplyName, setWallPaintApplyName] = useState("Custom paint");
  const [surfaceViewMode, setSurfaceViewMode] = useState<SurfaceBrowserViewMode>("grid");
  const [surfaceFilterDrawerOpen, setSurfaceFilterDrawerOpen] = useState(false);
  const [surfaceFilters, setSurfaceFilters] = useState<SurfaceFilterState>({});
  const [surfaceVisibleLimit, setSurfaceVisibleLimit] = useState(SURFACE_MATERIAL_INITIAL_VISIBLE_COUNT);
  const [favoriteSurfaceMaterialIds, setFavoriteSurfaceMaterialIds] = useState<string[]>([]);
  const [selectedSurfaceMaterialId, setSelectedSurfaceMaterialId] = useState<string | null>(null);
  const [surfaceSummaryOpen, setSurfaceSummaryOpen] = useState(false);
  const [collapsedPlanSections, setCollapsedPlanSections] = useState<Record<CollapsiblePlanSection, boolean>>(() => ({
    floorPlan: false,
    drawRoom: !isDesigner,
    openings: !isDesigner,
    templates: !isDesigner,
    planQuality: true,
    selectedRoom: true,
    connections: false,
  }));
  const templatePickerRef = useRef<HTMLDivElement | null>(null);
  const templatePickerHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const templatePickerOpenerRef = useRef<HTMLElement | null>(null);
  const floorFinishPanelOpenSignalRef = useRef(0);
  const pendingSurfaceRevealRef = useRef(false);
  const surfaceWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const planStartMode = controlledPlanStartMode ?? localPlanStartMode;
  const setPlanStartMode = (mode: PlanStartMode) => {
    setLocalPlanStartMode(mode);
    onPlanStartModeChange?.(mode);
  };
  // Plan's "Choose a template" opens Start a new design at Templates, the one template list (ST8).
  const openStartTemplates = (openerId: string) => () => requestStartTemplates({ openerId });
  // Upload floor plan, from anywhere, once its entry has let it through (lib/floor-plan-upload-request.ts).
  useEffect(() => {
    const handleUploadRequest = (event: Event) => {
      const { openerId, source } = floorPlanUploadRequestOf(event);
      openFloorPlanUploadWorkspace(openerId ?? undefined, source, () => setPlanStartMode("upload"));
    };
    window.addEventListener(FLOOR_PLAN_UPLOAD_REQUESTED_EVENT, handleUploadRequest);
    return () =>
      window.removeEventListener(FLOOR_PLAN_UPLOAD_REQUESTED_EVENT, handleUploadRequest);
  });
  useEffect(() => {
    if (planStartMode !== "template") return;
    const activeElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (activeElement && activeElement !== document.body) {
      templatePickerOpenerRef.current = activeElement;
    }
    const frameId = window.requestAnimationFrame(() => {
      templatePickerHeadingRef.current?.focus({ preventScroll: true });
      templatePickerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [planStartMode]);
  const closePlanStartWorkflow = () => {
    const opener = templatePickerOpenerRef.current;
    templatePickerOpenerRef.current = null;
    setPlanStartMode("start");
    window.requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    });
  };

  const titleClass = "text-sm font-semibold text-control-label";
  const isPlanSectionCollapsed = (section: CollapsiblePlanSection) => collapsedPlanSections[section];
  const setPlanSectionCollapsed = (section: CollapsiblePlanSection, collapsed: boolean) => {
    setCollapsedPlanSections((current) => ({ ...current, [section]: collapsed }));
  };
  const revealSurfaceWorkspace = useCallback(() => {
    const reveal = (attempt: number) => {
      const target = document.querySelector<HTMLElement>('[data-testid="room-surfaces-floor-panel"]');
      const scrollContainer = document.querySelector<HTMLElement>('[data-testid="design-controls-panel"]');
      const searchInput = document.querySelector<HTMLInputElement>('[data-testid="surfaces-search"]');

      if (!target || !scrollContainer) {
        if (attempt < 6) window.setTimeout(() => reveal(attempt + 1), 80);
        return;
      }

      const containerTop = scrollContainer.getBoundingClientRect().top;
      const targetTop = target.getBoundingClientRect().top;
      const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
      const nextScrollTop = Math.min(
        maxScrollTop,
        Math.max(0, scrollContainer.scrollTop + targetTop - containerTop - 8)
      );
      scrollContainer.scrollTop = nextScrollTop;

      if (window.innerWidth >= 768) {
        searchInput?.focus({ preventScroll: true });
      }

      if (attempt < 3) {
        window.setTimeout(() => reveal(attempt + 1), 120);
      }
    };

    window.setTimeout(() => reveal(0), 80);
  }, []);
  useEffect(() => {
    const signal = floorFinishPanelOpenSignal ?? 0;
    if (signal > 0 && signal !== floorFinishPanelOpenSignalRef.current) {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        floorFinishPanelOpenSignalRef.current = signal;
        pendingSurfaceRevealRef.current = true;
        setRoomFinishPanelOpen(true);
        setSurfaceTab("tiles");
        if (activeSurfaceTarget === "walls" || activeSurfaceTarget === "selected_wall") {
          setWallSurfaceMode("materials");
        }
        setCollapsedPlanSections((current) => ({ ...current, selectedRoom: false }));
        track("floor_surface_workspace_opened", {
          activeRoomId,
          target: activeSurfaceTarget,
          roomCount: surfaceRooms.length,
        });
      });
      return () => {
        cancelled = true;
      };
    }
    floorFinishPanelOpenSignalRef.current = signal;
  }, [activeRoomId, activeSurfaceTarget, floorFinishPanelOpenSignal, surfaceRooms.length]);
  useEffect(() => {
    if (!pendingSurfaceRevealRef.current) return;
    if (!roomFinishPanelOpen || collapsedPlanSections.selectedRoom) return;
    pendingSurfaceRevealRef.current = false;
    revealSurfaceWorkspace();
  }, [collapsedPlanSections, revealSurfaceWorkspace, roomFinishPanelOpen]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = window.localStorage.getItem("interior-ai:surface-material-favorites");
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setFavoriteSurfaceMaterialIds(
            parsed.filter((entry): entry is string => typeof entry === "string")
          );
        }
      } catch {
        setFavoriteSurfaceMaterialIds([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "interior-ai:surface-material-favorites",
        JSON.stringify(favoriteSurfaceMaterialIds)
      );
    } catch {
      // Favor the main editor interaction over persistence for private browsing failures.
    }
  }, [favoriteSurfaceMaterialIds]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setSurfaceVisibleLimit(SURFACE_MATERIAL_INITIAL_VISIBLE_COUNT);
    });
    return () => {
      cancelled = true;
    };
  }, [activeSurfaceTarget, flooringSearch, surfaceFilters, surfaceTab]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setWallPaintVisibleLimit(WALL_PAINT_INITIAL_VISIBLE_COUNT);
    });
    return () => {
      cancelled = true;
    };
  }, [activeSurfaceTarget, surfaceTab, wallPaintFamilyFilter, wallPaintSearch, wallSurfaceMode]);
  useEffect(() => {
    const targetMaterialId =
      activeSurfaceTarget === "floor"
        ? activeRoomFloorMaterialId
        : activeSurfaceTarget === "selected_wall"
          ? activeRoomSelectedWallSettings?.materialId
          : activeRoomWallSettings?.materialId;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (targetMaterialId) {
        setSelectedSurfaceMaterialId(targetMaterialId);
        onSurfaceMaterialSelected(targetMaterialId);
        return;
      }
      setSelectedSurfaceMaterialId(null);
    });
    return () => {
      cancelled = true;
    };
  }, [
    activeRoomFloorMaterialId,
    activeRoomSelectedWallSettings?.materialId,
    activeRoomWallSettings?.materialId,
    activeSurfaceTarget,
    onSurfaceMaterialSelected,
  ]);
  // The way to start that's open is black (UX 5n): Buttons, and the upload opener's own button.
  const planStartVariant = (mode: Exclude<PlanStartMode, "start">) => (planStartMode === mode ? "primary" : "secondary");
  const showPlanDetails =
    planStartMode !== "start" ||
    planRoomCount > 0 ||
    Boolean(floorPlanUnderlay) ||
    floorPlanTraceRoomMode ||
    floorPlanTraceRoomPointCount > 0 ||
    floorPlanTraceOpeningMode ||
    floorPlanTraceOpeningPointCount > 0 ||
    roomConnectionChecklistItems.length > 0 ||
    Boolean(visiblePlanOpening) ||
    isDesigner;
  const showTemplatePicker = planStartMode === "template";
  const hasActivePlanTrace =
    floorPlanTraceRoomMode ||
    floorPlanTraceRoomPointCount > 0 ||
    floorPlanTraceOpeningMode ||
    floorPlanTraceOpeningPointCount > 0;
  const showFloorPlanPanel =
    showPlanDetails &&
    (isDesigner ||
      planStartMode === "draw" ||
      planStartMode === "upload" ||
      Boolean(floorPlanUnderlay) ||
      hasActivePlanTrace ||
      Boolean(visiblePlanOpening));
  const showDrawTools =
    viewMode === "2d" &&
    (planStartMode === "draw" ||
      Boolean(floorPlanUnderlay) ||
      floorPlanTraceRoomMode ||
      floorPlanTraceRoomPointCount > 0);
  const connectionBlockerCount = roomConnectionChecklistItems.filter(isConnectionBlocker).length;
  const missingDoorwayCount = roomConnectionChecklistItems.filter(
    (item) => item.status === "needs_doorway"
  ).length;
  const hasConnectionBlockers = connectionBlockerCount > 0;
  const hasRooms = planRoomCount > 0;
  const hasStartedFurniture = planItemCount > 0;
  const hasOpenings = planOpeningCount > 0;
  const roomTypeLabel =
    HOUSE_ROOM_TYPES.find((option) => option.type === newRoomType)?.label ?? "Room";
  const activeRoomTypeLabel =
    HOUSE_ROOM_TYPES.find((option) => option.type === activeRoomType)?.label ?? "Room";
  const nextAction =
    !hasRooms
      ? {
          label: "Create room",
          body: "Choose a room type and size, then start from a clean plan.",
          action: onAddDesignerRoom,
        }
      : hasConnectionBlockers
        ? {
            label: "Add door",
            body: "One connected room still needs a door before this plan feels complete.",
            action: () => onAddFloorPlanOpeningFromTool("door"),
          }
        : !hasStartedFurniture
          ? {
              label: "Furnish room",
              body: "The room outline is ready. Add furniture or let AI suggest a layout.",
              action: onGoFurnish,
            }
          : viewMode === "2d" && onGoView3D
            ? {
                label: "View in 3D",
                body: `${planItemCount} item${planItemCount === 1 ? "" : "s"} placed. Check the room in 3D next.`,
                action: onGoView3D,
              }
            : {
                label: "Review shop list",
                body: `${planItemCount} item${planItemCount === 1 ? "" : "s"} placed. Review the shopping list when ready.`,
                action: onGoShop,
              };
  const openingStatusLabel = hasConnectionBlockers
    ? missingDoorwayCount > 0
      ? "Needs a door"
      : "Review connections"
    : hasOpenings
      ? `${planOpeningCount} placed`
      : "Optional";
  const consumerPlanOpeningSummary = planPaletteOpeningSummary(measurementUnitReady, planOpeningCount);
  const consumerPlanConnectionSummary =
    connectionBlockerCount > 0
      ? missingDoorwayCount === connectionBlockerCount
        ? `Add ${connectionBlockerCount} door${connectionBlockerCount === 1 ? "" : "s"}.`
        : `Review ${connectionBlockerCount} room connection${connectionBlockerCount === 1 ? "" : "s"}.`
      : "";
  const consumerPlanNextSteps = [
    roomIsDraft ? "Enter your room's real size." : `${planRoomCount} room${planRoomCount === 1 ? "" : "s"} ready.`,
    consumerPlanOpeningSummary,
    consumerPlanConnectionSummary,
    hasStartedFurniture ? "Review the shop list when ready." : "Start furnishing when ready.",
  ]
    .filter(Boolean)
    .join(" ");
  const furnitureStatusLabel = hasStartedFurniture
    ? `${planItemCount} item${planItemCount === 1 ? "" : "s"}`
    : "Not started";
  const exportStatusLabel = hasStartedFurniture ? "Ready" : "After furniture";
  const planGuideSteps = [
    {
      label: "Plan",
      meta: hasRooms ? "Room ready" : "Create room",
      ready: hasRooms,
      active: !hasRooms,
    },
    {
      label: "Furnish",
      meta: hasStartedFurniture ? `${planItemCount} placed` : "Add items",
      ready: hasStartedFurniture,
      active: hasRooms && !hasStartedFurniture,
    },
    {
      label: "Export",
      meta: hasStartedFurniture ? "Review" : "Later",
      ready: hasStartedFurniture,
      active: hasRooms && hasStartedFurniture,
    },
  ];
  const showRoomSetupWizard = !isDesigner && (showPlanDetails || !hasRooms);
  const showStartPanel = !hasRooms && !showRoomSetupWizard;
  const showPlanProgressPanel = showPlanDetails && !showRoomSetupWizard;
  const showPlanNextActionCard = showPlanDetails && !showRoomSetupWizard;
  const showStandaloneFloorFinishPanel = hasRooms && showPlanDetails && !showRoomSetupWizard;
  const surfaceCatalog = useSurfaceMaterialCatalog(roomFinishPanelOpen);
  useEffect(() => {
    if (!planCompletionSignal || isDesigner) return;

    const shouldAdvance =
      (planCompletionSignal.kind === "room" && !hasStartedFurniture) ||
      (planCompletionSignal.kind === "opening" &&
        hasRooms &&
        !hasConnectionBlockers &&
        !hasStartedFurniture);

    if (!shouldAdvance) {
      onPlanCompletionHandled?.(planCompletionSignal.id);
      return;
    }

    const timer = window.setTimeout(() => {
      onPlanCompletionHandled?.(planCompletionSignal.id);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    hasConnectionBlockers,
    hasRooms,
    hasStartedFurniture,
    isDesigner,
    onPlanCompletionHandled,
    planCompletionSignal,
  ]);
  const progressCardClass = "mt-2 rounded-lg border border-box-border bg-field p-2.5";
  const progressRowClass = "rounded-lg border border-box-border bg-tile px-3 py-2";
  const compactStatusClass = "rounded-lg border border-box-border bg-tile px-2.5 py-2";
  const progressLabelClass = "text-xs font-semibold text-label";
  const progressMetaClass = "mt-0.5 text-xs text-label-secondary";
  const progressReadyClass = "rounded-full bg-success-tint px-2 py-1 text-xs font-semibold text-on-success-tint";
  const progressTodoClass = "rounded-full bg-warning-tint px-2 py-1 text-xs font-semibold text-on-warning-tint";
  const progressViewClass = "rounded-full bg-accent-tint px-2 py-1 text-xs font-semibold text-on-accent-tint";
  const renderCollapsibleHeader = ({
    section,
    title,
    subtitle,
    accessory,
  }: {
    section: CollapsiblePlanSection;
    title: string;
    subtitle?: ReactNode;
    accessory?: ReactNode;
  }) => {
    const collapsed = isPlanSectionCollapsed(section);
    return (
      <CollapsiblePlanHeader
        section={section}
        title={title}
        subtitle={subtitle}
        accessory={accessory}
        collapsed={collapsed}
        titleClassName={titleClass}
        metaClassName={progressMetaClass}
        onToggle={() => setPlanSectionCollapsed(section, !collapsed)}
      />
    );
  };
  const planToolGridClass = "grid grid-cols-3 gap-2 border-t border-separator-subtle bg-surface-secondary p-2";
  const renderPlanToolSection = ({
    section,
    title,
    children,
  }: {
    section: CollapsiblePlanSection;
    title: string;
    children: ReactNode;
  }) => {
    const collapsed = isPlanSectionCollapsed(section);
    return (
      <PlanToolSection
        section={section}
        title={title}
        collapsed={collapsed}
        onToggle={() => setPlanSectionCollapsed(section, !collapsed)}
      >
        {children}
      </PlanToolSection>
    );
  };
  const renderPlanToolTile = ({
    id,
    testId,
    icon,
    label,
    shortcut,
    active,
    disabled,
    title,
    onClick,
  }: {
    id?: string;
    testId: string;
    icon: PlanToolIconName;
    label: string;
    shortcut?: string;
    active?: boolean;
    disabled?: boolean;
    title?: string;
    onClick?: () => void;
  }) => (
    <PlanToolTile
      id={id}
      testId={testId}
      icon={icon}
      label={label}
      shortcut={shortcut}
      active={active}
      disabled={disabled}
      title={title}
      onClick={onClick}
    />
  );
  const startDrawRoomMode = (mode: FloorPlanDrawRoomMode) => {
    setPlanStartMode("draw");
    onFloorPlanTraceRoomDrawModeChange(mode);
    onFloorPlanTraceRoomModeChange(true);
  };
  const activeFloorSettings = normalizeFloorSurfaceSettings(
    {
      floorPattern: activeRoomFloorPattern,
      floorRotationDeg: activeRoomFloorRotationDeg,
      floorScale: activeRoomFloorScale,
      floorPatternOffset: activeRoomFloorPatternOffset,
      floorJointSizeMm: activeRoomFloorJointSizeMm,
      floorJointColor: activeRoomFloorJointColor,
    },
    normalizeFloorRotationDeg,
    clampFloorPatternScale
  );
  const activeWallTargetSettings =
    activeSurfaceTarget === "selected_wall"
      ? activeRoomSelectedWallSettings
      : activeRoomWallSettings;
  const fallbackWallSettings: NormalizedSurfaceSettings = {
    materialId: null,
    paintColorHex: null,
    paintName: null,
    pattern: "straight",
    rotationDeg: 0,
    scale: DEFAULT_FLOOR_PATTERN_SCALE,
    offset: DEFAULT_FLOOR_PATTERN_OFFSET,
    jointSizeMm: DEFAULT_FLOOR_JOINT_SIZE_MM,
    jointColor: DEFAULT_FLOOR_JOINT_COLOR,
  };
  const activeTargetSettings: NormalizedSurfaceSettings =
    activeSurfaceTarget === "floor"
      ? {
          materialId: activeRoomFloorMaterialId ?? null,
          paintColorHex: null,
          paintName: null,
          pattern: activeFloorSettings.floorPattern,
          rotationDeg: activeFloorSettings.floorRotationDeg,
          scale: activeFloorSettings.floorScale,
          offset: activeFloorSettings.floorPatternOffset,
          jointSizeMm: activeFloorSettings.floorJointSizeMm,
          jointColor: activeFloorSettings.floorJointColor,
        }
      : activeSurfaceTarget === "ceiling"
        ? activeRoomCeilingSettings ?? fallbackWallSettings
      : activeWallTargetSettings ?? fallbackWallSettings;
  const activeTargetMaterialId = activeTargetSettings.materialId ?? null;
  const activeFloorMaterial = getFloorMaterialById(activeRoomFloorMaterialId);
  const activeRoomFloorSurfaceMaterial = getRuntimeSurfaceMaterialById(activeRoomFloorMaterialId);
  const activeTargetStarterMaterial = getFloorMaterialById(activeTargetMaterialId ?? activeRoomFloorMaterialId);
  const activeSurfaceMaterial = getRuntimeSurfaceMaterialById(activeTargetMaterialId);
  const activeSurfaceTargetLabel =
    activeSurfaceTarget === "floor"
      ? "Floor"
      : activeSurfaceTarget === "ceiling"
        ? "Ceiling"
      : activeSurfaceTarget === "walls"
        ? "All walls"
        : selectedWallLabel ?? "Selected wall";
  const activeFloorDisplayName =
    activeRoomFloorSurfaceMaterial?.surface_material.product_name ?? activeFloorMaterial.name;
  const activeSurfaceDisplayName =
    activeSurfaceMaterial?.surface_material.product_name ??
    (activeSurfaceTarget !== "floor" && activeTargetSettings.paintColorHex
      ? getWallPaintDisplayName(activeTargetSettings.paintColorHex, activeTargetSettings.paintName)
      : activeSurfaceTarget === "floor" || activeTargetMaterialId
        ? activeTargetStarterMaterial.name
        : activeSurfaceTarget === "ceiling"
          ? "No ceiling paint"
          : "No wall finish");
  const activeFloorRotationDeg = activeFloorSettings.floorRotationDeg;
  const activeFloorScale = activeFloorSettings.floorScale;
  const canApplyActiveSurfaceTarget =
    activeSurfaceTarget !== "selected_wall" || Boolean(selectedWallFaceId);
  const surfaceMaterialDraftsVisible = isDesigner || process.env.NODE_ENV !== "production";
  const visibleSurfaceMaterials = useMemo(
    () =>
      surfaceCatalog.records.filter((material) => {
        const category = material.surface_material.surface_category;
        const matchesTarget =
          activeSurfaceTarget === "floor"
            ? category === "flooring"
            : activeSurfaceTarget === "ceiling"
              ? category === "paint"
            : category === "wall_tile" ||
              category === "paint" ||
              category === "wallpaper" ||
              category === "wall_panel";
        const matchesVisibility =
          surfaceMaterialDraftsVisible ||
          material.import_governance.publish_status === "published";
        return matchesTarget && matchesVisibility;
      }),
    [activeSurfaceTarget, surfaceCatalog.records, surfaceMaterialDraftsVisible]
  );
  const selectedSurfaceMaterial =
    visibleSurfaceMaterials.find(
      (material) => material.surface_material.material_id === selectedSurfaceMaterialId
    ) ??
    surfaceCatalog.byId.get(activeTargetMaterialId) ??
    null;
  const selectedSurfaceMaterialPrimaryId = getSurfaceMaterialPrimaryId(selectedSurfaceMaterial);
  const surfaceMaterialProductGroups = buildSurfaceMaterialProductGroups(visibleSurfaceMaterials, [
    activeTargetMaterialId,
    selectedSurfaceMaterialPrimaryId,
  ]);
  const selectedSurfaceMaterialGroup = (() => {
    const materialId = selectedSurfaceMaterialPrimaryId ?? activeTargetMaterialId;
    if (!materialId) return null;
    return (
      surfaceMaterialProductGroups.find((group) =>
        group.variants.some((variant) => variant.surface_material.material_id === materialId)
      ) ?? null
    );
  })();
  const activeBrushMaterialId = surfaceBrushMaterialId ?? selectedSurfaceMaterialPrimaryId;
  const activeBrushPaintColorHex = normalizeWallPaintColorHex(surfaceBrushPaintColorHex);
  const activeBrushPaintName = activeBrushPaintColorHex
    ? getWallPaintDisplayName(activeBrushPaintColorHex, surfaceBrushPaintName)
    : null;
  const activeWallPaintApplyColorHex =
    activeBrushPaintColorHex ??
    (activeSurfaceTarget !== "floor" ? activeTargetSettings.paintColorHex : null);
  const activeWallPaintApplyName = activeWallPaintApplyColorHex
    ? activeBrushPaintName ??
      getWallPaintDisplayName(activeWallPaintApplyColorHex, activeTargetSettings.paintName)
    : null;
  const wallPaintSearchTokens = useMemo(
    () =>
      wallPaintSearch
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean),
    [wallPaintSearch]
  );
  const swatchMatchesWallPaintFilters = useCallback(
    (swatch: WallPaintSwatch) => {
      if (wallPaintFamilyFilter !== "all" && swatch.family !== wallPaintFamilyFilter) return false;
      if (wallPaintSearchTokens.length === 0) return true;
      const searchable = getWallPaintSwatchSearchText(swatch);
      return wallPaintSearchTokens.every((token) => searchable.includes(token));
    },
    [wallPaintFamilyFilter, wallPaintSearchTokens]
  );
  const filteredNipponWallPaintSwatches = useMemo(
    () => surfaceCatalog.wallPaintSwatches.filter(swatchMatchesWallPaintFilters),
    [surfaceCatalog.wallPaintSwatches, swatchMatchesWallPaintFilters]
  );
  const visibleNipponWallPaintSwatches = useMemo(
    () => filteredNipponWallPaintSwatches.slice(0, wallPaintVisibleLimit),
    [filteredNipponWallPaintSwatches, wallPaintVisibleLimit]
  );
  const hiddenNipponWallPaintCount = Math.max(
    0,
    filteredNipponWallPaintSwatches.length - visibleNipponWallPaintSwatches.length
  );
  const favoriteSurfaceMaterialIdSet = useMemo(
    () => new Set(favoriteSurfaceMaterialIds),
    [favoriteSurfaceMaterialIds]
  );
  const surfaceFilterOptions = useMemo(
    () => buildSurfaceFilterOptions(visibleSurfaceMaterials, surfaceFilters.brand),
    [visibleSurfaceMaterials, surfaceFilters.brand]
  );
  const filteredSurfaceMaterialGroups = filterSurfaceMaterialGroups(surfaceMaterialProductGroups, {
    search: flooringSearch,
    filters: surfaceFilters,
    favoriteIds: favoriteSurfaceMaterialIdSet,
    roomType: activeRoomType,
  });
  const visibleFilteredSurfaceMaterialGroups = filteredSurfaceMaterialGroups.slice(
    0,
    surfaceVisibleLimit
  );
  const hiddenSurfaceMaterialCount = Math.max(
    0,
    filteredSurfaceMaterialGroups.length - visibleFilteredSurfaceMaterialGroups.length
  );
  const hasSurfaceFilters = hasActiveSurfaceFilters(flooringSearch, surfaceFilters);
  const clearSurfaceFilters = () => {
    setFlooringSearch("");
    setSurfaceFilters({});
    track("floor_surface_filters_cleared", {
      activeRoomId,
    });
  };
  const toggleFavoriteSurfaceMaterialGroup = (group: SurfaceMaterialProductGroup) => {
    const groupMaterialIds = group.variants.map((variant) => variant.surface_material.material_id);
    const saved = !groupMaterialIds.some((materialId) => favoriteSurfaceMaterialIdSet.has(materialId));
    setFavoriteSurfaceMaterialIds((current) => {
      if (saved) return Array.from(new Set([...current, ...groupMaterialIds]));
      return current.filter((entry) => !groupMaterialIds.includes(entry));
    });
    track("floor_surface_favorite_toggled", {
      materialId: group.primary.surface_material.material_id,
      variantCount: group.variants.length,
      saved,
    });
  };
  const selectSurfaceMaterial = (materialId: string, source: "card" | "details") => {
    setSelectedSurfaceMaterialId(materialId);
    onSurfaceMaterialSelected(materialId);
    onSurfacePaintSelected(null);
    track("surface_material_selected", {
      materialId,
      source,
      target: activeSurfaceTarget,
    });
  };
  const selectWallPaint = (
    colorHex: string,
    name?: string | null,
    source: "swatch" | "nippon" | "custom" = "swatch"
  ) => {
    const normalizedColor = normalizeWallPaintColorHex(colorHex);
    if (!normalizedColor) return null;
    const paintName = getWallPaintDisplayName(normalizedColor, name);
    setCustomWallPaintHex(normalizedColor);
    setWallPaintApplyName(paintName);
    setSelectedSurfaceMaterialId(null);
    onSurfaceMaterialSelected(null);
    onSurfacePaintSelected(normalizedColor, paintName);
    track("wall_paint_selected", {
      colorHex: normalizedColor,
      name: paintName,
      source,
      target: activeSurfaceTarget,
    });
    return { colorHex: normalizedColor, name: paintName };
  };
  const applySurfaceMaterialToActiveRoom = (materialId: string, source: "card" | "details" = "card") => {
    selectSurfaceMaterial(materialId, source);
    if (activeSurfaceTarget === "floor") {
      onApplyFloorMaterialToRoom(materialId);
    } else if (activeSurfaceTarget === "ceiling") {
      return;
    } else if (activeSurfaceTarget === "selected_wall") {
      onApplyWallMaterialToRoom(materialId, activeRoomId, selectedWallFaceId ?? null);
    } else {
      onApplyWallMaterialToRoom(materialId, activeRoomId, null);
    }
  };
  const applySurfaceMaterialToAllRooms = (materialId: string) => {
    selectSurfaceMaterial(materialId, "details");
    if (activeSurfaceTarget === "floor") {
      onApplyFloorMaterialToAllRooms(materialId);
      return;
    }
    if (activeSurfaceTarget === "ceiling") return;
    onApplyWallMaterialToAllRooms(materialId);
  };
  const applyWallPaintToActiveTarget = (
    colorHex: string,
    name?: string | null,
    source: "swatch" | "nippon" | "custom" = "swatch"
  ) => {
    if (activeSurfaceTarget === "floor") return;
    const paint = selectWallPaint(colorHex, name, source);
    if (!paint) return;
    if (activeSurfaceTarget === "ceiling") {
      onApplyCeilingPaintToRoom(paint.colorHex, paint.name, activeRoomId);
      return;
    }
    if (activeSurfaceTarget === "selected_wall") {
      onApplyWallPaintToRoom(paint.colorHex, paint.name, activeRoomId, selectedWallFaceId ?? null);
      return;
    }
    onApplyWallPaintToRoom(paint.colorHex, paint.name, activeRoomId, null);
  };
  const applyWallPaintToAllRooms = (
    colorHex: string,
    name?: string | null,
    source: "swatch" | "nippon" | "custom" = "swatch"
  ) => {
    const paint = selectWallPaint(colorHex, name, source);
    if (!paint) return;
    if (activeSurfaceTarget === "ceiling") {
      onApplyCeilingPaintToAllRooms(paint.colorHex, paint.name);
      return;
    }
    onApplyWallPaintToAllRooms(paint.colorHex, paint.name);
  };
  const renderWallPaintPicker = () => (
    <WallPaintPicker
      activeTargetSettings={activeTargetSettings}
      wallPaintFamilyFilter={wallPaintFamilyFilter}
      setWallPaintFamilyFilter={setWallPaintFamilyFilter}
      activeSurfaceTarget={activeSurfaceTarget}
      customWallPaintHex={customWallPaintHex}
      setCustomWallPaintHex={setCustomWallPaintHex}
      wallPaintApplyName={wallPaintApplyName}
      setWallPaintApplyName={setWallPaintApplyName}
      floorMaterialMetaClass={floorMaterialMetaClass}
      canEdit={canEdit}
      canApplyActiveSurfaceTarget={canApplyActiveSurfaceTarget}
      filteredNipponWallPaintSwatches={filteredNipponWallPaintSwatches}
      visibleNipponWallPaintSwatches={visibleNipponWallPaintSwatches}
      wallPaintSearch={wallPaintSearch}
      setWallPaintSearch={setWallPaintSearch}
      setWallPaintVisibleLimit={setWallPaintVisibleLimit}
      hiddenNipponWallPaintCount={hiddenNipponWallPaintCount}
      applyWallPaintToActiveTarget={applyWallPaintToActiveTarget}
      applyWallPaintToAllRooms={applyWallPaintToAllRooms}
      onResetActiveCeilingSurface={onResetActiveCeilingSurface}
      onResetActiveWallSurface={onResetActiveWallSurface}
    />
  );
  // A room's Floor, Walls or Ceiling row opens the picker for that surface; walls open on Paint (UX audit ED8).
  const openRoomSurface = (target: RoomSurfaceTarget, reveal = false) => {
    if (reveal) pendingSurfaceRevealRef.current = true; onSurfaceTargetChange(target); setSurfaceTab("tiles"); setWallSurfaceMode("paint"); setRoomFinishPanelOpen(true); setPlanSectionCollapsed("selectedRoom", false);
  };
  const openSurfaceSummary = (source: "header" | "information_fallback") => {
    setSurfaceSummaryOpen(true);
    track("surface_summary_opened", {
      source,
      activeRoomId,
      roomCount: surfaceRooms.length,
    });
  };
  const requestSelectedSurfaceInformation = () => {
    const sampleUrl =
      selectedSurfaceMaterial?.commerce?.sample_request_url ??
      selectedSurfaceMaterial?.source?.sample_request_url ??
      selectedSurfaceMaterial?.source?.source_url ??
      null;
    track("surface_sample_requested", {
      materialId: selectedSurfaceMaterialPrimaryId,
      hasUrl: Boolean(sampleUrl),
      target: activeSurfaceTarget,
    });
    if (sampleUrl) {
      window.open(sampleUrl, "_blank", "noreferrer");
      return;
    }
    openSurfaceSummary("information_fallback");
  };
  const activeSurfaceSummaryRows = buildSurfaceSummaryRows(surfaceRooms, (materialId) =>
    getSurfaceMaterialSampleUrl(surfaceCatalog.byId.get(materialId))
  );
  const setSurfaceFilter = (key: SurfaceFilterKey, value: string) => {
    setSurfaceFilters((current) => withSurfaceFilter(current, key, value, visibleSurfaceMaterials));
    track("floor_surface_filter_changed", {
      key,
      value: value || null,
    });
  };
  const toggleFavoriteSurfaceFilter = () => {
    const nextFavoritesOnly = !surfaceFilters.favoritesOnly;
    setSurfaceFilters((current) => ({
      ...current,
      favoritesOnly: !current.favoritesOnly,
    }));
    track("floor_surface_filter_changed", {
      key: "favorites",
      value: nextFavoritesOnly ? "only" : null,
    });
  };
  const toggleRecommendedSurfaceFilter = () => {
    const nextRecommendedOnly = !surfaceFilters.recommendedOnly;
    setSurfaceFilters((current) => ({
      ...current,
      recommendedOnly: !current.recommendedOnly,
    }));
    track("floor_surface_filter_changed", {
      key: "recommended",
      value: nextRecommendedOnly ? activeRoomType : null,
    });
  };
  const floorMaterialMetaClass = "block text-xs text-label-secondary";
  const floorFieldLabelClass = "text-xs font-semibold text-control-label-idle";
  const floorInputClass = "h-9 w-full rounded-lg border border-box-border bg-field px-2 text-right text-sm text-label";
  const consumerFieldLabelClass = "flex flex-col gap-1 text-xs font-semibold text-control-label-idle";
  const consumerInputClass = "min-h-10 rounded-lg border border-box-border bg-field px-2.5 py-2 text-sm text-label disabled:opacity-50";
  const activeFloorLabel =
    floorOptions.find((option) => option.level === activeFloorLevel)?.label ?? "Level 1";
  const activeRoomArea = getActiveSurfaceRoomFloorAreaSqm(surfaceRooms, activeRoomId);
  const activeRoomPerimeter = Math.max(0, (roomWidth + roomDepth) * 2);
  const activeRoomAspectRatio = roomWidth > 0 && roomDepth > 0 ? roomWidth / roomDepth : 0;
  const activeRoomAspectLabel =
    activeRoomAspectRatio > 0
      ? activeRoomAspectRatio >= 1
        ? `${activeRoomAspectRatio.toFixed(2)}:1`
        : `1:${(1 / activeRoomAspectRatio).toFixed(2)}`
      : "-";
  const activeRoomClearWidth = Math.max(0, roomWidth - (activeRoomWallThicknessMm / 1000) * 2);
  const activeRoomClearDepth = Math.max(0, roomDepth - (activeRoomWallThicknessMm / 1000) * 2);
  const measurementTileClass = "rounded-lg border border-box-border bg-tile px-3 py-2";
  const measurementValueClass = "text-sm font-semibold text-label";
  const measurementLabelClass = "mt-0.5 text-xs font-semibold uppercase tracking-wide text-label-secondary";
  const measurementCheckClass = (ready: boolean) => {
    return ready
      ? "rounded-full bg-success-tint px-2 py-1 text-xs font-semibold text-on-success-tint"
      : "rounded-full bg-warning-tint px-2 py-1 text-xs font-semibold text-on-warning-tint";
  };
  const measurementChecks = [
    {
      label: "Dimensions",
      value: formatPlanDimensionsLabel(roomWidth, roomDepth, measurementUnit),
      ready: hasRooms,
    },
    {
      label: "Scale",
      value: floorPlanUnderlay ? (floorPlanUnderlay.calibration ? "Set" : "Not set") : "Not needed",
      ready: !floorPlanUnderlay || Boolean(floorPlanUnderlay.calibration),
    },
    {
      label: "Snap",
      value: snapEnabled ? "On" : "Off",
      ready: snapEnabled,
    },
    {
      label: "Doors & windows",
      value: hasOpenings ? `${planOpeningCount} placed` : "Optional",
      ready: true,
    },
  ];
  const surfaceMaterialCardClass = (materialId: string, selectedOverride?: boolean) => {
    const isSelected = selectedOverride ?? activeTargetMaterialId === materialId;
    return [
      "rounded-lg border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
      isSelected
        ? "border-success-tint-border bg-success-tint"
        : "border-box-border bg-field hover:bg-control-secondary-hover",
    ].join(" ");
  };
  const surfaceBrowserHolder = surfaceBrowserHolderOf(Boolean(visiblePlanOpening), isPlanSectionCollapsed("selectedRoom"));
  const renderSurfaceMaterialBrowser = (holder: ReturnType<typeof surfaceBrowserHolderOf>) => (
    <SurfaceMaterialCatalogBoundary
      ref={surfaceWorkspaceRef}
      data-testid="room-surfaces-floor-panel" data-floor-material-id={activeRoomFloorMaterialId}
      data-surface-target={activeSurfaceTarget} data-surface-material-id={activeTargetMaterialId ?? ""}
      open={roomFinishPanelOpen && holder === surfaceBrowserHolder} status={surfaceCatalog.status} onRetry={surfaceCatalog.retry}
      className="mt-2 rounded-lg border border-box-border bg-tile p-2"
    >
      {!hasRooms ? (
        <EmptyFloorPlanSurfacesActions isDesigner={isDesigner}
          progressMetaClass={progressMetaClass}
          onStartDrawRoomSetup={startDrawRoomSetup} onSelectUploadMode={() => setPlanStartMode("upload")}
          onAddDesignerRoom={onAddDesignerRoom} />
      ) : null}

      <SurfaceBrowserHeader
        pro={isDesigner} targetLabel={activeSurfaceTargetLabel} displayName={activeSurfaceDisplayName} target={activeSurfaceTarget}
        selectedWallFaceId={selectedWallFaceId} tab={surfaceTab} metaClass={progressMetaClass}
        brush={{
          active: surfaceBrushActive,
          disabled: !canEdit || (!selectedSurfaceMaterialPrimaryId && !activeBrushPaintColorHex && !(activeSurfaceTarget !== "floor" && activeTargetSettings.paintColorHex)),
          status: activeBrushPaintColorHex ? `Click walls or ceilings in 3D to apply ${activeBrushPaintName}` : activeBrushMaterialId ? "Click floor or walls in 3D to apply" : "Choose a material or paint first",
          onToggle: () => {
            if (!surfaceBrushActive && activeSurfaceTarget !== "floor" && !activeBrushPaintColorHex && activeTargetSettings.paintColorHex) {
              onSurfacePaintSelected(activeTargetSettings.paintColorHex, getWallPaintDisplayName(activeTargetSettings.paintColorHex, activeTargetSettings.paintName));
            }
            onSurfaceBrushActiveChange(!surfaceBrushActive);
          },
        }}
        onBack={() => setRoomFinishPanelOpen(false)} onOpenSummary={() => openSurfaceSummary("header")} onTargetChange={onSurfaceTargetChange} onTabChange={setSurfaceTab}
      />

      {surfaceTab === "tiles" ? (
        <>
          {activeSurfaceTarget !== "floor" && activeSurfaceTarget !== "ceiling" ? (
            <SegmentedControl
              label="Wall finish"
              className="mt-2"
              fill
              value={wallSurfaceMode}
              onChange={setWallSurfaceMode}
              options={WALL_SURFACE_MODE_OPTIONS}
            />
          ) : null}
          {activeSurfaceTarget !== "floor" &&
          (activeSurfaceTarget === "ceiling" || wallSurfaceMode === "paint") ? (
            renderWallPaintPicker()
          ) : (
            <>
          <SurfaceBrowserFilterBar
            search={flooringSearch}
            searchPlaceholder={activeSurfaceTarget === "floor" ? "Search flooring" : "Search wall finishes"}
            filters={surfaceFilters}
            filterOptions={surfaceFilterOptions}
            filterDrawerOpen={surfaceFilterDrawerOpen}
            viewMode={surfaceViewMode}
            hasFilters={hasSurfaceFilters}
            onSearchChange={setFlooringSearch}
            onFilterChange={setSurfaceFilter}
            onToggleFilterDrawer={() => setSurfaceFilterDrawerOpen((open) => !open)}
            onToggleRecommended={toggleRecommendedSurfaceFilter}
            onToggleFavorites={toggleFavoriteSurfaceFilter}
            onToggleViewMode={() => setSurfaceViewMode((mode) => (mode === "grid" ? "list" : "grid"))}
            onClear={clearSurfaceFilters}
          />

          {filteredSurfaceMaterialGroups.length > 0 ? (
            <div className={progressMetaClass}>
              Showing {visibleFilteredSurfaceMaterialGroups.length} of {filteredSurfaceMaterialGroups.length} products
            </div>
          ) : null}

          <div className={surfaceViewMode === "grid" ? "mt-2 grid grid-cols-2 gap-2" : "mt-2 grid gap-2"}>
            {filteredSurfaceMaterialGroups.length > 0 ? (
              visibleFilteredSurfaceMaterialGroups.map((group) => {
                const material = group.primary;
                const materialId = material.surface_material.material_id;
                const selected = group.variants.some(
                  (variant) => variant.surface_material.material_id === activeTargetMaterialId
                );
                const favorite = group.variants.some((variant) =>
                  favoriteSurfaceMaterialIdSet.has(variant.surface_material.material_id)
                );
                const textureSource = getSurfaceMaterialTextureSource(material);
                const publishStatus = group.variants.some(
                  (variant) => variant.import_governance.publish_status === "published"
                )
                  ? "published"
                  : material.import_governance.publish_status;
                const tileable = group.variants.some((variant) => variant.texture_assets.tileable === true);
                const sampleAvailable = group.variants.some(
                  (variant) =>
                    variant.commerce?.sample_available === true || Boolean(variant.commerce?.sample_request_url)
                );
                const displayName = getSurfaceMaterialProductDisplayName(material);
                return (
                  <div
                    key={materialId}
                    data-testid={`surface-floor-material-${materialId}`}
                    data-material-name={displayName}
                    className={surfaceMaterialCardClass(materialId, selected)}
                  >
                    <button
                      type="button"
                      className={surfaceViewMode === "grid" ? "w-full text-left" : "grid w-full grid-cols-[3rem_1fr] gap-2 text-left"}
                      disabled={!canEdit || !canApplyActiveSurfaceTarget}
                      onClick={() => applySurfaceMaterialToActiveRoom(materialId)}
                    >
                      <span
                        className={surfaceViewMode === "grid" ? "block aspect-square w-full rounded-md border border-swatch-edge" : "block h-12 w-12 rounded-md border border-swatch-edge"}
                        style={getSurfaceMaterialSwatchStyle(material)}
                      />
                      <span className={surfaceViewMode === "grid" ? "mt-2 block min-w-0" : "block min-w-0"}>
                        <span className="block truncate text-xs text-label-secondary">{getSurfaceMaterialCollectionLabel(material)}</span>
                        <span className="block truncate text-sm font-semibold text-label" title={material.surface_material.product_name}>
                          {getSurfaceMaterialModelName(material)}
                        </span>
                        <span className={floorMaterialMetaClass}>
                          {getSurfaceMaterialGroupMetaLabel(group)}
                        </span>
                        {selected ? (
                          <span className="mt-1 inline-flex rounded-full bg-success-tint px-1.5 py-0.5 text-xs font-semibold text-on-success-tint">
                            Active
                          </span>
                        ) : null}
                        <span className="mt-1 flex flex-wrap gap-1">
                          <span className={publishStatus === "published" ? "rounded-full bg-success-tint px-1.5 py-0.5 text-xs font-semibold text-on-success-tint" : "rounded-full bg-warning-tint px-1.5 py-0.5 text-xs font-semibold text-on-warning-tint"}>
                            {publishStatus === "published" ? "Published" : "Draft"}
                          </span>
                          <span className={textureSource ? "rounded-full bg-accent-tint px-1.5 py-0.5 text-xs font-semibold text-on-accent-tint" : "rounded-full bg-control-track px-1.5 py-0.5 text-xs font-semibold text-label-secondary"}>
                            {textureSource ? "Texture" : "Swatch only"}
                          </span>
                          {tileable ? (
                            <span className="rounded-full bg-control-track px-1.5 py-0.5 text-xs font-semibold text-label-secondary">
                              Tileable
                            </span>
                          ) : null}
                          {sampleAvailable ? (
                            <span className="rounded-full bg-control-track px-1.5 py-0.5 text-xs font-semibold text-label-secondary">
                              Sample
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                    <SurfaceMaterialCardActions
                      materialId={materialId}
                      productName={displayName}
                      favorite={favorite}
                      onToggleFavorite={() => toggleFavoriteSurfaceMaterialGroup(group)}
                      onOpenDetails={() => selectSurfaceMaterial(materialId, "details")}
                    />
                  </div>
                );
              })
            ) : (
              <div className="rounded-lg border border-box-border bg-field p-3 text-xs text-label-secondary">
                {isDesigner
                  ? activeSurfaceTarget === "floor"
                    ? "No flooring materials match the current filters."
                    : "No wall materials match the current filters."
                  : activeSurfaceTarget === "floor"
                    ? "No published flooring materials are available yet."
                    : "No published wall materials are available yet."}
              </div>
            )}
          </div>

          {hiddenSurfaceMaterialCount > 0 ? (
            <Button
              data-testid="surfaces-show-more"
              variant="secondary" size="regular" className="mt-2 w-full"
              onClick={() =>
                setSurfaceVisibleLimit((limit) => limit + SURFACE_MATERIAL_VISIBLE_INCREMENT)
              }
            >
              Show more ({hiddenSurfaceMaterialCount})
            </Button>
          ) : null}

          <div data-testid="surface-product-detail" className="mt-3 rounded-lg border border-box-border bg-field p-2">
            <div className="flex items-start gap-2">
              {selectedSurfaceMaterial ? (
                <span
                  className="h-16 w-16 shrink-0 rounded-md border border-swatch-edge"
                  style={getSurfaceMaterialSwatchStyle(selectedSurfaceMaterial)}
                />
              ) : (
                <span
                  className="h-16 w-16 shrink-0 rounded-md border border-swatch-edge"
                  style={
                    activeSurfaceTarget === "floor" || activeTargetMaterialId
                      ? getFloorMaterialSwatchStyle(activeTargetStarterMaterial)
                      : { background: "linear-gradient(135deg, #f7f5ef, #e6e0d2)" }
                  }
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-label" title={selectedSurfaceMaterial?.surface_material.product_name ?? activeSurfaceDisplayName}>
                  {selectedSurfaceMaterial
                    ? getSurfaceMaterialProductDisplayName(selectedSurfaceMaterial)
                    : activeSurfaceDisplayName}
                </div>
                <div className={progressMetaClass}>
                  {selectedSurfaceMaterial
                    ? `${activeSurfaceTargetLabel} · ${getSurfaceMaterialSupplierLabel(selectedSurfaceMaterial)} · Size ${getSurfaceMaterialSizeOptionLabel(selectedSurfaceMaterial)}${
                        selectedSurfaceMaterialGroup
                          ? ` · ${getSurfaceMaterialGroupSizeLabels(selectedSurfaceMaterialGroup).length} sizes`
                          : ""
                      }`
                    : "Starter finish · Not orderable"}
                </div>
                {isDesigner && selectedSurfaceMaterial ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="rounded-full bg-warning-tint px-1.5 py-0.5 text-xs font-semibold text-on-warning-tint">
                      {selectedSurfaceMaterial.import_governance.publish_status.replace(/_/g, " ")}
                    </span>
                    {selectedSurfaceMaterial.import_governance.publish_blockers.length > 0 ? (
                      <span className="rounded-full bg-warning-tint px-1.5 py-0.5 text-xs font-semibold text-on-warning-tint">
                        {selectedSurfaceMaterial.import_governance.publish_blockers.length} blockers
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="primary" size="compact"
                disabled={!canEdit || !selectedSurfaceMaterialPrimaryId || !canApplyActiveSurfaceTarget}
                onClick={() => selectedSurfaceMaterialPrimaryId && applySurfaceMaterialToActiveRoom(selectedSurfaceMaterialPrimaryId)}
              >
                Apply target
              </Button>
              <Button
                variant="secondary" size="compact"
                disabled={!canEdit || !selectedSurfaceMaterialPrimaryId}
                onClick={() => selectedSurfaceMaterialPrimaryId && applySurfaceMaterialToAllRooms(selectedSurfaceMaterialPrimaryId)}
              >
                Apply all
              </Button>
              <Button variant="secondary" size="compact" onClick={requestSelectedSurfaceInformation}>
                Information
              </Button>
              {selectedSurfaceMaterial?.source?.source_url && isDesigner ? (
                <a
                  href={selectedSurfaceMaterial.source.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClassName({ size: "compact" })}
                >
                  Source
                </a>
              ) : null}
            </div>

          </div>
            </>
          )}
        </>
      ) : (
        <div data-testid="surfaces-room-list" className="mt-2 grid gap-2">
          {surfaceRooms.map((room) => {
            const row =
              activeSurfaceSummaryRows.find(
                (entry) =>
                  entry.room.id === room.id &&
                  (activeSurfaceTarget === "selected_wall"
                    ? entry.target === "selected_wall" && entry.surfaceLabel === (selectedWallLabel ?? "")
                    : entry.target === activeSurfaceTarget)
              ) ?? activeSurfaceSummaryRows.find((entry) => entry.room.id === room.id && entry.target === "floor");
            const active = room.id === activeRoomId;
            return (
              <div key={room.id} className="rounded-lg border border-box-border bg-field p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-label">
                      {room.name}
                    </div>
                    <div className={progressMetaClass}>
                      {(room.floorLabel ?? "Floor")} · {formatDisplayArea(room.floorAreaSqm, measurementUnit)}
                    </div>
                    <div className={progressMetaClass}>
                      {row?.materialName ?? "Starter finish"}
                    </div>
                  </div>
                  {active ? <span className={progressReadyClass}>Active</span> : null}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button variant="secondary" size="compact" onClick={() => onSelectRoom(room.id)}>
                    Open
                  </Button>
                  <Button
                    variant="secondary" size="compact"
                    disabled={
                      !canEdit ||
                      !canApplyActiveSurfaceTarget ||
                      (activeSurfaceTarget === "floor"
                        ? !selectedSurfaceMaterialPrimaryId
                        : activeSurfaceTarget === "ceiling"
                          ? !activeWallPaintApplyColorHex
                        : wallSurfaceMode === "paint"
                          ? !activeWallPaintApplyColorHex
                          : !selectedSurfaceMaterialPrimaryId)
                    }
                    onClick={() => {
                      if (activeSurfaceTarget === "floor") {
                        if (selectedSurfaceMaterialPrimaryId) {
                          onApplyFloorMaterialToRoom(selectedSurfaceMaterialPrimaryId, room.id);
                        }
                        return;
                      }
                      if (activeSurfaceTarget === "ceiling") {
                        if (activeWallPaintApplyColorHex) {
                          onApplyCeilingPaintToRoom(
                            activeWallPaintApplyColorHex,
                            activeWallPaintApplyName,
                            room.id
                          );
                        }
                        return;
                      }
                      if (wallSurfaceMode === "paint" && activeWallPaintApplyColorHex) {
                        onApplyWallPaintToRoom(
                          activeWallPaintApplyColorHex,
                          activeWallPaintApplyName,
                          room.id,
                          activeSurfaceTarget === "selected_wall" ? selectedWallFaceId ?? null : null
                        );
                        return;
                      }
                      if (selectedSurfaceMaterialPrimaryId) {
                        if (activeSurfaceTarget === "selected_wall") {
                          onApplyWallMaterialToRoom(selectedSurfaceMaterialPrimaryId, room.id, selectedWallFaceId ?? null);
                        } else {
                          onApplyWallMaterialToRoom(selectedSurfaceMaterialPrimaryId, room.id, null);
                        }
                      }
                    }}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {surfaceSummaryOpen ? (
        <div
          data-testid="surface-summary-panel"
          className="mt-3 rounded-lg border border-box-border bg-field p-2"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-label">
                Surface summary
              </div>
              <div className={progressMetaClass}>{activeSurfaceSummaryRows.length} surfaces</div>
            </div>
            <Button variant="secondary" size="compact" onClick={() => setSurfaceSummaryOpen(false)}>
              Close
            </Button>
          </div>
          <div className="mt-2 grid gap-2">
            {activeSurfaceSummaryRows.map((row) => (
              <div key={row.id} data-testid={`surface-summary-row-${row.id}`} className="rounded-lg border border-box-border bg-tile p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-label">
                      {row.room.name} · {row.surfaceLabel}
                    </div>
                    <div className={progressMetaClass}>
                      {row.materialName} · {formatDisplayArea(row.areaSqm, measurementUnit)}{row.sheetsLabel ? ` · ${row.sheetsLabel}` : null}
                    </div>
                    <div className={progressMetaClass}>
                      {getFloorPatternLabel(row.settings.pattern)} · {row.settings.rotationDeg}° · Scale {row.settings.scale.toFixed(2)}x · Joint {row.settings.jointSizeMm} mm
                    </div>
                  </div>
                  <span className={row.status === "published" ? progressReadyClass : progressTodoClass}>
                    {String(row.status).replace(/_/g, " ")}
                  </span>
                </div>
                {row.sampleUrl ? (
                  <a href={row.sampleUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-link">
                    Request sample / quote
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </SurfaceMaterialCatalogBoundary>
  );
  const startDrawRoomSetup = () => {
    track("launch_path_selected", {
      path: "draw",
      source: isDesigner ? "pro_plan_tools" : "consumer_room_setup",
    });
    startDrawRoomMode("rectangle_wall");
  };
  const getPlanQualityActionLabel = (action: FloorPlanQualityAction) => {
    if (action === "add_window") return "Add window";
    if (action === "add_doorway") return "Add door";
    if (action === "add_storage") return "Add storage";
    if (action === "review_plan_layout") return "Review plan";
    if (action === "review_surface") return "Review surfaces";
    return "Review furniture fit";
  };
  const handlePlanQualityAction = (action: FloorPlanQualityAction, issue?: FloorPlanQualityIssue) => {
    onPlanQualityAction?.(action, issue);
    if (action === "add_window") {
      onAddFloorPlanOpeningFromTool("window");
      return;
    }
    if (action === "add_doorway") {
      onAddFloorPlanOpeningFromTool("door");
      return;
    }
    if (action === "add_storage") {
      onGoFurnish();
      return;
    }
    if (action === "review_plan_layout" || action === "review_surface") return;
    onGoFurnish();
  };
  const renderPlanQualityCard = () => {
    if (!floorPlanQualityReport || !hasRooms) return null;
    const topIssues = floorPlanQualityReport.issues.slice(0, 3);
    return (
      <div data-testid="plan-quality-card" className={progressCardClass}>
        {renderCollapsibleHeader({
          section: "planQuality",
          title: "Plan quality",
          subtitle: (
            <>
              {floorPlanQualityReport.label} · {floorPlanQualityReport.score}/100
            </>
          ),
          accessory: (
            <span
              data-testid="plan-quality-label"
              className={
                floorPlanQualityReport.label === "Looks good"
                  ? progressReadyClass
                  : progressTodoClass
              }
            >
              {floorPlanQualityReport.label}
            </span>
          ),
        })}
        {!isPlanSectionCollapsed("planQuality") && (
          <>
            {topIssues.length > 0 ? (
              <div data-testid="plan-quality-fixes" className="mt-3 grid gap-1.5">
                {topIssues.map((issue, index) => (
                  <details
                    key={issue.id}
                    data-testid={`plan-quality-issue-${index}`}
                    className="rounded-md bg-tile px-2.5 py-1.5 text-xs text-label-secondary"
                  >
                    <summary className="cursor-pointer font-semibold">
                      {issue.suggestedFix}
                    </summary>
                    <div className="mt-1 text-label-secondary">
                      {issue.detail}
                    </div>
                    <Button
                      data-testid={`plan-quality-issue-action-${index}`}
                      variant="secondary" size="compact" className="mt-2 w-full"
                      disabled={!canEdit}
                      onClick={() => handlePlanQualityAction(issue.action, issue)}
                    >
                      {getPlanQualityActionLabel(issue.action)}
                    </Button>
                  </details>
                ))}
              </div>
            ) : (
              <div className={progressMetaClass}>
                The main room links, daylight, and furniture footprint look ready.
              </div>
            )}
            <Button
              data-testid="plan-quality-primary-action"
              variant="primary" size="regular" className="mt-3 w-full"
              disabled={!canEdit}
              onClick={() =>
                handlePlanQualityAction(
                  floorPlanQualityReport.primaryAction.action,
                  floorPlanQualityReport.issues.find(
                    (issue) => issue.action === floorPlanQualityReport.primaryAction.action
                  )
                )
              }
            >
              {floorPlanQualityReport.primaryAction.label}
            </Button>
          </>
        )}
      </div>
    );
  };
  const floorPlanCollapsed = isPlanSectionCollapsed("floorPlan");

  return (
    <div>
      <FloorPlanImportArrivalNote />
      {showRoomSetupWizard && (
        <div
          data-testid="plan-tool-palette"
          className="overflow-hidden rounded-sm border border-box-border bg-surface-secondary"
        >
          <div className="border-b border-separator-subtle px-3 py-3 text-label">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-base font-semibold">Room setup</div>
                <div className={progressMetaClass}>
                  {hasRooms
                    ? `${planRoomCount} room${planRoomCount === 1 ? "" : "s"} · ${activeRoomName}`
                    : "Choose a template, enter dimensions, or draw."}
                </div>
                {hasRooms && (
                  <div data-testid="consumer-plan-next-steps" className={progressMetaClass}>
                    {consumerPlanNextSteps}
                  </div>
                )}
              </div>
              <Button
                id={FLOOR_PLAN_WORKSPACE_FALLBACK_ACTION_ID}
                data-testid="plan-section-toggle-floorPlan"
                variant="secondary" size="compact" className="shrink-0"
                aria-label={`${floorPlanCollapsed ? "Expand" : "Collapse"} floor plan`}
                aria-expanded={!floorPlanCollapsed}
                onClick={() => setPlanSectionCollapsed("floorPlan", !floorPlanCollapsed)}
              >
                {floorPlanCollapsed ? "Expand" : "Collapse"}
              </Button>
            </div>
            <RoomSetupProgressChips roomIsDraft={roomIsDraft} hasRooms={hasRooms}
              furniture={{ label: furnitureStatusLabel, ready: hasStartedFurniture }}
              openings={{ label: openingStatusLabel, ready: hasOpenings || !hasConnectionBlockers }}
              readyClass={progressReadyClass} todoClass={progressTodoClass} />
          </div>

          {!floorPlanCollapsed && (
            <>
              <ConsumerRoomSetupCard
                canEdit={canEdit}
                canEditPlanGeometry={canEditPlanGeometry}
                hasRooms={hasRooms} roomIsDraft={roomIsDraft}
                activeRoomName={activeRoomName}
                newRoomType={newRoomType}
                activeRoomPresetId={activeRoomPresetId}
                roomWidthInput={roomWidthInput}
                roomDepthInput={roomDepthInput}
                roomWidth={roomWidth} roomDepth={roomDepth}
                activeRoomFloorAreaSqm={activeRoomArea}
                measurementUnit={measurementUnit} measurementUnitReady={measurementUnitReady}
                openingCount={planOpeningCount}
                hasConnectionBlockers={hasConnectionBlockers}
                actions={{
                  changeRoomType: onNewRoomTypeChange,
                  changeRoomPreset: onRoomPresetChange,
                  changeRoomWidthInput: onRoomWidthInputChange,
                  changeRoomDepthInput: onRoomDepthInputChange,
                  commitRoomDimension: onCommitRoomDimension,
                  changeMeasurementUnit: onMeasurementUnitChange,
                  createRoom: () => {
                    onNewRoomShapeChange("rectangle");
                    onAddDesignerRoom();
                  },
                  chooseTemplate: openStartTemplates(PLAN_START_TEMPLATE_ACTION_ID),
                  drawRoom: startDrawRoomSetup,
                  uploadFloorPlan: () =>
                    requestFloorPlanUpload({ source: "plan_panel", openerId: FLOOR_PLAN_CONSUMER_IMPORT_ACTION_ID }),
                  addOpening: onAddFloorPlanOpeningFromTool,
                  continueToFurnish: onGoFurnish,
                }}
              />

              {renderPlanToolSection({
                section: "drawRoom",
                title: "Draw room",
                children: (
                  <div
                    data-testid="plan-wall-tool-grid"
                    className={planToolGridClass}
                    role="group"
                    aria-label="Wall drawing tools"
                  >
                    {renderPlanToolTile({
                      testId: "plan-tool-straight-wall",
                      icon: "straightWall",
                      label: "Custom shape",
                      shortcut: "B",
                      active: floorPlanTraceRoomMode && floorPlanDrawRoomMode === "straight_wall",
                      disabled: !canEdit,
                      onClick: () => startDrawRoomMode("straight_wall"),
                    })}
                    {renderPlanToolTile({
                      testId: "plan-tool-rectangle-wall",
                      icon: "rectangleWall",
                      label: "Rectangle room",
                      shortcut: "F",
                      active: floorPlanTraceRoomMode && floorPlanDrawRoomMode === "rectangle_wall",
                      disabled: !canEdit,
                      onClick: () => startDrawRoomMode("rectangle_wall"),
                    })}
                    {renderPlanToolTile({
                      testId: "plan-tool-arc-wall",
                      icon: "arcWall",
                      label: "Curved wall",
                      shortcut: "H",
                      active: floorPlanTraceRoomMode && floorPlanDrawRoomMode === "arc_wall",
                      disabled: !canEdit,
                      onClick: () => startDrawRoomMode("arc_wall"),
                    })}
                    {renderPlanToolTile({
                      testId: "plan-tool-external-area",
                      icon: "externalArea",
                      label: "External area",
                      disabled: true,
                      title: "External area drawing is coming soon.",
                    })}
                  </div>
                ),
              })}

              {renderPlanToolSection({
                section: "openings",
                title: "Doors & windows",
                children: (
                  <div className={planToolGridClass}>
                    {renderPlanToolTile({
                      testId: "plan-tool-door-advanced",
                      icon: "door",
                      label: "Door",
                      active: activeFloorPlanTool === "door",
                      disabled: !canEdit || !hasRooms,
                      onClick: () => onAddFloorPlanOpeningFromTool("door"),
                    })}
                    {renderPlanToolTile({
                      testId: "plan-tool-window-advanced",
                      icon: "window",
                      label: "Window",
                      active: activeFloorPlanTool === "window",
                      disabled: !canEdit || !hasRooms,
                      onClick: () => onAddFloorPlanOpeningFromTool("window"),
                    })}
                    {renderPlanToolTile({
                      testId: "plan-tool-opening",
                      icon: "opening",
                      label: "Opening",
                      active: floorPlanTraceOpeningMode && floorPlanTraceOpeningKind === "door",
                      disabled: !canEdit || !hasRooms,
                      onClick: () => onAddFloorPlanOpeningFromTool("door"),
                    })}
                    {renderPlanToolTile({
                      testId: "plan-tool-bay-window",
                      icon: "bayWindow",
                      label: "Bay window",
                      disabled: true,
                      title: "Bay window placement is coming soon.",
                    })}
                  </div>
                ),
              })}

              {renderPlanToolSection({
                section: "templates",
                title: "Templates",
                children: (
                  <>
                    <div className={planToolGridClass}>
                      {renderPlanToolTile({
                        id: PLAN_TEMPLATE_LIBRARY_ACTION_ID,
                        testId: "plan-tool-template-library",
                        icon: "template",
                        label: "Choose a template",
                        disabled: !canEdit,
                        onClick: openStartTemplates(PLAN_TEMPLATE_LIBRARY_ACTION_ID),
                      })}
                    </div>
                    <AddRoomTemplateTiles canEdit={canEdit} measurementUnit={measurementUnit}
                      onAddRoomTemplate={onAddRoomTemplate} />
                  </>
                ),
              })}
            </>
          )}
        </div>
      )}
      {showStartPanel && (
        <div className="mb-2 rounded-lg border border-box-border bg-tile p-2.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={titleClass}>{hasRooms ? "Add to plan" : "Start your room"}</div>
              <div className="mt-1 text-xs text-label-secondary">
                {hasRooms
                  ? "Add another room, upload a floor plan, or draw by hand."
                  : "Choose a room and size. You can adjust it anytime."}
              </div>
            </div>
            {showPlanDetails && (
              <Button
                variant="secondary" size="compact"
                data-testid="close-plan-start-workflow"
                onClick={closePlanStartWorkflow}
              >
                Close
              </Button>
            )}
          </div>

          {!hasRooms && (
            <div
              data-testid="guided-room-start"
              className="mt-3 rounded-lg border border-box-border bg-field p-3"
            >
              <div className="grid gap-2">
                <label className={consumerFieldLabelClass}>
                  Room
                  <select
                    value={newRoomType}
                    onChange={(event) => onNewRoomTypeChange(event.target.value as RoomType)}
                    className={consumerInputClass}
                    disabled={!canEdit}
                  >
                    {HOUSE_ROOM_TYPES.map((option) => (
                      <option key={option.type} value={option.type}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={consumerFieldLabelClass}>
                  Size
                  <select
                    value={activeRoomPresetId}
                    onChange={(event) => onRoomPresetChange(event.target.value as RoomSizePresetId)}
                    className={consumerInputClass}
                    disabled={!canEdit}
                  >
                    {ROOM_SIZE_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                    <option value="custom">Custom size</option>
                  </select>
                </label>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <MeasurementField
                  label="Width"
                  valueMm={(Number(roomWidthInput) || roomWidth) * 1000}
                  unit={measurementUnit}
                  minMm={ROOM_DIMENSION_DEFAULTS.min * 1000}
                  maxMm={ROOM_DIMENSION_DEFAULTS.max * 1000}
                  stepMm={10}
                  keyboardStepMm={50}
                  disabled={!canEditPlanGeometry}
                  compact
                  testId="guided-room-width-input"
                  onCommit={(valueMm) => onRoomWidthInputChange((valueMm / 1000).toFixed(2))}
                />
                <MeasurementField
                  label="Depth"
                  valueMm={(Number(roomDepthInput) || roomDepth) * 1000}
                  unit={measurementUnit}
                  minMm={ROOM_DIMENSION_DEFAULTS.min * 1000}
                  maxMm={ROOM_DIMENSION_DEFAULTS.max * 1000}
                  stepMm={10}
                  keyboardStepMm={50}
                  disabled={!canEditPlanGeometry}
                  compact
                  testId="guided-room-depth-input"
                  onCommit={(valueMm) => onRoomDepthInputChange((valueMm / 1000).toFixed(2))}
                />
              </div>

              <Button
                data-testid="guided-create-room"
                variant="primary" size="touch" className="mt-3 w-full"
                disabled={!canEditPlanGeometry}
                onClick={() => {
                  onNewRoomShapeChange("rectangle");
                  onAddDesignerRoom();
                }}
              >
                Create {roomTypeLabel.toLowerCase()}
              </Button>
            </div>
          )}

          <details className="mt-3" open={planStartMode !== "start"}>
            <summary className="cursor-pointer text-xs font-semibold text-label-secondary">
              Other ways to start
            </summary>
            <div className="mt-2 grid gap-2">
              <Button
                variant={planStartVariant("draw")} size="regular"
                data-testid="plan-start-draw"
                disabled={!canEdit}
                onClick={() => {
                  setPlanStartMode("draw");
                  onFloorPlanTraceRoomDrawModeChange("rectangle_wall");
                  onFloorPlanTraceRoomModeChange(true);
                }}
              >
                Draw room
              </Button>
              <EmptyFloorPlanProUploadAction
                isDesigner={isDesigner}
                onSelectUploadMode={() => setPlanStartMode("upload")}
                className={buttonClassName({ variant: planStartVariant("upload"), size: "regular" })}
                canEdit={canEdit}
              />
              <Button
                variant={planStartVariant("template")} size="regular"
                id={PLAN_START_TEMPLATE_ACTION_ID}
                data-testid="plan-start-template"
                disabled={!canEdit}
                onClick={openStartTemplates(PLAN_START_TEMPLATE_ACTION_ID)}
              >
                Choose a template
              </Button>
            </div>
          </details>

          {planStartMode === "upload" && !floorPlanUnderlay && (
            <div className="mt-3 rounded-lg bg-field p-3 text-xs text-label-secondary">
              Upload your floor plan, then trace rooms, doors, and windows over it.
            </div>
          )}
        </div>
      )}
      {renderPlanQualityCard()}
      {showPlanProgressPanel && (
        <div data-testid="plan-measurements-panel" className={progressCardClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={titleClass}>Plan progress</div>
              <div className={progressMetaClass}>{activeRoomName}</div>
            </div>
            <span
              className={progressViewClass}
            >
              {viewMode === "2d" ? "2D view" : "3D view"}
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            <div className="grid grid-cols-3 gap-2" data-testid="guided-plan-stepper">
              {planGuideSteps.map((step, index) => (
                <div
                  key={step.label}
                  className={
                    step.active
                      ? "rounded-lg border border-control-primary bg-field px-2 py-2"
                      : "rounded-lg border border-box-border bg-tile px-2 py-2"
                  }
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={
                        step.ready
                          ? "flex h-4 w-4 items-center justify-center rounded-full bg-success-tint text-xs font-bold text-on-success-tint"
                          : step.active
                            ? "flex h-4 w-4 items-center justify-center rounded-full bg-control-primary text-xs font-bold text-control-on-primary"
                            : "flex h-4 w-4 items-center justify-center rounded-full bg-control-badge text-xs font-bold text-label-secondary"
                      }
                    >
                      {index + 1}
                    </span>
                    <span className="truncate text-xs font-semibold text-label">
                      {step.label}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs text-label-secondary">
                    {step.meta}
                  </div>
                </div>
              ))}
            </div>
            <div className={progressRowClass}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={progressLabelClass}>Floor plan</div>
                  <div className={progressMetaClass}>
                    {hasRooms
                      ? `${planRoomCount} room${planRoomCount === 1 ? "" : "s"} · ${formatPlanDimensionsLabel(roomWidth, roomDepth, measurementUnit)}`
                      : "Draw, upload, or choose a template."}
                  </div>
                </div>
                <span className={hasRooms ? progressReadyClass : progressTodoClass}>
                  {hasRooms ? "Ready" : "Start"}
                </span>
              </div>
            </div>
            <div className={progressRowClass}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={progressLabelClass}>Doors & windows</div>
                  <div className={progressMetaClass}>
                    {hasConnectionBlockers ? "A connected room needs a door." : "Add only if you need them before furnishing."}
                  </div>
                </div>
                <span className={hasConnectionBlockers ? progressTodoClass : progressReadyClass}>
                  {openingStatusLabel}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className={compactStatusClass}>
                <div className={progressLabelClass}>Furniture</div>
                <div className={progressMetaClass}>{furnitureStatusLabel}</div>
              </div>
              <div className={compactStatusClass}>
                <div className={progressLabelClass}>Export</div>
                <div className={progressMetaClass}>{exportStatusLabel}</div>
              </div>
            </div>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold text-label-secondary">
              Measurements
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className={measurementTileClass} data-testid="plan-measurement-area">
                <div className={measurementValueClass}>{formatDisplayArea(activeRoomArea, measurementUnit)}</div>
                <div className={measurementLabelClass}>Area</div>
              </div>
              <div className={measurementTileClass} data-testid="plan-measurement-perimeter">
                <div className={measurementValueClass}>{formatDisplayLength(activeRoomPerimeter * 1000, measurementUnit)}</div>
                <div className={measurementLabelClass}>Perimeter</div>
              </div>
              <div className={measurementTileClass} data-testid="plan-measurement-clearance">
                <div className={measurementValueClass}>
                  {formatPlanDimensionsLabel(activeRoomClearWidth, activeRoomClearDepth, measurementUnit)}
                </div>
                <div className={measurementLabelClass}>Clear span</div>
              </div>
              <div className={measurementTileClass} data-testid="plan-measurement-height">
                <div className={measurementValueClass}>{formatDisplayLength(activeRoomHeightMm, measurementUnit)}</div>
                <div className={measurementLabelClass}>Floor wall height</div>
              </div>
              <div className={measurementTileClass} data-testid="plan-measurement-ratio">
                <div className={measurementValueClass}>{activeRoomAspectLabel}</div>
                <div className={measurementLabelClass}>Ratio</div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {measurementChecks.map((check) => (
                <div
                  key={check.label}
                  className="flex items-center justify-between gap-2 rounded-lg bg-field px-2.5 py-2"
                >
                  <span className="text-xs font-semibold text-label-secondary">
                    {check.label}
                  </span>
                  <span className={measurementCheckClass(check.ready)}>{check.value}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
      {showPlanDetails && hasRooms && (
        <div data-testid="contextual-plan-inspector" className={progressCardClass}>
          {renderCollapsibleHeader({
            section: "selectedRoom",
            title: visiblePlanOpening
              ? visiblePlanOpening.kind === "door"
                ? "Selected door"
                : "Selected window"
              : "Selected room",
            subtitle: visiblePlanOpening
              ? `${visiblePlanOpeningRoomName} · ${formatCabinetMeasurement(visiblePlanOpening.widthMm, measurementUnit)} wide`
              : `${activeRoomName} · ${activeRoomTypeLabel}`,
            accessory: !visiblePlanOpening ? (
              <span className={progressReadyClass}>
                {formatCabinetMeasurement(roomWidth * 1000, measurementUnit)} x {formatCabinetMeasurement(roomDepth * 1000, measurementUnit)}
              </span>
            ) : null,
          })}

          <RoomSurfaceRows rows={roomSurfaceRowsOf(activeSurfaceSummaryRows, activeRoomId)} disabled={!canEdit} onOpen={openRoomSurface}
            hidden={Boolean(visiblePlanOpening)} openTarget={openRoomSurfaceTarget(roomFinishPanelOpen, activeSurfaceTarget)} />
          {!isPlanSectionCollapsed("selectedRoom") && (
            <>
              {!visiblePlanOpening && (
                <>
              {renderSurfaceMaterialBrowser("room")}
              <div
                data-testid="mobile-selected-room-dimensions"
                className="mt-2 grid grid-cols-2 gap-2 border-t border-separator pt-2 md:hidden"
              >
                <MeasurementField
                  label="Width"
                  valueMm={roomWidth * 1000}
                  unit={measurementUnit}
                  minMm={ROOM_DIMENSION_DEFAULTS.min * 1000}
                  maxMm={ROOM_DIMENSION_DEFAULTS.max * 1000}
                  stepMm={10}
                  keyboardStepMm={50}
                  disabled={!canEditPlanGeometry}
                  compact
                  touchFriendly
                  testId="mobile-room-width-input"
                  onCommit={(valueMm) => onCommitRoomDimension("width", valueMm)}
                />
                <MeasurementField
                  label="Depth"
                  valueMm={roomDepth * 1000}
                  unit={measurementUnit}
                  minMm={ROOM_DIMENSION_DEFAULTS.min * 1000}
                  maxMm={ROOM_DIMENSION_DEFAULTS.max * 1000}
                  stepMm={10}
                  keyboardStepMm={50}
                  disabled={!canEditPlanGeometry}
                  compact
                  touchFriendly
                  testId="mobile-room-depth-input"
                  onCommit={(valueMm) => onCommitRoomDimension("depth", valueMm)}
                />
              </div>
                </>
              )}

              {visiblePlanOpening && (
                <div className="mt-3">
                  <PlanOpeningInspector
                    opening={visiblePlanOpening}
                    roomName={visiblePlanOpeningRoomName}
                    wallSpanMeters={visiblePlanOpeningWallSpanMeters}
                    maxHeightMeters={visiblePlanOpeningMaxHeightMeters}
                    measurementUnit={measurementUnit}
                    proMode={isDesigner}
                    onChange={onUpdateOpeningMetrics}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
      {showPlanNextActionCard && (
        <div data-testid="plan-next-action-card" className={progressCardClass}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={titleClass}>Next action</div>
              <div className={progressMetaClass}>{nextAction.body}</div>
            </div>
            <Button
              variant="primary" size="regular" className="shrink-0"
              onClick={nextAction.action}
              disabled={!canEdit && !hasStartedFurniture}
            >
              {nextAction.label}
            </Button>
          </div>
          {hasRooms && !hasOpenings && !hasConnectionBlockers && (
            <Button
              variant="secondary" size="regular" className="mt-2 w-full"
              onClick={() => onAddFloorPlanOpeningFromTool("door")}
              disabled={!canEdit}
            >
              Add doors or windows
            </Button>
          )}
        </div>
      )}
      {showPlanDetails && viewMode === "2d" && (
        <>
          <div className={progressCardClass}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className={titleClass}>2D view</div>
                <div className={progressMetaClass}>
                  {simplePlanControls ? "Simple planning view." : "Detailed drafting view."}
                </div>
              </div>
              <SegmentedControl
                label="2D view"
                value={simplePlanControls ? "simple" : "detailed"}
                onChange={(next) => {
                  if (next === "simple") onSimplePlanControlsChange(true);
                  else if (isDesigner) onSimplePlanControlsChange(false);
                }}
                options={[
                  { value: "simple", label: "Simple" },
                  {
                    value: "detailed",
                    label: "Detailed",
                    disabled: !isDesigner,
                    title: !isDesigner ? "Open Pro tools to use the detailed drafting view" : undefined,
                  },
                ]}
              />
            </div>
          </div>
          {isDesigner && (
            <FloorPlanToolStrip
              activeTool={activeFloorPlanTool}
              disabled={!canEdit}
              canAddOpening={hasRooms}
              onSelect={onSelectFloorPlanTool}
              onDrawRoom={onDrawFloorPlanRoom}
              onAddDoor={() => onAddFloorPlanOpeningFromTool("door")}
              onAddWindow={() => onAddFloorPlanOpeningFromTool("window")}
            />
          )}
        </>
      )}
      {showFloorPropertiesPanel && showPlanDetails && (
        <div data-testid="floor-summary-panel" className={progressCardClass}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={titleClass}>Levels</div>
              <div className={progressMetaClass}>
                {activeFloorLabel} · {activeFloorRoomCount} room{activeFloorRoomCount === 1 ? "" : "s"}
              </div>
            </div>
            <span className="rounded-full bg-control-track px-2 py-1 text-xs font-semibold text-label-secondary">
              {floorOptions.length} level{floorOptions.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-3 grid gap-1.5 rounded-lg border border-box-border bg-tile p-2">
            {floorOptions.map((option) => {
              const isActive = option.level === activeFloorLevel;
              return (
                <div
                  key={option.level}
                  className={
                    `flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs ${
                          isActive ? "bg-accent-tint text-on-accent-tint" : "text-label-secondary"
                        }`
                  }
                >
                  <span className="font-semibold">{option.label}</span>
                  <span>
                    {option.roomCount} room{option.roomCount === 1 ? "" : "s"}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between rounded-lg border border-box-border bg-tile px-3 py-2 text-xs">
            <span className={floorFieldLabelClass}>Stacked 3D floors</span>
            <span className={stackedFloorView ? "font-semibold text-on-accent-tint" : progressMetaClass}>
              {stackedFloorView ? "On" : "Off"}
            </span>
          </div>

          <div className="mt-3 border-t border-separator/60 pt-3">
            <div className="grid gap-2">
              <div className="grid grid-cols-[1fr_7rem] items-center gap-3">
                <span className={floorFieldLabelClass}>Interior area</span>
                <div className={floorInputClass}>{formatDisplayArea(activeRoomArea, measurementUnit)}</div>
              </div>
              <MeasurementField
                label="Floor wall height"
                valueMm={activeRoomHeightMm}
                unit={measurementUnit}
                minMm={2000}
                maxMm={6000}
                stepMm={10}
                keyboardStepMm={50}
                disabled={!canEditActiveRoomWallHeight}
                compact
                hint={`Applies to ${activeFloorRoomCount} room${activeFloorRoomCount === 1 ? "" : "s"} on ${activeFloorLabel}.`}
                onCommit={onActiveRoomHeightMmChange}
              />
              <FloorPlanPropertyEvidenceControl
                evidence={activeRoomWallHeightEvidence}
                disabled={!canEditActiveRoomWallHeight}
                testId="plan-panel-floor-wall-height-evidence"
                onConfirm={(evidence, measurementNote) =>
                  onActiveRoomHeightMmChange(
                    activeRoomHeightMm,
                    evidence,
                    measurementNote
                  )
                }
              />
              <MeasurementField
                label="Wall thickness"
                valueMm={activeRoomWallThicknessMm}
                unit={measurementUnit}
                minMm={40}
                maxMm={800}
                stepMm={5}
                keyboardStepMm={5}
                disabled={!canEditPlanGeometry}
                compact
                onCommit={onActiveRoomWallThicknessMmChange}
              />
              <MeasurementField
                label="Slab thickness"
                valueMm={activeRoomSlabThicknessMm}
                unit={measurementUnit}
                minMm={10}
                maxMm={600}
                stepMm={5}
                keyboardStepMm={5}
                disabled={!canEditActiveRoomSlabThickness}
                compact
                onCommit={onActiveRoomSlabThicknessMmChange}
              />
              <FloorPlanPropertyEvidenceControl
                evidence={activeRoomSlabThicknessEvidence}
                disabled={!canEditActiveRoomSlabThickness}
                testId="plan-panel-slab-thickness-evidence"
                onConfirm={(evidence, measurementNote) =>
                  onActiveRoomSlabThicknessMmChange(
                    activeRoomSlabThicknessMm,
                    evidence,
                    measurementNote
                  )
                }
              />
              <MeasurementField
                label="Baseboard projection"
                testId="active-room-baseboard-depth-input"
                valueMm={activeRoomBaseboardDepthMm}
                unit={measurementUnit}
                minMm={0}
                maxMm={200}
                stepMm={1}
                keyboardStepMm={1}
                disabled={!canEditPlanGeometry}
                compact
                onCommit={onActiveRoomBaseboardDepthMmChange}
              />
            </div>
          </div>

          <div className="mt-3 border-t border-separator/60 pt-3">
            <div className={titleClass}>Opacity</div>
            <label className="mt-3 grid grid-cols-[3.5rem_1fr_3.75rem] items-center gap-2">
              <span className={floorFieldLabelClass}>Wall</span>
              <input
                type="range"
                min="5"
                max="100"
                step="1"
                value={Math.round(activeRoomWallOpacity * 100)}
                disabled={!canEdit}
                className="w-full accent-blue-500 disabled:opacity-50"
                onChange={(event) =>
                  onActiveRoomSurfaceOpacityChange("wall", Number(event.currentTarget.value) / 100)
                }
              />
              <span className={floorInputClass}>{Math.round(activeRoomWallOpacity * 100)}%</span>
            </label>
            <label className="mt-2 grid grid-cols-[3.5rem_1fr_3.75rem] items-center gap-2">
              <span className={floorFieldLabelClass}>Floor</span>
              <input
                type="range"
                min="5"
                max="100"
                step="1"
                value={Math.round(activeRoomFloorOpacity * 100)}
                disabled={!canEdit}
                className="w-full accent-blue-500 disabled:opacity-50"
                onChange={(event) =>
                  onActiveRoomSurfaceOpacityChange("floor", Number(event.currentTarget.value) / 100)
                }
              />
              <span className={floorInputClass}>{Math.round(activeRoomFloorOpacity * 100)}%</span>
            </label>
            <label className="mt-2 grid grid-cols-[3.5rem_1fr_3.75rem] items-center gap-2">
              <span className={floorFieldLabelClass}>Ceiling</span>
              <input
                type="range"
                min="5"
                max="100"
                step="1"
                value={Math.round(activeRoomCeilingOpacity * 100)}
                disabled={!canEdit || !activeRoomCeilingVisible}
                className="w-full accent-blue-500 disabled:opacity-50"
                onChange={(event) =>
                  onActiveRoomSurfaceOpacityChange("ceiling", Number(event.currentTarget.value) / 100)
                }
              />
              <span className={floorInputClass}>{Math.round(activeRoomCeilingOpacity * 100)}%</span>
            </label>
          </div>

          <div className="mt-3 border-t border-separator/60 pt-3">
            <div className={titleClass}>Ceiling</div>
            <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={activeRoomCeilingVisible}
                  disabled={!canEdit}
                  className="h-4 w-4 accent-blue-500"
                  onChange={(event) => onActiveRoomCeilingVisibleChange(event.currentTarget.checked)}
                />
                <span className={floorFieldLabelClass}>Visible in 3D</span>
              </label>
              <label className="flex items-center gap-2">
                <span className={floorFieldLabelClass}>Colour</span>
                <input
                  type="color"
                  value={activeRoomCeilingColor}
                  disabled={!canEdit}
                  className="h-8 w-10 rounded border border-box-border bg-transparent p-0 disabled:opacity-50"
                  onChange={(event) => onActiveRoomCeilingColorChange(event.currentTarget.value)}
                />
              </label>
            </div>
          </div>
        </div>
      )}
      {showStandaloneFloorFinishPanel && (
        <div data-testid="floor-finish-panel" className={progressCardClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={titleClass}>Floor finish</div>
              <div className={progressMetaClass}>
                {activeFloorDisplayName} in {activeRoomName}.
              </div>
            </div>
            <div className="flex gap-2">
              <Button data-testid="standalone-change-floor-finish" variant="secondary" size="compact" disabled={!canEdit} aria-expanded={roomFinishPanelOpen} onClick={() => (roomFinishPanelOpen ? setRoomFinishPanelOpen(false) : openRoomSurface("floor", true))}>Browse / hide</Button>
              <Button
                variant="secondary" size="compact"
                disabled={!canEdit}
                onClick={() => onApplyFloorMaterialToAllRooms(activeSurfaceMaterial?.surface_material.material_id ?? activeFloorMaterial.id)}
              >
                Apply all
              </Button>
            </div>
          </div>
          {renderSurfaceMaterialBrowser("floorFinish")}
            <div className="mt-3 rounded-xl border border-box-border bg-field p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-label">
                    Pattern direction
                  </div>
                  <div className="mt-0.5 text-xs text-label-secondary">
                    {activeFloorRotationDeg} deg
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="secondary" size="compact"
                    disabled={!canEdit}
                    onClick={onRotateActiveFloorMaterial}
                  >
                    Rotate 90
                  </Button>
                  <Button
                    variant="secondary" size="compact"
                    disabled={!canEdit}
                    onClick={onResetActiveFloorMaterialPattern}
                  >
                    Reset
                  </Button>
                </div>
              </div>
              {isDesigner && (
                <label className="mt-3 block">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-label">
                      Pattern size
                    </span>
                    <span className="text-xs text-label-secondary">
                      {activeFloorScale.toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={activeFloorScale}
                    disabled={!canEdit}
                    className="mt-2 w-full accent-emerald-500 disabled:opacity-50"
                    onChange={(event) =>
                      onActiveFloorMaterialScaleChange(
                        clampFloorPatternScale(Number(event.currentTarget.value) || DEFAULT_FLOOR_PATTERN_SCALE)
                      )
                    }
                  />
                </label>
              )}
            </div>
        </div>
      )}
      {floorPlanTraceOpeningMode && (
        <div
          data-testid="floor-plan-opening-active-card"
          className="mt-3 rounded-xl border border-success-tint-border bg-success-tint p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-on-success-tint">
                {floorPlanTraceOpeningKind === "door" ? "Door tool active" : "Window tool active"}
              </div>
              <div className="mt-1 text-xs text-on-success-tint">
                {floorPlanUnderlay
                  ? "Pick two points along the same wall. Green means it fits."
                  : "Move near a wall, then click when the preview turns green."}
              </div>
              <div className="mt-1 text-xs font-semibold text-on-success-tint">
                Esc {floorPlanTraceOpeningPointCount > 0 ? "clears points" : "exits tool"}
              </div>
            </div>
            <Button
              variant="secondary" size="compact"
              onClick={() => onFloorPlanTraceOpeningModeChange(false)}
            >
              Done
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <select
              data-testid="floor-plan-opening-active-kind"
              value={floorPlanTraceOpeningKind}
              disabled={!canEdit}
              onChange={(event) =>
                onFloorPlanTraceOpeningKindChange(event.target.value as RoomOpening2D["kind"])
              }
              className="min-w-28 rounded-lg border border-success-tint-border bg-field px-2 py-2 text-sm text-label"
            >
              <option value="door">Door</option>
              <option value="window">Window</option>
            </select>
            <Button
              variant="secondary" size="compact"
              disabled={!canEdit || floorPlanTraceOpeningPointCount === 0}
              onClick={onResetFloorPlanTraceOpeningPoints}
            >
              Reset points
            </Button>
          </div>
        </div>
      )}
      {showFloorPlanPanel && (
        <FloorPlanUploadPanel lifecycleIdentity={floorPlanLifecycleIdentity}
          isDesigner={isDesigner} canEdit={canEdit}
          planRoomCount={planRoomCount} activeRoomId={activeRoomId}
          underlay={floorPlanUnderlay}
          canCalibrate={Boolean(floorPlanUnderlay?.mimeType.startsWith("image/"))}
          calibrationMode={floorPlanCalibrationMode}
          calibrationPointCount={floorPlanCalibrationPointCount}
          calibrationDistanceMeters={floorPlanCalibrationDistanceInput}
          calibrationSummary={floorPlanCalibrationSummary}
          canTraceRooms={Boolean(
            !floorPlanUnderlay ||
              (floorPlanUnderlay.mimeType.startsWith("image/") && floorPlanUnderlay.calibration)
          )}
          showDrawRoomTools={showDrawTools}
          showDesignerDrawControls={isDesigner}
          traceRoomMode={floorPlanTraceRoomMode}
          traceRoomDrawMode={floorPlanDrawRoomMode}
          traceRoomAngleLockMode={floorPlanDrawAngleLockMode}
          exactWallLengthInput={floorPlanExactWallLengthInput}
          canApplyExactWallLength={
            floorPlanDrawRoomMode === "straight_wall" && floorPlanTraceRoomPointCount > 0
          }
          traceRoomPointCount={floorPlanTraceRoomPointCount}
          traceRoomType={floorPlanTraceRoomType}
          traceRoomTypeOptions={HOUSE_ROOM_TYPES}
          canTraceOpenings={canTraceOpenings}
          traceOpeningMode={floorPlanTraceOpeningMode}
          traceOpeningPointCount={floorPlanTraceOpeningPointCount}
          traceOpeningKind={floorPlanTraceOpeningKind}
          canSelectPdfPage={Boolean(
            floorPlanUnderlay?.sourceMimeType === "application/pdf" &&
              floorPlanPdfSourceReady &&
              (floorPlanUnderlay.pageCount ?? 0) > 1
          )}
          pdfPageChanging={floorPlanPdfRenderingPage !== null}
          disabled={isClientPreview}
          onPdfPageChange={onFloorPlanPdfPageChange}
          onOpacityChange={onFloorPlanOpacityChange}
          onLockChange={onFloorPlanLockChange}
          onCalibrationModeChange={onFloorPlanCalibrationModeChange}
          onCalibrationDistanceChange={onFloorPlanCalibrationDistanceChange}
          onApplyCalibration={onApplyFloorPlanCalibration}
          onResetCalibrationPoints={onResetFloorPlanCalibrationPoints}
          onTraceRoomModeChange={onFloorPlanTraceRoomModeChange}
          onTraceRoomDrawModeChange={onFloorPlanTraceRoomDrawModeChange}
          onTraceRoomAngleLockModeChange={onFloorPlanDrawAngleLockModeChange}
          onExactWallLengthInputChange={onFloorPlanExactWallLengthInputChange}
          onApplyExactWallLength={onApplyFloorPlanExactWallLength}
          onTraceRoomTypeChange={onFloorPlanTraceRoomTypeChange}
          onUndoTraceRoomPoint={onUndoFloorPlanTraceRoomPoint}
          onResetTraceRoomPoints={onResetFloorPlanTraceRoomPoints}
          onTraceOpeningModeChange={onFloorPlanTraceOpeningModeChange}
          onTraceOpeningKindChange={onFloorPlanTraceOpeningKindChange}
          onResetTraceOpeningPoints={onResetFloorPlanTraceOpeningPoints}
          onClear={onClearFloorPlan}
        />
      )}
      {roomConnectionChecklistItems.length > 0 && (
        <div className="mt-3">
          <RoomConnectionChecklist
            items={roomConnectionChecklistItems} measurementUnit={measurementUnit}
            disabled={isClientPreview}
            variant={isDesigner ? "pro" : "consumer"}
            collapsed={isPlanSectionCollapsed("connections")}
            onCollapsedChange={(collapsed) => setPlanSectionCollapsed("connections", collapsed)}
            onAddDoorway={onAddSuggestedDoorway}
          />
        </div>
      )}
      {showTemplatePicker && (
        <div
          ref={templatePickerRef}
          data-testid="starter-floor-plan-picker"
          role="region"
          aria-labelledby="starter-floor-plan-picker-title"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            closePlanStartWorkflow();
          }}
          className="mt-3 rounded-xl border border-box-border bg-tile p-3"
        >
          <h2
            ref={templatePickerHeadingRef}
            id="starter-floor-plan-picker-title"
            tabIndex={-1}
            className={`${titleClass} rounded-sm outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`}
          >
            Find your home by address
          </h2>
          <div className="mt-3">
            <FloorPlanAddressSearch
              canEdit={canEdit} measurementUnit={measurementUnit}
              onApplyPlanTemplate={onApplyPlanTemplate}
            />
          </div>
        </div>
      )}
      {isDesigner && (
        <div className="mt-3 rounded-xl border border-box-border bg-tile p-3">
          <div className={titleClass}>Room setup</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-label-secondary">
              Type
              <select
                value={newRoomType}
                onChange={(event) => onNewRoomTypeChange(event.target.value as RoomType)}
                className="rounded-lg border border-box-border bg-field px-2 py-2 text-xs text-label"
                disabled={!canEdit}
                title="Choose room type for next room"
              >
                {HOUSE_ROOM_TYPES.map((option) => (
                  <option key={option.type} value={option.type}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-label-secondary">
              Shape
              <select
                value={newRoomShape}
                onChange={(event) => onNewRoomShapeChange(event.target.value as RoomPlanShape)}
                className="rounded-lg border border-box-border bg-field px-2 py-2 text-xs text-label"
                disabled={!canEdit}
                title="Choose shape for next room"
              >
                {HOUSE_ROOM_SHAPES.map((option) => (
                  <option key={option.shape} value={option.shape}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-2 flex flex-col gap-1 text-xs font-medium text-label-secondary">
            Size preset
            <select
              value={activeRoomPresetId}
              onChange={(event) => onRoomPresetChange(event.target.value as RoomSizePresetId)}
              className="rounded-lg border border-box-border bg-field px-2 py-2 text-xs text-label"
              disabled={!canEdit}
              title="Select a room-size preset"
            >
              {ROOM_SIZE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </label>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <MeasurementField
              label="Width"
              valueMm={(Number(roomWidthInput) || roomWidth) * 1000}
              unit={measurementUnit}
              minMm={ROOM_DIMENSION_DEFAULTS.min * 1000}
              maxMm={ROOM_DIMENSION_DEFAULTS.max * 1000}
              stepMm={10}
              keyboardStepMm={50}
              disabled={!canEditPlanGeometry}
              compact
              testId="designer-new-room-width-input"
              onCommit={(valueMm) => onRoomWidthInputChange((valueMm / 1000).toFixed(2))}
            />
            <MeasurementField
              label="Depth"
              valueMm={(Number(roomDepthInput) || roomDepth) * 1000}
              unit={measurementUnit}
              minMm={ROOM_DIMENSION_DEFAULTS.min * 1000}
              maxMm={ROOM_DIMENSION_DEFAULTS.max * 1000}
              stepMm={10}
              keyboardStepMm={50}
              disabled={!canEditPlanGeometry}
              compact
              testId="designer-new-room-depth-input"
              onCommit={(valueMm) => onRoomDepthInputChange((valueMm / 1000).toFixed(2))}
            />
          </div>

          <div className="mt-3">
            <Button
              variant="primary" size="regular" className="w-full"
              onClick={onAddDesignerRoom}
              disabled={!canEditPlanGeometry}
            >
              Add room
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
