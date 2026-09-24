"use client";

import EditorViewToggle, { type EditorViewMode } from "@/components/editor/EditorViewToggle";
import { PanelLeft, Redo2, Undo2 } from "lucide-react";

type CommandBarCanvasControlsProps = {
  dark: boolean;
  isClientPreview: boolean;
  sidebarToggleVisible: boolean;
  designSidebarCollapsed: boolean;
  onToggleDesignSidebar: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoName: string | null;
  redoName: string | null;
  onUndo: () => void;
  onRedo: () => void;
  viewMode: EditorViewMode;
  onViewModeChange: (next: EditorViewMode) => void;
};

/** The sidebar toggle, undo, redo and the 2D/3D switch at the start of the editor command bar. */
export function CommandBarCanvasControls(props: CommandBarCanvasControlsProps) {
  return (
    <>
      {props.sidebarToggleVisible ? (
        <DesignSidebarToggle
          dark={props.dark}
          designSidebarCollapsed={props.designSidebarCollapsed}
          onToggleDesignSidebar={props.onToggleDesignSidebar}
        />
      ) : null}
      <HistoryButtons {...props} />

      <div className="shrink-0">
        <EditorViewToggle value={props.viewMode} onChange={props.onViewModeChange} dark={props.dark} />
      </div>
    </>
  );
}

function DesignSidebarToggle({
  dark,
  designSidebarCollapsed,
  onToggleDesignSidebar,
}: Pick<CommandBarCanvasControlsProps, "dark" | "designSidebarCollapsed" | "onToggleDesignSidebar">) {
  return (
    <button
      type="button"
      data-testid="editor-design-sidebar-toggle"
      data-state={designSidebarCollapsed ? "collapsed" : "expanded"}
      aria-label={
        designSidebarCollapsed
          ? "Open design sidebar"
          : "Collapse design sidebar"
      }
      aria-expanded={!designSidebarCollapsed}
      title="Toggle design sidebar (Ctrl/⌘ B)"
      className={
        dark
          ? "designer-control inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border"
          : "inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:text-neutral-950"
      }
      onClick={onToggleDesignSidebar}
    >
      <PanelLeft className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function HistoryButtons({
  dark,
  isClientPreview,
  canUndo,
  canRedo,
  undoName,
  redoName,
  onUndo,
  onRedo,
}: CommandBarCanvasControlsProps) {
  const commandHistoryButtonClass = `command-history-action inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-40 md:h-[30px] md:w-[30px] ${
    dark
      ? "designer-control"
      : "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50"
  }`;
  return (
    <>
      <button
        type="button"
        data-testid="command-undo"
        aria-label={undoName ? `Undo ${undoName}` : "Undo"}
        className={commandHistoryButtonClass}
        onClick={onUndo}
        disabled={isClientPreview || !canUndo}
        title={undoName ? `Undo "${undoName}" (Cmd/Ctrl+Z)` : "Undo (Cmd/Ctrl+Z)"}
      >
        <Undo2 className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        data-testid="command-redo"
        aria-label={redoName ? `Redo ${redoName}` : "Redo"}
        className={commandHistoryButtonClass}
        onClick={onRedo}
        disabled={isClientPreview || !canRedo}
        title={redoName ? `Redo "${redoName}" (Cmd/Ctrl+Shift+Z)` : "Redo (Cmd/Ctrl+Shift+Z)"}
      >
        <Redo2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </>
  );
}
