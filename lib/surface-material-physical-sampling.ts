import type { SurfaceMaterial, SurfaceTextureFace } from "./surface-material-schema";

/**
 * Physical-scale sampling for surface material images.
 *
 * A material image covers a fixed number of millimetres, so its millimetres
 * per pixel never depend on the tile it is drawn on. A tile either shows one
 * whole face, or a tile-sized window cut from a larger image.
 */

export type SurfacePhysicalImageSource = {
  url: string;
  widthMm: number;
  heightMm: number;
};

export type SurfacePhysicalSampleMode = "whole_face" | "window" | "undersized";

export type SurfacePhysicalTileSample = {
  mode: SurfacePhysicalSampleMode;
  /** Source rectangle in source pixels. */
  rect: { x: number; y: number; width: number; height: number };
  /** The source is turned a quarter turn so its long side follows the tile's long side. */
  quarterTurn: boolean;
  /** Tile size along the source's own x and y axes, after any quarter turn. */
  needWidthMm: number;
  needHeightMm: number;
  /** Source pixels per millimetre. A property of the image, never of the tile. */
  pxPerMm: { x: number; y: number };
};

type SurfacePhysicalTextureAssets = Pick<
  SurfaceMaterial["texture_assets"],
  "base_color_url" | "swatch_url" | "image_physical_size_mm" | "faces"
>;

/** Image proportions in supplier files are off by up to about 3%; treat that as the same size. */
export const SURFACE_PHYSICAL_SIZE_TOLERANCE = 0.03;

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isUsableFace(face: SurfaceTextureFace | null | undefined): face is SurfaceTextureFace {
  return (
    typeof face?.url === "string" &&
    face.url.trim().length > 0 &&
    isPositiveNumber(face.width_mm) &&
    isPositiveNumber(face.height_mm)
  );
}

export function seededSurfaceRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Images with a declared physical size: the format's faces when present,
 * otherwise the base colour image when its physical size is known. An empty
 * list means the material has no physical-scale data.
 */
export function getSurfacePhysicalImageSources(
  textureAssets: SurfacePhysicalTextureAssets | null | undefined
): SurfacePhysicalImageSource[] {
  const faces = (textureAssets?.faces ?? []).filter(isUsableFace);
  if (faces.length > 0) {
    return faces.map((face) => ({
      url: face.url.trim(),
      widthMm: face.width_mm,
      heightMm: face.height_mm,
    }));
  }

  const size = textureAssets?.image_physical_size_mm;
  const url = textureAssets?.base_color_url?.trim() || textureAssets?.swatch_url?.trim();
  if (!url || !isPositiveNumber(size?.width) || !isPositiveNumber(size?.height)) return [];
  return [{ url, widthMm: size.width, heightMm: size.height }];
}

export function getSurfacePhysicalSourceKey(
  textureAssets: SurfacePhysicalTextureAssets | null | undefined
): string {
  return getSurfacePhysicalImageSources(textureAssets)
    .map((source) => `${source.url}@${source.widthMm}x${source.heightMm}`)
    .join("|");
}

/** How much of the needed size the source covers; 1 or more means it covers the tile. */
function getCoverage(sourceWidthMm: number, sourceHeightMm: number, needWidthMm: number, needHeightMm: number) {
  return Math.min(sourceWidthMm / needWidthMm, sourceHeightMm / needHeightMm);
}

function shouldQuarterTurn({
  sourceWidthMm,
  sourceHeightMm,
  tileWidthMm,
  tileHeightMm,
}: {
  sourceWidthMm: number;
  sourceHeightMm: number;
  tileWidthMm: number;
  tileHeightMm: number;
}): boolean {
  const enough = 1 - SURFACE_PHYSICAL_SIZE_TOLERANCE;
  const direct = getCoverage(sourceWidthMm, sourceHeightMm, tileWidthMm, tileHeightMm);
  const turned = getCoverage(sourceWidthMm, sourceHeightMm, tileHeightMm, tileWidthMm);
  const tileIsSquare =
    Math.abs(tileWidthMm - tileHeightMm) / Math.max(tileWidthMm, tileHeightMm) <= SURFACE_PHYSICAL_SIZE_TOLERANCE;
  const sameOrientation = tileWidthMm >= tileHeightMm === sourceWidthMm >= sourceHeightMm;

  if (tileIsSquare || sameOrientation) return direct < enough && turned > direct;
  return turned >= enough || turned > direct;
}

function isWithinTolerance(ratio: number): boolean {
  return Math.abs(ratio - 1) <= SURFACE_PHYSICAL_SIZE_TOLERANCE;
}

/**
 * Picks the part of a source image that a tile shows at the image's own scale.
 * A whole face is used when the image and the tile are the same size; a random
 * tile-sized window is cut when the image is larger; "undersized" reports that
 * the image cannot cover the tile and returns the part that does exist.
 */
export function resolveSurfacePhysicalTileSample({
  sourceWidthPx,
  sourceHeightPx,
  sourceWidthMm,
  sourceHeightMm,
  tileWidthMm,
  tileHeightMm,
  seed,
  allowQuarterTurn = true,
}: {
  sourceWidthPx: number;
  sourceHeightPx: number;
  sourceWidthMm: number;
  sourceHeightMm: number;
  tileWidthMm: number;
  tileHeightMm: number;
  seed: number;
  allowQuarterTurn?: boolean;
}): SurfacePhysicalTileSample {
  const quarterTurn =
    allowQuarterTurn && shouldQuarterTurn({ sourceWidthMm, sourceHeightMm, tileWidthMm, tileHeightMm });
  const needWidthMm = quarterTurn ? tileHeightMm : tileWidthMm;
  const needHeightMm = quarterTurn ? tileWidthMm : tileHeightMm;
  const pxPerMm = { x: sourceWidthPx / sourceWidthMm, y: sourceHeightPx / sourceHeightMm };
  const widthRatio = needWidthMm / sourceWidthMm;
  const heightRatio = needHeightMm / sourceHeightMm;
  const base = { quarterTurn, needWidthMm, needHeightMm, pxPerMm };

  if (isWithinTolerance(widthRatio) && isWithinTolerance(heightRatio)) {
    return { ...base, mode: "whole_face", rect: { x: 0, y: 0, width: sourceWidthPx, height: sourceHeightPx } };
  }

  const width = Math.min(sourceWidthPx, needWidthMm * pxPerMm.x);
  const height = Math.min(sourceHeightPx, needHeightMm * pxPerMm.y);
  const covers =
    widthRatio <= 1 + SURFACE_PHYSICAL_SIZE_TOLERANCE && heightRatio <= 1 + SURFACE_PHYSICAL_SIZE_TOLERANCE;
  return {
    ...base,
    mode: covers ? "window" : "undersized",
    rect: {
      x: seededSurfaceRandom(seed + 11) * (sourceWidthPx - width),
      y: seededSurfaceRandom(seed + 23) * (sourceHeightPx - height),
      width,
      height,
    },
  };
}

/**
 * Picks a face for a tile, avoiding the faces already used by its laid
 * neighbours. Neighbours are listed most important first; when there are too
 * few faces to avoid them all, the least important ones are dropped.
 */
export function pickSurfaceFaceIndex({
  seed,
  faceCount,
  neighbourFaceIndexes,
}: {
  seed: number;
  faceCount: number;
  neighbourFaceIndexes: readonly number[];
}): number {
  if (faceCount <= 1) return 0;
  const start = Math.floor(seededSurfaceRandom(seed + 5) * faceCount) % faceCount;
  for (let kept = neighbourFaceIndexes.length; kept > 0; kept -= 1) {
    const avoided = neighbourFaceIndexes.slice(0, kept);
    for (let step = 0; step < faceCount; step += 1) {
      const candidate = (start + step) % faceCount;
      if (!avoided.includes(candidate)) return candidate;
    }
  }
  return start;
}

/**
 * Import-time checks for physical-scale data. A face that is smaller than the
 * tile it is sold as cannot be shown at true scale, so it is reported.
 */
export function getSurfacePhysicalAssetFailures(entry: SurfaceMaterial): string[] {
  const failures: string[] = [];
  const assets = entry.texture_assets;
  const size = assets?.image_physical_size_mm;
  if (size != null && (!isPositiveNumber(size.width) || !isPositiveNumber(size.height))) {
    failures.push("texture_assets.image_physical_size_mm must have positive width and height in mm.");
  }

  const faces = assets?.faces;
  if (faces == null) return failures;
  if (!Array.isArray(faces) || faces.length === 0) {
    return [...failures, "texture_assets.faces must be a non-empty array when present."];
  }

  const specs = entry.physical_specs;
  const tileWidthMm = specs?.tile_width_mm ?? specs?.plank_width_mm;
  const tileHeightMm = specs?.tile_length_mm ?? specs?.plank_length_mm;
  faces.forEach((face, index) => {
    if (!isUsableFace(face)) {
      failures.push(`texture_assets.faces[${index}] needs url, width_mm and height_mm.`);
      return;
    }
    if (!isPositiveNumber(tileWidthMm) || !isPositiveNumber(tileHeightMm)) return;
    const coverage = Math.max(
      getCoverage(face.width_mm, face.height_mm, tileWidthMm, tileHeightMm),
      getCoverage(face.width_mm, face.height_mm, tileHeightMm, tileWidthMm)
    );
    if (coverage < 1 - SURFACE_PHYSICAL_SIZE_TOLERANCE) {
      failures.push(
        `texture_assets.faces[${index}] covers ${face.width_mm}x${face.height_mm} mm, smaller than the ${tileWidthMm}x${tileHeightMm} mm tile.`
      );
    }
  });
  return failures;
}
