"use client";

import { useEffect, useRef } from "react";
import { DesignPageComposition } from "@/components/editor/design-page/DesignPageComposition";
import { DesignPageEditorChrome } from "@/components/editor/design-page/DesignPageEditorChrome";
import { DesignPageDialogLayer } from "@/components/editor/design-page/DesignPageDialogLayer";
import { LocalBackupRecoveryDialog } from "@/components/editor/design-page/LocalBackupRecoveryDialog";
import { CloudSaveConflictDialog } from "@/components/editor/design-page/CloudSaveConflictDialog";
import { DesignPagePanelRegion } from "@/components/editor/design-page/DesignPagePanelRegion";
import { DesignPagePresentationQaLayer } from "@/components/editor/design-page/DesignPagePresentationQaLayer";
import { DesignPageSceneRegion } from "@/components/editor/design-page/DesignPageSceneRegion";
import { useDesignPagePlacementWorkspaceRegistration } from "@/lib/useDesignPagePlacementWorkspaceRegistration";
import { useDesignPageAiWorkspaceRegistration } from "@/lib/useDesignPageAiWorkspaceRegistration";
import { useDesignPageCoreShellRegistration } from "@/lib/useDesignPageCoreShellRegistration";
import { useDesignPageSceneRegionWorkspaceRegistration } from "@/lib/useDesignPageSceneRegionWorkspaceRegistration";
import { useDesignPageCommerceOnboardingRegistration } from "@/lib/useDesignPageCommerceOnboardingRegistration";
import { buildDesignPageViewportWorkspaceRegistration } from "@/lib/design-page-viewport-workspace-registration";
import { composeDesignPageSceneRegionModel } from "@/lib/design-page-viewport-region-model";
import { buildDesignPageDialogLayerAdapter } from "@/lib/design-page-dialog-layer-adapter";
import { buildDesignPagePanelWorkspaceRegistration } from "@/lib/design-page-panel-workspace-registration";
import { buildDesignPageDialogLayerModel } from "@/lib/design-page-dialog-layer-model";
import { DEFAULT_EDITOR_CAMERA_VIEW } from "@/lib/design-page-editor-configuration";
import { PRO_PLAN_PRICING } from "@/lib/pro-plan-catalog";
import { useDesignPageCabinetryWorkspaceRegistration } from "@/lib/useDesignPageCabinetryWorkspaceRegistration";
import { useDesignPagePresentationBackupRegistrationFacade } from "@/lib/useDesignPagePresentationBackupRegistrationFacade";
import { useDesignPageSelectionWorkspaceRegistration } from "@/lib/useDesignPageSelectionWorkspaceRegistration";
import { useDesignPageDocumentSelectionRegistrationFacade } from "@/lib/useDesignPageDocumentSelectionRegistrationFacade";
import { useDesignPagePlanAuthoringRegistration } from "@/lib/useDesignPagePlanAuthoringRegistration";
import { useDesignPageEditorInteractionRegistration } from "@/lib/useDesignPageEditorInteractionRegistration";
import { useDesignPagePersistenceWorkspaceRegistration } from "@/lib/useDesignPagePersistenceWorkspaceRegistration";
import { useDesignPagePresentationWorkspaceRegistration } from "@/lib/useDesignPagePresentationWorkspaceRegistration";
import { useDesignPageWorkspaceDeferredPaywallRegistration } from "@/lib/useDesignPagePaywallRegistrationFacade";
import { useDesignPageFloorPlanLifecycleRegistration } from "@/lib/useDesignPageFloorPlanLifecycleRegistration";

export function DesignPageWorkspace() {
  const coreShellRegistration = useDesignPageCoreShellRegistration({
    configuration: {
      initialCameraView: DEFAULT_EDITOR_CAMERA_VIEW,
      nodeEnv: process.env.NODE_ENV,
    },
  });
  const {
    boundaries: {
      base: coreShellBaseRegistration,
      viewportShell: viewportShellRegistration,
      paywall: paywallRegistration,
    },
    state: {
      feedback: {
        ruleToast,
        layoutConfidence,
        visibleConstraints,
      },
      document: { localBackupHydrated },
    },
    derived: {
      access: {
        capabilities,
        wantsDesigner,
        canUseDesigner,
        isClientPreview,
        showDesignerTheme,
      },
      paywall: {
        primaryUpgradeCtaLabel,
        annualPlanSavingsLabel,
        upgradeDialogDescription,
        upgradeDialogExportWorkflowBenefit,
        upgradeDialogPricingGuidance,
      },
    },
    actions: {
      paywall: {
        signInWithReturn,
      },
      feedback: {
        showRuleToast,
      },
    },
  } = coreShellRegistration;
  const {
    state: {
      identity: { session, designId },
      brief: { mode },
      dialogs: { showPlans, feedbackOpen, showUpgrade },
      paywall: {
        upgradeReason,
        upgradeCtaVariant,
        pricingLayoutVariant,
      },
      panels: {
        itemCartOpen,
        itemCart,
      },
      editor: { viewMode },
    },
    derived: { navigation: { router, pathname, searchParams } },
    actions: {
      brief: { setMode },
      access: { setPlan },
      dialogs: { setShowPlans, setFeedbackOpen, setShowUpgrade },
      paywall: {
        setUpgradeReason,
        setUpgradeCtaVariant,
        setPricingLayoutVariant,
      },
    },
  } = coreShellBaseRegistration;
  const {
    state: {
      plan: {
        planMeasurementUnit,
      },
      editor: { editorMode },
    },
  } = viewportShellRegistration;
  const documentSelectionRegistration =
    useDesignPageDocumentSelectionRegistrationFacade({
      boundaries: { coreShell: coreShellRegistration },
    });
  const {
    boundaries: {
      documentRoom: documentRoomRegistration,
    },
  } = documentSelectionRegistration;
  const documentRoomModel = documentRoomRegistration.derived.room;
  const documentPlanModel = documentRoomRegistration.derived.plan;
  const { activeRoom } = documentRoomModel;
  const { designControlsPanelVisibleForLayout } = documentPlanModel;

  const presentationBackupRegistration =
    useDesignPagePresentationBackupRegistrationFacade({
      boundaries: {
        coreShell: coreShellRegistration,
        documentSelection: documentSelectionRegistration,
      },
    });
  const deferredPaywallRegistration =
    useDesignPageWorkspaceDeferredPaywallRegistration({
      boundaries: { paywall: paywallRegistration },
      navigation: router,
      searchParams,
      state: {
        identity: {
          authenticated: Boolean(session?.user),
          designId,
        },
        route: { pathname },
        billing: { upgradeReason, pricingLayoutVariant },
        telemetry: { mode },
        access: { wantsDesigner, canUseDesigner, showUpgrade },
      },
      actions: {
        billing: {
          setPlan,
          setShowUpgrade,
          setUpgradeReason,
          setShowPlans,
          requestSignIn: signInWithReturn,
          showToast: showRuleToast,
        },
        lifecycle: {
          setMode,
          setUpgradeCtaVariant,
          setPricingLayoutVariant,
        },
      },
    });
  const {
    state: { startingCheckout, openingBillingPortal },
    actions: {
      openPlansFromUpgrade,
      signInFromUpgrade,
      closeUpgradeDialog,
      closePlansDialog,
      manageBillingFromPlans,
      startCheckoutFromPlans,
    },
  } = deferredPaywallRegistration;

  const planAuthoringRegistration = useDesignPagePlanAuthoringRegistration({
    boundaries: {
      coreShell: coreShellRegistration,
      documentSelection: documentSelectionRegistration,
    },
  });
  const {
    planWorkspace,
    underlay: planUnderlay,
  } = planAuthoringRegistration.boundaries;
  const sourceReferenceUnderlay = planUnderlay.state.floorPlanUnderlay;

  const {
    state: {
      room: { pendingRoomRenameId, pendingRoomRenameValue },
      overlay: {
        pendingAnnotationKind,
        pendingAnnotationText,
      },
    },
    actions: {
      room: {
        setPendingRoomRenameValue,
        cancelRoomRename,
        commitRoomRename,
      },
      overlay: {
        setPendingAnnotationText,
        cancelPlanAnnotation,
        commitPlanAnnotation,
      },
    },
  } = planWorkspace;
  const {
    state: {
      pendingTemplateReplacement: pendingPlanTemplateReplacement,
    },
  } = planUnderlay;
  const editorInteractionRegistration =
    useDesignPageEditorInteractionRegistration({
      boundaries: {
        coreShell: coreShellRegistration,
        documentSelection: documentSelectionRegistration,
        planAuthoring: planAuthoringRegistration,
      },
    });
  const persistenceWorkspaceRegistration =
    useDesignPagePersistenceWorkspaceRegistration({
      boundaries: {
        coreShell: coreShellRegistration,
        documentSelection: documentSelectionRegistration,
        planAuthoring: planAuthoringRegistration,
      },
    });
  const {
    state: {
      persistence: {
        shareSuccessToast,
        shareErrorToast,
        shareLinkFallback,
        showMyDesigns,
        myDesigns,
        loadingDesigns,
        selectedSavedDesignIds,
        deletingDesignIds,
        pendingDeleteDesign,
        cloudSaveConflict,
        allSavedDesignIds,
        selectedSavedDesignCount,
        allSavedDesignsSelected,
        guestPromptReason,
      },
      newPlan: { startingNewPlan, newPlanStartError },
    },
    actions: {
      persistence: {
        closeShareLinkFallback,
        copyFallbackShareLink,
        openFallbackShareLink,
        closeMyDesigns,
        handleLoadDesign,
        toggleSavedDesignSelection,
        toggleAllSavedDesignSelection,
        requestDeleteSavedDesigns,
        cancelDeleteSavedDesigns,
        handleDeleteSavedDesign,
        handleGuestPromptNotNow,
        handleGuestSaveAndContinue,
        saveConflictAsNewCopy,
        reloadCloudAfterConflict,
      },
      newPlan: {
        openNewPlanPicker,
        cancelPendingPlanChoice,
        replaceCurrentPlanFromChoice,
        saveCurrentAndStartNewPlan,
      },
    },
  } = persistenceWorkspaceRegistration;
  const requestedDesignId = searchParams.get("designId")?.trim() ?? "";
  const requestedDesignLoadRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !requestedDesignId ||
      !session?.user ||
      !localBackupHydrated ||
      designId === requestedDesignId ||
      requestedDesignLoadRef.current === requestedDesignId
    ) {
      return;
    }

    requestedDesignLoadRef.current = requestedDesignId;
    void handleLoadDesign(requestedDesignId);
  }, [
    designId,
    handleLoadDesign,
    localBackupHydrated,
    requestedDesignId,
    session?.user,
  ]);
  const floorPlanLifecycleRegistration = useDesignPageFloorPlanLifecycleRegistration({
    boundaries: { coreShell: coreShellRegistration, documentSelection: documentSelectionRegistration, persistence: persistenceWorkspaceRegistration },
  });
  const aiWorkspaceRegistration = useDesignPageAiWorkspaceRegistration({
    boundaries: {
      coreShell: coreShellRegistration,
      documentSelection: documentSelectionRegistration,
      planAuthoring: planAuthoringRegistration,
      editorInteraction: editorInteractionRegistration,
      persistence: persistenceWorkspaceRegistration,
    },
  });
  const { aiPanel: aiPanelRegistration } =
    aiWorkspaceRegistration.boundaries;
  const { panel: panelController } = aiPanelRegistration.boundaries;
  const { actions: panelActions } = panelController;
  const {
    state: { notes: aiNotesState },
    actions: {
      notes: {
        applySuggestion,
        close: closeAiNotes,
      },
    },
  } = aiPanelRegistration;
  const {
    open: showAINotes,
    data: aiNotesData,
  } = aiNotesState;

  const placementWorkspaceRegistration =
    useDesignPagePlacementWorkspaceRegistration({
      boundaries: {
        coreShell: coreShellRegistration,
        documentSelection: documentSelectionRegistration,
        planAuthoring: planAuthoringRegistration,
        editorInteraction: editorInteractionRegistration,
      },
    });
  const {
    derived: {
      pendingCatalogPlacementScene,
      pendingCatalogPlacementRoom,
      pendingCatalogPlacementBlocked,
      restorableCatalogPlacement,
      pendingCatalogPlacementScore,
      pendingCatalogPlacementQuality,
      pendingCatalogPlacementImprovement,
      pendingCatalogBestRoomPlacement,
      pendingCatalogBestVariantPlacement,
      pendingCatalogPlacementHardInvalid,
      pendingCatalogPlacementStatusLabel,
      shouldConfirmImprovedCatalogPlacement,
      shouldConfirmRestoredCatalogPlacement,
    },
    actions: {
      catalog: {
        rotatePendingCatalogPlacement,
        nudgePendingCatalogPlacement,
        centerPendingCatalogPlacement,
        autoPlacePendingCatalogPlacement,
        improvePendingCatalogPlacement,
        restoreLastValidCatalogPlacement,
        movePendingCatalogPlacementToBestRoom,
        switchPendingCatalogPlacementToBestOption,
        selectPendingCatalogPlacementBlocker,
        placePendingCatalogBesideBlocker,
        trySmallerPendingCatalogVariant,
        movePendingCatalogBlockerAside,
        swapPendingCatalogWithBlocker,
        confirmPendingCatalogPlacement,
        cancelPendingCatalogPlacement,
      },
    },
  } = placementWorkspaceRegistration;

  const commerceOnboardingRegistration =
    useDesignPageCommerceOnboardingRegistration({
      boundaries: {
        coreShell: coreShellRegistration,
        documentSelection: documentSelectionRegistration,
        editorInteraction: editorInteractionRegistration,
        persistence: persistenceWorkspaceRegistration,
        placement: placementWorkspaceRegistration,
      },
    });
  const {
    state: {
      onboarding: { nextBestActionNudge },
    },
    actions: {
      commerce: {
        removeFromCart,
        updateCartQty,
        clearCart,
        addAllToRoom,
      },
    },
  } = commerceOnboardingRegistration;

  const cabinetryRegistration = useDesignPageCabinetryWorkspaceRegistration({
    boundaries: {
      coreShell: coreShellRegistration,
      documentSelection: documentSelectionRegistration,
      planAuthoring: planAuthoringRegistration,
      placement: placementWorkspaceRegistration,
    },
  });
  const {
    state: {
      studio: cabinetryStudioState,
      canUseStudio: canUseCabinetryStudio,
      accessLevel: cabinetryAccessLevel,
      availableSpaces: cabinetryAvailableSpaces,
      preferredSpaceId: cabinetryPreferredSpaceId,
    },
    refs: { openedAt: cabinetryStudioOpenedAtRef },
    actions: {
      dismissStudio: dismissCabinetryStudio,
      saveDefinition: handleSaveCabinetDefinition,
      placeInPlan: handlePlaceCabinetInPlan,
    },
  } = cabinetryRegistration;

  const selectionWorkspaceRegistration =
    useDesignPageSelectionWorkspaceRegistration({
      boundaries: {
        coreShell: coreShellRegistration,
        documentSelection: documentSelectionRegistration,
        planAuthoring: planAuthoringRegistration,
        placement: placementWorkspaceRegistration,
        cabinetry: cabinetryRegistration,
      },
    });
  const {
    activeTargetValid: activePlacementTargetValid,
    activeTargetLabel: activePlacementTargetLabel,
  } = selectionWorkspaceRegistration.boundaries.selection.derived.placement;
  const presentationQaWorkspace =
    useDesignPagePresentationWorkspaceRegistration({
      boundaries: {
        aiWorkspace: aiWorkspaceRegistration,
        commerceOnboarding: commerceOnboardingRegistration,
        selection: selectionWorkspaceRegistration,
        presentationBackup: presentationBackupRegistration,
        deferredPaywall: deferredPaywallRegistration,
      },
    });
  const {
    derived: { betaFeedbackContext },
    regions: { presentExport: presentExportDialog, editorChrome: editorChromeModel,
      presentationQaLayer: presentationQaLayerModel },
  } = presentationQaWorkspace;

  const sceneCanvasRegionModel =
    useDesignPageSceneRegionWorkspaceRegistration({
      boundaries: { presentation: presentationQaWorkspace },
    }).regions.scene;
  const viewportRegionModel = buildDesignPageViewportWorkspaceRegistration({
    boundaries: { presentation: presentationQaWorkspace },
  }).regions.viewport;
  const sceneRegionModel = composeDesignPageSceneRegionModel({
    scene: sceneCanvasRegionModel,
    viewport: viewportRegionModel,
  });
  const panelRegionModel = buildDesignPagePanelWorkspaceRegistration({
    boundaries: { presentation: presentationQaWorkspace },
  }).regions.panel;
  const dialogLayerModel = buildDesignPageDialogLayerAdapter(buildDesignPageDialogLayerModel({
    access: { isClientPreview, isAuthenticated: Boolean(session?.user), capabilities, designerTheme: showDesignerTheme },
    billing: {
      upgrade: { open: showUpgrade, variantLabel: upgradeCtaVariant, contentVariant: upgradeCtaVariant,
        description: upgradeDialogDescription, exportWorkflowBenefit: upgradeDialogExportWorkflowBenefit,
        pricingGuidance: upgradeDialogPricingGuidance, primaryCtaLabel: primaryUpgradeCtaLabel },
      plans: { open: showPlans, layout: pricingLayoutVariant, openingBillingPortal, monthlyLabel: PRO_PLAN_PRICING.monthly.label,
        yearlyLabel: PRO_PLAN_PRICING.yearly.label, yearlyEffectiveMonthlyLabel: PRO_PLAN_PRICING.yearly.effectiveMonthlyLabel },
      startingCheckout, annualSavingsLabel: annualPlanSavingsLabel,
      upgradeActions: { onSeePlans: openPlansFromUpgrade, onSignIn: signInFromUpgrade, onClose: closeUpgradeDialog },
      plansActions: { onClose: closePlansDialog, onManageBilling: manageBillingFromPlans, onStartCheckout: startCheckoutFromPlans },
    },
    persistence: {
      guestSave: { open: Boolean(guestPromptReason), onNotNow: handleGuestPromptNotNow, onSaveAndContinue: handleGuestSaveAndContinue },
      myDesigns: {
        data: { open: showMyDesigns, designs: myDesigns, loading: loadingDesigns, allDesignIds: allSavedDesignIds,
          selectedDesignIds: selectedSavedDesignIds, selectedDesignCount: selectedSavedDesignCount,
          allDesignsSelected: allSavedDesignsSelected, deletingDesignIds, pendingDeleteDesign },
        actions: { onClose: closeMyDesigns, onOpenTemplates: openNewPlanPicker, onToggleAll: toggleAllSavedDesignSelection,
          onToggleSelection: toggleSavedDesignSelection, onLoadDesign: handleLoadDesign, onRequestDelete: requestDeleteSavedDesigns,
          onCancelDelete: cancelDeleteSavedDesigns, onConfirmDelete: handleDeleteSavedDesign },
      },
      templateChoice: {
        data: { open: Boolean(pendingPlanTemplateReplacement), templateLabel: pendingPlanTemplateReplacement?.template.label ?? "this floor plan",
          busy: startingNewPlan, errorMessage: newPlanStartError },
        actions: { onCancel: cancelPendingPlanChoice, onReplaceCurrent: replaceCurrentPlanFromChoice,
          onSaveCurrentAndStartNew: saveCurrentAndStartNewPlan, onSignIn: signInWithReturn },
      },
    },
    ai: { notes: { open: showAINotes, data: aiNotesData, onApplySuggestion: applySuggestion, onClose: closeAiNotes } },
    presentation: { presentExport: presentExportDialog },
    editing: {
      roomRename: { pendingRoomId: pendingRoomRenameId, value: pendingRoomRenameValue,
        onValueChange: setPendingRoomRenameValue, onCancel: cancelRoomRename, onSave: commitRoomRename },
      annotation: { kind: pendingAnnotationKind, text: pendingAnnotationText, onTextChange: setPendingAnnotationText,
        onCancel: cancelPlanAnnotation, onAdd: commitPlanAnnotation },
    },
    placement: {
      identity: { scene: pendingCatalogPlacementScene, roomName: pendingCatalogPlacementRoom?.name ?? null },
      assessment: { hardInvalid: pendingCatalogPlacementHardInvalid, statusLabel: pendingCatalogPlacementStatusLabel,
        targetLabel: activePlacementTargetLabel ?? null, targetValid: activePlacementTargetValid, quality: pendingCatalogPlacementQuality,
        score: pendingCatalogPlacementScore, improvement: pendingCatalogPlacementImprovement,
        bestRoomPlacement: pendingCatalogBestRoomPlacement, bestVariantPlacement: pendingCatalogBestVariantPlacement,
        blocked: pendingCatalogPlacementBlocked, hasRestorablePlacement: Boolean(restorableCatalogPlacement),
        shouldConfirmImprovedPlacement: shouldConfirmImprovedCatalogPlacement,
        shouldConfirmRestoredPlacement: shouldConfirmRestoredCatalogPlacement },
      activeRoomName: activeRoom?.name ?? null,
      actions: { onAutoPlace: autoPlacePendingCatalogPlacement, onMoveToBestRoom: movePendingCatalogPlacementToBestRoom,
        onSwitchToBestOption: switchPendingCatalogPlacementToBestOption, onImprovePlacement: improvePendingCatalogPlacement,
        onRestoreValidPlacement: restoreLastValidCatalogPlacement, onSelectBlocker: selectPendingCatalogPlacementBlocker,
        onSwapWithBlocker: swapPendingCatalogWithBlocker, onMoveBlockerAside: movePendingCatalogBlockerAside,
        onPlaceBesideBlocker: placePendingCatalogBesideBlocker, onTrySmallerVariant: trySmallerPendingCatalogVariant,
        onCenter: centerPendingCatalogPlacement, onNudge: nudgePendingCatalogPlacement, onRotate: rotatePendingCatalogPlacement,
        onCancel: cancelPendingCatalogPlacement, onConfirm: confirmPendingCatalogPlacement },
    },
    feedback: {
      beta: { open: feedbackOpen, context: betaFeedbackContext, onOpenChange: setFeedbackOpen },
      toasts: { ruleMessage: ruleToast, nudgeMessage: nextBestActionNudge, shareCopied: shareSuccessToast, shareErrorMessage: shareErrorToast },
      validation: { constraints: visibleConstraints, confidence: layoutConfidence,
        ...floorPlanLifecycleRegistration.derived.validation },
    },
    sharing: { url: shareLinkFallback, onClose: closeShareLinkFallback, onCopy: copyFallbackShareLink, onOpen: openFallbackShareLink },
    cabinetry: {
      state: cabinetryStudioState, access: { enabled: canUseCabinetryStudio, accessLevel: cabinetryAccessLevel },
      configuration: { measurementUnit: planMeasurementUnit, availableSpaces: cabinetryAvailableSpaces,
        preferredSpaceId: cabinetryPreferredSpaceId },
      refs: { openedAt: cabinetryStudioOpenedAtRef },
      actions: { onSave: handleSaveCabinetDefinition, onPlaceInPlan: handlePlaceCabinetInPlan, onDismiss: dismissCabinetryStudio },
    },
    cart: { items: itemCart, isOpen: itemCartOpen, controlsPanelVisible: designControlsPanelVisibleForLayout,
      onRemove: removeFromCart, onUpdateQty: updateCartQty, onClear: clearCart,
      onAddAllToRoom: addAllToRoom, onToggle: panelActions.toggleItemCart },
  }));
  return (
    <DesignPageComposition configuration={{ designerTheme: showDesignerTheme }}>
      <DesignPagePresentationQaLayer {...presentationQaLayerModel} />
      <div className="absolute inset-0">
        <DesignPageSceneRegion {...sceneRegionModel} />
        <DesignPageEditorChrome {...editorChromeModel} />
        {viewMode === "2d" &&
        editorMode === "adjust" &&
        sourceReferenceUnderlay ? (
          <div className="pointer-events-auto absolute bottom-4 left-4 z-40 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur md:left-[304px]">
            <div>
              <div className="text-xs font-semibold text-neutral-900">
                Source reference
              </div>
              <div className="text-[10px] text-neutral-500">
                Locked import underlay
              </div>
            </div>
            <button
              type="button"
              data-testid="floor-plan-source-reference-toggle"
              className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              aria-pressed={sourceReferenceUnderlay.visible !== false}
              onClick={() =>
                planUnderlay.actions.changeUnderlayOpacity(
                  sourceReferenceUnderlay.visible === false
                    ? sourceReferenceUnderlay.opacity || 0.45
                    : 0
                )
              }
            >
              {sourceReferenceUnderlay.visible === false ? "Show" : "Hide"}
            </button>
          </div>
        ) : null}
      </div>
      <DesignPagePanelRegion {...panelRegionModel} />
      <DesignPageDialogLayer {...dialogLayerModel} />
      <LocalBackupRecoveryDialog
        state={presentationBackupRegistration.state.localBackupRecovery}
        actions={presentationBackupRegistration.actions.localBackupRecovery}
      />
      <CloudSaveConflictDialog
        state={cloudSaveConflict}
        dark={showDesignerTheme}
        onSaveAsNewCopy={saveConflictAsNewCopy}
        onReloadCloudCopy={reloadCloudAfterConflict}
      />
    </DesignPageComposition>
  );
}
