export type GLBResourceCacheStatus = "network" | "cache-hit";

type GLBResourceCacheEntry<T> = {
  resource: Promise<T>;
  resolved: T | null;
  referenceCount: number;
  lastUsed: number;
  lastAcquiredAtMs: number;
  lastReleasedAtMs: number | null;
  disposeWhenResolved: boolean;
  disposed: boolean;
};

export type GLBResourceCacheInspection = {
  versionStart: number;
  versionEnd: number;
  coherent: boolean;
  maximumEntries: number;
  entryCount: number;
  activeReferenceCount: number;
  zeroReferenceEntryCount: number;
  hitCount: number;
  missCount: number;
  acquisitionCount: number;
  releaseCount: number;
  failureCount: number;
  disposalCount: number;
  staleCompletionCount: number;
  entries: Array<{
    key: string;
    state: "pending" | "ready";
    referenceCount: number;
    lastUsed: number;
    lastAcquiredAtMs: number;
    lastReleasedAtMs: number | null;
    retainedAfterRelease: boolean;
    disposeWhenResolved: boolean;
  }>;
};

export type GLBResourceLease<T> = {
  cacheStatus: GLBResourceCacheStatus;
  resource: Promise<T>;
  release: () => void;
};

class GLBResourceCache<T> {
  private readonly entries = new Map<string, GLBResourceCacheEntry<T>>();
  private usageClock = 0;
  private mutationVersion = 0;
  private hitCount = 0;
  private missCount = 0;
  private acquisitionCount = 0;
  private releaseCount = 0;
  private failureCount = 0;
  private disposalCount = 0;
  private staleCompletionCount = 0;

  constructor(
    private readonly maximumEntries: number,
    private readonly disposeResource: (resource: T) => void
  ) {}

  acquire(key: string, load: () => Promise<T>): GLBResourceLease<T> {
    const existing = this.entries.get(key);
    if (existing) {
      this.hitCount += 1;
      return this.lease(existing, "cache-hit");
    }

    this.missCount += 1;

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
      lastAcquiredAtMs: this.timestampMs(),
      lastReleasedAtMs: null,
      disposeWhenResolved: false,
      disposed: false,
    };
    entry.resource = this.trackLoad(key, entry, loadResult);
    this.entries.set(key, entry);
    this.bumpVersion();
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

  inspect(): GLBResourceCacheInspection {
    const versionStart = this.mutationVersion;
    const entries = [...this.entries.entries()].map(([key, entry]) => ({
      key,
      state: entry.resolved ? ("ready" as const) : ("pending" as const),
      referenceCount: entry.referenceCount,
      lastUsed: entry.lastUsed,
      lastAcquiredAtMs: entry.lastAcquiredAtMs,
      lastReleasedAtMs: entry.lastReleasedAtMs,
      retainedAfterRelease: entry.referenceCount === 0,
      disposeWhenResolved: entry.disposeWhenResolved,
    }));
    const versionEnd = this.mutationVersion;
    return {
      versionStart,
      versionEnd,
      coherent: versionStart === versionEnd,
      maximumEntries: this.maximumEntries,
      entryCount: entries.length,
      activeReferenceCount: entries.reduce(
        (total, entry) => total + entry.referenceCount,
        0
      ),
      zeroReferenceEntryCount: entries.filter(
        (entry) => entry.referenceCount === 0
      ).length,
      hitCount: this.hitCount,
      missCount: this.missCount,
      acquisitionCount: this.acquisitionCount,
      releaseCount: this.releaseCount,
      failureCount: this.failureCount,
      disposalCount: this.disposalCount,
      staleCompletionCount: this.staleCompletionCount,
      entries,
    };
  }

  private trackLoad(
    key: string,
    entry: GLBResourceCacheEntry<T>,
    loadResult: Promise<T>
  ) {
    return loadResult
      .then((resource) => {
        entry.resolved = resource;
        this.bumpVersion();
        if (entry.disposeWhenResolved) {
          this.staleCompletionCount += 1;
          this.disposeEntry(entry, resource);
        }
        return resource;
      })
      .catch((error) => {
        this.failureCount += 1;
        if (this.entries.get(key) === entry) this.entries.delete(key);
        else this.staleCompletionCount += 1;
        this.bumpVersion();
        throw error;
      });
  }

  private lease(
    entry: GLBResourceCacheEntry<T>,
    cacheStatus: GLBResourceCacheStatus
  ): GLBResourceLease<T> {
    this.acquisitionCount += 1;
    entry.referenceCount += 1;
    entry.lastUsed = ++this.usageClock;
    entry.lastAcquiredAtMs = this.timestampMs();
    this.bumpVersion();
    let released = false;
    return {
      cacheStatus,
      resource: entry.resource,
      release: () => {
        if (released) return;
        released = true;
        this.releaseCount += 1;
        entry.referenceCount = Math.max(0, entry.referenceCount - 1);
        entry.lastUsed = ++this.usageClock;
        entry.lastReleasedAtMs = this.timestampMs();
        this.bumpVersion();
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
    this.bumpVersion();
    if (entry.resolved) this.disposeEntry(entry, entry.resolved);
    else {
      entry.disposeWhenResolved = true;
      this.bumpVersion();
    }
  }

  private disposeEntry(entry: GLBResourceCacheEntry<T>, resource: T) {
    if (entry.disposed) return;
    entry.disposed = true;
    this.disposalCount += 1;
    this.bumpVersion();
    this.disposeResource(resource);
  }

  private timestampMs() {
    return typeof performance !== "undefined" &&
      Number.isFinite(performance.now())
      ? Math.max(0, Math.round(performance.now()))
      : Date.now();
  }

  private bumpVersion() {
    this.mutationVersion += 1;
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
