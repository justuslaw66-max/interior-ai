"use client";

import { lazy, Suspense, useState } from "react";
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
  shareFallback: ShareLinkFallbackDialogProps & {
    lifecycleMode: "consumer" | "designer";
  };
  validation: DesignValidationFeedbackProps;
  cabinetry: CabinetryStudioOverlayProps;
  itemCart: ItemCartDrawerProps;
};

export type DesignPageDialogLayerProps = {
  dialogs: DesignPageDialogLayerDialogs;
  overlays: DesignPageDialogLayerOverlays;
};

function getShareFallbackLayerState(
  dialogs: DesignPageDialogLayerDialogs,
  overlays: DesignPageDialogLayerOverlays
) {
  const parentOpen = dialogs.presentExport.configuration.open;
  return {
    open: parentOpen && Boolean(overlays.shareFallback.url),
    scopeKey: `${dialogs.presentExport.state.designId ?? "unsaved"}:${
      overlays.shareFallback.lifecycleMode
    }:${parentOpen ? "parent-open" : "parent-closed"}`,
  };
}

export function DesignPageDialogLayer({ dialogs, overlays }: DesignPageDialogLayerProps) {
  const [myDesignsMounted, setMyDesignsMounted] = useState(false);
  const shareFallback = getShareFallbackLayerState(dialogs, overlays);
  const closeMyDesigns = () => {
    setMyDesignsMounted(true);
    dialogs.myDesigns.onClose();
  };
  const openMyDesignTemplates = () => {
    setMyDesignsMounted(false);
    dialogs.myDesigns.onOpenTemplates();
  };
  const loadMyDesign = (designId: string) => {
    setMyDesignsMounted(false);
    return dialogs.myDesigns.onLoadDesign(designId);
  };

  return (
    <>
      <UpgradeDialog {...dialogs.upgrade} />
      <GuestSavePromptDialog {...dialogs.guestSave} />
      <PlansDialog {...dialogs.plans} />
      <AiNotesDialog {...dialogs.aiNotes} />
      <PresentExportDialog
        {...dialogs.presentExport}
        configuration={{
          ...dialogs.presentExport.configuration,
          shareFallbackOpen: shareFallback.open,
        }}
      />
      {dialogs.myDesigns.open || myDesignsMounted ? (
        <Suspense fallback={null}>
          <MyDesignsDialog
            {...dialogs.myDesigns}
            onClose={closeMyDesigns}
            onOpenTemplates={openMyDesignTemplates}
            onLoadDesign={loadMyDesign}
          />
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
      <ShareLinkFallbackDialog
        key={shareFallback.scopeKey}
        {...overlays.shareFallback}
        url={shareFallback.open ? overlays.shareFallback.url : null}
      />
      <DesignValidationFeedback {...overlays.validation} />
      <CabinetryStudioOverlay {...overlays.cabinetry} />
      <ItemCartDrawer {...overlays.itemCart} />
    </>
  );
}
