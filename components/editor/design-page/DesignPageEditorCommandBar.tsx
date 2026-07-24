"use client";

import type { ComponentProps } from "react";
import EditorCommandBar from "@/components/editor/EditorCommandBar";
import { LightingSettingsControls } from "@/components/editor/design-page/LightingSettingsControls";
import RoomPlanStatusBar from "@/components/editor/RoomPlanStatusBar";
import type {
  DesignLightingSettings,
  LightingPreset,
} from "@/lib/lightingPresets";
import type { ScenePerformanceMode } from "@/lib/useDesignPageScenePerformance";

type EditorCommandBarProps = ComponentProps<typeof EditorCommandBar>;
type RoomPlanStatusBarProps = ComponentProps<typeof RoomPlanStatusBar>;
type HandlerKeys<T> = Extract<keyof T, `on${string}`>;

type CommandBarState = Omit<
  EditorCommandBarProps,
  | HandlerKeys<EditorCommandBarProps>
  | "dark"
  | "contextSlot"
  | "overflowSlot"
  | "lightingSettingsSlot"
>;
type CommandBarActions = Pick<
  EditorCommandBarProps,
  HandlerKeys<EditorCommandBarProps>
>;
type RoomStatusHandlerKeys = Exclude<
  HandlerKeys<RoomPlanStatusBarProps>,
  "onRenameRoom"
>;
type RoomStatusState = Omit<
  RoomPlanStatusBarProps,
  | HandlerKeys<RoomPlanStatusBarProps>
  | "dark"
  | "compact"
  | "disabled"
  | "variant"
  | "healthLevel"
  | "healthScore"
  | "healthNextAction"
> & {
  id: string;
  health: {
    level: NonNullable<RoomPlanStatusBarProps["healthLevel"]>;
    score: number;
    nextAction: string;
  } | null;
};
type RoomStatusActions = Pick<
  RoomPlanStatusBarProps,
  RoomStatusHandlerKeys
> & {
  rename: (roomId: string) => void;
};

export type DesignPageEditorCommandBarState = {
  commandBar: CommandBarState;
  room: RoomStatusState | null;
  scenePerformance: {
    mode: ScenePerformanceMode;
    liteEnabled: boolean;
  };
  sceneLighting: {
    settings: DesignLightingSettings;
    liteEnabled: boolean;
  };
};

export type DesignPageEditorCommandBarConfiguration = {
  dark: boolean;
  compactRoomStatus: boolean;
  showRoomHealth: boolean;
};

export type DesignPageEditorCommandBarActions = {
  commandBar: CommandBarActions;
  room: RoomStatusActions;
  scenePerformance: {
    changeMode: (mode: ScenePerformanceMode) => void;
  };
  sceneLighting: {
    changePreset: (preset: LightingPreset) => void;
    changeShadowsEnabled: (enabled: boolean) => void;
  };
};

type DesignPageEditorCommandBarProps = {
  state: DesignPageEditorCommandBarState;
  configuration: DesignPageEditorCommandBarConfiguration;
  actions: DesignPageEditorCommandBarActions;
};

export function DesignPageEditorCommandBar({
  state,
  configuration,
  actions,
}: DesignPageEditorCommandBarProps) {
  const room = state.room;
  const contextVisible =
    !state.commandBar.isClientPreview &&
    Boolean(room || state.commandBar.viewMode === "3d");
  const contextSlot = contextVisible ? (
    <>
      {room ? (
        <RoomPlanStatusBar
          roomName={room.roomName}
          roomTypeLabel={room.roomTypeLabel}
          roomCount={room.roomCount}
          widthMeters={room.widthMeters}
          depthMeters={room.depthMeters}
          healthLevel={
            configuration.showRoomHealth
              ? room.health?.level
              : undefined
          }
          healthScore={
            configuration.showRoomHealth
              ? room.health?.score
              : undefined
          }
          healthNextAction={
            configuration.showRoomHealth
              ? room.health?.nextAction
              : undefined
          }
          viewMode={room.viewMode}
          disabled={state.commandBar.editorMode === "present"}
          dark={configuration.dark}
          compact={configuration.compactRoomStatus}
          variant="command"
          onViewModeChange={actions.room.onViewModeChange}
          onReviewHealth={actions.room.onReviewHealth}
          onFitPlan={actions.room.onFitPlan}
        />
      ) : null}
    </>
  ) : null;

  const overflowSlot = contextVisible ? (
    <div className="flex flex-col gap-1">
      {room ? (
        <button
          type="button"
          data-testid="editor-command-overflow-rename-room"
          className={
            configuration.dark
              ? "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold text-neutral-100 hover:bg-white/10"
              : "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold text-neutral-800 hover:bg-neutral-100"
          }
          onClick={() => actions.room.rename(room.id)}
        >
          Rename room
        </button>
      ) : null}

      {state.commandBar.viewMode === "3d" ? (
        <div
          data-testid="editor-overflow-scene-quality"
          className={
            configuration.dark
              ? "rounded-xl border border-white/10 p-2"
              : "rounded-xl border border-neutral-200 bg-neutral-50/80 p-2"
          }
        >
          <div
            className={
              configuration.dark
                ? "mb-2 px-1 text-xs font-semibold text-neutral-300"
                : "mb-2 px-1 text-xs font-semibold text-neutral-600"
            }
          >
            Scene quality
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(["auto", "quality", "lite"] as const).map((option) => {
              const active = state.scenePerformance.mode === option;
              const label =
                option === "auto"
                  ? state.scenePerformance.liteEnabled
                    ? "Auto Lite"
                    : "Auto"
                  : option === "quality"
                    ? "Quality"
                    : "Lite";

              return (
                <button
                  key={option}
                  type="button"
                  data-testid={`scene-performance-${option}`}
                  data-active={active ? "true" : "false"}
                  className={
                    active
                      ? configuration.dark
                        ? "rounded-lg bg-blue-500 px-2 py-1.5 text-xs font-semibold text-white"
                        : "rounded-lg bg-neutral-950 px-2 py-1.5 text-xs font-semibold text-white"
                      : configuration.dark
                        ? "rounded-lg px-2 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-white/10"
                        : "rounded-lg px-2 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-white"
                  }
                  onClick={() => actions.scenePerformance.changeMode(option)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  ) : null;
  const lightingSettingsSlot =
    !state.commandBar.isClientPreview &&
    state.commandBar.viewMode === "3d" ? (
      <LightingSettingsControls
        settings={state.sceneLighting.settings}
        liteEnabled={state.sceneLighting.liteEnabled}
        dark={configuration.dark}
        onPresetChange={actions.sceneLighting.changePreset}
        onShadowsEnabledChange={actions.sceneLighting.changeShadowsEnabled}
      />
    ) : null;

  return (
    <EditorCommandBar
      {...state.commandBar}
      {...actions.commandBar}
      dark={configuration.dark}
      contextSlot={contextSlot}
      overflowSlot={overflowSlot}
      lightingSettingsSlot={lightingSettingsSlot}
    />
  );
}
