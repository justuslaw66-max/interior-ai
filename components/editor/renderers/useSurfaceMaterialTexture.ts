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

const surfaceTextureSourceCache = new Map<string, Promise<THREE.Texture | null>>();
const DEFAULT_MAX_SURFACE_TEXTURE_SIZE = 2048;
const DEFAULT_MIN_SURFACE_TEXTURE_SIZE = 384;
const DEFAULT_TARGET_PIXELS_PER_METER = 260;
const SURFACE_TEXTURE_RENDER_VERSION = 11;

type SurfaceTextureUvMode = "world" | "normalized";
type ImageSize = { width: number; height: number };
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

function seededRandom(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function positiveModulo(value: number, modulo: number) {
  return ((value % modulo) + modulo) % modulo;
}

function getHerringbonePlankVariationSeed({
  seedBase,
  originXUnit,
  originYUnit,
  orientation,
}: {
  seedBase: number;
  originXUnit: number;
  originYUnit: number;
  orientation: "horizontal" | "vertical";
}) {
  return (
    seedBase +
    Math.imul(Math.round(originXUnit), 73856093) +
    Math.imul(Math.round(originYUnit), 19349663) +
    (orientation === "vertical" ? 83492791 : 0)
  ) >>> 0;
}

function getImageSize(image: CanvasImageSource): ImageSize {
  return {
    width: Math.max(
      1,
      Number(
        (image as { naturalWidth?: number; width?: number }).naturalWidth ??
          (image as { width?: number }).width ??
          1
      )
    ),
    height: Math.max(
      1,
      Number(
        (image as { naturalHeight?: number; height?: number }).naturalHeight ??
          (image as { height?: number }).height ??
          1
      )
    ),
  };
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

export function getHerringbonePlankSizeForTest({
  tileWidthPx,
  tileHeightPx,
}: {
  tileWidthPx: number;
  tileHeightPx: number;
}) {
  const shorterSide = Math.max(8, Math.min(tileWidthPx, tileHeightPx));
  const longerSide = Math.max(shorterSide, Math.max(tileWidthPx, tileHeightPx));
  const isNearSquare = longerSide / shorterSide < 1.35;
  const width = isNearSquare ? shorterSide / 2 : shorterSide;
  const length = isNearSquare ? longerSide : Math.max(longerSide, width * 1.8);

  return {
    width: Math.max(8, width),
    length: Math.max(16, length),
  };
}

export function getHerringboneBasisVectorsForTest({
  plankWidthPx,
  plankLengthPx,
}: {
  plankWidthPx: number;
  plankLengthPx: number;
}) {
  return {
    x: { x: plankWidthPx, y: -plankLengthPx },
    y: { x: plankWidthPx, y: plankLengthPx },
  };
}

export function getHerringboneTileLocalForTest({
  xPx,
  yPx,
  plankWidthPx,
  plankLengthPx,
}: {
  xPx: number;
  yPx: number;
  plankWidthPx: number;
  plankLengthPx: number;
}) {
  const safePlankWidth = Math.max(1, plankWidthPx);
  const aspectRatio = Math.max(1, plankLengthPx / safePlankWidth);
  const unitX = xPx / safePlankWidth;
  const unitY = yPx / safePlankWidth;
  let localX = positiveModulo(unitX - Math.floor(unitY), aspectRatio * 2);
  let localY = positiveModulo(unitY, 1);
  let orientation: "horizontal" | "vertical" = "horizontal";

  if (localX >= aspectRatio) {
    const wrappedX = localX;
    const wrappedY = localY;
    localY = positiveModulo(wrappedX, 1);
    localX = 2 * aspectRatio - Math.ceil(wrappedX) + wrappedY;
    orientation = "vertical";
  }

  return {
    localX: localX * safePlankWidth,
    localY: localY * safePlankWidth,
    orientation,
    aspectRatio,
  };
}

export function getHerringbonePlankVariationSeedForTest({
  xPx,
  yPx,
  plankWidthPx,
  plankLengthPx,
  seedBase = 0,
}: {
  xPx: number;
  yPx: number;
  plankWidthPx: number;
  plankLengthPx: number;
  seedBase?: number;
}) {
  const safePlankWidth = Math.max(1, plankWidthPx);
  const aspectRatio = Math.max(1, plankLengthPx / safePlankWidth);
  const unitX = xPx / safePlankWidth;
  const unitY = yPx / safePlankWidth;
  let localXUnit = positiveModulo(unitX - Math.floor(unitY), aspectRatio * 2);
  let localYUnit = positiveModulo(unitY, 1);
  let orientation: "horizontal" | "vertical" = "horizontal";

  if (localXUnit >= aspectRatio) {
    const wrappedX = localXUnit;
    const wrappedY = localYUnit;
    localYUnit = positiveModulo(wrappedX, 1);
    localXUnit = 2 * aspectRatio - Math.ceil(wrappedX) + wrappedY;
    orientation = "vertical";
  }

  return getHerringbonePlankVariationSeed({
    seedBase,
    originXUnit: orientation === "horizontal" ? unitX - localXUnit : unitX - localYUnit,
    originYUnit: orientation === "horizontal" ? unitY - localYUnit : unitY - localXUnit,
    orientation,
  });
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
}: {
  supplier: string | null | undefined;
  materialId: string | null | undefined;
  productName: string | null | undefined;
}) {
  if (supplier !== "gardenia_orchidea") return false;
  const materialText = `${materialId ?? ""} ${productName ?? ""}`.toLowerCase();
  const normalizedText = materialText
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._-]+/g, " ");
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

function getImageDataForSource(image: CanvasImageSource): ImageData | null {
  if (typeof document === "undefined") return null;
  const imageSize = getImageSize(image);
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = imageSize.width;
  sourceCanvas.height = imageSize.height;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) return null;

  sourceContext.drawImage(image, 0, 0, imageSize.width, imageSize.height);

  try {
    return sourceContext.getImageData(0, 0, imageSize.width, imageSize.height);
  } catch {
    return null;
  }
}

function enhanceGeneratedStoneTexture(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
  strength = 1
) {
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

type HerringbonePlankTextureVariation = {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  flipWidth: boolean;
  flipLength: boolean;
  tint: number;
};

function getHerringbonePlankTextureVariation({
  seed,
  sourceWidth,
  sourceHeight,
  targetAspect,
}: {
  seed: number;
  sourceWidth: number;
  sourceHeight: number;
  targetAspect: number;
}): HerringbonePlankTextureVariation {
  const cropScale = 0.72 + seededRandom(seed + 3) * 0.22;
  const safeInsetX = sourceWidth * 0.04;
  const safeInsetY = sourceHeight * 0.04;
  const safeWidth = Math.max(1, sourceWidth - safeInsetX * 2);
  const safeHeight = Math.max(1, sourceHeight - safeInsetY * 2);
  const safeAspect = safeWidth / safeHeight;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;

  if (safeAspect > targetAspect) {
    cropHeight = safeHeight * cropScale;
    cropWidth = Math.min(safeWidth, cropHeight * targetAspect);
  } else {
    cropWidth = safeWidth * cropScale;
    cropHeight = Math.min(safeHeight, cropWidth / targetAspect);
  }

  return {
    sourceX: safeInsetX + seededRandom(seed + 11) * Math.max(0, safeWidth - cropWidth),
    sourceY: safeInsetY + seededRandom(seed + 23) * Math.max(0, safeHeight - cropHeight),
    sourceWidth: Math.max(1, cropWidth),
    sourceHeight: Math.max(1, cropHeight),
    flipWidth: seededRandom(seed + 31) > 0.5,
    flipLength: seededRandom(seed + 41) > 0.72,
    tint: seededRandom(seed + 53) - 0.5,
  };
}

function createPatternedSurfaceTexture({
  sourceTexture,
  material,
  surfaceWidthMeters,
  surfaceHeightMeters,
  floorScale,
  pattern,
  jointSizeMm,
  jointColor,
  resolution,
}: {
  sourceTexture: THREE.Texture;
  material: SurfaceMaterialRenderInfo;
  surfaceWidthMeters: number;
  surfaceHeightMeters: number;
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
  const jointSizePx = getSurfaceJointSizePxForTest({
    jointSizeMm,
    surfaceWidthMeters: surfaceWidth,
    canvasWidthPx: canvas.width,
  });
  const seedBase = hashString(material.surface_material.material_id);
  const rotateSourceQuarterTurn = shouldRotateTileSourceQuarterTurnForTest({
    supplier: material.surface_material.supplier,
    tileWidthPx,
    tileHeightPx,
  });
  const tileAspectRatio = Math.max(tileWidthPx, tileHeightPx) / Math.max(1, Math.min(tileWidthPx, tileHeightPx));
  const allowQuarterTurnVariation = tileAspectRatio < 1.08;
  const useContinuousPatternSource = shouldUseContinuousPatternSourceForTest({
    supplier: material.surface_material.supplier,
    materialId: material.surface_material.material_id,
    productName: material.surface_material.product_name,
  });
  const imageSize = getImageSize(image);
  const sourceUpscaleRatio = Math.max(
    tileWidthPx / Math.max(1, imageSize.width),
    tileHeightPx / Math.max(1, imageSize.height)
  );
  const detailStrength = clampFinite(0.85 + Math.max(0, sourceUpscaleRatio - 1) * 0.45, 0.85, 2.6);
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

  if (normalizedPattern === "herringbone") {
    const plankSize = getHerringbonePlankSizeForTest({ tileWidthPx, tileHeightPx });
    const plankLength = plankSize.length;
    const plankWidth = plankSize.width;
    const sourceImageData = getImageDataForSource(image);
    if (!sourceImageData) return null;

    const aspectRatio = Math.max(1, plankLength / Math.max(1, plankWidth));
    const jointInset = Math.min(Math.max(0, jointSizePx / 2), Math.max(0, plankWidth / 2 - 0.25));
    const jointRgb = parseRgbColor(jointColor);
    const outputImageData = context.createImageData(canvas.width, canvas.height);
    const outputData = outputImageData.data;
    const sourceData = sourceImageData.data;
    const sourceWidth = sourceImageData.width;
    const sourceHeight = sourceImageData.height;
    const textureVariationBySeed = new Map<number, HerringbonePlankTextureVariation>();
    const sourceTargetAspect = Math.max(0.05, Math.min(1, plankWidth / Math.max(1, plankLength)));

    for (let pixelY = 0; pixelY < canvas.height; pixelY += 1) {
      const unitY = pixelY / plankWidth;
      const rowIndex = Math.floor(unitY);
      const baseLocalY = positiveModulo(unitY, 1);

      for (let pixelX = 0; pixelX < canvas.width; pixelX += 1) {
        const unitX = pixelX / plankWidth;
        let localXUnit = positiveModulo(unitX - rowIndex, aspectRatio * 2);
        let localYUnit = baseLocalY;
        let orientation: "horizontal" | "vertical" = "horizontal";

        if (localXUnit >= aspectRatio) {
          const wrappedX = localXUnit;
          const wrappedY = localYUnit;
          localYUnit = positiveModulo(wrappedX, 1);
          localXUnit = 2 * aspectRatio - Math.ceil(wrappedX) + wrappedY;
          orientation = "vertical";
        }

        const localX = localXUnit * plankWidth;
        const localY = localYUnit * plankWidth;
        const outputIndex = (pixelY * canvas.width + pixelX) * 4;
        const inJoint =
          jointInset > 0 &&
          (localX < jointInset ||
            localX > plankLength - jointInset ||
            localY < jointInset ||
            localY > plankWidth - jointInset);

        if (inJoint) {
          outputData[outputIndex] = jointRgb[0];
          outputData[outputIndex + 1] = jointRgb[1];
          outputData[outputIndex + 2] = jointRgb[2];
          outputData[outputIndex + 3] = 255;
          continue;
        }

        const variationSeed = getHerringbonePlankVariationSeed({
          seedBase,
          originXUnit: orientation === "horizontal" ? unitX - localXUnit : unitX - localYUnit,
          originYUnit: orientation === "horizontal" ? unitY - localYUnit : unitY - localXUnit,
          orientation,
        });
        let textureVariation = textureVariationBySeed.get(variationSeed);
        if (!textureVariation) {
          textureVariation = getHerringbonePlankTextureVariation({
            seed: variationSeed,
            sourceWidth,
            sourceHeight,
            targetAspect: sourceTargetAspect,
          });
          textureVariationBySeed.set(variationSeed, textureVariation);
        }

        let sourceWidthRatio = localY / Math.max(1, plankWidth);
        let sourceLengthRatio = localX / Math.max(1, plankLength);
        if (textureVariation.flipWidth) sourceWidthRatio = 1 - sourceWidthRatio;
        if (textureVariation.flipLength) sourceLengthRatio = 1 - sourceLengthRatio;

        const sampleX = Math.min(
          sourceWidth - 1,
          Math.max(
            0,
            Math.floor(textureVariation.sourceX + sourceWidthRatio * Math.max(0, textureVariation.sourceWidth - 1))
          )
        );
        const sampleY = Math.min(
          sourceHeight - 1,
          Math.max(
            0,
            Math.floor(textureVariation.sourceY + sourceLengthRatio * Math.max(0, textureVariation.sourceHeight - 1))
          )
        );
        const sourceIndex = (sampleY * sourceWidth + sampleX) * 4;
        const tintAlpha = Math.abs(textureVariation.tint) * 0.08;
        const tintTarget = textureVariation.tint > 0 ? 255 : 0;
        outputData[outputIndex] = sourceData[sourceIndex] + (tintTarget - sourceData[sourceIndex]) * tintAlpha;
        outputData[outputIndex + 1] =
          sourceData[sourceIndex + 1] + (tintTarget - sourceData[sourceIndex + 1]) * tintAlpha;
        outputData[outputIndex + 2] =
          sourceData[sourceIndex + 2] + (tintTarget - sourceData[sourceIndex + 2]) * tintAlpha;
        outputData[outputIndex + 3] = sourceData[sourceIndex + 3] || 255;
      }
    }

    context.putImageData(outputImageData, 0, 0);
    enhanceGeneratedStoneTexture(context, canvas.width, canvas.height, seedBase, detailStrength * 0.65);
    return new THREE.CanvasTexture(canvas);
  }

  const rowCount = Math.ceil(canvas.height / tileHeightPx) + 3;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  for (let row = -2; row < rowCount; row += 1) {
    const y = row * tileHeightPx;
    const rowOffset = getSurfacePatternRowOffsetForTest({
      pattern: normalizedPattern,
      row,
      tileWidthPx,
    });
    const startX = -tileWidthPx - rowOffset;
    const colCount = Math.ceil((canvas.width + tileWidthPx * 3) / tileWidthPx);

    for (let col = 0; col < colCount; col += 1) {
      const x = startX + col * tileWidthPx;
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
        drawImageCroppedToTile({
          context,
          image,
          x: drawX,
          y: drawY,
          width: drawWidth,
          height: drawHeight,
          seed,
          rotateSourceQuarterTurn,
          allowQuarterTurnVariation,
          detailStrength,
        });
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

export function useSurfaceMaterialTexture({
  material,
  roomWidthMeters,
  roomDepthMeters,
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
        roomWidthMeters,
        roomDepthMeters,
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

    void loadSurfaceTextureSource(source.url).then((sourceTexture) => {
      if (cancelled || !sourceTexture) return;

      const singleSwatch = shouldUseSingleSurfaceSwatch(material, source.kind);
      const patternedTexture = singleSwatch
        ? null
        : createPatternedSurfaceTexture({
            sourceTexture,
            material,
            surfaceWidthMeters: roomWidthMeters,
            surfaceHeightMeters: roomDepthMeters,
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
      const isGeneratedPatternTexture = Boolean(patternedTexture);
      const textureRepeat = {
        repeatX: uvMode === "normalized" ? 1 : 1 / Math.max(0.1, roomWidthMeters),
        repeatY: uvMode === "normalized" ? 1 : 1 / Math.max(0.1, roomDepthMeters),
        offsetX:
          uvMode === "normalized"
            ? 0
            : isGeneratedPatternTexture
              ? 0.5 / Math.max(0.1, roomWidthMeters)
              : 0.5,
        offsetY:
          uvMode === "normalized"
            ? 0
            : isGeneratedPatternTexture
              ? 0.5 / Math.max(0.1, roomDepthMeters)
              : 0.5,
      };

      nextTexture.wrapS = THREE.RepeatWrapping;
      nextTexture.wrapT = THREE.RepeatWrapping;
      nextTexture.colorSpace = THREE.SRGBColorSpace;
      nextTexture.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
      nextTexture.center.set(0.5, 0.5);
      nextTexture.offset.set(
        textureRepeat.offsetX + normalizedOffset.x,
        textureRepeat.offsetY + normalizedOffset.y
      );
      nextTexture.rotation = rotationRad;
      nextTexture.repeat.set(textureRepeat.repeatX, textureRepeat.repeatY);
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
    normalizedJointColor,
    normalizedJointSizeMm,
    normalizedOffset.x,
    normalizedOffset.y,
    normalizedPattern,
    roomDepthMeters,
    roomWidthMeters,
    rotationRad,
    source,
    textureKey,
    textureMaxSize,
    textureMinSize,
    texturePixelsPerMeter,
    uvMode,
  ]);

  return textureState?.key === textureKey ? textureState.texture : null;
}
