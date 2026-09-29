"use client";

import type { ComponentProps } from "react";

import EditorToolRail from "@/components/editor/EditorToolRail";
import { CanvasViewToolbar } from "@/components/editor/canvas/CanvasViewToolbar";
import { KeyboardShortcutsButton, KeyboardShortcutsSheet } from "@/components/editor/canvas/KeyboardShortcutsSheet";
import { PhoneCanvasPills } from "@/components/editor/canvas/PhoneCanvasPills";
import { BetaStartPanel } from "@/components/editor/design-page/BetaStartPanel";
import { DesignPageEditorCommandBar } from "@/components/editor/design-page/DesignPageEditorCommandBar";
import { LeaveAtDesignLimitDialog } from "@/components/editor/design-page/LeaveAtDesignLimitDialog";
import type { LeaveAtDesignLimitPrompt } from "@/lib/useLeaveForMyDesigns";
import { resolveCanvasLeftInsetPx } from "@/lib/editor-canvas-insets";
import { isDesignControlsPanelMode } from "@/lib/useDesignPagePanelMode";
import { CANVAS_TOOLBAR_MEDIA_QUERY, useMediaQuery } from "@/lib/useMediaQuery";

type CommandBarProps = ComponentProps<typeof DesignPageEditorCommandBar>;
type BetaStartProps = ComponentProps<typeof BetaStartPanel>;
type ToolRailProps = ComponentProps<typeof EditorToolRail>;
type ToolRailActionKey = Extract<keyof ToolRailProps, `on${string}`>;

export type DesignPageEditorChromeState = {
  commandBar: CommandBarProps["state"];
  /** Leaving for My designs when the Free plan's designs are full asks first (Q7). */
  leaveAtDesignLimit: LeaveAtDesignLimitPrompt;
  betaStart: {
    visible: boolean;
    panel: BetaStartProps["state"];
  };
  toolRail: {
    visible: boolean;
    mode: ToolRailProps["mode"];
  };
};

export type DesignPageEditorChromeConfiguration = {
  commandBar: CommandBarProps["configuration"];
  toolRail: Pick<ToolRailProps, "dark" | "aiDesignEnabled">;
};

export type DesignPageEditorChromeActions = {
  commandBar: CommandBarProps["actions"];
  betaStart: BetaStartProps["actions"];
  toolRail: Pick<ToolRailProps, ToolRailActionKey>;
};

export type DesignPageEditorChromeProps = {
  state: DesignPageEditorChromeState;
  configuration: DesignPageEditorChromeConfiguration;
  actions: DesignPageEditorChromeActions;
};

/**
 * The controls over the canvas, not in Client Preview and not in Shop, whose page covers the
 * canvas: from md the canvas toolbar and the Keyboard shortcuts corner (UX 4c), and on phones two
 * pills, 2D | 3D and Undo/Redo (UX 4d).
 */
function CanvasControls({ state, configuration, actions }: DesignPageEditorChromeProps) {
  const wide = useMediaQuery(CANVAS_TOOLBAR_MEDIA_QUERY);
  const bar = state.commandBar.commandBar;
  const barActions = actions.commandBar.commandBar;
  const dark = configuration.commandBar.dark;
  const overCanvas = !bar.isClientPreview && bar.editorMode !== "buy";
  const onCanvas = wide && overCanvas;
  const leftInsetPx = resolveCanvasLeftInsetPx({
    panelVisible: !bar.millworkActive && isDesignControlsPanelMode(bar.editorMode),
    shopping: false,
    collapsed: bar.designSidebarCollapsed,
    isDesigner: bar.isDesigner,
  });
  return (
    <>
      {onCanvas ? (
        <CanvasViewToolbar
          dark={dark}
          leftInsetPx={leftInsetPx}
          viewMode={bar.viewMode}
          onViewModeChange={barActions.onViewModeChange}
          canFit={Boolean(state.commandBar.room) && bar.editorMode !== "present"}
          onFit={actions.commandBar.room.onFitPlan}
          canUndo={bar.canUndo}
          canRedo={bar.canRedo}
          undoName={bar.undoName}
          redoName={bar.redoName}
          onUndo={barActions.onUndo}
          onRedo={barActions.onRedo}
        />
      ) : null}
      {overCanvas && !wide ? (
        <PhoneCanvasPills
          dark={dark}
          viewMode={bar.viewMode}
          onViewModeChange={barActions.onViewModeChange}
          canUndo={bar.canUndo}
          canRedo={bar.canRedo}
          undoName={bar.undoName}
          redoName={bar.redoName}
          onUndo={barActions.onUndo}
          onRedo={barActions.onRedo}
        />
      ) : null}
      {onCanvas ? <KeyboardShortcutsButton dark={dark} /> : null}
      <KeyboardShortcutsSheet enabled={!bar.isClientPreview} isDesigner={bar.isDesigner} dark={dark} />
    </>
  );
}

export function DesignPageEditorChrome({
  state,
  configuration,
  actions,
}: DesignPageEditorChromeProps) {
  return (
    <>
      <DesignPageEditorCommandBar
        state={state.commandBar}
        configuration={configuration.commandBar}
        actions={actions.commandBar}
      />
      <CanvasControls state={state} configuration={configuration} actions={actions} />
      <LeaveAtDesignLimitDialog {...state.leaveAtDesignLimit} />

      {state.betaStart.visible ? (
        <BetaStartPanel
          state={state.betaStart.panel}
          actions={actions.betaStart}
        />
      ) : null}

      {state.toolRail.visible ? (
        <EditorToolRail
          mode={state.toolRail.mode}
          dark={configuration.toolRail.dark}
          aiDesignEnabled={configuration.toolRail.aiDesignEnabled}
          {...actions.toolRail}
        />
      ) : null}
    </>
  );
}
