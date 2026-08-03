# GLB model lifecycle and reload readiness

## Canonical ownership

`GLBScaledModel` owns the rendered instance. `useGLBModelLifecycle` owns its
mount identity and the load/normalize/bounds/attachment transitions.
`modelDiagnostics` is the single safe diagnostic registry; the parsed and
prepared resource caches do not decide readiness.

A lifecycle identity is the tuple of diagnostic key, mount instance ID, and
reload generation. A model URL is resource identity only: two scene items may
share one URL and cached resource while retaining distinct lifecycle identities.

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
