"use client";

import { useEffect, useRef, type RefObject } from "react";

const MENU_ITEM_SELECTOR = '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])';

/**
 * Where ArrowDown, ArrowUp, Home and End move focus in a menu of `count` items, from the item at
 * `current` (-1 when focus is on the menu's button), or null for any other key. The arrows wrap.
 */
export function nextMenuItemIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null;
  const last = count - 1;
  switch (key) {
    case "Home":
      return 0;
    case "End":
      return last;
    case "ArrowDown":
      return current < 0 || current >= last ? 0 : current + 1;
    case "ArrowUp":
      return current <= 0 ? last : current - 1;
    default:
      return null;
  }
}

function moveMenuFocus(event: KeyboardEvent, container: HTMLElement | null) {
  const active = document.activeElement;
  if (!container || !(active instanceof HTMLElement) || !container.contains(active)) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR));
  const next = nextMenuItemIndex(event.key, items.indexOf(active), items.length);
  if (next === null) return;
  event.preventDefault();
  items[next]?.focus();
}

/**
 * Closes an open menu on a press outside it, or on Escape, which also hands focus back to the
 * menu's button (`byKeyboard`). While it is open, the arrow keys, Home and End move focus through
 * its items. My designs' cards, the app header's account menu and the editor bar's More and
 * Account menus all use it.
 */
export function useDismissibleMenu({
  open,
  containerRef,
  onDismiss,
}: {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onDismiss: (byKeyboard: boolean) => void;
}) {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && containerRef.current?.contains(event.target)) return;
      dismissRef.current(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissRef.current(true);
      else moveMenuFocus(event, containerRef.current);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, containerRef]);
}
