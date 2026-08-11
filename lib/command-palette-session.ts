import { GUEST_PROMPT_WORKFLOW_FALLBACK_ID } from "@/lib/guest-save-prompt";
import { CLIENT_PREVIEW_FALLBACK_ACTION_ID } from "@/lib/useClientPreviewCommandBarFocus";

export const COMMAND_PALETTE_RETURN_TARGET_ID =
  "editor-command-palette-return-target";

export type CommandPaletteSemanticOpener = {
  kind: "testid" | "id" | "aria-label";
  semanticIdentity: string;
};

export type CommandPaletteSession = {
  generation: number;
  scopeKey: string;
  query: string;
  opener: CommandPaletteSemanticOpener | null;
  returnFocusIds: string[];
  actionConsumed: boolean;
  cancelled: boolean;
};

const EDITOR_ACTION_OWNER_SELECTOR = [
  "#editor-command-bar-root",
  '[data-testid="editor-tool-rail"]',
  '[data-testid="design-controls-panel"]',
  '[data-testid="selected-item-panel"]',
  '[data-testid="active-room-focus-toolbar"]',
  '[data-testid="scene-adjustment-toolbar"]',
].join(",");

function isInteractiveElement(element: HTMLElement) {
  return (
    element instanceof HTMLButtonElement ||
    element instanceof HTMLAnchorElement ||
    element instanceof HTMLSelectElement ||
    element.getAttribute("role") === "button" ||
    element.getAttribute("role") === "menuitem" ||
    element.getAttribute("role") === "tab"
  );
}

function isDisabledControl(element: HTMLElement) {
  if (element.getAttribute("aria-disabled") === "true") return true;
  if (element instanceof HTMLButtonElement) return element.disabled;
  if (element instanceof HTMLInputElement) return element.disabled;
  return element instanceof HTMLSelectElement && element.disabled;
}

function hasVisibleReturnGeometry(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) > 0 &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.left >= 0 &&
    rect.top >= 0 &&
    rect.right <= window.innerWidth &&
    rect.bottom <= window.innerHeight
  );
}

function isPotentialReturnTarget(element: HTMLElement) {
  return (
    element.isConnected &&
    !element.closest("[hidden]") &&
    element.getAttribute("aria-hidden") !== "true" &&
    !isDisabledControl(element) &&
    hasVisibleReturnGeometry(element)
  );
}

function getSemanticOpener(
  element: HTMLElement
): CommandPaletteSemanticOpener | null {
  const testId = element.dataset.testid;
  if (testId) return { kind: "testid", semanticIdentity: testId };
  if (element.id) return { kind: "id", semanticIdentity: element.id };
  const accessibleLabel = element.getAttribute("aria-label");
  return accessibleLabel
    ? { kind: "aria-label", semanticIdentity: accessibleLabel }
    : null;
}

function matchesSemanticOpener(
  element: HTMLElement,
  opener: CommandPaletteSemanticOpener
) {
  if (opener.kind === "testid") {
    return element.dataset.testid === opener.semanticIdentity;
  }
  if (opener.kind === "id") return element.id === opener.semanticIdentity;
  return element.getAttribute("aria-label") === opener.semanticIdentity;
}

function clearPreparedReturnTarget() {
  const target = document.getElementById(COMMAND_PALETTE_RETURN_TARGET_ID);
  if (target) target.removeAttribute("id");
}

export function captureCommandPaletteSemanticOpener() {
  clearPreparedReturnTarget();
  const active = document.activeElement;
  if (
    !(active instanceof HTMLElement) ||
    !isInteractiveElement(active) ||
    !active.closest(EDITOR_ACTION_OWNER_SELECTOR) ||
    !isPotentialReturnTarget(active)
  ) {
    return null;
  }
  return getSemanticOpener(active);
}

export function createCommandPaletteSession(
  generation: number,
  scopeKey: string,
  opener: CommandPaletteSemanticOpener | null
): CommandPaletteSession {
  return {
    generation,
    scopeKey,
    query: "",
    opener,
    returnFocusIds: [
      COMMAND_PALETTE_RETURN_TARGET_ID,
      CLIENT_PREVIEW_FALLBACK_ACTION_ID,
      GUEST_PROMPT_WORKFLOW_FALLBACK_ID,
    ],
    actionConsumed: false,
    cancelled: false,
  };
}

export function prepareCommandPaletteReturnTarget(
  session: CommandPaletteSession
) {
  clearPreparedReturnTarget();
  if (!session.opener) return;
  const candidates: HTMLElement[] = [];
  for (const candidate of document.getElementsByTagName("*")) {
    if (
      candidate instanceof HTMLElement &&
      matchesSemanticOpener(candidate, session.opener) &&
      isInteractiveElement(candidate) &&
      candidate.closest(EDITOR_ACTION_OWNER_SELECTOR) &&
      isPotentialReturnTarget(candidate)
    ) {
      candidates.push(candidate);
    }
  }
  if (candidates.length !== 1) return;
  const target = candidates[0];
  if (target.id) {
    session.returnFocusIds[0] = target.id;
  } else {
    target.id = COMMAND_PALETTE_RETURN_TARGET_ID;
    session.returnFocusIds[0] = COMMAND_PALETTE_RETURN_TARGET_ID;
  }
}

export function cancelCommandPaletteSession(session: CommandPaletteSession) {
  session.cancelled = true;
}

export function consumeCommandPaletteAction(session: CommandPaletteSession) {
  if (session.cancelled || session.actionConsumed) return false;
  session.actionConsumed = true;
  session.query = "";
  return true;
}

export function executeCommandPaletteAction(
  session: CommandPaletteSession,
  closePalette: () => void,
  runAction: () => void
) {
  if (!consumeCommandPaletteAction(session)) return false;
  closePalette();
  runAction();
  return true;
}
