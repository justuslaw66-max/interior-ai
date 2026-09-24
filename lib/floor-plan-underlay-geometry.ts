/** Existing source-registration deformation, not a new image correction. */
export type FloorPlanReferenceDeformation = { skewX?: number; flipY?: boolean };

/** XZ basis shared by underlay rendering, pixel picking and vector export. */
export function underlayPlanBasis(input: FloorPlanReferenceDeformation & { rotationDeg: number }) {
  const angle = input.rotationDeg * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const skew = input.skewX ?? 0, flip = input.flipY ? -1 : 1;
  if (!Number.isFinite(angle) || !Number.isFinite(skew)) throw new Error("Invalid source underlay transform.");
  return { a: cos, b: -sin, c: cos * skew + sin * flip, d: -sin * skew + cos * flip };
}

export function underlayLocalToPlan(input: FloorPlanReferenceDeformation & { rotationDeg: number }, x: number, z: number) {
  const { a, b, c, d } = underlayPlanBasis(input);
  return { x: a * x + c * z, z: b * x + d * z };
}

export function underlayPlanToLocal(input: FloorPlanReferenceDeformation & { rotationDeg: number }, x: number, z: number) {
  const { a, b, c, d } = underlayPlanBasis(input), determinant = a * d - b * c;
  return { x: (d * x - c * z) / determinant, z: (-b * x + a * z) / determinant };
}
