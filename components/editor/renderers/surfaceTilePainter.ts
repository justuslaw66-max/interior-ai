import type * as THREE from "three";
import {
  getSurfacePhysicalImageSources,
  pickSurfaceFaceIndex,
  resolveSurfacePhysicalTileSample,
  seededSurfaceRandom,
  type SurfacePhysicalImageSource,
  type SurfacePhysicalTileSample,
} from "@/lib/surface-material-physical-sampling";
import type { SurfaceMaterialRenderInfo } from "@/lib/surface-material-runtime";

export type ImageSize = { width: number; height: number };

export type LoadedSurfacePhysicalSource = SurfacePhysicalImageSource & {
  image: CanvasImageSource;
};

/** One tile to paint, in canvas pixels. `row` and `col` identify it in the laid grid. */
export type SurfaceTileRect = {
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  seed: number;
};

export type SurfaceTilePainter = (tile: SurfaceTileRect) => void;

export type HerringbonePlankTextureVariation = {
  data: Uint8ClampedArray;
  dataWidth: number;
  dataHeight: number;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  flipWidth: boolean;
  flipLength: boolean;
  tint: number;
};

export function getImageSize(image: CanvasImageSource): ImageSize {
  const sized = image as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  return {
    width: Math.max(1, Number(sized.naturalWidth ?? sized.width ?? 1)),
    height: Math.max(1, Number(sized.naturalHeight ?? sized.height ?? 1)),
  };
}

export function getImageDataForSource(image: CanvasImageSource, scale = 1): ImageData | null {
  if (typeof document === "undefined") return null;
  const imageSize = getImageSize(image);
  const width = Math.max(1, Math.round(imageSize.width * scale));
  const height = Math.max(1, Math.round(imageSize.height * scale));
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) return null;

  sourceContext.imageSmoothingEnabled = true;
  sourceContext.imageSmoothingQuality = "high";
  sourceContext.drawImage(image, 0, 0, width, height);

  try {
    return sourceContext.getImageData(0, 0, width, height);
  } catch {
    return null;
  }
}

/**
 * Loads the material's base image together with every image that has a
 * declared physical size. `physicalSources` is null unless all of them load,
 * because a partial set would repeat faces and hide the failure.
 */
export async function loadSurfaceTextureInputs(
  material: SurfaceMaterialRenderInfo,
  sourceUrl: string,
  loadTexture: (url: string) => Promise<THREE.Texture | null>
): Promise<{
  sourceTexture: THREE.Texture | null;
  physicalSources: LoadedSurfacePhysicalSource[] | null;
}> {
  const physical = getSurfacePhysicalImageSources(material.texture_assets);
  const [sourceTexture, ...faceTextures] = await Promise.all([
    loadTexture(sourceUrl),
    ...physical.map((source) => loadTexture(source.url)),
  ]);
  const loaded = physical.flatMap((source, index) => {
    const image = faceTextures[index]?.image as CanvasImageSource | undefined;
    return image ? [{ ...source, image }] : [];
  });
  const complete = loaded.length > 0 && loaded.length === physical.length;
  return { sourceTexture, physicalSources: complete ? loaded : null };
}

/** Sharpening and added grain compensate for stretched sources; physical-scale sources get neither. */
export function resolveSurfaceDetailStrength(
  physicalSources: readonly LoadedSurfacePhysicalSource[] | null,
  sourceUpscaleRatio: number
): number {
  if (physicalSources) return 0;
  const strength = 0.85 + Math.max(0, sourceUpscaleRatio - 1) * 0.45;
  return Number.isFinite(strength) ? Math.max(0.85, Math.min(2.6, strength)) : 0.85;
}

const mirroredSourceCache = new WeakMap<object, HTMLCanvasElement>();

/** A 2x2 mirrored copy of the image, which repeats without visible seams. */
function getMirroredSource(image: CanvasImageSource): HTMLCanvasElement | null {
  const cached = mirroredSourceCache.get(image as object);
  if (cached) return cached;
  if (typeof document === "undefined") return null;
  const size = getImageSize(image);
  const canvas = document.createElement("canvas");
  canvas.width = size.width * 2;
  canvas.height = size.height * 2;
  const context = canvas.getContext("2d");
  if (!context) return null;

  for (const [flipX, flipY] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    context.setTransform(flipX, 0, 0, flipY, flipX < 0 ? canvas.width : 0, flipY < 0 ? canvas.height : 0);
    context.drawImage(image, 0, 0, size.width, size.height);
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  mirroredSourceCache.set(image as object, canvas);
  return canvas;
}

/** The image is smaller than the tile: repeat it mirrored, still at its true scale. */
function fillUndersizedTile({
  context,
  image,
  sample,
  seed,
  drawWidth,
  drawHeight,
}: {
  context: CanvasRenderingContext2D;
  image: CanvasImageSource;
  sample: SurfacePhysicalTileSample;
  seed: number;
  drawWidth: number;
  drawHeight: number;
}) {
  const mirrored = getMirroredSource(image);
  const pattern = mirrored ? context.createPattern(mirrored, "repeat") : null;
  if (!mirrored || !pattern) return;
  const scaleX = drawWidth / (sample.needWidthMm * sample.pxPerMm.x);
  const scaleY = drawHeight / (sample.needHeightMm * sample.pxPerMm.y);
  const offsetX = seededSurfaceRandom(seed + 61) * mirrored.width * scaleX;
  const offsetY = seededSurfaceRandom(seed + 67) * mirrored.height * scaleY;
  pattern.setTransform(
    new DOMMatrix().translate(-drawWidth / 2 - offsetX, -drawHeight / 2 - offsetY).scale(scaleX, scaleY)
  );
  context.fillStyle = pattern;
  context.fillRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
}

function drawPhysicalTile({
  context,
  source,
  tile,
  tileWidthMm,
  tileHeightMm,
}: {
  context: CanvasRenderingContext2D;
  source: LoadedSurfacePhysicalSource;
  tile: SurfaceTileRect;
  tileWidthMm: number;
  tileHeightMm: number;
}) {
  const imageSize = getImageSize(source.image);
  const sample = resolveSurfacePhysicalTileSample({
    sourceWidthPx: imageSize.width,
    sourceHeightPx: imageSize.height,
    sourceWidthMm: source.widthMm,
    sourceHeightMm: source.heightMm,
    tileWidthMm,
    tileHeightMm,
    seed: tile.seed,
  });
  const drawWidth = sample.quarterTurn ? tile.height : tile.width;
  const drawHeight = sample.quarterTurn ? tile.width : tile.height;

  context.save();
  context.beginPath();
  context.rect(tile.x, tile.y, tile.width, tile.height);
  context.clip();
  context.translate(tile.x + tile.width / 2, tile.y + tile.height / 2);
  if (sample.quarterTurn) context.rotate(Math.PI / 2);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  if (sample.mode === "undersized") {
    fillUndersizedTile({ context, image: source.image, sample, seed: tile.seed, drawWidth, drawHeight });
  } else {
    const { rect } = sample;
    context.drawImage(
      source.image,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      -drawWidth / 2,
      -drawHeight / 2,
      drawWidth,
      drawHeight
    );
  }
  context.restore();
}

/** Left and above share an edge in every layout; the diagonals matter in offset layouts. */
const LAID_NEIGHBOUR_OFFSETS = [[0, -1], [-1, 0], [-1, 1], [-1, -1]] as const;

/**
 * Returns the painter for one tile. Materials with physical-scale images lay
 * one face (or one true-scale window) per tile and never repeat a face next to
 * itself; every other material keeps the legacy painter it was given.
 */
export function createSurfaceTilePainter({
  context,
  physicalSources,
  tileSizeMeters,
  paintLegacyTile,
}: {
  context: CanvasRenderingContext2D;
  physicalSources: readonly LoadedSurfacePhysicalSource[] | null;
  tileSizeMeters: { width: number; height: number };
  paintLegacyTile: SurfaceTilePainter;
}): SurfaceTilePainter {
  if (!physicalSources || physicalSources.length === 0) return paintLegacyTile;

  const laidFaces = new Map<string, number>();
  return (tile) => {
    const neighbourFaceIndexes = LAID_NEIGHBOUR_OFFSETS.flatMap(([rowOffset, colOffset]) => {
      const faceIndex = laidFaces.get(`${tile.row + rowOffset}:${tile.col + colOffset}`);
      return faceIndex === undefined ? [] : [faceIndex];
    });
    const faceIndex = pickSurfaceFaceIndex({
      seed: tile.seed,
      faceCount: physicalSources.length,
      neighbourFaceIndexes,
    });
    laidFaces.set(`${tile.row}:${tile.col}`, faceIndex);
    drawPhysicalTile({
      context,
      source: physicalSources[faceIndex],
      tile,
      tileWidthMm: tileSizeMeters.width * 1000,
      tileHeightMm: tileSizeMeters.height * 1000,
    });
  };
}

function getLegacyHerringboneVariation({
  seed,
  imageData,
  targetAspect,
}: {
  seed: number;
  imageData: ImageData;
  targetAspect: number;
}): HerringbonePlankTextureVariation {
  const sourceWidth = imageData.width;
  const sourceHeight = imageData.height;
  const cropScale = 0.72 + seededSurfaceRandom(seed + 3) * 0.22;
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
    data: imageData.data,
    dataWidth: sourceWidth,
    dataHeight: sourceHeight,
    sourceX: safeInsetX + seededSurfaceRandom(seed + 11) * Math.max(0, safeWidth - cropWidth),
    sourceY: safeInsetY + seededSurfaceRandom(seed + 23) * Math.max(0, safeHeight - cropHeight),
    sourceWidth: Math.max(1, cropWidth),
    sourceHeight: Math.max(1, cropHeight),
    flipWidth: seededSurfaceRandom(seed + 31) > 0.5,
    flipLength: seededSurfaceRandom(seed + 41) > 0.72,
    tint: seededSurfaceRandom(seed + 53) - 0.5,
  };
}

type PhysicalPlankSource = { imageData: ImageData; widthMm: number; heightMm: number };

function getPhysicalHerringboneVariation({
  seed,
  sources,
  plankWidthMm,
  plankLengthMm,
  transposed,
}: {
  seed: number;
  sources: readonly PhysicalPlankSource[];
  plankWidthMm: number;
  plankLengthMm: number;
  transposed: boolean;
}): HerringbonePlankTextureVariation {
  const source = sources[Math.floor(seededSurfaceRandom(seed + 5) * sources.length) % sources.length];
  const { rect } = resolveSurfacePhysicalTileSample({
    sourceWidthPx: source.imageData.width,
    sourceHeightPx: source.imageData.height,
    sourceWidthMm: source.widthMm,
    sourceHeightMm: source.heightMm,
    tileWidthMm: plankWidthMm,
    tileHeightMm: plankLengthMm,
    seed,
    allowQuarterTurn: false,
  });
  return {
    data: source.imageData.data,
    dataWidth: source.imageData.width,
    dataHeight: source.imageData.height,
    sourceX: rect.x,
    sourceY: rect.y,
    sourceWidth: Math.max(1, rect.width),
    sourceHeight: Math.max(1, rect.height),
    // A transposed plank would show the face mirrored; flipping it back leaves a plain quarter turn.
    flipWidth: transposed,
    flipLength: false,
    tint: 0,
  };
}

/** Reads each physical source once, scaled down to the canvas resolution so sampling does not alias. */
function readPhysicalPlankSources(
  physicalSources: readonly LoadedSurfacePhysicalSource[],
  canvasPxPerMm: number
): PhysicalPlankSource[] | null {
  const sources: PhysicalPlankSource[] = [];
  for (const source of physicalSources) {
    const sourcePxPerMm = getImageSize(source.image).width / source.widthMm;
    const imageData = getImageDataForSource(source.image, Math.min(1, canvasPxPerMm / sourcePxPerMm));
    if (!imageData) return null;
    sources.push({ imageData, widthMm: source.widthMm, heightMm: source.heightMm });
  }
  return sources;
}

/**
 * Returns a memoised per-plank sampler for the herringbone layout, or null when
 * the source pixels cannot be read. With physical-scale sources each plank shows
 * one face or one true-scale window; otherwise the legacy random crop is used.
 */
export function createHerringbonePlankSampler({
  image,
  physicalSources,
  plankWidthMm,
  plankLengthMm,
  canvasPxPerMm,
  targetAspect,
}: {
  image: CanvasImageSource;
  physicalSources: readonly LoadedSurfacePhysicalSource[] | null;
  plankWidthMm: number;
  plankLengthMm: number;
  canvasPxPerMm: number;
  targetAspect: number;
}): ((seed: number, transposed: boolean) => HerringbonePlankTextureVariation) | null {
  const physical = physicalSources ? readPhysicalPlankSources(physicalSources, canvasPxPerMm) : null;
  const legacyImageData = physical ? null : getImageDataForSource(image);
  if (!physical && !legacyImageData) return null;

  const variations = new Map<number, HerringbonePlankTextureVariation>();
  return (seed, transposed) => {
    const cached = variations.get(seed);
    if (cached) return cached;
    const variation = physical
      ? getPhysicalHerringboneVariation({ seed, sources: physical, plankWidthMm, plankLengthMm, transposed })
      : getLegacyHerringboneVariation({ seed, imageData: legacyImageData as ImageData, targetAspect });
    variations.set(seed, variation);
    return variation;
  };
}
