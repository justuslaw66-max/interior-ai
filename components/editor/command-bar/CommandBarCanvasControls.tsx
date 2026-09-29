"use client";

import { PanelLeft } from "lucide-react";
import { CommandBarActionToast } from "./CommandBarActionToast";

type CommandBarCanvasControlsProps = {
  dark: boolean;
  isClientPreview: boolean;
  sidebarToggleVisible: boolean;
  designSidebarCollapsed: boolean;
  onToggleDesignSidebar: () => void;
  undoName: string | null;
  onUndo: () => void;
};

/**
 * The sidebar toggle in the editor command bar, and the toast that offers Undo after an action.
 * Undo, Redo and 2D/3D sit over the canvas: the canvas toolbar from md (UX 4c), and two pills on
 * phones (`PhoneCanvasPills`, UX 4d).
 */
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
      <CommandBarActionToast isClientPreview={props.isClientPreview} undoName={props.undoName} onUndo={props.onUndo} />
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
          ? "designer-control inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] md:h-9 md:w-9 md:rounded-lg md:border"
          : "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 md:h-9 md:w-9 md:rounded-lg md:border md:border-neutral-200 md:bg-white md:hover:bg-neutral-50"
      }
      onClick={onToggleDesignSidebar}
    >
      <PanelLeft className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
