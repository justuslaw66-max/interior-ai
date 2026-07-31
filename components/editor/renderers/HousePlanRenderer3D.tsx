"use client";

import { Line } from "@react-three/drei/core/Line";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  ROOM_DIMENSION_DEFAULTS,
  resolveHouseRoomFloorElevationMeters,
  type HousePlanRoom2D,
} from "@/lib/design-page-house-plan";
import type { RoomRendererOpening } from "@/lib/design-page-plan-overlays";
import {
  clampFloorPatternScale,
  getFloorMaterialById,
  normalizeFloorRotationDeg,
} from "@/lib/floor-materials";
import {
  getCeilingSurfaceSettings,
} from "@/lib/surface-settings";
import type { CanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import { CanonicalFloorPlanWalls3D } from "./CanonicalFloorPlanStructure";
import {
  LegacyFloorSlabMesh,
  LegacyWallBandMesh,
  RoomCeilingCapMesh,
  RoomFloorMesh,
} from "./house-plan-3d/surfaceMeshes";
import {
  CutawayWallMesh,
  OpeningThresholdMesh,
  WallSurfacePanelMesh,
} from "./house-plan-3d/wallAndOpeningMeshes";
import {
  buildLegacyFloorSlabsForTest,
  buildLegacyWallFaceRenderPatchesForTest,
  buildLegacyWallBandsForTest,
  buildOpeningLintelParts,
  buildOpeningSillParts,
  buildWallSurfacePanels,
  getOpeningThresholds,
  getRoomOutlinePoints,
  getSharedWallRoomIds,
  getWallOpenings,
  getWallSegments,
  getWallSurfaceFaceId,
  legacyCutawaySegmentKeySignature,
  legacyPhysicalWallCutEndJoinOptions,
  resolveLegacyCameraCutawaySegmentKeysForTest,
  splitWallPartsAtSharedBoundaries,
  withWallSurfacePanelSupportIntervals,
} from "./house-plan-3d/geometry";
export {
  buildLegacyFloorSlabsForTest,
  buildLegacyWallFaceRenderPatchesForTest,
  buildLegacyWallBandsForTest,
  getLegacyPhysicalWallCutEndOptionsForTest,
  getLegacySharedWallMatchesForTest,
  getLegacyWallOpeningCountsForTest,
  getLegacyWallSurfaceSeamOverlaps,
  getLegacyWallSurfaceJoinRangesForTest,
  getWallInteriorSurfaceSideForTest,
  resolveLegacyCameraCutawaySegmentKeysForTest,
} from "./house-plan-3d/geometry";

type HousePlanRenderer3DProps = {
  rooms: readonly HousePlanRoom2D[];
  /**
   * Whole-home room graph used to resolve shared walls and mirrored openings.
   * `rooms` may be visibility-filtered in Focus room mode, but topology must
   * remain identical to Entire home mode.
   */
  topologyRooms?: readonly HousePlanRoom2D[];
  openings?: readonly RoomRendererOpening[];
  activeRoomId: string;
  focusRoomId?: string | null;
  activeFloorLevel?: number;
  wallHeight: number;
  stackedFloors?: boolean;
  fadeInactiveFloors?: boolean;
  interactive?: boolean;
  onSelectRoom?: (roomId: string) => void;
  selectedOpeningId?: string | null;
  selectedSurfaceTarget?: {
    kind: "floor" | "wall" | "ceiling";
    roomId: string;
    id: string;
    panelId?: string;
    panelAliases?: string[];
    surfaceSide?: 1 | -1;
  } | null;
  onSelectSurfaceTarget?: (target: {
    kind: "floor" | "wall" | "ceiling";
    roomId: string;
    id: string;
    panelId?: string;
    panelAliases?: string[];
    surfaceSide?: 1 | -1;
  }) => void;
  onSelectOpening?: (openingId: string | null) => void;
  onMoveOpening?: (openingId: string, offsetMeters: number) => void;
  onResizeOpening?: (
    openingId: string,
    metrics: { widthMeters: number; offsetMeters: number }
  ) => void;
  onOpeningDragStateChange?: (
    isDragging: boolean,
    kind?: "opening" | "opening_resize"
  ) => void;
  canonicalPlan?: CanonicalFloorPlanRenderModel | null;
  canonicalStructureExpected?: boolean;
};

type StructureTargetKind = "floor" | "wall" | "ceiling" | "opening";

type StructureTarget = {
  kind: StructureTargetKind;
  roomId: string;
  id: string;
  pieceKey?: string;
  panelId?: string;
  panelAliases?: string[];
  surfaceSide?: 1 | -1;
};

const STRUCTURE_THICKNESS_METERS = 0.025;
const FLOOR_THICKNESS_METERS = ROOM_DIMENSION_DEFAULTS.slabThickness;
const CEILING_CAP_COLOR = "#9c9d99";
const STRUCTURE_HOVER_OUTLINE_COLOR = "#00d5e8";
const STRUCTURE_SELECTED_OUTLINE_COLOR = "#2563eb";
const ACTIVE_FLOOR_OUTLINE_COLOR = "#1d4ed8";
const INACTIVE_FLOOR_OPACITY_MULTIPLIER = 0.32;

function clampStructureOpacity(value: number | undefined): number {
  return Math.max(0.05, Math.min(1, typeof value === "number" && Number.isFinite(value) ? value : 1));
}

function getRoomFloorLevel(room: HousePlanRoom2D): number {
  return typeof room.floorLevel === "number" && Number.isFinite(room.floorLevel)
    ? room.floorLevel
    : 1;
}

function getStructureTargetKey(target: StructureTarget | null): string | null {
  if (!target) return null;
  return `${target.kind}:${target.roomId}:${target.id}`;
}

function getStructurePieceKey(target: StructureTarget | null): string | null {
  if (!target) return null;
  return target.pieceKey ?? getStructureTargetKey(target);
}

function isSameStructurePiece(first: StructureTarget | null, second: StructureTarget): boolean {
  return getStructurePieceKey(first) === getStructurePieceKey(second);
}

function getStructureOutlineStyle(
  targetKey: string,
  hoveredTargetKey: string | null,
  selectedTargetKey: string | null
) {
  if (selectedTargetKey === targetKey) {
    return { color: STRUCTURE_SELECTED_OUTLINE_COLOR, lineWidth: 2.8 };
  }

  if (hoveredTargetKey === targetKey) {
    return { color: STRUCTURE_HOVER_OUTLINE_COLOR, lineWidth: 2.4 };
  }

  return null;
}

function useLegacyCameraCutawaySegmentKeys({
  rooms,
  activeRoomId,
  enabled,
}: {
  rooms: readonly HousePlanRoom2D[];
  activeRoomId: string;
  enabled: boolean;
}) {
  const { camera } = useThree();
  const viewDirectionRef = useRef(new THREE.Vector3());
  const initialKeys = useMemo(
    () => {
      if (!enabled) return new Set<string>();
      const viewDirection = camera.getWorldDirection(new THREE.Vector3());
      return resolveLegacyCameraCutawaySegmentKeysForTest({
        rooms,
        activeRoomId,
        cameraX: camera.position.x,
        cameraZ: camera.position.z,
        viewDirectionX: viewDirection.x,
        viewDirectionZ: viewDirection.z,
      });
    },
    [activeRoomId, camera, enabled, rooms]
  );
  const [cutawaySegmentKeys, setCutawaySegmentKeys] = useState(initialKeys);
  const signatureRef = useRef(legacyCutawaySegmentKeySignature(initialKeys));

  useFrame(() => {
    const viewDirection = camera.getWorldDirection(viewDirectionRef.current);
    const nextKeys = enabled
      ? resolveLegacyCameraCutawaySegmentKeysForTest({
          rooms,
          activeRoomId,
          cameraX: camera.position.x,
          cameraZ: camera.position.z,
          viewDirectionX: viewDirection.x,
          viewDirectionZ: viewDirection.z,
        })
      : new Set<string>();
    const nextSignature = legacyCutawaySegmentKeySignature(nextKeys);
    if (nextSignature === signatureRef.current) return;
    signatureRef.current = nextSignature;
    setCutawaySegmentKeys(nextKeys);
  });

  return cutawaySegmentKeys;
}

export default function HousePlanRenderer3D({
  rooms,
  topologyRooms = rooms,
  openings = [],
  activeRoomId,
  focusRoomId = null,
  activeFloorLevel,
  wallHeight,
  stackedFloors = false,
  fadeInactiveFloors = false,
  interactive = false,
  onSelectRoom,
  selectedOpeningId = null,
  selectedSurfaceTarget = null,
  onSelectSurfaceTarget,
  onSelectOpening,
  onMoveOpening,
  onResizeOpening,
  onOpeningDragStateChange,
  canonicalPlan = null,
  canonicalStructureExpected = false,
}: HousePlanRenderer3DProps) {
  const activeRoom = rooms.find((room) => room.id === activeRoomId);
  const resolvedActiveFloorLevel =
    typeof activeFloorLevel === "number" && Number.isFinite(activeFloorLevel)
      ? activeFloorLevel
      : activeRoom
        ? getRoomFloorLevel(activeRoom)
        : 1;
  const [hoveredStructureTarget, setHoveredStructureTarget] = useState<StructureTarget | null>(null);
  const hoveredTargetKey = getStructurePieceKey(hoveredStructureTarget);
  const selectedOpening = selectedOpeningId
    ? openings.find((opening) => opening.id === selectedOpeningId) ?? null
    : null;
  const selectedLogicalTargetKey = getStructureTargetKey(
    selectedSurfaceTarget?.roomId === activeRoomId
      ? selectedSurfaceTarget
      : selectedOpening
        ? { kind: "opening", roomId: selectedOpening.roomId ?? activeRoomId, id: selectedOpening.id }
        : null
  );
  const persistedWallPanelKey =
    selectedSurfaceTarget?.kind === "wall" &&
    selectedSurfaceTarget.panelId &&
    selectedLogicalTargetKey
      ? `${selectedLogicalTargetKey}:${selectedSurfaceTarget.panelId}`
      : null;
  const selectedTargetKey =
    selectedSurfaceTarget?.kind === "wall"
      ? persistedWallPanelKey ?? selectedLogicalTargetKey
      : selectedLogicalTargetKey;
  // Keep the saved wall panel as the single visual selection. Previously a
  // neighboring hover replaced the blue selection with a cyan outline, making
  // the selection appear to jump or span more than one panel.
  const visibleHoveredTargetKey =
    selectedSurfaceTarget?.kind === "wall" && selectedTargetKey
      ? null
      : hoveredTargetKey;
  const legacyCutawaySegmentKeys = useLegacyCameraCutawaySegmentKeys({
    rooms,
    activeRoomId,
    enabled: !canonicalPlan && rooms.length > 0,
  });
  // These editor-state arrays are immutable snapshots. The React compiler
  // cannot prove that across the legacy geometry helpers, while retaining this
  // memo avoids rebuilding planar unions during unrelated interactive renders.
  /* eslint-disable react-hooks/preserve-manual-memoization */
  const legacyWatertightGeometry = useMemo(() => {
    if (canonicalPlan || rooms.length === 0) return null;
    return {
      floorSlabs: buildLegacyFloorSlabsForTest({
        rooms: [...rooms],
        topologyRooms: [...topologyRooms],
        openings: [...openings],
        defaultWallHeight: wallHeight,
        stackedFloors,
      }),
      wallBands: buildLegacyWallBandsForTest({
        rooms: [...rooms],
        topologyRooms: [...topologyRooms],
        openings: [...openings],
        defaultWallHeight: wallHeight,
        stackedFloors,
        excludedSegmentKeys: legacyCutawaySegmentKeys,
      }),
      wallFaceRenderPatches: buildLegacyWallFaceRenderPatchesForTest({
        rooms: [...rooms],
        topologyRooms: [...topologyRooms],
        openings: [...openings],
        defaultWallHeight: wallHeight,
        stackedFloors,
        excludedSegmentKeys: legacyCutawaySegmentKeys,
      }),
    };
  }, [
    canonicalPlan,
    legacyCutawaySegmentKeys,
    openings,
    rooms,
    stackedFloors,
    topologyRooms,
    wallHeight,
  ]);
  /* eslint-enable react-hooks/preserve-manual-memoization */
  const hasLegacyMergedSlab = Boolean(
    legacyWatertightGeometry?.floorSlabs.length
  );
  const hasLegacyMergedWalls = Boolean(
    legacyWatertightGeometry?.wallBands.length
  );
  const legacyWallTopMetersByFloor = new Map<number, number>();
  for (const band of legacyWatertightGeometry?.wallBands ?? []) {
    legacyWallTopMetersByFloor.set(
      band.floorLevel,
      Math.max(
        legacyWallTopMetersByFloor.get(band.floorLevel) ?? Number.NEGATIVE_INFINITY,
        band.topMeters
      )
    );
  }

  const clearHoveredTarget = (target: StructureTarget) => {
    setHoveredStructureTarget((previous) =>
      isSameStructurePiece(previous, target) ? null : previous
    );
  };

  const selectStructureTarget = (
    target: StructureTarget,
    event: ThreeEvent<MouseEvent | PointerEvent>
  ) => {
    if (!interactive) return;
    event.stopPropagation();
    if (target.kind === "opening") {
      onSelectOpening?.(target.id);
      return;
    }
    if (onSelectSurfaceTarget) {
      onSelectSurfaceTarget({
        kind: target.kind,
        roomId: target.roomId,
        id: target.id,
        panelId: target.panelId,
        panelAliases: target.panelAliases,
        surfaceSide: target.surfaceSide,
      });
    } else {
      onSelectRoom?.(target.roomId);
    }
    onSelectOpening?.(null);
  };

  return (
    <group>
      {legacyWatertightGeometry?.floorSlabs.map((slab) => (
        <LegacyFloorSlabMesh
          key={`legacy-floor-slab:${slab.key}`}
          slab={slab}
        />
      ))}
      {legacyWatertightGeometry?.wallBands.map((band) => (
        <LegacyWallBandMesh
          key={`legacy-wall-band:${band.key}`}
          band={band}
          facePatches={
            legacyWatertightGeometry.wallFaceRenderPatches
          }
          showTopCap={
            Math.abs(
              band.topMeters -
                (legacyWallTopMetersByFloor.get(band.floorLevel) ??
                  band.topMeters)
            ) <= 0.0005
          }
          opacity={
            stackedFloors &&
            fadeInactiveFloors &&
            band.floorLevel !== resolvedActiveFloorLevel
              ? INACTIVE_FLOOR_OPACITY_MULTIPLIER
              : 1
          }
        />
      ))}
      {canonicalPlan && (
        <CanonicalFloorPlanWalls3D
          model={canonicalPlan}
          rooms={rooms}
          activeRoomId={activeRoomId}
          focusRoomId={focusRoomId}
          activeFloorLevel={resolvedActiveFloorLevel}
          selectedOpeningId={selectedOpeningId}
          selectedWallId={
            selectedSurfaceTarget?.kind === "wall"
              ? selectedSurfaceTarget.id
              : null
          }
          selectedWallRoomId={
            selectedSurfaceTarget?.kind === "wall"
              ? selectedSurfaceTarget.roomId
              : null
          }
          stackedFloors={stackedFloors}
          fadeInactiveFloors={fadeInactiveFloors}
          interactive={interactive}
          onSelectWall={(wallId, roomId, event) => {
            if (!roomId) return;
            selectStructureTarget(
              { kind: "wall", roomId, id: wallId },
              event
            );
          }}
          onSelectOpening={onSelectOpening}
          onEditOpening={(openingId, metrics, mode) => {
            const sourceOpening = openings.find((opening) => opening.id === openingId);
            const sourceRoom = sourceOpening?.roomId
              ? rooms.find((room) => room.id === sourceOpening.roomId)
              : null;
            if (!sourceOpening || !sourceRoom) return;
            const centerOffsetMeters =
              sourceOpening.wall === "north" || sourceOpening.wall === "south"
                ? metrics.centerMm.xMm / 1000 - sourceRoom.x
                : metrics.centerMm.zMm / 1000 - sourceRoom.z;
            if (mode === "resize") {
              onResizeOpening?.(openingId, {
                widthMeters: metrics.widthMm / 1000,
                offsetMeters: centerOffsetMeters,
              });
            } else {
              onMoveOpening?.(openingId, centerOffsetMeters);
            }
          }}
          onOpeningDragStateChange={(dragging, mode) =>
            onOpeningDragStateChange?.(
              dragging,
              mode === "resize" ? "opening_resize" : "opening"
            )
          }
        />
      )}
      {rooms.map((room, roomIndex) => {
        const isActive = room.id === activeRoomId;
        const roomFloorLevel = getRoomFloorLevel(room);
        const isActiveFloor = roomFloorLevel === resolvedActiveFloorLevel;
        const inactiveFloorMultiplier =
          stackedFloors && fadeInactiveFloors && !isActiveFloor
            ? INACTIVE_FLOOR_OPACITY_MULTIPLIER
            : 1;
        const outlinePoints = getRoomOutlinePoints(room);
        const wallSegments = getWallSegments(room);
        const surfaces = room.surfaces ?? room.surfaceFinishes;
        const floorMaterial = getFloorMaterialById(surfaces?.floorMaterialId);
        const wallOpacity = clampStructureOpacity(room.surfaceOpacity?.wall) * inactiveFloorMultiplier;
        const floorOpacity = clampStructureOpacity(room.surfaceOpacity?.floor) * inactiveFloorMultiplier;
        const ceilingOpacity = clampStructureOpacity(room.surfaceOpacity?.ceiling) * inactiveFloorMultiplier;
        const ceilingSettings = getCeilingSurfaceSettings(
          surfaces,
          normalizeFloorRotationDeg,
          clampFloorPatternScale
        );
        const ceilingColor = ceilingSettings.paintColorHex ?? surfaces?.ceilingColor ?? CEILING_CAP_COLOR;
        const slabThickness = Math.max(0.01, room.slabThickness ?? FLOOR_THICKNESS_METERS);
        const roomWallThickness = Math.max(
          0.01,
          room.wallThickness ?? STRUCTURE_THICKNESS_METERS
        );
        const roomWallHeight = Math.max(0.2, room.height ?? wallHeight);
        const floorYOffset = resolveHouseRoomFloorElevationMeters(
          room,
          roomWallHeight,
          stackedFloors
        );
        const floorTarget: StructureTarget = {
          kind: "floor",
          roomId: room.id,
          id: "floor",
        };
        const ceilingTarget: StructureTarget = {
          kind: "ceiling",
          roomId: room.id,
          id: "ceiling",
        };
        const floorTargetKey = getStructureTargetKey(floorTarget) ?? "";
        const ceilingTargetKey = getStructureTargetKey(ceilingTarget) ?? "";
        const floorOutlineStyle = getStructureOutlineStyle(
          floorTargetKey,
          visibleHoveredTargetKey,
          selectedTargetKey
        );
        const ceilingOutlineStyle = getStructureOutlineStyle(
          ceilingTargetKey,
          visibleHoveredTargetKey,
          selectedTargetKey
        );

        return (
          <group key={room.id} position={[room.x, floorYOffset, room.z]}>
            <RoomFloorMesh
              room={room}
              material={floorMaterial}
              wallThickness={roomWallThickness}
              slabThickness={slabThickness}
              showEdgeBand={!canonicalPlan && !hasLegacyMergedSlab}
              floorWorldY={floorYOffset}
              floorOpacity={floorOpacity}
              floorLayerIndex={isActive ? rooms.length + roomIndex : roomIndex}
              interactive={interactive}
              floorTarget={floorTarget}
              onHoverTarget={setHoveredStructureTarget}
              onClearHoverTarget={clearHoveredTarget}
              onSelectTarget={selectStructureTarget}
            />

            {floorOutlineStyle ? (
              <Line
                points={outlinePoints.map(([x, z]) => [x, 0.035, z])}
                color={floorOutlineStyle.color}
                lineWidth={floorOutlineStyle.lineWidth}
                raycast={() => null}
              />
            ) : null}

            {stackedFloors && isActiveFloor ? (
              <Line
                points={outlinePoints.map(([x, z]) => [x, 0.055, z])}
                color={ACTIVE_FLOOR_OUTLINE_COLOR}
                lineWidth={2.2}
                raycast={() => null}
              />
            ) : null}

            {!canonicalStructureExpected && wallSegments.flatMap((segment) => {
              const endJoinOptions = legacyPhysicalWallCutEndJoinOptions(
                room,
                topologyRooms,
                segment,
                legacyCutawaySegmentKeys
              );
              const wallFaceId = getWallSurfaceFaceId(room, segment);
              const segmentWallHeight = Math.max(
                0.2,
                room.wallHeights?.[wallFaceId] ?? roomWallHeight
              );
              const wallOpenings = getWallOpenings(
                room,
                segment,
                topologyRooms,
                openings
              );
              const interiorWallSurfacePanels =
                buildWallSurfacePanels(room, segment, wallOpenings);
              const wallSurfacePanels = [
                ...interiorWallSurfacePanels,
                ...buildWallSurfacePanels(
                  room,
                  segment,
                  wallOpenings,
                  "exterior"
                ).filter(
                  (panel) =>
                    getSharedWallRoomIds(
                      room,
                      topologyRooms,
                      segment,
                      panel.part
                    ).length === 0
                ),
              ];
              const wallPanelParts = interiorWallSurfacePanels.map(
                (panel) => panel.part
              );
              const parts = splitWallPartsAtSharedBoundaries(
                room,
                topologyRooms,
                segment,
                wallPanelParts
              );
              const resolvedWallSurfacePanels =
                withWallSurfacePanelSupportIntervals(
                  wallSurfacePanels,
                  segment,
                  parts
                );
              const lintelParts = buildOpeningLintelParts(
                segment,
                wallOpenings,
                segmentWallHeight,
                segmentWallHeight
              );
              const sillParts = buildOpeningSillParts(
                segment,
                wallOpenings,
                segmentWallHeight,
                segmentWallHeight
              );
              const thresholds = getOpeningThresholds(
                segment,
                wallOpenings,
                segmentWallHeight,
                segmentWallHeight
              );
              const wallRenderParts = [
                ...parts,
                ...lintelParts,
                ...sillParts,
              ];
              const fullHeightStructuralPartKeys = new Set(
                parts.map((part) => part.key)
              );

              return [
                ...wallRenderParts.map((part) => {
                  const isFullHeightStructuralPart =
                    fullHeightStructuralPartKeys.has(part.key);

                  return (
                    <CutawayWallMesh
                      key={part.key}
                      room={room}
                      rooms={topologyRooms}
                      segment={segment}
                      part={part}
                      wallHeight={segmentWallHeight}
                      wallThickness={roomWallThickness}
                      wallOpacity={wallOpacity}
                      renderBase={!hasLegacyMergedWalls}
                      // Full-height decorative finishes are rendered once per
                      // canonical room-facing panel below. Lintels and sills
                      // remain structural sub-parts and inherit the face finish.
                      renderSurfaces={!isFullHeightStructuralPart}
                      selectionPieceKey={null}
                      selectionSettingsFallbackKeys={[]}
                      selectionPanelLength={part.length}
                      selectionPanelCenterOffset={0}
                      forceCutaway={legacyCutawaySegmentKeys.has(segment.key)}
                      squareStart={Boolean(endJoinOptions.squareStart)}
                      squareEnd={Boolean(endJoinOptions.squareEnd)}
                      activeRoomId={activeRoomId}
                      isActive={isActive}
                      interactive={false}
                      hoveredTargetKey={visibleHoveredTargetKey}
                      selectedTargetKey={selectedTargetKey}
                      onHoverTarget={setHoveredStructureTarget}
                      onClearHoverTarget={clearHoveredTarget}
                      onSelectTarget={selectStructureTarget}
                    />
                  );
                }),
                ...resolvedWallSurfacePanels.map((panel) => (
                  <WallSurfacePanelMesh
                    key={panel.panelId}
                    room={room}
                    rooms={topologyRooms}
                    segment={segment}
                    panel={panel}
                    wallHeight={segmentWallHeight}
                    wallThickness={roomWallThickness}
                    wallOpacity={wallOpacity}
                    forceCutaway={legacyCutawaySegmentKeys.has(segment.key)}
                    squareStart={Boolean(endJoinOptions.squareStart)}
                    squareEnd={Boolean(endJoinOptions.squareEnd)}
                    activeRoomId={activeRoomId}
                    isActive={isActive}
                    interactive={interactive}
                    hoveredTargetKey={visibleHoveredTargetKey}
                    selectedTargetKey={selectedTargetKey}
                    onHoverTarget={setHoveredStructureTarget}
                    onClearHoverTarget={clearHoveredTarget}
                    onSelectTarget={selectStructureTarget}
                  />
                )),
                ...thresholds.map((threshold) => {
                  const sourceOpening = openings.find(
                    (opening) => opening.id === threshold.sourceId
                  );
                  const sourceRoom = sourceOpening?.roomId
                    ? topologyRooms.find(
                        (candidate) => candidate.id === sourceOpening.roomId
                      )
                    : undefined;

                  return (
                    <OpeningThresholdMesh
                      key={threshold.key}
                      roomId={room.id}
                      threshold={threshold}
                      segment={segment}
                      wallThickness={roomWallThickness}
                      sourceOpening={sourceOpening}
                      sourceRoom={sourceRoom}
                      floorWorldY={floorYOffset}
                      interactive={interactive}
                      hoveredTargetKey={visibleHoveredTargetKey}
                      selectedTargetKey={selectedTargetKey}
                      onHoverTarget={setHoveredStructureTarget}
                      onClearHoverTarget={clearHoveredTarget}
                      onSelectTarget={selectStructureTarget}
                      onMoveOpening={onMoveOpening}
                      onOpeningDragStateChange={onOpeningDragStateChange}
                    />
                  );
                }),
              ];
            })}

            <RoomCeilingCapMesh
              room={room}
              floorWorldY={floorYOffset}
              wallHeight={roomWallHeight}
              visible={room.ceilingVisible ?? true}
              opacity={ceilingOpacity}
              color={ceilingColor}
              interactive={interactive}
              ceilingTarget={ceilingTarget}
              outlineStyle={ceilingOutlineStyle}
              onHoverTarget={setHoveredStructureTarget}
              onClearHoverTarget={clearHoveredTarget}
              onSelectTarget={selectStructureTarget}
            />
          </group>
        );
      })}
    </group>
  );
}
