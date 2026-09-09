// One sampling window is a continuous run of requested frames. The rendering
// adapter ends it when its root has no more work, independently of other roots.
export class SceneActiveFpsSampler {
  private previousAt: number | null = null;
  private elapsedMs = 0;
  private intervals = 0;
  private lowFpsStartedAt: number | null = null;
  degraded = false;

  reset() {
    this.previousAt = null;
    this.elapsedMs = 0;
    this.intervals = 0;
    this.lowFpsStartedAt = null;
    this.degraded = false;
  }

  recordFrame(now: number): number | null {
    const previous = this.previousAt;
    this.previousAt = now;
    if (previous === null) return null;
    const interval = now - previous;
    if (!Number.isFinite(interval) || interval <= 0) {
      this.reset();
      return null;
    }
    this.elapsedMs += interval;
    this.intervals += 1;
    if (this.elapsedMs < 1000 || this.intervals < 2) return null;

    const fps = Math.round((this.intervals * 1000) / this.elapsedMs);
    this.elapsedMs = 0;
    this.intervals = 0;
    if (fps >= 28) this.lowFpsStartedAt = null;
    else if (this.lowFpsStartedAt === null) this.lowFpsStartedAt = now;
    else if (now - this.lowFpsStartedAt >= 4000) this.degraded = true;
    return fps;
  }
}
