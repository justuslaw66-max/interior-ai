"use client";

import CartSidebar, {
  type CartSidebarProps,
} from "@/components/CartSidebar";
import ShoppingOverviewPanel, {
  type ShoppingOverviewPanelProps,
} from "@/components/editor/ShoppingOverviewPanel";
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

export type DesignPageShoppingDockContract = {
  overview: ShoppingOverviewPanelProps;
  cart: CartSidebarProps;
};

export type DesignPagePanelRegionState = {
  shopping: DesignPageShoppingDockContract | null;
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
};

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
}: DesignPagePanelRegionProps) {
  const { designerTheme, isDesigner, isClientPreview } = configuration;

  return (
    <>
      <ClientPreviewExitAction
        visible={isClientPreview}
        onExit={actions.exitClientPreview}
      />

      {state.shopping ? (
        <div
          data-testid="shopping-dock"
          className={`absolute bottom-3 left-3 right-3 top-auto z-20 w-auto max-h-[64vh] space-y-3 overflow-y-auto pb-[calc(0.75rem+env(safe-area-inset-bottom))] pr-1 transition-opacity duration-300 md:bottom-auto md:right-auto md:top-15 md:w-[18.15rem] md:max-h-[calc(100vh-4.75rem)] md:pb-4 ${
            isDesigner ? "md:left-20" : "md:left-4"
          } ${
            isClientPreview
              ? "pointer-events-none opacity-0"
              : "opacity-100"
          }`}
          aria-hidden={isClientPreview}
        >
          <div
            className={
              designerTheme
                ? "designer-dock rounded-xl p-3 text-neutral-100"
                : "rounded-xl border border-neutral-200 bg-white/95 p-3 text-neutral-900 shadow-lg backdrop-blur"
            }
          >
            <div
              className={
                designerTheme
                  ? "text-lg font-semibold text-white"
                  : "text-lg font-semibold text-neutral-950"
              }
            >
              Shop
            </div>
            <div
              className={
                designerTheme
                  ? "mt-1 text-xs text-neutral-400"
                  : "mt-1 text-xs text-neutral-500"
              }
            >
              Review shopping list and checkout readiness.
            </div>
          </div>
          <ShoppingOverviewPanel {...state.shopping.overview} />
          <CartSidebar {...state.shopping.cart} />
        </div>
      ) : null}

      {state.selectedCabinet ? (
        <SelectedCabinetPanel {...state.selectedCabinet} />
      ) : null}
      {state.selectedItem ? <SelectedItemPanel {...state.selectedItem} /> : null}
      {state.controls ? (
        <DesignControlsPanelAdapter {...state.controls} />
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
