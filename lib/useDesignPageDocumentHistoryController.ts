"use client";

import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { useUndoRedoHotkeys } from "@/hooks/useUndoRedoHotkeys";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { enrichDesignSnapshotProductSnapshots } from "@/lib/design-item-product-snapshot";
import { isPersistableFloorPlanAssetUrl } from "@/lib/design-page-floor-plan-utils";
import type { PlanLayerPresetId, PlanMeasurementUnit } from "@/lib/design-page-types";
import type {
  EditorAnnotation2D,
  FixedElement2D,
  RoomOpening2D,
} from "@/lib/editorScene";
import type { FloorPlanUnderlay } from "@/lib/floor-plan-types";
import {
  snapshotToStored,
  storedToSnapshot,
  type StoredDesign,
} from "@/lib/room-persistence";
import type { DesignSnapshot } from "@/lib/room-types";
import { fingerprintDesignSnapshot } from "@/lib/snapshot-fingerprint";
import {
  useDesignPageHistory,
  type DesignPageHistorySnapshot,
} from "@/lib/useDesignPageHistory";
import type {
  ExportStylePreset,
  PlanLayers,
  PlanTheme,
} from "@/lib/useDesignPagePlanState";

type FunctionalStateAction<T> = T | ((previous: T) => T);

export function useDesignPageHistoryRevision() {
  return useState(0);
}

export type UseDesignPageDocumentHistoryControllerInput = {
  state: {
    designSnapshot: DesignSnapshot;
    floorPlanUnderlay: FloorPlanUnderlay | null;
    planAnnotations: EditorAnnotation2D[];
    planOpenings: RoomOpening2D[];
    planFixedElements: FixedElement2D[];
  };
  adapters: {
    captureSnapshot: () => DesignPageHistorySnapshot;
    restoreSnapshot: (snapshot: DesignPageHistorySnapshot) => void;
    onHistoryChange: () => void;
  };
  actions: {
    setFloorPlanUnderlay: (
      next: FunctionalStateAction<FloorPlanUnderlay | null>
    ) => void;
    setPlanAnnotations: (
      next: FunctionalStateAction<EditorAnnotation2D[]>
    ) => void;
    setPlanOpenings: (next: FunctionalStateAction<RoomOpening2D[]>) => void;
    setPlanFixedElements: (
      next: FunctionalStateAction<FixedElement2D[]>
    ) => void;
    setFloorPlanPdfSourceReady: Dispatch<SetStateAction<boolean>>;
    resetFloorPlanInteraction: () => void;
    revokeFloorPlanUnderlayUrl: () => void;
  };
  refs: {
    designSnapshotRef: { current: DesignSnapshot };
    floorPlanPdfSourceDataRef: { current: ArrayBuffer | null };
  };
};
export function useDesignPageDocumentHistoryController({
  state: {
    designSnapshot,
    floorPlanUnderlay,
    planAnnotations,
    planOpenings,
    planFixedElements,
  },
  adapters,
  actions: {
    setFloorPlanUnderlay,
    setPlanAnnotations,
    setPlanOpenings,
    setPlanFixedElements,
    setFloorPlanPdfSourceReady,
    resetFloorPlanInteraction,
    revokeFloorPlanUnderlayUrl,
  },
  refs: { designSnapshotRef, floorPlanPdfSourceDataRef },
}: UseDesignPageDocumentHistoryControllerInput) {
  const {
    history,
    flushCoalescedHistoryTransaction,
    runHistoryTransaction,
    runCoalescedHistoryTransaction,
  } = useDesignPageHistory({ adapters });

  const buildPersistedFloorPlanState = useCallback(
    (): DesignSnapshot["floorPlan"] => {
      const canonical = designSnapshotRef.current.floorPlan;
      const underlay =
        floorPlanUnderlay &&
        isPersistableFloorPlanAssetUrl(floorPlanUnderlay.assetUrl)
          ? floorPlanUnderlay
          : null;

      if (
        !underlay &&
        planAnnotations.length === 0 &&
        planOpenings.length === 0 &&
        planFixedElements.length === 0 &&
        !canonical?.canonicalDocument
      ) {
        return undefined;
      }

      return {
        ...canonical,
        underlay,
        annotations: planAnnotations,
        openings: planOpenings,
        fixedElements: planFixedElements,
      };
    },
    [
      designSnapshotRef,
      floorPlanUnderlay,
      planAnnotations,
      planFixedElements,
      planOpenings,
    ]
  );

  const buildDesignSnapshotForPersistence = useCallback(
    (snapshot: DesignSnapshot = designSnapshotRef.current): DesignSnapshot => {
      const floorPlan = buildPersistedFloorPlanState();
      const nextSnapshot: DesignSnapshot = { ...snapshot };

      if (floorPlan) {
        nextSnapshot.floorPlan = floorPlan;
      } else {
        delete nextSnapshot.floorPlan;
      }

      return enrichDesignSnapshotProductSnapshots(nextSnapshot, CATALOG_ITEMS);
    },
    [buildPersistedFloorPlanState, designSnapshotRef]
  );

  const getStoredDesignForPersistence = useCallback(
    (snapshot: DesignSnapshot = designSnapshotRef.current) =>
      snapshotToStored(buildDesignSnapshotForPersistence(snapshot)),
    [buildDesignSnapshotForPersistence, designSnapshotRef]
  );

  const fingerprintStoredDesign = useCallback(
    (stored: StoredDesign) =>
      fingerprintDesignSnapshot(storedToSnapshot(stored)),
    []
  );

  const currentStoredDesignFingerprint = useMemo(
    () =>
      fingerprintStoredDesign(getStoredDesignForPersistence(designSnapshot)),
    [designSnapshot, fingerprintStoredDesign, getStoredDesignForPersistence]
  );

  const hydratePersistedFloorPlanState = useCallback(
    (snapshot: DesignSnapshot, clearWhenMissing = false) => {
      const floorPlan = snapshot.floorPlan;

      if (!floorPlan) {
        if (clearWhenMissing) {
          revokeFloorPlanUnderlayUrl();
          floorPlanPdfSourceDataRef.current = null;
          setFloorPlanPdfSourceReady(false);
          setFloorPlanUnderlay(null);
          setPlanAnnotations([]);
          setPlanOpenings([]);
          setPlanFixedElements([]);
        }
        return;
      }

      floorPlanPdfSourceDataRef.current = null;
      setFloorPlanPdfSourceReady(false);
      setFloorPlanUnderlay(
        floorPlan.underlay &&
          isPersistableFloorPlanAssetUrl(floorPlan.underlay.assetUrl)
          ? {
              ...floorPlan.underlay,
              opacity:
                typeof floorPlan.underlay.opacity === "number"
                  ? floorPlan.underlay.opacity
                  : 0.45,
              locked: floorPlan.underlay.locked ?? true,
            }
          : null
      );
      setPlanAnnotations(
        Array.isArray(floorPlan.annotations) ? floorPlan.annotations : []
      );
      setPlanOpenings(
        Array.isArray(floorPlan.openings) ? floorPlan.openings : []
      );
      setPlanFixedElements(
        Array.isArray(floorPlan.fixedElements) ? floorPlan.fixedElements : []
      );
      resetFloorPlanInteraction();
    },
    [
      floorPlanPdfSourceDataRef,
      resetFloorPlanInteraction,
      revokeFloorPlanUnderlayUrl,
      setFloorPlanPdfSourceReady,
      setFloorPlanUnderlay,
      setPlanAnnotations,
      setPlanFixedElements,
      setPlanOpenings,
    ]
  );

  return {
    state: { currentStoredDesignFingerprint },
    actions: {
      flushCoalescedHistoryTransaction,
      runHistoryTransaction,
      runCoalescedHistoryTransaction,
      hydratePersistedFloorPlanState,
    },
    refs: {
      history,
      getStoredDesignForPersistence,
      fingerprintStoredDesign,
    },
  };
}

type HistoryManager = ReturnType<typeof useDesignPageHistory>["history"];

export type UseDesignPageHistoryShortcutsInput = {
  state: { isClientPreview: boolean };
  actions: { flushCoalescedHistoryTransaction: () => void };
  refs: { history: HistoryManager };
};

export function useDesignPageHistoryShortcuts({
  state: { isClientPreview },
  actions: { flushCoalescedHistoryTransaction },
  refs: { history },
}: UseDesignPageHistoryShortcutsInput) {
  const canUndo = history.canUndo();
  const canRedo = history.canRedo();
  const undoName = history.getUndoName();
  const redoName = history.getRedoName();
  const historyStatus = history.getStatus();

  const undoSafe = useCallback(() => {
    if (isClientPreview) return;
    flushCoalescedHistoryTransaction();
    const label = history.undo();
    if (!label) return;
  }, [flushCoalescedHistoryTransaction, history, isClientPreview]);

  const redoSafe = useCallback(() => {
    if (isClientPreview) return;
    flushCoalescedHistoryTransaction();
    const label = history.redo();
    if (!label) return;
  }, [flushCoalescedHistoryTransaction, history, isClientPreview]);

  useUndoRedoHotkeys({ undo: undoSafe, redo: redoSafe });

  return {
    state: {
      canUndo,
      canRedo,
      undoName,
      redoName,
      historyStatus,
    },
    actions: { undoSafe, redoSafe },
  };
}

export type DesignPageDocumentHistoryPlanState = {
  planAnnotations: EditorAnnotation2D[];
  planTheme: PlanTheme;
  planLayers: PlanLayers;
  planLayerPreset: PlanLayerPresetId;
  planMeasurementUnit: PlanMeasurementUnit;
  exportStylePreset: ExportStylePreset;
};
