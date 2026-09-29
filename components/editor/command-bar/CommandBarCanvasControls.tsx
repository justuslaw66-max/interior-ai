"use client";

import { PanelLeft } from "lucide-react";
import { TABLET_MEDIA_QUERY, toggleStepPanel, useTabletPanelPolicy } from "@/lib/tablet-panel-policy";
import { useMediaQuery } from "@/lib/useMediaQuery";
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
 * The sidebar toggle in the editor command bar from md (phones expand and collapse the step sheet
 * from its handle, UX 4d), and the toast that offers Undo after an action.
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

/** On a tablet the panel may be collapsed for a right panel (UX 4d, AX11): the toggle shows it. */
function DesignSidebarToggle({
  dark,
  designSidebarCollapsed: storedCollapsed,
  onToggleDesignSidebar,
}: Pick<CommandBarCanvasControlsProps, "dark" | "designSidebarCollapsed" | "onToggleDesignSidebar">) {
  const policy = useTabletPanelPolicy(useMediaQuery(TABLET_MEDIA_QUERY), storedCollapsed);
  const designSidebarCollapsed = policy.collapsed;
  const setCollapsed = (next: boolean) => {
    if (next !== storedCollapsed) onToggleDesignSidebar();
  };
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
          ? "designer-control inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
          : "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:text-neutral-950"
      }
      onClick={() => toggleStepPanel(policy, storedCollapsed, setCollapsed)}
    >
      <PanelLeft className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
