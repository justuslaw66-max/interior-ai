import type {
  DesignPageDialogLayerDialogs,
  DesignPageDialogLayerOverlays,
  DesignPageDialogLayerProps,
} from "@/components/editor/design-page/DesignPageDialogLayer";

type UpgradeDialog = DesignPageDialogLayerDialogs["upgrade"];
type GuestSaveDialog = DesignPageDialogLayerDialogs["guestSave"];
type PresentExportDialog = DesignPageDialogLayerDialogs["presentExport"];

export type BuildDesignPageDialogLayerAdapterInput = {
  state: {
    isClientPreview: boolean;
    upgradeOpen: boolean;
    guestSaveReason: GuestSaveDialog["reason"];
  };
  dialogs: Omit<
    DesignPageDialogLayerDialogs,
    "upgrade" | "guestSave" | "presentExport"
  > & {
    upgrade: {
      state: Omit<UpgradeDialog["state"], "open">;
      actions: UpgradeDialog["actions"];
    };
    guestSave: Omit<GuestSaveDialog, "reason">;
    presentExport: PresentExportDialog;
  };
  overlays: DesignPageDialogLayerOverlays;
};

/** Applies dialog visibility policy while preserving the fixed layer order. */
export function buildDesignPageDialogLayerAdapter({
  state,
  dialogs,
  overlays,
}: BuildDesignPageDialogLayerAdapterInput): DesignPageDialogLayerProps {
  const { isClientPreview } = state;

  return {
    dialogs: {
      upgrade: {
        state: {
          ...dialogs.upgrade.state,
          open: state.upgradeOpen && !isClientPreview,
        },
        actions: dialogs.upgrade.actions,
      },
      guestSave: {
        ...dialogs.guestSave,
        reason: isClientPreview ? null : state.guestSaveReason,
      },
      plans: dialogs.plans,
      aiNotes: dialogs.aiNotes,
      presentExport: {
        ...dialogs.presentExport,
        configuration: {
          ...dialogs.presentExport.configuration,
          open:
            dialogs.presentExport.configuration.open && !isClientPreview,
        },
      },
      myDesigns: dialogs.myDesigns,
      roomRename: dialogs.roomRename,
      planAnnotation: dialogs.planAnnotation,
      catalogPlacement: dialogs.catalogPlacement,
      planTemplateChoice: dialogs.planTemplateChoice,
    },
    overlays: {
      betaFeedback: isClientPreview ? null : overlays.betaFeedback,
      toasts: overlays.toasts,
      shareFallback: overlays.shareFallback,
      validation: {
        ...overlays.validation,
        hidden: overlays.validation.hidden || isClientPreview,
      },
      cabinetry: overlays.cabinetry,
      itemCart: overlays.itemCart,
    },
  };
}
