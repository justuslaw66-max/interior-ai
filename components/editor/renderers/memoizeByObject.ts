/**
 * Caches one result per input object. React Three Fiber rebuilds a geometry
 * whenever one of its `args` changes identity, so a renderer that builds a
 * shape from, say, a room object should hand back the same shape for the same
 * room on every re-render (a hover, a selection, a pan).
 */
export function memoizeByObject<Input extends object, Output extends object>(
  build: (input: Input) => Output
): (input: Input) => Output {
  const cache = new WeakMap<Input, Output>();
  return (input) => {
    const cached = cache.get(input);
    if (cached) return cached;
    const output = build(input);
    cache.set(input, output);
    return output;
  };
}
