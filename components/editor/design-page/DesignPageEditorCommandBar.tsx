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
    placedFixtureCount: number;
    activeFixtureCount: number;
    estimatedFixtureCount: number;
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
    updateSettings: (patch: Partial<DesignLightingSettings>) => void;
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
  const overflowRoomHealthLabel =
    room?.health?.level === "ready"
      ? "Ready"
      : room?.health?.level === "review"
        ? "Review"
        : room?.health?.level === "blocked"
          ? "Blocked"
          : null;
  const overflowRoomHealthClass =
    room?.health?.level === "ready"
      ? "bg-emerald-50 text-emerald-700"
      : room?.health?.level === "review"
        ? "bg-amber-50 text-amber-700"
        : "bg-red-50 text-red-700";
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
        <div
          data-testid="editor-command-overflow-room-context"
          className={
            configuration.dark
              ? "mb-1 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-neutral-100 2xl:hidden"
              : "mb-1 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-neutral-900 2xl:hidden"
          }
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div
                data-testid="editor-command-overflow-room-name"
                className="truncate text-sm font-semibold"
              >
                {room.roomName}
              </div>
              <div className="mt-0.5 text-xs opacity-65">
                {room.roomTypeLabel} · {room.widthMeters.toFixed(1)} ×{" "}
                {room.depthMeters.toFixed(1)}m · {room.roomCount}{" "}
                {room.roomCount === 1 ? "room" : "rooms"}
              </div>
            </div>
            {configuration.showRoomHealth && overflowRoomHealthLabel ? (
              <span
                data-testid="editor-command-overflow-room-health"
                className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                  configuration.dark
                    ? "border border-white/10 bg-white/10 text-neutral-100"
                    : overflowRoomHealthClass
                }`}
              >
                {overflowRoomHealthLabel}
                {typeof room.health?.score === "number"
                  ? ` ${room.health.score}`
                  : ""}
              </span>
            ) : null}
          </div>
          {configuration.showRoomHealth &&
          room.health?.level !== "ready" &&
          room.health?.nextAction ? (
            <div className="mt-2 text-xs opacity-70">
              {room.health.nextAction}
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="editor-command-overflow-fit-view"
              className={
                configuration.dark
                  ? "rounded-lg border border-white/15 px-2 py-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-50"
                  : "rounded-lg border border-neutral-200 bg-white px-2 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 disabled:opacity-50"
              }
              disabled={
                state.commandBar.editorMode === "present" ||
                !actions.room.onFitPlan
              }
              onClick={actions.room.onFitPlan}
            >
              Fit view
            </button>
            <button
              type="button"
              data-testid="editor-command-overflow-view-toggle"
              className={
                configuration.dark
                  ? "rounded-lg bg-blue-500 px-2 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  : "rounded-lg bg-neutral-950 px-2 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
              }
              disabled={state.commandBar.editorMode === "present"}
              onClick={() =>
                actions.room.onViewModeChange(
                  room.viewMode === "2d" ? "3d" : "2d"
                )
              }
            >
              {room.viewMode === "2d" ? "Room view" : "2D plan"}
            </button>
          </div>
        </div>
      ) : null}

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
        advanced={state.commandBar.isDesigner}
        performanceMode={state.scenePerformance.mode}
        placedFixtureCount={state.sceneLighting.placedFixtureCount}
        activeFixtureCount={state.sceneLighting.activeFixtureCount}
        estimatedFixtureCount={state.sceneLighting.estimatedFixtureCount}
        onPresetChange={actions.sceneLighting.changePreset}
        onShadowsEnabledChange={actions.sceneLighting.changeShadowsEnabled}
        onPerformanceModeChange={actions.scenePerformance.changeMode}
        onSettingsChange={actions.sceneLighting.updateSettings}
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
