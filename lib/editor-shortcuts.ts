import {
  isSingleKeyShortcutBlocked,
  type EditorShortcutEvent,
} from "@/lib/editor-shortcut-guard";

/**
 * The editor's keyboard shortcuts, as the Keyboard shortcuts sheet lists them (UX 4c, audit
 * ED12). Each row is what a key does and the keys that do it; the handlers are named beside each
 * group, and `scripts/test-canvas-view-toolbar.tsx` checks the list against them.
 *
 * A chord is the keys pressed together. `Mod` is ⌘ on a Mac and Ctrl elsewhere, `Arrows` is any
 * arrow key; a row with two chords takes either.
 */
export type ShortcutChord = readonly string[];

export type EditorShortcut = {
  action: string;
  chords: readonly ShortcutChord[];
};

export type EditorShortcutGroup = {
  id: string;
  title: string;
  /** When the group's keys work, if not always. */
  when?: string;
  proOnly?: boolean;
  shortcuts: readonly EditorShortcut[];
};

export const EDITOR_SHORTCUT_GROUPS: readonly EditorShortcutGroup[] = [
  {
    // hooks/useUndoRedoHotkeys.ts, lib/useDesignPageCommandPalette.ts, DesignControlsPanel's ⌘B,
    // lib/design-page-selection-keyboard-commands.ts (Escape).
    id: "general",
    title: "General",
    shortcuts: [
      { action: "Undo", chords: [["Mod", "Z"]] },
      { action: "Redo", chords: [["Mod", "Shift", "Z"], ["Mod", "Y"]] },
      { action: "Command palette", chords: [["Mod", "K"]] },
      { action: "Show or hide the side panel", chords: [["Mod", "B"]] },
      { action: "Deselect", chords: [["Esc"]] },
      { action: "Keyboard shortcuts", chords: [["?"]] },
    ],
  },
  {
    // lib/design-page-selection-keyboard-commands.ts, lib/useDesignPageSelectionKeyboard.ts.
    id: "product",
    title: "A selected product",
    shortcuts: [
      { action: "Nudge", chords: [["Arrows"]] },
      { action: "Nudge further", chords: [["Shift", "Arrows"]] },
      { action: "Turn 90°", chords: [["R"]] },
      { action: "Turn 90° the other way", chords: [["Shift", "R"]] },
      { action: "Turn a little", chords: [["Q"], ["E"]] },
      { action: "Straighten", chords: [["0"]] },
      { action: "Duplicate", chords: [["Mod", "D"]] },
      { action: "Remove", chords: [["Delete"], ["Backspace"]] },
    ],
  },
  {
    // The placement keys in lib/design-page-selection-keyboard-commands.ts.
    id: "placing",
    title: "Placing a product",
    shortcuts: [
      { action: "Place it", chords: [["Enter"]] },
      { action: "Turn 90°", chords: [["R"]] },
      { action: "Nudge", chords: [["Arrows"]] },
      { action: "Cancel", chords: [["Esc"]] },
    ],
  },
  {
    // lib/useDesignPageFloorPlanTracingKeyboard.ts.
    id: "plan",
    title: "Drawing the plan",
    when: "In Plan, in 2D",
    shortcuts: [
      { action: "Select", chords: [["V"]] },
      { action: "Rectangle room", chords: [["F"]] },
      { action: "Custom shape", chords: [["B"]] },
      { action: "Curved wall", chords: [["H"]] },
      { action: "Door", chords: [["D"]] },
      { action: "Window", chords: [["W"]] },
      { action: "Remove the last point", chords: [["Backspace"]] },
      { action: "Stop drawing", chords: [["Esc"]] },
    ],
  },
  {
    // The room keys in lib/design-page-selection-keyboard-commands.ts.
    id: "room",
    title: "A selected room",
    when: "In 2D",
    shortcuts: [
      { action: "Nudge", chords: [["Arrows"]] },
      { action: "Nudge further, without snapping", chords: [["Shift", "Arrows"]] },
      { action: "Duplicate", chords: [["Mod", "D"]] },
      { action: "Delete", chords: [["Delete"], ["Backspace"]] },
    ],
  },
  {
    // lib/design-page-presentation-hotkey.ts.
    id: "pro",
    title: "Pro",
    proOnly: true,
    shortcuts: [{ action: "Presentation mode", chords: [["P"]] }],
  },
];

/** The groups a user sees: Pro's only with Pro. */
export function visibleShortcutGroups(isDesigner: boolean): readonly EditorShortcutGroup[] {
  return EDITOR_SHORTCUT_GROUPS.filter((group) => isDesigner || !group.proOnly);
}

const MAC_KEY_LABELS: Record<string, string> = { Mod: "⌘", Shift: "⇧", Alt: "⌥" };
const OTHER_KEY_LABELS: Record<string, string> = { Mod: "Ctrl", Shift: "Shift", Alt: "Alt" };
const KEY_NAMES: Record<string, string> = {
  Mod: "Command",
  Shift: "Shift",
  Alt: "Option",
  Esc: "Escape",
  Arrows: "Arrow keys",
  "?": "Question mark",
};

/** How each key of a chord reads on this system: ⌘ ⇧ Z on a Mac, Ctrl Shift Z elsewhere. */
export function chordKeyLabels(chord: ShortcutChord, isMac: boolean): string[] {
  const labels = isMac ? MAC_KEY_LABELS : OTHER_KEY_LABELS;
  return chord.map((key) => (key === "Arrows" ? "← ↑ → ↓" : labels[key] ?? key));
}

/** A chord as a screen reader says it: "Command Shift Z", "Control Y", "Arrow keys". */
export function chordSpokenLabel(chord: ShortcutChord, isMac: boolean): string {
  return chord
    .map((key) => (key === "Mod" && !isMac ? "Control" : key === "Alt" && !isMac ? "Alt" : KEY_NAMES[key] ?? key))
    .join(" ");
}

/** ⌘ and ⌥ on a Mac, Ctrl and Alt elsewhere, as the undo shortcut decides. */
export function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");
}

/** Opening the sheet from anywhere: the corner button, the ? key, the command palette. */
export const OPEN_KEYBOARD_SHORTCUTS_EVENT = "editor-open-keyboard-shortcuts";

export function openKeyboardShortcuts(): void {
  window.dispatchEvent(new Event(OPEN_KEYBOARD_SHORTCUTS_EVENT));
}

/** "?" opens the sheet, unless a field, a menu or a dialog has the key. */
export function isKeyboardShortcutsKey(event: EditorShortcutEvent): boolean {
  return event.key === "?" && !isSingleKeyShortcutBlocked(event);
}
