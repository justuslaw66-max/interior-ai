"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { FloorMaterial } from "@/lib/floor-materials";
import type { RoomFloorPattern } from "@/lib/room-types";
import {
  getSurfaceMaterialTextureSource,
  type SurfaceMaterialRenderInfo,
} from "@/lib/surface-material-runtime";

export function createFloorMaterialTexture(
  material: FloorMaterial,
  maxAnisotropy: number,
  floorPattern: RoomFloorPattern = "straight",
  jointSizeMm = 2,
  jointColor = material.lineColor
): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = material.renderColor;
  context.fillRect(0, 0, size, size);

  if (material.pattern === "wood_plank") {
    context.save();
    context.globalAlpha = 0.22;
    context.strokeStyle = material.lineColor;
    context.lineWidth = 1;

    for (let y = 24; y < size; y += 34) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(size, y);
      context.stroke();
    }

    context.globalAlpha = 0.16;
    for (let row = 0; row < 8; row += 1) {
      const y = row * 34;
      const offset = row % 2 === 0 ? 48 : 112;
      for (let x = offset; x < size; x += 96) {
        context.beginPath();
        context.moveTo(x, y + 2);
        context.lineTo(x, y + 31);
        context.stroke();
      }
    }

    context.globalAlpha = 0.08;
    context.strokeStyle = material.accentColor;
    for (let y = 12; y < size; y += 18) {
      context.beginPath();
      context.moveTo(0, y);
      context.bezierCurveTo(72, y + 5, 148, y - 5, size, y + 3);
      context.stroke();
    }
    context.restore();
  }

  if (material.pattern === "tile_grid" || floorPattern === "grid" || floorPattern === "checker") {
    context.save();
    context.globalAlpha = 0.24;
    context.strokeStyle = jointColor;
    context.lineWidth = Math.max(1, Math.min(6, jointSizeMm * 0.8));

    for (let position = 0; position <= size; position += 64) {
      context.beginPath();
      context.moveTo(position, 0);
      context.lineTo(position, size);
      context.stroke();
      context.beginPath();
      context.moveTo(0, position);
      context.lineTo(size, position);
      context.stroke();
    }

    context.globalAlpha = 0.08;
    context.fillStyle = material.accentColor;
    context.fillRect(0, 0, size, size);
    context.restore();
  }

  if (material.pattern === "soft_fleck") {
    context.save();
    context.globalAlpha = 0.14;
    context.strokeStyle = material.lineColor;
    context.lineWidth = 1;

    for (let index = 0; index < 76; index += 1) {
      const x = (index * 47) % size;
      const y = (index * 83) % size;
      const length = 3 + (index % 5);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + length, y + (index % 2 === 0 ? 1 : -1));
      context.stroke();
    }
    context.restore();
  }

  if (floorPattern === "brick") {
    context.save();
    context.globalAlpha = 0.24;
    context.strokeStyle = jointColor;
    context.lineWidth = Math.max(1, Math.min(6, jointSizeMm * 0.8));
    for (let y = 0; y <= size; y += 42) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(size, y);
      context.stroke();
      const offset = Math.floor(y / 42) % 2 === 0 ? 0 : 48;
      for (let x = offset; x <= size; x += 96) {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, y + 42);
        context.stroke();
      }
    }
    context.restore();
  }

  if (floorPattern === "random_stagger") {
    context.save();
    context.globalAlpha = 0.24;
    context.strokeStyle = jointColor;
    context.lineWidth = Math.max(1, Math.min(6, jointSizeMm * 0.8));
    const rowHeight = 42;
    const tileWidth = 96;
    const rowOffsets = [0, 40, 17, 65];
    for (let y = 0; y <= size; y += rowHeight) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(size, y);
      context.stroke();
      const rowIndex = Math.floor(y / rowHeight);
      const offset = rowOffsets[rowIndex % rowOffsets.length];
      for (let x = -tileWidth + offset; x <= size; x += tileWidth) {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, y + rowHeight);
        context.stroke();
      }
    }
    context.restore();
  }

  if (floorPattern === "vertical_brick") {
    context.save();
    context.globalAlpha = 0.24;
    context.strokeStyle = jointColor;
    context.lineWidth = Math.max(1, Math.min(6, jointSizeMm * 0.8));
    for (let x = 0; x <= size; x += 42) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, size);
      context.stroke();
      const offset = Math.floor(x / 42) % 2 === 0 ? 0 : 48;
      for (let y = offset; y <= size; y += 96) {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + 42, y);
        context.stroke();
      }
    }
    context.restore();
  }

  if (floorPattern === "herringbone") {
    context.save();
    const materialRgb = /^#([0-9a-f]{6})$/i.test(material.renderColor)
      ? [
          Number.parseInt(material.renderColor.slice(1, 3), 16),
          Number.parseInt(material.renderColor.slice(3, 5), 16),
          Number.parseInt(material.renderColor.slice(5, 7), 16),
        ]
      : [185, 174, 154];
    const jointRgb = /^#([0-9a-f]{6})$/i.test(jointColor)
      ? [
          Number.parseInt(jointColor.slice(1, 3), 16),
          Number.parseInt(jointColor.slice(3, 5), 16),
          Number.parseInt(jointColor.slice(5, 7), 16),
        ]
      : [142, 142, 142];
    const plankLength = 96;
    const plankWidth = 16;
    const aspectRatio = plankLength / plankWidth;
    const jointInset = Math.max(0.7, Math.min(2.5, jointSizeMm * 0.45));
    const imageData = context.createImageData(size, size);
    const data = imageData.data;
    for (let pixelY = 0; pixelY < size; pixelY += 1) {
      const unitY = pixelY / plankWidth;
      const rowIndex = Math.floor(unitY);
      const baseLocalY = ((unitY % 1) + 1) % 1;

      for (let pixelX = 0; pixelX < size; pixelX += 1) {
        const unitX = pixelX / plankWidth;
        let localXUnit = ((unitX - rowIndex) % (aspectRatio * 2) + aspectRatio * 2) % (aspectRatio * 2);
        let localYUnit = baseLocalY;

        if (localXUnit >= aspectRatio) {
          const wrappedX = localXUnit;
          const wrappedY = localYUnit;
          localYUnit = ((wrappedX % 1) + 1) % 1;
          localXUnit = 2 * aspectRatio - Math.ceil(wrappedX) + wrappedY;
        }

        const localX = localXUnit * plankWidth;
        const localY = localYUnit * plankWidth;
        const inJoint =
          localX < jointInset ||
          localX > plankLength - jointInset ||
          localY < jointInset ||
          localY > plankWidth - jointInset;
        const outputIndex = (pixelY * size + pixelX) * 4;
        const color = inJoint ? jointRgb : materialRgb;
        data[outputIndex] = color[0];
        data[outputIndex + 1] = color[1];
        data[outputIndex + 2] = color[2];
        data[outputIndex + 3] = 255;
      }
    }
    context.putImageData(imageData, 0, 0);
    context.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  texture.needsUpdate = true;
  return texture;
}

function getSurfaceMaterialRepeatSizeMeters(material: SurfaceMaterialRenderInfo | null) {
  const specs = material?.physical_specs;
  const repeat = material?.texture_assets.texture_repeat_size_cm;
  const widthMm = specs?.tile_width_mm ?? specs?.plank_width_mm ?? null;
  const heightMm = specs?.tile_length_mm ?? specs?.plank_length_mm ?? null;
  if (widthMm && heightMm) {
    return {
      width: Math.max(0.05, widthMm / 1000),
      height: Math.max(0.05, heightMm / 1000),
    };
  }
  if (repeat?.width && repeat?.height) {
    return {
      width: Math.max(0.05, repeat.width / 100),
      height: Math.max(0.05, repeat.height / 100),
    };
  }
  return { width: 1, height: 1 };
}

export function getSurfaceMaterialFallbackColor(material: SurfaceMaterialRenderInfo | null): string | null {
  const colorFamily = material?.classification?.color_family;
  if (colorFamily === "grey") return "#b7b7b2";
  if (colorFamily === "charcoal") return "#5b5d5a";
  if (colorFamily === "brown" || colorFamily === "walnut") return "#8b755c";
  if (colorFamily === "cream" || colorFamily === "beige") return "#d8ccbb";
  if (colorFamily === "white") return "#ece9e1";
  return material ? "#c9c2b4" : null;
}

export function useSurfaceMaterialSourceTexture({
  material,
  surfaceWidthMeters,
  surfaceHeightMeters,
  scale,
  rotationRad,
  maxAnisotropy,
}: {
  material: SurfaceMaterialRenderInfo | null;
  surfaceWidthMeters: number;
  surfaceHeightMeters: number;
  scale: number;
  rotationRad: number;
  maxAnisotropy: number;
}) {
  const source = useMemo(() => getSurfaceMaterialTextureSource(material), [material]);
  const textureKey = source
    ? [
        material?.surface_material.material_id,
        source.url,
        surfaceWidthMeters,
        surfaceHeightMeters,
        scale,
        rotationRad,
        maxAnisotropy,
      ].join(":")
    : null;
  const [textureState, setTextureState] = useState<{ key: string; texture: THREE.Texture } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadedTexture: THREE.Texture | null = null;
    if (!material || !source || !textureKey) {
      return () => {
        cancelled = true;
      };
    }

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      source.url,
      (texture) => {
        if (cancelled) {
          texture.dispose();
          return;
        }
        const repeatSize = getSurfaceMaterialRepeatSizeMeters(material);
        const safeScale = Math.max(0.1, Math.min(5, Number.isFinite(scale) ? scale : 1));
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
        texture.center.set(0.5, 0.5);
        texture.rotation = rotationRad;
        texture.repeat.set(
          Math.max(1, surfaceWidthMeters / Math.max(0.05, repeatSize.width * safeScale)),
          Math.max(1, surfaceHeightMeters / Math.max(0.05, repeatSize.height * safeScale))
        );
        texture.needsUpdate = true;
        loadedTexture = texture;
        setTextureState({ key: textureKey, texture });
      },
      undefined,
      () => {
        if (!cancelled) setTextureState((current) => (current?.key === textureKey ? null : current));
      }
    );

    return () => {
      cancelled = true;
      loadedTexture?.dispose();
    };
  }, [
    material,
    maxAnisotropy,
    rotationRad,
    scale,
    source,
    surfaceHeightMeters,
    surfaceWidthMeters,
    textureKey,
  ]);

  return textureState?.key === textureKey ? textureState.texture : null;
}

