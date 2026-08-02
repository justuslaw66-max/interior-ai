"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DesignValidationFeedbackProps } from "@/components/editor/design-page/DesignValidationFeedback";
import { track } from "@/lib/analytics";
import { buildDesignEditorUrl } from "@/lib/design-editor-url";
import { reorientConsumerFloorPlanDesign } from "@/lib/floor-plan-consumer-orientation";
import type { DesignPageCoreShellRegistration } from "@/lib/useDesignPageCoreShellRegistration";
import type { DesignPageDocumentSelectionRegistrationFacade } from "@/lib/useDesignPageDocumentSelectionRegistrationFacade";
import type { DesignPagePersistenceWorkspaceRegistration } from "@/lib/useDesignPagePersistenceWorkspaceRegistration";

type FloorPlanOrientationValidation = NonNullable<
  DesignValidationFeedbackProps["floorPlanOrientation"]
>;
type FloorPlanRevisionUpdateValidation = NonNullable<
  DesignValidationFeedbackProps["floorPlanRevisionUpdate"]
>;

type AvailableFloorPlanRevisionUpdate = {
  currentRevisionId: string;
  revisionId: string;
  diff: { summary: string };
  preservation: {
    mappedRoomCount: number;
    unmappedRoomCount: number;
    preservedItemCount: number;
    skippedItemCount: number;
  };
};

export type UseDesignPageFloorPlanLifecycleRegistrationInput = {
  boundaries: {
    coreShell: DesignPageCoreShellRegistration;
    documentSelection: DesignPageDocumentSelectionRegistrationFacade;
    persistence: DesignPagePersistenceWorkspaceRegistration;
  };
};

const revisionUpdateKey = (update: AvailableFloorPlanRevisionUpdate) =>
  `${update.currentRevisionId}:${update.revisionId}`;
const revisionCopySuperseded = Symbol("revision-copy-superseded");
const assertCurrentRevisionCopy = (ref: { current: number }, operationId: number) => {
  if (operationId !== ref.current) throw revisionCopySuperseded;
};

/**
 * Owns address-orientation confirmation and immutable floor-plan revision-copy
 * behavior. The workspace only consumes the two validation feedback models;
 * document history and persistence remain behind their established boundaries.
 */
export function useDesignPageFloorPlanLifecycleRegistration({
  boundaries: { coreShell, documentSelection, persistence },
}: UseDesignPageFloorPlanLifecycleRegistrationInput) {
  const base = coreShell.boundaries.base;
  const viewportShell = coreShell.boundaries.viewportShell;
  const snapshotDocument = coreShell.boundaries.snapshotDocument;
  const documentRoom = documentSelection.boundaries.documentRoom;
  const designSnapshot = snapshotDocument.state.designSnapshot;
  const designId = base.state.identity.designId;
  const sessionUser = base.state.identity.session?.user;
  const showRuleToast = coreShell.actions.feedback.showRuleToast;
  const setDesignSnapshot = snapshotDocument.actions.setDesignSnapshot;
  const { setPlanOpenings, setPlanFixedElements } =
    viewportShell.boundaries.planDocument.actions;
  const history = documentRoom.refs.documentHistory.history;
  const { preserveCurrentDesign, loadDesign } =
    persistence.actions.persistence;

  const [revisionUpdate, setRevisionUpdate] = useState<AvailableFloorPlanRevisionUpdate | null>(null);
  const [dismissedRevisionUpdateKey, setDismissedRevisionUpdateKey] = useState<string | null>(null);
  const [creatingRevisionCopy, setCreatingRevisionCopy] = useState(false);
  const [revisionCopyError, setRevisionCopyError] = useState<string | null>(null);
  const revisionCopyOperationRef = useRef(0); useEffect(() => () => { revisionCopyOperationRef.current += 1; }, []);

  const revisionUpdateSourceKey = (() => {
    const binding = designSnapshot.floorPlan?.addressBinding;
    const revisionId = designSnapshot.floorPlan?.revisionId;
    if (!designId || !binding || !revisionId) return null;
    return JSON.stringify([
      designId,
      revisionId,
      binding.countryCode,
      binding.addressNormalized,
      binding.block,
      binding.street,
      binding.postalCode,
      binding.stack,
      binding.floorMin,
      binding.floorMax,
      binding.transform,
      binding.unitFloor,
      binding.unitStack,
    ]);
  })();

  useEffect(() => {
    setRevisionUpdate(null);
    setRevisionCopyError(null);
    if (!revisionUpdateSourceKey || !designId || !sessionUser) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/designs/${designId}/floor-plan-update`, {
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const payload = (await response.json().catch(() => null)) as {
          update?: AvailableFloorPlanRevisionUpdate | null;
        } | null;
        if (!response.ok || controller.signal.aborted || !payload?.update) return;
        if (revisionUpdateKey(payload.update) === dismissedRevisionUpdateKey) return;
        setRevisionUpdate(payload.update);
      } catch (cause) {
        if (!controller.signal.aborted) {
          console.warn("Floor-plan revision update check failed", cause);
        }
      }
    })();
    return () => controller.abort();
  }, [
    designId,
    dismissedRevisionUpdateKey,
    revisionUpdateSourceKey,
    sessionUser,
  ]);

  const dismissRevisionUpdate = useCallback(() => {
    if (revisionUpdate) {
      setDismissedRevisionUpdateKey(revisionUpdateKey(revisionUpdate));
    }
    setRevisionUpdate(null);
    setRevisionCopyError(null);
  }, [revisionUpdate]);

  const confirmOrientation = useCallback(() => {
    setDesignSnapshot((current) => {
      if (!current.floorPlan?.canonicalDocument) return current;
      return {
        ...current,
        floorPlan: { ...current.floorPlan, orientationConfirmed: true },
      };
    });
    showRuleToast("Floor-plan orientation confirmed");
  }, [setDesignSnapshot, showRuleToast]);

  const changeOrientation = useCallback<
    FloorPlanOrientationValidation["onTransform"]
  >(
    (transform) => {
      try {
        const reoriented = reorientConsumerFloorPlanDesign(
          snapshotDocument.refs.designSnapshotRef.current,
          transform
        );
        history.begin("Change floor-plan orientation");
        setDesignSnapshot(reoriented.snapshot);
        setPlanOpenings(reoriented.openings);
        setPlanFixedElements(reoriented.fixedElements);
        history.commit();
        showRuleToast("Floor-plan orientation updated and confirmed");
      } catch (cause) {
        showRuleToast(
          cause instanceof Error
            ? cause.message
            : "Floor-plan orientation could not be changed"
        );
      }
    },
    [
      history,
      setDesignSnapshot,
      setPlanFixedElements,
      setPlanOpenings,
      showRuleToast,
      snapshotDocument.refs.designSnapshotRef,
    ]
  );

  const createUpdatedCopy = useCallback(async () => {
    if (!designId || !revisionUpdate || creatingRevisionCopy) return;
    const operationId = ++revisionCopyOperationRef.current;
    setCreatingRevisionCopy(true);
    setRevisionCopyError(null);
    try {
      const preserved = await preserveCurrentDesign();
      assertCurrentRevisionCopy(revisionCopyOperationRef, operationId);
      if (!preserved.ok) throw new Error(preserved.error);

      const response = await fetch(`/api/designs/${designId}/floor-plan-update`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ revisionId: revisionUpdate.revisionId }),
      });
      const payload = (await response.json().catch(() => null)) as {
        id?: unknown;
        error?: unknown;
      } | null;
      assertCurrentRevisionCopy(revisionCopyOperationRef, operationId);
      if (!response.ok || typeof payload?.id !== "string") {
        if (response.status === 403) base.actions.dialogs.setShowUpgrade(true);
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "The updated design copy could not be created."
        );
      }

      setDismissedRevisionUpdateKey(revisionUpdateKey(revisionUpdate));
      setRevisionUpdate(null);
      const loaded = await loadDesign(payload.id);
      assertCurrentRevisionCopy(revisionCopyOperationRef, operationId);
      if (loaded === "loaded") {
        base.derived.navigation.router.push(buildDesignEditorUrl({ designId: payload.id, context: base.derived.navigation.searchParams }));
      }
      showRuleToast("Updated floor-plan copy created; the original design is unchanged");
      track("floor_plan_revision_copy_opened", {
        source_design_id: designId,
        copied_design_id: payload.id,
        from_revision_id: revisionUpdate.currentRevisionId,
        to_revision_id: revisionUpdate.revisionId,
        loaded,
      });
    } catch (cause) {
      if (cause !== revisionCopySuperseded && operationId === revisionCopyOperationRef.current) setRevisionCopyError(
        cause instanceof Error
          ? cause.message
          : "The updated design copy could not be created."
      );
    } finally {
      if (operationId === revisionCopyOperationRef.current) setCreatingRevisionCopy(false);
    }
  }, [
    base.actions.dialogs, base.derived.navigation.router, base.derived.navigation.searchParams,
    creatingRevisionCopy,
    designId,
    loadDesign,
    preserveCurrentDesign,
    revisionUpdate,
    showRuleToast,
  ]);

  const floorPlanOrientation: FloorPlanOrientationValidation = {
    pending: Boolean(
      designSnapshot.floorPlan?.canonicalDocument &&
        designSnapshot.floorPlan.orientationConfirmed !== true
    ),
    transformLabel: (
      designSnapshot.floorPlan?.addressTransform ?? "normal"
    ).replaceAll("_", " "),
    currentTransform: designSnapshot.floorPlan?.addressTransform ?? "normal",
    onConfirm: confirmOrientation,
    onTransform: changeOrientation,
  };
  const floorPlanRevisionUpdate: FloorPlanRevisionUpdateValidation | null =
    revisionUpdate
      ? {
          currentRevisionId: revisionUpdate.currentRevisionId,
          revisionId: revisionUpdate.revisionId,
          diffSummary: revisionUpdate.diff.summary,
          mappedRoomCount: revisionUpdate.preservation.mappedRoomCount,
          unmappedRoomCount: revisionUpdate.preservation.unmappedRoomCount,
          preservedItemCount: revisionUpdate.preservation.preservedItemCount,
          skippedItemCount: revisionUpdate.preservation.skippedItemCount,
          creatingCopy: creatingRevisionCopy,
          errorMessage: revisionCopyError,
          onDismiss: dismissRevisionUpdate,
          onCreateUpdatedCopy: createUpdatedCopy,
        }
      : null;

  return {
    boundaries: { coreShell, documentSelection, persistence },
    state: { revisionUpdate, creatingRevisionCopy, revisionCopyError },
    derived: {
      validation: { floorPlanOrientation, floorPlanRevisionUpdate },
    },
    configuration: {},
    refs: { designSnapshot: snapshotDocument.refs.designSnapshotRef },
    actions: {
      orientation: { confirm: confirmOrientation, change: changeOrientation },
      revisionUpdate: {
        dismiss: dismissRevisionUpdate,
        createUpdatedCopy,
      },
    },
  };
}

export type DesignPageFloorPlanLifecycleRegistration = ReturnType<
  typeof useDesignPageFloorPlanLifecycleRegistration
>;
