import type { CDPSession, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { performance as nodePerformance } from "node:perf_hooks";

import {
  CH0029_PROFILE_CAPACITY,
  CH0029_PROFILE_CALLBACK_CAPACITY,
  CH0029_PROFILE_ENV,
  CH0029_PROFILE_MARKS,
  CH0029_PROFILE_MAX_SUMMARY_BYTES,
  CH0029_PROFILE_MAX_TRACE_BYTES,
  CH0029_PROFILE_MAX_TRACE_DURATION_MS,
  CH0029_PROFILE_SCRIPT_CAPACITY,
  analyzeCH0029Trace,
  selectCH0029TracingCategories,
  serializeCH0029ProfileSummary,
  type CH0029ProfileMark,
} from "./support/ch0029-runtime-profile-contract";

const PROFILE_OUTPUT_ROOT = ".local/ch0029-runtime-profile";
const PROFILE_TRACE_STOP_RESERVE_MS = 5_000;
const PROFILE_TRACE_END_TIMEOUT_MS = 2_000;
const PROFILE_SESSION_DETACH_TIMEOUT_MS = 1_000;
const PROFILE_IMPLEMENTATION_FILES = Object.freeze([
  "tests/e2e/00-runtime-smoke.spec.ts",
  "tests/e2e/ch0029-runtime-profiler.ts",
  "tests/e2e/support/ch0029-runtime-profile-contract.ts",
]);
const PROFILE_LABEL = "profile";

type CallbackRecord = {
  phaseName: string;
  operationName: string;
  requestId: number;
  requestedAtHostMs: number;
  enteredAtHostMs: number | null;
};

type TracingComplete = { stream?: string; dataLossOccurred?: boolean };

function profileEnabled() {
  return process.env[CH0029_PROFILE_ENV] === "1";
}

function repositoryPath(relativePath: string) {
  if (path.isAbsolute(relativePath)) throw new Error("CH0029 profile output must be repository-relative");
  const root = process.cwd();
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("CH0029 profile output escaped the repository");
  }
  return resolved;
}

async function bounded<T>(promise: Promise<T>, timeoutMs: number, description: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${description} exceeded ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function currentSourceSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function currentProfilerImplementationSha256() {
  const hash = createHash("sha256");
  for (const relativePath of PROFILE_IMPLEMENTATION_FILES) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(readFileSync(repositoryPath(relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function installLoAFObserver(page: Page) {
  await page.addInitScript(
    ({ capacity, scriptCapacity }) => {
      type Diagnostic = {
        active?: boolean;
        requiredForReadiness?: boolean;
        reloadGeneration?: number;
        loadState?: string;
        pendingStage?: string | null;
      };
      type LoAFScript = {
        duration?: number;
        executionStart?: number;
        forcedStyleAndLayoutDuration?: number;
        pauseDuration?: number;
        sourceURL?: string;
        sourceFunctionName?: string;
      };
      type LoAFEntry = PerformanceEntry & {
        blockingDuration?: number;
        renderStart?: number;
        styleAndLayoutStart?: number;
        scripts?: LoAFScript[];
      };
      type ProfileGlobal = typeof globalThis & {
        __INTERIOR_AI_GLB_DIAGNOSTICS__?: Record<string, Diagnostic>;
        __INTERIOR_AI_GLB_DIAGNOSTICS_GENERATION__?: number;
        __INTERIOR_AI_CH0029_PROFILE__?: {
          schema: "interior-ai.ch0029-loaf.v1";
          capacity: number;
          scriptCapacity: number;
          supported: boolean;
          droppedCount: number;
          maximumObserverCallbackDurationMs: number;
          entries: unknown[];
        };
        __INTERIOR_AI_CH0029_PROFILE_SNAPSHOT__?: () => unknown;
      };
      const safeFunctionName = (value: unknown) =>
        typeof value === "string" &&
        value.length > 0 &&
        value.length <= 80 &&
        /^[A-Za-z0-9_$.:<> -]+$/.test(value)
          ? value
          : null;
      const sourceHash = (value: unknown) => {
        if (typeof value !== "string" || value.length === 0) return null;
        try {
          const parsed = new URL(value, location.origin);
          if (parsed.origin !== location.origin) return null;
          const normalized = parsed.pathname
            .replace(/[a-f0-9]{8,}/gi, "<hash>")
            .replace(/\d+/g, "<n>");
          let hash = 0x811c9dc5;
          for (let index = 0; index < normalized.length; index += 1) {
            hash ^= normalized.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193);
          }
          return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
        } catch {
          return null;
        }
      };
      const lifecycleContext = () => {
        const profileGlobal = globalThis as ProfileGlobal;
        const reloadGeneration =
          profileGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_GENERATION__ ?? 0;
        const stageCounts: Record<string, number> = {
          response: 0,
          "parse-decode": 0,
          normalization: 0,
          materials: 0,
          bounds: 0,
          "scene-attachment": 0,
          "ready-commit": 0,
          ready: 0,
          error: 0,
        };
        let activeRequiredCount = 0;
        Object.values(profileGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS__ ?? {}).forEach(
          (diagnostic) => {
            if (
              !diagnostic.active ||
              !diagnostic.requiredForReadiness ||
              diagnostic.reloadGeneration !== reloadGeneration
            ) return;
            activeRequiredCount += 1;
            if (diagnostic.loadState === "ready") stageCounts.ready += 1;
            else if (diagnostic.loadState === "error") stageCounts.error += 1;
            else if (diagnostic.pendingStage === "request-start") stageCounts.response += 1;
            else if (
              diagnostic.pendingStage === "terminal-error" ||
              diagnostic.pendingStage === "cancelled"
            ) stageCounts.error += 1;
            else if (diagnostic.pendingStage && diagnostic.pendingStage in stageCounts) {
              stageCounts[diagnostic.pendingStage] += 1;
            }
          },
        );
        return { reloadGeneration, activeRequiredCount, lifecycleStageCounts: stageCounts };
      };
      const profileGlobal = globalThis as ProfileGlobal;
      const supported =
        typeof PerformanceObserver !== "undefined" &&
        PerformanceObserver.supportedEntryTypes.includes("long-animation-frame");
      const state = {
        schema: "interior-ai.ch0029-loaf.v1" as const,
        capacity,
        scriptCapacity,
        supported,
        droppedCount: 0,
        maximumObserverCallbackDurationMs: 0,
        entries: [] as unknown[],
      };
      profileGlobal.__INTERIOR_AI_CH0029_PROFILE__ = state;
      profileGlobal.__INTERIOR_AI_CH0029_PROFILE_SNAPSHOT__ = () =>
        JSON.parse(JSON.stringify(state));
      if (!supported) return;
      const observer = new PerformanceObserver((list) => {
        const callbackStartedAt = globalThis.performance.now();
        for (const rawEntry of list.getEntries()) {
          const entry = rawEntry as LoAFEntry;
          const scripts = [...(entry.scripts ?? [])]
            .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))
            .slice(0, scriptCapacity)
            .map((script) => ({
              relativeStartTimeMs: Math.max(0, script.executionStart ?? entry.startTime),
              durationMs: Math.max(0, script.duration ?? 0),
              pauseDurationMs: Math.max(0, script.pauseDuration ?? 0),
              forcedStyleAndLayoutDurationMs: Math.max(
                0,
                script.forcedStyleAndLayoutDuration ?? 0,
              ),
              firstPartySourceHash: sourceHash(script.sourceURL),
              sourceFunctionName: safeFunctionName(script.sourceFunctionName),
            }));
          const projected = {
            relativeStartTimeMs: Math.max(0, entry.startTime),
            durationMs: Math.max(0, entry.duration),
            blockingDurationMs: Math.max(0, entry.blockingDuration ?? 0),
            renderStartMs: Math.max(0, entry.renderStart ?? 0),
            styleAndLayoutStartMs: Math.max(0, entry.styleAndLayoutStart ?? 0),
            forcedStyleAndLayoutDurationMs: scripts.reduce(
              (total, script) => total + script.forcedStyleAndLayoutDurationMs,
              0,
            ),
            scripts,
            ...lifecycleContext(),
          };
          if (state.entries.length >= capacity) {
            state.entries.shift();
            state.droppedCount += 1;
          }
          state.entries.push(projected);
        }
        state.maximumObserverCallbackDurationMs = Math.max(
          state.maximumObserverCallbackDurationMs,
          globalThis.performance.now() - callbackStartedAt,
        );
      });
      observer.observe({ type: "long-animation-frame", buffered: true });
    },
    { capacity: CH0029_PROFILE_CAPACITY, scriptCapacity: CH0029_PROFILE_SCRIPT_CAPACITY },
  );
}

export class CH0029RuntimeProfiler {
  readonly enabled = profileEnabled();
  private readonly hostStartedAt = nodePerformance.now();
  private readonly hostMarks: Array<{ name: CH0029ProfileMark; relativeMs: number }> = [];
  private readonly callbacks = new Map<number, CallbackRecord>();
  private callbackDroppedCount = 0;
  private readonly pendingBrowserMarks = new Set<Promise<void>>();
  private session: CDPSession | null = null;
  private traceActive = false;
  private selectedCategories: string[] = [];
  private traceStartedAt = 0;
  private maximumBufferUsage = 0;
  private maximumTimer: ReturnType<typeof setTimeout> | null = null;
  private stopPromise: Promise<unknown> | null = null;
  private pageOrigin = "http://127.0.0.1:3000";

  constructor(private readonly page: Page) {}

  async install() {
    if (!this.enabled) return;
    await installLoAFObserver(this.page);
  }

  recordCallbackRequested(input: Omit<CallbackRecord, "requestedAtHostMs" | "enteredAtHostMs">) {
    if (!this.enabled) return;
    if (
      !this.callbacks.has(input.requestId) &&
      this.callbacks.size >= CH0029_PROFILE_CALLBACK_CAPACITY
    ) {
      const oldestRequestId = this.callbacks.keys().next().value;
      if (oldestRequestId !== undefined) {
        this.callbacks.delete(oldestRequestId);
        this.callbackDroppedCount += 1;
      }
    }
    this.callbacks.set(input.requestId, {
      ...input,
      requestedAtHostMs: Math.max(0, nodePerformance.now() - this.hostStartedAt),
      enteredAtHostMs: null,
    });
  }

  recordCallbackEntered(requestId: number) {
    const callback = this.callbacks.get(requestId);
    if (!this.enabled || !callback || callback.enteredAtHostMs !== null) return;
    callback.enteredAtHostMs = Math.max(
      0,
      nodePerformance.now() - this.hostStartedAt,
    );
  }

  shouldMarkCallbackEntered(phaseName: string, operationName: string) {
    return (
      this.enabled &&
      phaseName === "reload-1" &&
      operationName === "diagnostics-settle-evaluation"
    );
  }

  async mark(name: CH0029ProfileMark) {
    return this.markMany([name]);
  }

  async markOrdered(name: CH0029ProfileMark) {
    if (!this.enabled) return;
    if (!CH0029_PROFILE_MARKS.includes(name)) {
      throw new Error("Unknown CH0029 profile mark");
    }
    this.hostMarks.push({
      name,
      relativeMs: Math.max(0, nodePerformance.now() - this.hostStartedAt),
    });
    await bounded(
      this.page.evaluate((markName) => {
        globalThis.performance.mark(`ch0029:${markName}`);
      }, name),
      1_000,
      `CH0029 ordered ${name} mark`,
    );
  }

  async markMany(names: CH0029ProfileMark[]) {
    if (!this.enabled) return;
    if (names.some((name) => !CH0029_PROFILE_MARKS.includes(name))) {
      throw new Error("Unknown CH0029 profile mark");
    }
    const relativeMs = Math.max(0, nodePerformance.now() - this.hostStartedAt);
    names.forEach((name) => this.hostMarks.push({ name, relativeMs }));
    const pending = this.page
      .evaluate((markNames) => {
        markNames.forEach((markName) =>
          globalThis.performance.mark(`ch0029:${markName}`),
        );
      }, names)
      .then(() => undefined)
      .catch(() => undefined);
    this.pendingBrowserMarks.add(pending);
    void pending.finally(() => this.pendingBrowserMarks.delete(pending));
  }

  async startTrace() {
    if (!this.enabled || this.session) return;
    this.pageOrigin = new URL(this.page.url()).origin;
    const session = await this.page.context().newCDPSession(this.page);
    this.session = session;
    try {
      const response = (await session.send("Tracing.getCategories")) as {
        categories?: string[];
      };
      this.selectedCategories = selectCH0029TracingCategories(
        response.categories ?? [],
      );
      if (this.selectedCategories.length === 0) {
        throw new Error(
          "Chromium exposed none of the required CH0029 tracing categories",
        );
      }
      session.on("Tracing.bufferUsage", (event: { percentFull?: number }) => {
        this.maximumBufferUsage = Math.max(
          this.maximumBufferUsage,
          event.percentFull ?? 0,
        );
      });
      await session.send("Tracing.start", {
        categories: this.selectedCategories.join(","),
        transferMode: "ReturnAsStream",
        bufferUsageReportingInterval: 1_000,
      });
    } catch (error) {
      await bounded(
        session.detach(),
        PROFILE_SESSION_DETACH_TIMEOUT_MS,
        "CH0029 failed-start session detach",
      ).catch(() => undefined);
      this.session = null;
      this.selectedCategories = [];
      throw error;
    }
    this.traceActive = true;
    this.traceStartedAt = nodePerformance.now();
    this.maximumTimer = setTimeout(() => {
      void this.stop("bounded-maximum").catch(() => undefined);
    }, CH0029_PROFILE_MAX_TRACE_DURATION_MS - PROFILE_TRACE_STOP_RESERVE_MS);
  }

  stop(outcome: "completed" | "failure" | "bounded-maximum") {
    if (this.stopPromise) return this.stopPromise;
    if (!this.enabled || !this.session || !this.traceActive) {
      return Promise.resolve(null);
    }
    this.stopPromise ??= this.stopInternal(outcome);
    return this.stopPromise;
  }

  private async stopInternal(outcome: "completed" | "failure" | "bounded-maximum") {
    const session = this.session as CDPSession;
    try {
      if (outcome !== "bounded-maximum" && this.pendingBrowserMarks.size > 0) {
        const remainingMs = this.remainingTraceBudgetMs();
        if (remainingMs > 0) {
          await bounded(
            Promise.allSettled([...this.pendingBrowserMarks]),
            Math.max(1, Math.min(2_000, remainingMs)),
            "CH0029 pending browser marks",
          ).catch(() => undefined);
        }
      }
      const completion = new Promise<TracingComplete>((resolve) => {
        session.once("Tracing.tracingComplete", resolve);
      });
      const remainingBeforeEndMs = this.remainingTraceBudgetMs();
      if (remainingBeforeEndMs <= 0) {
        throw new Error("CH0029 trace reached its maximum duration before it could end");
      }
      await bounded(
        session.send("Tracing.end"),
        Math.max(
          1,
          Math.min(PROFILE_TRACE_END_TIMEOUT_MS, remainingBeforeEndMs),
        ),
        "CH0029 trace end",
      );
      const traceObservedDurationMs = Math.max(
        0,
        nodePerformance.now() - this.traceStartedAt,
      );
      this.traceActive = false;
      if (traceObservedDurationMs > CH0029_PROFILE_MAX_TRACE_DURATION_MS) {
        throw new Error("CH0029 trace exceeded its maximum duration");
      }
      const completed = await bounded(completion, 15_000, "CH0029 trace completion");
      if (!completed.stream) throw new Error("CH0029 trace stream is missing");
      const outputRoot = repositoryPath(PROFILE_OUTPUT_ROOT);
      mkdirSync(outputRoot, { recursive: true });
      const rawTracePath = path.join(outputRoot, `${PROFILE_LABEL}-raw-trace.json`);
      const reportPath = path.join(outputRoot, `${PROFILE_LABEL}-attribution.json`);
      let rawTraceDeleted = false;
      try {
        const rawTraceBytes = await this.readTraceStream(
          session,
          completed.stream,
          rawTracePath,
        );
        const trace = JSON.parse(readFileSync(rawTracePath, "utf8")) as unknown;
        const loaf = await this.readLoAFSnapshot();
        const report = {
          schema: "interior-ai.ch0029-profile-attribution.v1",
          sourceCommitSha: currentSourceSha(),
          profilerImplementationSha256: currentProfilerImplementationSha256(),
          label: PROFILE_LABEL,
          outcome,
          trace: {
            maximumDurationMs: CH0029_PROFILE_MAX_TRACE_DURATION_MS,
            maximumBytes: CH0029_PROFILE_MAX_TRACE_BYTES,
            rawTraceBytes,
            observedDurationMs: traceObservedDurationMs,
            selectedCategories: this.selectedCategories,
            dataLossOccurred: completed.dataLossOccurred === true,
            maximumBufferUsage: this.maximumBufferUsage,
            ...analyzeCH0029Trace(trace, this.pageOrigin),
          },
          longAnimationFrames: loaf,
          hostMarks: this.hostMarks,
          callbackCapacity: CH0029_PROFILE_CALLBACK_CAPACITY,
          callbackDroppedCount: this.callbackDroppedCount,
          callbacks: [...this.callbacks.values()],
          safety: {
            capacity: CH0029_PROFILE_CAPACITY,
            scriptsPerFrameCapacity: CH0029_PROFILE_SCRIPT_CAPACITY,
            callbackCapacity: CH0029_PROFILE_CALLBACK_CAPACITY,
            maximumSummaryBytes: CH0029_PROFILE_MAX_SUMMARY_BYTES,
            summaryBytes: 0,
            rawUrlsRetained: false,
            sourceTextRetained: false,
            screenshotsCaptured: false,
            videoCaptured: false,
            networkBodiesCaptured: false,
            cookiesCaptured: false,
            rawTraceDeleted: false,
          },
        };
        unlinkSync(rawTracePath);
        rawTraceDeleted = true;
        report.safety.rawTraceDeleted = true;
        const serializedReport = serializeCH0029ProfileSummary(report);
        writeFileSync(reportPath, serializedReport, { flag: "wx" });
        console.info("[ch0029-profile-attribution]", JSON.stringify(report));
        return report;
      } finally {
        if (!rawTraceDeleted) {
          try {
            unlinkSync(rawTracePath);
          } catch {
            // The trace may not have been created, but it must never be retained.
          }
        }
      }
    } finally {
      if (this.maximumTimer) {
        clearTimeout(this.maximumTimer);
        this.maximumTimer = null;
      }
      if (this.traceActive) {
        const remainingMs = this.remainingTraceBudgetMs();
        await bounded(
          session.send("Tracing.end"),
          Math.max(
            1,
            Math.min(PROFILE_TRACE_END_TIMEOUT_MS, remainingMs || 1),
          ),
          "CH0029 fail-safe trace end",
        ).catch(() => undefined);
        this.traceActive = false;
      }
      await bounded(
        session.detach(),
        PROFILE_SESSION_DETACH_TIMEOUT_MS,
        "CH0029 session detach",
      ).catch(() => undefined);
      this.session = null;
    }
  }

  private remainingTraceBudgetMs() {
    return Math.max(
      0,
      CH0029_PROFILE_MAX_TRACE_DURATION_MS -
        (nodePerformance.now() - this.traceStartedAt),
    );
  }

  private async readTraceStream(session: CDPSession, stream: string, outputPath: string) {
    const descriptor = openSync(outputPath, "wx", 0o600);
    let bytesWritten = 0;
    try {
      let endOfFile = false;
      while (!endOfFile) {
        const chunk = (await session.send("IO.read", { handle: stream })) as {
          data?: string;
          base64Encoded?: boolean;
          eof?: boolean;
        };
        const bytes = chunk.base64Encoded
          ? Buffer.from(chunk.data ?? "", "base64")
          : Buffer.from(chunk.data ?? "", "utf8");
        if (bytesWritten + bytes.byteLength > CH0029_PROFILE_MAX_TRACE_BYTES) {
          throw new Error(
            `CH0029 raw trace exceeded ${CH0029_PROFILE_MAX_TRACE_BYTES} bytes`,
          );
        }
        writeSync(descriptor, bytes);
        bytesWritten += bytes.byteLength;
        endOfFile = chunk.eof === true;
      }
      return bytesWritten;
    } finally {
      closeSync(descriptor);
      await session.send("IO.close", { handle: stream }).catch(() => undefined);
    }
  }

  private async readLoAFSnapshot() {
    return bounded(
      this.page.evaluate(
        ({ capacity, scriptCapacity }) => {
          const profileGlobal = globalThis as typeof globalThis & {
            __INTERIOR_AI_CH0029_PROFILE_SNAPSHOT__?: () => unknown;
          };
          type SnapshotScript = { relativeStartTimeMs?: number };
          type SnapshotEntry = {
            relativeStartTimeMs?: number;
            durationMs?: number;
            renderStartMs?: number;
            styleAndLayoutStartMs?: number;
            scripts?: SnapshotScript[];
          };
          const snapshot = (profileGlobal.__INTERIOR_AI_CH0029_PROFILE_SNAPSHOT__?.() ?? {
            schema: "interior-ai.ch0029-loaf.v1",
            capacity,
            scriptCapacity,
            supported: false,
            droppedCount: 0,
            maximumObserverCallbackDurationMs: 0,
            entries: [],
          }) as Record<string, unknown> & { entries?: SnapshotEntry[] };
          const activationMark = globalThis.performance
            .getEntriesByName("ch0029:3d-activation-requested", "mark")
            .at(-1);
          const completionMark = globalThis.performance
            .getEntriesByName("ch0029:diagnostics-complete", "mark")
            .at(-1);
          if (!activationMark) {
            return { ...snapshot, timeOriginMark: null, entries: [] };
          }
          const activationStartMs = activationMark.startTime;
          const completionStartMs = completionMark?.startTime ?? Number.POSITIVE_INFINITY;
          const relativeTiming = (value: number | undefined) =>
            typeof value === "number" && value > 0
              ? Math.max(0, value - activationStartMs)
              : 0;
          const entries = (snapshot.entries ?? [])
            .filter((entry) => {
              const startMs = entry.relativeStartTimeMs ?? 0;
              const endMs = startMs + (entry.durationMs ?? 0);
              return endMs >= activationStartMs && startMs <= completionStartMs;
            })
            .map((entry) => ({
              ...entry,
              relativeStartTimeMs: Math.max(
                0,
                (entry.relativeStartTimeMs ?? 0) - activationStartMs,
              ),
              renderStartMs: relativeTiming(entry.renderStartMs),
              styleAndLayoutStartMs: relativeTiming(entry.styleAndLayoutStartMs),
              scripts: (entry.scripts ?? []).map((script) => ({
                ...script,
                relativeStartTimeMs: Math.max(
                  0,
                  (script.relativeStartTimeMs ?? 0) - activationStartMs,
                ),
              })),
            }));
          return {
            ...snapshot,
            timeOriginMark: "ch0029:3d-activation-requested",
            intervalEndMark: completionMark
              ? "ch0029:diagnostics-complete"
              : null,
            entries,
          };
        },
        {
          capacity: CH0029_PROFILE_CAPACITY,
          scriptCapacity: CH0029_PROFILE_SCRIPT_CAPACITY,
        },
      ),
      5_000,
      "CH0029 LoAF snapshot",
    ).catch(() => ({
      schema: "interior-ai.ch0029-loaf.v1",
      capacity: CH0029_PROFILE_CAPACITY,
      scriptCapacity: CH0029_PROFILE_SCRIPT_CAPACITY,
      supported: null,
      collectionTimedOut: true,
      droppedCount: 0,
      maximumObserverCallbackDurationMs: null,
      entries: [],
    }));
  }
}
