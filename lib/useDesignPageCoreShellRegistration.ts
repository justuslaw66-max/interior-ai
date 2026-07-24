"use client";

import { useRef, useState } from "react";

import { useEditorMode } from "@/hooks/useEditorMode";
import { resolveEditorCapabilities } from "@/lib/editor-capabilities";
import type {
  CameraView,
  DesignPageCloudLoadResult,
} from "@/lib/design-page-types";
import type { PendingAiLayoutProposal } from "@/lib/design-page-ai-layout-proposal";
import type { DesignItem } from "@/lib/room-types";
import { useDesignPageCoreShellBaseRegistration } from "@/lib/useDesignPageCoreShellBaseRegistration";
import { useDesignPageEditorClientLifecycle } from "@/lib/useDesignPageEditorClientLifecycle";
import { useDesignPageLiveCatalog } from "@/lib/useDesignPageLiveCatalog";
import type { UseDesignPageLocalBackupHydrationInput } from "@/lib/useDesignPageLocalBackupHydration";
import { useDesignPageWorkspacePaywallRegistration } from "@/lib/useDesignPagePaywallRegistrationFacade";
import { useDesignPageSnapshotDocumentState } from "@/lib/useDesignPageDocumentStateController";
import { useDesignPageTransientFeedback } from "@/lib/useDesignPageTransientFeedback";
import { useDesignPageViewportShellRegistration } from "@/lib/useDesignPageViewportShellRegistration";

export type UseDesignPageCoreShellRegistrationInput = {
  configuration: {
    initialCameraView: CameraView;
    nodeEnv: string | undefined;
  };
};

/**
 * Registers the route-bound state and the early editor runtimes in their
 * lifecycle-sensitive order. Downstream feature controllers consume the
 * grouped contracts returned here instead of owning route or shell setup.
 */
export function useDesignPageCoreShellRegistration({
  configuration,
}: UseDesignPageCoreShellRegistrationInput) {
  const baseRegistration = useDesignPageCoreShellBaseRegistration();
  const {
    state: {
      identity: { session, designId, shareToken },
      brief: { mode },
      access: { plan, clientPreview },
      paywall: {
        upgradeReason,
        upgradeCtaVariant,
        pricingLayoutVariant,
        variantOverride: paywallVariantOverride,
      },
      editor: {
        placementAddMode,
        placementPreferencesLoaded,
      },
      panels: { designPanelOpen },
    },
    derived: {
      navigation: {
        router,
        pathname,
        searchParams,
        urlMode,
        debugLayoutParam,
      },
    },
    actions: {
      editor: {
        setPlacementAddMode,
        setPlacementPreferencesLoaded,
      },
      panels: {
        setItemCartOpen,
        setDesignPanelOpen,
        setDesignPanelCollapsed,
      },
    },
  } = baseRegistration;

  const viewportShellRegistration = useDesignPageViewportShellRegistration({
    state: { debugLayoutParam, designPanelOpen },
    actions: {
      setDesignPanelOpen,
      setDesignPanelCollapsed,
      setItemCartOpen,
    },
    configuration,
  });
  const {
    state: {
      plan: { simplePlanControls },
      editor: { editorMode },
    },
    actions: {
      plan: { setSimplePlanControls },
      presentation: { setShowPresentModal, setPresentModeRoomId },
    },
  } = viewportShellRegistration;

  const wantsDesigner = urlMode === "designer";
  const capabilities = resolveEditorCapabilities(plan);
  const canUseDesigner = capabilities.useDesignerWorkspace;
  const { isDesigner, isClientPreview } = useEditorMode(
    capabilities.useDesignerWorkspace,
    clientPreview
  );
  // Pro mode changes the available tools, not the product's visual theme.
  // Keeping one shared light interface avoids contrast regressions and makes
  // switching modes feel continuous.
  const showDesignerTheme = false;
  const {
    state: {
      toast: ruleToast,
      confidence: layoutConfidence,
      constraintResults,
      visibleConstraints,
    },
    actions: {
      showToast: showRuleToast,
      showConstraints: showConstraintsForMoment,
      showConfidence: showConfidenceSummary,
    },
  } = useDesignPageTransientFeedback({ isClientPreview, editorMode });

  const seatingZoneAutoDisabledRef = useRef(false);
  const itemsRef = useRef<DesignItem[]>([]);
  const resetSelectionStateRef = useRef<() => void>(() => undefined);
  const localBackupPersistenceActionsRef = useRef<
    Pick<
      UseDesignPageLocalBackupHydrationInput["actions"],
      "loadDesign" | "clearPersistedSnapshotFingerprint"
    >
  >({
    loadDesign: () =>
      Promise.resolve<DesignPageCloudLoadResult>("unavailable"),
    clearPersistedSnapshotFingerprint: () => undefined,
  });
  const localBackupPlanningResolverRef = useRef<
    UseDesignPageLocalBackupHydrationInput["configuration"]["resolveConfiguredPlanningDimsMm"]
  >((..._args) => {
    throw new Error("Local backup planning resolver is not bound");
  });

  const paywallRegistration = useDesignPageWorkspacePaywallRegistration({
    state: {
      identity: {
        designId,
        shareToken,
        userId: session?.user?.id ?? null,
      },
      paywall: {
        variantOverride: paywallVariantOverride,
        upgradeReason,
        ctaVariant: upgradeCtaVariant,
        pricingLayout: pricingLayoutVariant,
      },
      editor: {
        canUseDesigner,
        simplePlanControls,
        mode,
        isAuthenticated: Boolean(session?.user),
      },
      navigation: {
        currentSearch: searchParams.toString(),
        pathname,
      },
    },
    refs: { items: itemsRef },
    actions: {
      setSimplePlanControls,
      replaceUrl: (url) => router.replace(url, { scroll: false }),
    },
  });
  const {
    derived: {
      primaryUpgradeCtaLabel,
      annualPlanSavingsLabel,
      upgradeDialogDescription,
      upgradeDialogExportWorkflowBenefit,
      upgradeDialogPricingGuidance,
    },
    actions: { logFunnelEvent, trackFirstInteraction, setUrlMode },
  } = paywallRegistration;

  const {
    actions: { signInWithReturn },
  } = useDesignPageEditorClientLifecycle({
    state: { placementAddMode, placementPreferencesLoaded, editorMode },
    refs: {
      seatingZoneAutoDisabled: seatingZoneAutoDisabledRef,
      resetSelectionState: resetSelectionStateRef,
    },
    actions: {
      setPlacementAddMode,
      setPlacementPreferencesLoaded,
      setShowPresentModal,
      setPresentModeRoomId,
    },
  });

  const [pendingAiLayoutProposal, setPendingAiLayoutProposal] =
    useState<PendingAiLayoutProposal | null>(null);
  const [crossRoomDragTarget, setCrossRoomDragTarget] = useState<{
    roomId: string;
    label: string;
    valid: boolean;
    kind: "preview" | "item";
  } | null>(null);

  const snapshotDocumentController = useDesignPageSnapshotDocumentState();
  const {
    state: { designSnapshot, localBackupHydrated },
    actions: { setDesignSnapshot, setLocalBackupHydrated },
    refs: { designSnapshotRef },
  } = snapshotDocumentController;
  const liveCatalogReady = useDesignPageLiveCatalog();
  const canEdit = !isClientPreview && liveCatalogReady;

  return {
    boundaries: {
      base: baseRegistration,
      viewportShell: viewportShellRegistration,
      paywall: paywallRegistration,
      snapshotDocument: snapshotDocumentController,
    },
    state: {
      feedback: {
        ruleToast,
        layoutConfidence,
        constraintResults,
        visibleConstraints,
      },
      placement: { pendingAiLayoutProposal, crossRoomDragTarget },
      document: { designSnapshot, localBackupHydrated },
    },
    derived: {
      access: {
        capabilities,
        wantsDesigner,
        canUseDesigner,
        isDesigner,
        isClientPreview,
        showDesignerTheme,
        liveCatalogReady,
        canEdit,
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
        logFunnelEvent,
        trackFirstInteraction,
        signInWithReturn,
        setUrlMode,
      },
      feedback: {
        showRuleToast,
        showConstraintsForMoment,
        showConfidenceSummary,
      },
      placement: {
        setPendingAiLayoutProposal,
        setCrossRoomDragTarget,
      },
      document: { setDesignSnapshot, setLocalBackupHydrated },
    },
    refs: {
      seatingZoneAutoDisabledRef,
      itemsRef,
      resetSelectionStateRef,
      localBackupPersistenceActionsRef,
      localBackupPlanningResolverRef,
      designSnapshotRef,
    },
  };
}

export type DesignPageCoreShellRegistration = ReturnType<
  typeof useDesignPageCoreShellRegistration
>;
