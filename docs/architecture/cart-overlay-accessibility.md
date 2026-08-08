# CH-0015 accessibility lifecycle and overlay inventory

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
| `PlansDialog` | Custom modal-looking overlay | Unmounted / 0 | **none / none / none** | none / no / no / yes / no / none | Fixed 420px inline width | Billing/UI source tests only; later CH-0015 migration without pricing changes |
| `MyDesignsDialog` plus delete `ConfirmDialog` | Custom modal-looking parent plus shared modal child | Unmounted / 0 | parent none; child dialog / child title / child true | parent none; child shared lifecycle / parent no Escape / parent backdrop / parent no return / child can supersede | Centered, max 80vh | Persistence/design tests; parent migration and nested focus ownership remain |
| `GuestSavePromptDialog`, `ShareLinkFallbackDialog` | Custom modal-looking overlays | Unmounted / 0 | none / none / none | none / no / no / no / no / none | Centered viewport-capped | Auth/share behavior tests; later CH-0015 surfaces |
| `BetaFeedbackWidget` | Custom modal | Unmounted / 0 | dialog / `Send beta feedback` / true | textarea autofocus / no / textarea only / yes / no / none | Centered, viewport-capped | Feedback contracts; later full keyboard/return review |
| legacy `UpgradeModal` | Custom modal-looking overlay | Unmounted / 0 | none / none / none | none / no / no / no / no / none | Centered viewport-capped | Billing UI source coverage; distinct from shared `UpgradeDialog` and remains later scope |
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
