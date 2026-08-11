# CH-0015 accessibility lifecycle and overlay inventory

## CH-0015H Command Palette modal lifecycle — 2026-08-11

Status: **CH-0015H LOCALLY REMEDIATED; CH-0015 REMAINS OPEN FOR FLOOR PLAN
UPLOAD ONLY**.

This bounded batch starts from exact integration source
`5ab9db530d4e4fcc8d1f8f678994e09ab7bb3e67` / tree
`f646076854c0c76b69c80c9cada996e58d01b1b0` on
`fix/ch-0015-command-palette-accessibility`. Cmd/Ctrl+K is classified as one
editor-scope **MODAL_DIALOG** shortcut. It opens only outside editable targets,
outside Client Preview, and when no registered or external modal is active;
otherwise the qualifying shortcut is consumed and ignored.

The former Palette lacked `aria-modal`, registry/topmost ownership, complete
Tab containment, action-focused Escape, inert/accessibility-hidden background,
semantic return, and scope generations. It could open above another modal,
ran a command before closing, and could reappear with a stale query after
Preview. The remediated Palette composes `EditorDialog`, preserves its original
30% backdrop and 560px edge-to-edge panel, and owns one named modal, input
focus, Tab/Shift+Tab, topmost Escape/backdrop, and background isolation. The
shared registry now assigns increasing direct-root visual layers in
registration order and restores each root's prior inline layer on close. The
Palette also withdraws visually while superseded, then restores its prior
visibility, so a newer dialog inside the Cart/Retailer `z-20` stacking context
cannot be covered by the Palette's higher sibling context.

One typed session binds generation, query, semantic opener, action consumption,
cancellation, and pathname/requested+current design/workspace/brief/editor
mode/plan/audience/Preview scope. Ordinary close resolves the current semantic
editor action, then More, then Workspace. Action execution re-resolves a
currently filtered/enabled ID, consumes and clears once, synchronously commits
Palette removal, then invokes unchanged behavior; a current or future
action-created registered dialog therefore owns focus and the visible surface.
Current production inventory contains no direct dialog-opening command, so the
generic executor contract and real newer-dialog registry case jointly lock
that ordering.

Existing merge-required `ci.pro-visual-policy` remains the sole browser owner.
Five stable identities execute in Chromium and WebKit for Consumer/Pro,
desktop/390x844, Meta/Control, semantic return, modal blocking including Plans,
registry supersession, requested/current design and mode/Preview/unmount scope,
filtering/disabled/first-enabled Enter, pointer exact-once history, and overflow.
The required inventory remains **26 gates / 376 classified sources**. Command
IDs, labels, hints, order, predicates, matching, behavior, history, and
Consumer/Pro capability policy are unchanged.

Floor Plan Upload is the final required CH-0015 batch. Public legacy Upgrade
and selected-item preview remain separate P2 work. Rollback is one focused
commit revert followed by the Palette/Pro owner, directly affected shared
dialog owners, truthfulness, Phase 8, and strict build; no data, schema,
dependency, deployment, integration, or external-setting rollback is needed.

## CH-0015G Retailer Confirmation modal lifecycle — 2026-08-11

Status: **CH-0015G LOCALLY REMEDIATED; CH-0015 REMAINS OPEN FOR TWO
REQUIRED OVERLAY BATCHES**.

This bounded batch starts from exact integration source
`d76994a778db99cb57834ef6bb62db5e8705a478` / tree
`ba00cb930778c84a4879d70274182868eb9c428f` on
`fix/ch-0015-retailer-confirmation-accessibility`. Retailer Confirmation is a
**MODAL_DIALOG** for exactly the global and per-retailer actions when the
existing count is four or more tabs. Row Open and the zero/one/three-tab direct
paths remain non-modal.

The former custom overlay had no role, name, modal state, focus entry/trap,
Escape/backdrop/close owner, background isolation, or semantic return. Focus
stayed on the obscured opener, Tab reached the Cart background, Cancel returned
to `body`, and the overlay was clipped by CartSidebar's scrolling aside. The
new local dialog directly composes `EditorDialog` as a sibling of the aside:
one named modal owns visible close focus, containment, topmost dismissal, full-
viewport isolation, and global/group semantic return with Cart fallback.

A typed generation/session captures cloned lines, exact tab count, same-tab
preference, opener identity, and design/cart scope. Continue consumes before
opening, exactly once. Cancel, generic dismissal, scope change, route/unmount,
reopen supersession, and newer-dialog ownership retire stale work. Counting,
duplicate and unavailable behavior, bundle-one-link behavior, direct row
opening, tracking payload/fail-open, clickKey/UTM decoration, 350ms pacing,
same-tab first navigation, Guest/Consumer/Pro policy, and Shopify ownership are
unchanged. The complete contract is in
`docs/architecture/retailer-confirmation-lifecycle.md`.

New `ci.retailer-confirmation-accessibility` owns 12 stable cases in Chromium
and WebKit: **24/24**, one worker, zero retries/skips/filters/shards/timeout
increase. Focused desktop and 390×844 screenshots confirm a full-viewport
backdrop, contained actions, 16px panel gutters, visible focus ring, and no
horizontal overflow. The manifest advances to **26 gates / 376 classified
sources** and design cleanup to 81 guards.

Against CH-0015F, `/design` remains 25 initial JavaScript chunks and one CSS
chunk. JavaScript moves 5,834,673 / 1,114,584 raw/Brotli to 5,838,554 /
1,115,313 (`+3,881 / +729`); CSS remains 131,910 / 17,506. Cabinetry Studio and
GLTFExporter remain 492,639 / 84,899 and 34,525 / 8,970. All Phase 8 byte
boundaries pass and Retailer Confirmation adds no lazy chunk.

The two remaining required CH-0015 batches are **Command Palette and Floor
Plan Upload**. Public legacy Upgrade and selected-item preview remain separate
P2 work. Rollback is one focused revert followed by Retailer/Cart/Guest and
commerce guards, truthfulness, Phase 8, and strict build; no data, schema,
dependency, policy, deployment, integration, or external-service rollback is
required.

## CH-0015F Guest Save Prompt modal lifecycle — 2026-08-10

Status: **CH-0015F LOCALLY REMEDIATED; CH-0015 REMAINS OPEN FOR THREE
REQUIRED OVERLAY BATCHES**.

This bounded batch starts from exact integration source
`d649708ba31eb9d8ede183dea6d6268c9dd1aca3` / tree
`a34e6a5831c0e7b40649895a7cc3e3f18b07fec4` on
`fix/ch-0015-guest-save-prompt-accessibility`. It classifies the prompt as a
**MODAL_DIALOG** across exactly `save`, `ai-layout`, and `checkout`; the full
entry, continuation, scope, focus, domain-preservation, performance, and
rollback contract is recorded in
`docs/architecture/guest-save-prompt-lifecycle.md`.

Before remediation, the reason was an arbitrary persistence string reduced to
a Boolean at render time, the callback was an unscoped raw ref, and focus
remained on the obscured Save, Generate layout, or Checkout here action. The
custom overlay had no role/name/modal semantics, registry/topmost owner,
containment, Escape/backdrop/close distinction, background isolation, or
semantic return. `Not now` alone ran the callback, but generic close paths did
not exist and stale or duplicate callback ownership was not bounded.

The final prompt composes `EditorDialog`: closed DOM is absent; open state has
one named modal, visible close initial focus, deterministic Tab/Shift+Tab,
topmost Escape/backdrop, and inert/`aria-hidden` editor/cart/command/AI
background. `Not now` consumes and runs the current generation exactly once;
Escape, backdrop, and close cancel with zero continuation. Save and continue
preserves guest claim then sign-in behavior without running the stored
callback. Route, requested/actual design, workspace/project, mode, preview,
plan/auth, unmount, reopen, and registered-dialog supersession retire stale
work.

Reason-specific return resolves Save then More, AI then Workspace, or checkout
then Workspace, rejecting missing, hidden, inert, disabled, disconnected,
obscured, or superseded candidates. The same semantic ID survives responsive
remount. Stable action IDs also cover close, explicit continuation, and
primary action.

New sole owner `ci.guest-save-overlay-accessibility` runs eight stable cases
once in Chromium and WebKit against the strict production artifact: **16/16**,
one worker, zero retries/skips/flakes/filters/shards or timeout increase. It
covers all three pointer/keyboard entries, cancellation versus continuation,
exact-once and duplicate guards, responsive replacement/removal/fallback,
scope/auth/unmount cancellation, newer-dialog ownership, Consumer guest and
authenticated Pro parity, desktop/390x844 geometry, focus ring, background
isolation, and zero overflow. AI and checkout boundaries are synthetic; no
paid model or merchant is contacted. The manifest is **25 gates / 376
classified sources**.

Against CH-0015E, `/design` remains 25 initial JavaScript chunks and one CSS
chunk. JavaScript moves 5,830,782 / 1,113,525 raw/Brotli to 5,834,673 /
1,114,584 (`+3,891 / +1,059`); CSS moves 131,607 / 17,493 to 131,910 /
17,506 (`+303 / +13`). Cabinetry Studio and GLTFExporter remain 492,639 /
84,899 and 34,525 / 8,970. All Phase 8 byte boundaries pass and no new lazy
chunk is introduced.

The three remaining required CH-0015 batches are **Command Palette, Floor Plan
Upload, and retailer confirmation**. Public legacy Upgrade and selected-item
preview remain separate P2 work. Rollback is one local revert of CH-0015F,
then the focused static/browser owners, Save/AI/checkout guards, Phase 8, and
strict build; no data, schema, dependency, policy, deployment, integration, or
external-service rollback is required.

## CH-0015E Share Link Fallback nested modal lifecycle — 2026-08-10

Status: **CH-0015E LOCALLY REMEDIATED; CH-0015 REMAINS OPEN FOR FOUR
REQUIRED OVERLAY BATCHES**.

This bounded batch starts from exact integration source
`d16109b95cc57774bf384b580f4bf669026bdf59` / tree
`4dd30065236e651f552944c5077cef1be62c1a1f` on
`fix/ch-0015-share-link-fallback-accessibility`. Share Link Fallback is a
**MODAL_DIALOG — NESTED CHILD OF PRESENT/EXPORT**. The parent remains mounted;
share authorization, token creation, URL construction, public projection,
analytics meaning, clipboard product behavior, and every unrelated overlay
remain unchanged.

### Clipboard-failure reachability and reproduced ownership defect

Create Share still requires a saved design and retains its busy guard. A
successful `designApi.share(designId)` stores the returned token and enabled
state, then constructs the existing same-origin `/share/{token}` URL. A
successful clipboard write retains the existing success toast and analytics.
When `navigator.clipboard` is missing, permission is denied, or `writeText`
rejects, the same successful URL reaches the fallback and the existing
fallback analytics path.

Before remediation, deterministic route/API mocking reproduced the defect in
Chromium and WebKit. Present/Export remained the only registered, named modal;
the visually topmost fallback had no role, name, `aria-modal`, registry entry,
focus trap, Escape owner, or backdrop dismissal. The parent was neither inert
nor `aria-hidden`. Chromium focus moved outside both overlays and WebKit focus
remained in the parent; Tab and Shift+Tab entered parent controls. Escape
closed Present/Export beneath the visible fallback and restored the underlying
editor action, while fallback backdrop activation did nothing. The result was
two visible layers but one incorrect keyboard/accessibility owner.

### Final nested contract and semantic focus hierarchy

The fallback now composes `EditorDialog`. Closed state has no dialog or
actionable DOM. Open state has exactly one `role="dialog"`, the accessible name
`Share Link`, `aria-modal=true`, visible close-button initial focus,
deterministic Tab/Shift+Tab containment, topmost Escape/backdrop ownership, and
managed background isolation. Present/Export stays mounted and registered but
becomes inert and `aria-hidden`; its close and Back actions are guarded, its
trap cannot reclaim focus, and it cannot dismiss or restore while the child is
visible. Closing only the child exposes the same parent instance, returns to
the current connected Create Share semantic action, and resumes parent
topmost ownership.

Stable identities cover the parent Create Share and close actions plus the
child close, Copy, and Open actions. Return resolution prefers the current
`present-export-create-share-action`, then the one documented parent fallback
`present-export-close-action`. The shared resolver rejects missing, hidden,
inert, disabled, disconnected, obscured, or superseded targets and confines
nested restoration to the resumed parent registry root. Design/project change
binds fallback state to the creating design and retires it synchronously; mode
change creates a new lifecycle generation; parent/route unmount and a newer
registered modal cancel stale restoration. Reopen and repeated failures create
fresh generations without a second focus trap, Escape listener, registry,
timer, raw-node authority, or duplicate dialog tree.

Copy still writes the displayed URL and leaves the fallback open with the
existing success toast. Open still invokes the existing window-open path and
closes only the fallback. API request counts remain one per explicit Create
Share activation in the focused matrix; the share and analytics call sites are
unchanged apart from binding fallback UI state to its design identity.

### Required owner, responsive evidence, bundle, residual inventory, rollback

Existing merge-required `ci.pro-visual-policy` remains the sole browser owner.
It adds three stable identities and now runs 13 tests per required engine:
**Chromium 13/13 + WebKit 13/13**, one worker, zero retries, skips, flakes,
filters, shards, or timeout increases. The matrix covers Consumer pointer and
Pro keyboard entry, all three clipboard-failure forms, wide and 390×844
layouts, initial/Tab/Shift+Tab focus, parent concealment and guards,
Escape/close/backdrop, current semantic return, Copy/Open, repeated failures,
third-dialog supersession, project/mode scope changes, and route unmount.
Focused screenshots show the child above a concealed parent, contained actions
and focus rings, and no horizontal overflow. The required manifest remains
**24 gates / 376 classified sources**.

Against CH-0015D, `/design` remains 25 initial JavaScript chunks and one CSS
chunk. Initial JavaScript moves from 5,829,340 raw / 1,113,320 Brotli bytes to
5,830,782 / 1,113,525 (**+1,442 / +205**); CSS moves from 131,611 / 17,495 to
131,607 / 17,493 (**-4 / -2**). Present/Export and its fallback remain in the
initial graph, so no dedicated lazy chunk exists. Cabinetry Studio and
GLTFExporter remain 492,639 / 84,899 and 34,525 / 8,970. Every Phase 8 budget
passes.

The four remaining required CH-0015 batches are **Guest Save, Command Palette,
Floor Plan Upload, and retailer confirmation**. Public `/share/[token]/export`
legacy Upgrade is explicitly **P2 post-candidate**, not part of that required
count. The selected-item preview transition remains separate P2 work.

Rollback is one local revert of the focused CH-0015E commit, followed by the
Share Fallback static guard, Pro visual owner, editor accessibility, Phase 8,
and strict build. No data/schema migration, dependency, share token, public
authorization, deployment, integration-branch, or external-control rollback
is required.

## CH-0015D My Designs parent and nested delete lifecycle — 2026-08-09

Status: **CH-0015D LOCALLY REMEDIATED; CH-0015 REMAINS OPEN FOR SIX
REQUIRED OVERLAY BATCHES**.

This bounded batch starts from exact integration source
`00628978e1eeb38d89370f84e537fc971de538e4` / tree
`ef0c3bc8ac72276eaade6d3ea19f6710c8ffca7a` on
`fix/ch-0015-my-designs-dialog-accessibility`. My Designs is classified as a
**MODAL_DIALOG**. Its existing shared single/bulk `ConfirmDialog` is part of
the parent lifecycle, not a separate overlay migration. Cloud/local identity,
list ordering and selection, requested-design routing and supersession,
single/bulk/current-design deletion, authorization, API/database contracts,
autosave/baseline handling, and every unrelated overlay are unchanged.

### Reproduced parent and nested-child defect

The old parent was a fixed custom overlay with no dialog role/name,
`aria-modal`, registry membership, intentional focus, containment, Escape
owner, or semantic return. Pointer and keyboard entry unmounted the transient
`My designs` menu item and left focus on `body`; Tab/Shift+Tab reached Account
and More, Escape did nothing, and backdrop close returned to `body`.

The shared Confirm child correctly registered as topmost, but the unregistered
parent stayed accessibility-active and focusable behind it. Programmatic focus
could move from Confirm to a parent delete action. Cancel happened to recover
the raw surviving opener, while success/failure and removal of the active row
had no documented deterministic parent target. This was a parent ownership and
caller return-identity defect; the shared Confirm lifecycle itself was not
redesigned.

### Final parent/child ownership and focus hierarchy

Closed My Designs has no dialog DOM or actionable descendant. The lazy module
is still requested only on first open; after first use its component remains
mounted across ordinary close so the shared lifecycle can complete semantic
return, while route unmount cancels the generation. Open My Designs uses
`EditorDialog` with the accessible name `My Designs`, `aria-modal=true`,
visible close-button initial focus, deterministic Tab/Shift+Tab, topmost
Escape/backdrop ownership, and inert/`aria-hidden` editor background. Direct
return first resolves the current transient command action when connected,
then the persistent visible `editor-command-more-action` fallback.

Design action identities are derived only from canonical design ID plus
`open` or `delete`. Confirm receives an optional ordered semantic return list,
which is the only shared-Confirm change and preserves every existing default
caller. Single delete resolves current delete action, then current row-open
actions in list order, then the visible parent close. Selected/all delete
resolves its current bulk origin first, then current row-open actions, then
close. The shared actionable check rejects hidden, inert, disabled,
disconnected, deleted, or obscured candidates, so success skips removed rows,
failure returns to the surviving delete action, a surviving list focuses the
first current row, and an empty list focuses close.

While Confirm is open it is the sole topmost owner. The mounted parent becomes
inert and accessibility-hidden and cannot own Tab, Escape, backdrop, or focus.
Busy confirmation disables both stable actions and the existing mutation guard
prevents duplicate requests. A newer registered dialog suppresses stale child
return; after that dialog closes, Confirm resumes ownership. Cancel/confirm
closes only Confirm. Parent close, route replacement, unmount, and reopen use
the shared topmost/generation rules.

### Required owner, bundle, residual inventory, and rollback

New merge-required `ci.my-designs-overlay-accessibility` is the sole canonical
browser owner. Its static prerequisite remains registered under
`ci.design-cleanup` and proves closed/loading/empty/populated, semantic-ID
ordering, unchanged delete guards, and the lazy import. Eight
stable tests execute once in Chromium and WebKit against a strict production
artifact and isolated migrated PostgreSQL database: **16/16**, zero retries,
skips, flakes, filters, shards, or timeout changes. The manifest is derived as
**24 gates / 376 classified sources**; the three focused gate sources are
explicitly owned outside advisory Full E2E and release Gate A3 discovery.

Against the exact base, `/design` remains 25 initial JavaScript chunks and one
CSS chunk. JavaScript moves from 5,828,568 raw / 1,112,834 Brotli to 5,829,340
/ 1,113,320 (**+772 / +486**); CSS moves from 131,484 / 17,470 to 131,611 /
17,495 (**+127 / +25**). The My Designs lazy chunk changes from
`0185bv3nfz_v-.js` at 7,577 / 1,974 to `1ohqb2843ow--.js` at 7,884 / 2,220
(**+307 / +246**). Cabinetry Studio and GLTFExporter remain unchanged at
492,639 / 84,899 and 34,525 / 8,970. Every Phase 8 budget passes.

The six remaining required batches are **Guest Save, Command Palette, Floor
Plan Upload, retailer confirmation, Share Link Fallback, and public legacy
Upgrade**. The last two remain required, not P2-deferred. The selected-item
preview transition remains separate P2 post-candidate work.

Rollback is one local revert of the focused CH-0015D commit, followed by the
My Designs static/required gates, persistence/routing guards, Phase 8, and the
strict build. No data, schema, migration, dependency, deployment, integration
branch, or external-control rollback is required.

## CH-0015C Plans dialog lifecycle — 2026-08-09

Status: **CH-0015C LOCALLY REMEDIATED; CH-0015 REMAINS OPEN FOR SEVEN
REQUIRED OVERLAY BATCHES**.

This bounded batch starts from exact integration source
`683a91c12e3ac5b690375925ad93f84bec2c443f` / tree
`9a06040b0a803156ae5402e1bc3da79ca70ab82f` on
`fix/ch-0015-plans-dialog-accessibility`. Plans is classified as a
**MODAL_DIALOG**. The batch owns the Account → Plans and shared Upgrade →
Plans paths, their semantic opener wiring, the shared lifecycle support needed
for nested ownership, focused required coverage, and these records. Pricing,
plan eligibility, capability derivation, checkout/portal routing, Stripe IDs,
subscription state, entitlements, analytics, and every other overlay remain
unchanged.

### Reproduced direct and nested defects

Before remediation, `PlansDialog` was an unregistered fixed overlay with a
420px panel, no dialog role/name/modal state, no initial focus, no trap, no
Escape owner, and no focus return. Account first focused the transient `View
Pro plans` menu item, then synchronously unmounted that item while opening
Plans. Plans left focus on `body`; Tab and Shift+Tab escaped into the editor,
Escape did not close Plans, and close/backdrop returned to `body`.

Upgrade already used `EditorDialog`. Its `See plans` action opened Plans
without closing Upgrade, which is the intended product flow. The old Plans
overlay mounted visually later but never joined the registry, so Upgrade
remained the only role=`dialog`, `aria-modal=true` owner and kept its focus
trap/keyboard listeners. Focus stayed on the obscured Upgrade action; Tab could
enter obscured Upgrade controls, and Escape closed Upgrade beneath the still
visible Plans overlay. Closing Plans returned to `body`, and later closing
Upgrade also returned to `body`.

### Final modal and semantic-return contract

Closed Plans has no DOM, accessibility, focus, pointer, or registry owner. The
mounted `EditorDialog` lifecycle remains alive across an ordinary close so its
pending return is not mistaken for route unmount. Open Plans has exactly one
`role="dialog"`, the accessible name `Plans`, `aria-modal="true"`, intentional
close-button focus, one deterministic Tab/Shift+Tab owner, topmost Escape and
backdrop ownership, and background inert/`aria-hidden` management. Tab movement
is explicit rather than delegated to browser/OS full-keyboard-access settings.

Direct entry resolves `editor-command-account-action`, which identifies the
current visible Account command rather than the transient menu item. If that
semantic owner is removed, the one documented visible fallback is the existing
`editor-command-more-action`. Nested entry resolves
`upgrade-see-plans-action`. While Plans is topmost, Upgrade stays mounted but
is inert and accessibility-hidden and cannot own focus or keyboard events.
Closing Plans closes only Plans, returns to the current connected Upgrade
action, and restores Upgrade as topmost owner. Closing Upgrade later follows
Upgrade's existing lifecycle. Missing, hidden, inert, disabled, disconnected,
obscured, or superseded semantic targets are rejected; no stale captured node
is used when a semantic identity was supplied. A newer modal suppresses Plans
return if Plans closes underneath it; when the newer registered owner closes
first, Plans reclaims focus as the still-mounted topmost modal. Route/unmount
invalidates the pending generation.

The 390×844 panel has a 16px viewport gutter: measured bounds were x=16–374,
document scroll width was exactly 390, and the focused yearly action and its
ring remained within both panel and viewport. Desktop and nested visual checks
preserve the existing copy, prices, order, annual highlight, disabled/current
plan status, and action layout. Plans remains part of the initial `/design`
graph; there is no Plans-only lazy chunk.

### Required ownership, bundle, residual inventory, and rollback

Existing merge-required `ci.pro-visual-policy` is the sole browser owner. It
now declares ten stable identities total: the prior five plus Account pointer,
Account keyboard/narrow, Upgrade pointer, Upgrade keyboard/supersession, and
route-unmount/billing policy. The canonical result is **20/20** across Chromium
and WebKit with zero retries, skips, flakes, filters, or timeout changes. The
manifest remains **23 gates / 376 classified sources**. The existing Stripe/Pro
static command owns pricing, portal, checkout, and entitlement preservation;
the shared editor accessibility guard owns topmost focus containment.

Against CH-0015B, `/design` initial JavaScript remains 25 chunks and moves from
5,827,579 raw / 1,112,646 Brotli bytes to 5,828,568 / 1,112,834 (**+989 /
+188**). Initial CSS moves from 131,273 / 17,471 to 131,484 / 17,470
(**+211 / -1**). Cabinetry Studio remains 492,639 / 84,899 and GLTFExporter
34,525 / 8,970. Every Phase 8 budget passes.

The final required residual inventory is authoritative. The seven required
batches after Plans are: **My Designs, Guest Save, Command Palette, Floor Plan
Upload, retailer confirmation, Share Link Fallback, and public legacy
Upgrade**. Share Link Fallback and public legacy Upgrade are not P2-deferred;
older wording that placed them only in a post-candidate P2 bucket is superseded.
The separate selected-item preview transition remains P2 and is not one of
these seven required batches. No residual surface was implemented here.

Rollback is one local revert of the focused CH-0015C implementation commit,
followed by the Plans static guard, canonical Pro gate, Stripe/Pro contract,
editor accessibility guard, Phase 8, and strict build. No data, schema,
dependency, billing configuration, Stripe, entitlement, deployment, or
external-control rollback is required.

## CH-0015B Client Preview command-bar lifecycle — 2026-08-08

Status: **CH-0015B LOCALLY REMEDIATED; CH-0015 REMAINS OPEN FOR SEPARATE
SURFACES**.

This bounded record starts from exact integration source
`f8c44bcd632820754edc4f862eef24c66e433510` / tree
`ae067068656c46ac9aecb174b02a01ea21b6bdf4` on
`fix/ch-0015-client-preview-command-bar-inertness`. It owns only the one
persistent `EditorCommandBar` while Client Preview is active, its existing
visible Exit Presentation action, and the shared state boundary required to
give every preview entry path one focus contract. It does not turn the command
bar into a dialog, migrate another overlay, change public sharing, or change
Consumer/Pro authorization.

### Starting ownership and reproduced defect

`useDesignPageCoreShellBaseRegistration` owns the local raw
`clientPreview` boolean. `useEditorMode` derives effective Client Preview only
when the current capabilities also permit designer mode, so a Consumer cannot
gain preview by changing this client state. There is no direct URL or persisted
preview-state entry. The one responsive command bar remains mounted at all
widths. Manual More → Preview, the global `P`/`Shift+P` presentation shortcut,
and export capture all call the same setter. The visible Exit Presentation
button, the global shortcut, and export completion call that same setter to
exit.

Before CH-0015B, active preview left the command bar at `display:flex` and
only animated it to `opacity:0` with `pointer-events:none`. Its eight ordinary
tab stops remained focusable and accessibility-active in both engines.
Entering from Preview, More, or Save could leave focus on that connected but
invisible button. Chromium Tab could move to another hidden command action;
programmatic focus could target hidden More; and accessibility role queries
still found hidden More and Save. WebKit could instead drop focus to `body`,
while retaining the same accessibility and programmatic-focus defect. The
visible Exit Presentation action existed and was connected, enabled, visible,
and in viewport, but did not own focus. The same defect reproduced at
390×844.

The classification is **PERSISTENT_PANEL**, not modal. Retaining the mounted
root preserves its existing local menu/drawer state and opacity transition.
While effective Client Preview is active, that one root now receives native
`inert`, `aria-hidden="true"`, existing pointer suppression, and one capture
guard that rejects programmatically dispatched hidden actions. Normal editing
sets `inert=false`, `aria-hidden="false"`, restores pointer interaction, and
keeps the existing layout and styling. No per-button tab-index patch, duplicate
bar, browser branch, timer, animation-frame chain, global selector, or
`EditorDialog` is introduced.

### Entry, exit, and cancellation contract

`useClientPreviewCommandBarFocus` wraps the raw setter at the core-shell
boundary, so manual, shortcut, export, and visible Exit paths cannot diverge.
Each real entry creates a generation and records the focused command action's
semantic identity plus its connected node only as a checked fast path. Once
the inert root and visible Exit action are committed, focus moves exactly once
to the connected, visible, enabled, in-viewport `Exit Presentation` button when
command-bar focus became unavailable. A valid focus owner outside the command
bar remains the focus owner.
An inert descendant cannot retain or receive focus, and hidden More/Save are
absent from the accessibility tree.

Exit invalidates the generation and waits for the command bar's own CSS
animations to settle. It then restores the still-connected, semantically
current opener; if that opener was removed or replaced incompatibly, the
visible More action is the documented fallback. It never focuses `body`, an
inert/hidden/disabled action, a disconnected node, or the preview-only Exit
action after exit. Route, design, plan/capability, or Consumer/Pro mode changes
clear raw preview and cancel pending restoration. Unmount invalidates the
generation. A later entry always creates a new generation, so a stale entry or
restore callback cannot steal focus.

| Path | Semantic opener / entry | Active focus owner | Exit / restoration |
| --- | --- | --- | --- |
| More → Preview, pointer or keyboard | `editor-command-overflow-preview` | visible `client-preview-exit` | current Preview action; More fallback if removed |
| Global `P` / `Shift+P` while a command action owns focus | current Preview, More, Save, or other command action | visible `client-preview-exit` | same current semantic action; More fallback |
| Present & Export capture | current command action or current safe document focus | visible `client-preview-exit` when command focus becomes unavailable | current semantic opener; More fallback |
| Route/design/plan/mode change | no new opener | preview is cancelled | restoration is cancelled |
| Unmount | no new opener | no surviving preview owner | all pending entry/return work is cancelled |

The selected-item panel is a separate persistent region with its own
concealment lifecycle. Its previously inventoried P2 preview transition—where
an enabled collapse control can briefly remain focusable while hidden—remains
separate and unchanged. It does not share the command-bar root or lifecycle,
so absorbing it here would be scope drift.

### Required ownership, validation, bundle, and rollback

Existing merge-required `ci.pro-visual-policy` remains the sole canonical
owner. Its one runnable source now declares five stable identities in Chromium
and WebKit: the two existing visual-policy cases plus command-bar focus/return,
responsive scope/Consumer denial, and presentation-export parity. The
canonical result is 10/10 with zero retries, skips, annotations, filters, or
shards; the focused Client Preview subset is 6/6. The manifest remains 23
gates / 376 classified sources with unchanged inventory counts and path
hashes. Static command-bar coverage is strengthened inside the existing 78-file
design-cleanup owner.

The exact strict build passes 57/57 routes. Phase 8 moves `/design` initial
JavaScript from 25 chunks and 5,823,211 raw / 1,111,703 Brotli bytes to the
same 25 chunks and 5,827,579 / 1,112,646 (**+4,368 / +943**). Initial CSS is
byte-identical at 131,273 / 17,471. Cabinetry Studio remains one lazy
492,639 / 84,899 chunk and GLTFExporter remains 34,525 / 8,970. Every Phase 8
budget passes.

Rollback is one local revert of the focused CH-0015B implementation commit,
followed by the command-bar static guard, canonical Pro visual gate, design
cleanup, Phase 8, and strict build. No data, schema, dependency, capability,
public-share, deployment, or external-control rollback is involved.

CH-0015 remains open for the selected-item P2 hardening item and the custom
overlay lifecycles already inventoried below.

## CH-0015A cart overlay lifecycle

Status: **CH-0015A LOCALLY REMEDIATED; CH-0015 REMAINS OPEN FOR LATER
SURFACES**.

This bounded record starts from exact integration source
`00c93f510f24c6f759a6d16b839dadbe253920f8` / tree
`5ad9392dffa8cad88871e898713fcead8e5656c1` on
`fix/ch-0015-cart-overlay-accessibility`. It owns only the editor Selection
Tray (`ItemCartDrawer`) and the shared `EditorDialog` lifecycle required to
make that migration safe. It does not migrate the shopping/checkout
`CartSidebar`, its retailer-tab confirmation, or any unrelated overlay.

## Defect proof and classification

The starting Selection Tray always rendered its drawer tree and moved it to
`translate-x-full` while closed. On the initial empty-cart render, the closed
tree contained one focusable/tabbable close button; populated carts added
quantity, removal, add-all, and clear controls. The drawer had no `hidden`,
`inert`, or `aria-hidden` ancestor, retained `pointer-events: auto`, had no
dialog role/name/`aria-modal`, and appeared in the Chromium accessibility
snapshot. The test-first Chromium and WebKit cases both rejected the initial
closed state because the `Selection Tray` heading still existed. The same tree
remained after close-button and backdrop dismissal; Escape did not close it,
and opening did not move focus from the trigger. A route unmount removed the
whole editor, but there was no owned focus-restoration contract to cancel.

The surface is classification **A — modal dialog/drawer**. Its existing full
viewport backdrop prevented interaction with the editor while open, so modal
ownership is established by product behavior rather than introduced by this
change. Desktop and mobile use the same modal contract.

### Entry-focus readiness follow-up

The CH-0015A integrator gate later reached product assertions and passed 15 of
16 records. Its sole Chromium failure exposed two coupled boundaries. The
shared lifecycle treated any nonzero target rectangle as actionable and moved
focus on its first requested animation frame, even while the cart's 300 ms
entry could still place that rectangle beyond the viewport. Separately,
Tailwind 4 implements `translate-x-full` with the individual CSS `translate`
property, so polling `transform: none` did not prove that entry was settled.

The bounded follow-up replaces the cart's `@starting-style` dependency with an
explicit `mounting → entering → interactive` lifecycle. A forced layout read
commits the off-canvas mounting geometry before the entering state starts the
transition, without a timer or double animation frame. A layout effect focuses
the stable, full-viewport dialog container before the modal can paint, while
the animated panel remains inert and non-focused. The underlying editor
branches become both `inert` and `aria-hidden` at that same ownership boundary.
Close-button focus is admitted exactly once per current generation only after
no panel animation is active and the complete target rectangle is within the viewport. `transitionend`,
`transitioncancel`, viewport resize, and `ResizeObserver` delivery all
re-evaluate readiness; reduced motion reaches the same geometry gate without
waiting for an absent transition. Closing remains immediate and unmounts the
tree.

## Implemented contract

`ItemCartDrawer` now delegates its overlay to the existing `EditorDialog`.
`EditorDialog` delegates its one shared lifecycle to
`useEditorDialogLifecycle`; this is an extraction of the existing primitive's
focus behavior, not a second per-cart focus trap or a new dependency.

Closed state:

- the dialog, title, cart rows, footer actions, and close control are unmounted;
- zero hidden cart descendants remain focusable, pointer-active, or present in
  the accessibility tree;
- only one visible trigger remains, with `aria-haspopup="dialog"`,
  `aria-expanded`, and `aria-controls` bound to the dialog identity;
- closing is immediate, so no transition frame can expose a visually closed
  but actionable tree; the preserved 300 ms right-edge motion is entry-only
  and respects the primitive's reduced-motion rule.

Open state:

- the right-side drawer is `role="dialog"`, named `Selection Tray`, and
  `aria-modal="true"`;
- during `mounting` and `entering`, the stationary dialog container is the
  visible in-viewport focus owner, while every background branch is inert and
  accessibility-hidden;
- the named close button receives initial focus only in the explicit
  `interactive` state, after entry motion is settled and its full actionable
  rectangle is inside the viewport;
- Tab and Shift+Tab are contained in the topmost dialog;
- Escape, the close button, and the backdrop close the tray; Escape is consumed
  only by the topmost owner;
- normal closure resolves the current connected, rendered, enabled trigger by
  semantic ID rather than retaining a detached React node;
- a missing, disabled, hidden, inert, or replaced-without-the-same-ID opener is
  not focused;
- a current replacement with the same semantic ID is the valid return target;
- route/unmount cleanup and a later reopen invalidate stale entry/restore
  frames;
- a newer external modal suppresses Escape and return focus; an owned child
  dialog can return into its parent, while closing a parent underneath a newer
  owned dialog suppresses parent restoration and cannot steal focus;
- Clear, Remove, and decrement-to-zero move focus to the surviving close
  button before their existing mutation callbacks can unmount the focused
  footer or row control;
- the drawer is full-width within the mobile viewport and capped at 24rem on
  larger screens, with no horizontal document overflow or clipped close-button
  focus target; its established light panel, bordered header/footer, spacing,
  empty/populated content, and action ordering are retained.

There is no prompt rendered directly inside `ItemCartDrawer`. The
`CartSidebar` retailer-tab confirmation is a separate shopping surface and was
not coupled into this migration. The shared lifecycle nevertheless defines
topmost nested-dialog ownership for current `EditorDialog` consumers.

Cart rows, product IDs, line identity, quantity callbacks, removal callbacks,
add-all/clear ordering, and empty/populated rendering are unchanged. This
component contains no price, total, Shopify, affiliate, checkout URL,
eligibility, or purchase-authorization calculation; those remain owned by
`CartSidebar` and the existing commerce controllers.

## Sequencing inventory at the starting source

This is a source-level inventory for later CH-0015 batches, not a claim that
unmigrated rows satisfy the target contract. `Unmount` means closed controls
are absent; `mounted` means the surface remains in the ordinary document as a
non-modal panel. Focus cells use the order **initial / trap / Escape / backdrop
/ return / nested-owner**. “Direct node” means a captured element is restored
without current semantic re-resolution. Passive loading veils, canvas-only
visualizations, toasts, and admin content panels with no overlay interaction
are excluded.

| Owner / surface | Primitive and intent | Closed DOM / focusability | Role / name / modal | Focus and dismissal behavior | Responsive behavior | Existing coverage / later disposition |
| --- | --- | --- | --- | --- | --- | --- |
| `ItemCartDrawer` Selection Tray | `EditorDialog`; modal drawer | **After CH-0015A:** unmounted / 0 actionable | dialog / `Selection Tray` / true | interactive-state close / yes / topmost / yes / current semantic ID / topmost-safe | Mobile full-width; desktop right 24rem | Required Chromium/WebKit matrix plus static empty/populated and entry-geometry trace contract; complete for CH-0015A after focused recertification |
| `ConfirmDialog`, `CopyFallbackDialog`, `AiNotesDialog`, `PlanAnnotationDialog`, `PresentExportDialog`, `RoomRenameDialog`, `UpgradeDialog` | Shared `EditorDialog`; modal | Unmounted / 0 | dialog / caller title / true | caller target or close / yes / topmost / guarded / direct node unless ID supplied / topmost-safe after CH-0015A | Centered, viewport-capped | Static editor accessibility; focused multi-room rename/annotation; other caller scenarios remain risk-specific |
| `CatalogItemDrawer` | Custom portal drawer; modal | Unmounted / 0 | dialog / `Review exact variant` / true | close / yes / yes / pointer backdrop / current catalog semantic target / newer-modal guarded | Floating right, capped to viewport | Dedicated Chromium/WebKit drawer-focus matrix; retain until a separately scoped migration |
| `LightingSettingsDrawer` | Custom portal; modal bottom/side sheet | Unmounted / 0 | dialog / `Lighting settings` / true | close / yes / yes / yes / direct ref / not centrally stacked | Mobile bottom sheet; desktop right sheet | Focused lighting tests; no complete two-engine nested matrix recorded here |
| `CabinetryStudioDialog` | Custom lazy overlay; modal workspace | Overlay owner unmounts / 0 | dialog / `Custom Millwork Studio` / true | container / yes / yes / no explicit backdrop / direct node or Workspace trigger / replacement-dialog check | Full viewport | Cabinetry accessibility and release workflows; later primitive review must preserve lazy boundary |
| `PlanTemplateChoiceDialog` | Custom modal | Unmounted / 0 | dialog / labelled title / true | primary action / buttons only / guarded / guarded / direct node / none | Centered; stacked mobile actions | Consumer/template workflows; later semantic-opener and nested-owner review |
| `LocalBackupRecoveryDialog`, `CloudSaveConflictDialog` | Custom blocking alert dialogs | Unmounted / 0 | alertdialog / labelled / true | primary action / buttons / Escape intentionally blocked / no dismissal / direct node / none | Centered viewport-capped | Persistence contracts; later topmost and stale-opener review |
| `EditorCommandPalette` | Custom command overlay; intended modal interaction | Unmounted / 0 | dialog / `Command palette` / **missing `aria-modal`** | input autofocus / no / input/global Escape / yes / no explicit return / none | Centered, width/height capped | Command-bar static/browser checks; later CH-0015 surface |
| `CatalogCategoryTabs` category browser | Custom responsive popup/dialog | Unmounted / 0 | dialog / `Choose a product category` / no modal declaration | panel / no / yes / mobile backdrop; outside pointer desktop / direct trigger ref / none | Mobile bottom sheet; desktop anchored popup | Catalog category layout coverage; requires explicit hybrid classification later |
| `CatalogFilterDrawer` | Custom anchored non-modal filter panel | Unmounted / 0 | none / none / false | none / no / no / no / no / none | Anchored scroll panel | Catalog filter tests; retain non-modal intent or add complementary semantics later |
| `PlansDialog` | `EditorDialog`; modal | Unmounted / 0 | dialog / `Plans` / true | close / yes / topmost / yes / current Account or Upgrade semantic ID / topmost-safe | Max 420px with 16px narrow gutter and capped scroll content | Required Pro visual Chromium/WebKit 20/20 plus Stripe/Pro and editor-accessibility guards; complete for CH-0015C |
| `MyDesignsDialog` plus delete `ConfirmDialog` | `EditorDialog` parent plus shared modal child | Dialog DOM absent; lazy component retained after first ordinary dismissal / 0 actionable | parent dialog / `My Designs` / true; child dialog / delete title / true | close / yes / topmost / yes / current command or More; nested return by current design/bulk semantic ID and surviving-row/close hierarchy | Centered, viewport-capped and scrollable | Required Chromium/WebKit 16/16 plus static/persistence/routing guards; complete for CH-0015D |
| `GuestSavePromptDialog` | `EditorDialog`; modal | Unmounted / 0 | dialog / `Save and sync this design?` / true | close / yes / topmost / yes / Save→More, AI→Workspace, checkout→Workspace / generation- and scope-safe | Centered viewport-capped; actions and focus ring contained at 390×844 | Required Chromium/WebKit 16/16 plus static continuation guard; complete for CH-0015F |
| `ShareLinkFallbackDialog` nested above `PresentExportDialog` | `EditorDialog` child above mounted `EditorDialog` parent | **After CH-0015E:** child DOM absent while closed / 0 actionable | child dialog / `Share Link` / true; parent remains registered but inert/hidden while child is topmost | child close / yes / topmost / yes / current Create Share then parent close / topmost-safe and generation-scoped | Centered, viewport-capped; actions and focus ring contained at 390×844 | Existing Pro visual owner, Chromium/WebKit 26/26 total; complete for CH-0015E |
| `BetaFeedbackWidget` | Custom modal | Unmounted / 0 | dialog / `Send beta feedback` / true | textarea autofocus / no / textarea only / yes / no / none | Centered, viewport-capped | Feedback contracts; later full keyboard/return review |
| legacy `UpgradeModal` | Custom modal-looking overlay | Unmounted / 0 | none / none / none | none / no / no / no / no / none | Centered viewport-capped | Billing UI source coverage; distinct from shared `UpgradeDialog`; P2 post-candidate |
| `FloorPlanUploadPanel` import workspace | Custom full-screen modal workspace | Unmounted / 0 | dialog / source-labelled / true | dialog container / no full trap observed / yes / source-dependent / direct node / none | Full viewport workspace | Floor-plan required umbrella; later shared-lifecycle review |
| `FloorPlanImportHistory` delete confirmations | Inline `alertdialog` prompts inside an expanded non-modal panel | Unmounted with conditional prompt / 0 | alertdialog / labelled / no modal | none / no / no / n/a / in-panel / none | In-panel cards | Floor-plan tests; keep inline/non-modal or clarify intent later |
| `CartSidebar` and retailer-tab confirmation | Persistent complementary shopping panel plus custom modal-looking confirmation | Main panel mounted; confirmation unmounted | aside has no explicit complementary label; prompt none / none / none | prompt none / no / no / no / no / none | Fixed-size scroll panel and centered prompt | Commerce/checkout contracts; **separate from Selection Tray** and later CH-0015 scope |
| `CatalogPlacementConfirmPanel` | Custom non-modal placement panel | Conditional unmount / 0 | dialog / labelled / false | product-directed / no / workflow shortcuts / no backdrop / workflow-specific / none | Mobile bottom sheet; desktop floating panel | Placement workflows; explicit non-modal exception to preserve |
| `CatalogCompareTray` | Conditional non-modal compare tray | Conditional unmount / 0 | named region/group semantics, not modal | native controls / no / no / no / workflow-specific / none | Responsive tray | Compare identity/accessibility checks; not a modal candidate by default |
| `EditorCommandBar` during Client Preview | Persistent non-modal panel | **After CH-0015B:** mounted but inert / 0 effective focusable | accessibility-hidden while preview is active / false | visible Exit Presentation / no trap / `P` or Exit / n/a / current semantic opener or More fallback / generation-scoped | One responsive root; no mobile duplicate | Required Pro visual Chromium/WebKit 10/10 plus static command-bar guard; complete for CH-0015B |
| command-bar Workspace/More/Account menus | Custom non-modal menus/popovers | Conditional unmount / 0 | menu/menuitem where supplied / false | first item / roving/native / yes / outside action / trigger / newer-modal aware only in focused owners | Compact desktop/mobile chrome | Pro visual Chromium/WebKit and command-bar coverage; later unified popover review |
| editor design-controls, inspector, and selected-item panels | Persistent non-modal editor regions, not overlays | Mounted and visibly interactive | complementary/region varies / false | ordinary document order / no / n/a / n/a / n/a / n/a | Desktop sidebars and mobile bottom panels | Layout/capability/placement tests; not candidates for modal semantics without a product decision |

## Required-test ownership

No existing merge-required owner could truthfully own this focused browser
contract. `ci.critical-domain-contracts` is a Node-process umbrella and cannot
prove two browser engines; the Pro-visual and public-share Playwright gates own
different surfaces and artifact contracts. CH-0015A therefore adds one
merge-required owner, `ci.cart-overlay-accessibility`, after the static
render/commerce prerequisite.

The gate runs eight stable identities in Chromium and WebKit (16 records), with
one worker, zero retries, no filters/shards/skips/annotations, and an explicit
`tests/required` root. Keeping the runnable spec outside `tests/e2e` prevents
advisory Full E2E and release Gate A3 from rediscovering and double-counting it;
the Full E2E configuration is unchanged. Required-test truthfulness now accepts
only a gate-declared safe repository test root and has positive and negative
fixture coverage for that contract. The manifest advances from 22 to 23 gates
while retaining 376 classified inventory sources; the three new focused
sources are owned explicitly by this gate.

## Validation, bundle, and rollback

The final branch record includes the focused 16-record matrix, cart static
render and focus-before-mutation contract, commerce/state and checkout
contracts, the existing editor accessibility owner, required truthfulness and
direct manifest check, all
requested local required gates, Phase 8, strict build, and focused visual
inspection. Full E2E is deliberately excluded. Exact command results are
recorded in the current `HANDOFF.md` entry.

Against the direct parent record, the `/design` initial bundle moves from 26 to
25 JavaScript files and remains one CSS file. JavaScript moves from 5,818,702
raw / 1,110,339 Brotli bytes to 5,823,211 raw / 1,111,703 Brotli bytes
(+4,509 / +1,364). CSS moves from 131,225 raw / 17,450 Brotli bytes to 131,273
raw / 17,471 Brotli bytes (+48 / +21). Relative to the pre-CH-0015A integration
baseline, the total delta is +7,740 raw / +2,276 Brotli JavaScript bytes and
+481 raw / +150 Brotli CSS bytes. The cabinetry
lazy chunk remains 492,639 raw / 84,899 Brotli bytes and the GLTF exporter
remains 34,525 raw / 8,970 Brotli bytes. No cart-only lazy chunk exists before
or after. Every Phase 8 budget remains green.

Rollback is one local revert of the focused CH-0015A implementation commit,
followed by the cart static check, exact Chromium/WebKit gate, commerce/state
checks, editor accessibility check, Phase 8, and strict build. No data,
dependency, schema, catalog, price, checkout, deployment, or external-control
rollback is involved.

CH-0015 remains open after this batch because the inventory above still
contains major custom overlays without the shared lifecycle. The next batch
must choose one bounded surface, preserve any explicit non-modal contract, and
repeat test-first characterization rather than applying modal semantics in
bulk.

The authoritative required residual sequence after CH-0015F is Command
Palette, Floor Plan Upload, and retailer confirmation. Public legacy Upgrade
and the selected-item preview transition are separate P2
post-candidate items.
