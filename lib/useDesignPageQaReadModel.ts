"use client";

import { useMemo } from "react";

import type {
  DesignPageLayoutQaSnapshot,
  DesignPageScenePerformanceQaSnapshot,
} from "@/components/editor/design-page/DesignPageQaMarkers";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { DesignSnapshot, RoomSnapshot } from "@/lib/room-types";
import type { ScenePerformanceMode, SceneRenderQuality } from "@/lib/useDesignPageScenePerformance";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";

export type DesignPagePlanDebugMetrics = {
  zoom: number;
  visibleLabelCount: number;
  projectedRoomMinWidthPx: number;
  projectedRoomMinHeightPx: number;
  projectedRoomMinAreaPx: number;
  cameraValid: boolean;
  cameraRecoveries: number;
  cameraTargetX: number;
  cameraTargetZ: number;
};

export type BuildDesignPageScenePerformanceQaSnapshotInput = {
  enabled: boolean;
  mode: ScenePerformanceMode;
  liteEnabled: boolean;
  renderQuality: SceneRenderQuality;
  autoLite: boolean;
  sceneReady: boolean;
  roomCount: number;
  activeRoomItemCount: number;
  sceneItemCount: number;
  lastFps: number | null;
  fpsSamples: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
};

export function buildDesignPageScenePerformanceQaSnapshot({
  enabled,
  mode,
  liteEnabled,
  renderQuality,
  autoLite,
  sceneReady,
  roomCount,
  activeRoomItemCount,
  sceneItemCount,
  lastFps,
  fpsSamples,
  drawCalls,
  triangles,
  geometries,
  textures,
}: BuildDesignPageScenePerformanceQaSnapshotInput): DesignPageScenePerformanceQaSnapshot | null {
  if (!enabled) return null;
  return {
    mode,
    effectiveMode: liteEnabled ? "lite" : "quality",
    renderQuality,
    autoLite,
    sceneReady,
    roomCount,
    activeRoomItemCount,
    sceneItemCount,
    lastFps,
    fpsSamples,
    drawCalls,
    triangles,
    geometries,
    textures,
  };
}

export type BuildDesignPageLayoutQaSnapshotInput = {
  enabled: boolean;
  viewMode: EditorViewMode;
  editorMode: DesignPageEditorMode;
  designSnapshot: DesignSnapshot;
  activeRoom: RoomSnapshot | null;
  planDebugMetrics: DesignPagePlanDebugMetrics;
  selectedPlanRoomId: string | null;
};

export function buildDesignPageLayoutQaSnapshot({
  enabled,
  viewMode,
  editorMode,
  designSnapshot,
  activeRoom,
  planDebugMetrics,
  selectedPlanRoomId,
}: BuildDesignPageLayoutQaSnapshotInput): DesignPageLayoutQaSnapshot | null {
  if (!enabled) return null;
  return {
    viewMode,
    editorMode,
    activeRoomId: designSnapshot.activeRoomId,
    activeRoomName: activeRoom?.name ?? "",
    roomCount: designSnapshot.rooms.length,
    roomItemCounts: designSnapshot.rooms
      .map((room) => [room.id, room.items.length].join(":"))
      .join(","),
    planZoom: planDebugMetrics.zoom,
    visibleLabelCount: planDebugMetrics.visibleLabelCount,
    plan2DCameraValid: planDebugMetrics.cameraValid,
    plan2DCameraRecoveries: planDebugMetrics.cameraRecoveries,
    plan2DCameraTargetX: planDebugMetrics.cameraTargetX,
    plan2DCameraTargetZ: planDebugMetrics.cameraTargetZ,
    projectedRoomMinWidthPx: planDebugMetrics.projectedRoomMinWidthPx,
    projectedRoomMinHeightPx: planDebugMetrics.projectedRoomMinHeightPx,
    projectedRoomMinAreaPx: planDebugMetrics.projectedRoomMinAreaPx,
    selectedPlanRoomId: selectedPlanRoomId ?? "",
  };
}

export type UseDesignPageQaReadModelInput = {
  state: {
    persistence: {
      currentStoredDesignFingerprint: string;
    };
    scene: {
      mode: ScenePerformanceMode;
      liteEnabled: boolean;
      renderQuality: SceneRenderQuality;
      autoLite: boolean;
      sceneReady: boolean;
      roomCount: number;
      activeRoomItemCount: number;
      sceneItemCount: number;
      lastFps: number | null;
      fpsSamples: number;
      drawCalls: number;
      triangles: number;
      geometries: number;
      textures: number;
    };
    layout: {
      viewMode: EditorViewMode;
      editorMode: DesignPageEditorMode;
      designSnapshot: DesignSnapshot;
      activeRoom: RoomSnapshot | null;
      planDebugMetrics: DesignPagePlanDebugMetrics;
      selectedPlanRoomId: string | null;
    };
  };
};

export function useDesignPageQaReadModel({
  state,
}: UseDesignPageQaReadModelInput) {
  const { persistence, scene, layout } = state;
  const qaSnapshotFingerprint = persistence.currentStoredDesignFingerprint;
  const qaScenePerformanceSnapshot = useMemo(
    () =>
      buildDesignPageScenePerformanceQaSnapshot({
        enabled: process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS === "1",
        mode: scene.mode,
        liteEnabled: scene.liteEnabled,
        renderQuality: scene.renderQuality,
        autoLite: scene.autoLite,
        sceneReady: scene.sceneReady,
        roomCount: scene.roomCount,
        activeRoomItemCount: scene.activeRoomItemCount,
        sceneItemCount: scene.sceneItemCount,
        lastFps: scene.lastFps,
        fpsSamples: scene.fpsSamples,
        drawCalls: scene.drawCalls,
        triangles: scene.triangles,
        geometries: scene.geometries,
        textures: scene.textures,
      }),
    [
      scene.activeRoomItemCount,
      scene.autoLite,
      scene.fpsSamples,
      scene.drawCalls,
      scene.geometries,
      scene.lastFps,
      scene.textures,
      scene.triangles,
      scene.liteEnabled,
      scene.mode,
      scene.renderQuality,
      scene.roomCount,
      scene.sceneItemCount,
      scene.sceneReady,
    ]
  );
  const qaDesignLayoutSnapshot = useMemo(
    () =>
      buildDesignPageLayoutQaSnapshot({
        // This read-only marker is intentionally available in release builds so
        // the exact production artifact can be certified before promotion.
        enabled: true,
        viewMode: layout.viewMode,
        editorMode: layout.editorMode,
        designSnapshot: layout.designSnapshot,
        activeRoom: layout.activeRoom,
        planDebugMetrics: layout.planDebugMetrics,
        selectedPlanRoomId: layout.selectedPlanRoomId,
      }),
    [
      layout.activeRoom,
      layout.designSnapshot,
      layout.editorMode,
      layout.planDebugMetrics,
      layout.selectedPlanRoomId,
      layout.viewMode,
    ]
  );

  return {
    derived: {
      qaSnapshotFingerprint,
      qaScenePerformanceSnapshot,
      qaDesignLayoutSnapshot,
    },
  };
}
