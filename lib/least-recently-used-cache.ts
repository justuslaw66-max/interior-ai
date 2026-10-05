export type LeastRecentlyUsedCache<Value> = {
  /** The cached value for `key`, or a new one from `build`, stored as the most recent. */
  get(key: string, build: () => Value): Value;
  /** Whether `key` is cached, without making it the most recent. */
  has(key: string): boolean;
  readonly size: number;
};

/** A string-keyed cache that keeps the `limit` most recently used values. */
export function createLeastRecentlyUsedCache<Value extends object>(
  limit: number
): LeastRecentlyUsedCache<Value> {
  const entries = new Map<string, Value>();
  return {
    get(key, build) {
      const cached = entries.get(key);
      if (cached) {
        entries.delete(key);
        entries.set(key, cached);
        return cached;
      }
      const value = build();
      entries.set(key, value);
      const oldest = entries.keys().next();
      if (entries.size > limit && !oldest.done) entries.delete(oldest.value);
      return value;
    },
    has(key) {
      return entries.has(key);
    },
    get size() {
      return entries.size;
    },
  };
}
