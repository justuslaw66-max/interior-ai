"use client";

import { getDrawnWallJointMm } from "@/lib/laminate-wall-backing";
import * as THREE from "three";
import type { SurfaceMaterialRenderInfo } from "@/lib/surface-material-runtime";
import type { getWallPanelSurfaceSettings } from "@/lib/surface-settings";
import { WALL_SURFACE_TEXTURE_RESOLUTION } from "../canonical-floor-plan/surfaceMaterials";
import { useSurfaceMaterialTexture } from "../useSurfaceMaterialTexture";
import { useSurfaceMaterialSourceTexture } from "./materials";

/**
 * The picture on one part of a wall finish: the finish laid on a canvas the length of its wall panel, or, until that is
 * painted, the material's own picture. `partBottomMeters` is how high the part's bottom edge is above the floor and
 * `partStartMeters` how far along the wall face its picture starts; wall panels are laid from the floor up and from the
 * face's start, so the parts beside, below and above a door or window share their joints (surfaceTileRows.ts).
 */
export function useWallSurfaceTexture({
  material,
  settings,
  panelLengthMeters,
  partHeightMeters,
  partBottomMeters,
  partStartMeters,
  maxAnisotropy,
}: {
  material: SurfaceMaterialRenderInfo | null;
  settings: ReturnType<typeof getWallPanelSurfaceSettings>;
  panelLengthMeters: number;
  partHeightMeters: number;
  partBottomMeters: number;
  partStartMeters?: number | null;
  maxAnisotropy: number;
}): THREE.Texture | null {
  const patternedWallTexture = useSurfaceMaterialTexture({
    material,
    roomWidthMeters: panelLengthMeters,
    roomDepthMeters: partHeightMeters,
    bottomAboveFloorMeters: partBottomMeters,
    startAlongFaceMeters: partStartMeters,
    floorScale: settings.scale,
    rotationRad: THREE.MathUtils.degToRad(settings.rotationDeg),
    floorPattern: settings.pattern,
    patternOffset: settings.offset,
    jointSizeMm: getDrawnWallJointMm(material, settings.jointSizeMm),
    jointColor: settings.jointColor,
    maxAnisotropy,
    uvMode: "normalized",
    textureResolution: WALL_SURFACE_TEXTURE_RESOLUTION,
  });
  const sourceWallTexture = useSurfaceMaterialSourceTexture({
    material,
    surfaceWidthMeters: panelLengthMeters,
    surfaceHeightMeters: partHeightMeters,
    scale: settings.scale,
    rotationRad: THREE.MathUtils.degToRad(settings.rotationDeg),
    maxAnisotropy,
  });
  return patternedWallTexture ?? sourceWallTexture;
}
