"use client";

import { CATALOG_ITEMS } from "@/lib/catalog";
import type { DesignPageCoreShellRegistration } from "@/lib/useDesignPageCoreShellRegistration";
import type { DesignPageDocumentSelectionRegistrationFacade } from "@/lib/useDesignPageDocumentSelectionRegistrationFacade";
import {
  DESIGN_PAGE_LOCAL_BACKUP_STORAGE_KEY,
  useDesignPageLocalBackupHydration,
} from "@/lib/useDesignPageLocalBackupHydration";
import { useDesignPagePresentationExportRuntime } from "@/lib/useDesignPagePresentationExportRuntime";

export type UseDesignPagePresentationBackupRegistrationFacadeInput = {
  boundaries: {
    coreShell: DesignPageCoreShellRegistration;
    documentSelection: DesignPageDocumentSelectionRegistrationFacade;
  };
};

/**
 * Registers presentation/export immediately before mount-time local-backup
 * hydration, adapting the core shell rather than repeating route, viewport,
 * snapshot, or persistence-bridge inputs in the workspace.
 */
export function useDesignPagePresentationBackupRegistrationFacade({
  boundaries: { coreShell, documentSelection },
}: UseDesignPagePresentationBackupRegistrationFacadeInput) {
  const {
    boundaries: { base, viewportShell },
    actions: {
      paywall: { logFunnelEvent },
      feedback: { showRuleToast },
    },
    refs: {
      localBackupPersistenceActionsRef,
      localBackupPlanningResolverRef,
    },
  } = coreShell;
  const { planViewport, editorShell } = viewportShell.boundaries;
  const { snapshotDocument, documentRoom } =
    documentSelection.boundaries;

  const exportRuntime = useDesignPagePresentationExportRuntime({
    state: {
      access: { isDesigner: coreShell.derived.access.isDesigner },
      editor: {
        editorMode: editorShell.state.editor.editorMode,
        viewMode: base.state.editor.viewMode,
      },
      shopping: {
        hoveredCartInstanceId:
          editorShell.state.cart.hoveredCartInstanceId,
      },
      document: { items: documentRoom.derived.room.items },
      presentation: {
        designId: base.state.identity.designId,
        plan: base.state.access.plan,
        exportStylePreset:
          planViewport.state.plan.exportStylePreset,
        sceneReady: documentSelection.boundaries.sceneRoomRead.state.scene.sceneReady,
        cameraView: planViewport.state.camera.cameraView,
        clientPreview: base.state.access.clientPreview,
      },
    },
    actions: {
      setClientPreview: base.actions.access.setClientPreview,
      transitionToCameraView:
        planViewport.actions.camera.navigation.transitionToCameraView,
      setUpgradeReason: base.actions.paywall.setUpgradeReason,
      setShowUpgrade: base.actions.dialogs.setShowUpgrade,
      updateProjection:
        planViewport.actions.camera.navigation.updateProjection,
      showToast: showRuleToast,
      logFunnelEvent,
    },
    refs: {
      canvas: planViewport.refs.camera.canvas,
      camera: planViewport.refs.camera.camera,
      controls: planViewport.refs.camera.controls,
      renderer: planViewport.refs.camera.renderer,
      scene: planViewport.refs.camera.scene,
      designSnapshot: snapshotDocument.refs.designSnapshotRef,
    },
  });

  const localBackupRecovery = useDesignPageLocalBackupHydration({
    state: {
      roomWidth: documentRoom.derived.room.roomWidth,
      roomDepth: documentRoom.derived.room.roomDepth,
      wallThickness: documentRoom.derived.room.wallThickness,
    },
    configuration: {
      storageKey: DESIGN_PAGE_LOCAL_BACKUP_STORAGE_KEY,
      catalogItems: CATALOG_ITEMS,
      resolveConfiguredPlanningDimsMm: (...args) =>
        localBackupPlanningResolverRef.current(...args),
    },
    refs: { designSnapshot: snapshotDocument.refs.designSnapshotRef },
    actions: {
      setDesignSnapshot: snapshotDocument.actions.setDesignSnapshot,
      setDesignId: base.actions.identity.setDesignId,
      setShareToken: base.actions.identity.setShareToken,
      setShareEnabled: base.actions.identity.setShareEnabled,
      setLocalBackupHydrated:
        snapshotDocument.actions.setLocalBackupHydrated,
      setSavedViews: planViewport.actions.camera.setSavedViews,
      hydratePersistedFloorPlanState:
        documentRoom.actions.history.hydratePersistedFloorPlanState,
      clearHistory: () =>
        documentRoom.refs.documentHistory.history.clear(),
      loadDesign: (...args) =>
        localBackupPersistenceActionsRef.current.loadDesign(...args),
      clearPersistedSnapshotFingerprint: () =>
        localBackupPersistenceActionsRef.current.clearPersistedSnapshotFingerprint(),
    },
  });

  return {
    boundaries: {
      coreShell,
      documentSelection,
      exportRuntime,
      localBackupRecovery,
    },
    state: {
      ...exportRuntime.state,
      localBackupRecovery: localBackupRecovery.state,
    },
    derived: {
      document: {
        roomWidth: documentRoom.derived.room.roomWidth,
        roomDepth: documentRoom.derived.room.roomDepth,
        wallThickness: documentRoom.derived.room.wallThickness,
      },
    },
    configuration: {
      localBackupStorageKey: DESIGN_PAGE_LOCAL_BACKUP_STORAGE_KEY,
    },
    refs: {
      localBackupPersistenceActionsRef,
      localBackupPlanningResolverRef,
    },
    actions: {
      ...exportRuntime.actions,
      localBackupRecovery: localBackupRecovery.actions,
    },
  };
}

export type DesignPagePresentationBackupRegistrationFacade = ReturnType<
  typeof useDesignPagePresentationBackupRegistrationFacade
>;
