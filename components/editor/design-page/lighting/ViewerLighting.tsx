"use client";

import { useMemo } from "react";

import type { SceneRoomItemEntry } from "@/lib/design-page-scene-domain";
import type { DesignLightingSettings } from "@/lib/lightingPresets";
import type { DesignItem } from "@/lib/room-types";
import { resolveLightingScene } from "@/lib/resolve-lighting-scene";

import { LightingSystem } from "./LightingSystem";
import { resolveEditorLighting } from "./lightingPresets";
import type { LightingMode } from "./lightingTypes";

export function ViewerLighting({
  settings,
  roomId = "viewer-room",
  roomWidth,
  roomDepth,
  roomHeight = 2.6,
  items = [],
  modeOverride,
}: {
  settings: DesignLightingSettings;
  roomId?: string;
  roomWidth: number;
  roomDepth: number;
  roomHeight?: number;
  items?: readonly DesignItem[];
  modeOverride?: LightingMode;
}) {
  const physicalScene = useMemo(() => {
    const sceneItems: SceneRoomItemEntry[] = items.map((item) => ({
      item,
      roomId,
      layerId: `room:${roomId}:items`,
      visible: true,
      roomOffset: { x: 0, z: 0 },
      roomFloorElevationMeters: 0,
      roomWidth,
      roomDepth,
      roomHeight,
      roomPlanShape: "rectangle",
      roomWallThickness: 0.12,
      roomWallModel: "canonical-room",
      isActiveRoom: true,
    }));
    return resolveLightingScene({
      settings,
      rooms: [
        {
          id: roomId,
          name: "Viewer room",
          roomType: "living",
          shape: "rectangle",
          x: 0,
          z: 0,
          w: roomWidth,
          d: roomDepth,
          height: roomHeight,
        },
      ],
      openings: [],
      items: sceneItems,
      qualityMode: "quality",
      liteEnabled: false,
      activeRoomId: roomId,
    });
  }, [items, roomDepth, roomHeight, roomId, roomWidth, settings]);
  const lighting = resolveEditorLighting(settings, {
    performanceMode: "quality",
    liteEnabled: false,
    modeOverride,
    physicalScene,
  });

  return (
    <LightingSystem
      lighting={lighting}
      shadowCameraHalfSpan={Math.max(roomWidth, roomDepth) / 2 + 3}
      fixtures={physicalScene.fixtures}
      windows={physicalScene.windows}
      bounds={{
        centerX: 0,
        centerZ: 0,
        width: roomWidth,
        depth: roomDepth,
        roomHeight,
      }}
    />
  );
}
