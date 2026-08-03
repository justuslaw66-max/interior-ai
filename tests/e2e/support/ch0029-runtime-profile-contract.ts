import { createHash } from "node:crypto";

// Test-tooling contract only; no production module imports this file.

export const CH0029_PROFILE_ENV = "CH0029_RUNTIME_PROFILE";
export const CH0029_PROFILE_CAPACITY = 64;
export const CH0029_PROFILE_SCRIPT_CAPACITY = 8;
export const CH0029_PROFILE_CALLBACK_CAPACITY = 64;
export const CH0029_PROFILE_MAX_TRACE_DURATION_MS = 45_000;
export const CH0029_PROFILE_MAX_TRACE_BYTES = 256 * 1024 * 1024;
export const CH0029_PROFILE_MAX_SUMMARY_BYTES = 512 * 1024;

export const CH0029_PROFILE_MARKS = Object.freeze([
  "reload-1-start",
  "3d-activation-requested",
  "responses-complete",
  "models-ready",
  "bounds-start",
  "bounds-complete",
  "diagnostics-settle-requested",
  "diagnostics-callback-entered",
  "diagnostics-complete",
  "failure",
] as const);

export type CH0029ProfileMark = (typeof CH0029_PROFILE_MARKS)[number];
export type CH0029OwnerClassification =
  | "A-react-r3f-javascript"
  | "B-repeated-frame-subscriber-work"
  | "C-style-layout-paint"
  | "D-renderer-gpu-execution"
  | "E-garbage-collection-disposal"
  | "F-chromium-browser-internal"
  | "CI/browser/GPU execution-environment contention"
  | "H-another-measured-owner"
  | "unresolved";

type ProfileSummary = {
  safety: {
    maximumSummaryBytes: number;
    summaryBytes: number;
  };
};

export function serializeCH0029ProfileSummary<T extends ProfileSummary>(report: T) {
  if (report.safety.maximumSummaryBytes !== CH0029_PROFILE_MAX_SUMMARY_BYTES) {
    throw new Error("CH0029 profile summary has an invalid byte limit");
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    const summaryBytes = Buffer.byteLength(serialized);
    if (summaryBytes > CH0029_PROFILE_MAX_SUMMARY_BYTES) {
      throw new Error(
        `CH0029 sanitized summary exceeded ${CH0029_PROFILE_MAX_SUMMARY_BYTES} bytes`,
      );
    }
    if (report.safety.summaryBytes === summaryBytes) return serialized;
    report.safety.summaryBytes = summaryBytes;
  }
  throw new Error("CH0029 sanitized summary size did not converge");
}

type TraceEvent = {
  name?: string;
  cat?: string;
  ph?: string;
  ts?: number;
  dur?: number;
  tdur?: number;
  pid?: number;
  tid?: number;
  args?: Record<string, unknown>;
};

type TraceInterval = { startUs: number; endUs: number };

const TRACE_CATEGORY_PREFERENCES = Object.freeze([
  "toplevel",
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.stack",
  "v8",
  "v8.execute",
  "disabled-by-default-v8.cpu_profiler",
  "disabled-by-default-v8.cpu_profiler.hires",
  "blink.user_timing",
  "renderer.scheduler",
  "blink",
  "cc",
  "gpu",
  "viz",
]);

export function selectCH0029TracingCategories(supported: string[]) {
  const available = new Set(supported);
  return TRACE_CATEGORY_PREFERENCES.filter((category) => available.has(category));
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function traceInterval(event: TraceEvent): TraceInterval | null {
  const startUs = finiteNumber(event.ts);
  const durationUs = finiteNumber(event.dur);
  if (startUs === null || durationUs === null || durationUs < 0) return null;
  return { startUs, endUs: startUs + durationUs };
}

function clippedInterval(
  event: TraceEvent,
  target: TraceInterval,
): TraceInterval | null {
  const interval = traceInterval(event);
  if (!interval) return null;
  const startUs = Math.max(interval.startUs, target.startUs);
  const endUs = Math.min(interval.endUs, target.endUs);
  return endUs > startUs ? { startUs, endUs } : null;
}

function unionDurationMs(intervals: TraceInterval[]) {
  const ordered = [...intervals].sort((a, b) => a.startUs - b.startUs);
  let totalUs = 0;
  let current: TraceInterval | null = null;
  for (const interval of ordered) {
    if (!current) current = { ...interval };
    else if (interval.startUs <= current.endUs) {
      current.endUs = Math.max(current.endUs, interval.endUs);
    } else {
      totalUs += current.endUs - current.startUs;
      current = { ...interval };
    }
  }
  if (current) totalUs += current.endUs - current.startUs;
  return totalUs / 1_000;
}

function durationFor(
  events: TraceEvent[],
  target: TraceInterval,
  predicate: (event: TraceEvent) => boolean,
) {
  const byThread = new Map<string, TraceInterval[]>();
  for (const event of events) {
    if (!predicate(event)) continue;
    const interval = clippedInterval(event, target);
    if (!interval) continue;
    const key = `${event.pid ?? -1}:${event.tid ?? -1}`;
    const bucket = byThread.get(key) ?? [];
    bucket.push(interval);
    byThread.set(key, bucket);
  }
  return [...byThread.values()].reduce(
    (total, intervals) => total + unionDurationMs(intervals),
    0,
  );
}

function criticalPathDurationFor(
  events: TraceEvent[],
  target: TraceInterval,
  predicate: (event: TraceEvent) => boolean,
) {
  const intervals: TraceInterval[] = [];
  for (const event of events) {
    if (!predicate(event)) continue;
    const interval = clippedInterval(event, target);
    if (interval) intervals.push(interval);
  }
  return unionDurationMs(intervals);
}

function traceText(event: TraceEvent) {
  return `${event.cat ?? ""}:${event.name ?? ""}`;
}

function rendererMainThread(events: TraceEvent[]) {
  const metadata = events.find(
    (event) =>
      event.ph === "M" &&
      event.name === "thread_name" &&
      (event.args as { name?: unknown } | undefined)?.name === "CrRendererMain",
  );
  return metadata?.pid === undefined || metadata.tid === undefined
    ? null
    : { pid: metadata.pid, tid: metadata.tid };
}

function userTimingMarks(events: TraceEvent[]) {
  return events
    .filter(
      (event) =>
        typeof event.name === "string" &&
        event.name.startsWith("ch0029:") &&
        finiteNumber(event.ts) !== null,
    )
    .map((event) => ({ name: event.name as string, timestampUs: event.ts as number }))
    .sort((a, b) => a.timestampUs - b.timestampUs);
}

function targetInterval(events: TraceEvent[], marks: ReturnType<typeof userTimingMarks>) {
  let traceStartUs = Number.POSITIVE_INFINITY;
  let traceEndUs = 0;
  for (const event of events) {
    const startUs = finiteNumber(event.ts);
    if (startUs === null) continue;
    traceStartUs = Math.min(traceStartUs, startUs);
    traceEndUs = Math.max(traceEndUs, startUs + (finiteNumber(event.dur) ?? 0));
  }
  if (!Number.isFinite(traceStartUs)) traceStartUs = 0;
  traceEndUs = Math.max(traceStartUs, traceEndUs);
  const start = marks.find((mark) => mark.name === "ch0029:3d-activation-requested");
  const end = marks.find(
    (mark) =>
      mark.timestampUs >= (start?.timestampUs ?? traceStartUs) &&
      (mark.name === "ch0029:diagnostics-complete" || mark.name === "ch0029:failure"),
  );
  return {
    startUs: start?.timestampUs ?? traceStartUs,
    endUs: end?.timestampUs ?? traceEndUs,
    startMark: start?.name ?? null,
    endMark: end?.name ?? null,
  };
}

function longestTask(events: TraceEvent[], target: TraceInterval, renderer: ReturnType<typeof rendererMainThread>) {
  if (!renderer) return null;
  const candidates = events.filter((event) => {
    if (event.pid !== renderer.pid || event.tid !== renderer.tid) return false;
    if (!/(?:^|::)(?:RunTask|ProcessTaskFromWorkQueue)$/.test(event.name ?? "")) return false;
    return clippedInterval(event, target) !== null;
  });
  const longest = candidates.reduce<TraceEvent | null>(
    (maximum, event) =>
      (finiteNumber(event.dur) ?? 0) > (finiteNumber(maximum?.dur) ?? 0)
        ? event
        : maximum,
    null,
  );
  if (!longest) return null;
  const interval = clippedInterval(longest, target) as TraceInterval;
  const wallDurationMs = (interval.endUs - interval.startUs) / 1_000;
  const fullWallDurationUs = finiteNumber(longest.dur) ?? 0;
  const fullThreadCpuDurationUs = finiteNumber(longest.tdur);
  const threadCpuDurationMs =
    fullThreadCpuDurationUs === null || fullWallDurationUs === 0
      ? null
      : (fullThreadCpuDurationUs *
          ((interval.endUs - interval.startUs) / fullWallDurationUs)) /
        1_000;
  return {
    eventName: longest.name ?? "RunTask",
    eventCategory: longest.cat ?? null,
    startRelativeMs: (interval.startUs - target.startUs) / 1_000,
    wallDurationMs,
    threadCpuDurationMs,
    rendererThreadNonCpuWallMs:
      threadCpuDurationMs === null
        ? null
        : Math.max(0, wallDurationMs - threadCpuDurationMs),
  };
}

function safeTraceLabel(value: unknown) {
  if (typeof value !== "string" || value.length === 0 || value.length > 120) {
    return null;
  }
  return /^[A-Za-z0-9_.,:+<> ()\[\]-]+$/.test(value) ? value : null;
}

function topRendererEvents(
  events: TraceEvent[],
  target: TraceInterval,
  renderer: ReturnType<typeof rendererMainThread>,
) {
  if (!renderer) return [];
  return events
    .filter(
      (event) =>
        event.pid === renderer.pid &&
        event.tid === renderer.tid &&
        clippedInterval(event, target) !== null,
    )
    .map((event) => {
      const interval = clippedInterval(event, target) as TraceInterval;
      const wallDurationMs = (interval.endUs - interval.startUs) / 1_000;
      const fullWallDurationUs = finiteNumber(event.dur) ?? 0;
      const fullThreadCpuDurationUs = finiteNumber(event.tdur);
      const threadCpuDurationMs =
        fullThreadCpuDurationUs === null || fullWallDurationUs === 0
          ? null
          : (fullThreadCpuDurationUs *
              ((interval.endUs - interval.startUs) / fullWallDurationUs)) /
            1_000;
      return {
        eventName: safeTraceLabel(event.name),
        eventCategory: safeTraceLabel(event.cat),
        startRelativeMs: (interval.startUs - target.startUs) / 1_000,
        wallDurationMs,
        threadCpuDurationMs,
      };
    })
    .filter(
      (event) =>
        event.eventName !== null &&
        event.wallDurationMs >= 1 &&
        !(
          event.eventName === "RunTask" &&
          Math.abs(event.startRelativeMs) < 0.001 &&
          Math.abs(event.wallDurationMs - (target.endUs - target.startUs) / 1_000) <
            0.001
        ),
    )
    .sort((a, b) => b.wallDurationMs - a.wallDurationMs)
    .slice(0, 12);
}

function normalizedFirstPartySourceHash(rawURL: unknown, pageOrigin: string) {
  if (typeof rawURL !== "string" || rawURL.length === 0) return null;
  try {
    const parsed = new URL(rawURL, pageOrigin);
    if (parsed.origin !== pageOrigin) return null;
    const normalized = parsed.pathname
      .replace(/[a-f0-9]{8,}/gi, "<hash>")
      .replace(/\d+/g, "<n>");
    return `sha256-${createHash("sha256").update(normalized).digest("hex").slice(0, 16)}`;
  } catch {
    return null;
  }
}

function safeFunctionName(value: unknown) {
  if (typeof value !== "string" || value.length === 0 || value.length > 80) return null;
  return /^[A-Za-z0-9_$.:<> -]+$/.test(value) ? value : null;
}

function sampledStacks(
  events: TraceEvent[],
  target: TraceInterval,
  pageOrigin: string,
  renderer: ReturnType<typeof rendererMainThread>,
) {
  if (!renderer) return [];
  const totals = new Map<string, { durationMs: number; sourceHash: string | null; functionName: string | null }>();
  const nodesByThread = new Map<string, Map<number, Record<string, unknown>>>();
  const sampleCursorByThread = new Map<string, number>();
  const profileEvents = events
    .filter(
      (candidate) =>
        (candidate.name === "Profile" || candidate.name === "ProfileChunk") &&
        candidate.pid === renderer.pid &&
        candidate.tid === renderer.tid,
    )
    .sort((a, b) => (finiteNumber(a.ts) ?? 0) - (finiteNumber(b.ts) ?? 0));
  for (const event of profileEvents) {
    const data = (event.args as { data?: Record<string, unknown> } | undefined)?.data;
    const threadKey = `${event.pid ?? -1}:${event.tid ?? -1}`;
    if (event.name === "Profile") {
      const startTimeUs = finiteNumber(data?.startTime);
      if (startTimeUs !== null) sampleCursorByThread.set(threadKey, startTimeUs);
      continue;
    }
    const profile = data?.cpuProfile as { nodes?: Array<Record<string, unknown>>; samples?: number[] } | undefined;
    const deltas = data?.timeDeltas as number[] | undefined;
    if (!profile || !profile.samples || !deltas) continue;
    const nodes = nodesByThread.get(threadKey) ?? new Map<number, Record<string, unknown>>();
    profile.nodes?.forEach((node) => nodes.set(node.id as number, node));
    nodesByThread.set(threadKey, nodes);
    const totalDeltaUs = deltas.reduce(
      (total, delta) => total + (finiteNumber(delta) ?? 0),
      0,
    );
    let sampleTimeUs =
      sampleCursorByThread.get(threadKey) ??
      Math.max(target.startUs, (finiteNumber(event.ts) ?? target.startUs) - totalDeltaUs);
    profile.samples.forEach((nodeId, index) => {
      const deltaUs = finiteNumber(deltas[index]) ?? 0;
      sampleTimeUs += deltaUs;
      if (sampleTimeUs < target.startUs || sampleTimeUs > target.endUs) return;
      const frame = nodes.get(nodeId)?.callFrame as Record<string, unknown> | undefined;
      const sourceHash = normalizedFirstPartySourceHash(frame?.url, pageOrigin);
      const functionName = safeFunctionName(frame?.functionName);
      const key = `${sourceHash ?? "browser-internal"}:${functionName ?? "anonymous"}`;
      const current = totals.get(key) ?? { durationMs: 0, sourceHash, functionName };
      current.durationMs += deltaUs / 1_000;
      totals.set(key, current);
    });
    sampleCursorByThread.set(threadKey, sampleTimeUs);
  }
  return [...totals.values()].sort((a, b) => b.durationMs - a.durationMs).slice(0, 12);
}

function classifyOwner(input: {
  longestTask: ReturnType<typeof longestTask>;
  styleLayoutMs: number;
  paintRasterMs: number;
  rendererGpuMs: number;
  rendererGpuCommandWaitMs: number;
  garbageCollectionMs: number;
  samples: ReturnType<typeof sampledStacks>;
}): CH0029OwnerClassification {
  const task = input.longestTask;
  if (!task || task.wallDurationMs < 50) return "unresolved";
  if (
    task.threadCpuDurationMs !== null &&
    task.threadCpuDurationMs / task.wallDurationMs < 0.25 &&
    input.rendererGpuCommandWaitMs >= task.wallDurationMs * 0.45
  ) return "CI/browser/GPU execution-environment contention";
  const reference = task.threadCpuDurationMs ?? task.wallDurationMs;
  if (input.garbageCollectionMs >= reference * 0.45) return "E-garbage-collection-disposal";
  if (input.styleLayoutMs + input.paintRasterMs >= reference * 0.45) return "C-style-layout-paint";
  if (input.rendererGpuMs >= task.wallDurationMs * 0.45) return "D-renderer-gpu-execution";
  const firstParty = input.samples.filter((sample) => sample.sourceHash !== null);
  const firstPartyMs = firstParty.reduce((total, sample) => total + sample.durationMs, 0);
  if (firstPartyMs >= reference * 0.45) {
    return firstParty.some((sample) => /useFrame|frame|advance|render/i.test(sample.functionName ?? ""))
      ? "B-repeated-frame-subscriber-work"
      : "A-react-r3f-javascript";
  }
  const internalMs = input.samples
    .filter((sample) => sample.sourceHash === null)
    .reduce((total, sample) => total + sample.durationMs, 0);
  return internalMs >= reference * 0.45
    ? "F-chromium-browser-internal"
    : "unresolved";
}

export function analyzeCH0029Trace(trace: unknown, pageOrigin: string) {
  const events = (trace as { traceEvents?: TraceEvent[] } | null)?.traceEvents ?? [];
  const marks = userTimingMarks(events);
  const target = targetInterval(events, marks);
  const renderer = rendererMainThread(events);
  const task = longestTask(events, target, renderer);
  const rendererEvents = renderer
    ? events.filter((event) => event.pid === renderer.pid && event.tid === renderer.tid)
    : [];
  const breakdownTarget = task
    ? {
        startUs: target.startUs + task.startRelativeMs * 1_000,
        endUs:
          target.startUs +
          (task.startRelativeMs + task.wallDurationMs) * 1_000,
      }
    : target;
  const styleLayoutMs = durationFor(rendererEvents, breakdownTarget, (event) =>
    /Layout|UpdateLayoutTree|RecalculateStyles|StyleRecalc|ForcedStyle/.test(traceText(event)),
  );
  const paintRasterMs = criticalPathDurationFor(events, breakdownTarget, (event) =>
    /Paint|RasterTask|PrePaint/.test(traceText(event)),
  );
  const rendererGpuMs = criticalPathDurationFor(events, breakdownTarget, (event) =>
    /(?:^|,)(?:gpu|cc|viz)(?:,|:)|GPUTask|Composite|DrawFrame/.test(
      traceText(event),
    ),
  );
  const rendererGpuCommandWaitMs = durationFor(
    rendererEvents,
    breakdownTarget,
    (event) =>
      /GLES2::ReadPixels|ImplementationBase::WaitForCmd|CommandBufferHelper::Finish|CommandBufferProxyImpl::WaitForGetOffset/.test(
        traceText(event),
      ),
  );
  const garbageCollectionMs = durationFor(rendererEvents, breakdownTarget, (event) =>
    /(^|\.)GC|GarbageCollect|MinorGC|MajorGC/.test(traceText(event)),
  );
  const samples = sampledStacks(events, breakdownTarget, pageOrigin, renderer);
  const rendererEventsAttribution = topRendererEvents(
    events,
    breakdownTarget,
    renderer,
  );
  return {
    rendererMainThread: renderer,
    targetInterval: {
      startMark: target.startMark,
      endMark: target.endMark,
      wallDurationMs: Math.max(0, (target.endUs - target.startUs) / 1_000),
    },
    userTimingMarks: marks.map((mark) => ({
      name: mark.name,
      relativeMs: Math.max(0, (mark.timestampUs - target.startUs) / 1_000),
    })),
    longestTask: task,
    longestTaskRendererEvents: rendererEventsAttribution,
    longestTaskBreakdownMs: {
      styleLayout: styleLayoutMs,
      paintRaster: paintRasterMs,
      rendererGpu: rendererGpuMs,
      rendererGpuCommandWait: rendererGpuCommandWaitMs,
      garbageCollection: garbageCollectionMs,
    },
    sampledStacks: samples,
    ownerClassification: classifyOwner({
      longestTask: task,
      styleLayoutMs,
      paintRasterMs,
      rendererGpuMs,
      rendererGpuCommandWaitMs,
      garbageCollectionMs,
      samples,
    }),
  };
}
