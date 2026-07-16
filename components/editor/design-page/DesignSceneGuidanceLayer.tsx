"use client";

import { Line } from "@react-three/drei/core/Line";

import {
  CirculationHeatmapOverlay,
  type CirculationHeatmapOverlayProps,
} from "@/components/editor/design-page/CirculationHeatmapOverlay";
import { DesignerGrid } from "@/components/scene/DesignerGrid";
import {
  ZoneOutline,
  type ZoneOutlineBounds,
} from "@/components/scene/ZoneOutline";
import type {
  CatalogPlacementPlanRoom,
  CatalogSupportSurfaceHighlight,
} from "@/lib/catalog-placement";
import { getZoneLabel } from "@/lib/design-page-zone-layout";
import type { ZoneMin } from "@/lib/room-types";

export type DesignSceneGuidanceLayerState = {
  placement: {
    targetRoom: CatalogPlacementPlanRoom | null;
    showTargetRoom: boolean;
    targetValid: boolean;
    supportSurface: CatalogSupportSurfaceHighlight | null;
  };
  circulationHeatmap: CirculationHeatmapOverlayProps | null;
  zones: {
    entries: ZoneMin[];
    selectedId: string | null;
    compatibleIds: ReadonlySet<string>;
    pendingPlacement: boolean;
    hoverPlacement: boolean;
  };
};

export type DesignSceneGuidanceLayerConfiguration = {
  grid: {
    visible: boolean;
    pulse: boolean;
  };
  zonesVisible: boolean;
  activeRoomOffset: { x: number; z: number };
  activeRoomId: string | null;
};

export type DesignSceneGuidanceLayerResolvers = {
  getZoneBounds: (zone: ZoneMin) => ZoneOutlineBounds | null;
};

export type DesignSceneGuidanceLayerActions = {
  showToast: (message: string) => void;
  targetPendingPlacementToRoom: (
    roomId: string,
    target: {
      source: "zone";
      localPosition: [number, number, number];
      zoneLabel: string;
    }
  ) => void;
  selectZone: (zoneId: string) => void;
  clearSelection: () => void;
};

export type DesignSceneGuidanceLayerProps = {
  state: DesignSceneGuidanceLayerState;
  configuration: DesignSceneGuidanceLayerConfiguration;
  resolvers: DesignSceneGuidanceLayerResolvers;
  actions: DesignSceneGuidanceLayerActions;
};

export function DesignSceneGuidanceLayer({
  state,
  configuration,
  resolvers,
  actions,
}: DesignSceneGuidanceLayerProps) {
  const { placement, zones } = state;
  const targetRoom = placement.targetRoom;
  const supportSurface = placement.supportSurface;

  return (
    <>
      {targetRoom && placement.showTargetRoom && !supportSurface ? (
        <group
          position={[targetRoom.x, 0.062, targetRoom.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <mesh>
            <planeGeometry args={[targetRoom.w, targetRoom.d]} />
            <meshBasicMaterial
              color={placement.targetValid ? "#10b981" : "#ef4444"}
              transparent
              opacity={placement.targetValid ? 0.13 : 0.16}
              depthWrite={false}
            />
          </mesh>
          <Line
            points={[
              [-targetRoom.w / 2, -targetRoom.d / 2, 0.01],
              [targetRoom.w / 2, -targetRoom.d / 2, 0.01],
              [targetRoom.w / 2, targetRoom.d / 2, 0.01],
              [-targetRoom.w / 2, targetRoom.d / 2, 0.01],
              [-targetRoom.w / 2, -targetRoom.d / 2, 0.01],
            ]}
            color={placement.targetValid ? "#059669" : "#dc2626"}
            lineWidth={3}
          />
        </group>
      ) : null}

      {supportSurface ? (
        <group
          name="catalog-placement-support-surface-highlight"
          userData={{
            testId: "catalog-placement-support-surface-highlight",
            supportInstanceId: supportSurface.supportInstanceId,
          }}
          position={supportSurface.position}
          rotation={[0, supportSurface.rotationY, 0]}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <planeGeometry
              args={[supportSurface.width, supportSurface.depth]}
            />
            <meshBasicMaterial
              color="#34d399"
              transparent
              opacity={0.3}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-2}
            />
          </mesh>
          <Line
            points={supportSurface.outlinePoints}
            color="#047857"
            lineWidth={5}
            transparent
            opacity={0.98}
            raycast={() => null}
          />
        </group>
      ) : null}

      <DesignerGrid
        visible={configuration.grid.visible}
        pulse={configuration.grid.pulse}
      />

      {state.circulationHeatmap ? (
        <CirculationHeatmapOverlay {...state.circulationHeatmap} />
      ) : null}

      {configuration.zonesVisible ? (
        <group
          position={[
            configuration.activeRoomOffset.x,
            0,
            configuration.activeRoomOffset.z,
          ]}
        >
          {zones.entries.map((zone) => {
            const bounds = resolvers.getZoneBounds(zone);
            if (!bounds) return null;

            const label = getZoneLabel(zone.type);
            const compatible =
              !supportSurface && zones.compatibleIds.has(zone.id);
            const showingPlacementZones =
              !supportSurface &&
              (zones.pendingPlacement || zones.hoverPlacement);

            return (
              <ZoneOutline
                key={zone.id}
                data-testid={
                  zone.type === "seating" ? "seating-zone" : `${zone.type}-zone`
                }
                bounds={bounds}
                label={label}
                selected={zone.id === zones.selectedId}
                highlighted={compatible}
                dimmed={showingPlacementZones && !compatible}
                helperLabel={compatible ? `Tap to place in ${label}` : undefined}
                onSelect={() => {
                  if (zones.pendingPlacement) {
                    if (!compatible || !configuration.activeRoomId) {
                      actions.showToast(
                        `${label} is not a recommended zone for this item`
                      );
                      return;
                    }
                    actions.targetPendingPlacementToRoom(
                      configuration.activeRoomId,
                      {
                        source: "zone",
                        localPosition: [bounds.centerX, 0, bounds.centerZ],
                        zoneLabel: label,
                      }
                    );
                    return;
                  }

                  actions.selectZone(zone.id);
                  actions.clearSelection();
                }}
              />
            );
          })}
        </group>
      ) : null}
    </>
  );
}
