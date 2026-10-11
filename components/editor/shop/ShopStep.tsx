"use client";

import { useCallback, useMemo } from "react";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { announceUndoableAction } from "@/lib/editor-action-toast";
import type { GuestPromptReason } from "@/lib/guest-save-prompt";
import type { DesignItem, PersistedPlanOpening, RoomSnapshot } from "@/lib/room-types";
import {
  buildShoppingList,
  planSwapAll,
  shoppingRemovalStep,
  shoppingSwapStep,
  swapAllMessage,
  swapAllStep,
  withShoppingLineSwapped,
  withSwapAllApplied,
  withoutShoppingLine,
  type ShoppingListLine,
  type ShoppingListRoom,
  type SwapAllDirection,
} from "@/lib/shopping-list";
import type { RoomItemsUpdate } from "@/lib/useCommitItemsToRooms";
import { swapAllButtonId } from "./ShoppingSwapAll";
import { shoppingSurfacesOf, type ShoppingSurface } from "@/lib/shopping-surfaces";
import { useShoppingListBuy } from "@/lib/useShoppingListBuy";
import { ShoppingListPage } from "./ShoppingListPage";

export type ShopStepProps = {
  rooms: readonly ShoppingListRoom[];
  style: string;
  designId: string | null | undefined;
  isGuest: boolean;
  canEdit: boolean;
  /**
   * The product lists have loaded: a swap picks another product, so it waits for them, while Remove
   * doesn't. Defaults to canEdit (the required gates' harnesses).
   */
  canSwap?: boolean;
  /**
   * Swap all (UX 4h): Pro swaps every product at once; Free sees the buttons with a Pro badge that
   * opens Pricing. The editor supplies it; without it (the required gates' harnesses), Shop has none.
   */
  swapAll?: {
    canSwapAll: boolean;
    /** Several rooms in one history step. */
    commitItemsToRooms: (updates: readonly RoomItemsUpdate[], actionName: string) => unknown;
    /** Opens Pricing; closing it hands focus back to the control with this id. */
    openPricing: (openerId: string) => void;
  };
  /** The editor's rooms with their finishes, and the doors and windows that cut the walls: the Surfaces list. */
  surfaceRooms?: readonly RoomSnapshot[];
  planOpenings?: readonly PersistedPlanOpening[];
  actions: {
    commitItemsToRoom: (roomId: string, updater: (items: DesignItem[]) => DesignItem[], actionName: string) => unknown;
    openGuestPrompt: (reason: GuestPromptReason, onContinue: () => void) => void;
    goFurnish: () => void;
  };
};

/** Remove and swap change the design, each as one history step, with Undo in a toast (J, 27 Sep). */
function useShoppingListEdits({ canEdit, canSwap, actions }: Pick<ShopStepProps, "canEdit" | "actions"> & { canSwap: boolean }) {
  const { commitItemsToRoom } = actions;
  const remove = useCallback((line: ShoppingListLine) => {
    if (!canEdit) return;
    const step = shoppingRemovalStep(line);
    commitItemsToRoom(line.roomId, (items) => withoutShoppingLine(items, line.instanceId), step);
    announceUndoableAction({ message: `${line.title} removed from the design`, undoLabels: [step] });
  }, [canEdit, commitItemsToRoom]);

  const swapForCheaper = useCallback((line: ShoppingListLine) => {
    const product = line.cheaperSwap ? CATALOG_ITEMS[line.cheaperSwap.productId] : undefined;
    if (!canSwap || !product) return;
    const step = shoppingSwapStep(line, product.title);
    commitItemsToRoom(line.roomId, (items) => withShoppingLineSwapped(items, line.instanceId, product), step);
    announceUndoableAction({ message: `Swapped for ${product.title}`, undoLabels: [step] });
  }, [canSwap, commitItemsToRoom]);

  return { remove, swapForCheaper };
}

/**
 * Pro's Swap all (UX 4h, J's Q2 (a)): every product with a swap in that direction changes in one
 * history step across the rooms, and one toast offers Undo ("6 products swapped").
 */
function useShoppingSwapAll({ rooms, style, canSwap, swapAll }: Pick<ShopStepProps, "rooms" | "style" | "swapAll"> & { canSwap: boolean }) {
  const canSwapAll = Boolean(swapAll?.canSwapAll);
  const plans = useMemo(
    () => (canSwapAll ? { cheaper: planSwapAll({ rooms, style, direction: "cheaper" }), pricier: planSwapAll({ rooms, style, direction: "pricier" }) } : null),
    [canSwapAll, rooms, style]
  );
  const onSwapAll = useCallback((direction: SwapAllDirection) => {
    if (!swapAll) return;
    if (!plans) return swapAll.openPricing(swapAllButtonId(direction));
    const changes = plans[direction];
    if (!canSwap || changes.length === 0) return;
    const step = swapAllStep(direction);
    const roomIds = Array.from(new Set(changes.map((change) => change.roomId)));
    swapAll.commitItemsToRooms(roomIds.map((roomId) => ({ roomId, update: (items) => withSwapAllApplied(items, roomId, changes) })), step);
    announceUndoableAction({ message: swapAllMessage(changes.length), undoLabels: [step] });
  }, [canSwap, plans, swapAll]);
  const counts = plans ? { cheaper: plans.cheaper.length, pricier: plans.pricier.length } : null;
  return swapAll && canSwap ? { counts, disabled: false, onSwapAll } : null;
}

const NO_SURFACES: readonly ShoppingSurface[] = [];

/** The Shop step: the Shopping list of the whole design, and buying from it (FU7, FU8). */
export function ShopStep({ rooms, style, designId, isGuest, canEdit, canSwap = canEdit, swapAll: swapAllInput, surfaceRooms, planOpenings, actions }: ShopStepProps) {
  const list = useMemo(() => buildShoppingList({ rooms, style }), [rooms, style]);
  const surfaces = useMemo(() => (surfaceRooms ? shoppingSurfacesOf(surfaceRooms, planOpenings) : NO_SURFACES), [surfaceRooms, planOpenings]);
  const buy = useShoppingListBuy({ list, designId, isGuest, openGuestPrompt: actions.openGuestPrompt });
  const edits = useShoppingListEdits({ canEdit, canSwap, actions });
  const swapAll = useShoppingSwapAll({ rooms, style, canSwap, swapAll: swapAllInput });
  return (
    <ShoppingListPage
      list={list}
      surfaces={surfaces}
      canEdit={canEdit}
      canSwap={canSwap}
      busy={buy.busy}
      notice={buy.notice}
      buyList={buy.buyList}
      swapAll={swapAll}
      actions={{ ...buy.actions, ...edits, goFurnish: actions.goFurnish }}
    />
  );
}
