import type {
  SourceVectorPath,
  SourceVectorSegment,
} from "./deterministic-evidence";
import type { FloorPlanRenderedPage } from "./types";

const DEFAULT_TILE_SIZE_PX = 96;
const MAX_CYCLE_AXIS_LINES = 240;
const MAX_SYNTHESIZED_CYCLES = 2_000;
const MAX_CYCLE_CANDIDATE_CHECKS = 300_000;
const MAX_DESKEW_DEGREES = 5;
const DESKEW_ANGLE_STEP_DEGREES = 0.25;
const MAX_DESKEW_SAMPLE_POINTS = 150_000;
const MAX_RASTER_INPUT_PIXELS = 40_000_000;

type RasterNormalization = NonNullable<FloorPlanRenderedPage["normalization"]>;

type Orientation = "horizontal" | "vertical";

type RasterRun = {
  axis: number;
  start: number;
  end: number;
  continuity: number;
};

type RunBand = {
  firstAxis: number;
  lastAxis: number;
  axisSum: number;
  startSum: number;
  endSum: number;
  count: number;
  minStart: number;
  maxStart: number;
  minEnd: number;
  maxEnd: number;
  continuitySum: number;
};

type AxisLine = {
  id: string;
  orientation: Orientation;
  coordinate: number;
  start: number;
  end: number;
  thicknessPx: number;
  confidence: number;
};

export type RasterLineworkDiagnostics = {
  globalThreshold: number;
  tileSizePx: number;
  inkRatio: number;
  horizontalRunCount: number;
  verticalRunCount: number;
  horizontalLineCount: number;
  verticalLineCount: number;
  closedCycleCount: number;
  cycleCandidateChecks: number;
  cycleSearchCapped: boolean;
  cycleSearchLimitReason: "candidate_check_limit" | "cycle_count_limit" | null;
  confidence: number;
  weakReason: string | null;
  normalization: RasterNormalization | null;
};

export type RasterLineworkResult = {
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  vectorSegments: SourceVectorSegment[];
  vectorPaths: SourceVectorPath[];
  diagnostics: RasterLineworkDiagnostics;
};

export type ExtractRasterLineworkOptions = {
  pageNumber: number;
  expectedWidthPx?: number;
  expectedHeightPx?: number;
  tileSizePx?: number;
  normalization?: RasterNormalization;
};

export type NormalizedRasterForLinework = {
  bytes: Uint8Array;
  widthPx: number;
  heightPx: number;
  normalization: RasterNormalization;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundPx(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

function percentileFromHistogram(
  histogram: Uint32Array,
  count: number,
  percentile: number
) {
  const target = Math.max(1, Math.ceil(count * percentile));
  let cumulative = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    cumulative += histogram[value];
    if (cumulative >= target) return value;
  }
  return 255;
}

function otsuThreshold(histogram: Uint32Array, count: number) {
  if (count <= 0) return 0;
  let totalWeighted = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    totalWeighted += value * histogram[value];
  }
  let backgroundWeight = 0;
  let backgroundWeighted = 0;
  let bestVariance = -1;
  let bestThreshold = 0;
  for (let value = 0; value < histogram.length - 1; value += 1) {
    const frequency = histogram[value];
    backgroundWeight += frequency;
    backgroundWeighted += value * frequency;
    if (backgroundWeight === 0) continue;
    const foregroundWeight = count - backgroundWeight;
    if (foregroundWeight === 0) break;
    const backgroundMean = backgroundWeighted / backgroundWeight;
    const foregroundMean =
      (totalWeighted - backgroundWeighted) / foregroundWeight;
    const variance =
      backgroundWeight *
      foregroundWeight *
      (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = value;
    }
  }
  return bestThreshold;
}

function makeAdaptiveInkMask(
  pixels: Uint8Array,
  width: number,
  height: number,
  requestedTileSize: number
) {
  const globalHistogram = new Uint32Array(256);
  for (let index = 0; index < pixels.length; index += 1) {
    globalHistogram[pixels[index]] += 1;
  }
  const globalBackground = percentileFromHistogram(
    globalHistogram,
    pixels.length,
    0.9
  );
  const globalThreshold = clamp(
    Math.max(72, otsuThreshold(globalHistogram, pixels.length)),
    48,
    Math.max(48, Math.min(224, globalBackground - 12))
  );
  const tileSize = clamp(Math.round(requestedTileSize), 48, 192);
  const mask = new Uint8Array(pixels.length);
  let inkCount = 0;

  for (let top = 0; top < height; top += tileSize) {
    const bottom = Math.min(height, top + tileSize);
    for (let left = 0; left < width; left += tileSize) {
      const right = Math.min(width, left + tileSize);
      const histogram = new Uint32Array(256);
      let count = 0;
      for (let y = top; y < bottom; y += 1) {
        const rowOffset = y * width;
        for (let x = left; x < right; x += 1) {
          histogram[pixels[rowOffset + x]] += 1;
          count += 1;
        }
      }
      const localBackground = percentileFromHistogram(histogram, count, 0.9);
      const localOtsu = otsuThreshold(histogram, count);
      const threshold = clamp(
        Math.max(globalThreshold - 24, localOtsu),
        40,
        Math.max(40, Math.min(224, localBackground - 12))
      );
      for (let y = top; y < bottom; y += 1) {
        const rowOffset = y * width;
        for (let x = left; x < right; x += 1) {
          const index = rowOffset + x;
          if (pixels[index] > threshold) continue;
          mask[index] = 1;
          inkCount += 1;
        }
      }
    }
  }
  return {
    mask,
    globalThreshold,
    tileSize,
    inkRatio: inkCount / Math.max(1, pixels.length),
  };
}

type DeskewEstimate = {
  detectedSkewDegrees: number;
  appliedRotationDegrees: number;
  confidence: number;
  applied: boolean;
};

function profileSharpness(counts: Uint32Array) {
  let score = 0;
  for (let index = 0; index < counts.length; index += 1) {
    const count = counts[index];
    if (count > 1) score += count * count;
  }
  return score;
}

async function estimateRasterDeskew(
  orientedBytes: Uint8Array
): Promise<DeskewEstimate> {
  const { default: sharp } = await import("sharp");
  const sample = await sharp(orientedBytes)
    .resize({
      width: 900,
      height: 900,
      fit: "inside",
      withoutEnlargement: true,
    })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = sample.info.width;
  const height = sample.info.height;
  const pixels = new Uint8Array(
    sample.data.buffer,
    sample.data.byteOffset,
    sample.data.byteLength
  );
  const adaptive = makeAdaptiveInkMask(
    pixels,
    width,
    height,
    clamp(Math.round(Math.min(width, height) / 12), 48, 96)
  );
  if (adaptive.inkRatio < 0.0005 || adaptive.inkRatio > 0.28) {
    return {
      detectedSkewDegrees: 0,
      appliedRotationDegrees: 0,
      confidence: 0,
      applied: false,
    };
  }

  const inkCount = Math.round(adaptive.inkRatio * width * height);
  const sampleEvery = Math.max(
    1,
    Math.ceil(inkCount / MAX_DESKEW_SAMPLE_POINTS)
  );
  const points: Array<{ x: number; y: number }> = [];
  let seenInk = 0;
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      if (!adaptive.mask[rowOffset + x]) continue;
      if (seenInk % sampleEvery === 0) points.push({ x, y });
      seenInk += 1;
    }
  }
  if (points.length < 100) {
    return {
      detectedSkewDegrees: 0,
      appliedRotationDegrees: 0,
      confidence: 0,
      applied: false,
    };
  }

  const binCount = Math.ceil(Math.hypot(width, height)) + 32;
  const scores: Array<{
    angle: number;
    horizontal: number;
    vertical: number;
  }> = [];
  const stepCount = Math.round(
    (MAX_DESKEW_DEGREES * 2) / DESKEW_ANGLE_STEP_DEGREES
  );
  for (let step = 0; step <= stepCount; step += 1) {
    const angle =
      -MAX_DESKEW_DEGREES + step * DESKEW_ANGLE_STEP_DEGREES;
    const radians = (angle * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const horizontalProfile = new Uint32Array(binCount);
    const verticalProfile = new Uint32Array(binCount);
    const horizontalOffset = Math.abs(width * sine) + 8;
    const verticalOffset = Math.abs(height * sine) + 8;
    for (const point of points) {
      const horizontalBin = Math.round(
        point.y * cosine - point.x * sine + horizontalOffset
      );
      const verticalBin = Math.round(
        point.x * cosine + point.y * sine + verticalOffset
      );
      if (horizontalBin >= 0 && horizontalBin < binCount) {
        horizontalProfile[horizontalBin] += 1;
      }
      if (verticalBin >= 0 && verticalBin < binCount) {
        verticalProfile[verticalBin] += 1;
      }
    }
    scores.push({
      angle,
      horizontal: profileSharpness(horizontalProfile),
      vertical: profileSharpness(verticalProfile),
    });
  }

  const bestHorizontal = [...scores].sort(
    (left, right) =>
      right.horizontal - left.horizontal ||
      Math.abs(left.angle) - Math.abs(right.angle) ||
      left.angle - right.angle
  )[0];
  const bestVertical = [...scores].sort(
    (left, right) =>
      right.vertical - left.vertical ||
      Math.abs(left.angle) - Math.abs(right.angle) ||
      left.angle - right.angle
  )[0];
  const zero = scores.find((entry) => entry.angle === 0) ?? scores[0];
  const horizontalImprovement =
    (bestHorizontal.horizontal - zero.horizontal) /
    Math.max(1, zero.horizontal);
  const verticalImprovement =
    (bestVertical.vertical - zero.vertical) / Math.max(1, zero.vertical);
  const agreement = Math.abs(bestHorizontal.angle - bestVertical.angle);
  const candidateAngle =
    (bestHorizontal.angle + bestVertical.angle) / 2;
  const horizontalCompetitor = Math.max(
    0,
    ...scores
      .filter((entry) => Math.abs(entry.angle - bestHorizontal.angle) >= 0.75)
      .map((entry) => entry.horizontal)
  );
  const verticalCompetitor = Math.max(
    0,
    ...scores
      .filter((entry) => Math.abs(entry.angle - bestVertical.angle) >= 0.75)
      .map((entry) => entry.vertical)
  );
  const horizontalProminence =
    (bestHorizontal.horizontal - horizontalCompetitor) /
    Math.max(1, bestHorizontal.horizontal);
  const verticalProminence =
    (bestVertical.vertical - verticalCompetitor) /
    Math.max(1, bestVertical.vertical);
  const notAtBoundary =
    Math.abs(bestHorizontal.angle) < MAX_DESKEW_DEGREES &&
    Math.abs(bestVertical.angle) < MAX_DESKEW_DEGREES;
  const evidenceStrong =
    horizontalImprovement >= 0.025 &&
    verticalImprovement >= 0.025 &&
    horizontalProminence >= 0.006 &&
    verticalProminence >= 0.006 &&
    agreement <= 0.5 &&
    notAtBoundary;
  const confidence = evidenceStrong
    ? clamp(
        0.45 +
          Math.min(horizontalImprovement, verticalImprovement) * 1.5 +
          Math.min(horizontalProminence, verticalProminence) * 4 +
          (0.5 - agreement) * 0.2,
        0,
        0.99
      )
    : clamp(
        Math.min(horizontalImprovement, verticalImprovement) * 0.5,
        0,
        0.49
      );
  const applied =
    evidenceStrong && Math.abs(candidateAngle) >= 0.35 && confidence >= 0.55;
  return {
    detectedSkewDegrees: roundPx(candidateAngle),
    appliedRotationDegrees: applied ? roundPx(-candidateAngle) : 0,
    confidence: roundPx(confidence),
    applied,
  };
}

function roundTransform(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Produces the exact derivative coordinate space used by raster extraction and
 * the source-to-derivative affine transform. Deskew is bounded to +/-5 degrees
 * and is skipped unless both horizontal and vertical profiles agree.
 */
export async function normalizeRasterForLinework(
  bytes: Uint8Array
): Promise<NormalizedRasterForLinework> {
  const { default: sharp } = await import("sharp");
  const oriented = await sharp(bytes, {
    limitInputPixels: MAX_RASTER_INPUT_PIXELS,
    sequentialRead: true,
  })
    .rotate()
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer({ resolveWithObject: true });
  const estimate = await estimateRasterDeskew(new Uint8Array(oriented.data));
  const intermediate = estimate.applied
    ? await sharp(oriented.data)
        .rotate(estimate.appliedRotationDegrees, {
          background: "#ffffff",
        })
        .png()
        .toBuffer({ resolveWithObject: true })
    : oriented;
  const normalized = await sharp(intermediate.data)
    .resize({
      width: 5000,
      height: 5000,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer({ resolveWithObject: true });
  const sourceWidth = oriented.info.width;
  const sourceHeight = oriented.info.height;
  const intermediateWidth = intermediate.info.width;
  const intermediateHeight = intermediate.info.height;
  const scaleX = normalized.info.width / intermediateWidth;
  const scaleY = normalized.info.height / intermediateHeight;
  const radians = (estimate.appliedRotationDegrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const sourceCenterX = (sourceWidth - 1) / 2;
  const sourceCenterY = (sourceHeight - 1) / 2;
  const intermediateCenterX = (intermediateWidth - 1) / 2;
  const intermediateCenterY = (intermediateHeight - 1) / 2;
  const translateX =
    intermediateCenterX -
    cosine * sourceCenterX +
    sine * sourceCenterY;
  const translateY =
    intermediateCenterY -
    sine * sourceCenterX -
    cosine * sourceCenterY;
  const sourceToRendered: RasterNormalization["sourceToRendered"] = [
    roundTransform(cosine * scaleX),
    roundTransform(sine * scaleY),
    roundTransform(-sine * scaleX),
    roundTransform(cosine * scaleY),
    roundTransform(translateX * scaleX),
    roundTransform(translateY * scaleY),
  ];
  return {
    bytes: new Uint8Array(normalized.data),
    widthPx: normalized.info.width,
    heightPx: normalized.info.height,
    normalization: {
      kind: "raster_deskew_v1",
      coordinateSpace: "exif_oriented_source_px_to_rendered_px",
      sourceWidthPx: sourceWidth,
      sourceHeightPx: sourceHeight,
      detectedSkewDegrees: estimate.detectedSkewDegrees,
      appliedRotationDegrees: estimate.appliedRotationDegrees,
      confidence: estimate.confidence,
      applied: estimate.applied,
      sourceToRendered,
    },
  };
}

function collectRuns(input: {
  mask: Uint8Array;
  width: number;
  height: number;
  orientation: Orientation;
  minimumLengthPx: number;
  maximumGapPx: number;
}) {
  const axisCount =
    input.orientation === "horizontal" ? input.height : input.width;
  const spanCount =
    input.orientation === "horizontal" ? input.width : input.height;
  const runs: RasterRun[] = [];

  for (let axis = 0; axis < axisCount; axis += 1) {
    let start = -1;
    let lastInk = -1;
    let inkCount = 0;
    const finish = () => {
      if (start < 0 || lastInk < start) return;
      const length = lastInk - start + 1;
      const continuity = inkCount / length;
      if (length >= input.minimumLengthPx && continuity >= 0.72) {
        runs.push({ axis, start, end: lastInk, continuity });
      }
      start = -1;
      lastInk = -1;
      inkCount = 0;
    };

    for (let span = 0; span < spanCount; span += 1) {
      const index =
        input.orientation === "horizontal"
          ? axis * input.width + span
          : span * input.width + axis;
      if (input.mask[index]) {
        if (start < 0) start = span;
        lastInk = span;
        inkCount += 1;
      } else if (
        start >= 0 &&
        lastInk >= 0 &&
        span - lastInk > input.maximumGapPx
      ) {
        finish();
      }
    }
    finish();
  }
  return runs;
}

function overlapRatio(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number
) {
  const overlap = Math.max(
    0,
    Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart) + 1
  );
  return overlap / Math.max(1, Math.min(leftEnd - leftStart + 1, rightEnd - rightStart + 1));
}

function makeBand(run: RasterRun): RunBand {
  return {
    firstAxis: run.axis,
    lastAxis: run.axis,
    axisSum: run.axis,
    startSum: run.start,
    endSum: run.end,
    count: 1,
    minStart: run.start,
    maxStart: run.start,
    minEnd: run.end,
    maxEnd: run.end,
    continuitySum: run.continuity,
  };
}

function addRunToBand(band: RunBand, run: RasterRun) {
  band.lastAxis = run.axis;
  band.axisSum += run.axis;
  band.startSum += run.start;
  band.endSum += run.end;
  band.count += 1;
  band.minStart = Math.min(band.minStart, run.start);
  band.maxStart = Math.max(band.maxStart, run.start);
  band.minEnd = Math.min(band.minEnd, run.end);
  band.maxEnd = Math.max(band.maxEnd, run.end);
  band.continuitySum += run.continuity;
}

function mergeRunsIntoLines(input: {
  runs: RasterRun[];
  orientation: Orientation;
  maximumBandThicknessPx: number;
  endpointTolerancePx: number;
}) {
  const runsByAxis = new Map<number, RasterRun[]>();
  for (const run of input.runs) {
    const entries = runsByAxis.get(run.axis) ?? [];
    entries.push(run);
    runsByAxis.set(run.axis, entries);
  }
  const axes = [...runsByAxis.keys()].sort((left, right) => left - right);
  let active: RunBand[] = [];
  const completed: RunBand[] = [];

  for (const axis of axes) {
    const nextActive: RunBand[] = [];
    for (const band of active) {
      if (band.lastAxis >= axis - 1) nextActive.push(band);
      else completed.push(band);
    }
    active = nextActive;
    const used = new Set<RunBand>();
    const axisRuns = [...(runsByAxis.get(axis) ?? [])].sort(
      (left, right) => left.start - right.start || left.end - right.end
    );
    for (const run of axisRuns) {
      const match = active
        .filter((band) => !used.has(band) && band.lastAxis === axis - 1)
        .map((band) => {
          const averageStart = band.startSum / band.count;
          const averageEnd = band.endSum / band.count;
          const endpointDrift =
            Math.abs(run.start - averageStart) + Math.abs(run.end - averageEnd);
          return {
            band,
            overlap: overlapRatio(
              averageStart,
              averageEnd,
              run.start,
              run.end
            ),
            endpointDrift,
          };
        })
        .filter(
          (entry) =>
            entry.overlap >= 0.76 &&
            entry.endpointDrift <= input.endpointTolerancePx * 2
        )
        .sort(
          (left, right) =>
            right.overlap - left.overlap || left.endpointDrift - right.endpointDrift
        )[0];
      if (match) {
        addRunToBand(match.band, run);
        used.add(match.band);
      } else {
        const band = makeBand(run);
        active.push(band);
        used.add(band);
      }
    }
  }
  completed.push(...active);

  return completed
    .filter(
      (band) =>
        band.lastAxis - band.firstAxis + 1 <= input.maximumBandThicknessPx
    )
    .map((band): Omit<AxisLine, "id"> => {
      const start = band.startSum / band.count;
      const end = band.endSum / band.count;
      const length = Math.max(1, end - start);
      const endpointVariation =
        band.maxStart - band.minStart + band.maxEnd - band.minEnd;
      const stability = clamp(
        1 - endpointVariation / Math.max(1, length * 0.12),
        0,
        1
      );
      const continuity = band.continuitySum / band.count;
      const thickness = band.lastAxis - band.firstAxis + 1;
      const thinness = clamp(
        1 - (thickness - 1) / Math.max(1, input.maximumBandThicknessPx),
        0,
        1
      );
      return {
        orientation: input.orientation,
        coordinate: band.axisSum / band.count,
        start,
        end,
        thicknessPx: thickness,
        confidence: clamp(
          0.48 + continuity * 0.3 + stability * 0.17 + thinness * 0.05,
          0,
          0.99
        ),
      };
    })
    .filter((line) => line.confidence >= 0.68);
}

function mergeCollinearLines(
  inputLines: Array<Omit<AxisLine, "id">>,
  coordinateTolerancePx: number,
  gapTolerancePx: number
) {
  const sorted = [...inputLines].sort(
    (left, right) =>
      left.orientation.localeCompare(right.orientation) ||
      left.coordinate - right.coordinate ||
      left.start - right.start ||
      left.end - right.end
  );
  const result: Array<Omit<AxisLine, "id">> = [];
  for (const line of sorted) {
    const match = result
      .filter(
        (candidate) =>
          candidate.orientation === line.orientation &&
          Math.abs(candidate.coordinate - line.coordinate) <=
            coordinateTolerancePx &&
          line.start <= candidate.end + gapTolerancePx &&
          line.end >= candidate.start - gapTolerancePx
      )
      .sort(
        (left, right) =>
          Math.abs(left.coordinate - line.coordinate) -
          Math.abs(right.coordinate - line.coordinate)
      )[0];
    if (!match) {
      result.push({ ...line });
      continue;
    }
    const leftWeight = Math.max(1, match.end - match.start);
    const rightWeight = Math.max(1, line.end - line.start);
    match.coordinate =
      (match.coordinate * leftWeight + line.coordinate * rightWeight) /
      (leftWeight + rightWeight);
    match.start = Math.min(match.start, line.start);
    match.end = Math.max(match.end, line.end);
    match.thicknessPx = Math.max(match.thicknessPx, line.thicknessPx);
    match.confidence = Math.min(match.confidence, line.confidence);
  }
  return result
    .sort(
      (left, right) =>
        left.orientation.localeCompare(right.orientation) ||
        left.coordinate - right.coordinate ||
        left.start - right.start ||
        left.end - right.end
    )
    .map((line, index): AxisLine => ({
      ...line,
      id: `raster-line-${index + 1}`,
    }));
}

function lineToSegment(line: AxisLine, pageNumber: number): SourceVectorSegment {
  const horizontal = line.orientation === "horizontal";
  return {
    id: line.id,
    pageNumber,
    start: {
      x: roundPx(horizontal ? line.start : line.coordinate),
      y: roundPx(horizontal ? line.coordinate : line.start),
    },
    end: {
      x: roundPx(horizontal ? line.end : line.coordinate),
      y: roundPx(horizontal ? line.coordinate : line.end),
    },
    strokeWidthPx: roundPx(line.thicknessPx),
    confidence: roundPx(line.confidence),
    evidenceKind: "raster_linework",
  };
}

function synthesizeClosedCycles(input: {
  lines: AxisLine[];
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  junctionTolerancePx: number;
}) {
  const minimumWidth = input.widthPx * 0.055;
  const minimumHeight = input.heightPx * 0.045;
  const maximumWidth = input.widthPx * 0.9;
  const maximumHeight = input.heightPx * 0.9;
  const rank = (line: AxisLine) =>
    (line.end - line.start) * line.confidence;
  const horizontal = input.lines
    .filter((line) => line.orientation === "horizontal")
    .sort((left, right) => rank(right) - rank(left))
    .slice(0, MAX_CYCLE_AXIS_LINES)
    .sort(
      (left, right) =>
        left.coordinate - right.coordinate || left.start - right.start
    );
  const vertical = input.lines
    .filter((line) => line.orientation === "vertical")
    .sort((left, right) => rank(right) - rank(left))
    .slice(0, MAX_CYCLE_AXIS_LINES)
    .sort(
      (left, right) =>
        left.coordinate - right.coordinate || left.start - right.start
    );
  const paths: SourceVectorPath[] = [];
  const seen = new Set<string>();
  let candidateChecks = 0;
  let capped = false;
  let limitReason: "candidate_check_limit" | "cycle_count_limit" | null = null;

  cycleSearch:
  for (let topIndex = 0; topIndex < horizontal.length; topIndex += 1) {
    const top = horizontal[topIndex];
    for (
      let bottomIndex = topIndex + 1;
      bottomIndex < horizontal.length;
      bottomIndex += 1
    ) {
      const bottom = horizontal[bottomIndex];
      const height = bottom.coordinate - top.coordinate;
      if (height < minimumHeight) continue;
      if (height > maximumHeight) break;
      const connectors: AxisLine[] = [];
      for (const line of vertical) {
        if (candidateChecks >= MAX_CYCLE_CANDIDATE_CHECKS) {
          capped = true;
          limitReason = "candidate_check_limit";
          break cycleSearch;
        }
        candidateChecks += 1;
        if (
          line.start > top.coordinate + input.junctionTolerancePx ||
          line.end < bottom.coordinate - input.junctionTolerancePx
        ) {
          continue;
        }
        if (
          line.coordinate >=
            Math.max(top.start, bottom.start) - input.junctionTolerancePx &&
          line.coordinate <=
            Math.min(top.end, bottom.end) + input.junctionTolerancePx
        ) {
          connectors.push(line);
        }
      }
      for (let leftIndex = 0; leftIndex < connectors.length; leftIndex += 1) {
        const left = connectors[leftIndex];
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < connectors.length;
          rightIndex += 1
        ) {
          if (candidateChecks >= MAX_CYCLE_CANDIDATE_CHECKS) {
            capped = true;
            limitReason = "candidate_check_limit";
            break cycleSearch;
          }
          candidateChecks += 1;
          const right = connectors[rightIndex];
          const width = right.coordinate - left.coordinate;
          if (width < minimumWidth) continue;
          if (width > maximumWidth) break;
          const tolerance = input.junctionTolerancePx;
          if (
            top.start > left.coordinate + tolerance ||
            top.end < right.coordinate - tolerance ||
            bottom.start > left.coordinate + tolerance ||
            bottom.end < right.coordinate - tolerance
          ) {
            continue;
          }
          const key = [
            Math.round(left.coordinate),
            Math.round(top.coordinate),
            Math.round(right.coordinate),
            Math.round(bottom.coordinate),
          ].join(":");
          if (seen.has(key)) continue;
          seen.add(key);
          const confidence = Math.min(
            top.confidence,
            right.confidence,
            bottom.confidence,
            left.confidence
          );
          if (confidence < 0.72) continue;
          paths.push({
            id: `raster-cycle-${paths.length + 1}`,
            pageNumber: input.pageNumber,
            closed: true,
            segmentIds: [top.id, right.id, bottom.id, left.id],
            bbox: {
              left: roundPx(left.coordinate),
              top: roundPx(top.coordinate),
              right: roundPx(right.coordinate),
              bottom: roundPx(bottom.coordinate),
            },
            rectilinearScore: 1,
            confidence: roundPx(confidence),
            evidenceKind: "raster_linework",
          });
          if (paths.length >= MAX_SYNTHESIZED_CYCLES) {
            capped = true;
            limitReason = "cycle_count_limit";
            break cycleSearch;
          }
        }
      }
    }
  }
  return {
    paths: capped ? [] : paths,
    candidateChecks,
    capped,
    limitReason,
  };
}

function emptyResult(input: {
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  globalThreshold: number;
  tileSizePx: number;
  inkRatio: number;
  weakReason: string;
  normalization: RasterNormalization | null;
}): RasterLineworkResult {
  return {
    pageNumber: input.pageNumber,
    widthPx: input.widthPx,
    heightPx: input.heightPx,
    vectorSegments: [],
    vectorPaths: [],
    diagnostics: {
      globalThreshold: input.globalThreshold,
      tileSizePx: input.tileSizePx,
      inkRatio: input.inkRatio,
      horizontalRunCount: 0,
      verticalRunCount: 0,
      horizontalLineCount: 0,
      verticalLineCount: 0,
      closedCycleCount: 0,
      cycleCandidateChecks: 0,
      cycleSearchCapped: false,
      cycleSearchLimitReason: null,
      confidence: 0,
      weakReason: input.weakReason,
      normalization: input.normalization,
    },
  };
}

/**
 * Extracts only source-registered, axis-aligned raster linework. It deliberately
 * does not infer room labels, scale, openings or missing walls. Closed paths are
 * emitted only when four independently supported sides meet conservatively.
 */
export async function extractRasterLinework(
  bytes: Uint8Array,
  options: ExtractRasterLineworkOptions
): Promise<RasterLineworkResult> {
  const { default: sharp } = await import("sharp");
  const decoded = await sharp(bytes)
    .rotate()
    .flatten({ background: "#ffffff" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = decoded.info.width;
  const height = decoded.info.height;
  if (
    (options.expectedWidthPx !== undefined &&
      options.expectedWidthPx !== width) ||
    (options.expectedHeightPx !== undefined &&
      options.expectedHeightPx !== height)
  ) {
    throw new Error(
      `Raster derivative dimensions ${width}x${height} do not match registered page ${options.expectedWidthPx ?? width}x${options.expectedHeightPx ?? height}`
    );
  }
  const minimumDimension = Math.min(width, height);
  const adaptive = makeAdaptiveInkMask(
    new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength),
    width,
    height,
    options.tileSizePx ??
      clamp(Math.round(minimumDimension / 12), 48, DEFAULT_TILE_SIZE_PX)
  );
  if (adaptive.inkRatio < 0.00015 || adaptive.inkRatio > 0.32) {
    return emptyResult({
      pageNumber: options.pageNumber,
      widthPx: width,
      heightPx: height,
      globalThreshold: adaptive.globalThreshold,
      tileSizePx: adaptive.tileSize,
      inkRatio: adaptive.inkRatio,
      normalization: options.normalization ?? null,
      weakReason:
        adaptive.inkRatio < 0.00015
          ? "too_little_axis_linework"
          : "excessive_ink_or_filled_regions",
    });
  }

  const maximumGapPx = clamp(Math.round(minimumDimension * 0.0025), 1, 4);
  const minimumHorizontalLength = Math.max(18, width * 0.035);
  const minimumVerticalLength = Math.max(18, height * 0.035);
  const horizontalRuns = collectRuns({
    mask: adaptive.mask,
    width,
    height,
    orientation: "horizontal",
    minimumLengthPx: minimumHorizontalLength,
    maximumGapPx,
  });
  const verticalRuns = collectRuns({
    mask: adaptive.mask,
    width,
    height,
    orientation: "vertical",
    minimumLengthPx: minimumVerticalLength,
    maximumGapPx,
  });
  const maximumBandThicknessPx = clamp(
    Math.round(minimumDimension * 0.018),
    6,
    28
  );
  const endpointTolerancePx = clamp(
    Math.round(minimumDimension * 0.008),
    3,
    12
  );
  const unmerged = [
    ...mergeRunsIntoLines({
      runs: horizontalRuns,
      orientation: "horizontal",
      maximumBandThicknessPx,
      endpointTolerancePx,
    }),
    ...mergeRunsIntoLines({
      runs: verticalRuns,
      orientation: "vertical",
      maximumBandThicknessPx,
      endpointTolerancePx,
    }),
  ];
  const lines = mergeCollinearLines(
    unmerged,
    clamp(Math.round(minimumDimension * 0.002), 1, 3),
    maximumGapPx
  );
  const vectorSegments = lines.map((line) =>
    lineToSegment(line, options.pageNumber)
  );
  const cycleSearch = synthesizeClosedCycles({
    lines,
    pageNumber: options.pageNumber,
    widthPx: width,
    heightPx: height,
    junctionTolerancePx: clamp(
      Math.round(minimumDimension * 0.006),
      2,
      8
    ),
  });
  const vectorPaths = cycleSearch.paths;
  const horizontalLineCount = lines.filter(
    (line) => line.orientation === "horizontal"
  ).length;
  const verticalLineCount = lines.length - horizontalLineCount;
  const confidence = vectorPaths.length
    ? Math.min(
        ...vectorPaths.map((path) => path.confidence ?? path.rectilinearScore)
      )
    : lines.length
      ? lines.reduce((sum, line) => sum + line.confidence, 0) / lines.length
      : 0;
  return {
    pageNumber: options.pageNumber,
    widthPx: width,
    heightPx: height,
    vectorSegments,
    vectorPaths,
    diagnostics: {
      globalThreshold: adaptive.globalThreshold,
      tileSizePx: adaptive.tileSize,
      inkRatio: adaptive.inkRatio,
      horizontalRunCount: horizontalRuns.length,
      verticalRunCount: verticalRuns.length,
      horizontalLineCount,
      verticalLineCount,
      closedCycleCount: vectorPaths.length,
      cycleCandidateChecks: cycleSearch.candidateChecks,
      cycleSearchCapped: cycleSearch.capped,
      cycleSearchLimitReason: cycleSearch.limitReason,
      confidence: roundPx(confidence),
      weakReason:
        cycleSearch.capped
          ? "cycle_search_limit_exceeded"
          : vectorPaths.length === 0
            ? "no_conservative_closed_cycle"
            : null,
      normalization: options.normalization ?? null,
    },
  };
}
