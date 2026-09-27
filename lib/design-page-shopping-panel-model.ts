import type { ShopStepProps } from "@/components/editor/shop/ShopStep";

export type BuildDesignPageShoppingPanelModelInput = {
  state: Omit<ShopStepProps, "actions">;
  actions: ShopStepProps["actions"];
};

/** The Shop step reads the whole design (every room) and edits it through the room's history. */
export function buildDesignPageShoppingPanelModel({
  state,
  actions,
}: BuildDesignPageShoppingPanelModelInput): ShopStepProps {
  return { ...state, actions };
}
