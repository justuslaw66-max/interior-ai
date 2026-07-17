"use client";

import type { DesignPageCoreShellRegistration } from "@/lib/useDesignPageCoreShellRegistration";
import type { DesignPageDocumentSelectionRegistrationFacade } from "@/lib/useDesignPageDocumentSelectionRegistrationFacade";
import type { DesignPagePlanAuthoringRegistration } from "@/lib/useDesignPagePlanAuthoringRegistration";
import { useDesignPagePersistenceRegistration } from "@/lib/useDesignPagePersistenceRegistration";

export type UseDesignPagePersistenceWorkspaceRegistrationInput = {
  boundaries: {
    coreShell: DesignPageCoreShellRegistration;
    documentSelection: DesignPageDocumentSelectionRegistrationFacade;
    planAuthoring: DesignPagePlanAuthoringRegistration;
  };
};

/**
 * Adapts the established shell, document, and authoring contracts to the
 * persistence/new-plan lifecycle without moving ownership into the workspace.
 */
export function useDesignPagePersistenceWorkspaceRegistration({
  boundaries: { coreShell, documentSelection, planAuthoring },
}: UseDesignPagePersistenceWorkspaceRegistrationInput) {
  const base = coreShell.boundaries.base;
  const viewportShell = coreShell.boundaries.viewportShell;
  const { snapshotDocument, documentRoom } = documentSelection.boundaries;
  const underlay = planAuthoring.boundaries.underlay;

  const persistence = useDesignPagePersistenceRegistration({
    boundaries: { snapshotDocument, documentRoom },
    state: {
      identity: {
        designId: base.state.identity.designId,
        shareEnabled: base.state.identity.shareEnabled,
      },
      document: {
        savedViews: viewportShell.state.camera.savedViews,
        style: base.state.brief.style,
        budget: base.state.brief.budget,
        mode: base.state.brief.mode,
        notes: base.state.brief.notes,
      },
      session: {
        isAuthenticated: Boolean(base.state.identity.session?.user),
        isDesigner: coreShell.derived.access.isDesigner,
      },
      newPlan: {
        pendingReplacement: underlay.state.pendingTemplateReplacement,
      },
    },
    actions: {
      persistence: {
        setDesignId: base.actions.identity.setDesignId,
        setShareToken: base.actions.identity.setShareToken,
        setShareEnabled: base.actions.identity.setShareEnabled,
        setMode: base.actions.brief.setMode,
        setNotes: base.actions.brief.setNotes,
        setSavedViews: viewportShell.actions.camera.setSavedViews,
        setStyle: base.actions.brief.setStyle,
        setBudget: base.actions.brief.setBudget,
        showRuleToast: coreShell.actions.feedback.showRuleToast,
        showMaxDesignUpgrade: () => base.actions.dialogs.setShowUpgrade(true),
        requestSignIn: coreShell.actions.paywall.signInWithReturn,
      },
      newPlan: {
        setGuidedPlanStartMode:
          viewportShell.actions.editor.setGuidedPlanStartMode,
        goPlan: viewportShell.actions.panels.goPlan,
        setViewMode: base.actions.editor.setViewMode,
        setDesignPanelOpen: base.actions.panels.setDesignPanelOpen,
        setDesignPanelCollapsed: base.actions.panels.setDesignPanelCollapsed,
        cancelPendingReplacement:
          underlay.actions.cancelPendingTemplateReplacement,
        confirmPendingReplacement:
          underlay.actions.confirmPendingTemplateReplacement,
        requestSignIn: coreShell.actions.paywall.signInWithReturn,
        showToast: coreShell.actions.feedback.showRuleToast,
      },
      clearPlanAnnotations: () =>
        viewportShell.actions.plan.setPlanAnnotations([]),
    },
    refs: {
      localBackupPersistenceActions:
        coreShell.refs.localBackupPersistenceActionsRef,
    },
  });

  return {
    boundaries: { coreShell, documentSelection, planAuthoring, persistence },
    state: persistence.state,
    derived: {},
    configuration: {},
    refs: {
      localBackupPersistenceActions:
        coreShell.refs.localBackupPersistenceActionsRef,
    },
    actions: persistence.actions,
  };
}

export type DesignPagePersistenceWorkspaceRegistration = ReturnType<
  typeof useDesignPagePersistenceWorkspaceRegistration
>;
