import {
  GLB_MAIN_THREAD_COUNTERS,
  GLB_MAIN_THREAD_TELEMETRY_CAPACITY,
  type GLBMainThreadBootstrapEvent,
  type GLBMainThreadCounter,
  type GLBMainThreadTelemetryBootstrap,
  type GLBMainThreadTimingCategory,
} from "./glbMainThreadTelemetryCore";

const RESPONSIVE_GAP_THRESHOLD_MS = 50;

export type GLBMainThreadCollectorModule = {
  initializeGLBMainThreadTelemetry: (startedAtMs?: number) => void;
  hydrateGLBMainThreadTelemetryBootstrap: (
    bootstrap: GLBMainThreadTelemetryBootstrap,
  ) => void;
  measureGLBMainThreadWork: <T>(
    category: GLBMainThreadTimingCategory,
    operation: () => T,
  ) => T;
  recordGLBMainThreadTiming: (
    category: GLBMainThreadTimingCategory,
    startedAtMs: number,
    completedAtMs: number,
  ) => void;
  recordGLBEventLoopGap: (startedAtMs: number, durationMs: number) => void;
  recordGLBMainThreadCounter: (counter: GLBMainThreadCounter) => void;
};

type FacadeControllerDependencies = {
  telemetryEnabled: () => boolean;
  loadTelemetry: () => Promise<GLBMainThreadCollectorModule>;
  nowMs: () => number;
};

export type GLBMainThreadTelemetryFacadeState = {
  collectorImportState: "not-requested" | "pending" | "active" | "failed";
  importRequestCount: number;
  bufferedEventCount: number;
  bufferedCounterTotal: number;
};

function emptyBootstrapCounters(): Record<GLBMainThreadCounter, number> {
  return Object.fromEntries(
    GLB_MAIN_THREAD_COUNTERS.map((counter) => [counter, 0]),
  ) as Record<GLBMainThreadCounter, number>;
}

class GLBMainThreadTelemetryFacadeController {
  private loadedTelemetry: GLBMainThreadCollectorModule | null = null;
  private telemetryLoadStarted = false;
  private telemetryLoadFailed = false;
  private telemetryActivation: Promise<void> | null = null;
  private importRequestCount = 0;
  private bootstrapStartedAtMs: number | null = null;
  private readonly bootstrapEvents: GLBMainThreadBootstrapEvent[] = [];
  private readonly bootstrapCounters = emptyBootstrapCounters();

  constructor(private readonly dependencies: FacadeControllerDependencies) {}

  private clearBootstrapCounters() {
    for (const counter of GLB_MAIN_THREAD_COUNTERS) {
      this.bootstrapCounters[counter] = 0;
    }
    this.bootstrapStartedAtMs = null;
  }

  private retainBootstrapEvent(event: GLBMainThreadBootstrapEvent) {
    if (this.bootstrapEvents.length === GLB_MAIN_THREAD_TELEMETRY_CAPACITY) {
      this.bootstrapEvents.shift();
    }
    this.bootstrapEvents.push(event);
  }

  private captureBootstrap(): GLBMainThreadTelemetryBootstrap {
    return {
      startedAtMs:
        this.bootstrapStartedAtMs ?? this.dependencies.nowMs(),
      events: this.bootstrapEvents.splice(0),
      counters: { ...this.bootstrapCounters },
    };
  }

  private activate(telemetry: GLBMainThreadCollectorModule) {
    const bootstrap = this.captureBootstrap();
    telemetry.initializeGLBMainThreadTelemetry(bootstrap.startedAtMs);
    this.clearBootstrapCounters();
    telemetry.hydrateGLBMainThreadTelemetryBootstrap(bootstrap);
    this.loadedTelemetry = telemetry;
  }

  private failImport() {
    this.telemetryLoadFailed = true;
    this.bootstrapEvents.length = 0;
    this.clearBootstrapCounters();
  }

  private loadTelemetryForDiagnostics() {
    if (
      !this.dependencies.telemetryEnabled() ||
      this.loadedTelemetry ||
      this.telemetryLoadStarted ||
      this.telemetryLoadFailed
    ) {
      return;
    }
    this.bootstrapStartedAtMs ??= this.dependencies.nowMs();
    this.telemetryLoadStarted = true;
    this.importRequestCount += 1;
    this.telemetryActivation = this.dependencies
      .loadTelemetry()
      .then((telemetry) => this.activate(telemetry))
      .catch(() => this.failImport());
  }

  initialize() {
    if (!this.dependencies.telemetryEnabled()) return;
    if (this.loadedTelemetry) {
      this.loadedTelemetry.initializeGLBMainThreadTelemetry();
    } else {
      this.loadTelemetryForDiagnostics();
    }
  }

  measure<T>(
    category: GLBMainThreadTimingCategory,
    operation: () => T,
  ) {
    if (this.loadedTelemetry) {
      return this.loadedTelemetry.measureGLBMainThreadWork(category, operation);
    }
    if (!this.dependencies.telemetryEnabled() || this.telemetryLoadFailed) {
      return operation();
    }
    this.loadTelemetryForDiagnostics();
    const startedAtMs = this.dependencies.nowMs();
    try {
      return operation();
    } finally {
      this.retainBootstrapEvent({
        type: "timing",
        category,
        startedAtMs,
        completedAtMs: this.dependencies.nowMs(),
      });
    }
  }

  recordTiming(
    category: GLBMainThreadTimingCategory,
    startedAtMs: number,
    completedAtMs: number,
  ) {
    if (this.loadedTelemetry) {
      this.loadedTelemetry.recordGLBMainThreadTiming(
        category,
        startedAtMs,
        completedAtMs,
      );
    } else if (
      this.dependencies.telemetryEnabled() &&
      !this.telemetryLoadFailed
    ) {
      this.retainBootstrapEvent({
        type: "timing",
        category,
        startedAtMs,
        completedAtMs,
      });
      this.loadTelemetryForDiagnostics();
    }
  }

  recordEventLoopGap(startedAtMs: number, durationMs: number) {
    if (this.loadedTelemetry) {
      this.loadedTelemetry.recordGLBEventLoopGap(startedAtMs, durationMs);
    } else if (
      this.dependencies.telemetryEnabled() &&
      !this.telemetryLoadFailed &&
      durationMs >= RESPONSIVE_GAP_THRESHOLD_MS
    ) {
      this.retainBootstrapEvent({ type: "event-loop-gap", startedAtMs, durationMs });
      this.loadTelemetryForDiagnostics();
    }
  }

  recordCounter(counter: GLBMainThreadCounter) {
    if (this.loadedTelemetry) {
      this.loadedTelemetry.recordGLBMainThreadCounter(counter);
    } else if (
      this.dependencies.telemetryEnabled() &&
      !this.telemetryLoadFailed
    ) {
      this.bootstrapCounters[counter] = Math.min(
        GLB_MAIN_THREAD_TELEMETRY_CAPACITY,
        this.bootstrapCounters[counter] + 1,
      );
      this.loadTelemetryForDiagnostics();
    }
  }

  inspect(): GLBMainThreadTelemetryFacadeState {
    const collectorImportState = this.loadedTelemetry
      ? "active"
      : this.telemetryLoadFailed
        ? "failed"
        : this.telemetryLoadStarted
          ? "pending"
          : "not-requested";
    return {
      collectorImportState,
      importRequestCount: this.importRequestCount,
      bufferedEventCount: this.bootstrapEvents.length,
      bufferedCounterTotal: GLB_MAIN_THREAD_COUNTERS.reduce(
        (total, counter) => total + this.bootstrapCounters[counter],
        0,
      ),
    };
  }

  requestTelemetry() {
    this.loadTelemetryForDiagnostics();
  }

  whenSettled() {
    return this.telemetryActivation ?? Promise.resolve();
  }
}

export function createGLBMainThreadTelemetryFacadeController(
  dependencies: FacadeControllerDependencies,
) {
  return new GLBMainThreadTelemetryFacadeController(dependencies);
}
