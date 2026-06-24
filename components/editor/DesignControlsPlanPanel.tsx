"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type {
  HouseRoomConnectionChecklistItem,
  HouseRoomDoorwaySuggestion,
  HousePlanTemplate,
  HousePlanTemplateApplyOptions,
  HouseRoomTemplateId,
  RoomSizePresetId,
} from "@/lib/design-page-house-plan";
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
  FloorPlanDrawAngleLockMode,
  FloorPlanDrawRoomMode,
  FloorPlanUnderlay,
} from "@/lib/floor-plan-types";
import {
  DEFAULT_FLOOR_PATTERN_SCALE,
  FLOOR_MATERIALS,
  clampFloorPatternScale,
  getFloorMaterialById,
  getRecommendedFloorMaterials,
  normalizeFloorRotationDeg,
  type FloorMaterial,
} from "@/lib/floor-materials";
import type { RoomPlanShape, RoomType } from "@/lib/room-types";
import type { EditorViewMode } from "./EditorViewToggle";
import FloorPlanUploadPanel from "./FloorPlanUploadPanel";
import FloorPlanToolStrip, { type FloorPlanTool } from "./FloorPlanToolStrip";
import PlanOpeningInspector from "./PlanOpeningInspector";
import RoomConnectionChecklist from "./RoomConnectionChecklist";

export type PlanStartMode = "start" | "draw" | "upload" | "template";
type RoomSetupStep = "start" | "confirm" | "openings" | "furnish" | "done";

type HouseRoomTemplate = {
  id: HouseRoomTemplateId;
  label: string;
  roomType: RoomType;
  shape: RoomPlanShape;
  width: number;
  depth: number;
};

function getFloorMaterialSwatchStyle(material: FloorMaterial): CSSProperties {
  if (material.pattern === "wood_plank") {
    return {
      backgroundColor: material.swatchColor,
      backgroundImage: [
        `repeating-linear-gradient(0deg, transparent 0 7px, ${material.lineColor}66 7px 8px)`,
        `linear-gradient(135deg, ${material.swatchColor}, ${material.accentColor})`,
      ].join(", "),
    };
  }

  if (material.pattern === "tile_grid") {
    return {
      backgroundColor: material.swatchColor,
      backgroundImage: [
        `repeating-linear-gradient(0deg, transparent 0 9px, ${material.lineColor}70 9px 10px)`,
        `repeating-linear-gradient(90deg, transparent 0 9px, ${material.lineColor}70 9px 10px)`,
        `linear-gradient(135deg, ${material.swatchColor}, ${material.accentColor})`,
      ].join(", "),
    };
  }

  if (material.pattern === "soft_fleck") {
    return {
      backgroundColor: material.swatchColor,
      backgroundImage: [
        `radial-gradient(circle at 24% 28%, ${material.lineColor}80 0 1px, transparent 2px)`,
        `radial-gradient(circle at 68% 58%, ${material.accentColor}70 0 1px, transparent 2px)`,
        `radial-gradient(circle at 42% 78%, ${material.lineColor}55 0 1px, transparent 2px)`,
        `linear-gradient(135deg, ${material.swatchColor}, ${material.accentColor})`,
      ].join(", "),
    };
  }

  return {
    background: `linear-gradient(135deg, ${material.swatchColor}, ${material.accentColor})`,
  };
}

type DesignControlsPlanPanelProps = {
  dark: boolean;
  isClientPreview: boolean;
  isDesigner: boolean;
  canEdit: boolean;
  showFloorPropertiesPanel?: boolean;
  aiDesignEnabled?: boolean;
  viewMode: EditorViewMode;
  snapEnabled: boolean;
  newRoomType: RoomType;
  newRoomShape: RoomPlanShape;
  activeRoomPresetId: string;
  roomWidthInput: string;
  roomDepthInput: string;
  roomWidth: number;
  roomDepth: number;
  floorPlanUnderlay: FloorPlanUnderlay | null;
  floorPlanCalibrationMode: boolean;
  floorPlanCalibrationPointCount: number;
  floorPlanCalibrationDistanceInput: string;
  floorPlanCalibrationSummary: string | null;
  floorPlanTraceRoomMode: boolean;
  floorPlanDrawRoomMode: FloorPlanDrawRoomMode;
  floorPlanDrawAngleLockMode: FloorPlanDrawAngleLockMode;
  floorPlanExactWallLengthInput: string;
  floorPlanTraceRoomPointCount: number;
  floorPlanTraceRoomType: RoomType;
  floorPlanTraceOpeningMode: boolean;
  floorPlanTraceOpeningPointCount: number;
  floorPlanTraceOpeningKind: RoomOpening2D["kind"];
  canTraceOpenings: boolean;
  floorPlanPdfSourceReady: boolean;
  floorPlanPdfRenderingPage: number | null;
  roomConnectionChecklistItems: HouseRoomConnectionChecklistItem[];
  visiblePlanOpening: RoomOpening2D | null;
  visiblePlanOpeningRoomName: string;
  visiblePlanOpeningWallSpanMeters: number;
  planRoomCount: number;
  planItemCount: number;
  planOpeningCount: number;
  activeRoomName: string;
  activeRoomType: RoomType;
  activeRoomFloorMaterialId?: string;
  activeRoomFloorRotationDeg?: number;
  activeRoomFloorScale?: number;
  floorOptions: Array<{ level: number; label: string; roomCount: number }>;
  activeFloorLevel: number;
  activeFloorRoomCount: number;
  activeRoomHeightMm: number;
  activeRoomWallThicknessMm: number;
  activeRoomSlabThicknessMm: number;
  activeRoomWallOpacity: number;
  activeRoomFloorOpacity: number;
  activeRoomCeilingOpacity: number;
  activeRoomCeilingVisible: boolean;
  activeRoomCeilingColor: string;
  stackedFloorView: boolean;
  activeFloorPlanTool: FloorPlanTool;
  simplePlanControls: boolean;
  planGuidedActionsEnabled: boolean;
  planStartMode?: PlanStartMode;
  planCompletionSignal?: { id: number; kind: "room" | "opening" } | null;
  onPlanCompletionHandled?: (id: number) => void;
  onPlanStartModeChange?: (mode: PlanStartMode) => void;
  onSimplePlanControlsChange: (enabled: boolean) => void;
  onPlanGuidedActionsEnabledChange: (enabled: boolean) => void;
  onSelectFloorPlanTool: () => void;
  onDrawFloorPlanRoom: () => void;
  onAddFloorPlanOpeningFromTool: (kind: RoomOpening2D["kind"]) => void;
  onGoFurnish: () => void;
  onGoAiDesign: () => void;
  onGoShop: () => void;
  onGoView3D?: () => void;
  onApplyPlanTemplate: (template: HousePlanTemplate, options?: HousePlanTemplateApplyOptions) => void;
  onAddDesignerRoom: () => void;
  onAddRoomTemplate: (template: HouseRoomTemplate) => void;
  onApplyFloorMaterialToRoom: (materialId: string) => void;
  onApplyFloorMaterialToAllRooms: (materialId: string) => void;
  onRotateActiveFloorMaterial: () => void;
  onResetActiveFloorMaterialPattern: () => void;
  onActiveFloorMaterialScaleChange: (scale: number) => void;
  onNewRoomTypeChange: (roomType: RoomType) => void;
  onNewRoomShapeChange: (shape: RoomPlanShape) => void;
  onRoomPresetChange: (presetId: RoomSizePresetId) => void;
  onRoomWidthInputChange: (value: string) => void;
  onRoomDepthInputChange: (value: string) => void;
  onApplyRoomSize: () => void;
  onActiveRoomHeightMmChange: (valueMm: number) => void;
  onActiveRoomWallThicknessMmChange: (valueMm: number) => void;
  onActiveRoomSlabThicknessMmChange: (valueMm: number) => void;
  onActiveRoomSurfaceOpacityChange: (kind: "wall" | "floor" | "ceiling", opacity: number) => void;
  onActiveRoomCeilingVisibleChange: (visible: boolean) => void;
  onActiveRoomCeilingColorChange: (color: string) => void;
  onFloorPlanUpload: (file: File) => void;
  onFloorPlanPdfPageChange: (pageNumber: number) => void;
  onFloorPlanOpacityChange: (opacity: number) => void;
  onFloorPlanLockChange: (locked: boolean) => void;
  onFloorPlanCalibrationModeChange: (enabled: boolean) => void;
  onFloorPlanCalibrationDistanceChange: (value: string) => void;
  onApplyFloorPlanCalibration: () => void;
  onResetFloorPlanCalibrationPoints: () => void;
  onFloorPlanTraceRoomModeChange: (enabled: boolean) => void;
  onFloorPlanTraceRoomDrawModeChange: (mode: FloorPlanDrawRoomMode) => void;
  onFloorPlanDrawAngleLockModeChange: (mode: FloorPlanDrawAngleLockMode) => void;
  onFloorPlanExactWallLengthInputChange: (value: string) => void;
  onApplyFloorPlanExactWallLength: () => void;
  onFloorPlanTraceRoomTypeChange: (roomType: RoomType) => void;
  onUndoFloorPlanTraceRoomPoint: () => void;
  onResetFloorPlanTraceRoomPoints: () => void;
  onFloorPlanTraceOpeningModeChange: (enabled: boolean) => void;
  onFloorPlanTraceOpeningKindChange: (kind: RoomOpening2D["kind"]) => void;
  onResetFloorPlanTraceOpeningPoints: () => void;
  onClearFloorPlan: () => void;
  onAddSuggestedDoorway: (suggestion: HouseRoomDoorwaySuggestion) => void;
  onUpdateOpeningMetrics: (
    id: string,
    metrics: {
      widthMeters?: number;
      offsetMeters?: number;
      kind?: RoomOpening2D["kind"];
    }
  ) => void;
};

export default function DesignControlsPlanPanel({
  dark,
  isClientPreview,
  isDesigner,
  canEdit,
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
  planRoomCount,
  planItemCount,
  planOpeningCount,
  activeRoomName,
  activeRoomType,
  activeRoomFloorMaterialId,
  activeRoomFloorRotationDeg,
  activeRoomFloorScale,
  floorOptions,
  activeFloorLevel,
  activeFloorRoomCount,
  activeRoomHeightMm,
  activeRoomWallThicknessMm,
  activeRoomSlabThicknessMm,
  activeRoomWallOpacity,
  activeRoomFloorOpacity,
  activeRoomCeilingOpacity,
  activeRoomCeilingVisible,
  activeRoomCeilingColor,
  stackedFloorView,
  activeFloorPlanTool,
  simplePlanControls,
  planGuidedActionsEnabled,
  planStartMode: controlledPlanStartMode,
  planCompletionSignal,
  onPlanCompletionHandled,
  onPlanStartModeChange,
  onSimplePlanControlsChange,
  onPlanGuidedActionsEnabledChange,
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
  onApplyFloorMaterialToRoom,
  onApplyFloorMaterialToAllRooms,
  onRotateActiveFloorMaterial,
  onResetActiveFloorMaterialPattern,
  onActiveFloorMaterialScaleChange,
  onNewRoomTypeChange,
  onNewRoomShapeChange,
  onRoomPresetChange,
  onRoomWidthInputChange,
  onRoomDepthInputChange,
  onApplyRoomSize,
  onActiveRoomHeightMmChange,
  onActiveRoomWallThicknessMmChange,
  onActiveRoomSlabThicknessMmChange,
  onActiveRoomSurfaceOpacityChange,
  onActiveRoomCeilingVisibleChange,
  onActiveRoomCeilingColorChange,
  onFloorPlanUpload,
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
  const [roomSetupStep, setRoomSetupStep] = useState<RoomSetupStep>("confirm");
  const [templateBedroomFilter, setTemplateBedroomFilter] = useState<"all" | "studio" | "one" | "two">("all");
  const [templateFootprintFilter, setTemplateFootprintFilter] = useState<"all" | "compact" | "narrow" | "wide">("all");
  const [templateStyleFilter, setTemplateStyleFilter] = useState<"all" | "open" | "separated" | "adu">("all");
  const planStartMode = controlledPlanStartMode ?? localPlanStartMode;
  const setPlanStartMode = (mode: PlanStartMode) => {
    setLocalPlanStartMode(mode);
    onPlanStartModeChange?.(mode);
  };

  const titleClass = dark
    ? "designer-text-primary text-sm font-semibold"
    : "text-sm font-semibold text-neutral-800";
  const planStartButtonClass = (mode: Exclude<PlanStartMode, "start">) => {
    const isActive = planStartMode === mode;
    if (dark) {
      return [
        "rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        isActive
          ? "border-blue-400/45 bg-blue-500/20 text-blue-100"
          : "border-white/15 bg-[#1b2030] text-white hover:bg-white/10",
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
  const showTemplatePicker = planStartMode === "template" || isDesigner;
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
  const hasConnectionBlockers = roomConnectionChecklistItems.some(
    (item) => item.status === "needs_doorway"
  );
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
    ? "Needs doorway"
    : hasOpenings
      ? `${planOpeningCount} placed`
      : "Optional";
  const consumerPlanOpeningSummary = hasOpenings
    ? `${planOpeningCount} openings placed.`
    : "Openings optional.";
  const consumerPlanConnectionSummary =
    roomConnectionChecklistItems.length > 0 ? "Add doorway links from Connections." : "";
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
  const roomSetupActiveStep: RoomSetupStep = !hasRooms
    ? "start"
    : hasStartedFurniture
      ? "done"
      : hasConnectionBlockers
        ? "openings"
        : roomSetupStep === "start" || roomSetupStep === "done"
          ? "confirm"
          : roomSetupStep;
  const showStartPanel = !hasRooms && !showRoomSetupWizard;
  const showPlanProgressPanel = showPlanDetails && !showRoomSetupWizard;
  const showPlanNextActionCard = showPlanDetails && !showRoomSetupWizard;
  const showStandaloneFloorFinishPanel = hasRooms && showPlanDetails && !showRoomSetupWizard;
  useEffect(() => {
    if (!planCompletionSignal || isDesigner) return;

    let nextStep: RoomSetupStep | null = null;
    if (planCompletionSignal.kind === "room" && !hasStartedFurniture) {
      nextStep = "openings";
    } else if (
      planCompletionSignal.kind === "opening" &&
      hasRooms &&
      !hasConnectionBlockers &&
      !hasStartedFurniture
    ) {
      nextStep = "furnish";
    }

    if (!nextStep) {
      onPlanCompletionHandled?.(planCompletionSignal.id);
      return;
    }

    const timer = window.setTimeout(() => {
      setRoomSetupStep(nextStep);
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
    ? "mt-2 rounded-lg border border-white/10 bg-[#151820] p-2.5"
    : "mt-2 rounded-lg border border-neutral-200 bg-white p-2.5";
  const progressRowClass = dark
    ? "rounded-lg border border-white/10 bg-white/5 px-3 py-2"
    : "rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2";
  const compactStatusClass = dark
    ? "rounded-lg border border-white/10 bg-white/5 px-2.5 py-2"
    : "rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2";
  const progressLabelClass = dark
    ? "text-xs font-semibold text-neutral-100"
    : "text-xs font-semibold text-neutral-900";
  const progressMetaClass = dark
    ? "mt-0.5 text-[11px] text-neutral-400"
    : "mt-0.5 text-[11px] text-neutral-500";
  const progressReadyClass = dark
    ? "rounded-full bg-emerald-400/15 px-2 py-1 text-[11px] font-semibold text-emerald-200"
    : "rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700";
  const progressTodoClass = dark
    ? "rounded-full bg-amber-400/15 px-2 py-1 text-[11px] font-semibold text-amber-200"
    : "rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700";
  const progressActionClass = dark
    ? "rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-neutral-950 disabled:opacity-50"
    : "rounded-lg bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-neutral-700 disabled:opacity-50";
  const progressSecondaryActionClass = dark
    ? "rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-100 disabled:opacity-50"
    : "rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-neutral-800 hover:bg-neutral-100 disabled:opacity-50";
  const guidedActionsModeButtonClass = (active: boolean) =>
    [
      "min-h-8 rounded-md px-2.5 text-[11px] font-semibold transition",
      active
        ? dark
          ? "bg-white text-neutral-950"
          : "bg-neutral-950 text-white"
        : dark
          ? "text-neutral-300 hover:bg-white/10"
          : "text-neutral-600 hover:bg-white",
    ].join(" ");
  const setupStageClass = (step: RoomSetupStep) => {
    const isActive = roomSetupActiveStep === step;
    const isReady =
      step === "confirm"
        ? hasRooms
        : step === "openings"
          ? hasOpenings && !hasConnectionBlockers
          : step === "furnish"
            ? hasStartedFurniture
            : step === "done"
              ? hasStartedFurniture
              : false;

    if (dark) {
      return [
        "rounded-lg border px-2 py-2 text-left transition",
        isActive
          ? "border-white/20 bg-white/10"
          : isReady
            ? "border-emerald-300/25 bg-emerald-400/10"
            : "border-white/10 bg-white/5",
      ].join(" ");
    }

    return [
      "rounded-lg border px-2 py-2 text-left transition",
      isActive
        ? "border-neutral-900 bg-white"
        : isReady
          ? "border-emerald-200 bg-emerald-50"
          : "border-neutral-200 bg-neutral-50",
    ].join(" ");
  };
  const activeFloorMaterial = getFloorMaterialById(activeRoomFloorMaterialId);
  const activeFloorRotationDeg = normalizeFloorRotationDeg(activeRoomFloorRotationDeg);
  const activeFloorScale = clampFloorPatternScale(activeRoomFloorScale);
  const recommendedFloorMaterials = getRecommendedFloorMaterials(activeRoomType).slice(0, 4);
  const recommendedFloorMaterialIds = new Set(recommendedFloorMaterials.map((material) => material.id));
  const floorMaterialMetaClass = dark
    ? "block text-[10px] text-neutral-400"
    : "block text-[10px] text-neutral-500";
  const floorFieldLabelClass = dark
    ? "text-xs font-semibold text-neutral-200"
    : "text-xs font-semibold text-neutral-700";
  const floorInputClass = dark
    ? "h-9 w-full rounded-lg border border-white/10 bg-[#10131a] px-2 text-right text-sm text-neutral-100"
    : "h-9 w-full rounded-lg border border-neutral-200 bg-white px-2 text-right text-sm text-neutral-900";
  const consumerFieldLabelClass = dark
    ? "flex flex-col gap-1 text-xs font-semibold text-neutral-200"
    : "flex flex-col gap-1 text-xs font-semibold text-neutral-700";
  const consumerInputClass = dark
    ? "min-h-10 rounded-lg border border-white/10 bg-[#10131a] px-2.5 py-2 text-sm text-neutral-100 outline-none disabled:opacity-50"
    : "min-h-10 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-sm text-neutral-900 outline-none disabled:opacity-50";
  const consumerInputShellClass = dark
    ? "flex min-h-10 items-center gap-1 rounded-lg border border-white/10 bg-[#10131a] px-2.5 py-1"
    : "flex min-h-10 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1";
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
    ? "rounded-lg border border-white/10 bg-white/5 px-3 py-2"
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
  const floorMaterialButtonClass = (materialId: string) => {
    const isSelected = activeFloorMaterial.id === materialId;
    if (dark) {
      return [
        "flex min-w-0 items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        isSelected
          ? "border-emerald-300/45 bg-emerald-400/15 text-emerald-100"
          : "border-white/10 bg-white/5 text-neutral-100 hover:bg-white/10",
      ].join(" ");
    }
    return [
      "flex min-w-0 items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
      isSelected
        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
        : "border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50",
    ].join(" ");
  };
  const startDrawRoomSetup = () => {
    setRoomSetupStep("confirm");
    setPlanStartMode("draw");
    onFloorPlanTraceRoomDrawModeChange("rectangle_wall");
    onFloorPlanTraceRoomModeChange(true);
  };

  return (
    <div>
      {showRoomSetupWizard && (
        <div data-testid="room-setup-wizard" className={progressCardClass}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={titleClass}>Room setup</div>
              <div className={progressMetaClass}>
                {!planGuidedActionsEnabled
                  ? hasRooms
                    ? `${activeRoomName} · ${roomWidth.toFixed(1)} x ${roomDepth.toFixed(1)}m`
                    : "Choose, draw, or upload."
                  : roomSetupActiveStep === "start"
                    ? "Pick how you want to begin."
                    : roomSetupActiveStep === "confirm"
                      ? `${activeRoomName} · ${roomWidth.toFixed(1)} x ${roomDepth.toFixed(1)}m`
                      : roomSetupActiveStep === "openings"
                        ? hasOpenings
                          ? `${planOpeningCount} opening${planOpeningCount === 1 ? "" : "s"} placed`
                          : "Doors and windows are optional."
                        : roomSetupActiveStep === "furnish"
                          ? "The room outline is ready."
                          : "Ready for review."}
              </div>
            </div>
            <span className={!planGuidedActionsEnabled || hasRooms ? progressReadyClass : progressTodoClass}>
              {!planGuidedActionsEnabled ? "Manual" : hasRooms ? "Room ready" : "Start"}
            </span>
          </div>

          <div
            data-testid="plan-guided-actions-panel-toggle"
            className={
              dark
                ? "mt-3 grid grid-cols-[auto_1fr] items-center gap-2 rounded-lg bg-white/5 p-1.5"
                : "mt-3 grid grid-cols-[auto_1fr] items-center gap-2 rounded-lg bg-neutral-50 p-1.5"
            }
            role="group"
            aria-label="Plan action mode"
          >
            <span className={dark ? "px-1.5 text-[11px] font-semibold text-neutral-300" : "px-1.5 text-[11px] font-semibold text-neutral-600"}>
              Actions
            </span>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                data-testid="plan-guided-actions-panel-guided"
                data-active={planGuidedActionsEnabled ? "true" : "false"}
                className={guidedActionsModeButtonClass(planGuidedActionsEnabled)}
                onClick={() => onPlanGuidedActionsEnabledChange(true)}
              >
                Guided
              </button>
              <button
                type="button"
                data-testid="plan-guided-actions-panel-manual"
                data-active={!planGuidedActionsEnabled ? "true" : "false"}
                className={guidedActionsModeButtonClass(!planGuidedActionsEnabled)}
                onClick={() => onPlanGuidedActionsEnabledChange(false)}
              >
                Manual
              </button>
            </div>
          </div>

          {!planGuidedActionsEnabled ? (
            <div data-testid="manual-plan-setup" className="mt-3 grid gap-2">
              {hasRooms ? (
                <div data-testid="manual-plan-room-status" className={progressRowClass}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className={progressLabelClass}>{activeRoomName}</div>
                      <div className={progressMetaClass}>
                        {activeRoomTypeLabel} · {roomWidth.toFixed(1)} x {roomDepth.toFixed(1)}m
                      </div>
                    </div>
                    <span className={progressReadyClass}>{activeRoomArea.toFixed(0)} m2</span>
                  </div>
                </div>
              ) : (
                <div
                  data-testid="manual-room-start"
                  className={
                    dark
                      ? "rounded-lg border border-white/10 bg-white/5 p-3"
                      : "rounded-lg border border-neutral-200 bg-white p-3"
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
                  <button
                    type="button"
                    data-testid="manual-create-room"
                    className={`${progressActionClass} mt-3 min-h-10 w-full`}
                    disabled={!canEdit}
                    onClick={() => {
                      onNewRoomShapeChange("rectangle");
                      onAddDesignerRoom();
                      setRoomSetupStep("confirm");
                    }}
                  >
                    Create {roomTypeLabel.toLowerCase()}
                  </button>
                </div>
              )}

              <div data-testid="manual-plan-panel-actions" className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="manual-panel-select"
                  className={`${progressSecondaryActionClass} min-h-10`}
                  disabled={!canEdit || !hasRooms}
                  onClick={onSelectFloorPlanTool}
                >
                  Select
                </button>
                <button
                  type="button"
                  data-testid="manual-panel-draw"
                  className={`${progressActionClass} min-h-10`}
                  disabled={!canEdit}
                  onClick={startDrawRoomSetup}
                >
                  Draw
                </button>
                <button
                  type="button"
                  data-testid="manual-panel-door"
                  className={`${progressSecondaryActionClass} min-h-10`}
                  disabled={!canEdit || !hasRooms}
                  onClick={() => onAddFloorPlanOpeningFromTool("door")}
                >
                  Door
                </button>
                <button
                  type="button"
                  data-testid="manual-panel-window"
                  className={`${progressSecondaryActionClass} min-h-10`}
                  disabled={!canEdit || !hasRooms}
                  onClick={() => onAddFloorPlanOpeningFromTool("window")}
                >
                  Window
                </button>
                <button
                  type="button"
                  data-testid="manual-panel-upload"
                  className={`${progressSecondaryActionClass} min-h-10`}
                  disabled={!canEdit}
                  onClick={() => {
                    setRoomSetupStep("confirm");
                    setPlanStartMode("upload");
                  }}
                >
                  Upload
                </button>
                <button
                  type="button"
                  data-testid="manual-panel-templates"
                  className={`${progressSecondaryActionClass} min-h-10`}
                  disabled={!canEdit}
                  onClick={() => {
                    setRoomSetupStep("confirm");
                    setPlanStartMode("template");
                  }}
                >
                  Templates
                </button>
                <button
                  type="button"
                  data-testid="manual-panel-furnish"
                  className={`${progressSecondaryActionClass} min-h-10`}
                  disabled={!canEdit || !hasRooms}
                  onClick={onGoFurnish}
                >
                  Furnish
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2" data-testid="room-setup-stepper">
                {[
                  { id: "confirm" as RoomSetupStep, label: "Room", meta: hasRooms ? "Ready" : "Choose" },
                  { id: "openings" as RoomSetupStep, label: "Openings", meta: openingStatusLabel },
                  { id: "furnish" as RoomSetupStep, label: "Furnish", meta: furnitureStatusLabel },
                ].map((step, index) => (
                  <button
                    key={step.id}
                    type="button"
                    className={setupStageClass(step.id)}
                    onClick={() => {
                      if (!hasRooms && step.id !== "confirm") return;
                      setRoomSetupStep(step.id);
                    }}
                    disabled={!hasRooms && step.id !== "confirm"}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={
                          roomSetupActiveStep === step.id
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
                    </span>
                    <span
                      data-testid={`room-setup-step-${step.id}-meta`}
                      className={dark ? "mt-1 block truncate text-[10px] text-neutral-400" : "mt-1 block truncate text-[10px] text-neutral-500"}
                    >
                      {step.meta}
                    </span>
                  </button>
                ))}
              </div>

              {hasRooms && (
                <div
                  data-testid="consumer-plan-next-steps"
                  className={dark ? "mt-2 text-xs text-neutral-300" : "mt-2 text-xs text-neutral-600"}
                >
                  {consumerPlanNextSteps}
                </div>
              )}

              {hasRooms && (
                <button
                  type="button"
                  data-testid="plan-open-templates"
                  className={`${progressSecondaryActionClass} mt-3 min-h-10 w-full`}
                  disabled={!canEdit}
                  onClick={() => {
                    setRoomSetupStep("confirm");
                    setPlanStartMode("template");
                  }}
                >
                  Templates
                </button>
              )}

              {roomSetupActiveStep === "start" && (
                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    data-testid="plan-start-template"
                    className={planStartButtonClass("template")}
                    disabled={!canEdit}
                    onClick={() => {
                      setRoomSetupStep("confirm");
                      setPlanStartMode("template");
                    }}
                  >
                    Use template
                  </button>
                  <button
                    type="button"
                    data-testid="plan-start-draw"
                    className={planStartButtonClass("draw")}
                    disabled={!canEdit}
                    onClick={startDrawRoomSetup}
                  >
                    Draw room
                  </button>
                  <button
                    type="button"
                    data-testid="plan-start-upload"
                    className={planStartButtonClass("upload")}
                    disabled={!canEdit}
                    onClick={() => {
                      setRoomSetupStep("confirm");
                      setPlanStartMode("upload");
                    }}
                  >
                    Upload plan
                  </button>
                  {!hasRooms && (
                    <div
                      data-testid="guided-room-start"
                      className={
                        dark
                          ? "rounded-lg border border-white/10 bg-white/5 p-3"
                          : "rounded-lg border border-neutral-200 bg-white p-3"
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
                      <button
                        type="button"
                        data-testid="guided-create-room"
                        className={`${progressActionClass} mt-3 min-h-11 w-full text-sm`}
                        disabled={!canEdit}
                        onClick={() => {
                          onNewRoomShapeChange("rectangle");
                          onAddDesignerRoom();
                          setRoomSetupStep("confirm");
                        }}
                      >
                        Create {roomTypeLabel.toLowerCase()}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {roomSetupActiveStep === "confirm" && hasRooms && (
                <div data-testid="room-setup-confirm-room" className="mt-3 grid gap-2">
                  <div className={progressRowClass}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className={progressLabelClass}>{activeRoomName}</div>
                        <div className={progressMetaClass}>
                          {activeRoomTypeLabel} · {roomWidth.toFixed(1)} x {roomDepth.toFixed(1)}m · {activeFloorMaterial.name}
                        </div>
                      </div>
                      <span className={progressReadyClass}>{activeRoomArea.toFixed(0)} m2</span>
                    </div>
                  </div>
                  <details data-testid="plan-measurements-panel">
                    <summary
                      className={
                        dark
                          ? "cursor-pointer text-xs font-semibold text-neutral-300"
                          : "cursor-pointer text-xs font-semibold text-neutral-600"
                      }
                    >
                      Size and finish
                    </summary>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className={consumerFieldLabelClass}>
                        Width
                        <span className={consumerInputShellClass}>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={ROOM_DIMENSION_DEFAULTS.min}
                            max={ROOM_DIMENSION_DEFAULTS.max}
                            step={0.1}
                            value={roomWidthInput}
                            onChange={(event) => onRoomWidthInputChange(event.target.value)}
                            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                            disabled={!canEdit}
                          />
                          <span className={dark ? "text-xs text-neutral-400" : "text-xs text-neutral-500"}>m</span>
                        </span>
                      </label>
                      <label className={consumerFieldLabelClass}>
                        Depth
                        <span className={consumerInputShellClass}>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={ROOM_DIMENSION_DEFAULTS.min}
                            max={ROOM_DIMENSION_DEFAULTS.max}
                            step={0.1}
                            value={roomDepthInput}
                            onChange={(event) => onRoomDepthInputChange(event.target.value)}
                            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                            disabled={!canEdit}
                          />
                          <span className={dark ? "text-xs text-neutral-400" : "text-xs text-neutral-500"}>m</span>
                        </span>
                      </label>
                    </div>
                    <button
                      type="button"
                      className={`${progressSecondaryActionClass} mt-2 min-h-10 w-full`}
                      onClick={onApplyRoomSize}
                      disabled={!canEdit}
                    >
                      Apply size
                    </button>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {recommendedFloorMaterials.slice(0, 2).map((material) => (
                        <button
                          key={material.id}
                          type="button"
                          className={floorMaterialButtonClass(material.id)}
                          disabled={!canEdit}
                          onClick={() => onApplyFloorMaterialToRoom(material.id)}
                        >
                          <span
                            className="h-8 w-8 shrink-0 rounded-md border border-black/10"
                            style={getFloorMaterialSwatchStyle(material)}
                          />
                          <span className="min-w-0 text-left">
                            <span className="block truncate">{material.name}</span>
                            <span className={floorMaterialMetaClass}>{material.category}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </details>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      data-testid="plan-start-template"
                      className={planStartButtonClass("template")}
                      disabled={!canEdit}
                      onClick={() => {
                        setRoomSetupStep("confirm");
                        setPlanStartMode("template");
                      }}
                    >
                      Template
                    </button>
                    <button
                      type="button"
                      data-testid="plan-start-draw"
                      className={planStartButtonClass("draw")}
                      disabled={!canEdit}
                      onClick={startDrawRoomSetup}
                    >
                      Draw
                    </button>
                    <button
                      type="button"
                      data-testid="plan-start-upload"
                      className={planStartButtonClass("upload")}
                      disabled={!canEdit}
                      onClick={() => {
                        setRoomSetupStep("confirm");
                        setPlanStartMode("upload");
                      }}
                    >
                      Upload
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={`${progressActionClass} min-h-10`}
                      onClick={() => setRoomSetupStep("openings")}
                      disabled={!canEdit}
                    >
                      Looks good
                    </button>
                    <button
                      type="button"
                      className={`${progressSecondaryActionClass} min-h-10`}
                      onClick={startDrawRoomSetup}
                      disabled={!canEdit}
                    >
                      Redraw
                    </button>
                  </div>
                </div>
              )}

              {roomSetupActiveStep === "openings" && hasRooms && (
                <div data-testid="room-setup-openings" className="mt-3 grid gap-2">
                  <div className={progressRowClass}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className={progressLabelClass}>Doors and windows</div>
                        <div className={progressMetaClass}>
                          {hasConnectionBlockers ? "Add a doorway where rooms connect." : "Add openings now or keep furnishing simple."}
                        </div>
                      </div>
                      <span className={hasConnectionBlockers ? progressTodoClass : progressReadyClass}>
                        {openingStatusLabel}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={`${progressActionClass} min-h-10`}
                      onClick={() => onAddFloorPlanOpeningFromTool("door")}
                      disabled={!canEdit}
                    >
                      Add door
                    </button>
                    <button
                      type="button"
                      className={`${progressSecondaryActionClass} min-h-10`}
                      onClick={() => onAddFloorPlanOpeningFromTool("window")}
                      disabled={!canEdit}
                    >
                      Add window
                    </button>
                  </div>
                  <button
                    type="button"
                    className={`${progressSecondaryActionClass} min-h-10 w-full`}
                    onClick={() => setRoomSetupStep("furnish")}
                    disabled={hasConnectionBlockers}
                  >
                    {hasOpenings ? "Continue" : "Skip for now"}
                  </button>
                </div>
              )}

              {roomSetupActiveStep === "furnish" && hasRooms && (
                <div data-testid="room-setup-furnish" className="mt-3 grid gap-2">
                  <div className={progressRowClass}>
                    <div className={progressLabelClass}>Ready to furnish</div>
                    <div className={progressMetaClass}>
                      {hasOpenings ? `${planOpeningCount} opening${planOpeningCount === 1 ? "" : "s"} placed.` : "You can add doors or windows later."}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`${progressActionClass} min-h-11 w-full text-sm`}
                    onClick={onGoFurnish}
                    disabled={!canEdit}
                  >
                    Start furnishing
                  </button>
                  {aiDesignEnabled && (
                    <button
                      type="button"
                      className={`${progressSecondaryActionClass} min-h-10 w-full`}
                      onClick={onGoAiDesign}
                      disabled={!canEdit}
                    >
                      Ask AI for a starter layout
                    </button>
                  )}
                </div>
              )}

              {roomSetupActiveStep === "done" && (
                <div data-testid="room-setup-complete" className="mt-3 grid gap-2">
                  <div className={progressRowClass}>
                    <div className={progressLabelClass}>Setup complete</div>
                    <div className={progressMetaClass}>{planItemCount} item{planItemCount === 1 ? "" : "s"} placed.</div>
                  </div>
                  <button
                    type="button"
                    className={`${progressSecondaryActionClass} min-h-10 w-full`}
                    onClick={onGoShop}
                  >
                    Review shop list
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {showStartPanel && (
        <div
          className={
            dark
              ? "mb-2 rounded-lg border border-white/10 bg-[#151820] p-2.5"
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
                onClick={() => setPlanStartMode("start")}
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
                  ? "mt-3 rounded-lg border border-white/10 bg-white/5 p-3"
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
                <label className={consumerFieldLabelClass}>
                  Width
                  <span className={consumerInputShellClass}>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={ROOM_DIMENSION_DEFAULTS.min}
                      max={ROOM_DIMENSION_DEFAULTS.max}
                      step={0.1}
                      value={roomWidthInput}
                      onChange={(event) => onRoomWidthInputChange(event.target.value)}
                      onBlur={() => {
                        if (roomWidthInput === "") {
                          onRoomWidthInputChange(roomWidth.toFixed(2));
                        }
                      }}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      disabled={!canEdit}
                    />
                    <span className={dark ? "text-xs text-neutral-400" : "text-xs text-neutral-500"}>m</span>
                  </span>
                </label>
                <label className={consumerFieldLabelClass}>
                  Depth
                  <span className={consumerInputShellClass}>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={ROOM_DIMENSION_DEFAULTS.min}
                      max={ROOM_DIMENSION_DEFAULTS.max}
                      step={0.1}
                      value={roomDepthInput}
                      onChange={(event) => onRoomDepthInputChange(event.target.value)}
                      onBlur={() => {
                        if (roomDepthInput === "") {
                          onRoomDepthInputChange(roomDepth.toFixed(2));
                        }
                      }}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      disabled={!canEdit}
                    />
                    <span className={dark ? "text-xs text-neutral-400" : "text-xs text-neutral-500"}>m</span>
                  </span>
                </label>
              </div>

              <button
                type="button"
                data-testid="guided-create-room"
                className={`${progressActionClass} mt-3 min-h-11 w-full text-sm`}
                disabled={!canEdit}
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
                onClick={() => setPlanStartMode("upload")}
              >
                Upload plan
              </button>
              <button
                type="button"
                data-testid="plan-start-template"
                className={planStartButtonClass("template")}
                disabled={!canEdit}
                onClick={() => setPlanStartMode("template")}
              >
                Use template
              </button>
            </div>
          </details>

          {planStartMode === "upload" && !floorPlanUnderlay && (
            <div
              className={
                dark
                  ? "mt-3 rounded-lg bg-white/5 p-3 text-xs text-neutral-300"
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
                  ? "mt-3 rounded-lg bg-white/5 p-3 text-xs text-neutral-300"
                  : "mt-3 rounded-lg bg-white p-3 text-xs text-neutral-600"
              }
            >
              Pick a starter plan below. Resize rooms and add doors when ready.
            </div>
          )}
        </div>
      )}
      {showPlanProgressPanel && (
        <div data-testid="plan-measurements-panel" className={progressCardClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={titleClass}>Plan progress</div>
              <div className={progressMetaClass}>{activeRoomName}</div>
            </div>
            <span
              className={
                viewMode === "2d"
                  ? progressReadyClass
                  : progressTodoClass
              }
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
                        ? "rounded-lg border border-white/10 bg-white/5 px-2 py-2"
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
                      ? "flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-2"
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
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={titleClass}>
                {visiblePlanOpening
                  ? visiblePlanOpening.kind === "door"
                    ? "Selected door"
                    : "Selected window"
                  : "Selected room"}
              </div>
              <div className={progressMetaClass}>
                {visiblePlanOpening
                  ? `${visiblePlanOpeningRoomName} · ${(visiblePlanOpening.widthMm / 1000).toFixed(2)}m wide`
                  : `${activeRoomName} · ${activeRoomTypeLabel}`}
              </div>
            </div>
            {!visiblePlanOpening && (
              <span className={progressReadyClass}>
                {roomWidth.toFixed(1)} x {roomDepth.toFixed(1)}m
              </span>
            )}
          </div>

          {!visiblePlanOpening && (
            <details className="mt-2">
              <summary
                className={
                  dark
                    ? "cursor-pointer text-xs font-semibold text-neutral-300"
                    : "cursor-pointer text-xs font-semibold text-neutral-600"
                }
              >
                Edit room size
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className={consumerFieldLabelClass}>
                  Width
                  <span className={consumerInputShellClass}>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={ROOM_DIMENSION_DEFAULTS.min}
                      max={ROOM_DIMENSION_DEFAULTS.max}
                      step={0.1}
                      value={roomWidthInput}
                      onChange={(event) => onRoomWidthInputChange(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      disabled={!canEdit}
                    />
                    <span className={dark ? "text-xs text-neutral-400" : "text-xs text-neutral-500"}>m</span>
                  </span>
                </label>
                <label className={consumerFieldLabelClass}>
                  Depth
                  <span className={consumerInputShellClass}>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={ROOM_DIMENSION_DEFAULTS.min}
                      max={ROOM_DIMENSION_DEFAULTS.max}
                      step={0.1}
                      value={roomDepthInput}
                      onChange={(event) => onRoomDepthInputChange(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      disabled={!canEdit}
                    />
                    <span className={dark ? "text-xs text-neutral-400" : "text-xs text-neutral-500"}>m</span>
                  </span>
                </label>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`${progressSecondaryActionClass} min-h-10`}
                  onClick={onApplyRoomSize}
                  disabled={!canEdit}
                >
                  Apply size
                </button>
                <button
                  type="button"
                  className={`${progressSecondaryActionClass} min-h-10`}
                  onClick={() => onApplyFloorMaterialToAllRooms(activeFloorMaterial.id)}
                  disabled={!canEdit}
                >
                  Match finish
                </button>
              </div>
            </details>
          )}

          {visiblePlanOpening && (
            <div className="mt-3">
              <PlanOpeningInspector
                opening={visiblePlanOpening}
                roomName={visiblePlanOpeningRoomName}
                wallSpanMeters={visiblePlanOpeningWallSpanMeters}
                dark={dark}
                onChange={onUpdateOpeningMetrics}
              />
            </div>
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
                    ? "grid grid-cols-2 rounded-lg border border-white/10 bg-white/5 p-1"
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
                  className={
                    !simplePlanControls
                      ? progressActionClass
                      : "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-neutral-600 hover:bg-white dark:text-neutral-300 dark:hover:bg-white/10"
                  }
                  onClick={() => onSimplePlanControlsChange(false)}
                >
                  Pro
                </button>
              </div>
            </div>
          </div>
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
                ? "mt-3 grid gap-1.5 rounded-lg border border-white/10 bg-white/5 p-2"
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
                ? "mt-2 flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs"
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
              <label className="grid grid-cols-[1fr_7rem] items-center gap-3">
                <span className={floorFieldLabelClass}>Room height</span>
                <span className="relative">
                  <input
                    type="number"
                    min="2000"
                    max="6000"
                    step="10"
                    value={activeRoomHeightMm}
                    disabled={!canEdit}
                    className={`${floorInputClass} pr-9`}
                    onChange={(event) =>
                      onActiveRoomHeightMmChange(Number(event.currentTarget.value))
                    }
                  />
                  <span className={dark ? "pointer-events-none absolute right-2 top-2 text-xs text-neutral-400" : "pointer-events-none absolute right-2 top-2 text-xs text-neutral-500"}>
                    mm
                  </span>
                </span>
              </label>
              <label className="grid grid-cols-[1fr_7rem] items-center gap-3">
                <span className={floorFieldLabelClass}>Wall thickness</span>
                <span className="relative">
                  <input
                    type="number"
                    min="40"
                    max="800"
                    step="5"
                    value={activeRoomWallThicknessMm}
                    disabled={!canEdit}
                    className={`${floorInputClass} pr-9`}
                    onChange={(event) =>
                      onActiveRoomWallThicknessMmChange(Number(event.currentTarget.value))
                    }
                  />
                  <span className={dark ? "pointer-events-none absolute right-2 top-2 text-xs text-neutral-400" : "pointer-events-none absolute right-2 top-2 text-xs text-neutral-500"}>
                    mm
                  </span>
                </span>
              </label>
              <label className="grid grid-cols-[1fr_7rem] items-center gap-3">
                <span className={floorFieldLabelClass}>Slab thickness</span>
                <span className="relative">
                  <input
                    type="number"
                    min="10"
                    max="600"
                    step="5"
                    value={activeRoomSlabThicknessMm}
                    disabled={!canEdit}
                    className={`${floorInputClass} pr-9`}
                    onChange={(event) =>
                      onActiveRoomSlabThicknessMmChange(Number(event.currentTarget.value))
                    }
                  />
                  <span className={dark ? "pointer-events-none absolute right-2 top-2 text-xs text-neutral-400" : "pointer-events-none absolute right-2 top-2 text-xs text-neutral-500"}>
                    mm
                  </span>
                </span>
              </label>
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
                {activeFloorMaterial.name} in {activeRoomName}.
              </div>
            </div>
            <button
              type="button"
              className={progressSecondaryActionClass}
              disabled={!canEdit}
              onClick={() => onApplyFloorMaterialToAllRooms(activeFloorMaterial.id)}
            >
              Apply all
            </button>
          </div>
          <details className="mt-2">
            <summary
              className={
                dark
                  ? "cursor-pointer text-xs font-semibold text-neutral-300"
                  : "cursor-pointer text-xs font-semibold text-neutral-600"
              }
            >
              Choose finish
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {recommendedFloorMaterials.map((material) => (
                <button
                  key={material.id}
                  type="button"
                  className={floorMaterialButtonClass(material.id)}
                  disabled={!canEdit}
                  onClick={() => onApplyFloorMaterialToRoom(material.id)}
                >
                  <span
                    className="h-8 w-8 shrink-0 rounded-md border border-black/10"
                    style={getFloorMaterialSwatchStyle(material)}
                  />
                  <span className="min-w-0 text-left">
                    <span className="block truncate">{material.name}</span>
                    <span className={floorMaterialMetaClass}>{material.category}</span>
                  </span>
                </button>
              ))}
              {FLOOR_MATERIALS.filter((material) => !recommendedFloorMaterialIds.has(material.id)).map((material) => (
                <button
                  key={material.id}
                  type="button"
                  className={floorMaterialButtonClass(material.id)}
                  disabled={!canEdit}
                  onClick={() => onApplyFloorMaterialToRoom(material.id)}
                >
                  <span
                    className="h-8 w-8 shrink-0 rounded-md border border-black/10"
                    style={getFloorMaterialSwatchStyle(material)}
                  />
                  <span className="min-w-0 text-left">
                    <span className="block truncate">{material.name}</span>
                    <span className={floorMaterialMetaClass}>{material.category}</span>
                  </span>
                </button>
              ))}
            </div>
            <div
              className={
                dark
                  ? "mt-3 rounded-xl border border-white/10 bg-white/5 p-3"
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
          </details>
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
                  ? "min-w-28 rounded-lg border border-white/15 bg-[#10131a] px-2 py-2 text-sm text-neutral-100"
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
          onUpload={onFloorPlanUpload}
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
            onAddDoorway={onAddSuggestedDoorway}
          />
        </div>
      )}
      {!isDesigner && showTemplatePicker && (
        <div
          className={
            dark
              ? "mt-3 rounded-xl border border-white/10 bg-[#151820] p-3"
              : "mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3"
          }
        >
          <div className={titleClass}>Starter floor plans</div>
          <div className={dark ? "mt-1 text-xs text-neutral-400" : "mt-1 text-xs text-neutral-500"}>
            Pick a real-life layout pattern. Doorways are added automatically.
          </div>
          <div className="mt-3 grid gap-2">
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
                  className={
                    templateBedroomFilter === value
                      ? progressActionClass
                      : progressSecondaryActionClass
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1" data-testid="template-footprint-filter">
              {[
                ["all", "Any"],
                ["compact", "Compact"],
                ["narrow", "Narrow"],
                ["wide", "Wide+"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTemplateFootprintFilter(value as typeof templateFootprintFilter)}
                  className={
                    templateFootprintFilter === value
                      ? progressActionClass
                      : progressSecondaryActionClass
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1" data-testid="template-style-filter">
              {[
                ["all", "Any"],
                ["open", "Open"],
                ["separated", "Rooms"],
                ["adu", "ADU"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTemplateStyleFilter(value as typeof templateStyleFilter)}
                  className={
                    templateStyleFilter === value
                      ? progressActionClass
                      : progressSecondaryActionClass
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 grid gap-2">
            {filteredPlanTemplates.map((template) => {
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
                      ? "grid grid-cols-[7rem_minmax(0,1fr)] gap-3 rounded-lg border border-white/10 bg-[#1b2030] px-3 py-2 text-left text-sm font-medium text-neutral-100"
                      : "grid grid-cols-[7rem_minmax(0,1fr)] gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm font-medium text-neutral-800 shadow-sm"
                  }
                >
                  <span
                    className={
                      dark
                        ? "block overflow-hidden rounded-md border border-white/10 bg-[#10131b]"
                        : "block overflow-hidden rounded-md border border-neutral-200 bg-neutral-50"
                    }
                    aria-hidden="true"
                  >
                    <svg
                      data-testid={`plan-template-preview-${template.id}`}
                      viewBox={`0 0 ${previewWidth} ${previewHeight}`}
                      className="h-[74px] w-full"
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
                        {template.rooms.length} rooms · {Math.round(areaSqm)} m2
                      </span>
                    </span>
                    <span className={dark ? "mt-0.5 block text-xs text-neutral-400" : "mt-0.5 block text-xs text-neutral-500"}>
                      {template.summary}
                    </span>
                    <span className={dark ? "mt-1 block text-[11px] font-semibold text-emerald-200" : "mt-1 block text-[11px] font-semibold text-emerald-700"}>
                      Best for: {template.bestFor}
                    </span>
                    <span
                      className={
                        dark
                          ? "mt-1 block truncate text-[11px] text-neutral-500"
                          : "mt-1 block truncate text-[11px] text-neutral-500"
                      }
                    >
                      {roomPreview}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {template.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className={dark ? "rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-neutral-300" : "rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600"}
                        >
                          {tag}
                        </span>
                      ))}
                      <span className={dark ? "rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-neutral-300" : "rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600"}>
                        {template.doorways.length} doors
                      </span>
                    </span>
                    <span className={dark ? "mt-1 block truncate text-[11px] text-neutral-400" : "mt-1 block truncate text-[11px] text-neutral-500"}>
                      Zones: {template.zones.slice(0, 3).join(" · ")}
                    </span>
                    <span className="mt-2 grid grid-cols-2 gap-2">
                      <button
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
                        Plan only
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
                        Furnished · {furnishedItemCount} items
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
                    ? "rounded-lg bg-[#1b2030] px-3 py-2 text-left text-sm font-medium text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
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
              ? "mt-3 rounded-xl border border-white/10 bg-[#151820] p-3"
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
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
              Width
              <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-1">
                <input
                  type="number"
                  inputMode="decimal"
                  min={ROOM_DIMENSION_DEFAULTS.min}
                  max={ROOM_DIMENSION_DEFAULTS.max}
                  step={0.1}
                  value={roomWidthInput}
                  onChange={(event) => onRoomWidthInputChange(event.target.value)}
                  onBlur={() => {
                    if (roomWidthInput === "") {
                      onRoomWidthInputChange(roomWidth.toFixed(2));
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent text-xs text-neutral-900 outline-none"
                  disabled={!canEdit}
                  placeholder="Width"
                />
                <span className="text-xs text-neutral-500">m</span>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
              Depth
              <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-1">
                <input
                  type="number"
                  inputMode="decimal"
                  min={ROOM_DIMENSION_DEFAULTS.min}
                  max={ROOM_DIMENSION_DEFAULTS.max}
                  step={0.1}
                  value={roomDepthInput}
                  onChange={(event) => onRoomDepthInputChange(event.target.value)}
                  onBlur={() => {
                    if (roomDepthInput === "") {
                      onRoomDepthInputChange(roomDepth.toFixed(2));
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent text-xs text-neutral-900 outline-none"
                  disabled={!canEdit}
                  placeholder="Depth"
                />
                <span className="text-xs text-neutral-500">m</span>
              </div>
            </label>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onApplyRoomSize}
              disabled={!canEdit}
              title="Apply room dimensions"
            >
              Apply size
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onAddDesignerRoom}
              disabled={!canEdit}
            >
              Add room
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
