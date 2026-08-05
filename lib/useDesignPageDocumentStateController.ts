"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ROOM_DIMENSION_DEFAULTS,
} from "@/lib/design-page-house-plan";
import { track } from "@/lib/analytics";
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
import { hasCatalogRoomNavigationChanged } from "@/lib/catalog/filter-navigation";
import { useDesignPageFloorPlanAssets } from "@/lib/useDesignPageFloorPlanAssets";
import { useDesignPageFloorPlanWorkflowState } from "@/lib/useDesignPageFloorPlanWorkflowState";
import type { DesignPageHistorySnapshot } from "@/lib/useDesignPageHistory";
import {
  useDesignPagePlanState,
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
  const planMeasurementUnitRef = useRef(planMeasurementUnit);

  useEffect(() => {
    planMeasurementUnitRef.current = planMeasurementUnit;
  }, [planMeasurementUnit]);

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

  const setPlanMeasurementUnit = useCallback(
    (next: FunctionalStateAction<typeof planMeasurementUnit>) => {
      const previousUnit = planMeasurementUnitRef.current;
      const unit = typeof next === "function" ? next(previousUnit) : next;
      if (unit === previousUnit) return;
      planMeasurementUnitRef.current = unit;
      setPlanMeasurementUnitState(unit);
      track("display_unit_changed", {
        previous_unit: previousUnit,
        unit,
      });
    },
    [setPlanMeasurementUnitState]
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
      setPlanTheme: setPlanThemeState,
      setPlanLayers: setPlanLayersState,
      setPlanAnnotations,
      setPlanOpenings,
      setPlanFixedElements,
      setSimplePlanControls,
      setPlanLayerPreset: setPlanLayerPresetState,
      setPlanMeasurementUnit,
      setExportStylePreset: setExportStylePresetState,
      setPlanGuidedActionsEnabled,
      setPlanGuidedActionsChoiceSeen,
      markDefaultPlanOpeningsSeeded,
    },
    refs: {
      planOpeningsRef,
      planAnnotationsRef,
      planFixedElementsRef,
      defaultPlanOpeningsSeededRef,
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
      floorPlanTraceRoomModeRef: workflow.floorPlanTraceRoomModeRef,
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
  const [catalogRoomNavigationRevision, setCatalogRoomNavigationRevision] =
    useState(0);
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
      if (hasCatalogRoomNavigationChanged(designSnapshotRef.current, resolved)) {
        setCatalogRoomNavigationRevision((revision) => revision + 1);
      }
      designSnapshotRef.current = resolved;
      setDesignSnapshotState(resolved);
    },
    []
  );
  const [localBackupHydrated, setLocalBackupHydrated] = useState(false);

  return {
    state: { designSnapshot, catalogRoomNavigationRevision, localBackupHydrated },
    actions: { setDesignSnapshot, setLocalBackupHydrated },
    refs: { designSnapshotRef },
  };
}

export type UseDesignPageDocumentRefSynchronizationInput = {
  state: {
    planOpenings: RoomOpening2D[];
    planAnnotations: EditorAnnotation2D[];
    planFixedElements: FixedElement2D[];
    floorPlanUnderlay: FloorPlanUnderlay | null;
  };
  actions: {
    setDesignSnapshot: (
      next:
        | DesignSnapshot
        | ((previous: DesignSnapshot) => DesignSnapshot)
    ) => void;
    setPlanAnnotations: (
      next: FunctionalStateAction<EditorAnnotation2D[]>
    ) => void;
    setPlanFixedElements: (
      next: FunctionalStateAction<FixedElement2D[]>
    ) => void;
    setPlanOpenings: (next: FunctionalStateAction<RoomOpening2D[]>) => void;
    setFloorPlanUnderlay: (
      next: FunctionalStateAction<FloorPlanUnderlay | null>
    ) => void;
  };
  refs: {
    designSnapshotRef: { current: DesignSnapshot };
    planOpeningsRef: { current: RoomOpening2D[] };
    planAnnotationsRef: { current: EditorAnnotation2D[] };
    planFixedElementsRef: { current: FixedElement2D[] };
    floorPlanUnderlayRef: { current: FloorPlanUnderlay | null };
  };
};

export function useDesignPageDocumentRefSynchronization({
  state,
  actions,
  refs,
}: UseDesignPageDocumentRefSynchronizationInput) {
  const { planOpenings, planAnnotations, planFixedElements, floorPlanUnderlay } =
    state;
  const {
    setDesignSnapshot,
    setPlanAnnotations,
    setPlanFixedElements,
    setPlanOpenings,
    setFloorPlanUnderlay,
  } = actions;
  const {
    designSnapshotRef,
    planOpeningsRef,
    planAnnotationsRef,
    planFixedElementsRef,
    floorPlanUnderlayRef,
  } = refs;

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
    floorPlanUnderlayRef.current = floorPlanUnderlay;
  }, [floorPlanUnderlay, floorPlanUnderlayRef]);

  const captureHistorySnapshot = (): DesignPageHistorySnapshot => ({
    designSnapshot: designSnapshotRef.current,
    planAnnotations: planAnnotationsRef.current,
    planFixedElements: planFixedElementsRef.current,
    planOpenings: planOpeningsRef.current,
    floorPlanUnderlay: floorPlanUnderlayRef.current,
  });

  const restoreHistorySnapshot = (snapshot: DesignPageHistorySnapshot) => {
    setDesignSnapshot(snapshot.designSnapshot);
    setPlanAnnotations(snapshot.planAnnotations);
    setPlanFixedElements(snapshot.planFixedElements);
    setPlanOpenings(snapshot.planOpenings);
    setFloorPlanUnderlay(snapshot.floorPlanUnderlay);
  };

  return {
    adapters: { captureHistorySnapshot, restoreHistorySnapshot },
  };
}
