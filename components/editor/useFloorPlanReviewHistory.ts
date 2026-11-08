"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  emptyReviewHistory,
  recordReviewChange,
  redoReviewChange,
  undoReviewChange,
  type ReviewHistory,
} from "@/lib/floor-plan-review-history";

type Document = FloorPlanDocumentV2;

export type FloorPlanReviewHistoryControls = {
  canUndo: boolean;
  canRedo: boolean;
  /** How many times Undo or Redo has put back a document, for review state read from it. */
  restores: number;
  undo: () => void;
  redo: () => void;
};

/**
 * The upload review's corrections with undo and redo (`lib/floor-plan-review-history.ts`).
 *
 * `setCandidate` records a step for each correction. `replaceCandidate` is for a document the
 * server sends (the job opening, a new page, a detection retried): it starts the history afresh,
 * unless `keepHistory` (a saved draft comes back as it was sent). The buttons and the keyboard
 * shortcuts are `FloorPlanReviewHistoryControls.tsx`, shown while the review is open.
 */
export function useFloorPlanReviewHistory(
  candidate: Document | null,
  setRawCandidate: Dispatch<SetStateAction<Document | null>>
) {
  const [history, setHistory] = useState<ReviewHistory<Document>>(emptyReviewHistory);
  const [restores, setRestores] = useState(0);

  const setCandidate = useCallback<Dispatch<SetStateAction<Document | null>>>((update) => {
    const next = typeof update === "function" ? update(candidate) : update;
    if (next === candidate) return;
    const now = Date.now();
    if (candidate && next) setHistory((previous) => recordReviewChange(previous, candidate, now));
    else setHistory(emptyReviewHistory<Document>());
    setRawCandidate(next);
  }, [candidate, setRawCandidate]);

  const replaceCandidate = useCallback((next: Document | null, options: { keepHistory?: boolean } = {}) => {
    if (!options.keepHistory || !next) setHistory(emptyReviewHistory<Document>());
    setRawCandidate(next);
  }, [setRawCandidate]);

  const undo = useCallback(() => {
    if (!candidate) return;
    const step = undoReviewChange(history, candidate);
    if (!step) return;
    setHistory(step.history);
    setRestores((count) => count + 1);
    setRawCandidate(step.document);
  }, [candidate, history, setRawCandidate]);

  const redo = useCallback(() => {
    if (!candidate) return;
    const step = redoReviewChange(history, candidate);
    if (!step) return;
    setHistory(step.history);
    setRestores((count) => count + 1);
    setRawCandidate(step.document);
  }, [candidate, history, setRawCandidate]);

  const controls: FloorPlanReviewHistoryControls = {
    canUndo: history.past.length > 0, canRedo: history.future.length > 0, restores, undo, redo,
  };
  return { setCandidate, replaceCandidate, history: controls };
}
