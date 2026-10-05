"use client";

import type { ReactNode } from "react";
import { TABLET_ITEM_PANEL_INSET_PX, useReportTabletRightPanel } from "@/lib/tablet-panel-policy";
import { ShopStep, type ShopStepProps } from "@/components/editor/shop/ShopStep";
import {
  DesignControlsPanelAdapter,
  type DesignControlsPanelAdapterProps,
} from "@/components/editor/design-page/DesignControlsPanelAdapter";
import {
  SelectedCabinetPanel,
  type SelectedCabinetPanelProps,
} from "@/components/editor/design-page/SelectedCabinetPanel";
import {
  SelectedItemPanel,
  type SelectedItemPanelProps,
} from "@/components/editor/design-page/SelectedItemPanel";
import { CLIENT_PREVIEW_EXIT_ACTION_ID } from "@/lib/useClientPreviewCommandBarFocus";
import type { PresentExportDialogProps } from "@/components/editor/design-page/PresentExportDialog";
import { planStepFooter } from "@/components/editor/design-page/PlanDisplaySection";

export type DesignPagePanelRegionState = {
  shopping: ShopStepProps | null;
  selectedCabinet: SelectedCabinetPanelProps | null;
  selectedItem: SelectedItemPanelProps | null;
  controls: DesignControlsPanelAdapterProps | null;
};

export type DesignPagePanelRegionConfiguration = {
  designerTheme: boolean;
  isDesigner: boolean;
  isClientPreview: boolean;
};

export type DesignPagePanelRegionActions = {
  exitClientPreview: () => void;
};

export type DesignPagePanelRegionProps = {
  state: DesignPagePanelRegionState;
  configuration: DesignPagePanelRegionConfiguration;
  actions: DesignPagePanelRegionActions;
  /** The plan display (Pro) or the plan's notes (Free), at the foot of Plan's panel (UX 4e, SX4). */
  planTools?: PresentExportDialogProps | null;
};

/**
 * Shop is a page over the canvas (UX audit FU8). While it covers the canvas, the canvas and its
 * controls leave the tab order and the accessibility tree, so nobody tabs into what they can't see.
 */
export function CanvasBehindPage({ covered, children }: { covered: boolean; children: ReactNode }) {
  return (
    <div data-testid="canvas-behind-page" className="h-full w-full" inert={covered} aria-hidden={covered || undefined}>
      {children}
    </div>
  );
}

function ClientPreviewExitAction({
  visible,
  onExit,
}: {
  visible: boolean;
  onExit: () => void;
}) {
  if (!visible) return null;
  return (
    <div className="fixed left-1/2 top-4 z-60 -translate-x-1/2 transform">
      <button
        id={CLIENT_PREVIEW_EXIT_ACTION_ID}
        data-testid="client-preview-exit"
        type="button"
        aria-label="Exit Presentation"
        className="rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-red-700"
        onClick={onExit}
        title="Exit Presentation Mode (P)"
      >
        ✕ Exit Presentation
      </button>
    </div>
  );
}

export function DesignPagePanelRegion({
  state,
  configuration,
  actions,
  planTools,
}: DesignPagePanelRegionProps) {
  const { isClientPreview } = configuration;
  // On a tablet the step panel steps aside for the item or cabinet panel (UX 4d, AX11).
  useReportTabletRightPanel("item", !isClientPreview && Boolean(state.selectedItem || state.selectedCabinet), TABLET_ITEM_PANEL_INSET_PX);

  return (
    <>
      <ClientPreviewExitAction
        visible={isClientPreview}
        onExit={actions.exitClientPreview}
      />

      {state.shopping ? (
        <div
          data-testid="shop-step"
          className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] top-bar-0 z-40 overflow-y-auto bg-[#fafaf9] md:bottom-0"
        >
          <ShopStep {...state.shopping} />
        </div>
      ) : null}

      {state.selectedCabinet ? (
        <SelectedCabinetPanel {...state.selectedCabinet} />
      ) : null}
      {state.selectedItem ? <SelectedItemPanel {...state.selectedItem} /> : null}
      {state.controls ? (
        <DesignControlsPanelAdapter {...state.controls} stepFooter={planStepFooter(state.controls.configuration.panelMode, planTools)} />
      ) : null}

      {isClientPreview ? (
        <>
          <div className="absolute right-6 top-6 z-30 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs text-white">
            Client-safe view - nothing editable
          </div>
          <div className="absolute bottom-5 right-6 z-30 text-xs text-white/40">
            beta preview
          </div>
        </>
      ) : null}
    </>
  );
}
