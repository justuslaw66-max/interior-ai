"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { track } from "@/lib/analytics";
import type { RoomSizePresetId } from "@/lib/design-page-house-plan";
import {
  HOUSE_ROOM_SHAPES,
  HOUSE_PLAN_TEMPLATES,
  HOUSE_ROOM_TEMPLATES,
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
  SURFACE_MATERIAL_RENDER_REGISTRY,
  getSurfaceMaterialTextureSource,
  getRuntimeSurfaceMaterialById,
} from "@/lib/surface-material-runtime";
import {
  DEFAULT_FLOOR_JOINT_COLOR,
  DEFAULT_FLOOR_JOINT_SIZE_MM,
  DEFAULT_FLOOR_PATTERN_OFFSET,
  getFloorPatternLabel,
  getDefaultWallSurfaceSettings,
  getCeilingSurfaceSettings,
  getWallFaceLabel,
  getWallFaceSurfaceSettings,
  normalizeFloorSurfaceSettings,
  type NormalizedSurfaceSettings,
} from "@/lib/surface-settings";
import {
  DEFAULT_WALL_PAINT_SWATCH,
  NIPPON_WALL_PAINT_SWATCHES,
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
import { WallPaintPicker } from "./design-controls-plan/WallPaintPicker";
import {
  SURFACE_MATERIAL_INITIAL_VISIBLE_COUNT,
  SURFACE_MATERIAL_VISIBLE_INCREMENT,
  WALL_PAINT_INITIAL_VISIBLE_COUNT,
  buildFacetOptions,
  buildSurfaceMaterialProductGroups,
  formatSurfaceMaterialValue,
  getFloorMaterialSwatchStyle,
  getSurfaceMaterialCollectionLabel,
  getSurfaceMaterialColorLabel,
  getSurfaceMaterialEffectLabel,
  getSurfaceMaterialGroupMetaLabel,
  getSurfaceMaterialGroupSizeLabels,
  getSurfaceMaterialPrimaryId,
  getSurfaceMaterialProductDisplayName,
  getSurfaceMaterialSizeLabel,
  getSurfaceMaterialSizeOptionLabel,
  getSurfaceMaterialSupplierLabel,
  getSurfaceMaterialSwatchStyle,
  getSurfaceRoomAreaSqm,
  getSurfaceRoomWallAreaSqm,
  getSurfaceRoomWallFaceAreaSqm,
  type SurfaceBrowserTab,
  type SurfaceBrowserViewMode,
  type SurfaceFilterKey,
  type SurfaceFilterState,
  type SurfaceMaterialProductGroup,
  type SurfaceSummaryRow,
  type WallSurfaceMode,
} from "./design-controls-plan/surfaceCatalog";

export type { PlanStartMode } from "./design-controls-plan/DesignControlsPlanPanel.types";
import type {
  DesignControlsPlanPanelProps,
  PlanStartMode,
} from "./design-controls-plan/DesignControlsPlanPanel.types";

export default function DesignControlsPlanPanel({
  dark,
  isClientPreview,
  isDesigner,
  canEdit,
  canEditPlanGeometry,
  showFloorPropertiesPanel = false,
  aiDesignEnabled = false,
  viewMode,
  snapEnabled,
  newRoomType,
  newRoomShape,
  activeRoomPresetId,
  roomWidthInput,
  roomDepthInput,
  roomWidth,
  roomDepth,
  measurementUnit,
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
  planOpeningCount,
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
  onGoAiDesign,
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
  const [templateBedroomFilter, setTemplateBedroomFilter] = useState<"all" | "studio" | "one" | "two">("all");
  const [templateFootprintFilter, setTemplateFootprintFilter] = useState<"all" | "compact" | "narrow" | "wide">("all");
  const [templateStyleFilter, setTemplateStyleFilter] = useState<"all" | "open" | "separated" | "adu">("all");
  const [collapsedPlanSections, setCollapsedPlanSections] = useState<Record<CollapsiblePlanSection, boolean>>(() => ({
    floorPlan: false,
    importFloorPlan: !isDesigner,
    drawRoom: !isDesigner,
    openings: !isDesigner,
    templates: !isDesigner,
    planQuality: true,
    selectedRoom: true,
    connections: false,
  }));
  const templatePickerRef = useRef<HTMLDivElement | null>(null);
  const templatePickerHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const firstTemplateActionRef = useRef<HTMLButtonElement | null>(null);
  const templatePickerOpenerRef = useRef<HTMLElement | null>(null);
  const floorFinishPanelOpenSignalRef = useRef(0);
  const pendingSurfaceRevealRef = useRef(false);
  const surfaceWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const surfaceSearchInputRef = useRef<HTMLInputElement | null>(null);
  const planStartMode = controlledPlanStartMode ?? localPlanStartMode;
  const setPlanStartMode = (mode: PlanStartMode) => {
    setLocalPlanStartMode(mode);
    onPlanStartModeChange?.(mode);
  };
  const openTemplatePicker = () => {
    track("launch_path_selected", {
      path: "template",
      source: isDesigner ? "pro_plan_tools" : "consumer_room_setup",
    });
    setPlanStartMode("template");
  };
  const openFloorPlanUploadPicker = () => {
    track("launch_path_selected", {
      path: "upload",
      source: isDesigner ? "pro_plan_tools" : "consumer_room_setup",
    });
    flushSync(() => setPlanStartMode("upload"));
    const uploadPanel = document.getElementById("floor-plan-upload");
    const uploadInput = uploadPanel?.querySelector<HTMLInputElement>(
      '[data-testid="floor-plan-upload-input"]'
    );
    const importWorkspaceLauncher = uploadPanel?.querySelector<HTMLButtonElement>(
      '[data-testid="floor-plan-import-workspace-launcher"]'
    );
    if (importWorkspaceLauncher) {
      importWorkspaceLauncher.click();
    } else {
      uploadInput?.click();
    }
    window.requestAnimationFrame(() => {
      uploadPanel?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };
  useEffect(() => {
    const handleUploadRequest = () => openFloorPlanUploadPicker();
    window.addEventListener("floor-plan-upload-requested", handleUploadRequest);
    return () =>
      window.removeEventListener("floor-plan-upload-requested", handleUploadRequest);
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

  const titleClass = dark
    ? "designer-text-primary text-sm font-semibold"
    : "text-sm font-semibold text-neutral-800";
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
  const planStartButtonClass = (mode: Exclude<PlanStartMode, "start">) => {
    const isActive = planStartMode === mode;
    if (dark) {
      return [
        "rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        isActive
          ? "border-blue-400/45 bg-blue-500/20 text-blue-100"
          : "designer-control border text-neutral-100",
      ].join(" ");
    }
    return [
      "rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
      isActive
        ? "border-neutral-900 bg-neutral-900 text-white"
        : "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-100",
    ].join(" ");
  };
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
  const filteredPlanTemplates = HOUSE_PLAN_TEMPLATES.filter((template) => {
    const bedroomMatches =
      templateBedroomFilter === "all" ||
      (templateBedroomFilter === "studio" && template.bedroomCount === 0) ||
      (templateBedroomFilter === "one" && template.bedroomCount === 1) ||
      (templateBedroomFilter === "two" && template.bedroomCount >= 2);
    const footprintMatches =
      templateFootprintFilter === "all" ||
      template.footprint === templateFootprintFilter ||
      (templateFootprintFilter === "wide" &&
        (template.footprint === "wide" ||
          template.footprint === "corner" ||
          template.footprint === "long"));
    const styleMatches =
      templateStyleFilter === "all" ||
      (templateStyleFilter === "open" &&
        (template.tags.includes("open plan") || template.layoutType === "studio")) ||
      (templateStyleFilter === "separated" &&
        !template.tags.includes("open plan") &&
        template.layoutType !== "studio" &&
        template.layoutType !== "adu") ||
      (templateStyleFilter === "adu" && template.layoutType === "adu");
    return bedroomMatches && footprintMatches && styleMatches;
  });
  const showDrawTools =
    viewMode === "2d" &&
    (planStartMode === "draw" ||
      Boolean(floorPlanUnderlay) ||
      floorPlanTraceRoomMode ||
      floorPlanTraceRoomPointCount > 0);
  const connectionBlockerCount = roomConnectionChecklistItems.filter(
    (item) => item.status !== "connected"
  ).length;
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
            label: "Add doorway",
            body: "One connected room still needs a doorway before this plan feels complete.",
            action: () => onAddFloorPlanOpeningFromTool("door"),
          }
        : !hasStartedFurniture
          ? {
              label: "Furnish room",
              body: "The room outline is ready. Add furniture or ask AI for a starter layout.",
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
      ? "Needs doorway"
      : "Review links"
    : hasOpenings
      ? `${planOpeningCount} placed`
      : "Optional";
  const consumerPlanOpeningSummary = hasOpenings
    ? `${planOpeningCount} openings placed.`
    : "Openings optional.";
  const consumerPlanConnectionSummary =
    connectionBlockerCount > 0
      ? missingDoorwayCount === connectionBlockerCount
        ? `Add ${connectionBlockerCount} doorway${connectionBlockerCount === 1 ? "" : "s"}.`
        : `Review ${connectionBlockerCount} room connection${connectionBlockerCount === 1 ? "" : "s"}.`
      : "";
  const consumerPlanNextSteps = [
    `${planRoomCount} room${planRoomCount === 1 ? "" : "s"} ready.`,
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
  const progressCardClass = dark
    ? "designer-divider mt-2 border-t px-1 py-3"
    : "mt-2 rounded-lg border border-neutral-200 bg-white p-2.5";
  const progressRowClass = dark
    ? "designer-raised rounded-md px-3 py-2"
    : "rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2";
  const compactStatusClass = dark
    ? "designer-raised rounded-md px-2.5 py-2"
    : "rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2";
  const progressLabelClass = dark
    ? "text-xs font-semibold text-neutral-100"
    : "text-xs font-semibold text-neutral-900";
  const progressMetaClass = dark
    ? "mt-0.5 text-[11px] text-neutral-400"
    : "mt-0.5 text-[11px] text-neutral-500";
  const progressReadyClass = dark
    ? "designer-status-ready rounded-full px-2 py-1 text-[11px] font-semibold"
    : "rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700";
  const progressTodoClass = dark
    ? "designer-status-warning rounded-full px-2 py-1 text-[11px] font-semibold"
    : "rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700";
  const progressViewClass = dark
    ? "designer-status-info rounded-full px-2 py-1 text-[11px] font-semibold"
    : "rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700";
  const progressActionClass = dark
    ? "designer-control-active rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50"
    : "rounded-lg bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-neutral-700 disabled:opacity-50";
  const progressSecondaryActionClass = dark
    ? "designer-control rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50"
    : "rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-neutral-800 hover:bg-neutral-100 disabled:opacity-50";
  const collapsedToggleClass = dark
    ? "designer-control shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold"
    : "shrink-0 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-100";
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
        toggleClassName={collapsedToggleClass}
        onToggle={() => setPlanSectionCollapsed(section, !collapsed)}
      />
    );
  };
  const planToolGridClass = dark
    ? "designer-recessed designer-divider grid grid-cols-3 gap-2 border-t p-2"
    : "grid grid-cols-3 gap-2 border-t border-neutral-100 bg-white p-2";
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
        dark={dark}
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
    testId,
    icon,
    label,
    shortcut,
    active,
    disabled,
    title,
    onClick,
  }: {
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
      dark={dark}
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
  const templateBedroomButtonClass = (active: boolean) =>
    [
      "h-9 rounded-full px-2 text-xs font-semibold transition disabled:opacity-50",
      active
        ? dark
          ? "bg-white text-neutral-950"
          : "bg-neutral-950 text-white"
        : dark
          ? "designer-control border text-neutral-200"
          : "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100",
    ].join(" ");
  const templateFilterSelectClass = dark
    ? "designer-control h-9 w-full rounded-lg border px-2 text-xs font-semibold text-neutral-100 outline-none"
    : "h-9 w-full rounded-lg border border-neutral-200 bg-white px-2 text-xs font-semibold text-neutral-800 outline-none";
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
      SURFACE_MATERIAL_RENDER_REGISTRY.filter((material) => {
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
    [activeSurfaceTarget, surfaceMaterialDraftsVisible]
  );
  const selectedSurfaceMaterial =
    visibleSurfaceMaterials.find(
      (material) => material.surface_material.material_id === selectedSurfaceMaterialId
    ) ??
    activeSurfaceMaterial ??
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
    () => NIPPON_WALL_PAINT_SWATCHES.filter(swatchMatchesWallPaintFilters),
    [swatchMatchesWallPaintFilters]
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
    () => ({
      effect: buildFacetOptions(visibleSurfaceMaterials, getSurfaceMaterialEffectLabel),
      collection: buildFacetOptions(visibleSurfaceMaterials, getSurfaceMaterialCollectionLabel),
      size: buildFacetOptions(visibleSurfaceMaterials, getSurfaceMaterialSizeLabel),
      color: buildFacetOptions(visibleSurfaceMaterials, getSurfaceMaterialColorLabel),
    }),
    [visibleSurfaceMaterials]
  );
  const filteredSurfaceMaterialGroups = (() => {
    const search = flooringSearch.trim().toLowerCase();
    return surfaceMaterialProductGroups.filter((group) => {
      return group.variants.some((material) => {
        const materialId = material.surface_material.material_id;
        const searchable = [
          material.surface_material.product_name,
          material.surface_material.material_id,
          getSurfaceMaterialProductDisplayName(material),
          getSurfaceMaterialSupplierLabel(material),
          getSurfaceMaterialCollectionLabel(material),
          getSurfaceMaterialSizeLabel(material),
          getSurfaceMaterialSizeOptionLabel(material),
          material.surface_material.material_family,
          material.classification?.design_effect,
          material.classification?.color_family,
          ...(material.classification?.tone ?? []),
          ...(material.classification?.style_cluster ?? []),
          ...(material.classification?.room_suitability ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const matchesSearch = !search || searchable.includes(search);
        const matchesFilters =
          (!surfaceFilters.effect || getSurfaceMaterialEffectLabel(material) === surfaceFilters.effect) &&
          (!surfaceFilters.collection ||
            getSurfaceMaterialCollectionLabel(material) === surfaceFilters.collection) &&
          (!surfaceFilters.size || getSurfaceMaterialSizeLabel(material) === surfaceFilters.size) &&
          (!surfaceFilters.color || getSurfaceMaterialColorLabel(material) === surfaceFilters.color) &&
          (!surfaceFilters.favoritesOnly || favoriteSurfaceMaterialIdSet.has(materialId)) &&
          (!surfaceFilters.recommendedOnly ||
            (material.classification?.room_suitability ?? []).includes(activeRoomType) ||
            (material.classification?.room_suitability ?? []).includes("living"));
        return matchesSearch && matchesFilters;
      });
    });
  })();
  const visibleFilteredSurfaceMaterialGroups = filteredSurfaceMaterialGroups.slice(
    0,
    surfaceVisibleLimit
  );
  const hiddenSurfaceMaterialCount = Math.max(
    0,
    filteredSurfaceMaterialGroups.length - visibleFilteredSurfaceMaterialGroups.length
  );
  const hasSurfaceFilters =
    Boolean(flooringSearch.trim()) ||
    Boolean(surfaceFilters.effect) ||
    Boolean(surfaceFilters.collection) ||
    Boolean(surfaceFilters.size) ||
    Boolean(surfaceFilters.color) ||
    Boolean(surfaceFilters.favoritesOnly) ||
    Boolean(surfaceFilters.recommendedOnly);
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
      dark={dark}
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
      progressActionClass={progressActionClass}
      progressSecondaryActionClass={progressSecondaryActionClass}
      applyWallPaintToActiveTarget={applyWallPaintToActiveTarget}
      applyWallPaintToAllRooms={applyWallPaintToAllRooms}
      onResetActiveCeilingSurface={onResetActiveCeilingSurface}
      onResetActiveWallSurface={onResetActiveWallSurface}
    />
  );
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
  const activeSurfaceSummaryRows = surfaceRooms.flatMap((room) => {
    const surfaces = room.surfaces ?? room.surfaceFinishes;
    const floorMaterialId = surfaces?.floorMaterialId ?? null;
    const floorMaterial = getRuntimeSurfaceMaterialById(floorMaterialId);
    const starterMaterial = getFloorMaterialById(floorMaterialId);
    const floorSettings = normalizeFloorSurfaceSettings(
      surfaces,
      normalizeFloorRotationDeg,
      clampFloorPatternScale
    );
    const floorRow = {
      id: `${room.id}-floor`,
      room,
      target: "floor" as const,
      surfaceLabel: "Floor",
      materialId: floorMaterial?.surface_material.material_id ?? starterMaterial.id,
      materialName: floorMaterial?.surface_material.product_name ?? starterMaterial.name,
      supplier: floorMaterial
        ? floorMaterial.surface_material.brand ?? formatSurfaceMaterialValue(floorMaterial.surface_material.supplier)
        : "Starter finish",
      areaSqm: getSurfaceRoomAreaSqm(room),
      status: floorMaterial?.import_governance.publish_status ?? "not_orderable",
      sampleUrl: floorMaterial?.commerce?.sample_request_url ?? floorMaterial?.source?.sample_request_url ?? null,
      settings: {
        pattern: floorSettings.floorPattern,
        rotationDeg: floorSettings.floorRotationDeg,
        scale: floorSettings.floorScale,
        offset: floorSettings.floorPatternOffset,
        jointSizeMm: floorSettings.floorJointSizeMm,
        jointColor: floorSettings.floorJointColor,
      },
    };

    const rows: SurfaceSummaryRow[] = [floorRow];
    const ceilingSettings = getCeilingSurfaceSettings(
      surfaces,
      normalizeFloorRotationDeg,
      clampFloorPatternScale
    );
    const ceilingPaintName = ceilingSettings.paintColorHex
      ? getWallPaintDisplayName(ceilingSettings.paintColorHex, ceilingSettings.paintName)
      : "No ceiling paint";
    rows.push({
      id: `${room.id}-ceiling`,
      room,
      target: "ceiling" as const,
      surfaceLabel: "Ceiling",
      materialId: ceilingSettings.paintColorHex ? `paint:${ceilingSettings.paintColorHex}` : `ceiling:${room.id}`,
      materialName: ceilingPaintName,
      supplier: ceilingSettings.paintColorHex ? "Paint colour" : "Visual finish",
      areaSqm: getSurfaceRoomAreaSqm(room),
      status: ceilingSettings.paintColorHex ? "visual_finish" : "not_started",
      sampleUrl: null,
      settings: {
        pattern: ceilingSettings.pattern,
        rotationDeg: ceilingSettings.rotationDeg,
        scale: ceilingSettings.scale,
        offset: ceilingSettings.offset,
        jointSizeMm: ceilingSettings.jointSizeMm,
        jointColor: ceilingSettings.jointColor,
      },
    });
    const wallDefaultSettings = getDefaultWallSurfaceSettings(
      surfaces,
      normalizeFloorRotationDeg,
      clampFloorPatternScale
    );
    const faceIds = Object.keys(surfaces?.walls?.faces ?? {});
    const faceAreaTotal = faceIds.reduce(
      (sum, faceId) => sum + getSurfaceRoomWallFaceAreaSqm(room, faceId),
      0
    );
    const defaultWallArea = Math.max(
      0,
      getSurfaceRoomWallAreaSqm(room) - Math.min(getSurfaceRoomWallAreaSqm(room), faceAreaTotal)
    );
    if (wallDefaultSettings.materialId || wallDefaultSettings.paintColorHex) {
      const material = wallDefaultSettings.materialId
        ? getRuntimeSurfaceMaterialById(wallDefaultSettings.materialId)
        : null;
      const starter = wallDefaultSettings.materialId
        ? getFloorMaterialById(wallDefaultSettings.materialId)
        : null;
      const paintName = getWallPaintDisplayName(
        wallDefaultSettings.paintColorHex,
        wallDefaultSettings.paintName
      );
      rows.push({
        id: `${room.id}-walls`,
        room,
        target: "walls" as const,
        surfaceLabel: faceIds.length > 0 ? "Remaining walls" : "All walls",
        materialId: material?.surface_material.material_id ?? starter?.id ?? `paint:${wallDefaultSettings.paintColorHex}`,
        materialName: material?.surface_material.product_name ?? starter?.name ?? paintName,
        supplier: material
          ? material.surface_material.brand ?? formatSurfaceMaterialValue(material.surface_material.supplier)
          : starter
            ? "Starter finish"
            : "Paint colour",
        areaSqm: defaultWallArea,
        status: material?.import_governance.publish_status ?? (starter ? "not_orderable" : "visual_finish"),
        sampleUrl: material?.commerce?.sample_request_url ?? material?.source?.sample_request_url ?? null,
        settings: {
          pattern: wallDefaultSettings.pattern,
          rotationDeg: wallDefaultSettings.rotationDeg,
          scale: wallDefaultSettings.scale,
          offset: wallDefaultSettings.offset,
          jointSizeMm: wallDefaultSettings.jointSizeMm,
          jointColor: wallDefaultSettings.jointColor,
        },
      });
    }

    faceIds.forEach((faceId) => {
      const settings = getWallFaceSurfaceSettings(
        surfaces,
        faceId,
        normalizeFloorRotationDeg,
        clampFloorPatternScale
      );
      if (!settings.materialId && !settings.paintColorHex) return;
      const material = settings.materialId ? getRuntimeSurfaceMaterialById(settings.materialId) : null;
      const starter = settings.materialId ? getFloorMaterialById(settings.materialId) : null;
      const paintName = getWallPaintDisplayName(settings.paintColorHex, settings.paintName);
      rows.push({
        id: `${room.id}-wall-${faceId}`,
        room,
        target: "selected_wall" as const,
        surfaceLabel: getWallFaceLabel(faceId),
        materialId: material?.surface_material.material_id ?? starter?.id ?? `paint:${settings.paintColorHex}`,
        materialName: material?.surface_material.product_name ?? starter?.name ?? paintName,
        supplier: material
          ? material.surface_material.brand ?? formatSurfaceMaterialValue(material.surface_material.supplier)
          : starter
            ? "Starter finish"
            : "Paint colour",
        areaSqm: getSurfaceRoomWallFaceAreaSqm(room, faceId),
        status: material?.import_governance.publish_status ?? (starter ? "not_orderable" : "visual_finish"),
        sampleUrl: material?.commerce?.sample_request_url ?? material?.source?.sample_request_url ?? null,
        settings: {
          pattern: settings.pattern,
          rotationDeg: settings.rotationDeg,
          scale: settings.scale,
          offset: settings.offset,
          jointSizeMm: settings.jointSizeMm,
          jointColor: settings.jointColor,
        },
      });
    });

    return rows;
  });
  const setSurfaceFilter = (key: SurfaceFilterKey, value: string) => {
    setSurfaceFilters((current) => ({
      ...current,
      [key]: value || undefined,
    }));
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
  const renderSurfaceFilterSelect = (
    key: SurfaceFilterKey,
    label: string,
    options: string[]
  ) => (
    <label className={dark ? "block text-xs font-semibold text-neutral-200" : "block text-xs font-semibold text-neutral-700"}>
      {label}
      <select
        data-testid={`surfaces-filter-${key}`}
        value={surfaceFilters[key] ?? ""}
        className={
          dark
            ? "designer-control mt-1 h-9 w-full rounded-lg border px-2 text-xs text-neutral-100"
            : "mt-1 h-9 w-full rounded-lg border border-neutral-200 bg-white px-2 text-xs text-neutral-800"
        }
        onChange={(event) => setSurfaceFilter(key, event.currentTarget.value)}
      >
      <option value="">All</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </label>
  );
  const floorMaterialMetaClass = dark
    ? "block text-[10px] text-neutral-400"
    : "block text-[10px] text-neutral-500";
  const floorFieldLabelClass = dark
    ? "text-xs font-semibold text-neutral-200"
    : "text-xs font-semibold text-neutral-700";
  const floorInputClass = dark
    ? "designer-control h-9 w-full rounded-lg border px-2 text-right text-sm text-neutral-100"
    : "h-9 w-full rounded-lg border border-neutral-200 bg-white px-2 text-right text-sm text-neutral-900";
  const consumerFieldLabelClass = dark
    ? "flex flex-col gap-1 text-xs font-semibold text-neutral-200"
    : "flex flex-col gap-1 text-xs font-semibold text-neutral-700";
  const consumerInputClass = dark
    ? "designer-control min-h-10 rounded-lg border px-2.5 py-2 text-sm text-neutral-100 outline-none disabled:opacity-50"
    : "min-h-10 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-sm text-neutral-900 outline-none disabled:opacity-50";
  const activeFloorLabel =
    floorOptions.find((option) => option.level === activeFloorLevel)?.label ?? "1F";
  const activeRoomArea = Math.max(0, roomWidth * roomDepth);
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
  const measurementTileClass = dark
    ? "designer-raised rounded-lg px-3 py-2"
    : "rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2";
  const measurementValueClass = dark
    ? "text-sm font-semibold text-neutral-100"
    : "text-sm font-semibold text-neutral-950";
  const measurementLabelClass = dark
    ? "mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400"
    : "mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500";
  const measurementCheckClass = (ready: boolean) => {
    if (dark) {
      return ready
        ? "rounded-full bg-emerald-400/15 px-2 py-1 text-[10px] font-semibold text-emerald-200"
        : "rounded-full bg-amber-400/15 px-2 py-1 text-[10px] font-semibold text-amber-200";
    }
    return ready
      ? "rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700"
      : "rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700";
  };
  const measurementChecks = [
    {
      label: "Dimensions",
      value: `${roomWidth.toFixed(1)} x ${roomDepth.toFixed(1)}m`,
      ready: hasRooms,
    },
    {
      label: "Scale",
      value: floorPlanUnderlay ? (floorPlanUnderlay.calibration ? "Calibrated" : "Review") : "Native",
      ready: !floorPlanUnderlay || Boolean(floorPlanUnderlay.calibration),
    },
    {
      label: "Snap",
      value: snapEnabled ? "On" : "Off",
      ready: snapEnabled,
    },
    {
      label: "Doors/windows",
      value: hasOpenings ? `${planOpeningCount} placed` : "Optional",
      ready: true,
    },
  ];
  const surfaceMaterialCardClass = (materialId: string, selectedOverride?: boolean) => {
    const isSelected = selectedOverride ?? activeTargetMaterialId === materialId;
    if (dark) {
      return [
        "rounded-lg border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
        isSelected
          ? "border-emerald-300/45 bg-emerald-400/15"
          : "designer-control border",
      ].join(" ");
    }
    return [
      "rounded-lg border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
      isSelected
        ? "border-emerald-300 bg-emerald-50"
        : "border-neutral-200 bg-white hover:bg-neutral-50",
    ].join(" ");
  };
  const renderSurfaceMaterialBrowser = () => (
    <div
      ref={surfaceWorkspaceRef}
      data-testid="room-surfaces-floor-panel"
      data-floor-material-id={activeRoomFloorMaterialId}
      data-surface-target={activeSurfaceTarget}
      data-surface-material-id={activeTargetMaterialId ?? ""}
      className={
        dark
          ? "designer-raised mt-2 rounded-lg p-2"
          : "mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2"
      }
    >
      {!hasRooms ? (
        <div data-testid="surfaces-start-state" className={dark ? "designer-recessed rounded-lg p-3" : "rounded-lg border border-neutral-200 bg-white p-3"}>
          <div className={dark ? "text-sm font-semibold text-neutral-100" : "text-sm font-semibold text-neutral-950"}>
            Choose a room before applying finishes
          </div>
          <div className={progressMetaClass}>Start from a template, draw a room, or upload a plan.</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className={progressActionClass} onClick={openTemplatePicker}>
              Templates
            </button>
            <button type="button" className={progressSecondaryActionClass} onClick={startDrawRoomSetup}>
              Draw room
            </button>
            <button type="button" className={progressSecondaryActionClass} onClick={openFloorPlanUploadPicker}>
              Upload plan
            </button>
            <button type="button" className={progressSecondaryActionClass} onClick={onAddDesignerRoom}>
              Blank room
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-neutral-900"}>
            Surfaces
          </div>
          <div className={progressMetaClass}>
            {activeSurfaceTargetLabel} · {activeSurfaceDisplayName}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <button
            type="button"
            data-testid="surface-brush-toggle"
            className={
              surfaceBrushActive
                ? "rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white"
                : progressSecondaryActionClass
            }
            disabled={
              !canEdit ||
              (!selectedSurfaceMaterialPrimaryId &&
                !activeBrushPaintColorHex &&
                !(activeSurfaceTarget !== "floor" && activeTargetSettings.paintColorHex))
            }
            onClick={() => {
              if (
                !surfaceBrushActive &&
                activeSurfaceTarget !== "floor" &&
                !activeBrushPaintColorHex &&
                activeTargetSettings.paintColorHex
              ) {
                onSurfacePaintSelected(
                  activeTargetSettings.paintColorHex,
                  getWallPaintDisplayName(activeTargetSettings.paintColorHex, activeTargetSettings.paintName)
                );
              }
              onSurfaceBrushActiveChange(!surfaceBrushActive);
            }}
          >
            Brush
          </button>
          <button
            type="button"
            data-testid="surface-summary-open"
            className={progressSecondaryActionClass}
            onClick={() => openSurfaceSummary("header")}
          >
            Summary
          </button>
        </div>
      </div>

      <div
        data-testid="surface-target-bar"
        className={dark ? "designer-raised mt-2 grid grid-cols-4 gap-1 rounded-lg p-1" : "mt-2 grid grid-cols-4 gap-1 rounded-lg border border-neutral-200/70 bg-white/70 p-1"}
      >
        {[
          { id: "floor" as const, label: "Floor" },
          { id: "walls" as const, label: "Walls" },
          { id: "selected_wall" as const, label: "Selected wall" },
          { id: "ceiling" as const, label: "Ceiling" },
        ].map((target) => (
          <button
            key={target.id}
            type="button"
            data-testid={`surface-target-${target.id.replace("_", "-")}`}
            aria-pressed={activeSurfaceTarget === target.id}
            className={
              activeSurfaceTarget === target.id
                ? dark
                  ? "flex h-11 min-w-0 items-center justify-center rounded-md bg-white px-1.5 text-center text-xs font-semibold leading-tight text-neutral-950"
                  : "flex h-11 min-w-0 items-center justify-center rounded-md bg-neutral-950 px-1.5 text-center text-xs font-semibold leading-tight text-white"
                : dark
                  ? "flex h-11 min-w-0 items-center justify-center rounded-md px-1.5 text-center text-xs font-semibold leading-tight text-neutral-300 hover:bg-white/10"
                  : "flex h-11 min-w-0 items-center justify-center rounded-md px-1.5 text-center text-xs font-semibold leading-tight text-neutral-600 hover:bg-neutral-100"
            }
            onClick={() => onSurfaceTargetChange(target.id)}
          >
            <span className="block max-w-full whitespace-normal">{target.label}</span>
          </button>
        ))}
      </div>
      {activeSurfaceTarget === "selected_wall" && !selectedWallFaceId ? (
        <div className={progressMetaClass}>Click a wall in 3D, or use Brush after choosing paint or a material.</div>
      ) : null}
      {surfaceBrushActive ? (
        <div className={progressMetaClass}>
          Brush is on · {activeBrushPaintColorHex
            ? `Click walls or ceilings in 3D to apply ${activeBrushPaintName}`
            : activeBrushMaterialId
              ? "Click floor or walls in 3D to apply"
              : "Choose a material or paint first"}
        </div>
      ) : null}

      <div className={dark ? "designer-raised mt-2 grid grid-cols-2 gap-1 rounded-lg p-1" : "mt-2 grid grid-cols-2 gap-1 rounded-lg border border-neutral-200/70 bg-white/70 p-1"}>
        {(["tiles", "rooms"] as SurfaceBrowserTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            data-testid={`surfaces-tab-${tab}`}
            className={
              surfaceTab === tab
                ? dark
                  ? "rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-neutral-950"
                  : "rounded-md bg-neutral-950 px-2 py-1.5 text-xs font-semibold text-white"
                : dark
                  ? "rounded-md px-2 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-white/10"
                  : "rounded-md px-2 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
            }
            onClick={() => setSurfaceTab(tab)}
          >
            {tab === "tiles" ? "Tiles" : "Rooms"}
          </button>
        ))}
      </div>

      {surfaceTab === "tiles" ? (
        <>
          {activeSurfaceTarget !== "floor" && activeSurfaceTarget !== "ceiling" ? (
            <div className={dark ? "designer-raised mt-2 grid grid-cols-2 gap-1 rounded-lg p-1" : "mt-2 grid grid-cols-2 gap-1 rounded-lg border border-neutral-200/70 bg-white/70 p-1"}>
              {[
                { id: "paint" as const, label: "Paint" },
                { id: "materials" as const, label: "Tiles" },
              ].map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  data-testid={`wall-surface-mode-${mode.id}`}
                  className={
                    wallSurfaceMode === mode.id
                      ? dark
                        ? "rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-neutral-950"
                        : "rounded-md bg-neutral-950 px-2 py-1.5 text-xs font-semibold text-white"
                      : dark
                        ? "rounded-md px-2 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-white/10"
                        : "rounded-md px-2 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
                  }
                  onClick={() => setWallSurfaceMode(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          ) : null}
          {activeSurfaceTarget !== "floor" &&
          (activeSurfaceTarget === "ceiling" || wallSurfaceMode === "paint") ? (
            renderWallPaintPicker()
          ) : (
            <>
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
            <label className="block">
              <span className="sr-only">Search surface materials</span>
              <input
                ref={surfaceSearchInputRef}
                type="search"
                data-testid="surfaces-search"
                value={flooringSearch}
                onChange={(event) => setFlooringSearch(event.currentTarget.value)}
                placeholder={activeSurfaceTarget === "floor" ? "Search flooring" : "Search wall finishes"}
                className={
                  dark
                    ? "designer-control h-9 w-full rounded-lg border px-2.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
                    : "h-9 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
                }
              />
            </label>
            <button
              type="button"
              data-testid="surfaces-filter-toggle"
              className={progressSecondaryActionClass}
              onClick={() => setSurfaceFilterDrawerOpen((open) => !open)}
            >
              Filter
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="surfaces-recommended-filter"
              className={
                surfaceFilters.recommendedOnly
                  ? "rounded-full bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white"
                  : dark
                    ? "designer-status-pending rounded-full px-2 py-1 text-[11px] font-semibold"
                    : "rounded-full border border-neutral-200 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-600"
              }
              onClick={toggleRecommendedSurfaceFilter}
            >
              Recommended
            </button>
            <button
              type="button"
              data-testid="surfaces-favorites-filter"
              className={
                surfaceFilters.favoritesOnly
                  ? "rounded-full bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white"
                  : dark
                    ? "designer-status-pending rounded-full px-2 py-1 text-[11px] font-semibold"
                    : "rounded-full border border-neutral-200 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-600"
              }
              onClick={toggleFavoriteSurfaceFilter}
            >
              Favorites
            </button>
            <button
              type="button"
              data-testid="surfaces-view-toggle"
              className={progressSecondaryActionClass}
              onClick={() => setSurfaceViewMode((mode) => (mode === "grid" ? "list" : "grid"))}
            >
              {surfaceViewMode === "grid" ? "List" : "Grid"}
            </button>
            {hasSurfaceFilters ? (
              <button
                type="button"
                data-testid="surfaces-clear-filters"
                className={progressSecondaryActionClass}
                onClick={clearSurfaceFilters}
              >
                Clear
              </button>
            ) : null}
          </div>

          {surfaceFilterDrawerOpen ? (
            <div data-testid="surfaces-filter-drawer" className={dark ? "designer-recessed mt-2 grid gap-2 rounded-lg p-2" : "mt-2 grid gap-2 rounded-lg border border-neutral-200 bg-white p-2"}>
              {renderSurfaceFilterSelect("effect", "Effect", surfaceFilterOptions.effect)}
              {renderSurfaceFilterSelect("collection", "Collection", surfaceFilterOptions.collection)}
              {renderSurfaceFilterSelect("size", "Size", surfaceFilterOptions.size)}
              {renderSurfaceFilterSelect("color", "Color", surfaceFilterOptions.color)}
            </div>
          ) : null}

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
                    className={surfaceMaterialCardClass(materialId, selected)}
                  >
                    <button
                      type="button"
                      className={surfaceViewMode === "grid" ? "w-full text-left" : "grid w-full grid-cols-[3rem_1fr] gap-2 text-left"}
                      disabled={!canEdit || !canApplyActiveSurfaceTarget}
                      onClick={() => applySurfaceMaterialToActiveRoom(materialId)}
                    >
                      <span
                        className={surfaceViewMode === "grid" ? "block aspect-square w-full rounded-md border border-black/10" : "block h-12 w-12 rounded-md border border-black/10"}
                        style={getSurfaceMaterialSwatchStyle(material)}
                      />
                      <span className={surfaceViewMode === "grid" ? "mt-2 block min-w-0" : "block min-w-0"}>
                        <span className={dark ? "block truncate text-xs font-semibold text-neutral-100" : "block truncate text-xs font-semibold text-neutral-900"} title={material.surface_material.product_name}>
                          {displayName}
                        </span>
                        <span className={floorMaterialMetaClass}>
                          {getSurfaceMaterialGroupMetaLabel(group)}
                        </span>
                        {selected ? (
                          <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                            Active
                          </span>
                        ) : null}
                        <span className="mt-1 flex flex-wrap gap-1">
                          <span className={publishStatus === "published" ? "rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700" : "rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"}>
                            {publishStatus === "published" ? "Published" : "Draft"}
                          </span>
                          <span className={textureSource ? "rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700" : "rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600"}>
                            {textureSource ? "Texture" : "Swatch only"}
                          </span>
                          {tileable ? (
                            <span className="rounded-full bg-cyan-50 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-700">
                              Tileable
                            </span>
                          ) : null}
                          {sampleAvailable ? (
                            <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                              Sample
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        data-testid={`surface-favorite-${materialId}`}
                        className={progressSecondaryActionClass}
                        onClick={() => toggleFavoriteSurfaceMaterialGroup(group)}
                      >
                        {favorite ? "Saved" : "Save"}
                      </button>
                      <button
                        type="button"
                        className={progressSecondaryActionClass}
                        onClick={() => selectSurfaceMaterial(materialId, "details")}
                      >
                        Details
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={dark ? "rounded-lg border border-white/10 p-3 text-xs text-neutral-400" : "rounded-lg border border-neutral-200 bg-white p-3 text-xs text-neutral-500"}>
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
            <button
              type="button"
              data-testid="surfaces-show-more"
              className={`${progressSecondaryActionClass} mt-2 min-h-9 w-full`}
              onClick={() =>
                setSurfaceVisibleLimit((limit) => limit + SURFACE_MATERIAL_VISIBLE_INCREMENT)
              }
            >
              Show more ({hiddenSurfaceMaterialCount})
            </button>
          ) : null}

          <div data-testid="surface-product-detail" className={dark ? "designer-recessed mt-3 rounded-lg p-2" : "mt-3 rounded-lg border border-neutral-200 bg-white p-2"}>
            <div className="flex items-start gap-2">
              {selectedSurfaceMaterial ? (
                <span
                  className="h-16 w-16 shrink-0 rounded-md border border-black/10"
                  style={getSurfaceMaterialSwatchStyle(selectedSurfaceMaterial)}
                />
              ) : (
                <span
                  className="h-16 w-16 shrink-0 rounded-md border border-black/10"
                  style={
                    activeSurfaceTarget === "floor" || activeTargetMaterialId
                      ? getFloorMaterialSwatchStyle(activeTargetStarterMaterial)
                      : { background: "linear-gradient(135deg, #f7f5ef, #e6e0d2)" }
                  }
                />
              )}
              <div className="min-w-0 flex-1">
                <div className={dark ? "truncate text-sm font-semibold text-neutral-100" : "truncate text-sm font-semibold text-neutral-950"} title={selectedSurfaceMaterial?.surface_material.product_name ?? activeSurfaceDisplayName}>
                  {selectedSurfaceMaterial
                    ? getSurfaceMaterialProductDisplayName(selectedSurfaceMaterial)
                    : activeSurfaceDisplayName}
                </div>
                <div className={progressMetaClass}>
                  {selectedSurfaceMaterial
                    ? `${activeSurfaceTargetLabel} · ${getSurfaceMaterialCollectionLabel(selectedSurfaceMaterial)} · Size ${getSurfaceMaterialSizeOptionLabel(selectedSurfaceMaterial)}${
                        selectedSurfaceMaterialGroup
                          ? ` · ${getSurfaceMaterialGroupSizeLabels(selectedSurfaceMaterialGroup).length} sizes`
                          : ""
                      }`
                    : "Starter finish · Not orderable"}
                </div>
                {isDesigner && selectedSurfaceMaterial ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                      {selectedSurfaceMaterial.import_governance.publish_status.replace(/_/g, " ")}
                    </span>
                    {selectedSurfaceMaterial.import_governance.publish_blockers.length > 0 ? (
                      <span className="rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
                        {selectedSurfaceMaterial.import_governance.publish_blockers.length} blockers
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                className={progressActionClass}
                disabled={!canEdit || !selectedSurfaceMaterialPrimaryId || !canApplyActiveSurfaceTarget}
                onClick={() => selectedSurfaceMaterialPrimaryId && applySurfaceMaterialToActiveRoom(selectedSurfaceMaterialPrimaryId)}
              >
                Apply target
              </button>
              <button
                type="button"
                className={progressSecondaryActionClass}
                disabled={!canEdit || !selectedSurfaceMaterialPrimaryId}
                onClick={() => selectedSurfaceMaterialPrimaryId && applySurfaceMaterialToAllRooms(selectedSurfaceMaterialPrimaryId)}
              >
                Apply all
              </button>
              <button type="button" className={progressSecondaryActionClass} onClick={requestSelectedSurfaceInformation}>
                Information
              </button>
              {selectedSurfaceMaterial?.source?.source_url && isDesigner ? (
                <a
                  href={selectedSurfaceMaterial.source.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className={progressSecondaryActionClass}
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
              <div key={room.id} className={dark ? "designer-raised rounded-lg p-2" : "rounded-lg border border-neutral-200 bg-white p-2"}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className={dark ? "truncate text-xs font-semibold text-neutral-100" : "truncate text-xs font-semibold text-neutral-900"}>
                      {room.name}
                    </div>
                    <div className={progressMetaClass}>
                      {(room.floorLabel ?? "Floor")} · {getSurfaceRoomAreaSqm(room).toFixed(2)} sqm
                    </div>
                    <div className={progressMetaClass}>
                      {row?.materialName ?? "Starter finish"}
                    </div>
                  </div>
                  {active ? <span className={progressReadyClass}>Active</span> : null}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" className={progressSecondaryActionClass} onClick={() => onSelectRoom(room.id)}>
                    Open
                  </button>
                  <button
                    type="button"
                    className={progressSecondaryActionClass}
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
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {surfaceSummaryOpen ? (
        <div
          data-testid="surface-summary-panel"
          className={dark ? "designer-recessed mt-3 rounded-lg p-2" : "mt-3 rounded-lg border border-neutral-200 bg-white p-2"}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-neutral-900"}>
                Surface Summary
              </div>
              <div className={progressMetaClass}>{activeSurfaceSummaryRows.length} surfaces</div>
            </div>
            <button type="button" className={progressSecondaryActionClass} onClick={() => setSurfaceSummaryOpen(false)}>
              Close
            </button>
          </div>
          <div className="mt-2 grid gap-2">
            {activeSurfaceSummaryRows.map((row) => (
              <div key={row.id} data-testid={`surface-summary-row-${row.id}`} className={dark ? "designer-raised rounded-lg p-2" : "rounded-lg border border-neutral-200 bg-neutral-50 p-2"}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className={dark ? "truncate text-xs font-semibold text-neutral-100" : "truncate text-xs font-semibold text-neutral-950"}>
                      {row.room.name} · {row.surfaceLabel}
                    </div>
                    <div className={progressMetaClass}>
                      {row.materialName} · {row.areaSqm.toFixed(2)} sqm
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
                  <a href={row.sampleUrl} target="_blank" rel="noreferrer" className={dark ? "mt-2 inline-block text-[11px] font-semibold text-blue-300" : "mt-2 inline-block text-[11px] font-semibold text-blue-700"}>
                    Request sample / quote
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
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
    if (action === "add_doorway") return "Add doorway";
    if (action === "add_storage") return "Add storage";
    if (action === "review_plan_layout") return "Review plan";
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
    if (action === "review_plan_layout") {
      return;
    }
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
                    className={
                      dark
                        ? "designer-raised rounded-md px-2.5 py-1.5 text-[11px] text-neutral-300"
                        : "rounded-md bg-neutral-50 px-2.5 py-1.5 text-[11px] text-neutral-600"
                    }
                  >
                    <summary className="cursor-pointer font-semibold">
                      {issue.suggestedFix}
                    </summary>
                    <div className={dark ? "mt-1 text-neutral-400" : "mt-1 text-neutral-500"}>
                      {issue.detail}
                    </div>
                    <button
                      type="button"
                      data-testid={`plan-quality-issue-action-${index}`}
                      className={`${progressSecondaryActionClass} mt-2 min-h-8 w-full`}
                      disabled={!canEdit}
                      onClick={() => handlePlanQualityAction(issue.action, issue)}
                    >
                      {getPlanQualityActionLabel(issue.action)}
                    </button>
                  </details>
                ))}
              </div>
            ) : (
              <div className={progressMetaClass}>
                The main room links, daylight, and furniture footprint look ready.
              </div>
            )}
            <button
              type="button"
              data-testid="plan-quality-primary-action"
              className={`${progressActionClass} mt-3 min-h-10 w-full`}
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
            </button>
          </>
        )}
      </div>
    );
  };
  const floorPlanCollapsed = isPlanSectionCollapsed("floorPlan");

  return (
    <div className={dark ? "overflow-hidden px-2 pb-2" : undefined}>
      {showRoomSetupWizard && (
        <div
          data-testid="plan-tool-palette"
          className={
            dark
              ? "designer-raised overflow-hidden rounded-sm"
              : "overflow-hidden rounded-sm border border-neutral-200 bg-white"
          }
        >
          <div
            className={
              dark
                ? "border-b border-white/10 px-3 py-3 text-neutral-100"
                : "border-b border-neutral-100 px-3 py-3 text-neutral-900"
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-base font-semibold">Room setup</div>
                <div className={progressMetaClass}>
                  {hasRooms
                    ? `${planRoomCount} room${planRoomCount === 1 ? "" : "s"} · ${activeRoomName}`
                    : "Choose a starter layout, enter dimensions, or draw."}
                </div>
                {hasRooms && (
                  <div data-testid="consumer-plan-next-steps" className={progressMetaClass}>
                    {consumerPlanNextSteps}
                  </div>
                )}
              </div>
              <button
                type="button"
                data-testid="plan-section-toggle-floorPlan"
                className={collapsedToggleClass}
                aria-label={`${floorPlanCollapsed ? "Expand" : "Collapse"} floor plan`}
                aria-expanded={!floorPlanCollapsed}
                onClick={() => setPlanSectionCollapsed("floorPlan", !floorPlanCollapsed)}
              >
                {floorPlanCollapsed ? "Expand" : "Collapse"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span
                data-testid="room-setup-step-furnish-meta"
                className={hasStartedFurniture ? progressReadyClass : progressTodoClass}
              >
                {furnitureStatusLabel}
              </span>
              {hasRooms && (
                <span className={hasOpenings || !hasConnectionBlockers ? progressReadyClass : progressTodoClass}>
                  {openingStatusLabel}
                </span>
              )}
            </div>
          </div>

          {!floorPlanCollapsed && (
            <>
              <ConsumerRoomSetupCard
                dark={dark}
                canEdit={canEdit}
                canEditPlanGeometry={canEditPlanGeometry}
                hasRooms={hasRooms}
                activeRoomName={activeRoomName}
                newRoomType={newRoomType}
                activeRoomPresetId={activeRoomPresetId}
                roomWidthInput={roomWidthInput}
                roomDepthInput={roomDepthInput}
                roomWidth={roomWidth}
                roomDepth={roomDepth}
                measurementUnit={measurementUnit}
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
                  chooseTemplate: openTemplatePicker,
                  drawRoom: startDrawRoomSetup,
                  addOpening: onAddFloorPlanOpeningFromTool,
                  continueToFurnish: onGoFurnish,
                }}
              />

              {renderPlanToolSection({
                section: "importFloorPlan",
                title: "Import floor plan",
                children: (
                  <div className={planToolGridClass}>
                    {renderPlanToolTile({
                      testId: "plan-tool-import-2d",
                      icon: "upload",
                      label: "Import 2D drawing",
                      active: planStartMode === "upload",
                      disabled: !canEdit,
                      onClick: openFloorPlanUploadPicker,
                    })}
                  </div>
                ),
              })}

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
                      label: "Straight wall",
                      shortcut: "B",
                      active: floorPlanTraceRoomMode && floorPlanDrawRoomMode === "straight_wall",
                      disabled: !canEdit,
                      onClick: () => startDrawRoomMode("straight_wall"),
                    })}
                    {renderPlanToolTile({
                      testId: "plan-tool-rectangle-wall",
                      icon: "rectangleWall",
                      label: "Rectangle wall",
                      shortcut: "F",
                      active: floorPlanTraceRoomMode && floorPlanDrawRoomMode === "rectangle_wall",
                      disabled: !canEdit,
                      onClick: () => startDrawRoomMode("rectangle_wall"),
                    })}
                    {renderPlanToolTile({
                      testId: "plan-tool-arc-wall",
                      icon: "arcWall",
                      label: "Arc wall",
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
                title: "Place doors and windows",
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
                  <div className={planToolGridClass}>
                    {renderPlanToolTile({
                      testId: "plan-tool-template-library",
                      icon: "template",
                      label: "Starter layouts",
                      active: planStartMode === "template",
                      disabled: !canEdit,
                      onClick: openTemplatePicker,
                    })}
                  </div>
                ),
              })}

              {hasRooms && (
                <button
                  type="button"
                  data-testid="plan-palette-furnish"
                  className={`${progressActionClass} m-2 min-h-9 w-[calc(100%-1rem)]`}
                  disabled={!canEdit}
                  onClick={onGoFurnish}
                >
                  Continue to Furnish
                </button>
              )}
            </>
          )}
        </div>
      )}
      {showStartPanel && (
        <div
          className={
            dark
              ? "designer-raised mb-2 rounded-lg p-2.5"
              : "mb-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5"
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={titleClass}>{hasRooms ? "Add to plan" : "Start your room"}</div>
              <div className={dark ? "mt-1 text-xs text-neutral-400" : "mt-1 text-xs text-neutral-500"}>
                {hasRooms
                  ? "Add another room, upload a plan, or draw by hand."
                  : "Choose a room and size. You can adjust it anytime."}
              </div>
            </div>
            {showPlanDetails && (
              <button
                type="button"
                className={
                  dark
                    ? "rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-neutral-200"
                    : "rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-neutral-700"
                }
                data-testid="close-plan-start-workflow"
                onClick={closePlanStartWorkflow}
              >
                Close
              </button>
            )}
          </div>

          {!hasRooms && (
            <div
              data-testid="guided-room-start"
              className={
                dark
                  ? "designer-raised mt-3 rounded-lg p-3"
                  : "mt-3 rounded-lg border border-neutral-200 bg-white p-3"
              }
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
                  dark={dark}
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
                  dark={dark}
                  compact
                  testId="guided-room-depth-input"
                  onCommit={(valueMm) => onRoomDepthInputChange((valueMm / 1000).toFixed(2))}
                />
              </div>

              <button
                type="button"
                data-testid="guided-create-room"
                className={`${progressActionClass} mt-3 min-h-11 w-full text-sm`}
                disabled={!canEditPlanGeometry}
                onClick={() => {
                  onNewRoomShapeChange("rectangle");
                  onAddDesignerRoom();
                }}
              >
                Create {roomTypeLabel.toLowerCase()}
              </button>
            </div>
          )}

          <details className="mt-3" open={planStartMode !== "start"}>
            <summary
              className={
                dark
                  ? "cursor-pointer text-xs font-semibold text-neutral-300"
                  : "cursor-pointer text-xs font-semibold text-neutral-600"
              }
            >
              Other ways to start
            </summary>
            <div className="mt-2 grid gap-2">
              <button
                type="button"
                data-testid="plan-start-draw"
                className={planStartButtonClass("draw")}
                disabled={!canEdit}
                onClick={() => {
                  setPlanStartMode("draw");
                  onFloorPlanTraceRoomDrawModeChange("rectangle_wall");
                  onFloorPlanTraceRoomModeChange(true);
                }}
              >
                Draw room
              </button>
              <button
                type="button"
                data-testid="plan-start-upload"
                className={planStartButtonClass("upload")}
                disabled={!canEdit}
                onClick={openFloorPlanUploadPicker}
              >
                Upload plan
              </button>
              <button
                type="button"
                data-testid="plan-start-template"
                className={planStartButtonClass("template")}
                disabled={!canEdit}
                onClick={openTemplatePicker}
              >
                Use template
              </button>
            </div>
          </details>

          {planStartMode === "upload" && !floorPlanUnderlay && (
            <div
              className={
                dark
                  ? "designer-recessed mt-3 rounded-lg p-3 text-xs text-neutral-300"
                  : "mt-3 rounded-lg bg-white p-3 text-xs text-neutral-600"
              }
            >
              Upload a drawing, then trace rooms, doors, and windows over it.
            </div>
          )}
          {planStartMode === "template" && !isDesigner && (
            <div
              className={
                dark
                  ? "designer-recessed mt-3 rounded-lg p-3 text-xs text-neutral-300"
                  : "mt-3 rounded-lg bg-white p-3 text-xs text-neutral-600"
              }
            >
              Pick a starter plan below. Resize rooms and add doors when ready.
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
              {viewMode === "2d" ? "2D active" : "3D view"}
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            <div className="grid grid-cols-3 gap-2" data-testid="guided-plan-stepper">
              {planGuideSteps.map((step, index) => (
                <div
                  key={step.label}
                  className={
                    step.active
                      ? dark
                        ? "rounded-lg border border-white/15 bg-white/10 px-2 py-2"
                        : "rounded-lg border border-neutral-900 bg-white px-2 py-2"
                      : dark
                        ? "designer-raised rounded-lg px-2 py-2"
                        : "rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-2"
                  }
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={
                        step.ready
                          ? dark
                            ? "flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400/20 text-[10px] font-bold text-emerald-100"
                            : "flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700"
                          : step.active
                            ? dark
                              ? "flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-neutral-950"
                              : "flex h-4 w-4 items-center justify-center rounded-full bg-neutral-900 text-[10px] font-bold text-white"
                            : dark
                              ? "flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-neutral-300"
                              : "flex h-4 w-4 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-bold text-neutral-600"
                      }
                    >
                      {index + 1}
                    </span>
                    <span className={dark ? "truncate text-[11px] font-semibold text-neutral-100" : "truncate text-[11px] font-semibold text-neutral-900"}>
                      {step.label}
                    </span>
                  </div>
                  <div className={dark ? "mt-1 truncate text-[10px] text-neutral-400" : "mt-1 truncate text-[10px] text-neutral-500"}>
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
                      ? `${planRoomCount} room${planRoomCount === 1 ? "" : "s"} · ${roomWidth.toFixed(1)} x ${roomDepth.toFixed(1)}m`
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
                    {hasConnectionBlockers ? "A room link needs a doorway." : "Add only if you need them before furnishing."}
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
            <summary
              className={
                dark
                  ? "cursor-pointer text-xs font-semibold text-neutral-300"
                  : "cursor-pointer text-xs font-semibold text-neutral-600"
              }
            >
              Measurements
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className={measurementTileClass} data-testid="plan-measurement-area">
                <div className={measurementValueClass}>{activeRoomArea.toFixed(2)} m2</div>
                <div className={measurementLabelClass}>Area</div>
              </div>
              <div className={measurementTileClass} data-testid="plan-measurement-perimeter">
                <div className={measurementValueClass}>{activeRoomPerimeter.toFixed(1)} m</div>
                <div className={measurementLabelClass}>Perimeter</div>
              </div>
              <div className={measurementTileClass} data-testid="plan-measurement-clearance">
                <div className={measurementValueClass}>
                  {activeRoomClearWidth.toFixed(1)} x {activeRoomClearDepth.toFixed(1)}m
                </div>
                <div className={measurementLabelClass}>Clear span</div>
              </div>
              <div className={measurementTileClass} data-testid="plan-measurement-height">
                <div className={measurementValueClass}>{(activeRoomHeightMm / 1000).toFixed(2)} m</div>
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
                  className={
                    dark
                      ? "designer-raised flex items-center justify-between gap-2 rounded-lg px-2.5 py-2"
                      : "flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2"
                  }
                >
                  <span className={dark ? "text-[11px] font-semibold text-neutral-300" : "text-[11px] font-semibold text-neutral-600"}>
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

          {!isPlanSectionCollapsed("selectedRoom") && (
            <>
              {!visiblePlanOpening && (
                <>
                  <div data-testid="selected-room-floor-finish" className={`${progressRowClass} mt-3`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className={progressLabelClass}>Floor finish</div>
                        <div className={progressMetaClass}>{activeFloorDisplayName}</div>
                      </div>
                      <button
                        type="button"
                        data-testid="plan-change-floor-finish"
                        className={progressSecondaryActionClass}
                        disabled={!canEdit}
                        onClick={() => setRoomFinishPanelOpen((open) => !open)}
                      >
                        {roomFinishPanelOpen ? "Hide" : "Change floor"}
                      </button>
                    </div>
                  </div>
              {roomFinishPanelOpen && (
                <>
                  {renderSurfaceMaterialBrowser()}
                </>
              )}
              <div
                data-testid="mobile-selected-room-dimensions"
                className={dark ? "mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-2 md:hidden" : "mt-2 grid grid-cols-2 gap-2 border-t border-neutral-200 pt-2 md:hidden"}
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
                  dark={dark}
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
                  dark={dark}
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
                    dark={dark}
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
            <button
              type="button"
              className={`${progressActionClass} min-h-10 shrink-0 px-3`}
              onClick={nextAction.action}
              disabled={!canEdit && !hasStartedFurniture}
            >
              {nextAction.label}
            </button>
          </div>
          {hasRooms && !hasOpenings && !hasConnectionBlockers && (
            <button
              type="button"
              className={`${progressSecondaryActionClass} mt-2 w-full min-h-10`}
              onClick={() => onAddFloorPlanOpeningFromTool("door")}
              disabled={!canEdit}
            >
              Add doors or windows
            </button>
          )}
          {hasRooms && !hasStartedFurniture && aiDesignEnabled && (
            <button
              type="button"
              className={`${progressSecondaryActionClass} mt-2 w-full min-h-10`}
              onClick={onGoAiDesign}
              disabled={!canEdit}
            >
              Ask AI for a starter layout
            </button>
          )}
        </div>
      )}
      {showPlanDetails && viewMode === "2d" && (
        <>
          <div className={progressCardClass}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className={titleClass}>Plan view</div>
                <div className={progressMetaClass}>
                  {simplePlanControls ? "Simple planning view." : "Pro drafting view."}
                </div>
              </div>
              <div
                className={
                  dark
                    ? "designer-raised grid grid-cols-2 rounded-lg p-1"
                    : "grid grid-cols-2 rounded-lg border border-neutral-200 bg-neutral-50 p-1"
                }
              >
                <button
                  type="button"
                  className={
                    simplePlanControls
                      ? progressActionClass
                      : "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-neutral-600 hover:bg-white dark:text-neutral-300 dark:hover:bg-white/10"
                  }
                  onClick={() => onSimplePlanControlsChange(true)}
                >
                  Simple
                </button>
                <button
                  type="button"
                  disabled={!isDesigner}
                  title={!isDesigner ? "Open Pro tools to use Pro drafting controls" : undefined}
                  className={
                    !simplePlanControls
                      ? progressActionClass
                      : "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-neutral-600 hover:bg-white dark:text-neutral-300 dark:hover:bg-white/10"
                  }
                  onClick={() => {
                    if (isDesigner) onSimplePlanControlsChange(false);
                  }}
                >
                  Pro
                </button>
              </div>
            </div>
          </div>
          {isDesigner && (
            <FloorPlanToolStrip
              activeTool={activeFloorPlanTool}
              disabled={!canEdit}
              dark={dark}
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
              <div className={titleClass}>Floor</div>
              <div className={progressMetaClass}>
                {activeFloorLabel} · {activeFloorRoomCount} room{activeFloorRoomCount === 1 ? "" : "s"}
              </div>
            </div>
            <span
              className={
                dark
                  ? "rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-neutral-200"
                  : "rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold text-neutral-600"
              }
            >
              {floorOptions.length} level{floorOptions.length === 1 ? "" : "s"}
            </span>
          </div>

          <div
            className={
              dark
                ? "designer-raised mt-3 grid gap-1.5 rounded-lg p-2"
                : "mt-3 grid gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-2"
            }
          >
            {floorOptions.map((option) => {
              const isActive = option.level === activeFloorLevel;
              return (
                <div
                  key={option.level}
                  className={
                    dark
                      ? `flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs ${
                          isActive ? "bg-blue-400/15 text-blue-100" : "text-neutral-300"
                        }`
                      : `flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs ${
                          isActive ? "bg-blue-50 text-blue-800" : "text-neutral-600"
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

          <div
            className={
              dark
                ? "designer-raised mt-2 flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                : "mt-2 flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs"
            }
          >
            <span className={floorFieldLabelClass}>Stacked 3D floors</span>
            <span className={stackedFloorView ? "font-semibold text-blue-600" : progressMetaClass}>
              {stackedFloorView ? "On" : "Off"}
            </span>
          </div>

          <div className="mt-3 border-t border-neutral-200/60 pt-3 dark:border-white/10">
            <div className="grid gap-2">
              <div className="grid grid-cols-[1fr_7rem] items-center gap-3">
                <span className={floorFieldLabelClass}>Interior area</span>
                <div className={floorInputClass}>{activeRoomArea.toFixed(2)} m2</div>
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
                dark={dark}
                compact
                hint={`Applies to ${activeFloorRoomCount} room${activeFloorRoomCount === 1 ? "" : "s"} on ${activeFloorLabel}.`}
                onCommit={onActiveRoomHeightMmChange}
              />
              <FloorPlanPropertyEvidenceControl
                evidence={activeRoomWallHeightEvidence}
                dark={dark}
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
                dark={dark}
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
                dark={dark}
                compact
                onCommit={onActiveRoomSlabThicknessMmChange}
              />
              <FloorPlanPropertyEvidenceControl
                evidence={activeRoomSlabThicknessEvidence}
                dark={dark}
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
                dark={dark}
                compact
                onCommit={onActiveRoomBaseboardDepthMmChange}
              />
            </div>
          </div>

          <div className="mt-3 border-t border-neutral-200/60 pt-3 dark:border-white/10">
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

          <div className="mt-3 border-t border-neutral-200/60 pt-3 dark:border-white/10">
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
                <span className={floorFieldLabelClass}>Color</span>
                <input
                  type="color"
                  value={activeRoomCeilingColor}
                  disabled={!canEdit}
                  className="h-8 w-10 rounded border border-neutral-200 bg-transparent p-0 disabled:opacity-50"
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
            <button
              type="button"
              className={progressSecondaryActionClass}
              disabled={!canEdit}
              onClick={() => onApplyFloorMaterialToAllRooms(activeSurfaceMaterial?.surface_material.material_id ?? activeFloorMaterial.id)}
            >
              Apply all
            </button>
          </div>
          {renderSurfaceMaterialBrowser()}
            <div
              className={
                dark
                  ? "designer-raised mt-3 rounded-xl p-3"
                  : "mt-3 rounded-xl border border-neutral-200 bg-white p-3"
              }
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-neutral-900"}>
                    Pattern direction
                  </div>
                  <div className={dark ? "mt-0.5 text-[11px] text-neutral-400" : "mt-0.5 text-[11px] text-neutral-500"}>
                    {activeFloorRotationDeg} deg
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className={progressSecondaryActionClass}
                    disabled={!canEdit}
                    onClick={onRotateActiveFloorMaterial}
                  >
                    Rotate 90
                  </button>
                  <button
                    type="button"
                    className={progressSecondaryActionClass}
                    disabled={!canEdit}
                    onClick={onResetActiveFloorMaterialPattern}
                  >
                    Reset
                  </button>
                </div>
              </div>
              {isDesigner && (
                <label className="mt-3 block">
                  <div className="flex items-center justify-between gap-3">
                    <span className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-neutral-900"}>
                      Pattern size
                    </span>
                    <span className={dark ? "text-[11px] text-neutral-400" : "text-[11px] text-neutral-500"}>
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
          className={
            dark
              ? "mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3"
              : "mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3"
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={dark ? "text-sm font-semibold text-emerald-100" : "text-sm font-semibold text-emerald-900"}>
                {floorPlanTraceOpeningKind === "door" ? "Door tool active" : "Window tool active"}
              </div>
              <div className={dark ? "mt-1 text-xs text-emerald-100/75" : "mt-1 text-xs text-emerald-800"}>
                {floorPlanUnderlay
                  ? "Pick two points along the same wall. Green means it fits."
                  : "Move near a wall, then click when the preview turns green."}
              </div>
              <div className={dark ? "mt-1 text-[11px] font-semibold text-emerald-100/70" : "mt-1 text-[11px] font-semibold text-emerald-700"}>
                Esc {floorPlanTraceOpeningPointCount > 0 ? "clears points" : "exits tool"}
              </div>
            </div>
            <button
              type="button"
              className={progressSecondaryActionClass}
              onClick={() => onFloorPlanTraceOpeningModeChange(false)}
            >
              Done
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <select
              data-testid="floor-plan-opening-active-kind"
              value={floorPlanTraceOpeningKind}
              disabled={!canEdit}
              onChange={(event) =>
                onFloorPlanTraceOpeningKindChange(event.target.value as RoomOpening2D["kind"])
              }
              className={
                dark
                  ? "designer-control min-w-28 rounded-lg border px-2 py-2 text-sm text-neutral-100"
                  : "min-w-28 rounded-lg border border-emerald-200 bg-white px-2 py-2 text-sm text-neutral-900"
              }
            >
              <option value="door">Door</option>
              <option value="window">Window</option>
            </select>
            <button
              type="button"
              className={progressSecondaryActionClass}
              disabled={!canEdit || floorPlanTraceOpeningPointCount === 0}
              onClick={onResetFloorPlanTraceOpeningPoints}
            >
              Reset points
            </button>
          </div>
        </div>
      )}
      {showFloorPlanPanel && (
        <FloorPlanUploadPanel
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
          dark={dark}
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
            items={roomConnectionChecklistItems}
            disabled={isClientPreview}
            dark={dark}
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
          className={
            dark
              ? "designer-raised mt-3 rounded-xl p-3"
              : "mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3"
          }
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              ref={templatePickerHeadingRef}
              id="starter-floor-plan-picker-title"
              tabIndex={-1}
              className={`${titleClass} rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`}
            >
              Choose a floor plan
            </h2>
            <div className="flex items-center gap-2">
              <div className={dark ? "text-xs font-semibold text-neutral-400" : "text-xs font-semibold text-neutral-500"}>
                {filteredPlanTemplates.length} starter layouts
              </div>
              <button
                type="button"
                data-testid="skip-to-starter-layouts"
                className={
                  dark
                    ? "rounded-md border border-white/15 px-2 py-1 text-xs font-semibold text-neutral-100 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-blue-400"
                    : "rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-700 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-500"
                }
                onClick={() => firstTemplateActionRef.current?.focus()}
              >
                Skip to starter layouts
              </button>
            </div>
          </div>
          <div className="mt-3">
            <FloorPlanAddressSearch
              dark={dark}
              canEdit={canEdit}
              onApplyPlanTemplate={onApplyPlanTemplate}
            />
          </div>
          <div className={dark ? "mt-4 text-xs font-semibold text-neutral-300" : "mt-4 text-xs font-semibold text-neutral-600"}>
            Or browse starter layouts
          </div>
          <div
            data-testid="template-filter-panel"
            className="mt-3 grid gap-2"
          >
            <div className="grid grid-cols-4 gap-1" data-testid="template-bedroom-filter">
              {[
                ["all", "All"],
                ["studio", "Studio"],
                ["one", "1 bed"],
                ["two", "2 bed"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTemplateBedroomFilter(value as typeof templateBedroomFilter)}
                  className={templateBedroomButtonClass(templateBedroomFilter === value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Plan size"
                data-testid="template-footprint-filter"
                value={templateFootprintFilter}
                onChange={(event) =>
                  setTemplateFootprintFilter(event.target.value as typeof templateFootprintFilter)
                }
                className={templateFilterSelectClass}
              >
                <option value="all">Any size</option>
                <option value="compact">Compact</option>
                <option value="narrow">Narrow</option>
                <option value="wide">Spacious</option>
              </select>
              <select
                aria-label="Plan style"
                data-testid="template-style-filter"
                value={templateStyleFilter}
                onChange={(event) =>
                  setTemplateStyleFilter(event.target.value as typeof templateStyleFilter)
                }
                className={templateFilterSelectClass}
              >
                <option value="all">Any style</option>
                <option value="open">Open plan</option>
                <option value="separated">More private</option>
                <option value="adu">Guest house</option>
              </select>
            </div>
          </div>
          <div className="mt-2 grid gap-2">
            {filteredPlanTemplates.map((template, templateIndex) => {
              const areaSqm = template.rooms.reduce(
                (sum, room) => sum + room.width * room.depth,
                0
              );
              const bounds = template.rooms.reduce(
                (acc, room) => ({
                  left: Math.min(acc.left, room.x - room.width / 2),
                  right: Math.max(acc.right, room.x + room.width / 2),
                  top: Math.min(acc.top, room.z - room.depth / 2),
                  bottom: Math.max(acc.bottom, room.z + room.depth / 2),
                }),
                { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
              );
              const previewWidth = 112;
              const previewHeight = 74;
              const planWidth = Math.max(1, bounds.right - bounds.left);
              const planDepth = Math.max(1, bounds.bottom - bounds.top);
              const scale = Math.min((previewWidth - 12) / planWidth, (previewHeight - 12) / planDepth);
              const roomPreview = template.rooms
                .map((room) => room.name.replace(" / ", "/"))
                .join(" · ");
              const furnishedPack =
                template.furnishingPacks.find((pack) => pack.id === "styled_starter") ??
                template.furnishingPacks[0];
              const furnishedItemCount = furnishedPack?.intents.length ?? 0;
              return (
                <div
                  key={template.id}
                  className={
                    dark
                      ? "designer-control grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 rounded-lg border px-3 py-2 text-left text-sm font-medium text-neutral-100"
                      : "grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm font-medium text-neutral-800 shadow-sm"
                  }
                >
                  <span
                    className={
                      dark
                        ? "block self-start overflow-hidden rounded-md border border-white/10 bg-[#10131b]"
                        : "block self-start overflow-hidden rounded-md border border-neutral-200 bg-neutral-50"
                    }
                    aria-hidden="true"
                  >
                    <svg
                      data-testid={`plan-template-preview-${template.id}`}
                      viewBox={`0 0 ${previewWidth} ${previewHeight}`}
                      className="h-[86px] w-full"
                    >
                      {template.rooms.map((room) => {
                        const x = 6 + (room.x - room.width / 2 - bounds.left) * scale;
                        const y = 6 + (room.z - room.depth / 2 - bounds.top) * scale;
                        const width = room.width * scale;
                        const height = room.depth * scale;
                        const fill =
                          room.roomType === "toilet"
                            ? "#dbeafe"
                            : room.roomType === "kitchen"
                              ? "#dcfce7"
                              : room.roomType === "bedroom"
                                ? "#ede9fe"
                                : room.roomType === "dining"
                                  ? "#fef3c7"
                                  : "#e5e7eb";
                        return (
                          <rect
                            key={room.id}
                            x={x}
                            y={y}
                            width={width}
                            height={height}
                            fill={fill}
                            stroke="#9ca3af"
                            strokeWidth="1.4"
                            rx="1.5"
                          />
                        );
                      })}
                      {furnishedPack?.intents.slice(0, 9).map((intent) => {
                        const room = template.rooms.find((entry) => entry.id === intent.roomId);
                        if (!room) return null;
                        const x = 6 + (room.x + intent.x - bounds.left) * scale;
                        const y = 6 + (room.z + intent.z - bounds.top) * scale;
                        const markerFill =
                          intent.category === "sofa" || intent.category === "accent_chair"
                            ? "#2563eb"
                            : intent.category === "dining_table" || intent.category === "dining_bench"
                              ? "#d97706"
                              : intent.category === "rug"
                                ? "#14b8a6"
                                : "#111827";
                        const markerSize =
                          intent.category === "sofa"
                            ? 5
                            : intent.category === "rug"
                              ? 6
                              : 3.5;

                        return intent.category === "rug" ? (
                          <rect
                            key={intent.id}
                            data-testid={`plan-template-furnishing-marker-${template.id}-${intent.id}`}
                            x={x - markerSize / 2}
                            y={y - markerSize / 2}
                            width={markerSize}
                            height={markerSize}
                            fill={markerFill}
                            fillOpacity="0.32"
                            rx="1"
                          />
                        ) : (
                          <circle
                            key={intent.id}
                            data-testid={`plan-template-furnishing-marker-${template.id}-${intent.id}`}
                            cx={x}
                            cy={y}
                            r={markerSize / 2}
                            fill={markerFill}
                            fillOpacity="0.85"
                          />
                        );
                      })}
                    </svg>
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center justify-between gap-2">
                      <span>{template.label}</span>
                      <span className={dark ? "shrink-0 text-xs text-neutral-400" : "shrink-0 text-xs text-neutral-500"}>
                        {Math.round(areaSqm)} m²
                      </span>
                    </span>
                    <span className={dark ? "mt-0.5 block text-xs text-neutral-400" : "mt-0.5 block text-xs text-neutral-500"}>
                      {template.summary}
                    </span>
                    <span
                      data-testid={`plan-template-dimensions-${template.id}`}
                      className={dark ? "mt-1 block text-[11px] font-semibold text-neutral-300" : "mt-1 block text-[11px] font-semibold text-neutral-700"}
                    >
                      Footprint {planWidth.toFixed(1)} × {planDepth.toFixed(1)} m · {template.rooms.length} room{template.rooms.length === 1 ? "" : "s"}
                    </span>
                    <span className={dark ? "mt-1 block text-[11px] font-semibold text-emerald-200" : "mt-1 block text-[11px] font-semibold text-emerald-700"}>
                      Good for: {template.bestFor}
                    </span>
                    <span className={dark ? "mt-1 block truncate text-[11px] text-neutral-400" : "mt-1 block truncate text-[11px] text-neutral-500"}>
                      Spaces: {roomPreview}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {template.realLifeChecks.slice(0, 2).map((check) => (
                        <span
                          key={check}
                          className={dark ? "rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-100" : "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700"}
                        >
                          {check}
                        </span>
                      ))}
                      <span className={dark ? "rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-neutral-300" : "rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600"}>
                        {template.doorways.length} doors
                      </span>
                      <span className={dark ? "rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-neutral-300" : "rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600"}>
                        {template.windows.length} windows
                      </span>
                    </span>
                    <span className={dark ? "mt-1 block truncate text-[11px] text-neutral-400" : "mt-1 block truncate text-[11px] text-neutral-500"}>
                      Zones: {template.zones.slice(0, 3).join(" · ")}
                    </span>
                    <span className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        ref={templateIndex === 0 ? firstTemplateActionRef : undefined}
                        type="button"
                        data-testid={`apply-plan-template-${template.id}`}
                        onClick={() => onApplyPlanTemplate(template)}
                        disabled={!canEdit}
                        className={
                          dark
                            ? "rounded-md border border-white/10 px-2 py-1.5 text-center text-xs font-semibold text-neutral-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                            : "rounded-md border border-neutral-200 px-2 py-1.5 text-center text-xs font-semibold text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                        }
                      >
                        Empty layout
                      </button>
                      <button
                        type="button"
                        data-testid={`apply-furnished-template-${template.id}`}
                        onClick={() =>
                          furnishedPack
                            ? onApplyPlanTemplate(template, { furnishingPackId: furnishedPack.id })
                            : onApplyPlanTemplate(template)
                        }
                        disabled={!canEdit || !furnishedPack || furnishedItemCount === 0}
                        className={
                          dark
                            ? "rounded-md bg-emerald-300 px-2 py-1.5 text-center text-xs font-semibold text-emerald-950 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                            : "rounded-md bg-emerald-600 px-2 py-1.5 text-center text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        }
                      >
                        <span className="block">Furnished starter</span>
                        <span className={dark ? "block text-[10px] text-emerald-950/80" : "block text-[10px] text-white/90"}>
                          {furnishedItemCount} items
                        </span>
                      </button>
                    </span>
                  </span>
                </div>
              );
            })}
            {filteredPlanTemplates.length === 0 && (
              <div className={dark ? "rounded-lg border border-white/10 p-3 text-xs text-neutral-400" : "rounded-lg border border-neutral-200 bg-white p-3 text-xs text-neutral-500"}>
                No templates match those filters.
              </div>
            )}
          </div>

          <div className={`${titleClass} mt-4`}>Add one room</div>
          <div className={dark ? "mt-1 text-xs text-neutral-400" : "mt-1 text-xs text-neutral-500"}>
            Use these when you only need one extra room.
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {HOUSE_ROOM_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                data-testid={`add-room-template-${template.id}`}
                onClick={() => onAddRoomTemplate(template)}
                disabled={!canEdit}
                className={
                  dark
                    ? "designer-control rounded-lg border px-3 py-2 text-left text-sm font-medium text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                    : "rounded-lg bg-white px-3 py-2 text-left text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                }
              >
                <span className="block">{template.label}</span>
                <span className={dark ? "mt-0.5 block text-xs text-neutral-400" : "mt-0.5 block text-xs text-neutral-500"}>
                  {template.width} x {template.depth}m
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {isDesigner && (
        <div
          className={
            dark
              ? "designer-raised mt-3 rounded-xl p-3"
              : "mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3"
          }
        >
          <div className={titleClass}>Room setup</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
              Type
              <select
                value={newRoomType}
                onChange={(event) => onNewRoomTypeChange(event.target.value as RoomType)}
                className="rounded-lg border border-neutral-200 bg-white px-2 py-2 text-xs text-neutral-900"
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
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
              Shape
              <select
                value={newRoomShape}
                onChange={(event) => onNewRoomShapeChange(event.target.value as RoomPlanShape)}
                className="rounded-lg border border-neutral-200 bg-white px-2 py-2 text-xs text-neutral-900"
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

          <label className="mt-2 flex flex-col gap-1 text-xs font-medium text-neutral-600">
            Size preset
            <select
              value={activeRoomPresetId}
              onChange={(event) => onRoomPresetChange(event.target.value as RoomSizePresetId)}
              className="rounded-lg border border-neutral-200 bg-white px-2 py-2 text-xs text-neutral-900"
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
            <button
              type="button"
              className="w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onAddDesignerRoom}
              disabled={!canEditPlanGeometry}
            >
              Add room
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
