"use client";

import { useCallback, useMemo } from "react";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { announceUndoableAction } from "@/lib/editor-action-toast";
import type { GuestPromptReason } from "@/lib/guest-save-prompt";
import type { DesignItem, PersistedPlanOpening, RoomSnapshot } from "@/lib/room-types";
import {
  buildShoppingList,
  shoppingRemovalStep,
  shoppingSwapStep,
  withShoppingLineSwapped,
  withoutShoppingLine,
  type ShoppingListLine,
  type ShoppingListRoom,
} from "@/lib/shopping-list";
import { shoppingSurfacesOf, type ShoppingSurface } from "@/lib/shopping-surfaces";
import { useShoppingListBuy } from "@/lib/useShoppingListBuy";
import { ShoppingListPage } from "./ShoppingListPage";

export type ShopStepProps = {
  rooms: readonly ShoppingListRoom[];
  style: string;
  designId: string | null | undefined;
  isGuest: boolean;
  canEdit: boolean;
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
function useShoppingListEdits({ canEdit, actions }: Pick<ShopStepProps, "canEdit" | "actions">) {
  const { commitItemsToRoom } = actions;
  const remove = useCallback((line: ShoppingListLine) => {
    if (!canEdit) return;
    const step = shoppingRemovalStep(line);
    commitItemsToRoom(line.roomId, (items) => withoutShoppingLine(items, line.instanceId), step);
    announceUndoableAction({ message: `${line.title} removed from the design`, undoLabels: [step] });
  }, [canEdit, commitItemsToRoom]);

  const swapForCheaper = useCallback((line: ShoppingListLine) => {
    const product = line.cheaperSwap ? CATALOG_ITEMS[line.cheaperSwap.productId] : undefined;
    if (!canEdit || !product) return;
    const step = shoppingSwapStep(line, product.title);
    commitItemsToRoom(line.roomId, (items) => withShoppingLineSwapped(items, line.instanceId, product), step);
    announceUndoableAction({ message: `Swapped for ${product.title}`, undoLabels: [step] });
  }, [canEdit, commitItemsToRoom]);

  return { remove, swapForCheaper };
}

const NO_SURFACES: readonly ShoppingSurface[] = [];

/** The Shop step: the Shopping list of the whole design, and buying from it (FU7, FU8). */
export function ShopStep({ rooms, style, designId, isGuest, canEdit, surfaceRooms, planOpenings, actions }: ShopStepProps) {
  const list = useMemo(() => buildShoppingList({ rooms, style }), [rooms, style]);
  const surfaces = useMemo(() => (surfaceRooms ? shoppingSurfacesOf(surfaceRooms, planOpenings) : NO_SURFACES), [surfaceRooms, planOpenings]);
  const buy = useShoppingListBuy({ list, designId, isGuest, openGuestPrompt: actions.openGuestPrompt });
  const edits = useShoppingListEdits({ canEdit, actions });
  return (
    <ShoppingListPage
      list={list}
      surfaces={surfaces}
      canEdit={canEdit}
      busy={buy.busy}
      notice={buy.notice}
      buyList={buy.buyList}
      actions={{ ...buy.actions, ...edits, goFurnish: actions.goFurnish }}
    />
  );
}
