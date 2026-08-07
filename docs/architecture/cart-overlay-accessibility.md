# CH-0015A cart overlay lifecycle and overlay inventory

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
- the named close button receives initial focus on the next animation frame;
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
| `ItemCartDrawer` Selection Tray | `EditorDialog`; modal drawer | **After CH-0015A:** unmounted / 0 actionable | dialog / `Selection Tray` / true | close / yes / topmost / yes / current semantic ID / topmost-safe | Mobile full-width; desktop right 24rem | Required 16/16 Chromium/WebKit plus static empty/populated contract; complete for CH-0015A |
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

The `/design` initial bundle moves from 25 to 26 JavaScript files and remains
one CSS file. JavaScript moves from 5,815,471 raw / 1,109,427 Brotli bytes to
5,818,702 raw / 1,110,339 Brotli bytes (+3,231 / +912). CSS moves from 130,792
raw / 17,321 Brotli bytes to 131,225 raw / 17,450 Brotli bytes (+433 / +129).
The cabinetry
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
