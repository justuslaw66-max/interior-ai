/**
 * Pure projection helpers shared by room surfaces and furniture. Canonical
 * elevation stays in integer millimetres at rest and is converted only at the
 * renderer boundary.
 */
export function resolveCanonicalFloorElevationMeters(value: {
  floorElevationMm?: number;
}): number | null {
  return typeof value.floorElevationMm === "number" &&
    Number.isInteger(value.floorElevationMm)
    ? value.floorElevationMm / 1000
    : null;
}

export function addFloorElevationToItemPosition(
  position: [number, number, number],
  floorElevationMeters: number
): [number, number, number] {
  return [
    position[0],
    (position[1] ?? 0) + floorElevationMeters,
    position[2],
  ];
}

export function removeFloorElevationFromItemPosition(
  position: [number, number, number],
  floorElevationMeters: number
): [number, number, number] {
  return [position[0], position[1] - floorElevationMeters, position[2]];
}
