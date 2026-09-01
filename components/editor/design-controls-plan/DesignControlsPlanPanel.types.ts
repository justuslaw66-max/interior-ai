import type {
  HousePlanTemplate,
  HousePlanTemplateApplyOptions,
  HouseRoomConnectionChecklistItem,
  HouseRoomDoorwaySuggestion,
  HouseRoomTemplateId,
  RoomSizePresetId,
} from "@/lib/design-page-house-plan";
import type { DesignPageOpeningMetricsPatch } from "@/lib/design-page-opening-metrics";
import type { FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanConsumerMeasurementEvidenceV2 } from "@/lib/floor-plan-measured-property-mutations";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import type { RoomOpening2D } from "@/lib/editorScene";
import type {
  FloorPlanQualityAction,
  FloorPlanQualityIssue,
  FloorPlanQualityReport,
} from "@/lib/floor-plan-quality";
import type {
  FloorPlanDrawAngleLockMode,
  FloorPlanDrawRoomMode,
  FloorPlanUnderlay,
} from "@/lib/floor-plan-types";
import type { RoomFloorPattern, RoomPlanShape, RoomType } from "@/lib/room-types";
import type {
  FloorSurfacePatch,
  NormalizedSurfaceSettings,
  SurfaceSettingsPatch,
} from "@/lib/surface-settings";
import type { EditorViewMode } from "../EditorViewToggle";
import type { FloorPlanTool } from "../FloorPlanToolStrip";
import type {
  SurfaceRoomSummary,
  SurfaceTargetMode,
} from "./surfaceCatalog";

export type PlanStartMode = "start" | "draw" | "upload" | "template";
export type FloorPlanLifecycleIdentity = {
  authScopeKey: string;
  currentDesignId: string | null;
  subscriptionPlan: string;
};

type HouseRoomTemplate = {
  id: HouseRoomTemplateId;
  label: string;
  roomType: RoomType;
  shape: RoomPlanShape;
  width: number;
  depth: number;
};

export type DesignControlsPlanPanelProps = {
  floorPlanLifecycleIdentity: FloorPlanLifecycleIdentity;
  dark: boolean;
  isClientPreview: boolean;
  isDesigner: boolean;
  canEdit: boolean;
  canEditPlanGeometry: boolean;
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
  measurementUnit: PlanMeasurementUnit; measurementUnitReady: boolean;
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
  visiblePlanOpeningMaxHeightMeters: number;
  planRoomCount: number;
  planItemCount: number;
  planOpeningCount: number;
  activeRoomName: string;
  activeRoomId: string;
  activeRoomType: RoomType;
  activeRoomFloorMaterialId?: string;
  activeRoomFloorRotationDeg?: number;
  activeRoomFloorScale?: number;
  activeRoomFloorPattern?: RoomFloorPattern;
  activeRoomFloorPatternOffset?: { x: number; y: number };
  activeRoomFloorJointSizeMm?: number;
  activeRoomFloorJointColor?: string;
  activeSurfaceTarget: SurfaceTargetMode;
  selectedWallFaceId?: string | null;
  selectedWallLabel?: string | null;
  activeRoomWallSettings?: NormalizedSurfaceSettings;
  activeRoomSelectedWallSettings?: NormalizedSurfaceSettings;
  activeRoomCeilingSettings?: NormalizedSurfaceSettings;
  surfaceBrushActive: boolean;
  surfaceBrushMaterialId?: string | null;
  surfaceBrushPaintColorHex?: string | null;
  surfaceBrushPaintName?: string | null;
  surfaceRooms: SurfaceRoomSummary[];
  floorFinishPanelOpenSignal?: number;
  floorOptions: Array<{ level: number; label: string; roomCount: number }>;
  activeFloorLevel: number;
  activeFloorRoomCount: number;
  activeRoomHeightMm: number;
  activeRoomWallHeightEvidence?: FloorPlanPropertyEvidenceV2 | null;
  canEditActiveRoomWallHeight?: boolean;
  activeRoomWallThicknessMm: number;
  activeRoomSlabThicknessMm: number;
  activeRoomSlabThicknessEvidence?: FloorPlanPropertyEvidenceV2 | null;
  canEditActiveRoomSlabThickness?: boolean;
  activeRoomBaseboardDepthMm: number;
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
  floorPlanQualityReport?: FloorPlanQualityReport | null;
  onPlanCompletionHandled?: (id: number) => void;
  onPlanStartModeChange?: (mode: PlanStartMode) => void;
  onPlanQualityAction?: (action: FloorPlanQualityAction, issue?: FloorPlanQualityIssue) => void;
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
  onSelectRoom: (roomId: string) => void;
  onApplyFloorMaterialToRoom: (materialId: string, roomId?: string) => void;
  onApplyFloorMaterialToAllRooms: (materialId: string) => void;
  onRotateActiveFloorMaterial: () => void;
  onResetActiveFloorMaterialPattern: () => void;
  onActiveFloorMaterialScaleChange: (scale: number) => void;
  onActiveFloorSurfaceSettingsChange: (patch: FloorSurfacePatch) => void;
  onSurfaceTargetChange: (target: SurfaceTargetMode) => void;
  onSurfaceBrushActiveChange: (active: boolean) => void;
  onSurfaceMaterialSelected: (materialId: string | null) => void;
  onSurfacePaintSelected: (colorHex: string | null, name?: string | null) => void;
  onApplyWallMaterialToRoom: (materialId: string, roomId?: string, faceId?: string | null) => void;
  onApplyWallMaterialToAllRooms: (materialId: string) => void;
  onApplyWallPaintToRoom: (colorHex: string, name?: string | null, roomId?: string, faceId?: string | null) => void;
  onApplyWallPaintToAllRooms: (colorHex: string, name?: string | null) => void;
  onApplyCeilingPaintToRoom: (colorHex: string, name?: string | null, roomId?: string | null) => void;
  onApplyCeilingPaintToAllRooms: (colorHex: string, name?: string | null) => void;
  onActiveWallSurfaceSettingsChange: (patch: SurfaceSettingsPatch) => void;
  onResetActiveWallSurface: () => void;
  onResetActiveCeilingSurface: () => void;
  onNewRoomTypeChange: (roomType: RoomType) => void;
  onNewRoomShapeChange: (shape: RoomPlanShape) => void;
  onRoomPresetChange: (presetId: RoomSizePresetId) => void;
  onRoomWidthInputChange: (value: string) => void;
  onRoomDepthInputChange: (value: string) => void;
  onMeasurementUnitChange: (unit: PlanMeasurementUnit) => void;
  onCommitRoomDimension: (axis: "width" | "depth", valueMm: number) => void;
  onActiveRoomHeightMmChange: (
    valueMm: number,
    evidence?: FloorPlanConsumerMeasurementEvidenceV2,
    measurementNote?: string
  ) => void;
  onActiveRoomWallThicknessMmChange: (valueMm: number) => void;
  onActiveRoomSlabThicknessMmChange: (
    valueMm: number,
    evidence?: FloorPlanConsumerMeasurementEvidenceV2,
    measurementNote?: string
  ) => void;
  onActiveRoomBaseboardDepthMmChange: (valueMm: number) => void;
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
    metrics: DesignPageOpeningMetricsPatch
  ) => void;
};
