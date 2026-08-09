const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function isActionable(element: HTMLElement) {
  if (
    !element.isConnected ||
    element.closest('[hidden], [inert], [aria-hidden="true"]')
  ) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (element.getAttribute("aria-disabled") === "true") return false;
  if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement) {
    if (element.disabled) return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    isActionable
  );
}

export function handleTab(event: KeyboardEvent, panel: HTMLElement) {
  const focusable = getFocusableElements(panel);
  if (focusable.length === 0) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const active = document.activeElement;
  const activeIndex = active instanceof HTMLElement
    ? focusable.indexOf(active)
    : -1;
  const nextIndex = activeIndex < 0
    ? (event.shiftKey ? focusable.length - 1 : 0)
    : (activeIndex + (event.shiftKey ? -1 : 1) + focusable.length) %
      focusable.length;
  event.preventDefault();
  focusable[nextIndex].focus();
}

export function resolveInitialFocusTarget(
  panel: HTMLElement,
  options: {
    initialFocusRef?: { current: HTMLElement | null };
    closeButtonRef: { current: HTMLButtonElement | null };
  }
) {
  return (
    options.initialFocusRef?.current ??
    panel.querySelector<HTMLElement>('[data-editor-dialog-initial-focus="true"]') ??
    options.closeButtonRef.current ??
    getFocusableElements(panel)[0] ??
    panel
  );
}

function isFullyWithinViewport(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return (
    rect.left >= 0 &&
    rect.top >= 0 &&
    rect.right <= window.innerWidth &&
    rect.bottom <= window.innerHeight
  );
}

function hasActivePanelAnimation(panel: HTMLElement) {
  return panel.getAnimations().some(
    (animation) =>
      animation.pending ||
      (animation.playState !== "idle" && animation.playState !== "finished")
  );
}

export function resolveReadyFocusTarget(
  panel: HTMLElement,
  options: {
    initialFocusRef?: { current: HTMLElement | null };
    closeButtonRef: { current: HTMLButtonElement | null };
  },
  waitForEntryTransition: boolean
) {
  if (waitForEntryTransition && hasActivePanelAnimation(panel)) return null;
  if (waitForEntryTransition) panel.inert = false;
  const target = resolveInitialFocusTarget(panel, options);
  if (
    waitForEntryTransition &&
    (!isActionable(target) || !isFullyWithinViewport(target))
  ) {
    panel.inert = true;
    return null;
  }
  return target;
}
