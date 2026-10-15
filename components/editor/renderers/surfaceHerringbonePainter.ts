import {
  createHerringbonePlankSampler,
  type HerringbonePlankTextureVariation,
  type LoadedSurfacePhysicalSource,
} from "./surfaceTilePainter";

/**
 * The herringbone layout, painted pixel by pixel over the whole canvas. Moved out of useSurfaceMaterialTexture.ts on
 * 16 Oct 2026 with the same per-pixel arithmetic; the tests' helpers and the painter now share one locating function.
 */

type HerringboneOrientation = "horizontal" | "vertical";

type HerringbonePlankLocation = {
  unitX: number;
  unitY: number;
  /** Position inside the plank, in plank widths: along its length, then across it. */
  localXUnit: number;
  localYUnit: number;
  orientation: HerringboneOrientation;
};

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
  orientation: HerringboneOrientation;
}) {
  return (
    seedBase +
    Math.imul(Math.round(originXUnit), 73856093) +
    Math.imul(Math.round(originYUnit), 19349663) +
    (orientation === "vertical" ? 83492791 : 0)
  ) >>> 0;
}

function locateHerringbonePlank(xPx: number, yPx: number, plankWidth: number, aspectRatio: number): HerringbonePlankLocation {
  const unitX = xPx / plankWidth;
  const unitY = yPx / plankWidth;
  let localXUnit = positiveModulo(unitX - Math.floor(unitY), aspectRatio * 2);
  let localYUnit = positiveModulo(unitY, 1);
  let orientation: HerringboneOrientation = "horizontal";

  if (localXUnit >= aspectRatio) {
    const wrappedX = localXUnit;
    const wrappedY = localYUnit;
    localYUnit = positiveModulo(wrappedX, 1);
    localXUnit = 2 * aspectRatio - Math.ceil(wrappedX) + wrappedY;
    orientation = "vertical";
  }
  return { unitX, unitY, localXUnit, localYUnit, orientation };
}

function getHerringbonePlankSeed(seedBase: number, plank: HerringbonePlankLocation) {
  const horizontal = plank.orientation === "horizontal";
  return getHerringbonePlankVariationSeed({
    seedBase,
    originXUnit: horizontal ? plank.unitX - plank.localXUnit : plank.unitX - plank.localYUnit,
    originYUnit: horizontal ? plank.unitY - plank.localYUnit : plank.unitY - plank.localXUnit,
    orientation: plank.orientation,
  });
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
  const plank = locateHerringbonePlank(xPx, yPx, safePlankWidth, aspectRatio);
  return {
    localX: plank.localXUnit * safePlankWidth,
    localY: plank.localYUnit * safePlankWidth,
    orientation: plank.orientation,
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
  return getHerringbonePlankSeed(seedBase, locateHerringbonePlank(xPx, yPx, safePlankWidth, aspectRatio));
}

/** The source pixel a plank shows at a plank-local point (nearest neighbour). */
function getHerringboneSourceIndex(
  variation: HerringbonePlankTextureVariation,
  localX: number,
  localY: number,
  plankWidth: number,
  plankLength: number
) {
  let widthRatio = localY / Math.max(1, plankWidth);
  let lengthRatio = localX / Math.max(1, plankLength);
  if (variation.flipWidth) widthRatio = 1 - widthRatio;
  if (variation.flipLength) lengthRatio = 1 - lengthRatio;
  const sampleX = Math.min(
    variation.dataWidth - 1,
    Math.max(0, Math.floor(variation.sourceX + widthRatio * Math.max(0, variation.sourceWidth - 1)))
  );
  const sampleY = Math.min(
    variation.dataHeight - 1,
    Math.max(0, Math.floor(variation.sourceY + lengthRatio * Math.max(0, variation.sourceHeight - 1)))
  );
  return (sampleY * variation.dataWidth + sampleX) * 4;
}

function writeTintedPixel(output: Uint8ClampedArray, outputIndex: number, variation: HerringbonePlankTextureVariation, sourceIndex: number) {
  const source = variation.data;
  const tintAlpha = Math.abs(variation.tint) * 0.08;
  const tintTarget = variation.tint > 0 ? 255 : 0;
  output[outputIndex] = source[sourceIndex] + (tintTarget - source[sourceIndex]) * tintAlpha;
  output[outputIndex + 1] = source[sourceIndex + 1] + (tintTarget - source[sourceIndex + 1]) * tintAlpha;
  output[outputIndex + 2] = source[sourceIndex + 2] + (tintTarget - source[sourceIndex + 2]) * tintAlpha;
  output[outputIndex + 3] = source[sourceIndex + 3] || 255;
}

function isInJoint(localX: number, localY: number, jointInset: number, plankWidth: number, plankLength: number) {
  return (
    jointInset > 0 &&
    (localX < jointInset || localX > plankLength - jointInset || localY < jointInset || localY > plankWidth - jointInset)
  );
}

function writeJointPixel(output: Uint8ClampedArray, outputIndex: number, jointRgb: readonly [number, number, number]) {
  output[outputIndex] = jointRgb[0];
  output[outputIndex + 1] = jointRgb[1];
  output[outputIndex + 2] = jointRgb[2];
  output[outputIndex + 3] = 255;
}

/**
 * Paints the herringbone layout over the whole canvas, one plank face or true-scale window per plank. Returns false when
 * the source pixels cannot be read.
 */
export function paintHerringboneSurface({
  context,
  width,
  height,
  image,
  physicalSources,
  tileWidthPx,
  tileHeightPx,
  tileWidthMm,
  jointSizePx,
  jointRgb,
  seedBase,
}: {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  image: CanvasImageSource;
  physicalSources: readonly LoadedSurfacePhysicalSource[] | null;
  tileWidthPx: number;
  tileHeightPx: number;
  tileWidthMm: number;
  jointSizePx: number;
  jointRgb: readonly [number, number, number];
  seedBase: number;
}): boolean {
  const { width: plankWidth, length: plankLength } = getHerringbonePlankSizeForTest({ tileWidthPx, tileHeightPx });
  const canvasPxPerMm = tileWidthPx / tileWidthMm;
  const samplePlank = createHerringbonePlankSampler({
    image,
    physicalSources,
    plankWidthMm: plankWidth / canvasPxPerMm,
    plankLengthMm: plankLength / canvasPxPerMm,
    canvasPxPerMm,
    targetAspect: Math.max(0.05, Math.min(1, plankWidth / Math.max(1, plankLength))),
  });
  if (!samplePlank) return false;

  const aspectRatio = Math.max(1, plankLength / Math.max(1, plankWidth));
  const jointInset = Math.min(Math.max(0, jointSizePx / 2), Math.max(0, plankWidth / 2 - 0.25));
  const outputImageData = context.createImageData(width, height);
  const output = outputImageData.data;
  for (let pixelY = 0; pixelY < height; pixelY += 1) {
    for (let pixelX = 0; pixelX < width; pixelX += 1) {
      const plank = locateHerringbonePlank(pixelX, pixelY, plankWidth, aspectRatio);
      const localX = plank.localXUnit * plankWidth;
      const localY = plank.localYUnit * plankWidth;
      const outputIndex = (pixelY * width + pixelX) * 4;
      if (isInJoint(localX, localY, jointInset, plankWidth, plankLength)) {
        writeJointPixel(output, outputIndex, jointRgb);
        continue;
      }
      const variation = samplePlank(getHerringbonePlankSeed(seedBase, plank), plank.orientation === "horizontal");
      writeTintedPixel(output, outputIndex, variation, getHerringboneSourceIndex(variation, localX, localY, plankWidth, plankLength));
    }
  }
  context.putImageData(outputImageData, 0, 0);
  return true;
}
