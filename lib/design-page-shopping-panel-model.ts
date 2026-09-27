import type { ShopStepProps } from "@/components/editor/shop/ShopStep";
import type { RoomSnapshot } from "@/lib/room-types";

export type BuildDesignPageShoppingPanelModelInput = {
  state: Omit<ShopStepProps, "actions" | "rooms" | "surfaceRooms"> & { rooms: readonly RoomSnapshot[] };
  actions: ShopStepProps["actions"];
};

/**
 * The Shop step reads the whole design (every room) and edits it through the room's history. The
 * editor's rooms carry their finishes, so Shop lists the surfaces too.
 */
export function buildDesignPageShoppingPanelModel({
  state,
  actions,
}: BuildDesignPageShoppingPanelModelInput): ShopStepProps {
  return { ...state, surfaceRooms: state.rooms, actions };
}
