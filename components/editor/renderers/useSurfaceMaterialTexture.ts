"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import {
  getSurfaceMaterialTextureSource,
  shouldUseSingleSurfaceSwatch,
  type SurfaceMaterialRenderInfo,
} from "@/lib/surface-material-runtime";

const surfaceTextureSourceCache = new Map<string, Promise<THREE.Texture | null>>();

function loadSurfaceTextureSource(url: string): Promise<THREE.Texture | null> {
  const cached = surfaceTextureSourceCache.get(url);
  if (cached) return cached;

  const texturePromise = new Promise<THREE.Texture | null>((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      url,
      (texture) => resolve(texture),
      undefined,
      () => resolve(null)
    );
  });

  surfaceTextureSourceCache.set(url, texturePromise);
  return texturePromise;
}

function getRoomDimensionCm(valueMeters: number | undefined): number {
  return Math.max(1, Number.isFinite(valueMeters) ? Number(valueMeters) * 100 : 100);
}

export function useSurfaceMaterialTexture({
  material,
  roomWidthMeters,
  roomDepthMeters,
  floorScale,
  rotationRad,
  maxAnisotropy,
}: {
  material: SurfaceMaterialRenderInfo | null;
  roomWidthMeters: number;
  roomDepthMeters: number;
  floorScale: number;
  rotationRad: number;
  maxAnisotropy: number;
}): THREE.Texture | null {
  const source = useMemo(() => getSurfaceMaterialTextureSource(material), [material]);
  const textureKey = source
    ? [
        source.url,
        source.kind,
        roomWidthMeters,
        roomDepthMeters,
        floorScale,
        rotationRad,
        maxAnisotropy,
      ].join(":")
    : null;
  const [textureState, setTextureState] = useState<{
    key: string;
    texture: THREE.Texture;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let ownedTexture: THREE.Texture | null = null;

    if (!material || !source || !textureKey) {
      return () => {
        cancelled = true;
      };
    }

    void loadSurfaceTextureSource(source.url).then((sourceTexture) => {
      if (cancelled || !sourceTexture) return;

      const nextTexture = sourceTexture.clone();
      const repeatSize = material.texture_assets.texture_repeat_size_cm;
      const repeatWidthCm = repeatSize?.width ?? 100;
      const repeatHeightCm = repeatSize?.height ?? 100;
      const singleSwatch = shouldUseSingleSurfaceSwatch(material, source.kind);
      const scale = Math.max(0.1, floorScale);

      nextTexture.wrapS = THREE.RepeatWrapping;
      nextTexture.wrapT = THREE.RepeatWrapping;
      nextTexture.colorSpace = THREE.SRGBColorSpace;
      nextTexture.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
      nextTexture.center.set(0.5, 0.5);
      nextTexture.rotation = rotationRad;
      nextTexture.repeat.set(
        singleSwatch ? 1 : getRoomDimensionCm(roomWidthMeters) / (repeatWidthCm * scale),
        singleSwatch ? 1 : getRoomDimensionCm(roomDepthMeters) / (repeatHeightCm * scale)
      );
      nextTexture.needsUpdate = true;

      ownedTexture = nextTexture;
      setTextureState({ key: textureKey, texture: nextTexture });
    });

    return () => {
      cancelled = true;
      ownedTexture?.dispose();
    };
  }, [
    floorScale,
    material,
    maxAnisotropy,
    roomDepthMeters,
    roomWidthMeters,
    rotationRad,
    source,
    textureKey,
  ]);

  return textureState?.key === textureKey ? textureState.texture : null;
}
