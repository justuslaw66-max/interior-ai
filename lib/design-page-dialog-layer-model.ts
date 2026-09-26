import type { DownloadDialogProps } from "@/components/editor/design-page/DownloadDialog";
import type { PresentExportDialogProps } from "@/components/editor/design-page/PresentExportDialog";
import type { EditorCapabilities } from "@/lib/editor-capabilities";
import type { BuildDesignPageDialogLayerAdapterInput } from "@/lib/design-page-dialog-layer-adapter";

type Dialogs = BuildDesignPageDialogLayerAdapterInput["dialogs"];
type Overlays = BuildDesignPageDialogLayerAdapterInput["overlays"];
type UpgradeState = Dialogs["upgrade"]["state"];
type PlansState = Dialogs["plans"]["state"];
type TemplateChoice = Dialogs["planTemplateChoice"];
type Placement = Dialogs["catalogPlacement"];
type BetaFeedback = NonNullable<Overlays["betaFeedback"]>;
type Cabinetry = Overlays["cabinetry"];
type ItemCart = Overlays["itemCart"];

type UpgradeModel = {
  open: boolean;
  variantLabel: UpgradeState["variantLabel"];
  contentVariant: UpgradeState["contentVariant"];
  description: UpgradeState["description"];
  exportWorkflowBenefit: UpgradeState["exportWorkflowBenefit"];
  pricingGuidance: UpgradeState["pricingGuidance"];
  primaryCtaLabel: UpgradeState["primaryCtaLabel"];
};

type PlansModel = {
  open: PlansState["open"];
  openerId: PlansState["openerId"];
  layout: PlansState["layout"];
  openingBillingPortal: PlansState["openingBillingPortal"];
  monthlyLabel: PlansState["monthlyLabel"];
  yearlyLabel: PlansState["yearlyLabel"];
  yearlyEffectiveMonthlyLabel: PlansState["yearlyEffectiveMonthlyLabel"];
};

type TemplateChoiceData = Pick<
  TemplateChoice,
  "open" | "templateLabel" | "busy" | "errorMessage"
>;

type TemplateChoiceActions = Pick<
  TemplateChoice,
  | "onCancel"
  | "onReplaceCurrent"
  | "onSaveCurrentAndStartNew"
  | "onSignIn"
>;

type DownloadModel = Pick<
  DownloadDialogProps,
  "open" | "onClose" | "onDownloadImages" | "onDownloadPdf" | "onSignIn" | "onSeePricing"
>;

type PlacementIdentity = Pick<Placement["state"], "scene" | "roomName">;
type PlacementAssessment = Omit<
  Placement["state"],
  keyof PlacementIdentity
>;

export type BuildDesignPageDialogLayerModelInput = {
  access: {
    isClientPreview: boolean;
    isAuthenticated: boolean;
    isDesigner: boolean;
    capabilities: EditorCapabilities;
    designerTheme: boolean;
  };
  billing: {
    upgrade: UpgradeModel;
    plans: PlansModel;
    startingCheckout: boolean;
    annualSavingsLabel: string;
    upgradeActions: Dialogs["upgrade"]["actions"];
    plansActions: Dialogs["plans"]["actions"];
  };
  persistence: {
    guestSave: Dialogs["guestSave"] & {
      reason: BuildDesignPageDialogLayerAdapterInput["state"]["guestSaveReason"];
    };
    templateChoice: {
      data: TemplateChoiceData;
      actions: TemplateChoiceActions;
    };
    startChooser: Dialogs["startChooser"];
  };
  ai: {
    notes: {
      open: Dialogs["aiNotes"]["open"];
      data: Dialogs["aiNotes"]["data"];
      onApplySuggestion: Dialogs["aiNotes"]["onApplySuggestion"];
      onClose: Dialogs["aiNotes"]["onClose"];
    };
  };
  presentation: { presentExport: PresentExportDialogProps; download: DownloadModel };
  editing: {
    designRename: Dialogs["designRename"];
    roomRename: {
      pendingRoomId: string | null;
      value: Dialogs["roomRename"]["value"];
      onValueChange: Dialogs["roomRename"]["onValueChange"];
      onCancel: Dialogs["roomRename"]["onCancel"];
      onSave: Dialogs["roomRename"]["onSave"];
    };
    annotation: {
      kind: Dialogs["planAnnotation"]["kind"];
      text: Dialogs["planAnnotation"]["text"];
      onTextChange: Dialogs["planAnnotation"]["onTextChange"];
      onCancel: Dialogs["planAnnotation"]["onCancel"];
      onAdd: Dialogs["planAnnotation"]["onAdd"];
    };
  };
  placement: {
    identity: PlacementIdentity;
    assessment: PlacementAssessment;
    activeRoomName: Placement["configuration"]["activeRoomName"];
    actions: Placement["actions"];
  };
  feedback: {
    beta: {
      open: BetaFeedback["open"];
      context: BetaFeedback["context"];
      onOpenChange: BetaFeedback["onOpenChange"];
    };
    toasts: Overlays["toasts"];
    validation: {
      constraints: Overlays["validation"]["constraints"];
      confidence: Overlays["validation"]["confidence"];
      floorPlanOrientation?: Overlays["validation"]["floorPlanOrientation"];
      floorPlanRevisionUpdate?: Overlays["validation"]["floorPlanRevisionUpdate"];
    };
  };
  sharing: {
    url: Overlays["shareFallback"]["url"];
    standalone: Overlays["shareFallback"]["standalone"];
    onClose: Overlays["shareFallback"]["onClose"];
    onCopy: Overlays["shareFallback"]["onCopy"];
    onOpen: Overlays["shareFallback"]["onOpen"];
  };
  cabinetry: {
    state: Cabinetry["state"];
    access: Pick<Cabinetry, "enabled" | "accessLevel">;
    configuration: Pick<
      Cabinetry,
      "measurementUnit" | "availableSpaces" | "preferredSpaceId"
    >;
    refs: { openedAt: Cabinetry["openedAtRef"] };
    actions: Pick<Cabinetry, "onSave" | "onPlaceInPlan" | "onDismiss">;
  };
  cart: {
    items: ItemCart["items"];
    isOpen: ItemCart["isOpen"];
    controlsPanelVisible: boolean;
    onRemove: ItemCart["onRemove"];
    onUpdateQty: ItemCart["onUpdateQty"];
    onClear: ItemCart["onClear"];
    onAddAllToRoom: ItemCart["onAddAllToRoom"];
    onToggle: ItemCart["onToggle"];
  };
};

/** Download reads the scene and export state that Present & export already carries. */
function buildDownloadDialog(
  access: BuildDesignPageDialogLayerModelInput["access"],
  presentation: BuildDesignPageDialogLayerModelInput["presentation"]
): DownloadDialogProps {
  const exportState = presentation.presentExport.state;
  return {
    ...presentation.download,
    dark: access.designerTheme,
    signedIn: access.isAuthenticated,
    freeLimits: !access.capabilities.exportWithoutWatermark,
    sceneReady: exportState.sceneReady,
    hasItems: exportState.hasItems,
    exportingImages: exportState.isExporting,
    exportingPdf: exportState.isPdfExporting,
  };
}

/** Builds the fixed dialog layer from domain data, policy, and callbacks. */
export function buildDesignPageDialogLayerModel({
  access,
  billing,
  persistence,
  ai,
  presentation,
  editing,
  placement,
  feedback,
  sharing,
  cabinetry,
  cart,
}: BuildDesignPageDialogLayerModelInput): BuildDesignPageDialogLayerAdapterInput {
  const { reason: guestSaveReason, ...guestSave } = persistence.guestSave;
  return {
    state: {
      isClientPreview: access.isClientPreview,
      upgradeOpen: billing.upgrade.open,
      guestSaveReason,
    },
    dialogs: {
      upgrade: {
        state: {
          variantLabel: billing.upgrade.variantLabel,
          contentVariant: billing.upgrade.contentVariant,
          description: billing.upgrade.description,
          exportWorkflowBenefit: billing.upgrade.exportWorkflowBenefit,
          pricingGuidance: billing.upgrade.pricingGuidance,
          annualSavingsLabel: billing.annualSavingsLabel,
          primaryCtaLabel: billing.upgrade.primaryCtaLabel,
          dismissLabel:
            billing.upgrade.contentVariant === "see_pricing"
              ? "Maybe later"
              : "Close",
          startingCheckout: billing.startingCheckout,
          showSignIn: !access.isAuthenticated,
        },
        actions: billing.upgradeActions,
      },
      guestSave,
      plans: {
        state: {
          open: billing.plans.open, openedFromUpgrade: billing.upgrade.open, openerId: billing.plans.openerId,
          layout: billing.plans.layout,
          proActive: access.capabilities.manageSubscription,
          startingCheckout: billing.startingCheckout,
          openingBillingPortal: billing.plans.openingBillingPortal,
          monthlyLabel: billing.plans.monthlyLabel,
          yearlyLabel: billing.plans.yearlyLabel,
          yearlyEffectiveMonthlyLabel:
            billing.plans.yearlyEffectiveMonthlyLabel,
          annualSavingsLabel: billing.annualSavingsLabel,
        },
        actions: billing.plansActions,
      },
      aiNotes: {
        open: ai.notes.open,
        data: ai.notes.data,
        canApplySuggestions: access.capabilities.applyAiSuggestions,
        onApplySuggestion: ai.notes.onApplySuggestion,
        onClose: ai.notes.onClose,
      },
      presentExport: presentation.presentExport,
      download: buildDownloadDialog(access, presentation),
      designRename: editing.designRename,
      roomRename: { open: Boolean(editing.roomRename.pendingRoomId), value: editing.roomRename.value,
        onValueChange: editing.roomRename.onValueChange, onCancel: editing.roomRename.onCancel, onSave: editing.roomRename.onSave },
      planAnnotation: {
        kind: editing.annotation.kind,
        text: editing.annotation.text,
        onTextChange: editing.annotation.onTextChange,
        onCancel: editing.annotation.onCancel,
        onAdd: editing.annotation.onAdd,
      },
      catalogPlacement: {
        state: { ...placement.identity, ...placement.assessment },
        configuration: { activeRoomName: placement.activeRoomName, nudgeStepMeters: 0.25 },
        actions: placement.actions,
      },
      planTemplateChoice: {
        ...persistence.templateChoice.data,
        isAuthenticated: access.isAuthenticated,
        ...persistence.templateChoice.actions,
      },
      startChooser: persistence.startChooser,
    },
    overlays: {
      betaFeedback: {
        open: feedback.beta.open,
        onOpenChange: feedback.beta.onOpenChange,
        showTrigger: false,
        context: feedback.beta.context,
      },
      toasts: feedback.toasts,
      shareFallback: {
        url: sharing.url, standalone: sharing.standalone, dark: access.designerTheme,
        lifecycleMode: access.isDesigner ? "designer" : "consumer",
        onClose: sharing.onClose, onCopy: sharing.onCopy, onOpen: sharing.onOpen,
      },
      validation: {
        hidden: false,
        constraints: feedback.validation.constraints,
        confidence: feedback.validation.confidence,
        floorPlanOrientation: feedback.validation.floorPlanOrientation,
      },
      cabinetry: {
        state: cabinetry.state,
        ...cabinetry.access,
        ...cabinetry.configuration,
        openedAtRef: cabinetry.refs.openedAt,
        ...cabinetry.actions,
      },
      itemCart: {
        items: cart.items,
        onRemove: cart.onRemove,
        onUpdateQty: cart.onUpdateQty,
        onClear: cart.onClear,
        onAddAllToRoom: cart.onAddAllToRoom,
        isOpen: cart.isOpen,
        onToggle: cart.onToggle,
        triggerClassName: cart.controlsPanelVisible
          ? "bottom-[calc(64vh+1.25rem)] right-4 md:bottom-4"
          : "bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 md:bottom-4",
      },
    },
  };
}
