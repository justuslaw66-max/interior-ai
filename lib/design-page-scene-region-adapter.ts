import type {
  DesignPageSceneRegionActions,
  DesignPageSceneRegionConfiguration,
  DesignPageSceneRegionReferences,
  DesignPageSceneRegionResolvers,
  DesignPageSceneRegionState,
} from "@/components/editor/design-page/DesignPageSceneRegion";
import {
  buildDesignPageSceneCanvasRegionModel,
  type DesignPageSceneCanvasRegionModel,
} from "@/lib/design-page-scene-region-model";

type CanvasState = DesignPageSceneRegionState["canvas"];
type StructureState = DesignPageSceneRegionState["structure"];
type GuidanceState = DesignPageSceneRegionState["guidance"];
type ItemsState = DesignPageSceneRegionState["items"];
type PreviewState = DesignPageSceneRegionState["preview"];
type CanvasConfiguration = DesignPageSceneRegionConfiguration["canvas"];
type StructureConfiguration =
  DesignPageSceneRegionConfiguration["structure"];
type ItemsConfiguration = DesignPageSceneRegionConfiguration["items"];
type CanvasActions = DesignPageSceneRegionActions["canvas"];
type StructureActions = DesignPageSceneRegionActions["structure"];
type GuidanceActions = DesignPageSceneRegionActions["guidance"];
type ItemsActions = DesignPageSceneRegionActions["items"];
type PreviewActions = DesignPageSceneRegionActions["preview"];

export type BuildDesignPageSceneRegionAdapterInput = {
  state: {
    editor: {
      viewMode: CanvasState["viewMode"];
      editorMode: StructureConfiguration["editorMode"];
      isClientPreview: boolean;
      isDesigner: boolean;
      canEdit: boolean;
    };
    scene: {
      liteEnabled: CanvasState["liteSceneEnabled"];
      loadingVisible: CanvasState["showSceneLoadingVeil"];
      performanceMode: CanvasState["scenePerformanceMode"];
      renderQuality: StructureConfiguration["renderQuality"];
      controlsEnabled: CanvasState["controlsEnabled"];
      cameraY: CanvasState["cameraY"];
      planDiagnostics: CanvasState["planDiagnostics"];
      cursor: CanvasConfiguration["cursor"];
      backgroundColor: CanvasConfiguration["backgroundColor"];
      lightConfig: CanvasConfiguration["lightConfig"];
      showGrid: boolean;
      gridPulse: boolean;
    };
    plan: {
      fit: CanvasConfiguration["planFit"];
      orientation: StructureConfiguration["plan"]["orientation"];
      fitBounds: Omit<CanvasConfiguration["planBounds"], "roomHeight">;
      safeArea: CanvasConfiguration["planSafeArea"];
      rooms: CanvasConfiguration["planRooms"];
      underlay: StructureState["plan"]["underlay"];
      calibration: StructureState["plan"]["calibration"];
      roomTrace: StructureState["plan"]["roomTrace"];
      openingTrace: StructureState["plan"]["openingTrace"];
      width: StructureState["plan"]["width"];
      depth: StructureState["plan"]["depth"];
      selectedRoomId: StructureState["plan"]["activeRoomId"];
      selectedRoomIds: StructureState["plan"]["selectedRoomIds"];
      selectedOverlayId: StructureState["plan"]["selectedOverlayId"];
      suppressedDoorwaySuggestionKeys: StructureState["plan"]["suppressedDoorwaySuggestionKeys"];
      editorScene: StructureState["plan"]["scene"];
      zones: StructureState["plan"]["zones"];
      qualityIssues: StructureState["plan"]["qualityIssues"];
      canonicalDocument: StructureState["plan"]["canonicalDocument"];
      canonicalGeometryHash: StructureState["plan"]["canonicalGeometryHash"];
      measurementUnit: StructureConfiguration["plan"]["measurementUnit"];
      theme: StructureConfiguration["plan"]["theme"];
      layers: StructureConfiguration["plan"]["layers"];
    };
    room: {
      activeId: StructureState["wholeHome"]["activeRoomId"];
      guidanceActiveId: DesignPageSceneRegionConfiguration["guidance"]["activeRoomId"];
      activePlanOffset: DesignPageSceneRegionConfiguration["guidance"]["activeRoomOffset"];
      activeFloorLevel: StructureState["wholeHome"]["activeFloorLevel"];
      stackedFloors: StructureState["wholeHome"]["stackedFloors"];
      wholeHomeEnabled: StructureState["wholeHome"]["enabled"];
      wholeHomeRooms: StructureState["wholeHome"]["rooms"];
      selectedSurfaceTarget: StructureState["wholeHome"]["selectedSurfaceTarget"];
      width: StructureState["singleRoom"]["width"];
      depth: StructureState["singleRoom"]["depth"];
      height: StructureState["singleRoom"]["height"];
      wallThickness: StructureState["singleRoom"]["wallThickness"];
      slabThickness: StructureState["singleRoom"]["slabThickness"];
      wallOpacity: StructureState["singleRoom"]["wallOpacity"];
      floorOpacity: StructureState["singleRoom"]["floorOpacity"];
      ceilingOpacity: StructureState["singleRoom"]["ceilingOpacity"];
      ceilingVisible: StructureState["singleRoom"]["ceilingVisible"];
      ceilingColor: StructureState["singleRoom"]["ceilingColor"];
      walls: ItemsConfiguration["walls"];
    };
    placement: {
      targetRoom: GuidanceState["placement"]["targetRoom"];
      showTargetRoom: GuidanceState["placement"]["showTargetRoom"];
      targetValid: GuidanceState["placement"]["targetValid"];
      supportSurface: GuidanceState["placement"]["supportSurface"];
      compatibleZoneIds: GuidanceState["zones"]["compatibleIds"];
      pending: GuidanceState["zones"]["pendingPlacement"];
      hover: GuidanceState["zones"]["hoverPlacement"];
      pendingScene: PreviewState["placement"]["pending"];
      hoverScene: PreviewState["placement"]["hover"];
      hardInvalid: PreviewState["placement"]["hardInvalid"];
      pendingRoomSize: DesignPageSceneRegionConfiguration["preview"]["pendingRoomSize"];
    };
    zones: {
      entries: GuidanceState["zones"]["entries"];
      selectedId: GuidanceState["zones"]["selectedId"];
      circulationHeatmap: GuidanceState["circulationHeatmap"];
    };
    items: ItemsState;
    aiLayout: PreviewState["aiLayout"];
  };
  configuration: {
    initialCameraView: CanvasConfiguration["initialCameraView"];
    orbit: CanvasConfiguration["orbit"];
    snapEnabled: ItemsConfiguration["snapEnabled"];
    rotationSnapStepRadians: ItemsConfiguration["rotationSnapStepRadians"];
    rotationSnapStepDegrees: ItemsConfiguration["rotationSnapStepDegrees"];
    rotationSnapEnabled: ItemsConfiguration["rotationSnapEnabled"];
  };
  references: Pick<DesignPageSceneRegionReferences, "canvas">;
  resolvers: DesignPageSceneRegionResolvers;
  actions: {
    shell: DesignPageSceneRegionActions["shell"];
    canvas: CanvasActions;
    structure: StructureActions;
    guidance: GuidanceActions;
    items: Omit<ItemsActions, "onSelect" | "onRotate"> & {
      selectItem: ItemsActions["onSelect"];
      trackFirstInteraction: () => void;
      applyItemRotation: ItemsActions["onRotate"];
    };
    preview: PreviewActions;
  };
};

export function buildDesignPageSceneRegionAdapter({
  state,
  configuration,
  references,
  resolvers,
  actions,
}: BuildDesignPageSceneRegionAdapterInput): DesignPageSceneCanvasRegionModel {
  const { editor, scene, plan, room, placement, zones, items, aiLayout } =
    state;
  const { selectItem, trackFirstInteraction, applyItemRotation, ...itemActions } =
    actions.items;

  return buildDesignPageSceneCanvasRegionModel({
    state: {
      canvas: {
        viewMode: editor.viewMode,
        isClientPreview: editor.isClientPreview,
        liteSceneEnabled: scene.liteEnabled,
        showSceneLoadingVeil: scene.loadingVisible,
        scenePerformanceMode: scene.performanceMode,
        controlsEnabled: scene.controlsEnabled,
        cameraY: scene.cameraY,
        planDiagnostics: scene.planDiagnostics,
      },
      structure: {
        viewMode: editor.viewMode,
        plan: {
          underlay: plan.underlay,
          calibration: plan.calibration,
          roomTrace: plan.roomTrace,
          openingTrace: plan.openingTrace,
          width: plan.width,
          depth: plan.depth,
          rooms: plan.rooms,
          activeRoomId: plan.selectedRoomId,
          selectedRoomIds: plan.selectedRoomIds,
          selectedOverlayId: plan.selectedOverlayId,
          suppressedDoorwaySuggestionKeys:
            plan.suppressedDoorwaySuggestionKeys,
          scene: plan.editorScene,
          zones: plan.zones,
          qualityIssues: plan.qualityIssues,
          canonicalDocument: plan.canonicalDocument,
          canonicalGeometryHash: plan.canonicalGeometryHash,
        },
        wholeHome: {
          enabled: room.wholeHomeEnabled,
          rooms: room.wholeHomeRooms,
          activeRoomId: room.activeId,
          activeFloorLevel: room.activeFloorLevel,
          wallHeight: room.height,
          stackedFloors: room.stackedFloors,
          selectedOpeningId: plan.selectedOverlayId,
          selectedSurfaceTarget: room.selectedSurfaceTarget,
        },
        singleRoom: {
          width: room.width,
          depth: room.depth,
          height: room.height,
          wallThickness: room.wallThickness,
          slabThickness: room.slabThickness,
          wallOpacity: room.wallOpacity,
          floorOpacity: room.floorOpacity,
          ceilingOpacity: room.ceilingOpacity,
          ceilingVisible: room.ceilingVisible,
          ceilingColor: room.ceilingColor,
        },
      },
      guidance: {
        placement: {
          targetRoom: placement.targetRoom,
          showTargetRoom: placement.showTargetRoom,
          targetValid: placement.targetValid,
          supportSurface: placement.supportSurface,
        },
        circulationHeatmap: zones.circulationHeatmap,
        zones: {
          entries: zones.entries,
          selectedId: zones.selectedId,
          compatibleIds: placement.compatibleZoneIds,
          pendingPlacement: placement.pending,
          hoverPlacement: placement.hover,
        },
      },
      items,
      preview: {
        aiLayout,
        placement: {
          pending: placement.pendingScene,
          hover: placement.hoverScene,
          hardInvalid: placement.hardInvalid,
        },
      },
    },
    configuration: {
      canvas: {
        cursor: scene.cursor,
        backgroundColor: scene.backgroundColor,
        lightConfig: scene.lightConfig,
        initialCameraView: configuration.initialCameraView,
        planFit: plan.fit,
        planBounds: { ...plan.fitBounds, roomHeight: room.height },
        planSafeArea: plan.safeArea,
        planRooms: plan.rooms,
        orbit: configuration.orbit,
      },
      structure: {
        editorMode: editor.editorMode,
        isClientPreview: editor.isClientPreview,
        plan: {
          measurementUnit: plan.measurementUnit,
          theme: plan.theme,
          layers: plan.layers,
          orientation: plan.orientation,
        },
        renderQuality: scene.renderQuality,
      },
      guidance: {
        grid: {
          visible:
            editor.isDesigner &&
            scene.showGrid &&
            !editor.isClientPreview &&
            (editor.editorMode === "design" || editor.editorMode === "adjust"),
          pulse: scene.gridPulse,
        },
        zonesVisible:
          !editor.isClientPreview && editor.editorMode !== "present",
        activeRoomOffset: room.activePlanOffset,
        activeRoomId: room.guidanceActiveId,
      },
      items: {
        editorMode: editor.editorMode,
        viewMode: editor.viewMode,
        isClientPreview: editor.isClientPreview,
        canEdit: editor.canEdit,
        isDesigner: editor.isDesigner,
        hasWholeHousePlan: room.wholeHomeEnabled,
        renderQuality: scene.renderQuality,
        walls: room.walls,
        snapEnabled: configuration.snapEnabled,
        rotationSnapStepRadians: configuration.rotationSnapStepRadians,
        rotationSnapStepDegrees: configuration.rotationSnapStepDegrees,
        rotationSnapEnabled: configuration.rotationSnapEnabled,
        planShowLabels: plan.layers.labels,
        planShowDimensions: plan.layers.dimensions,
        planMeasurementUnit: plan.measurementUnit,
      },
      preview: {
        hasWholeHousePlan: room.wholeHomeEnabled,
        planWidth: plan.width,
        planDepth: plan.depth,
        activeRoomWidth: room.width,
        activeRoomDepth: room.depth,
        pendingRoomSize: placement.pendingRoomSize,
      },
    },
    references,
    resolvers,
    actions: {
      shell: actions.shell,
      canvas: actions.canvas,
      structure: actions.structure,
      guidance: actions.guidance,
      items: {
        ...itemActions,
        onSelect: (id, additive) => {
          trackFirstInteraction();
          selectItem(id, additive);
        },
        onRotate: (id, rotationY, meta) =>
          applyItemRotation(id, rotationY, {
            source: meta?.source ?? "canvas",
            snap: meta?.snap,
          }),
      },
      preview: actions.preview,
    },
  });
}
