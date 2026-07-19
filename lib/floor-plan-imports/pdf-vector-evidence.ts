import {
  transformSourcePoint,
  type Matrix2D,
  type SourcePointPx,
  type SourceVectorCurveEvidence,
  type SourceVectorPath,
  type SourceVectorSegment,
  type SourceVectorSubpath,
} from "./deterministic-evidence";

export type PdfDrawPathEvidenceOptions = {
  data: readonly number[];
  matrix: Matrix2D;
  pageNumber: number;
  pathIndex: number;
  strokeWidthPx: number;
  paintOperation: SourceVectorPath["paintOperation"];
  sourceOperatorIndex: number;
  graphicsStateDepth: number;
  sourceFormPath: readonly string[];
  maxSegments: number;
  maxCurves?: number;
};

function roundPx(value: number) {
  return Math.round(value * 1000) / 1000;
}

function roundedPoint(point: SourcePointPx): SourcePointPx {
  return { x: roundPx(point.x), y: roundPx(point.y) };
}

function pointBounds(points: readonly SourcePointPx[]) {
  return {
    left: Math.min(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    right: Math.max(...points.map((point) => point.x)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

type MutableSubpath = {
  id: string;
  index: number;
  start: SourcePointPx;
  cursor: SourcePointPx;
  points: SourcePointPx[];
  segmentIds: string[];
  curveIds: string[];
  closed: boolean;
  commandIndex: number;
};

/**
 * Retains exact PDF draw-operation, form, subpath and curve provenance. Curves
 * remain curve evidence rather than being flattened into wall segments.
 */
export function parsePdfDrawPathEvidence(
  options: PdfDrawPathEvidenceOptions
): { path: SourceVectorPath; segments: SourceVectorSegment[] } | null {
  const {
    data,
    matrix,
    pageNumber,
    pathIndex,
    strokeWidthPx,
    paintOperation,
    sourceOperatorIndex,
    graphicsStateDepth,
    sourceFormPath,
    maxSegments,
  } = options;
  const maxCurves = options.maxCurves ?? maxSegments;
  const pathId = `p${pageNumber}-path${pathIndex}`;
  const allPoints: SourcePointPx[] = [];
  const segments: SourceVectorSegment[] = [];
  const curves: SourceVectorCurveEvidence[] = [];
  const subpaths: SourceVectorSubpath[] = [];
  let current: MutableSubpath | null = null;
  let segmentIndex = 0;
  let curveIndex = 0;
  let overflow = false;

  const sourcePoint = (x: number, y: number) =>
    roundedPoint(transformSourcePoint(matrix, { x, y }));

  const finishSubpath = () => {
    if (!current) return;
    if (
      !current.closed &&
      Math.hypot(
        current.cursor.x - current.start.x,
        current.cursor.y - current.start.y
      ) <= 0.5
    ) {
      current.closed = true;
    }
    if (current.segmentIds.length || current.curveIds.length) {
      subpaths.push({
        id: current.id,
        index: current.index,
        closed: current.closed,
        segmentIds: current.segmentIds,
        curveIds: current.curveIds,
        bbox: pointBounds(current.points),
      });
    }
    current = null;
  };

  const startSubpath = (point: SourcePointPx) => {
    finishSubpath();
    const index = subpaths.length;
    current = {
      id: `${pathId}-sub${index + 1}`,
      index,
      start: point,
      cursor: point,
      points: [point],
      segmentIds: [],
      curveIds: [],
      closed: false,
      commandIndex: 0,
    };
    allPoints.push(point);
  };

  const addLine = (end: SourcePointPx, command: "line" | "close") => {
    if (!current) return;
    if (segments.length >= maxSegments) {
      overflow = true;
      return;
    }
    const id = `${pathId}-s${segmentIndex++}`;
    segments.push({
      id,
      pageNumber,
      start: current.cursor,
      end,
      strokeWidthPx: roundPx(strokeWidthPx),
      confidence: 1,
      evidenceKind: "pdf_vector",
      sourceSubpathId: current.id,
      sourceCommandIndex: current.commandIndex++,
      sourceCommand: command,
    });
    current.segmentIds.push(id);
    current.cursor = end;
    current.points.push(end);
    allPoints.push(end);
  };

  const addCurve = (
    command: SourceVectorCurveEvidence["command"],
    controlPoints: SourcePointPx[],
    end: SourcePointPx
  ) => {
    if (!current) return;
    if (curves.length >= maxCurves) {
      overflow = true;
      return;
    }
    const id = `${pathId}-c${curveIndex++}`;
    curves.push({
      id,
      pageNumber,
      sourceSubpathId: current.id,
      sourceCommandIndex: current.commandIndex++,
      command,
      start: current.cursor,
      controlPoints,
      end,
    });
    current.curveIds.push(id);
    current.cursor = end;
    current.points.push(...controlPoints, end);
    allPoints.push(...controlPoints, end);
  };

  for (let index = 0; index < data.length; ) {
    const operation = data[index++];
    if (operation === 0) {
      if (index + 1 >= data.length) return null;
      startSubpath(sourcePoint(data[index++], data[index++]));
    } else if (operation === 1) {
      if (index + 1 >= data.length) return null;
      addLine(sourcePoint(data[index++], data[index++]), "line");
    } else if (operation === 2) {
      if (index + 5 >= data.length) return null;
      const controls = [
        sourcePoint(data[index++], data[index++]),
        sourcePoint(data[index++], data[index++]),
      ];
      addCurve("cubic", controls, sourcePoint(data[index++], data[index++]));
    } else if (operation === 3) {
      if (index + 3 >= data.length) return null;
      const control = sourcePoint(data[index++], data[index++]);
      addCurve("quadratic", [control], sourcePoint(data[index++], data[index++]));
    } else if (operation === 4) {
      const active = current as MutableSubpath | null;
      if (active) {
        if (
          Math.hypot(
            active.cursor.x - active.start.x,
            active.cursor.y - active.start.y
          ) > 0.01
        ) {
          addLine(active.start, "close");
        }
        active.closed = true;
        active.cursor = active.start;
      }
    } else {
      return null;
    }
    if (overflow) return null;
  }
  finishSubpath();
  if (!subpaths.length || !allPoints.length) return null;

  const rectilinearCount = segments.filter((segment) => {
    const dx = Math.abs(segment.end.x - segment.start.x);
    const dy = Math.abs(segment.end.y - segment.start.y);
    return Math.min(dx, dy) <= Math.max(1, Math.max(dx, dy) * 0.02);
  }).length;
  return {
    path: {
      id: pathId,
      pageNumber,
      closed: subpaths.every((subpath) => subpath.closed),
      segmentIds: segments.map((segment) => segment.id),
      bbox: pointBounds(allPoints),
      rectilinearScore:
        rectilinearCount / Math.max(1, segments.length + curves.length),
      containsCurves: curves.length > 0,
      confidence: 1,
      evidenceKind: "pdf_vector",
      paintOperation,
      sourceOperatorIndex,
      graphicsStateDepth,
      sourceFormPath: [...sourceFormPath],
      sourceTransform: [...matrix] as Matrix2D,
      subpaths,
      curves,
    },
    segments,
  };
}
