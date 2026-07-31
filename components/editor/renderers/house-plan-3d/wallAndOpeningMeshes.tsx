"use client";

import { Line } from "@react-three/drei/core/Line";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import {
  PLAN_OPENING_EDGE_PADDING_METERS,
  type RoomRendererOpening,
} from "@/lib/design-page-plan-overlays";
import { resolveCutawayWallOpacity } from "@/lib/design-page-wall-cutaway";
import {
  clampFloorPatternScale,
  normalizeFloorRotationDeg,
} from "@/lib/floor-materials";
import { getRuntimeSurfaceMaterialById } from "@/lib/surface-material-runtime";
import { getWallPanelSurfaceSettings } from "@/lib/surface-settings";
import { resolveWallSurfaceColorFillIntensity } from "@/lib/wall-paint-rendering";
import { useSurfaceMaterialTexture } from "../useSurfaceMaterialTexture";
import {
  getSurfaceMaterialFallbackColor,
  useSurfaceMaterialSourceTexture,
} from "./materials";
import {
  buildWallFinishShellGeometry,
  getSharedWallMatches,
  getSharedWallRenderOwnerRoomId,
  getSharedWallRoomIds,
  getSelectableWallSurfacePanelId,
  getWallInteriorSurfaceSide,
  getWallSurfaceFaceId,
  isWallSurfacePanelCutawayEligible,
  joinedLegacyWallSurfacePart,
  legacyWallPartAxisRange,
  resolveAtomicWallCutawayRenderState,
  type OpeningThreshold3D,
  type WallPart3D,
  type WallSegment3D,
  type WallSurfacePanelDescriptor,
} from "./geometry";

type StructureTarget = {
  kind: "floor" | "wall" | "ceiling" | "opening";
  roomId: string;
  id: string;
  pieceKey?: string;
  panelId?: string;
  panelAliases?: string[];
  surfaceSide?: 1 | -1;
};

function getStructureTargetKey(target: StructureTarget | null): string | null {
  if (!target) return null;
  return `${target.kind}:${target.roomId}:${target.id}`;
}

const ACTIVE_WALL_COLOR = "#fbfbf7";
const INACTIVE_WALL_COLOR = "#ddddda";
const WALL_INDIRECT_FILL_INTENSITY = 0.08;
const ACTIVE_WALL_OPACITY = 1;
const INACTIVE_WALL_OPACITY = 1;
const CAMERA_FACING_WALL_CUTAWAY_OPACITY = 0;
// Decorative finishes are a real 1.5 mm shell. Their inner face is flush with
// the structural wall boundary, whose covered broad triangles are omitted.
const WALL_SURFACE_THICKNESS_METERS = 0.0015;
// Finish shells terminate on the structural cut plane so their ends cannot
// become protruding fins at grazing camera angles.
const WALL_SURFACE_CUT_OVERLAP_METERS = 0;
const WALL_CUT_ENDPOINT_TOLERANCE_METERS = 0.002;
const STRUCTURE_HOVER_OUTLINE_COLOR = "#00d5e8";
const STRUCTURE_SELECTED_OUTLINE_COLOR = "#2563eb";
const WALL_SURFACE_TEXTURE_RESOLUTION = {
  maxSize: 4096,
  minSize: 768,
  pixelsPerMeter: 560,
} as const;

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

function stopStructurePointerEvent(event: ThreeEvent<MouseEvent | PointerEvent>) {
  event.stopPropagation();
  event.nativeEvent.stopPropagation();
  event.nativeEvent.stopImmediatePropagation?.();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function capturePointerIfSupported(event: ThreeEvent<PointerEvent>) {
  const target = event.target as Element | null;
  if (target && "setPointerCapture" in target) {
    target.setPointerCapture(event.pointerId);
  }
}

function releasePointerCaptureIfSupported(event: ThreeEvent<PointerEvent>) {
  const target = event.target as Element | null;
  if (target && "releasePointerCapture" in target) {
    target.releasePointerCapture(event.pointerId);
  }
}

function WallSurfaceSideMesh({
  materialKey,
  target,
  settings,
  partLength,
  partHeight,
  centerOffset,
  texturePanelLength,
  texturePanelCenterOffset,
  side,
  wallThickness,
  baseOpacity,
  baseWallColor,
  renderSurface,
  interactive,
  pickEnabledRef,
  onMaterialReady,
  onHoverTarget,
  onClearHoverTarget,
  onSelectTarget,
}: {
  materialKey: string;
  target: StructureTarget;
  settings: ReturnType<typeof getWallPanelSurfaceSettings>;
  partLength: number;
  partHeight: number;
  centerOffset: number;
  texturePanelLength: number;
  texturePanelCenterOffset: number;
  side: 1 | -1;
  wallThickness: number;
  baseOpacity: number;
  baseWallColor: string;
  renderSurface: boolean;
  interactive: boolean;
  pickEnabledRef: { current: boolean };
  onMaterialReady: (targetKey: string, material: THREE.MeshStandardMaterial | null) => void;
  onHoverTarget: (target: StructureTarget) => void;
  onClearHoverTarget: (target: StructureTarget) => void;
  onSelectTarget: (target: StructureTarget, event: ThreeEvent<MouseEvent | PointerEvent>) => void;
}) {
  const { gl, invalidate } = useThree();
  const surfaceMeshRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const wallSurfaceMaterial = getRuntimeSurfaceMaterialById(settings.materialId);
  const normalizedTexturePanelLength = Math.max(
    partLength,
    texturePanelLength
  );
  const surfaceCenterWithinPanel =
    centerOffset - texturePanelCenterOffset;
  const textureStartU =
    0.5 +
    (surfaceCenterWithinPanel - partLength / 2) /
      normalizedTexturePanelLength;
  const textureEndU =
    0.5 +
    (surfaceCenterWithinPanel + partLength / 2) /
      normalizedTexturePanelLength;
  const surfaceGeometry = useMemo(() => {
    const geometry = buildWallFinishShellGeometry({
      widthMeters: partLength,
      heightMeters: partHeight,
      thicknessMeters: WALL_SURFACE_THICKNESS_METERS,
    });
    const uv = geometry.getAttribute("uv");
    for (let index = 0; index < uv.count; index += 1) {
      uv.setX(
        index,
        THREE.MathUtils.lerp(
          textureStartU,
          textureEndU,
          uv.getX(index)
        )
      );
    }
    uv.needsUpdate = true;
    return geometry;
  }, [partHeight, partLength, textureEndU, textureStartU]);
  const patternedWallTexture = useSurfaceMaterialTexture({
    material: wallSurfaceMaterial,
    roomWidthMeters: normalizedTexturePanelLength,
    roomDepthMeters: partHeight,
    floorScale: settings.scale,
    rotationRad: THREE.MathUtils.degToRad(settings.rotationDeg),
    floorPattern: settings.pattern,
    patternOffset: settings.offset,
    jointSizeMm: settings.jointSizeMm,
    jointColor: settings.jointColor,
    maxAnisotropy: gl.capabilities.getMaxAnisotropy(),
    uvMode: "normalized",
    textureResolution: WALL_SURFACE_TEXTURE_RESOLUTION,
  });
  const sourceWallTexture = useSurfaceMaterialSourceTexture({
    material: wallSurfaceMaterial,
    surfaceWidthMeters: normalizedTexturePanelLength,
    surfaceHeightMeters: partHeight,
    scale: settings.scale,
    rotationRad: THREE.MathUtils.degToRad(settings.rotationDeg),
    maxAnisotropy: gl.capabilities.getMaxAnisotropy(),
  });
  const wallTexture = patternedWallTexture ?? sourceWallTexture;
  const wallColor =
    wallTexture
      ? "#ffffff"
      : settings.paintColorHex ??
        getSurfaceMaterialFallbackColor(wallSurfaceMaterial) ??
        baseWallColor;
  const wallColorFillIntensity = resolveWallSurfaceColorFillIntensity({
    hasTexture: Boolean(wallTexture),
    paintColorHex: settings.paintColorHex,
    neutralFillIntensity: WALL_INDIRECT_FILL_INTENSITY,
  });
  const surfaceOffsetZ =
    side *
    (wallThickness / 2 + WALL_SURFACE_THICKNESS_METERS / 2);
  const surfaceRotationY = side === 1 ? 0 : Math.PI;
  const raycastWhenPickable = useCallback(
    (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => {
      const mesh = surfaceMeshRef.current;
      if (!interactive || !pickEnabledRef.current || !mesh) return;
      THREE.Mesh.prototype.raycast.call(mesh, raycaster, intersects);
    },
    [interactive, pickEnabledRef]
  );
  const handlePointerOver = interactive
    ? (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        onHoverTarget(target);
      }
    : undefined;
  const handlePointerOut = interactive
    ? (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        onClearHoverTarget(target);
      }
    : undefined;
  const handleClick = interactive
    ? (event: ThreeEvent<MouseEvent>) => {
        onSelectTarget(target, event);
      }
    : undefined;

  useEffect(() => {
    onMaterialReady(materialKey, materialRef.current);
    return () => onMaterialReady(materialKey, null);
  }, [materialKey, onMaterialReady]);

  useEffect(() => () => surfaceGeometry.dispose(), [surfaceGeometry]);

  useEffect(() => {
    if (!materialRef.current) return;
    materialRef.current.map = wallTexture;
    materialRef.current.color.set(wallColor);
    materialRef.current.needsUpdate = true;
    invalidate();
  }, [invalidate, wallColor, wallTexture]);

  return (
    <group position={[centerOffset, 0, surfaceOffsetZ]} rotation-y={surfaceRotationY}>
      <mesh
        ref={surfaceMeshRef}
        castShadow
        receiveShadow
        visible={renderSurface}
        raycast={raycastWhenPickable}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <primitive object={surfaceGeometry} attach="geometry" />
        <meshStandardMaterial
          ref={materialRef}
          color={wallColor}
          map={wallTexture ?? undefined}
          emissive={wallColorFillIntensity > 0 ? wallColor : "#000000"}
          emissiveIntensity={wallColorFillIntensity}
          roughness={wallSurfaceMaterial ? wallSurfaceMaterial.rendering.roughness : 0.86}
          metalness={wallSurfaceMaterial ? wallSurfaceMaterial.rendering.metalness : 0}
          side={THREE.FrontSide}
          transparent={baseOpacity < 0.999}
          depthTest
          depthWrite={baseOpacity >= 0.999}
          opacity={baseOpacity}
        />
      </mesh>
    </group>
  );
}

function WallSurfaceCutCapMesh({
  partLength,
  partHeight,
  wallThickness,
  baseOpacity,
  renderSurface,
  isActive,
  showStart,
  showEnd,
}: {
  partLength: number;
  partHeight: number;
  wallThickness: number;
  baseOpacity: number;
  renderSurface: boolean;
  isActive: boolean;
  showStart: boolean;
  showEnd: boolean;
}) {
  if (!renderSurface || (!showStart && !showEnd)) {
    return null;
  }

  // Camera-cut ends expose the structural wall core, not the decorative
  // finish applied to either broad face. Letting a neighboring paint swatch
  // color this cap turns its edge into a bright vertical fin at oblique angles.
  const wallColor = isActive ? ACTIVE_WALL_COLOR : INACTIVE_WALL_COLOR;
  const renderCapMaterial = () => (
    <meshStandardMaterial
      color={wallColor}
      emissive={wallColor}
      emissiveIntensity={WALL_INDIRECT_FILL_INTENSITY}
      roughness={0.86}
      side={THREE.DoubleSide}
      transparent={baseOpacity < 0.999}
      depthTest
      depthWrite={baseOpacity >= 0.999}
      opacity={baseOpacity}
    />
  );

  return (
    <>
      {showStart ? (
        <mesh
          position={[-partLength / 2, 0, 0]}
          rotation-y={-Math.PI / 2}
          raycast={() => null}
        >
          <planeGeometry
            args={[
              wallThickness + WALL_SURFACE_THICKNESS_METERS * 2,
              partHeight,
            ]}
          />
          {renderCapMaterial()}
        </mesh>
      ) : null}
      {showEnd ? (
        <mesh
          position={[partLength / 2, 0, 0]}
          rotation-y={Math.PI / 2}
          raycast={() => null}
        >
          <planeGeometry
            args={[
              wallThickness + WALL_SURFACE_THICKNESS_METERS * 2,
              partHeight,
            ]}
          />
          {renderCapMaterial()}
        </mesh>
      ) : null}
    </>
  );
}

export function CutawayWallMesh({
  room,
  rooms,
  segment,
  part,
  wallHeight,
  wallThickness,
  wallOpacity,
  renderBase,
  renderSurfaces,
  selectionPieceKey,
  selectionSettingsFallbackKeys,
  selectionPanelLength,
  selectionPanelCenterOffset,
  surfaceSeamOverlap,
  forceCutaway,
  squareStart,
  squareEnd,
  activeRoomId,
  isActive,
  interactive,
  hoveredTargetKey: _hoveredTargetKey,
  selectedTargetKey,
  onHoverTarget,
  onClearHoverTarget,
  onSelectTarget,
}: {
  room: HousePlanRoom2D;
  rooms: readonly HousePlanRoom2D[];
  segment: WallSegment3D;
  part: WallPart3D;
  wallHeight: number;
  wallThickness: number;
  wallOpacity: number;
  renderBase: boolean;
  renderSurfaces: boolean;
  selectionPieceKey: string | null;
  selectionSettingsFallbackKeys: readonly string[];
  selectionPanelLength: number;
  selectionPanelCenterOffset: number;
  surfaceSeamOverlap?: { startMeters?: number; endMeters?: number };
  forceCutaway: boolean;
  squareStart: boolean;
  squareEnd: boolean;
  activeRoomId: string;
  isActive: boolean;
  interactive: boolean;
  hoveredTargetKey: string | null;
  selectedTargetKey: string | null;
  onHoverTarget: (target: StructureTarget) => void;
  onClearHoverTarget: (target: StructureTarget) => void;
  onSelectTarget: (target: StructureTarget, event: ThreeEvent<MouseEvent | PointerEvent>) => void;
}) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const baseMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const surfaceMaterialRefs = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map());
  const baseOpacity = (isActive ? ACTIVE_WALL_OPACITY : INACTIVE_WALL_OPACITY) * wallOpacity;
  const partHeight = part.height ?? wallHeight;
  const partCenterY = part.centerY ?? wallHeight / 2;
  const faceId = getWallSurfaceFaceId(room, segment);
  const currentRoomTarget: StructureTarget = {
    kind: "wall",
    roomId: room.id,
    id: faceId,
  };
  const surfaces = room.surfaces ?? room.surfaceFinishes;
  const interiorSurfaceSide = getWallInteriorSurfaceSide(segment);
  const sharedWallMatches = getSharedWallMatches(room, rooms, segment, part);
  const isInteriorSharedWall = sharedWallMatches.length > 0;
  const activeRoom = rooms.find((entry) => entry.id === activeRoomId);
  const sharedRoomIds = getSharedWallRoomIds(room, rooms, segment, part);
  const targetKey = getStructureTargetKey(currentRoomTarget) ?? `${room.id}:${faceId}`;
  const getSettingsFallbackKeys = (side: 1 | -1) => [
    ...(selectionPieceKey ? [selectionPieceKey] : []),
    ...selectionSettingsFallbackKeys.flatMap((fallbackKey) => [
      getSelectableWallSurfacePanelId(fallbackKey, side),
      fallbackKey,
    ]),
  ];
  const currentInteriorPanelId = selectionPieceKey
    ? getSelectableWallSurfacePanelId(
        selectionPieceKey,
        interiorSurfaceSide
      )
    : null;
  const surfaceSides = [
    {
      key: `${part.key}:${targetKey}:interior`,
      targetKey,
      target: currentRoomTarget,
      panelId: currentInteriorPanelId,
      settings: getWallPanelSurfaceSettings(
        surfaces,
        faceId,
        currentInteriorPanelId,
        normalizeFloorRotationDeg,
        clampFloorPatternScale,
        getSettingsFallbackKeys(interiorSurfaceSide)
      ),
      side: interiorSurfaceSide,
      selectable: true,
      outlineAsLogicalPanel: true,
    },
    ...sharedWallMatches.flatMap(({ room: sharedRoom, segment: sharedSegment }) => {
          const sharedFaceId = getWallSurfaceFaceId(sharedRoom, sharedSegment);
          const sharedSide = -interiorSurfaceSide as 1 | -1;
          const sharedPanelId = selectionPieceKey
            ? getSelectableWallSurfacePanelId(selectionPieceKey, sharedSide)
            : null;
          const sharedTarget: StructureTarget = {
            kind: "wall",
            roomId: sharedRoom.id,
            id: sharedFaceId,
          };
          const sharedSettings = getWallPanelSurfaceSettings(
            sharedRoom.surfaces ?? sharedRoom.surfaceFinishes,
            sharedFaceId,
            sharedPanelId,
            normalizeFloorRotationDeg,
            clampFloorPatternScale,
            getSettingsFallbackKeys(sharedSide)
          );
          const sharedTargetKey =
            getStructureTargetKey(sharedTarget) ??
            `${sharedRoom.id}:${sharedFaceId}`;
          return [
            {
              key: `${part.key}:${sharedTargetKey}`,
              targetKey: sharedTargetKey,
              target: sharedTarget,
              panelId: sharedPanelId,
              settings: sharedSettings,
              side: sharedSide,
              selectable: true,
              outlineAsLogicalPanel: false,
            },
          ];
        }),
    ...(sharedRoomIds.length === 0
      ? [
          {
            key: `${part.key}:${targetKey}:exterior`,
            targetKey,
            target: currentRoomTarget,
            panelId: selectionPieceKey
              ? getSelectableWallSurfacePanelId(
                  selectionPieceKey,
                  -interiorSurfaceSide as 1 | -1
                )
              : null,
            settings: getWallPanelSurfaceSettings(
              surfaces,
              faceId,
              selectionPieceKey
                ? getSelectableWallSurfacePanelId(
                    selectionPieceKey,
                    -interiorSurfaceSide as 1 | -1
                  )
                : null,
              normalizeFloorRotationDeg,
              clampFloorPatternScale,
              getSettingsFallbackKeys(
                -interiorSurfaceSide as 1 | -1
              )
            ),
            side: -interiorSurfaceSide as 1 | -1,
            selectable: true,
            outlineAsLogicalPanel: false,
          },
        ]
      : []),
  ];
  const isSelectedWallFace = Boolean(
    selectionPieceKey &&
      surfaceSides.some(
        (surface) =>
          surface.selectable &&
          surface.panelId &&
          `${surface.targetKey}:${surface.panelId}` ===
            selectedTargetKey
      )
  );
  const partAxisRange = legacyWallPartAxisRange(segment, part);
  const partTouchesSegmentStart =
    Math.abs(partAxisRange.startOffset + segment.length / 2) <=
    WALL_CUT_ENDPOINT_TOLERANCE_METERS;
  const partTouchesSegmentEnd =
    Math.abs(partAxisRange.endOffset - segment.length / 2) <=
    WALL_CUT_ENDPOINT_TOLERANCE_METERS;
  const handleSurfaceMaterialReady = useCallback(
    (targetKey: string, material: THREE.MeshStandardMaterial | null) => {
      if (material) {
        surfaceMaterialRefs.current.set(targetKey, material);
        return;
      }
      surfaceMaterialRefs.current.delete(targetKey);
    },
    []
  );
  const sharedWallOwnerRoomId = getSharedWallRenderOwnerRoomId(
    room,
    rooms,
    segment,
    part
  );
  const isDuplicateSharedWall = sharedWallOwnerRoomId !== room.id;
  const pickEnabledRef = useRef(!isDuplicateSharedWall && baseOpacity > 0.01);

  useFrame(() => {
    if (isDuplicateSharedWall) {
      pickEnabledRef.current = false;
      return;
    }

    let targetOpacity = baseOpacity;

    const cutawayEligible =
      forceCutaway && !isInteriorSharedWall && !isSelectedWallFace;
    targetOpacity = resolveCutawayWallOpacity({
      cameraX: camera.position.x,
      cameraZ: camera.position.z,
      roomX: room.x,
      roomZ: room.z,
      roomWidth: room.w,
      roomDepth: room.d,
      wall: segment.wall,
      baseOpacity,
      cutawayEligible,
      forceCutaway: cutawayEligible,
      cutawayOpacity: CAMERA_FACING_WALL_CUTAWAY_OPACITY,
      targetX: activeRoom?.x,
      targetZ: activeRoom?.z,
      targetWidth: activeRoom?.w,
      targetDepth: activeRoom?.d,
      wallCenterX: room.x + part.x,
      wallCenterZ: room.z + part.z,
      wallAxis: segment.axis,
      wallLength: part.length,
    });

    const renderState =
      resolveAtomicWallCutawayRenderState(targetOpacity);

    const materials = [baseMaterialRef.current, ...Array.from(surfaceMaterialRefs.current.values())].filter(
      (material): material is THREE.MeshStandardMaterial => Boolean(material)
    );

    materials.forEach((material) => {
      material.opacity = renderState.opacity;
      if (material.transparent !== renderState.transparent) {
        material.transparent = renderState.transparent;
        material.needsUpdate = true;
      }
      material.depthWrite = renderState.depthWrite;
    });

    // Apply the complete material/depth state before exposing the group. This
    // prevents a returning wall from being visible as transparent glass for a
    // frame while the camera crosses the cutaway boundary.
    if (groupRef.current) {
      groupRef.current.visible = renderState.visible;
    }
    pickEnabledRef.current = renderState.visible;
  });

  if (isDuplicateSharedWall) return null;

  return (
    <group
      ref={groupRef}
      position={[part.x, partCenterY, part.z]}
      rotation-y={segment.rotationY}
    >
      {renderBase ? (
        <mesh castShadow raycast={() => null}>
          <boxGeometry args={[part.length, partHeight, wallThickness]} />
          <meshStandardMaterial
            ref={baseMaterialRef}
            color={isActive ? ACTIVE_WALL_COLOR : INACTIVE_WALL_COLOR}
            emissive={isActive ? ACTIVE_WALL_COLOR : INACTIVE_WALL_COLOR}
            emissiveIntensity={WALL_INDIRECT_FILL_INTENSITY}
            roughness={0.86}
            transparent={baseOpacity < 0.999}
            depthWrite={baseOpacity > 0.34}
            opacity={baseOpacity}
          />
        </mesh>
      ) : null}
      {surfaceSides.map((surface) => {
        const surfaceSelectionKey = surface.panelId
          ? `${surface.targetKey}:${surface.panelId}`
          : null;
        const joinedSurface = joinedLegacyWallSurfacePart(
          room,
          segment,
          part,
          surface.side,
          wallThickness,
          { squareStart, squareEnd },
          WALL_SURFACE_CUT_OVERLAP_METERS,
          surfaceSeamOverlap
        );
        return (
          <WallSurfaceSideMesh
            key={surface.key}
            materialKey={surface.key}
            target={{
              ...surface.target,
              pieceKey: surfaceSelectionKey ?? surface.key,
              panelId: surface.panelId ?? undefined,
              surfaceSide: surface.side,
            }}
            settings={surface.settings}
            partLength={joinedSurface.length}
            partHeight={partHeight}
            centerOffset={joinedSurface.centerDelta}
            texturePanelLength={selectionPanelLength}
            texturePanelCenterOffset={selectionPanelCenterOffset}
            side={surface.side}
            wallThickness={wallThickness}
            baseOpacity={baseOpacity}
            baseWallColor={isActive ? ACTIVE_WALL_COLOR : INACTIVE_WALL_COLOR}
            renderSurface={renderSurfaces}
            interactive={interactive && surface.selectable}
            pickEnabledRef={pickEnabledRef}
            onMaterialReady={handleSurfaceMaterialReady}
            onHoverTarget={onHoverTarget}
            onClearHoverTarget={onClearHoverTarget}
            onSelectTarget={onSelectTarget}
          />
        );
      })}
      <WallSurfaceCutCapMesh
        partLength={part.length}
        partHeight={partHeight}
        wallThickness={wallThickness}
        baseOpacity={baseOpacity}
        renderSurface={renderSurfaces}
        isActive={isActive}
        showStart={squareStart && partTouchesSegmentStart}
        showEnd={squareEnd && partTouchesSegmentEnd}
      />
    </group>
  );
}

export function WallSurfacePanelMesh({
  room,
  rooms,
  segment,
  panel,
  wallHeight,
  wallThickness,
  wallOpacity,
  forceCutaway,
  squareStart,
  squareEnd,
  activeRoomId,
  isActive,
  interactive,
  hoveredTargetKey,
  selectedTargetKey,
  onHoverTarget,
  onClearHoverTarget,
  onSelectTarget,
}: {
  room: HousePlanRoom2D;
  rooms: readonly HousePlanRoom2D[];
  segment: WallSegment3D;
  panel: WallSurfacePanelDescriptor;
  wallHeight: number;
  wallThickness: number;
  wallOpacity: number;
  forceCutaway: boolean;
  squareStart: boolean;
  squareEnd: boolean;
  activeRoomId: string;
  isActive: boolean;
  interactive: boolean;
  hoveredTargetKey: string | null;
  selectedTargetKey: string | null;
  onHoverTarget: (target: StructureTarget) => void;
  onClearHoverTarget: (target: StructureTarget) => void;
  onSelectTarget: (
    target: StructureTarget,
    event: ThreeEvent<MouseEvent | PointerEvent>
  ) => void;
}) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const baseOpacity =
    (isActive ? ACTIVE_WALL_OPACITY : INACTIVE_WALL_OPACITY) * wallOpacity;
  const activeRoom = rooms.find((entry) => entry.id === activeRoomId);
  const surfaces = room.surfaces ?? room.surfaceFinishes;
  const target: StructureTarget = {
    kind: "wall",
    roomId: panel.roomId,
    id: panel.faceId,
    pieceKey: `wall:${panel.roomId}:${panel.faceId}:${panel.panelId}`,
    panelId: panel.panelId,
    panelAliases: panel.legacyPanelIds,
    surfaceSide: panel.side,
  };
  const targetKey = getStructureTargetKey(target) ??
    `${panel.roomId}:${panel.faceId}`;
  const selectionKey = `${targetKey}:${panel.panelId}`;
  const isSelected = selectionKey === selectedTargetKey;
  const outlineStyle = getStructureOutlineStyle(
    selectionKey,
    hoveredTargetKey,
    selectedTargetKey
  );
  const joinedSurface = joinedLegacyWallSurfacePart(
    room,
    segment,
    panel.part,
    panel.side,
    wallThickness,
    { squareStart, squareEnd }
  );
  const settings = getWallPanelSurfaceSettings(
    surfaces,
    panel.faceId,
    panel.panelId,
    normalizeFloorRotationDeg,
    clampFloorPatternScale,
    panel.legacyPanelIds
  );
  const hasSharedSupport =
    getSharedWallRoomIds(room, rooms, segment, panel.part).length > 0;
  const pickEnabledRef = useRef(baseOpacity > 0.01);
  const handleMaterialReady = useCallback(
    (_materialKey: string, material: THREE.MeshStandardMaterial | null) => {
      materialRef.current = material;
    },
    []
  );

  useFrame(() => {
    // A cutaway removes the complete physical wall side group. Interior and
    // exposed exterior finish shells must follow the same visibility state;
    // otherwise the 1.5 mm opposite shell remains as a paper-thin wall after
    // the structural core and room-facing panel disappear.
    const cutawayEligible = isWallSurfacePanelCutawayEligible({
      forceCutaway,
      hasSharedSupport,
      isSelected,
    });
    const targetOpacity = resolveCutawayWallOpacity({
      cameraX: camera.position.x,
      cameraZ: camera.position.z,
      roomX: room.x,
      roomZ: room.z,
      roomWidth: room.w,
      roomDepth: room.d,
      wall: segment.wall,
      baseOpacity,
      cutawayEligible,
      forceCutaway: cutawayEligible,
      cutawayOpacity: CAMERA_FACING_WALL_CUTAWAY_OPACITY,
      targetX: activeRoom?.x,
      targetZ: activeRoom?.z,
      targetWidth: activeRoom?.w,
      targetDepth: activeRoom?.d,
      wallCenterX: room.x + panel.part.x,
      wallCenterZ: room.z + panel.part.z,
      wallAxis: segment.axis,
      wallLength: panel.part.length,
    });
    const renderState =
      resolveAtomicWallCutawayRenderState(targetOpacity);
    const material = materialRef.current;
    if (material) {
      material.opacity = renderState.opacity;
      if (material.transparent !== renderState.transparent) {
        material.transparent = renderState.transparent;
        material.needsUpdate = true;
      }
      material.depthWrite = renderState.depthWrite;
    }
    if (groupRef.current) {
      groupRef.current.visible = renderState.visible;
    }
    pickEnabledRef.current = renderState.visible;
  });

  const outlineZ =
    panel.side *
    (wallThickness / 2 + WALL_SURFACE_THICKNESS_METERS + 0.003);
  const outlineBottomY = -wallHeight / 2 + 0.025;
  const outlineTopY = wallHeight / 2 - 0.025;
  const outlineLeftX =
    joinedSurface.centerDelta - joinedSurface.length / 2;
  const outlineRightX =
    joinedSurface.centerDelta + joinedSurface.length / 2;
  const outlinePoints: Array<[number, number, number]> = [
    [outlineLeftX, outlineBottomY, outlineZ],
    [outlineRightX, outlineBottomY, outlineZ],
    [outlineRightX, outlineTopY, outlineZ],
    [outlineLeftX, outlineTopY, outlineZ],
    [outlineLeftX, outlineBottomY, outlineZ],
  ];

  return (
    <group
      ref={groupRef}
      position={[panel.part.x, wallHeight / 2, panel.part.z]}
      rotation-y={segment.rotationY}
    >
      <WallSurfaceSideMesh
        materialKey={panel.panelId}
        target={target}
        settings={settings}
        partLength={joinedSurface.length}
        partHeight={wallHeight}
        centerOffset={joinedSurface.centerDelta}
        texturePanelLength={joinedSurface.length}
        texturePanelCenterOffset={joinedSurface.centerDelta}
        side={panel.side}
        wallThickness={wallThickness}
        baseOpacity={baseOpacity}
        baseWallColor={isActive ? ACTIVE_WALL_COLOR : INACTIVE_WALL_COLOR}
        renderSurface
        interactive={interactive}
        pickEnabledRef={pickEnabledRef}
        onMaterialReady={handleMaterialReady}
        onHoverTarget={onHoverTarget}
        onClearHoverTarget={onClearHoverTarget}
        onSelectTarget={onSelectTarget}
      />
      {outlineStyle ? (
        <Line
          key={`wall-surface-panel-outline:${panel.panelId}`}
          points={outlinePoints}
          color={outlineStyle.color}
          lineWidth={outlineStyle.lineWidth}
          renderOrder={25}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          raycast={() => null}
        />
      ) : null}
    </group>
  );
}

export function OpeningThresholdMesh({
  roomId,
  threshold,
  segment,
  wallThickness,
  sourceOpening,
  sourceRoom,
  floorWorldY,
  interactive,
  hoveredTargetKey,
  selectedTargetKey,
  onHoverTarget,
  onClearHoverTarget,
  onSelectTarget,
  onMoveOpening,
  onOpeningDragStateChange,
}: {
  roomId: string;
  threshold: OpeningThreshold3D;
  segment: WallSegment3D;
  wallThickness: number;
  sourceOpening?: RoomRendererOpening;
  sourceRoom?: HousePlanRoom2D;
  floorWorldY: number;
  interactive: boolean;
  hoveredTargetKey: string | null;
  selectedTargetKey: string | null;
  onHoverTarget: (target: StructureTarget) => void;
  onClearHoverTarget: (target: StructureTarget) => void;
  onSelectTarget: (target: StructureTarget, event: ThreeEvent<MouseEvent | PointerEvent>) => void;
  onMoveOpening?: (openingId: string, offsetMeters: number) => void;
  onOpeningDragStateChange?: (isDragging: boolean) => void;
}) {
  const { camera } = useThree();
  const openingMeshRef = useRef<THREE.Mesh | null>(null);
  const openingHitMeshRef = useRef<THREE.Mesh | null>(null);
  const dragStateRef = useRef<{ pointerId: number; grabDelta: number } | null>(null);
  const dragPointRef = useRef(new THREE.Vector3());
  const openingPickEnabledRef = useRef(true);
  const target: StructureTarget = {
    kind: "opening",
    roomId,
    id: threshold.sourceId,
  };
  const targetKey = getStructureTargetKey(target) ?? "";
  const outlineStyle = getStructureOutlineStyle(targetKey, hoveredTargetKey, selectedTargetKey);
  const thresholdDepth = wallThickness * 1.35;
  const jambHalfWidth = threshold.length / 2;
  const highlightDepth = thresholdDepth + 0.024;
  const highlightThickness = 0.035;
  const jambBaseY = 0.024;
  const jambTopY = Math.max(jambBaseY + 0.2, threshold.height - 0.02);
  const jambHeight = jambTopY - jambBaseY;
  const hitHeight = Math.max(0.75, jambTopY + 0.18);
  const canDragOpening = interactive && Boolean(sourceOpening && sourceRoom && onMoveOpening);
  const raycastOpeningWhenPickable = useCallback(
    (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => {
      const mesh = openingMeshRef.current;
      if (!interactive || !openingPickEnabledRef.current || !mesh) return;
      THREE.Mesh.prototype.raycast.call(mesh, raycaster, intersects);
    },
    [interactive]
  );
  const raycastOpeningHitWhenPickable = useCallback(
    (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => {
      const mesh = openingHitMeshRef.current;
      if (!interactive || !openingPickEnabledRef.current || !mesh) return;
      THREE.Mesh.prototype.raycast.call(mesh, raycaster, intersects);
    },
    [interactive]
  );

  useFrame(() => {
    openingPickEnabledRef.current = camera.position.y >= floorWorldY - 0.02;
  });

  const getPointerOffset = (event: ThreeEvent<PointerEvent>) => {
    if (!sourceOpening || !sourceRoom) return null;
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorWorldY);
    const point = event.ray.intersectPlane(dragPlane, dragPointRef.current);
    if (!point) return null;

    const axisValue =
      sourceOpening.wall === "north" || sourceOpening.wall === "south" ? point.x : point.z;
    const centerAxis =
      sourceOpening.wall === "north" || sourceOpening.wall === "south"
        ? sourceRoom.x
        : sourceRoom.z;

    return axisValue - centerAxis;
  };

  const getDraggedOffset = (event: ThreeEvent<PointerEvent>) => {
    if (!sourceOpening || !sourceRoom) return null;
    const pointerOffset = getPointerOffset(event);
    if (pointerOffset === null) return null;
    const span =
      sourceOpening.wall === "north" || sourceOpening.wall === "south"
        ? sourceRoom.w
        : sourceRoom.d;
    const maxOffset = Math.max(
      0,
      span / 2 - sourceOpening.width / 2 - PLAN_OPENING_EDGE_PADDING_METERS
    );
    const grabDelta = dragStateRef.current?.grabDelta ?? 0;

    return clamp(pointerOffset + grabDelta, -maxOffset, maxOffset);
  };

  const moveOpeningFromPointer = (event: ThreeEvent<PointerEvent>) => {
    if (!sourceOpening || !onMoveOpening) return;
    const offsetMeters = getDraggedOffset(event);
    if (offsetMeters === null) return;
    onMoveOpening(sourceOpening.id, offsetMeters);
  };

  const finishOpeningDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!dragStateRef.current) return;
    stopStructurePointerEvent(event);
    releasePointerCaptureIfSupported(event);
    dragStateRef.current = null;
    onOpeningDragStateChange?.(false);
  };

  return (
    <mesh
      ref={openingMeshRef}
      position={[threshold.x, 0.015, threshold.z]}
      rotation-y={segment.rotationY}
      raycast={raycastOpeningWhenPickable}
      onPointerDown={
        interactive
          ? (event) => {
              stopStructurePointerEvent(event);
              onSelectTarget(target, event);
              if (!canDragOpening) return;
              const pointerOffset = getPointerOffset(event) ?? sourceOpening?.offset ?? 0;
              capturePointerIfSupported(event);
              dragStateRef.current = {
                pointerId: event.pointerId,
                grabDelta: (sourceOpening?.offset ?? 0) - pointerOffset,
              };
              onOpeningDragStateChange?.(true);
            }
          : undefined
      }
      onPointerMove={
        interactive
          ? (event) => {
              const dragState = dragStateRef.current;
              if (!dragState || dragState.pointerId !== event.pointerId) return;
              stopStructurePointerEvent(event);
              moveOpeningFromPointer(event);
            }
          : undefined
      }
      onPointerUp={
        interactive
          ? (event) => {
              finishOpeningDrag(event);
            }
          : undefined
      }
      onPointerCancel={
        interactive
          ? (event) => {
              finishOpeningDrag(event);
            }
          : undefined
      }
      onPointerOver={
        interactive
          ? (event) => {
              event.stopPropagation();
              onHoverTarget(target);
            }
          : undefined
      }
      onPointerOut={
        interactive
          ? (event) => {
              event.stopPropagation();
              onClearHoverTarget(target);
            }
          : undefined
      }
      onClick={
        interactive
          ? (event) => {
              stopStructurePointerEvent(event);
              onSelectTarget(target, event);
            }
          : undefined
      }
    >
      <boxGeometry args={[threshold.length, 0.03, thresholdDepth]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      <mesh
        ref={openingHitMeshRef}
        position={[0, hitHeight / 2, 0]}
        renderOrder={21}
        raycast={raycastOpeningHitWhenPickable}
      >
        <boxGeometry args={[threshold.length + 0.22, hitHeight, thresholdDepth + 0.22]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {outlineStyle ? (
        <>
          <mesh
            position={[0, jambBaseY, 0]}
            raycast={() => null}
            renderOrder={20}
          >
            <boxGeometry args={[threshold.length, highlightThickness, highlightDepth]} />
            <meshBasicMaterial
              color={outlineStyle.color}
              transparent
              opacity={0.74}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh
            position={[-jambHalfWidth, jambBaseY + jambHeight / 2, 0]}
            raycast={() => null}
            renderOrder={20}
          >
            <boxGeometry args={[highlightThickness, jambHeight, highlightDepth]} />
            <meshBasicMaterial
              color={outlineStyle.color}
              transparent
              opacity={0.74}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh
            position={[jambHalfWidth, jambBaseY + jambHeight / 2, 0]}
            raycast={() => null}
            renderOrder={20}
          >
            <boxGeometry args={[highlightThickness, jambHeight, highlightDepth]} />
            <meshBasicMaterial
              color={outlineStyle.color}
              transparent
              opacity={0.74}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </>
      ) : null}
    </mesh>
  );
}
