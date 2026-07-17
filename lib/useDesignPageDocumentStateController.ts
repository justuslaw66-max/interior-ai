"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  ROOM_DIMENSION_DEFAULTS,
} from "@/lib/design-page-house-plan";
import type {
  PlanLayerPresetId,
  PlanMeasurementUnit,
} from "@/lib/design-page-types";
import type {
  EditorAnnotation2D,
  FixedElement2D,
  RoomOpening2D,
} from "@/lib/editorScene";
import type { FloorPlanUnderlay } from "@/lib/floor-plan-types";
import {
  migrateToV3,
  type DesignSnapshot,
} from "@/lib/room-types";
import { useDesignPageFloorPlanAssets } from "@/lib/useDesignPageFloorPlanAssets";
import { useDesignPageFloorPlanWorkflowState } from "@/lib/useDesignPageFloorPlanWorkflowState";
import type { DesignPageHistorySnapshot } from "@/lib/useDesignPageHistory";
import {
  useDesignPagePlanState,
  type ExportStylePreset,
  type PlanLayers,
  type PlanTheme,
} from "@/lib/useDesignPagePlanState";

type FunctionalStateAction<T> = T | ((previous: T) => T);

export function useDesignPagePlanDocumentState() {
  const {
    planTheme,
    setPlanTheme: setPlanThemeState,
    planLayers,
    setPlanLayers: setPlanLayersState,
    planAnnotations,
    setPlanAnnotations: setPlanAnnotationsState,
    planOpenings,
    setPlanOpenings: setPlanOpeningsState,
    planFixedElements,
    setPlanFixedElements: setPlanFixedElementsState,
    simplePlanControls,
    setSimplePlanControls,
    planLayerPreset,
    setPlanLayerPreset: setPlanLayerPresetState,
    planMeasurementUnit,
    setPlanMeasurementUnit: setPlanMeasurementUnitState,
    exportStylePreset,
    setExportStylePreset: setExportStylePresetState,
    planGuidedActionsEnabled,
    setPlanGuidedActionsEnabled,
    planGuidedActionsChoiceSeen,
    setPlanGuidedActionsChoiceSeen,
    planOpeningsStorageState,
    planSettingsLoaded,
  } = useDesignPagePlanState();

  const planOpeningsRef = useRef(planOpenings);
  const planAnnotationsRef = useRef(planAnnotations);
  const planFixedElementsRef = useRef(planFixedElements);
  const planThemeRef = useRef(planTheme);
  const planLayersRef = useRef(planLayers);
  const planLayerPresetRef = useRef(planLayerPreset);
  const planMeasurementUnitRef = useRef(planMeasurementUnit);
  const exportStylePresetRef = useRef(exportStylePreset);

  const setPlanOpenings = useCallback(
    (next: FunctionalStateAction<RoomOpening2D[]>) => {
      const resolved =
        typeof next === "function"
          ? (next as (previous: RoomOpening2D[]) => RoomOpening2D[])(
              planOpeningsRef.current
            )
          : next;
      planOpeningsRef.current = resolved;
      setPlanOpeningsState(resolved);
    },
    [setPlanOpeningsState]
  );

  const setPlanAnnotations = useCallback(
    (next: FunctionalStateAction<EditorAnnotation2D[]>) => {
      const resolved =
        typeof next === "function"
          ? (next as (previous: EditorAnnotation2D[]) => EditorAnnotation2D[])(
              planAnnotationsRef.current
            )
          : next;
      planAnnotationsRef.current = resolved;
      setPlanAnnotationsState(resolved);
    },
    [setPlanAnnotationsState]
  );

  const setPlanFixedElements = useCallback(
    (next: FunctionalStateAction<FixedElement2D[]>) => {
      const resolved =
        typeof next === "function"
          ? (next as (previous: FixedElement2D[]) => FixedElement2D[])(
              planFixedElementsRef.current
            )
          : next;
      planFixedElementsRef.current = resolved;
      setPlanFixedElementsState(resolved);
    },
    [setPlanFixedElementsState]
  );

  const setPlanTheme = useCallback(
    (next: FunctionalStateAction<PlanTheme>) => {
      const resolved =
        typeof next === "function"
          ? (next as (previous: PlanTheme) => PlanTheme)(planThemeRef.current)
          : next;
      planThemeRef.current = resolved;
      setPlanThemeState(resolved);
    },
    [setPlanThemeState]
  );

  const setPlanLayers = useCallback(
    (next: FunctionalStateAction<PlanLayers>) => {
      const resolved =
        typeof next === "function"
          ? (next as (previous: PlanLayers) => PlanLayers)(planLayersRef.current)
          : next;
      planLayersRef.current = resolved;
      setPlanLayersState(resolved);
    },
    [setPlanLayersState]
  );

  const setPlanLayerPreset = useCallback(
    (next: FunctionalStateAction<PlanLayerPresetId>) => {
      const resolved =
        typeof next === "function"
          ? (next as (previous: PlanLayerPresetId) => PlanLayerPresetId)(
              planLayerPresetRef.current
            )
          : next;
      planLayerPresetRef.current = resolved;
      setPlanLayerPresetState(resolved);
    },
    [setPlanLayerPresetState]
  );

  const setPlanMeasurementUnit = useCallback(
    (next: FunctionalStateAction<PlanMeasurementUnit>) => {
      const resolved =
        typeof next === "function"
          ? (next as (previous: PlanMeasurementUnit) => PlanMeasurementUnit)(
              planMeasurementUnitRef.current
            )
          : next;
      planMeasurementUnitRef.current = resolved;
      setPlanMeasurementUnitState(resolved);
    },
    [setPlanMeasurementUnitState]
  );

  const setExportStylePreset = useCallback(
    (next: FunctionalStateAction<ExportStylePreset>) => {
      const resolved =
        typeof next === "function"
          ? (next as (previous: ExportStylePreset) => ExportStylePreset)(
              exportStylePresetRef.current
            )
          : next;
      exportStylePresetRef.current = resolved;
      setExportStylePresetState(resolved);
    },
    [setExportStylePresetState]
  );

  const defaultPlanOpeningsSeededRef = useRef(false);
  const markDefaultPlanOpeningsSeeded = useCallback(() => {
    defaultPlanOpeningsSeededRef.current = true;
  }, []);

  return {
    state: {
      planTheme,
      planLayers,
      planAnnotations,
      planOpenings,
      planFixedElements,
      simplePlanControls,
      planLayerPreset,
      planMeasurementUnit,
      exportStylePreset,
      planGuidedActionsEnabled,
      planGuidedActionsChoiceSeen,
      planOpeningsStorageState,
      planSettingsLoaded,
    },
    actions: {
      setPlanTheme,
      setPlanLayers,
      setPlanAnnotations,
      setPlanOpenings,
      setPlanFixedElements,
      setSimplePlanControls,
      setPlanLayerPreset,
      setPlanMeasurementUnit,
      setExportStylePreset,
      setPlanGuidedActionsEnabled,
      setPlanGuidedActionsChoiceSeen,
      markDefaultPlanOpeningsSeeded,
    },
    refs: {
      planOpeningsRef,
      planAnnotationsRef,
      planFixedElementsRef,
      planThemeRef,
      planLayersRef,
      planLayerPresetRef,
      planMeasurementUnitRef,
      exportStylePresetRef,
      defaultPlanOpeningsSeededRef,
    },
    restoreActions: {
      setPlanThemeState,
      setPlanLayersState,
      setPlanAnnotationsState,
      setPlanOpeningsState,
      setPlanFixedElementsState,
      setPlanLayerPresetState,
      setPlanMeasurementUnitState,
      setExportStylePresetState,
    },
  };
}

export function useDesignPageFloorPlanDocumentState() {
  const workflow = useDesignPageFloorPlanWorkflowState();
  const { setFloorPlanUnderlay: setFloorPlanUnderlayState } = workflow;
  const {
    refs: {
      underlayObjectUrlRef: floorPlanUnderlayUrlRef,
      pdfSourceDataRef: floorPlanPdfSourceDataRef,
    },
    actions: { revokeUnderlayObjectUrl: revokeFloorPlanUnderlayUrl },
  } = useDesignPageFloorPlanAssets();
  const floorPlanUnderlayRef = useRef(workflow.floorPlanUnderlay);

  const setFloorPlanUnderlay = useCallback(
    (next: FunctionalStateAction<FloorPlanUnderlay | null>) => {
      const resolved =
        typeof next === "function"
          ? (
              next as (
                previous: FloorPlanUnderlay | null
              ) => FloorPlanUnderlay | null
            )(floorPlanUnderlayRef.current)
          : next;
      floorPlanUnderlayRef.current = resolved;
      setFloorPlanUnderlayState(resolved);
    },
    [setFloorPlanUnderlayState]
  );

  return {
    state: {
      floorPlanUnderlay: workflow.floorPlanUnderlay,
      floorPlanCalibrationMode: workflow.floorPlanCalibrationMode,
      floorPlanCalibrationPoints: workflow.floorPlanCalibrationPoints,
      floorPlanCalibrationDistanceInput:
        workflow.floorPlanCalibrationDistanceInput,
      floorPlanTraceRoomMode: workflow.floorPlanTraceRoomMode,
      floorPlanDrawRoomMode: workflow.floorPlanDrawRoomMode,
      floorPlanDrawAngleLockMode: workflow.floorPlanDrawAngleLockMode,
      floorPlanExactWallLengthInput: workflow.floorPlanExactWallLengthInput,
      floorPlanTraceRoomPoints: workflow.floorPlanTraceRoomPoints,
      blankGridRoomPreviewPoint: workflow.blankGridRoomPreviewPoint,
      floorPlanTraceRoomType: workflow.floorPlanTraceRoomType,
      floorPlanTraceOpeningMode: workflow.floorPlanTraceOpeningMode,
      floorPlanTraceOpeningPoints: workflow.floorPlanTraceOpeningPoints,
      floorPlanTraceOpeningKind: workflow.floorPlanTraceOpeningKind,
      floorPlanPdfSourceReady: workflow.floorPlanPdfSourceReady,
      floorPlanPdfRenderingPage: workflow.floorPlanPdfRenderingPage,
      floorPlanCalibrationSummary: workflow.floorPlanCalibrationSummary,
      blankGridRoomDrawActive: workflow.blankGridRoomDrawActive,
      activeFloorPlanTool: workflow.activeFloorPlanTool,
    },
    actions: {
      setFloorPlanUnderlay,
      setFloorPlanCalibrationPoints: workflow.setFloorPlanCalibrationPoints,
      setFloorPlanCalibrationDistanceInput:
        workflow.setFloorPlanCalibrationDistanceInput,
      setFloorPlanTraceRoomMode: workflow.setFloorPlanTraceRoomMode,
      setFloorPlanDrawAngleLockMode: workflow.setFloorPlanDrawAngleLockMode,
      setFloorPlanExactWallLengthInput:
        workflow.setFloorPlanExactWallLengthInput,
      setFloorPlanTraceRoomPoints: workflow.setFloorPlanTraceRoomPoints,
      setBlankGridRoomPreviewPoint: workflow.setBlankGridRoomPreviewPoint,
      setFloorPlanTraceRoomType: workflow.setFloorPlanTraceRoomType,
      setFloorPlanTraceOpeningMode: workflow.setFloorPlanTraceOpeningMode,
      setFloorPlanTraceOpeningPoints: workflow.setFloorPlanTraceOpeningPoints,
      setFloorPlanTraceOpeningKind: workflow.setFloorPlanTraceOpeningKind,
      setFloorPlanPdfSourceReady: workflow.setFloorPlanPdfSourceReady,
      setFloorPlanPdfRenderingPage: workflow.setFloorPlanPdfRenderingPage,
      resetFloorPlanCalibration: workflow.resetFloorPlanCalibration,
      resetFloorPlanInteraction: workflow.resetFloorPlanInteraction,
      activateFloorPlanSelectTool: workflow.activateFloorPlanSelectTool,
      activateFloorPlanCalibrationMode:
        workflow.activateFloorPlanCalibrationMode,
      activateFloorPlanRoomTrace: workflow.activateFloorPlanRoomTrace,
      activateFloorPlanRoomDrawMode: workflow.activateFloorPlanRoomDrawMode,
      activateFloorPlanOpeningTrace: workflow.activateFloorPlanOpeningTrace,
      clearFloorPlanTraceBuffers: workflow.clearFloorPlanTraceBuffers,
      revokeFloorPlanUnderlayUrl,
    },
    refs: {
      floorPlanUnderlayRef,
      floorPlanUnderlayUrlRef,
      floorPlanPdfSourceDataRef,
    },
    restoreActions: {
      setFloorPlanUnderlayState,
    },
  };
}

export function useDesignPageSnapshotDocumentState() {
  const defaultSnapshot = migrateToV3({
    items: [],
    zones: [],
    roomBounds: {
      width: ROOM_DIMENSION_DEFAULTS.width,
      depth: ROOM_DIMENSION_DEFAULTS.depth,
      wallThickness: ROOM_DIMENSION_DEFAULTS.wallThickness,
      height: ROOM_DIMENSION_DEFAULTS.roomHeight,
    },
  } as unknown as DesignSnapshot);

  const [designSnapshot, setDesignSnapshotState] =
    useState<DesignSnapshot>(defaultSnapshot);
  const designSnapshotRef = useRef(designSnapshot);
  const setDesignSnapshot = useCallback(
    (
      next:
        | DesignSnapshot
        | ((previous: DesignSnapshot) => DesignSnapshot)
    ) => {
      const resolved =
        typeof next === "function"
          ? (next as (previous: DesignSnapshot) => DesignSnapshot)(
              designSnapshotRef.current
            )
          : next;
      designSnapshotRef.current = resolved;
      setDesignSnapshotState(resolved);
    },
    []
  );
  const [localBackupHydrated, setLocalBackupHydrated] = useState(false);

  return {
    state: { designSnapshot, localBackupHydrated },
    actions: { setDesignSnapshot, setLocalBackupHydrated },
    refs: { designSnapshotRef },
  };
}

export type UseDesignPageDocumentRefSynchronizationInput = {
  state: {
    designSnapshot: DesignSnapshot;
    planOpenings: RoomOpening2D[];
    planAnnotations: EditorAnnotation2D[];
    planFixedElements: FixedElement2D[];
    planTheme: PlanTheme;
    planLayers: PlanLayers;
    planLayerPreset: PlanLayerPresetId;
    planMeasurementUnit: PlanMeasurementUnit;
    exportStylePreset: ExportStylePreset;
    floorPlanUnderlay: FloorPlanUnderlay | null;
  };
  actions: {
    setDesignSnapshot: (
      next:
        | DesignSnapshot
        | ((previous: DesignSnapshot) => DesignSnapshot)
    ) => void;
    setPlanAnnotationsState: Dispatch<SetStateAction<EditorAnnotation2D[]>>;
    setPlanFixedElementsState: Dispatch<SetStateAction<FixedElement2D[]>>;
    setPlanOpeningsState: Dispatch<SetStateAction<RoomOpening2D[]>>;
    setPlanThemeState: Dispatch<SetStateAction<PlanTheme>>;
    setPlanLayersState: Dispatch<SetStateAction<PlanLayers>>;
    setPlanLayerPresetState: Dispatch<SetStateAction<PlanLayerPresetId>>;
    setPlanMeasurementUnitState: Dispatch<SetStateAction<PlanMeasurementUnit>>;
    setExportStylePresetState: Dispatch<SetStateAction<ExportStylePreset>>;
    setFloorPlanUnderlayState: Dispatch<
      SetStateAction<FloorPlanUnderlay | null>
    >;
  };
  refs: {
    designSnapshotRef: { current: DesignSnapshot };
    planOpeningsRef: { current: RoomOpening2D[] };
    planAnnotationsRef: { current: EditorAnnotation2D[] };
    planFixedElementsRef: { current: FixedElement2D[] };
    planThemeRef: { current: PlanTheme };
    planLayersRef: { current: PlanLayers };
    planLayerPresetRef: { current: PlanLayerPresetId };
    planMeasurementUnitRef: { current: PlanMeasurementUnit };
    exportStylePresetRef: { current: ExportStylePreset };
    floorPlanUnderlayRef: { current: FloorPlanUnderlay | null };
  };
};

export function useDesignPageDocumentRefSynchronization({
  state,
  actions,
  refs,
}: UseDesignPageDocumentRefSynchronizationInput) {
  const {
    designSnapshot,
    planOpenings,
    planAnnotations,
    planFixedElements,
    planTheme,
    planLayers,
    planLayerPreset,
    planMeasurementUnit,
    exportStylePreset,
    floorPlanUnderlay,
  } = state;
  const {
    setDesignSnapshot,
    setPlanAnnotationsState,
    setPlanFixedElementsState,
    setPlanOpeningsState,
    setPlanThemeState,
    setPlanLayersState,
    setPlanLayerPresetState,
    setPlanMeasurementUnitState,
    setExportStylePresetState,
    setFloorPlanUnderlayState,
  } = actions;
  const {
    designSnapshotRef,
    planOpeningsRef,
    planAnnotationsRef,
    planFixedElementsRef,
    planThemeRef,
    planLayersRef,
    planLayerPresetRef,
    planMeasurementUnitRef,
    exportStylePresetRef,
    floorPlanUnderlayRef,
  } = refs;

  useEffect(() => {
    designSnapshotRef.current = designSnapshot;
  }, [designSnapshot, designSnapshotRef]);

  useEffect(() => {
    planOpeningsRef.current = planOpenings;
  }, [planOpenings, planOpeningsRef]);

  useEffect(() => {
    planAnnotationsRef.current = planAnnotations;
  }, [planAnnotations, planAnnotationsRef]);

  useEffect(() => {
    planFixedElementsRef.current = planFixedElements;
  }, [planFixedElements, planFixedElementsRef]);

  useEffect(() => {
    planThemeRef.current = planTheme;
  }, [planTheme, planThemeRef]);

  useEffect(() => {
    planLayersRef.current = planLayers;
  }, [planLayers, planLayersRef]);

  useEffect(() => {
    planLayerPresetRef.current = planLayerPreset;
  }, [planLayerPreset, planLayerPresetRef]);

  useEffect(() => {
    planMeasurementUnitRef.current = planMeasurementUnit;
  }, [planMeasurementUnit, planMeasurementUnitRef]);

  useEffect(() => {
    exportStylePresetRef.current = exportStylePreset;
  }, [exportStylePreset, exportStylePresetRef]);

  useEffect(() => {
    floorPlanUnderlayRef.current = floorPlanUnderlay;
  }, [floorPlanUnderlay, floorPlanUnderlayRef]);

  const captureHistorySnapshot = (): DesignPageHistorySnapshot => ({
    designSnapshot: designSnapshotRef.current,
    planAnnotations: planAnnotationsRef.current,
    planFixedElements: planFixedElementsRef.current,
    planOpenings: planOpeningsRef.current,
    planTheme: planThemeRef.current,
    planLayers: planLayersRef.current,
    planLayerPreset: planLayerPresetRef.current,
    planMeasurementUnit: planMeasurementUnitRef.current,
    exportStylePreset: exportStylePresetRef.current,
    floorPlanUnderlay: floorPlanUnderlayRef.current,
  });

  const restoreHistorySnapshot = (snapshot: DesignPageHistorySnapshot) => {
    designSnapshotRef.current = snapshot.designSnapshot;
    setDesignSnapshot(snapshot.designSnapshot);
    planAnnotationsRef.current = snapshot.planAnnotations;
    setPlanAnnotationsState(snapshot.planAnnotations);
    planFixedElementsRef.current = snapshot.planFixedElements;
    setPlanFixedElementsState(snapshot.planFixedElements);
    planOpeningsRef.current = snapshot.planOpenings;
    setPlanOpeningsState(snapshot.planOpenings);
    planThemeRef.current = snapshot.planTheme;
    setPlanThemeState(snapshot.planTheme);
    planLayersRef.current = snapshot.planLayers;
    setPlanLayersState(snapshot.planLayers);
    planLayerPresetRef.current = snapshot.planLayerPreset;
    setPlanLayerPresetState(snapshot.planLayerPreset);
    planMeasurementUnitRef.current = snapshot.planMeasurementUnit;
    setPlanMeasurementUnitState(snapshot.planMeasurementUnit);
    exportStylePresetRef.current = snapshot.exportStylePreset;
    setExportStylePresetState(snapshot.exportStylePreset);
    floorPlanUnderlayRef.current = snapshot.floorPlanUnderlay;
    setFloorPlanUnderlayState(snapshot.floorPlanUnderlay);
  };

  return {
    adapters: { captureHistorySnapshot, restoreHistorySnapshot },
  };
}
