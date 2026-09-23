"use client";

type EditorHistoryFeedbackProps = {
  canUndo: boolean;
  canRedo: boolean;
  undoName: string | null;
  redoName: string | null;
  feedback: string | null;
  onUndo: () => void;
  onRedo: () => void;
};

export default function EditorHistoryFeedback({
  canUndo,
  canRedo,
  undoName,
  redoName,
  feedback,
  onUndo,
  onRedo,
}: EditorHistoryFeedbackProps) {
  return (
    <>
      {(canUndo || canRedo) && (
        <div
          data-testid="placement-history-strip"
          className="fixed bottom-6 left-4 z-40 hidden w-[min(300px,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white/95 px-3 py-2 text-xs text-neutral-700 shadow-2xl backdrop-blur md:block"
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-neutral-200 px-2.5 py-1.5 font-semibold text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canUndo}
              onClick={onUndo}
              title={undoName ? `Undo ${undoName}` : "Undo"}
            >
              Undo
            </button>
            <button
              type="button"
              className="rounded-lg border border-neutral-200 px-2.5 py-1.5 font-semibold text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canRedo}
              onClick={onRedo}
              title={redoName ? `Redo ${redoName}` : "Redo"}
            >
              Redo
            </button>
            <span className="min-w-0 flex-1 truncate text-neutral-500">
              {undoName ? `Last edit: ${undoName}` : redoName ? `Redo available: ${redoName}` : "No recent edits"}
            </span>
          </div>
        </div>
      )}

      {feedback && (
        <div
          data-testid="history-feedback-toast"
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full border border-neutral-200 bg-white/95 px-4 py-2 text-sm font-semibold text-neutral-900 shadow-2xl backdrop-blur"
        >
          {feedback}
        </div>
      )}
    </>
  );
}
