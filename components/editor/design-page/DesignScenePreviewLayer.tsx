"use client";

import { Line } from "@react-three/drei/core/Line";
import type { ThreeEvent } from "@react-three/fiber";

import type { AiLayoutPreviewFootprint } from "@/lib/design-page-ai-layout-preview";
import type { PendingCatalogPlacementScene } from "@/lib/catalog-placement";

export type DesignScenePreviewLayerState = {
  aiLayout: {
    footprints: AiLayoutPreviewFootprint[];
    tone: {
      fill: string;
      line: string;
    };
  };
  placement: {
    pending: PendingCatalogPlacementScene | null;
    hover: PendingCatalogPlacementScene | null;
    hardInvalid: boolean;
  };
};

export type DesignScenePreviewLayerConfiguration = {
  hasWholeHousePlan: boolean;
  planWidth: number;
  planDepth: number;
  activeRoomWidth: number;
  activeRoomDepth: number;
  pendingRoomSize: {
    width: number;
    depth: number;
  } | null;
};

export type DesignScenePreviewLayerActions = {
  onPlacementPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onPlacementPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  onPlacementPointerUp: (event?: ThreeEvent<PointerEvent>) => void;
};

export type DesignScenePreviewLayerProps = {
  state: DesignScenePreviewLayerState;
  configuration: DesignScenePreviewLayerConfiguration;
  actions: DesignScenePreviewLayerActions;
};

export function DesignScenePreviewLayer({
  state,
  configuration,
  actions,
}: DesignScenePreviewLayerProps) {
  const pendingPlacement = state.placement.pending;
  const hoverPlacement = state.placement.hover;

  return (
    <>
      {state.aiLayout.footprints.length > 0 ? (
        <group name="ai-layout-preview-layer">
          {state.aiLayout.footprints.map((preview, index) => (
            <group
              key={preview.id}
              name={`ai-layout-preview-${preview.id}`}
              position={preview.position}
              rotation={[0, preview.rotationY, 0]}
            >
              <mesh position={[0, 0.018 + index * 0.001, 0]}>
                <boxGeometry args={[preview.width, 0.035, preview.depth]} />
                <meshBasicMaterial
                  color={state.aiLayout.tone.fill}
                  transparent
                  opacity={0.2}
                  depthWrite={false}
                />
              </mesh>
              <Line
                points={preview.outlinePoints}
                color={state.aiLayout.tone.line}
                lineWidth={3}
                transparent
                opacity={0.86}
              />
            </group>
          ))}
        </group>
      ) : null}

      {pendingPlacement ? (
        <>
          <mesh
            position={[
              configuration.hasWholeHousePlan
                ? 0
                : pendingPlacement.roomOffset.x,
              0.055,
              configuration.hasWholeHousePlan
                ? 0
                : pendingPlacement.roomOffset.z,
            ]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerDown={actions.onPlacementPointerDown}
            onPointerMove={actions.onPlacementPointerMove}
            onPointerUp={actions.onPlacementPointerUp}
            onPointerCancel={actions.onPlacementPointerUp}
          >
            <planeGeometry
              args={[
                configuration.hasWholeHousePlan
                  ? Math.max(configuration.planWidth, 1)
                  : configuration.pendingRoomSize?.width ??
                    configuration.activeRoomWidth,
                configuration.hasWholeHousePlan
                  ? Math.max(configuration.planDepth, 1)
                  : configuration.pendingRoomSize?.depth ??
                    configuration.activeRoomDepth,
              ]}
            />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.002}
              depthWrite={false}
            />
          </mesh>
          <group
            position={pendingPlacement.position}
            rotation={[0, pendingPlacement.rotationY, 0]}
            onPointerDown={actions.onPlacementPointerDown}
            onPointerMove={actions.onPlacementPointerMove}
            onPointerUp={actions.onPlacementPointerUp}
            onPointerCancel={actions.onPlacementPointerUp}
          >
            <mesh position={[0, 0.015, 0]}>
              <boxGeometry
                args={[
                  pendingPlacement.width,
                  0.03,
                  pendingPlacement.depth,
                ]}
              />
              <meshBasicMaterial
                color={state.placement.hardInvalid ? "#ef4444" : "#22c55e"}
                transparent
                opacity={state.placement.hardInvalid ? 0.28 : 0.24}
                depthWrite={false}
              />
            </mesh>
            <Line
              points={pendingPlacement.outlinePoints}
              color={state.placement.hardInvalid ? "#dc2626" : "#16a34a"}
              lineWidth={4}
            />
          </group>
        </>
      ) : hoverPlacement ? (
        <group
          userData={{ testId: "catalog-placement-hover-ghost" }}
          position={hoverPlacement.position}
          rotation={[0, hoverPlacement.rotationY, 0]}
        >
          <mesh position={[0, 0.01, 0]}>
            <boxGeometry
              args={[hoverPlacement.width, 0.02, hoverPlacement.depth]}
            />
            <meshBasicMaterial
              color="#2563eb"
              transparent
              opacity={0.12}
              depthWrite={false}
            />
          </mesh>
          <Line
            points={hoverPlacement.outlinePoints}
            color="#2563eb"
            lineWidth={2}
            transparent
            opacity={0.55}
          />
        </group>
      ) : null}
    </>
  );
}
