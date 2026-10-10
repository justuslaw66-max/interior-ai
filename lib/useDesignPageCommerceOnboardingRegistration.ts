"use client";

import type { DesignPageCoreShellRegistration } from "@/lib/useDesignPageCoreShellRegistration";
import { useDesignPageCommerceActions } from "@/lib/useDesignPageCommerceActions";
import type { DesignPageDocumentSelectionRegistrationFacade } from "@/lib/useDesignPageDocumentSelectionRegistrationFacade";
import { useDesignPageOnboardingRegistrationFacade } from "@/lib/useDesignPageOnboardingRegistrationFacade";
import type { DesignPagePersistenceWorkspaceRegistration } from "@/lib/useDesignPagePersistenceWorkspaceRegistration";
import type { DesignPagePlacementWorkspaceRegistration } from "@/lib/useDesignPagePlacementWorkspaceRegistration";

export type UseDesignPageCommerceOnboardingRegistrationInput = {
  boundaries: {
    coreShell: DesignPageCoreShellRegistration;
    documentSelection: DesignPageDocumentSelectionRegistrationFacade;
    persistence: DesignPagePersistenceWorkspaceRegistration;
    placement: DesignPagePlacementWorkspaceRegistration;
  };
};

/** Registers the imported-catalog Add before the consumer activation lifecycle. */
export function useDesignPageCommerceOnboardingRegistration({
  boundaries: {
    coreShell,
    documentSelection,
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
    },
    actions: {
      catalog: {
        addToRoom: placement.actions.catalog.addCatalogItemToRoom,
      },
      importedCatalog: {
        getRelatedProductIds:
          importedModels.actions.getRelatedProductIds,
        ensureCatalogItem: importedModels.actions.ensureCatalogItem,
      },
    },
  });

  const onboarding = useDesignPageOnboardingRegistrationFacade({
    state: {
      designId: base.state.identity.designId,
      shareToken: base.state.identity.shareToken, downloadOpen: base.state.dialogs.downloadOpen,
      plan: base.state.access.plan,
      viewMode: base.state.editor.viewMode,
      mode: base.state.brief.mode,
      isClientPreview: coreShell.derived.access.isClientPreview,
      isGuest: !base.state.identity.session?.user,
      items,
      zones,
      constraintResults: coreShell.state.feedback.constraintResults,
      designRoomCount: coreShell.state.document.designSnapshot.rooms.length,
      planRoomCount: documentRoom.derived.plan.housePlan2D.rooms.length,
      saveStatusKind: persistence.state.persistence.saveStatus.kind,
      saveStatusSource: persistence.state.persistence.saveStatus.source,
      planGuidedActionsEnabled:
        viewportShell.state.plan.planGuidedActionsEnabled,
      viewportSize: viewportShell.state.diagnostics.viewportSize,
    },
    actions: {
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
