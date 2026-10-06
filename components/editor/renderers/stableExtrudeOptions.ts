import type { ExtrudeGeometryOptions } from "three";

/**
 * React Three Fiber rebuilds a geometry whenever one of its `args` changes
 * identity. An inline `{ depth, bevelEnabled: false }` is a new object on every
 * render, so every re-render (a hover, a camera cutaway change) rebuilt every
 * extruded wall, slab and structure in the plan. Same depth, same object.
 * ExtrudeGeometry only reads its options, so sharing them is safe.
 */
const optionsByKey = new Map<string, ExtrudeGeometryOptions>();
const MAXIMUM_CACHED_OPTIONS = 512;

export function stableExtrudeOptions(
  depth: number,
  steps?: number
): ExtrudeGeometryOptions {
  const key = `${depth}:${steps ?? ""}`;
  let options = optionsByKey.get(key);
  if (!options) {
    if (optionsByKey.size >= MAXIMUM_CACHED_OPTIONS) optionsByKey.clear();
    options =
      steps === undefined
        ? { depth, bevelEnabled: false }
        : { depth, bevelEnabled: false, steps };
    optionsByKey.set(key, options);
  }
  return options;
}
