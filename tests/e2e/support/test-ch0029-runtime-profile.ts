import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CH0029_PROFILE_CAPACITY,
  CH0029_PROFILE_CALLBACK_CAPACITY,
  CH0029_PROFILE_MAX_SUMMARY_BYTES,
  CH0029_PROFILE_MAX_TRACE_BYTES,
  CH0029_PROFILE_MAX_TRACE_DURATION_MS,
  analyzeCH0029Trace,
  selectCH0029TracingCategories,
  serializeCH0029ProfileSummary,
} from "./ch0029-runtime-profile-contract";

// This contract test is invoked directly and is intentionally not a release gate.

const repositoryRoot = process.cwd();

const selected = selectCH0029TracingCategories([
  "netlog",
  "devtools.timeline",
  "blink.user_timing",
  "disabled-by-default-v8.cpu_profiler",
]);
assert.deepEqual(selected, [
  "devtools.timeline",
  "disabled-by-default-v8.cpu_profiler",
  "blink.user_timing",
]);
assert.equal(selected.includes("netlog"), false);

const rendererGpuContentionTrace = {
  traceEvents: [
    {
      ph: "M",
      name: "thread_name",
      pid: 10,
      tid: 20,
      args: { name: "CrRendererMain" },
    },
    {
      ph: "R",
      name: "ch0029:3d-activation-requested",
      ts: 1_000_000,
      pid: 10,
      tid: 20,
    },
    {
      ph: "X",
      name: "ThreadControllerImpl::RunTask",
      cat: "toplevel",
      ts: 1_010_000,
      dur: 8_223_000,
      tdur: 200_000,
      pid: 10,
      tid: 20,
    },
    {
      ph: "X",
      name: "GLES2::ReadPixels",
      cat: "gpu",
      ts: 1_010_000,
      dur: 8_223_000,
      tdur: 200_000,
      pid: 10,
      tid: 20,
    },
    {
      ph: "X",
      name: "ImplementationBase::WaitForCmd",
      cat: "gpu",
      ts: 1_010_000,
      dur: 8_223_000,
      tdur: 200_000,
      pid: 10,
      tid: 20,
    },
    {
      ph: "R",
      name: "ch0029:failure",
      ts: 9_500_000,
      pid: 10,
      tid: 20,
    },
  ],
};
const hostAnalysis = analyzeCH0029Trace(
  rendererGpuContentionTrace,
  "http://127.0.0.1:3000",
);
assert.equal(
  hostAnalysis.ownerClassification,
  "CI/browser/GPU execution-environment contention",
);
assert.equal(hostAnalysis.longestTask?.wallDurationMs, 8_223);
assert.equal(hostAnalysis.longestTask?.threadCpuDurationMs, 200);
assert.equal(hostAnalysis.longestTask?.rendererThreadNonCpuWallMs, 8_023);
assert.equal(hostAnalysis.longestTaskBreakdownMs.rendererGpu, 8_223);
assert.equal(hostAnalysis.longestTaskBreakdownMs.rendererGpuCommandWait, 8_223);

const firstPartyTrace = {
  traceEvents: [
    {
      ph: "M",
      name: "thread_name",
      pid: 30,
      tid: 40,
      args: { name: "CrRendererMain" },
    },
    {
      ph: "R",
      name: "ch0029:3d-activation-requested",
      ts: 1_000_000,
      pid: 30,
      tid: 40,
    },
    {
      ph: "X",
      name: "ThreadControllerImpl::RunTask",
      cat: "toplevel",
      ts: 1_000_000,
      dur: 1_000_000,
      tdur: 900_000,
      pid: 30,
      tid: 40,
    },
    {
      ph: "P",
      name: "Profile",
      ts: 1_000_000,
      pid: 30,
      tid: 40,
      args: { data: { startTime: 1_000_000 } },
    },
    {
      ph: "P",
      name: "ProfileChunk",
      ts: 1_500_000,
      pid: 30,
      tid: 40,
      args: {
        data: {
          cpuProfile: {
            nodes: [
              {
                id: 1,
                callFrame: {
                  functionName: "useFrameSubscriber",
                  url: "http://127.0.0.1:3000/_next/static/chunks/app-abcdef123456.js",
                },
              },
            ],
            samples: [1, 1],
          },
          timeDeltas: [250_000, 250_000],
        },
      },
    },
    {
      ph: "P",
      name: "ProfileChunk",
      ts: 2_000_000,
      pid: 30,
      tid: 40,
      args: {
        data: {
          cpuProfile: {
            samples: [1, 1],
          },
          timeDeltas: [250_000, 250_000],
        },
      },
    },
    {
      ph: "R",
      name: "ch0029:diagnostics-complete",
      ts: 2_000_000,
      pid: 30,
      tid: 40,
    },
  ],
};
const firstPartyAnalysis = analyzeCH0029Trace(
  firstPartyTrace,
  "http://127.0.0.1:3000",
);
assert.equal(
  firstPartyAnalysis.ownerClassification,
  "B-repeated-frame-subscriber-work",
);
assert.match(firstPartyAnalysis.sampledStacks[0]?.sourceHash ?? "", /^sha256-[a-f0-9]{16}$/);
assert.equal(JSON.stringify(firstPartyAnalysis).includes("/_next/"), false);

const privatePathTrace = analyzeCH0029Trace(
  {
    traceEvents: [
      {
        ph: "M",
        name: "thread_name",
        pid: 70,
        tid: 80,
        args: { name: "CrRendererMain" },
      },
      {
        ph: "X",
        name: "/Users/example/private/source.ts",
        cat: "devtools.timeline",
        ts: 1_000_000,
        dur: 100_000,
        pid: 70,
        tid: 80,
      },
    ],
  },
  "http://127.0.0.1:3000",
);
assert.equal(JSON.stringify(privatePathTrace).includes("/Users/"), false);

const summaryFixture = {
  schema: "interior-ai.ch0029-profile-attribution.v1",
  label: "bounded-fixture",
  safety: {
    maximumSummaryBytes: CH0029_PROFILE_MAX_SUMMARY_BYTES,
    summaryBytes: 0,
  },
};
const serializedSummary = serializeCH0029ProfileSummary(summaryFixture);
assert.equal(Buffer.byteLength(serializedSummary), summaryFixture.safety.summaryBytes);
assert.ok(summaryFixture.safety.summaryBytes < CH0029_PROFILE_MAX_SUMMARY_BYTES);
assert.throws(
  () =>
    serializeCH0029ProfileSummary({
      payload: "x".repeat(CH0029_PROFILE_MAX_SUMMARY_BYTES),
      safety: {
        maximumSummaryBytes: CH0029_PROFILE_MAX_SUMMARY_BYTES,
        summaryBytes: 0,
      },
    }),
  /sanitized summary exceeded/,
);

const largeTraceAnalysis = analyzeCH0029Trace(
  {
    traceEvents: Array.from({ length: 150_000 }, (_, index) => ({
      ph: "I",
      name: "bounded-reducer-fixture",
      ts: index,
    })),
  },
  "http://127.0.0.1:3000",
);
assert.equal(largeTraceAnalysis.ownerClassification, "unresolved");

const profilerSource = readFileSync(
  path.join(repositoryRoot, "tests/e2e/ch0029-runtime-profiler.ts"),
  "utf8",
);
const smokeSource = readFileSync(
  path.join(repositoryRoot, "tests/e2e/00-runtime-smoke.spec.ts"),
  "utf8",
);
assert.equal(CH0029_PROFILE_CAPACITY, 64);
assert.equal(CH0029_PROFILE_CALLBACK_CAPACITY, 64);
assert.equal(CH0029_PROFILE_MAX_TRACE_DURATION_MS, 45_000);
assert.equal(CH0029_PROFILE_MAX_TRACE_BYTES, 256 * 1024 * 1024);
assert.equal(CH0029_PROFILE_MAX_SUMMARY_BYTES, 512 * 1024);
assert.match(profilerSource, /long-animation-frame/);
assert.match(profilerSource, /page\.addInitScript/);
assert.match(profilerSource, /globalThis\.performance/);
assert.match(profilerSource, /pendingBrowserMarks/);
assert.match(profilerSource, /markOrdered/);
assert.match(profilerSource, /profilerImplementationSha256/);
assert.match(profilerSource, /void pending\.finally/);
assert.match(profilerSource, /Tracing\.getCategories/);
assert.match(profilerSource, /Tracing\.start/);
assert.match(profilerSource, /"CH0029 failed-start session detach"/);
assert.match(profilerSource, /this\.selectedCategories = \[\]/);
assert.match(profilerSource, /transferMode: "ReturnAsStream"/);
assert.match(profilerSource, /PROFILE_TRACE_STOP_RESERVE_MS/);
assert.match(profilerSource, /remainingTraceBudgetMs/);
assert.match(profilerSource, /"CH0029 trace end"/);
assert.match(profilerSource, /"CH0029 fail-safe trace end"/);
assert.match(profilerSource, /"CH0029 session detach"/);
assert.match(profilerSource, /traceObservedDurationMs > CH0029_PROFILE_MAX_TRACE_DURATION_MS/);
assert.match(profilerSource, /unlinkSync\(rawTracePath\)/);
assert.match(profilerSource, /serializeCH0029ProfileSummary/);
assert.doesNotMatch(profilerSource, /CH0029_PROFILE_LABEL/);
assert.doesNotMatch(profilerSource, /page\.screenshot|video\.saveAs|Network\.getResponseBody/);
assert.match(smokeSource, /trace: "off"/);
assert.match(smokeSource, /video: "off"/);
assert.match(
  smokeSource,
  /process\.env\.CH0029_RUNTIME_PROFILE === "1"\) test\.use\(\{ screenshot: "off" \}\)/,
);
assert.match(smokeSource, /CH0029RuntimeProfiler/);
assert.doesNotMatch(
  readFileSync(path.join(repositoryRoot, "app/layout.tsx"), "utf8"),
  /ch0029-runtime-profiler/,
);

console.log("CH-0030 bounded profiling-harness contract passed.");
