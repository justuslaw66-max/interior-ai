# GLB model lifecycle and reload readiness

## Canonical ownership

`GLBScaledModel` owns the rendered instance. `useGLBModelLifecycle` owns its
mount identity and the load/normalize/bounds/attachment transitions.
`modelDiagnostics` is the single safe diagnostic registry; the parsed and
prepared resource caches do not decide readiness.

A lifecycle identity is the tuple of diagnostic key, mount instance ID, and
reload generation. A model URL is resource identity only: two scene items may
share one URL and cached resource while retaining distinct lifecycle identities.

## Bounds vocabulary

| Concept | Coordinate/transform contract | Owner and consumers | Persistence |
| --- | --- | --- | --- |
| Raw asset bounds | Temporary `Box3` in decoded asset coordinates, before catalog target dimensions, calibration, or scene-item transforms. | `normalizeGLBScene` uses it only to fit and center the decoded scene. | Never persisted or exposed as canonical bounds. |
| Normalized scene-item-local bounds | `GLBLocalRenderBounds` measured by `measureGLBLocalRenderBounds` from a detached normalized model. Catalog target scale, calibration, root/node transforms, and normalization offsets are already applied exactly once. The enclosing furniture translation and durable Y rotation are not applied. | A prepared resource owns the reusable primitive value and each prepared mount receives copied center/size tuples; an uncached/texture-configured instance resolves the same value from its normalized model through `boundsForResource`. `useGLBModelLifecycle` exposes it to `GLBScaledModel`, semantic bounds diagnostics, and `FurnitureSelectionOutline`. | Ephemeral and never written to the design document. |
| Selection bounds | Padding derived from normalized scene-item-local center/size. It remains under the furniture group, so Three.js applies the current item translation and Y rotation when rendering the outline. | `FurnitureSelectionOutline`; no second React or document bounds state. | Never persisted. |
| Transformed world bounds | A transient projection of local bounds through the current item transform when a world-space axis-aligned result is required. Translation or rotation must not overwrite the canonical local value. | There is no persisted GLB world-bounds registry. Scene rendering derives transforms through the parent group. | Never persisted. |
| Placement/collision footprint | XZ planning width/depth from catalog dimensions or `planningBoundsMm`, rotated about Y by the canonical item transform. It is intentionally independent of visual GLB bounds. | Furniture placement, room clamping, snapping, and collision/selection-transform controllers. | The document persists item position and canonical `rotationDeg`; it does not persist a derived AABB. |
| Diagnostic bounds state | Closed lifecycle stages, error category, change/publication counts, and safe timings; not a geometry payload. | `modelDiagnostics` and the required metadata snapshot. | In-memory and generation-scoped only. |

Prepared cache hits and fresh parsed loads must produce equivalent normalized
scene-item-local bounds. Prepared scene graphs, geometry, and materials are
deep-cloned per mount, and the cached primitive bounds are copied at the same
mount boundary. Semantic observations are also copied per model tracker, so one
item's transform or published observation cannot mutate another item or the
cache. Geometry without bounds terminates as `glb-empty-bounds`; non-finite or
all-zero results terminate as `glb-bounds-failed`. A planar result with one
zero axis remains valid when at least one extent is positive.

## Required terminal invariant

Every active required identity must terminate as `ready` or `error`. An
unmounted or superseded identity terminates as `cancelled` and cannot block the
current required set. Optional entries are diagnostic only unless their caller
explicitly marks them required.

The ordered observable stages are:

1. request started;
2. response complete, with `network`, `cache-hit`, or `unknown` delivery;
3. parse/decode complete;
4. normalization complete;
5. material setup complete;
6. local bounds complete;
7. scene attached;
8. ready committed.

Load/import/parse, normalization, material, bounds/empty-bounds, and attachment
failures use closed safe error categories. A cancelled handle rejects later
callbacks through its exact mount/generation identity, so a stale callback
cannot mutate a newer record.

## Bounded resource reuse

The parsed GLB cache shares a URL-backed source. For models without external
variant texture maps, the prepared cache also shares the normalized geometry,
materials, and measured local bounds for an equivalent render configuration.
Each cache has a 32-entry maximum, ref-counted leases, failed-load eviction,
inactive least-recently-used pruning, and one disposal path per entry.

Component instances deep-clone the prepared scene graph, geometry, and
materials, then dispose those instance-owned resources on release; immutable
texture references remain cache-owned. Prepared entries retain their
parsed-source lease until eviction. `pagehide` clears prepared
entries before parsed entries so a true document reload starts a new resource
and lifecycle generation; a BFCache-preserved `pagehide` retains both caches.
Cache hits still emit the same lifecycle stages as a network load; they never
synthesize `ready`.

## CH-0028 external evidence and current classification

Current status: **EXTERNALLY VERIFIED — RESOLVED** at verified source
`db346a51718967bd4dc1605b07c0850e02fd08d1`. The run history below is retained
as provenance; CH-0029 begins from that resolved source and does not alter
CH-0028 lifecycle or cache ownership.

The initial required run `30745386331` at source
`8e0260f5654126ec21b669d0471bcfb3c0f5cf5b` truthfully failed reload 1 after
70,001/70,000 ms in `model-responses-and-readiness`. All nine observed
responses were complete, zero responses were outstanding, and these three
current required fixture records remained loading:

| Diagnostic key | Product | Variant | Safe resource identity |
| --- | --- | --- | --- |
| `runtime-smoke-model-1` | `sofa-real-castlery-dawson-ottoman` | `runtime-smoke-sofa-real-castlery-dawson-ottoman` | `/assets/models/sofa-real-castlery-dawson-ottoman.glb`, `fnv1a-09942d68` |
| `runtime-smoke-model-2` | `sofa-real-castlery-jaron-3s` | `runtime-smoke-sofa-real-castlery-jaron-3s` | `/assets/models/sofa-real-castlery-jaron-3s.glb`, `fnv1a-a7623e72` |
| `runtime-smoke-model-3` | `sofa-real-castlery-auburn-performance-fabric-3-seater-sofa` | `runtime-smoke-sofa-real-castlery-auburn-performance-fabric-3-seater-sofa` | `/assets/models/sofa-real-castlery-auburn-performance-fabric-3-seater-sofa.glb`, `fnv1a-3fa7f0e6` |

That evidence established the original redundant-remount performance condition.
CH-0028 removed the extra in-document loader generation through bounded caches
without changing any timing or readiness contract.

The authoritative follow-up is required-only run `30752899319` at exact source
`c0ccd0d5f4c4d20b058712e4c6e20c3146f02068`. It proved eight active-required
models ready, zero loading/error, six cumulative fixture responses on reload 1,
the three exact identities above, stable active keys and registry equality, and
current-generation readiness. Models-ready occurred around 71.3 seconds and
bounds-settled around 109.6 seconds, but the final required snapshot exceeded
its unchanged 5,000 ms budget. Its safe three-file artifact is `8835124580`.

The final-snapshot failure was classified **B — browser main-thread starvation**
under the earlier follow-up taxonomy.
The five-second timeout alone did not establish this: the retained external
timeline showed earlier diagnostic callbacks delayed for tens of seconds, and
the replacement snapshot now separates host request, callback entry,
computation start/end, explicit serialization completion, and host receipt.
Across the final nine clean local reloads, callback scheduling used 510–674 ms,
the metadata snapshot computed in 0–0.2 ms, JSON serialization used 0 ms, and
transfer used 255–448 ms, while the browser event-loop probe observed
9,557.2–11,320.3 ms stalls. Per-model maxima were parse/decode 287.7 ms,
normalization 8.4 ms, isolated material/geometry cloning 0.3 ms, material setup
168.5 ms, bounds 4.0 ms, prerequisite-to-post-commit scene attachment 97.4 ms,
and ready publication 0.1 ms. Per-stage loop samples are same-boundary
observations, not causal attribution; historical Resource Timing response ends
carry no mismatched loop sample. The measured long-delay category is
main-thread scheduling, not snapshot traversal, cache inconsistency, payload
serialization, stale observation, repeated parse/preparation, bounds,
attachment, disposal, or cache misses.

The canonical 70,000 ms `model-responses-and-readiness` operation budget
remains hard and unchanged. The separate reload
`performanceWarningThresholdMs: 70_000` is explicitly a non-failing
performance observation threshold, not an authoritative product-performance
or independent release requirement. Lifecycle/cache correctness remains
CH-0028; constrained-runner end-to-end reload latency is tracked separately as
CH-0029.

Required-only run `30780102332` superseded that boundary: reload 1 reached
`models-ready` with eight ready models and six responses, then stalled before
requesting the final snapshot. A controlled hard-bound reproduction proved
that the separate post-readiness body-state call was invoked but its browser
callback could not enter within the unchanged 5,000 ms operation deadline.
Under the current required A–F taxonomy this is **C — browser main-thread
starvation**. The body-text condition is now observed inside the atomic
readiness callback and asserted afterward on the host, avoiding a second
browser admission without weakening the assertion. Relative timing retains
host invocation/receipt and browser entry/exit/serialization separately;
constrained-runner scheduling remains owned by CH-0029.

## CH-0029 hidden-frame scheduling and diagnostics

CH-0029 remains **OPEN — POST-RESPONSE BROWSER/MAIN-THREAD STARVATION** pending
required-only external verification. Its measured classification is the
inseparable **C/G React/R3F render-work and host/test-contention cluster**.
During the loading veil, the hidden Canvas previously ran the complete mounted
per-frame subscriber workload plus renderer/GPU submission while trace/video and
the production server competed on the same constrained host. The matched
10,736 ms long task remained `unattributed`; measured renderer calls totaled
387.9 ms and peaked at 148.1 ms, so the long task is not assigned directly to
`WebGLRenderer.render` or any lifecycle/cache stage.

While the loading veil is active, Canvas now uses demand rendering. It returns
to continuous rendering when the scene becomes visible and interactive. The
change does not defer or synthesize any lifecycle transition: response,
parse/decode, normalization, material, bounds, attachment, and ready ordering
remain exactly as above. Cache leases, cancellation, supersession, terminal
errors, clone ownership, BFCache preservation, and real-reload cache clearing
are unchanged.

Optional diagnostic collection uses the existing explicit production flag and
a 96-entry bounded metadata ring. Categories, relative times, safe current
generation/stage counts, long tasks, heartbeat/frame gaps, counters, and
observer overhead are retained; raw Three.js objects, assets, URLs, paths, and
user/environment data are not. Long-task attribution requires at least 80%
measured overlap, entries predating initialization are excluded, and returned
nested stage maps are detached from internal state. Stable-smoke logs expose a
safe aggregate and safe required snapshot rather than raw registries.

Final pristine production smokes completed reloads in 10,192–11,354 ms with
6/9/12 responses and the established eight-ready/cache/refcount invariants.
The maximum heartbeat delay was 6,858 ms and every callback entered; a two-CPU
pressure run passed with 12,725/11,859/12,048 ms reloads, 8,102 ms heartbeat,
and 7,168 ms callback admission. These improve the authoritative 11,747 ms
heartbeat and eliminate its requested-but-never-entered callback. They do not
prove an admitted-callback maximum below the external 5,281 ms maximum, and
the longest JavaScript task remains unattributed.

## Safe diagnostics

Production diagnostics are enabled only by the existing explicit smoke flag.
The optional in-page registry may retain the loader URL for lifecycle debugging;
the required snapshot and its logs expose only the safe resource hash. Required
records may contain controlled scene/product/variant/readiness identifiers,
mount instance, reload generation, required/active status, separate parsed and
prepared acquisition outcomes, closed stage states, cancellation state,
monotonic transition time, and closed terminal category.
They must not contain credentials, environment values, machine-local paths,
user content, raw response bodies, or loader error objects.

The required smoke verifies the three exact fixture identities, the complete
active required-key set, a stable expected registry size, generation advance on
each real reload, terminal stage completion, and zero stale registry growth.
