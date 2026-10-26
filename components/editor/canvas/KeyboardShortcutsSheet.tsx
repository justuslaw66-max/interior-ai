"use client";

import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";
import { EditorDialog } from "@/components/editor/design-system/EditorDialog";
import { Button } from "@/components/ui/Button";
import {
  OPEN_KEYBOARD_SHORTCUTS_EVENT,
  chordKeyLabels,
  chordSpokenLabel,
  isKeyboardShortcutsKey,
  isMacPlatform,
  openKeyboardShortcuts,
  visibleShortcutGroups,
  type ShortcutChord,
} from "@/lib/editor-shortcuts";

type KeyboardShortcutsSheetProps = {
  /** Client Preview shows nothing editable, so it has no shortcuts to list. */
  enabled: boolean;
  isDesigner: boolean;
};

function Chord({ chord, isMac }: { chord: ShortcutChord; isMac: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="sr-only">{chordSpokenLabel(chord, isMac)}</span>
      {chordKeyLabels(chord, isMac).map((label, index) => (
        <kbd
          key={`${label}-${index}`}
          aria-hidden="true"
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-control-secondary-border bg-tile px-1.5 font-sans text-xs font-semibold text-label"
        >
          {label}
        </kbd>
      ))}
    </span>
  );
}

/** The shortcuts, grouped: what each key does, and the keys, as this system names them. */
export function KeyboardShortcutsList({ isDesigner, isMac }: { isDesigner: boolean; isMac: boolean }) {
  return (
    <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {visibleShortcutGroups(isDesigner).map((group) => (
        <section key={group.id} aria-labelledby={`keyboard-shortcuts-${group.id}`} data-testid={`keyboard-shortcuts-${group.id}`}>
          <h3 id={`keyboard-shortcuts-${group.id}`} className="text-sm font-bold">
            {group.title}
            {group.when ? <span className="ml-2 font-normal text-label-secondary">{group.when}</span> : null}
          </h3>
          <dl className="mt-2 divide-y divide-separator-subtle">
            {group.shortcuts.map((shortcut) => (
              <div key={shortcut.action} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <dt>{shortcut.action}</dt>
                <dd className="flex shrink-0 items-center gap-1.5">
                  {shortcut.chords.map((chord, index) => (
                    <span key={chord.join("+")} className="inline-flex items-center gap-1.5">
                      {index > 0 ? <span className="text-xs text-label-secondary">or</span> : null}
                      <Chord chord={chord} isMac={isMac} />
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/**
 * The Keyboard shortcuts sheet (UX 4c, audit ED12's list): every shortcut from
 * `lib/editor-shortcuts.ts`, grouped. It opens from the canvas corner button, the ? key and the
 * command palette, all through one window event, and hands focus back to where it came from.
 */
export function KeyboardShortcutsSheet({ enabled, isDesigner }: KeyboardShortcutsSheetProps) {
  const [open, setOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const show = () => {
      setIsMac(isMacPlatform());
      setOpen(true);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isKeyboardShortcutsKey(event)) return;
      event.preventDefault();
      show();
    };
    window.addEventListener(OPEN_KEYBOARD_SHORTCUTS_EVENT, show);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener(OPEN_KEYBOARD_SHORTCUTS_EVENT, show);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled]);

  return (
    <EditorDialog
      open={enabled && open}
      title="Keyboard shortcuts"
      description="Shortcuts don't act while you type in a field."
      onClose={() => setOpen(false)}
      testId="keyboard-shortcuts-dialog"
      closeButtonTestId="keyboard-shortcuts-close"
      panelClassName="max-w-2xl"
      contentClassName="max-h-[calc(100dvh-10rem)] overflow-y-auto"
    >
      <KeyboardShortcutsList isDesigner={isDesigner} isMac={isMac} />
    </EditorDialog>
  );
}

/** The canvas corner's "Keyboard shortcuts" button (from lg, under any open panel). */
export function KeyboardShortcutsButton() {
  return (
    <Button
      variant="secondary"
      size="round"
      data-testid="canvas-keyboard-shortcuts"
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts (?)"
      onClick={openKeyboardShortcuts}
      className="absolute bottom-4 right-4 z-30 max-lg:hidden shadow-sm"
    >
      <Keyboard className="h-5 w-5" aria-hidden="true" />
    </Button>
  );
}
