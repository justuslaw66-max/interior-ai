"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import {
  getSurfaceMaterialTextureSource,
  shouldUseSingleSurfaceSwatch,
  type SurfaceMaterialRenderInfo,
} from "@/lib/surface-material-runtime";
import {
  normalizeFloorJointColor,
  normalizeFloorJointSizeMm,
  normalizeFloorPattern,
  normalizeFloorPatternOffset,
} from "@/lib/surface-settings";
import type { RoomFloorPattern } from "@/lib/room-types";
import {
  getSurfacePhysicalSourceKey,
  seededSurfaceRandom as seededRandom,
} from "@/lib/surface-material-physical-sampling";
import { paintChevronSurface } from "./surfaceChevronPainter";
import { paintHerringboneSurface } from "./surfaceHerringbonePainter";
import { configureSurfaceTexture, type SurfaceTextureUvMode } from "./surfaceTextureSetup";
import { getSurfaceTileGrid } from "./surfaceTileRows";
import {
  createSurfaceTilePainter,
  getImageSize,
  loadSurfaceTextureInputs,
  resolveSurfaceDetailStrength,
  type LoadedSurfacePhysicalSource,
} from "./surfaceTilePainter";

const surfaceTextureSourceCache = new Map<string, Promise<THREE.Texture | null>>();
const DEFAULT_MAX_SURFACE_TEXTURE_SIZE = 2048;
const DEFAULT_MIN_SURFACE_TEXTURE_SIZE = 384;
const DEFAULT_TARGET_PIXELS_PER_METER = 260;
const SURFACE_TEXTURE_RENDER_VERSION = 11;

type SourceRect = { x: number; y: number; width: number; height: number };
type SurfaceTextureResolution = {
  maxSize?: number;
  minSize?: number;
  pixelsPerMeter?: number;
};

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

function clampFinite(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getSurfaceTileSizeMeters(material: SurfaceMaterialRenderInfo) {
  const specs = material.physical_specs;
  const textureRepeat = material.texture_assets.texture_repeat_size_cm;
  const widthMm = specs?.tile_width_mm ?? specs?.plank_width_mm ?? null;
  const lengthMm = specs?.tile_length_mm ?? specs?.plank_length_mm ?? null;

  if (widthMm && lengthMm) {
    return {
      width: Math.max(0.05, widthMm / 1000),
      height: Math.max(0.05, lengthMm / 1000),
    };
  }

  if (textureRepeat?.width && textureRepeat?.height) {
    return {
      width: Math.max(0.05, textureRepeat.width / 100),
      height: Math.max(0.05, textureRepeat.height / 100),
    };
  }

  return { width: 1, height: 1 };
}

function getCanvasSizeForSurface(
  widthMeters: number,
  heightMeters: number,
  resolution: SurfaceTextureResolution = {}
) {
  const width = Math.max(0.1, widthMeters);
  const height = Math.max(0.1, heightMeters);
  const longestSide = Math.max(width, height);
  const maxSize = Math.max(256, resolution.maxSize ?? DEFAULT_MAX_SURFACE_TEXTURE_SIZE);
  const minSize = Math.max(128, Math.min(maxSize, resolution.minSize ?? DEFAULT_MIN_SURFACE_TEXTURE_SIZE));
  const targetPixelsPerMeter = Math.max(
    64,
    resolution.pixelsPerMeter ?? DEFAULT_TARGET_PIXELS_PER_METER
  );
  const pixelsPerMeter = Math.min(
    targetPixelsPerMeter,
    maxSize / longestSide
  );

  return {
    width: Math.round(clampFinite(width * pixelsPerMeter, minSize, maxSize)),
    height: Math.round(clampFinite(height * pixelsPerMeter, minSize, maxSize)),
  };
}

export function getSurfacePatternRowOffsetForTest({
  pattern,
  row,
  tileWidthPx,
}: {
  pattern: RoomFloorPattern;
  row: number;
  tileWidthPx: number;
}) {
  if (pattern === "straight" || pattern === "grid" || pattern === "checker" || pattern === "vertical_brick") {
    return 0;
  }
  if (pattern === "brick") return row % 2 === 0 ? 0 : tileWidthPx / 2;
  if (pattern === "random_stagger") {
    const rowOffsets = [0, 0.42, 0.18, 0.68];
    const normalizedRow = ((row % rowOffsets.length) + rowOffsets.length) % rowOffsets.length;
    return tileWidthPx * rowOffsets[normalizedRow];
  }
  return 0;
}

export function getSurfacePatternColumnOffsetForTest({
  pattern,
  column,
  tileHeightPx,
}: {
  pattern: RoomFloorPattern;
  column: number;
  tileHeightPx: number;
}) {
  if (pattern === "vertical_brick") return column % 2 === 0 ? 0 : tileHeightPx / 2;
  return 0;
}

export function shouldRotateTileSourceQuarterTurnForTest({
  supplier,
  tileWidthPx,
  tileHeightPx,
}: {
  supplier: string | null | undefined;
  tileWidthPx: number;
  tileHeightPx: number;
}) {
  const tileAspect = Math.max(tileWidthPx, tileHeightPx) / Math.max(1, Math.min(tileWidthPx, tileHeightPx));
  return supplier === "gardenia_orchidea" && tileWidthPx > tileHeightPx && tileAspect >= 1.35;
}

export function shouldUseContinuousPatternSourceForTest({
  supplier,
  materialId,
  productName,
  hasPhysicalFaces = false,
}: {
  supplier: string | null | undefined;
  materialId: string | null | undefined;
  productName: string | null | undefined;
  /** Whole-tile faces go to the physical tile painter instead: turned to the tile, at real size, varied per tile. */
  hasPhysicalFaces?: boolean;
}) {
  if (supplier !== "gardenia_orchidea" || hasPhysicalFaces) return false;
  const normalizedText = `${materialId ?? ""} ${productName ?? ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[._-]+/g, " ");
  return (
    /\bgioia\b/.test(normalizedText) ||
    /\b(octagon|network|tricot|chevron|combo|mesh|sticks|majorelle|ombrelle|palma|papilio|rossignol|primavera|martinica|confet|crocini|pillole|rattan|degrade|dec|plis|pliss|plisse|flower|art)\b/.test(
      normalizedText
    ) ||
    /\bmos\b/.test(normalizedText) ||
    /\b3d\b/.test(normalizedText)
  );
}

export function getContinuousPatternRepeatSizeForTest({
  tileWidthPx,
  tileHeightPx,
  materialId,
  productName,
  sourceWidthPx,
  sourceHeightPx,
}: {
  tileWidthPx: number;
  tileHeightPx: number;
  materialId?: string | null | undefined;
  productName?: string | null | undefined;
  sourceWidthPx?: number;
  sourceHeightPx?: number;
}) {
  const safeTileWidth = Math.max(1, tileWidthPx);
  const safeTileHeight = Math.max(1, tileHeightPx);

  if (isGardeniaMosConfet({ materialId, productName }) && sourceWidthPx && sourceHeightPx) {
    const sourceRect = getContinuousPatternSourceRectForTest({
      materialId,
      productName,
      sourceWidthPx,
      sourceHeightPx,
    });
    return {
      width: safeTileHeight * (sourceRect.width / Math.max(1, sourceRect.height)),
      height: safeTileHeight,
    };
  }

  return { width: safeTileWidth, height: safeTileHeight };
}

export function getContinuousPatternSourceRectForTest({
  materialId,
  productName,
  sourceWidthPx,
  sourceHeightPx,
}: {
  materialId?: string | null | undefined;
  productName?: string | null | undefined;
  sourceWidthPx: number;
  sourceHeightPx: number;
}): SourceRect {
  if (isGardeniaMosConfet({ materialId, productName })) {
    return {
      x: 0,
      y: 0,
      width: Math.max(1, Math.round(sourceWidthPx * (289 / 300))),
      height: Math.max(1, sourceHeightPx),
    };
  }

  return {
    x: 0,
    y: 0,
    width: Math.max(1, sourceWidthPx),
    height: Math.max(1, sourceHeightPx),
  };
}

function isGardeniaMosConfet({
  materialId,
  productName,
}: {
  materialId?: string | null | undefined;
  productName?: string | null | undefined;
}) {
  const normalizedText = `${materialId ?? ""} ${productName ?? ""}`.toLowerCase().replace(/[._-]+/g, " ");
  return /\bmos\s+confet/.test(normalizedText);
}

export function getSurfaceJointSizePxForTest({
  jointSizeMm,
  surfaceWidthMeters,
  canvasWidthPx,
}: {
  jointSizeMm: number;
  surfaceWidthMeters: number;
  canvasWidthPx: number;
}) {
  const pixelsPerMeter = canvasWidthPx / Math.max(0.1, surfaceWidthMeters);
  return clampFinite((Math.max(0, jointSizeMm) / 1000) * pixelsPerMeter, 0, Number.POSITIVE_INFINITY);
}

function drawImageCroppedToTile({
  context,
  image,
  x,
  y,
  width,
  height,
  seed,
  rotateSourceQuarterTurn = false,
  allowQuarterTurnVariation = false,
  detailStrength = 1,
}: {
  context: CanvasRenderingContext2D;
  image: CanvasImageSource;
  x: number;
  y: number;
  width: number;
  height: number;
  seed: number;
  rotateSourceQuarterTurn?: boolean;
  allowQuarterTurnVariation?: boolean;
  detailStrength?: number;
}) {
  const imageSize = getImageSize(image);
  const imageWidth = imageSize.width;
  const imageHeight = imageSize.height;
  const drawWidth = rotateSourceQuarterTurn ? height : width;
  const drawHeight = rotateSourceQuarterTurn ? width : height;
  const targetAspect = Math.max(0.05, drawWidth / Math.max(1, drawHeight));
  const cropScale = 0.58 + seededRandom(seed + 3) * 0.38;
  const safeInsetX = imageWidth * 0.04;
  const safeInsetY = imageHeight * 0.04;
  const safeWidth = Math.max(1, imageWidth - safeInsetX * 2);
  const safeHeight = Math.max(1, imageHeight - safeInsetY * 2);
  const safeAspect = safeWidth / safeHeight;
  let sourceWidth = imageWidth;
  let sourceHeight = imageHeight;

  if (safeAspect > targetAspect) {
    sourceHeight = safeHeight * cropScale;
    sourceWidth = Math.min(safeWidth, sourceHeight * targetAspect);
  } else {
    sourceWidth = safeWidth * cropScale;
    sourceHeight = Math.min(safeHeight, sourceWidth / targetAspect);
  }

  const sourceX = safeInsetX + seededRandom(seed + 11) * Math.max(0, safeWidth - sourceWidth);
  const sourceY = safeInsetY + seededRandom(seed + 23) * Math.max(0, safeHeight - sourceHeight);
  const flipX = seededRandom(seed + 31) > 0.5;
  const flipY = seededRandom(seed + 37) > 0.72;
  const rotateHalfTurn = seededRandom(seed + 41) > 0.72;
  const variationQuarterTurns = allowQuarterTurnVariation
    ? Math.floor(seededRandom(seed + 47) * 4)
    : 0;

  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.translate(x + width / 2, y + height / 2);
  if (rotateHalfTurn) context.rotate(Math.PI);
  if (rotateSourceQuarterTurn) context.rotate(Math.PI / 2);
  if (variationQuarterTurns) context.rotate(variationQuarterTurns * (Math.PI / 2));
  context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = detailStrength > 1.5 ? "medium" : "high";
  context.filter = `contrast(${(1.08 + detailStrength * 0.04).toFixed(3)}) saturate(1.04)`;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    -drawWidth / 2,
    -drawHeight / 2,
    drawWidth,
    drawHeight
  );
  context.filter = "none";

  const tint = seededRandom(seed + 53) - 0.5;
  context.globalAlpha = Math.abs(tint) * 0.14;
  context.fillStyle = tint > 0 ? "#ffffff" : "#000000";
  context.fillRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  context.restore();
}

function drawImageFullSourceToRect({
  context,
  image,
  sourceRect,
  x,
  y,
  width,
  height,
}: {
  context: CanvasRenderingContext2D;
  image: CanvasImageSource;
  sourceRect: SourceRect;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  context.drawImage(
    image,
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
    x,
    y,
    width,
    height
  );
}

function createContinuousSourcePattern({
  context,
  image,
  sourceRect,
  repeatWidthPx,
  repeatHeightPx,
}: {
  context: CanvasRenderingContext2D;
  image: CanvasImageSource;
  sourceRect: SourceRect;
  repeatWidthPx: number;
  repeatHeightPx: number;
}) {
  if (typeof document === "undefined") return null;
  const repeatWidth = Math.max(8, Math.round(repeatWidthPx));
  const repeatHeight = Math.max(8, Math.round(repeatHeightPx));
  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = repeatWidth;
  patternCanvas.height = repeatHeight;
  const patternContext = patternCanvas.getContext("2d");
  if (!patternContext) return null;

  patternContext.imageSmoothingEnabled = true;
  patternContext.imageSmoothingQuality = "high";
  drawImageFullSourceToRect({
    context: patternContext,
    image,
    sourceRect,
    x: 0,
    y: 0,
    width: repeatWidth,
    height: repeatHeight,
  });

  return context.createPattern(patternCanvas, "repeat");
}

function parseRgbColor(color: string): [number, number, number] {
  const normalizedColor = color.trim();
  const hexMatch = normalizedColor.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return [
        Number.parseInt(hex[0] + hex[0], 16),
        Number.parseInt(hex[1] + hex[1], 16),
        Number.parseInt(hex[2] + hex[2], 16),
      ];
    }
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }
  return [142, 142, 142];
}

function enhanceGeneratedStoneTexture(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
  strength = 1
) {
  if (strength <= 0) return;
  let imageData: ImageData;
  try {
    imageData = context.getImageData(0, 0, width, height);
  } catch {
    return;
  }

  const source = imageData.data;
  const output = new Uint8ClampedArray(source);
  const amount = 0.5 * strength;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const left = index - 4;
      const right = index + 4;
      const up = index - width * 4;
      const down = index + width * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const blurred =
          (source[left + channel] +
            source[right + channel] +
            source[up + channel] +
            source[down + channel]) /
          4;
        output[index + channel] = clampFinite(
          source[index + channel] + (source[index + channel] - blurred) * amount,
          0,
          255
        );
      }
    }
  }

  const grainAlpha = 10 * strength;
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 900));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const noise = (seededRandom(seed + x * 17 + y * 131) - 0.5) * grainAlpha;
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        output[index + channel] = clampFinite(output[index + channel] + noise, 0, 255);
      }
    }
  }

  imageData.data.set(output);
  context.putImageData(imageData, 0, 0);
}

function createPatternedSurfaceTexture({
  sourceTexture,
  physicalSources,
  material,
  surfaceWidthMeters,
  surfaceHeightMeters,
  bottomAboveFloorMeters,
  startAlongFaceMeters,
  floorScale,
  pattern,
  jointSizeMm,
  jointColor,
  resolution,
}: {
  sourceTexture: THREE.Texture;
  physicalSources: LoadedSurfacePhysicalSource[] | null;
  material: SurfaceMaterialRenderInfo;
  surfaceWidthMeters: number;
  surfaceHeightMeters: number;
  bottomAboveFloorMeters?: number | null;
  startAlongFaceMeters?: number | null;
  floorScale: number;
  pattern: RoomFloorPattern;
  jointSizeMm: number;
  jointColor: string;
  resolution?: SurfaceTextureResolution;
}): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const image = sourceTexture.image as CanvasImageSource | undefined;
  if (!image) return null;

  const canvas = document.createElement("canvas");
  const surfaceWidth = Math.max(0.1, surfaceWidthMeters);
  const surfaceHeight = Math.max(0.1, surfaceHeightMeters);
  const canvasSize = getCanvasSizeForSurface(surfaceWidth, surfaceHeight, resolution);
  canvas.width = canvasSize.width;
  canvas.height = canvasSize.height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const normalizedPattern = normalizeFloorPattern(pattern);
  const tileSize = getSurfaceTileSizeMeters(material);
  const scale = clampFinite(floorScale, 0.1, 5);
  const tileWidthPx = Math.max(8, (tileSize.width * scale / surfaceWidth) * canvas.width);
  const tileHeightPx = Math.max(8, (tileSize.height * scale / surfaceHeight) * canvas.height);
  const jointSizePx = getSurfaceJointSizePxForTest({ jointSizeMm, surfaceWidthMeters: surfaceWidth, canvasWidthPx: canvas.width });
  const seedBase = hashString(material.surface_material.material_id);
  const rotateSourceQuarterTurn = shouldRotateTileSourceQuarterTurnForTest({
    supplier: material.surface_material.supplier,
    tileWidthPx,
    tileHeightPx,
  });
  const tileAspectRatio = Math.max(tileWidthPx, tileHeightPx) / Math.max(1, Math.min(tileWidthPx, tileHeightPx));
  const allowQuarterTurnVariation = tileAspectRatio < 1.08;
  const useContinuousPatternSource = shouldUseContinuousPatternSourceForTest({
    supplier: material.surface_material.supplier, hasPhysicalFaces: Boolean(physicalSources),
    materialId: material.surface_material.material_id,
    productName: material.surface_material.product_name,
  });
  const imageSize = getImageSize(image);
  const sourceUpscaleRatio = Math.max(
    tileWidthPx / Math.max(1, imageSize.width),
    tileHeightPx / Math.max(1, imageSize.height)
  );
  const detailStrength = resolveSurfaceDetailStrength(physicalSources, sourceUpscaleRatio);
  const continuousPatternSourceRect = useContinuousPatternSource
    ? getContinuousPatternSourceRectForTest({
        materialId: material.surface_material.material_id,
        productName: material.surface_material.product_name,
        sourceWidthPx: imageSize.width,
        sourceHeightPx: imageSize.height,
      })
    : null;
  const continuousPatternRepeatSize = useContinuousPatternSource
    ? getContinuousPatternRepeatSizeForTest({
        tileWidthPx,
        tileHeightPx,
        materialId: material.surface_material.material_id,
        productName: material.surface_material.product_name,
        sourceWidthPx: imageSize.width,
        sourceHeightPx: imageSize.height,
      })
    : null;
  const continuousPattern = continuousPatternRepeatSize && continuousPatternSourceRect
    ? createContinuousSourcePattern({
        context,
        image,
        sourceRect: continuousPatternSourceRect,
        repeatWidthPx: continuousPatternRepeatSize.width,
        repeatHeightPx: continuousPatternRepeatSize.height,
      })
    : null;

  context.fillStyle = jointColor;
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Herringbone and chevron are painted pixel by pixel, one face per plank or piece.
  if (normalizedPattern === "herringbone" || normalizedPattern === "chevron") {
    const pixelPattern = { context, width: canvas.width, height: canvas.height, image, physicalSources, tileWidthPx, tileHeightPx,
      jointSizePx, jointRgb: parseRgbColor(jointColor), seedBase };
    const painted = normalizedPattern === "herringbone"
      ? paintHerringboneSurface({ ...pixelPattern, tileWidthMm: tileSize.width * 1000 })
      : paintChevronSurface({ ...pixelPattern, tileSizeMm: { width: tileSize.width * 1000, height: tileSize.height * 1000 },
        endOffsetMm: material.physical_specs.chevron_end_offset_mm });
    if (!painted) return null;
    enhanceGeneratedStoneTexture(context, canvas.width, canvas.height, seedBase, detailStrength * 0.65);
    return new THREE.CanvasTexture(canvas);
  }

  const grid = getSurfaceTileGrid({ material, canvasHeightPx: canvas.height, surfaceHeightMeters: surfaceHeight, tileHeightPx, bottomAboveFloorMeters,
    canvasWidthPx: canvas.width, surfaceWidthMeters: surfaceWidth, tileWidthPx, startAlongFaceMeters });
  const paintTile = createSurfaceTilePainter({
    context,
    physicalSources,
    tileSizeMeters: tileSize,
    paintLegacyTile: (tile) =>
      drawImageCroppedToTile({ context, image, ...tile, rotateSourceQuarterTurn, allowQuarterTurnVariation, detailStrength }),
  });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  for (let row = grid.rows.first; row < grid.rows.end; row += 1) {
    const y = grid.rows.top(row);
    const rowOffset = getSurfacePatternRowOffsetForTest({
      pattern: normalizedPattern,
      row,
      tileWidthPx,
    });
    for (let col = grid.cols.first; col < grid.cols.end; col += 1) {
      const x = grid.cols.left(col, rowOffset);
      const columnOffset = getSurfacePatternColumnOffsetForTest({
        pattern: normalizedPattern,
        column: col,
        tileHeightPx,
      });
      const inset = jointSizePx / 2;
      const drawX = x + inset;
      const drawY = y + columnOffset + inset;
      const drawWidth = Math.max(1, tileWidthPx - jointSizePx);
      const drawHeight = Math.max(1, tileHeightPx - jointSizePx);

      if (continuousPattern) {
        context.save();
        context.fillStyle = continuousPattern;
        context.fillRect(drawX, drawY, drawWidth, drawHeight);
        context.restore();
      } else {
        const seed = seedBase + row * 101 + col * 313;
        paintTile({ row, col, x: drawX, y: drawY, width: drawWidth, height: drawHeight, seed });
      }

      if (normalizedPattern === "checker" && (row + col) % 2 !== 0) {
        context.save();
        context.globalAlpha = 0.16;
        context.fillStyle = "#ffffff";
        context.fillRect(drawX, drawY, drawWidth, drawHeight);
        context.restore();
      }
    }
  }

  enhanceGeneratedStoneTexture(context, canvas.width, canvas.height, seedBase, detailStrength);
  return new THREE.CanvasTexture(canvas);
}

export { createPatternedSurfaceTexture as createPatternedSurfaceTextureForTest };

export function useSurfaceMaterialTexture({
  material,
  roomWidthMeters,
  roomDepthMeters,
  bottomAboveFloorMeters = null,
  startAlongFaceMeters = null,
  floorScale,
  rotationRad,
  floorPattern,
  patternOffset,
  jointSizeMm,
  jointColor,
  maxAnisotropy,
  uvMode = "world",
  textureResolution,
}: {
  material: SurfaceMaterialRenderInfo | null;
  roomWidthMeters: number;
  roomDepthMeters: number;
  /** A wall finish's bottom edge above the floor, and its left edge along the face: wall panels are laid from the floor up
   * and from the face's start (surfaceTileRows.ts). */
  bottomAboveFloorMeters?: number | null;
  startAlongFaceMeters?: number | null;
  floorScale: number;
  rotationRad: number;
  floorPattern?: RoomFloorPattern;
  patternOffset?: { x: number; y: number };
  jointSizeMm?: number;
  jointColor?: string;
  maxAnisotropy: number;
  uvMode?: SurfaceTextureUvMode;
  textureResolution?: SurfaceTextureResolution;
}): THREE.Texture | null {
  const source = useMemo(() => getSurfaceMaterialTextureSource(material), [material]);
  const normalizedPattern = normalizeFloorPattern(floorPattern);
  const normalizedOffset = normalizeFloorPatternOffset(patternOffset);
  const normalizedJointSizeMm = normalizeFloorJointSizeMm(jointSizeMm);
  const normalizedJointColor = normalizeFloorJointColor(jointColor);
  const textureMaxSize = textureResolution?.maxSize;
  const textureMinSize = textureResolution?.minSize;
  const texturePixelsPerMeter = textureResolution?.pixelsPerMeter;
  const materialSpecs = material?.physical_specs;
  const materialRepeatSize = material?.texture_assets.texture_repeat_size_cm;
  const textureKey = source
    ? [
        material?.surface_material.material_id,
        source.url,
        source.kind,
        SURFACE_TEXTURE_RENDER_VERSION,
        materialSpecs?.tile_width_mm,
        materialSpecs?.tile_length_mm,
        materialSpecs?.plank_width_mm,
        materialSpecs?.plank_length_mm,
        materialRepeatSize?.width,
        materialRepeatSize?.height,
        getSurfacePhysicalSourceKey(material?.texture_assets),
        roomWidthMeters,
        roomDepthMeters,
        bottomAboveFloorMeters,
        startAlongFaceMeters,
        floorScale,
        rotationRad,
        normalizedPattern,
        normalizedOffset.x,
        normalizedOffset.y,
        normalizedJointSizeMm,
        normalizedJointColor,
        maxAnisotropy,
        uvMode,
        textureMaxSize,
        textureMinSize,
        texturePixelsPerMeter,
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

    const inputs = loadSurfaceTextureInputs(material, source.url, loadSurfaceTextureSource);
    void inputs.then(({ sourceTexture, physicalSources }) => {
      if (cancelled || !sourceTexture) return;

      const singleSwatch = shouldUseSingleSurfaceSwatch(material, source.kind);
      const patternedTexture = singleSwatch
        ? null
        : createPatternedSurfaceTexture({
            sourceTexture,
            physicalSources,
            material,
            surfaceWidthMeters: roomWidthMeters,
            surfaceHeightMeters: roomDepthMeters,
            bottomAboveFloorMeters,
            startAlongFaceMeters,
            floorScale,
            pattern: normalizedPattern,
            jointSizeMm: normalizedJointSizeMm,
            jointColor: normalizedJointColor,
            resolution: {
              maxSize: textureMaxSize,
              minSize: textureMinSize,
              pixelsPerMeter: texturePixelsPerMeter,
            },
      });
      const nextTexture = patternedTexture ?? sourceTexture.clone();
      configureSurfaceTexture(nextTexture, {
        uvMode,
        painted: Boolean(patternedTexture),
        widthMeters: roomWidthMeters,
        heightMeters: roomDepthMeters,
        maxAnisotropy,
        offset: { x: normalizedOffset.x, y: normalizedOffset.y },
        rotationRad,
      });

      ownedTexture = nextTexture;
      setTextureState({ key: textureKey, texture: nextTexture });
    });

    return () => {
      cancelled = true;
      ownedTexture?.dispose();
    };
  }, [
    bottomAboveFloorMeters,
    floorScale,
    material,
    maxAnisotropy,
    normalizedJointColor,
    normalizedJointSizeMm,
    normalizedOffset.x,
    normalizedOffset.y,
    normalizedPattern,
    roomDepthMeters,
    roomWidthMeters,
    rotationRad,
    source,
    startAlongFaceMeters,
    textureKey,
    textureMaxSize,
    textureMinSize,
    texturePixelsPerMeter,
    uvMode,
  ]);

  return textureState?.key === textureKey ? textureState.texture : null;
}
