"use client";

import {
  EditorDialog,
  EditorDialogActions,
  EditorDialogButton,
} from "@/components/editor/design-system/EditorDialog";
import type { AISuggestionAction } from "@/lib/ai/applySuggestion";
import type { AINotesResponse } from "@/lib/design-page-types";

export type AiNotesDialogProps = {
  open: boolean;
  data: AINotesResponse | null;
  canApplySuggestions: boolean;
  onApplySuggestion: (action: AISuggestionAction) => void;
  onClose: () => void;
};

export function AiNotesDialog({
  open,
  data,
  canApplySuggestions,
  onApplySuggestion,
  onClose,
}: AiNotesDialogProps) {
  if (!open) return null;

  return (
    <EditorDialog
      open
      title="AI Design Notes"
      description="Review the generated rationale and suggested design actions."
      onClose={onClose}
      closeLabel="Close AI design notes"
      panelClassName="max-w-2xl"
      footer={
        <EditorDialogActions>
          <EditorDialogButton data-editor-dialog-initial-focus="true" onClick={onClose}>
            Close
          </EditorDialogButton>
        </EditorDialogActions>
      }
    >
      {data?.cached ? (
        <div
          role="status"
          className="mb-4 inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200"
        >
          <span aria-hidden="true">✓</span>&nbsp;Instant result (cached)
        </div>
      ) : null}
        {data && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Summary</h3>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
                {data.summary?.map((point, index) => <li key={index}>{point}</li>)}
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Rationale</h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                {data.rationale}
              </p>
            </div>

            {data.suggestions && data.suggestions.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Suggestions</h3>
                <div className="mt-2 space-y-2">
                  {data.suggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                    >
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {suggestion.label}
                      </p>
                      {canApplySuggestions ? (
                        <button
                          type="button"
                          onClick={() => onApplySuggestion(suggestion.action)}
                          className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white outline-none hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        >
                          Apply
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="min-h-11 rounded-lg bg-gray-400 px-4 py-2 text-sm font-semibold text-white"
                          title="Upgrade to pro to apply suggestions"
                        >
                          Pro Only
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!canApplySuggestions && (
              <div role="note" className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-700 dark:bg-blue-900 dark:text-blue-200">
                Upgrade to Pro to apply AI suggestions to your design.
              </div>
            )}
          </div>
        )}

    </EditorDialog>
  );
}
