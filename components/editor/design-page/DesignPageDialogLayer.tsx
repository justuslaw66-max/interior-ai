"use client";

import { lazy, Suspense } from "react";
import BetaFeedbackWidget, {
  type BetaFeedbackWidgetProps,
} from "@/components/BetaFeedbackWidget";
import ItemCartDrawer, {
  type ItemCartDrawerProps,
} from "@/components/ItemCartDrawer";
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
import {
  GuestSavePromptDialog,
  type GuestSavePromptDialogProps,
} from "@/components/editor/design-page/GuestSavePromptDialog";
import type { MyDesignsDialogProps } from "@/components/editor/design-page/MyDesignsDialog";
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
  PresentExportDialog,
  type PresentExportDialogProps,
} from "@/components/editor/design-page/PresentExportDialog";
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

const MyDesignsDialog = lazy(async () => {
  const dialogModule = await import("@/components/editor/design-page/MyDesignsDialog");
  return { default: dialogModule.MyDesignsDialog };
});

export type DesignPageDialogLayerDialogs = {
  upgrade: UpgradeDialogProps;
  guestSave: GuestSavePromptDialogProps;
  plans: PlansDialogProps;
  aiNotes: AiNotesDialogProps;
  presentExport: PresentExportDialogProps;
  myDesigns: MyDesignsDialogProps;
  roomRename: RoomRenameDialogProps;
  planAnnotation: PlanAnnotationDialogProps;
  catalogPlacement: CatalogPlacementConfirmPanelProps;
  planTemplateChoice: PlanTemplateChoiceDialogProps;
};

export type DesignPageDialogLayerOverlays = {
  betaFeedback: BetaFeedbackWidgetProps | null;
  toasts: DesignPageToastsProps;
  shareFallback: ShareLinkFallbackDialogProps;
  validation: DesignValidationFeedbackProps;
  cabinetry: CabinetryStudioOverlayProps;
  itemCart: ItemCartDrawerProps;
};

export type DesignPageDialogLayerProps = {
  dialogs: DesignPageDialogLayerDialogs;
  overlays: DesignPageDialogLayerOverlays;
};

export function DesignPageDialogLayer({
  dialogs,
  overlays,
}: DesignPageDialogLayerProps) {
  return (
    <>
      <UpgradeDialog {...dialogs.upgrade} />
      <GuestSavePromptDialog {...dialogs.guestSave} />
      <PlansDialog {...dialogs.plans} />
      <AiNotesDialog {...dialogs.aiNotes} />
      <PresentExportDialog {...dialogs.presentExport} />
      {dialogs.myDesigns.open ? (
        <Suspense fallback={null}>
          <MyDesignsDialog {...dialogs.myDesigns} />
        </Suspense>
      ) : null}
      <RoomRenameDialog {...dialogs.roomRename} />
      <PlanAnnotationDialog {...dialogs.planAnnotation} />
      <CatalogPlacementConfirmPanel {...dialogs.catalogPlacement} />
      <PlanTemplateChoiceDialog {...dialogs.planTemplateChoice} />

      {overlays.betaFeedback ? (
        <BetaFeedbackWidget {...overlays.betaFeedback} />
      ) : null}
      <DesignPageToasts {...overlays.toasts} />
      <ShareLinkFallbackDialog {...overlays.shareFallback} />
      <DesignValidationFeedback {...overlays.validation} />
      <CabinetryStudioOverlay {...overlays.cabinetry} />
      <ItemCartDrawer {...overlays.itemCart} />
    </>
  );
}
