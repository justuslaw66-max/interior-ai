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
  raw / 1,130,000 Brotli JS; 140,000 raw / 18,000 Brotli CSS; 500,000 raw /
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

## Phase 8A surface-catalog initial-JS remediation — 2026-08-04

This bounded batch began at exact source
`101f25d095c6e205e2d40e1ad843a24210696e40`. Both authoritative measurements
used clean detached worktrees, Node 24.13.0, npm 11.6.2,
`npm ci --include=dev`, the same non-secret strict environment, `npm run build`,
and `node scripts/measure-phase8-bundle.mjs`.

| `/design` production metric | Before | After | Limit | Result |
| --- | ---: | ---: | ---: | --- |
| Initial JS raw | 7,103,302 B | 5,790,970 B | 6,955,000 B | PASS; -1,312,332 B |
| Initial JS Brotli | 1,169,257 B | 1,104,573 B | 1,130,000 B | PASS; -64,684 B |
| Initial JS chunks | 26 | 26 | informational | No new eager chunk |
| Initial CSS raw | 143,779 B | 143,779 B | 140,000 B | Unchanged; separate Phase 8B blocker |
| Initial CSS Brotli | 18,417 B | 18,417 B | 18,000 B | Unchanged; separate Phase 8B blocker |
| Cabinetry Studio lazy | 492,639 / 84,899 B | 492,639 / 84,899 B | 500,000 / 85,000 B | Unchanged |
| GLTFExporter lazy | 34,525 / 8,970 B | 34,525 / 8,970 B | 40,000 / 11,000 B | Unchanged |

The starting dominant chunk was `32way5mecu96l.js` at 3,788,924 raw /
428,408 Brotli bytes. Source-map composition identified the former combined
surface runtime as its dominant source owner and the 2,484-row Nippon paint
catalog as the remaining surface-browser metadata owner. The old generated
runtime was 92,044 lines and 2,518,834 source bytes; its 980 production records
and one test fixture were statically reachable. The replacement eager render
source is 666,766 raw / 15,734 Brotli source bytes. Full surface metadata is a
670,766 raw / 9,388 Brotli generated source and a 633,154 raw / 9,397 Brotli
lazy production chunk. Nippon rows are 294,991 raw / 59,620 Brotli source bytes
and a separate 274,965 raw / 58,679 Brotli lazy chunk; their eager canonical
contract is only 492 raw / 238 Brotli source bytes. The one 1,379-byte generated test
fixture has no production chunk membership.

The exact before initial-JS inventory was:

```text
02iynxgmi-nbh.js  0514mblmz6830.js  0bqt9hlwk6krg.js
0bsph-x3dyobe.js  0cz1d0mv5g_q7.js  0eusmj441hy3n.js
0hucplppa7o5c.js  0w9hwmfpin3n5.js  12b4ay8feturj.js
1cgx8te15zv_g.js  1e097gkishc94.js  1rf82mie-t5k2.js
1ucz4vcm7xkvs.js  1ws37m2fjosbm.js  2efnbfqwlu6md.js
2ejk_26znfoeu.js  2hjhuw_z24-ql.js  2o4cgl9syntkb.js
3299thjrimaon.js  32way5mecu96l.js  39-oykeu_fmtw.js
3iekndwd3e69a.js  3nc6x0_y5iwnk.js  3w8dn4-zxwo2r.js
43_qdpbkaeb5w.js  turbopack-1qqm9sd0q_nj6.js
```

The exact after initial-JS inventory was:

```text
02iynxgmi-nbh.js  0514mblmz6830.js  0bqt9hlwk6krg.js
0bsph-x3dyobe.js  0cz1d0mv5g_q7.js  0eusmj441hy3n.js
0hucplppa7o5c.js  0w9hwmfpin3n5.js  12b4ay8feturj.js
12gglxc7sibtu.js  1cgx8te15zv_g.js  1e097gkishc94.js
1mgrxrdj11nne.js  1rf82mie-t5k2.js  1ws37m2fjosbm.js
2efnbfqwlu6md.js  2ejk_26znfoeu.js  2hjhuw_z24-ql.js
2o4cgl9syntkb.js  3299thjrimaon.js  39-oykeu_fmtw.js
3iekndwd3e69a.js  3nc6x0_y5iwnk.js  3w8dn4-zxwo2r.js
43_qdpbkaeb5w.js  turbopack-1qqm9sd0q_nj6.js
```

The largest after chunk is `12gglxc7sibtu.js` at 2,476,040 raw / 363,521
Brotli bytes; it retains the compact synchronous render data needed for saved
material hydration and 2D/3D rendering. No equivalent descriptive, sample, or
Nippon catalog data appears in the initial graph. The generated ownership,
field matrix, trigger, failure, and BOM/export contracts are detailed in
`docs/architecture/surface-material-runtime-boundary.md`.

Phase 8A resolves the owned raw and Brotli JavaScript budgets. At that
checkpoint the machine-readable CSS Brotli ceiling was still the stale 19,000
bytes, so its combined `--check` command exited nonzero solely because raw CSS
was 3,779 bytes above 140,000. Against Phase 8B's authoritative 18,000-byte
ceiling, the same unchanged artifact was also 417 Brotli bytes over. Phase 8A
did not change or rebaseline CSS; the separately reviewed Phase 8B remediation
below owns both CSS failures.

## Phase 8B initial-CSS ownership remediation — 2026-08-04

This bounded batch began at exact source
`299536fee37fe68b3fde38c02984f5aba21a6231`. The before artifact was reproduced
in a clean detached worktree with Node 24.13.0, npm 11.6.2,
`npm ci --include=dev`, the strict 57-page production build, and
`node scripts/measure-phase8-bundle.mjs`. The initial CSS result matched the
required baseline exactly: one `/design` CSS chunk at 143,779 raw / 18,417
Brotli bytes.

The starting machine-readable file still encoded the superseded 19,000-byte
Brotli value even though this batch's authoritative acceptance ceiling is
18,000. Phase 8B changes that guard only downward to 18,000; no measured value
was adopted as a baseline and no CSS or JavaScript ceiling was raised.

The selected correction makes Tailwind ownership follow existing route and
lazy-code boundaries. The 53 admin-only and 20 GLB-optimizer-only candidates
now load from their route layouts. The 98 candidates used only by Custom
Millwork Studio load from the already-dynamic `CabinetryStudio`
implementation. Ten candidates used by multiple excluded owners remain once
in the root sheet. Shared editor, material-browser, accessibility, responsive,
modal, and export candidates also stay global. No selector was deleted to meet
the number, and no style was moved into runtime JavaScript. Identical Tailwind
property registrations are stripped only from scoped outputs after the guard
proves their root registrations and load ordering.

| `/design` production metric | Before | After | Limit | Result |
| --- | ---: | ---: | ---: | --- |
| Initial CSS raw | 143,779 B | 129,803 B | 140,000 B | PASS; -13,976 B; 10,197 B headroom |
| Initial CSS Brotli | 18,417 B | 17,182 B | 18,000 B | PASS; -1,235 B; 818 B headroom |
| Initial CSS chunks | 1 | 1 | informational | No new eager CSS chunk |
| Initial JS raw | 5,790,970 B | 5,791,004 B | 6,955,000 B | PASS; explained +34 B stylesheet edge |
| Initial JS Brotli | 1,104,573 B | 1,104,582 B | 1,130,000 B | PASS; explained +9 B stylesheet edge |
| Initial JS chunks | 26 | 26 | informational | One deterministic chunk hash changed; count preserved |
| Cabinetry Studio lazy JS | 492,639 / 84,899 B | 492,639 / 84,899 B | 500,000 / 85,000 B | Unchanged |
| GLTFExporter lazy JS | 34,525 / 8,970 B | 34,525 / 8,970 B | 40,000 / 11,000 B | Unchanged |

The exact clean before CSS inventory was:

```text
3p037ihv70l6o.css  143,779 raw / 18,417 Brotli  /design initial
1pg4g3scc5f8v.css   30,366 raw /  3,966 Brotli  admin module only
```

The post-change strict-build CSS inventory was:

```text
2ot--cpfioh0t.css  129,803 raw / 17,182 Brotli  /design initial global/shared
10lj_rzo51l97.css   13,197 raw /  2,345 Brotli  lazy Cabinetry Studio
38jk95zqo9_e1.css    5,639 raw /  1,304 Brotli  /admin Tailwind owner
1aj5did-ynuj4.css     2,693 raw /    623 Brotli  /tools Tailwind owner
1pg4g3scc5f8v.css    30,366 raw /  3,966 Brotli  /admin CSS module
```

The route manifest maps `/design` only to the 129,803-byte global/shared chunk.
Admin maps to that shared chunk plus its Tailwind and module chunks; the GLB
optimizer maps to the shared chunk plus its tools chunk. Cabinetry CSS is not
in the initial route manifest and arrives with the existing lazy Studio
implementation. Exact ownership categories, selectors, triggers, conservative
global decisions, and no-FOUC evidence are recorded in
`phase8-css-ownership.md`.

The boundary guard uses Tailwind's scanner and design system to recompute every
valid global, cross-owner, and exclusive candidate; rejects overlap, omission,
or drift; checks compiled semantic selector membership without depending on
chunk hashes; and proves scoped property registrations are neither duplicated
nor missing. The complete
Phase 8 gate, 78 design-page cleanup checks, full Cabinetry verification,
editor accessibility, Chromium/WebKit Pro visual policy 4/4, required-test
truthfulness, production-artifact evidence, zero-warning lint, typecheck, code
quality, and strict build pass. The inherited Turbopack/NFT broad-trace warning
remains. Full E2E was not run.
