"use client";

import type { ComponentProps, DragEventHandler } from "react";

import { DesignPageViewportOverlayLayer } from "@/components/editor/design-page/DesignPageViewportOverlayLayer";
import { DesignSceneCanvas } from "@/components/editor/design-page/DesignSceneCanvas";
import { DesignSceneGuidanceLayer } from "@/components/editor/design-page/DesignSceneGuidanceLayer";
import { DesignScenePreviewLayer } from "@/components/editor/design-page/DesignScenePreviewLayer";
import { DesignSceneStructureLayer } from "@/components/editor/design-page/DesignSceneStructureLayer";
import { SceneItemsLayer } from "@/components/editor/design-page/SceneItemsLayer";

type CanvasProps = ComponentProps<typeof DesignSceneCanvas>;
type StructureProps = ComponentProps<typeof DesignSceneStructureLayer>;
type GuidanceProps = ComponentProps<typeof DesignSceneGuidanceLayer>;
type ItemsProps = ComponentProps<typeof SceneItemsLayer>;
type PreviewProps = ComponentProps<typeof DesignScenePreviewLayer>;
type ViewportProps = ComponentProps<typeof DesignPageViewportOverlayLayer>;

export type DesignPageSceneRegionState = {
  canvas: CanvasProps["state"];
  structure: StructureProps["state"];
  guidance: GuidanceProps["state"];
  items: ItemsProps["state"];
  preview: PreviewProps["state"];
  viewport: ViewportProps["state"];
};

export type DesignPageSceneRegionConfiguration = {
  canvas: CanvasProps["configuration"];
  structure: StructureProps["configuration"];
  guidance: GuidanceProps["configuration"];
  items: ItemsProps["configuration"];
  preview: PreviewProps["configuration"];
  viewport: ViewportProps["configuration"];
};

export type DesignPageSceneRegionReferences = {
  canvas: CanvasProps["sceneRefs"];
  viewport: ViewportProps["references"];
};

export type DesignPageSceneRegionResolvers = {
  guidance: GuidanceProps["resolvers"];
  items: ItemsProps["resolvers"];
};

export type DesignPageSceneRegionActions = {
  shell: {
    onDragOver: DragEventHandler<HTMLDivElement>;
    onDrop: DragEventHandler<HTMLDivElement>;
    onDragLeave: DragEventHandler<HTMLDivElement>;
  };
  canvas: CanvasProps["actions"];
  structure: StructureProps["actions"];
  guidance: GuidanceProps["actions"];
  items: ItemsProps["actions"];
  preview: PreviewProps["actions"];
  viewport: ViewportProps["actions"];
};

export type DesignPageSceneRegionProps = {
  state: DesignPageSceneRegionState;
  configuration: DesignPageSceneRegionConfiguration;
  references: DesignPageSceneRegionReferences;
  resolvers: DesignPageSceneRegionResolvers;
  actions: DesignPageSceneRegionActions;
};

export function DesignPageSceneRegion({
  state,
  configuration,
  references,
  resolvers,
  actions,
}: DesignPageSceneRegionProps) {
  return (
    <div
      className="relative h-full w-full"
      onDragOver={actions.shell.onDragOver}
      onDrop={actions.shell.onDrop}
      onDragLeave={actions.shell.onDragLeave}
    >
      <DesignSceneCanvas
        state={state.canvas}
        configuration={configuration.canvas}
        sceneRefs={references.canvas}
        actions={actions.canvas}
      >
        <DesignSceneStructureLayer
          state={state.structure}
          configuration={configuration.structure}
          actions={actions.structure}
        />
        <DesignSceneGuidanceLayer
          state={state.guidance}
          configuration={configuration.guidance}
          resolvers={resolvers.guidance}
          actions={actions.guidance}
        />
        <SceneItemsLayer
          state={state.items}
          configuration={configuration.items}
          resolvers={resolvers.items}
          actions={actions.items}
        />
        <DesignScenePreviewLayer
          state={state.preview}
          configuration={configuration.preview}
          actions={actions.preview}
        />
      </DesignSceneCanvas>

      <DesignPageViewportOverlayLayer
        state={state.viewport}
        configuration={configuration.viewport}
        references={references.viewport}
        actions={actions.viewport}
      />
    </div>
  );
}
