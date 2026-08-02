"use client";

import type { ComponentProps } from "react";

import EditorToolRail from "@/components/editor/EditorToolRail";
import { BetaStartPanel } from "@/components/editor/design-page/BetaStartPanel";
import { DesignPageEditorCommandBar } from "@/components/editor/design-page/DesignPageEditorCommandBar";

type CommandBarProps = ComponentProps<typeof DesignPageEditorCommandBar>;
type BetaStartProps = ComponentProps<typeof BetaStartPanel>;
type ToolRailProps = ComponentProps<typeof EditorToolRail>;
type ToolRailActionKey = Extract<keyof ToolRailProps, `on${string}`>;

export type DesignPageEditorChromeState = {
  commandBar: CommandBarProps["state"];
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
