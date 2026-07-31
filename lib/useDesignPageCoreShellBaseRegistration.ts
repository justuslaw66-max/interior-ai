"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { Style } from "@/lib/design-page-types";
import type { DesignPageItemCartEntry } from "@/lib/design-page-item-cart";
import type {
  PricingLayoutVariant,
  UpgradeCtaVariant,
} from "@/lib/design-page-paywall";
import type { DesignPagePlacementAddMode } from "@/lib/design-page-editor-client-preferences";
import type { Plan } from "@/lib/plan";
import { useDesignPageHistoryRevision } from "@/lib/useDesignPageDocumentHistoryController";
import { useDesignPageImportedModels } from "@/lib/useDesignPageImportedModels";
import type { DesignPageUpgradeReason } from "@/lib/useDesignPagePaywallTelemetryController";

/** Owns route-bound inputs and local shell state before editor runtimes mount. */
export function useDesignPageCoreShellBaseRegistration() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlMode = searchParams.get("mode");
  const urlView = searchParams.get("view");
  const urlWorkspace = searchParams.get("workspace");
  const paywallVariantOverride = searchParams.get("paywall_variant");
  const debugLayoutParam = searchParams.get("debug_layout");

  const [designId, setDesignId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [style, setStyle] = useState<Style>("Modern");
  const [budget, setBudget] = useState<"$" | "$$" | "$$$">("$$");
  const [mode, setMode] = useState<"homeowner" | "designer">(
    urlMode === "designer" ? "designer" : "homeowner"
  );
  const [notes, setNotes] = useState("");
  const [aiSeed, setAiSeed] = useState<number>(() => Date.now());
  const [plan, setPlan] = useState<Plan>("free");
  const [showPlans, setShowPlans] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeReason, setUpgradeReason] =
    useState<DesignPageUpgradeReason>(null);
  const [upgradeCtaVariant, setUpgradeCtaVariant] =
    useState<UpgradeCtaVariant>("unlock_pro_exports");
  const [pricingLayoutVariant, setPricingLayoutVariant] =
    useState<PricingLayoutVariant>("default");
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [clientPreview, setClientPreview] = useState(false);
  const [itemCartOpen, setItemCartOpen] = useState(false);
  const [itemCart, setItemCart] = useState<DesignPageItemCartEntry[]>([]);

  const importedModelsWorkspace = useDesignPageImportedModels();
  const {
    state: { selectedProductId: selectedImportedProductId },
    actions: {
      ensureCatalogItem: ensureImportedCatalogItem,
      getRelatedProductIds: getRelatedImportedProductIds,
    },
  } = importedModelsWorkspace;

  const [placementAddMode, setPlacementAddMode] =
    useState<DesignPagePlacementAddMode>("preview");
  const [placementPreferencesLoaded, setPlacementPreferencesLoaded] =
    useState(false);
  const [, bumpHistoryRevision] = useDesignPageHistoryRevision();
  const [viewMode, setViewMode] = useState<EditorViewMode>(
    urlView === "2d" ? "2d" : "3d"
  );
  const [designPanelOpen, setDesignPanelOpen] = useState(true);
  const [designPanelCollapsed, setDesignPanelCollapsed] = useState(false);
  const [planFocusPanelRevealed, setPlanFocusPanelRevealed] = useState(false);
  const [dismissedPlanCanvasGuidanceKey, setDismissedPlanCanvasGuidanceKey] =
    useState<string | null>(null);

  return {
    boundaries: { importedModels: importedModelsWorkspace },
    state: {
      identity: { session, designId, shareToken, shareEnabled },
      brief: { style, budget, mode, notes, aiSeed },
      access: { plan, clientPreview },
      dialogs: { showPlans, feedbackOpen, showUpgrade },
      paywall: {
        upgradeReason,
        upgradeCtaVariant,
        pricingLayoutVariant,
        variantOverride: paywallVariantOverride,
      },
      editor: {
        showGrid,
        snapEnabled,
        placementAddMode,
        placementPreferencesLoaded,
        viewMode,
      },
      panels: {
        itemCartOpen,
        itemCart,
        designPanelOpen,
        designPanelCollapsed,
        planFocusPanelRevealed,
        dismissedPlanCanvasGuidanceKey,
      },
    },
    derived: {
      navigation: {
        router,
        pathname,
        searchParams,
        urlMode,
        urlView,
        urlWorkspace,
        debugLayoutParam,
      },
      importedModels: { selectedImportedProductId },
    },
    actions: {
      identity: { setDesignId, setShareToken, setShareEnabled },
      brief: { setStyle, setBudget, setMode, setNotes, setAiSeed },
      access: { setPlan, setClientPreview },
      dialogs: { setShowPlans, setFeedbackOpen, setShowUpgrade },
      paywall: {
        setUpgradeReason,
        setUpgradeCtaVariant,
        setPricingLayoutVariant,
      },
      editor: {
        setShowGrid,
        setSnapEnabled,
        setPlacementAddMode,
        setPlacementPreferencesLoaded,
        setViewMode,
        bumpHistoryRevision,
      },
      panels: {
        setItemCartOpen,
        setItemCart,
        setDesignPanelOpen,
        setDesignPanelCollapsed,
        setPlanFocusPanelRevealed,
        setDismissedPlanCanvasGuidanceKey,
      },
      importedModels: {
        ensureImportedCatalogItem,
        getRelatedImportedProductIds,
      },
    },
  };
}
