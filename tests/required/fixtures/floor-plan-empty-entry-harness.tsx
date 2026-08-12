import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import DesignControlsPlanPanel, { type PlanStartMode } from "@/components/editor/DesignControlsPlanPanel";
import FloorPlanUploadPanel from "@/components/editor/FloorPlanUploadPanel";
import {
  EmptyFloorPlanProUploadAction,
  EmptyFloorPlanSurfacesActions,
} from "@/components/editor/design-controls-plan/EmptyFloorPlanSurfacesActions";
import type { DesignControlsPlanPanelProps } from "@/components/editor/design-controls-plan/DesignControlsPlanPanel.types";

const noop = () => undefined;

function buildEmptyPlanProps(
  planStartMode: PlanStartMode,
  onPlanStartModeChange: (mode: PlanStartMode) => void
): DesignControlsPlanPanelProps {
  return {
    floorPlanLifecycleIdentity: {
      authScopeKey: "ch0015i-empty-plan-user",
      currentDesignId: null,
      subscriptionPlan: "pro",
    },
    dark: false,
    isClientPreview: false,
    isDesigner: true,
    canEdit: true,
    canEditPlanGeometry: true,
    viewMode: "2d",
    snapEnabled: true,
    newRoomType: "living",
    newRoomShape: "rectangle",
    activeRoomPresetId: "medium",
    roomWidthInput: "5.00",
    roomDepthInput: "4.00",
    roomWidth: 5,
    roomDepth: 4,
    measurementUnit: "mm",
    floorPlanUnderlay: null,
    floorPlanCalibrationMode: false,
    floorPlanCalibrationPointCount: 0,
    floorPlanCalibrationDistanceInput: "",
    floorPlanCalibrationSummary: null,
    floorPlanTraceRoomMode: false,
    floorPlanDrawRoomMode: "rectangle_wall",
    floorPlanDrawAngleLockMode: "ortho",
    floorPlanExactWallLengthInput: "",
    floorPlanTraceRoomPointCount: 0,
    floorPlanTraceRoomType: "living",
    floorPlanTraceOpeningMode: false,
    floorPlanTraceOpeningPointCount: 0,
    floorPlanTraceOpeningKind: "door",
    canTraceOpenings: false,
    floorPlanPdfSourceReady: false,
    floorPlanPdfRenderingPage: null,
    roomConnectionChecklistItems: [],
    visiblePlanOpening: null,
    visiblePlanOpeningRoomName: "",
    visiblePlanOpeningWallSpanMeters: 0,
    visiblePlanOpeningMaxHeightMeters: 0,
    planRoomCount: 0,
    planItemCount: 0,
    planOpeningCount: 0,
    activeRoomName: "Empty plan",
    activeRoomId: "",
    activeRoomType: "living",
    activeSurfaceTarget: "floor",
    surfaceBrushActive: false,
    surfaceRooms: [],
    floorOptions: [{ level: 1, label: "1F", roomCount: 0 }],
    activeFloorLevel: 1,
    activeFloorRoomCount: 0,
    activeRoomHeightMm: 2600,
    activeRoomWallThicknessMm: 120,
    activeRoomSlabThicknessMm: 100,
    activeRoomBaseboardDepthMm: 0,
    activeRoomWallOpacity: 1,
    activeRoomFloorOpacity: 1,
    activeRoomCeilingOpacity: 1,
    activeRoomCeilingVisible: true,
    activeRoomCeilingColor: "#ffffff",
    stackedFloorView: false,
    activeFloorPlanTool: "select",
    simplePlanControls: true,
    planGuidedActionsEnabled: true,
    planStartMode,
    onPlanStartModeChange,
    onSimplePlanControlsChange: noop,
    onPlanGuidedActionsEnabledChange: noop,
    onSelectFloorPlanTool: noop,
    onDrawFloorPlanRoom: noop,
    onAddFloorPlanOpeningFromTool: noop,
    onGoFurnish: noop,
    onGoAiDesign: noop,
    onGoShop: noop,
    onApplyPlanTemplate: noop,
    onAddDesignerRoom: noop,
    onAddRoomTemplate: noop,
    onSelectRoom: noop,
    onApplyFloorMaterialToRoom: noop,
    onApplyFloorMaterialToAllRooms: noop,
    onRotateActiveFloorMaterial: noop,
    onResetActiveFloorMaterialPattern: noop,
    onActiveFloorMaterialScaleChange: noop,
    onActiveFloorSurfaceSettingsChange: noop,
    onSurfaceTargetChange: noop,
    onSurfaceBrushActiveChange: noop,
    onSurfaceMaterialSelected: noop,
    onSurfacePaintSelected: noop,
    onApplyWallMaterialToRoom: noop,
    onApplyWallMaterialToAllRooms: noop,
    onApplyWallPaintToRoom: noop,
    onApplyWallPaintToAllRooms: noop,
    onApplyCeilingPaintToRoom: noop,
    onApplyCeilingPaintToAllRooms: noop,
    onActiveWallSurfaceSettingsChange: noop,
    onResetActiveWallSurface: noop,
    onResetActiveCeilingSurface: noop,
    onNewRoomTypeChange: noop,
    onNewRoomShapeChange: noop,
    onRoomPresetChange: noop,
    onRoomWidthInputChange: noop,
    onRoomDepthInputChange: noop,
    onMeasurementUnitChange: noop,
    onCommitRoomDimension: noop,
    onActiveRoomHeightMmChange: noop,
    onActiveRoomWallThicknessMmChange: noop,
    onActiveRoomSlabThicknessMmChange: noop,
    onActiveRoomBaseboardDepthMmChange: noop,
    onActiveRoomSurfaceOpacityChange: noop,
    onActiveRoomCeilingVisibleChange: noop,
    onActiveRoomCeilingColorChange: noop,
    onFloorPlanUpload: noop,
    onFloorPlanPdfPageChange: noop,
    onFloorPlanOpacityChange: noop,
    onFloorPlanLockChange: noop,
    onFloorPlanCalibrationModeChange: noop,
    onFloorPlanCalibrationDistanceChange: noop,
    onApplyFloorPlanCalibration: noop,
    onResetFloorPlanCalibrationPoints: noop,
    onFloorPlanTraceRoomModeChange: noop,
    onFloorPlanTraceRoomDrawModeChange: noop,
    onFloorPlanDrawAngleLockModeChange: noop,
    onFloorPlanExactWallLengthInputChange: noop,
    onApplyFloorPlanExactWallLength: noop,
    onFloorPlanTraceRoomTypeChange: noop,
    onUndoFloorPlanTraceRoomPoint: noop,
    onResetFloorPlanTraceRoomPoints: noop,
    onFloorPlanTraceOpeningModeChange: noop,
    onFloorPlanTraceOpeningKindChange: noop,
    onResetFloorPlanTraceOpeningPoints: noop,
    onClearFloorPlan: noop,
    onAddSuggestedDoorway: noop,
    onUpdateOpeningMetrics: noop,
  };
}

function useCompactLayout() {
  const [compact, setCompact] = useState(window.innerWidth < 700);
  useEffect(() => {
    const update = () => setCompact(window.innerWidth < 700);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return compact;
}

function ResponsiveProEntryHarness() {
  const compact = useCompactLayout();
  const [planStartMode, setPlanStartMode] = useState<PlanStartMode>("start");
  return (
    <main
      data-testid="floor-plan-empty-entry-harness"
      data-selected-mode={planStartMode}
    >
      <h1>Responsive production Pro entry fixture</h1>
      <section data-testid="floor-plan-empty-pro-entry">
        <EmptyFloorPlanProUploadAction
          key={compact ? "compact" : "wide"}
          isDesigner
          canEdit
          className="fixture-action"
          onSelectUploadMode={() => setPlanStartMode("upload")}
        />
      </section>
      <FloorPlanUploadPanel
        lifecycleIdentity={{
          authScopeKey: "ch0015i-responsive-user",
          currentDesignId: null,
          subscriptionPlan: "pro",
        }}
        isDesigner
        canEdit
        planRoomCount={0}
        activeRoomId=""
        underlay={null}
        onOpacityChange={noop}
        onLockChange={noop}
        onClear={noop}
      />
    </main>
  );
}

function EmptyPlanEntryHarness() {
  const [planStartMode, setPlanStartMode] = useState<PlanStartMode>("start");
  const [surfaceActivationCount, setSurfaceActivationCount] = useState(0);

  return (
    <main
      data-testid="floor-plan-empty-entry-harness"
      data-selected-mode={planStartMode}
      data-surface-activation-count={surfaceActivationCount}
    >
      <h1>Empty-plan production entry fixture</h1>
      <section data-testid="floor-plan-empty-pro-entry">
        <DesignControlsPlanPanel
          {...buildEmptyPlanProps(planStartMode, setPlanStartMode)}
        />
      </section>
      <section data-testid="floor-plan-empty-surfaces-entry">
        <EmptyFloorPlanSurfacesActions
          dark={false}
          isDesigner
          progressActionClass="fixture-action"
          progressSecondaryActionClass="fixture-action"
          progressMetaClass="fixture-meta"
          onOpenTemplatePicker={noop}
          onStartDrawRoomSetup={noop}
          onSelectUploadMode={() => {
            setPlanStartMode("upload");
            setSurfaceActivationCount((count) => count + 1);
          }}
          onAddDesignerRoom={noop}
        />
      </section>
    </main>
  );
}

const style = document.createElement("style");
style.textContent = `
  html, body { margin: 0; min-height: 100%; font-family: system-ui, sans-serif; }
  button, input, summary { font: inherit; }
  button { min-height: 32px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
  [data-testid="floor-plan-empty-entry-harness"] { display: grid; gap: 16px; padding: 16px; }
  [data-testid="floor-plan-empty-pro-entry"] { max-height: 640px; overflow: auto; }
  [data-testid="floor-plan-empty-surfaces-entry"] { border: 1px solid #ddd; padding: 12px; }
  [data-floor-plan-import-backdrop="true"] { position: fixed; inset: 0; z-index: 1000; display: flex; background: rgba(0,0,0,.6); }
  [data-testid="floor-plan-import-dialog-panel"] { width: 100%; height: 100vh; overflow: auto; background: white; }
  @media (min-width: 700px) {
    [data-testid="floor-plan-import-dialog-panel"] { width: calc(100% - 32px); height: calc(100vh - 32px); margin: 16px; }
  }
`;
document.head.append(style);

const host = document.createElement("div");
document.body.append(host);
createRoot(host).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).get("fixture") === "responsive" ? (
      <ResponsiveProEntryHarness />
    ) : (
      <EmptyPlanEntryHarness />
    )}
  </StrictMode>
);
