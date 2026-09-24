import type { FloorPlanPointMmV2, FloorPlanSourceCalibrationV2 } from "../floor-plan-document-v2";
import { inversePhotoMatrix, mapPhotoPoint, type PhotoPoint } from "../floor-plan-photo-math";
import { originalPhotoPoint } from "../floor-plan-photo-constraints";

export function sourceResidualPx(calibration:FloorPlanSourceCalibrationV2,first:PhotoPoint,second:PhotoPoint) {
  const input=calibration.photoCorrection?.constraints;
  const a=input?originalPhotoPoint(input,first):first,b=input?originalPhotoPoint(input,second):second;
  return Math.hypot(a.x-b.x,a.y-b.y);
}

type SourcePoint = { xPx: number; yPx: number };
type Project = (point: FloorPlanPointMmV2) => SourcePoint;
export type FloorPlanSourceProjection = {
  project: Project;
  unproject: (point: PhotoPoint) => FloorPlanPointMmV2 | null;
  computedRmsErrorPx: number;
};

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const size = matrix.length;
  if (!size || vector.length !== size || matrix.some((row) => row.length !== size)) {
    return null;
  }
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(rows[row][pivot]) > Math.abs(rows[best][pivot])) best = row;
    }
    if (Math.abs(rows[best][pivot]) < 1e-12) return null;
    [rows[pivot], rows[best]] = [rows[best], rows[pivot]];
    const divisor = rows[pivot][pivot];
    for (let column = pivot; column <= size; column += 1) {
      rows[pivot][column] /= divisor;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = rows[row][pivot];
      for (let column = pivot; column <= size; column += 1) {
        rows[row][column] -= factor * rows[pivot][column];
      }
    }
  }
  return rows.map((row) => row[size]);
}

function solveLeastSquares(rows: number[][], values: number[]): number[] | null {
  if (!rows.length || rows.length !== values.length) return null;
  const width = rows[0]?.length ?? 0;
  if (!width || rows.some((row) => row.length !== width)) return null;
  const normal = Array.from({ length: width }, () => Array(width).fill(0) as number[]);
  const target = Array(width).fill(0) as number[];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    for (let y = 0; y < width; y += 1) {
      target[y] += row[y] * values[rowIndex];
      for (let x = 0; x < width; x += 1) normal[y][x] += row[y] * row[x];
    }
  }
  return solveLinearSystem(normal, target);
}

function affineProjection(calibration: FloorPlanSourceCalibrationV2): Project | null {
  if (calibration.controlPoints.length < 3) return null;
  const rows = calibration.controlPoints.map((point) => [
    point.planMm.xMm,
    point.planMm.zMm,
    1,
  ]);
  const x = solveLeastSquares(
    rows,
    calibration.controlPoints.map((point) => point.sourcePx.x)
  );
  const y = solveLeastSquares(
    rows,
    calibration.controlPoints.map((point) => point.sourcePx.y)
  );
  if (!x || !y) return null;
  return (point) => ({
    xPx: x[0] * point.xMm + x[1] * point.zMm + x[2],
    yPx: y[0] * point.xMm + y[1] * point.zMm + y[2],
  });
}

/** Fits every control point, preserving reflection for two-point/collinear registration. */
function similarityProjection(calibration: FloorPlanSourceCalibrationV2): Project | null {
  if (calibration.controlPoints.length < 2) return null;
  const rows: number[][] = [];
  const values: number[] = [];
  const sign = calibration.reflected ? -1 : 1;
  for (const { planMm: { xMm, zMm }, sourcePx } of calibration.controlPoints) {
    rows.push([xMm, -sign * zMm, 1, 0]);
    values.push(sourcePx.x);
    rows.push([sign * zMm, xMm, 0, 1]);
    values.push(sourcePx.y);
  }
  const coefficients = solveLeastSquares(rows, values);
  if (!coefficients) return null;
  const [a, b, translateX, translateY] = coefficients;
  if (Math.hypot(a, b) < 1e-12) return null;
  return (point) => ({
    xPx: a * point.xMm - b * sign * point.zMm + translateX,
    yPx: b * point.xMm + a * sign * point.zMm + translateY,
  });
}

/**
 * Computes, rather than trusts, the registration RMS recorded on a source
 * calibration. Three or more non-collinear points use an affine transform;
 * two points (or degenerate affine controls) use a similarity transform.
 */
function buildSourceProjection(
  calibration: FloorPlanSourceCalibrationV2
): FloorPlanSourceProjection | null {
  const correction=calibration.photoCorrection;
  const normalized=correction?{...calibration,controlPoints:calibration.controlPoints.map((control)=>
    ({...control,sourcePx:mapPhotoPoint(correction.originalToCorrected,control.sourcePx)}))}:calibration;
  const affine=affineProjection(normalized)??similarityProjection(normalized);
  if (!affine) return null;
  const inverse=correction?inversePhotoMatrix(correction.originalToCorrected):null;
  const project:Project=(point)=> {
    const mapped=affine(point);
    if(!inverse) return mapped;
    const original=mapPhotoPoint(inverse,{x:mapped.xPx,y:mapped.yPx});
    return {xPx:original.x,yPx:original.y};
  };
  const unproject=(point:PhotoPoint)=>inverseAffine(affine,correction?mapPhotoPoint(correction.originalToCorrected,point):point);
  const squaredResiduals = calibration.controlPoints.map((point) => {
    const projected = project(point.planMm);
    return sourceResidualPx(calibration,{x:projected.xPx,y:projected.yPx},point.sourcePx)**2;
  });
  const computedRmsErrorPx = Math.sqrt(
    squaredResiduals.reduce((sum, residual) => sum + residual, 0) /
      squaredResiduals.length
  );
  if (!Number.isFinite(computedRmsErrorPx)) return null;
  return { project, unproject, computedRmsErrorPx };
}

function inverseAffine(project:Project,point:PhotoPoint):FloorPlanPointMmV2|null {
  const origin=project({xMm:0,zMm:0}), x=project({xMm:1,zMm:0}), z=project({xMm:0,zMm:1});
  const a=x.xPx-origin.xPx,b=z.xPx-origin.xPx,c=x.yPx-origin.yPx,d=z.yPx-origin.yPx,det=a*d-b*c;
  if(Math.abs(det)<1e-12) return null;
  return {xMm:(d*(point.x-origin.xPx)-b*(point.y-origin.yPx))/det,
    zMm:(a*(point.y-origin.yPx)-c*(point.x-origin.xPx))/det};
}

export function buildFloorPlanSourceProjection(calibration:FloorPlanSourceCalibrationV2):FloorPlanSourceProjection|null {
  try { return buildSourceProjection(calibration); } catch { return null; }
}
