# 3D asset performance and delivery policy

This policy describes the current Interior AI product constraints and the
admission contract for furniture, cabinetry, and material assets. It is based
on the repository inventory and the Phase 8 Apple M3 production-browser
profile, not on an assumed universal device limit.

The 2026-07-19 inventory contains 197 runtime GLBs. Their median size is
595,584 bytes, p95 is 1,541,740 bytes, and the largest is 63,978,016 bytes. The
largest file is a clear outlier and is above the normal publication budget.
The public tree also contains 61 PNG, 80 JPEG, and 151 WebP images. A scan of
249 images under `public/assets` found four with an axis just over 2,048 pixels,
none over 4,096 pixels, and a maximum extent of 2,048 by 2,062 pixels.

## Supported formats

- Runtime and published model format is binary glTF 2.0 (`.glb`). A `.gltf`
  file is accepted only as an import source and must be normalized to a
  self-contained GLB before publication; unresolved sidecar buffers or images
  are not a runtime contract.
- The admin optimizer accepts `.glb` and `.gltf`, bounds multipart input to 82
  MiB, bounds the file itself to 80 MiB, and verifies the GLB magic bytes or
  JSON opening token. Those limits protect transport; they are not publication
  budgets.
- Runtime GLB loading supports ordinary glTF, Draco-compressed geometry, and
  Meshopt-compressed geometry. Import output uses Meshopt.
- Runtime raster textures may be PNG, JPEG, or WebP. WebP is the preferred
  delivery format for opaque or alpha-capable catalog textures and previews.
  Base-colour textures use sRGB; normal, roughness, metallic, AO, and other data
  maps remain in a non-colour space.
- The optimizer must validate the source before publication. A tool-unavailable
  or fallback-copy result is visible in the pipeline report and requires review;
  successful HTTP output alone is not approval.

## Geometry and level of detail

The existing import-QA defaults are the initial practical admission boundary:
20 MiB after normalization, 120,000 triangles, no more than eight textures,
and an axis-aligned size between 0.05 m and 8 m per axis. These values already
back the import report and reflect furniture-scale content plus the measured
large-project browser profile. Environment overrides may tighten or relax them
for a controlled catalog, but exceptions require a recorded device/profile
result and reviewer approval.

The renderer currently selects one model rather than a distance-dependent LOD.
Consequently every published model must meet the single-model boundary; an
80-MiB transport allowance is not permission to ship an 80-MiB scene asset.
The 63.98-MB checked-in outlier must be optimized or explicitly quarantined
before it is treated as representative production content.

Do not add a universal lower triangle ceiling or automatic decimation ratio
without inspecting silhouette loss on real products. If device evidence shows
the current 120,000-triangle boundary is insufficient, introduce an explicit
LOD contract first: named high/medium/preview artifacts, deterministic
selection, unchanged product dimensions/pivot, visual QA, and a fallback to the
lowest valid level. Generated cabinetry should continue using its parametric
part geometry rather than exporting and reloading a duplicate scene model.

## Textures and materials

- The current default maximum texture axis is 2,048 pixels, matching the import
  QA policy and nearly all observed assets. A larger texture requires evidence
  that a 2K version visibly fails at the intended camera distance and device
  pixel ratio.
- The pipeline compresses the standard PBR slots to WebP quality 85 and limits
  them to the configured maximum texture size. Mesh/accessor optimization and
  texture compression are separate reported steps; a texture-step failure must
  not be silently called optimized.
- Avoid duplicate maps that encode the same material response. Reuse material
  definitions within a GLB where visual behavior is identical. Author normal
  and roughness maps only where they materially improve the product at editor
  distance.
- A catalog item and each published variant require an appropriately sized
  thumbnail. Listing UI must load the thumbnail, not decode a GLB or full hero
  image. WebP derivatives are preferred; retain PNG only when lossless alpha is
  materially necessary.
- Missing or failed models retain the existing dimensionally accurate box
  fallback. Imported standard materials are physically clamped, and a missing
  texture must degrade to a bounded base-colour/roughness material rather than
  making the item disappear. A fallback is user recovery, not publication QA.

## Coordinates, units, and validation

- Author GLB content right-handed and Y-up, with the product standing on its
  floor plane. The runtime centers the model footprint and aligns its lowest
  bound to the catalog item floor position.
- Canonical document and product dimensions are millimetres. The scene boundary
  converts them to metres. Model bounds are scaled to the catalog width,
  height, and depth; source-model unit ambiguity must not change persisted
  dimensions.
- Catalog dimensions must be positive. Import QA validates practical bounds,
  texture count/resolution, triangle count, and file size. Reviewer QA must also
  check axis orientation, footprint, pivot, floor contact, normals, UVs,
  material response, and variant mapping.
- Axis swaps, vertical-scale locks, and product-specific calibration are
  compatibility metadata for known assets. They must not become a substitute
  for normalizing new source content.

## Caching, CDN, and versioning

Model, texture, and thumbnail content is immutable once published at a URL.
Changing bytes requires a new content hash or versioned path and an atomic
catalog-reference update. Never replace bytes at a stable long-cache URL.

The current `next.config.ts` does not declare a model/texture CDN or an explicit
immutable public-asset cache policy. Therefore CDN delivery and immutable cache
headers are a documented deployment gap, not a current guarantee. Before
enabling long-lived edge caching:

1. publish content-addressed/versioned paths;
2. return the correct content type and `public, max-age=31536000, immutable` for
   versioned bytes;
3. keep catalog/API documents short-lived enough to adopt new asset versions;
4. configure CORS for WebGL texture/model use and verify range/complete-object
   behavior with the chosen CDN;
5. retain the previous version through the catalog rollback window; and
6. measure cold and warm asset delivery on the supported device/network matrix.

Import sources are untrusted public HTTPS URLs and are never runtime cache keys.
The optimizer response remains `no-store`; only approved output enters the
versioned asset store.

## Licensing and attribution

Every publishable asset requires provenance: source URL, supplier/creator,
license or contractual-use status, permitted product surfaces, attribution text
when required, acquisition/review date, and the reviewer or source record that
confirmed the rights. Derived previews, compressed models, and texture variants
inherit the source license and must remain traceable to it.

Surface-material generated records already carry `source_url` and
`license_status`. The general furniture `AssetReferences` contract does not yet
carry equivalent licensing and attribution fields. Until that schema is added,
licensing evidence must remain in the authoritative import/catalog review
record, and missing evidence is a publication blocker. A checked-in file name
or retailer URL is not proof of redistribution rights.

## Resource ownership and disposal

- `GLBScaledModel` owns the loader instance, source-scene textures/geometries,
  and its normalized cloned geometries/materials. It disposes late cancelled
  loads, Draco state, and owned clones on URL/dependency change or unmount.
- Upholstery textures created by `TextureLoader` belong to the component that
  requested them and are disposed after cancellation or unmount. Shared source
  data must be cloned before product-specific mutation.
- `CabinetSceneItem` allocates generated cabinet groups and edges, while
  `useCabinetSceneResourceOwnership` pairs their geometry/material disposal and
  finish-texture cancellation cleanup with the mounted item lifecycle.
  `LocalCabinetAssetStorage` owns generated blob URLs and revokes them on
  replacement and `dispose()`.
- React Three Fiber owns the canvas render loop, WebGL renderer, and context.
  Child components dispose only resources they allocate; they must not dispose
  another instance's cached/shared texture or the canonical document.
- Download/export blob URLs are revoked after use. Async effects must treat a
  late result as owned cleanup work even when the requesting component has
  already unmounted.

The Phase 8 production browser check forces garbage collection, navigates the
project page to `about:blank`, and ratchets retained heap to at most 2 MB above
the pre-open value. The measured retained values were 673,384 bytes (small),
676,848 bytes (medium), and 675,812 bytes (large).

Auto quality samples continuous requested-frame runs through
`ScenePerformanceBridge` and `SceneActiveFpsSampler`. R3F's per-root pending
frame count, observed after rendering, ends the sampling window when demand
work stops; other canvases cannot extend that window. Visibility, enabled-mode,
renderer/scene replacement, active-room, and loading-generation changes reset
incomplete history. No timer requests measurement frames. The existing one-second
sample window, 28 FPS boundary, and four-second sustained-low policy remain;
fewer than two positive active intervals produce no FPS value. Explicit Quality
and Lite keep their existing behavior. Revert the bridge, sampler and generation
key together to roll back this sampling correction.
