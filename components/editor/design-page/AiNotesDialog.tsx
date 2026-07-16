import type { AISuggestionAction } from "@/lib/ai/applySuggestion";
import type { AINotesResponse } from "@/lib/design-page-types";

export function AiNotesDialog({
  open,
  data,
  canApplySuggestions,
  onApplySuggestion,
  onClose,
}: {
  open: boolean;
  data: AINotesResponse | null;
  canApplySuggestions: boolean;
  onApplySuggestion: (action: AISuggestionAction) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-lg dark:bg-[#1e2839]">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold">AI Design Notes</h2>
            {data?.cached && (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                ✓ Instant (cached)
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label="Close AI design notes"
            onClick={onClose}
            className="text-2xl font-bold text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

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
                          className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                        >
                          Apply
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="rounded bg-gray-400 px-3 py-1 text-sm text-white"
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
              <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                Upgrade to Pro to apply AI suggestions to your design.
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
