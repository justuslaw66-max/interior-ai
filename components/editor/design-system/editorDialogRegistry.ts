const MODAL_SELECTOR =
  ':is([role="dialog"], [role="alertdialog"])[aria-modal="true"]';

export type EditorDialogToken = symbol;

const dialogStack: EditorDialogToken[] = [];
const dialogRoots = new Map<EditorDialogToken, HTMLElement>();
const dialogVisualLayers = new Map<
  EditorDialogToken,
  {
    baseZIndex: number;
    inlineValue: string;
    inlinePriority: string;
    hideWhenSuperseded: boolean;
    visibilityValue: string;
    visibilityPriority: string;
  }
>();
const dialogBackgroundOwners = new Set<EditorDialogToken>();
const dialogOwnershipGuards = new Map<EditorDialogToken, () => void>();
const managedBackground = new Map<
  HTMLElement,
  { inert: boolean; ariaHidden: string | null }
>();

export function resolveEditorDialogStackZIndexes(
  baseZIndexes: readonly number[]
) {
  const stackBase = Math.max(50, ...baseZIndexes);
  return baseZIndexes.map((_, index) => stackBase + index);
}

function refreshDialogVisualStack() {
  const layers = dialogStack.map((token) => dialogVisualLayers.get(token));
  const zIndexes = resolveEditorDialogStackZIndexes(
    layers.map((layer) => layer?.baseZIndex ?? 50)
  );
  dialogStack.forEach((token, index) => {
    const root = dialogRoots.get(token);
    const layer = dialogVisualLayers.get(token);
    if (!root || !layer) return;
    root.style.setProperty("z-index", String(zIndexes[index]), "important");
    root.dataset.editorDialogStackIndex = String(index);
    if (layer.hideWhenSuperseded && index < dialogStack.length - 1) {
      root.style.setProperty("visibility", "hidden", "important");
      root.dataset.editorDialogVisuallySuppressed = "true";
    } else {
      restoreDialogVisibility(root, layer);
    }
  });
}

function restoreDialogVisibility(
  root: HTMLElement,
  layer: { visibilityValue: string; visibilityPriority: string }
) {
  if (layer.visibilityValue) {
    root.style.setProperty(
      "visibility",
      layer.visibilityValue,
      layer.visibilityPriority
    );
  } else {
    root.style.removeProperty("visibility");
  }
  delete root.dataset.editorDialogVisuallySuppressed;
}

function restoreDialogVisualLayer(token: EditorDialogToken) {
  const root = dialogRoots.get(token);
  const layer = dialogVisualLayers.get(token);
  if (!root || !layer) return;
  if (layer.inlineValue) {
    root.style.setProperty(
      "z-index",
      layer.inlineValue,
      layer.inlinePriority
    );
  } else {
    root.style.removeProperty("z-index");
  }
  restoreDialogVisibility(root, layer);
  delete root.dataset.editorDialogStackIndex;
}

function isVisibleModal(element: HTMLElement) {
  if (
    !element.isConnected ||
    element.closest('[hidden], [inert], [aria-hidden="true"]')
  ) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getExternalEditorModal() {
  const ownedRoots = new Set(dialogRoots.values());
  const modals = document.querySelectorAll<HTMLElement>(MODAL_SELECTOR);
  for (let index = modals.length - 1; index >= 0; index -= 1) {
    const modal = modals[index];
    if (!ownedRoots.has(modal) && isVisibleModal(modal)) return modal;
  }
}

export function hasExternalEditorModal() {
  return Boolean(getExternalEditorModal());
}

export function hasActiveEditorModal() {
  return dialogStack.length > 0 || hasExternalEditorModal();
}

export function isEditorDialogBackgroundManaged() {
  return dialogStack.some((token) => dialogBackgroundOwners.has(token));
}

export function isTopmostEditorDialog(token: EditorDialogToken) {
  return dialogStack.at(-1) === token && !hasExternalEditorModal();
}

export function isElementInTopmostEditorDialog(element: HTMLElement) {
  const token = dialogStack.at(-1);
  const root = token ? dialogRoots.get(token) : undefined;
  return !root || root.contains(element);
}

function restoreManagedBackground() {
  for (const [element, previous] of managedBackground) {
    element.inert = previous.inert;
    if (previous.ariaHidden === null) element.removeAttribute("aria-hidden");
    else element.setAttribute("aria-hidden", previous.ariaHidden);
  }
  managedBackground.clear();
}

function makeBackgroundInert(dialog: HTMLElement) {
  let foreground: HTMLElement = dialog;
  let parent = foreground.parentElement;
  while (parent && parent !== document.documentElement) {
    for (const sibling of parent.children) {
      if (!(sibling instanceof HTMLElement) || sibling === foreground) continue;
      managedBackground.set(sibling, {
        inert: sibling.inert,
        ariaHidden: sibling.getAttribute("aria-hidden"),
      });
      sibling.inert = true;
      sibling.setAttribute("aria-hidden", "true");
    }
    foreground = parent;
    parent = parent.parentElement;
  }
}

function refreshBackgroundInertness() {
  restoreManagedBackground();
  if (!isEditorDialogBackgroundManaged()) return;
  const externalRoot = getExternalEditorModal();
  const token = dialogStack.at(-1);
  const root = token ? dialogRoots.get(token) : undefined;
  const foreground = externalRoot ?? root;
  if (foreground?.isConnected) makeBackgroundInert(foreground);
}

export function notifyTopmostEditorDialog() {
  refreshBackgroundInertness();
  const token = dialogStack.at(-1);
  if (token) dialogOwnershipGuards.get(token)?.();
}

export function registerEditorDialogRoot(
  dialog: HTMLElement,
  manageBackground: boolean,
  hideWhenSuperseded = false
) {
  const token = Symbol("editor-dialog");
  dialogStack.push(token);
  dialogRoots.set(token, dialog);
  const computedZIndex = Number.parseInt(
    window.getComputedStyle(dialog).zIndex,
    10
  );
  dialogVisualLayers.set(token, {
    baseZIndex: Number.isFinite(computedZIndex) ? computedZIndex : 50,
    inlineValue: dialog.style.getPropertyValue("z-index"),
    inlinePriority: dialog.style.getPropertyPriority("z-index"),
    hideWhenSuperseded,
    visibilityValue: dialog.style.getPropertyValue("visibility"),
    visibilityPriority: dialog.style.getPropertyPriority("visibility"),
  });
  if (manageBackground) dialogBackgroundOwners.add(token);
  refreshDialogVisualStack();
  refreshBackgroundInertness();
  return token;
}

export function unregisterEditorDialogRoot(token: EditorDialogToken) {
  const index = dialogStack.lastIndexOf(token);
  if (index >= 0) dialogStack.splice(index, 1);
  restoreDialogVisualLayer(token);
  dialogRoots.delete(token);
  dialogVisualLayers.delete(token);
  dialogBackgroundOwners.delete(token);
  dialogOwnershipGuards.delete(token);
  refreshDialogVisualStack();
  notifyTopmostEditorDialog();
}

export function setEditorDialogOwnershipGuard(
  token: EditorDialogToken,
  guard: () => void
) {
  dialogOwnershipGuards.set(token, guard);
}

function mutationTouchesModal(records: MutationRecord[]) {
  return records.some((record) => {
    if (record.type === "attributes") return true;
    return [...record.addedNodes, ...record.removedNodes].some(
      (node) =>
        node instanceof Element &&
        (node.matches(MODAL_SELECTOR) || Boolean(node.querySelector(MODAL_SELECTOR)))
    );
  });
}

export function observeEditorDialogOwnership() {
  const observer = new MutationObserver((records) => {
    if (mutationTouchesModal(records)) notifyTopmostEditorDialog();
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["role", "aria-modal", "hidden"],
  });
  return () => observer.disconnect();
}
