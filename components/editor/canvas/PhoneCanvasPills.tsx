"use client";

import { Redo2, Undo2 } from "lucide-react";
import EditorViewToggle, { type EditorViewMode } from "@/components/editor/EditorViewToggle";
import { CanvasSavedViews, type CanvasSavedViewsActions, type CanvasSavedViewsState } from "@/components/editor/canvas/CanvasSavedViews";

export type PhoneCanvasPillsProps = {
  dark: boolean;
  viewMode: EditorViewMode;
  onViewModeChange: (next: EditorViewMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  undoName: string | null;
  redoName: string | null;
  onUndo: () => void;
  onRedo: () => void;
  /** Saved views, from Views beside 2D | 3D in 3D (UX 4e, SX4). */
  savedViews: CanvasSavedViewsState & CanvasSavedViewsActions;
};

const PILL_CLASS =
  "absolute top-bar-3 z-40 flex gap-0.5 rounded-xl border p-[3px] shadow-[0_4px_14px_rgba(23,23,23,0.08)]";

/**
 * On phones (UX 4d, the approved PhonePlan mockup), 2D | 3D sits over the canvas's top left and
 * Undo and Redo over its top right, each in a pill 12px under the bar, with 44px targets. They
 * keep the controls' test ids, so the specs that press them find them here.
 */
export function PhoneCanvasPills(props: PhoneCanvasPillsProps) {
  const { dark, undoName, redoName } = props;
  const pillClass = `${PILL_CLASS} ${dark ? "designer-work-surface" : "border-neutral-200 bg-white text-neutral-900"}`;
  const historyClass = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[9px] disabled:cursor-not-allowed disabled:opacity-40 ${
    dark ? "designer-work-control" : "text-neutral-800 hover:bg-neutral-100"
  }`;
  return (
    <>
      <div data-testid="canvas-view-pill" className={`${pillClass} left-3`}>
        <EditorViewToggle value={props.viewMode} onChange={props.onViewModeChange} dark={dark} variant="pill" />
        {props.viewMode === "3d" ? <CanvasSavedViews {...props.savedViews} dark={dark} size="pill" /> : null}
      </div>
      <div role="group" aria-label="History" data-testid="canvas-history-pill" className={`${pillClass} right-3`}>
        <button
          type="button"
          data-testid="command-undo"
          aria-label={undoName ? `Undo ${undoName}` : "Undo"}
          title={undoName ? `Undo "${undoName}" (Cmd/Ctrl+Z)` : "Undo (Cmd/Ctrl+Z)"}
          className={historyClass}
          disabled={!props.canUndo}
          onClick={props.onUndo}
        >
          <Undo2 className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid="command-redo"
          aria-label={redoName ? `Redo ${redoName}` : "Redo"}
          title={redoName ? `Redo "${redoName}" (Cmd/Ctrl+Shift+Z)` : "Redo (Cmd/Ctrl+Shift+Z)"}
          className={historyClass}
          disabled={!props.canRedo}
          onClick={props.onRedo}
        >
          <Redo2 className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
