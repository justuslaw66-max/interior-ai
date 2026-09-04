/**
 * Canonical numeric tolerances for editor-domain geometry.
 *
 * These values preserve the established renderer behavior. Callers should use
 * the narrowest named tolerance instead of introducing an unnamed epsilon.
 */
export const EDITOR_GEOMETRY_TOLERANCES = Object.freeze({
  /** General floating-point loop/boundary comparison. */
  boundaryMeters: 0.000001,
  /** Degenerate pointer vector used while resolving a rotation handle angle. */
  rotationVectorMeters: 0.0001,
  /** Point/segment and polygon intersection comparisons. */
  polygonMeters: 0.0001,
  /** Wall segment overlap, slicing, and zero-length threshold. */
  wallSegmentMeters: 0.001,
  /** Clearance added while searching around polygon holes. */
  clearanceMeters: 0.001,
  /** Difference at which authored and visual dimensions are meaningfully distinct. */
  dimensionMeters: 0.001,
  /** Visual alignment threshold while drawing rooms and walls. */
  drawSnapMeters: 0.01,
});

/** Thin visual wall band used by the shared house-plan scene renderers. */
export const HOUSE_PLAN_RENDERED_WALL_THICKNESS_METERS = 0.025;

export function isWithinEditorTolerance(
  first: number,
  second: number,
  tolerance: number
): boolean {
  const representationSlack =
    Number.EPSILON * Math.max(1, Math.abs(first), Math.abs(second));
  return Math.abs(first - second) <= tolerance + representationSlack;
}

export function isWithinEditorBoundary(
  value: number,
  lowerBound: number,
  upperBound: number,
): boolean {
  const tolerance = EDITOR_GEOMETRY_TOLERANCES.boundaryMeters;
  return value >= lowerBound - tolerance && value <= upperBound + tolerance;
}
