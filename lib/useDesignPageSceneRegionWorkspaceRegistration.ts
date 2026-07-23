"use client";

import { buildDesignPageSceneRegionAdapter } from "@/lib/design-page-scene-region-adapter";
import {
  DEFAULT_EDITOR_CAMERA_VIEW,
  EDITOR_3D_MAX_POLAR_ANGLE,
  EDITOR_3D_MIN_CAMERA_DISTANCE,
  EDITOR_3D_MIN_POLAR_ANGLE,
} from "@/lib/design-page-editor-configuration";
import { useDesignPageSceneItemDrag } from "@/lib/useDesignPageSceneItemDrag";
import type { DesignPagePresentationWorkspaceRegistration } from "@/lib/useDesignPagePresentationWorkspaceRegistration";

export type UseDesignPageSceneRegionWorkspaceRegistrationInput = {
  boundaries: {
    presentation: DesignPagePresentationWorkspaceRegistration;
  };
};

/**
 * Registers scene-item drag behavior and builds the scene canvas region from
 * existing feature boundaries. It owns no document state and keeps hot refs
 * and pointer callbacks connected directly to their domain controllers.
 */
export function useDesignPageSceneRegionWorkspaceRegistration({
  boundaries: { presentation },
}: UseDesignPageSceneRegionWorkspaceRegistrationInput) {
  const { aiWorkspace, selection } = presentation.boundaries;
  const { coreShell, documentSelection, planAuthoring, editorInteraction } =
    aiWorkspace.boundaries;
  const { base, viewportShell } = coreShell.boundaries;
  const { documentRoom, sceneRoomRead, itemSelection, itemDocument } =
    documentSelection.boundaries;
  const { selectionInspection, planWorkspace } = planAuthoring.boundaries;
  const { camera, zone } = editorInteraction.boundaries;
  const placement = selection.boundaries.placement;
  const placementSelection = selection.boundaries.selection;

  const sceneDrag = useDesignPageSceneItemDrag({
    state: {
      hasWholeHousePlan: sceneRoomRead.derived.scene.hasWholeHousePlan,
      designerMode: coreShell.derived.access.isDesigner,
      activeRoom: documentRoom.derived.room.activeRoom,
      roomWidth: documentRoom.derived.room.roomWidth,
      roomDepth: documentRoom.derived.room.roomDepth,
      wallThickness: documentRoom.derived.room.wallThickness,
      roomSnapshotById: sceneRoomRead.derived.scene.roomSnapshotById,
    },
    refs: {
      items: coreShell.refs.itemsRef,
      selectedIds: itemSelection.refs.selectedIds,
      dragCommit: camera.refs.canvas.itemDragCommit,
    },
    actions: {
      findPlanRoomAtWorldPoint:
        sceneRoomRead.queries.scene.findPlanRoomAtWorldPoint,
      setCrossRoomDragTarget: coreShell.actions.placement.setCrossRoomDragTarget,
      findPlacementBlocker:
        placement.actions.catalog.findCatalogPlacementBlockerInRoom,
      isPlacementContained:
        placement.actions.catalog.isCatalogPlacementContainedInRoom,
      clampToRoom: documentRoom.actions.room.clampToActiveRoom,
      getItemBounds: selectionInspection.actions.geometry.getItemAABB,
      getItemDisplayName: placement.actions.catalog.getItemDisplayName,
      previewItems: itemDocument.actions.previewItemsPresent,
      setItems: itemDocument.actions.setItemsPresent,
      history: documentRoom.refs.documentHistory.history,
      flushCoalescedHistoryTransaction:
        documentRoom.actions.history.flushCoalescedHistoryTransaction,
      trackFirstInteraction: coreShell.actions.paywall.trackFirstInteraction,
      showToast: coreShell.actions.feedback.showRuleToast,
      moveSelectionToRoom:
        placementSelection.actions.interaction.moveSelectedItemToRoom,
      transferItemToRoom: placement.actions.catalog.transferItemToRoom,
      showConstraints: coreShell.actions.feedback.showConstraintsForMoment,
      showConfidence: coreShell.actions.feedback.showConfidenceSummary,
    },
  });

  const plan = documentRoom.derived.plan;
  const room = documentRoom.derived.room;
  const scene = sceneRoomRead.derived.scene;
  const roomRead = sceneRoomRead.derived.room;
  const sceneState = sceneRoomRead.state.scene;
  const planFit = camera.state.navigation.plan2DWholeHomeViewFit;

  const region = buildDesignPageSceneRegionAdapter({
    state: {
      editor: {
        viewMode: base.state.editor.viewMode,
        editorMode: viewportShell.state.editor.editorMode,
        isClientPreview: coreShell.derived.access.isClientPreview,
        isDesigner: coreShell.derived.access.isDesigner,
        canEdit: coreShell.derived.access.canEdit,
      },
      scene: {
        liteEnabled: sceneState.liteSceneEnabled,
        loadingVisible: sceneState.showSceneLoadingVeil,
        performanceMode: sceneState.scenePerformanceMode,
        renderQuality: sceneState.sceneRenderQuality,
        controlsEnabled: camera.state.canvas.controlsEnabled,
        cameraY: viewportShell.state.camera.cameraView.pos[1],
        planDiagnostics: {
          valid: viewportShell.state.diagnostics.planDebugMetrics.cameraValid,
          recoveries:
            viewportShell.state.diagnostics.planDebugMetrics.cameraRecoveries,
          targetX:
            viewportShell.state.diagnostics.planDebugMetrics.cameraTargetX,
          targetZ:
            viewportShell.state.diagnostics.planDebugMetrics.cameraTargetZ,
          projectedRoomMinWidthPx:
            viewportShell.state.diagnostics.planDebugMetrics
              .projectedRoomMinWidthPx,
          projectedRoomMinHeightPx:
            viewportShell.state.diagnostics.planDebugMetrics
              .projectedRoomMinHeightPx,
          projectedRoomMinAreaPx:
            viewportShell.state.diagnostics.planDebugMetrics
              .projectedRoomMinAreaPx,
        },
        cursor: planWorkspace.derived.planCanvasCursor,
        backgroundColor: planWorkspace.derived.sceneBackgroundColor,
        lightConfig: planWorkspace.derived.lightConfig,
        showGrid: base.state.editor.showGrid,
        gridPulse: camera.state.canvas.gridPulse,
      },
      plan: {
        fit: planFit,
        orientation: planFit.orientation,
        fitBounds: {
          widthMeters: planWorkspace.derived.plan2DFitBounds.widthMeters,
          depthMeters: planWorkspace.derived.plan2DFitBounds.depthMeters,
          centerX: planWorkspace.derived.plan2DFitBounds.centerX,
          centerZ: planWorkspace.derived.plan2DFitBounds.centerZ,
        },
        safeArea: {
          leftPx: planWorkspace.derived.plan2DSafeAreaLeftPx,
          rightPx: planWorkspace.derived.plan2DSafeAreaRightPx,
          bottomPx: planWorkspace.derived.plan2DSafeAreaBottomPx,
        },
        rooms: plan.housePlan2D.rooms,
        underlay: viewportShell.state.floorPlan.floorPlanUnderlay,
        calibration: {
          enabled: viewportShell.state.floorPlan.floorPlanCalibrationMode,
          points: viewportShell.state.floorPlan.floorPlanCalibrationPoints,
        },
        roomTrace: {
          enabled: viewportShell.state.floorPlan.floorPlanTraceRoomMode,
          interactionMode: viewportShell.state.floorPlan.floorPlanDrawRoomMode,
          points: viewportShell.state.floorPlan.floorPlanTraceRoomPoints,
          previewPoint: viewportShell.state.floorPlan.blankGridRoomPreviewPoint,
          drawOnBlankGrid: viewportShell.state.floorPlan.blankGridRoomDrawActive,
        },
        openingTrace: {
          enabled: viewportShell.state.floorPlan.floorPlanTraceOpeningMode,
          points: viewportShell.state.floorPlan.floorPlanTraceOpeningPoints,
          kind: viewportShell.state.floorPlan.floorPlanTraceOpeningKind,
        },
        width: plan.planViewWidth,
        depth: plan.planViewDepth,
        selectedRoomId: viewportShell.state.planSelection.selectedPlanRoomId,
        selectedRoomIds: viewportShell.state.planSelection.selectedPlanRoomIds,
        selectedOverlayId:
          viewportShell.state.planSelection.selectedPlanOverlayId,
        suppressedDoorwaySuggestionKeys:
          viewportShell.state.planSelection.suppressedDoorwaySuggestionKeys,
        editorScene: planWorkspace.state.overlay.editorScene2D,
        zones: zone.state.planZones2D,
        qualityIssues: planWorkspace.state.quality.report.issues,
        canonicalDocument:
          coreShell.state.document.designSnapshot.floorPlan?.canonicalDocument ?? null,
        canonicalGeometryHash:
          coreShell.state.document.designSnapshot.floorPlan?.canonicalGeometryHash ?? null,
        measurementUnit: viewportShell.state.plan.planMeasurementUnit,
        theme: planWorkspace.derived.effectivePlanTheme,
        layers: planWorkspace.derived.effectivePlanLayers,
      },
      room: {
        activeId: coreShell.state.document.designSnapshot.activeRoomId,
        guidanceActiveId: room.activeRoom?.id ?? null,
        activePlanOffset: plan.activeRoomPlanOffset,
        activeFloorLevel: documentRoom.derived.floor.activeFloorLevel,
        stackedFloors: documentRoom.state.floor.stackedFloorView,
        wholeHomeEnabled: scene.usesHousePlanScene,
        wholeHomeRooms: scene.sceneHousePlanRooms3D,
        selectedSurfaceTarget:
          viewportShell.state.surface.selectedRendererSurfaceTarget,
        width: room.roomWidth,
        depth: room.roomDepth,
        height: room.roomHeight,
        wallThickness: room.wallThickness,
        slabThickness: room.activeRoom?.geometry.slabThickness,
        wallOpacity: roomRead.activeRoomWallOpacity,
        floorOpacity: roomRead.activeRoomFloorOpacity,
        ceilingOpacity: roomRead.activeRoomCeilingOpacity,
        ceilingVisible: roomRead.activeRoomCeilingVisible,
        ceilingColor: roomRead.activeRoomCeilingColor,
        walls: aiWorkspace.derived.walls,
      },
      placement: {
        targetRoom: placement.derived.placementTargetPlanRoom,
        showTargetRoom: Boolean(
          placement.state.pendingCatalogPlacement ||
            coreShell.state.placement.crossRoomDragTarget
        ),
        targetValid: selection.derived.placement.activeTargetValid,
        supportSurface: placement.derived.activeCatalogPlacementSurfaceHighlight,
        compatibleZoneIds: placement.derived.activePlacementCompatibleZoneIds,
        pending: placement.state.pendingCatalogPlacement !== null,
        hover: placement.state.hoverCatalogPlacement !== null,
        pendingScene: placement.derived.pendingCatalogPlacementScene,
        hoverScene: placement.derived.hoverCatalogPlacementScene,
        hardInvalid: placement.derived.pendingCatalogPlacementHardInvalid,
        pendingRoomSize: placement.derived.pendingCatalogPlacementRoom
          ? {
              width:
                placement.derived.pendingCatalogPlacementRoom.geometry.width,
              depth:
                placement.derived.pendingCatalogPlacementRoom.geometry.depth,
            }
          : null,
      },
      zones: {
        entries: room.zones,
        selectedId: documentSelection.state.selectedZoneId,
        circulationHeatmap: placement.derived.circulationHeatmap
          ? {
              cells: placement.derived.circulationHeatmap.analysis.heatmap,
              roomOffset: placement.derived.circulationHeatmap.roomOffset,
            }
          : null,
      },
      items: {
        entries: scene.sceneRoomItems,
        selectedIds: itemSelection.state.selectedIds,
        selectedInstanceId: itemSelection.state.selectedInstanceId,
        previewVariantId:
          selectionInspection.state.inspection.previewVariantId,
        previewMaterialPresetId:
          selectionInspection.state.inspection.previewMaterialPresetId,
        hoveredCartInstanceId:
          viewportShell.state.shopping.hoveredCartInstanceId,
        activeSceneItemsForGuides: roomRead.activeSceneItemsForGuides,
        itemPlanningBoundsByInstanceId:
          selectionInspection.derived.itemPlanningBoundsByInstanceId,
      },
      aiLayout: {
        footprints: scene.aiLayoutPreviewFootprints,
        tone: scene.aiLayoutPreviewTone,
      },
    },
    configuration: {
      initialCameraView: DEFAULT_EDITOR_CAMERA_VIEW,
      orbit: {
        minDistance: EDITOR_3D_MIN_CAMERA_DISTANCE,
        maxDistance: Math.max(24, Math.max(plan.planViewWidth, plan.planViewDepth) * 6),
        minPolarAngle: EDITOR_3D_MIN_POLAR_ANGLE,
        maxPolarAngle: EDITOR_3D_MAX_POLAR_ANGLE,
      },
      snapEnabled: base.state.editor.snapEnabled,
      rotationSnapStepRadians:
        selectionInspection.state.inspection.rotationSnapStepRadians,
      rotationSnapStepDegrees:
        selectionInspection.state.inspection.rotationSnapStepDegrees,
      rotationSnapEnabled:
        selectionInspection.state.inspection.rotationSnapEnabled,
    },
    references: {
      canvas: {
        canvas: viewportShell.refs.canvasRef,
        camera: viewportShell.refs.cameraRef,
        controls: viewportShell.refs.orbitControlsRef,
        renderer: viewportShell.refs.rendererRef,
        scene: viewportShell.refs.sceneRef,
      },
    },
    resolvers: {
      guidance: { getZoneBounds: zone.resolvers.getZoneBounds },
      items: {
        resolveItemConfigurationEntry:
          selectionInspection.resolvers.resolveItemConfigurationEntry,
        resolveConfiguredVisualDimsMm:
          selectionInspection.resolvers.resolveConfiguredVisualDimsMm,
        resolveConfiguredPlanningDimsMm:
          selectionInspection.resolvers.resolveConfiguredPlanningDimsMm,
        resolveConfiguredModelUrl:
          selectionInspection.resolvers.resolveConfiguredModelUrl,
        resolveConfiguredNodeTransforms:
          selectionInspection.resolvers.resolveConfiguredNodeTransforms,
        getRoomItems: (roomId) =>
          scene.roomSnapshotById.get(roomId)?.items ?? [],
      },
    },
    actions: {
      shell: {
        onDragOver: placement.actions.catalog.handleCatalogCanvasDragOver,
        onDrop: placement.actions.catalog.handleCatalogCanvasDrop,
        onDragLeave: placement.actions.catalog.handleCatalogCanvasDragLeave,
      },
      canvas: {
        onClearSelection: selectionInspection.actions.selection.clearAllSelection,
        onPlanDiagnosticsChange:
          viewportShell.actions.diagnostics.handlePlan2DCameraDiagnosticsChange,
        updateProjection: viewportShell.actions.camera.updateProjection,
        onSceneProgressReadyChange:
          sceneRoomRead.actions.scene.setSceneProgressReady,
        onFpsSample:
          sceneRoomRead.actions.scene.handleScenePerformanceSample,
        onRendererSample:
          sceneRoomRead.actions.scene.handleSceneRendererPerformanceSample,
        onSustainedLowFps:
          sceneRoomRead.actions.scene.handleSustainedLowFps,
        onOrbitChange: camera.actions.canvas.handleOrbitChange,
      },
      structure: {
        underlay: {
          addCalibrationPoint: planAuthoring.boundaries.underlay.actions.addCalibrationPoint,
          addRoomTracePoint: editorInteraction.boundaries.tracing.actions.handleFloorPlanTraceRoomPoint,
          addOpeningTracePoint: editorInteraction.boundaries.tracing.actions.traceOpeningPoint,
        },
        rooms: {
          select: placement.actions.targeting.handlePlacementAwareRoomSelect,
          selectSurfaceTarget:
            placement.actions.targeting.handleRendererSurfaceTargetSelect,
          clearSelection:
            selectionInspection.actions.selection.clearAllSelection,
          rename: planWorkspace.actions.room.startRoomRename,
          duplicate: planWorkspace.actions.room.duplicateRoom,
          delete: planWorkspace.actions.room.deleteRoom,
          editFloor:
            planAuthoring.boundaries.surfaceWorkspace.actions
              .openFloorEditorForRoom,
          fit: camera.actions.navigation.handleFitSelectedPlanRoom,
          move: documentRoom.actions.room.handleMoveRoom2D,
          resize: planWorkspace.actions.room.resizeRoom2D,
          setDragging: camera.actions.canvas.changePlanRoomDragging,
          setResizing: camera.actions.canvas.changePlanRoomResizing,
        },
        overlays: {
          select:
            selectionInspection.actions.selection.handleSelectPlanOverlay,
          delete: selectionInspection.actions.selection.deletePlanOverlayById,
          moveOpening: planWorkspace.actions.overlay.handleMoveOpening2D,
          resizeOpening: planWorkspace.actions.overlay.handleResizeOpening2D,
          addDoorwaySuggestion:
            planWorkspace.actions.overlay.handleAddSuggestedDoorway,
          moveFixedElement:
            planWorkspace.actions.overlay.handleMoveFixedElement2D,
          moveAnnotation: planWorkspace.actions.overlay.handleMoveAnnotation2D,
          setDragging: camera.actions.canvas.changePlanOverlayDragging,
        },
        drawing: {
          addRoomPoint:
            editorInteraction.boundaries.tracing.actions
              .handleBlankGridRoomDrawPoint,
          previewRoomPoint:
            editorInteraction.boundaries.tracing.actions
              .handleBlankGridRoomDrawPreviewPoint,
          commitRoomDimension:
            planWorkspace.actions.room.commitRoomDimensionEdit2D,
          commitWallSegmentLength:
            editorInteraction.boundaries.tracing.actions
              .handleCommitWallDrawSegmentLength2D,
          drawRoom:
            editorInteraction.boundaries.tracing.actions
              .handleBlankGridRoomDrawDrag,
          addOpeningPoint:
            editorInteraction.boundaries.tracing.actions
              .traceBlankGridOpeningPoint,
        },
        wholeHome: {
          setOpeningDragging:
            camera.actions.canvas.changePlanOpeningDragging,
        },
        reportPlanMetrics:
          viewportShell.actions.diagnostics.handlePlanDebugMetricsChange,
      },
      guidance: {
        showToast: coreShell.actions.feedback.showRuleToast,
        targetPendingPlacementToRoom:
          placement.actions.targeting.targetPendingCatalogPlacementToRoom,
        selectZone: documentSelection.actions.setSelectedZoneId,
        clearSelection: itemSelection.actions.clearSelection,
      },
      items: {
        onDraggingChange: camera.actions.canvas.changeSceneItemDragging,
        onRenderReadyChange:
          sceneRoomRead.actions.scene.handleSceneRenderItemReadyChange,
        selectItem: itemSelection.actions.selectItem,
        trackFirstInteraction: coreShell.actions.paywall.trackFirstInteraction,
        onDuplicateSelectedItem:
          placementSelection.actions.interaction.duplicateSelectedItem,
        onDeleteSelectedItem:
          placementSelection.actions.interaction.deleteSelectedItem,
        onMove: sceneDrag.actions.handleMove,
        onDragPointerMove: scene.hasWholeHousePlan
          ? camera.actions.navigation.nudgeWholeHomeCameraForDrag
          : undefined,
        applyItemRotation:
          placementSelection.actions.interaction.applyItemRotation,
        onSnapPulse: camera.actions.canvas.pulseSnapGrid,
        onDragEnd: sceneDrag.actions.handleDragEnd,
      },
      preview: {
        onPlacementPointerDown:
          placement.actions.catalog.handleCatalogPlacementPointerDown,
        onPlacementPointerMove:
          placement.actions.catalog.handleCatalogPlacementPointerMove,
        onPlacementPointerUp:
          placement.actions.catalog.handleCatalogPlacementPointerUp,
      },
    },
  });

  return {
    boundaries: { presentation, sceneDrag },
    state: {},
    derived: {},
    configuration: {},
    refs: {},
    actions: sceneDrag.actions,
    regions: { scene: region },
  };
}

export type DesignPageSceneRegionWorkspaceRegistration = ReturnType<
  typeof useDesignPageSceneRegionWorkspaceRegistration
>;
