"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  removalFocusCandidates,
  shoppingListLines,
  type ShoppingList,
  type ShoppingListLine,
} from "@/lib/shopping-list";

/** The Shopping list's heading: it takes focus when the last product is removed. */
export const SHOPPING_LIST_TITLE_ID = "shopping-list-title";

type PendingFocus =
  | { kind: "remove"; instanceId: string; candidates: string[] }
  | { kind: "swap"; instanceId: string; productId: string };

type ShoppingListEdits = {
  remove: (line: ShoppingListLine) => void;
  swapForCheaper: (line: ShoppingListLine) => void;
};

function rowControl(page: HTMLElement, instanceId: string, testId: string): HTMLElement | null {
  const row = Array.from(page.querySelectorAll<HTMLElement>('[data-testid="shopping-list-row"]')).find(
    (element) => element.dataset.instanceId === instanceId
  );
  return row?.querySelector<HTMLElement>(`[data-testid="${testId}"]`) ?? null;
}

/** Moves focus once the list shows the edit; an edit that didn't happen moves nothing. */
export function focusAfterShoppingListEdit(page: HTMLElement, pending: PendingFocus, lines: readonly ShoppingListLine[]) {
  const line = lines.find((entry) => entry.instanceId === pending.instanceId);
  if (pending.kind === "swap") {
    if (!line || line.productId === pending.productId) return;
    (rowControl(page, line.instanceId, "shopping-list-swap") ?? rowControl(page, line.instanceId, "shopping-list-remove"))?.focus();
    return;
  }
  if (line) return;
  const listed = new Set(lines.map((entry) => entry.instanceId));
  const next = pending.candidates.find((instanceId) => listed.has(instanceId));
  const target = next ? rowControl(page, next, "shopping-list-remove") : null;
  (target ?? page.ownerDocument.getElementById(SHOPPING_LIST_TITLE_ID))?.focus();
}

/**
 * Remove takes its row, and the focused button with it, off the page, so focus moves to the next
 * product's Remove, else the one before it, else the heading. A swap keeps the row; when the new
 * product has no cheaper swap, focus moves from the gone Swap to the row's Remove.
 */
export function useShoppingListFocus(list: ShoppingList, edits: ShoppingListEdits, pageRef: RefObject<HTMLElement | null>) {
  const pendingRef = useRef<PendingFocus | null>(null);
  useEffect(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending && pageRef.current) focusAfterShoppingListEdit(pageRef.current, pending, shoppingListLines(list));
  }, [list, pageRef]);

  const { remove, swapForCheaper } = edits;
  const removeKeepingFocus = useCallback(
    (line: ShoppingListLine) => {
      pendingRef.current = { kind: "remove", instanceId: line.instanceId, candidates: removalFocusCandidates(list, line.instanceId) };
      remove(line);
    },
    [list, remove]
  );
  const swapKeepingFocus = useCallback(
    (line: ShoppingListLine) => {
      pendingRef.current = { kind: "swap", instanceId: line.instanceId, productId: line.productId };
      swapForCheaper(line);
    },
    [swapForCheaper]
  );
  return { remove: removeKeepingFocus, swapForCheaper: swapKeepingFocus };
}
