"use client";

import { memo, useEffect, useMemo } from "react";
import { Line } from "@react-three/drei/core/Line";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { FrontSide, Mesh } from "three";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { CanonicalFloorPlanWallSolid } from "@/lib/floor-plan-render-model";
import { clampFloorPatternScale, normalizeFloorRotationDeg } from "@/lib/floor-materials";
import { getDrawnWallJointMm, getWallFinishDepthMm } from "@/lib/laminate-wall-backing";
import { getRuntimeSurfaceMaterialById } from "@/lib/surface-material-runtime";
import { getWallFaceSurfaceSettings } from "@/lib/surface-settings";
import { resolveWallSurfaceColorFillIntensity } from "@/lib/wall-paint-rendering";
import { useSurfaceMaterialTexture } from "../useSurfaceMaterialTexture";
import { wallFinishShellGeometry, wallSurfaceEdge, wallSurfaceLayout } from "./geometry";
import {
  CANONICAL_ACTIVE_WALL_COLOR,
  CANONICAL_WALL_INDIRECT_FILL_INTENSITY,
  WALL_SURFACE_TEXTURE_RESOLUTION,
  resolveRoomSurfaceAssignments,
  surfaceMaterialFallbackColor,
} from "./surfaceMaterials";

type CanonicalPointerEvent = ThreeEvent<MouseEvent | PointerEvent>;

/** A finish that isn't a laminate is drawn as a 1.5 mm skin, as in drawn rooms (house-plan-3d/wallAndOpeningMeshes.tsx). */
const WALL_FINISH_SKIN_MM = 1.5;
/** The selection outline stands this far in front of the finish, as a drawn room's window outline does (#233). */
const SELECTION_OUTLINE_CLEARANCE_MM = 3;
const noRaycast = () => null;
// R3F 9 skips a prop that becomes undefined, so turning picking back on must pass the default raycast.
const meshRaycast = Mesh.prototype.raycast;

type WallSurfaceProps = {
  solid: CanonicalFloorPlanWallSolid;
  wallSolids: readonly CanonicalFloorPlanWallSolid[]; // the wall's slices, which give its face's corners
  wallId: string;
  floorId: string;
  floorElevationMm: number;
  room: HousePlanRoom2D;
  side: 1 | -1;
  selected: boolean;
  opacity: number;
  geometryHash: string;
  /** False while cut away, so a hidden surface takes no pointer events. */
  interactive: boolean;
  cutAway: boolean;
  onSelectWall?: (wallId: string, roomId: string | null, event: CanonicalPointerEvent) => void;
};

/** The room's finish on the wall, how deep it stands off the face, and how it is coloured and textured on this slice. */
function useCanonicalWallFinish({ solid, wallSolids, wallId, room, side }: WallSurfaceProps) {
  const { gl } = useThree();
  // Wall panels are laid from the floor and from the wall's start (canonical-floor-plan/geometry.ts).
  const layout = useMemo(() => wallSurfaceLayout(solid, side, wallSolids), [side, solid, wallSolids]);
  const settings = getWallFaceSurfaceSettings(
    resolveRoomSurfaceAssignments(room), wallId, normalizeFloorRotationDeg, clampFloorPatternScale
  );
  const material = getRuntimeSurfaceMaterialById(settings.materialId);
  const texture = useSurfaceMaterialTexture({
    material,
    roomWidthMeters: layout.lengthMeters,
    roomDepthMeters: layout.heightMeters,
    bottomAboveFloorMeters: layout.bottomAboveFloorMeters,
    startAlongFaceMeters: layout.startAlongFaceMeters,
    floorScale: settings.scale,
    rotationRad: (settings.rotationDeg * Math.PI) / 180,
    floorPattern: settings.pattern,
    patternOffset: settings.offset,
    jointSizeMm: getDrawnWallJointMm(material, settings.jointSizeMm),
    jointColor: settings.jointColor,
    maxAnisotropy: gl.capabilities.getMaxAnisotropy(),
    uvMode: "normalized",
    textureResolution: WALL_SURFACE_TEXTURE_RESOLUTION,
  });
  const displayedColor = texture
    ? "#ffffff"
    : settings.paintColorHex ?? surfaceMaterialFallbackColor(material) ?? CANONICAL_ACTIVE_WALL_COLOR;
  const displayedColorFillIntensity = resolveWallSurfaceColorFillIntensity({
    hasTexture: Boolean(texture),
    paintColorHex: settings.paintColorHex,
    neutralFillIntensity: CANONICAL_WALL_INDIRECT_FILL_INTENSITY,
  });
  // A plain number, so the geometry's memo depends on the depth, not on the material object (React's compiler).
  const finishDepthMm = getWallFinishDepthMm(material, settings, WALL_FINISH_SKIN_MM);
  return { settings, material, texture, displayedColor, displayedColorFillIntensity, finishDepthMm };
}

/**
 * One room's finish on one slice of an imported plan's wall (the parts beside, below and above its openings).
 *
 * The finish is drawn as the box a drawn room's panel is: a laminate stands off the wall on its board, 10 to 44 mm
 * (lib/laminate-wall-backing.ts), and anything else is a 1.5 mm skin (J, 29 Oct 2026: "Two: drawn rooms, then imported").
 * The room is measured to that face as well (lib/room-wall-finish-depths.ts). The box has its own front, so it is drawn
 * one-sided, with no depth offset against the wall.
 */
export const CanonicalWallSurfaceMesh = memo(function CanonicalWallSurfaceMesh(props: WallSurfaceProps) {
  const { solid, wallId, floorId, floorElevationMm, room, side, selected, opacity, geometryHash, interactive, cutAway } = props;
  const { settings, material, texture, displayedColor, displayedColorFillIntensity, finishDepthMm } = useCanonicalWallFinish(props);
  const geometry = useMemo(() => wallFinishShellGeometry(solid, side, finishDepthMm), [finishDepthMm, side, solid]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const roomOpacity = Math.max(0.05, Math.min(1, Number.isFinite(room.surfaceOpacity?.wall) ? room.surfaceOpacity!.wall! : 1));
  const shownOpacity = opacity * roomOpacity;
  const select = (event: CanonicalPointerEvent) => {
    event.stopPropagation();
    props.onSelectWall?.(wallId, room.id, event);
  };
  return (
    <mesh
      position={[0, floorElevationMm / 1000, 0]}
      renderOrder={12}
      visible={!cutAway}
      raycast={interactive ? meshRaycast : noRaycast}
      userData={{
        testId: "canonical-wall-surface-3d",
        canonicalFloorId: floorId,
        canonicalWallId: wallId,
        canonicalRoomId: room.id,
        canonicalRoomSide: side,
        canonicalSurfaceFaceId: wallId,
        canonicalMaterialId: settings.materialId,
        canonicalFinishDepthMm: finishDepthMm,
        canonicalGeometryHash: geometryHash,
      }}
      onClick={interactive ? select : undefined}
    >
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial
        color={displayedColor}
        map={texture ?? undefined}
        emissive={displayedColorFillIntensity > 0 ? displayedColor : "#000000"}
        emissiveIntensity={displayedColorFillIntensity}
        roughness={material?.rendering.roughness ?? 0.86}
        metalness={material?.rendering.metalness ?? 0}
        side={FrontSide}
        transparent={shownOpacity < 0.999}
        opacity={shownOpacity}
        depthWrite={shownOpacity > 0.34}
      />
      {selected && <CanonicalWallSelectionOutline solid={solid} side={side} finishDepthMm={finishDepthMm} />}
    </mesh>
  );
});

/** The selected wall's outline, in front of its finish. */
function CanonicalWallSelectionOutline({ solid, side, finishDepthMm }: {
  solid: CanonicalFloorPlanWallSolid;
  side: 1 | -1;
  finishDepthMm: number;
}) {
  const edge = useMemo(
    () => wallSurfaceEdge(solid, side, finishDepthMm + SELECTION_OUTLINE_CLEARANCE_MM),
    [finishDepthMm, side, solid]
  );
  const bottom = solid.bottomMm / 1000 + 0.02;
  const top = solid.topMm / 1000 - 0.02;
  return (
    <Line
      points={[
        [edge.start.x, bottom, edge.start.z],
        [edge.end.x, bottom, edge.end.z],
        [edge.end.x, top, edge.end.z],
        [edge.start.x, top, edge.start.z],
        [edge.start.x, bottom, edge.start.z],
      ]}
      color="#f97316"
      lineWidth={2.2}
      raycast={() => null}
    />
  );
}
