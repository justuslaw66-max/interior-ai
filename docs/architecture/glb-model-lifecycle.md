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

Component instances clone the prepared scene graph but share cache-owned
geometry/material resources and therefore do not dispose them. Prepared entries
retain their parsed-source lease until eviction. `pagehide` clears prepared
entries before parsed entries so a true document reload starts a new resource
and lifecycle generation; a BFCache-preserved `pagehide` retains both caches.
Cache hits still emit the same lifecycle stages as a network load; they never
synthesize `ready`.

## CH-0028 external failure and classification

At source `8e0260f5654126ec21b669d0471bcfb3c0f5cf5b`, required run
`30745386331` truthfully failed reload 1 after 70,001/70,000 ms in
`model-responses-and-readiness`. All nine observed responses were complete,
zero responses were outstanding, and these three current required fixture
records remained loading:

| Diagnostic key | Product | Variant | Safe resource identity |
| --- | --- | --- | --- |
| `runtime-smoke-model-1` | `sofa-real-castlery-dawson-ottoman` | `runtime-smoke-sofa-real-castlery-dawson-ottoman` | `/assets/models/sofa-real-castlery-dawson-ottoman.glb`, `fnv1a-09942d68` |
| `runtime-smoke-model-2` | `sofa-real-castlery-jaron-3s` | `runtime-smoke-sofa-real-castlery-jaron-3s` | `/assets/models/sofa-real-castlery-jaron-3s.glb`, `fnv1a-a7623e72` |
| `runtime-smoke-model-3` | `sofa-real-castlery-auburn-performance-fabric-3-seater-sofa` | `runtime-smoke-sofa-real-castlery-auburn-performance-fabric-3-seater-sofa` | `/assets/models/sofa-real-castlery-auburn-performance-fabric-3-seater-sofa.glb`, `fnv1a-3fa7f0e6` |

Verified classification is **F — genuine performance condition**. Exact-stage
instrumentation on the same production path ruled out stale generations,
unmounted blockers, ignored current completion, optional-entry scoping, cache-
hit transition loss, and unterminated parse/normalization/bounds errors. The
pre-fix component created a fresh loader and repeated parse/decode,
normalization, material cloning, and bounds work for the forced in-document
2D→3D remount. The external response count of nine against six required
responses confirms that extra remount generation before reload 1. The external
artifact retained aggregate loading state, not the exact post-response stage.
Controlled same-path production traces completed the current-generation stages;
combined with the external response count and timing, that supports the F
classification rather than claiming an unretained stage trace from the runner.

CH-0028 removes that redundant remount work through the bounded caches. It does
not change the 70,000 ms operation budget, 308,000 ms reload budget, retry/skip
policy, three reloads, response requirements, or any readiness assertion.

## Safe diagnostics

Production diagnostics are enabled only by the existing explicit smoke flag.
Records may contain scene/product/variant/readiness identifiers, safe URL/hash,
mount instance, reload generation, required/active status, closed stage states,
cancellation state, monotonic transition time, and closed terminal category.
They must not contain credentials, environment values, machine-local paths,
user content, raw response bodies, or loader error objects.

The required smoke verifies the three exact fixture identities, the complete
active required-key set, a stable expected registry size, generation advance on
each real reload, terminal stage completion, and zero stale registry growth.
