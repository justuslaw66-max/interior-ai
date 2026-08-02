import ConfirmDialog from "@/components/ConfirmDialog";

export type SavedDesignSummary = {
  id: string;
  title: string;
  createdAt: string;
};

export type PendingSavedDesignDelete = {
  ids: string[];
  title?: string;
  mode: "single" | "selected" | "all";
};

export type MyDesignsDialogProps = {
  open: boolean;
  designerTheme: boolean;
  designs: SavedDesignSummary[];
  loading: boolean;
  allDesignIds: string[];
  selectedDesignIds: ReadonlySet<string>;
  selectedDesignCount: number;
  allDesignsSelected: boolean;
  deletingDesignIds: ReadonlySet<string>;
  pendingDeleteDesign: PendingSavedDesignDelete | null;
  onClose: () => void;
  onOpenTemplates: () => void;
  onToggleAll: () => void;
  onToggleSelection: (id: string) => void;
  onLoadDesign: (id: string) => void | Promise<void>;
  onRequestDelete: (
    ids: string[],
    mode: PendingSavedDesignDelete["mode"],
    title?: string
  ) => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void | Promise<void>;
};

export function MyDesignsDialog({
  open,
  designerTheme,
  designs,
  loading,
  allDesignIds,
  selectedDesignIds,
  selectedDesignCount,
  allDesignsSelected,
  deletingDesignIds,
  pendingDeleteDesign,
  onClose,
  onOpenTemplates,
  onToggleAll,
  onToggleSelection,
  onLoadDesign,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: MyDesignsDialogProps) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={onClose}
        >
          <div
            data-testid="load-designs-modal"
            className={
              designerTheme
                ? "designer-panel w-full max-w-2xl max-h-[80vh] rounded-xl p-6 shadow-2xl overflow-y-auto"
                : "w-full max-w-2xl max-h-[80vh] rounded-xl bg-white p-6 shadow-2xl overflow-y-auto"
            }
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2
                className={
                  designerTheme
                    ? "designer-text-primary text-xl font-bold"
                    : "text-xl font-bold"
                }
              >
                My Designs
              </h2>
              <button
                onClick={onClose}
                className={
                  designerTheme
                    ? "designer-text-secondary text-2xl hover:text-white"
                    : "text-2xl text-gray-500 hover:text-gray-700"
                }
              >
                ✕
              </button>
            </div>

            <div
              data-testid="load-designs-template-shortcut"
              className={
                designerTheme
                  ? "mb-4 grid gap-3 rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  : "mb-4 grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              }
            >
              <div>
                <div
                  className={
                    designerTheme
                      ? "text-sm font-semibold text-emerald-100"
                      : "text-sm font-semibold text-emerald-900"
                  }
                >
                  Want a fresh floor plan?
                </div>
                <p
                  className={
                    designerTheme
                      ? "mt-1 text-xs leading-5 text-emerald-50/80"
                      : "mt-1 text-xs leading-5 text-emerald-800"
                  }
                >
                  Saved designs are listed here. Templates open in Plan, with empty and furnished
                  starter options.
                </p>
              </div>
              <button
                type="button"
                data-testid="load-designs-open-templates"
                onClick={onOpenTemplates}
                className={
                  designerTheme
                    ? "min-h-10 rounded-lg bg-emerald-300 px-3 text-sm font-semibold text-emerald-950 hover:bg-emerald-200"
                    : "min-h-10 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700"
                }
              >
                Start from template
              </button>
            </div>

            {designs.length > 0 && !loading && (
              <div
                data-testid="load-designs-bulk-toolbar"
                className={
                  designerTheme
                    ? "designer-recessed mb-4 flex flex-wrap items-center gap-2 rounded-lg p-3"
                    : "mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3"
                }
              >
                <label
                  className={
                    designerTheme
                      ? "flex min-h-10 items-center gap-2 rounded-md px-2 text-sm font-semibold text-neutral-200"
                      : "flex min-h-10 items-center gap-2 rounded-md px-2 text-sm font-semibold text-gray-800"
                  }
                >
                  <input
                    type="checkbox"
                    data-testid="select-all-saved-designs"
                    checked={allDesignsSelected}
                    onChange={onToggleAll}
                    className="h-4 w-4 accent-red-600"
                  />
                  Select all
                </label>
                <span
                  data-testid="selected-saved-design-count"
                  className={
                    designerTheme
                      ? "mr-auto text-xs font-semibold text-neutral-400"
                      : "mr-auto text-xs font-semibold text-gray-500"
                  }
                >
                  {selectedDesignCount} selected
                </span>
                <button
                  type="button"
                  data-testid="delete-selected-saved-designs"
                  disabled={selectedDesignCount === 0 || deletingDesignIds.size > 0}
                  onClick={() =>
                    onRequestDelete(Array.from(selectedDesignIds), "selected")
                  }
                  className={
                    designerTheme
                      ? "min-h-10 rounded-md border border-red-500/50 px-3 text-sm font-semibold text-red-200 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                      : "min-h-10 rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  }
                >
                  Delete selected
                </button>
                <button
                  type="button"
                  data-testid="delete-all-saved-designs"
                  disabled={designs.length === 0 || deletingDesignIds.size > 0}
                  onClick={() => onRequestDelete(allDesignIds, "all")}
                  className={
                    designerTheme
                      ? "min-h-10 rounded-md bg-red-500 px-3 text-sm font-semibold text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                      : "min-h-10 rounded-md bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  }
                >
                  Delete all
                </button>
              </div>
            )}

            {loading ? (
              <div
                className={
                  designerTheme ? "text-center text-neutral-400" : "text-center text-gray-500"
                }
              >
                Loading your designs...
              </div>
            ) : designs.length === 0 ? (
              <div
                className={
                  designerTheme ? "text-center text-neutral-400" : "text-center text-gray-500"
                }
              >
                <p className="mb-2">No saved designs yet</p>
                <p className="text-sm">Click &quot;Save&quot; to save your current design</p>
              </div>
            ) : (
              <div className="space-y-2">
                {designs.map((design) => (
                  <div
                    key={design.id}
                    className={
                      designerTheme
                        ? "designer-raised flex items-center gap-3 rounded-lg p-3"
                        : "flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
                    }
                  >
                    <label
                      className={
                        designerTheme
                          ? "designer-control flex h-10 w-10 shrink-0 items-center justify-center rounded-md border"
                          : "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white"
                      }
                      aria-label={`Select ${design.title}`}
                    >
                      <input
                        type="checkbox"
                        data-testid={`select-saved-design-${design.id}`}
                        checked={selectedDesignIds.has(design.id)}
                        onChange={() => onToggleSelection(design.id)}
                        className="h-4 w-4 accent-red-600"
                      />
                    </label>
                    <button
                      type="button"
                      data-testid={`load-design-${design.id}`}
                      onClick={() => onLoadDesign(design.id)}
                      className={
                        designerTheme
                          ? "min-w-0 flex-1 rounded-md p-1 text-left transition-colors hover:bg-[#1b2838]"
                          : "min-w-0 flex-1 rounded-md p-1 text-left transition-colors hover:bg-gray-100"
                      }
                    >
                      <div
                        className={
                          designerTheme
                            ? "truncate font-medium text-neutral-200"
                            : "truncate font-medium text-gray-900"
                        }
                      >
                        {design.title}
                      </div>
                      <div
                        className={
                          designerTheme ? "text-xs text-neutral-500" : "text-xs text-gray-500"
                        }
                      >
                        {new Date(design.createdAt).toLocaleDateString()}{" "}
                        {new Date(design.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </button>
                    <button
                      type="button"
                      data-testid={`delete-saved-design-${design.id}`}
                      disabled={deletingDesignIds.has(design.id)}
                      onClick={() =>
                        onRequestDelete([design.id], "single", design.title)
                      }
                      className={
                        designerTheme
                          ? "shrink-0 rounded-md border border-red-500/50 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                          : "shrink-0 rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      }
                    >
                      {deletingDesignIds.has(design.id) ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteDesign)}
        title={
          pendingDeleteDesign?.mode === "all"
            ? "Delete all saved designs?"
            : pendingDeleteDesign?.mode === "selected"
              ? `Delete ${pendingDeleteDesign.ids.length} selected designs?`
              : "Delete saved design?"
        }
        description={
          pendingDeleteDesign
            ? pendingDeleteDesign.mode === "single"
              ? `"${pendingDeleteDesign.title ?? "This design"}" will be permanently removed from My Designs.`
              : `${pendingDeleteDesign.ids.length} design${pendingDeleteDesign.ids.length === 1 ? "" : "s"} will be permanently removed from My Designs.`
            : "This design will be permanently removed from My Designs."
        }
        confirmLabel="Delete"
        busy={deletingDesignIds.size > 0}
        destructive
        onCancel={onCancelDelete}
        onConfirm={onConfirmDelete}
      />
    </>
  );
}
