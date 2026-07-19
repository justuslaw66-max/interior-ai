"use client";

import { useMemo, type ComponentProps } from "react";
import { Html } from "@react-three/drei/web/Html";

import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { Plan2DViewOrientation } from "@/components/editor/camera/EditorCamera2D";
import HousePlanRenderer3D from "@/components/editor/renderers/HousePlanRenderer3D";
import PlanUnderlayRenderer2D from "@/components/editor/renderers/PlanUnderlayRenderer2D";
import RoomRenderer2D from "@/components/editor/renderers/RoomRenderer2D";
import { PlanQualityHintOverlay } from "@/components/editor/design-page/PlanQualityHintOverlay";
import { Room } from "@/components/scene/RoomEnvironment";
import {
  ROOM_DIMENSION_DEFAULTS,
  type HousePlanRoom2D,
} from "@/lib/design-page-house-plan";
import {
  mapPlanAnnotationsToRoomRenderer,
  mapPlanFixedElementsToRoomRenderer,
  mapPlanOpeningsToRoomRenderer,
} from "@/lib/design-page-plan-overlays";
import type { PlanZone2D } from "@/lib/design-page-zone-layout";
import type { EditorScene2D } from "@/lib/editorScene";
import type {
  FloorPlanDrawRoomMode,
  FloorPlanPoint,
  FloorPlanUnderlay,
} from "@/lib/floor-plan-types";
import type { FloorPlanQualityIssue } from "@/lib/floor-plan-quality";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";
import type { RendererSurfaceTarget } from "@/lib/useDesignPageSurfaceActions";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { compileCanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import { CANONICAL_ROOM_GEOMETRY_LOCK_REASON } from "@/lib/floor-plan-topology-editor";

type UnderlayRendererProps = ComponentProps<typeof PlanUnderlayRenderer2D>;
type PlanRendererProps = ComponentProps<typeof RoomRenderer2D>;
type WholeHomeRendererProps = ComponentProps<typeof HousePlanRenderer3D>;
type SingleRoomRendererProps = ComponentProps<typeof Room>;

export type DesignSceneStructureLayerState = {
  viewMode: EditorViewMode;
  plan: {
    underlay: FloorPlanUnderlay | null;
    calibration: {
      enabled: boolean;
      points: FloorPlanPoint[];
    };
    roomTrace: {
      enabled: boolean;
      interactionMode: FloorPlanDrawRoomMode;
      points: FloorPlanPoint[];
      previewPoint: FloorPlanPoint | null;
      drawOnBlankGrid: boolean;
    };
    openingTrace: {
      enabled: boolean;
      points: FloorPlanPoint[];
      kind: NonNullable<UnderlayRendererProps["traceOpeningKind"]>;
    };
    width: number;
    depth: number;
    rooms: HousePlanRoom2D[];
    activeRoomId: string | null;
    selectedOverlayId: string | null;
    suppressedDoorwaySuggestionKeys: string[];
    scene: EditorScene2D;
    zones: PlanZone2D[];
    qualityIssues: FloorPlanQualityIssue[];
    canonicalDocument: FloorPlanDocumentV2 | null;
    canonicalGeometryHash: string | null;
  };
  wholeHome: {
    enabled: boolean;
    rooms: HousePlanRoom2D[];
    activeRoomId: string;
    activeFloorLevel: number;
    wallHeight: number;
    stackedFloors: boolean;
    selectedOpeningId: string | null;
    selectedSurfaceTarget: WholeHomeRendererProps["selectedSurfaceTarget"];
  };
  singleRoom: {
    width: number;
    depth: number;
    height: number;
    wallThickness: number;
    slabThickness?: number;
    wallOpacity: number;
    floorOpacity: number;
    ceilingOpacity: number;
    ceilingVisible: boolean;
    ceilingColor: string;
  };
};

export type DesignSceneStructureLayerConfiguration = {
  editorMode: DesignPageEditorMode;
  isClientPreview: boolean;
  plan: {
    measurementUnit: NonNullable<PlanRendererProps["measurementUnit"]>;
    theme: NonNullable<PlanRendererProps["theme"]>;
    layers: {
      grid: boolean;
      dimensions: boolean;
      labels: boolean;
      openings: boolean;
      builtIns: boolean;
      annotations: boolean;
      zones: boolean;
    };
    orientation: Plan2DViewOrientation;
  };
  renderQuality: NonNullable<SingleRoomRendererProps["renderQuality"]>;
};

export type DesignSceneStructureLayerActions = {
  underlay: {
    addCalibrationPoint: NonNullable<
      UnderlayRendererProps["onCalibrationPoint"]
    >;
    addRoomTracePoint: NonNullable<
      UnderlayRendererProps["onTraceRoomPoint"]
    >;
    addOpeningTracePoint: NonNullable<
      UnderlayRendererProps["onTraceOpeningPoint"]
    >;
  };
  rooms: {
    select: NonNullable<PlanRendererProps["onSelectRoom"]>;
    selectSurfaceTarget: (target: RendererSurfaceTarget) => void;
    clearSelection: NonNullable<PlanRendererProps["onClearRoomSelection"]>;
    rename: NonNullable<PlanRendererProps["onRenameRoom"]>;
    duplicate: NonNullable<PlanRendererProps["onDuplicateRoom"]>;
    delete: NonNullable<PlanRendererProps["onDeleteRoom"]>;
    editFloor: NonNullable<PlanRendererProps["onEditFloor"]>;
    fit: NonNullable<PlanRendererProps["onFitRoom"]>;
    move: NonNullable<PlanRendererProps["onMoveRoom"]>;
    resize: NonNullable<PlanRendererProps["onResizeRoom"]>;
    setDragging: NonNullable<PlanRendererProps["onRoomDragStateChange"]>;
    setResizing: NonNullable<PlanRendererProps["onRoomResizeStateChange"]>;
  };
  overlays: {
    select: NonNullable<PlanRendererProps["onSelectOverlay"]>;
    delete: NonNullable<PlanRendererProps["onDeleteOverlay"]>;
    moveOpening: NonNullable<PlanRendererProps["onMoveOpening"]>;
    resizeOpening: NonNullable<PlanRendererProps["onResizeOpening"]>;
    addDoorwaySuggestion: NonNullable<
      PlanRendererProps["onAddDoorwaySuggestion"]
    >;
    moveFixedElement: NonNullable<PlanRendererProps["onMoveFixedElement"]>;
    moveAnnotation: NonNullable<PlanRendererProps["onMoveAnnotation"]>;
    setDragging: NonNullable<PlanRendererProps["onOverlayDragStateChange"]>;
  };
  drawing: {
    addRoomPoint: NonNullable<PlanRendererProps["onDrawRoomPoint"]>;
    previewRoomPoint: NonNullable<
      PlanRendererProps["onDrawRoomPreviewPoint"]
    >;
    commitRoomDimension: NonNullable<
      PlanRendererProps["onCommitRoomDimensionEdit"]
    >;
    commitWallSegmentLength: NonNullable<
      PlanRendererProps["onCommitWallDrawSegmentLength"]
    >;
    drawRoom: NonNullable<PlanRendererProps["onDrawRoomDrag"]>;
    addOpeningPoint: NonNullable<PlanRendererProps["onTraceOpeningPoint"]>;
  };
  wholeHome: {
    setOpeningDragging: NonNullable<
      WholeHomeRendererProps["onOpeningDragStateChange"]
    >;
  };
  reportPlanMetrics: NonNullable<
    PlanRendererProps["onPlanDebugMetricsChange"]
  >;
};

type DesignSceneStructureLayerProps = {
  state: DesignSceneStructureLayerState;
  configuration: DesignSceneStructureLayerConfiguration;
  actions: DesignSceneStructureLayerActions;
};

export function DesignSceneStructureLayer({
  state,
  configuration,
  actions,
}: DesignSceneStructureLayerProps) {
  const canonicalResolution = useMemo(() => {
    if (!state.plan.canonicalDocument) return { plan: null, error: null };
    try {
      return {
        plan: compileCanonicalFloorPlanRenderModel(
          state.plan.canonicalDocument,
          state.plan.canonicalGeometryHash
        ),
        error: null,
      };
    } catch (cause) {
      console.error("Canonical floor-plan render model rejected", cause);
      return {
        plan: null,
        error:
          cause instanceof Error
            ? cause.message
            : "Canonical floor-plan integrity check failed",
      };
    }
  }, [state.plan.canonicalDocument, state.plan.canonicalGeometryHash]);
  const canonicalPlan = canonicalResolution.plan;
  const canonicalActiveFloorId =
    canonicalPlan?.floors.find(
      (floor) => floor.levelIndex + 1 === state.wholeHome.activeFloorLevel
    )?.id ?? null;
  const canonicalStructureExpected = Boolean(state.plan.canonicalDocument);
  const canonicalIntegrityWarning = canonicalResolution.error ? (
    <Html position={[0, 0.18, 0]} center transform={false} zIndexRange={[30, 0]}>
      <div
        data-testid="canonical-floor-plan-integrity-warning"
        style={{
          border: "1px solid rgba(220,38,38,0.3)",
          borderRadius: 8,
          background: "rgba(254,242,242,0.96)",
          color: "#991b1b",
          fontSize: 11,
          fontWeight: 700,
          maxWidth: 280,
          padding: "8px 10px",
          pointerEvents: "none",
          textAlign: "center",
        }}
      >
        Floor-plan integrity check failed. Canonical walls are hidden; reload or choose an approved revision.
      </div>
    </Html>
  ) : null;
  const canonicalEditingNotice =
    canonicalPlan && configuration.editorMode !== "present" ? (
      <Html position={[0, 0.1, 0]} center transform={false} zIndexRange={[18, 0]}>
        <div
          data-testid="canonical-room-geometry-lock-reason"
          title={CANONICAL_ROOM_GEOMETRY_LOCK_REASON}
          style={{
            border: "1px solid rgba(37,99,235,0.22)",
            borderRadius: 999,
            background: "rgba(239,246,255,0.94)",
            color: "#1e3a8a",
            fontSize: 10,
            fontWeight: 700,
            padding: "4px 8px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          Room boundaries source-locked · openings editable on-wall
        </div>
      </Html>
    ) : null;

  if (state.viewMode === "2d") {
    const { plan } = state;
    const { layers } = configuration.plan;

    return (
      <>
        <PlanUnderlayRenderer2D
          underlay={plan.underlay}
          calibrationMode={plan.calibration.enabled}
          calibrationPoints={plan.calibration.points}
          onCalibrationPoint={actions.underlay.addCalibrationPoint}
          traceRoomMode={plan.roomTrace.enabled}
          traceRoomDrawMode={plan.roomTrace.interactionMode}
          traceRoomPoints={plan.roomTrace.points}
          onTraceRoomPoint={actions.underlay.addRoomTracePoint}
          traceOpeningMode={plan.openingTrace.enabled}
          traceOpeningPoints={plan.openingTrace.points}
          traceOpeningKind={plan.openingTrace.kind}
          rooms={plan.rooms}
          existingOpenings={plan.scene.openings}
          onTraceOpeningPoint={actions.underlay.addOpeningTracePoint}
        />
        <RoomRenderer2D
          width={plan.width}
          depth={plan.depth}
          rooms={plan.rooms}
          activeFloorId={canonicalActiveFloorId}
          activeFloorLevel={state.wholeHome.activeFloorLevel}
          activeRoomId={plan.activeRoomId}
          onSelectRoom={actions.rooms.select}
          onSelectSurfaceTarget={actions.rooms.selectSurfaceTarget}
          onClearRoomSelection={
            plan.calibration.enabled ? undefined : actions.rooms.clearSelection
          }
          onRenameRoom={actions.rooms.rename}
          onDuplicateRoom={
            canonicalStructureExpected ? undefined : actions.rooms.duplicate
          }
          onDeleteRoom={
            canonicalStructureExpected ? undefined : actions.rooms.delete
          }
          onEditFloor={actions.rooms.editFloor}
          onFitRoom={actions.rooms.fit}
          onMoveRoom={
            canonicalStructureExpected ? undefined : actions.rooms.move
          }
          onResizeRoom={
            canonicalStructureExpected ? undefined : actions.rooms.resize
          }
          onRoomDragStateChange={actions.rooms.setDragging}
          onRoomResizeStateChange={actions.rooms.setResizing}
          measurementUnit={configuration.plan.measurementUnit}
          theme={configuration.plan.theme}
          showGrid={layers.grid}
          showDimensions={layers.dimensions}
          showLabels={layers.labels}
          showOpenings={layers.openings}
          showBuiltIns={layers.builtIns}
          showAnnotations={layers.annotations}
          showZones={layers.zones}
          planViewOrientation={configuration.plan.orientation}
          interactive={configuration.editorMode !== "present"}
          selectedOverlayId={plan.selectedOverlayId}
          onSelectOverlay={actions.overlays.select}
          onDeleteOverlay={actions.overlays.delete}
          onMoveOpening={actions.overlays.moveOpening}
          onResizeOpening={actions.overlays.resizeOpening}
          onAddDoorwaySuggestion={
            canonicalStructureExpected
              ? undefined
              : actions.overlays.addDoorwaySuggestion
          }
          suppressedDoorwaySuggestionKeys={
            plan.suppressedDoorwaySuggestionKeys
          }
          onMoveFixedElement={actions.overlays.moveFixedElement}
          onMoveAnnotation={actions.overlays.moveAnnotation}
          onOverlayDragStateChange={actions.overlays.setDragging}
          drawRoomMode={plan.roomTrace.drawOnBlankGrid}
          drawRoomPoints={plan.roomTrace.points}
          drawRoomPreviewPoint={plan.roomTrace.previewPoint}
          onDrawRoomPoint={actions.drawing.addRoomPoint}
          onDrawRoomPreviewPoint={actions.drawing.previewRoomPoint}
          onCommitRoomDimensionEdit={
            canonicalStructureExpected
              ? undefined
              : actions.drawing.commitRoomDimension
          }
          onCommitWallDrawSegmentLength={
            actions.drawing.commitWallSegmentLength
          }
          onDrawRoomDrag={actions.drawing.drawRoom}
          drawRoomInteractionMode={plan.roomTrace.interactionMode}
          traceOpeningMode={plan.openingTrace.enabled && !plan.underlay}
          traceOpeningKind={plan.openingTrace.kind}
          onTraceOpeningPoint={actions.drawing.addOpeningPoint}
          openings={mapPlanOpeningsToRoomRenderer(plan.scene.openings)}
          fixedElements={mapPlanFixedElementsToRoomRenderer(
            canonicalPlan
              ? plan.scene.fixedElements.filter((element) => !element.canonicalKind)
              : plan.scene.fixedElements
          )}
          annotations={mapPlanAnnotationsToRoomRenderer(plan.scene.annotations)}
          zones={plan.zones}
          onPlanDebugMetricsChange={actions.reportPlanMetrics}
          canonicalPlan={canonicalPlan}
          canonicalStructureExpected={canonicalStructureExpected}
        />
        {canonicalIntegrityWarning}
        {canonicalEditingNotice}
        <PlanQualityHintOverlay
          rooms={plan.rooms}
          issues={plan.qualityIssues}
        />
      </>
    );
  }

  if (state.wholeHome.enabled) {
    return (
      <>
      <HousePlanRenderer3D
        rooms={state.wholeHome.rooms}
        openings={mapPlanOpeningsToRoomRenderer(state.plan.scene.openings)}
        activeRoomId={state.wholeHome.activeRoomId}
        activeFloorLevel={state.wholeHome.activeFloorLevel}
        wallHeight={state.wholeHome.wallHeight}
        stackedFloors={state.wholeHome.stackedFloors}
        fadeInactiveFloors
        interactive={
          configuration.editorMode !== "present" &&
          !configuration.isClientPreview
        }
        onSelectRoom={actions.rooms.select}
        selectedOpeningId={state.wholeHome.selectedOpeningId}
        selectedSurfaceTarget={state.wholeHome.selectedSurfaceTarget}
        onSelectSurfaceTarget={actions.rooms.selectSurfaceTarget}
        onSelectOpening={actions.overlays.select}
        onMoveOpening={actions.overlays.moveOpening}
        onResizeOpening={actions.overlays.resizeOpening}
        onOpeningDragStateChange={(dragging, kind) => {
          if (kind) actions.overlays.setDragging(dragging, kind);
          else actions.wholeHome.setOpeningDragging(dragging);
        }}
        canonicalPlan={canonicalPlan}
        canonicalStructureExpected={canonicalStructureExpected}
      />
      {canonicalIntegrityWarning}
      {canonicalEditingNotice}
      </>
    );
  }

  return (
    <Room
      width={state.singleRoom.width}
      depth={state.singleRoom.depth}
      height={state.singleRoom.height}
      wallThickness={state.singleRoom.wallThickness}
      slabThickness={
        state.singleRoom.slabThickness ??
        ROOM_DIMENSION_DEFAULTS.slabThickness
      }
      wallOpacity={state.singleRoom.wallOpacity}
      floorOpacity={state.singleRoom.floorOpacity}
      ceilingOpacity={state.singleRoom.ceilingOpacity}
      ceilingVisible={state.singleRoom.ceilingVisible}
      ceilingColor={state.singleRoom.ceilingColor}
      renderQuality={configuration.renderQuality}
    />
  );
}
