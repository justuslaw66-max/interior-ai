import type { CartSidebarProps } from "@/components/CartSidebar";
import type { ShoppingOverviewPanelProps } from "@/components/editor/ShoppingOverviewPanel";
import type { DesignPageShoppingDockContract } from "@/components/editor/design-page/DesignPagePanelRegion";

type ShoppingOverviewState = Pick<
  ShoppingOverviewPanelProps,
  | "activeRoom"
  | "activeRoomItems"
  | "catalogItems"
  | "rooms"
  | "wholeHome"
  | "activeFilter"
>;

type ShoppingOverviewActions = Pick<
  ShoppingOverviewPanelProps,
  | "onSelectRoom"
  | "onGoFurnish"
  | "onAddActiveRoomCartReadyItems"
  | "onSetItemInclude"
  | "onSwapShoppingItem"
  | "onPreviewReplacement"
  | "onFilterChange"
>;

type ShoppingCartState = Pick<
  CartSidebarProps,
  "items" | "designId" | "plan" | "isGuest"
>;

type ShoppingCartActions = Pick<
  CartSidebarProps,
  | "onRemove"
  | "onSetQty"
  | "onSetInclude"
  | "onBulkSwap"
  | "onShowUpgrade"
> & {
  openGuestPrompt: NonNullable<CartSidebarProps["onGuestCapture"]>;
};

export type BuildDesignPageShoppingPanelModelInput = {
  configuration: { designerTheme: boolean };
  state: {
    overview: ShoppingOverviewState;
    cart: ShoppingCartState;
  };
  actions: {
    overview: ShoppingOverviewActions;
    cart: ShoppingCartActions;
  };
};

/** Maps shopping-domain state into the two fixed dock panels. */
export function buildDesignPageShoppingPanelModel({
  configuration,
  state,
  actions,
}: BuildDesignPageShoppingPanelModelInput): DesignPageShoppingDockContract {
  const { openGuestPrompt, ...cartActions } = actions.cart;

  return {
    overview: {
      dark: configuration.designerTheme,
      ...state.overview,
      ...actions.overview,
    },
    cart: {
      ...state.cart,
      ...cartActions,
      onGuestCapture: openGuestPrompt,
      theme: configuration.designerTheme ? "designer" : "default",
    },
  };
}
