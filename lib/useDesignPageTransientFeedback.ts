"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ConstraintResult } from "@/lib/constraints/evaluate";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";

export function useDesignPageTransientFeedback({
  isClientPreview,
  editorMode,
}: {
  isClientPreview: boolean;
  editorMode: DesignPageEditorMode;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const [constraintResults, setConstraintResults] = useState<ConstraintResult[]>([]);
  const [confidence, setConfidence] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const constraintTimerRef = useRef<number | null>(null);
  const confidenceTimerRef = useRef<number | null>(null);
  const confidenceDismissTimerRef = useRef<number | null>(null);

  const showToast = useCallback(
    (message: string) => {
      if (isClientPreview) return;
      setToast(message);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, 1500);
    },
    [isClientPreview]
  );

  const showConstraints = useCallback(
    (results: ConstraintResult[]) => {
      if (isClientPreview || editorMode !== "design") return;
      setConstraintResults(results);
      if (constraintTimerRef.current) window.clearTimeout(constraintTimerRef.current);
      constraintTimerRef.current = window.setTimeout(() => {
        setConstraintResults([]);
        constraintTimerRef.current = null;
      }, 1800);
    },
    [editorMode, isClientPreview]
  );

  const showConfidence = useCallback(
    (results: ConstraintResult[]) => {
      if (isClientPreview || editorMode !== "design") return;
      const issueCount = results.filter((item) => item.level !== "ok").length;
      const message =
        issueCount === 0
          ? "Layout looks good"
          : issueCount === 1
            ? "1 spacing issue detected"
            : `${issueCount} spacing issues detected`;
      if (confidenceTimerRef.current) window.clearTimeout(confidenceTimerRef.current);
      if (confidenceDismissTimerRef.current) {
        window.clearTimeout(confidenceDismissTimerRef.current);
        confidenceDismissTimerRef.current = null;
      }
      confidenceTimerRef.current = window.setTimeout(() => {
        setConfidence(message);
        confidenceTimerRef.current = null;
        confidenceDismissTimerRef.current = window.setTimeout(() => {
          setConfidence(null);
          confidenceDismissTimerRef.current = null;
        }, 1500);
      }, 700);
    },
    [editorMode, isClientPreview]
  );

  const errors = constraintResults.filter((item) => item.level === "error");
  const warnings = constraintResults.filter((item) => item.level === "warn");
  const visibleConstraints = errors.length
    ? [errors[0]]
    : warnings.length
      ? warnings.slice(0, 2)
      : constraintResults.filter((item) => item.level === "ok").slice(0, 1);

  useEffect(
    () => () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (constraintTimerRef.current) window.clearTimeout(constraintTimerRef.current);
      if (confidenceTimerRef.current) window.clearTimeout(confidenceTimerRef.current);
      if (confidenceDismissTimerRef.current) {
        window.clearTimeout(confidenceDismissTimerRef.current);
      }
    },
    []
  );

  return {
    state: { toast, confidence, constraintResults, visibleConstraints },
    actions: { showToast, showConstraints, showConfidence },
  };
}
