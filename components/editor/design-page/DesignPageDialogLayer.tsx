"use client";

import BetaFeedbackWidget, {
  type BetaFeedbackWidgetProps,
} from "@/components/BetaFeedbackWidget";
import {
  AiNotesDialog,
  type AiNotesDialogProps,
} from "@/components/editor/design-page/AiNotesDialog";
import {
  CabinetryStudioOverlay,
  type CabinetryStudioOverlayProps,
} from "@/components/editor/design-page/CabinetryStudioOverlay";
import {
  CatalogPlacementConfirmPanel,
  type CatalogPlacementConfirmPanelProps,
} from "@/components/editor/design-page/CatalogPlacementConfirmPanel";
import {
  DesignPageToasts,
  type DesignPageToastsProps,
} from "@/components/editor/design-page/DesignPageToasts";
import {
  DesignValidationFeedback,
  type DesignValidationFeedbackProps,
} from "@/components/editor/design-page/DesignValidationFeedback";
import { DesignRenameDialog, type DesignRenameDialogProps } from "@/components/editor/design-page/DesignRenameDialog";
import {
  DownloadDialog,
  type DownloadDialogProps,
} from "@/components/editor/design-page/DownloadDialog";
import {
  GuestSavePromptDialog,
  type GuestSavePromptDialogProps,
} from "@/components/editor/design-page/GuestSavePromptDialog";
import {
  PlanAnnotationDialog,
  type PlanAnnotationDialogProps,
} from "@/components/editor/design-page/PlanAnnotationDialog";
import {
  PlansDialog,
  type PlansDialogProps,
} from "@/components/editor/design-page/PlansDialog";
import {
  PlanTemplateChoiceDialog,
  type PlanTemplateChoiceDialogProps,
} from "@/components/editor/design-page/PlanTemplateChoiceDialog";
import {
  RoomRenameDialog,
  type RoomRenameDialogProps,
} from "@/components/editor/design-page/RoomRenameDialog";
import {
  ShareLinkFallbackDialog,
  type ShareLinkFallbackDialogProps,
} from "@/components/editor/design-page/ShareLinkFallbackDialog";
import {
  UpgradeDialog,
  type UpgradeDialogProps,
} from "@/components/editor/design-page/UpgradeDialog";
import { StartDesignChooser, type StartDesignChooserProps } from "@/components/editor/start/StartDesignChooser";

export type DesignPageDialogLayerDialogs = {
  upgrade: UpgradeDialogProps;
  guestSave: GuestSavePromptDialogProps;
  plans: PlansDialogProps;
  aiNotes: AiNotesDialogProps;
  download: DownloadDialogProps;
  designRename: DesignRenameDialogProps;
  roomRename: RoomRenameDialogProps;
  planAnnotation: PlanAnnotationDialogProps;
  catalogPlacement: CatalogPlacementConfirmPanelProps;
  planTemplateChoice: PlanTemplateChoiceDialogProps;
  startChooser: StartDesignChooserProps;
};

export type DesignPageDialogLayerOverlays = {
  betaFeedback: BetaFeedbackWidgetProps | null;
  toasts: DesignPageToastsProps;
  shareFallback: Omit<ShareLinkFallbackDialogProps, "copied" | "errorMessage"> & {
    lifecycleMode: "consumer" | "designer";
    /** The design whose link it is: another design, or another mode, starts a new fallback. */
    designId: string | null;
  };
  validation: DesignValidationFeedbackProps;
  cabinetry: CabinetryStudioOverlayProps;
};

export type DesignPageDialogLayerProps = {
  dialogs: DesignPageDialogLayerDialogs;
  overlays: DesignPageDialogLayerOverlays;
};

// The bar's Share opens the fallback when the clipboard refuses its link; its copy feedback shows
// in the fallback, not in a toast behind it.
function getShareFallbackLayerState(overlays: DesignPageDialogLayerOverlays) {
  const open = Boolean(overlays.shareFallback.url);
  return {
    open,
    toasts: open ? { ...overlays.toasts, shareCopied: false, shareErrorMessage: null } : overlays.toasts,
    scopeKey: `${overlays.shareFallback.designId ?? "unsaved"}:${overlays.shareFallback.lifecycleMode}`,
  };
}

export function DesignPageDialogLayer({ dialogs, overlays }: DesignPageDialogLayerProps) {
  const shareFallback = getShareFallbackLayerState(overlays);

  return (
    <>
      <UpgradeDialog {...dialogs.upgrade} />
      <GuestSavePromptDialog key={dialogs.guestSave.lifecycleScopeKey} {...dialogs.guestSave} />
      <PlansDialog {...dialogs.plans} />
      <AiNotesDialog {...dialogs.aiNotes} />
      <DownloadDialog {...dialogs.download} />
      <DesignRenameDialog {...dialogs.designRename} />
      <RoomRenameDialog {...dialogs.roomRename} />
      <PlanAnnotationDialog {...dialogs.planAnnotation} />
      <CatalogPlacementConfirmPanel {...dialogs.catalogPlacement} />
      <PlanTemplateChoiceDialog {...dialogs.planTemplateChoice} />
      <StartDesignChooser {...dialogs.startChooser} />
      {overlays.betaFeedback ? (
        <BetaFeedbackWidget {...overlays.betaFeedback} />
      ) : null}
      <DesignPageToasts {...shareFallback.toasts} />
      <ShareLinkFallbackDialog
        key={shareFallback.scopeKey}
        {...overlays.shareFallback}
        url={shareFallback.open ? overlays.shareFallback.url : null}
        copied={overlays.toasts.shareCopied} errorMessage={overlays.toasts.shareErrorMessage}
      />
      <DesignValidationFeedback {...overlays.validation} />
      <CabinetryStudioOverlay {...overlays.cabinetry} />
    </>
  );
}
