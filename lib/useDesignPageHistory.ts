"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HistoryManager } from "@/lib/historyManager";
import type { EditorAnnotation2D, FixedElement2D, RoomOpening2D } from "@/lib/editorScene";
import type { FloorPlanUnderlay } from "@/lib/floor-plan-types";
import type { DesignSnapshot } from "@/lib/room-types";

export type DesignPageHistorySnapshot = {
  designSnapshot: DesignSnapshot;
  planAnnotations: EditorAnnotation2D[];
  planFixedElements: FixedElement2D[];
  planOpenings: RoomOpening2D[];
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
    <TResult,>(name: string, action: () => TResult): TResult => {
      flushCoalescedHistoryTransaction();
      return history.executeCommand({
        id: "document-transaction",
        description: name,
        input: null,
        execute: action,
      });
    },
    [flushCoalescedHistoryTransaction, history]
  );

  const runCoalescedHistoryTransaction = useCallback(
    (name: string, action: () => void, idleMs = 420) => {
      if (!coalescedTransactionActiveRef.current) {
        if (!history.begin(name)) {
          throw new Error(`Cannot start coalesced history transaction "${name}"`);
        }
        coalescedTransactionActiveRef.current = true;
      }
      try {
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
      } catch (error) {
        if (coalescedCommitTimerRef.current !== null) {
          window.clearTimeout(coalescedCommitTimerRef.current);
          coalescedCommitTimerRef.current = null;
        }
        if (coalescedTransactionActiveRef.current) history.rollback();
        coalescedTransactionActiveRef.current = false;
        throw error;
      }
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
