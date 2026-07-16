"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HistoryManager } from "@/lib/historyManager";
import type { EditorAnnotation2D, FixedElement2D, RoomOpening2D } from "@/lib/editorScene";
import type { FloorPlanUnderlay } from "@/lib/floor-plan-types";
import type { DesignSnapshot } from "@/lib/room-types";
import type {
  ExportStylePreset,
  PlanLayers,
  PlanTheme,
} from "@/lib/useDesignPagePlanState";
import type {
  PlanLayerPresetId,
  PlanMeasurementUnit,
} from "@/lib/design-page-types";

export type DesignPageHistorySnapshot = {
  designSnapshot: DesignSnapshot;
  planAnnotations: EditorAnnotation2D[];
  planFixedElements: FixedElement2D[];
  planOpenings: RoomOpening2D[];
  planTheme: PlanTheme;
  planLayers: PlanLayers;
  planLayerPreset: PlanLayerPresetId;
  planMeasurementUnit: PlanMeasurementUnit;
  exportStylePreset: ExportStylePreset;
  floorPlanUnderlay: FloorPlanUnderlay | null;
};

export interface UseDesignPageHistoryInput {
  adapters: {
    captureSnapshot: () => DesignPageHistorySnapshot;
    restoreSnapshot: (snapshot: DesignPageHistorySnapshot) => void;
    onHistoryChange: () => void;
  };
}

export function useDesignPageHistory({ adapters }: UseDesignPageHistoryInput) {
  const { captureSnapshot, restoreSnapshot, onHistoryChange } = adapters;
  const [history] = useState(
    () => new HistoryManager(captureSnapshot, restoreSnapshot, onHistoryChange)
  );
  const coalescedCommitTimerRef = useRef<number | null>(null);
  const coalescedTransactionActiveRef = useRef(false);

  const flushCoalescedHistoryTransaction = useCallback(() => {
    if (coalescedCommitTimerRef.current !== null) {
      window.clearTimeout(coalescedCommitTimerRef.current);
      coalescedCommitTimerRef.current = null;
    }
    if (!coalescedTransactionActiveRef.current) return;
    history.commit();
    coalescedTransactionActiveRef.current = false;
  }, [history]);

  const runHistoryTransaction = useCallback(
    (name: string, action: () => void) => {
      flushCoalescedHistoryTransaction();
      try {
        history.begin(name);
        action();
        history.commit();
      } catch (error) {
        history.rollback();
        throw error;
      }
    },
    [flushCoalescedHistoryTransaction, history]
  );

  const runCoalescedHistoryTransaction = useCallback(
    (name: string, action: () => void, idleMs = 420) => {
      if (!coalescedTransactionActiveRef.current) {
        history.begin(name);
        coalescedTransactionActiveRef.current = true;
      }
      action();
      if (coalescedCommitTimerRef.current !== null) {
        window.clearTimeout(coalescedCommitTimerRef.current);
      }
      coalescedCommitTimerRef.current = window.setTimeout(() => {
        coalescedCommitTimerRef.current = null;
        if (!coalescedTransactionActiveRef.current) return;
        history.commit();
        coalescedTransactionActiveRef.current = false;
      }, idleMs);
    },
    [history]
  );

  useEffect(() => flushCoalescedHistoryTransaction, [flushCoalescedHistoryTransaction]);

  return {
    history,
    flushCoalescedHistoryTransaction,
    runHistoryTransaction,
    runCoalescedHistoryTransaction,
  };
}
