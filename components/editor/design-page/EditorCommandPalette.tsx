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
  onClose: () => void;
  onQueryChange: (query: string) => void;
}

export function EditorCommandPalette({
  open,
  query,
  actions,
  designerTheme,
  onClose,
  onQueryChange,
}: EditorCommandPaletteProps) {
  if (!open) return null;

  const runAction = (action: EditorCommandPaletteAction) => {
    action.run();
    onClose();
    onQueryChange("");
  };

  return (
    <div
      data-testid="editor-command-palette"
      className="fixed inset-0 z-[95] bg-black/30 px-4 pt-20 backdrop-blur-sm"
      role="dialog"
      aria-label="Command palette"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={
          designerTheme
            ? "designer-dock mx-auto w-[min(560px,100%)] overflow-hidden rounded-xl text-neutral-100"
            : "mx-auto w-[min(560px,100%)] overflow-hidden rounded-xl border border-neutral-200 bg-white text-neutral-950 shadow-2xl"
        }
      >
        <input
          data-testid="editor-command-palette-input"
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
              return;
            }
            if (event.key === "Enter") {
              const action = actions.find((entry) => entry.enabled);
              if (!action) return;
              event.preventDefault();
              runAction(action);
            }
          }}
          placeholder="Search commands"
          className={
            designerTheme
              ? "h-12 w-full border-b border-white/10 bg-transparent px-4 text-sm font-semibold outline-none placeholder:text-neutral-500"
              : "h-12 w-full border-b border-neutral-200 bg-transparent px-4 text-sm font-semibold outline-none placeholder:text-neutral-400"
          }
        />
        <div className="max-h-[min(460px,60vh)] overflow-y-auto p-2">
          {actions.length === 0 ? (
            <div
              className={
                designerTheme
                  ? "px-3 py-8 text-center text-sm text-neutral-500"
                  : "px-3 py-8 text-center text-sm text-neutral-500"
              }
            >
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
                    ? "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    : "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
                }
                onClick={() => runAction(action)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{action.label}</span>
                  <span
                    className={
                      designerTheme
                        ? "block truncate text-xs text-neutral-500"
                        : "block truncate text-xs text-neutral-500"
                    }
                  >
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
      </div>
    </div>
  );
}
