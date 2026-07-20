"use client";

import { projectSceneRoomItem } from "@/lib/design-page-scene-projection";

import { CabinetSceneItem } from "./CabinetSceneItem";
import type { CabinetDesignItemRendererProps } from "./CabinetDesignItemRenderer.contract";

/** Spatial renderer adapter; it applies canonical floor elevation and full geometry. */
export function CabinetDesignItemSpatial3D({
  sceneEntry,
  item,
  selected,
  interactive,
  renderReadyKey,
  onRenderReadyChange,
  onSelect,
}: CabinetDesignItemRendererProps) {
  const sceneProjection = projectSceneRoomItem(sceneEntry, "spatial");

  return (
    <CabinetSceneItem
      definition={item.cabinetDefinition}
      position={sceneProjection.position}
      rotationY={sceneProjection.rotationY}
      selected={selected}
      interactive={interactive}
      instanceId={item.instanceId}
      viewMode="3d"
      renderReadyKey={renderReadyKey}
      onRenderReadyChange={onRenderReadyChange}
      onSelect={onSelect}
    />
  );
}
