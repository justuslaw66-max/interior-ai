"use client";

import type { DesignPageCoreShellRegistration } from "@/lib/useDesignPageCoreShellRegistration";
import { useDesignPageCommerceActions } from "@/lib/useDesignPageCommerceActions";
import type { DesignPageDocumentSelectionRegistrationFacade } from "@/lib/useDesignPageDocumentSelectionRegistrationFacade";
import type { DesignPageEditorInteractionRegistration } from "@/lib/useDesignPageEditorInteractionRegistration";
import { useDesignPageOnboardingRegistrationFacade } from "@/lib/useDesignPageOnboardingRegistrationFacade";
import type { DesignPagePersistenceWorkspaceRegistration } from "@/lib/useDesignPagePersistenceWorkspaceRegistration";
import type { DesignPagePlacementWorkspaceRegistration } from "@/lib/useDesignPagePlacementWorkspaceRegistration";

export type UseDesignPageCommerceOnboardingRegistrationInput = {
  boundaries: {
    coreShell: DesignPageCoreShellRegistration;
    documentSelection: DesignPageDocumentSelectionRegistrationFacade;
    editorInteraction: DesignPageEditorInteractionRegistration;
    persistence: DesignPagePersistenceWorkspaceRegistration;
    placement: DesignPagePlacementWorkspaceRegistration;
  };
};

/** Registers shopping actions before the consumer activation lifecycle. */
export function useDesignPageCommerceOnboardingRegistration({
  boundaries: {
    coreShell,
    documentSelection,
    editorInteraction,
    persistence,
    placement,
  },
}: UseDesignPageCommerceOnboardingRegistrationInput) {
  const base = coreShell.boundaries.base;
  const viewportShell = coreShell.boundaries.viewportShell;
  const documentRoom = documentSelection.boundaries.documentRoom;
  const importedModels = base.boundaries.importedModels;
  const { items, zones, roomWidth, roomDepth, wallThickness } =
    documentRoom.derived.room;

  const commerce = useDesignPageCommerceActions({
    state: {
      selectedImportedProductId:
        importedModels.state.selectedProductId,
      itemCart: base.state.panels.itemCart,
    },
    actions: {
      catalog: {
        previewPlacement:
          placement.actions.catalog.previewCatalogPlacementIntent,
        addToRoom: placement.actions.catalog.addCatalogItemToRoom,
        addDirectlyToRoom:
          placement.actions.catalog.addCatalogItemDirectlyToRoom,
      },
      importedCatalog: {
        getRelatedProductIds:
          importedModels.actions.getRelatedProductIds,
        ensureCatalogItem: importedModels.actions.ensureCatalogItem,
      },
      cart: {
        setItems: base.actions.panels.setItemCart,
        setOpen: base.actions.panels.setItemCartOpen,
      },
      navigation: { goFurnish: viewportShell.actions.panels.goFurnish },
      feedback: { showToast: coreShell.actions.feedback.showRuleToast },
    },
  });

  const onboarding = useDesignPageOnboardingRegistrationFacade({
    state: {
      designId: base.state.identity.designId,
      shareToken: base.state.identity.shareToken,
      plan: base.state.access.plan,
      editorMode: viewportShell.state.editor.editorMode,
      viewMode: base.state.editor.viewMode,
      mode: base.state.brief.mode,
      isClientPreview: coreShell.derived.access.isClientPreview,
      isGuest: !base.state.identity.session?.user,
      items,
      zones,
      constraintResults: coreShell.state.feedback.constraintResults,
      showBetaStart: documentSelection.state.betaStart.visible,
      designRoomCount: coreShell.state.document.designSnapshot.rooms.length,
      planRoomCount: documentRoom.derived.plan.housePlan2D.rooms.length,
      saveStatusKind: persistence.state.persistence.saveStatus.kind,
      planGuidedActionsEnabled:
        viewportShell.state.plan.planGuidedActionsEnabled,
      viewportSize: viewportShell.state.diagnostics.viewportSize,
    },
    actions: {
      autoCreateSeatingZone:
        editorInteraction.boundaries.zone.actions.autoCreateSeatingZone,
      clampToRoom: documentRoom.actions.room.clampToActiveRoom,
      showConstraintsForMoment:
        coreShell.actions.feedback.showConstraintsForMoment,
      showConfidenceSummary:
        coreShell.actions.feedback.showConfidenceSummary,
      logFunnelEvent: coreShell.actions.paywall.logFunnelEvent,
    },
    configuration: { roomWidth, roomDepth, wallThickness },
  });

  return {
    boundaries: { coreShell, documentSelection, persistence, placement },
    state: { onboarding: onboarding.state },
    derived: {},
    configuration: {},
    refs: {},
    actions: { commerce: commerce.actions },
  };
}

export type DesignPageCommerceOnboardingRegistration = ReturnType<
  typeof useDesignPageCommerceOnboardingRegistration
>;
