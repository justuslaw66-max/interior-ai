"use client";

import { useRef } from "react";

import { EditorDialog } from "@/components/editor/design-system/EditorDialog";

export interface EditorCommandPaletteAction {
  id: string;
  label: string;
  hint: string;
  enabled: boolean;
  run: () => void;
}

export interface EditorCommandPaletteProps {
  open: boolean;
  query: string;
  actions: readonly EditorCommandPaletteAction[];
  designerTheme: boolean;
  returnFocusIds: readonly string[];
  focusRestorationEnabledRef: { current: boolean };
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onRunAction: (action: EditorCommandPaletteAction) => void;
}

export function EditorCommandPalette({
  open,
  query,
  actions,
  designerTheme,
  returnFocusIds,
  focusRestorationEnabledRef,
  onClose,
  onQueryChange,
  onRunAction,
}: EditorCommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <EditorDialog
      open={open}
      title="Command palette"
      onClose={onClose}
      showCloseButton={false}
      testId="editor-command-palette"
      initialFocusRef={inputRef}
      returnFocusIds={returnFocusIds}
      focusRestorationEnabledRef={focusRestorationEnabledRef}
      hideWhenSuperseded manageBackground
      cancelFocusRestorationOnUnmount
      dark={designerTheme}
      overlayClassName="z-[95] items-start !bg-black/30 px-4 pb-4 pt-20 backdrop-blur-sm"
      panelClassName={
        designerTheme
          ? "designer-dock !max-w-[560px] overflow-hidden !rounded-xl !border-0 !p-0 text-neutral-100"
          : "!max-w-[560px] overflow-hidden !rounded-xl border-neutral-200 bg-white !p-0 text-neutral-950"
      }
      headerClassName="sr-only"
      contentClassName="!mt-0"
    >
      <input
        ref={inputRef}
        data-testid="editor-command-palette-input"
        data-editor-dialog-initial-focus="true"
        aria-label="Search commands"
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          const action = actions.find((entry) => entry.enabled);
          if (!action) return;
          event.preventDefault();
          onRunAction(action);
        }}
        placeholder="Search commands"
        className={
          designerTheme
            ? "h-12 w-full border-b border-white/10 bg-transparent px-4 text-sm font-semibold outline-none placeholder:text-neutral-500 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400"
            : "h-12 w-full border-b border-neutral-200 bg-transparent px-4 text-sm font-semibold outline-none placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
        }
      />
      <div className="max-h-[min(460px,60vh)] overflow-y-auto p-2">
        {actions.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-neutral-500">
            No commands found
          </div>
        ) : (
          actions.map((action) => (
            <button
              key={action.id}
              type="button"
              data-testid={`editor-command-palette-action-${action.id}`}
              disabled={!action.enabled}
              className={
                designerTheme
                  ? "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
                  : "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              }
              onClick={() => onRunAction(action)}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{action.label}</span>
                <span className="block truncate text-xs text-neutral-500">
                  {action.hint}
                </span>
              </span>
              {!action.enabled ? (
                <span
                  className={
                    designerTheme
                      ? "shrink-0 text-[11px] font-semibold text-neutral-600"
                      : "shrink-0 text-[11px] font-semibold text-neutral-400"
                  }
                >
                  Unavailable
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </EditorDialog>
  );
}
