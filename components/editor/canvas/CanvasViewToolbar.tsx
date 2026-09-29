"use client";

import { Maximize, Redo2, Undo2 } from "lucide-react";
import EditorViewToggle, { type EditorViewMode } from "@/components/editor/EditorViewToggle";
import { Button } from "@/components/ui/Button";

export type CanvasViewToolbarProps = {
  dark: boolean;
  /** The step panel's reach into the canvas: the toolbar centres itself on the rest. */
  leftInsetPx: number;
  viewMode: EditorViewMode;
  onViewModeChange: (next: EditorViewMode) => void;
  /** Fit waits for a room to frame, and doesn't act in the Present step. */
  canFit: boolean;
  onFit?: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoName: string | null;
  redoName: string | null;
  onUndo: () => void;
  onRedo: () => void;
};

/**
 * The toolbar's centre: the middle of the canvas right of the step panel, as in the mockup, but
 * never so far right that a right panel (the item panel, 340px at right-4) would cover Undo and
 * Redo, and never over the step panel. Half the toolbar is about 120px.
 */
export function canvasToolbarLeft(leftInsetPx: number): string {
  return `clamp(${leftInsetPx + 136}px, calc(50% + ${leftInsetPx / 2}px), calc(100% - 484px))`;
}

const TOOLBAR_CLASS =
  "absolute top-bar-4 z-40 flex -translate-x-1/2 items-center gap-1 rounded-xl border p-1 shadow-[0_4px_14px_rgba(23,23,23,0.08)]";

/**
 * The canvas toolbar (UX 4c, from the approved Plan mockup): View 2D | 3D, Fit to screen, Undo
 * and Redo, over the top of the canvas from md. Phones keep them in the bar until 4d. The
 * controls keep their test ids, so the specs that press them find them here.
 */
export function CanvasViewToolbar(props: CanvasViewToolbarProps) {
  const { dark, undoName, redoName } = props;
  const buttonClass = dark ? "designer-control" : "";
  return (
    <div
      role="group"
      aria-label="Canvas controls"
      data-testid="canvas-view-toolbar"
      className={`${TOOLBAR_CLASS} ${dark ? "designer-work-surface" : "border-neutral-200 bg-white text-neutral-900"}`}
      style={{ left: canvasToolbarLeft(props.leftInsetPx) }}
    >
      <EditorViewToggle value={props.viewMode} onChange={props.onViewModeChange} dark={dark} variant="canvas" />
      <div aria-hidden="true" className="mx-1 h-6 w-px bg-neutral-200" />
      <Button
        variant="quiet"
        size="icon"
        data-testid="canvas-fit-view"
        aria-label="Fit to screen"
        title="Fit to screen"
        className={buttonClass}
        disabled={!props.canFit || !props.onFit}
        onClick={props.onFit}
      >
        <Maximize className="h-[18px] w-[18px]" aria-hidden="true" />
      </Button>
      <Button
        variant="quiet"
        size="icon"
        data-testid="command-undo"
        aria-label={undoName ? `Undo ${undoName}` : "Undo"}
        title={undoName ? `Undo "${undoName}" (Cmd/Ctrl+Z)` : "Undo (Cmd/Ctrl+Z)"}
        className={buttonClass}
        disabled={!props.canUndo}
        onClick={props.onUndo}
      >
        <Undo2 className="h-[18px] w-[18px]" aria-hidden="true" />
      </Button>
      <Button
        variant="quiet"
        size="icon"
        data-testid="command-redo"
        aria-label={redoName ? `Redo ${redoName}` : "Redo"}
        title={redoName ? `Redo "${redoName}" (Cmd/Ctrl+Shift+Z)` : "Redo (Cmd/Ctrl+Shift+Z)"}
        className={buttonClass}
        disabled={!props.canRedo}
        onClick={props.onRedo}
      >
        <Redo2 className="h-[18px] w-[18px]" aria-hidden="true" />
      </Button>
    </div>
  );
}
