# Code health audit

## CH-0015I Floor Plan NFT overtrace correction — 2026-08-13

Classification is **B — NFT_OVERTRACE_PACKAGING_DEFECT**. Preserved evidence
proved that the construction-sources, supplementary-sources, and process route
NFTs each held 3,307 references, including 260 `scripts/test-*` and 140
`tests/**` sources. `scripts/test-required-test-truthfulness.mjs` and
`scripts/test-production-artifact-evidence.mjs` entered executable staging only
through `R5_NFT_NON_ARTIFACT_REFERENCE`; neither was required-server output,
canonical `.next`/`public`, or a production import.

The source owner resolved a dynamic suffix from the broad
`process.cwd()/public` boundary, and the later filesystem read consumed a
resolver result whose `/assets/` guarantee was no longer visible to Turbopack.
The bounded helper now validates the relative asset portion once and constructs
the read directly from the static `process.cwd()/public/assets` prefix. Lexical
and realpath containment plus traversal, absolute-path, encoding, separator,
NUL, and malformed-input rejection fail closed. Missing-file skip, existing
read-error propagation, external URL behavior, and Floor Plan domain behavior
are preserved. The file is opened with `O_NOFOLLOW`, the descriptor is bound to
the post-open contained realpath by device/inode, and only the descriptor is
read; final-component symlinks are intentionally rejected.

The preliminary clean tracer snapshot built 57/57 pages with 112 NFTs and no whole-project
trace warning. Each target now has 374 references, zero script/test edges, and
seven canonical Floor Plan assets. The full trace has 34,669 edges / 2,878
unique paths, zero missing/prohibited paths, and no new test-source manifest.
Plan-only staging retained 69,874 files and provenance rows with zero duplicate,
reason, artifact, required-server, NFT-runtime, scanner, or scanner-exception
failure. No archive, compression, broad output exclusion, archive allowlist,
scanner exception, UI/telemetry/design-load/Phase 8, threshold, dependency, or
workflow change was made.
That snapshot predates descriptor identity hardening and is not exact-head
candidate evidence; committed-head validation supersedes it.

`ci.floor-plan-required` now closes over 56 scripts at SHA-256
`94276929fd43e144b2f23b037b63e28e15e1d2b385632a40e03b3347f12c465d`;
inventory remains 27 gates / 379 sources. The only code-quality ratchet lowers
`catalog-draft-match.ts` from 453 to 445 lines. Exact-head integration,
release certification, Phase 8, runtime smoke, browser owners, executable
archive creation, and the CH-0015 final exact-source closure audit remain
separate integrator work.

## CH-0015I inherited runtime-smoke assertion defect — 2026-08-12

The preserved CH-0015I furnished-template runtime failure is classified **B —
TEST_ASSERTION_DEFECT**. `bootstrapEventsFlushed = 0` is coherent when the lazy
collector activates before any event or counter enters its bounded bootstrap
buffer and later production telemetry is recorded directly. The failure also
showed nonzero timing, lifecycle, and renderer activity, a live snapshot hook,
semantic readiness, and a successful import, so it did not establish loss.

The bounded correction makes activation provenance explicit and fail closed.
Snapshot v2 distinguishes not-requested/pending/active/failed import state,
positive hydrated bootstrap from direct empty bootstrap, exact queued/flushed
totals, completed hydration, direct mode/activity, and the realm generation.
Runtime smoke requires current-realm collector liveness, eight ready models,
substantive timing/lifecycle/renderer coherence, and exactly one valid
activation path. It rejects lost/mismatched records, inactive empty activation,
failed/pending import, stale generation, missing mode, and malformed or
contradictory schema rather than weakening the old assertion to a nonnegative
check.

The lazy chunk, one-request/no-retry behavior, 96-entry/counter caps, renderer
WeakSet, frameloop, GLB lifecycle/cache/refcounts, production-disabled zero
request/no-hook behavior, Floor Plan Upload implementation, thresholds, and
timeouts are unchanged. No required CH-0015 implementation surface remains;
CH-0015I awaits separate integrator review and CH-0015 still awaits the final
exact-source closure audit.

## CH-0015I accessible Floor Plan Upload lifecycle — 2026-08-12

Starting from exact integration source
`2c567fd483877c7dcbd8fd23e3cd8cb316732c8c` / tree
`50f9c5d6a6610990606fd9db9a27ba40200fca90`, this bounded batch classifies
the parent as a **FULL_SCREEN_MODAL_WORKSPACE**. The prior portal exposed
partial ARIA semantics but was an external, unregistered modal with container
focus, escaping Tab order, live background, unconditional window Escape, raw
node return, and an independent non-stack-safe body overflow snapshot.

The existing full-screen/mobile shell now consumes the shared lifecycle. One
registry token owns background isolation, deterministic state focus, Tab and
Shift+Tab, topmost Escape/backdrop, semantic current-DOM return, registered
child supersession, and reference-counted scroll locking. Explicit opener IDs
cover Consumer, Pro, Surfaces, address, Import, launcher, and Plan fallback;
scope replacement and unmount cancel stale work. No second Floor Plan state
owner, compact-dialog redesign, dependency, database/API/schema, geometry,
vision, persistence, pricing, or analytics change was introduced.

Focused results are Chromium **10/10** and WebKit **10/10**, zero retries,
skips, filters, shards, or timeout increase. Static lifecycle and existing
consumer-flow guardrails pass. The new sole browser owner is
`ci.floor-plan-upload-accessibility`; derived inventory is **27 gates / 377
classified sources**. Inline history confirmations are deliberately unchanged
and still await a separate semantic product decision; only parent dismissal
is guarded. The production Empty Surfaces action is covered through its exact
component because its current integrated call sites are structurally
unreachable (`hasRooms` outside, `!hasRooms` inside); CH-0015I does not alter
that unrelated product reachability. No required CH-0015 implementation
surface remains, subject to the
exact-source closure audit. Phase 8 is recorded only after the clean candidate
commit under its single-run source-bound contract.

## CH-0015H test-contract hardening — 2026-08-12

Starting from `ee55098be7c750e8fa2a631978f3d4ebd956708c` / tree
`e6162ead7031eb41cbba23b3ac56f5873cfe0f92`, this child changes no production
module. Palette exact-once evidence now uses the production-rendered snapshot
fingerprint, one existing command, and one Undo to prove `F0 -> F1 -> F0` with
no extra transaction. Client Preview scope cancellation now uses a bounded
test-only semantic A–E recorder and fails on invalid More focus based on
generation, scope, dialog ownership, fallback eligibility, concealment,
geometry, visual state, and animation settlement.

The original WebKit classification remains **D —
NOT_REPRODUCED_WITH_PROVENANCE**, with original evidence/report SHA-256
`018afa76c7bc69104c879440f6d69801ddef9b238c713509f551f9f1a5095223` /
`fd35b65201f0583a1b8e86de8df08d3520cf9ab8f833273af4829d61d00b339c`
and diagnostic focus/report SHA-256
`e997098141ddf0828d69d67a09252cb0b79304a5751231d86e7a3c28ade0d2c5` /
`e524a7e6cb7601f1858d06ac4dbceab1603689d15e02044f4351735465e5c9d2`.
The complete instrumented WebKit project reproduced no in-window More focus
event, while the unavailable original trace/report prevents semantic
classification of the historical event. Future invalid events retain enough
phase and semantic state to classify directly. No product root cause or fix is
claimed. Production focus and Palette behavior, command policy, Floor Plan
Upload, dependencies, performance thresholds, and workflows are unchanged.

## CH-0015H accessible Command Palette lifecycle — 2026-08-11

Starting from exact integration source
`5ab9db530d4e4fcc8d1f8f678994e09ab7bb3e67` / tree
`f646076854c0c76b69c80c9cada996e58d01b1b0`, this bounded batch classifies the
Cmd/Ctrl+K Palette as a **MODAL_DIALOG**. The old custom overlay omitted modal
state and registration, let Tab and action-focused Escape escape, exposed the
editor background, had no semantic return or stale-scope cancellation, opened
behind/above competing owners, and invoked domain behavior before closure.

The Palette now delegates semantics, focus, dismissal, background isolation,
and supersession to `EditorDialog`. The global shortcut is blocked by any
active registered/external modal and retains editable/Preview suppression. A
typed in-memory generation owns query, semantic opener, action consumption,
cancellation, and route/requested+loaded design/project/Consumer-Pro/editor
mode/Preview/unmount scope. Return resolves one current recognized editor
action, then More, then Workspace, rejecting invalid or superseded targets.

The action executor consumes once, clears query, and commits close before the
unchanged callback. The registry now also owns direct-root visual stack order:
it preserves the greatest participating base layer, assigns each newer token
the next layer, and restores prior inline style at unregister. The Palette
withdraws visually while superseded and restores on reclaim, covering newer
Cart/Retailer owners trapped inside a lower ancestor stacking context. Static execution proves exact-once
and close-before-action-created-dialog order; browser evidence proves ordinary
Palette-over-editor and nested newer-dialog-over-Palette rendering and focus.

Existing `ci.pro-visual-policy` adds five stable identities without a new gate
or package-closure change. The focused Palette matrix passes 10/10 across
Chromium/WebKit with zero retries/skips/filters/shards/timeout increase; the
final canonical owner and the exactly-once Phase 8 clean-HEAD precondition
failure are recorded in the handoff. No final performance measurement was
produced or promoted. Derived inventory remains 26 gates / 376 sources and
design cleanup remains 81 guards.
All 14 command IDs and domain behavior, history, analytics, capability policy,
Floor Plan Upload, schema, dependencies, and workflows remain unchanged.

CH-0015 remains open only for Floor Plan Upload. Rollback is one focused revert
plus Palette/Pro and affected shared-dialog owners, truthfulness, Phase 8, and
strict build, with no database or external rollback.

## CH-0015G accessible Retailer Confirmation lifecycle — 2026-08-11

Starting from exact integration source
`d76994a778db99cb57834ef6bb62db5e8705a478` / tree
`ba00cb930778c84a4879d70274182868eb9c428f`, this bounded batch classifies the
global and retailer-group four-plus-tab prompt as a **MODAL_DIALOG**. The prior
custom overlay left focus on an obscured opener, exposed background actions,
had no role/name/modal or dismissal/return lifecycle, and was visually clipped
by CartSidebar's overflow container.

The prompt now directly composes `EditorDialog` outside the scrolling aside.
It is absent while closed and owns one named modal, visible cross-engine focus
ring, Tab/Shift+Tab, topmost Escape/backdrop, full-viewport inert/hidden
background, and current semantic global/group return with Cart fallback. A
typed generation captures cloned lines, count, preference, opener, and
design/cart scope. Continue consumes exactly once before opening; cancellation,
scope, route/unmount, supersession, and newer-modal ownership execute nothing
and cannot restore stale focus.

The exact count/open/track contract is preserved: bundle one-link treatment,
zero/one/three/four boundary, no URL dedupe, missing URL exclusion, existing
unavailable handling, row bypass, click payload and fail-open behavior,
clickKey/UTM decoration, 350ms pacing, and same-tab first-link navigation.
Guest/Consumer/Pro, Shopify, catalog, auth, persistence, API/schema, shared
dialog primitives, and unrelated overlays are unchanged.

New merge-required `ci.retailer-confirmation-accessibility` owns 12 stable
cases and passes **24/24** across Chromium/WebKit with zero retries/skips/
filters/shards/timeout increase. Its static prerequisite is guard 81 in design
cleanup. Derived inventory is 26 gates / 376 sources. Focused desktop/mobile
visual inspection passes. Strict build remains 57/57; `/design` remains 25
initial JS plus one CSS chunk, with JS `+3,881 / +729` raw/Brotli, unchanged
CSS/Cabinetry/GLTF sizes, and all Phase 8 byte budgets green.

This is a partial CH-0015 remediation: Command Palette and Floor Plan Upload
remain required; public legacy Upgrade and selected-item preview remain P2.
Rollback is one focused revert plus Retailer/Cart/Guest, commerce,
truthfulness, design cleanup, Phase 8, and strict build, with no data, schema,
dependency, policy, deployment, or external rollback.

## CH-0015F accessible Guest Save Prompt lifecycle — 2026-08-10

Starting from exact integration source
`d649708ba31eb9d8ede183dea6d6268c9dd1aca3` / tree
`a34e6a5831c0e7b40649895a7cc3e3f18b07fec4`, this bounded batch classifies the
Guest Save Prompt as a **MODAL_DIALOG** across exactly Save, AI layout, and
Shopify checkout. The defect combined missing modal semantics and topmost
ownership with a string/raw-callback state model whose reason was reduced to a
Boolean before rendering. Focus remained on an obscured opener and stale or
duplicate continuation ownership was not generation- or scope-bound.

The prompt now uses `EditorDialog` with one named modal, visible initial close
focus, deterministic containment, topmost Escape/backdrop, background
inertness/accessibility concealment, and current semantic return. Typed reason
`save | ai-layout | checkout` binds one in-memory continuation to one
generation and route/design/workspace/mode/auth scope. Only explicit Not now
runs it, exactly once; Escape, backdrop, and close cancel it. Primary action
retains guest claim then sign-in, while AI's no-op guest continuation and the
checkout closure retain existing domain behavior. Save returns to Save then
More; AI and checkout return to their current action then Workspace. Invalid,
removed, hidden, inert, disabled, obscured, or superseded targets are skipped.

New merge-required `ci.guest-save-overlay-accessibility` passes **16/16**
across Chromium/WebKit with zero retries/skips/flakes/filters/shards and owns
all three reasons, desktop/390x844, continuation/cancellation, semantic return,
scope/auth/unmount, duplicate guards, and newer-dialog isolation. Static
ownership raises design cleanup to 80/80. Derived inventory is 25 gates / 376
sources. Strict build remains 57/57 and the measured Phase 8 bundle remains 25
initial JS chunks plus one CSS chunk: JS `+3,891 / +1,059` raw/Brotli, CSS
`+303 / +13`, unchanged Cabinetry/GLTF lazy chunks, and all budgets green.

Save/local/cloud/autosave/revision ownership, AI request/planner/quota/result,
cart/variant/quantity/price/purchase-mode/Shopify/affiliate behavior,
authentication and guest-quota policy, API/schema, and unrelated overlays are
unchanged. This is a partial CH-0015 remediation: Command Palette, Floor Plan
Upload, and retailer confirmation remain required; public legacy Upgrade and
selected-item preview remain P2. Rollback is one focused revert followed by
the Guest Save owners, domain guards, Phase 8, and strict build, with no data,
schema, dependency, policy, deployment, or external rollback.

## CH-0015E accessible Share Link Fallback lifecycle — 2026-08-10

Starting from exact integration source
`d16109b95cc57774bf384b580f4bf669026bdf59` / tree
`4dd30065236e651f552944c5077cef1be62c1a1f`, this bounded batch classifies
Share Link Fallback as a **MODAL_DIALOG nested child of Present/Export**. A
successful share followed by missing/denied/rejected clipboard access formerly
placed an unregistered overlay above the still-registered parent. The fallback
had no role, name, modal state, focus entry/containment, Escape/backdrop owner,
or return; the parent remained accessibility-active, trapped Tab, consumed
Escape, and could restore into the editor while the fallback stayed visible.

The fallback now uses the shared `EditorDialog` registry. It is absent while
closed and becomes the only topmost keyboard/accessibility owner while open;
Present/Export remains mounted but inert and `aria-hidden`, with close/Back
guarded. Child close, Escape, or backdrop closes only the child, returns to the
current semantic Create Share action (then parent close fallback), and resumes
the same parent instance. Design-bound state plus keyed lifecycle scope cancels
project, mode, parent, route, unmount, and newer-modal stale restoration.
Copy/Open, share request/token/URL, authorization, public projection,
analytics meaning, busy guard, and Consumer/Pro policy are preserved.

Existing `ci.pro-visual-policy` is still the one canonical browser owner. Its
three added identities pass **26/26** across Chromium/WebKit with no retry,
skip, filter, shard, or timeout increase. Focused desktop and 390×844 visual
inspection passes; static/editor guards, 79/79 design cleanup, critical
contracts, production-evidence contract, truthfulness, lint, typecheck,
code-quality, strict 57/57 build, and Phase 8 pass. Manifest inventory remains
24 gates / 376 sources. The initial bundle stays at 25 JS chunks; JS changes by
+1,442 raw / +205 Brotli and CSS by -4 / -2, with no fallback-only lazy chunk
and all budgets green. `ShareLinkFallbackDialog` removes its previous
overlong-function debt; Present/Export maximum function length and complexity
also decrease by one, with no allowance raised.

This remains a **partial CH-0015 remediation**. Four required batches remain:
Guest Save, Command Palette, Floor Plan Upload, and retailer confirmation.
Public legacy Upgrade is P2 post-candidate, as is the separate selected-item
preview transition. Rollback is the one focused implementation commit; no
data, schema, dependency, share-token, authorization, deployment, or external
rollback is needed.

## CH-0015D accessible My Designs lifecycle — 2026-08-09

Starting from exact integration source
`00628978e1eeb38d89370f84e537fc971de538e4` / tree
`ef0c3bc8ac72276eaade6d3ea19f6710c8ffca7a`, this bounded batch classifies My
Designs as a **MODAL_DIALOG** and includes its existing shared single/bulk
delete Confirm as one nested lifecycle. The old parent lacked modal semantics,
focus entry/containment/Escape/return and stayed accessibility-active behind
the registered child.

The parent now uses `EditorDialog`, retains first-use lazy loading, restores to
the current command action or persistent More fallback, and becomes
inert/hidden while Confirm is topmost. Canonical design-ID action identities
give cancel/failure the surviving delete action and give successful deletion a
current surviving row or close fallback without retaining a stale row node.
The only Confirm extension is an optional ordered semantic return list; its
general lifecycle and every other caller remain unchanged. Persistence,
routing, current-design detach, deletion/API, selection/order, authorization,
and Consumer/Pro behavior are preserved.

New `ci.my-designs-overlay-accessibility` passes 16/16 production-artifact
records across Chromium/WebKit against an isolated 43-migration database with
zero retries/skips/flakes. Static ownership remains in `ci.design-cleanup`
(79/79); persistence, requested-design, strict build,
code-quality, and complete Phase 8 contracts pass; the manifest is 24 gates /
376 classified sources. Focused visual inspection passes loading, empty,
populated, single, bulk, failure, busy, Consumer desktop, and Pro 390×844
states without overflow or clipped focus. This is still a partial CH-0015
remediation: six required overlay batches and the separate selected-item P2
remain.

## CH-0015C accessible Plans dialog — 2026-08-09

Starting from exact integration source
`683a91c12e3ac5b690375925ad93f84bec2c443f` / tree
`9a06040b0a803156ae5402e1bc3da79ca70ab82f`, this bounded batch classifies
Plans as a **MODAL_DIALOG** and remediates both Account → Plans and shared
Upgrade → Plans. The old custom overlay exposed no role/name/modal state,
initial focus, containment, Escape ownership, or semantic return. In the
nested path it appeared above Upgrade while Upgrade remained the only registry
owner and could trap Tab or consume Escape beneath Plans.

Plans now uses `EditorDialog`, is absent while closed, and becomes the single
topmost focus/Escape/backdrop owner while open. Direct entry returns to the
current Account command or the one visible More fallback instead of the
unmounted menu item. Nested entry retains Upgrade, makes it inert and
accessibility-hidden, returns to the current `See plans` action, and restores
Upgrade ownership without recreating or closing it. Deterministic Tab movement
does not depend on Safari full-keyboard-access preferences; newer-modal and
route/unmount supersession cancel stale return work. The 390×844 panel retains
a 16px gutter, complete actions, an unclipped focus ring, and no horizontal
overflow. When a newer registered modal closes first, Plans deterministically
reclaims focus as the restored topmost owner.

Prices, intervals, annual/default presentation, current-plan state, checkout
payloads/URLs, portal routing, Stripe configuration, plan refresh, Consumer
denial, server entitlements, and subscription state are unchanged. Existing
`ci.pro-visual-policy` owns five new identities; its canonical result is 20/20
across Chromium/WebKit with zero retry/skip/flake. The manifest remains 23
gates / 376 classified sources, Stripe/Pro static coverage passes, and no new
gate or runnable source exists. Phase 8 remains green at 25 initial JS chunks,
5,828,568 raw / 1,112,834 Brotli bytes and 131,484 / 17,470 CSS bytes.

This remains a **partial CH-0015 remediation**. The authoritative seven
required batches after Plans are My Designs, Guest Save, Command Palette,
Floor Plan Upload, retailer confirmation, Share Link Fallback, and public
legacy Upgrade. Share Link Fallback and public legacy Upgrade are required,
not P2-deferred; the separate selected-item preview transition remains P2.
Rollback is the one focused implementation commit with no billing, data,
schema, dependency, deployment, or external-setting rollback.

## CH-0015B Client Preview command-bar accessibility — 2026-08-08

Starting from exact integration source
`f8c44bcd632820754edc4f862eef24c66e433510` / tree
`ae067068656c46ac9aecb174b02a01ea21b6bdf4`, this second bounded CH-0015 batch
remediates only the persistent editor command bar during effective Client
Preview. The starting root stayed mounted at `display:flex` and used only
opacity plus pointer suppression; eight command actions remained focusable,
tabbable, accessibility-active, and programmatically focusable. Entry from
Preview, More, Save, the global presentation shortcut, or export could leave
focus invisible or drop it to `body` rather than the visible Exit Presentation
action.

The root now uses native `inert`, `aria-hidden`, pointer suppression, and one
capture guard while preview is active. A shared generation-scoped helper moves
focus exactly once to the visible Exit action when command-bar focus becomes
unavailable, preserves a valid outside focus owner, restores the current
semantic opener or More fallback after exit, and cancels stale work on route,
design, plan, mode, or unmount changes. Manual and export entry share the same setter.
Consumer capability derivation, direct URL behavior, public sharing, styling,
and all modal primitives remain unchanged. The command bar is explicitly
**PERSISTENT_PANEL**, not `EditorDialog`.

Existing merge-required `ci.pro-visual-policy` owns three new stable identities
in both Chromium and WebKit. The focused subset passes 6/6 and the canonical
gate passes 10/10 with zero retry/skip; the manifest stays 23 gates / 376
classified sources. Design cleanup passes 78/78, critical-required and cart
16/16 remain green, zero-warning lint/typecheck/code quality pass, strict build
passes 57/57, and Phase 8 remains green. Initial JS changes by +4,368 raw /
+943 Brotli bytes with the same 25 chunks; CSS and the Cabinetry/GLTF lazy
chunks are unchanged.

This is still a **partial CH-0015 remediation**. The selected-item panel's
separate P2 preview transition and the previously inventoried custom overlay
lifecycles remain open. Rollback is the one focused implementation commit; no
data, schema, dependency, authorization, public-share, or external rollback is
needed.

## CH-0015A accessible cart overlay lifecycle — 2026-08-08

Starting from exact integration source
`00c93f510f24c6f759a6d16b839dadbe253920f8` / tree
`5ad9392dffa8cad88871e898713fcead8e5656c1`, the first bounded CH-0015 batch
migrates only `ItemCartDrawer` (Selection Tray) to the shared modal
`EditorDialog`. The old closed drawer stayed mounted off-screen with focusable,
pointer-active, accessibility-visible controls; the new closed state unmounts
the complete dialog tree. Open state is a labelled modal right drawer with
intentional close-button focus, Tab containment, topmost Escape/backdrop
dismissal, current semantic opener restoration, replacement/missing-opener
handling, nested-modal suppression, route/unmount cancellation, destructive
row/footer mutation focus fallback, and one
Consumer/Pro mobile/desktop contract.

The bounded entry-focus follow-up from exact CH-0015A source `8b0213c...`
classifies the integrator's 15/16 result as **E — code and test both require
correction**. The original follow-up made the cart accessibility-active while
leaving focus on its outside opener during entry. The corrected cart focuses
the stationary dialog container before paint, makes background branches inert
and accessibility-hidden, and moves focus once to the close button only after
an explicit interactive state, no active entry animation, and a fully
in-viewport target rectangle. The required responsive identity retains its
geometry assertions and replaces the non-semantic `transform: none` poll with
per-frame focus, background, generation, transition, reduced-motion, and
responsive-measurement evidence.

No item identity, quantity/removal callback, add-all/clear ordering, price,
total, commerce source, checkout eligibility/URL, Shopify/affiliate behavior,
or purchase authorization changed. The separate shopping `CartSidebar` and
its retailer confirmation are not part of CH-0015A.

Required ownership advances to 23 gates / 376 classified inventory sources.
`ci.cart-overlay-accessibility` owns eight stable identities in both Chromium
and WebKit outside Full E2E discovery; required-test truthfulness binds its
explicit focused test root. The complete before/after contract, test ownership,
overlay inventory, remaining batches, and rollback are in
`docs/architecture/cart-overlay-accessibility.md`.

This batch is a **partial CH-0015 remediation**. The Selection Tray surface is
locally complete, but CH-0015 remains open for the inventoried custom Plans,
My Designs, command palette, checkout prompt, feedback, import, and other
overlay lifecycles. No unrelated overlay was migrated.

## CH-0013 required surface-material ownership remediation — 2026-08-07

Starting from exact integration source
`8f05b0fedc3de9d92b9815cbde3092568fd7507f` / tree
`748a0502b666c636720aafe552e016bb6756de2c`, the bounded CH-0013 branch
assigns the existing surface-material semantic suite to merge-required
`ci.catalog-materials`. The new deterministic command owns schema/YAML/render/
lazy parity, browser helper semantics, and the focused Phase 8 lazy-chunk
boundary after the existing strict build. Existing production-artifact
evidence remains the single pre-build generator-drift executor, avoiding
duplicate execution.

The manifest remains 22 gates and now classifies 376 sources. The catalog gate
has a 12-script closure at
`7ea65dfdc5ea31aac049836764123a9bc5a2e80b3af30c36bb42c34d8755b5e0`
with 15 named semantic contributions. Truthfulness rejects source
removal/rename, a missing contribution, duplicate required ownership,
advisory-only substitution, zero discovery, narrowed or fail-open command
mutations, and stale inventory/closure hashes.

No production material code, material ID, generated output, catalog boundary,
browser UI, dependency, schema, migration, budget, or external control changed.
Full E2E was not run. The authoritative inventory and rollback record is
`docs/security/CH-0013_SURFACE_MATERIAL_REQUIRED_OWNERSHIP.md`.

This locally resolves the next decision-free pre-candidate P1. The superseding
repository count is **0 unresolved P0 / 10 unresolved P1 / 8 resolved P1**;
READY is now CH-0015. Separate integrator review, exact-head required CI, and
external ruleset evidence remain pending.

## CH-0004 trusted event provenance remediation — 2026-08-07

Starting from exact integration source
`2e1df7ed7cefb5df2560fca70f77ef8785f37c8f` / tree
`394d4444d46ca8c1ce95ae3f0113197c015fd813`, the bounded CH-0004 branch
separates public browser analytics, trusted server lifecycle events, internal
diagnostics, and unverifiable legacy rows. Public ingestion now denies every
trusted/diagnostic/unknown type for every browser identity and rejects reserved
provenance keys. A forward-only migration adds server-owned authority,
producer, verification method, provenance version, and external event identity;
all predecessor rows default to `UNTRUSTED_OR_LEGACY` without a name/role/meta
backfill. A database constraint rejects any trusted row without the exact
current verified-Stripe contract and valid `evt_...` identity.

Verified Stripe webhook records and entitlement transitions are atomic and
idempotent. Invalid signatures create no trusted failure record; a verified
processing failure is bound to the signed event identity. Browser billing
success emits only `checkout_success_viewed`. Admin webhook health requires the
complete current Stripe provenance contract, while browser interaction metrics
are explicitly non-authoritative. The exact vocabulary, producer/consumer
graph, migration evidence, test owner, and rollback contract are in
`docs/security/CH-0004_TRUSTED_EVENT_PROVENANCE.md`.

This locally resolves one decision-free pre-candidate P1. The superseding
repository count is **0 unresolved P0 / 11 unresolved P1 / 7 resolved P1**;
READY is now CH-0013 and CH-0015. External exact-candidate preview smoke,
review/integration authorization, and later release certification remain
separate. No CH-0013, CH-0015, product-decision P1, Full E2E, workflow, external
control, push, deployment, or integration-branch mutation is included.

## Final Deep Clean v1 integration-readiness audit — 2026-08-06

The final read-only audit started from exact clean source
`2328f297e43b77e5a82693b1844bce1fe61512f9`, whose direct parent is the
documentation checkpoint `ff5f98db74f44cece2519f0570ee2fdfdbb5b2b1` and
whose application parent is `7dddf06249b44c3b447a2fdde98b64b3306be003`.
All intended Deep Clean application remediations, the dependency-security
batch, Phase 8A/B, RC47-RC55, and Consumer Undo/Redo touch-target work are in
ancestry. The isolated CH-0030 profiler commit
`d7a50698707153b43df0a982766288060c24b997` and all nine archival RC commits
remain non-ancestors and must not be replayed.

**RC47-RC55 result: A. CLOSED.** The corrected RC52 Workspace-unmount case
passed in both engines, as did the required Pro visual owner. The fresh full
drawer matrix was Chromium 8/9 and WebKit 9/9 because one Chromium case timed
out twice in `openCatalog` while an optional `Maybe later` button disappeared
between `isVisible()` and `click()`. That failure occurs before the drawer-focus
assertions and is a separate reproducible P2 test-contract race; it does not
reopen an archival application invariant. It does block representing this
audit's fresh drawer result as 18/18 and must be fixed before release-wide
browser certification.

The canonical manifest is SHA-256
`cfec291840a1fc4c82e6c3795b2aa3c24211886c22513ab58a1fe89c8521f73b` and
validates **22 gates / 374 classified sources**: 251 script tests, 101 browser
specs, 6 cabinetry browser modules, 8 multi-room browser modules, and 8
cabinetry script modules. It contains 19 merge-required gates, one advisory
Full E2E gate, and two release-blocking gates. `ci.public-share-responsive`
remains the sole merge-required responsive owner; neither advisory Full E2E nor
release Gate A3 substitutes for it. `stable-checks`, `secret-scan`, and
`advisory-contract-preflight` feed `ci.merge-gate`, which fails unless all three
jobs succeed.

| Gate | Cadence / status | Canonical command | Package closure: scripts / SHA-256 | Current audit result |
| --- | --- | --- | --- | --- |
| `ci.secret-scan` | merge-required / blocking | `gitleaks/gitleaks-action@v2` | n/a | External workflow required; local binary unavailable. |
| `ci.required-test-truthfulness` | merge-required / blocking | `npm run test:required-test-truthfulness` | 1 / `a63f8a3c477cedbe71fea9dc36e6ab1bda3eb228ce36352f2d6b5e942d1283e6` | PASS. |
| `ci.code-quality` | merge-required / blocking | `npm run check:code-quality` | 1 / `099078f332ea2801748b635c031df32cc42f49efcdaaf73d88944533749113ff` | PASS. |
| `ci.production-artifact-contract` | merge-required / blocking | `npm run test:production-artifact-evidence` | 1 / `2c72a65b5affbfbb1c5d94377bad6d0b2135181d25b5fcd56fac3c389a1cd5c7` | PASS. |
| `ci.production-artifact-build` | merge-required / blocking | `npm run evidence:production:build` | 1 / `b7ba610a68ce331c0879a5ab80d10390a877d3756173910dc6987986c9f08258` | Strict direct staging build PASS 57/57; workflow-bound artifact evidence still requires exact-candidate CI. |
| `ci.production-runtime-smoke` | merge-required / blocking | `npm run evidence:production:smoke` | 1 / `d9971664dba648e6b1026b61fbf13ad8bf14f6faa052b3d0e5eed4d8cc7fd2b1` | Not simulated locally; exact-artifact workflow execution required. |
| `ci.authorization-boundaries` | merge-required / blocking | `npm run test:auth-env-hardening` | 1 / `d2a92b4f2ee3191abb9d4fc30f5d8497b9da0b1c59dfc1d6333101fb9d398e84` | PASS: 25 routes, 14 pages, 13 privileged CLIs. |
| `ci.database-migrations` | merge-required / blocking | `npm run gate:a3:db` | 1 / `f075521ce17b8ea6466796237f70d8b9e3359cd01ebb9d8beac64433846de1c7` | Not run; database mutation was prohibited. Existing local RC55 test DB read-only precheck showed 42 migrations. |
| `ci.critical-domain-contracts` | merge-required / blocking | `npm run test:critical-required` | 41 / `dc376b8f529d5243a506925e0037debba1e5319e53f785fd5a447263728d63d4` | PASS. |
| `ci.design-cleanup` | merge-required / blocking | `npm run test:design-page-cleanup` | 1 / `2649e75478c4214608459c1c4cfe063e69f07246b2341bfb484f8584a9697b49` | PASS 78/78. |
| `ci.typecheck` | merge-required / blocking | `npm run typecheck` | 1 / `b43579a2174ed4e7ee7f7129cb8edbb2b10c02d5e9aeee9099621be7b3b90d9f` | PASS. |
| `ci.lint` | merge-required / blocking | `npm run lint -- --max-warnings=0` | 1 / `9d4b756f63d86d3dbfa77b655cb12478f23d5efff0466b3e233736393e8bdbea` | PASS, zero warnings. |
| `ci.floor-plan-required` | merge-required / blocking | `npm run test:floor-plan-required` | 55 / `c7939de350af5aa1f7be49616ec6dbabde2f0fbe708a0a3b23d3faff57944cfa` | PASS; 30 existing architecture-size notices remain advisory. |
| `ci.catalog-materials` | merge-required / blocking | `npm run test:catalog-audit && npm run test:catalog-asset-availability` | 8 / `a0354533f0992678a6264a37233a3ef0a6562502d6aa9565247db438a6ea1bda` | PASS; five missing local assets are draft-only warnings. |
| `ci.asset-inventory` | merge-required / blocking | `npm run assets:inventory:strict` | 1 / `474f6817f74b6072bc7e366a8b48c5db5ca8c89ccb2a670fd839ece38d0603a1` | PASS: 1,613 files. |
| `ci.pro-visual-static` | merge-required / blocking | `npm run test:designer-theme-contrast && npm run test:cabinetry-preview-renderer` | 2 / `0908541015653b673b36cc89a5067873e130b354e7273df75ec6956e05a20534` | PASS. |
| `ci.pro-visual-policy` | merge-required / blocking | `npm run test:pro-visual-policy` | 1 / `e405cb73f95c111fb19dd7bbb4886c760841f8a08afcf0ba5bdb7e99482e3fa3` | PASS 4/4, Chromium and WebKit. |
| `ci.public-share-responsive` | merge-required / blocking | `npm run test:public-share-responsive-required` | 2 / `d554bcd17619cead3de0012153f24a352b71dd45719262e0a7902c7453a033fe` | PASS 8/8, Chromium and WebKit. Canonical responsive owner. |
| `ci.merge-gate` | merge-required / blocking | GitHub Actions result aggregation | n/a | External: requires success from `secret-scan`, `stable-checks`, and `advisory-contract-preflight`; ruleset enforcement unverified. |
| `advisory.full-e2e` | advisory / nonblocking | `npm run test:e2e:advisory` | 1 / `814167f721e8d3bc126e455a00cf30975a211f45fa4edf83b0905b8b54d679fb` | Not run by explicit policy. |
| `release.gate-a3` | release-blocking | `npm run test:e2e:release` | 1 / `e52bf0d5b54a97f622095dd017039c8faf3a55016dd5b707a9985249de800dab` | Not run; reserved for the exact immutable release artifact. |
| `release.cabinetry-browser` | release-blocking | `npm run test:e2e:cabinetry-release` | 1 / `21953753f89d99e6e1d9c07447e2648cb8e042e3a830467fc4a40fc7a08c82b4` | Not run; release cadence. |

Workflow ordering in `stable-checks` is source verification, Node/install/auth
fixture, database migration, auth and lightweight contracts, pristine strict
build, browser installation, runtime smoke/evidence bundling, critical/static
domains, lint/cleanup/typecheck/floor-plan, Pro/asset/catalog owners, responsive
share, then Pro visual browser policy. Any ordinary step failure fails
`stable-checks`; `ci.merge-gate` uses `if: always()` and explicitly exits
nonzero unless all three prerequisite jobs report `success`.

Fresh local results passed authorization hardening; full code quality;
required-test truthfulness and direct manifest validation; production-artifact
contract; critical domains; design cleanup 78/78; floor-plan required; lint
with zero warnings; typecheck; catalog/material/required-asset checks; design
persistence; Pro visual 4/4; public share 8/8; Consumer/Pro touch targets 6/6;
original Consumer placement/history 5/5; Phase 8; and the strict staging build
at 57/57 pages. The legacy non-required `validate:product-assets` command still
exits nonzero only for its 30 unverified renderer-memory-disposal checks. The
fresh drawer result is the setup-race-qualified 17/18 above. Full E2E was not
run. The first build/browser attempts that could not bind sandbox ports, and
the first public-share run against a nonexistent `test` database role, were
environment failures; the approved reruns used the existing 42-migration local
RC55 test database and reached the product assertions.

Fresh dependency audits match the bounded compatibility record: full audit 11
package nodes (10 high, 1 moderate), omit-dev 7 (6 high, 1 moderate), zero
critical, and zero Next/Auth/PostCSS vulnerability nodes. The five remaining
advisory IDs are confined to ESLint/type-analysis, Sentry bundler/schema, and
Prisma CLI/tool paths; no request-time import or untrusted input was found.
They remain recorded toolchain debt, not a reopened direct-production P1.

Current triage is **0 unresolved P0 and 12 unresolved P1**. CH-0019 is now
`RESOLVED`: every original hook, save-status, Hamilton vocabulary,
architecture, Pro visual, and Phase 8 failure is closed by current ancestors
and the current gates. The unresolved P1 split is three `READY` (CH-0004,
CH-0013, CH-0015), seven `REQUIRES_PRODUCT_DECISION` (CH-0002, CH-0003,
CH-0005, CH-0007, CH-0008, CH-0010, CH-0011), and two
`BLOCKED_DEPENDENCY` (CH-0006, CH-0018). No P1 is primarily blocked only by an
external control. None of the three READY P1s must precede integration-branch
planning, but all remain pre-release work; CH-0018 and the authorization,
privacy, catalog, and rate-policy decisions are release blockers rather than
accepted risk.

**Integration result: A. INTEGRATION PLANNING MAY BEGIN.** This is not merge or
release permission. GitHub required-check/ruleset enforcement, CH-0030 runner
inventory/A-B authorization, Vercel, OAuth, populated-predecessor database
evidence, scheduler, immutable HTTPS artifact identity, promotion, and release
evidence remain external or release-cadence requirements.

## Superseded RC47-RC55 read-only confirmation — 2026-08-06

Exact application source `7dddf06249b44c3b447a2fdde98b64b3306be003`
closes RC47, RC48, RC49/50, RC51, RC53, RC54, RC55, and the separate Consumer
Undo/Redo 44 px defect, but a fresh unchanged Chromium/WebKit drawer-focus run
passed 17/18 and a narrow WebKit rerun reproduced the same focus loss. RC52 is
therefore **F. STILL_REQUIRED** and the final outcome is **C. RC47–RC55
DISPOSITION BLOCKED**. No archival commit should be replayed; the current
implementation chain remains authoritative. At that superseded checkpoint,
this bounded P2 archival finding did not change the then-current totals of **0
unresolved P0 and 13 unresolved P1**; the final audit above supersedes both the
RC52 disposition and the count. Full evidence and the final mapping are in
`07_RC47_RC55_ARCHIVAL_DISPOSITION.md`.

## 2026-08-05 bounded dependency P1 remediation

Starting from exact clean source `55bc4b65c121c1a6646fd2d8b38bb93f9061c372`, branch `security/dependency-auth-next-compatibility` updates the minimum coherent Next.js/Auth.js set (`next` 16.2.11, `next-auth` beta.32, Prisma adapter 2.11.3/core 0.41.3, and PostCSS 8.5.23). Fresh audits remove every reported direct-production Next/Auth advisory and both critical nodes while retaining five explicitly classified tool-path advisory IDs outside this batch. Runtime/auth behavior, 57-page build, required gates, and Phase 8 budgets remain green. The complete inventory, compatibility matrix, exact audit deltas, lockfile scope, validation, and rollback are in `docs/security/P1_DEPENDENCY_AUTH_NEXT_COMPATIBILITY.md`. CH-0004 and all other findings were untouched.

This register is anchored to checkpoint `08bdfe0c5e5c882777dc5da38168ea7db14840ad`. IDs are stable: implementation commits, pull requests, exceptions, and release evidence should cite them without renumbering. P0 means active catastrophic risk, P1 high risk or release blocker, P2 material maintainability/reliability debt, and P3 hygiene. No P0 was confirmed in this audit.

Post-CH-0001 triage was performed on 2026-07-31 at `62ba966ecb2011e4233c99ce1dcc0641914af008`. CH-0012 repository remediation was then completed at `2c9e8b4d2322484a8d80873019d2c3495dd862f5`. CH-0016 repository remediation was completed next at `cbed3550026e2803675f740b49be5fb15f15612b`; external execution and durable evidence retention remain unverified. CH-0017 is **TRUTHFULNESS AND REQUIRED EXTERNAL WORKFLOW VERIFIED — IMPLEMENTATION FROZEN**. CH-0028 is **EXTERNALLY VERIFIED — RESOLVED** at verified source `db346a51718967bd4dc1605b07c0850e02fd08d1`. CH-0029 is **OPEN — POST-RESPONSE BROWSER/MAIN-THREAD STARVATION**. The superseding final classification is zero unresolved P0 findings, twelve unresolved P1 findings, six resolved P1 findings, and two former P1 findings downgraded to P2 with current evidence. The finding-by-finding evidence, reachability, dependencies, test coverage, remediation scope, rollback, and ordered queue are recorded in `06_P0_P1_REMEDIATION_QUEUE.md`.

## Priority summary

The first ten risks by consequence, exploitability, customer impact, and change frequency are:

1. CH-0001 fail-open admin authorization;
2. CH-0002 guest storage abuse and non-atomic quota enforcement;
3. CH-0007 parallel catalog truths and non-transactional authoring;
4. CH-0008 fail-open catalog publication classification;
5. CH-0012 legacy editor navigation that drops modern document state;
6. CH-0016 CI that does not validate the built, strict artifact;
7. CH-0017 false-pass and omitted critical release gates;
8. CH-0018 fresh-install-only migration validation;
9. CH-0013 generated surface payload/drift contract;
10. CH-0014 per-item 3D resource and event ownership.

CH-0001, CH-0012, and CH-0016 are closed for repository-controlled remediation. CH-0017 is **TRUTHFULNESS AND REQUIRED EXTERNAL WORKFLOW VERIFIED — IMPLEMENTATION FROZEN**. CH-0028 is **EXTERNALLY VERIFIED — RESOLVED** at `db346a51718967bd4dc1605b07c0850e02fd08d1`. CH-0029 is the active bounded performance remediation; CH-0004 trusted event provenance was not started.

## Findings

### CH-0001 — Deployment classification can fail open into admin access

- **Severity:** P1.
- **Status:** RESOLVED — REPOSITORY-CONTROLLED REMEDIATION COMPLETE. External platform settings remain explicitly unverified in `docs/security/CH-0001_EXTERNAL_CONTROLS_CHECKLIST.md`.
- **Resolution commit:** `62ba966ecb2011e4233c99ce1dcc0641914af008`.
- **Locations/symbols:** `lib/config.ts:getApplicationEnvironment`; `lib/admin.ts:isAdmin`; `app/layout.tsx` configuration validation.
- **Pre-remediation evidence:** Missing or unknown `APP_ENV`, `NEXT_PUBLIC_APP_ENV`, and `VERCEL_ENV` became `development`. When `ADMIN_EMAILS` was empty, `isAdmin` treated any nonempty authenticated email as admin in that state; `NODE_ENV === "development"` was not required.
- **Evidence/current behavior at resolution HEAD:** Missing, blank, or unknown deployment classification is invalid; public variables and CI flags have no authorization authority; every administrative environment requires a valid Auth.js session email in a complete valid server allowlist; the former request-controlled catalog-audit bypasses are absent; discovered privileged handlers/pages and operational entry points enforce their applicable guard before work.
- **Risk:** A misconfigured or non-Vercel production deployment can grant every Google-authenticated user admin APIs and Pro access.
- **Improvement:** Fail closed. Permit a local bypass only through an explicit opt-in combined with Node development mode and loopback/local-host evidence; validate deployment classification at startup and in security tests.
- **Expected outcome:** Unknown production configuration cannot create privilege; intentional local development remains convenient and explicit.
- **Tests:** Table-driven environment/admin-email matrix; missing and invalid variables; preview/staging/production; loopback versus forwarded host; ordinary signed-in user denied every admin boundary.
- **Dependencies/decision:** Deployment environment inventory. No product decision.
- **Compatibility:** Behavior-preserving for valid production and explicit local development; it intentionally removes accidental privilege.
- **Resolution:** `getApplicationEnvironment` now accepts only the repository's explicit server-side deployment model, `instrumentation.ts` rejects missing/unknown classifiers during server preparation, and admin authorization requires a valid server session email in a complete valid `ADMIN_EMAILS` allowlist in every environment. Auth.js credentials no longer gain fixed or short-secret fallbacks from CI flags, and malformed reviewer/publisher lists deny the complete narrower role. `NEXT_PUBLIC_APP_ENV`, `NODE_ENV`, `ADMIN_REQUIRE_AUTH`, empty allowlists, CI flags, and the two query/header audit bypasses have no authority. The complete surface and deployment tables are in `docs/security/CH-0001_AUTHORIZATION_MATRIX.md`.
- **Regression evidence:** `npm run test:auth-env-hardening` discovers 25 admin route files and 14 admin pages, checks all direct handlers plus `/api/me`, the optimizer, the synthetic conversion route, eight operational TypeScript CLI/background entry points, and five backup/restore/test-only utilities, and covers environment/auth-credential/allowlist/session/side-effect negatives. `tests/e2e/13-admin-variant-audit.spec.ts` uses real local/CI Auth.js database sessions for signed-out, forged, expired, free, Pro, and allowlisted-admin direct requests.

### CH-0002 — Guest storage and plan quotas are bypassable and non-atomic

- **Severity:** P1.
- **Locations/symbols:** `app/api/designs/claim/route.ts`; `lib/design-route-payload.ts`; design create/import/duplicate/share-duplicate routes; `app/api/designs/merge/route.ts`; floor-plan confirmation/update creation paths.
- **Evidence/current behavior:** Anonymous claim accepts payloads up to 5 MB and keys limits to caller-supplied UUIDs, which can be rotated. Authenticated quota flows perform count-then-create in separate operations, while guest merge transfers all rows without a quota check.
- **Risk:** Storage exhaustion, cost abuse, and free-plan overage under UUID rotation or concurrent mixed-route requests.
- **Improvement:** Introduce a server-minted signed HttpOnly guest capability, IP+guest+global budgets, TTL/retention, and one quota-enforcing creation/claim service using an atomic counter, advisory lock, or serializable transaction.
- **Expected outcome:** All creation paths observe the same race-safe policy and anonymous storage has bounded provenance and lifetime.
- **Tests:** UUID rotation; replay; parallel requests at 19/20 across create/import/duplicate/share/floor-plan; over-quota merge; global and per-guest budgets; failure rollback.
- **Dependencies/decision:** Product decision required for guest retention, guest and authenticated quotas, and legacy overage behavior.
- **Compatibility:** Decision-required because valid current guest data may age out or claims may be rejected.

### CH-0003 — Cost-bearing rate limits are process-local

- **Severity:** P1.
- **Locations/symbols:** `lib/rateLimit.ts`; consumers in AI notes/layout, PDF export, share email, Stripe/Shopify checkout, GLB optimization, telemetry, and inline floor-plan processing; compare `lib/shared-rate-limit.ts`.
- **Evidence/current behavior:** A per-process `Map` enforces many sensitive limits. Cold starts and multiple instances reset or partition the budget; durable limiting exists but has narrow adoption.
- **Risk:** Distributed deployments can exceed cost, compute, and email limits; untrusted forwarding headers can fragment identity.
- **Improvement:** Standardize a shared limiter with user+guest+trusted-IP+global keys, platform-specific IP extraction, `Retry-After`, operation budgets, and fail-closed treatment for costly work.
- **Expected outcome:** Limits remain coherent across instances and restarts, with observable rejections.
- **Tests:** Two-instance concurrency; cold restart; forwarded-header spoofing; per-operation/global exhaustion; limiter outage policy.
- **Dependencies/decision:** Rate budgets and availability policy require product/operations approval.
- **Compatibility:** Decision-required; stricter shared enforcement may reject traffic currently admitted.

### CH-0004 — Public event ingestion can forge server-authoritative lifecycle events

- **Severity:** P1, locally resolved on the bounded pre-candidate branch.
- **Locations/symbols:** `lib/app-event-provenance.ts`; `lib/app-events.ts`; `lib/trusted-app-events.ts`; `lib/app-event-operations.ts`; public app-event and Stripe webhook routes; billing success UI; admin operations; Prisma provenance migration.
- **Evidence/current behavior:** Browser ingestion uses only the browser-authorized union and cannot select a trusted/internal emitter or persist reserved provenance. Trusted Stripe events require signature-verified context, current version, exact producer/method, and external event ID. Admin lifecycle queries require that complete contract; legacy/browser/malformed same-name rows are excluded.
- **Risk disposition:** The original anonymous/authenticated/Pro/admin forgery path no longer creates authoritative evidence. Browser analytics remain intentionally forgeable interaction signals and are labelled non-authoritative.
- **Implementation:** Four authority classes, separate emitters and compile-time unions, forward-only provenance fields with legacy default, atomic/idempotent Stripe lifecycle recording, success-view analytics rename, and trusted-only operations query.
- **Expected outcome:** Satisfied locally; no browser or legacy record can affect authoritative webhook health or lifecycle evidence.
- **Tests:** Phase 7 executes the identity/type/provenance ingestion matrix, trusted persistence failure, invalid signature, idempotent retry, transaction rollback, mixed-authority admin fixtures, and resolved import graph; focused live database route denial/persistence, Stripe/billing UI checks, and populated-predecessor migration proof supplement it.
- **Dependencies/decision:** None.
- **Compatibility:** Legitimate browser analytics remain available with explicit non-authoritative provenance; trusted lifecycle behavior remains Stripe-webhook-owned. Exact-candidate external preview/release evidence remains later work.

### CH-0005 — Published floor-plan retirement uses a weaker role than publication

- **Severity:** P1.
- **Locations/symbols:** `lib/floor-plan-imports/publication-governance.ts`; admin approve/publish/retire routes; `scripts/test-floor-plan-revision-retirement.ts`.
- **Evidence/current behavior:** Approve and publish require the narrower publisher authority, but retirement of a published revision requires only general admin; tests codify that weaker check.
- **Risk:** A broad admin can remove public revisions outside the documented maker/publisher boundary.
- **Improvement:** Require publisher authority, or define an explicit emergency-withdraw role with mandatory reason and audit trail.
- **Expected outcome:** Publish and unpublish authority is coherent and auditable.
- **Tests:** ordinary admin/reviewer denied; publisher allowed; emergency role and reason if selected; audit event asserted.
- **Dependencies/decision:** Product/operations decision only if an emergency-withdraw role is desired.
- **Compatibility:** Behavior-preserving under the documented publisher model; decision-required for emergency semantics.

### CH-0006 — Legacy public catalog API exposes drafts and filesystem internals

- **Severity:** P1.
- **Locations/symbols:** `app/api/catalog/route.ts`; `lib/catalog-yaml.ts:getFreshCatalogYamlEntries`; `/api/catalog/live`.
- **Evidence/current behavior:** Unauthenticated `/api/catalog` returns every YAML entry, including five drafts, enriched with absolute `file_path`, validation, and authoring metadata. A publication-filtered public route already exists.
- **Risk:** Draft products and deployment paths leak, and external consumers can bind to an administrative DTO.
- **Improvement:** Inventory consumers, then remove/admin-protect the route or make it return the stripped live public DTO.
- **Expected outcome:** Anonymous catalog APIs expose only published product data and stable public fields.
- **Tests:** drafts, validation fields, and absolute paths absent; known public entry present; consumer contract; old route redirect/removal behavior.
- **Dependencies/decision:** Verify external consumers. No product decision unless the route was intentionally administrative.
- **Compatibility:** Characterize consumers first; public output intentionally narrows.

### CH-0007 — Catalog has parallel mutable truths and non-transactional authoring

- **Severity:** P1.
- **Locations/symbols:** `lib/catalog/data.ts`; `lib/catalog/registry.ts`; `catalog/furniture/**/catalog.yaml`; `lib/useDesignPageImportedModels.ts`; `lib/catalog/imported-model-assembly.ts`; admin catalog update route; Shopify checkout route.
- **Evidence/current behavior:** Static runtime registry has 30 items while YAML has 139; 109 YAML identities are absent from static data. Editor code asynchronously mutates module-global maps. Shopify validates only the static server map and all 30 static items currently resolve as affiliate, making the Shopify path unreachable. Admin update commits Prisma before writing deployment-bundled YAML, with no compensation.
- **Risk:** Editor, export, APIs, publication, and commerce can disagree; a filesystem failure leaves DB/YAML divergence; deployed files may be read-only or ephemeral.
- **Improvement:** Choose one durable authoring source, compile an immutable normalized versioned catalog, expose typed consumer projections, remove runtime global mutation, and use repository review or durable storage/outbox semantics for authoring.
- **Expected outcome:** A product identity has one versioned definition and deterministic projections across client/server/commerce.
- **Tests:** static/YAML migration parity; draft exclusion; editor/export/API identity parity; fault-injected authoring write; mocked successful Shopify checkout and invalid identity; immutable registry.
- **Dependencies/decision:** Product decision required for canonical source/precedence and whether Shopify is intentionally dormant.
- **Compatibility:** Decision-required and migration-backed; do not collapse sources opportunistically.

### CH-0008 — Catalog publication status fails open

- **Severity:** P1.
- **Locations/symbols:** `lib/catalog-publication.ts:isLiveCatalogEntry`; `lib/catalog-audit.ts`; catalog YAML; orphan `scripts/test-catalog-live-gate.ts`.
- **Evidence/current behavior:** Any status not in a short draft set is live. Current data has 73 unspecified, 54 `published`, 10 `live`, 2 `active`, and 5 `draft`; audit does not enforce a controlled enum. A typo, `retired`, or unknown value publishes.
- **Risk:** Unreviewed, retired, or malformed products can become public.
- **Improvement:** Decide a canonical status model, migrate all unspecified/legacy values explicitly, then validate the enum and fail closed for unknown states.
- **Expected outcome:** Publication is explicit, auditable, and typo-safe.
- **Tests:** each allowed state; typo/unknown/retired/archived denied; migration fixture for 73 unspecified records; public API and editor projection parity.
- **Dependencies/decision:** Product/catalog-owner decision required because classifying 73 entries changes availability.
- **Compatibility:** Decision-required; migration must precede fail-closed enforcement.

### CH-0009 — Request-time GLB optimization executes an unpinned network CLI

- **Severity:** P2 at post-CH-0001 HEAD; downgraded from P1 with evidence.
- **Status:** DOWNGRADED_WITH_EVIDENCE. CH-0001 made the route directly admin-only and the request body is bounded before optimization. The mutable request-time package execution remains a real supply-chain and availability defect, but current reachability requires a valid allowlisted administrator and no ordinary public caller can trigger it.
- **Locations/symbols:** `lib/asset-pipeline/normalize.ts`; `lib/asset-pipeline/optimize.ts`; `app/api/tools/glb-optimizer/route.ts`.
- **Evidence/current behavior:** The route accepts files up to 80 MB and synchronously executes `npx -y @gltf-transform/cli`, which is absent from package dependencies.
- **Risk:** Mutable supply-chain execution, runtime network dependency, event-loop blocking, and unbounded CPU/memory/output pressure.
- **Improvement:** Pin the tool at build time, call a resolved local library/binary in an isolated worker, and enforce timeout, CPU/memory/output and external-resource policies.
- **Expected outcome:** Offline, reproducible optimization with bounded resource use.
- **Tests:** no `npx/-y`; offline production; malformed and external-resource glTF; oversized output; timeout; concurrency; cleanup on failure.
- **Dependencies/decision:** None.
- **Compatibility:** Behavior-preserving for accepted files; deterministic failures replace ambient network behavior.

### CH-0010 — Disabled share URLs can be resurrected

- **Severity:** P1.
- **Locations/symbols:** design share POST/DELETE route; `lib/useDesignPagePersistence.ts` automatic sharing behavior.
- **Evidence/current behavior:** Disabling only flips `shareEnabled`; enabling reuses the retained token. Designer mode can automatically re-enable sharing.
- **Risk:** A recipient link believed revoked can later work again without the owner sharing a new URL.
- **Improvement:** Rotate/clear token on disable-to-enable and require an explicit sharing action or clearly confirmed policy for automatic enablement.
- **Expected outcome:** Revoked URLs remain invalid permanently.
- **Tests:** disable, reload/designer entry, re-enable, old token remains 404/410, new token works, concurrent enable/disable.
- **Dependencies/decision:** Product decision for automatic-sharing UX; token revocation itself should be fail-safe.
- **Compatibility:** Intentional security semantics change; communicate regenerated links.

### CH-0011 — Session replay lacks an application consent/masking gate

- **Severity:** P1, conditional on project-side PostHog policy.
- **Locations/symbols:** `app/providers/PostHogProvider.tsx`; `app/layout.tsx`.
- **Evidence/current behavior:** Production sets `disable_session_recording: false`; no application consent state, opt-out, or explicit sensitive design/address masking policy was found.
- **Risk:** Room designs, addresses, inputs, or sensitive UI may be captured contrary to privacy expectations or legal basis.
- **Improvement:** Default deny until consent/legal basis is documented; disable replay or mask all text/input and block sensitive canvas/UI regions; expose opt-out.
- **Expected outcome:** Analytics initializes in a privacy-reviewed mode and replay starts only under explicit policy.
- **Tests:** before/after consent; opt-out; masking/block selectors; production/staging configuration; no replay event before approval.
- **Dependencies/decision:** Privacy/legal/product policy required.
- **Compatibility:** Decision-required; analytics volume may change.

### CH-0012 — Saved-design entry points open a lossy legacy editor

- **Severity:** P1.
- **Status:** RESOLVED — REPOSITORY-CONTROLLED REMEDIATION COMPLETE. The local implementation commit is the commit containing this record; its resolved SHA is recorded after creation in the final Codex response.
- **Locations/symbols:** `lib/design-editor-url.ts:buildDesignEditorUrl`; `app/design/[id]/page.tsx`; `components/DesignsListWithSelection.tsx`; `components/DuplicateDesignButton.tsx`; `app/checkout/success/page.tsx`; `components/editor/design-page/DesignPageWorkspace.tsx`; `components/editor/design-page/DesignPageDialogLayer.tsx`; `lib/useDesignPageFloorPlanLifecycleRegistration.ts`; `lib/useDesignPagePersistence.ts`.
- **Pre-remediation evidence:** Dashboard, duplicate, and checkout success linked to `/design/[id]`. That route cast items through `unknown`, dropped modern multi-room, floor-plan, finish/material and capability state, and rendered legacy `DesignerCanvas`. The canonical persisted-document loader already existed at `/design?designId=...`. Characterization also found that in-editor My Designs loaded a different design without changing the URL, failed/denied route loads could retain a prior document under the wrong URL, and successful floor-plan revision copies could leave the source identity in the address bar.
- **Risk:** The same saved design looks or behaves materially differently depending on entry point; users can conclude data was lost.
- **Resolution/current behavior:** All supported editable saved-design entry points use one typed helper and canonical `/design?designId=<opaque-id>` contract. `/design/[id]` is now a temporary server redirect and contains no database load or legacy renderer. Dashboard, successful duplicate response, checkout continuation, in-editor My Designs, refresh/history, and successful floor-plan revision-copy loading converge on the canonical v3 snapshot loader. Missing/denied loads restore the prior canonical identity or `/design`; superseded/unmounted operations cannot pull navigation back. My Designs is loaded on demand so the routing change does not worsen the inherited initial-JS bundle.
- **Canonical contract:** Consumer is the default with no `mode`; `mode=designer` only requests Designer presentation and never grants entitlement. Only verified `mode=designer`, `view=2d`, `workspace=furnish`, and an explicitly supplied encoded `floorPlanImport` value can accompany the encoded opaque `designId`. Arbitrary redirect, attribution, or destination parameters are not forwarded. Empty IDs are rejected by the helper. The design API remains the owner/enabled-share-token read boundary and owner-only write boundary; `/api/me` plan/capabilities remain the Pro authority.
- **Regression evidence:** `npm run test:design-editor-routing`; `npm run verify:design-persistence`; final six-case database-backed Chromium spec (6/6 in 3.0 minutes); existing share/duplicate smoke (4/4 in 16.7 seconds); floor-plan revision-copy and consumer-flow guards; focused and expanded zero-warning lint; typecheck; code-quality ratchet; explicit-development production build. The fixture proves full multi-room geometry, openings, finishes/opacity, item identities/transforms, zones, saved views, save/reload identity, no startup create, duplicate returned-ID use, checkout context, legacy redirect filtering, Pro non-escalation, history/refresh, and denied-ID fallback.
- **Compatibility:** Existing `/design/[id]` bookmarks remain compatible through a non-permanent redirect. `/share/[shareToken]` and the orphaned read-only `/d/[token]` compatibility route are separate share contracts; the latter remains documented debt, not an editable saved-design fallback.
- **Rollback:** Revert the single CH-0012 implementation commit. A partial emergency rollback should revert callers first while retaining `/design/[id]` as a compatibility redirect. There is no schema, migration, persisted-document rewrite, dependency upgrade, push, or deployment to undo.

### CH-0013 — Generated surface registry is an unenforced, oversized client contract

- **Severity:** P1.
- **Status:** RESOLVED — CLIENT PAYLOAD, FIXTURE ISOLATION, GENERATOR DRIFT, AND CANONICAL MERGE-REQUIRED SEMANTIC OWNERSHIP COMPLETE. External ruleset selection and exact-head CI execution remain unverified integration/release evidence.
- **Locations/symbols:** `scripts/generate-surface-material-runtime.ts`; `scripts/test-surface-material-schema.ts`; `lib/generated/surface-material-runtime.generated.ts`; `lib/surface-material-runtime.ts`; plan panel and surface inspector consumers; `package.json`; CI.
- **Evidence/current behavior:** Phase 8A/B already provide a 980-record compact eager render projection, same-order 980-record lazy catalog projection, isolated one-record test fixture, 2,484-row lazy Nippon catalog, stable keyed lookup, and passing unchanged bundle budgets. CH-0013 now makes `ci.catalog-materials` the sole merge-required semantic owner through a 12-script closure, while the existing production-artifact owner runs generator drift once before the strict build.
- **Risk closed:** A missing/renamed semantic source, missing contribution, stale generator output, fixture leak, schema/parity failure, lazy-boundary regression, narrowed/fail-open command, duplicate owner, or advisory-only substitution now fails required CI.
- **Implementation:** The focused semantic umbrella runs schema parity, deterministic browser-helper behavior, and the surface-only Phase 8 runtime/chunk boundary after the existing strict build. Fifteen manifest contribution IDs bind the complete contract without running Full E2E or duplicating the full Phase 8 gate.
- **Expected outcome:** Achieved locally; external exact-head workflow/ruleset evidence remains separate.
- **Tests:** generator freshness under production-artifact evidence; schema/YAML/render/lazy/texture/UV/2D/3D/persistence/BOM/export/publication; browser search/filter/grouping/variant/Nippon/swatch; focused lazy/chunk boundary; truthfulness negatives; full required validation listed in HANDOFF.
- **Dependencies/decision:** No decision if Pro visibility is preserved; confirm whether complete offline browsing is a product requirement.
- **Compatibility:** Gate-only and test-only delta; runtime behavior and the existing fallback for non-projected collection labels are unchanged. Roll back the one focused implementation commit.

### CH-0014 — Each 3D item owns expensive loading, listeners, and frame work

- **Severity:** P2 at post-CH-0001 triage; downgraded from P1 with evidence.
- **Status:** DOWNGRADED_WITH_EVIDENCE. The per-item loaders, global listeners, clones, and frame work remain visible in source, but the audit has no measured production threshold breach, data-loss path, security/privacy consequence, or demonstrated core-workflow outage attributable to this ownership. Keep it as material performance/reliability debt and promote it only if the required 10/100/500-item benchmark proves high-impact failure.
- **Locations/symbols:** scene item layer, `components/scene/FurnitureItem.tsx`, `components/scene/GLBScaledModel.tsx`, GLB normalization helpers.
- **Evidence/current behavior:** Instances create loader/decoder/load/clone work; each item registers global keyboard handling and frame callbacks. This scales per object rather than per scene/selection and complicates disposal.
- **Risk:** Large designs amplify network/decode/memory/event/frame costs, create duplicated handlers, and increase stale resource or leak risk.
- **Improvement:** Introduce a scene asset resource manager with promise/cache/ref-count/disposal ownership, centralize keyboard commands at editor scope, and invalidate frames only for active animation/interaction.
- **Expected outcome:** One load/decoder path per asset, deterministic disposal, one keyboard owner, and near-idle frame cost for static scenes.
- **Tests:** concurrent same-URL dedupe; retry/error; clone isolation; ref-count disposal; mount/unmount listener count; selected-item delete; 10/100/500-item CPU, memory, and frame benchmarks.
- **Dependencies/decision:** None; preserve visual and interaction parity.
- **Compatibility:** Behavior-preserving with golden scenes and interaction characterization.

### CH-0015 — Drawers and major overlays bypass accessible dialog ownership

- **Severity:** P1.
- **Status:** PARTIALLY REMEDIATED — CH-0015A SELECTION TRAY, CH-0015B CLIENT PREVIEW COMMAND BAR, CH-0015C PLANS, AND CH-0015D MY DESIGNS COMPLETE LOCALLY; SIX REQUIRED OVERLAYS REMAIN OPEN.
- **Locations/symbols:** `ItemCartDrawer`; editor dialog layer; Plans dialog; My Designs dialog and nested Confirm; Command Palette; shared `EditorDialog`.
- **Pre-remediation evidence:** Closed cart was translated off-screen while controls remained mounted/focusable. It lacked dialog semantics, inert/focus containment, Escape and focus return. Several major modals bypassed the shared accessible dialog primitive.
- **Current behavior:** Selection Tray closed content is unmounted; open content uses the shared modal lifecycle with labelled semantics, deterministic entry/trap/Escape/backdrop/current-opener return, nested-owner suppression, and stale-frame cancellation. Client Preview correctly conceals its persistent command bar. Plans uses the lifecycle across direct Account and nested Upgrade entry. My Designs now owns the same parent lifecycle while its existing delete Confirm exclusively owns nested focus and returns by current design/bulk semantic identity. The remaining custom overlays are unchanged and inventoried in `docs/architecture/cart-overlay-accessibility.md`.
- **Risk:** Keyboard and assistive-technology users can focus invisible controls, lose context, or become trapped; overlay behavior diverges.
- **Improvement:** Migrate overlays to one primitive with semantic title/description, inert background, focus trap/return, Escape policy, responsive sizing, and explicit non-modal exceptions.
- **Expected outcome:** Consistent accessible overlay lifecycle without changing domain actions.
- **Tests:** tab order when closed/open; axe; screen-reader names; Escape; click outside policy; focus return; narrow viewport; nested prompt; command palette shortcuts.
- **Dependencies/decision:** None unless a specific overlay must be non-modal.
- **Compatibility:** Behavior-preserving for actions; keyboard behavior becomes correct and consistent.

### CH-0016 — CI does not validate a strict production-equivalent artifact

- **Severity:** P1.
- **Status:** RESOLVED — REPOSITORY REMEDIATION COMPLETE at `cbed3550026e2803675f740b49be5fb15f15612b`; EXTERNAL EXECUTION/VERIFICATION REQUIRED. No GitHub or Vercel execution is claimed.
- **Locations/symbols:** `.github/workflows/ci.yml`; `lib/catalog-runtime.ts`; `playwright.config.ts`; build and smoke scripts.
- **Pre-remediation evidence:** CI forced `CATALOG_STRICT_VALIDATION=false`, built leniently, then smoke defaulted to `npm run dev` rather than `npm start` against the built output. Existing Vercel source inspection ignored untracked files. A diagnostic artifact trace contained `.env`, `.env.local`, and a private release-evidence file.
- **Risk:** A green workflow can ship a production-only catalog, tracing, server-start, or build-artifact defect.
- **Resolution/current behavior:** Required CI now runs `npm ci --include=dev` from a clean exact commit, the existing generated-runtime drift check, a strict staging-mode `npm run build`, SHA-256 inventory of `.next` and `public`, blocking NFT trace-closure validation, and runtime smoke through a manifest-verifying wrapper around unchanged `npm run start`. Playwright cannot reuse a listener or choose `npm run dev`; its JSON report and `/api/health` response must match the source SHA, artifact SHA-256, and Next build ID. The manifest sidecar, embedded report hash, and current-state revalidation reject tampering or reuse. Local evidence always records `releaseReady=false`, `actualDeploymentVerified=false`, and Vercel/GitHub/OAuth/scheduler/database controls as `not_verified`.
- **Expected outcome:** Required CI proves one local production-mode artifact rather than a second development compilation, while external deployment claims remain separate.
- **Tests/evidence:** `npm run test:production-artifact-evidence` covers clean happy path, tracked/untracked source, SHA/lock/generated/artifact/report/staleness/environment/dev/skip/failure/same-artifact/external-control/secret/trace negatives and strict invalid-catalog validation. Strict staging build passed; rebuilt trace inventory contained 112 trace manifests/42,879 references with zero missing or prohibited paths. Final exact-candidate `evidence:production:build`, smoke, and verify results are recorded in the handoff. Their detached-worktree files are ephemeral local verification output, not durable release evidence; durable retention remains pending an actual GitHub Actions artifact upload.
- **Dependencies/decision:** CI secret/environment inventory. No product decision.
- **Compatibility/limits:** Gate-only; no product/data behavior, dependency, schema, migration, deployment, or external setting changed. Turbopack still warns that one floor-plan import causes broad tracing; the evidence inventories and bounds that closure rather than claiming the warning is fixed. CH-0013, CH-0017, and CH-0018 remain separate.
- **Rollback:** Revert the one CH-0016 implementation commit. This restores lenient/dev release evidence and is not a recommended steady state.

### CH-0017 — Critical tests are omitted or can report false passes

- **Severity:** P1.
- **Status:** TRUTHFULNESS AND REQUIRED EXTERNAL WORKFLOW VERIFIED — IMPLEMENTATION FROZEN. Its gate identities, cadences, truthfulness semantics, source binding, workflow isolation, OAuth transport, artifact safety, and timeout provenance are unchanged by CH-0028 or CH-0029. The discovery fingerprint advanced from 365 to 368 classified sources only because CH-0029 added three risk-triggered focused scripts.
- **Locations/symbols:** `scripts/required-test-manifest.json`; `scripts/required-test-truthfulness.mjs`; `tests/e2e/05-buy.spec.ts`; `07-kelsey-variants.spec.ts`; `scripts/cabinetry-tests/export-behavior.ts`; CH-0016 and cabinetry report validators; `scripts/vercel-prebuilt-release.mjs`; Playwright configurations; CI/package gate wiring.
- **Pre-remediation evidence:** Commerce/variant cases annotated and returned when core fixtures/assertions were absent, which Playwright recorded as expected passes. The cabinetry GLB export test caught a missing `FileReader`, printed a skip message, and exited zero. The floor-plan live-progress test was absent from its required umbrella. Full E2E was non-required and `continue-on-error` without a separate process-bound release evidence contract. Gate A3 consumed only aggregate counts and URL; cabinetry used a minimum test count; CH-0016 did not verify its two stable runtime identities. Security, persistence, Stripe, Phase 14/15, Consumer/Pro, and cabinetry contract suites were not merge-required as one explicit critical group.
- **Risk:** Release summaries overstate validated customer paths and new persistence behavior can merge untested.
- **Resolution/current behavior:** One canonical manifest classifies 248 script tests, 98 browser specs, 14 imported browser modules, and 8 imported cabinetry script-test modules; binds source-inventory and recursively reachable package-command closure hashes, split-suite registrations, stable requirement IDs, commands, projects, cadence, reports, artifact policy, and CI ownership. Required Playwright evidence rejects zero discovery, missing/renamed/excluded specs or registrations, missing projects, filters/shards, `.only`, skips, retries/flakes, annotations, not-run/failed tests, aggregate disagreement, nonzero child status, stale/malformed/tampered reports, source/artifact/URL mismatch, machine-local paths, and secret-bearing fields. The two named commerce/variant specs now fail on missing prerequisites. A deterministic Node `FileReader` shim makes the GLB export assertion execute instead of skip. Live progress is in the required floor-plan chain. Critical domain contracts are merge-blocking. Broad full E2E is explicitly advisory; exact Gate A3 is separately release-blocking and bound to the staged prebuilt artifact. Cabinetry release evidence uses a clean-source process-captured envelope for all 23 stable workflows and binds its report to the top-level candidate artifact. Outcome D established that the furnished-template smoke used HTTP completion plus Playwright's implicit five-second poll as a proxy for client-side GLB decode/normalization readiness. The runtime now exposes its existing `loading`/`ready`/terminal-`error` lifecycle, and the smoke waits on that bounded semantic state with safe diagnostics. Exact-head run `30684560486` then proved semantic readiness but exposed the independent 240-second whole-test envelope defect. The smoke now derives a 660-second envelope from all 14 sequential phase budgets plus named overhead, emits portable phase timings, and retains immediate terminal failure. Imported Playwright modules must each contribute records before attribution to their single runnable aggregator owner. Advisory upload preparation atomically requires the structured envelope/report and truthfully summarizes failing results while omitting unsafe optional diagnostics with reason/SHA-256; malformed or unsafe mandatory evidence still rejects the bundle. One guarded non-production OAuth fixture and JSON session preflight prevent the prior invalid advisory environment. Gitleaks SARIF is atomically restaged at a deterministic root-level layout without weakening the scan.
- **Tests:** Temporary-directory negative suite exercises the real exported validator; CH-0016 and cabinetry suites exercise their real integrations and stable test identities. The two required runtime identities pass locally against a migrated strict production artifact. Portability negatives cover Linux/macOS/Windows/temp paths, nested error contexts, shaped and generic credentials, renamed binary bytes, unsafe cleanup targets, and atomic failure. Exact cases and commands are recorded in `docs/qa/required-test-truthfulness.md` and `HANDOFF.md`.
- **Dependencies/decision:** No product semantics changed. Honest commerce/visual/browser failures may now block their required cadence; resolving such behavior is a separate finding or fixture-owner decision, never a truthfulness waiver.
- **Compatibility:** Gate/test-evidence only; the cabinetry release-evidence contract schema is strengthened, but no dependency, framework, product/database/persisted-data schema, migration, catalog, product behavior, deployment, or external setting changed.
- **Rollback:** Revert the Outcome-D follow-up first, then `b811ddeaad5f3e2d64f647bad5c5fbe59db1615b`, then `c840c06dc2c5e67f463542292bb7391b0f93d731`. This restores timing-dependent smoke, unsafe/raw retention, and false-pass evidence paths and is not an acceptable steady state. No GitHub ruleset change is part of this chain.

### CH-0018 — Migration validation proves fresh install, not safe upgrade

- **Severity:** P1.
- **Locations/symbols:** `scripts/provision-gate-a3-database.mjs`; `prisma/migrations`; `lib/phase15-release-evidence.ts`; release entry criteria.
- **Evidence/current behavior:** Gate A3 deploys a fresh database and counts migrations. It lacks `prisma validate`, schema/database diff, and a populated predecessor upgrade. Migration `20260211150315_add_user_to_design` explicitly fails on nonempty `Design` before a later migration restores nullability. Release evidence accepts any nonblank migration version and docs say 38 while 42 directories exist.
- **Risk:** Historical or future upgrades can fail or lose data despite a green fresh install; evidence can claim an unrelated migration state.
- **Improvement:** Test blank install plus representative populated predecessor upgrade, schema diff, data invariants, ordered migration digest, and dedicated deployment database status.
- **Expected outcome:** Release evidence is cryptographically/logically bound to the migrations and upgrade path actually tested.
- **Tests:** predecessor fixtures with nonempty designs/users/shares/floor-plan jobs; deploy; schema diff; row/invariant preservation; digest mismatch rejected.
- **Dependencies/decision:** Select supported predecessor versions and sanitized fixture ownership.
- **Compatibility:** Gate/evidence only; no migration rewrite without a separate recovery design.

### CH-0019 — The audit baseline is red and masking later assertions

- **Severity:** P1 for release readiness, P2 as code-health debt.
- **Status:** RESOLVED by the cumulative current ancestry. The baseline-restoration records below remain the historical defect description.
- **Locations/symbols:** `CatalogPanel.tsx`; `FloorPlanImportAssistant.tsx`; `scripts/test-command-bar-save-status.ts`; three Hamilton catalog YAMLs; design architecture checker; Phase 8 benchmark; Pro visual policy.
- **Evidence/current behavior:** The historical failures at `62ba966e` were closed by bounded ancestors: hook diagnostics `fe668ab`, save status `6f63c11`, Hamilton vocabulary `9ba876b`, the architecture/contract sequence through `69a7627`, Pro visual policy `101f25d`, and Phase 8A/B `299536f`/`55bc4b6`. At the final audited source, full lint has zero warnings, cleanup is 78/78, code quality and architecture guards pass, Pro visual is 4/4, Phase 8 passes, and the strict build is 57/57. No masked CH-0019 failure remains.
- **Risk:** Refactors cannot distinguish regressions from inherited failures; release confidence is ambiguous.
- **Improvement:** Establish a baseline-restoration phase with one defect per reviewed commit, record stale-test versus implementation decisions explicitly, and run masked checks separately until green.
- **Expected outcome:** Required fast baseline is green before structural work, with any temporary exception owner/expiry documented.
- **Tests:** Exact commands in `05_QUALITY_GATES_PLAN.md`; repeat twice for timing-sensitive performance/visual failures.
- **Dependencies/decision:** Command-bar and Cabinet Preview intended behavior need product confirmation before changing tests or UI.
- **Compatibility:** Characterization first; no test should be weakened to obtain green.

### CH-0020 — High-churn editor, floor-plan, and cabinetry monoliths exceed ownership budgets

- **Severity:** P2.
- **Locations/symbols:** `RoomRenderer2D`; `DesignControlsPlanPanel`; `DesignPageWorkspace`; viewport registration; Cabinetry Studio coordinator/views/validation/generation; floor-plan compiler/raster/evidence modules.
- **Evidence/current behavior:** Multiple component bodies exceed 2,500–4,000 lines; validation exceeds 3,400; the design architecture ratchet is red; floor-plan architecture permits 30 oversize warnings; several units are also top history churn.
- **Risk:** Changes cross concerns, reviews become non-local, effect/state ownership blurs, and merge conflict/regression rates rise.
- **Improvement:** Extract pure domain calculations and stable adapters behind existing public facades; split by responsibility only after characterization; ratchet touched-file budgets downward without mass rewrites.
- **Expected outcome:** Smaller review surfaces and explicit state/render/integration ownership while routes and document formats remain stable.
- **Tests:** Existing characterization and E2E, import-cycle graph, facade/API snapshots, file/function budgets for touched modules, visual golden fixtures.
- **Dependencies/decision:** Sequence after CH-0019; no redesign of Consumer/Pro.
- **Compatibility:** Behavior-preserving, incremental strangler pattern.

### CH-0021 — Pointer-up can persist a stale drag position

- **Severity:** P2.
- **Locations/symbols:** `components/scene/Furniture.tsx` drag move/up handlers and cross-room placement dispatch.
- **Evidence/current behavior:** Pointer move enqueues state, while pointer up reads closure position instead of a ref containing the latest accepted transform. A final rapid move or cross-room placement can be omitted.
- **Risk:** Visible item position and persisted/history position diverge at gesture end.
- **Improvement:** Keep the authoritative accepted transform in a ref owned by the gesture transaction; commit exactly once on pointer-up/cancel and reconcile rejected constraints.
- **Expected outcome:** Final visible, undo/history, room ownership, and persisted positions match.
- **Tests:** rapid final move+up; throttled state; cross-room drag; constraint rejection; pointer cancel/lost capture; undo/redo and reload.
- **Dependencies/decision:** None.
- **Compatibility:** Behavior-preserving bug fix.

### CH-0022 — Performance sampling forces root updates even when disabled

- **Severity:** P2.
- **Locations/symbols:** `ScenePerformanceBridge`; `useScenePerformance`; editor Canvas integration.
- **Evidence/current behavior:** A one-second sampler updates root React state and invokes callbacks before checking whether performance collection is enabled.
- **Risk:** Permanent editor rerenders contaminate the performance being measured and add idle work for every user.
- **Improvement:** Early-return when disabled; store samples in refs/external store; subscribe only visible diagnostics; batch non-urgent updates.
- **Expected outcome:** Zero sampling-driven root renders when disabled and isolated diagnostics overhead when enabled.
- **Tests:** render-count harness; fake timers enabled/disabled; callback count; unmount cleanup; long-idle profile.
- **Dependencies/decision:** None.
- **Compatibility:** Behavior-preserving; telemetry values remain available to subscribers.

### CH-0023 — Request bounds, workflow transitions, and API errors are inconsistent

- **Severity:** P2.
- **Locations/symbols:** `lib/api-boundary.ts`; Stripe webhook; import job transition service; bulk import route; duplicate/floor-plan/Shopify route branches.
- **Evidence/current behavior:** Some size checks call `request.text()` before measuring; webhook lacks an application limit. Import transitions read then update only by ID, while bulk bypasses transition validation. Several routes bypass the structured error contract and can leak non-JSON Prisma failures.
- **Risk:** Memory amplification, stale concurrent transitions, forbidden state moves, and brittle clients/observability.
- **Improvement:** Use bounded streaming readers including raw signed bodies; version/CAS or serializable transition service; one route wrapper with stable codes, operation IDs, and Prisma conflict/retry mappings.
- **Expected outcome:** Bounded resource use, legal state machines under concurrency, and one predictable API error envelope.
- **Tests:** oversized chunked stream cancels before handler; webhook signature with bounds; stale parallel transitions; forbidden bulk move; contract matrix for 400/401/403/404/409/429/500.
- **Dependencies/decision:** Define maximum webhook/import sizes; otherwise no product decision.
- **Compatibility:** Mostly behavior-preserving; explicit bounds may reject formerly unbounded input.

### CH-0024 — Public readiness and catalog parsing amplify operational work

- **Severity:** P2.
- **Locations/symbols:** `app/api/health/route.ts`; public catalog routes; `lib/catalog-yaml.ts:getFreshCatalogYamlEntries`.
- **Evidence/current behavior:** Anonymous `?deep=1` performs DB/queue queries and reveals build/catalog/queue counts. Public health/catalog calls synchronously invalidate and reparse all YAML.
- **Risk:** Cheap public requests amplify filesystem, DB, and queue work and disclose operational state.
- **Improvement:** Keep shallow liveness public; authenticate/cache/rate-limit readiness; generate or cache immutable catalog data by build hash.
- **Expected outcome:** Public probes are constant-cost and operational details stay on protected readiness channels.
- **Tests:** anonymous deep denied; shallow response contract; cache hit/miss/concurrency load; build-hash invalidation; monitoring authentication.
- **Dependencies/decision:** Monitoring integration may require an endpoint migration.
- **Compatibility:** Decision-required only for external monitoring migration.

### CH-0025 — Test discovery, typing, and platform coverage are incomplete

- **Severity:** P2.
- **Locations/symbols:** 240 `scripts/test-*`; `scripts/run-design-page-cleanup-tests.mjs`; `tsconfig.json`; Playwright snapshots; large hooks without direct characterization references.
- **Evidence/current behavior:** Forty-four script tests have no package/runner reference. E2E is excluded from TypeScript compilation. Only three Darwin snapshot baselines exist while CI runs Ubuntu. Product configuration, selector state, and Hugg material logic have no direct nearby/static test reference.
- **Risk:** Valuable tests silently rot or never run; browser test type errors and platform snapshot failures appear late; monolith extraction lacks a safety net.
- **Improvement:** Add a test manifest audit or standard runner, `tsconfig.e2e.json`, explicit platform visual jobs/baselines, and characterization tests around high-risk seams.
- **Expected outcome:** Every test has an owner/cadence, E2E compiles, and visual/platform expectations are intentional.
- **Tests:** meta-test fails unclassified addition; E2E typecheck; Linux/Darwin snapshot selection; mutation/fixture checks for prioritized hooks.
- **Dependencies/decision:** CI platform ownership; no product decision.
- **Compatibility:** Gate-only.

### CH-0026 — Server-only boundaries are implicit

- **Severity:** P2.
- **Locations/symbols:** server-side auth, Prisma, filesystem, configuration, admin and integration modules.
- **Evidence/current behavior:** Current client/server scan found no confirmed forbidden import, but no `server-only` guard is used. Safety depends on convention and current graph shape.
- **Risk:** A future refactor can pull credentials, Node dependencies, or oversized server code into a client graph before review catches it.
- **Improvement:** Mark server entry modules, create browser-safe DTO/adapters, and add a resolved client-import boundary check.
- **Expected outcome:** Accidental server-to-client imports fail immediately in build/test.
- **Tests:** negative fixture imports Prisma/auth/fs/non-public env from a client module; allowed shared pure module remains valid.
- **Dependencies/decision:** None.
- **Compatibility:** Behavior-preserving architecture guard.

### CH-0027 — Operational documentation and tracked local output have drifted

- **Severity:** P3.
- **Locations/symbols:** root README; `catalog/README.md`; older phase/deployment docs; product release criteria; tracked `prisma/dev.db` and `test-results/.last-run.json`; missing formatter setup.
- **Evidence/current behavior:** README advertises four package managers despite canonical npm; catalog docs name nonexistent commands; older docs contain stale absolute paths, obsolete CI/source-of-truth claims, and a destructive Prisma reset instruction; migration count says 38 instead of 42; ignored/local artifacts remain tracked; no format command exists.
- **Risk:** Engineers follow unsafe/stale procedures, waste time on nonexistent commands, and reviews accumulate avoidable formatting noise.
- **Improvement:** Label historical docs, reconcile canonical runbooks, generate command/migration references where practical, untrack local outputs in a reviewed commit, and adopt a formatter only as an isolated low-churn decision.
- **Expected outcome:** One trustworthy operational entry point and deterministic hygiene without mixed functional changes.
- **Tests:** documentation link/command audit; migration-count/digest check; clean-clone status; formatter check only after a dedicated no-behavior baseline.
- **Dependencies/decision:** Formatter choice is a team decision; documentation corrections are not.
- **Compatibility:** Behavior-preserving; keep formatting churn out of refactor batches.

### CH-0028 — First-reload model readiness convergence

- **Severity:** P1 release/runtime reliability.
- **Status:** EXTERNALLY VERIFIED — RESOLVED at verified source `db346a51718967bd4dc1605b07c0850e02fd08d1`. The historical local-validation detail below predates and is superseded by that external status.
- **Authoritative evidence:** Source `8e0260f5654126ec21b669d0471bcfb3c0f5cf5b`, run `30745386331`: furnished-template failed, health/catalog passed, retries 0, exit 1. Reload 1 failed at 76,043/308,000 ms because `model-responses-and-readiness` expired at 70,001/70,000 ms with all responses complete, zero outstanding, and three current required fixture records still loading. CH-0017 reported the runtime failure truthfully and remains frozen.
- **Verified classification:** **F — genuine performance condition.** The external artifact retained aggregate loading state after all responses, not an exact post-response stage trace. Controlled same-path exact-identity/stage tracing showed current-generation active entries, no stale or optional blockers, no ignored current completion, and normal parse/normalization/bounds/attachment progression. The canonical component repeated GLB parse/decode, geometry/material normalization, and bounds work during the forced in-document remount. The external nine-versus-six response count confirms that extra generation; combined with the controlled trace and external timing, this supports the performance classification.
- **Resolution/current behavior:** One 32-entry ref-counted parsed cache and one 32-entry ref-counted prepared cache share equivalent resources across an in-document remount. Failed loads evict, inactive least-recently-used entries prune, disposal is per entry, prepared resources retain their parsed-source lease, terminal page hide clears prepared before parsed resources, and BFCache preservation retains both. Cache and network consumers emit equivalent lifecycle stages. The one existing safe diagnostic registry now binds scene/product/variant/readiness key, URL/hash, mount instance, reload generation, required/active state, stages, cancellation, transition time, and closed terminal category; inactive diagnostic tombstones are bounded at 128. Exact required identities and stable registry size—not aggregate counts alone—gate the smoke.
- **Compatibility and limits:** True page reloads still create new document generations and real responses. The 70,000 ms nested operation, 308,000 ms reload parent, three reloads, zero retries/skips, response checks, selection, bounds, persistence, remount, render-loop, and final-state assertions are unchanged. No schema, migration, dependency, catalog, product data, user content, URL-forced readiness, timeout increase, Full E2E, or external mutation is included.
- **Validation:** Deterministic lifecycle and cache contracts cover network/cache readiness, unmount cancellation, supersession/stale callback rejection, duplicate URLs, optional scoping, post-response pending stage, terminal parse/normalization/bounds categories, bounded ownership/disposal, and three generation resets without registry growth. GLB bounds, design persistence, production-evidence, required-test truthfulness, typecheck, zero-warning targeted lint, code-quality, strict production build, and diff hygiene pass. Three separate 42-migration PostgreSQL runs passed furnished-template and health/catalog 2/2, exit 0:

| Run | Semantic | Bounds | Remount | Reload 1 | Reload 2 | Reload 3 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 7,159/80,000 | 6,823/103,000 | 10,572/165,000 | 19,917/308,000 | 21,581/308,000 | 22,064/308,000 |
| 2 | 7,309/80,000 | 6,894/103,000 | 10,864/165,000 | 22,939/308,000 | 21,064/308,000 | 21,311/308,000 |
| 3 | 6,815/80,000 | 6,861/103,000 | 11,294/165,000 | 21,414/308,000 | 21,210/308,000 | 20,404/308,000 |

- **Rollback:** Revert the one CH-0028 commit. This disables resource reuse and exact lifecycle diagnostics together; no data rollback exists. Detailed ownership and safe diagnostic rules are in `docs/architecture/glb-model-lifecycle.md`.

### CH-0029 — Post-response browser/main-thread starvation

- **Severity/status:** P2 performance; **OPEN — POST-RESPONSE BROWSER/MAIN-THREAD STARVATION**. Local remediation is complete on the separate CH-0029 branch, but closure requires exact-commit required-only external verification.
- **Authoritative evidence:** Run `30787561725` completed 6/6 responses with zero outstanding and coherent current-generation lifecycle/cache ownership, but all eight required models remained loading while browser work was starved. Its largest completed heartbeat gap was 11,747 ms; its largest admitted callback delay was 5,281 ms; and the final requested callback never entered. Body computation, callback execution, and serialization were at most 0/3/0 ms.
- **Measured classification:** **C/G — React/R3F render work plus host/test contention**. The hidden loading Canvas ran the complete mounted per-frame subscriber workload plus renderer/GPU submission while trace/video work competed on the constrained host. A matched pre-fix run recorded a 10,736 ms `unattributed` long task; `r3f-render` was only 387.9 ms total and 148.1 ms maximum, so the long task is not attributed directly to the renderer. Parse, cache, clone, normalization, materials, bounds, scene attachment, disposal, lifecycle, and store timings did not own the interval.
- **Correction:** Use demand rendering only while the loading veil hides the Canvas, then restore continuous `always` rendering for visible interaction. Disable trace/video only in the stable runtime-smoke spec. Add bounded, production-gated, metadata-only fixed-category telemetry with detached snapshots and safe maximum-task context. No timeout, retry, readiness, cache/refcount, lifecycle ordering, cancellation, supersession, terminal path, clone isolation, BFCache, workflow, or product interaction contract changes.
- **Validation and limits:** Three fresh production smokes passed 2/2 and all nine reloads in 10,192–11,354 ms with cumulative responses 6/9/12, 8 ready / 0 loading / 0 error, current generations, and coherent 8/13 parsed plus 12/7 prepared cache/refcount totals. Maxima were 6,858 ms heartbeat and 6,406 ms admitted callback, with every callback entering. Under two ~98% CPU workers, reloads were 12,725/11,859/12,048 ms; maximum heartbeat was 8,102 ms and admitted callback 7,168 ms, again with all invariants. The heartbeat reduction and elimination of no-entry are material; the admitted maximum is not numerically below the external 5,281 ms maximum, and the longest JavaScript task remains unattributed.
- **Rollback:** Revert the one CH-0029 commit. This restores continuous hidden-Canvas frames and stable-smoke trace/video retention. No database, schema, cache-policy, timeout, external-control, PR, or deployment rollback exists.

## Positive controls worth preserving

- Strict TypeScript production source showed no explicit `any` or suppression directives in targeted scans.
- No resolved runtime dependency cycle was found.
- The canonical document, floor-plan, cabinetry, persistence, and security suites contain substantial domain-specific characterization.
- Core design/floor-plan ownership checks, Stripe signature/idempotency handling, and Shopify variant identity validation were generally strong in the inspected routes.
- Floor-plan processing already includes durable limiting/outbox/recovery patterns that can serve as models for broader services.

These strengths argue for incremental extraction behind existing contracts, not a rewrite.

## RC47-RC55 archival disposition — 2026-08-05

Exact candidate `7016da0ad74c7d463a07ec061259b50d757031e0` was audited read-only
against the retained RC47-RC55 chain. All nine references were recovered, but
none is an ancestor or patch-equivalent of the candidate. Each disposition is
**G — STILL_REQUIRED**, consolidated into eight stable findings:

- P1 `ARCH-RC49-50-CLOUD-BASELINE`: loaded and recovery-copy state lacks a
  normalized, render-acknowledged autosave baseline.
- P1 `ARCH-RC53-CLOUD-REVISION`: serialized writes can execute with a revision
  captured before the preceding write committed.
- P2 `ARCH-RC48-KEYBOARD`: furniture rotation remains split across per-item and
  central keyboard owners with conflicting Shift+R semantics.
- P2 `ARCH-RC51-COMPARE`: compared products resolve through the filtered map and
  disappear after category/filter changes.
- P2 `ARCH-RC52-DRAWER-FOCUS`: catalog hydration can unmount the drawer opener
  before focus restoration.
- P3 `ARCH-RC47-ASSERTIONS`: two product specs still query the drawer's obsolete
  `complementary` role.
- P3 `ARCH-RC53-55-SHARE-RESPONSIVE`: share rooms lack distinct mobile/table
  projections and stable layout readiness coverage.
- P3 `ARCH-RC54-PROJECTION-ASSERTION`: beta smoke compares owner-visible and
  public-projection fingerprints rather than like-for-like public projections.

The integration result is **B. ARCHIVAL DISPOSITION COMPLETE — ADDITIONAL
BOUNDED REMEDIATION REQUIRED**. No integration branch should be created yet.
The exact commit inventory, semantic evidence, validation results, and
independent review are in `docs/code-health/07_RC47_RC55_ARCHIVAL_DISPOSITION.md`.

## ARCH-RC49-50 cloud-baseline remediation — 2026-08-05

The P1 cloud-baseline finding above is locally remediated on
`fix/arch-rc49-50-cloud-baseline`, branched from exact clean
`e06795dc92874afb383f61b28ba380930c1c7252`. The archival RC49/RC50 commits were
not replayed. Their retained intent was adapted to the current requested-design
coordinator, versioned document migration, floor-plan hydration, product/zone
normalization, document epoch, server compare-and-swap, and conflict surfaces.

Before the change, `useDesignPagePersistence` fingerprinted the deserialized
transport snapshot before the editor's canonical persistence projection and
installed that value immediately. Autosave had no identity-bound pending
acknowledgment, so initialization, hydration, or a stale response could become a
dirty baseline or enable a write. The remediation establishes one canonical
projection for both the loaded baseline and current saved state, then retains a
typed `designId` + revision + epoch pending identity until a post-commit render
matches it exactly. Loading, normalization failure, supersession, project
switching, and recovery-copy creation cannot unblock a different identity.

Focused deterministic tests cover defaults/order equivalence, raw versus
canonical input, transient empty state, exact and mismatched acknowledgment,
real edits, superseded loads, duplicates, migration failure, save/reload, and
local-only behavior. A disposable local PostgreSQL database applied all 42
migrations; three focused Chromium paths proved clean existing-design load,
post-acknowledgment edit/write/reload, cross-design switching, and duplicate
identity. The database contained zero design rows after cleanup and was deleted.
The critical-required suite, truthfulness, production-artifact evidence, full
zero-warning lint, typecheck, code quality, strict 57-page build, and Phase 8
performance/bundle checks pass. Full E2E was not run.

`ARCH-RC53-CLOUD-REVISION` and all RC47/48/51/52/53/54/55 P2/P3 findings remain
separate. This batch changes no workflow, dependency, lockfile, schema,
migration, server CAS, deployment, push, or RC53 execution-time revision
ownership.

## Final RC47-RC55 archival-disposition confirmation — 2026-08-05

Exact source `83425bad3cc30dc37100d090e79159998782bc29` was independently and
locally reviewed against all nine original archival commits. Final outcome:
**B. RC47–RC55 DISPOSITION COMPLETE — ADDITIONAL BOUNDED REMEDIATION REQUIRED**.
The final per-RC mapping is RC47 **A**, RC48 **F**, RC49 **B**, RC50 **B**, RC51
**B**, RC52 **B**, RC53 **F**, RC54 **B**, and RC55 **F**, using the category
names in `07_RC47_RC55_ARCHIVAL_DISPOSITION.md`.

The current implementation closes or strongly supersedes the RC47 assertions,
RC49/50 canonical baseline protocol, RC51 compare lookup, RC52 semantic focus
restoration, RC53 execution-time cloud revision protocol, and RC54 public
projection/security contract. Four bounded gaps remain:

- **P2 — RC48:** capture-phase selected-item `R` handling can pre-empt the
  floor-plan tracing `R` shortcut when tracing and a selected item coexist.
- **P2 — RC53 responsive:** visible title/style/budget/notes are still rendered
  from raw outer design-row values while identity/readiness derives from the
  projected snapshot.
- **P3 — RC55 readiness:** the exact readiness key includes an eight-hex
  projection fingerprint, so a projection-fingerprint collision is not covered
  by the secondary layout-hash collision test.
- **P3 — RC55 gate ownership:** the responsive unit/matrix and focused WebKit
  evidence are not all merge-required Gate A3 coverage.

The focused rotation/Consumer batch also has one retained P2 failure: the Undo
button measured 30 px high against the 44 px touch-target contract. No P0 was
found. The pre-existing code-health queue remains **0 unresolved P0 and 13
unresolved P1**; this confirmation adds no new P0/P1 item. CH-0004 was not
started. CH-0030 commit `d7a50698707153b43df0a982766288060c24b997`
remains excluded: its remote branch exists, but no PR, check, or workflow-run
evidence was found. Integration planning remains blocked on the bounded
archival corrections and subsequent exact-artifact certification.
