import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * A stable stand-in for `callback`: the same function on every render, calling
 * whichever `callback` the last render passed, or undefined while there is
 * none. Plan handlers arrive as fresh closures on every page render; passing
 * these instead lets memoized plan parts (walls, openings, room fills) skip a
 * re-render that only replaced a handler.
 */
export function useLatestCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result
): (...args: Args) => Result;
export function useLatestCallback<Args extends unknown[], Result>(
  callback: ((...args: Args) => Result) | undefined
): ((...args: Args) => Result) | undefined;
export function useLatestCallback<Args extends unknown[], Result>(
  callback: ((...args: Args) => Result) | undefined
) {
  const latest = useRef(callback);
  // Insertion effects run before layout effects, so a child's layout effect already calls the new handler.
  useInsertionEffect(() => {
    latest.current = callback;
  });
  const stable = useCallback((...args: Args) => latest.current?.(...args) as Result, []);
  return callback ? stable : undefined;
}
