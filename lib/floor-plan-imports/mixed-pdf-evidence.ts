import {
  pointInPolygon,
  transformSourcePoint,
  type Matrix2D,
  type RegisteredPageEvidence,
  type SourcePointPx,
  type SourceVectorSegment,
} from "./deterministic-evidence";

const MAX_SEGMENTS = 20_000;
const MAX_PATHS = 8_000;
const CELL_SIZE_PX = 128;

export function appendPdfRasterRegion(regions: SourcePointPx[][], operation: number,
  ops: Record<string, number>, transform: Matrix2D, page: { widthPx: number; heightPx: number }) {
  const direct = [ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintImageMaskXObject, ops.paintSolidColorImageMask];
  if (direct.includes(operation) && regions.length < 1_000) {
    regions.push([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
      .map((point) => transformSourcePoint(transform, point)));
    return;
  }
  const grouped = [ops.paintImageXObjectRepeat, ops.paintImageMaskXObjectRepeat,
    ops.paintImageMaskXObjectGroup, ops.paintInlineImageXObjectGroup];
  if (grouped.includes(operation) || (direct.includes(operation) && regions.length === 1_000)) {
    // Grouped images carry extra transforms. Analyze the full rendered page,
    // deduplicate native copies, and retain strokes as uncertain evidence.
    regions.splice(0, regions.length, [{ x: 0, y: 0 }, { x: page.widthPx, y: 0 },
      { x: page.widthPx, y: page.heightPx }, { x: 0, y: page.heightPx }]);
  }
}

function bounds(segment: SourceVectorSegment, padding = 0) {
  return {
    left: Math.min(segment.start.x, segment.end.x) - padding,
    right: Math.max(segment.start.x, segment.end.x) + padding,
    top: Math.min(segment.start.y, segment.end.y) - padding,
    bottom: Math.max(segment.start.y, segment.end.y) + padding,
  };
}

function cells(segment: SourceVectorSegment, padding = 0): string[] {
  const box = bounds(segment, padding);
  const keys: string[] = [];
  for (let x = Math.floor(box.left / CELL_SIZE_PX); x <= Math.floor(box.right / CELL_SIZE_PX); x++) {
    for (let y = Math.floor(box.top / CELL_SIZE_PX); y <= Math.floor(box.bottom / CELL_SIZE_PX); y++) {
      // Very long diagonal paths use a separate bounded list.
      if (keys.length >= 512) return [];
      keys.push(`${x}:${y}`);
    }
  }
  return keys;
}

function nativeCoversRaster(native: SourceVectorSegment, raster: SourceVectorSegment) {
  const dx = native.end.x - native.start.x;
  const dy = native.end.y - native.start.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.01) return false;
  const tolerance = Math.max(2, native.strokeWidthPx / 2 + 1);
  const liesOnNative = (point: SourcePointPx) => {
    const x = point.x - native.start.x;
    const y = point.y - native.start.y;
    const along = (x * dx + y * dy) / length;
    return Math.abs(x * dy - y * dx) / length <= tolerance &&
      along >= -tolerance && along <= length + tolerance;
  };
  return liesOnNative(raster.start) && liesOnNative(raster.end);
}

function nativeCoverage(segments: SourceVectorSegment[]) {
  const index = new Map<string, SourceVectorSegment[]>();
  const long: SourceVectorSegment[] = [];
  for (const segment of segments) {
    const keys = cells(segment, Math.max(2, segment.strokeWidthPx / 2 + 1));
    if (!keys.length) long.push(segment);
    for (const key of keys) {
      const bucket = index.get(key) ?? [];
      bucket.push(segment);
      index.set(key, bucket);
    }
  }
  return (segment: SourceVectorSegment) => {
    const keys = cells(segment);
    const candidates = keys.length
      ? new Set([...long, ...keys.flatMap((key) => index.get(key) ?? [])])
      : segments;
    for (const candidate of candidates) {
      if (nativeCoversRaster(candidate, segment)) return true;
    }
    return false;
  };
}

function inRasterRegion(segment: SourceVectorSegment, regions: SourcePointPx[][]) {
  return regions.some((region) =>
    pointInPolygon(segment.start, region) && pointInPolygon(segment.end, region)
  );
}

/** Native geometry always wins; an incomplete raster path stays drawing evidence. */
export function mergeMixedPdfEvidence(
  native: RegisteredPageEvidence,
  raster: RegisteredPageEvidence | undefined
): RegisteredPageEvidence {
  if (!raster) return native;
  const covered = nativeCoverage(native.vectorSegments);
  const regions = native.rasterRegions;
  const candidates = raster.vectorSegments.filter((segment) =>
    (!regions?.length || inRasterRegion(segment, regions)) && !covered(segment)
  );
  const retained = candidates.slice(0, Math.max(0, MAX_SEGMENTS - native.vectorSegments.length));
  const retainedIds = new Set(retained.map(({ id }) => id));
  // A partially deduplicated cycle is not proof of a complete room boundary.
  const paths = raster.vectorPaths.filter((path) =>
    path.segmentIds.length > 0 && path.segmentIds.every((id) => retainedIds.has(id))
  ).slice(0, Math.max(0, MAX_PATHS - native.vectorPaths.length));
  const capped = retained.length < candidates.length;
  return {
    ...native,
    vectorSegments: [...native.vectorSegments, ...retained],
    vectorPaths: [...native.vectorPaths, ...paths],
    semantics: {
      ...native.semantics,
      notes: [...native.semantics.notes, ...raster.semantics.notes,
        `Retained ${retained.length} raster strokes alongside ${native.vectorSegments.length} native PDF strokes; native-overlapping raster copies were omitted.`,
        ...(capped ? ["Page evidence limit reached; review the source for remaining artwork."] : []),
      ],
    },
  };
}

export function pageLineworkKind(page: RegisteredPageEvidence) {
  const raster = page.vectorSegments.some((segment) => segment.evidenceKind === "raster_linework");
  const native = page.vectorSegments.some((segment) => segment.evidenceKind !== "raster_linework");
  return raster && native ? "mixed" : raster ? "raster_linework" : "pdf_vector";
}

export function pageGeometryBasis(page: RegisteredPageEvidence | undefined, mimeType: string) {
  return mimeType === "application/pdf" && (!page || pageLineworkKind(page) === "pdf_vector")
    ? "vector_traced" as const : "raster_traced" as const;
}

/** Preserve the text baseline orientation when locating native PDF glyph runs. */
export function positionedPdfTextBounds(matrix: Matrix2D, widthPx: number, heightPx: number) {
  const origin = transformSourcePoint(matrix, { x: 0, y: 0 });
  const advance = Math.hypot(matrix[0], matrix[1]) || 1;
  const ascent = Math.hypot(matrix[2], matrix[3]) || 1;
  const u = { x: matrix[0] / advance, y: matrix[1] / advance };
  const v = { x: matrix[2] / ascent, y: matrix[3] / ascent };
  return {
    center: { x: origin.x + u.x * widthPx / 2 + v.x * heightPx / 2,
      y: origin.y + u.y * widthPx / 2 + v.y * heightPx / 2 },
    widthPx: Math.abs(u.x * widthPx) + Math.abs(v.x * heightPx),
    heightPx: Math.abs(u.y * widthPx) + Math.abs(v.y * heightPx),
    rotationDegrees: Math.atan2(u.y, u.x) * 180 / Math.PI,
  };
}
