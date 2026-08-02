# Scene domain and renderer boundaries

## Canonical ownership

The design document is the source of truth for rooms, items, transforms,
materials, hierarchy, and exact floor elevations. `design-page-scene-domain.ts`
builds one renderer-neutral `SceneRoomItemEntry` collection from that document.
The collection is independent of the current 2D/3D view and retains room-local
item coordinates, room offsets, canonical finished-floor elevation, canonical
wall thickness, and the wall relationship model.

`floor-plan-render-model.ts` remains the canonical structural model. Its same
floors, walls, openings, and elevation data are consumed by
`CanonicalFloorPlanWalls2D` and `CanonicalFloorPlanWalls3D`.

The editor-domain logic used by those models and adapters is kept in pure
modules:

| Domain concern | Pure owner |
| --- | --- |
| Scene hierarchy and room/world transforms | `design-page-scene-domain.ts` |
| Projection and wall relationships | `design-page-scene-projection.ts` |
| Room polygons, bounds, clamping, pointer rotation | `design-page-geometry.ts` |
| AABBs and snapping candidates | `snapGuides.ts` and `wallSnap.ts` |
| Gap and clearance measurements | `measurements.ts` |
| Millimetre/metre scene units | `editorScene.ts` and `floor-plan-scene-elevation.ts` |
| Placement containment and collisions | `catalog-placement.ts` |
| Visual material parameters | `design-page-material-props.ts` |
| Cabinet part hierarchy and geometry | `generateCabinetParts.ts` and `layout.ts` |

These modules do not import React, DOM APIs, routes, storage, HTTP, or commerce
workflows. Renderer components may orchestrate pointer state and call them, but
must not duplicate their calculations.

## Projection adapters

`design-page-scene-projection.ts` is the item renderer adapter. A `plan`
projection suppresses finished-floor elevation and uses the authored wall
thickness; a `spatial` projection adds the exact canonical elevation and maps a
house-plan shell to its established rendered wall thickness. Both furniture and
parametric cabinetry go through this adapter before reaching their renderer.

Placed cabinetry keeps the renderer-specific mapping explicit:
`CabinetDesignItemPlan2D` consumes the plan projection and renders the cabinet
footprint, while `CabinetDesignItemSpatial3D` consumes the spatial projection
and renders full generated geometry. `SceneItemsLayer` dispatches between them;
it does not combine their implementation details. Cabinet Preview likewise
separates domain-to-scene synchronization (`CabinetPreview3D`), Canvas/runtime
policy (`CabinetPreviewRenderer3D`), and camera/light/scene composition
(`CabinetPreviewScene3D`).

Projection adapters may translate canonical values into draw coordinates,
meshes, lines, labels, and materials. They must not own authentication,
permissions, subscriptions, pricing, checkout, persistence, or canonical
geometry. Renderer callbacks return projected coordinates to the domain
boundary before document mutation.

## Numeric policy

Editor geometry tolerances live in `editor-geometry-tolerances.ts`. The named
values preserve the pre-Phase 5 thresholds:

| Use | Metres |
| --- | ---: |
| General boundary/loop comparison | `0.000001` |
| Rotation-handle zero vector | `0.0001` |
| Polygon/segment comparison | `0.0001` |
| Wall segment slicing/overlap | `0.001` |
| Polygon-hole clearance | `0.001` |
| Meaningful dimension difference | `0.001` |
| Room/wall drawing visual snap | `0.01` |

Canonical persisted elevation remains integer millimetres and converts to
metres only at the scene-domain boundary. Tests cover projection parity,
rotation preservation, tolerance boundaries, unit conversion, and 10,000
room/world round trips.

## Resource lifecycle ownership

| Resource | Owner | Required cleanup |
| --- | --- | --- |
| Window pointer gestures | `RoomRenderer2D` | Registered in the active gesture scope; removed on completion, replacement, or unmount |
| Keyboard listeners and animation frames | `FurnitureItem` | Removed/cancelled by the creating effect |
| Confidence/toast timers | `useDesignPageTransientFeedback` | Every timer has a ref and is cleared on replacement and unmount |
| Floor-plan underlay object URL | `useDesignPageFloorPlanAssets` | Revoked on replacement/unmount |
| Cabinet preview groups and textures | `useCabinetSceneResourceOwnership` | Unique geometries, materials, and loaded textures disposed on dependency change/unmount; late texture results disposed after cancellation |
| GLB source and normalized model resources | `GLBScaledModel` | Loader disposed; owned textures, cloned geometries, and cloned materials disposed on change/unmount |
| React Three Fiber render loop/canvas/context | Scene canvas owner | Fiber owns loop and WebGL context teardown; child renderers dispose only resources they allocate |

Resource creation and cleanup must remain paired in the same component or hook.
Async loaders must dispose late results after cancellation. A renderer must not
dispose document data or resources owned by another renderer instance.

## Verification contract

Run `npm run test:scene-domain-boundaries` and
`npm run test:cabinetry-preview-renderer`. These guards verify the pure-module
import boundary, distinct cabinet plan/spatial adapters, preview Canvas/scene
ownership, unchanged tolerance values, projection and transform correctness,
absence of business policy in render loops, and executable plus static cleanup
checks for the cleanup-sensitive systems above. Visual equivalence is claimed
only for the transform/wall parameters and renderer constants protected by
these tests; no untested pixel-equivalence claim is made.
