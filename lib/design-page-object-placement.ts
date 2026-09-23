export type PlacementOffset = readonly [deltaX: number, deltaZ: number];

/**
 * Returns a small, deterministic search pattern around an item's footprint.
 * The bounded list keeps duplicate placement predictable and cheap enough to
 * evaluate synchronously during an editor command.
 */
export function buildNearbyDuplicateOffsets({
  widthMeters,
  depthMeters,
  clearanceMeters = 0.15,
}: {
  widthMeters: number;
  depthMeters: number;
  clearanceMeters?: number;
}): PlacementOffset[] {
  const stepX = Math.max(0.05, widthMeters + clearanceMeters);
  const stepZ = Math.max(0.05, depthMeters + clearanceMeters);
  const candidates: Array<{
    deltaX: number;
    deltaZ: number;
    order: number;
  }> = [];
  let order = 0;

  for (const ring of [1, 2]) {
    for (const [deltaX, deltaZ] of [
      [stepX * ring, 0],
      [-stepX * ring, 0],
      [0, stepZ * ring],
      [0, -stepZ * ring],
      [stepX * ring, stepZ * ring],
      [-stepX * ring, stepZ * ring],
      [stepX * ring, -stepZ * ring],
      [-stepX * ring, -stepZ * ring],
    ] as const) {
      candidates.push({ deltaX, deltaZ, order });
      order += 1;
    }
  }

  return candidates
    .sort((first, second) => {
      const distanceDelta =
        Math.hypot(first.deltaX, first.deltaZ) -
        Math.hypot(second.deltaX, second.deltaZ);
      return Math.abs(distanceDelta) > 1e-9
        ? distanceDelta
        : first.order - second.order;
    })
    .map(({ deltaX, deltaZ }) => [deltaX, deltaZ]);
}
