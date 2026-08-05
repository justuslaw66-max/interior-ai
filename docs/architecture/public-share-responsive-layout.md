# Responsive public-share presentation

## Scope and owners

This contract applies only to anonymous/client-facing
`/share/[shareToken]` presentation. `app/share/[shareToken]/page.tsx` remains the
server owner for exact enabled-token lookup and creates one canonical public
snapshot through `projectSharedDesignSnapshot`. The responsive implementation
does not fetch, copy, or reconstruct another share document.

`components/public-share/PublicShareShell.tsx` owns the client presentation
state for that snapshot: responsive mode, selected room, selected saved view,
layout generation, finite surface measurement, and semantic readiness.
`components/ShareViewer.tsx`, `ShareScene.tsx`, and
`PublicShareRoomSchedule.tsx` consume that owner. The schedule receives a pure
server-derived room summary from the same snapshot; it is not a second
document or selection store.

The public field boundary remains `lib/shared-design-snapshot.ts` plus the
closed schema in `lib/shared-design-projection-schema.ts`. Responsive mode is
presentation state, not authorization, publication, or projection state.

## Verified former defect

At starting SHA `29a4c46070404a2426da123bc5b42c0592d95e34`, the server route correctly
projected public data once, but the client viewer copied the complete snapshot
into local state and rewrote that copy to switch rooms. Its `data-ready` marker
became true as soon as the wrapper ref attached. It did not prove a resolved
room, responsive mode, current layout generation, mounted Canvas, or finite
surface size. A missing active room visually fell back through `getActiveRoom`
while selection styling still compared the invalid snapshot ID.

The page rendered one horizontally scrolling room table at every width. Room
and saved-view buttons had accessible names but no canonical test identity;
the shell exposed neither the selected public room nor active layout mode.
Next-routing a hash-only shopping action also caused a WebKit RSC navigation
attempt, which could reload the shell instead of preserving same-document
history. WebKit did not classify Arrow-moved programmatic focus as
`:focus-visible`, so a focus-visible-only outline was insufficient for that
keyboard path.

Archival RC53 `b0eab4cbbadf0203667fb750c42fb0e25eb43f62` and RC55
`4883ffb9fc87248b6aa8624cdef39c5f97a173d1` supplied intent evidence for mobile
room cards and settled-layout selectors. Neither commit was cherry-picked;
their cloud-revision and unrelated test changes are outside this contract.

## Current public-share flow

| Step | Owner and symbol | Public data consumed | Desktop | Tablet / intermediate | Mobile | Focus, overflow, and readiness |
| --- | --- | --- | --- | --- | --- | --- |
| Token route | `SharePage` | Exact enabled token selects the stored row; the canonical projector emits the public snapshot | Server response | Same | Same | Invalid/revoked routes render `public-share-invalid`; route loading and error boundaries are distinct and never ready |
| Projection and initial room | `PublicShareShell`; `resolvePublicShareSelectedRoomId` | Canonical room IDs and declared `activeRoomId` | Declared room or first projected room | Same | Same | A missing room falls back to the first canonical public room; empty rooms remain a distinct non-ready state |
| Header actions | `SharePageActions` | Public title and route token already present in the URL | Wrapped action row | Wrapped action row | Wrapped action row | Native buttons/links, logical DOM order, 44px minimum targets; hash-only shopping navigation is a native anchor |
| Room schedule | `PublicShareRoomSchedule` | Derived name/type/geometry/item/health/commerce summaries for every public room | One table | One table | One card list | Exactly one schedule projection is mounted for the active mode; table overflow stays local and the page is clipped against accidental horizontal spill |
| Room navigation | `ShareViewer` | Canonical public room IDs/names | Wrapping nav | Wrapping nav | Horizontally scrollable nav | Native buttons plus Left/Right/Home/End focus movement; stable ID includes canonical room ID; selection state does not depend on mode |
| Scene surface | `ShareViewer`; `ShareScene` | Selected room geometry/items and canonical lighting | Finite responsive surface up to 44rem | Same | Finite `svh` surface up to 36rem | Canvas creation and nonzero `ResizeObserver` measurement are readiness inputs; room content is read-only |
| Saved views | `ShareViewer`; `resolvePublicShareSavedViews` | Declared saved-view ID/name/camera position/target/FOV for the selected room | Three-column grid where space permits | Same | One/two-column grid | Stable declared view ID, pressed state, 44px target, visible focus; breakpoint changes do not reset the selected view |
| Back/forward and reload | Browser plus server route | Same public projection identity | Hash history preserves in-memory selection; route reload resolves the projection's declared initial room | Same | Same | No forced reload on breakpoint changes; invalid/revoked reload remains invalid |

The presentation and shopping sections below the viewer remain server-rendered
from the same public snapshot and retain their established order. There are no
fixed responsive controls, so controls cannot overlap one another. The root
applies top, right, bottom, and left safe-area insets; scene height uses the small
viewport unit on mobile.

## State and responsive architecture

One component tree is active. Breakpoints change CSS and choose the one
non-actionable room schedule representation that is mounted; there are not two
hidden actionable viewers or room navigators.

| Mode | Width | Room schedule | Room navigation | Preview surface |
| --- | ---: | --- | --- | --- |
| `mobile` | `< 768px` | Cards | Horizontal scroll | `min(68svh, 36rem)`, minimum 18rem |
| `tablet` | `768-1023px` | Table with local overflow | Wrapping | `min(72vh, 44rem)`, minimum 20rem |
| `desktop` | `>= 1024px` | Table with local overflow | Wrapping | `min(72vh, 44rem)`, minimum 20rem |

Mode derives from `window.innerWidth` through media-query change events. No
user-agent detection, pixel width in an ID, alternate API, page reload, or
separate mobile snapshot exists. `requestedRoomId` is the only mutable room
selection. The rendered room ID is a pure resolution against the current
projected rooms, so a still-present room survives mode changes and a removed
room falls back deterministically. Saved-view selection is room-scoped and is
cleared by an explicit room change; it is not cleared by a layout change.

## Semantic readiness and generation

`public-share-root[data-layout-status="ready"]` is the only ready boundary.
Ready requires all of the following real state:

1. The server has completed exact-token lookup and public projection.
2. A canonical selected public room exists.
3. `mobile`, `tablet`, or `desktop` mode has resolved.
4. The deterministic generation for projection identity, mode, and selected
   room is current.
5. The read-only Canvas has been created.
6. The active preview surface has a finite positive width and height measured
   after that component commit.

The authoritative internal identity is the complete
`projectionIdentity:mode:selectedRoomId` layout key. Canvas creation and surface
measurement must both report that exact current key; a stale key cannot ready a
new layout even if a diagnostic hash collides. The exposed nonzero numeric
generation is a deterministic hash of that key for test diagnostics only, and
the surface report must also carry the current generation. The shell rejects an
old `ResizeObserver` report, and a prior measurement cannot satisfy the new
layout key. No timer can make the page ready.

Server loading uses `data-layout-status="loading"`; invalid/revoked uses
`invalid`; the route error boundary uses `error`; an empty projected room set
uses `empty`; and an incomplete active layout uses `resolving`. None advertises
ready. Readiness is evidence only and never enables data access or an action.

## Stable identities

Stable identities supplement roles and accessible names:

| Identity | Meaning |
| --- | --- |
| `public-share-root` | Loaded responsive public-share shell; exposes status, mode, generation, selected room, public fingerprint, and finite surface size |
| `public-share-loading`, `public-share-error`, `public-share-invalid`, `public-share-empty` | Mutually distinct non-ready states |
| `share-room-list` | Room-schedule region derived from every projected room |
| `share-room-list-mobile` / `share-room-list-table` | The single mounted schedule presentation for the active mode |
| `share-room-navigation` | Accessible public room-selection navigation |
| `share-room-action-{canonicalRoomId}` | One native action for a canonical public room |
| `share-preview-surface` | Finite selected-room Canvas owner; `data-room-id` identifies the room |
| `share-saved-view-navigation` | Saved views for the selected room |
| `share-saved-view-action-{declaredSavedViewId}` | One native saved-view action |

No identity uses an array index, translated display text, random/time value, or
viewport width. Missing saved-view IDs do not gain an index-derived public
identity; malformed views remain unavailable. The active tree contains no
duplicate responsive identity or duplicate DOM `id`.

## Route and capability boundaries

- Anonymous `/share/[shareToken]` and its export routes consume only the public
  projection and never render editor mutation, autosave, purchase-management,
  admin, revision, or owner-only controls.
- Consumer and Pro owner modes share the owner document and capabilities; they
  are not public-share modes.
- Client preview is the owner `/design` document with editing chrome/actions
  suppressed. It remains distinct from the public projection.
- Legacy `/d/[token]` is a separate read-only route and was not changed by this
  remediation.
- Responsive presentation is not an authorization boundary. Token lifecycle,
  revocation, authorization, cloud revision/baseline, persistence, duplication,
  and ARCH-RC54 field policy remain owned by their existing modules.

## Verification and rollback

`scripts/test-public-share-responsive.ts` protects mode thresholds, room
fallback, generation inputs, stale-generation rejection, finite measurement,
no timer/user-agent path, selectors, and rendered loading/error states.
`tests/e2e/share-responsive.spec.ts` uses deterministic public fixtures for
single/multi-room desktop, tablet, mobile portrait/landscape, both resize
directions, room/view continuity, projection fingerprint, finite surface,
touch size, overflow, selector uniqueness, keyboard focus, history/reload, and
invalid/revoked states. `04-share.spec.ts` retains read-only/privacy and every
saved-view behavior. `playwright.share-responsive.config.ts` runs both in
Chromium and WebKit with zero retries.

Rollback is one local revert of the focused implementation commit, followed by
the responsive unit/render test, Chromium/WebKit share matrix, public
projection security, duplication, client-preview, persistence, build, and
Phase 8 checks. No data, token, authorization, migration, deployment, or
external rollback is required.
