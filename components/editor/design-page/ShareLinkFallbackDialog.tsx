export type ShareLinkFallbackDialogProps = {
  url: string | null;
  dark: boolean;
  onClose: () => void;
  onCopy: (url: string) => void;
  onOpen: (url: string) => void;
};

export function ShareLinkFallbackDialog({
  url,
  dark,
  onClose,
  onCopy,
  onOpen,
}: ShareLinkFallbackDialogProps) {
  if (!url) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        data-testid="share-fallback-modal"
        className={
          dark
            ? "designer-panel w-full max-w-md rounded-xl p-6 shadow-2xl"
            : "w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
        }
      >
        <button
          onClick={onClose}
          className={
            dark
              ? "designer-text-secondary absolute right-4 top-4 text-2xl hover:text-white"
              : "absolute right-4 top-4 text-2xl text-gray-500 hover:text-gray-700"
          }
        >
          ✕
        </button>

        <h2
          className={
            dark
              ? "designer-text-primary mb-4 text-xl font-bold"
              : "mb-4 text-xl font-bold text-gray-900"
          }
        >
          Share Link
        </h2>

        <p
          className={
            dark
              ? "designer-text-secondary mb-4 text-sm"
              : "mb-4 text-sm text-gray-600"
          }
        >
          Copy this link to share your design:
        </p>

        <div className="mb-4 flex gap-2">
          <input
            type="text"
            readOnly
            data-testid="share-url-input"
            value={url}
            className={
              dark
                ? "designer-control flex-1 rounded-lg border px-3 py-2 text-sm text-neutral-200 font-mono"
                : "flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-gray-700"
            }
          />
          <button
            data-testid="share-copy-button"
            onClick={() => onCopy(url)}
            className={
              dark
                ? "rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
                : "rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
            }
          >
            Copy
          </button>
        </div>

        <div className="flex gap-2">
          <button
            data-testid="share-open-button"
            onClick={() => onOpen(url)}
            className={
              dark
                ? "flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                : "flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            }
          >
            Open Link
          </button>
          <button
            data-testid="share-done-button"
            onClick={onClose}
            className={
              dark
                ? "designer-control flex-1 rounded-lg border px-4 py-2 text-sm font-medium"
                : "flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            }
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
