import type { ComponentProps } from "react";
import {
  resolveHouseRoomFloorElevationMeters,
  type HousePlanRoom2D,
} from "@/lib/design-page-house-plan";
import type { RoomRendererOpening } from "@/lib/design-page-plan-overlays";
import { GeneratedWindowFrame3D } from "../GeneratedWindowFrame3D";
import { OpeningThresholdMesh } from "./wallAndOpeningMeshes";
import {
  getOpeningThresholds,
  getSharedWallRoomIds,
  getSharedWallRenderOwnerRoomId,
  getWallSurfaceFaceId,
  getWallOpenings,
  getWallSegments,
  type OpeningThreshold3D,
  type WallSegment3D,
} from "./geometry";

type ThresholdMeshProps = ComponentProps<typeof OpeningThresholdMesh>;

export type LegacyPhysicalOpeningAssembly = {
  stableKey: string;
  room: HousePlanRoom2D;
  segment: WallSegment3D;
  threshold: OpeningThreshold3D;
  sourceOpening: RoomRendererOpening;
};

export type RenderableLegacyPhysicalOpeningAssembly =
  LegacyPhysicalOpeningAssembly & {
    floorWorldY: number;
    wallHeight: number;
    wallThickness: number;
    opacity: number;
  };

type LegacyPhysicalOpeningMeshesProps = Pick<
  ThresholdMeshProps,
  | "interactive"
  | "hoveredTargetKey"
  | "selectedTargetKey"
  | "onHoverTarget"
  | "onClearHoverTarget"
  | "onSelectTarget"
  | "onMoveOpening"
  | "onOpeningDragStateChange"
> & {
  assemblies: readonly RenderableLegacyPhysicalOpeningAssembly[];
  selectedOpeningId?: string | null;
};

export function buildLegacyPhysicalOpeningAssemblies({
  visibleRooms,
  topologyRooms,
  openings,
  defaultWallHeight,
}: {
  visibleRooms: readonly HousePlanRoom2D[];
  topologyRooms: readonly HousePlanRoom2D[];
  openings: readonly RoomRendererOpening[];
  defaultWallHeight: number;
}): LegacyPhysicalOpeningAssembly[] {
  return openings.flatMap((opening) => {
    if (opening.hostResolution && opening.hostResolution.status !== "resolved") {
      return [];
    }
    const candidates = visibleRooms.flatMap((room) =>
      getWallSegments(room).flatMap((segment) => {
        const wallOpenings = getWallOpenings(
          room,
          segment,
          topologyRooms,
          [opening]
        );
        const wallHeight = Math.max(0.2, room.height ?? defaultWallHeight);
        return getOpeningThresholds(
          segment,
          wallOpenings,
          wallHeight,
          wallHeight
        ).map((threshold) => ({ room, segment, threshold }));
      })
    ).sort((first, second) =>
      `${first.room.id}:${first.segment.key}`.localeCompare(
        `${second.room.id}:${second.segment.key}`
      )
    );
    const chosen = candidates[0];
    if (!chosen) return [];
    return [{
      ...chosen,
      sourceOpening: opening,
      stableKey: `${opening.physicalWallId ?? opening.hostPhysicalSegmentKey ?? "opening"}:${opening.id}`,
    }];
  });
}

export function buildRenderableLegacyPhysicalOpeningAssemblies({
  activeFloorLevel,
  defaultWallHeight,
  defaultWallThickness,
  enabled,
  fadeInactiveFloors,
  inactiveFloorOpacityMultiplier,
  openings,
  stackedFloors,
  topologyRooms,
  visibleRooms,
}: Parameters<typeof buildLegacyPhysicalOpeningAssemblies>[0] & {
  activeFloorLevel: number;
  defaultWallThickness: number;
  enabled: boolean;
  fadeInactiveFloors: boolean;
  inactiveFloorOpacityMultiplier: number;
  stackedFloors: boolean;
}): RenderableLegacyPhysicalOpeningAssembly[] {
  if (!enabled) return [];
  return buildLegacyPhysicalOpeningAssemblies({
    visibleRooms, topologyRooms, openings, defaultWallHeight,
  }).map((assembly) => {
    const room = assembly.room;
    const inactive = stackedFloors && fadeInactiveFloors && (room.floorLevel ?? 1) !== activeFloorLevel;
    const wallHeight = Math.max(
      0.2,
      room.wallHeights?.[getWallSurfaceFaceId(room, assembly.segment)] ?? room.height ?? defaultWallHeight
    );
    return {
      ...assembly,
      floorWorldY: resolveHouseRoomFloorElevationMeters(
        room, Math.max(0.2, room.height ?? defaultWallHeight), stackedFloors
      ),
      wallHeight,
      wallThickness: Math.max(0.01, room.wallThickness ?? defaultWallThickness),
      opacity: Math.min(1, Math.max(0.08, room.surfaceOpacity?.wall ?? 1)) *
        (inactive ? inactiveFloorOpacityMultiplier : 1),
    };
  });
}

export function getMountedSharedWallRenderOwnerRoomId(
  room: HousePlanRoom2D,
  rooms: readonly HousePlanRoom2D[],
  segment: WallSegment3D,
  part: Parameters<typeof getSharedWallRenderOwnerRoomId>[3],
  visibleRooms: readonly Pick<HousePlanRoom2D, "id">[]
): string {
  const participants = [
    room.id,
    ...getSharedWallRoomIds(room, rooms, segment, part),
  ];
  const mounted = participants.filter((roomId) =>
    visibleRooms.some((visibleRoom) => visibleRoom.id === roomId)
  );
  return (mounted.length ? mounted : participants).sort()[0];
}

function LegacyWindowFrame({
  threshold,
  segment,
  wallThickness,
  opacity,
  selected,
}: {
  threshold: OpeningThreshold3D;
  segment: WallSegment3D;
  wallThickness: number;
  opacity: number;
  selected: boolean;
}) {
  return (
    <group
      position={[
        threshold.x,
        threshold.bottom + threshold.height / 2,
        threshold.z,
      ]}
      rotation-y={segment.rotationY}
      userData={{
        testId: "legacy-window-symbol-3d",
        openingId: threshold.sourceId,
        openingBottomMeters: threshold.bottom,
        openingHeightMeters: threshold.height,
      }}
    >
      <GeneratedWindowFrame3D
        widthMeters={threshold.length}
        heightMeters={threshold.height}
        wallDepthMeters={wallThickness}
        opacity={opacity}
        selected={selected}
      />
    </group>
  );
}

export function LegacyPhysicalOpeningMeshes({
  assemblies,
  selectedOpeningId,
  ...thresholdProps
}: LegacyPhysicalOpeningMeshesProps) {
  return assemblies.map((assembly) => {
    return (
      <group
        key={assembly.stableKey}
        position={[
          assembly.room.x,
          assembly.floorWorldY,
          assembly.room.z,
        ]}
        userData={{
          testId: "legacy-physical-opening-assembly",
          stableKey: assembly.stableKey,
          openingId: assembly.sourceOpening.id,
        }}
      >
        {assembly.threshold.kind === "window" ? (
          <LegacyWindowFrame
            threshold={assembly.threshold}
            segment={assembly.segment}
            wallThickness={assembly.wallThickness}
            opacity={assembly.opacity}
            selected={selectedOpeningId === assembly.threshold.sourceId}
          />
        ) : null}
        <OpeningThresholdMesh
          roomId={assembly.sourceOpening.roomId ?? assembly.room.id}
          threshold={assembly.threshold}
          segment={assembly.segment}
          wallThickness={assembly.wallThickness}
          sourceOpening={assembly.sourceOpening}
          floorWorldY={assembly.floorWorldY}
          {...thresholdProps}
        />
      </group>
    );
  });
}
