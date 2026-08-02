"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  decideFloorPlanAdminReviewReload,
} from "@/lib/floor-plan-admin-review-draft";
import {
  subscribeToFloorPlanAdminJobMutationCancellations,
  subscribeToFloorPlanAdminJobMutationRequests,
  subscribeToFloorPlanAdminJobUpdates,
} from "@/lib/floor-plan-admin-review-events";

type Reload = (canHydrate?: () => boolean) => Promise<boolean>;

export function useFloorPlanReviewDraftGuard(input: {
  jobId: string;
  baselineFingerprint: string | null;
  draftFingerprint: string;
  reload: Reload;
  onError: (message: string) => void;
  onPreserved: (message: string) => void;
}) {
  const currentFingerprintRef = useRef(input.draftFingerprint);
  const baselineFingerprintRef = useRef(input.baselineFingerprint);
  const confirmedMutationsRef = useRef(new Map<string, string>());
  const reloadRef = useRef(input.reload);
  const onErrorRef = useRef(input.onError);
  const onPreservedRef = useRef(input.onPreserved);

  useLayoutEffect(() => {
    currentFingerprintRef.current = input.draftFingerprint;
    baselineFingerprintRef.current = input.baselineFingerprint;
    reloadRef.current = input.reload;
    onErrorRef.current = input.onError;
    onPreservedRef.current = input.onPreserved;
  }, [
    input.baselineFingerprint,
    input.draftFingerprint,
    input.onError,
    input.onPreserved,
    input.reload,
  ]);

  const hasUnsavedChanges =
    input.baselineFingerprint !== null &&
    input.draftFingerprint !== input.baselineFingerprint;

  const reloadExactDraft = useCallback(
    async (expectedFingerprint: string) => {
      const hydrated = await reloadRef.current(
        () => currentFingerprintRef.current === expectedFingerprint
      );
      if (!hydrated) {
        onPreservedRef.current(
          "New edits were made while the server update was loading, so they were kept. Refresh again when you are ready to discard them."
        );
      }
      return hydrated;
    },
    []
  );

  useEffect(() => {
    const unsubscribeRequests = subscribeToFloorPlanAdminJobMutationRequests(
      input.jobId,
      (detail) => {
        const currentFingerprint = currentFingerprintRef.current;
        if (currentFingerprint === baselineFingerprintRef.current) return true;
        const accepted = window.confirm(
          `You have unsaved candidate or review changes. ${detail.actionLabel} will replace the server candidate and discard those changes. Continue?`
        );
        if (accepted) {
          confirmedMutationsRef.current.set(detail.mutationId, currentFingerprint);
        }
        return accepted;
      }
    );
    const unsubscribeCancellations =
      subscribeToFloorPlanAdminJobMutationCancellations(input.jobId, (detail) => {
        if (detail.mutationId) confirmedMutationsRef.current.delete(detail.mutationId);
      });
    const unsubscribeUpdates = subscribeToFloorPlanAdminJobUpdates(
      input.jobId,
      (detail) => {
        if (detail.origin === "review_workspace") return;
        const confirmedFingerprint = detail.mutationId
          ? confirmedMutationsRef.current.get(detail.mutationId)
          : null;
        const currentFingerprint = currentFingerprintRef.current;
        const decision = decideFloorPlanAdminReviewReload({
          baselineFingerprint: baselineFingerprintRef.current,
          currentFingerprint,
          confirmedFingerprint,
        });
        if (detail.mutationId) {
          confirmedMutationsRef.current.delete(detail.mutationId);
        }
        if (decision === "preserve") {
          onPreservedRef.current(
            "The server import changed, but your unsaved candidate and review edits were kept. Save them first, or use Refresh to discard them explicitly."
          );
          return;
        }
        void reloadExactDraft(currentFingerprint).catch((cause: unknown) =>
          onErrorRef.current(cause instanceof Error ? cause.message : "Unable to refresh import")
        );
      }
    );
    return () => {
      unsubscribeRequests();
      unsubscribeCancellations();
      unsubscribeUpdates();
    };
  }, [input.jobId, reloadExactDraft]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const preventAccidentalNavigation = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventAccidentalNavigation);
    return () => window.removeEventListener("beforeunload", preventAccidentalNavigation);
  }, [hasUnsavedChanges]);

  const guardedReload = useCallback(async () => {
    const currentFingerprint = currentFingerprintRef.current;
    if (
      currentFingerprint !== baselineFingerprintRef.current &&
      !window.confirm(
        "Discard your unsaved candidate and review changes and load the latest server version?"
      )
    ) {
      return false;
    }
    return reloadExactDraft(currentFingerprint);
  }, [reloadExactDraft]);

  return { guardedReload, hasUnsavedChanges };
}
