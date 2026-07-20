# Phase 8 performance baseline and budgets

## Scope and environment

Measurements were recorded on 2026-07-19 in the canonical
`/Users/justus/Developer/interior-ai` worktree. The reference machine was an
Apple M3 MacBook Air (8 CPU cores, 16 GB RAM) on macOS 15.7.7, Node 24.13.0,
npm 11.6.2, and Playwright 1.60 headless Chromium. Production measurements used
`next build` plus `next start`; the running development app on port 3000 was not
replaced.

This is one desktop reference, not a supported-device matrix. Headless browser
input is scheduler-sensitive, there is no network throttling, and the browser
fixtures remove product `modelUrl` values so they characterize editor/scene
scaling with deterministic fallback geometry rather than catalog/CDN delivery.
The asset policy requires a real device/network matrix before materially
tightening asset limits.

## Representative projects

`scripts/phase8-representative-projects.ts` deterministically generates:

| Scale | Rooms | Items | Pure persisted size | Browser persisted size |
| --- | ---: | ---: | ---: | ---: |
| Small consumer | 1 | 6 | 5,719 B | 5,467 B |
| Medium furnished | 4 | 120 | 89,729 B | 84,629 B |
| Large professional | 12 | 720 | 530,384 B | 499,748 B |

The fixtures include product snapshots, zones, saved views, layout versions,
surface settings, and floor openings. Browser sizes are smaller because model
URLs are deliberately removed to make the runtime run deterministic and
offline. The pure benchmark retains them and covers canonical save/load.

Reproduction commands:

```text
npm run benchmark:phase8:projects -- --check
npm run build
node scripts/measure-phase8-bundle.mjs --check
npm run start -- -p 3100
PHASE8_BASE_URL=http://127.0.0.1:3100 npm run benchmark:phase8:browser -- --check
npm run test:phase8-performance
```

## Baseline before optimization

Pure operations use `performance.now()` around canonical fingerprinting,
`snapshotToStored` plus JSON serialization, and JSON parse/sanitize plus
`storedToSnapshot`. Baseline p95 values were:

| Scale | Repeated fingerprint | Save | Load | Serialized size |
| --- | ---: | ---: | ---: | ---: |
| Small | 0.076 ms | 0.016 ms | 0.075 ms | 5,719 B |
| Medium | 0.543 ms | 0.131 ms | 1.049 ms | 89,729 B |
| Large | 2.675 ms | 1.015 ms | 5.196 ms | 530,384 B |

The pre-change production `/design` manifest measured 6,817,101 raw /
1,103,360 Brotli bytes of initial JavaScript and 135,416 raw / 17,544 Brotli
bytes of initial CSS. Cabinetry Studio was 484,784 raw / 80,038 Brotli bytes in
a lazy chunk; GLTFExporter was 34,525 raw / 8,970 Brotli bytes in a separate
lazy chunk.

A development-server browser baseline, after full editor hydration, recorded:

| Scale | Interactive | 3D to 2D | Autosave | Frame p95 | Project heap | Retained after close |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Small | 0.85 s | 0.99 s | 0.54 s | 67.8 ms | 75.8 MB | 0.77 MB |
| Medium | 2.90 s | 1.47 s | 0.92 s | 66.6 ms | 94.3 MB | 0.78 MB |
| Large | 1.73 s | 1.79 s | 1.27 s | 166.6 ms | 107.6 MB | 0.78 MB |

The development values are baseline characterization only. They are not
compared numerically with production results as an optimization claim because
development payloads, compilation, and scheduling differ.

## Evidence-led changes and before/after

The only measured hot-path optimization is the snapshot fingerprint cache.
Design snapshots are immutable command results, so
`fingerprintDesignSnapshot` stores only the final eight-character hash in a
`WeakMap` keyed by snapshot identity. It does not retain the large canonical
serialization, and garbage collection follows snapshot reachability. Fixed
fixture hashes (`5ed59743`, `9a7954f1`, and `fd13cee0`) guard compatibility.

An attempted streaming canonical serializer was rejected: although it retained
the exact hashes, the large-project median regressed from about 2.30 ms to 4.25
ms. That candidate is not in the codebase.

Final clean-run p95 results are:

| Scale | Repeated fingerprint before | Repeated fingerprint after | Cold fingerprint after | Save after | Load after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Small | 0.076 ms | 0.000583 ms | 0.061208 ms | 0.018833 ms | 0.071917 ms |
| Medium | 0.543 ms | 0.000167 ms | 0.460458 ms | 0.140000 ms | 0.893375 ms |
| Large | 2.675 ms | 0.000167 ms | 2.557459 ms | 0.951500 ms | 5.612625 ms |

Only repeated fingerprinting is claimed as an improvement. Cold fingerprint,
save, and load results are characterized as within run-to-run noise and their
ratchets; no improvement is claimed for them.

Cabinetry Studio was already dynamically loaded. Phase 8 also moved the cabinet
GLB export facade behind a dynamic import, so GLTFExporter is requested only
when stale cabinet GLBs need regeneration. The conservative production manifest
still measures the same Studio and exporter implementation chunk sizes, so no
byte reduction is claimed. The final initial bundle is 6,817,892 raw /
1,106,360 Brotli bytes of JavaScript and unchanged CSS: +791 raw and +3,000
Brotli JavaScript bytes (about 0.3%) for fingerprint/renderer instrumentation,
within the measured ratchet.

## Current production browser characterization

The final production run waited for the exact fixture room count, sampled 120
animation frames, swept 30 pointer positions across the 3D canvas, switched to
2D, changed a room dimension, waited for local autosave, sampled WebGL renderer
information, and used Chrome DevTools Protocol heap metrics before open, while
open, and after navigation to `about:blank` plus forced garbage collection.

| Metric | Small | Medium | Large |
| --- | ---: | ---: | ---: |
| Editor interactive | 2,707.69 ms | 2,693.09 ms | 2,441.39 ms |
| Encoded JS / CSS | 1,322,684 / 22,958 B | same | same |
| Pointer sweep | 1,812.87 ms | 1,626.14 ms | 1,747.19 ms |
| 3D to 2D | 529.81 ms | 902.59 ms | 1,141.14 ms |
| Local autosave | 199.94 ms | 667.80 ms | 866.86 ms |
| Frame p50 / p95 | 33.3 / 66.0 ms | 33.3 / 99.9 ms | 49.9 / 100.5 ms |
| Session long tasks | 23 / 5,128 ms | 28 / 6,512 ms | 36 / 6,659 ms |
| FPS sample | 30 | 30 | 21 |
| Draw calls / triangles | 20 / 162 | 179 / 1,888 | 300 / 3,352 |
| Geometries / textures | 27 / 5 | 164 / 9 | 287 / 9 |
| Project JS heap | 23,711,080 B | 37,109,252 B | 49,643,496 B |
| Retained after close | 673,384 B | 676,848 B | 675,812 B |
| Pro implementation chunks loaded | 0 | 0 | 0 |

Interactive time is not monotonic because the local server is warm and browser
scheduling varies. Large-project scaling is visible in autosave, frame time,
draw calls, geometry count, and live heap. The long-task observer covers the
whole measured session, not startup alone.

## Performance ratchets and derivation

The machine-readable values live in
`config/phase8-performance-budgets.json`. They are regression ceilings, not
product promises:

- Project byte and save/load/fingerprint limits sit above the measured p95s and
  allow normal local scheduler variance while still detecting order-of-
  magnitude regressions. Thirty large samples keep p95 from becoming one
  scheduler outlier.
- Bundle ceilings are just above the measured production baseline: 6,955,000
  raw / 1,130,000 Brotli JS; 140,000 raw / 19,000 Brotli CSS; 500,000 raw /
  85,000 Brotli Studio; and 40,000 raw / 11,000 Brotli exporter.
- Browser ceilings are based on repeated development and production runs:
  6,000 ms interactive, 6,000 ms for the synthetic 30-step pointer sweep,
  3,000 ms to switch to 2D, 2,500 ms local autosave, 250 ms frame p95, 150 MB
  live heap, 2 MB retained after close, and zero loaded Pro implementation
  chunks in Consumer Mode. The generous timing headroom reflects headless
  scheduling; sustained movement toward a ceiling still requires investigation.

The deterministic project and bundle checks run in
`npm run test:phase8-performance`. The production browser check is separate
because it requires a built, running app and Chromium; `--check` enforces all
browser ceilings and requires FPS/draw-call samples.

## State and render audit

| Concern | Evidence and disposition |
| --- | --- |
| Broad contexts | No broad design-page React context was found. The only editor-related context is measurement unit and is scoped inside the lazy Cabinetry overlay. |
| Global-store subscriptions / unstable selectors | No Zustand/global-store subscription was found in the design/scene path. State is composed through typed hook read models. Derived room, shopping, selection, surface, and scene models are memoized. |
| UI rerenders | Automated React commit counts are absent. Source audit confirms renderer metrics update React state only when their values change and QA snapshots are memoized. A profiler run on supported interactive devices remains required before claiming fewer commits. |
| Object cloning | Design commands return immutable snapshots. GLB source, geometry, and material clones occur on asset/config dependency changes inside `useMemo`, not in the render loop, and are disposed. The fingerprint cache avoids repeated canonical cloning for the same snapshot. |
| Animation-loop allocation | Furniture reuses plane/raycaster/vector refs during pointer work. Some existing steady frame callbacks and wall-cutaway calculations remain; browser frame budgets pass, so behavior-sensitive consolidation is deferred until React/Three profiling identifies a bottleneck. |
| Repeated geometry | Room, house-plan, surface, zone, selection, and imported-catalog derivations use `useMemo`. Canonical floor-plan shapes are shared by the 2D/3D adapters rather than persisted twice. |
| Synchronous heavy work / workers | Save/load of the 530-KB fixture remains under 6 ms p95 in the pure benchmark; browser autosave is under 0.9 s. No worker was introduced because current measurement does not justify coordination and cancellation complexity. |
| Materials and textures | Per-product GLB mutations clone owned materials/geometries; loaded/generated textures have paired disposal. Renderer memory counters are now sampled once per second. |
| Renderer initialization | The main design scene has one React Three Fiber canvas. Cabinet preview has its own renderer only while the lazy Pro overlay is open. No Consumer run loaded the Pro implementation. |

## Cleanup and limitations

Cleanup is verified both structurally and at runtime. `GLBScaledModel`, room
materials, generated cabinetry, cabinet blob storage, and export/download URLs
have paired disposal or revocation. After complete project-page teardown, all
three fixtures retained about 0.68 MB, well below the 2-MB ceiling even though
live heap grew to 49.6 MB for the large project.

Automated React rerender counts, GPU memory bytes, production catalog/CDN model
latency, mobile/touch hardware, reduced-memory devices, and throttled networks
are not measured by this Phase 8 harness. Draw calls, Three geometry/texture
counts, JS heap, frames, pointer sweep, and long tasks are measured; the missing
dimensions are explicitly not presented as passing performance claims.
