export type GLBResourceCacheStatus = "network" | "cache-hit";

type GLBResourceCacheEntry<T> = {
  resource: Promise<T>;
  resolved: T | null;
  referenceCount: number;
  lastUsed: number;
  disposeWhenResolved: boolean;
  disposed: boolean;
};

export type GLBResourceLease<T> = {
  cacheStatus: GLBResourceCacheStatus;
  resource: Promise<T>;
  release: () => void;
};

class GLBResourceCache<T> {
  private readonly entries = new Map<string, GLBResourceCacheEntry<T>>();
  private usageClock = 0;

  constructor(
    private readonly maximumEntries: number,
    private readonly disposeResource: (resource: T) => void
  ) {}

  acquire(key: string, load: () => Promise<T>): GLBResourceLease<T> {
    const existing = this.entries.get(key);
    if (existing) return this.lease(existing, "cache-hit");

    let loadResult: Promise<T>;
    try {
      loadResult = load();
    } catch (error) {
      loadResult = Promise.reject(error);
    }
    const entry: GLBResourceCacheEntry<T> = {
      resource: Promise.resolve(null as T),
      resolved: null,
      referenceCount: 0,
      lastUsed: ++this.usageClock,
      disposeWhenResolved: false,
      disposed: false,
    };
    entry.resource = this.trackLoad(key, entry, loadResult);
    this.entries.set(key, entry);
    const acquired = this.lease(entry, "network");
    this.prune();
    return acquired;
  }

  clear() {
    for (const [key, entry] of this.entries) this.evict(key, entry);
  }

  size() {
    return this.entries.size;
  }

  private trackLoad(
    key: string,
    entry: GLBResourceCacheEntry<T>,
    loadResult: Promise<T>
  ) {
    return loadResult
      .then((resource) => {
        entry.resolved = resource;
        if (entry.disposeWhenResolved) this.disposeEntry(entry, resource);
        return resource;
      })
      .catch((error) => {
        if (this.entries.get(key) === entry) this.entries.delete(key);
        throw error;
      });
  }

  private lease(
    entry: GLBResourceCacheEntry<T>,
    cacheStatus: GLBResourceCacheStatus
  ): GLBResourceLease<T> {
    entry.referenceCount += 1;
    entry.lastUsed = ++this.usageClock;
    let released = false;
    return {
      cacheStatus,
      resource: entry.resource,
      release: () => {
        if (released) return;
        released = true;
        entry.referenceCount = Math.max(0, entry.referenceCount - 1);
        entry.lastUsed = ++this.usageClock;
        this.prune();
      },
    };
  }

  private prune() {
    while (this.entries.size > this.maximumEntries) {
      const candidate = [...this.entries.entries()]
        .filter(([, entry]) => entry.referenceCount === 0)
        .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0];
      if (!candidate) return;
      this.evict(candidate[0], candidate[1]);
    }
  }

  private evict(key: string, entry: GLBResourceCacheEntry<T>) {
    if (this.entries.get(key) !== entry) return;
    this.entries.delete(key);
    if (entry.resolved) this.disposeEntry(entry, entry.resolved);
    else entry.disposeWhenResolved = true;
  }

  private disposeEntry(entry: GLBResourceCacheEntry<T>, resource: T) {
    if (entry.disposed) return;
    entry.disposed = true;
    this.disposeResource(resource);
  }
}

export function createGLBResourceCache<T>({
  maximumEntries,
  dispose,
}: {
  maximumEntries: number;
  dispose: (resource: T) => void;
}) {
  if (!Number.isInteger(maximumEntries) || maximumEntries < 1) {
    throw new Error("GLB resource cache maximumEntries must be a positive integer");
  }
  return new GLBResourceCache(maximumEntries, dispose);
}
