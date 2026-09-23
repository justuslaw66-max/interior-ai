import {
  pointInPolygon,
  sourcePointsForClosedPath,
  type RegisteredPageEvidence,
  type SourcePointPx,
  type SourceVectorPath,
} from "./deterministic-evidence";

export type RegisteredWallFootprintBand = {
  pathId: string;
  bbox: SourceVectorPath["bbox"];
  sourcePoints: SourcePointPx[];
  fillRatio: number;
  labelIndexes: number[];
};

function containsPoint(
  bbox: SourceVectorPath["bbox"],
  point: SourcePointPx,
  padding = 0
) {
  return (
    point.x >= bbox.left - padding &&
    point.x <= bbox.right + padding &&
    point.y >= bbox.top - padding &&
    point.y <= bbox.bottom + padding
  );
}

function polygonArea(points: SourcePointPx[]) {
  return Math.abs(
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

/**
 * Finds source-authored wall-footprint bands without promoting their bounding
 * boxes or concavities to rooms. Architectural PDFs commonly stroke/fill a
 * thin C/U-shaped polygon around a room while doors and windows remain gaps.
 * Those paths are useful deterministic evidence, but they are not room loops.
 */
export function detectRegisteredWallFootprintBands(
  page: RegisteredPageEvidence
): RegisteredWallFootprintBand[] {
  const minWidth = page.widthPx * 0.055;
  const minHeight = page.heightPx * 0.045;
  const maxWidth = page.widthPx * 0.85;
  const maxHeight = page.heightPx * 0.85;
  const labels = page.semantics.roomLabels
    .map((label, index) => ({
      index,
      confidence: label.confidence,
      center: {
        x: label.centerXRatio * page.widthPx,
        y: label.centerYRatio * page.heightPx,
      },
    }))
    .filter((entry) => entry.confidence >= 0.45);

  return page.vectorPaths.flatMap((path) => {
    const width = path.bbox.right - path.bbox.left;
    const height = path.bbox.bottom - path.bbox.top;
    if (
      path.evidenceKind !== "pdf_vector" ||
      !path.closed ||
      path.containsCurves ||
      path.rectilinearScore < 0.8 ||
      (path.confidence ?? 1) < 0.68 ||
      path.segmentIds.length < 6 ||
      width < minWidth ||
      height < minHeight ||
      width > maxWidth ||
      height > maxHeight ||
      (path.paintOperation !== "stroke" &&
        path.paintOperation !== "fill" &&
        path.paintOperation !== "fill_stroke")
    ) {
      return [];
    }
    const sourcePoints = sourcePointsForClosedPath(page, path);
    if (!sourcePoints) return [];
    const bboxArea = width * height;
    const fillRatio = bboxArea > 0 ? polygonArea(sourcePoints) / bboxArea : 1;
    // A low fill ratio distinguishes a thin wall footprint from a room face.
    // The upper bound is deliberately conservative: uncertain solid polygons
    // stay unclassified and therefore cannot influence automatic topology.
    if (fillRatio < 0.02 || fillRatio > 0.45) return [];
    const labelIndexes = labels
      .filter(
        (label) =>
          containsPoint(path.bbox, label.center, 3) &&
          !pointInPolygon(label.center, sourcePoints)
      )
      .map((label) => label.index);
    // Semantic labels strengthen the evidence but are not required for the
    // physical wall-band classification. This keeps unlabeled plans usable
    // without relaxing any of the path, fill-ratio, or registration checks.
    return [{ pathId: path.id, bbox: path.bbox, sourcePoints, fillRatio, labelIndexes }];
  });
}
