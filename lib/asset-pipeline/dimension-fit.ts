import type { AssetPipelineCheck } from "./types";

/**
 * Dimension fit: how far the renderer has to stretch a GLB, per axis, to reach
 * the catalog W/D/H. `normalizeGLBScene` scales each axis independently
 * (sx = width / size.x, sy = height / size.y, sz = depth / size.z), so any
 * difference between the three factors distorts the product's proportions.
 * This module measures that distortion at import time, where it can still be
 * fixed by regenerating the model, instead of being hidden at render time.
 */

export type Vec3Size = { x: number; y: number; z: number };

export type DimensionFitInput = {
  /** Measured GLB scene bounds, in the file's own units (expected metres). */
  glbSize: Vec3Size;
  /** Catalog dimensions in millimetres: w = width (x), d = depth (z), h = height (y). */
  dimsMm: { w: number; d: number; h: number };
  /** Mirrors GLBCalibration.swapWidthDepthAxes for models authored rotated 90°. */
  swapWidthDepthAxes?: boolean;
  /** Relative deviation (0.05 = 5 %) that is still accepted silently. */
  warnRatio?: number;
  /** Relative deviation above which the import is blocked. */
  errorRatio?: number;
};

export type DimensionFitMetrics = {
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  /** sz / sx − 1: how much deeper (+) or shallower (−) the render is than the mesh's own proportions. */
  depthError: number;
  /** sy / sx − 1. */
  heightError: number;
  /** max(|depthError|, |heightError|). */
  worstError: number;
  /** Same figure computed with width and depth swapped. */
  swappedWorstError: number;
  /** Uniform factor needed on the longest axis; ≈1 means the file is already in metres at real size. */
  uniformScale: number;
};

export type DimensionFitResult = {
  metrics: DimensionFitMetrics;
  checks: AssetPipelineCheck[];
};

export const DEFAULT_DIMENSION_WARN_RATIO = 0.05;
export const DEFAULT_DIMENSION_ERROR_RATIO = 0.15;

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function axisErrors(glb: Vec3Size, targetWidthM: number, targetDepthM: number, targetHeightM: number) {
  const sx = targetWidthM / glb.x;
  const sy = targetHeightM / glb.y;
  const sz = targetDepthM / glb.z;
  const depthError = sz / sx - 1;
  const heightError = sy / sx - 1;
  return { sx, sy, sz, depthError, heightError, worst: Math.max(Math.abs(depthError), Math.abs(heightError)) };
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function evaluateDimensionFit(input: DimensionFitInput): DimensionFitResult | null {
  const { glbSize, dimsMm } = input;
  const axes = [glbSize.x, glbSize.y, glbSize.z, dimsMm.w, dimsMm.d, dimsMm.h];
  if (!axes.every(isPositiveFinite)) return null;

  const widthM = dimsMm.w / 1000;
  const depthM = dimsMm.d / 1000;
  const heightM = dimsMm.h / 1000;
  const swapped = input.swapWidthDepthAxes === true;
  const current = swapped
    ? axisErrors(glbSize, depthM, widthM, heightM)
    : axisErrors(glbSize, widthM, depthM, heightM);
  const alternate = swapped
    ? axisErrors(glbSize, widthM, depthM, heightM)
    : axisErrors(glbSize, depthM, widthM, heightM);

  const warnRatio = input.warnRatio ?? DEFAULT_DIMENSION_WARN_RATIO;
  const errorRatio = input.errorRatio ?? DEFAULT_DIMENSION_ERROR_RATIO;
  const longestGlb = Math.max(glbSize.x, glbSize.y, glbSize.z);
  const longestTarget = Math.max(widthM, depthM, heightM);

  const metrics: DimensionFitMetrics = {
    scaleX: current.sx,
    scaleY: current.sy,
    scaleZ: current.sz,
    depthError: current.depthError,
    heightError: current.heightError,
    worstError: current.worst,
    swappedWorstError: alternate.worst,
    uniformScale: longestTarget / longestGlb,
  };

  return { metrics, checks: buildChecks(metrics, warnRatio, errorRatio, swapped) };
}

function buildChecks(
  m: DimensionFitMetrics,
  warnRatio: number,
  errorRatio: number,
  swapped: boolean
): AssetPipelineCheck[] {
  const checks: AssetPipelineCheck[] = [];
  const summary = `depth ${pct(m.depthError)}, height ${pct(m.heightError)} relative to a uniform width fit`;

  if (m.worstError > warnRatio && m.swappedWorstError <= warnRatio) {
    checks.push({
      severity: "warning",
      code: "AXIS_SWAP_SUSPECTED",
      message: `Model fits the catalog dimensions only with width and depth swapped (${pct(m.swappedWorstError)} vs ${pct(m.worstError)}).`,
      details: swapped
        ? "Calibration sets swapWidthDepthAxes but the mesh is already oriented correctly; remove the flag."
        : "The mesh is authored rotated 90°. Rotate it on export, or set swapWidthDepthAxes in the calibration for this asset.",
    });
    return checks;
  }

  if (m.worstError > errorRatio) {
    checks.push({
      severity: "error",
      code: "DIMENSION_MISMATCH",
      message: `Mesh proportions differ from the catalog dimensions by ${pct(m.worstError)} (${summary}).`,
      details:
        "The renderer stretches each axis independently, so this product will render visibly distorted. Regenerate from front and side references, or correct the catalog dimensions.",
    });
  } else if (m.worstError > warnRatio) {
    checks.push({
      severity: "warning",
      code: "DIMENSION_DRIFT",
      message: `Mesh proportions differ from the catalog dimensions by ${pct(m.worstError)} (${summary}).`,
      details: "Acceptable for placement; expect a slight stretch in the 3D view.",
    });
  }

  if (m.uniformScale < 0.9 || m.uniformScale > 1.1) {
    checks.push({
      severity: "warning",
      code: "GLB_NOT_REAL_SCALE",
      message: `GLB is not authored at real size (needs ×${m.uniformScale.toFixed(2)} to reach the catalog size).`,
      details: "Typical of generator output normalised to ~1 m. Scale the mesh to metres on export so the file is usable outside the editor.",
    });
  }

  return checks;
}
