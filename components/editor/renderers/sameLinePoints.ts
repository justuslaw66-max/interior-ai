/** A Line point as drei accepts it: a tuple, a Vector2 or Vector3, or a flat coordinate. */
export type LinePointValue = number | readonly number[] | { x: number; y: number; z?: number };

// A guard rather than Array.isArray, which does not narrow readonly tuples out of a union.
function isTuple(point: LinePointValue): point is readonly number[] {
  return Array.isArray(point);
}

function samePoint(first: LinePointValue, second: LinePointValue) {
  if (first === second) return true;
  if (isTuple(first) || isTuple(second)) {
    return (
      isTuple(first) &&
      isTuple(second) &&
      first.length === second.length &&
      first.every((value, index) => value === second[index])
    );
  }
  if (typeof first === "number" || typeof second === "number") return false;
  return first.x === second.x && first.y === second.y && (first.z ?? 0) === (second.z ?? 0);
}

/** Whether two Line point lists hold the same coordinates, whatever their array identities. */
export function sameLinePoints(first: readonly LinePointValue[], second: readonly LinePointValue[]) {
  return (
    first === second ||
    (first.length === second.length && first.every((point, index) => samePoint(point, second[index])))
  );
}
