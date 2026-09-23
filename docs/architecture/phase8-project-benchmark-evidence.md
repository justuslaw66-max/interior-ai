# Phase 8 project benchmark evidence

## Scope and preserved performance contract

This test-infrastructure boundary hardens the pure Phase 8 representative-project
benchmark without changing its measured production operations. The benchmark still
uses the deterministic small, medium, and large projects in that order. Within each
project it performs cold fingerprint, cached fingerprint, save, and load in that
order. Every operation has one untimed warmup and 160, 80, or 30 timed samples for
small, medium, or large respectively. Each sample is timed only with
`performance.now()` and is reported in milliseconds.

Cold fingerprinting still passes a shallow-cloned snapshot so each call misses the
identity cache. Cached fingerprinting still passes the same snapshot identity.
Nearest-rank p50 and p95 copy and sort the raw values; for 30 values, p95 selects
the 29th sorted value (one-based). Summaries remain rounded to six decimal places,
with a parent-validation serialization tolerance of 0.000000000001 ms. No sample
is removed or retried.
The large cold-fingerprint p95 ceiling remains 6 ms, and all other Phase 8 byte and
timing ceilings remain those in `config/phase8-performance-budgets.json`.

## Evidence schema and trust boundary

Every wrapper invocation creates one unique ignored directory under
`.local/phase8-project-benchmark-evidence/`. The portable report schema is
`interior-ai.phase8-project-benchmark-evidence.v1` with numeric schema version 1.
It records:

- source commit, exact `HEAD^{tree}`, branch/detached marker, nonce, UTC and monotonic times,
  child/parent PIDs, actual process result, command/mode, Node/npm, platform, CPU,
  logical cores, and total memory;
- SHA-256 bindings for the benchmark, representative fixture generator, production
  fingerprint implementation, performance budgets, package files, schema,
  validator, context, evidence I/O, and wrapper sources;
- the exact scale/operation order, samples, warmup, timer, units, percentile rule,
  thresholds, and fixture room/item/view/zone/opening/serialized-byte/fingerprint
  summaries;
- every raw timing value, a sequence SHA-256, p50, p95, maximum, threshold, and
  decision for every operation; and
- before/after/delta process CPU, resource and memory usage, event-loop utilization,
  process wall time, host load, and free memory.

The Node runtime can expose GC observations only by activating an observer or trace
facility for this process. The required command does not activate one because that
would change the benchmark process. Evidence therefore records
`gcTelemetry.available: false` and an explicit reason; absence is not a benchmark
failure.

The child owns measurement and writes `child-evidence.json` through a unique
temporary file, flush/close, and atomic rename. It writes a SHA-256 sidecar and then
`child-complete.json`. The parent owns invocation identity, captures child stdout
and stderr in separate bounded files, validates the completion marker and child
report, recomputes every summary and threshold decision from raw arrays, checks the
actual exit/signal, and writes a separate canonical `evidence.json`, sidecar, and
final completion marker atomically. Wrapper output cannot target an evidence JSON
filename, and the parent never rewrites the child's raw report.

The validator rejects missing, stale, truncated, wrong-version, wrong-nonce,
wrong-commit/tree/PID/command, source-hash or fixture mismatch; missing/duplicate or
out-of-order scales/operations; empty, wrong-count, reordered, nonfinite, or
negative samples; incorrect summaries/decisions; missing completion; and
child/report exit disagreement. A threshold-failing child first completes all raw
evidence, including the 30-value large cold array, then exits nonzero. A valid
parent preserves that nonzero result. Harness or evidence-write failures fail
closed and retain separate validation diagnostics; an existing child failure
remains the primary exit when both conditions occur.

All source hashing, Git/fixture/system discovery, process snapshots, report
construction, serialization, writes, stdout/stderr hashing, and validation occur
outside individual timed samples. No process observer remains active during the
sample loop. The only retained measurement payload is the raw number arrays
already produced by the sampler: 1,080 values across all operations/scales
(about 8.6 KiB of numeric payload), bounded by the frozen sample counts.

## Ownership, retention, integration, and rollback

`npm run test:phase8-performance` remains the sole Phase 8 performance owner. It
runs the deterministic evidence/validator contract suite before the real wrapped
benchmark, then retains the existing bundle and architecture boundary checks. No
new merge gate or duplicate required umbrella is introduced. The new scripts do
not match required-test source discovery, so the required manifest inventory and
hashes remain unchanged; truthfulness and direct manifest validation must still
pass.

Local reports are ignored, bounded to 2 MiB for JSON and 256 KiB per captured
stream, contain no environment variables or configured private paths in the
portable JSON, and retain at most eight uniquely named run directories. Raw
stdout/stderr are exact local-only diagnostics and can contain machine-local
paths from toolchain failures; they must not enter portable upload artifacts.
Caught benchmark errors normalize the repository root to `<WORKSPACE>`. Task-level
smoke evidence is removed after the result/hash needed for the handoff is
recorded. These are observability artifacts, not certification and cannot
unblock CH-0015E.

Rollback is one revert of the focused observability commit, followed by the
deterministic benchmark contract, complete Phase 8 owner, required-test
truthfulness, production-artifact evidence contract, code quality, zero-warning
lint, typecheck, and artifact-hygiene checks. No production implementation,
fixture, threshold, schema/data, deployment, or external-service rollback is
needed.
