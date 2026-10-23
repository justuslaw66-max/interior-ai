"use client";

import { useEffect, useState } from "react";

/**
 * A press of the mouse, pen or finger anywhere on the page, from pointerdown until just after its
 * click. A field's message that appears during it would move the controls below it between the
 * press and the release, and the click would be lost: type a module width over 1,000 mm, press
 * "Change" below it, and leaving the field brings up "Width needs attention" above the button
 * (laminates r3; J, 24 Oct: "fix the issue"). The value is still committed at once, so the click
 * acts on it; only the new message waits until the click has landed.
 */
let pressing = false;
let listening = false;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;
const afterPressCallbacks = new Set<() => void>();

function startPress(event: PointerEvent) {
  if (!event.isPrimary) return;
  clearTimeout(releaseTimer);
  pressing = true;
}

function endPress() {
  if (!pressing) return;
  // pointerup, mouseup and click are dispatched together, so the click has landed by this timer.
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    pressing = false;
    const callbacks = Array.from(afterPressCallbacks);
    afterPressCallbacks.clear();
    callbacks.forEach((callback) => callback());
  }, 0);
}

// The window losing focus ends a press too. Without capture, this hears only the window's own blur:
// a field's blur doesn't bubble, and the press's own blur must not end it.
function endPressOnWindowBlur(event: FocusEvent) {
  if (event.target === window) endPress();
}

function listenForPresses() {
  if (listening) return;
  listening = true;
  window.addEventListener("pointerdown", startPress, true);
  window.addEventListener("pointerup", endPress, true);
  window.addEventListener("pointercancel", endPress, true);
  window.addEventListener("blur", endPressOnWindowBlur);
}

function afterPress(callback: () => void): () => void {
  if (!pressing) {
    callback();
    return () => undefined;
  }
  afterPressCallbacks.add(callback);
  return () => {
    afterPressCallbacks.delete(callback);
  };
}

/** `value`, except that a change made during a press shows once the press's click has landed. */
export function useHeldDuringPointerPress<T extends string | number | boolean | null | undefined>(value: T): T {
  useEffect(listenForPresses, []);
  const [shown, setShown] = useState(value);
  const held = !Object.is(shown, value);
  if (held && !pressing) setShown(value);
  useEffect(() => {
    if (!held) return;
    return afterPress(() => setShown(value));
  }, [held, value]);
  return held && pressing ? shown : value;
}
