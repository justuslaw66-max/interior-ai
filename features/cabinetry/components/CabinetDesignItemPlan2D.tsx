"use client";

import { projectSceneRoomItem } from "@/lib/design-page-scene-projection";

import { CabinetSceneItem } from "./CabinetSceneItem";
import type { CabinetDesignItemRendererProps } from "./CabinetDesignItemRenderer.contract";

/** Plan renderer adapter; it suppresses floor elevation and renders a footprint. */
export function CabinetDesignItemPlan2D({
  sceneEntry,
  item,
  selected,
  interactive,
  renderReadyKey,
  onRenderReadyChange,
  onSelect,
}: CabinetDesignItemRendererProps) {
  const sceneProjection = projectSceneRoomItem(sceneEntry, "plan");

  return (
    <CabinetSceneItem
      definition={item.cabinetDefinition}
      position={sceneProjection.position}
      rotationY={sceneProjection.rotationY}
      selected={selected}
      interactive={interactive}
      instanceId={item.instanceId}
      viewMode="2d"
      renderReadyKey={renderReadyKey}
      onRenderReadyChange={onRenderReadyChange}
      onSelect={onSelect}
    />
  );
}
