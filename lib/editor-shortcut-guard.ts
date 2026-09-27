/**
 * When the editor's keyboard shortcuts may act (UX audit ED12).
 *
 * Typing wins: a key pressed in a text field, a select, a slider, an editable area or a text box
 * belongs to that control, and so does a key that is part of an input method's composition.
 * Single-key shortcuts (R, Delete, the arrows, the drawing keys, P) also leave ⌘, Ctrl and Alt
 * combinations to the browser. Editing shortcuts (undo, redo) don't act behind an open dialog.
 */

export type EditorShortcutEvent = Pick<
  KeyboardEvent,
  "key" | "altKey" | "ctrlKey" | "metaKey" | "isComposing" | "target"
> & { keyCode?: number };

type ShortcutTargetElement = {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => unknown;
};

type ShortcutRoot = Pick<Document, "querySelector">;

const KEYBOARD_INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const KEYBOARD_INPUT_ROLES = new Set([
  // Typing and values.
  "combobox",
  "searchbox",
  "slider",
  "spinbutton",
  "textbox",
  // Widgets moved through with the arrow keys.
  "gridcell",
  "listbox",
  "menu",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "tab",
  "treeitem",
]);
const CAPTURED_KEYBOARD_CONTEXT_SELECTOR =
  '[aria-modal="true"], [data-testid="editor-command-palette"]';

const documentRoot = (): ShortcutRoot | null =>
  typeof document === "undefined" ? null : document;

/**
 * The focused control uses keys itself: a field, a select, a slider, an editable area, or a menu,
 * list, radio group or tab list that the arrow keys move through.
 */
export function isKeyboardInputTarget(target: EventTarget | null): boolean {
  const element = target as ShortcutTargetElement | null;
  if (!element) return false;
  if (element.tagName && KEYBOARD_INPUT_TAGS.has(element.tagName)) return true;
  if (element.isContentEditable) return true;
  const role = element.getAttribute?.("role");
  return Boolean(role && KEYBOARD_INPUT_ROLES.has(role));
}

/** An open modal dialog, or the command palette, owns the keyboard. */
export function isKeyboardCapturedByDialog(
  target: EventTarget | null,
  root: ShortcutRoot | null = documentRoot()
): boolean {
  const element = target as ShortcutTargetElement | null;
  if (element?.closest?.(CAPTURED_KEYBOARD_CONTEXT_SELECTOR)) return true;
  return Boolean(root?.querySelector(CAPTURED_KEYBOARD_CONTEXT_SELECTOR));
}

/** The focused control or an open dialog owns this key. */
export function isEditorShortcutTargetBlocked(
  target: EventTarget | null,
  root: ShortcutRoot | null = documentRoot()
): boolean {
  return isKeyboardInputTarget(target) || isKeyboardCapturedByDialog(target, root);
}

/** ⌘, Ctrl or Alt: the combination belongs to the browser or to a ⌘ shortcut. */
export function hasCommandModifier(event: {
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}): boolean {
  return Boolean(event.metaKey || event.ctrlKey || event.altKey);
}

/** Part of an input method's composition (keyCode 229 in browsers without `isComposing`). */
export function isComposingKey(
  event: Pick<KeyboardEvent, "isComposing"> & { keyCode?: number }
): boolean {
  return Boolean(event.isComposing) || event.keyCode === 229;
}

/** Undo and redo: a field's own undo wins, and nothing changes behind a dialog. */
export function isEditingShortcutBlocked(
  event: EditorShortcutEvent,
  root: ShortcutRoot | null = documentRoot()
): boolean {
  return isComposingKey(event) || isEditorShortcutTargetBlocked(event.target, root);
}

/**
 * A single-key shortcut: never with ⌘, Ctrl or Alt, never while typing, and not behind a dialog
 * unless the shortcut is meant to work there too (`inDialogs`).
 */
export function isSingleKeyShortcutBlocked(
  event: EditorShortcutEvent,
  { inDialogs = false, root = documentRoot() }: { inDialogs?: boolean; root?: ShortcutRoot | null } = {}
): boolean {
  if (hasCommandModifier(event) || isComposingKey(event)) return true;
  if (isKeyboardInputTarget(event.target)) return true;
  return !inDialogs && isKeyboardCapturedByDialog(event.target, root);
}
