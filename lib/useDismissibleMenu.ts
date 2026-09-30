"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Closes an open menu on a press outside it, or on Escape, which also hands focus back to the
 * menu's button (`byKeyboard`). The editor's command bar menus behave the same way.
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
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, containerRef]);
}
